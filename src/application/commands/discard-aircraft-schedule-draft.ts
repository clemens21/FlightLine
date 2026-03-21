/*
 * Clears a staged aircraft draft without touching committed schedule state.
 */

import type { CommandResult, DiscardAircraftScheduleDraftCommand } from "./types.js";
import { createPrefixedId } from "./utils.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";

interface DiscardAircraftScheduleDraftDependencies {
  saveDatabase: SqliteFileDatabase;
}

interface DraftScheduleRow extends Record<string, unknown> {
  scheduleId: string;
  aircraftId: string;
  isDraft: number;
  scheduleState: string;
}

function buildFailureResult(
  command: DiscardAircraftScheduleDraftCommand,
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

export async function handleDiscardAircraftScheduleDraft(
  command: DiscardAircraftScheduleDraftCommand,
  dependencies: DiscardAircraftScheduleDraftDependencies,
): Promise<CommandResult> {
  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);

  if (!companyContext) {
    return buildFailureResult(command, `Save ${command.saveId} does not have an active company.`);
  }

  const draftSchedule = dependencies.saveDatabase.getOne<DraftScheduleRow>(
    `SELECT
      s.schedule_id AS scheduleId,
      s.aircraft_id AS aircraftId,
      s.is_draft AS isDraft,
      s.schedule_state AS scheduleState
    FROM aircraft_schedule AS s
    JOIN company_aircraft AS ca ON ca.aircraft_id = s.aircraft_id
    WHERE s.schedule_id = $schedule_id
      AND ca.company_id = $company_id
    LIMIT 1`,
    {
      $schedule_id: command.payload.scheduleId,
      $company_id: companyContext.companyId,
    },
  );

  if (!draftSchedule) {
    return buildFailureResult(command, `Draft schedule ${command.payload.scheduleId} was not found.`);
  }

  if (draftSchedule.isDraft !== 1 || !["draft", "blocked"].includes(draftSchedule.scheduleState)) {
    return buildFailureResult(command, `Schedule ${draftSchedule.scheduleId} is not an active draft and cannot be discarded.`);
  }

  const eventLogEntryId = createPrefixedId("event");

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `DELETE FROM flight_leg
      WHERE schedule_id = $schedule_id`,
      { $schedule_id: draftSchedule.scheduleId },
    );

    dependencies.saveDatabase.run(
      `DELETE FROM labor_allocation
      WHERE schedule_id = $schedule_id`,
      { $schedule_id: draftSchedule.scheduleId },
    );

    dependencies.saveDatabase.run(
      `UPDATE aircraft_schedule
      SET schedule_state = 'cancelled',
          is_draft = 0,
          updated_at_utc = $updated_at_utc
      WHERE schedule_id = $schedule_id`,
      {
        $schedule_id: draftSchedule.scheduleId,
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
        'schedule_draft_discarded',
        'aircraft_schedule',
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
        $source_object_id: draftSchedule.scheduleId,
        $message: `Discarded draft schedule ${draftSchedule.scheduleId} for aircraft ${draftSchedule.aircraftId}.`,
        $metadata_json: JSON.stringify({
          aircraftId: draftSchedule.aircraftId,
          discardedAtUtc: companyContext.currentTimeUtc,
          previousScheduleState: draftSchedule.scheduleState,
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
          scheduleId: draftSchedule.scheduleId,
          aircraftId: draftSchedule.aircraftId,
          discardedAtUtc: companyContext.currentTimeUtc,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [draftSchedule.scheduleId, draftSchedule.aircraftId],
    validationMessages: [`Discarded draft schedule ${draftSchedule.scheduleId}.`],
    hardBlockers: [],
    warnings: [],
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [],
    metadata: {
      scheduleId: draftSchedule.scheduleId,
      aircraftId: draftSchedule.aircraftId,
      discardedAtUtc: companyContext.currentTimeUtc,
    },
  };
}
