/*
 * Converts an active contract pilot to direct hire while preserving the same named-pilot identity and package continuity.
 */

import type { CommandResult, ConvertNamedPilotToDirectHireCommand } from "./types.js";
import { addUtcMonths, createPrefixedId } from "./utils.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import { loadNamedPilotRoster } from "../staffing/named-pilot-roster.js";
import { estimateDirectHireSalary } from "../staffing/pilot-employment-pricing.js";
import { staffingPriceMultiplierForDifficulty } from "../../domain/save-runtime/difficulty-profile.js";
import type { DifficultyProfile } from "../../domain/save-runtime/types.js";
import { parseStaffingOfferVisibility } from "../../domain/staffing/offer-visibility.js";
import type { EmploymentModel, PilotCertificationCode, PilotVisibleProfile } from "../../domain/staffing/types.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";

interface ConvertNamedPilotToDirectHireDependencies {
  saveDatabase: SqliteFileDatabase;
}

interface StaffingPackageRow extends Record<string, unknown> {
  staffingPackageId: string;
  sourceOfferId: string | null;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  fixedCostAmount: number;
  variableCostRate: number | null;
  endsAtUtc: string | null;
  recurringObligationId: string | null;
}

interface StaffingOfferRow extends Record<string, unknown> {
  staffingOfferId: string;
  offerWindowId: string;
  employmentModel: EmploymentModel;
  fixedCostAmount: number;
  explanationMetadataJson: string | null;
}

function buildFailureResult(
  command: ConvertNamedPilotToDirectHireCommand,
  message: string,
): CommandResult {
  return {
    success: false,
    commandId: command.commandId,
    changedAggregateIds: [],
    validationMessages: [message],
    hardBlockers: [message],
    warnings: [],
    emittedEventIds: [],
    emittedLedgerEntryIds: [],
  };
}

function parseCandidateProfileId(explanationMetadataJson: string | null | undefined): string | undefined {
  if (!explanationMetadataJson) {
    return undefined;
  }

  try {
    const explanationMetadata = JSON.parse(explanationMetadataJson) as Record<string, unknown>;
    return parseStaffingOfferVisibility(explanationMetadata).candidateProfileId;
  } catch {
    return undefined;
  }
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function describeConversionBlock(displayName: string, availabilityState: string): string {
  switch (availabilityState) {
    case "reserved":
      return `${displayName} is already reserved for committed contract work and cannot convert to direct hire until that assignment resolves.`;
    case "flying":
      return `${displayName} is currently flying committed contract work and cannot convert to direct hire until that assignment resolves.`;
    default:
      return `${displayName} cannot convert to direct hire while currently ${availabilityState}.`;
  }
}

function resolveDirectSalaryAmount(
  saveDatabase: SqliteFileDatabase,
  companyId: string,
  difficultyProfile: DifficultyProfile,
  sourceOfferId: string | null,
  sourceCandidateProfileId: string | undefined,
  qualificationGroup: string,
  certifications: readonly PilotCertificationCode[],
  candidateProfile: PilotVisibleProfile | undefined,
): number | null {
  if (sourceOfferId && sourceCandidateProfileId) {
    const sourceOfferRow = saveDatabase.getOne<Pick<StaffingOfferRow, "offerWindowId">>(
      `SELECT offer_window_id AS offerWindowId
      FROM staffing_offer
      WHERE staffing_offer_id = $staffing_offer_id
      LIMIT 1`,
      { $staffing_offer_id: sourceOfferId },
    );

    const siblingDirectOffers = sourceOfferRow
      ? saveDatabase.all<StaffingOfferRow>(
          `SELECT
            staffing_offer_id AS staffingOfferId,
            offer_window_id AS offerWindowId,
            employment_model AS employmentModel,
            fixed_cost_amount AS fixedCostAmount,
            explanation_metadata_json AS explanationMetadataJson
          FROM staffing_offer
          WHERE company_id = $company_id
            AND offer_window_id = $offer_window_id
            AND employment_model = 'direct_hire'`,
          {
            $company_id: companyId,
            $offer_window_id: sourceOfferRow.offerWindowId,
          },
        )
      : [];
    const pairedDirectOffer = siblingDirectOffers.find((offer) =>
      parseCandidateProfileId(offer.explanationMetadataJson) === sourceCandidateProfileId
    );

    if (pairedDirectOffer) {
      return pairedDirectOffer.fixedCostAmount;
    }
  }

  if (!candidateProfile) {
    return null;
  }

  return estimateDirectHireSalary({
    qualificationGroup,
    certifications: [...certifications],
    totalCareerHours: candidateProfile.totalCareerHours,
    primaryQualificationFamilyHours: candidateProfile.primaryQualificationFamilyHours,
    certificationHours: candidateProfile.certificationHours,
    statProfile: candidateProfile.statProfile,
    priceMultiplier: staffingPriceMultiplierForDifficulty(difficultyProfile),
  });
}

export async function handleConvertNamedPilotToDirectHire(
  command: ConvertNamedPilotToDirectHireCommand,
  dependencies: ConvertNamedPilotToDirectHireDependencies,
): Promise<CommandResult> {
  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);

  if (!companyContext) {
    return buildFailureResult(command, `Save ${command.saveId} does not have an active company.`);
  }

  const roster = loadNamedPilotRoster(
    dependencies.saveDatabase,
    companyContext.companyId,
    companyContext.currentTimeUtc,
  );
  const namedPilot = roster.find((pilot) => pilot.namedPilotId === command.payload.namedPilotId);

  if (!namedPilot) {
    return buildFailureResult(command, `Pilot ${command.payload.namedPilotId} was not found.`);
  }

  if (namedPilot.packageStatus !== "active") {
    return buildFailureResult(command, `${namedPilot.displayName} is not part of active pilot coverage.`);
  }

  if (namedPilot.employmentModel !== "contract_hire") {
    return buildFailureResult(command, `${namedPilot.displayName} is already a direct hire.`);
  }

  if (namedPilot.availabilityState === "reserved" || namedPilot.availabilityState === "flying") {
    return buildFailureResult(
      command,
      describeConversionBlock(namedPilot.displayName, namedPilot.availabilityState),
    );
  }

  const staffingPackage = dependencies.saveDatabase.getOne<StaffingPackageRow>(
    `SELECT
      sp.staffing_package_id AS staffingPackageId,
      sp.source_offer_id AS sourceOfferId,
      sp.employment_model AS employmentModel,
      sp.qualification_group AS qualificationGroup,
      sp.fixed_cost_amount AS fixedCostAmount,
      sp.variable_cost_rate AS variableCostRate,
      sp.ends_at_utc AS endsAtUtc,
      ro.recurring_obligation_id AS recurringObligationId
    FROM staffing_package AS sp
    LEFT JOIN recurring_obligation AS ro
      ON ro.source_object_type = 'staffing_package'
     AND ro.source_object_id = sp.staffing_package_id
     AND ro.status = 'active'
    WHERE sp.staffing_package_id = $staffing_package_id
    LIMIT 1`,
    { $staffing_package_id: namedPilot.staffingPackageId },
  );

  if (!staffingPackage) {
    return buildFailureResult(command, `Staffing package ${namedPilot.staffingPackageId} was not found.`);
  }

  if (staffingPackage.recurringObligationId) {
    return buildFailureResult(
      command,
      `${namedPilot.displayName} already has an active recurring salary obligation.`,
    );
  }

  const directSalaryAmount = resolveDirectSalaryAmount(
    dependencies.saveDatabase,
    companyContext.companyId,
    companyContext.difficultyProfile,
    staffingPackage.sourceOfferId,
    namedPilot.sourceCandidateProfileId,
    namedPilot.qualificationGroup,
    namedPilot.certifications,
    namedPilot.candidateProfile,
  );

  if (directSalaryAmount === null) {
    return buildFailureResult(
      command,
      `${namedPilot.displayName} does not have enough visible profile data to price a direct-hire conversion truthfully.`,
    );
  }

  const recurringObligationId = createPrefixedId("obligation");
  const eventLogEntryId = createPrefixedId("event");

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `UPDATE staffing_package
      SET employment_model = 'direct_hire',
          fixed_cost_amount = $fixed_cost_amount,
          variable_cost_rate = NULL,
          ends_at_utc = NULL
      WHERE staffing_package_id = $staffing_package_id`,
      {
        $staffing_package_id: staffingPackage.staffingPackageId,
        $fixed_cost_amount: directSalaryAmount,
      },
    );

    dependencies.saveDatabase.run(
      `INSERT INTO recurring_obligation (
        recurring_obligation_id,
        company_id,
        obligation_type,
        source_object_type,
        source_object_id,
        amount,
        cadence,
        next_due_at_utc,
        end_at_utc,
        status
      ) VALUES (
        $recurring_obligation_id,
        $company_id,
        'staffing',
        'staffing_package',
        $source_object_id,
        $amount,
        'monthly',
        $next_due_at_utc,
        NULL,
        'active'
      )`,
      {
        $recurring_obligation_id: recurringObligationId,
        $company_id: companyContext.companyId,
        $source_object_id: staffingPackage.staffingPackageId,
        $amount: directSalaryAmount,
        $next_due_at_utc: addUtcMonths(companyContext.currentTimeUtc, 1),
      },
    );

    dependencies.saveDatabase.run(
      `UPDATE named_pilot
      SET updated_at_utc = $updated_at_utc
      WHERE named_pilot_id = $named_pilot_id`,
      {
        $named_pilot_id: namedPilot.namedPilotId,
        $updated_at_utc: companyContext.currentTimeUtc,
      },
    );

    dependencies.saveDatabase.run(
      `INSERT INTO event_log_entry (
        event_log_entry_id,
        save_id,
        company_id,
        event_time_utc,
        event_type,
        source_object_type,
        source_object_id,
        severity,
        message,
        metadata_json
      ) VALUES (
        $event_log_entry_id,
        $save_id,
        $company_id,
        $event_time_utc,
        'named_pilot_converted_to_direct_hire',
        'named_pilot',
        $source_object_id,
        'info',
        $message,
        $metadata_json
      )`,
      {
        $event_log_entry_id: eventLogEntryId,
        $save_id: command.saveId,
        $company_id: companyContext.companyId,
        $event_time_utc: companyContext.currentTimeUtc,
        $source_object_id: namedPilot.namedPilotId,
        $message: `${namedPilot.displayName} converted to direct hire at ${formatMoney(directSalaryAmount)}/mo.`,
        $metadata_json: JSON.stringify({
          namedPilotId: namedPilot.namedPilotId,
          staffingPackageId: staffingPackage.staffingPackageId,
          previousEmploymentModel: staffingPackage.employmentModel,
          convertedEmploymentModel: "direct_hire",
          previousFixedCostAmount: staffingPackage.fixedCostAmount,
          previousVariableCostRate: staffingPackage.variableCostRate ?? undefined,
          previousEndsAtUtc: staffingPackage.endsAtUtc ?? undefined,
          directSalaryAmount,
          recurringObligationId,
        }),
      },
    );

    dependencies.saveDatabase.run(
      `INSERT INTO command_log (
        command_id,
        save_id,
        command_name,
        actor_type,
        issued_at_utc,
        completed_at_utc,
        status,
        payload_json
      ) VALUES (
        $command_id,
        $save_id,
        $command_name,
        $actor_type,
        $issued_at_utc,
        $completed_at_utc,
        'completed',
        $payload_json
      )`,
      {
        $command_id: command.commandId,
        $save_id: command.saveId,
        $command_name: command.commandName,
        $actor_type: command.actorType,
        $issued_at_utc: command.issuedAtUtc,
        $completed_at_utc: companyContext.currentTimeUtc,
        $payload_json: JSON.stringify({
          namedPilotId: namedPilot.namedPilotId,
          staffingPackageId: staffingPackage.staffingPackageId,
          directSalaryAmount,
          recurringObligationId,
          convertedAtUtc: companyContext.currentTimeUtc,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [namedPilot.namedPilotId, staffingPackage.staffingPackageId, recurringObligationId],
    validationMessages: [`Converted ${namedPilot.displayName} to direct hire at ${formatMoney(directSalaryAmount)}/mo.`],
    hardBlockers: [],
    warnings: [],
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [],
    metadata: {
      namedPilotId: namedPilot.namedPilotId,
      staffingPackageId: staffingPackage.staffingPackageId,
      directSalaryAmount,
      recurringObligationId,
    },
  };
}
