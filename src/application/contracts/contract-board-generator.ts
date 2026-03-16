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
  archetype: "premium_passenger_charter" | "regional_passenger_run" | "cargo_feeder_haul" | "remote_utility_cargo" | "urgent_special_job" | "mainline_passenger_lane" | "longhaul_passenger_service" | "medium_freighter_linehaul" | "heavy_freighter_longhaul";
  targetCount: number;
  minDistanceNm: number;
  maxDistanceNm: number;
  likelyRole: string;
  scoreAirport: (origin: AirportRecord, destination: AirportRecord) => number;
}

interface RouteCandidate {
  origin: AirportRecord;
  destination: AirportRecord;
  relevanceScore: number;
}

const ARCHETYPE_PROFILES: ArchetypeProfile[] = [
  {
    archetype: "premium_passenger_charter",
    targetCount: 56,
    minDistanceNm: 150,
    maxDistanceNm: 1600,
    likelyRole: "light_business_jet",
    scoreAirport: (_origin, destination) =>
      destination.businessScore * 0.5 +
      destination.tourismScore * 0.26 +
      destination.passengerScore * 0.18 +
      (destination.scheduledService ? 10 : 0) +
      ((destination.airportSize ?? 0) >= 4 ? 10 : 0),
  },
  {
    archetype: "regional_passenger_run",
    targetCount: 120,
    minDistanceNm: 80,
    maxDistanceNm: 900,
    likelyRole: "commuter_passenger_turboprop",
    scoreAirport: (origin, destination) =>
      destination.passengerScore * 0.52 +
      destination.businessScore * 0.18 +
      destination.tourismScore * 0.14 +
      (destination.scheduledService ? 12 : 0) +
      (destination.marketRegion === origin.marketRegion ? 8 : 0) +
      ((destination.airportSize ?? 0) >= 3 ? 6 : 0),
  },
  {
    archetype: "cargo_feeder_haul",
    targetCount: 88,
    minDistanceNm: 120,
    maxDistanceNm: 1400,
    likelyRole: "regional_cargo_turboprop",
    scoreAirport: (origin, destination) =>
      destination.cargoScore * 0.56 +
      destination.businessScore * 0.16 +
      destination.passengerScore * 0.08 +
      (destination.marketRegion === origin.marketRegion ? 5 : 0) +
      ((destination.longestHardRunwayFt ?? 0) >= 4500 ? 8 : 0),
  },
  {
    archetype: "remote_utility_cargo",
    targetCount: 56,
    minDistanceNm: 45,
    maxDistanceNm: 650,
    likelyRole: "single_engine_utility_cargo",
    scoreAirport: (_origin, destination) =>
      destination.remoteScore * 0.55 +
      destination.cargoScore * 0.25 +
      ((destination.airportSize ?? 0) <= 3 ? 14 : 0) +
      (!destination.scheduledService ? 6 : 0),
  },
  {
    archetype: "urgent_special_job",
    targetCount: 36,
    minDistanceNm: 60,
    maxDistanceNm: 1200,
    likelyRole: "light_business_jet",
    scoreAirport: (_origin, destination) =>
      Math.max(destination.businessScore, destination.cargoScore, destination.passengerScore) * 0.48 +
      destination.contractGenerationWeight * 18,
  },  {
    archetype: "mainline_passenger_lane",
    targetCount: 96,
    minDistanceNm: 180,
    maxDistanceNm: 2200,
    likelyRole: "narrowbody_airliner",
    scoreAirport: (origin, destination) =>
      destination.passengerScore * 0.5 +
      destination.businessScore * 0.2 +
      destination.tourismScore * 0.1 +
      (destination.scheduledService ? 14 : 0) +
      (destination.marketRegion === origin.marketRegion ? 5 : 0) +
      ((destination.airportSize ?? 0) >= 4 ? 10 : 0) +
      ((destination.longestHardRunwayFt ?? 0) >= 6500 ? 8 : 0),
  },
  {
    archetype: "longhaul_passenger_service",
    targetCount: 28,
    minDistanceNm: 1400,
    maxDistanceNm: 5200,
    likelyRole: "widebody_airliner",
    scoreAirport: (_origin, destination) =>
      destination.passengerScore * 0.44 +
      destination.businessScore * 0.24 +
      destination.tourismScore * 0.14 +
      (destination.scheduledService ? 18 : 0) +
      ((destination.airportSize ?? 0) >= 4 ? 12 : 0) +
      ((destination.longestHardRunwayFt ?? 0) >= 8500 ? 12 : 0),
  },
  {
    archetype: "medium_freighter_linehaul",
    targetCount: 72,
    minDistanceNm: 180,
    maxDistanceNm: 2600,
    likelyRole: "medium_freighter",
    scoreAirport: (origin, destination) =>
      destination.cargoScore * 0.6 +
      destination.businessScore * 0.14 +
      destination.passengerScore * 0.06 +
      (destination.marketRegion === origin.marketRegion ? 4 : 0) +
      ((destination.airportSize ?? 0) >= 4 ? 8 : 0) +
      ((destination.longestHardRunwayFt ?? 0) >= 6000 ? 10 : 0),
  },
  {
    archetype: "heavy_freighter_longhaul",
    targetCount: 20,
    minDistanceNm: 1200,
    maxDistanceNm: 5200,
    likelyRole: "heavy_freighter",
    scoreAirport: (_origin, destination) =>
      destination.cargoScore * 0.64 +
      destination.businessScore * 0.18 +
      (destination.scheduledService ? 4 : 0) +
      ((destination.airportSize ?? 0) >= 4 ? 8 : 0) +
      ((destination.longestHardRunwayFt ?? 0) >= 8000 ? 14 : 0),
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

function uniqueAirports(airports: AirportRecord[]): AirportRecord[] {
  const seen = new Map<string, AirportRecord>();

  for (const airport of airports) {
    if (!seen.has(airport.airportKey)) {
      seen.set(airport.airportKey, airport);
    }
  }

  return [...seen.values()];
}

function scoreOriginOpportunity(homeBase: AirportRecord, candidate: AirportRecord, seed: string): number {
  return (
    candidate.contractGenerationWeight * 20 +
    Math.max(candidate.passengerScore, candidate.cargoScore, candidate.businessScore, candidate.remoteScore) * 0.42 +
    (candidate.marketRegion === homeBase.marketRegion ? 12 : 0) +
    (candidate.isoCountry === homeBase.isoCountry ? 8 : 0) +
    (candidate.continent === homeBase.continent ? 5 : 0) +
    (candidate.scheduledService ? 6 : 0) +
    ((candidate.airportSize ?? 3) * 2) +
    randomUnit(`${seed}|origin_noise`) * 5
  );
}

function selectOriginPool(
  footprintOrigins: AirportRecord[],
  candidateAirports: AirportRecord[],
  windowSeed: string,
): AirportRecord[] {
  const anchors = uniqueAirports(footprintOrigins.filter((airport) => airport.accessibleNow));
  const homeBase = anchors[0] ?? candidateAirports[0];

  if (!homeBase) {
    return [];
  }

  const selected = new Map<string, AirportRecord>(anchors.map((airport) => [airport.airportKey, airport]));
  const remaining = candidateAirports.filter((airport) => !selected.has(airport.airportKey));

  const addBucket = (
    bucketLabel: string,
    items: AirportRecord[],
    takeCount: number,
  ): void => {
    const scored = items
      .map((candidate) => ({
        candidate,
        score: scoreOriginOpportunity(homeBase, candidate, `${windowSeed}|${bucketLabel}|${candidate.airportKey}`),
      }))
      .sort(
        (left, right) =>
          right.score - left.score || left.candidate.airportKey.localeCompare(right.candidate.airportKey),
      );

    let added = 0;
    for (const entry of scored) {
      if (selected.has(entry.candidate.airportKey)) {
        continue;
      }

      selected.set(entry.candidate.airportKey, entry.candidate);
      added += 1;

      if (added >= takeCount || selected.size >= 72) {
        break;
      }
    }
  };

  addBucket(
    "regional",
    remaining.filter((airport) => airport.marketRegion && airport.marketRegion === homeBase.marketRegion),
    18,
  );
  addBucket(
    "country",
    remaining.filter(
      (airport) => airport.isoCountry && airport.isoCountry === homeBase.isoCountry && airport.marketRegion !== homeBase.marketRegion,
    ),
    14,
  );
  addBucket(
    "continent",
    remaining.filter(
      (airport) => airport.continent && airport.continent === homeBase.continent && airport.isoCountry !== homeBase.isoCountry,
    ),
    12,
  );
  addBucket("global", remaining, 28);

  return [...selected.values()];
}

function deriveFitBucket(
  companyContext: CompanyContext,
  likelyRole: string,
  originAirport: AirportRecord,
  footprintOriginIds: Set<string>,
): {
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

  if (["narrowbody_airliner", "medium_freighter"].includes(likelyRole) && companyContext.companyPhase === "startup") {
    return { fitBucket: "stretch_growth", reasonCode: "fleet_class_upgrade" };
  }

  if (["widebody_airliner", "heavy_freighter"].includes(likelyRole) && ["startup", "regional"].includes(companyContext.companyPhase)) {
    return { fitBucket: "blocked_now", reasonCode: "fleet_class_out_of_scope" };
  }

  if (likelyRole === "light_business_jet" && companyContext.companyPhase === "startup") {
    return { fitBucket: "stretch_growth", reasonCode: "premium_lane_upgrade" };
  }

  if (!footprintOriginIds.has(originAirport.airportKey)) {
    return { fitBucket: "flyable_with_reposition", reasonCode: "origin_outside_network" };
  }

  if (companyContext.activeContractCount >= 8) {
    return { fitBucket: "flyable_with_reposition", reasonCode: "capacity_planning_required" };
  }

  return { fitBucket: "flyable_now", reasonCode: undefined };
}

function deriveDifficultyBand(
  archetype: string,
  distanceNm: number,
  origin: AirportRecord,
  destination: AirportRecord,
): "easy" | "standard" | "challenging" | "hard" {
  const difficultyScore =
    (distanceNm >= 1100 ? 2 : distanceNm >= 650 ? 1 : 0) +
    (((origin.airportSize ?? 0) >= 5 || (destination.airportSize ?? 0) >= 5) ? 1 : 0) +
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
        : archetype === "mainline_passenger_lane"
        ? 23
        : archetype === "longhaul_passenger_service"
        ? 27
        : 19;
    const volumeFactor = Math.max(
      1,
      volumeValue /
        (archetype === "longhaul_passenger_service"
          ? 140
          : archetype === "mainline_passenger_lane"
          ? 80
          : 10),
    );
    const estimatedCost =
      600 +
      distanceNm *
        (archetype === "longhaul_passenger_service"
          ? 26
          : archetype === "mainline_passenger_lane"
          ? 18
          : 8) +
      volumeValue *
        (archetype === "longhaul_passenger_service"
          ? 62
          : archetype === "mainline_passenger_lane"
          ? 48
          : 28);
    const rawPayout = baseRate * distanceNm * volumeFactor * airportDifficultyMultiplier;
    return Math.max(Math.round(rawPayout * localVariation), Math.round(estimatedCost * 1.25));
  }

  const baseRate =
    archetype === "remote_utility_cargo"
      ? 18
      : archetype === "urgent_special_job"
      ? 22
      : archetype === "medium_freighter_linehaul"
      ? 20
      : archetype === "heavy_freighter_longhaul"
      ? 24
      : 15;
  const volumeFactor = Math.max(
    1,
    volumeValue /
      (archetype === "heavy_freighter_longhaul"
        ? 12000
        : archetype === "medium_freighter_linehaul"
        ? 5000
        : 2000),
  );
  const estimatedCost =
    500 +
    distanceNm *
      (archetype === "heavy_freighter_longhaul"
        ? 18
        : archetype === "medium_freighter_linehaul"
        ? 11
        : 6) +
    volumeValue *
      (archetype === "heavy_freighter_longhaul"
        ? 0.24
        : archetype === "medium_freighter_linehaul"
        ? 0.22
        : 0.18);
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
  footprintOriginIds: Set<string>,
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
    reposition_summary: footprintOriginIds.has(originAirport.airportKey)
      ? `${originAirport.airportKey} is already inside your current operating footprint.`
      : `${originAirport.airportKey} sits outside your current footprint, so positioning is likely required.`,
    why_now_summary: `Generated from your current network footprint plus a wider persistent market around ${companyContext.homeBaseAirportId}.`,
    blocked_reason_code: fitBucket === "blocked_now" ? reasonCode : undefined,
    stretch_reason_code: fitBucket === "stretch_growth" ? reasonCode : undefined,
    local_departure_window_text: `${earliestStartUtc} ${originAirport.timezone ?? "UTC"}`,
    local_deadline_text: `${latestCompletionUtc} ${destination.timezone ?? "UTC"}`,
  };
}

function buildOffer(
  companyContext: CompanyContext,
  originAirport: AirportRecord,
  destination: AirportRecord,
  archetypeProfile: ArchetypeProfile,
  windowSeed: string,
  footprintOriginIds: Set<string>,
): GeneratedContractOfferInput {
  const baseSeed = makeSeed(windowSeed, archetypeProfile.archetype, originAirport.airportKey, destination.airportKey);
  const distanceNm = haversineDistanceNm(originAirport, destination);
  const isPassenger =
    archetypeProfile.archetype === "premium_passenger_charter" ||
    archetypeProfile.archetype === "regional_passenger_run" ||
    archetypeProfile.archetype === "mainline_passenger_lane" ||
    archetypeProfile.archetype === "longhaul_passenger_service" ||
    (archetypeProfile.archetype === "urgent_special_job" &&
      destination.passengerScore + destination.businessScore >= destination.cargoScore + destination.remoteScore);
  const volumeType: "passenger" | "cargo" = isPassenger ? "passenger" : "cargo";
  const passengerCount =
    volumeType === "passenger"
      ? archetypeProfile.archetype === "premium_passenger_charter"
        ? pickInteger(`${baseSeed}|pax`, 4, 12)
        : archetypeProfile.archetype === "urgent_special_job"
        ? pickInteger(`${baseSeed}|pax`, 2, 10)
        : archetypeProfile.archetype === "mainline_passenger_lane"
        ? pickInteger(`${baseSeed}|pax`, 70, 180)
        : archetypeProfile.archetype === "longhaul_passenger_service"
        ? pickInteger(`${baseSeed}|pax`, 180, 330)
        : pickInteger(`${baseSeed}|pax`, 8, 36)
      : undefined;
  const cargoWeightLb =
    volumeType === "cargo"
      ? archetypeProfile.archetype === "remote_utility_cargo"
        ? pickInteger(`${baseSeed}|cargo`, 500, 4500)
        : archetypeProfile.archetype === "urgent_special_job"
        ? pickInteger(`${baseSeed}|cargo`, 300, 3500)
        : archetypeProfile.archetype === "medium_freighter_linehaul"
        ? pickInteger(`${baseSeed}|cargo`, 6000, 35000)
        : archetypeProfile.archetype === "heavy_freighter_longhaul"
        ? pickInteger(`${baseSeed}|cargo`, 25000, 100000)
        : pickInteger(`${baseSeed}|cargo`, 1200, 10000)
      : undefined;
  const startOffsetHours = pickInteger(`${baseSeed}|start`, 1, 8);
  const earliestStartUtc = addHours(companyContext.currentTimeUtc, startOffsetHours);
  const cruiseSpeed =
    archetypeProfile.likelyRole === "light_business_jet"
      ? 430
      : archetypeProfile.likelyRole === "single_engine_utility_cargo"
      ? 170
      : archetypeProfile.likelyRole === "regional_cargo_turboprop"
      ? 255
      : archetypeProfile.likelyRole === "commuter_passenger_turboprop"
      ? 245
      : archetypeProfile.likelyRole === "narrowbody_airliner"
      ? 450
      : archetypeProfile.likelyRole === "widebody_airliner"
      ? 470
      : archetypeProfile.likelyRole === "medium_freighter"
      ? 410
      : archetypeProfile.likelyRole === "heavy_freighter"
      ? 460
      : 220;
  const baselineHours = Math.max(1, distanceNm / cruiseSpeed);
  const deadlineMultiplier =
    archetypeProfile.archetype === "urgent_special_job"
      ? 1.35
      : archetypeProfile.archetype === "premium_passenger_charter"
      ? 1.75
      : archetypeProfile.archetype === "mainline_passenger_lane"
      ? 2.2
      : archetypeProfile.archetype === "longhaul_passenger_service"
      ? 2.0
      : archetypeProfile.archetype === "medium_freighter_linehaul"
      ? 2.15
      : archetypeProfile.archetype === "heavy_freighter_longhaul"
      ? 1.95
      : archetypeProfile.archetype === "remote_utility_cargo"
      ? 2.6
      : archetypeProfile.archetype === "cargo_feeder_haul"
      ? 2.35
      : 2.8;
  const bufferHours =
    archetypeProfile.archetype === "urgent_special_job"
      ? 1.5
      : archetypeProfile.archetype === "longhaul_passenger_service" ||
          archetypeProfile.archetype === "heavy_freighter_longhaul"
      ? 6.0
      : archetypeProfile.archetype === "mainline_passenger_lane" ||
          archetypeProfile.archetype === "medium_freighter_linehaul"
      ? 4.5
      : 3.0;
  const latestCompletionUtc = addHours(
    earliestStartUtc,
    Math.ceil((baselineHours + bufferHours) * deadlineMultiplier),
  );
  const fit = deriveFitBucket(companyContext, archetypeProfile.likelyRole, originAirport, footprintOriginIds);
  const difficultyBand = deriveDifficultyBand(archetypeProfile.archetype, distanceNm, originAirport, destination);
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
      footprintOriginIds,
    ),
    generatedSeed: baseSeed,
  };
}

function buildGenerationContextHash(companyContext: CompanyContext, footprintOrigins: AirportRecord[]): string {
  return makeSeed(
    companyContext.companyId,
    companyContext.homeBaseAirportId,
    String(companyContext.activeAircraftCount),
    String(companyContext.activeStaffingPackageCount),
    companyContext.financialPressureBand,
    companyContext.companyPhase,
    String(companyContext.activeContractCount),
    ...footprintOrigins.map((airport) => airport.airportKey),
  );
}

function buildRouteCandidates(
  profile: ArchetypeProfile,
  originPool: AirportRecord[],
  candidateAirports: AirportRecord[],
  homeBase: AirportRecord,
  footprintOriginIds: Set<string>,
  originPoolIds: Set<string>,
  windowSeed: string,
): RouteCandidate[] {
  const candidates: RouteCandidate[] = [];
  const idealDistanceNm = (profile.minDistanceNm + profile.maxDistanceNm) / 2;
  const maxDistanceSpan = Math.max(1, profile.maxDistanceNm - profile.minDistanceNm);

  for (const origin of originPool) {
    for (const destination of candidateAirports) {
      if (origin.airportKey === destination.airportKey) {
        continue;
      }

      const distanceNm = haversineDistanceNm(origin, destination);
      if (distanceNm < profile.minDistanceNm || distanceNm > profile.maxDistanceNm) {
        continue;
      }

      const seed = makeSeed(windowSeed, profile.archetype, origin.airportKey, destination.airportKey);
      const distanceFit = 1 - Math.min(Math.abs(distanceNm - idealDistanceNm) / maxDistanceSpan, 1);
      const routeScore =
        profile.scoreAirport(origin, destination) +
        origin.contractGenerationWeight * 4 +
        destination.contractGenerationWeight * 8 +
        distanceFit * 14 +
        (footprintOriginIds.has(origin.airportKey) ? 12 : 0) +
        (originPoolIds.has(destination.airportKey) ? 11 : 0) +
        (footprintOriginIds.has(destination.airportKey) ? 10 : 0) +
        (destination.airportKey === homeBase.airportKey ? 10 : 0) +
        (origin.airportKey === homeBase.airportKey ? 6 : 0) +
        (destination.marketRegion === origin.marketRegion ? 6 : 0) +
        (destination.isoCountry === origin.isoCountry ? 4 : 0) +
        randomUnit(`${seed}|route_noise`) * 6;

      candidates.push({ origin, destination, relevanceScore: routeScore });
    }
  }

  return candidates.sort(
    (left, right) =>
      right.relevanceScore - left.relevanceScore ||
      left.origin.airportKey.localeCompare(right.origin.airportKey) ||
      left.destination.airportKey.localeCompare(right.destination.airportKey),
  );
}

export function generateContractBoard(
  companyContext: CompanyContext,
  footprintOrigins: AirportRecord[],
  candidateAirports: AirportRecord[],
  refreshReason: string,
): GeneratedContractBoard {
  const uniqueFootprintOrigins = uniqueAirports(footprintOrigins);
  const uniqueCandidates = uniqueAirports([
    ...uniqueFootprintOrigins,
    ...candidateAirports,
  ]);
  const footprintHashInput = uniqueFootprintOrigins.map((airport) => airport.airportKey).join(",");
  const windowSeed = makeSeed(
    companyContext.worldSeed,
    companyContext.companyId,
    companyContext.currentTimeUtc.slice(0, 13),
    refreshReason,
    footprintHashInput || companyContext.homeBaseAirportId,
  );
  const homeBase = uniqueFootprintOrigins[0] ?? uniqueCandidates[0];
  const originPool = homeBase ? selectOriginPool(uniqueFootprintOrigins, uniqueCandidates, windowSeed) : [];
  const footprintOriginIds = new Set(uniqueFootprintOrigins.map((airport) => airport.airportKey));
  const originPoolIds = new Set(originPool.map((airport) => airport.airportKey));
  const generationContextHash = buildGenerationContextHash(companyContext, uniqueFootprintOrigins);
  const offers: GeneratedContractOfferInput[] = [];
  const routeUsage = new Map<string, number>();
  const originUsage = new Map<string, number>();
  const destinationUsage = new Map<string, number>();
  const targetOfferCount = ARCHETYPE_PROFILES.reduce((sum, profile) => sum + profile.targetCount, 0);
  const originCap = Math.max(12, Math.ceil(targetOfferCount / Math.max(originPool.length, 1)) + 8);
  const destinationCap = 72;

  if (!homeBase || originPool.length === 0 || uniqueCandidates.length === 0) {
    return {
      generatedAtUtc: companyContext.currentTimeUtc,
      expiresAtUtc: addHours(companyContext.currentTimeUtc, 12),
      windowSeed,
      generationContextHash,
      offers,
    };
  }

  for (const archetypeProfile of ARCHETYPE_PROFILES) {
    const scoredCandidates = buildRouteCandidates(
      archetypeProfile,
      originPool,
      uniqueCandidates,
      homeBase,
      footprintOriginIds,
      originPoolIds,
      windowSeed,
    );

    let addedForProfile = 0;

    for (const candidate of scoredCandidates) {
      const pairKey = `${candidate.origin.airportKey}:${candidate.destination.airportKey}`;
      const pairUsage = routeUsage.get(pairKey) ?? 0;
      const originCount = originUsage.get(candidate.origin.airportKey) ?? 0;
      const destinationCount = destinationUsage.get(candidate.destination.airportKey) ?? 0;

      if (pairUsage >= 4 || originCount >= originCap || destinationCount >= destinationCap) {
        continue;
      }

      offers.push(buildOffer(companyContext, candidate.origin, candidate.destination, archetypeProfile, windowSeed, footprintOriginIds));
      routeUsage.set(pairKey, pairUsage + 1);
      originUsage.set(candidate.origin.airportKey, originCount + 1);
      destinationUsage.set(candidate.destination.airportKey, destinationCount + 1);
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



