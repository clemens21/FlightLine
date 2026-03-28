/*
 * Keeps the persisted aircraft market aligned with the latest generated market state.
 * It handles offer reuse, expiration, and refresh behavior so the UI can treat the market as stable save data.
 * The generator makes candidate listings; this file decides what actually lives in the save by expiring old offers,
 * preserving unaffected ones, and adding new arrivals as simulated time advances.
 */

import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AirportReferenceRepository } from "../../infrastructure/reference/airport-reference.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import { createPrefixedId } from "../commands/utils.js";
import { generateAircraftMarket } from "./aircraft-market-generator.js";

interface ActiveWindowRow extends Record<string, unknown> {
  offerWindowId: string;
  companyId: string;
  generatedAtUtc: string;
}

interface AircraftLocationRow extends Record<string, unknown> {
  currentAirportId: string;
  aircraftModelId: string;
}

interface PreviousOfferRow extends Record<string, unknown> {
  aircraftModelId: string;
  listingCount: number;
}

interface AvailableCountRow extends Record<string, unknown> {
  countValue: number;
}

interface MarketHistoryRow extends Record<string, unknown> {
  totalOfferCount: number;
  earliestListedAtUtc: string | null;
}

export interface ReconcileAircraftMarketResult {
  success: boolean;
  offerWindowId?: string;
  offerCount: number;
  insertedOfferCount: number;
  expiredOfferCount: number;
  createdWindow: boolean;
  changed: boolean;
  validationMessages: string[];
}

const perpetualWindowDays = 3650;
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const AIRCRAFT_MARKET_SIZE_MULTIPLIER = 3;

// Reuses the current active window when possible and self-heals duplicate active windows if earlier runs left stale state behind.
function loadOrCreateActiveWindow(
  saveDatabase: SqliteFileDatabase,
  companyId: string,
  currentTimeUtc: string,
  refreshReason: string,
): { offerWindowId: string; createdWindow: boolean; generatedAtUtc: string } {
  const existingWindows = saveDatabase.all<ActiveWindowRow>(
    `SELECT
      offer_window_id AS offerWindowId,
      company_id AS companyId,
      generated_at_utc AS generatedAtUtc
    FROM offer_window
    WHERE company_id = $company_id
      AND window_type = 'aircraft_market'
      AND status = 'active'
    ORDER BY generated_at_utc DESC, offer_window_id DESC`,
    { $company_id: companyId },
  );

  if (existingWindows.length > 0) {
    const activeWindow = existingWindows[0]!;

    for (const staleWindow of existingWindows.slice(1)) {
      saveDatabase.run(
        `UPDATE offer_window
         SET status = 'expired'
         WHERE offer_window_id = $offer_window_id`,
        { $offer_window_id: staleWindow.offerWindowId },
      );
      saveDatabase.run(
        `UPDATE aircraft_offer
         SET offer_status = CASE WHEN offer_status = 'available' THEN 'expired' ELSE offer_status END,
             closed_at_utc = COALESCE(closed_at_utc, $closed_at_utc),
             close_reason = COALESCE(close_reason, CASE WHEN offer_status = 'available' THEN 'expired' ELSE close_reason END)
         WHERE offer_window_id = $offer_window_id`,
        {
          $offer_window_id: staleWindow.offerWindowId,
          $closed_at_utc: currentTimeUtc,
        },
      );
    }

    return {
      offerWindowId: activeWindow.offerWindowId,
      createdWindow: false,
      generatedAtUtc: activeWindow.generatedAtUtc,
    };
  }

  const offerWindowId = createPrefixedId("window");
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
      $company_id: companyId,
      $generated_at_utc: currentTimeUtc,
      $expires_at_utc: addUtcDays(currentTimeUtc, perpetualWindowDays),
      $window_seed: `${companyId}_market`,
      $generation_context_hash: `${companyId}_market`,
      $refresh_reason: refreshReason,
    },
  );

  return {
    offerWindowId,
    createdWindow: true,
    generatedAtUtc: currentTimeUtc,
  };
}

function addUtcDays(utcIsoString: string, days: number): string {
  const next = new Date(utcIsoString);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function stableHash(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function randomUnit(seed: string): number {
  return stableHash(seed) / 4294967295;
}

function daysBetweenUtc(startUtc: string, endUtc: string): number {
  const deltaMs = Date.parse(endUtc) - Date.parse(startUtc);
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return 0;
  }

  return deltaMs / millisecondsPerDay;
}

function companyPhaseMarketFactor(companyPhase: string): number {
  switch (companyPhase) {
    case "startup":
      return 0.95;
    case "small_operator":
      return 1.05;
    case "regional_carrier":
      return 1.12;
    case "expanding":
      return 1.2;
    default:
      return 1;
  }
}

function estimateInitialListingCount(params: {
  aircraftModelCount: number;
  rolePoolCount: number;
  candidateAirportCount: number;
  footprintAirportCount: number;
  companyPhase: string;
  progressionTier: number;
}): number {
  const catalogBreadth = params.aircraftModelCount * 0.85;
  const roleBreadth = params.rolePoolCount * 0.9;
  const geographyBreadth = Math.log2(params.candidateAirportCount + 1) * 1.5;
  const progressionFactor = 1 + Math.max(0, params.progressionTier - 1) * 0.08;
  const footprintFactor = 1 + Math.min(0.18, Math.max(0, params.footprintAirportCount - 1) * 0.03);
  const weightedCount =
    (catalogBreadth + roleBreadth + geographyBreadth)
    * companyPhaseMarketFactor(params.companyPhase)
    * progressionFactor
    * footprintFactor;

  return Math.max(params.aircraftModelCount, Math.round(weightedCount)) * AIRCRAFT_MARKET_SIZE_MULTIPLIER;
}

function determineArrivalCount(params: {
  createdWindow: boolean;
  currentTimeUtc: string;
  previousGeneratedAtUtc: string;
  historyRow: MarketHistoryRow | null;
  initialListingCount: number;
  offerWindowId: string;
}): number {
  if (params.createdWindow || (params.historyRow?.totalOfferCount ?? 0) <= 0) {
    return params.initialListingCount;
  }

  const elapsedDays = daysBetweenUtc(params.previousGeneratedAtUtc, params.currentTimeUtc);
  if (elapsedDays <= 0) {
    return 0;
  }

  const earliestListedAtUtc = params.historyRow?.earliestListedAtUtc ?? params.previousGeneratedAtUtc;
  const historyDays = Math.max(daysBetweenUtc(earliestListedAtUtc, params.currentTimeUtc), 1);
  const historicalArrivalRatePerDay = (params.historyRow?.totalOfferCount ?? 0) / historyDays;
  const expectedArrivals = historicalArrivalRatePerDay * elapsedDays;
  const wholeArrivals = Math.floor(expectedArrivals);
  const remainder = expectedArrivals - wholeArrivals;

  if (remainder <= 0) {
    return wholeArrivals;
  }

  const seededBonus = randomUnit(
    `${params.offerWindowId}|${params.previousGeneratedAtUtc}|${params.currentTimeUtc}|${params.historyRow?.totalOfferCount ?? 0}`,
  ) < remainder
    ? 1
    : 0;

  return wholeArrivals + seededBonus;
}

// Expires listings that time has moved past and only adds new arrivals when simulated time has advanced enough to justify them.
export function reconcileAircraftMarket(params: {
  saveDatabase: SqliteFileDatabase;
  saveId: string;
  airportReference: AirportReferenceRepository;
  aircraftReference: AircraftReferenceRepository;
  refreshReason: "scheduled" | "manual" | "bootstrap";
}): ReconcileAircraftMarketResult {
  const companyContext = loadActiveCompanyContext(params.saveDatabase, params.saveId);
  if (!companyContext) {
    return {
      success: false,
      offerCount: 0,
      insertedOfferCount: 0,
      expiredOfferCount: 0,
      createdWindow: false,
      changed: false,
      validationMessages: [`Save ${params.saveId} does not have an active company.`],
    };
  }

  const homeBaseAirport = params.airportReference.findAirport(companyContext.homeBaseAirportId);
  if (!homeBaseAirport || !homeBaseAirport.accessibleNow) {
    return {
      success: false,
      offerCount: 0,
      insertedOfferCount: 0,
      expiredOfferCount: 0,
      createdWindow: false,
      changed: false,
      validationMessages: ["A valid accessible home base is required before generating the aircraft market."],
    };
  }

  let result: ReconcileAircraftMarketResult = {
    success: true,
    offerCount: 0,
    insertedOfferCount: 0,
    expiredOfferCount: 0,
    createdWindow: false,
    changed: false,
    validationMessages: [],
  };

  params.saveDatabase.transaction(() => {
    const { offerWindowId, createdWindow, generatedAtUtc: previousGeneratedAtUtc } = loadOrCreateActiveWindow(
      params.saveDatabase,
      companyContext.companyId,
      companyContext.currentTimeUtc,
      params.refreshReason,
    );

    const expiredOfferIds = params.saveDatabase.all<{ aircraftOfferId: string }>(
      `SELECT aircraft_offer_id AS aircraftOfferId
       FROM aircraft_offer
       WHERE offer_window_id = $offer_window_id
         AND offer_status = 'available'
         AND available_until_utc <= $current_time_utc`,
      {
        $offer_window_id: offerWindowId,
        $current_time_utc: companyContext.currentTimeUtc,
      },
    );

    if (expiredOfferIds.length > 0) {
      params.saveDatabase.run(
        `UPDATE aircraft_offer
         SET offer_status = 'expired',
             closed_at_utc = $closed_at_utc,
             close_reason = 'expired'
         WHERE offer_window_id = $offer_window_id
           AND offer_status = 'available'
           AND available_until_utc <= $current_time_utc`,
        {
          $offer_window_id: offerWindowId,
          $closed_at_utc: companyContext.currentTimeUtc,
          $current_time_utc: companyContext.currentTimeUtc,
        },
      );
    }

    const historyRow = params.saveDatabase.getOne<MarketHistoryRow>(
      `SELECT
         COUNT(*) AS totalOfferCount,
         MIN(listed_at_utc) AS earliestListedAtUtc
       FROM aircraft_offer
       WHERE offer_window_id = $offer_window_id`,
      { $offer_window_id: offerWindowId },
    );

    let insertedOfferCount = 0;
    const aircraftModels = params.aircraftReference.listModels();
    const marketAirports = params.airportReference.listContractMarketAirports();
    const initialListingCount = estimateInitialListingCount({
      aircraftModelCount: aircraftModels.length,
      rolePoolCount: new Set(aircraftModels.map((model) => model.marketRolePool)).size,
      candidateAirportCount: marketAirports.length,
      footprintAirportCount: Math.max(1, companyContext.baseAirportIds.length),
      companyPhase: companyContext.companyPhase,
      progressionTier: companyContext.progressionTier,
    });
    const arrivalCount = determineArrivalCount({
      createdWindow,
      currentTimeUtc: companyContext.currentTimeUtc,
      previousGeneratedAtUtc,
      historyRow,
      initialListingCount,
      offerWindowId,
    });

    if (arrivalCount > 0) {
      const aircraftLocationRows = params.saveDatabase.all<AircraftLocationRow>(
        `SELECT current_airport_id AS currentAirportId, aircraft_model_id AS aircraftModelId
         FROM company_aircraft
         WHERE company_id = $company_id
           AND delivery_state IN ('delivered', 'available')`,
        { $company_id: companyContext.companyId },
      );
      const previousOfferRows = params.saveDatabase.all<PreviousOfferRow>(
        `SELECT
          aircraft_model_id AS aircraftModelId,
          COUNT(*) AS listingCount
         FROM aircraft_offer
         WHERE company_id = $company_id
         GROUP BY aircraft_model_id`,
        { $company_id: companyContext.companyId },
      );

      const footprintAirports = [
        companyContext.homeBaseAirportId,
        ...companyContext.baseAirportIds,
        ...aircraftLocationRows.map((row) => row.currentAirportId),
      ]
        .map((airportId) => params.airportReference.findAirport(airportId))
        .filter((airport): airport is NonNullable<typeof airport> => airport != null && airport.accessibleNow);

      const defaultLayoutsByModelId = new Map(
        aircraftModels.map((model) => [model.modelId, params.aircraftReference.findDefaultLayoutForModel(model.modelId)]),
      );
      const ownedModels = aircraftLocationRows
        .map((row) => params.aircraftReference.findModel(row.aircraftModelId))
        .filter((model): model is NonNullable<typeof model> => model != null);
      const previousModelCounts = new Map(previousOfferRows.map((row) => [row.aircraftModelId, row.listingCount]));

      const generatedMarket = generateAircraftMarket({
        companyContext,
        homeBaseAirport,
        footprintAirports,
        candidateAirports: marketAirports,
        aircraftModels,
        defaultLayoutsByModelId,
        ownedModelIds: new Set(ownedModels.map((model) => model.modelId)),
        ownedRolePools: new Set(ownedModels.map((model) => model.marketRolePool)),
        ownedPilotQualifications: new Set(ownedModels.map((model) => model.pilotQualificationGroup)),
        previousModelCounts,
        targetCount: arrivalCount,
        ageProfile: (historyRow?.totalOfferCount ?? 0) <= 0 ? "initial" : "replacement",
      });

      for (const generatedOffer of generatedMarket.offers) {
        params.saveDatabase.run(
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
            offer_status,
            listed_at_utc,
            available_until_utc,
            closed_at_utc,
            close_reason
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
            'available',
            $listed_at_utc,
            $available_until_utc,
            NULL,
            NULL
          )`,
          {
            $aircraft_offer_id: createPrefixedId("air_offer"),
            $offer_window_id: offerWindowId,
            $company_id: companyContext.companyId,
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
            $listed_at_utc: generatedOffer.listedAtUtc,
            $available_until_utc: generatedOffer.availableUntilUtc,
          },
        );
      }

      insertedOfferCount = generatedMarket.offers.length;
    }

    const updatedAvailableCountRow = params.saveDatabase.getOne<AvailableCountRow>(
      `SELECT COUNT(*) AS countValue
       FROM aircraft_offer
       WHERE offer_window_id = $offer_window_id
         AND offer_status = 'available'`,
      { $offer_window_id: offerWindowId },
    );

    const changed = createdWindow || expiredOfferIds.length > 0 || insertedOfferCount > 0;
    if (changed) {
      params.saveDatabase.run(
        `UPDATE offer_window
         SET generated_at_utc = $generated_at_utc,
             expires_at_utc = $expires_at_utc,
             refresh_reason = $refresh_reason,
             status = 'active'
         WHERE offer_window_id = $offer_window_id`,
        {
          $offer_window_id: offerWindowId,
          $generated_at_utc: companyContext.currentTimeUtc,
          $expires_at_utc: addUtcDays(companyContext.currentTimeUtc, perpetualWindowDays),
          $refresh_reason: params.refreshReason,
        },
      );
    }

    result = {
      success: true,
      offerWindowId,
      offerCount: updatedAvailableCountRow?.countValue ?? 0,
      insertedOfferCount,
      expiredOfferCount: expiredOfferIds.length,
      createdWindow,
      changed,
      validationMessages: changed
        ? [`Aircraft market reconciled to ${String(updatedAvailableCountRow?.countValue ?? 0)} live listings.`]
        : [],
    };
  });

  return result;
}
