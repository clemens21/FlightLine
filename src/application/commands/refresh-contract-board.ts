import type { CommandResult, RefreshContractBoardCommand } from "./types.js";
import { createPrefixedId } from "./utils.js";
import { generateContractBoard } from "../contracts/contract-board-generator.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AirportReferenceRepository } from "../../infrastructure/reference/airport-reference.js";

interface RefreshContractBoardDependencies {
  saveDatabase: SqliteFileDatabase;
  airportReference: AirportReferenceRepository;
}

interface ActiveWindowRow extends Record<string, unknown> {
  offerWindowId: string;
}

export async function handleRefreshContractBoard(
  command: RefreshContractBoardCommand,
  dependencies: RefreshContractBoardDependencies,
): Promise<CommandResult> {
  const hardBlockers: string[] = [];
  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);

  if (!companyContext) {
    hardBlockers.push(`Save ${command.saveId} does not have an active company.`);
  }

  const originAirport = companyContext
    ? dependencies.airportReference.findAirport(companyContext.homeBaseAirportId)
    : null;

  if (!originAirport) {
    hardBlockers.push("A valid home-base airport is required before generating contracts.");
  }

  if (originAirport && !originAirport.accessibleNow) {
    hardBlockers.push(`Home base ${originAirport.airportKey} is not currently accessible.`);
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
  const candidateAirports = dependencies.airportReference.listContractDestinations(originAirport!);
  const generatedBoard = generateContractBoard(companyContext!, originAirport!, candidateAirports, refreshReason);

  if (generatedBoard.offers.length === 0) {
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

  const offerWindowId = createPrefixedId("window");
  const eventLogEntryId = createPrefixedId("event");
  const existingActiveWindows = dependencies.saveDatabase.all<ActiveWindowRow>(
    `SELECT offer_window_id AS offerWindowId
    FROM offer_window
    WHERE company_id = $company_id
      AND window_type = 'contract_board'
      AND status = 'active'`,
    { $company_id: companyContext!.companyId },
  );

  dependencies.saveDatabase.transaction(() => {
    for (const existingWindow of existingActiveWindows) {
      dependencies.saveDatabase.run(
        `UPDATE offer_window
        SET status = 'expired'
        WHERE offer_window_id = $offer_window_id`,
        { $offer_window_id: existingWindow.offerWindowId },
      );
      dependencies.saveDatabase.run(
        `UPDATE contract_offer
        SET offer_status = 'expired'
        WHERE offer_window_id = $offer_window_id
          AND offer_status IN ('available', 'shortlisted')`,
        { $offer_window_id: existingWindow.offerWindowId },
      );
    }

    dependencies.saveDatabase.run(
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
        $company_id: companyContext!.companyId,
        $generated_at_utc: generatedBoard.generatedAtUtc,
        $expires_at_utc: generatedBoard.expiresAtUtc,
        $window_seed: generatedBoard.windowSeed,
        $generation_context_hash: generatedBoard.generationContextHash,
        $refresh_reason: refreshReason,
      },
    );

    for (const generatedOffer of generatedBoard.offers) {
      dependencies.saveDatabase.run(
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
          $company_id: companyContext!.companyId,
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
        $source_object_id: offerWindowId,
        $severity: "info",
        $message: `Contract board refreshed with ${generatedBoard.offers.length} offers.`,
        $metadata_json: JSON.stringify({
          refreshReason,
          homeBaseAirportId: companyContext!.homeBaseAirportId,
          offerCount: generatedBoard.offers.length,
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
          offerWindowId,
          offerCount: generatedBoard.offers.length,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [offerWindowId],
    validationMessages: [`Generated ${generatedBoard.offers.length} contract offers.`],
    hardBlockers: [],
    warnings: [],
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [],
    metadata: {
      offerWindowId,
      offerCount: generatedBoard.offers.length,
      refreshReason,
    },
  };
}
