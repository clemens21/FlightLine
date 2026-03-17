/*
 * Implements the create save game command handler for the backend command pipeline.
 * Files in this layer validate a request, mutate save-state tables inside a transaction, and return structured results for callers.
 */

import type { CommandResult, CreateSaveGameCommand } from "./types.js";
import { createPrefixedId } from "./utils.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";

interface CreateSaveGameDependencies {
  saveDatabase: SqliteFileDatabase;
  saveFilePath: string;
  resolveAirportSnapshotVersion: () => Promise<string>;
  resolveAircraftSnapshotVersion: () => Promise<string>;
}

interface ExistingSaveRow extends Record<string, unknown> {
  save_id: string;
}

// Creates the save-game root row and records the immutable world/reference snapshot versions for that world.
export async function handleCreateSaveGame(
  command: CreateSaveGameCommand,
  dependencies: CreateSaveGameDependencies,
): Promise<CommandResult> {
  const hardBlockers: string[] = [];

  if (!command.payload.worldSeed.trim()) {
    hardBlockers.push("World seed is required.");
  }

  if (!command.payload.startTimeUtc.trim()) {
    hardBlockers.push("A starting UTC timestamp is required.");
  }

  const existingSave = dependencies.saveDatabase.getOne<ExistingSaveRow>(
    "SELECT save_id FROM save_game WHERE save_id = $save_id LIMIT 1",
    { $save_id: command.saveId },
  );

  if (existingSave) {
    hardBlockers.push(`Save ${command.saveId} already exists.`);
  }

  if (hardBlockers.length > 0) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: hardBlockers,
      hardBlockers,
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const airportSnapshotVersion =
    command.payload.airportSnapshotVersion ?? (await dependencies.resolveAirportSnapshotVersion());
  const aircraftSnapshotVersion =
    command.payload.aircraftSnapshotVersion ?? (await dependencies.resolveAircraftSnapshotVersion());
  const eventLogEntryId = createPrefixedId("event");

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `INSERT INTO save_game (
        save_id,
        save_version,
        created_at_utc,
        updated_at_utc,
        world_seed,
        difficulty_profile,
        airport_snapshot_version,
        aircraft_snapshot_version,
        active_company_id
      ) VALUES (
        $save_id,
        $save_version,
        $created_at_utc,
        $updated_at_utc,
        $world_seed,
        $difficulty_profile,
        $airport_snapshot_version,
        $aircraft_snapshot_version,
        NULL
      )`,
      {
        $save_id: command.saveId,
        $save_version: 1,
        $created_at_utc: command.issuedAtUtc,
        $updated_at_utc: command.issuedAtUtc,
        $world_seed: command.payload.worldSeed,
        $difficulty_profile: command.payload.difficultyProfile,
        $airport_snapshot_version: airportSnapshotVersion,
        $aircraft_snapshot_version: aircraftSnapshotVersion,
      },
    );

    dependencies.saveDatabase.run(
      `INSERT INTO game_clock (
        save_id,
        current_time_utc,
        last_advanced_at_utc,
        last_advance_result_json
      ) VALUES (
        $save_id,
        $current_time_utc,
        NULL,
        NULL
      )`,
      {
        $save_id: command.saveId,
        $current_time_utc: command.payload.startTimeUtc,
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
        NULL,
        $event_time_utc,
        $event_type,
        $source_object_type,
        $source_object_id,
        $severity,
        $message,
        $metadata_json
      )`,
      {
        $event_log_entry_id: eventLogEntryId,
        $save_id: command.saveId,
        $event_time_utc: command.issuedAtUtc,
        $event_type: "save_created",
        $source_object_type: "save_game",
        $source_object_id: command.saveId,
        $severity: "info",
        $message: `Save ${command.saveId} created.`,
        $metadata_json: JSON.stringify({
          airportSnapshotVersion,
          aircraftSnapshotVersion,
          saveFilePath: dependencies.saveFilePath,
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
        $status,
        $payload_json
      )`,
      {
        $command_id: command.commandId,
        $save_id: command.saveId,
        $command_name: command.commandName,
        $actor_type: command.actorType,
        $issued_at_utc: command.issuedAtUtc,
        $completed_at_utc: command.issuedAtUtc,
        $status: "completed",
        $payload_json: JSON.stringify(command.payload),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [command.saveId],
    validationMessages: ["Save created successfully."],
    hardBlockers: [],
    warnings: [],
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [],
    metadata: {
      airportSnapshotVersion,
      aircraftSnapshotVersion,
      saveFilePath: dependencies.saveFilePath,
    },
  };
}
