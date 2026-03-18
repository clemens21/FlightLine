/*
 * Starts an immediate named-pilot transfer to a bounded destination.
 * This slice is intentionally narrow: only ready pilots, only home-base or current fleet airports,
 * and it reuses the existing travel state instead of creating a second travel model.
 */

import type { CommandResult, StartNamedPilotTransferCommand } from "./types.js";
import { createPrefixedId } from "./utils.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import {
  deriveNamedPilotTravelUntil,
  loadNamedPilotRoster,
} from "../staffing/named-pilot-roster.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AirportReferenceRepository } from "../../infrastructure/reference/airport-reference.js";

interface StartNamedPilotTransferDependencies {
  saveDatabase: SqliteFileDatabase;
  airportReference: AirportReferenceRepository;
}

interface AirportRow extends Record<string, unknown> {
  airportId: string;
}

function buildFailureResult(
  command: StartNamedPilotTransferCommand,
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

export async function handleStartNamedPilotTransfer(
  command: StartNamedPilotTransferCommand,
  dependencies: StartNamedPilotTransferDependencies,
): Promise<CommandResult> {
  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);

  if (!companyContext) {
    return buildFailureResult(command, `Save ${command.saveId} does not have an active company.`);
  }

  const destinationAirportId = command.payload.destinationAirportId.trim().toUpperCase();
  if (!destinationAirportId) {
    return buildFailureResult(command, "A transfer destination is required.");
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
    return buildFailureResult(command, `${namedPilot.displayName} is not part of active pilot coverage yet.`);
  }

  if (namedPilot.availabilityState !== "ready") {
    return buildFailureResult(
      command,
      `${namedPilot.displayName} is currently ${namedPilot.availabilityState} and cannot transfer.`,
    );
  }

  if (!namedPilot.currentAirportId) {
    return buildFailureResult(command, `${namedPilot.displayName} does not have a current airport to transfer from.`);
  }

  if (namedPilot.currentAirportId === destinationAirportId) {
    return buildFailureResult(command, `${namedPilot.displayName} is already at ${destinationAirportId}.`);
  }

  const allowedDestinationIds = new Set<string>([companyContext.homeBaseAirportId]);
  const fleetAirportRows = dependencies.saveDatabase.all<AirportRow>(
    `SELECT DISTINCT current_airport_id AS airportId
    FROM company_aircraft
    WHERE company_id = $company_id
      AND delivery_state IN ('delivered', 'available')
      AND current_airport_id IS NOT NULL`,
    { $company_id: companyContext.companyId },
  );
  for (const row of fleetAirportRows) {
    allowedDestinationIds.add(row.airportId);
  }

  if (!allowedDestinationIds.has(destinationAirportId)) {
    return buildFailureResult(
      command,
      `Pilot transfers are limited to home base and current fleet airports; ${destinationAirportId} is not allowed.`,
    );
  }

  const travelUntilUtc = deriveNamedPilotTravelUntil(
    companyContext.currentTimeUtc,
    namedPilot.currentAirportId,
    destinationAirportId,
    dependencies.airportReference,
  );
  if (!travelUntilUtc) {
    return buildFailureResult(
      command,
      `Could not resolve a transfer route from ${namedPilot.currentAirportId} to ${destinationAirportId}.`,
    );
  }

  const eventLogEntryId = createPrefixedId("event");
  const destinationLabel = destinationAirportId === companyContext.homeBaseAirportId
    ? `${destinationAirportId} (home base)`
    : destinationAirportId;

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `UPDATE named_pilot
      SET travel_origin_airport_id = $travel_origin_airport_id,
          travel_destination_airport_id = $travel_destination_airport_id,
          travel_started_at_utc = $travel_started_at_utc,
          travel_until_utc = $travel_until_utc,
          updated_at_utc = $updated_at_utc
      WHERE named_pilot_id = $named_pilot_id`,
      {
        $named_pilot_id: namedPilot.namedPilotId,
        $travel_origin_airport_id: namedPilot.currentAirportId,
        $travel_destination_airport_id: destinationAirportId,
        $travel_started_at_utc: companyContext.currentTimeUtc,
        $travel_until_utc: travelUntilUtc,
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
        'pilot_travel_started',
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
        $message: `${namedPilot.displayName} started transfer to ${destinationLabel} until ${travelUntilUtc}.`,
        $metadata_json: JSON.stringify({
          namedPilotId: namedPilot.namedPilotId,
          displayName: namedPilot.displayName,
          qualificationGroup: namedPilot.qualificationGroup,
          travelOriginAirportId: namedPilot.currentAirportId,
          travelDestinationAirportId: destinationAirportId,
          travelStartedAtUtc: companyContext.currentTimeUtc,
          travelUntilUtc,
          transferType: destinationAirportId === companyContext.homeBaseAirportId ? "home_return" : "manual_transfer",
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
          travelOriginAirportId: namedPilot.currentAirportId,
          travelDestinationAirportId: destinationAirportId,
          travelStartedAtUtc: companyContext.currentTimeUtc,
          travelUntilUtc,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [namedPilot.namedPilotId],
    validationMessages: [`${namedPilot.displayName} started transfer to ${destinationLabel}.`],
    hardBlockers: [],
    warnings: [],
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [],
    metadata: {
      namedPilotId: namedPilot.namedPilotId,
      travelOriginAirportId: namedPilot.currentAirportId,
      travelDestinationAirportId: destinationAirportId,
      travelStartedAtUtc: companyContext.currentTimeUtc,
      travelUntilUtc,
    },
  };
}
