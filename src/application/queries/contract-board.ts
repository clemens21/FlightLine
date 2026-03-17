/*
 * Builds the contract board read model from persisted save data and reference lookups when needed.
 * These query modules intentionally stay read-only so the UI and tests can ask for consistent snapshots without triggering side effects.
 */

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

interface ContractOfferRow extends Record<string, unknown> {
  contractOfferId: string;
  offerWindowId: string;
  companyId: string;
  archetype: string;
  originAirportId: string;
  destinationAirportId: string;
  volumeType: "passenger" | "cargo";
  passengerCount: number | null;
  cargoWeightLb: number | null;
  earliestStartUtc: string;
  latestCompletionUtc: string;
  payoutAmount: number;
  penaltyModelJson: string;
  likelyRole: string;
  difficultyBand: string;
  explanationMetadataJson: string;
  generatedSeed: string;
  offerStatus: OfferStatus;
}

export interface ContractBoardOfferView {
  contractOfferId: string;
  archetype: string;
  originAirportId: string;
  destinationAirportId: string;
  volumeType: "passenger" | "cargo";
  passengerCount: number | undefined;
  cargoWeightLb: number | undefined;
  earliestStartUtc: string;
  latestCompletionUtc: string;
  payoutAmount: number;
  penaltyModel: JsonObject;
  likelyRole: string;
  difficultyBand: string;
  explanationMetadata: JsonObject;
  generatedSeed: string;
  offerStatus: OfferStatus;
}

export interface ContractBoardView {
  offerWindowId: string;
  companyId: string;
  generatedAtUtc: string;
  expiresAtUtc: string;
  windowSeed: string;
  generationContextHash: string;
  refreshReason: string;
  status: string;
  offers: ContractBoardOfferView[];
}

function parseJsonObject(rawValue: string): JsonObject {
  return JSON.parse(rawValue) as JsonObject;
}

export function loadActiveContractBoard(
  saveDatabase: SqliteFileDatabase,
  saveId: string,
): ContractBoardView | null {
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
      AND window_type = 'contract_board'
      AND status = 'active'
    ORDER BY generated_at_utc DESC
    LIMIT 1`,
    { $company_id: companyContext.companyId },
  );

  if (!windowRow) {
    return null;
  }

  const offerRows = saveDatabase.all<ContractOfferRow>(
    `SELECT
      contract_offer_id AS contractOfferId,
      offer_window_id AS offerWindowId,
      company_id AS companyId,
      archetype AS archetype,
      origin_airport_id AS originAirportId,
      destination_airport_id AS destinationAirportId,
      volume_type AS volumeType,
      passenger_count AS passengerCount,
      cargo_weight_lb AS cargoWeightLb,
      earliest_start_utc AS earliestStartUtc,
      latest_completion_utc AS latestCompletionUtc,
      payout_amount AS payoutAmount,
      penalty_model_json AS penaltyModelJson,
      likely_role AS likelyRole,
      difficulty_band AS difficultyBand,
      explanation_metadata_json AS explanationMetadataJson,
      generated_seed AS generatedSeed,
      offer_status AS offerStatus
    FROM contract_offer
    WHERE offer_window_id = $offer_window_id
    ORDER BY payout_amount DESC, contract_offer_id ASC`,
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
      contractOfferId: offer.contractOfferId,
      archetype: offer.archetype,
      originAirportId: offer.originAirportId,
      destinationAirportId: offer.destinationAirportId,
      volumeType: offer.volumeType,
      passengerCount: offer.passengerCount ?? undefined,
      cargoWeightLb: offer.cargoWeightLb ?? undefined,
      earliestStartUtc: offer.earliestStartUtc,
      latestCompletionUtc: offer.latestCompletionUtc,
      payoutAmount: offer.payoutAmount,
      penaltyModel: parseJsonObject(offer.penaltyModelJson),
      likelyRole: offer.likelyRole,
      difficultyBand: offer.difficultyBand,
      explanationMetadata: parseJsonObject(offer.explanationMetadataJson),
      generatedSeed: offer.generatedSeed,
      offerStatus: offer.offerStatus,
    })),
  };
}
