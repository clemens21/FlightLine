/*
 * Implements the refresh staffing market command handler for the backend command pipeline.
 * This replaces the active staffing-market window with a newly generated pilots-first candidate set.
 */

import type { CommandResult, RefreshStaffingMarketCommand } from "./types.js";
import { createPrefixedId } from "./utils.js";
import { reconcileStaffingMarket } from "../staffing/staffing-market-reconciler.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";

interface RefreshStaffingMarketDependencies {
  saveDatabase: SqliteFileDatabase;
  aircraftReference: AircraftReferenceRepository;
}

export async function handleRefreshStaffingMarket(
  command: RefreshStaffingMarketCommand,
  dependencies: RefreshStaffingMarketDependencies,
): Promise<CommandResult> {
  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);

  if (!companyContext) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [`Save ${command.saveId} does not have an active company.`],
      hardBlockers: [`Save ${command.saveId} does not have an active company.`],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const refreshReason = command.payload.refreshReason ?? "manual";
  const marketResult = reconcileStaffingMarket({
    saveDatabase: dependencies.saveDatabase,
    companyContext,
    aircraftReference: dependencies.aircraftReference,
    refreshReason,
  });

  if (!marketResult.success || !marketResult.offerWindowId) {
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

  const eventLogEntryId = createPrefixedId("event");

  dependencies.saveDatabase.transaction(() => {
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
        'staffing_market_refreshed',
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
        $message: `Staff hiring market refreshed with ${marketResult.offerCount} pilot candidates.`,
        $metadata_json: JSON.stringify({
          refreshReason,
          offerCount: marketResult.offerCount,
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
          refreshReason,
          offerWindowId: marketResult.offerWindowId,
          offerCount: marketResult.offerCount,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [marketResult.offerWindowId],
    validationMessages: marketResult.validationMessages,
    hardBlockers: [],
    warnings: [],
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [],
    metadata: {
      changed: true,
      offerWindowId: marketResult.offerWindowId,
      offerCount: marketResult.offerCount,
      refreshReason,
    },
  };
}
