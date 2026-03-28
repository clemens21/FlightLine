/*
 * Generates and persists the pilot hiring market.
 * The market stays qualification-driven, but it now refreshes on a 24-hour cadence and keeps a larger visible candidate board.
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
  PilotStatScore,
  PilotVisibleCertificationHoursEntry,
  PilotVisibleProfile,
  StaffingPricingExplanation,
} from "../../domain/staffing/types.js";
import {
  enumerateReachablePilotCertificationCombinations,
  certificationsForQualificationGroup,
  normalizePilotCertifications,
  pilotCertificationsToJson,
  pilotCertificationsSatisfyQualificationGroup,
  requiredCertificationForQualificationGroup,
} from "../../domain/staffing/pilot-certifications.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";
import type { AirportReferenceRepository } from "../../infrastructure/reference/airport-reference.js";
import { createStaffingIdentityGenerator } from "./staffing-identity-generator.js";

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
  firstName: string;
  lastName: string;
  displayName: string;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  certifications: PilotCertificationCode[];
  fixedCostAmount: number;
  variableCostRate?: number;
  startsAtUtc: string;
  endsAtUtc?: string;
  homeCity?: string;
  homeRegionCode?: string;
  homeCountryCode?: string;
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

const CONTRACT_DURATION_DAYS = [90, 120, 180] as const;
const STAFFING_MARKET_REFRESH_HOURS = 24;
const STAFFING_MARKET_VISIBLE_CANDIDATE_GROUP_LIMIT = 128;
const QUALIFICATION_LANE_ORDER = [
  "single_turboprop_utility",
  "single_turboprop_premium",
  "regional_turboprop",
  "twin_turboprop_utility",
  "twin_turboprop_commuter",
  "light_business_jet",
  "super_midsize_business_jet",
  "classic_regional_jet",
  "regional_jet",
  "narrowbody_airline",
  "widebody_airline",
] as const;

type MarketFitTier = "core" | "adjacent" | "broader";

interface GeneratedPilotCandidateProfile extends PilotVisibleProfile {
  displayName: string;
  qualificationGroup: string;
  certifications: PilotCertificationCode[];
  currentAirportId: string;
  generatedSeed: string;
}

interface GeneratedMarketLane extends QualificationDemand {
  marketFitTier: MarketFitTier;
  anchorQualificationGroup: string;
}

interface GeneratedCandidateGroup {
  candidateProfileId: string;
  offers: GeneratedPilotCandidateOffer[];
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

function qualificationLaneRank(qualificationGroup: string): number {
  const rank = QUALIFICATION_LANE_ORDER.indexOf(qualificationGroup as typeof QUALIFICATION_LANE_ORDER[number]);
  return rank >= 0 ? rank : QUALIFICATION_LANE_ORDER.length;
}

function neighboringQualificationGroups(qualificationGroup: string): string[] {
  const rank = qualificationLaneRank(qualificationGroup);
  const neighbors: string[] = [];

  if (rank > 0) {
    neighbors.push(QUALIFICATION_LANE_ORDER[rank - 1]!);
  }

  if (rank >= 0 && rank < QUALIFICATION_LANE_ORDER.length - 1) {
    neighbors.push(QUALIFICATION_LANE_ORDER[rank + 1]!);
  }

  return neighbors.filter((neighbor) => neighbor !== qualificationGroup);
}

function qualificationComplexityIndex(qualificationGroup: string): number {
  switch (qualificationGroup) {
    case "single_turboprop_premium":
      return 1;
    case "regional_turboprop":
    case "twin_turboprop_utility":
      return 2;
    case "twin_turboprop_commuter":
      return 3;
    case "light_business_jet":
      return 4;
    case "super_midsize_business_jet":
    case "classic_regional_jet":
      return 5;
    case "regional_jet":
      return 6;
    case "narrowbody_airline":
      return 7;
    case "widebody_airline":
      return 8;
    case "single_turboprop_utility":
    default:
      if (qualificationGroup.includes("widebody") || qualificationGroup.includes("jumbo")) {
        return 8;
      }

      if (qualificationGroup.includes("jet")) {
        return 5;
      }

      if (qualificationGroup.includes("regional_turboprop") || qualificationGroup.includes("twin")) {
        return 2;
      }

      return 0;
  }
}

function chooseStatScore(seed: string, laneComplexity: number): PilotStatScore {
  const rolledValue = hashString(seed) % 101;
  const boostedValue = Math.min(100, rolledValue + laneComplexity * 6);
  return Math.max(0, Math.min(10, Math.round(boostedValue / 10))) as PilotStatScore;
}

function estimateTotalCareerHours(qualificationGroup: string, generatedSeed: string): number {
  const complexityIndex = qualificationComplexityIndex(qualificationGroup);
  const rangeSeed = hashString(`${generatedSeed}:hours`);
  const totalHourFloor = 750 + complexityIndex * 900;
  const totalHourSpan = 2_800 + complexityIndex * 1_250;
  return roundToNearest(
    totalHourFloor + (rangeSeed % totalHourSpan),
    25,
  );
}

function buildVisibleStatProfile(qualificationGroup: string, generatedSeed: string) {
  const complexityIndex = qualificationComplexityIndex(qualificationGroup);

  return {
    operationalReliability: chooseStatScore(`${generatedSeed}:reliability`, complexityIndex),
    stressTolerance: chooseStatScore(`${generatedSeed}:stress`, complexityIndex),
    procedureDiscipline: chooseStatScore(`${generatedSeed}:procedure`, complexityIndex),
    trainingAptitude: chooseStatScore(`${generatedSeed}:training`, complexityIndex),
  };
}

function estimateDirectSalary(profile: GeneratedPilotCandidateProfile): number {
  return estimateDirectHireSalaryFromProfile({
    ...profile,
    marketSeed: profile.generatedSeed,
  });
}

function estimateContractHourlyRate(profile: GeneratedPilotCandidateProfile): number {
  return estimateContractHourlyRateFromProfile({
    ...profile,
    marketSeed: profile.generatedSeed,
  });
}

function estimateContractEngagementFee(profile: GeneratedPilotCandidateProfile): number {
  return estimateContractEngagementFeeFromProfile({
    ...profile,
    marketSeed: profile.generatedSeed,
  });
}

function formatHours(hours: number): string {
  return `${hours.toLocaleString("en-US")}h`;
}

function formatStatScore(score: PilotStatScore): string {
  return `${score}/10`;
}

function formatCertificationHours(entries: ReadonlyArray<PilotVisibleCertificationHoursEntry>): string {
  return entries.map((entry) => `${entry.certificationCode} ${formatHours(entry.hours)}`).join(" | ");
}

function buildPricingExplanation(
  profile: GeneratedPilotCandidateProfile,
  employmentModel: EmploymentModel,
  contractHourlyRate: number | undefined,
): StaffingPricingExplanation {
  const operatingProfile = `Reliability ${formatStatScore(profile.statProfile.operationalReliability)}, `
    + `Stress ${formatStatScore(profile.statProfile.stressTolerance)}, `
    + `Procedure ${formatStatScore(profile.statProfile.procedureDiscipline)}, `
    + `Training ${formatStatScore(profile.statProfile.trainingAptitude)}`;

  return {
    summary: employmentModel === "contract_hire"
      ? "Contract pricing uses visible lane complexity, total flight time, certification time, and operational profile, then bills only completed flight-leg hours."
      : "Direct salary uses visible lane complexity, total flight time, certification time, and operational profile with no activation charge in this slice.",
    drivers: [
      `Qualification lane: ${profile.qualificationLane}`,
      `Certifications: ${profile.certifications.join(", ")}`,
      `Total career time: ${formatHours(profile.totalCareerHours)}`,
      `Primary lane time: ${formatHours(profile.primaryQualificationFamilyHours)} in ${profile.qualificationLane}`,
      `Certification time: ${formatCertificationHours(profile.certificationHours)}`,
      employmentModel === "contract_hire" && contractHourlyRate !== undefined
        ? `Usage billing anchor: ${contractHourlyRate.toLocaleString("en-US")}/completed flight hour`
        : `Operational profile: ${operatingProfile}`,
    ],
  };
}

function minimumQualificationCertifications(
  qualificationGroup: string,
): PilotCertificationCode[] {
  const requiredCertification = requiredCertificationForQualificationGroup(qualificationGroup);
  if (requiredCertification) {
    return [requiredCertification];
  }

  return normalizePilotCertifications(certificationsForQualificationGroup(qualificationGroup));
}

function certificationCountRangeForHours(totalCareerHours: number): { min: number; max: number } {
  if (totalCareerHours <= 1_500) {
    return { min: 1, max: 2 };
  }

  if (totalCareerHours <= 2_800) {
    return { min: 1, max: 3 };
  }

  if (totalCareerHours <= 4_500) {
    return { min: 2, max: 4 };
  }

  if (totalCareerHours <= 6_500) {
    return { min: 2, max: 5 };
  }

  return { min: 3, max: 6 };
}

function minimumHoursForCertification(certification: PilotCertificationCode): number {
  switch (certification) {
    case "SEPL":
      return 200;
    case "SEPS":
      return 300;
    case "MEPL":
      return 650;
    case "MEPS":
      return 850;
    case "JET":
      return 2_200;
    case "JUMBO":
      return 5_200;
    default:
      return 200;
  }
}

function certificationHourFloor(certification: PilotCertificationCode): number {
  switch (certification) {
    case "SEPL":
      return 150;
    case "SEPS":
      return 125;
    case "MEPL":
      return 225;
    case "MEPS":
      return 200;
    case "JET":
      return 350;
    case "JUMBO":
      return 500;
    default:
      return 100;
  }
}

function chooseCertificationCount(
  totalCareerHours: number,
  availableCounts: ReadonlyArray<number>,
  generatedSeed: string,
): number {
  const uniqueCounts = [...new Set(availableCounts)].sort((left, right) => left - right);
  if (uniqueCounts.length === 0) {
    return 1;
  }

  const maxCount = uniqueCounts[uniqueCounts.length - 1]!;
  const weightedCounts: number[] = [];

  uniqueCounts.forEach((count) => {
    const lowCountBias = maxCount - count + 1;
    let weight = lowCountBias;

    if (totalCareerHours <= 1_500) {
      weight = lowCountBias * 5;
    } else if (totalCareerHours <= 2_800) {
      weight = lowCountBias * 4;
    } else if (totalCareerHours <= 4_500) {
      weight = lowCountBias * 3;
    } else if (totalCareerHours <= 6_500) {
      weight = lowCountBias * 2;
    }

    if (count === maxCount && totalCareerHours > 6_500) {
      weight += 3;
    }

    for (let repeat = 0; repeat < Math.max(weight, 1); repeat += 1) {
      weightedCounts.push(count);
    }
  });

  return weightedCounts[hashString(`${generatedSeed}:cert-count`) % weightedCounts.length]!;
}

function buildCandidateCertifications(
  qualificationGroup: string,
  generatedSeed: string,
  baselineTotalCareerHours: number,
): PilotCertificationCode[] {
  const certificationRange = certificationCountRangeForHours(baselineTotalCareerHours);
  const reachableCombinations = enumerateReachablePilotCertificationCombinations()
    .filter((certifications) =>
      pilotCertificationsSatisfyQualificationGroup(certifications, qualificationGroup)
      && certifications.every((certification) => baselineTotalCareerHours >= minimumHoursForCertification(certification))
      && certifications.length >= certificationRange.min
      && certifications.length <= certificationRange.max,
    );

  const certificationCatalog = reachableCombinations.length > 0
    ? reachableCombinations
    : enumerateReachablePilotCertificationCombinations()
      .filter((certifications) =>
        pilotCertificationsSatisfyQualificationGroup(certifications, qualificationGroup)
        && certifications.every((certification) => baselineTotalCareerHours >= minimumHoursForCertification(certification)));

  if (certificationCatalog.length === 0) {
    return minimumQualificationCertifications(qualificationGroup);
  }

  const targetCount = chooseCertificationCount(
    baselineTotalCareerHours,
    certificationCatalog.map((certifications) => certifications.length),
    generatedSeed,
  );
  const exactCountCatalog = certificationCatalog.filter((certifications) => certifications.length === targetCount);
  const finalCatalog = exactCountCatalog.length > 0 ? exactCountCatalog : certificationCatalog;
  const certificationIndex = hashString(`${generatedSeed}:certifications`) % finalCatalog.length;
  return finalCatalog[certificationIndex]!;
}

function buildCertificationHours(
  totalCareerHours: number,
  certifications: ReadonlyArray<PilotCertificationCode>,
  qualificationGroup: string,
  generatedSeed: string,
): PilotVisibleCertificationHoursEntry[] {
  const normalizedCertifications = normalizePilotCertifications(certifications);
  if (normalizedCertifications.length === 0) {
    return [];
  }

  const requiredCertification = requiredCertificationForQualificationGroup(qualificationGroup);
  const floorEntries = normalizedCertifications.map((certificationCode) => ({
    certificationCode,
    hours: certificationHourFloor(certificationCode),
  }));
  let totalFloorHours = floorEntries.reduce((total, entry) => total + entry.hours, 0);
  const scaledFloorEntries = totalFloorHours > totalCareerHours
    ? floorEntries.map((entry) => ({
        certificationCode: entry.certificationCode,
        hours: Math.max(25, roundToNearest((entry.hours / totalFloorHours) * totalCareerHours, 25)),
      }))
    : floorEntries;

  totalFloorHours = scaledFloorEntries.reduce((total, entry) => total + entry.hours, 0);
  if (totalFloorHours > totalCareerHours) {
    let overflowHours = totalFloorHours - totalCareerHours;
    for (let index = scaledFloorEntries.length - 1; index >= 0 && overflowHours > 0; index -= 1) {
      const entry = scaledFloorEntries[index]!;
      const reducibleHours = Math.max(entry.hours - 25, 0);
      if (reducibleHours <= 0) {
        continue;
      }

      const reducedHours = Math.min(reducibleHours, overflowHours);
      entry.hours -= reducedHours;
      overflowHours -= reducedHours;
    }

    totalFloorHours = scaledFloorEntries.reduce((total, entry) => total + entry.hours, 0);
  }
  let remainingHours = Math.max(totalCareerHours - totalFloorHours, 0);
  const weightedEntries = scaledFloorEntries.map((entry) => ({
    certificationCode: entry.certificationCode,
    hours: entry.hours,
    weight: 1
      + (entry.certificationCode === requiredCertification ? 6 : 0)
      + Math.max(1, Math.ceil(minimumHoursForCertification(entry.certificationCode) / 1_500))
      + (hashString(`${generatedSeed}:${entry.certificationCode}:weight`) % 4),
  }));
  const totalWeight = weightedEntries.reduce((total, entry) => total + entry.weight, 0);

  weightedEntries.forEach((entry, index) => {
    if (remainingHours <= 0) {
      return;
    }

    const isLast = index === weightedEntries.length - 1;
    const weightedHours = isLast
      ? remainingHours
      : roundToNearest((remainingHours * entry.weight) / totalWeight, 25);
    const appliedHours = Math.min(remainingHours, Math.max(weightedHours, 0));
    entry.hours += appliedHours;
    remainingHours -= appliedHours;
  });

  if (remainingHours > 0) {
    const anchorEntry = weightedEntries.find((entry) => entry.certificationCode === requiredCertification)
      ?? weightedEntries[0]!;
    anchorEntry.hours += remainingHours;
  }

  return weightedEntries.map((entry) => ({
    certificationCode: entry.certificationCode,
    hours: entry.hours,
  }));
}

function primaryQualificationHours(
  qualificationGroup: string,
  certificationHours: ReadonlyArray<PilotVisibleCertificationHoursEntry>,
): number {
  const requiredCertification = requiredCertificationForQualificationGroup(qualificationGroup);
  if (requiredCertification) {
    return certificationHours.find((entry) => entry.certificationCode === requiredCertification)?.hours ?? 0;
  }

  return certificationHours.reduce((highest, entry) => Math.max(highest, entry.hours), 0);
}

function buildCandidateProfile(
  entry: QualificationDemand,
  candidateProfileId: string,
  displayName: string,
  currentAirportId: string,
  generatedSeed: string,
): GeneratedPilotCandidateProfile {
  const totalCareerHours = estimateTotalCareerHours(entry.qualificationGroup, generatedSeed);
  const certifications = buildCandidateCertifications(
    entry.qualificationGroup,
    generatedSeed,
    totalCareerHours,
  );
  const certificationHours = buildCertificationHours(
    totalCareerHours,
    certifications,
    entry.qualificationGroup,
    generatedSeed,
  );

  return {
    candidateProfileId,
    displayName,
    qualificationGroup: entry.qualificationGroup,
    qualificationLane: humanizeQualificationGroup(entry.qualificationGroup),
    certifications,
    totalCareerHours,
    primaryQualificationFamilyHours: primaryQualificationHours(entry.qualificationGroup, certificationHours),
    certificationHours,
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
      certificationHours: profile.certificationHours,
      companyHours: profile.companyHours,
      statProfile: profile.statProfile,
    },
    pricingExplanation,
  };
}

function bucketTimeToTwentyFourHours(utcIsoString: string): string {
  const date = new Date(utcIsoString);
  const bucketMs = Math.floor(date.getTime() / (STAFFING_MARKET_REFRESH_HOURS * 3_600_000))
    * STAFFING_MARKET_REFRESH_HOURS
    * 3_600_000;
  return new Date(bucketMs).toISOString();
}

function expandMarketDemand(
  demand: QualificationDemand[],
  windowSeed: string,
): GeneratedMarketLane[] {
  const exactDemand = [...demand].sort((left, right) => {
    const leftRank = qualificationLaneRank(left.qualificationGroup);
    const rightRank = qualificationLaneRank(right.qualificationGroup);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return right.pilotsRequired - left.pilotsRequired || left.qualificationGroup.localeCompare(right.qualificationGroup);
  });
  const expanded = new Map<string, GeneratedMarketLane>();

  const addLane = (
    laneDemand: QualificationDemand,
    marketFitTier: MarketFitTier,
    anchorQualificationGroup: string,
  ): void => {
    const existing = expanded.get(laneDemand.qualificationGroup);
    if (existing) {
      if (existing.marketFitTier === "broader" && marketFitTier !== "broader") {
        expanded.set(laneDemand.qualificationGroup, {
          ...laneDemand,
          marketFitTier,
          anchorQualificationGroup,
        });
      }

      return;
    }

    expanded.set(laneDemand.qualificationGroup, {
      ...laneDemand,
      marketFitTier,
      anchorQualificationGroup,
    });
  };

  for (const lane of exactDemand) {
    addLane(lane, "core", lane.qualificationGroup);
  }

  for (const lane of exactDemand) {
    const neighbors = neighboringQualificationGroups(lane.qualificationGroup);
    for (const neighbor of neighbors) {
      if (expanded.has(neighbor)) {
        continue;
      }

      addLane({
        qualificationGroup: neighbor,
        aircraftCount: lane.aircraftCount,
        pilotsRequired: lane.pilotsRequired,
        coverageUnits: lane.coverageUnits,
        ...(lane.sampleModelName ? { sampleModelName: `Adjacent to ${lane.sampleModelName}` } : {}),
      }, "adjacent", lane.qualificationGroup);
    }
  }

  const broadCandidates = QUALIFICATION_LANE_ORDER.filter((qualificationGroup) => !expanded.has(qualificationGroup));
  if (broadCandidates.length > 0) {
    const broadIndex = hashString(`${windowSeed}:broader-market`) % broadCandidates.length;
    const broadQualificationGroup = broadCandidates[broadIndex]!;
    const broadAnchor = exactDemand[0]?.qualificationGroup ?? broadQualificationGroup;
    const broadAnchorDemand = exactDemand[0] ?? {
      qualificationGroup: broadQualificationGroup,
      aircraftCount: 0,
      pilotsRequired: 1,
      coverageUnits: 0,
      sampleModelName: "broader market",
    };
    addLane({
      qualificationGroup: broadQualificationGroup,
      aircraftCount: Math.max(1, broadAnchorDemand.aircraftCount),
      pilotsRequired: Math.max(1, broadAnchorDemand.pilotsRequired),
      coverageUnits: broadAnchorDemand.coverageUnits,
      ...(broadAnchorDemand.sampleModelName
        ? { sampleModelName: `Broader than ${broadAnchorDemand.sampleModelName}` }
        : { sampleModelName: "broader market" }),
    }, "broader", broadAnchor);
  }

  return [...expanded.values()].sort((left, right) => {
    const leftTierRank = left.marketFitTier === "core" ? 0 : left.marketFitTier === "adjacent" ? 1 : 2;
    const rightTierRank = right.marketFitTier === "core" ? 0 : right.marketFitTier === "adjacent" ? 1 : 2;
    if (leftTierRank !== rightTierRank) {
      return leftTierRank - rightTierRank;
    }

    const leftRank = qualificationLaneRank(left.qualificationGroup);
    const rightRank = qualificationLaneRank(right.qualificationGroup);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return right.pilotsRequired - left.pilotsRequired || left.qualificationGroup.localeCompare(right.qualificationGroup);
  });
}

function chooseAvailabilityMix(seed: string, marketFitTier: MarketFitTier, candidateIndex: number): { directHire: boolean; contractHire: boolean } {
  if (candidateIndex % 4 === 0) {
    return { directHire: true, contractHire: true };
  }

  if (candidateIndex % 4 === 1) {
    return { directHire: true, contractHire: false };
  }

  if (candidateIndex % 4 === 2) {
    return { directHire: false, contractHire: true };
  }

  const roll = hashString(`${seed}:availability`) % 100;

  if (marketFitTier === "core") {
    if (roll < 18) {
      return { directHire: true, contractHire: false };
    }

    if (roll < 36) {
      return { directHire: false, contractHire: true };
    }

    return { directHire: true, contractHire: true };
  }

  if (marketFitTier === "adjacent") {
    if (roll < 32) {
      return { directHire: true, contractHire: false };
    }

    if (roll < 64) {
      return { directHire: false, contractHire: true };
    }

    return { directHire: true, contractHire: true };
  }

  if (roll < 38) {
    return { directHire: true, contractHire: false };
  }

  if (roll < 76) {
    return { directHire: false, contractHire: true };
  }

  return { directHire: true, contractHire: true };
}

function desiredCandidateCountForLane(lane: GeneratedMarketLane, windowSeed: string): number {
  const pressureGap = Math.max(0, lane.pilotsRequired - lane.coverageUnits);
  const pressureBias = lane.marketFitTier === "core"
    ? Math.min(3, pressureGap)
    : Math.min(2, pressureGap);
  const varietyBias = hashString(`${windowSeed}:${lane.qualificationGroup}:count`) % 3;
  const tierBase = lane.marketFitTier === "core" ? 20 : lane.marketFitTier === "adjacent" ? 14 : 8;
  const tierMax = lane.marketFitTier === "core" ? 28 : lane.marketFitTier === "adjacent" ? 20 : 12;
  return Math.max(tierBase, Math.min(tierMax, tierBase + pressureBias + varietyBias));
}

function chooseContractEndUtc(startsAtUtc: string, generatedSeed: string): string {
  const durationIndex = hashString(generatedSeed) % CONTRACT_DURATION_DAYS.length;
  return addDaysIso(startsAtUtc, CONTRACT_DURATION_DAYS[durationIndex]!);
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
  airportReference: AirportReferenceRepository,
  refreshReason: "scheduled" | "manual" | "bootstrap",
): GeneratedStaffingMarket {
  const demandLimit = 6;
  const demand = expandMarketDemand(
    loadQualificationDemand(saveDatabase, companyContext, aircraftReference).slice(0, demandLimit),
    companyContext.currentTimeUtc,
  );
  const windowSeed = `staffing:${companyContext.worldSeed}:${bucketTimeToTwentyFourHours(companyContext.currentTimeUtc)}`;
  const generationContextHash = JSON.stringify(
    demand.map((entry) => ({
      qualificationGroup: entry.qualificationGroup,
      aircraftCount: entry.aircraftCount,
      pilotsRequired: entry.pilotsRequired,
      coverageUnits: entry.coverageUnits,
      marketFitTier: entry.marketFitTier,
      anchorQualificationGroup: entry.anchorQualificationGroup,
    })),
  );
  const candidateGroups: GeneratedCandidateGroup[] = [];
  const identityGenerator = createStaffingIdentityGenerator({
    saveDatabase,
    companyId: companyContext.companyId,
    homeBaseAirportId: companyContext.homeBaseAirportId,
    airportReference,
    includeAvailableMarketOffers: false,
  });
  let candidateOrdinal = 0;

  demand.forEach((entry, demandIndex) => {
    const desiredCount = desiredCandidateCountForLane(entry, `${windowSeed}:${demandIndex}`);

    for (let candidateIndex = 0; candidateIndex < desiredCount; candidateIndex += 1) {
      const startsAtUtc = companyContext.currentTimeUtc;
      const candidateSeed = `${windowSeed}:${entry.qualificationGroup}:candidate:${candidateIndex}`;
      const identity = identityGenerator.generateIdentity(candidateSeed, candidateOrdinal);
      candidateOrdinal += 1;
      const candidateProfileId = `${entry.qualificationGroup}:${hashString(candidateSeed).toString(36)}`;
      const candidateProfile = buildCandidateProfile(
        entry,
        candidateProfileId,
        identity.displayName,
        companyContext.homeBaseAirportId,
        candidateSeed,
      );
      const directPricingExplanation = buildPricingExplanation(candidateProfile, "direct_hire", undefined);
      const contractHourlyRate = estimateContractHourlyRate(candidateProfile);
      const contractPricingExplanation = buildPricingExplanation(candidateProfile, "contract_hire", contractHourlyRate);
      const availabilityMix = chooseAvailabilityMix(candidateSeed, entry.marketFitTier, candidateIndex);
      const candidateOffers: GeneratedPilotCandidateOffer[] = [];

      if (availabilityMix.directHire) {
        candidateOffers.push({
          candidateProfileId,
          firstName: identity.firstName,
          lastName: identity.lastName,
          displayName: identity.displayName,
          employmentModel: "direct_hire",
          qualificationGroup: entry.qualificationGroup,
          certifications: candidateProfile.certifications,
          fixedCostAmount: estimateDirectSalary(candidateProfile),
          startsAtUtc,
          currentAirportId: companyContext.homeBaseAirportId,
          explanationMetadata: buildOfferExplanationMetadata(candidateProfile, directPricingExplanation),
          generatedSeed: candidateSeed,
          ...(identity.homeCity ? { homeCity: identity.homeCity } : {}),
          ...(identity.homeRegionCode ? { homeRegionCode: identity.homeRegionCode } : {}),
          ...(identity.homeCountryCode ? { homeCountryCode: identity.homeCountryCode } : {}),
        });
      }

      if (availabilityMix.contractHire) {
        candidateOffers.push({
          candidateProfileId,
          firstName: identity.firstName,
          lastName: identity.lastName,
          displayName: identity.displayName,
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
          ...(identity.homeCity ? { homeCity: identity.homeCity } : {}),
          ...(identity.homeRegionCode ? { homeRegionCode: identity.homeRegionCode } : {}),
          ...(identity.homeCountryCode ? { homeCountryCode: identity.homeCountryCode } : {}),
        });
      }

      candidateGroups.push({
        candidateProfileId,
        offers: candidateOffers,
      });
    }
  });

  const visibleCandidateGroups = candidateGroups.slice(0, STAFFING_MARKET_VISIBLE_CANDIDATE_GROUP_LIMIT);
  const offers = visibleCandidateGroups.flatMap((candidateGroup) => candidateGroup.offers);

  return {
    generatedAtUtc: companyContext.currentTimeUtc,
    expiresAtUtc: addHoursIso(companyContext.currentTimeUtc, STAFFING_MARKET_REFRESH_HOURS),
    windowSeed,
    generationContextHash,
    offers,
  };
}

export function reconcileStaffingMarket(params: {
  saveDatabase: SqliteFileDatabase;
  companyContext: CompanyContext;
  aircraftReference: AircraftReferenceRepository;
  airportReference: AirportReferenceRepository;
  refreshReason: "scheduled" | "manual" | "bootstrap";
}): StaffingMarketReconcileResult {
  const { saveDatabase, companyContext, aircraftReference, airportReference, refreshReason } = params;
  const generatedMarket = generateStaffingMarket(
    saveDatabase,
    companyContext,
    aircraftReference,
    airportReference,
    refreshReason,
  );

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
          first_name,
          last_name,
          display_name,
          certifications_json,
          home_city,
          home_region_code,
          home_country_code,
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
          $first_name,
          $last_name,
          $display_name,
          $certifications_json,
          $home_city,
          $home_region_code,
          $home_country_code,
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
          $first_name: offer.firstName,
          $last_name: offer.lastName,
          $display_name: offer.displayName,
          $certifications_json: pilotCertificationsToJson(offer.certifications),
          $home_city: offer.homeCity ?? null,
          $home_region_code: offer.homeRegionCode ?? null,
          $home_country_code: offer.homeCountryCode ?? null,
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
