/*
 * Implements the refresh contract board command handler for the backend command pipeline.
 * Files in this layer validate a request, mutate save-state tables inside a transaction, and return structured results for callers.
 */

import type { CommandResult, RefreshContractBoardCommand } from "./types.js";
import { createPrefixedId } from "./utils.js";
import { generateContractBoard, type GeneratedContractBoard, type GeneratedContractOfferInput } from "../contracts/contract-board-generator.js";
import { isCurrentContractBoardGenerationContextHash } from "../contracts/contract-board-generation-profile.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AirportReferenceRepository } from "../../infrastructure/reference/airport-reference.js";

interface RefreshContractBoardDependencies {
  saveDatabase: SqliteFileDatabase;
  airportReference: AirportReferenceRepository;
}

interface ActiveWindowRow extends Record<string, unknown> {
  offerWindowId: string;
  generatedAtUtc: string;
  generationContextHash: string;
}

interface AircraftLocationRow extends Record<string, unknown> {
  currentAirportId: string;
}

interface ActiveOfferRow extends Record<string, unknown> {
  contractOfferId: string;
  archetype: string;
  originAirportId: string;
  destinationAirportId: string;
  volumeType: "passenger" | "cargo";
  offerStatus: string;
  latestCompletionUtc: string;
}

interface RefreshExecutionResult {
  offerWindowId: string;
  rollingRefresh: boolean;
  offerCount: number;
  addedOfferCount: number;
  retainedOfferCount: number;
  expiredOfferCount: number;
}

function buildGeneratedOfferSignature(offer: GeneratedContractOfferInput): string {
  return [
    offer.archetype,
    offer.originAirportId,
    offer.destinationAirportId,
    offer.volumeType,
  ].join("|");
}

function buildPersistedOfferSignature(offer: ActiveOfferRow): string {
  return [
    offer.archetype,
    offer.originAirportId,
    offer.destinationAirportId,
    offer.volumeType,
  ].join("|");
}

function markWindowExpired(saveDatabase: SqliteFileDatabase, offerWindowId: string): void {
  saveDatabase.run(
    `UPDATE offer_window
     SET status = 'expired'
     WHERE offer_window_id = $offer_window_id`,
    { $offer_window_id: offerWindowId },
  );
  saveDatabase.run(
    `UPDATE contract_offer
     SET offer_status = 'expired'
     WHERE offer_window_id = $offer_window_id
       AND offer_status IN ('available', 'shortlisted')`,
    { $offer_window_id: offerWindowId },
  );
}

function insertOfferWindow(
  saveDatabase: SqliteFileDatabase,
  offerWindowId: string,
  companyId: string,
  generatedBoard: GeneratedContractBoard,
  refreshReason: string,
): void {
  saveDatabase.run(
    `INSERT INTO offer_window (
      offer_window_id,
      company_id,
      window_type,
      generated_at_utc,
      expires_at_utc,
      window_seed,
      generation_context_hash,
      refresh_reason,
      status
    ) VALUES (
      $offer_window_id,
      $company_id,
      'contract_board',
      $generated_at_utc,
      $expires_at_utc,
      $window_seed,
      $generation_context_hash,
      $refresh_reason,
      'active'
    )`,
    {
      $offer_window_id: offerWindowId,
      $company_id: companyId,
      $generated_at_utc: generatedBoard.generatedAtUtc,
      $expires_at_utc: generatedBoard.expiresAtUtc,
      $window_seed: generatedBoard.windowSeed,
      $generation_context_hash: generatedBoard.generationContextHash,
      $refresh_reason: refreshReason,
    },
  );
}

function insertGeneratedOffer(
  saveDatabase: SqliteFileDatabase,
  offerWindowId: string,
  companyId: string,
  generatedOffer: GeneratedContractOfferInput,
): void {
  saveDatabase.run(
    `INSERT INTO contract_offer (
      contract_offer_id,
      offer_window_id,
      company_id,
      archetype,
      origin_airport_id,
      destination_airport_id,
      volume_type,
      passenger_count,
      cargo_weight_lb,
      earliest_start_utc,
      latest_completion_utc,
      payout_amount,
      penalty_model_json,
      likely_role,
      difficulty_band,
      explanation_metadata_json,
      generated_seed,
      offer_status
    ) VALUES (
      $contract_offer_id,
      $offer_window_id,
      $company_id,
      $archetype,
      $origin_airport_id,
      $destination_airport_id,
      $volume_type,
      $passenger_count,
      $cargo_weight_lb,
      $earliest_start_utc,
      $latest_completion_utc,
      $payout_amount,
      $penalty_model_json,
      $likely_role,
      $difficulty_band,
      $explanation_metadata_json,
      $generated_seed,
      'available'
    )`,
    {
      $contract_offer_id: createPrefixedId("offer"),
      $offer_window_id: offerWindowId,
      $company_id: companyId,
      $archetype: generatedOffer.archetype,
      $origin_airport_id: generatedOffer.originAirportId,
      $destination_airport_id: generatedOffer.destinationAirportId,
      $volume_type: generatedOffer.volumeType,
      $passenger_count: generatedOffer.passengerCount ?? null,
      $cargo_weight_lb: generatedOffer.cargoWeightLb ?? null,
      $earliest_start_utc: generatedOffer.earliestStartUtc,
      $latest_completion_utc: generatedOffer.latestCompletionUtc,
      $payout_amount: generatedOffer.payoutAmount,
      $penalty_model_json: JSON.stringify(generatedOffer.penaltyModel),
      $likely_role: generatedOffer.likelyRole,
      $difficulty_band: generatedOffer.difficultyBand,
      $explanation_metadata_json: JSON.stringify(generatedOffer.explanationMetadata),
      $generated_seed: generatedOffer.generatedSeed,
    },
  );
}

function runFullRefresh(
  saveDatabase: SqliteFileDatabase,
  companyId: string,
  existingActiveWindows: ActiveWindowRow[],
  generatedBoard: GeneratedContractBoard,
  refreshReason: string,
): RefreshExecutionResult {
  const offerWindowId = createPrefixedId("window");

  for (const existingWindow of existingActiveWindows) {
    markWindowExpired(saveDatabase, existingWindow.offerWindowId);
  }

  insertOfferWindow(saveDatabase, offerWindowId, companyId, generatedBoard, refreshReason);

  for (const generatedOffer of generatedBoard.offers) {
    insertGeneratedOffer(saveDatabase, offerWindowId, companyId, generatedOffer);
  }

  return {
    offerWindowId,
    rollingRefresh: false,
    offerCount: generatedBoard.offers.length,
    addedOfferCount: generatedBoard.offers.length,
    retainedOfferCount: 0,
    expiredOfferCount: 0,
  };
}

function runRollingRefresh(
  saveDatabase: SqliteFileDatabase,
  companyId: string,
  currentTimeUtc: string,
  activeWindow: ActiveWindowRow,
  extraActiveWindows: ActiveWindowRow[],
  generatedBoard: GeneratedContractBoard,
  refreshReason: string,
): RefreshExecutionResult {
  for (const extraWindow of extraActiveWindows) {
    markWindowExpired(saveDatabase, extraWindow.offerWindowId);
  }

  const expiredOfferCountRow = saveDatabase.getOne<{ offerCount: number }>(
    `SELECT COUNT(*) AS offerCount
     FROM contract_offer
     WHERE offer_window_id = $offer_window_id
       AND offer_status IN ('available', 'shortlisted')
       AND latest_completion_utc <= $current_time_utc`,
    {
      $offer_window_id: activeWindow.offerWindowId,
      $current_time_utc: currentTimeUtc,
    },
  );
  const expiredOfferCount = expiredOfferCountRow?.offerCount ?? 0;

  saveDatabase.run(
    `UPDATE contract_offer
     SET offer_status = 'expired'
     WHERE offer_window_id = $offer_window_id
       AND offer_status IN ('available', 'shortlisted')
       AND latest_completion_utc <= $current_time_utc`,
    {
      $offer_window_id: activeWindow.offerWindowId,
      $current_time_utc: currentTimeUtc,
    },
  );

  const survivingOffers = saveDatabase.all<ActiveOfferRow>(
    `SELECT
      contract_offer_id AS contractOfferId,
      archetype AS archetype,
      origin_airport_id AS originAirportId,
      destination_airport_id AS destinationAirportId,
      volume_type AS volumeType,
      offer_status AS offerStatus,
      latest_completion_utc AS latestCompletionUtc
     FROM contract_offer
     WHERE offer_window_id = $offer_window_id
       AND offer_status IN ('available', 'shortlisted')
       AND latest_completion_utc > $current_time_utc`,
    {
      $offer_window_id: activeWindow.offerWindowId,
      $current_time_utc: currentTimeUtc,
    },
  );

  const refillTargetCount = Math.max(0, generatedBoard.offers.length - survivingOffers.length);
  const seenGeneratedSeeds = new Set<string>();
  const seenSignatures = new Set(survivingOffers.map((offer) => buildPersistedOfferSignature(offer)));
  const refillOffers: GeneratedContractOfferInput[] = [];

  const appendRefillOffers = (allowSignatureDuplicates: boolean): void => {
    for (const generatedOffer of generatedBoard.offers) {
      if (refillOffers.length >= refillTargetCount) {
        return;
      }

      if (seenGeneratedSeeds.has(generatedOffer.generatedSeed)) {
        continue;
      }

      const signature = buildGeneratedOfferSignature(generatedOffer);
      if (!allowSignatureDuplicates && seenSignatures.has(signature)) {
        continue;
      }

      seenGeneratedSeeds.add(generatedOffer.generatedSeed);
      seenSignatures.add(signature);
      refillOffers.push(generatedOffer);
    }
  };

  appendRefillOffers(false);
  if (refillOffers.length < refillTargetCount) {
    appendRefillOffers(true);
  }

  saveDatabase.run(
    `UPDATE offer_window
     SET generated_at_utc = $generated_at_utc,
         expires_at_utc = $expires_at_utc,
         window_seed = $window_seed,
         generation_context_hash = $generation_context_hash,
         refresh_reason = $refresh_reason,
         status = 'active'
     WHERE offer_window_id = $offer_window_id`,
    {
      $offer_window_id: activeWindow.offerWindowId,
      $generated_at_utc: generatedBoard.generatedAtUtc,
      $expires_at_utc: generatedBoard.expiresAtUtc,
      $window_seed: generatedBoard.windowSeed,
      $generation_context_hash: generatedBoard.generationContextHash,
      $refresh_reason: refreshReason,
    },
  );

  for (const generatedOffer of refillOffers) {
    insertGeneratedOffer(saveDatabase, activeWindow.offerWindowId, companyId, generatedOffer);
  }

  return {
    offerWindowId: activeWindow.offerWindowId,
    rollingRefresh: true,
    offerCount: survivingOffers.length + refillOffers.length,
    addedOfferCount: refillOffers.length,
    retainedOfferCount: survivingOffers.length,
    expiredOfferCount,
  };
}

// Regenerates the current contract market from the company's footprint and replaces or replenishes the active commercial board.
export async function handleRefreshContractBoard(
  command: RefreshContractBoardCommand,
  dependencies: RefreshContractBoardDependencies,
): Promise<CommandResult> {
  const hardBlockers: string[] = [];
  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);

  if (!companyContext) {
    hardBlockers.push(`Save ${command.saveId} does not have an active company.`);
  }

  const homeBaseAirport = companyContext
    ? dependencies.airportReference.findAirport(companyContext.homeBaseAirportId)
    : null;

  if (!homeBaseAirport) {
    hardBlockers.push("A valid home-base airport is required before generating contracts.");
  }

  if (homeBaseAirport && !homeBaseAirport.accessibleNow) {
    hardBlockers.push(`Home base ${homeBaseAirport.airportKey} is not currently accessible.`);
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

  const refreshReason = command.payload.refreshReason ?? "manual";
  const aircraftLocationRows = dependencies.saveDatabase.all<AircraftLocationRow>(
    `SELECT DISTINCT current_airport_id AS currentAirportId
     FROM company_aircraft
     WHERE company_id = $company_id
       AND delivery_state IN ('delivered', 'available')`,
    { $company_id: companyContext!.companyId },
  );

  const footprintOrigins = [
    companyContext!.homeBaseAirportId,
    ...companyContext!.baseAirportIds,
    ...aircraftLocationRows.map((row) => row.currentAirportId),
  ]
    .map((airportId) => dependencies.airportReference.findAirport(airportId))
    .filter((airport): airport is NonNullable<typeof airport> => airport != null && airport.accessibleNow);

  const candidateAirports = dependencies.airportReference.listContractMarketAirports();
  const generatedBoard = generateContractBoard(companyContext!, footprintOrigins, candidateAirports, refreshReason);

  const existingActiveWindows = dependencies.saveDatabase.all<ActiveWindowRow>(
    `SELECT
       offer_window_id AS offerWindowId,
       generated_at_utc AS generatedAtUtc,
       generation_context_hash AS generationContextHash
     FROM offer_window
     WHERE company_id = $company_id
       AND window_type = 'contract_board'
       AND status = 'active'
     ORDER BY generated_at_utc DESC, offer_window_id DESC`,
    { $company_id: companyContext!.companyId },
  );

  if (generatedBoard.offers.length === 0 && existingActiveWindows.length === 0) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: ["No eligible contract offers could be generated for the current company state."],
      hardBlockers: ["No eligible contract offers could be generated for the current company state."],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const primaryActiveWindow = existingActiveWindows[0] ?? null;
  const rollingRefreshEligible = primaryActiveWindow != null
    && isCurrentContractBoardGenerationContextHash(primaryActiveWindow.generationContextHash);
  const eventLogEntryId = createPrefixedId("event");
  let refreshExecution!: RefreshExecutionResult;

  dependencies.saveDatabase.transaction(() => {
    refreshExecution = rollingRefreshEligible
      ? runRollingRefresh(
          dependencies.saveDatabase,
          companyContext!.companyId,
          companyContext!.currentTimeUtc,
          primaryActiveWindow,
          existingActiveWindows.slice(1),
          generatedBoard,
          refreshReason,
        )
      : runFullRefresh(
          dependencies.saveDatabase,
          companyContext!.companyId,
          existingActiveWindows,
          generatedBoard,
          refreshReason,
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
        $company_id: companyContext!.companyId,
        $event_time_utc: companyContext!.currentTimeUtc,
        $event_type: "contract_board_refreshed",
        $source_object_type: "offer_window",
        $source_object_id: refreshExecution.offerWindowId,
        $severity: "info",
        $message: refreshExecution.rollingRefresh
          ? `Contract board rolled forward with ${refreshExecution.addedOfferCount} new offers and ${refreshExecution.retainedOfferCount} retained live offers.`
          : `Contract board rebuilt with ${refreshExecution.addedOfferCount} offers.`,
        $metadata_json: JSON.stringify({
          refreshReason,
          homeBaseAirportId: companyContext!.homeBaseAirportId,
          originAirportIds: footprintOrigins.map((airport) => airport.airportKey),
          rollingRefresh: refreshExecution.rollingRefresh,
          retainedOfferCount: refreshExecution.retainedOfferCount,
          expiredOfferCount: refreshExecution.expiredOfferCount,
          addedOfferCount: refreshExecution.addedOfferCount,
          offerCount: refreshExecution.offerCount,
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
        $payload_json: JSON.stringify({
          refreshReason,
          offerWindowId: refreshExecution.offerWindowId,
          rollingRefresh: refreshExecution.rollingRefresh,
          retainedOfferCount: refreshExecution.retainedOfferCount,
          expiredOfferCount: refreshExecution.expiredOfferCount,
          addedOfferCount: refreshExecution.addedOfferCount,
          offerCount: refreshExecution.offerCount,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [refreshExecution.offerWindowId],
    validationMessages: [
      refreshExecution.rollingRefresh
        ? `Rolled contract board forward with ${refreshExecution.addedOfferCount} new offers and ${refreshExecution.retainedOfferCount} retained offers.`
        : `Generated ${refreshExecution.offerCount} contract offers.`,
    ],
    hardBlockers: [],
    warnings: [],
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [],
    metadata: {
      offerWindowId: refreshExecution.offerWindowId,
      offerCount: refreshExecution.offerCount,
      refreshReason,
      rollingRefresh: refreshExecution.rollingRefresh,
      retainedOfferCount: refreshExecution.retainedOfferCount,
      expiredOfferCount: refreshExecution.expiredOfferCount,
      addedOfferCount: refreshExecution.addedOfferCount,
    },
  };
}
