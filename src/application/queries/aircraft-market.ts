import type { JsonObject } from "../../domain/common/primitives.js";
import type { OfferStatus } from "../../domain/offers/types.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import { loadActiveCompanyContext } from "./company-state.js";

interface OfferWindowRow extends Record<string, unknown> {
  offerWindowId: string;
  companyId: string;
  generatedAtUtc: string;
  expiresAtUtc: string;
  windowSeed: string;
  generationContextHash: string;
  refreshReason: string;
  status: string;
}

interface AircraftOfferRow extends Record<string, unknown> {
  aircraftOfferId: string;
  aircraftModelId: string;
  activeCabinLayoutId: string | null;
  listingType: "new" | "used";
  currentAirportId: string;
  registration: string;
  displayName: string;
  conditionValue: number;
  conditionBandInput: string;
  statusInput: string;
  airframeHoursTotal: number;
  airframeCyclesTotal: number;
  hoursSinceInspection: number;
  cyclesSinceInspection: number;
  hoursToService: number;
  maintenanceStateInput: string;
  aogFlag: number;
  askingPurchasePriceAmount: number;
  financeTermsJson: string;
  leaseTermsJson: string;
  explanationMetadataJson: string;
  generatedSeed: string;
  offerStatus: OfferStatus;
}

export interface AircraftOfferTermsView {
  upfrontPaymentAmount: number;
  recurringPaymentAmount?: number;
  paymentCadence?: "weekly" | "monthly";
  termMonths?: number;
  rateBandOrApr?: number;
}

export interface AircraftOfferView {
  aircraftOfferId: string;
  aircraftModelId: string;
  activeCabinLayoutId: string | undefined;
  listingType: "new" | "used";
  currentAirportId: string;
  registration: string;
  displayName: string;
  conditionValue: number;
  conditionBandInput: string;
  statusInput: string;
  airframeHoursTotal: number;
  airframeCyclesTotal: number;
  hoursSinceInspection: number;
  cyclesSinceInspection: number;
  hoursToService: number;
  maintenanceStateInput: string;
  aogFlag: boolean;
  askingPurchasePriceAmount: number;
  financeTerms: AircraftOfferTermsView;
  leaseTerms: AircraftOfferTermsView;
  explanationMetadata: JsonObject;
  generatedSeed: string;
  offerStatus: OfferStatus;
}

export interface AircraftMarketView {
  offerWindowId: string;
  companyId: string;
  generatedAtUtc: string;
  expiresAtUtc: string;
  windowSeed: string;
  generationContextHash: string;
  refreshReason: string;
  status: string;
  offers: AircraftOfferView[];
}

function parseJsonObject(rawValue: string): JsonObject {
  return JSON.parse(rawValue) as JsonObject;
}

function parseTerms(rawValue: string): AircraftOfferTermsView {
  return JSON.parse(rawValue) as AircraftOfferTermsView;
}

export function loadActiveAircraftMarket(
  saveDatabase: SqliteFileDatabase,
  saveId: string,
): AircraftMarketView | null {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);

  if (!companyContext) {
    return null;
  }

  const windowRow = saveDatabase.getOne<OfferWindowRow>(
    `SELECT
      offer_window_id AS offerWindowId,
      company_id AS companyId,
      generated_at_utc AS generatedAtUtc,
      expires_at_utc AS expiresAtUtc,
      window_seed AS windowSeed,
      generation_context_hash AS generationContextHash,
      refresh_reason AS refreshReason,
      status AS status
    FROM offer_window
    WHERE company_id = $company_id
      AND window_type = 'aircraft_market'
      AND status = 'active'
    ORDER BY generated_at_utc DESC
    LIMIT 1`,
    { $company_id: companyContext.companyId },
  );

  if (!windowRow) {
    return null;
  }

  const offerRows = saveDatabase.all<AircraftOfferRow>(
    `SELECT
      aircraft_offer_id AS aircraftOfferId,
      aircraft_model_id AS aircraftModelId,
      active_cabin_layout_id AS activeCabinLayoutId,
      listing_type AS listingType,
      current_airport_id AS currentAirportId,
      registration AS registration,
      display_name AS displayName,
      condition_value AS conditionValue,
      condition_band_input AS conditionBandInput,
      status_input AS statusInput,
      airframe_hours_total AS airframeHoursTotal,
      airframe_cycles_total AS airframeCyclesTotal,
      hours_since_inspection AS hoursSinceInspection,
      cycles_since_inspection AS cyclesSinceInspection,
      hours_to_service AS hoursToService,
      maintenance_state_input AS maintenanceStateInput,
      aog_flag AS aogFlag,
      asking_purchase_price_amount AS askingPurchasePriceAmount,
      finance_terms_json AS financeTermsJson,
      lease_terms_json AS leaseTermsJson,
      explanation_metadata_json AS explanationMetadataJson,
      generated_seed AS generatedSeed,
      offer_status AS offerStatus
    FROM aircraft_offer
    WHERE offer_window_id = $offer_window_id
    ORDER BY asking_purchase_price_amount ASC, aircraft_offer_id ASC`,
    { $offer_window_id: windowRow.offerWindowId },
  );

  return {
    offerWindowId: windowRow.offerWindowId,
    companyId: windowRow.companyId,
    generatedAtUtc: windowRow.generatedAtUtc,
    expiresAtUtc: windowRow.expiresAtUtc,
    windowSeed: windowRow.windowSeed,
    generationContextHash: windowRow.generationContextHash,
    refreshReason: windowRow.refreshReason,
    status: windowRow.status,
    offers: offerRows.map((offer) => ({
      aircraftOfferId: offer.aircraftOfferId,
      aircraftModelId: offer.aircraftModelId,
      activeCabinLayoutId: offer.activeCabinLayoutId ?? undefined,
      listingType: offer.listingType,
      currentAirportId: offer.currentAirportId,
      registration: offer.registration,
      displayName: offer.displayName,
      conditionValue: offer.conditionValue,
      conditionBandInput: offer.conditionBandInput,
      statusInput: offer.statusInput,
      airframeHoursTotal: offer.airframeHoursTotal,
      airframeCyclesTotal: offer.airframeCyclesTotal,
      hoursSinceInspection: offer.hoursSinceInspection,
      cyclesSinceInspection: offer.cyclesSinceInspection,
      hoursToService: offer.hoursToService,
      maintenanceStateInput: offer.maintenanceStateInput,
      aogFlag: offer.aogFlag === 1,
      askingPurchasePriceAmount: offer.askingPurchasePriceAmount,
      financeTerms: parseTerms(offer.financeTermsJson),
      leaseTerms: parseTerms(offer.leaseTermsJson),
      explanationMetadata: parseJsonObject(offer.explanationMetadataJson),
      generatedSeed: offer.generatedSeed,
      offerStatus: offer.offerStatus,
    })),
  };
}
