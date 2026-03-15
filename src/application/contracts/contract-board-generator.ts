import type { JsonObject } from "../../domain/common/primitives.js";
import type { AirportRecord } from "../../infrastructure/reference/airport-reference.js";
import type { CompanyContext } from "../queries/company-state.js";

export interface GeneratedContractOfferInput {
  originAirportId: string;
  destinationAirportId: string;
  archetype: string;
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
}

export interface GeneratedContractBoard {
  generatedAtUtc: string;
  expiresAtUtc: string;
  windowSeed: string;
  generationContextHash: string;
  offers: GeneratedContractOfferInput[];
}

interface ArchetypeProfile {
  archetype: "premium_passenger_charter" | "regional_passenger_run" | "cargo_feeder_haul" | "remote_utility_cargo" | "urgent_special_job";
  targetCount: number;
  minDistanceNm: number;
  maxDistanceNm: number;
  likelyRole: string;
  scoreAirport: (origin: AirportRecord, destination: AirportRecord) => number;
}

const ARCHETYPE_PROFILES: ArchetypeProfile[] = [
  {
    archetype: "premium_passenger_charter",
    targetCount: 3,
    minDistanceNm: 150,
    maxDistanceNm: 1200,
    likelyRole: "light_business_jet",
    scoreAirport: (_origin, destination) =>
      destination.businessScore * 0.45 +
      destination.tourismScore * 0.3 +
      destination.passengerScore * 0.2 +
      (destination.scheduledService ? 12 : 0) +
      ((destination.airportSize ?? 0) >= 4 ? 8 : 0),
  },
  {
    archetype: "regional_passenger_run",
    targetCount: 3,
    minDistanceNm: 80,
    maxDistanceNm: 700,
    likelyRole: "commuter_passenger_turboprop",
    scoreAirport: (_origin, destination) =>
      destination.passengerScore * 0.5 +
      destination.businessScore * 0.2 +
      destination.tourismScore * 0.15 +
      (destination.scheduledService ? 10 : 0) +
      ((destination.airportSize ?? 0) >= 3 ? 6 : 0),
  },
  {
    archetype: "cargo_feeder_haul",
    targetCount: 3,
    minDistanceNm: 100,
    maxDistanceNm: 1000,
    likelyRole: "regional_cargo_turboprop",
    scoreAirport: (_origin, destination) =>
      destination.cargoScore * 0.55 +
      destination.businessScore * 0.15 +
      destination.passengerScore * 0.1 +
      ((destination.longestHardRunwayFt ?? 0) >= 4500 ? 8 : 0),
  },
  {
    archetype: "remote_utility_cargo",
    targetCount: 3,
    minDistanceNm: 50,
    maxDistanceNm: 500,
    likelyRole: "single_engine_utility_cargo",
    scoreAirport: (_origin, destination) =>
      destination.remoteScore * 0.55 +
      destination.cargoScore * 0.25 +
      ((destination.airportSize ?? 0) <= 3 ? 12 : 0),
  },
  {
    archetype: "urgent_special_job",
    targetCount: 2,
    minDistanceNm: 50,
    maxDistanceNm: 900,
    likelyRole: "light_business_jet",
    scoreAirport: (_origin, destination) =>
      Math.max(destination.businessScore, destination.cargoScore, destination.passengerScore) * 0.5 +
      destination.contractGenerationWeight * 20,
  },
];

function stableHash(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function makeSeed(...parts: string[]): string {
  return stableHash(parts.join("|")).toString(16).padStart(8, "0");
}

function randomUnit(seed: string): number {
  return stableHash(seed) / 4294967295;
}

function pickInteger(seed: string, minValue: number, maxValue: number): number {
  const range = maxValue - minValue + 1;
  return minValue + Math.floor(randomUnit(seed) * range);
}

function addHours(utcIsoString: string, hours: number): string {
  const date = new Date(utcIsoString);
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);
  return date.toISOString();
}

function haversineDistanceNm(origin: AirportRecord, destination: AirportRecord): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusNm = 3440.065;
  const deltaLatitude = toRadians(destination.latitudeDeg - origin.latitudeDeg);
  const deltaLongitude = toRadians(destination.longitudeDeg - origin.longitudeDeg);
  const latitudeOne = toRadians(origin.latitudeDeg);
  const latitudeTwo = toRadians(destination.latitudeDeg);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

function deriveFitBucket(companyContext: CompanyContext, likelyRole: string): {
  fitBucket: "flyable_now" | "flyable_with_reposition" | "stretch_growth" | "blocked_now";
  reasonCode: string | undefined;
} {
  if (companyContext.activeAircraftCount <= 0) {
    if (likelyRole === "light_business_jet") {
      return { fitBucket: "blocked_now", reasonCode: "missing_aircraft_role" };
    }

    return { fitBucket: "stretch_growth", reasonCode: "acquire_first_aircraft" };
  }

  if (companyContext.activeStaffingPackageCount <= 0) {
    return { fitBucket: "blocked_now", reasonCode: "missing_staffing_coverage" };
  }

  if (companyContext.activeContractCount >= 4) {
    return { fitBucket: "flyable_with_reposition", reasonCode: "capacity_planning_required" };
  }

  return { fitBucket: "flyable_now", reasonCode: undefined };
}

function deriveDifficultyBand(
  archetype: string,
  distanceNm: number,
  destination: AirportRecord,
): "easy" | "standard" | "challenging" | "hard" {
  const difficultyScore =
    (distanceNm >= 700 ? 2 : distanceNm >= 400 ? 1 : 0) +
    ((destination.airportSize ?? 0) >= 5 ? 1 : 0) +
    (archetype === "urgent_special_job" ? 1 : 0) +
    (archetype === "premium_passenger_charter" ? 1 : 0);

  if (difficultyScore <= 1) {
    return "easy";
  }

  if (difficultyScore === 2) {
    return "standard";
  }

  if (difficultyScore === 3) {
    return "challenging";
  }

  return "hard";
}

function buildPenaltyModel(payoutAmount: number, archetype: string): JsonObject {
  const cancellationPenaltyAmount = Math.round(payoutAmount * 0.14);
  const failurePenaltyAmount = Math.round(payoutAmount * 0.22);
  const lateCompletionPenaltyPercent = archetype === "urgent_special_job" ? 40 : 25;

  return {
    model: "flat_and_percent",
    cancellationPenaltyAmount,
    failurePenaltyAmount,
    lateCompletionPenaltyPercent,
  };
}

function buildPayout(
  archetype: string,
  volumeType: "passenger" | "cargo",
  volumeValue: number,
  distanceNm: number,
  destination: AirportRecord,
  seed: string,
): number {
  const airportDifficultyMultiplier = 1 + ((destination.airportSize ?? 3) - 3) * 0.06;
  const localVariation = 0.93 + randomUnit(`${seed}|variation`) * 0.14;

  if (volumeType === "passenger") {
    const baseRate =
      archetype === "premium_passenger_charter"
        ? 42
        : archetype === "urgent_special_job"
        ? 35
        : 19;
    const volumeFactor = Math.max(1, volumeValue / 10);
    const estimatedCost = 600 + distanceNm * 8 + volumeValue * 28;
    const rawPayout = baseRate * distanceNm * volumeFactor * airportDifficultyMultiplier;
    return Math.max(Math.round(rawPayout * localVariation), Math.round(estimatedCost * 1.25));
  }

  const baseRate =
    archetype === "remote_utility_cargo"
      ? 18
      : archetype === "urgent_special_job"
      ? 22
      : 15;
  const volumeFactor = Math.max(1, volumeValue / 2000);
  const estimatedCost = 500 + distanceNm * 6 + volumeValue * 0.18;
  const rawPayout = baseRate * distanceNm * volumeFactor * airportDifficultyMultiplier;
  return Math.max(Math.round(rawPayout * localVariation), Math.round(estimatedCost * 1.22));
}

function buildOfferExplanation(
  companyContext: CompanyContext,
  originAirport: AirportRecord,
  destination: AirportRecord,
  archetype: string,
  fitBucket: string,
  likelyRole: string,
  difficultyBand: string,
  distanceNm: number,
  earliestStartUtc: string,
  latestCompletionUtc: string,
  reasonCode: string | undefined,
): JsonObject {
  const fitSummary =
    fitBucket === "flyable_now"
      ? "Current company capability can likely operate this contract without expansion."
      : fitBucket === "flyable_with_reposition"
      ? "Current capability likely works, but scheduling and positioning matter."
      : fitBucket === "stretch_growth"
      ? "This looks like near-term growth work if you acquire the right aircraft or staffing."
      : "This contract is intentionally visible to signal a higher-capability lane you do not support yet.";

  return {
    fit_bucket: fitBucket,
    best_fit_role: likelyRole,
    fit_summary: fitSummary,
    risk_summary: `${difficultyBand} operational difficulty over roughly ${Math.round(distanceNm)} nm.`,
    price_driver_summary: `Price is driven by ${archetype}, route distance, and ${destination.name}.`,
    airport_access_summary: `${destination.airportKey} offers runway support around ${destination.longestHardRunwayFt ?? 0} ft.`,
    reposition_summary: `Primary origin is ${originAirport.airportKey} from your current base footprint.`,
    why_now_summary: `Generated from ${companyContext.homeBaseAirportId} based on current company state and airport demand scores.`,
    blocked_reason_code: fitBucket === "blocked_now" ? reasonCode : undefined,
    stretch_reason_code: fitBucket === "stretch_growth" ? reasonCode : undefined,
    local_departure_window_text: `${earliestStartUtc} ${originAirport.timezone ?? 'UTC'}`,
    local_deadline_text: `${latestCompletionUtc} ${destination.timezone ?? 'UTC'}`,
  };
}

function buildOffer(
  companyContext: CompanyContext,
  originAirport: AirportRecord,
  destination: AirportRecord,
  archetypeProfile: ArchetypeProfile,
  windowSeed: string,
): GeneratedContractOfferInput {
  const baseSeed = makeSeed(windowSeed, archetypeProfile.archetype, destination.airportKey);
  const distanceNm = haversineDistanceNm(originAirport, destination);
  const isPassenger =
    archetypeProfile.archetype === "premium_passenger_charter" ||
    archetypeProfile.archetype === "regional_passenger_run" ||
    (archetypeProfile.archetype === "urgent_special_job" &&
      destination.passengerScore + destination.businessScore >= destination.cargoScore + destination.remoteScore);
  const volumeType: "passenger" | "cargo" = isPassenger ? "passenger" : "cargo";
  const passengerCount =
    volumeType === "passenger"
      ? archetypeProfile.archetype === "premium_passenger_charter"
        ? pickInteger(`${baseSeed}|pax`, 4, 12)
        : archetypeProfile.archetype === "urgent_special_job"
        ? pickInteger(`${baseSeed}|pax`, 2, 10)
        : pickInteger(`${baseSeed}|pax`, 8, 36)
      : undefined;
  const cargoWeightLb =
    volumeType === "cargo"
      ? archetypeProfile.archetype === "remote_utility_cargo"
        ? pickInteger(`${baseSeed}|cargo`, 500, 4500)
        : archetypeProfile.archetype === "urgent_special_job"
        ? pickInteger(`${baseSeed}|cargo`, 300, 3500)
        : pickInteger(`${baseSeed}|cargo`, 1200, 10000)
      : undefined;
  const startOffsetHours = pickInteger(`${baseSeed}|start`, 1, 8);
  const earliestStartUtc = addHours(companyContext.currentTimeUtc, startOffsetHours);
  const cruiseSpeed =
    archetypeProfile.likelyRole === "light_business_jet"
      ? 380
      : archetypeProfile.likelyRole === "regional_cargo_turboprop"
      ? 255
      : archetypeProfile.likelyRole === "commuter_passenger_turboprop"
      ? 245
      : 170;
  const baselineHours = Math.max(1, distanceNm / cruiseSpeed);
  const deadlineMultiplier =
    archetypeProfile.archetype === "urgent_special_job"
      ? 1.35
      : archetypeProfile.archetype === "premium_passenger_charter"
      ? 1.75
      : archetypeProfile.archetype === "remote_utility_cargo"
      ? 2.6
      : archetypeProfile.archetype === "cargo_feeder_haul"
      ? 2.35
      : 2.8;
  const bufferHours = archetypeProfile.archetype === "urgent_special_job" ? 1.5 : 3.0;
  const latestCompletionUtc = addHours(
    earliestStartUtc,
    Math.ceil((baselineHours + bufferHours) * deadlineMultiplier),
  );
  const fit = deriveFitBucket(companyContext, archetypeProfile.likelyRole);
  const difficultyBand = deriveDifficultyBand(archetypeProfile.archetype, distanceNm, destination);
  const volumeValue = volumeType === "passenger" ? passengerCount ?? 0 : cargoWeightLb ?? 0;
  const payoutAmount = buildPayout(
    archetypeProfile.archetype,
    volumeType,
    volumeValue,
    distanceNm,
    destination,
    baseSeed,
  );
  const penaltyModel = buildPenaltyModel(payoutAmount, archetypeProfile.archetype);

  return {
    originAirportId: originAirport.airportKey,
    destinationAirportId: destination.airportKey,
    archetype: archetypeProfile.archetype,
    volumeType,
    passengerCount,
    cargoWeightLb,
    earliestStartUtc,
    latestCompletionUtc,
    payoutAmount,
    penaltyModel,
    likelyRole: archetypeProfile.likelyRole,
    difficultyBand,
    explanationMetadata: buildOfferExplanation(
      companyContext,
      originAirport,
      destination,
      archetypeProfile.archetype,
      fit.fitBucket,
      archetypeProfile.likelyRole,
      difficultyBand,
      distanceNm,
      earliestStartUtc,
      latestCompletionUtc,
      fit.reasonCode,
    ),
    generatedSeed: baseSeed,
  };
}

function buildGenerationContextHash(companyContext: CompanyContext): string {
  return makeSeed(
    companyContext.companyId,
    companyContext.homeBaseAirportId,
    String(companyContext.activeAircraftCount),
    String(companyContext.activeStaffingPackageCount),
    companyContext.financialPressureBand,
    companyContext.companyPhase,
    String(companyContext.activeContractCount),
  );
}

export function generateContractBoard(
  companyContext: CompanyContext,
  originAirport: AirportRecord,
  candidateAirports: AirportRecord[],
  refreshReason: string,
): GeneratedContractBoard {
  const windowSeed = makeSeed(
    companyContext.worldSeed,
    companyContext.companyId,
    companyContext.currentTimeUtc.slice(0, 13),
    refreshReason,
    originAirport.airportKey,
  );
  const generationContextHash = buildGenerationContextHash(companyContext);
  const destinationUsage = new Map<string, number>();
  const offers: GeneratedContractOfferInput[] = [];

  for (const archetypeProfile of ARCHETYPE_PROFILES) {
    const scoredCandidates = candidateAirports
      .map((candidate) => {
        const distanceNm = haversineDistanceNm(originAirport, candidate);

        if (distanceNm < archetypeProfile.minDistanceNm || distanceNm > archetypeProfile.maxDistanceNm) {
          return null;
        }

        const seed = makeSeed(windowSeed, archetypeProfile.archetype, candidate.airportKey);
        const archetypeScore = archetypeProfile.scoreAirport(originAirport, candidate);
        const relevanceScore =
          archetypeScore +
          candidate.contractGenerationWeight * 12 +
          randomUnit(`${seed}|noise`) * 5 +
          (candidate.marketRegion === originAirport.marketRegion ? 6 : 0) +
          (candidate.isoCountry === originAirport.isoCountry ? 4 : 0);

        return { candidate, relevanceScore };
      })
      .filter((entry): entry is { candidate: AirportRecord; relevanceScore: number } => entry != null)
      .sort(
        (left, right) =>
          right.relevanceScore - left.relevanceScore ||
          left.candidate.airportKey.localeCompare(right.candidate.airportKey),
      );

    let addedForProfile = 0;

    for (const scoredCandidate of scoredCandidates) {
      const usageCount = destinationUsage.get(scoredCandidate.candidate.airportKey) ?? 0;

      if (usageCount >= 2) {
        continue;
      }

      offers.push(buildOffer(companyContext, originAirport, scoredCandidate.candidate, archetypeProfile, windowSeed));
      destinationUsage.set(scoredCandidate.candidate.airportKey, usageCount + 1);
      addedForProfile += 1;

      if (addedForProfile >= archetypeProfile.targetCount) {
        break;
      }
    }
  }

  return {
    generatedAtUtc: companyContext.currentTimeUtc,
    expiresAtUtc: addHours(companyContext.currentTimeUtc, 12),
    windowSeed,
    generationContextHash,
    offers,
  };
}
