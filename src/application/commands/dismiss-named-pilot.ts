/*
 * Cancels an active pilot staffing package in place so the named pilot remains visible in history without active coverage.
 */

import type { CommandResult, DismissNamedPilotCommand } from "./types.js";
import { createPrefixedId } from "./utils.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import { loadNamedPilotRoster } from "../staffing/named-pilot-roster.js";
import type { EmploymentModel } from "../../domain/staffing/types.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";

interface DismissNamedPilotDependencies {
  saveDatabase: SqliteFileDatabase;
}

interface StaffingPackageRow extends Record<string, unknown> {
  staffingPackageId: string;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  endsAtUtc: string | null;
  recurringObligationId: string | null;
}

interface CountRow extends Record<string, unknown> {
  countValue: number;
}

function buildFailureResult(
  command: DismissNamedPilotCommand,
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

function describeDismissalBlock(displayName: string, availabilityState: string): string {
  switch (availabilityState) {
    case "reserved":
      return `${displayName} is reserved for scheduled work and cannot be dismissed right now.`;
    case "flying":
      return `${displayName} is currently flying and cannot be dismissed right now.`;
    case "training":
      return `${displayName} is currently training and cannot be dismissed right now.`;
    case "traveling":
      return `${displayName} is currently traveling and cannot be dismissed until that transfer resolves.`;
    default:
      return `${displayName} is currently ${availabilityState} and cannot be dismissed right now.`;
  }
}

export async function handleDismissNamedPilot(
  command: DismissNamedPilotCommand,
  dependencies: DismissNamedPilotDependencies,
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

  if (!["ready", "resting"].includes(namedPilot.availabilityState)) {
    return buildFailureResult(command, describeDismissalBlock(namedPilot.displayName, namedPilot.availabilityState));
  }

  const activeAssignmentCountRow = dependencies.saveDatabase.getOne<CountRow>(
    `SELECT COUNT(*) AS countValue
    FROM named_pilot_assignment
    WHERE named_pilot_id = $named_pilot_id
      AND status IN ('reserved', 'flying')
      AND assigned_to_utc > $current_time_utc`,
    {
      $named_pilot_id: namedPilot.namedPilotId,
      $current_time_utc: companyContext.currentTimeUtc,
    },
  );

  if ((activeAssignmentCountRow?.countValue ?? 0) > 0) {
    return buildFailureResult(
      command,
      `${namedPilot.displayName} still has committed flight assignments and cannot be dismissed right now.`,
    );
  }

  const staffingPackage = dependencies.saveDatabase.getOne<StaffingPackageRow>(
    `SELECT
      sp.staffing_package_id AS staffingPackageId,
      sp.employment_model AS employmentModel,
      sp.qualification_group AS qualificationGroup,
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

  const eventLogEntryId = createPrefixedId("event");

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `UPDATE staffing_package
      SET status = 'cancelled',
          ends_at_utc = $ends_at_utc
      WHERE staffing_package_id = $staffing_package_id`,
      {
        $staffing_package_id: staffingPackage.staffingPackageId,
        $ends_at_utc: companyContext.currentTimeUtc,
      },
    );

    if (staffingPackage.recurringObligationId) {
      dependencies.saveDatabase.run(
        `UPDATE recurring_obligation
        SET status = 'completed',
            end_at_utc = $end_at_utc
        WHERE recurring_obligation_id = $recurring_obligation_id`,
        {
          $recurring_obligation_id: staffingPackage.recurringObligationId,
          $end_at_utc: companyContext.currentTimeUtc,
        },
      );
    }

    dependencies.saveDatabase.run(
      `UPDATE named_pilot
      SET resting_until_utc = NULL,
          training_program_kind = NULL,
          training_target_certification_code = NULL,
          training_started_at_utc = NULL,
          training_until_utc = NULL,
          travel_origin_airport_id = NULL,
          travel_destination_airport_id = NULL,
          travel_started_at_utc = NULL,
          travel_until_utc = NULL,
          updated_at_utc = $updated_at_utc
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
        'named_pilot_dismissed',
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
        $message: `Dismissed ${namedPilot.displayName} from active pilot coverage effective immediately.`,
        $metadata_json: JSON.stringify({
          namedPilotId: namedPilot.namedPilotId,
          staffingPackageId: staffingPackage.staffingPackageId,
          employmentModel: staffingPackage.employmentModel,
          qualificationGroup: staffingPackage.qualificationGroup,
          dismissedAtUtc: companyContext.currentTimeUtc,
          previousEndsAtUtc: staffingPackage.endsAtUtc ?? undefined,
          recurringObligationId: staffingPackage.recurringObligationId ?? undefined,
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
          dismissedAtUtc: companyContext.currentTimeUtc,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [
      namedPilot.namedPilotId,
      staffingPackage.staffingPackageId,
      ...(staffingPackage.recurringObligationId ? [staffingPackage.recurringObligationId] : []),
    ],
    validationMessages: [`Dismissed ${namedPilot.displayName} from active pilot coverage effective immediately.`],
    hardBlockers: [],
    warnings: [],
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [],
    metadata: {
      namedPilotId: namedPilot.namedPilotId,
      staffingPackageId: staffingPackage.staffingPackageId,
      dismissedAtUtc: companyContext.currentTimeUtc,
    },
  };
}
