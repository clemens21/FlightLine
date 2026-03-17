/*
 * Implements the refresh aircraft market command handler for the backend command pipeline.
 * Files in this layer validate a request, mutate save-state tables inside a transaction, and return structured results for callers.
 */

import { createPrefixedId } from "./utils.js";
import type { CommandResult, RefreshAircraftMarketCommand } from "./types.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AirportReferenceRepository } from "../../infrastructure/reference/airport-reference.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";
import { reconcileAircraftMarket } from "../aircraft/aircraft-market-reconciler.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";

interface RefreshAircraftMarketDependencies {
  saveDatabase: SqliteFileDatabase;
  airportReference: AirportReferenceRepository;
  aircraftReference: AircraftReferenceRepository;
}

// Bridges the command layer to the aircraft-market reconciler so UI and time systems can trigger market churn uniformly.
export async function handleRefreshAircraftMarket(
  command: RefreshAircraftMarketCommand,
  dependencies: RefreshAircraftMarketDependencies,
): Promise<CommandResult> {
  const marketResult = reconcileAircraftMarket({
    saveDatabase: dependencies.saveDatabase,
    saveId: command.saveId,
    airportReference: dependencies.airportReference,
    aircraftReference: dependencies.aircraftReference,
    refreshReason: command.payload.refreshReason ?? "scheduled",
  });

  if (!marketResult.success) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: marketResult.validationMessages,
      hardBlockers: marketResult.validationMessages,
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
      metadata: {
        changed: false,
        offerCount: marketResult.offerCount,
      },
    };
  }

  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);
  const emittedEventIds: string[] = [];

  if (marketResult.changed && companyContext) {
    const eventLogEntryId = createPrefixedId("event");
    emittedEventIds.push(eventLogEntryId);

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
        'aircraft_market_reconciled',
        'offer_window',
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
        $source_object_id: marketResult.offerWindowId,
        $message: `Aircraft market updated to ${marketResult.offerCount} live listings.`,
        $metadata_json: JSON.stringify({
          refreshReason: command.payload.refreshReason ?? "scheduled",
          offerCount: marketResult.offerCount,
          insertedOfferCount: marketResult.insertedOfferCount,
          expiredOfferCount: marketResult.expiredOfferCount,
          createdWindow: marketResult.createdWindow,
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
          refreshReason: command.payload.refreshReason ?? "scheduled",
          offerWindowId: marketResult.offerWindowId,
          offerCount: marketResult.offerCount,
          insertedOfferCount: marketResult.insertedOfferCount,
          expiredOfferCount: marketResult.expiredOfferCount,
        }),
      },
    );

    await dependencies.saveDatabase.persist();
  }

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: marketResult.offerWindowId ? [marketResult.offerWindowId] : [],
    validationMessages: marketResult.validationMessages,
    hardBlockers: [],
    warnings: [],
    emittedEventIds,
    emittedLedgerEntryIds: [],
    metadata: {
      changed: marketResult.changed,
      offerWindowId: marketResult.offerWindowId,
      offerCount: marketResult.offerCount,
      insertedOfferCount: marketResult.insertedOfferCount,
      expiredOfferCount: marketResult.expiredOfferCount,
      createdWindow: marketResult.createdWindow,
    },
  };
}
