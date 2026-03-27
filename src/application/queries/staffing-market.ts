/*
 * Builds the staffing market read model from persisted save data and derives the visible candidate state.
 * The first pass keeps this market pilots-only at the UI layer, but the persistence shape stays generic enough for later staffing offers.
 */

import type { JsonObject } from "../../domain/common/primitives.js";
import type { EmploymentModel, LaborCategory, PilotCertificationCode } from "../../domain/staffing/types.js";
import { parsePilotCertificationsJson } from "../../domain/staffing/pilot-certifications.js";
import { parseStaffingOfferVisibility } from "../../domain/staffing/offer-visibility.js";
import type { PilotVisibleProfile, StaffingPricingExplanation } from "../../domain/staffing/types.js";
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

interface StaffingOfferRow extends Record<string, unknown> {
  staffingOfferId: string;
  laborCategory: LaborCategory;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  coverageUnits: number;
  fixedCostAmount: number;
  variableCostRate: number | null;
  startsAtUtc: string | null;
  endsAtUtc: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  certificationsJson: string | null;
  homeCity: string | null;
  homeRegionCode: string | null;
  homeCountryCode: string | null;
  currentAirportId: string | null;
  explanationMetadataJson: string;
  generatedSeed: string;
  offerStatus: OfferStatus;
  listedAtUtc: string | null;
  availableUntilUtc: string | null;
  closedAtUtc: string | null;
  closeReason: string | null;
}

export type StaffingCandidateState = "available_now" | "available_soon";

export interface StaffingOfferView {
  staffingOfferId: string;
  laborCategory: LaborCategory;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  coverageUnits: number;
  fixedCostAmount: number;
  variableCostRate: number | undefined;
  startsAtUtc: string | undefined;
  endsAtUtc: string | undefined;
  firstName: string | undefined;
  lastName: string | undefined;
  displayName: string | undefined;
  certifications: PilotCertificationCode[];
  homeCity: string | undefined;
  homeRegionCode: string | undefined;
  homeCountryCode: string | undefined;
  currentAirportId: string | undefined;
  candidateState: StaffingCandidateState;
  explanationMetadata: JsonObject;
  candidateProfileId: string | undefined;
  candidateProfile: PilotVisibleProfile | undefined;
  pricingExplanation: StaffingPricingExplanation | undefined;
  generatedSeed: string;
  offerStatus: OfferStatus;
  listedAtUtc: string | undefined;
  availableUntilUtc: string | undefined;
  closedAtUtc: string | undefined;
  closeReason: string | undefined;
}

export interface StaffingMarketView {
  offerWindowId: string;
  companyId: string;
  generatedAtUtc: string;
  expiresAtUtc: string;
  windowSeed: string;
  generationContextHash: string;
  refreshReason: string;
  status: string;
  offers: StaffingOfferView[];
}

function parseJsonObject(rawValue: string): JsonObject {
  return JSON.parse(rawValue) as JsonObject;
}

function compareUtc(leftUtc: string, rightUtc: string): number {
  return new Date(leftUtc).getTime() - new Date(rightUtc).getTime();
}

export function loadActiveStaffingMarket(
  saveDatabase: SqliteFileDatabase,
  saveId: string,
): StaffingMarketView | null {
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
      AND window_type = 'staffing_market'
      AND status = 'active'
    ORDER BY generated_at_utc DESC
    LIMIT 1`,
    { $company_id: companyContext.companyId },
  );

  if (!windowRow) {
    return null;
  }

  const offerRows = saveDatabase.all<StaffingOfferRow>(
    `SELECT
      staffing_offer_id AS staffingOfferId,
      labor_category AS laborCategory,
      employment_model AS employmentModel,
      qualification_group AS qualificationGroup,
      coverage_units AS coverageUnits,
      fixed_cost_amount AS fixedCostAmount,
      variable_cost_rate AS variableCostRate,
      starts_at_utc AS startsAtUtc,
      ends_at_utc AS endsAtUtc,
      first_name AS firstName,
      last_name AS lastName,
      display_name AS displayName,
      certifications_json AS certificationsJson,
      home_city AS homeCity,
      home_region_code AS homeRegionCode,
      home_country_code AS homeCountryCode,
      current_airport_id AS currentAirportId,
      explanation_metadata_json AS explanationMetadataJson,
      generated_seed AS generatedSeed,
      offer_status AS offerStatus,
      listed_at_utc AS listedAtUtc,
      available_until_utc AS availableUntilUtc,
      closed_at_utc AS closedAtUtc,
      close_reason AS closeReason
    FROM staffing_offer
    WHERE offer_window_id = $offer_window_id
      AND offer_status = 'available'
    ORDER BY starts_at_utc ASC, fixed_cost_amount ASC, staffing_offer_id ASC`,
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
    offers: offerRows.map((offer) => {
      const explanationMetadata = parseJsonObject(offer.explanationMetadataJson);
      const visibility = parseStaffingOfferVisibility(explanationMetadata);

      return {
        staffingOfferId: offer.staffingOfferId,
        laborCategory: offer.laborCategory,
        employmentModel: offer.employmentModel,
        qualificationGroup: offer.qualificationGroup,
        coverageUnits: offer.coverageUnits,
        fixedCostAmount: offer.fixedCostAmount,
        variableCostRate: offer.variableCostRate ?? undefined,
        startsAtUtc: offer.startsAtUtc ?? undefined,
        endsAtUtc: offer.endsAtUtc ?? undefined,
        firstName: offer.firstName ?? undefined,
        lastName: offer.lastName ?? undefined,
        displayName: offer.displayName ?? undefined,
        certifications: parsePilotCertificationsJson(offer.certificationsJson, offer.qualificationGroup),
        homeCity: offer.homeCity ?? undefined,
        homeRegionCode: offer.homeRegionCode ?? undefined,
        homeCountryCode: offer.homeCountryCode ?? undefined,
        currentAirportId: offer.currentAirportId ?? undefined,
        candidateState:
          offer.startsAtUtc && compareUtc(offer.startsAtUtc, companyContext.currentTimeUtc) > 0
            ? "available_soon"
            : "available_now",
        explanationMetadata,
        candidateProfileId: visibility.candidateProfileId,
        candidateProfile: visibility.candidateProfile,
        pricingExplanation: visibility.pricingExplanation,
        generatedSeed: offer.generatedSeed,
        offerStatus: offer.offerStatus,
        listedAtUtc: offer.listedAtUtc ?? undefined,
        availableUntilUtc: offer.availableUntilUtc ?? undefined,
        closedAtUtc: offer.closedAtUtc ?? undefined,
        closeReason: offer.closeReason ?? undefined,
      };
    }),
  };
}
