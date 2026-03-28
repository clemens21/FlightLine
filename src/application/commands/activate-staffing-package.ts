/*
 * Implements the activate staffing package command handler for the backend command pipeline.
 * Files in this layer validate a request, mutate save-state tables inside a transaction, and return structured results for callers.
 */

import type { CommandResult, ActivateStaffingPackageCommand } from "./types.js";
import { addUtcMonths, createPrefixedId, deriveFinancialPressureBand } from "./utils.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import { reconcileNamedPilots } from "../staffing/named-pilot-roster.js";
import { normalizeOptionalUtcTimestamp } from "../../domain/common/utc.js";
import { parseStaffingOfferVisibility } from "../../domain/staffing/offer-visibility.js";
import { parsePilotCertificationsJson, pilotCertificationsToJson } from "../../domain/staffing/pilot-certifications.js";
import type { EmploymentModel, LaborCategory } from "../../domain/staffing/types.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";
import type { AirportReferenceRepository } from "../../infrastructure/reference/airport-reference.js";

interface ActivateStaffingPackageDependencies {
  saveDatabase: SqliteFileDatabase;
  aircraftReference: AircraftReferenceRepository;
  airportReference: AirportReferenceRepository;
}

interface StaffingMarketOfferRow extends Record<string, unknown> {
  staffingOfferId: string;
  offerWindowId: string;
  companyId: string;
  laborCategory: LaborCategory;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  coverageUnits: number;
  fixedCostAmount: number;
  variableCostRate: number | null;
  startsAtUtc: string | null;
  endsAtUtc: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  certificationsJson: string | null;
  homeCity: string | null;
  homeRegionCode: string | null;
  homeCountryCode: string | null;
  currentAirportId: string | null;
  explanationMetadataJson: string | null;
  offerStatus: string;
}

interface ExistingCandidatePackageRow extends Record<string, unknown> {
  staffingPackageId: string;
  sourceOfferId: string | null;
  status: "pending" | "active" | "expired" | "cancelled";
  explanationMetadataJson: string | null;
}

const recommendedCabinQualificationGroups = new Set([
  "cabin_general",
  "cabin_regional",
  "cabin_narrowbody",
  "cabin_widebody",
  "cabin_premium",
]);

const recommendedOpsQualificationGroups = new Set([
  "ops_support_general",
  "ops_dispatch",
  "ops_station",
  "ops_maintenance_control",
]);

function usesRecurringStaffingCost(employmentModel: EmploymentModel): boolean {
  return employmentModel === "direct_hire"
    || employmentModel === "contract_pool"
    || employmentModel === "service_agreement";
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

export async function handleActivateStaffingPackage(
  command: ActivateStaffingPackageCommand,
  dependencies: ActivateStaffingPackageDependencies,
): Promise<CommandResult> {
  const hardBlockers: string[] = [];
  const warnings: string[] = [];
  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);

  if (!companyContext) {
    hardBlockers.push(`Save ${command.saveId} does not have an active company.`);
  }

  const marketOffer = command.payload.sourceOfferId
    ? dependencies.saveDatabase.getOne<StaffingMarketOfferRow>(
        `SELECT
          staffing_offer_id AS staffingOfferId,
          offer_window_id AS offerWindowId,
          company_id AS companyId,
          labor_category AS laborCategory,
          employment_model AS employmentModel,
          qualification_group AS qualificationGroup,
          coverage_units AS coverageUnits,
          fixed_cost_amount AS fixedCostAmount,
          variable_cost_rate AS variableCostRate,
          starts_at_utc AS startsAtUtc,
          ends_at_utc AS endsAtUtc,
          first_name AS firstName,
          last_name AS lastName,
          display_name AS displayName,
          certifications_json AS certificationsJson,
          home_city AS homeCity,
          home_region_code AS homeRegionCode,
          home_country_code AS homeCountryCode,
          current_airport_id AS currentAirportId,
          explanation_metadata_json AS explanationMetadataJson,
          offer_status AS offerStatus
        FROM staffing_offer
        WHERE staffing_offer_id = $staffing_offer_id
        LIMIT 1`,
        { $staffing_offer_id: command.payload.sourceOfferId },
      )
    : null;

  if (command.payload.sourceOfferId && !marketOffer) {
    hardBlockers.push(`Staffing offer ${command.payload.sourceOfferId} was not found.`);
  }

  const effectiveLaborCategory = marketOffer?.laborCategory ?? command.payload.laborCategory;
  const effectiveEmploymentModel = marketOffer?.employmentModel ?? command.payload.employmentModel;
  const qualificationGroup = (marketOffer?.qualificationGroup ?? command.payload.qualificationGroup).trim();
  const effectiveCoverageUnits = marketOffer?.coverageUnits ?? command.payload.coverageUnits;
  const effectiveFixedCostAmount = marketOffer?.fixedCostAmount ?? command.payload.fixedCostAmount;
  const effectiveVariableCostRate = marketOffer?.variableCostRate ?? command.payload.variableCostRate ?? null;
  const requestedBaseAirportId = command.payload.baseAirportId?.trim().toUpperCase() || "";
  const effectiveBaseAirportId = requestedBaseAirportId || companyContext?.homeBaseAirportId || "";
  const effectiveServiceRegionCode = command.payload.serviceRegionCode?.trim() || null;

  if (!qualificationGroup) {
    hardBlockers.push("Staffing qualification group is required.");
  }

  if (!Number.isInteger(effectiveCoverageUnits) || effectiveCoverageUnits <= 0) {
    hardBlockers.push("Staffing coverage units must be a positive whole number.");
  }

  if (!Number.isFinite(effectiveFixedCostAmount)) {
    hardBlockers.push("Staffing fixed cost amount must be a finite number.");
  } else if (effectiveFixedCostAmount < 0) {
    hardBlockers.push("Staffing fixed cost amount cannot be negative.");
  }

  if (!effectiveBaseAirportId) {
    hardBlockers.push("Base airport is required for staffing activation.");
  } else if (!dependencies.airportReference.findAirport(effectiveBaseAirportId)) {
    hardBlockers.push(`Base airport ${effectiveBaseAirportId} was not found.`);
  }

  if (effectiveVariableCostRate !== null && !Number.isFinite(effectiveVariableCostRate)) {
    hardBlockers.push("Staffing variable cost rate must be a finite number when provided.");
  } else if ((effectiveVariableCostRate ?? 0) < 0) {
    hardBlockers.push("Staffing variable cost rate cannot be negative.");
  }

  if (marketOffer) {
    if (companyContext && marketOffer.companyId !== companyContext.companyId) {
      hardBlockers.push(`Staffing offer ${marketOffer.staffingOfferId} does not belong to this company market.`);
    }

    if (marketOffer.offerStatus !== "available") {
      hardBlockers.push(`Staffing offer ${marketOffer.staffingOfferId} is no longer available.`);
    }
  }

  const sourceCandidateProfileId = parseCandidateProfileId(marketOffer?.explanationMetadataJson);
  const pairedOfferIds = marketOffer && sourceCandidateProfileId
    ? dependencies.saveDatabase
        .all<{ staffingOfferId: string; explanationMetadataJson: string | null }>(
          `SELECT
            staffing_offer_id AS staffingOfferId,
            explanation_metadata_json AS explanationMetadataJson
          FROM staffing_offer
          WHERE offer_window_id = $offer_window_id
            AND offer_status = 'available'`,
          { $offer_window_id: marketOffer.offerWindowId },
        )
        .filter((offer) => parseCandidateProfileId(offer.explanationMetadataJson) === sourceCandidateProfileId)
        .map((offer) => offer.staffingOfferId)
    : marketOffer
      ? [marketOffer.staffingOfferId]
      : [];

  if (companyContext && sourceCandidateProfileId) {
    const existingCandidatePackages = dependencies.saveDatabase.all<ExistingCandidatePackageRow>(
      `SELECT
        sp.staffing_package_id AS staffingPackageId,
        sp.source_offer_id AS sourceOfferId,
        sp.status AS status,
        so.explanation_metadata_json AS explanationMetadataJson
      FROM staffing_package AS sp
      JOIN staffing_offer AS so ON so.staffing_offer_id = sp.source_offer_id
      WHERE sp.company_id = $company_id
        AND sp.labor_category = 'pilot'
        AND sp.status IN ('pending', 'active')
        AND sp.source_offer_id IS NOT NULL`,
      { $company_id: companyContext.companyId },
    );

    const duplicateCandidatePackage = existingCandidatePackages.find((pkg) =>
      parseCandidateProfileId(pkg.explanationMetadataJson) === sourceCandidateProfileId
    );

    if (duplicateCandidatePackage) {
      hardBlockers.push(
        `${marketOffer?.displayName ?? "That pilot candidate"} is no longer available because this candidate identity is already on the roster.`,
      );
    }
  }

  switch (effectiveLaborCategory) {
    case "pilot": {
      if (qualificationGroup && !dependencies.aircraftReference.pilotQualificationGroupExists(qualificationGroup)) {
        hardBlockers.push(`Pilot qualification group ${qualificationGroup} is not supported by the aircraft reference catalog.`);
      }
      break;
    }

    case "mechanic": {
      if (qualificationGroup && !dependencies.aircraftReference.mechanicSkillGroupExists(qualificationGroup)) {
        hardBlockers.push(`Mechanic qualification group ${qualificationGroup} is not supported by the aircraft reference catalog.`);
      }
      break;
    }

    case "flight_attendant": {
      if (qualificationGroup && !recommendedCabinQualificationGroups.has(qualificationGroup)) {
        warnings.push(`Flight-attendant qualification group ${qualificationGroup} is not in the current recommended cabin set.`);
      }
      break;
    }

    case "ops_support": {
      if (qualificationGroup && !recommendedOpsQualificationGroups.has(qualificationGroup)) {
        warnings.push(`Ops-support qualification group ${qualificationGroup} is not in the current recommended operations set.`);
      }
      break;
    }
  }

  const rawStartsAtUtc = marketOffer?.startsAtUtc ?? command.payload.startsAtUtc ?? companyContext?.currentTimeUtc ?? command.issuedAtUtc;
  const rawEndsAtUtc = marketOffer?.endsAtUtc ?? command.payload.endsAtUtc ?? null;
  const normalizedStartsAtUtc = normalizeOptionalUtcTimestamp(rawStartsAtUtc);
  const endsAtUtc = normalizeOptionalUtcTimestamp(rawEndsAtUtc);
  const hiredAtUtc = companyContext?.currentTimeUtc ?? command.issuedAtUtc;
  const startsAtUtc = marketOffer
    && companyContext
    && normalizedStartsAtUtc
    && Date.parse(normalizedStartsAtUtc) < Date.parse(companyContext.currentTimeUtc)
      ? companyContext.currentTimeUtc
      : normalizedStartsAtUtc;

  if (!startsAtUtc) {
    hardBlockers.push(`Staffing package start time ${rawStartsAtUtc} is not a valid UTC timestamp.`);
  }

  if (rawEndsAtUtc && !endsAtUtc) {
    hardBlockers.push(`Staffing package end time ${rawEndsAtUtc} is not a valid UTC timestamp.`);
  }

  if (companyContext && startsAtUtc && Date.parse(startsAtUtc) < Date.parse(companyContext.currentTimeUtc)) {
    hardBlockers.push("Staffing package start time cannot be earlier than the current game time.");
  }

  if (startsAtUtc && endsAtUtc && Date.parse(startsAtUtc) >= Date.parse(endsAtUtc)) {
    hardBlockers.push("Staffing package end time must be later than the start time.");
  }

  if (effectiveEmploymentModel === "service_agreement" && !effectiveServiceRegionCode) {
    warnings.push("Service-agreement staffing was activated without a service region code.");
  }

  const initialStatus = companyContext && startsAtUtc && Date.parse(startsAtUtc) > Date.parse(companyContext.currentTimeUtc) ? "pending" : "active";
  const recurringCostModel = usesRecurringStaffingCost(effectiveEmploymentModel);
  const upfrontChargeAmount = effectiveEmploymentModel === "direct_hire"
    ? 0
    : effectiveEmploymentModel === "contract_hire"
      ? effectiveFixedCostAmount
      : initialStatus === "active"
        ? effectiveFixedCostAmount
        : 0;
  const staffingEventType = initialStatus === "pending" ? "staffing_package_scheduled" : "staffing_package_activated";
  const staffingEventTimeUtc = initialStatus === "pending" ? hiredAtUtc : startsAtUtc;
  const staffingEventMessage = initialStatus === "pending"
    ? marketOffer?.displayName
      ? `Scheduled ${marketOffer.displayName} to start ${qualificationGroup} coverage on ${startsAtUtc}.`
      : `Scheduled ${effectiveLaborCategory} staffing package ${qualificationGroup} to start on ${startsAtUtc}.`
    : marketOffer?.displayName
      ? `Hired ${marketOffer.displayName} for ${qualificationGroup}.`
      : `Activated ${effectiveLaborCategory} staffing package ${qualificationGroup}.`;

  if (companyContext && upfrontChargeAmount > companyContext.currentCashAmount) {
    hardBlockers.push(`Company does not have enough cash to activate this staffing package for ${upfrontChargeAmount}.`);
  }

  if (hardBlockers.length > 0) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [...hardBlockers, ...warnings],
      hardBlockers,
      warnings,
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const effectiveStartsAtUtc = startsAtUtc!;
  const effectiveEndsAtUtc = endsAtUtc ?? null;

  const staffingPackageId = createPrefixedId("staff");
  const recurringObligationId = recurringCostModel && effectiveFixedCostAmount > 0 ? createPrefixedId("obligation") : null;
  const ledgerEntryId = upfrontChargeAmount > 0 ? createPrefixedId("ledger") : null;
  const eventLogEntryId = createPrefixedId("event");
  const updatedCashAmount = companyContext!.currentCashAmount - upfrontChargeAmount;
  const financialPressureBand = deriveFinancialPressureBand(updatedCashAmount);

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `INSERT INTO staffing_package (
        staffing_package_id,
        company_id,
        source_offer_id,
        labor_category,
        employment_model,
        qualification_group,
        coverage_units,
        fixed_cost_amount,
        variable_cost_rate,
        service_region_code,
        starts_at_utc,
        ends_at_utc,
        status
      ) VALUES (
        $staffing_package_id,
        $company_id,
        $source_offer_id,
        $labor_category,
        $employment_model,
        $qualification_group,
        $coverage_units,
        $fixed_cost_amount,
        $variable_cost_rate,
        $service_region_code,
        $starts_at_utc,
        $ends_at_utc,
        $status
      )`,
      {
        $staffing_package_id: staffingPackageId,
        $company_id: companyContext!.companyId,
        $source_offer_id: command.payload.sourceOfferId ?? null,
        $labor_category: effectiveLaborCategory,
        $employment_model: effectiveEmploymentModel,
        $qualification_group: qualificationGroup,
        $coverage_units: effectiveCoverageUnits,
        $fixed_cost_amount: effectiveFixedCostAmount,
        $variable_cost_rate: effectiveVariableCostRate,
        $service_region_code: effectiveServiceRegionCode,
        $starts_at_utc: effectiveStartsAtUtc,
        $ends_at_utc: effectiveEndsAtUtc,
        $status: initialStatus,
      },
    );

    dependencies.saveDatabase.run(
      `UPDATE company_financial_state
      SET current_cash_amount = $current_cash_amount,
          financial_pressure_band = $financial_pressure_band,
          updated_at_utc = $updated_at_utc
      WHERE company_id = $company_id`,
      {
        $current_cash_amount: updatedCashAmount,
        $financial_pressure_band: financialPressureBand,
        $updated_at_utc: hiredAtUtc,
        $company_id: companyContext!.companyId,
      },
    );

    if (effectiveLaborCategory === "pilot") {
      reconcileNamedPilots(
        dependencies.saveDatabase,
        companyContext!.companyId,
        companyContext!.homeBaseAirportId,
        companyContext!.currentTimeUtc,
        dependencies.airportReference,
      );

      dependencies.saveDatabase.run(
        `UPDATE named_pilot
        SET home_airport_id = $home_airport_id,
            current_airport_id = $current_airport_id,
            updated_at_utc = $updated_at_utc
        WHERE staffing_package_id = $staffing_package_id`,
        {
          $home_airport_id: effectiveBaseAirportId,
          $current_airport_id: effectiveBaseAirportId,
          $updated_at_utc: hiredAtUtc,
          $staffing_package_id: staffingPackageId,
        },
      );

      if (marketOffer && marketOffer.displayName) {
        dependencies.saveDatabase.run(
          `UPDATE named_pilot
          SET first_name = $first_name,
              last_name = $last_name,
              display_name = $display_name,
              certifications_json = $certifications_json,
              home_airport_id = $home_airport_id,
              home_city = $home_city,
              home_region_code = $home_region_code,
              home_country_code = $home_country_code,
              current_airport_id = $current_airport_id,
              updated_at_utc = $updated_at_utc
          WHERE staffing_package_id = $staffing_package_id
            AND roster_slot_number = 1`,
          {
            $first_name: marketOffer.firstName ?? marketOffer.displayName,
            $last_name: marketOffer.lastName ?? marketOffer.displayName,
            $display_name: marketOffer.displayName,
            $certifications_json: pilotCertificationsToJson(
              parsePilotCertificationsJson(marketOffer.certificationsJson, qualificationGroup),
            ),
            $home_airport_id: effectiveBaseAirportId,
            $home_city: marketOffer.homeCity ?? null,
            $home_region_code: marketOffer.homeRegionCode ?? null,
            $home_country_code: marketOffer.homeCountryCode ?? null,
            $current_airport_id: effectiveBaseAirportId,
            $updated_at_utc: hiredAtUtc,
            $staffing_package_id: staffingPackageId,
          },
        );
      }
    }

    if (recurringObligationId) {
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
          $obligation_type,
          'staffing_package',
          $source_object_id,
          $amount,
          'monthly',
          $next_due_at_utc,
          $end_at_utc,
          'active'
        )`,
        {
          $recurring_obligation_id: recurringObligationId,
          $company_id: companyContext!.companyId,
          $obligation_type: effectiveEmploymentModel === "service_agreement" ? "service_agreement" : "staffing",
          $source_object_id: staffingPackageId,
          $amount: effectiveFixedCostAmount,
          $next_due_at_utc: addUtcMonths(effectiveStartsAtUtc, 1),
          $end_at_utc: effectiveEndsAtUtc,
        },
      );
    }

    if (ledgerEntryId) {
      dependencies.saveDatabase.run(
        `INSERT INTO ledger_entry (
          ledger_entry_id,
          company_id,
          entry_time_utc,
          entry_type,
          amount,
          currency_code,
          source_object_type,
          source_object_id,
          description,
          metadata_json
        ) VALUES (
          $ledger_entry_id,
          $company_id,
          $entry_time_utc,
          'staffing_activation',
          $amount,
          'USD',
          'staffing_package',
          $source_object_id,
          $description,
          $metadata_json
        )`,
        {
          $ledger_entry_id: ledgerEntryId,
          $company_id: companyContext!.companyId,
          $entry_time_utc: effectiveEmploymentModel === "contract_hire" ? hiredAtUtc : effectiveStartsAtUtc,
          $amount: upfrontChargeAmount * -1,
          $source_object_id: staffingPackageId,
          $description: effectiveEmploymentModel === "contract_hire"
            ? `Engaged contract ${effectiveLaborCategory} staffing for ${qualificationGroup}.`
            : `Activated ${effectiveLaborCategory} staffing package ${qualificationGroup}.`,
          $metadata_json: JSON.stringify({
            employmentModel: effectiveEmploymentModel,
            coverageUnits: effectiveCoverageUnits,
            fixedCostAmount: effectiveFixedCostAmount,
            variableCostRate: effectiveVariableCostRate ?? undefined,
            chargeShape: effectiveEmploymentModel === "contract_hire"
              ? "engagement_fee"
              : recurringCostModel
                ? "recurring_salary"
                : "activation_charge",
          }),
        },
      );
    }

    if (marketOffer) {
      const offerIdsToRetire = pairedOfferIds.length > 0 ? pairedOfferIds : [marketOffer.staffingOfferId];

      for (const staffingOfferId of offerIdsToRetire) {
        dependencies.saveDatabase.run(
          `UPDATE staffing_offer
          SET offer_status = 'acquired',
              closed_at_utc = $closed_at_utc,
              close_reason = 'acquired'
          WHERE staffing_offer_id = $staffing_offer_id
            AND offer_status = 'available'`,
          {
            $staffing_offer_id: staffingOfferId,
            $closed_at_utc: hiredAtUtc,
          },
        );
      }
    }

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
        $event_type,
        'staffing_package',
        $source_object_id,
        'info',
        $message,
        $metadata_json
      )`,
      {
        $event_log_entry_id: eventLogEntryId,
        $save_id: command.saveId,
        $company_id: companyContext!.companyId,
        $event_time_utc: staffingEventTimeUtc,
        $event_type: staffingEventType,
        $source_object_id: staffingPackageId,
        $message: staffingEventMessage,
        $metadata_json: JSON.stringify({
          laborCategory: effectiveLaborCategory,
          employmentModel: effectiveEmploymentModel,
          qualificationGroup,
          coverageUnits: effectiveCoverageUnits,
          startsAtUtc: effectiveStartsAtUtc,
          endsAtUtc: effectiveEndsAtUtc ?? undefined,
          status: initialStatus,
          recurringObligationId,
          sourceOfferId: marketOffer?.staffingOfferId,
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
        $completed_at_utc: hiredAtUtc,
        $payload_json: JSON.stringify({
          ...command.payload,
          laborCategory: effectiveLaborCategory,
          employmentModel: effectiveEmploymentModel,
          qualificationGroup,
          staffingPackageId,
          recurringObligationId,
          initialStatus,
          startsAtUtc: effectiveStartsAtUtc,
          endsAtUtc: effectiveEndsAtUtc ?? undefined,
          coverageUnits: effectiveCoverageUnits,
          fixedCostAmount: effectiveFixedCostAmount,
          variableCostRate: effectiveVariableCostRate,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [staffingPackageId, ...(recurringObligationId ? [recurringObligationId] : [])],
    validationMessages: [marketOffer?.displayName
      ? `Hired ${marketOffer.displayName} for ${qualificationGroup}.`
      : `Activated ${effectiveLaborCategory} staffing package ${qualificationGroup}.`, ...warnings],
    hardBlockers: [],
    warnings,
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: ledgerEntryId ? [ledgerEntryId] : [],
    metadata: {
      staffingPackageId,
      recurringObligationId: recurringObligationId ?? undefined,
      initialStatus,
      qualificationGroup,
    },
  };
}
