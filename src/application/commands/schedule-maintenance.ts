/*
 * Starts the smallest player-invokable maintenance recovery path for the current slice.
 * The aircraft goes directly into maintenance, a completion event is scheduled, and time advance finishes the recovery.
 */

import type { CommandResult, ScheduleMaintenanceCommand } from "./types.js";
import { createPrefixedId, deriveFinancialPressureBand } from "./utils.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import {
  deriveMaintenanceRecoveryPlan,
  resolveMaintenanceRecoverySeverity,
} from "../../domain/maintenance/maintenance-recovery.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";

interface ScheduleMaintenanceDependencies {
  saveDatabase: SqliteFileDatabase;
  aircraftReference: AircraftReferenceRepository;
}

interface AircraftMaintenanceRow extends Record<string, unknown> {
  aircraftId: string;
  aircraftModelId: string;
  registration: string;
  displayName: string;
  ownershipType: string;
  deliveryState: string;
  statusInput: string;
  activeScheduleId: string | null;
  activeMaintenanceTaskId: string | null;
  conditionBandInput: string;
  hoursSinceInspection: number;
  cyclesSinceInspection: number;
  hoursToService: number;
  maintenanceStateInput: string;
  aogFlag: number;
}

function playerPaysMaintenanceRecovery(ownershipType: string): boolean {
  return ownershipType !== "leased";
}

function buildFailureResult(
  command: ScheduleMaintenanceCommand,
  hardBlockers: string[],
  warnings: string[] = [],
): CommandResult {
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

function resolveRecoverySeverity(row: AircraftMaintenanceRow): "due_soon" | "overdue" | "aog" | null {
  return resolveMaintenanceRecoverySeverity({
    maintenanceStateInput: row.maintenanceStateInput,
    aogFlag: row.aogFlag === 1,
  });
}

export async function handleScheduleMaintenance(
  command: ScheduleMaintenanceCommand,
  dependencies: ScheduleMaintenanceDependencies,
): Promise<CommandResult> {
  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);

  if (!companyContext) {
    return buildFailureResult(command, [`Save ${command.saveId} does not have an active company.`]);
  }

  const aircraftId = command.payload.aircraftId.trim();
  if (!aircraftId) {
    return buildFailureResult(command, ["Aircraft id is required to start maintenance recovery."]);
  }

  const aircraftRow = dependencies.saveDatabase.getOne<AircraftMaintenanceRow>(
    `SELECT
    ca.aircraft_id AS aircraftId,
    ca.aircraft_model_id AS aircraftModelId,
    ca.registration AS registration,
    ca.display_name AS displayName,
    ca.ownership_type AS ownershipType,
    ca.delivery_state AS deliveryState,
    ca.status_input AS statusInput,
      ca.active_schedule_id AS activeScheduleId,
      ca.active_maintenance_task_id AS activeMaintenanceTaskId,
      mps.condition_band_input AS conditionBandInput,
      mps.hours_since_inspection AS hoursSinceInspection,
      mps.cycles_since_inspection AS cyclesSinceInspection,
      mps.hours_to_service AS hoursToService,
      mps.maintenance_state_input AS maintenanceStateInput,
      mps.aog_flag AS aogFlag
    FROM company_aircraft AS ca
    JOIN maintenance_program_state AS mps ON mps.aircraft_id = ca.aircraft_id
    WHERE ca.company_id = $company_id
      AND ca.aircraft_id = $aircraft_id
    LIMIT 1`,
    {
      $company_id: companyContext.companyId,
      $aircraft_id: aircraftId,
    },
  );

  if (!aircraftRow) {
    return buildFailureResult(command, [`Aircraft ${aircraftId} was not found in the active fleet.`]);
  }

  const hardBlockers: string[] = [];
  const warnings: string[] = [];
  const recoverySeverity = resolveRecoverySeverity(aircraftRow);

  if (!["delivered", "available"].includes(aircraftRow.deliveryState)) {
    hardBlockers.push(`${aircraftRow.registration} is not in an operable delivery state.`);
  }

  if (!["owned", "financed", "leased"].includes(aircraftRow.ownershipType)) {
    hardBlockers.push(`${aircraftRow.registration} is not using a maintenance-supported ownership structure.`);
  }

  if (aircraftRow.activeScheduleId) {
    hardBlockers.push(`${aircraftRow.registration} already has an active committed schedule.`);
  }

  if (aircraftRow.activeMaintenanceTaskId) {
    hardBlockers.push(`${aircraftRow.registration} already has an active maintenance task.`);
  }

  if (aircraftRow.statusInput === "in_flight") {
    hardBlockers.push(`${aircraftRow.registration} is currently in flight and cannot enter maintenance.`);
  }

  if (aircraftRow.statusInput === "scheduled") {
    hardBlockers.push(`${aircraftRow.registration} is currently scheduled and cannot enter maintenance yet.`);
  }

  if (!recoverySeverity) {
    hardBlockers.push(`${aircraftRow.registration} is not due soon, overdue, or AOG right now.`);
  }

  const aircraftModel = dependencies.aircraftReference.findModel(aircraftRow.aircraftModelId);
  if (!aircraftModel) {
    hardBlockers.push(`Aircraft model ${aircraftRow.aircraftModelId} is missing from the reference catalog.`);
  }

  if (hardBlockers.length > 0) {
    return buildFailureResult(command, hardBlockers, warnings);
  }

  const recoveryPlan = deriveMaintenanceRecoveryPlan(recoverySeverity!, aircraftModel!, companyContext.currentTimeUtc);
  const playerCostAmount = playerPaysMaintenanceRecovery(aircraftRow.ownershipType) ? recoveryPlan.estimatedCostAmount : 0;
  if (playerCostAmount > companyContext.currentCashAmount) {
    return buildFailureResult(
      command,
      [`${companyContext.displayName} does not have enough cash for this maintenance recovery.`],
      [`Estimated player cost is ${playerCostAmount}.`],
    );
  }

  const maintenanceTaskId = createPrefixedId("maint");
  const completionEventId = createPrefixedId("eventq");
  const eventLogEntryId = createPrefixedId("event");
  const ledgerEntryId = playerCostAmount > 0 ? createPrefixedId("ledger") : null;
  const effectiveTimeUtc = companyContext.currentTimeUtc;
  const plannedEndUtc = recoveryPlan.readyAtUtc;
  const updatedCashAmount = companyContext.currentCashAmount - playerCostAmount;

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `INSERT INTO maintenance_task (
        maintenance_task_id,
        aircraft_id,
        maintenance_type,
        provider_source,
        planned_start_utc,
        planned_end_utc,
        actual_start_utc,
        actual_end_utc,
        cost_estimate_amount,
        actual_cost_amount,
        task_state
      ) VALUES (
        $maintenance_task_id,
        $aircraft_id,
        $maintenance_type,
        'player_recovery',
        $planned_start_utc,
        $planned_end_utc,
        $actual_start_utc,
        NULL,
        $cost_estimate_amount,
        NULL,
        'in_progress'
      )`,
      {
        $maintenance_task_id: maintenanceTaskId,
        $aircraft_id: aircraftRow.aircraftId,
        $maintenance_type: recoveryPlan.maintenanceType,
        $planned_start_utc: effectiveTimeUtc,
        $planned_end_utc: plannedEndUtc,
        $actual_start_utc: effectiveTimeUtc,
        $cost_estimate_amount: playerCostAmount,
      },
    );

    dependencies.saveDatabase.run(
      `UPDATE company_aircraft
      SET status_input = 'maintenance',
          dispatch_available = 0,
          active_schedule_id = NULL,
          active_maintenance_task_id = $active_maintenance_task_id
      WHERE aircraft_id = $aircraft_id`,
      {
        $active_maintenance_task_id: maintenanceTaskId,
        $aircraft_id: aircraftRow.aircraftId,
      },
    );

    dependencies.saveDatabase.run(
      `UPDATE maintenance_program_state
      SET maintenance_state_input = 'current',
          aog_flag = 0,
          updated_at_utc = $updated_at_utc
      WHERE aircraft_id = $aircraft_id`,
      {
        $updated_at_utc: effectiveTimeUtc,
        $aircraft_id: aircraftRow.aircraftId,
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
        $financial_pressure_band: deriveFinancialPressureBand(updatedCashAmount),
        $updated_at_utc: effectiveTimeUtc,
        $company_id: companyContext.companyId,
      },
    );

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
          'maintenance_recovery',
          $amount,
          'USD',
          'maintenance_task',
          $source_object_id,
          $description,
          $metadata_json
        )`,
        {
          $ledger_entry_id: ledgerEntryId,
          $company_id: companyContext.companyId,
          $entry_time_utc: effectiveTimeUtc,
          $amount: playerCostAmount * -1,
          $source_object_id: maintenanceTaskId,
          $description: `Started maintenance recovery for ${aircraftRow.registration}.`,
          $metadata_json: JSON.stringify({
            aircraftId: aircraftRow.aircraftId,
            registration: aircraftRow.registration,
            maintenanceType: recoveryPlan.maintenanceType,
            durationHours: recoveryPlan.durationHours,
            plannedEndUtc,
            recoverySeverity,
            ownershipType: aircraftRow.ownershipType,
          }),
        },
      );
    }

    dependencies.saveDatabase.run(
      `INSERT INTO scheduled_event (
        scheduled_event_id,
        save_id,
        event_type,
        scheduled_time_utc,
        status,
        aircraft_id,
        company_contract_id,
        maintenance_task_id,
        payload_json
      ) VALUES (
        $scheduled_event_id,
        $save_id,
        'maintenance_task_completed',
        $scheduled_time_utc,
        'pending',
        $aircraft_id,
        NULL,
        $maintenance_task_id,
        $payload_json
      )`,
      {
        $scheduled_event_id: completionEventId,
        $save_id: command.saveId,
        $scheduled_time_utc: plannedEndUtc,
        $aircraft_id: aircraftRow.aircraftId,
        $maintenance_task_id: maintenanceTaskId,
        $payload_json: JSON.stringify({
          aircraftId: aircraftRow.aircraftId,
          maintenanceTaskId,
          maintenanceType: recoveryPlan.maintenanceType,
          recoverySeverity,
        }),
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
        'maintenance_recovery_started',
        'maintenance_task',
        $source_object_id,
        'warning',
        $message,
        $metadata_json
      )`,
      {
        $event_log_entry_id: eventLogEntryId,
        $save_id: command.saveId,
        $company_id: companyContext.companyId,
        $event_time_utc: effectiveTimeUtc,
        $source_object_id: maintenanceTaskId,
        $message: `Started ${recoveryPlan.maintenanceType.replaceAll("_", " ")} for ${aircraftRow.registration}; ready ${plannedEndUtc}.`,
        $metadata_json: JSON.stringify({
          aircraftId: aircraftRow.aircraftId,
          registration: aircraftRow.registration,
          maintenanceType: recoveryPlan.maintenanceType,
          durationHours: recoveryPlan.durationHours,
          plannedEndUtc,
          recoverySeverity,
          estimatedCostAmount: playerCostAmount,
          ownershipType: aircraftRow.ownershipType,
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
        $completed_at_utc: effectiveTimeUtc,
        $payload_json: JSON.stringify({
          aircraftId: aircraftRow.aircraftId,
          maintenanceTaskId,
          maintenanceType: recoveryPlan.maintenanceType,
          plannedStartUtc: effectiveTimeUtc,
          plannedEndUtc,
          recoverySeverity,
          estimatedCostAmount: playerCostAmount,
          ownershipType: aircraftRow.ownershipType,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [aircraftRow.aircraftId, maintenanceTaskId],
    validationMessages: [
      playerCostAmount > 0
        ? `Started maintenance recovery for ${aircraftRow.registration}; ready ${plannedEndUtc}.`
        : `Started lease-covered maintenance for ${aircraftRow.registration}; ready ${plannedEndUtc}.`,
    ],
    hardBlockers: [],
    warnings,
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: ledgerEntryId ? [ledgerEntryId] : [],
    metadata: {
      aircraftId: aircraftRow.aircraftId,
      maintenanceTaskId,
      plannedEndUtc,
      estimatedCostAmount: playerCostAmount,
      recoverySeverity,
      ownershipType: aircraftRow.ownershipType,
    },
  };
}
