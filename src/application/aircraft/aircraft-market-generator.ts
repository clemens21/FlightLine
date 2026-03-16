import type { JsonObject } from "../../domain/common/primitives.js";
import type { CompanyContext } from "../queries/company-state.js";
import type { AirportRecord } from "../../infrastructure/reference/airport-reference.js";
import type {
  AircraftLayoutRecord,
  AircraftModelRecord,
} from "../../infrastructure/reference/aircraft-reference.js";
import { addUtcDays, calculateFinanceRecurringPayment } from "../commands/utils.js";
import type { AircraftOfferTermsView } from "../queries/aircraft-market.js";

export interface GeneratedAircraftOfferInput {
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
}

export interface GeneratedAircraftMarket {
  generatedAtUtc: string;
  expiresAtUtc: string;
  windowSeed: string;
  generationContextHash: string;
  offers: GeneratedAircraftOfferInput[];
}

interface GenerateAircraftMarketParams {
  companyContext: CompanyContext;
  homeBaseAirport: AirportRecord;
  footprintAirports: AirportRecord[];
  candidateAirports: AirportRecord[];
  aircraftModels: AircraftModelRecord[];
  defaultLayoutsByModelId: Map<string, AircraftLayoutRecord | null>;
  ownedModelIds: Set<string>;
  ownedRolePools: Set<string>;
  ownedPilotQualifications: Set<string>;
  previousModelCounts: Map<string, number>;
}

interface ListingCountProfile {
  totalCount: number;
  newCount: number;
}

interface SeededAirframeState {
  listingType: "new" | "used";
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
  priceMultiplier: number;
}

const usedConditionBuckets = [
  { label: "excellent", min: 0.9, max: 0.97, priceMin: 0.92, priceMax: 0.99, band: "excellent" },
  { label: "healthy", min: 0.75, max: 0.89, priceMin: 0.78, priceMax: 0.91, band: "good" },
  { label: "watch", min: 0.6, max: 0.74, priceMin: 0.64, priceMax: 0.77, band: "fair" },
  { label: "rough", min: 0.45, max: 0.59, priceMin: 0.5, priceMax: 0.63, band: "poor" },
] as const;

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

function randomBetween(seed: string, minValue: number, maxValue: number): number {
  return minValue + (maxValue - minValue) * randomUnit(seed);
}

function randomInteger(seed: string, minValue: number, maxValue: number): number {
  return Math.round(randomBetween(seed, minValue, maxValue));
}

function roundCurrency(value: number): number {
  return Math.max(0, Math.round(value));
}

function haversineDistanceNm(origin: AirportRecord, destination: AirportRecord): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusNm = 3440.065;
  const deltaLatitude = toRadians(destination.latitudeDeg - origin.latitudeDeg);
  const deltaLongitude = toRadians(destination.longitudeDeg - origin.longitudeDeg);
  const latitudeOne = toRadians(origin.latitudeDeg);
  const latitudeTwo = toRadians(destination.latitudeDeg);
  const a =
    Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

function listingCountProfile(companyPhase: CompanyContext["companyPhase"]): ListingCountProfile {
  switch (companyPhase) {
    case "startup":
      return { totalCount: 18, newCount: 4 };
    case "small_operator":
      return { totalCount: 24, newCount: 7 };
    case "regional_carrier":
    case "expanding":
    default:
      return { totalCount: 30, newCount: 10 };
  }
}

function isCargoBiased(model: AircraftModelRecord): boolean {
  return model.maxCargoLb >= Math.max(2500, model.maxPassengers * 220);
}

function aircraftRoleLabel(model: AircraftModelRecord): string {
  if (model.maxCargoLb > 0 && model.maxPassengers <= 12) {
    return "cargo mover";
  }

  if (model.maxPassengers >= 60) {
    return "mainline passenger";
  }

  if (model.maxPassengers >= 18) {
    return "regional passenger";
  }

  if (model.minimumRunwayFt <= 3500 && model.minimumAirportSize <= 2) {
    return "short-field utility";
  }

  if (model.rangeNm >= 1800) {
    return "long-range charter";
  }

  return "utility all-rounder";
}

function compatibleAirport(airport: AirportRecord, model: AircraftModelRecord): boolean {
  if (!airport.accessibleNow) {
    return false;
  }

  if (airport.airportSize !== null && airport.airportSize < model.minimumAirportSize) {
    return false;
  }

  if (airport.longestHardRunwayFt !== undefined && airport.longestHardRunwayFt < model.minimumRunwayFt) {
    return false;
  }

  if (model.hardSurfaceRequired && airport.longestHardRunwayFt === undefined) {
    return false;
  }

  return true;
}

function modelWeight(
  model: AircraftModelRecord,
  params: GenerateAircraftMarketParams,
  listingType: "new" | "used",
  homeBaseAirport: AirportRecord,
  duplicateCount: number,
): number {
  let weight = listingType === "new" ? 1.2 : 1.5;
  const companyTier = params.companyContext.progressionTier;
  const activeAircraftCount = params.companyContext.activeAircraftCount;
  const activeStaffingCount = params.companyContext.activeStaffingPackageCount;

  if (params.companyContext.companyPhase === "startup" && model.startupEligible) {
    weight += 4.5;
  }

  if (model.progressionTier <= companyTier + 1) {
    weight += 2.8;
  } else if (model.progressionTier <= companyTier + 2) {
    weight += 1.2;
  } else {
    weight -= listingType === "new" ? 2.2 : 1.4;
  }

  if (!params.ownedRolePools.has(model.marketRolePool)) {
    weight += 2.6;
  }

  if (activeAircraftCount === 0 && model.pilotsRequired === 1) {
    weight += 3.2;
  }

  if (activeAircraftCount === 0 && model.startupEligible) {
    weight += 2;
  }

  if (activeStaffingCount === 0 && model.pilotsRequired > 1) {
    weight -= 1.4;
  }

  if (params.ownedPilotQualifications.has(model.pilotQualificationGroup)) {
    weight += 1.4;
  } else if (activeStaffingCount > 0) {
    weight -= 0.8;
  }

  if (!compatibleAirport(homeBaseAirport, model)) {
    weight -= 1.8;
  } else {
    weight += 1.4;
  }

  if (isCargoBiased(model) && ![...params.ownedRolePools].some((rolePool) => rolePool.includes("cargo"))) {
    weight += 2.2;
  }

  if (model.maxPassengers > 0 && ![...params.ownedRolePools].some((rolePool) => rolePool.includes("passenger"))) {
    weight += 2.2;
  }

  weight -= duplicateCount * 1.8;
  weight -= (params.previousModelCounts.get(model.modelId) ?? 0) * 1.25;

  return Math.max(weight, 0.1);
}

function pickWeightedModel(
  models: AircraftModelRecord[],
  params: GenerateAircraftMarketParams,
  listingType: "new" | "used",
  homeBaseAirport: AirportRecord,
  usedCounts: Map<string, number>,
  seed: string,
): AircraftModelRecord {
  const weighted = models
    .map((model) => ({
      model,
      weight: modelWeight(model, params, listingType, homeBaseAirport, usedCounts.get(model.modelId) ?? 0),
    }))
    .filter((entry) => entry.weight > 0);

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = randomUnit(seed) * totalWeight;

  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor <= 0) {
      return entry.model;
    }
  }

  return weighted[weighted.length - 1]?.model ?? models[0]!;
}

function pickCompatibleAirport(
  seed: string,
  model: AircraftModelRecord,
  airports: AirportRecord[],
  homeBaseAirport: AirportRecord,
): AirportRecord | null {
  const compatible = airports.filter((airport) => compatibleAirport(airport, model));
  if (compatible.length <= 0) {
    return null;
  }

  const scored = compatible
    .map((airport) => {
      let weight = 1;
      if (airport.isoCountry === homeBaseAirport.isoCountry) {
        weight += 1.6;
      }
      if (airport.marketRegion && airport.marketRegion === homeBaseAirport.marketRegion) {
        weight += 1.4;
      }
      if ((airport.airportSize ?? 0) >= model.minimumAirportSize && (airport.airportSize ?? 0) <= model.preferredAirportSize + 1) {
        weight += 1.1;
      }
      if ((airport.longestHardRunwayFt ?? model.minimumRunwayFt) <= model.preferredRunwayFt * 1.4) {
        weight += 0.8;
      }
      return {
        airport,
        weight: Math.max(weight + randomUnit(`${seed}|${airport.airportKey}|noise`) * 0.4, 0.1),
      };
    })
    .sort((left, right) => left.airport.airportKey.localeCompare(right.airport.airportKey));

  const totalWeight = scored.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = randomUnit(`${seed}|airport`) * totalWeight;

  for (const entry of scored) {
    cursor -= entry.weight;
    if (cursor <= 0) {
      return entry.airport;
    }
  }

  return scored[scored.length - 1]?.airport ?? compatible[0]!;
}

function seededAirframeState(
  seed: string,
  model: AircraftModelRecord,
  listingType: "new" | "used",
): SeededAirframeState {
  if (listingType === "new") {
    const conditionValue = randomBetween(`${seed}|condition`, 0.98, 1);
    const hoursSinceInspection = randomBetween(`${seed}|hours_since_inspection`, 0, Math.max(3, model.inspectionIntervalHours * 0.08));
    const cyclesSinceInspection = randomInteger(`${seed}|cycles_since_inspection`, 0, Math.max(3, Math.round(model.inspectionIntervalCycles * 0.08)));
    return {
      listingType,
      conditionValue,
      conditionBandInput: "excellent",
      statusInput: "idle",
      airframeHoursTotal: randomBetween(`${seed}|hours_total`, 10, Math.max(80, model.inspectionIntervalHours * 0.2)),
      airframeCyclesTotal: randomInteger(`${seed}|cycles_total`, 5, Math.max(40, Math.round(model.inspectionIntervalCycles * 0.15))),
      hoursSinceInspection,
      cyclesSinceInspection,
      hoursToService: Math.max(10, model.inspectionIntervalHours - hoursSinceInspection),
      maintenanceStateInput: "current",
      aogFlag: false,
      priceMultiplier: randomBetween(`${seed}|price`, 1.0, 1.08),
    };
  }

  const bucket = usedConditionBuckets[Math.min(
    usedConditionBuckets.length - 1,
    Math.floor(randomUnit(`${seed}|bucket`) * usedConditionBuckets.length),
  )]!;
  const conditionValue = randomBetween(`${seed}|condition`, bucket.min, bucket.max);
  const lifecycleFactor = 1 - conditionValue;
  const airframeHoursTotal = randomBetween(
    `${seed}|hours_total`,
    500 + lifecycleFactor * 4_000,
    2_500 + lifecycleFactor * 24_000,
  );
  const airframeCyclesTotal = randomInteger(
    `${seed}|cycles_total`,
    Math.max(60, Math.round(airframeHoursTotal * 0.18)),
    Math.max(160, Math.round(airframeHoursTotal * 0.34)),
  );
  const serviceUsageRatio = conditionValue >= 0.9
    ? randomBetween(`${seed}|service_ratio`, 0.25, 0.55)
    : conditionValue >= 0.75
      ? randomBetween(`${seed}|service_ratio`, 0.35, 0.72)
      : conditionValue >= 0.6
        ? randomBetween(`${seed}|service_ratio`, 0.55, 0.88)
        : randomBetween(`${seed}|service_ratio`, 0.72, 0.95);
  const hoursSinceInspection = Math.max(0, model.inspectionIntervalHours * serviceUsageRatio);
  const cyclesSinceInspection = Math.max(0, Math.round(model.inspectionIntervalCycles * serviceUsageRatio));
  const hoursToService = Math.max(8, model.inspectionIntervalHours - hoursSinceInspection);
  const maintenanceStateInput = serviceUsageRatio >= 0.75 ? "due_soon" : "current";

  return {
    listingType,
    conditionValue,
    conditionBandInput: bucket.band,
    statusInput: "idle",
    airframeHoursTotal,
    airframeCyclesTotal,
    hoursSinceInspection,
    cyclesSinceInspection,
    hoursToService,
    maintenanceStateInput,
    aogFlag: false,
    priceMultiplier: randomBetween(`${seed}|price`, bucket.priceMin, bucket.priceMax),
  };
}

function buildRegistration(seed: string): string {
  const digits = randomInteger(`${seed}|digits`, 1000, 9999);
  const suffix = String.fromCharCode(
    65 + randomInteger(`${seed}|suffix_a`, 0, 25),
    65 + randomInteger(`${seed}|suffix_b`, 0, 25),
  );
  return `N${digits}${suffix}`;
}

function explainOffer(
  model: AircraftModelRecord,
  airport: AirportRecord,
  homeBaseAirport: AirportRecord,
  state: SeededAirframeState,
  params: GenerateAircraftMarketParams,
): JsonObject {
  const fitReasons: string[] = [];
  const riskReasons: string[] = [];

  if (!params.ownedRolePools.has(model.marketRolePool)) {
    fitReasons.push("Adds a new role to the fleet.");
  }

  if (compatibleAirport(homeBaseAirport, model)) {
    fitReasons.push("Fits the current home-base access profile.");
  } else {
    riskReasons.push("Current home base may not support this airframe.");
  }

  if (!params.ownedPilotQualifications.has(model.pilotQualificationGroup) && params.companyContext.activeStaffingPackageCount > 0) {
    riskReasons.push("Needs new pilot qualification coverage.");
  }

  if (airport.airportKey !== homeBaseAirport.airportKey) {
    fitReasons.push(`Listed away from base at ${airport.identCode ?? airport.airportKey}, which can open reposition strategy.`);
  }

  if (state.maintenanceStateInput === "due_soon") {
    riskReasons.push("Maintenance comes due relatively soon after acquisition.");
  }

  if (state.conditionValue <= 0.6) {
    riskReasons.push("Low condition lowers price but increases early operating risk.");
  } else if (state.listingType === "new") {
    fitReasons.push("Factory-fresh condition keeps early maintenance pressure low.");
  }

  return {
    role_pool: model.marketRolePool,
    fit_reasons: fitReasons,
    risk_reasons: riskReasons,
    listed_airport: airport.airportKey,
    home_base_access_match: compatibleAirport(homeBaseAirport, model),
  };
}

function buildFinanceTerms(
  model: AircraftModelRecord,
  askingPriceAmount: number,
  params: GenerateAircraftMarketParams,
  state: SeededAirframeState,
  seed: string,
): AircraftOfferTermsView {
  const baseRate = params.companyContext.reputationScore >= 55 ? 6.2 : params.companyContext.reputationScore >= 40 ? 7.1 : 8.4;
  const conditionPenalty = state.conditionValue >= 0.9 ? 0 : state.conditionValue >= 0.75 ? 0.5 : state.conditionValue >= 0.6 ? 1.2 : 2.1;
  const pressurePenalty = params.companyContext.financialPressureBand === "stable" ? 0 : params.companyContext.financialPressureBand === "tight" ? 0.8 : 1.8;
  const apr = Math.min(14, Math.max(5, baseRate + conditionPenalty + pressurePenalty + randomBetween(`${seed}|apr`, -0.35, 0.45)));
  const depositRate = params.companyContext.companyPhase === "startup" ? 0.18 : 0.14;
  const upfrontPaymentAmount = roundCurrency(askingPriceAmount * (depositRate + randomBetween(`${seed}|deposit`, -0.03, 0.05)));
  const termMonths = params.companyContext.companyPhase === "startup" ? 60 : 72;
  const principalAmount = Math.max(0, askingPriceAmount - upfrontPaymentAmount);

  return {
    upfrontPaymentAmount,
    recurringPaymentAmount: roundCurrency(calculateFinanceRecurringPayment(principalAmount, apr, termMonths, "monthly")),
    paymentCadence: "monthly",
    termMonths,
    rateBandOrApr: Math.round(apr * 10) / 10,
  };
}

function buildLeaseTerms(
  model: AircraftModelRecord,
  state: SeededAirframeState,
  params: GenerateAircraftMarketParams,
  seed: string,
): AircraftOfferTermsView {
  const baseMonthly = model.targetLeaseRateMonthlyUsd;
  const multiplier = state.listingType === "new"
    ? randomBetween(`${seed}|lease`, 1.0, 1.08)
    : state.conditionValue >= 0.9
      ? randomBetween(`${seed}|lease`, 0.96, 1.0)
      : state.conditionValue >= 0.75
        ? randomBetween(`${seed}|lease`, 0.88, 0.95)
        : state.conditionValue >= 0.6
          ? randomBetween(`${seed}|lease`, 0.76, 0.87)
          : randomBetween(`${seed}|lease`, 0.66, 0.75);
  const recurringPaymentAmount = roundCurrency(baseMonthly * multiplier);
  const termMonths = params.companyContext.companyPhase === "startup" ? 12 : 18;
  const upfrontPaymentAmount = roundCurrency(recurringPaymentAmount * (state.listingType === "new" ? 2 : 1));

  return {
    upfrontPaymentAmount,
    recurringPaymentAmount,
    paymentCadence: "monthly",
    termMonths,
  };
}

export function generateAircraftMarket(params: GenerateAircraftMarketParams): GeneratedAircraftMarket {
  const countProfile = listingCountProfile(params.companyContext.companyPhase);
  const generatedAtUtc = params.companyContext.currentTimeUtc;
  const expiresAtUtc = addUtcDays(generatedAtUtc, 7);
  const windowSeed = makeSeed(
    params.companyContext.saveId,
    params.companyContext.companyId,
    params.companyContext.currentTimeUtc,
    params.companyContext.companyPhase,
    String(params.companyContext.progressionTier),
    String(params.companyContext.activeAircraftCount),
  );
  const generationContextHash = makeSeed(
    params.companyContext.companyPhase,
    String(params.companyContext.progressionTier),
    String(params.companyContext.currentCashAmount),
    params.homeBaseAirport.airportKey,
    [...params.ownedModelIds].sort().join(","),
  );
  const controlledAirportIds = new Set(params.footprintAirports.map((airport) => airport.airportKey));
  const awayAirports = params.candidateAirports.filter((airport) => !controlledAirportIds.has(airport.airportKey));
  const duplicateCounts = new Map<string, number>();
  const registrationSet = new Set<string>();
  const offers: GeneratedAircraftOfferInput[] = [];
  const controlledListingCap = Math.floor(countProfile.totalCount * 0.25);
  let controlledListingCount = 0;

  for (let index = 0; index < countProfile.totalCount; index += 1) {
    const listingType: "new" | "used" = index < countProfile.newCount ? "new" : "used";
    const offerSeed = `${windowSeed}|listing|${index}|${listingType}`;
    const model = pickWeightedModel(
      params.aircraftModels,
      params,
      listingType,
      params.homeBaseAirport,
      duplicateCounts,
      offerSeed,
    );
    const preferControlled = controlledListingCount < controlledListingCap && randomUnit(`${offerSeed}|location_class`) < 0.2;
    const compatibleControlledAirports = params.footprintAirports.filter((airport) => compatibleAirport(airport, model));
    const compatibleAwayAirports = awayAirports.filter((airport) => compatibleAirport(airport, model));
    const selectedAirport = preferControlled && compatibleControlledAirports.length > 0
      ? pickCompatibleAirport(`${offerSeed}|controlled`, model, compatibleControlledAirports, params.homeBaseAirport)
      : pickCompatibleAirport(`${offerSeed}|away`, model, compatibleAwayAirports.length > 0 ? compatibleAwayAirports : compatibleControlledAirports, params.homeBaseAirport);

    if (!selectedAirport) {
      continue;
    }

    if (controlledAirportIds.has(selectedAirport.airportKey)) {
      controlledListingCount += 1;
    }

    const state = seededAirframeState(offerSeed, model, listingType);
    const askingPurchasePriceAmount = roundCurrency(model.marketValueUsd * state.priceMultiplier);
    const financeTerms = buildFinanceTerms(model, askingPurchasePriceAmount, params, state, offerSeed);
    const leaseTerms = buildLeaseTerms(model, state, params, offerSeed);
    let registration = buildRegistration(offerSeed);
    while (registrationSet.has(registration)) {
      registration = buildRegistration(`${offerSeed}|retry|${registrationSet.size}`);
    }
    registrationSet.add(registration);

    offers.push({
      aircraftModelId: model.modelId,
      activeCabinLayoutId: params.defaultLayoutsByModelId.get(model.modelId)?.layoutId ?? undefined,
      listingType,
      currentAirportId: selectedAirport.airportKey,
      registration,
      displayName: `${model.displayName} ${listingType === "new" ? "factory listing" : "used listing"}`,
      conditionValue: state.conditionValue,
      conditionBandInput: state.conditionBandInput,
      statusInput: state.statusInput,
      airframeHoursTotal: state.airframeHoursTotal,
      airframeCyclesTotal: state.airframeCyclesTotal,
      hoursSinceInspection: state.hoursSinceInspection,
      cyclesSinceInspection: state.cyclesSinceInspection,
      hoursToService: state.hoursToService,
      maintenanceStateInput: state.maintenanceStateInput,
      aogFlag: state.aogFlag,
      askingPurchasePriceAmount,
      financeTerms,
      leaseTerms,
      explanationMetadata: explainOffer(model, selectedAirport, params.homeBaseAirport, state, params),
      generatedSeed: offerSeed,
    });

    duplicateCounts.set(model.modelId, (duplicateCounts.get(model.modelId) ?? 0) + 1);
  }

  return {
    generatedAtUtc,
    expiresAtUtc,
    windowSeed,
    generationContextHash,
    offers,
  };
}
