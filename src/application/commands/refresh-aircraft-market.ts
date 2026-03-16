import { generateAircraftMarket } from "../aircraft/aircraft-market-generator.js";
import type { CommandResult, RefreshAircraftMarketCommand } from "./types.js";
import { createPrefixedId } from "./utils.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AirportReferenceRepository } from "../../infrastructure/reference/airport-reference.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";

interface RefreshAircraftMarketDependencies {
  saveDatabase: SqliteFileDatabase;
  airportReference: AirportReferenceRepository;
  aircraftReference: AircraftReferenceRepository;
}

interface ActiveWindowRow extends Record<string, unknown> {
  offerWindowId: string;
}

interface AircraftLocationRow extends Record<string, unknown> {
  currentAirportId: string;
  aircraftModelId: string;
}

interface PreviousOfferRow extends Record<string, unknown> {
  aircraftModelId: string;
  listingCount: number;
}

export async function handleRefreshAircraftMarket(
  command: RefreshAircraftMarketCommand,
  dependencies: RefreshAircraftMarketDependencies,
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
    hardBlockers.push("A valid home-base airport is required before generating the aircraft market.");
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
    `SELECT current_airport_id AS currentAirportId, aircraft_model_id AS aircraftModelId
    FROM company_aircraft
    WHERE company_id = $company_id
      AND delivery_state IN ('delivered', 'available')`,
    { $company_id: companyContext!.companyId },
  );
  const previousOfferRows = dependencies.saveDatabase.all<PreviousOfferRow>(
    `SELECT
      ao.aircraft_model_id AS aircraftModelId,
      COUNT(*) AS listingCount
    FROM offer_window AS ow
    JOIN aircraft_offer AS ao ON ao.offer_window_id = ow.offer_window_id
    WHERE ow.company_id = $company_id
      AND ow.window_type = 'aircraft_market'
    GROUP BY ao.aircraft_model_id`,
    { $company_id: companyContext!.companyId },
  );

  const footprintAirports = [
    companyContext!.homeBaseAirportId,
    ...companyContext!.baseAirportIds,
    ...aircraftLocationRows.map((row) => row.currentAirportId),
  ]
    .map((airportId) => dependencies.airportReference.findAirport(airportId))
    .filter((airport): airport is NonNullable<typeof airport> => airport != null && airport.accessibleNow);
  const aircraftModels = dependencies.aircraftReference.listModels();
  const marketAirports = dependencies.airportReference.listContractMarketAirports();
  const defaultLayoutsByModelId = new Map(
    aircraftModels.map((model) => [model.modelId, dependencies.aircraftReference.findDefaultLayoutForModel(model.modelId)]),
  );
  const ownedModels = aircraftLocationRows
    .map((row) => dependencies.aircraftReference.findModel(row.aircraftModelId))
    .filter((model): model is NonNullable<typeof model> => model != null);
  const previousModelCounts = new Map(previousOfferRows.map((row) => [row.aircraftModelId, row.listingCount]));

  const generatedMarket = generateAircraftMarket({
    companyContext: companyContext!,
    homeBaseAirport: homeBaseAirport!,
    footprintAirports,
    candidateAirports: marketAirports,
    aircraftModels,
    defaultLayoutsByModelId,
    ownedModelIds: new Set(ownedModels.map((model) => model.modelId)),
    ownedRolePools: new Set(ownedModels.map((model) => model.marketRolePool)),
    ownedPilotQualifications: new Set(ownedModels.map((model) => model.pilotQualificationGroup)),
    previousModelCounts,
  });

  if (generatedMarket.offers.length <= 0) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: ["No eligible aircraft offers could be generated for the current company state."],
      hardBlockers: ["No eligible aircraft offers could be generated for the current company state."],
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
      AND window_type = 'aircraft_market'
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
        `UPDATE aircraft_offer
        SET offer_status = 'expired'
        WHERE offer_window_id = $offer_window_id
          AND offer_status = 'available'`,
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
        'aircraft_market',
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
        $generated_at_utc: generatedMarket.generatedAtUtc,
        $expires_at_utc: generatedMarket.expiresAtUtc,
        $window_seed: generatedMarket.windowSeed,
        $generation_context_hash: generatedMarket.generationContextHash,
        $refresh_reason: refreshReason,
      },
    );

    for (const generatedOffer of generatedMarket.offers) {
      dependencies.saveDatabase.run(
        `INSERT INTO aircraft_offer (
          aircraft_offer_id,
          offer_window_id,
          company_id,
          aircraft_model_id,
          active_cabin_layout_id,
          listing_type,
          current_airport_id,
          registration,
          display_name,
          condition_value,
          condition_band_input,
          status_input,
          airframe_hours_total,
          airframe_cycles_total,
          hours_since_inspection,
          cycles_since_inspection,
          hours_to_service,
          maintenance_state_input,
          aog_flag,
          asking_purchase_price_amount,
          finance_terms_json,
          lease_terms_json,
          explanation_metadata_json,
          generated_seed,
          offer_status
        ) VALUES (
          $aircraft_offer_id,
          $offer_window_id,
          $company_id,
          $aircraft_model_id,
          $active_cabin_layout_id,
          $listing_type,
          $current_airport_id,
          $registration,
          $display_name,
          $condition_value,
          $condition_band_input,
          $status_input,
          $airframe_hours_total,
          $airframe_cycles_total,
          $hours_since_inspection,
          $cycles_since_inspection,
          $hours_to_service,
          $maintenance_state_input,
          $aog_flag,
          $asking_purchase_price_amount,
          $finance_terms_json,
          $lease_terms_json,
          $explanation_metadata_json,
          $generated_seed,
          'available'
        )`,
        {
          $aircraft_offer_id: createPrefixedId("air_offer"),
          $offer_window_id: offerWindowId,
          $company_id: companyContext!.companyId,
          $aircraft_model_id: generatedOffer.aircraftModelId,
          $active_cabin_layout_id: generatedOffer.activeCabinLayoutId ?? null,
          $listing_type: generatedOffer.listingType,
          $current_airport_id: generatedOffer.currentAirportId,
          $registration: generatedOffer.registration,
          $display_name: generatedOffer.displayName,
          $condition_value: generatedOffer.conditionValue,
          $condition_band_input: generatedOffer.conditionBandInput,
          $status_input: generatedOffer.statusInput,
          $airframe_hours_total: generatedOffer.airframeHoursTotal,
          $airframe_cycles_total: generatedOffer.airframeCyclesTotal,
          $hours_since_inspection: generatedOffer.hoursSinceInspection,
          $cycles_since_inspection: generatedOffer.cyclesSinceInspection,
          $hours_to_service: generatedOffer.hoursToService,
          $maintenance_state_input: generatedOffer.maintenanceStateInput,
          $aog_flag: generatedOffer.aogFlag ? 1 : 0,
          $asking_purchase_price_amount: generatedOffer.askingPurchasePriceAmount,
          $finance_terms_json: JSON.stringify(generatedOffer.financeTerms),
          $lease_terms_json: JSON.stringify(generatedOffer.leaseTerms),
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
        $event_type: "aircraft_market_refreshed",
        $source_object_type: "offer_window",
        $source_object_id: offerWindowId,
        $severity: "info",
        $message: `Aircraft market refreshed with ${generatedMarket.offers.length} listings.`,
        $metadata_json: JSON.stringify({
          refreshReason,
          homeBaseAirportId: companyContext!.homeBaseAirportId,
          offerCount: generatedMarket.offers.length,
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
          offerCount: generatedMarket.offers.length,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [offerWindowId],
    validationMessages: [`Generated ${generatedMarket.offers.length} aircraft listings.`],
    hardBlockers: [],
    warnings: [],
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [],
    metadata: {
      offerWindowId,
      offerCount: generatedMarket.offers.length,
      refreshReason,
    },
  };
}
