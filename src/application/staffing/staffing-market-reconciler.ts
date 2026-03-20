/*
 * Generates and persists the first-pass pilot hiring market.
 * The market is intentionally small and qualification-driven so the player chooses people, not a wall of near-duplicate offers.
 */

import { createPrefixedId } from "../commands/utils.js";
import type { CompanyContext } from "../queries/company-state.js";
import {
  estimateContractEngagementFee as estimateContractEngagementFeeFromProfile,
  estimateContractHourlyRate as estimateContractHourlyRateFromProfile,
  estimateDirectHireSalary as estimateDirectHireSalaryFromProfile,
} from "./pilot-employment-pricing.js";
import type {
  EmploymentModel,
  PilotCertificationCode,
  PilotStatBand,
  PilotVisibleProfile,
  StaffingPricingExplanation,
} from "../../domain/staffing/types.js";
import { certificationsForQualificationGroup, pilotCertificationsToJson } from "../../domain/staffing/pilot-certifications.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";

interface AircraftRow extends Record<string, unknown> {
  aircraftModelId: string;
}

interface StaffingCoverageRow extends Record<string, unknown> {
  qualificationGroup: string;
  coverageUnits: number;
}

interface ActiveWindowRow extends Record<string, unknown> {
  offerWindowId: string;
}

interface QualificationDemand {
  qualificationGroup: string;
  aircraftCount: number;
  pilotsRequired: number;
  coverageUnits: number;
  sampleModelName?: string;
}

interface GeneratedPilotCandidateOffer {
  candidateProfileId: string;
  displayName: string;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  certifications: PilotCertificationCode[];
  fixedCostAmount: number;
  variableCostRate?: number;
  startsAtUtc: string;
  endsAtUtc?: string;
  currentAirportId: string;
  explanationMetadata: Record<string, unknown>;
  generatedSeed: string;
}

export interface GeneratedStaffingMarket {
  generatedAtUtc: string;
  expiresAtUtc: string;
  windowSeed: string;
  generationContextHash: string;
  offers: GeneratedPilotCandidateOffer[];
}

export interface StaffingMarketReconcileResult {
  success: boolean;
  changed: boolean;
  offerWindowId?: string;
  offerCount: number;
  validationMessages: string[];
}

const FIRST_NAMES = [
  "Avery",
  "Blake",
  "Cameron",
  "Dakota",
  "Emerson",
  "Finley",
  "Harper",
  "Jamie",
  "Jordan",
  "Kai",
  "Logan",
  "Morgan",
  "Parker",
  "Quinn",
  "Reese",
  "Riley",
  "Sawyer",
  "Skyler",
  "Taylor",
  "Tatum",
] as const;

const LAST_NAMES = [
  "Bennett",
  "Brooks",
  "Calloway",
  "Dalton",
  "Ellis",
  "Foster",
  "Grayson",
  "Hayes",
  "Iverson",
  "Jordan",
  "Kendall",
  "Lawson",
  "Mercer",
  "Nolan",
  "Parker",
  "Quincy",
  "Sawyer",
  "Sterling",
  "Turner",
  "Walker",
] as const;

const CONTRACT_DURATION_DAYS = [90, 120, 180] as const;
const STAT_BAND_VALUES = ["developing", "solid", "strong", "exceptional"] as const satisfies PilotStatBand[];

interface GeneratedPilotCandidateProfile extends PilotVisibleProfile {
  displayName: string;
  qualificationGroup: string;
  certifications: PilotCertificationCode[];
  currentAirportId: string;
  generatedSeed: string;
}

function addHoursIso(utcIsoString: string, hours: number): string {
  return new Date(new Date(utcIsoString).getTime() + hours * 3_600_000).toISOString();
}

function addDaysIso(utcIsoString: string, days: number): string {
  return addHoursIso(utcIsoString, days * 24);
}

function hashString(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }

  return Math.abs(hash);
}

function roundToNearest(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

function humanizeQualificationGroup(qualificationGroup: string): string {
  return qualificationGroup.replaceAll("_", " ");
}

function qualificationComplexityIndex(qualificationGroup: string): number {
  switch (qualificationGroup) {
    case "single_turboprop_premium":
      return 1;
    case "twin_turboprop_utility":
      return 2;
    case "twin_turboprop_commuter":
      return 3;
    case "single_turboprop_utility":
    default:
      return qualificationGroup.includes("twin") ? 2 : 0;
  }
}

function directSalaryBase(qualificationGroup: string): number {
  switch (qualificationGroup) {
    case "single_turboprop_premium":
      return 11_000;
    case "twin_turboprop_utility":
      return 13_500;
    case "twin_turboprop_commuter":
      return 16_500;
    case "single_turboprop_utility":
    default:
      return qualificationGroup.includes("twin") ? 13_500 : 9_500;
  }
}

function contractHourlyBase(qualificationGroup: string): number {
  switch (qualificationGroup) {
    case "single_turboprop_premium":
      return 120;
    case "twin_turboprop_utility":
      return 145;
    case "twin_turboprop_commuter":
      return 170;
    case "single_turboprop_utility":
    default:
      return qualificationGroup.includes("twin") ? 145 : 105;
  }
}

function contractEngagementBase(qualificationGroup: string): number {
  switch (qualificationGroup) {
    case "single_turboprop_premium":
      return 3_000;
    case "twin_turboprop_utility":
      return 3_750;
    case "twin_turboprop_commuter":
      return 4_750;
    case "single_turboprop_utility":
    default:
      return qualificationGroup.includes("twin") ? 3_750 : 2_500;
  }
}

function chooseStatBand(seed: string, laneComplexity: number): PilotStatBand {
  const rolledValue = hashString(seed) % 100;
  const boostedValue = Math.min(99, rolledValue + laneComplexity * 4);

  if (boostedValue >= 90) {
    return "exceptional";
  }

  if (boostedValue >= 60) {
    return "strong";
  }

  if (boostedValue >= 24) {
    return "solid";
  }

  return "developing";
}

function statBandWeight(statBand: PilotStatBand): number {
  return STAT_BAND_VALUES.indexOf(statBand);
}

function estimateCareerHours(qualificationGroup: string, certifications: PilotCertificationCode[], generatedSeed: string): {
  totalCareerHours: number;
  primaryQualificationFamilyHours: number;
} {
  const complexityIndex = qualificationComplexityIndex(qualificationGroup);
  const breadthWeight = Math.max(certifications.length - 1, 0);
  const rangeSeed = hashString(`${generatedSeed}:hours`);
  const totalHourFloor = 900 + complexityIndex * 850 + breadthWeight * 275;
  const totalHourSpan = 3_100 + complexityIndex * 1_350 + breadthWeight * 450;
  const totalCareerHours = roundToNearest(
    totalHourFloor + (rangeSeed % totalHourSpan),
    25,
  );
  const familyRatioSeed = hashString(`${generatedSeed}:family`);
  const familyRatio = 0.45 + ((familyRatioSeed % 38) / 100);
  const primaryQualificationFamilyHours = roundToNearest(
    Math.max(350, Math.min(totalCareerHours - 75, totalCareerHours * familyRatio)),
    25,
  );

  return {
    totalCareerHours,
    primaryQualificationFamilyHours,
  };
}

function buildVisibleStatProfile(qualificationGroup: string, generatedSeed: string) {
  const complexityIndex = qualificationComplexityIndex(qualificationGroup);

  return {
    operationalReliability: chooseStatBand(`${generatedSeed}:reliability`, complexityIndex),
    stressTolerance: chooseStatBand(`${generatedSeed}:stress`, complexityIndex),
    procedureDiscipline: chooseStatBand(`${generatedSeed}:procedure`, complexityIndex),
    trainingAptitude: chooseStatBand(`${generatedSeed}:training`, complexityIndex),
  };
}

function estimateDirectSalary(profile: GeneratedPilotCandidateProfile): number {
  return estimateDirectHireSalaryFromProfile(profile);
}

function estimateContractHourlyRate(profile: GeneratedPilotCandidateProfile): number {
  return estimateContractHourlyRateFromProfile(profile);
}

function estimateContractEngagementFee(profile: GeneratedPilotCandidateProfile): number {
  return estimateContractEngagementFeeFromProfile(profile);
}

function formatHours(hours: number): string {
  return `${hours.toLocaleString("en-US")}h`;
}

function titleCaseBand(statBand: PilotStatBand): string {
  return statBand.charAt(0).toUpperCase() + statBand.slice(1);
}

function buildPricingExplanation(
  profile: GeneratedPilotCandidateProfile,
  employmentModel: EmploymentModel,
  contractHourlyRate: number | undefined,
): StaffingPricingExplanation {
  const operatingProfile = `${titleCaseBand(profile.statProfile.operationalReliability)} reliability, `
    + `${titleCaseBand(profile.statProfile.procedureDiscipline)} procedure discipline`;

  return {
    summary: employmentModel === "contract_hire"
      ? "Contract pricing uses visible lane complexity, flight time, and operational profile, then bills only completed flight-leg hours."
      : "Direct salary uses visible lane complexity, flight time, and operational profile with no activation charge in this slice.",
    drivers: [
      `Qualification lane: ${profile.qualificationLane}`,
      `Certification breadth: ${profile.certifications.join(", ")}`,
      `Total career time: ${formatHours(profile.totalCareerHours)}`,
      `Lane time: ${formatHours(profile.primaryQualificationFamilyHours)} in ${profile.qualificationLane}`,
      employmentModel === "contract_hire" && contractHourlyRate !== undefined
        ? `Usage billing anchor: ${contractHourlyRate.toLocaleString("en-US")}/completed flight hour`
        : `Operational profile: ${operatingProfile}`,
    ],
  };
}

function buildCandidateProfile(
  entry: QualificationDemand,
  candidateProfileId: string,
  displayName: string,
  currentAirportId: string,
  generatedSeed: string,
): GeneratedPilotCandidateProfile {
  const certifications = certificationsForQualificationGroup(entry.qualificationGroup);
  const hourProfile = estimateCareerHours(entry.qualificationGroup, certifications, generatedSeed);

  return {
    candidateProfileId,
    displayName,
    qualificationGroup: entry.qualificationGroup,
    qualificationLane: humanizeQualificationGroup(entry.qualificationGroup),
    certifications,
    totalCareerHours: hourProfile.totalCareerHours,
    primaryQualificationFamilyHours: hourProfile.primaryQualificationFamilyHours,
    companyHours: 0,
    statProfile: buildVisibleStatProfile(entry.qualificationGroup, generatedSeed),
    currentAirportId,
    generatedSeed,
  };
}

function buildOfferExplanationMetadata(
  profile: GeneratedPilotCandidateProfile,
  pricingExplanation: StaffingPricingExplanation,
): Record<string, unknown> {
  return {
    candidateProfileId: profile.candidateProfileId,
    candidateProfile: {
      candidateProfileId: profile.candidateProfileId,
      qualificationLane: profile.qualificationLane,
      totalCareerHours: profile.totalCareerHours,
      primaryQualificationFamilyHours: profile.primaryQualificationFamilyHours,
      companyHours: profile.companyHours,
      statProfile: profile.statProfile,
    },
    pricingExplanation,
  };
}

function desiredCandidateCounts(demand: QualificationDemand[]): number[] {
  if (demand.length <= 1) {
    return [8];
  }

  if (demand.length === 2) {
    return [5, 4];
  }

  return [4, 3, 3];
}

function chooseContractEndUtc(startsAtUtc: string, generatedSeed: string): string {
  const durationIndex = hashString(generatedSeed) % CONTRACT_DURATION_DAYS.length;
  return addDaysIso(startsAtUtc, CONTRACT_DURATION_DAYS[durationIndex]!);
}

function generateCandidateName(seedBase: string, usedNames: Set<string>): string {
  const seed = hashString(seedBase);

  for (let attempt = 0; attempt < FIRST_NAMES.length * LAST_NAMES.length; attempt += 1) {
    const firstName = FIRST_NAMES[(seed + attempt) % FIRST_NAMES.length]!;
    const lastName = LAST_NAMES[(seed * 7 + attempt) % LAST_NAMES.length]!;
    const candidate = `${firstName} ${lastName}`;

    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }

  const fallback = `Pilot ${usedNames.size + 1}`;
  usedNames.add(fallback);
  return fallback;
}

function loadQualificationDemand(
  saveDatabase: SqliteFileDatabase,
  companyContext: CompanyContext,
  aircraftReference: AircraftReferenceRepository,
): QualificationDemand[] {
  const aircraftRows = saveDatabase.all<AircraftRow>(
    `SELECT aircraft_model_id AS aircraftModelId
    FROM company_aircraft
    WHERE company_id = $company_id
      AND delivery_state IN ('available', 'delivered')
    ORDER BY acquired_at_utc ASC, aircraft_id ASC`,
    { $company_id: companyContext.companyId },
  );
  const coverageRows = saveDatabase.all<StaffingCoverageRow>(
    `SELECT
      qualification_group AS qualificationGroup,
      SUM(coverage_units) AS coverageUnits
    FROM staffing_package
    WHERE company_id = $company_id
      AND labor_category = 'pilot'
      AND status IN ('pending', 'active')
    GROUP BY qualification_group`,
    { $company_id: companyContext.companyId },
  );

  const demandByQualification = new Map<string, QualificationDemand>();

  for (const coverageRow of coverageRows) {
    demandByQualification.set(coverageRow.qualificationGroup, {
      qualificationGroup: coverageRow.qualificationGroup,
      aircraftCount: 0,
      pilotsRequired: 0,
      coverageUnits: coverageRow.coverageUnits,
    });
  }

  for (const aircraftRow of aircraftRows) {
    const model = aircraftReference.findModel(aircraftRow.aircraftModelId);
    if (!model) {
      continue;
    }

    const existing = demandByQualification.get(model.pilotQualificationGroup) ?? {
      qualificationGroup: model.pilotQualificationGroup,
      aircraftCount: 0,
      pilotsRequired: 0,
      coverageUnits: 0,
      sampleModelName: model.shortName,
    };
    existing.aircraftCount += 1;
    existing.pilotsRequired += Math.max(model.pilotsRequired, 1);
    existing.sampleModelName = existing.sampleModelName ?? model.shortName;
    demandByQualification.set(model.pilotQualificationGroup, existing);
  }

  if (demandByQualification.size === 0) {
    return [{
      qualificationGroup: "single_turboprop_utility",
      aircraftCount: 0,
      pilotsRequired: 1,
      coverageUnits: 0,
      sampleModelName: "startup utility flying",
    }];
  }

  return [...demandByQualification.values()]
    .sort((left, right) => {
      const leftGap = Math.max(left.pilotsRequired - left.coverageUnits, 0);
      const rightGap = Math.max(right.pilotsRequired - right.coverageUnits, 0);
      if (leftGap !== rightGap) {
        return rightGap - leftGap;
      }

      if (left.aircraftCount !== right.aircraftCount) {
        return right.aircraftCount - left.aircraftCount;
      }

      return left.qualificationGroup.localeCompare(right.qualificationGroup);
    });
}

export function generateStaffingMarket(
  saveDatabase: SqliteFileDatabase,
  companyContext: CompanyContext,
  aircraftReference: AircraftReferenceRepository,
  refreshReason: "scheduled" | "manual" | "bootstrap",
): GeneratedStaffingMarket {
  const demand = loadQualificationDemand(saveDatabase, companyContext, aircraftReference).slice(0, 3);
  const windowSeed = `staffing:${companyContext.worldSeed}:${companyContext.currentTimeUtc}:${refreshReason}`;
  const generationContextHash = JSON.stringify(
    demand.map((entry) => ({
      qualificationGroup: entry.qualificationGroup,
      aircraftCount: entry.aircraftCount,
      pilotsRequired: entry.pilotsRequired,
      coverageUnits: entry.coverageUnits,
    })),
  );
  const offers: GeneratedPilotCandidateOffer[] = [];
  const usedNames = new Set<string>();
  const candidateCounts = desiredCandidateCounts(demand);

  demand.forEach((entry, demandIndex) => {
    const desiredCount = candidateCounts[demandIndex] ?? 2;

    for (let candidateIndex = 0; candidateIndex < desiredCount; candidateIndex += 1) {
      const startsAtUtc = companyContext.currentTimeUtc;
      const candidateSeed = `${windowSeed}:${entry.qualificationGroup}:candidate:${candidateIndex}`;
      const displayName = generateCandidateName(candidateSeed, usedNames);
      const candidateProfileId = `${entry.qualificationGroup}:${hashString(candidateSeed).toString(36)}`;
      const candidateProfile = buildCandidateProfile(
        entry,
        candidateProfileId,
        displayName,
        companyContext.homeBaseAirportId,
        candidateSeed,
      );
      const directPricingExplanation = buildPricingExplanation(candidateProfile, "direct_hire", undefined);
      const contractHourlyRate = estimateContractHourlyRate(candidateProfile);
      const contractPricingExplanation = buildPricingExplanation(candidateProfile, "contract_hire", contractHourlyRate);

      offers.push({
        candidateProfileId,
        displayName,
        employmentModel: "direct_hire",
        qualificationGroup: entry.qualificationGroup,
        certifications: candidateProfile.certifications,
        fixedCostAmount: estimateDirectSalary(candidateProfile),
        startsAtUtc,
        currentAirportId: companyContext.homeBaseAirportId,
        explanationMetadata: buildOfferExplanationMetadata(candidateProfile, directPricingExplanation),
        generatedSeed: candidateSeed,
      });

      offers.push({
        candidateProfileId,
        displayName,
        employmentModel: "contract_hire",
        qualificationGroup: entry.qualificationGroup,
        certifications: candidateProfile.certifications,
        fixedCostAmount: estimateContractEngagementFee(candidateProfile),
        variableCostRate: contractHourlyRate,
        startsAtUtc,
        endsAtUtc: chooseContractEndUtc(startsAtUtc, candidateSeed),
        currentAirportId: companyContext.homeBaseAirportId,
        explanationMetadata: buildOfferExplanationMetadata(candidateProfile, contractPricingExplanation),
        generatedSeed: candidateSeed,
      });
    }
  });

  return {
    generatedAtUtc: companyContext.currentTimeUtc,
    expiresAtUtc: addHoursIso(companyContext.currentTimeUtc, 48),
    windowSeed,
    generationContextHash,
    offers,
  };
}

export function reconcileStaffingMarket(params: {
  saveDatabase: SqliteFileDatabase;
  companyContext: CompanyContext;
  aircraftReference: AircraftReferenceRepository;
  refreshReason: "scheduled" | "manual" | "bootstrap";
}): StaffingMarketReconcileResult {
  const { saveDatabase, companyContext, aircraftReference, refreshReason } = params;
  const generatedMarket = generateStaffingMarket(saveDatabase, companyContext, aircraftReference, refreshReason);

  if (generatedMarket.offers.length === 0) {
    return {
      success: false,
      changed: false,
      offerCount: 0,
      validationMessages: ["No pilot candidates could be generated for the current staffing market."],
    };
  }

  const existingActiveWindows = saveDatabase.all<ActiveWindowRow>(
    `SELECT offer_window_id AS offerWindowId
    FROM offer_window
    WHERE company_id = $company_id
      AND window_type = 'staffing_market'
      AND status = 'active'`,
    { $company_id: companyContext.companyId },
  );
  const offerWindowId = createPrefixedId("window");

  saveDatabase.transaction(() => {
    for (const existingWindow of existingActiveWindows) {
      saveDatabase.run(
        `UPDATE offer_window
        SET status = 'expired'
        WHERE offer_window_id = $offer_window_id`,
        { $offer_window_id: existingWindow.offerWindowId },
      );
      saveDatabase.run(
        `UPDATE staffing_offer
        SET offer_status = 'expired',
            closed_at_utc = COALESCE(closed_at_utc, $closed_at_utc),
            close_reason = COALESCE(close_reason, 'expired')
        WHERE offer_window_id = $offer_window_id
          AND offer_status = 'available'`,
        {
          $offer_window_id: existingWindow.offerWindowId,
          $closed_at_utc: companyContext.currentTimeUtc,
        },
      );
    }

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
        'staffing_market',
        $generated_at_utc,
        $expires_at_utc,
        $window_seed,
        $generation_context_hash,
        $refresh_reason,
        'active'
      )`,
      {
        $offer_window_id: offerWindowId,
        $company_id: companyContext.companyId,
        $generated_at_utc: generatedMarket.generatedAtUtc,
        $expires_at_utc: generatedMarket.expiresAtUtc,
        $window_seed: generatedMarket.windowSeed,
        $generation_context_hash: generatedMarket.generationContextHash,
        $refresh_reason: refreshReason,
      },
    );

    for (const offer of generatedMarket.offers) {
      saveDatabase.run(
        `INSERT INTO staffing_offer (
          staffing_offer_id,
          offer_window_id,
          company_id,
          labor_category,
          employment_model,
          qualification_group,
          coverage_units,
          fixed_cost_amount,
          variable_cost_rate,
          starts_at_utc,
          ends_at_utc,
          display_name,
          certifications_json,
          current_airport_id,
          explanation_metadata_json,
          generated_seed,
          offer_status,
          listed_at_utc,
          available_until_utc,
          closed_at_utc,
          close_reason
        ) VALUES (
          $staffing_offer_id,
          $offer_window_id,
          $company_id,
          'pilot',
          $employment_model,
          $qualification_group,
          1,
          $fixed_cost_amount,
          $variable_cost_rate,
          $starts_at_utc,
          $ends_at_utc,
          $display_name,
          $certifications_json,
          $current_airport_id,
          $explanation_metadata_json,
          $generated_seed,
          'available',
          $listed_at_utc,
          $available_until_utc,
          NULL,
          NULL
        )`,
        {
          $staffing_offer_id: createPrefixedId("offer"),
          $offer_window_id: offerWindowId,
          $company_id: companyContext.companyId,
          $employment_model: offer.employmentModel,
          $qualification_group: offer.qualificationGroup,
          $fixed_cost_amount: offer.fixedCostAmount,
          $variable_cost_rate: offer.variableCostRate ?? null,
          $starts_at_utc: offer.startsAtUtc,
          $ends_at_utc: offer.endsAtUtc ?? null,
          $display_name: offer.displayName,
          $certifications_json: pilotCertificationsToJson(offer.certifications),
          $current_airport_id: offer.currentAirportId,
          $explanation_metadata_json: JSON.stringify(offer.explanationMetadata),
          $generated_seed: offer.generatedSeed,
          $listed_at_utc: generatedMarket.generatedAtUtc,
          $available_until_utc: generatedMarket.expiresAtUtc,
        },
      );
    }
  });

  return {
    success: true,
    changed: true,
    offerWindowId,
    offerCount: generatedMarket.offers.length,
    validationMessages: [`Generated ${generatedMarket.offers.length} staffing offers.`],
  };
}
