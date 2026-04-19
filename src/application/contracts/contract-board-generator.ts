/*
 * Generates the live contract board from company phase, airport network, aircraft capability, and timing constraints.
 * This is where contract supply is shaped into offers that the player can actually browse and accept.
 * The important mental model is "broad market first, then fit annotations": it creates a large market, then marks
 * what is flyable now, what is only strategically interesting, and what is blocked by the current company state.
 */

import type { JsonObject } from "../../domain/common/primitives.js";
import {
  buildContractUrgencyBand,
  resolveDynamicContractOfferPayoutAmount,
  resolveContractUrgencyPayoutMultiplier,
} from "../../domain/contracts/urgency.js";
import type { AirportRecord } from "../../infrastructure/reference/airport-reference.js";
import type { CompanyContext } from "../queries/company-state.js";
import { contractBoardGenerationProfileVersion } from "./contract-board-generation-profile.js";

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

export interface ContractBoardGenerationFleetAircraftInput {
  currentAirportId: string;
  activeCabinSeats: number | undefined;
  activeCabinCargoCapacityLb: number | undefined;
  minimumAirportSize: number;
  minimumRunwayFt: number;
  rangeNm: number;
  maxPassengers: number;
  maxCargoLb: number;
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

interface FleetMarketBias {
  hasFleet: boolean;
  aircraft: ContractBoardGenerationFleetAircraftInput[];
  currentAirportIds: Set<string>;
  regionPresence: Map<string, number>;
  countryPresence: Map<string, number>;
  continentPresence: Map<string, number>;
  airportCompatibilityById: Map<string, number>;
  roleStrengthByRole: Map<string, number>;
  averageRoleStrength: number;
  passengerStrength: number;
  cargoStrength: number;
  maxRangeNm: number;
  averageRangeNm: number;
}

function readContractBoardTargetScale(): number {
  const rawValue = process.env.FLIGHTLINE_CONTRACT_BOARD_TARGET_SCALE?.trim();
  if (!rawValue) {
    return 6;
  }

  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(0.05, parsed);
}

function scaledTargetCount(targetCount: number, targetScale: number): number {
  if (targetScale === 1) {
    return targetCount;
  }

  return Math.max(1, Math.round(targetCount * targetScale));
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

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolveAircraftSeatCapacity(aircraft: ContractBoardGenerationFleetAircraftInput): number {
  return Math.max(0, Math.min(aircraft.activeCabinSeats ?? aircraft.maxPassengers, aircraft.maxPassengers));
}

function resolveAircraftCargoCapacityLb(aircraft: ContractBoardGenerationFleetAircraftInput): number {
  return Math.max(0, Math.min(aircraft.activeCabinCargoCapacityLb ?? aircraft.maxCargoLb, aircraft.maxCargoLb));
}

function incrementPresence(map: Map<string, number>, key: string | null | undefined): void {
  if (!key) {
    return;
  }

  map.set(key, (map.get(key) ?? 0) + 1);
}

function resolvePresenceWeight(map: Map<string, number>, key: string | null | undefined): number {
  if (!key) {
    return 0;
  }

  const count = map.get(key) ?? 0;
  if (count <= 0) {
    return 0;
  }

  return Math.min(1.4, 0.35 + (count - 1) * 0.28);
}

function aircraftCanAccessAirport(
  aircraft: ContractBoardGenerationFleetAircraftInput,
  airport: AirportRecord,
): boolean {
  if (!airport.accessibleNow) {
    return false;
  }

  if (airport.airportSize !== undefined && airport.airportSize !== null && airport.airportSize < aircraft.minimumAirportSize) {
    return false;
  }

  if (airport.longestHardRunwayFt !== undefined && airport.longestHardRunwayFt < aircraft.minimumRunwayFt) {
    return false;
  }

  return true;
}

function resolveAircraftRoleAffinity(
  aircraft: ContractBoardGenerationFleetAircraftInput,
  likelyRole: string,
): number {
  const seatCapacity = resolveAircraftSeatCapacity(aircraft);
  const cargoCapacity = resolveAircraftCargoCapacityLb(aircraft);

  switch (likelyRole) {
    case "light_business_jet":
      if (seatCapacity < 4) {
        return 0;
      }
      return (seatCapacity <= 16 ? 1 : 0.55)
        + (aircraft.rangeNm >= 1200 ? 0.35 : aircraft.rangeNm >= 800 ? 0.15 : 0)
        + (aircraft.minimumRunwayFt <= 5500 ? 0.15 : 0);
    case "commuter_passenger_turboprop":
      if (seatCapacity < 6) {
        return 0;
      }
      return (seatCapacity <= 50 ? 1.05 : 0.75)
        + (aircraft.minimumRunwayFt <= 4500 ? 0.25 : 0.1)
        + (aircraft.rangeNm >= 600 ? 0.2 : 0);
    case "regional_cargo_turboprop":
      if (cargoCapacity < 1_200) {
        return 0;
      }
      return (cargoCapacity >= 8_000 ? 1.2 : cargoCapacity >= 3_000 ? 1.05 : 0.8)
        + (aircraft.minimumRunwayFt <= 5000 ? 0.2 : 0.08)
        + (aircraft.rangeNm >= 700 ? 0.18 : 0);
    case "single_engine_utility_cargo":
      if (cargoCapacity < 500) {
        return 0;
      }
      return (cargoCapacity >= 3_000 ? 1.15 : 0.85)
        + (aircraft.minimumRunwayFt <= 3200 ? 0.3 : aircraft.minimumRunwayFt <= 4500 ? 0.15 : 0)
        + (aircraft.rangeNm >= 350 ? 0.12 : 0);
    case "narrowbody_airliner":
      if (seatCapacity < 60) {
        return 0;
      }
      return (seatCapacity >= 140 ? 1.2 : 0.95)
        + (aircraft.rangeNm >= 1800 ? 0.2 : 0.08)
        + (aircraft.minimumRunwayFt <= 7500 ? 0.1 : 0);
    case "widebody_airliner":
      if (seatCapacity < 160) {
        return 0;
      }
      return (seatCapacity >= 250 ? 1.25 : 1.0)
        + (aircraft.rangeNm >= 3200 ? 0.3 : aircraft.rangeNm >= 2200 ? 0.12 : 0)
        + (aircraft.minimumRunwayFt <= 9000 ? 0.12 : 0);
    case "medium_freighter":
      if (cargoCapacity < 8_000) {
        return 0;
      }
      return (cargoCapacity >= 35_000 ? 1.25 : cargoCapacity >= 15_000 ? 1.0 : 0.85)
        + (aircraft.rangeNm >= 1800 ? 0.2 : 0.08)
        + (aircraft.minimumRunwayFt <= 8000 ? 0.1 : 0);
    case "heavy_freighter":
      if (cargoCapacity < 40_000) {
        return 0;
      }
      return (cargoCapacity >= 120_000 ? 1.35 : 1.0)
        + (aircraft.rangeNm >= 3200 ? 0.28 : aircraft.rangeNm >= 2400 ? 0.14 : 0)
        + (aircraft.minimumRunwayFt <= 9500 ? 0.1 : 0);
    default:
      return 0;
  }
}

function isPassengerFocusedArchetype(archetype: ArchetypeProfile["archetype"]): boolean {
  return [
    "premium_passenger_charter",
    "regional_passenger_run",
    "mainline_passenger_lane",
    "longhaul_passenger_service",
  ].includes(archetype);
}

function isCargoFocusedArchetype(archetype: ArchetypeProfile["archetype"]): boolean {
  return [
    "cargo_feeder_haul",
    "remote_utility_cargo",
    "medium_freighter_linehaul",
    "heavy_freighter_longhaul",
  ].includes(archetype);
}

function buildFleetCapabilityFingerprint(fleetAircraft: ContractBoardGenerationFleetAircraftInput[]): string {
  return fleetAircraft
    .map((aircraft) => [
      aircraft.currentAirportId,
      resolveAircraftSeatCapacity(aircraft),
      resolveAircraftCargoCapacityLb(aircraft),
      aircraft.rangeNm,
      aircraft.minimumRunwayFt,
      aircraft.minimumAirportSize,
    ].join(":"))
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

function buildFleetMarketBias(
  footprintOrigins: AirportRecord[],
  candidateAirports: AirportRecord[],
  fleetAircraft: ContractBoardGenerationFleetAircraftInput[],
): FleetMarketBias {
  const airportLookup = new Map<string, AirportRecord>(
    uniqueAirports([...footprintOrigins, ...candidateAirports]).map((airport) => [airport.airportKey, airport]),
  );
  const fleetPresenceAirports = uniqueAirports(
    fleetAircraft
      .map((aircraft) => airportLookup.get(aircraft.currentAirportId))
      .filter((airport): airport is AirportRecord => airport != null && airport.accessibleNow),
  );
  const fallbackPresenceAirports = uniqueAirports(footprintOrigins.filter((airport) => airport.accessibleNow));
  const presenceAirports = fleetPresenceAirports.length > 0 ? fleetPresenceAirports : fallbackPresenceAirports;
  const currentAirportIds = new Set(fleetPresenceAirports.map((airport) => airport.airportKey));
  const regionPresence = new Map<string, number>();
  const countryPresence = new Map<string, number>();
  const continentPresence = new Map<string, number>();

  for (const airport of presenceAirports) {
    incrementPresence(regionPresence, airport.marketRegion);
    incrementPresence(countryPresence, airport.isoCountry);
    incrementPresence(continentPresence, airport.continent);
  }

  const airportCompatibilityById = new Map<string, number>();
  for (const airport of airportLookup.values()) {
    if (fleetAircraft.length === 0) {
      airportCompatibilityById.set(airport.airportKey, 0);
      continue;
    }

    const compatibleCount = fleetAircraft.filter((aircraft) => aircraftCanAccessAirport(aircraft, airport)).length;
    airportCompatibilityById.set(airport.airportKey, compatibleCount / fleetAircraft.length);
  }

  const likelyRoles = [...new Set(ARCHETYPE_PROFILES.map((profile) => profile.likelyRole))];
  const roleStrengthByRole = new Map<string, number>();
  for (const likelyRole of likelyRoles) {
    roleStrengthByRole.set(
      likelyRole,
      fleetAircraft.reduce((sum, aircraft) => sum + resolveAircraftRoleAffinity(aircraft, likelyRole), 0),
    );
  }

  const averageRoleStrength = likelyRoles.length > 0
    ? likelyRoles.reduce((sum, likelyRole) => sum + (roleStrengthByRole.get(likelyRole) ?? 0), 0) / likelyRoles.length
    : 0;
  const passengerStrength = fleetAircraft.reduce((sum, aircraft) => sum + Math.sqrt(resolveAircraftSeatCapacity(aircraft)), 0);
  const cargoStrength = fleetAircraft.reduce((sum, aircraft) => sum + Math.sqrt(resolveAircraftCargoCapacityLb(aircraft) / 800), 0);
  const maxRangeNm = fleetAircraft.length > 0 ? Math.max(...fleetAircraft.map((aircraft) => aircraft.rangeNm)) : 0;
  const averageRangeNm = fleetAircraft.length > 0
    ? fleetAircraft.reduce((sum, aircraft) => sum + aircraft.rangeNm, 0) / fleetAircraft.length
    : 0;

  return {
    hasFleet: fleetAircraft.length > 0,
    aircraft: fleetAircraft,
    currentAirportIds,
    regionPresence,
    countryPresence,
    continentPresence,
    airportCompatibilityById,
    roleStrengthByRole,
    averageRoleStrength,
    passengerStrength,
    cargoStrength,
    maxRangeNm,
    averageRangeNm,
  };
}

function scoreOriginOpportunity(
  homeBase: AirportRecord,
  candidate: AirportRecord,
  seed: string,
  fleetBias: FleetMarketBias,
): number {
  const fleetPresenceBonus =
    resolvePresenceWeight(fleetBias.regionPresence, candidate.marketRegion) * 14 +
    resolvePresenceWeight(fleetBias.countryPresence, candidate.isoCountry) * 10 +
    resolvePresenceWeight(fleetBias.continentPresence, candidate.continent) * 12 +
    (fleetBias.currentAirportIds.has(candidate.airportKey) ? 18 : 0) +
    (fleetBias.airportCompatibilityById.get(candidate.airportKey) ?? 0) * 10;
  return (
    candidate.contractGenerationWeight * 20 +
    Math.max(candidate.passengerScore, candidate.cargoScore, candidate.businessScore, candidate.remoteScore) * 0.42 +
    (candidate.marketRegion === homeBase.marketRegion ? 8 : 0) +
    (candidate.isoCountry === homeBase.isoCountry ? 5 : 0) +
    (candidate.continent === homeBase.continent ? 3 : 0) +
    (candidate.scheduledService ? 6 : 0) +
    ((candidate.airportSize ?? 3) * 2) +
    fleetPresenceBonus +
    randomUnit(`${seed}|origin_noise`) * 5
  );
}

function selectOriginPool(
  footprintOrigins: AirportRecord[],
  candidateAirports: AirportRecord[],
  windowSeed: string,
  fleetBias: FleetMarketBias,
): AirportRecord[] {
  const anchors = uniqueAirports(footprintOrigins.filter((airport) => airport.accessibleNow));
  const homeBase = anchors[0] ?? candidateAirports[0];

  if (!homeBase) {
    return [];
  }

  const selected = new Map<string, AirportRecord>(anchors.map((airport) => [airport.airportKey, airport]));
  const remaining = candidateAirports.filter((airport) => !selected.has(airport.airportKey));
  const anchorRegions = new Set(anchors.map((airport) => airport.marketRegion).filter((value): value is string => Boolean(value)));
  const anchorCountries = new Set(anchors.map((airport) => airport.isoCountry).filter((value): value is string => Boolean(value)));
  const anchorContinents = new Set(anchors.map((airport) => airport.continent).filter((value): value is string => Boolean(value)));

  const addBucket = (
    bucketLabel: string,
    items: AirportRecord[],
    takeCount: number,
  ): void => {
    const scored = items
      .map((candidate) => ({
        candidate,
        score: scoreOriginOpportunity(homeBase, candidate, `${windowSeed}|${bucketLabel}|${candidate.airportKey}`, fleetBias),
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
    "network_region",
    remaining.filter((airport) => airport.marketRegion && anchorRegions.has(airport.marketRegion)),
    18,
  );
  addBucket(
    "network_country",
    remaining.filter(
      (airport) =>
        airport.isoCountry
        && anchorCountries.has(airport.isoCountry)
        && (!airport.marketRegion || !anchorRegions.has(airport.marketRegion)),
    ),
    12,
  );
  addBucket(
    "network_continent",
    remaining.filter(
      (airport) =>
        airport.continent
        && anchorContinents.has(airport.continent)
        && (!airport.isoCountry || !anchorCountries.has(airport.isoCountry)),
    ),
    12,
  );
  addBucket(
    "fleet_access",
    remaining.filter((airport) => (fleetBias.airportCompatibilityById.get(airport.airportKey) ?? 0) >= 0.25),
    8,
  );
  addBucket(
    "off_continent",
    remaining.filter(
      (airport) => airport.continent && !anchorContinents.has(airport.continent),
    ),
    14,
  );
  addBucket("global", remaining, 20);

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

  if (["widebody_airliner", "heavy_freighter"].includes(likelyRole) && ["startup", "regional_carrier"].includes(companyContext.companyPhase)) {
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

function resolveDeadlineWindowHoursFromNow(
  archetype: ArchetypeProfile["archetype"],
  baselineHours: number,
  startOffsetHours: number,
  seed: string,
): {
  deadlineHoursFromNow: number;
  deadlineWindowHours: number;
  urgencyBand: ReturnType<typeof buildContractUrgencyBand>;
  urgencyPayoutMultiplier: number;
} {
  const deadlineProfile =
    archetype === "urgent_special_job"
      ? { minimumHoursFromNow: 18, maximumHoursFromNow: 30, deadlineMultiplier: 1.55, bufferHours: 2.5 }
      : archetype === "premium_passenger_charter"
      ? { minimumHoursFromNow: 30, maximumHoursFromNow: 48, deadlineMultiplier: 2.15, bufferHours: 5.5 }
      : archetype === "mainline_passenger_lane"
      ? { minimumHoursFromNow: 40, maximumHoursFromNow: 68, deadlineMultiplier: 2.85, bufferHours: 7 }
      : archetype === "longhaul_passenger_service"
      ? { minimumHoursFromNow: 54, maximumHoursFromNow: 96, deadlineMultiplier: 2.45, bufferHours: 10 }
      : archetype === "medium_freighter_linehaul"
      ? { minimumHoursFromNow: 44, maximumHoursFromNow: 78, deadlineMultiplier: 2.75, bufferHours: 8 }
      : archetype === "heavy_freighter_longhaul"
      ? { minimumHoursFromNow: 60, maximumHoursFromNow: 108, deadlineMultiplier: 2.4, bufferHours: 12 }
      : archetype === "remote_utility_cargo"
      ? { minimumHoursFromNow: 32, maximumHoursFromNow: 56, deadlineMultiplier: 3.1, bufferHours: 4.5 }
      : archetype === "cargo_feeder_haul"
      ? { minimumHoursFromNow: 36, maximumHoursFromNow: 60, deadlineMultiplier: 2.85, bufferHours: 6 }
      : { minimumHoursFromNow: 32, maximumHoursFromNow: 54, deadlineMultiplier: 3.05, bufferHours: 5 };
  const computedDeadlineWindowHours = Math.ceil(
    (baselineHours + deadlineProfile.bufferHours) * deadlineProfile.deadlineMultiplier,
  );
  const sampledMinimumHoursFromNow = pickInteger(
    `${seed}|deadline_floor`,
    deadlineProfile.minimumHoursFromNow,
    deadlineProfile.maximumHoursFromNow,
  );
  const deadlineHoursFromNow = Math.max(
    startOffsetHours + computedDeadlineWindowHours,
    sampledMinimumHoursFromNow,
  );
  const urgencyBand = buildContractUrgencyBand(deadlineHoursFromNow);

  return {
    deadlineHoursFromNow,
    deadlineWindowHours: Math.max(1, deadlineHoursFromNow - startOffsetHours),
    urgencyBand,
    urgencyPayoutMultiplier: resolveContractUrgencyPayoutMultiplier(deadlineHoursFromNow),
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
    return Math.round(Math.max(rawPayout * localVariation, estimatedCost * 1.25));
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
  return Math.round(Math.max(rawPayout * localVariation, estimatedCost * 1.22));
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
  deadlineHoursFromNow: number,
  deadlineWindowHours: number,
  urgencyBand: ReturnType<typeof buildContractUrgencyBand>,
  urgencyPayoutMultiplier: number,
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
    why_now_summary: `Generated from your current network footprint, active fleet capability, and a wider persistent market around ${companyContext.homeBaseAirportId}.`,
    blocked_reason_code: fitBucket === "blocked_now" ? reasonCode : undefined,
    stretch_reason_code: fitBucket === "stretch_growth" ? reasonCode : undefined,
    local_departure_window_text: `${earliestStartUtc} ${originAirport.timezone ?? "UTC"}`,
    local_deadline_text: `${latestCompletionUtc} ${destination.timezone ?? "UTC"}`,
    deadline_hours_from_now: deadlineHoursFromNow,
    deadline_window_hours: deadlineWindowHours,
    urgency_band: urgencyBand,
    urgency_premium_multiplier: urgencyPayoutMultiplier,
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
  const volumeType = deriveRouteCandidateVolumeType(archetypeProfile, destination);
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
  const deadlineWindow = resolveDeadlineWindowHoursFromNow(
    archetypeProfile.archetype,
    baselineHours,
    startOffsetHours,
    baseSeed,
  );
  const latestCompletionUtc = addHours(companyContext.currentTimeUtc, deadlineWindow.deadlineHoursFromNow);
  const fit = deriveFitBucket(companyContext, archetypeProfile.likelyRole, originAirport, footprintOriginIds);
  const difficultyBand = deriveDifficultyBand(archetypeProfile.archetype, distanceNm, originAirport, destination);
  const volumeValue = volumeType === "passenger" ? passengerCount ?? 0 : cargoWeightLb ?? 0;
  const basePayoutAmount = buildPayout(
    archetypeProfile.archetype,
    volumeType,
    volumeValue,
    distanceNm,
    destination,
    baseSeed,
  );
  const payoutAmount = resolveDynamicContractOfferPayoutAmount(
    basePayoutAmount,
    deadlineWindow.deadlineHoursFromNow,
  );
  const penaltyModel = buildPenaltyModel(payoutAmount, archetypeProfile.archetype);
  const explanationMetadata = buildOfferExplanation(
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
    deadlineWindow.deadlineHoursFromNow,
    deadlineWindow.deadlineWindowHours,
    deadlineWindow.urgencyBand,
    deadlineWindow.urgencyPayoutMultiplier,
    fit.reasonCode,
    footprintOriginIds,
  );
  explanationMetadata.base_payout_amount = basePayoutAmount;

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
    explanationMetadata,
    generatedSeed: baseSeed,
  };
}

function buildGenerationContextHash(
  companyContext: CompanyContext,
  footprintOrigins: AirportRecord[],
  fleetAircraft: ContractBoardGenerationFleetAircraftInput[],
): string {
  return `${contractBoardGenerationProfileVersion}:${makeSeed(
    contractBoardGenerationProfileVersion,
    companyContext.companyId,
    companyContext.homeBaseAirportId,
    String(readContractBoardTargetScale()),
    String(companyContext.activeAircraftCount),
    String(companyContext.activeStaffingPackageCount),
    companyContext.financialPressureBand,
    companyContext.companyPhase,
    ...footprintOrigins.map((airport) => airport.airportKey),
    buildFleetCapabilityFingerprint(fleetAircraft),
  )}`;
}

function resolveArchetypeDemandMultiplier(
  profile: ArchetypeProfile,
  fleetBias: FleetMarketBias,
): number {
  if (!fleetBias.hasFleet) {
    return 1;
  }

  const roleStrength = fleetBias.roleStrengthByRole.get(profile.likelyRole) ?? 0;
  const normalizedRoleStrength = fleetBias.averageRoleStrength > 0
    ? roleStrength / fleetBias.averageRoleStrength
    : 1;
  const totalVolumeStrength = fleetBias.passengerStrength + fleetBias.cargoStrength;
  const volumePreference = totalVolumeStrength > 0
    ? isPassengerFocusedArchetype(profile.archetype)
      ? fleetBias.passengerStrength / totalVolumeStrength
      : isCargoFocusedArchetype(profile.archetype)
      ? fleetBias.cargoStrength / totalVolumeStrength
      : 0.5
    : 0.5;
  const volumeBias = (volumePreference - 0.5) * 0.35;
  const maxUsefulRange = fleetBias.maxRangeNm * 0.92;
  const averageUsefulRange = fleetBias.averageRangeNm * 0.88;
  const rangeBias =
    profile.maxDistanceNm <= maxUsefulRange
      ? 0.08
      : profile.minDistanceNm > maxUsefulRange * 1.1
      ? -0.18
      : profile.maxDistanceNm > averageUsefulRange * 1.35
      ? -0.06
      : 0;

  return clampNumber(0.72 + Math.min(normalizedRoleStrength, 2) * 0.33 + volumeBias + rangeBias, 0.68, 1.45);
}

function resolveFleetRouteCapabilityScore(
  fleetBias: FleetMarketBias,
  likelyRole: string,
  volumeType: "passenger" | "cargo",
  distanceNm: number,
  origin: AirportRecord,
  destination: AirportRecord,
): number {
  if (!fleetBias.hasFleet || fleetBias.aircraft.length === 0) {
    return 0;
  }

  let bestScore = 0;
  let totalScore = 0;

  for (const aircraft of fleetBias.aircraft) {
    if (!aircraftCanAccessAirport(aircraft, origin) || !aircraftCanAccessAirport(aircraft, destination)) {
      continue;
    }

    const rangeEnvelopeNm = Math.max(1, aircraft.rangeNm * 0.9);
    if (distanceNm > rangeEnvelopeNm * 1.15) {
      continue;
    }

    const rangeScore = distanceNm <= rangeEnvelopeNm
      ? 1
      : Math.max(0, 1 - ((distanceNm - rangeEnvelopeNm) / Math.max(1, rangeEnvelopeNm * 0.15)));
    const roleScore = resolveAircraftRoleAffinity(aircraft, likelyRole);
    if (roleScore <= 0) {
      continue;
    }

    const seatCapacity = resolveAircraftSeatCapacity(aircraft);
    const cargoCapacity = resolveAircraftCargoCapacityLb(aircraft);
    const volumeScore = volumeType === "passenger"
      ? seatCapacity > 0 ? Math.min(1.2, 0.4 + seatCapacity / 48) : 0
      : cargoCapacity > 0 ? Math.min(1.2, 0.35 + cargoCapacity / 12_000) : 0;
    const score = rangeScore * Math.min(1.5, roleScore) * volumeScore;

    bestScore = Math.max(bestScore, score);
    totalScore += score;
  }

  return Math.min(1.6, bestScore * 0.9 + totalScore * 0.18);
}

function deriveRouteCandidateVolumeType(
  archetypeProfile: ArchetypeProfile,
  destination: AirportRecord,
): "passenger" | "cargo" {
  const isPassenger =
    archetypeProfile.archetype === "premium_passenger_charter" ||
    archetypeProfile.archetype === "regional_passenger_run" ||
    archetypeProfile.archetype === "mainline_passenger_lane" ||
    archetypeProfile.archetype === "longhaul_passenger_service" ||
    (archetypeProfile.archetype === "urgent_special_job" &&
      destination.passengerScore + destination.businessScore >= destination.cargoScore + destination.remoteScore);

  return isPassenger ? "passenger" : "cargo";
}

function buildRouteCandidates(
  profile: ArchetypeProfile,
  originPool: AirportRecord[],
  candidateAirports: AirportRecord[],
  homeBase: AirportRecord,
  footprintOriginIds: Set<string>,
  originPoolIds: Set<string>,
  windowSeed: string,
  fleetBias: FleetMarketBias,
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

      const volumeType = deriveRouteCandidateVolumeType(profile, destination);
      const homeBaseOriginBonus = origin.airportKey === homeBase.airportKey
        ? volumeType === "cargo" ? 18 : 8
        : 0;
      const homeBaseDestinationBonus = destination.airportKey === homeBase.airportKey
        ? volumeType === "cargo" ? 4 : 10
        : 0;
      const seed = makeSeed(windowSeed, profile.archetype, origin.airportKey, destination.airportKey);
      const distanceFit = 1 - Math.min(Math.abs(distanceNm - idealDistanceNm) / maxDistanceSpan, 1);
      const activeFleetOriginBonus = fleetBias.currentAirportIds.has(origin.airportKey) ? 28 : 0;
      const activeFleetDestinationBonus = fleetBias.currentAirportIds.has(destination.airportKey) ? 10 : 0;
      const originPresenceBonus =
        resolvePresenceWeight(fleetBias.regionPresence, origin.marketRegion) * 16 +
        resolvePresenceWeight(fleetBias.countryPresence, origin.isoCountry) * 12 +
        resolvePresenceWeight(fleetBias.continentPresence, origin.continent) * 12;
      const destinationPresenceBonus =
        resolvePresenceWeight(fleetBias.regionPresence, destination.marketRegion) * 8 +
        resolvePresenceWeight(fleetBias.countryPresence, destination.isoCountry) * 6 +
        resolvePresenceWeight(fleetBias.continentPresence, destination.continent) * 8;
      const airportAccessBonus =
        ((fleetBias.airportCompatibilityById.get(origin.airportKey) ?? 0)
        + (fleetBias.airportCompatibilityById.get(destination.airportKey) ?? 0)) * 6;
      const fleetRouteCapabilityScore = resolveFleetRouteCapabilityScore(
        fleetBias,
        profile.likelyRole,
        volumeType,
        distanceNm,
        origin,
        destination,
      );
      const routeScore =
        profile.scoreAirport(origin, destination) +
        origin.contractGenerationWeight * 4 +
        destination.contractGenerationWeight * 8 +
        distanceFit * 14 +
        (footprintOriginIds.has(origin.airportKey) ? 6 : 0) +
        (originPoolIds.has(destination.airportKey) ? 11 : 0) +
        (footprintOriginIds.has(destination.airportKey) ? 10 : 0) +
        homeBaseDestinationBonus +
        homeBaseOriginBonus +
        (destination.marketRegion === origin.marketRegion ? 6 : 0) +
        (destination.isoCountry === origin.isoCountry ? 4 : 0) +
        activeFleetOriginBonus +
        activeFleetDestinationBonus +
        originPresenceBonus +
        destinationPresenceBonus +
        airportAccessBonus +
        fleetRouteCapabilityScore * 16 +
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
  fleetAircraft: ContractBoardGenerationFleetAircraftInput[] = [],
): GeneratedContractBoard {
  const targetScale = readContractBoardTargetScale();
  const uniqueFootprintOrigins = uniqueAirports(footprintOrigins);
  const uniqueCandidates = uniqueAirports([
    ...uniqueFootprintOrigins,
    ...candidateAirports,
  ]);
  const footprintHashInput = uniqueFootprintOrigins.map((airport) => airport.airportKey).join(",");
  const fleetCapabilityFingerprint = buildFleetCapabilityFingerprint(fleetAircraft);
  const windowSeed = makeSeed(
    companyContext.worldSeed,
    companyContext.companyId,
    companyContext.currentTimeUtc.slice(0, 13),
    refreshReason,
    footprintHashInput || companyContext.homeBaseAirportId,
    fleetCapabilityFingerprint,
  );
  const homeBase = uniqueFootprintOrigins[0] ?? uniqueCandidates[0];
  const fleetBias = buildFleetMarketBias(uniqueFootprintOrigins, uniqueCandidates, fleetAircraft);
  const originPool = homeBase ? selectOriginPool(uniqueFootprintOrigins, uniqueCandidates, windowSeed, fleetBias) : [];
  const footprintOriginIds = new Set(uniqueFootprintOrigins.map((airport) => airport.airportKey));
  const originPoolIds = new Set(originPool.map((airport) => airport.airportKey));
  const generationContextHash = buildGenerationContextHash(companyContext, uniqueFootprintOrigins, fleetAircraft);
  const offers: GeneratedContractOfferInput[] = [];
  const routeUsage = new Map<string, number>();
  const originUsage = new Map<string, number>();
  const originUsageByVolume = new Map<string, { passenger: number; cargo: number }>();
  const destinationUsage = new Map<string, number>();
  const targetCountByArchetype = new Map<ArchetypeProfile["archetype"], number>(
    ARCHETYPE_PROFILES.map((profile) => [
      profile.archetype,
      Math.max(
        1,
        Math.round(
          scaledTargetCount(profile.targetCount, targetScale) * resolveArchetypeDemandMultiplier(profile, fleetBias),
        ),
      ),
    ]),
  );
  const targetOfferCount = ARCHETYPE_PROFILES.reduce(
    (sum, profile) => sum + (targetCountByArchetype.get(profile.archetype) ?? scaledTargetCount(profile.targetCount, targetScale)),
    0,
  );
  const originCap = Math.max(10, Math.ceil(targetOfferCount / Math.max(originPool.length, 1)) - 6);
  const homeBaseCargoOriginCap = Math.max(4, Math.ceil(originCap * 0.35));
  const homeBasePassengerOriginCap = Math.max(6, originCap - homeBaseCargoOriginCap);
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
      fleetBias,
    );
    const targetCountForProfile = targetCountByArchetype.get(archetypeProfile.archetype) ?? scaledTargetCount(archetypeProfile.targetCount, targetScale);

    let addedForProfile = 0;

    for (const candidate of scoredCandidates) {
      const pairKey = `${candidate.origin.airportKey}:${candidate.destination.airportKey}`;
      const pairUsage = routeUsage.get(pairKey) ?? 0;
      const originCount = originUsage.get(candidate.origin.airportKey) ?? 0;
      const destinationCount = destinationUsage.get(candidate.destination.airportKey) ?? 0;
      const volumeType = deriveRouteCandidateVolumeType(archetypeProfile, candidate.destination);
      const originVolumeUsage = originUsageByVolume.get(candidate.origin.airportKey) ?? { passenger: 0, cargo: 0 };
      const originVolumeCap = candidate.origin.airportKey === homeBase.airportKey
        ? volumeType === "cargo"
          ? homeBaseCargoOriginCap
          : homeBasePassengerOriginCap
        : originCap;

      if (
        pairUsage >= 4
        || originCount >= originCap
        || originVolumeUsage[volumeType] >= originVolumeCap
        || destinationCount >= destinationCap
      ) {
        continue;
      }

      offers.push(buildOffer(companyContext, candidate.origin, candidate.destination, archetypeProfile, windowSeed, footprintOriginIds));
      routeUsage.set(pairKey, pairUsage + 1);
      originUsage.set(candidate.origin.airportKey, originCount + 1);
      originUsageByVolume.set(candidate.origin.airportKey, {
        ...originVolumeUsage,
        [volumeType]: originVolumeUsage[volumeType] + 1,
      });
      destinationUsage.set(candidate.destination.airportKey, destinationCount + 1);
      addedForProfile += 1;

      if (addedForProfile >= targetCountForProfile) {
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



