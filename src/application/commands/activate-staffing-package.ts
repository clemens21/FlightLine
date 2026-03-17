/*
 * Implements the activate staffing package command handler for the backend command pipeline.
 * Files in this layer validate a request, mutate save-state tables inside a transaction, and return structured results for callers.
 */

import type { CommandResult, ActivateStaffingPackageCommand } from "./types.js";
import { addUtcMonths, createPrefixedId, deriveFinancialPressureBand } from "./utils.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";

interface ActivateStaffingPackageDependencies {
  saveDatabase: SqliteFileDatabase;
  aircraftReference: AircraftReferenceRepository;
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

function isIsoUtcEarlier(leftUtc: string, rightUtc: string): boolean {
  return new Date(leftUtc).getTime() < new Date(rightUtc).getTime();
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

  const qualificationGroup = command.payload.qualificationGroup.trim();

  if (!qualificationGroup) {
    hardBlockers.push("Staffing qualification group is required.");
  }

  if (!Number.isInteger(command.payload.coverageUnits) || command.payload.coverageUnits <= 0) {
    hardBlockers.push("Staffing coverage units must be a positive whole number.");
  }

  if (command.payload.fixedCostAmount < 0) {
    hardBlockers.push("Staffing fixed cost amount cannot be negative.");
  }

  if ((command.payload.variableCostRate ?? 0) < 0) {
    hardBlockers.push("Staffing variable cost rate cannot be negative.");
  }

  switch (command.payload.laborCategory) {
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

  const startsAtUtc = command.payload.startsAtUtc ?? companyContext?.currentTimeUtc ?? command.issuedAtUtc;
  const endsAtUtc = command.payload.endsAtUtc ?? null;

  if (companyContext && isIsoUtcEarlier(startsAtUtc, companyContext.currentTimeUtc)) {
    hardBlockers.push("Staffing package start time cannot be earlier than the current game time.");
  }

  if (endsAtUtc && !isIsoUtcEarlier(startsAtUtc, endsAtUtc)) {
    hardBlockers.push("Staffing package end time must be later than the start time.");
  }

  if (command.payload.employmentModel === "service_agreement" && !command.payload.serviceRegionCode?.trim()) {
    warnings.push("Service-agreement staffing was activated without a service region code.");
  }

  const initialStatus = companyContext && startsAtUtc > companyContext.currentTimeUtc ? "pending" : "active";
  const upfrontChargeAmount = initialStatus === "active" ? command.payload.fixedCostAmount : 0;

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

  const staffingPackageId = createPrefixedId("staff");
  const recurringObligationId = command.payload.fixedCostAmount > 0 ? createPrefixedId("obligation") : null;
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
        $labor_category: command.payload.laborCategory,
        $employment_model: command.payload.employmentModel,
        $qualification_group: qualificationGroup,
        $coverage_units: command.payload.coverageUnits,
        $fixed_cost_amount: command.payload.fixedCostAmount,
        $variable_cost_rate: command.payload.variableCostRate ?? null,
        $service_region_code: command.payload.serviceRegionCode?.trim() || null,
        $starts_at_utc: startsAtUtc,
        $ends_at_utc: endsAtUtc,
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
        $updated_at_utc: startsAtUtc,
        $company_id: companyContext!.companyId,
      },
    );

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
          $obligation_type: command.payload.employmentModel === "service_agreement" ? "service_agreement" : "staffing",
          $source_object_id: staffingPackageId,
          $amount: command.payload.fixedCostAmount,
          $next_due_at_utc: initialStatus === "active" ? addUtcMonths(startsAtUtc, 1) : startsAtUtc,
          $end_at_utc: endsAtUtc,
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
          $entry_time_utc: startsAtUtc,
          $amount: upfrontChargeAmount * -1,
          $source_object_id: staffingPackageId,
          $description: `Activated ${command.payload.laborCategory} staffing package ${qualificationGroup}.`,
          $metadata_json: JSON.stringify({
            employmentModel: command.payload.employmentModel,
            coverageUnits: command.payload.coverageUnits,
            fixedCostAmount: command.payload.fixedCostAmount,
          }),
        },
      );
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
        'staffing_package_activated',
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
        $event_time_utc: startsAtUtc,
        $source_object_id: staffingPackageId,
        $message: `Activated ${command.payload.laborCategory} staffing package ${qualificationGroup}.`,
        $metadata_json: JSON.stringify({
          laborCategory: command.payload.laborCategory,
          employmentModel: command.payload.employmentModel,
          qualificationGroup,
          coverageUnits: command.payload.coverageUnits,
          startsAtUtc,
          endsAtUtc,
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
        $completed_at_utc: startsAtUtc,
        $payload_json: JSON.stringify({
          ...command.payload,
          qualificationGroup,
          staffingPackageId,
          recurringObligationId,
          initialStatus,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [staffingPackageId, ...(recurringObligationId ? [recurringObligationId] : [])],
    validationMessages: [`Activated ${command.payload.laborCategory} staffing package ${qualificationGroup}.`, ...warnings],
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
