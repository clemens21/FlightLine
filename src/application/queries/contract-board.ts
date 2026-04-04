/*
 * Builds the contract board read model from persisted save data and reference lookups when needed.
 * These query modules intentionally stay read-only so the UI and tests can ask for consistent snapshots without triggering side effects.
 */

import type { JsonObject } from "../../domain/common/primitives.js";
import { resolveDynamicContractOfferPayout } from "../../domain/contracts/urgency.js";
import type { OfferStatus } from "../../domain/offers/types.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import { loadActiveCompanyOfferWindow } from "./offer-window-query.js";
import { nullToUndefined, parseJsonObject } from "./query-json.js";

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

export function loadActiveContractBoard(
  saveDatabase: SqliteFileDatabase,
  saveId: string,
): ContractBoardView | null {
  const offerWindow = loadActiveCompanyOfferWindow(saveDatabase, saveId, "contract_board");

  if (!offerWindow) {
    return null;
  }
  const { windowRow } = offerWindow;
  const currentTimeUtc = offerWindow.companyContext.currentTimeUtc;

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
      AND offer_status <> 'expired'
      AND NOT (
        offer_status IN ('available', 'shortlisted')
        AND latest_completion_utc <= $current_time_utc
      )
    ORDER BY payout_amount DESC, contract_offer_id ASC`,
    {
      $offer_window_id: windowRow.offerWindowId,
      $current_time_utc: currentTimeUtc,
    },
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
    offers: offerRows.map((offer) => {
      const explanationMetadata = parseJsonObject(offer.explanationMetadataJson);
      const payoutAmount = ["available", "shortlisted"].includes(offer.offerStatus)
        ? resolveDynamicContractOfferPayout(
            offer.payoutAmount,
            explanationMetadata,
            offer.latestCompletionUtc,
            currentTimeUtc,
          )
        : offer.payoutAmount;

      return {
        contractOfferId: offer.contractOfferId,
        archetype: offer.archetype,
        originAirportId: offer.originAirportId,
        destinationAirportId: offer.destinationAirportId,
        volumeType: offer.volumeType,
        passengerCount: nullToUndefined(offer.passengerCount),
        cargoWeightLb: nullToUndefined(offer.cargoWeightLb),
        earliestStartUtc: offer.earliestStartUtc,
        latestCompletionUtc: offer.latestCompletionUtc,
        payoutAmount,
        penaltyModel: parseJsonObject(offer.penaltyModelJson),
        likelyRole: offer.likelyRole,
        difficultyBand: offer.difficultyBand,
        explanationMetadata,
        generatedSeed: offer.generatedSeed,
        offerStatus: offer.offerStatus,
      };
    }),
  };
}
