/*
 * Derives the aircraft-tab view model from fleet, schedule, staffing, maintenance, and company context.
 * The browser client receives this pre-shaped payload so it can stay focused on interaction instead of simulation rules.
 */

import type { AircraftMarketView, AircraftOfferTermsView } from "../application/queries/aircraft-market.js";
import type { CompanyContractsView } from "../application/queries/company-contracts.js";
import type { CompanyContext } from "../application/queries/company-state.js";
import type { FleetAircraftView, FleetStateView } from "../application/queries/fleet-state.js";
import type { MaintenanceTaskView } from "../application/queries/maintenance-tasks.js";
import type { AircraftScheduleView, ScheduleLegView } from "../application/queries/schedule-state.js";
import type { StaffingStateView } from "../application/queries/staffing-state.js";
import type { AircraftReferenceRepository } from "../infrastructure/reference/aircraft-reference.js";
import type { AirportReferenceRepository, AirportRecord } from "../infrastructure/reference/airport-reference.js";

export type AircraftWorkspaceTab = "fleet" | "market";
export type AircraftOperationalState = "available" | "scheduled" | "maintenance" | "grounded";
export type AircraftConditionBand = "excellent" | "healthy" | "watch" | "critical";
export type AircraftMaintenanceState = "not_due" | "due_soon" | "scheduled" | "in_service" | "overdue" | "aog";
export type AircraftRiskBand = "healthy" | "watch" | "critical";
export type AircraftStaffingFlag = "covered" | "tight" | "uncovered";
export type AircraftTone = "neutral" | "accent" | "warn" | "danger";
export type AircraftRelatedTab = "aircraft" | "dispatch" | "contracts" | "staffing" | "activity";
export type AircraftTableReadinessFilter = "all" | "ready" | "constrained";
export type AircraftTableRiskFilter = "all" | "healthy" | "watch" | "critical";
export type AircraftTableStaffingFilter = "all" | "covered" | "tight" | "uncovered";
export type AircraftTableSortKey = "attention" | "tail" | "location" | "state" | "condition" | "staffing" | "range" | "payload" | "obligation";
export type AircraftTableSortDirection = "asc" | "desc";
export type AircraftMarketConditionBand = "new" | "excellent" | "healthy" | "watch" | "rough";
export type AircraftMarketSortKey = "asking_price" | "monthly_burden" | "condition" | "range" | "passengers" | "cargo" | "distance";
export type AircraftMarketSortDirection = "asc" | "desc";

export interface AircraftTabSummaryCard {
  label: string;
  value: string;
  detail: string;
  tone: AircraftTone;
}

export interface AircraftTabLocationView {
  airportId: string;
  code: string;
  primaryLabel: string;
  secondaryLabel?: string;
  latitudeDeg?: number;
  longitudeDeg?: number;
}

export interface AircraftTabEventView {
  label: string;
  detail: string;
  atUtc?: string;
  tone: AircraftTone;
  relatedTab: AircraftRelatedTab;
}

export interface AircraftTabAircraftView {
  aircraftId: string;
  registration: string;
  displayName: string;
  modelDisplayName: string;
  roleLabel: string;
  location: AircraftTabLocationView;
  ownershipType: FleetAircraftView["ownershipType"];
  operationalState: AircraftOperationalState;
  conditionBand: AircraftConditionBand;
  maintenanceState: AircraftMaintenanceState;
  riskBand: AircraftRiskBand;
  staffingFlag: AircraftStaffingFlag;
  isReadyForNewWork: boolean;
  conditionValue: number;
  rangeNm: number;
  maxPassengers: number;
  maxCargoLb: number;
  minimumRunwayFt: number;
  minimumAirportSize: number;
  recurringPaymentAmount: number | undefined;
  paymentCadence: FleetAircraftView["paymentCadence"] | undefined;
  agreementEndAtUtc: string | undefined;
  msfs2024Status: string;
  pilotQualificationGroup: string;
  pilotsRequired: number;
  flightAttendantsRequired: number;
  mechanicSkillGroup: string;
  activeCabinLayoutDisplayName: string | undefined;
  activeCabinSeats: number | undefined;
  activeCabinCargoCapacityLb: number | undefined;
  airframeHoursTotal: number;
  airframeCyclesTotal: number;
  hoursSinceInspection: number;
  cyclesSinceInspection: number;
  hoursToService: number;
  nextEvent: AircraftTabEventView;
  currentCommitment: AircraftTabEventView | undefined;
  whyItMatters: string[];
  attentionScore: number;
}

export interface AircraftTableFilters {
  readiness: AircraftTableReadinessFilter;
  risk: AircraftTableRiskFilter;
  staffing: AircraftTableStaffingFilter;
}

export interface AircraftTableSort {
  key: AircraftTableSortKey;
  direction: AircraftTableSortDirection;
}

export interface AircraftFleetWorkspacePayload {
  currentTimeUtc: string;
  summaryCards: AircraftTabSummaryCard[];
  aircraft: AircraftTabAircraftView[];
  defaultFilters: AircraftTableFilters;
  defaultSort: AircraftTableSort;
}

export interface AircraftFleetViewState {
  filters: AircraftTableFilters;
  sort: AircraftTableSort;
  visibleAircraft: AircraftTabAircraftView[];
  selectedAircraft: AircraftTabAircraftView | null;
  selectedAircraftId: string | undefined;
}

export interface AircraftMarketOfferView {
  aircraftOfferId: string;
  aircraftModelId: string;
  activeCabinLayoutId: string | undefined;
  activeCabinLayoutDisplayName: string | undefined;
  activeCabinSeats: number | undefined;
  activeCabinCargoCapacityLb: number | undefined;
  listingType: "new" | "used";
  registration: string;
  displayName: string;
  modelDisplayName: string;
  shortName: string;
  roleLabel: string;
  marketRolePool: string;
  currentAirportId: string;
  location: AircraftTabLocationView;
  distanceFromHomeBaseNm: number;
  conditionValue: number;
  conditionBand: AircraftMarketConditionBand;
  maintenanceState: AircraftMaintenanceState;
  statusInput: string;
  airframeHoursTotal: number;
  airframeCyclesTotal: number;
  hoursSinceInspection: number;
  cyclesSinceInspection: number;
  hoursToService: number;
  askingPurchasePriceAmount: number;
  financeTerms: AircraftOfferTermsView;
  leaseTerms: AircraftOfferTermsView;
  lowestRecurringBurdenAmount: number;
  rangeNm: number;
  maxPassengers: number;
  maxCargoLb: number;
  minimumRunwayFt: number;
  minimumAirportSize: number;
  gateRequirement: string;
  requiredGroundServiceLevel: string;
  cargoLoadingType: string;
  msfs2024Status: string;
  msfs2024AvailableForUser: boolean;
  msfs2024UserNote: string | undefined;
  fitReasons: string[];
  riskReasons: string[];
  canBuyNow: boolean;
  canLoanNow: boolean;
  canLeaseNow: boolean;
  offerStatus: string;
}

export interface AircraftMarketFilters {
  searchText: string;
  rolePool: string;
  conditionBand: string;
  locationAirportText: string;
  maxDistanceNm: string;
}

export interface AircraftMarketSort {
  key: AircraftMarketSortKey;
  direction: AircraftMarketSortDirection;
}

export interface AircraftMarketWorkspacePayload {
  currentTimeUtc: string;
  summaryCards: AircraftTabSummaryCard[];
  generatedAtUtc: string | undefined;
  expiresAtUtc: string | undefined;
  offerWindowId: string | undefined;
  offers: AircraftMarketOfferView[];
  defaultSelectedOfferId: string | undefined;
  defaultFilters: AircraftMarketFilters;
  defaultSort: AircraftMarketSort;
  currentCashAmount: number;
  homeBaseAirportId: string;
  homeBaseLocation: AircraftTabLocationView;
  filterOptions: {
    rolePools: string[];
    conditionBands: AircraftMarketConditionBand[];
  };
}

export interface AircraftMarketViewState {
  filters: AircraftMarketFilters;
  sort: AircraftMarketSort;
  visibleOffers: AircraftMarketOfferView[];
  selectedOffer: AircraftMarketOfferView | null;
  selectedOfferId: string | undefined;
}

export interface AircraftTabPayload {
  saveId: string;
  currentTimeUtc: string;
  defaultWorkspaceTab: AircraftWorkspaceTab;
  fleetWorkspace: AircraftFleetWorkspacePayload;
  marketWorkspace: AircraftMarketWorkspacePayload;
  summaryCards: AircraftTabSummaryCard[];
  aircraft: AircraftTabAircraftView[];
  defaultFilters: AircraftTableFilters;
  defaultSort: AircraftTableSort;
}

interface BuildAircraftTabPayloadParams {
  companyContext: Pick<CompanyContext, "currentTimeUtc"> & Partial<CompanyContext>;
  companyContracts: CompanyContractsView | null;
  fleetState: FleetStateView | null;
  staffingState: StaffingStateView | null;
  schedules: AircraftScheduleView[];
  maintenanceTasks: MaintenanceTaskView[];
  airportReference: AirportReferenceRepository;
  aircraftReference?: AircraftReferenceRepository;
  aircraftMarket?: AircraftMarketView | null;
}

interface AirportLabel {
  airportId: string;
  code: string;
  primaryLabel: string;
  secondaryLabel?: string;
  latitudeDeg?: number;
  longitudeDeg?: number;
}

interface EventCandidate extends AircraftTabEventView {
  sortAtMs: number;
}

const defaultFleetFilters: AircraftTableFilters = {
  readiness: "all",
  risk: "all",
  staffing: "all",
};

const defaultFleetSort: AircraftTableSort = {
  key: "attention",
  direction: "desc",
};

const defaultMarketFilters: AircraftMarketFilters = {
  searchText: "",
  rolePool: "all",
  conditionBand: "all",
  locationAirportText: "",
  maxDistanceNm: "0",
};

const defaultMarketSort: AircraftMarketSort = {
  key: "asking_price",
  direction: "asc",
};

// Public entry points shape raw backend and reference data into stable fleet and market workspaces for the browser client.
export function buildAircraftTabPayload(params: BuildAircraftTabPayloadParams): AircraftTabPayload {
  const companyContext = normalizeCompanyContext(params.companyContext, params.fleetState);
  const fleetWorkspace = buildFleetWorkspace({
    ...params,
    companyContext,
  });
  const marketWorkspace = buildMarketWorkspace({
    ...params,
    companyContext,
  });

  return {
    saveId: companyContext.saveId,
    currentTimeUtc: companyContext.currentTimeUtc,
    defaultWorkspaceTab: fleetWorkspace.aircraft.length === 0 ? "market" : "fleet",
    fleetWorkspace,
    marketWorkspace,
    summaryCards: fleetWorkspace.summaryCards,
    aircraft: fleetWorkspace.aircraft,
    defaultFilters: fleetWorkspace.defaultFilters,
    defaultSort: fleetWorkspace.defaultSort,
  };
}

export function applyAircraftTabViewState(
  payload: AircraftTabPayload,
  options: {
    filters?: Partial<AircraftTableFilters>;
    sort?: Partial<AircraftTableSort>;
    selectedAircraftId: string | undefined;
  } = { selectedAircraftId: undefined },
): AircraftFleetViewState {
  return applyAircraftFleetViewState(payload.fleetWorkspace, options);
}

export function applyAircraftFleetViewState(
  payload: AircraftFleetWorkspacePayload,
  options: {
    filters?: Partial<AircraftTableFilters>;
    sort?: Partial<AircraftTableSort>;
    selectedAircraftId: string | undefined;
  } = { selectedAircraftId: undefined },
): AircraftFleetViewState {
  const filters = {
    ...payload.defaultFilters,
    ...options.filters,
  };
  const sort = {
    ...payload.defaultSort,
    ...options.sort,
  };

  const visibleAircraft = payload.aircraft
    .filter((aircraft) => matchesFleetFilters(aircraft, filters))
    .slice()
    .sort((left, right) => compareFleetAircraft(left, right, sort));

  const selectedAircraft = visibleAircraft.find((aircraft) => aircraft.aircraftId === options.selectedAircraftId)
    ?? visibleAircraft[0]
    ?? null;

  return {
    filters,
    sort,
    visibleAircraft,
    selectedAircraft,
    selectedAircraftId: selectedAircraft?.aircraftId,
  };
}

export function applyAircraftMarketViewState(
  payload: AircraftMarketWorkspacePayload,
  options: {
    filters?: Partial<AircraftMarketFilters>;
    sort?: Partial<AircraftMarketSort>;
    selectedOfferId: string | undefined;
  } = { selectedOfferId: undefined },
): AircraftMarketViewState {
  const filters = {
    ...payload.defaultFilters,
    ...options.filters,
  };
  const sort = {
    ...payload.defaultSort,
    ...options.sort,
  };
  const anchorLocation = resolveMarketAnchorLocation(payload, filters.locationAirportText);
  const maxDistanceNm = parseMaxDistanceNm(filters.maxDistanceNm);

  const visibleOffers = payload.offers
    .filter((offer) => matchesMarketFilters(offer, filters, anchorLocation, maxDistanceNm))
    .slice()
    .sort((left, right) => compareMarketOffers(left, right, sort));

  const selectedOffer = visibleOffers.find((offer) => offer.aircraftOfferId === options.selectedOfferId)
    ?? visibleOffers[0]
    ?? null;

  return {
    filters,
    sort,
    visibleOffers,
    selectedOffer,
    selectedOfferId: selectedOffer?.aircraftOfferId,
  };
}

// Fleet derivation is where posture, maintenance, staffing pressure, and next-event logic are fused per owned aircraft.
function buildFleetWorkspace(params: BuildAircraftTabPayloadParams): AircraftFleetWorkspacePayload {
  const fleet = params.fleetState?.aircraft ?? [];
  const currentTimeMs = Date.parse(params.companyContext.currentTimeUtc);
  const schedulesByAircraftId = new Map<string, AircraftScheduleView[]>();
  const maintenanceTaskByAircraftId = new Map<string, MaintenanceTaskView>();
  const contractsById = new Map((params.companyContracts?.contracts ?? []).map((contract) => [contract.companyContractId, contract]));
  const reservedByQualification = new Map<string, number>();
  const reservedByScheduleQualification = new Map<string, Map<string, number>>();

  for (const schedule of params.schedules) {
    const bucket = schedulesByAircraftId.get(schedule.aircraftId) ?? [];
    bucket.push(schedule);
    schedulesByAircraftId.set(schedule.aircraftId, bucket);

    const scheduleReservations = reservedByScheduleQualification.get(schedule.scheduleId) ?? new Map<string, number>();
    for (const allocation of schedule.laborAllocations) {
      if (allocation.status === "released") {
        continue;
      }

      scheduleReservations.set(
        allocation.qualificationGroup,
        (scheduleReservations.get(allocation.qualificationGroup) ?? 0) + allocation.unitsReserved,
      );
      reservedByQualification.set(
        allocation.qualificationGroup,
        (reservedByQualification.get(allocation.qualificationGroup) ?? 0) + allocation.unitsReserved,
      );
    }
    reservedByScheduleQualification.set(schedule.scheduleId, scheduleReservations);
  }

  for (const task of params.maintenanceTasks) {
    const existingTask = maintenanceTaskByAircraftId.get(task.aircraftId);
    if (!existingTask || Date.parse(task.plannedStartUtc) < Date.parse(existingTask.plannedStartUtc)) {
      maintenanceTaskByAircraftId.set(task.aircraftId, task);
    }
  }

  const fleetStats = {
    maxPassengers: Math.max(0, ...fleet.map((aircraft) => aircraft.maxPassengers)),
    maxCargoLb: Math.max(0, ...fleet.map((aircraft) => aircraft.maxCargoLb)),
    maxRangeNm: Math.max(0, ...fleet.map((aircraft) => aircraft.rangeNm)),
    minRunwayFt: fleet.length > 0 ? Math.min(...fleet.map((aircraft) => aircraft.minimumRunwayFt)) : 0,
    minAirportSize: fleet.length > 0 ? Math.min(...fleet.map((aircraft) => aircraft.minimumAirportSize)) : 0,
    maxRecurringPaymentAmount: Math.max(0, ...fleet.map((aircraft) => aircraft.recurringPaymentAmount ?? 0)),
    pilotQualificationCount: new Set(fleet.map((aircraft) => aircraft.pilotQualificationGroup)).size,
    mechanicSkillCount: new Set(fleet.map((aircraft) => aircraft.mechanicSkillGroup)).size,
    cabinCapableCount: fleet.filter((aircraft) => aircraft.flightAttendantsRequired > 0 || aircraft.maxPassengers > 12).length,
  };

  const aircraft = fleet.map<AircraftTabAircraftView>((entry) => {
    const schedules = schedulesByAircraftId.get(entry.aircraftId) ?? [];
    const primarySchedule = selectPrimarySchedule(schedules, entry.activeScheduleId, currentTimeMs);
    const maintenanceTask = maintenanceTaskByAircraftId.get(entry.aircraftId);
    const location = describeAirport(params.airportReference, entry.currentAirportId);
    const operationalState = deriveOperationalState(entry, primarySchedule, maintenanceTask);
    const conditionBand = mapConditionBand(entry.conditionBandInput, entry.conditionValue);
    const maintenanceState = deriveMaintenanceState(entry, maintenanceTask);
    const riskBand = deriveRiskBand(conditionBand, maintenanceState);
    const staffingFlag = deriveStaffingFlag(entry, primarySchedule, params.staffingState, reservedByQualification, reservedByScheduleQualification);
    const roleLabel = deriveRoleLabel(entry);
    const currentCommitment = buildCurrentCommitment(primarySchedule, maintenanceTask, contractsById, params.airportReference);
    const nextEvent = buildNextEvent(
      params.companyContext.currentTimeUtc,
      primarySchedule,
      maintenanceTask,
      maintenanceState,
      entry.hoursToService,
      contractsById,
      params.airportReference,
    );
    const isReadyForNewWork = entry.dispatchAvailable && staffingFlag !== "uncovered";
    const whyItMatters = deriveWhyItMatters({
      aircraft: entry,
      currentCommitment,
      nextEvent,
      roleLabel,
      staffingFlag,
      maintenanceState,
      fleetStats,
    });
    const attentionScore = deriveAttentionScore({
      aircraft: entry,
      operationalState,
      riskBand,
      staffingFlag,
      maintenanceState,
      nextEvent,
      currentTimeMs,
    });

    return {
      aircraftId: entry.aircraftId,
      registration: entry.registration,
      displayName: entry.displayName,
      modelDisplayName: entry.modelDisplayName,
      roleLabel,
      location,
      ownershipType: entry.ownershipType,
      operationalState,
      conditionBand,
      maintenanceState,
      riskBand,
      staffingFlag,
      isReadyForNewWork,
      conditionValue: entry.conditionValue,
      rangeNm: entry.rangeNm,
      maxPassengers: entry.maxPassengers,
      maxCargoLb: entry.maxCargoLb,
      minimumRunwayFt: entry.minimumRunwayFt,
      minimumAirportSize: entry.minimumAirportSize,
      recurringPaymentAmount: entry.recurringPaymentAmount,
      paymentCadence: entry.paymentCadence,
      agreementEndAtUtc: entry.agreementEndAtUtc,
      msfs2024Status: entry.msfs2024Status,
      pilotQualificationGroup: entry.pilotQualificationGroup,
      pilotsRequired: entry.pilotsRequired,
      flightAttendantsRequired: entry.flightAttendantsRequired,
      mechanicSkillGroup: entry.mechanicSkillGroup,
      activeCabinLayoutDisplayName: entry.activeCabinLayoutDisplayName,
      activeCabinSeats: entry.activeCabinSeats,
      activeCabinCargoCapacityLb: entry.activeCabinCargoCapacityLb,
      airframeHoursTotal: entry.airframeHoursTotal,
      airframeCyclesTotal: entry.airframeCyclesTotal,
      hoursSinceInspection: entry.hoursSinceInspection,
      cyclesSinceInspection: entry.cyclesSinceInspection,
      hoursToService: entry.hoursToService,
      nextEvent,
      currentCommitment,
      whyItMatters,
      attentionScore,
    };
  });

  return {
    currentTimeUtc: params.companyContext.currentTimeUtc,
    summaryCards: buildFleetSummaryCards(params.fleetState, params.staffingState, aircraft, fleetStats),
    aircraft,
    defaultFilters: defaultFleetFilters,
    defaultSort: defaultFleetSort,
  };
}

// Market derivation keeps acquisition-oriented fit and risk logic separate from owned-fleet posture.
function buildMarketWorkspace(params: BuildAircraftTabPayloadParams): AircraftMarketWorkspacePayload {
  const companyContext = params.companyContext as CompanyContext;
  const aircraftReference = params.aircraftReference;

  if (!aircraftReference) {
    return {
      currentTimeUtc: companyContext.currentTimeUtc,
      summaryCards: [
        {
          label: "Live market",
          value: "0 listings",
          detail: "Aircraft reference data is required to build the market view.",
          tone: "neutral",
        },
      ],
      generatedAtUtc: undefined,
      expiresAtUtc: undefined,
      offerWindowId: undefined,
      offers: [],
      defaultSelectedOfferId: undefined,
      defaultFilters: defaultMarketFilters,
      defaultSort: defaultMarketSort,
      currentCashAmount: companyContext.currentCashAmount,
      homeBaseAirportId: companyContext.homeBaseAirportId,
      homeBaseLocation: describeAirport(params.airportReference, companyContext.homeBaseAirportId),
      filterOptions: {
        rolePools: [],
        conditionBands: [],
      },
    };
  }

  const homeBaseAirport = params.airportReference.findAirport(companyContext.homeBaseAirportId);
  const homeBaseLocation = describeAirport(params.airportReference, companyContext.homeBaseAirportId);
  const offers = (params.aircraftMarket?.offers ?? [])
    .filter((offer) => offer.offerStatus === "available")
    .map<AircraftMarketOfferView>((offer) => {
      const model = aircraftReference.findModel(offer.aircraftModelId);
      if (!model) {
        throw new Error(`Aircraft model ${offer.aircraftModelId} is missing from the reference database.`);
      }

      const layout = offer.activeCabinLayoutId ? aircraftReference.findLayout(offer.activeCabinLayoutId) : null;
      const location = describeAirport(params.airportReference, offer.currentAirportId);
      const currentAirport = params.airportReference.findAirport(offer.currentAirportId);
      const distanceFromHomeBaseNm = homeBaseAirport && currentAirport ? haversineDistanceNm(homeBaseAirport, currentAirport) : 0;
      const fitReasons = toStringArray(offer.explanationMetadata.fit_reasons);
      const riskReasons = toStringArray(offer.explanationMetadata.risk_reasons);

      return {
        aircraftOfferId: offer.aircraftOfferId,
        aircraftModelId: offer.aircraftModelId,
        activeCabinLayoutId: offer.activeCabinLayoutId,
        activeCabinLayoutDisplayName: layout?.displayName,
        activeCabinSeats: layout?.totalSeats,
        activeCabinCargoCapacityLb: layout?.cargoCapacityLb,
        listingType: offer.listingType,
        registration: offer.registration,
        displayName: offer.displayName,
        modelDisplayName: model.displayName,
        shortName: model.shortName,
        roleLabel: aircraftRoleLabel(model),
        marketRolePool: model.marketRolePool,
        currentAirportId: offer.currentAirportId,
        location,
        distanceFromHomeBaseNm,
        conditionValue: offer.conditionValue,
        conditionBand: mapMarketConditionBand(offer.listingType, offer.conditionBandInput, offer.conditionValue),
        maintenanceState: mapOfferMaintenanceState(offer.maintenanceStateInput),
        statusInput: offer.statusInput,
        airframeHoursTotal: offer.airframeHoursTotal,
        airframeCyclesTotal: offer.airframeCyclesTotal,
        hoursSinceInspection: offer.hoursSinceInspection,
        cyclesSinceInspection: offer.cyclesSinceInspection,
        hoursToService: offer.hoursToService,
        askingPurchasePriceAmount: offer.askingPurchasePriceAmount,
        financeTerms: offer.financeTerms,
        leaseTerms: offer.leaseTerms,
        lowestRecurringBurdenAmount: Math.min(
          offer.financeTerms.recurringPaymentAmount ?? Number.POSITIVE_INFINITY,
          offer.leaseTerms.recurringPaymentAmount ?? Number.POSITIVE_INFINITY,
        ),
        rangeNm: model.rangeNm,
        maxPassengers: layout?.totalSeats ?? model.maxPassengers,
        maxCargoLb: layout?.cargoCapacityLb ?? model.maxCargoLb,
        minimumRunwayFt: model.minimumRunwayFt,
        minimumAirportSize: model.minimumAirportSize,
        gateRequirement: model.gateRequirement,
        requiredGroundServiceLevel: model.requiredGroundServiceLevel,
        cargoLoadingType: model.cargoLoadingType,
        msfs2024Status: model.msfs2024Status,
        msfs2024AvailableForUser: model.msfs2024AvailableForUser,
        msfs2024UserNote: model.msfs2024UserNote,
        fitReasons,
        riskReasons,
        canBuyNow: companyContext.currentCashAmount >= offer.askingPurchasePriceAmount,
        canLoanNow: companyContext.currentCashAmount >= offer.financeTerms.upfrontPaymentAmount,
        canLeaseNow: companyContext.currentCashAmount >= offer.leaseTerms.upfrontPaymentAmount,
        offerStatus: offer.offerStatus,
      };
    });

  return {
    currentTimeUtc: companyContext.currentTimeUtc,
    summaryCards: buildMarketSummaryCards(params, offers),
    generatedAtUtc: params.aircraftMarket?.generatedAtUtc,
    expiresAtUtc: params.aircraftMarket?.expiresAtUtc,
    offerWindowId: params.aircraftMarket?.offerWindowId,
    offers,
    defaultSelectedOfferId: offers[0]?.aircraftOfferId,
    defaultFilters: defaultMarketFilters,
    defaultSort: defaultMarketSort,
    currentCashAmount: companyContext.currentCashAmount,
    homeBaseAirportId: companyContext.homeBaseAirportId,
    homeBaseLocation,
    filterOptions: {
      rolePools: [...new Set(offers.map((offer) => offer.marketRolePool))].sort((left, right) => left.localeCompare(right, "en-US")),
      conditionBands: [...new Set(offers.map((offer) => offer.conditionBand))] as AircraftMarketConditionBand[],
    },
  };
}

// Summary cards compress the heavier payloads into the top-line signals shown above each workspace.
function buildMarketSummaryCards(
  params: BuildAircraftTabPayloadParams,
  offers: AircraftMarketOfferView[],
): AircraftTabSummaryCard[] {
  const companyContext = params.companyContext as CompanyContext;
  const newCount = offers.filter((offer) => offer.listingType === "new").length;
  const usedCount = offers.length - newCount;
  const awayFromBaseCount = offers.filter((offer) => offer.currentAirportId !== companyContext.homeBaseAirportId).length;
  const lowestAskingPrice = offers.length > 0 ? Math.min(...offers.map((offer) => offer.askingPurchasePriceAmount)) : 0;
  const highestAskingPrice = offers.length > 0 ? Math.max(...offers.map((offer) => offer.askingPurchasePriceAmount)) : 0;
  const furthestListingNm = offers.length > 0 ? Math.max(...offers.map((offer) => offer.distanceFromHomeBaseNm)) : 0;

  return [
    {
      label: "Live market",
      value: `${offers.length} listings`,
      detail: "Listings rotate quietly as sim time advances.",
      tone: offers.length > 0 ? "accent" : "neutral",
    },
    {
      label: "Price range",
      value: offers.length > 0 ? `${formatMoney(lowestAskingPrice)} to ${formatMoney(highestAskingPrice)}` : "No pricing",
      detail: `${newCount} new | ${usedCount} used in the current live market.`,
      tone: offers.length > 0 ? "accent" : "neutral",
    },
    {
      label: "Location spread",
      value: `${awayFromBaseCount}/${offers.length || 0} away`,
      detail: `Furthest listing ${formatNumber(furthestListingNm)} nm from ${companyContext.homeBaseAirportId}.`,
      tone: awayFromBaseCount > 0 ? "accent" : "neutral",
    },
  ];
}

function buildFleetSummaryCards(
  fleetState: FleetStateView | null,
  staffingState: StaffingStateView | null,
  aircraft: AircraftTabAircraftView[],
  fleetStats: {
    maxPassengers: number;
    maxCargoLb: number;
    maxRangeNm: number;
    minRunwayFt: number;
    minAirportSize: number;
    maxRecurringPaymentAmount: number;
    pilotQualificationCount: number;
    mechanicSkillCount: number;
    cabinCapableCount: number;
  },
): AircraftTabSummaryCard[] {
  const readyCount = aircraft.filter((entry) => entry.isReadyForNewWork).length;
  const constrainedCount = aircraft.length - readyCount;
  const watchCount = aircraft.filter((entry) => entry.riskBand === "watch").length;
  const criticalCount = aircraft.filter((entry) => entry.riskBand === "critical").length;
  const totalRecurring = aircraft.reduce((sum, entry) => sum + (entry.recurringPaymentAmount ?? 0), 0);

  return [
    {
      label: "Fleet posture",
      value: `${readyCount}/${aircraft.length}`,
      detail: `${constrainedCount} constrained | ${watchCount + criticalCount} need attention soon.`,
      tone: criticalCount > 0 ? "warn" : "accent",
    },
    {
      label: "Ownership mix",
      value: `${fleetState?.ownedCount ?? 0} owned | ${(fleetState?.leasedCount ?? 0) + (fleetState?.financedCount ?? 0)} financed/leased`,
      detail: `${formatMoney(totalRecurring)} in visible recurring aircraft obligations.`,
      tone: totalRecurring > 0 ? "neutral" : "accent",
    },
    {
      label: "Access and envelope",
      value: `${formatNumber(fleetStats.minRunwayFt)} ft | Size ${fleetStats.minAirportSize || 0}`,
      detail: `Top lift ${formatNumber(fleetStats.maxCargoLb)} lb | top reach ${formatNumber(fleetStats.maxRangeNm)} nm.`,
      tone: aircraft.length > 0 ? "accent" : "neutral",
    },
    {
      label: "Qualification spread",
      value: `${fleetStats.pilotQualificationCount} pilot lines`,
      detail: `${fleetStats.cabinCapableCount} cabin-capable | ${fleetStats.mechanicSkillCount} mechanic groups | ${formatMoney(staffingState?.totalMonthlyFixedCostAmount ?? 0)}/mo labor.`,
      tone: fleetStats.pilotQualificationCount > 1 ? "warn" : "neutral",
    },
  ];
}

function describeAirport(airportReference: AirportReferenceRepository, airportId: string): AirportLabel {
  const airport = airportReference.findAirport(airportId);
  if (!airport) {
    return {
      airportId,
      code: airportId,
      primaryLabel: airportId,
    };
  }

  const primaryLabel = airport.municipality ?? airport.name;
  const secondaryParts = [
    airport.name !== primaryLabel ? airport.name : undefined,
    airport.isoCountry,
  ].filter((part): part is string => Boolean(part));

  if (secondaryParts.length > 0) {
    return {
      airportId,
      code: airport.identCode || airport.airportKey,
      primaryLabel,
      secondaryLabel: secondaryParts.join(" | "),
      latitudeDeg: airport.latitudeDeg,
      longitudeDeg: airport.longitudeDeg,
    };
  }

  return {
    airportId,
    code: airport.identCode || airport.airportKey,
    primaryLabel,
    latitudeDeg: airport.latitudeDeg,
    longitudeDeg: airport.longitudeDeg,
  };
}

// Client-side sorting and filtering are pure so the browser can recompute instantly after every interaction.
function matchesFleetFilters(aircraft: AircraftTabAircraftView, filters: AircraftTableFilters): boolean {
  if (filters.readiness === "ready" && !aircraft.isReadyForNewWork) {
    return false;
  }

  if (filters.readiness === "constrained" && aircraft.isReadyForNewWork) {
    return false;
  }

  if (filters.risk === "healthy" && aircraft.riskBand !== "healthy") {
    return false;
  }

  if (filters.risk === "watch" && aircraft.riskBand !== "watch") {
    return false;
  }

  if (filters.risk === "critical" && aircraft.riskBand !== "critical") {
    return false;
  }

  if (filters.staffing !== "all" && aircraft.staffingFlag !== filters.staffing) {
    return false;
  }

  return true;
}

function compareFleetAircraft(left: AircraftTabAircraftView, right: AircraftTabAircraftView, sort: AircraftTableSort): number {
  const direction = sort.direction === "asc" ? 1 : -1;
  const stateRank = { available: 0, scheduled: 1, maintenance: 2, grounded: 3 } satisfies Record<AircraftOperationalState, number>;
  const conditionRank = { excellent: 0, healthy: 1, watch: 2, critical: 3 } satisfies Record<AircraftConditionBand, number>;
  const staffingRank = { covered: 0, tight: 1, uncovered: 2 } satisfies Record<AircraftStaffingFlag, number>;

  let comparison = 0;
  switch (sort.key) {
    case "attention":
      comparison = left.attentionScore - right.attentionScore;
      break;
    case "tail":
      comparison = left.registration.localeCompare(right.registration, "en-US");
      break;
    case "location":
      comparison = left.location.code.localeCompare(right.location.code, "en-US");
      break;
    case "state":
      comparison = stateRank[left.operationalState] - stateRank[right.operationalState];
      break;
    case "condition":
      comparison = conditionRank[left.conditionBand] - conditionRank[right.conditionBand];
      break;
    case "staffing":
      comparison = staffingRank[left.staffingFlag] - staffingRank[right.staffingFlag];
      break;
    case "range":
      comparison = left.rangeNm - right.rangeNm;
      break;
    case "payload":
      comparison = payloadScore(left) - payloadScore(right);
      break;
    case "obligation":
      comparison = (left.recurringPaymentAmount ?? 0) - (right.recurringPaymentAmount ?? 0);
      break;
  }

  if (comparison !== 0) {
    return comparison * direction;
  }

  return left.registration.localeCompare(right.registration, "en-US");
}

// The helpers below translate backend and reference inputs into UI-facing posture labels and risk signals.
function matchesMarketFilters(
  offer: AircraftMarketOfferView,
  filters: AircraftMarketFilters,
  anchorLocation: AircraftTabLocationView | null,
  maxDistanceNm: number,
): boolean {
  const searchText = filters.searchText.trim().toLowerCase();
  if (searchText) {
    const haystack = [
      offer.modelDisplayName,
      offer.shortName,
      offer.roleLabel,
      offer.marketRolePool,
      offer.location.code,
      offer.location.primaryLabel,
      offer.location.secondaryLabel ?? "",
      offer.displayName,
      offer.registration,
    ].join(" ").toLowerCase();
    if (!haystack.includes(searchText)) {
      return false;
    }
  }

  if (filters.rolePool !== "all" && offer.marketRolePool !== filters.rolePool) {
    return false;
  }

  if (filters.conditionBand !== "all" && offer.conditionBand !== filters.conditionBand) {
    return false;
  }

  const locationAirportText = filters.locationAirportText.trim().toLowerCase();
  if (locationAirportText) {
    if (anchorLocation && hasCoordinates(anchorLocation) && hasCoordinates(offer.location)) {
      const distanceFromAnchorNm = haversineDistanceNm(
        {
          latitudeDeg: anchorLocation.latitudeDeg,
          longitudeDeg: anchorLocation.longitudeDeg,
        } as AirportRecord,
        {
          latitudeDeg: offer.location.latitudeDeg,
          longitudeDeg: offer.location.longitudeDeg,
        } as AirportRecord,
      );
      const allowedDistanceNm = maxDistanceNm > 0 ? maxDistanceNm : 0;
      if (distanceFromAnchorNm > allowedDistanceNm) {
        return false;
      }
    } else {
      const haystack = [offer.location.code, offer.location.primaryLabel, offer.location.secondaryLabel ?? ""].join(" ").toLowerCase();
      if (!haystack.includes(locationAirportText)) {
        return false;
      }
    }
  }

  return true;
}

function resolveMarketAnchorLocation(
  payload: AircraftMarketWorkspacePayload,
  airportText: string,
): AircraftTabLocationView | null {
  const normalizedQuery = airportText.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  const candidates = dedupeLocations([payload.homeBaseLocation, ...payload.offers.map((offer) => offer.location)])
    .filter((location) => hasCoordinates(location));

  const exactCodeMatch = candidates.find((location) => location.code.toLowerCase() === normalizedQuery);
  if (exactCodeMatch) {
    return exactCodeMatch;
  }

  const exactIdMatch = candidates.find((location) => location.airportId.toLowerCase() === normalizedQuery);
  if (exactIdMatch) {
    return exactIdMatch;
  }

  const exactLabelMatch = candidates.find((location) => marketLocationHaystack(location) === normalizedQuery);
  if (exactLabelMatch) {
    return exactLabelMatch;
  }

  const prefixMatch = candidates.find((location) =>
    location.code.toLowerCase().startsWith(normalizedQuery)
    || location.primaryLabel.toLowerCase().startsWith(normalizedQuery)
    || (location.secondaryLabel?.toLowerCase().startsWith(normalizedQuery) ?? false),
  );
  if (prefixMatch) {
    return prefixMatch;
  }

  const partialMatch = candidates.find((location) => marketLocationHaystack(location).includes(normalizedQuery));
  return partialMatch ?? null;
}

function dedupeLocations(locations: AircraftTabLocationView[]): AircraftTabLocationView[] {
  const byAirportId = new Map<string, AircraftTabLocationView>();
  for (const location of locations) {
    if (!byAirportId.has(location.airportId)) {
      byAirportId.set(location.airportId, location);
    }
  }
  return [...byAirportId.values()];
}

function marketLocationHaystack(location: AircraftTabLocationView): string {
  return [location.code, location.airportId, location.primaryLabel, location.secondaryLabel ?? ""]
    .join(" ")
    .toLowerCase();
}

function hasCoordinates(location: AircraftTabLocationView): location is AircraftTabLocationView & {
  latitudeDeg: number;
  longitudeDeg: number;
} {
  return Number.isFinite(location.latitudeDeg) && Number.isFinite(location.longitudeDeg);
}

function parseMaxDistanceNm(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function compareMarketOffers(left: AircraftMarketOfferView, right: AircraftMarketOfferView, sort: AircraftMarketSort): number {
  const direction = sort.direction === "asc" ? 1 : -1;
  const conditionRank = { new: 4, excellent: 3, healthy: 2, watch: 1, rough: 0 } satisfies Record<AircraftMarketConditionBand, number>;

  let comparison = 0;
  switch (sort.key) {
    case "asking_price":
      comparison = left.askingPurchasePriceAmount - right.askingPurchasePriceAmount;
      break;
    case "monthly_burden":
      comparison = left.lowestRecurringBurdenAmount - right.lowestRecurringBurdenAmount;
      break;
    case "condition":
      comparison = conditionRank[left.conditionBand] - conditionRank[right.conditionBand];
      break;
    case "range":
      comparison = left.rangeNm - right.rangeNm;
      break;
    case "passengers":
      comparison = left.maxPassengers - right.maxPassengers;
      break;
    case "cargo":
      comparison = left.maxCargoLb - right.maxCargoLb;
      break;
    case "distance":
      comparison = left.distanceFromHomeBaseNm - right.distanceFromHomeBaseNm;
      break;
  }

  if (comparison !== 0) {
    return comparison * direction;
  }

  return left.modelDisplayName.localeCompare(right.modelDisplayName, "en-US");
}

function mapMarketConditionBand(
  listingType: "new" | "used",
  conditionBandInput: string,
  conditionValue: number,
): AircraftMarketConditionBand {
  if (listingType === "new") {
    return "new";
  }

  switch (conditionBandInput) {
    case "excellent":
      return "excellent";
    case "good":
      return "healthy";
    case "fair":
      return "watch";
    case "poor":
      return "rough";
    default:
      if (conditionValue >= 0.9) {
        return "excellent";
      }
      if (conditionValue >= 0.75) {
        return "healthy";
      }
      if (conditionValue >= 0.6) {
        return "watch";
      }
      return "rough";
    }
}

function mapOfferMaintenanceState(stateInput: string): AircraftMaintenanceState {
  switch (stateInput) {
    case "due_soon":
      return "due_soon";
    case "scheduled":
      return "scheduled";
    case "in_service":
      return "in_service";
    case "overdue":
      return "overdue";
    case "aog":
      return "aog";
    default:
      return "not_due";
  }
}

function deriveOperationalState(
  aircraft: FleetAircraftView,
  primarySchedule: AircraftScheduleView | undefined,
  maintenanceTask: MaintenanceTaskView | undefined,
): AircraftOperationalState {
  if (aircraft.aogFlag || aircraft.maintenanceStateInput === "aog" || aircraft.statusInput === "grounded") {
    return "grounded";
  }

  if (maintenanceTask && (maintenanceTask.taskState === "in_progress" || aircraft.statusInput === "maintenance")) {
    return "maintenance";
  }

  if (primarySchedule || aircraft.activeScheduleId || aircraft.statusInput === "scheduled") {
    return "scheduled";
  }

  return "available";
}

function mapConditionBand(conditionBandInput: string, conditionValue: number): AircraftConditionBand {
  switch (conditionBandInput) {
    case "excellent":
      return "excellent";
    case "good":
      return "healthy";
    case "fair":
      return "watch";
    case "poor":
      return "critical";
    default:
      if (conditionValue >= 0.85) {
        return "excellent";
      }
      if (conditionValue >= 0.65) {
        return "healthy";
      }
      if (conditionValue >= 0.45) {
        return "watch";
      }
      return "critical";
  }
}

function deriveMaintenanceState(
  aircraft: FleetAircraftView,
  maintenanceTask: MaintenanceTaskView | undefined,
): AircraftMaintenanceState {
  if (aircraft.aogFlag || aircraft.maintenanceStateInput === "aog") {
    return "aog";
  }

  if (maintenanceTask) {
    return maintenanceTask.taskState === "in_progress" || aircraft.statusInput === "maintenance"
      ? "in_service"
      : "scheduled";
  }

  if (aircraft.maintenanceStateInput === "overdue") {
    return "overdue";
  }

  if (aircraft.maintenanceStateInput === "due_soon") {
    return "due_soon";
  }

  return "not_due";
}

function deriveRiskBand(conditionBand: AircraftConditionBand, maintenanceState: AircraftMaintenanceState): AircraftRiskBand {
  if (conditionBand === "critical" || maintenanceState === "aog" || maintenanceState === "overdue") {
    return "critical";
  }

  if (conditionBand === "watch" || maintenanceState === "due_soon") {
    return "watch";
  }

  return "healthy";
}

function deriveStaffingFlag(
  aircraft: FleetAircraftView,
  primarySchedule: AircraftScheduleView | undefined,
  staffingState: StaffingStateView | null,
  reservedByQualification: Map<string, number>,
  reservedByScheduleQualification: Map<string, Map<string, number>>,
): AircraftStaffingFlag {
  const coverageSummaries = staffingState?.coverageSummaries ?? [];
  const coverageByKey = new Map(coverageSummaries.map((summary) => [`${summary.laborCategory}:${summary.qualificationGroup}`, summary.activeCoverageUnits]));
  const ownReservations = primarySchedule ? reservedByScheduleQualification.get(primarySchedule.scheduleId) ?? new Map<string, number>() : new Map<string, number>();
  const requirements = [
    {
      key: `pilot:${aircraft.pilotQualificationGroup}`,
      requirement: aircraft.pilotsRequired,
      qualificationGroup: aircraft.pilotQualificationGroup,
    },
    {
      key: "flight_attendant:cabin_general",
      requirement: aircraft.flightAttendantsRequired,
      qualificationGroup: "cabin_general",
    },
  ].filter((entry) => entry.requirement > 0);

  if (requirements.length === 0) {
    return "covered";
  }

  let hasTightCoverage = false;
  for (const requirement of requirements) {
    const totalCoverage = coverageByKey.get(requirement.key) ?? 0;
    const reservedUnits = reservedByQualification.get(requirement.qualificationGroup) ?? 0;
    const ownReservedUnits = ownReservations.get(requirement.qualificationGroup) ?? 0;
    const availableUnits = totalCoverage - (reservedUnits - ownReservedUnits);

    if (availableUnits < requirement.requirement) {
      return "uncovered";
    }

    if (availableUnits <= requirement.requirement) {
      hasTightCoverage = true;
    }
  }

  return hasTightCoverage ? "tight" : "covered";
}

function deriveRoleLabel(aircraft: FleetAircraftView): string {
  if (aircraft.maxCargoLb >= 4500 && aircraft.maxPassengers <= 12) {
    return "Cargo mover";
  }

  if (aircraft.maxPassengers >= 18) {
    return "Passenger workhorse";
  }

  if (aircraft.minimumRunwayFt <= 3500 && aircraft.minimumAirportSize <= 2) {
    return "Short-field utility";
  }

  if (aircraft.rangeNm >= 1500) {
    return "Long-range charter";
  }

  return "Utility all-rounder";
}

function aircraftRoleLabel(model: {
  maxCargoLb: number;
  maxPassengers: number;
  minimumRunwayFt: number;
  minimumAirportSize: number;
  rangeNm: number;
}): string {
  if (model.maxCargoLb >= 4500 && model.maxPassengers <= 12) {
    return "Cargo mover";
  }

  if (model.maxPassengers >= 60) {
    return "Mainline passenger";
  }

  if (model.maxPassengers >= 18) {
    return "Regional passenger";
  }

  if (model.minimumRunwayFt <= 3500 && model.minimumAirportSize <= 2) {
    return "Short-field utility";
  }

  if (model.rangeNm >= 1500) {
    return "Long-range charter";
  }

  return "Utility all-rounder";
}

// Commitment and event helpers prioritize the next actionable thing the player needs to know about an aircraft.
function buildCurrentCommitment(
  primarySchedule: AircraftScheduleView | undefined,
  maintenanceTask: MaintenanceTaskView | undefined,
  contractsById: Map<string, NonNullable<CompanyContractsView["contracts"]>[number]>,
  airportReference: AirportReferenceRepository,
): AircraftTabEventView | undefined {
  if (maintenanceTask) {
    return {
      label: maintenanceTask.taskState === "in_progress" ? "Maintenance in service" : "Maintenance booked",
      detail: `${maintenanceTask.maintenanceType.replaceAll("_", " ")} | ${formatDate(maintenanceTask.plannedStartUtc)} to ${formatDate(maintenanceTask.plannedEndUtc)}`,
      atUtc: maintenanceTask.taskState === "in_progress" ? maintenanceTask.plannedEndUtc : maintenanceTask.plannedStartUtc,
      tone: maintenanceTask.taskState === "in_progress" ? "warn" : "neutral",
      relatedTab: "aircraft",
    };
  }

  if (!primarySchedule) {
    return undefined;
  }

  const inProgressLeg = primarySchedule.legs.find((leg) => leg.legState === "in_progress");
  if (inProgressLeg) {
    return {
      label: routeLabelForLeg(inProgressLeg, airportReference),
      detail: `In progress | arr ${formatDate(inProgressLeg.plannedArrivalUtc)}`,
      atUtc: inProgressLeg.plannedArrivalUtc,
      tone: "accent",
      relatedTab: "dispatch",
    };
  }

  const nextLeg = primarySchedule.legs.find((leg) => leg.legState === "planned") ?? primarySchedule.legs[0];
  if (!nextLeg) {
    return {
      label: "Schedule reserved",
      detail: `${formatDate(primarySchedule.plannedStartUtc)} to ${formatDate(primarySchedule.plannedEndUtc)}`,
      atUtc: primarySchedule.plannedStartUtc,
      tone: primarySchedule.isDraft ? "neutral" : "accent",
      relatedTab: "dispatch",
    };
  }

  const contract = nextLeg.linkedCompanyContractId ? contractsById.get(nextLeg.linkedCompanyContractId) : undefined;
  const contractDetail = contract ? ` | due ${formatDate(contract.deadlineUtc)}` : "";

  return {
    label: routeLabelForLeg(nextLeg, airportReference),
    detail: `Dep ${formatDate(nextLeg.plannedDepartureUtc)}${contractDetail}`,
    atUtc: nextLeg.plannedDepartureUtc,
    tone: primarySchedule.isDraft ? "neutral" : "accent",
    relatedTab: contract ? "contracts" : "dispatch",
  };
}

function buildNextEvent(
  currentTimeUtc: string,
  primarySchedule: AircraftScheduleView | undefined,
  maintenanceTask: MaintenanceTaskView | undefined,
  maintenanceState: AircraftMaintenanceState,
  hoursToService: number,
  contractsById: Map<string, NonNullable<CompanyContractsView["contracts"]>[number]>,
  airportReference: AirportReferenceRepository,
): AircraftTabEventView {
  const currentTimeMs = Date.parse(currentTimeUtc);
  const candidates: EventCandidate[] = [];

  if (primarySchedule) {
    for (const leg of primarySchedule.legs) {
      if (leg.legState === "completed" || leg.legState === "cancelled" || leg.legState === "failed") {
        continue;
      }

      if (leg.legState === "in_progress") {
        candidates.push({
          label: "Arrival next",
          detail: `${routeLabelForLeg(leg, airportReference)} | arr ${formatDate(leg.plannedArrivalUtc)}`,
          atUtc: leg.plannedArrivalUtc,
          tone: "accent",
          relatedTab: "dispatch",
          sortAtMs: Date.parse(leg.plannedArrivalUtc),
        });
        break;
      }

      candidates.push({
        label: "Departure next",
        detail: `${routeLabelForLeg(leg, airportReference)} | dep ${formatDate(leg.plannedDepartureUtc)}`,
        atUtc: leg.plannedDepartureUtc,
        tone: primarySchedule.isDraft ? "neutral" : "accent",
        relatedTab: leg.linkedCompanyContractId && contractsById.has(leg.linkedCompanyContractId) ? "contracts" : "dispatch",
        sortAtMs: Date.parse(leg.plannedDepartureUtc),
      });
      break;
    }
  }

  if (maintenanceTask) {
    candidates.push({
      label: maintenanceTask.taskState === "in_progress" ? "Maintenance completes" : "Maintenance starts",
      detail: `${maintenanceTask.maintenanceType.replaceAll("_", " ")} | ${formatDate(maintenanceTask.taskState === "in_progress" ? maintenanceTask.plannedEndUtc : maintenanceTask.plannedStartUtc)}`,
      atUtc: maintenanceTask.taskState === "in_progress" ? maintenanceTask.plannedEndUtc : maintenanceTask.plannedStartUtc,
      tone: maintenanceTask.taskState === "in_progress" ? "warn" : "neutral",
      relatedTab: "aircraft",
      sortAtMs: Date.parse(maintenanceTask.taskState === "in_progress" ? maintenanceTask.plannedEndUtc : maintenanceTask.plannedStartUtc),
    });
  }

  const datedCandidate = candidates
    .filter((candidate) => Number.isFinite(candidate.sortAtMs) && candidate.sortAtMs >= currentTimeMs)
    .sort((left, right) => left.sortAtMs - right.sortAtMs)[0];

  if (datedCandidate) {
    return datedCandidate;
  }

  if (maintenanceState === "aog") {
    return {
      label: "Aircraft grounded",
      detail: "Maintenance has become a hard operational blocker.",
      tone: "danger",
      relatedTab: "aircraft",
    };
  }

  if (maintenanceState === "overdue") {
    return {
      label: "Maintenance overdue",
      detail: `${formatHours(hoursToService)} past the current service window.`,
      tone: "danger",
      relatedTab: "aircraft",
    };
  }

  if (maintenanceState === "due_soon") {
    return {
      label: "Service due soon",
      detail: `${formatHours(hoursToService)} remaining before service is due.`,
      tone: "warn",
      relatedTab: "aircraft",
    };
  }

  return {
    label: "Idle now",
    detail: "No active schedule or maintenance milestone is currently queued.",
    tone: "neutral",
    relatedTab: "dispatch",
  };
}

// Attention scoring and the "why it matters" bullets drive the default ordering and detail emphasis in the UI.
function deriveWhyItMatters(params: {
  aircraft: FleetAircraftView;
  currentCommitment: AircraftTabEventView | undefined;
  nextEvent: AircraftTabEventView;
  roleLabel: string;
  staffingFlag: AircraftStaffingFlag;
  maintenanceState: AircraftMaintenanceState;
  fleetStats: {
    maxPassengers: number;
    maxCargoLb: number;
    maxRangeNm: number;
    minRunwayFt: number;
    minAirportSize: number;
    maxRecurringPaymentAmount: number;
    pilotQualificationCount: number;
    mechanicSkillCount: number;
    cabinCapableCount: number;
  };
}): string[] {
  const reasons: string[] = [];

  if (params.aircraft.maxCargoLb > 0 && params.aircraft.maxCargoLb >= params.fleetStats.maxCargoLb * 0.95) {
    reasons.push("One of your strongest cargo-capacity aircraft.");
  }
  if (params.aircraft.maxPassengers > 0 && params.aircraft.maxPassengers >= params.fleetStats.maxPassengers * 0.95) {
    reasons.push("Carries some of the fleet's highest passenger capacity.");
  }
  if (
    params.aircraft.minimumRunwayFt <= params.fleetStats.minRunwayFt + 250
    && params.aircraft.minimumAirportSize <= params.fleetStats.minAirportSize
  ) {
    reasons.push("Gives you your best small-field access profile.");
  }
  if (params.aircraft.rangeNm >= params.fleetStats.maxRangeNm * 0.95) {
    reasons.push("Extends the fleet's longest practical reach.");
  }
  if (reasons.length === 0) {
    reasons.push(`${params.roleLabel} for current network growth decisions.`);
  }
  if (params.maintenanceState === "aog") {
    reasons.push("Grounded until maintenance clears the airframe.");
  } else if (params.maintenanceState === "overdue") {
    reasons.push(`${formatHours(params.aircraft.hoursToService)} past the maintenance window.`);
  } else if (params.maintenanceState === "due_soon") {
    reasons.push(`${formatHours(params.aircraft.hoursToService)} remaining before service is due.`);
  }
  if (params.staffingFlag === "uncovered") {
    reasons.push("Current staffing depth does not cover this aircraft's labor model.");
  } else if (params.staffingFlag === "tight") {
    reasons.push("Qualified staffing exists, but with little redundancy.");
  }
  if (
    (params.aircraft.recurringPaymentAmount ?? 0) > 0
    && (params.aircraft.recurringPaymentAmount ?? 0) >= params.fleetStats.maxRecurringPaymentAmount * 0.85
  ) {
    reasons.push(`Carries one of the fleet's heavier visible obligations at ${formatMoney(params.aircraft.recurringPaymentAmount ?? 0)}.`);
  }
  if (params.currentCommitment) {
    reasons.push(params.currentCommitment.detail);
  } else {
    reasons.push(params.nextEvent.detail);
  }
  return reasons.slice(0, 3);
}

function deriveAttentionScore(params: {
  aircraft: FleetAircraftView;
  operationalState: AircraftOperationalState;
  riskBand: AircraftRiskBand;
  staffingFlag: AircraftStaffingFlag;
  maintenanceState: AircraftMaintenanceState;
  nextEvent: AircraftTabEventView;
  currentTimeMs: number;
}): number {
  let score = 0;
  const hoursUntil = params.nextEvent.atUtc
    ? (Date.parse(params.nextEvent.atUtc) - params.currentTimeMs) / 3_600_000
    : Number.POSITIVE_INFINITY;

  switch (params.operationalState) {
    case "grounded":
      score += 1000;
      break;
    case "maintenance":
      score += 780;
      break;
    case "scheduled":
      score += 540;
      break;
    case "available":
      score += 120;
      break;
  }
  switch (params.maintenanceState) {
    case "aog":
      score += 800;
      break;
    case "overdue":
      score += 650;
      break;
    case "due_soon":
      score += 220;
      break;
    default:
      break;
  }
  switch (params.staffingFlag) {
    case "uncovered":
      score += 520;
      break;
    case "tight":
      score += 180;
      break;
    default:
      break;
  }
  switch (params.riskBand) {
    case "critical":
      score += 260;
      break;
    case "watch":
      score += 120;
      break;
    default:
      break;
  }
  if (Number.isFinite(hoursUntil) && hoursUntil >= 0 && hoursUntil <= 24) {
    score += Math.round((24 - hoursUntil) * 8);
  }
  score += Math.round((params.aircraft.recurringPaymentAmount ?? 0) / 1000);
  return score;
}

function selectPrimarySchedule(
  schedules: AircraftScheduleView[],
  activeScheduleId: string | undefined,
  currentTimeMs: number,
): AircraftScheduleView | undefined {
  const activeSchedule = activeScheduleId ? schedules.find((schedule) => schedule.scheduleId === activeScheduleId) : undefined;
  if (activeSchedule) {
    return activeSchedule;
  }
  const upcomingSchedule = schedules.find((schedule) => Date.parse(schedule.plannedEndUtc) >= currentTimeMs && schedule.scheduleState !== "completed");
  return upcomingSchedule ?? schedules.find((schedule) => schedule.scheduleState !== "completed") ?? schedules[0];
}

function routeLabelForLeg(leg: ScheduleLegView, airportReference: AirportReferenceRepository): string {
  const origin = describeAirport(airportReference, leg.originAirportId).code;
  const destination = describeAirport(airportReference, leg.destinationAirportId).code;
  return `${origin} -> ${destination}`;
}

function payloadScore(aircraft: AircraftTabAircraftView): number {
  return aircraft.maxCargoLb + aircraft.maxPassengers * 250;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function normalizeCompanyContext(
  companyContext: Pick<CompanyContext, "currentTimeUtc"> & Partial<CompanyContext>,
  fleetState: FleetStateView | null,
): CompanyContext {
  const fallbackHomeBaseAirportId = fleetState?.aircraft[0]?.currentAirportId ?? "KDEN";
  return {
    saveId: companyContext.saveId ?? "synthetic_aircraft_tab",
    companyId: companyContext.companyId ?? "company_synthetic",
    worldSeed: companyContext.worldSeed ?? "synthetic_world_seed",
    displayName: companyContext.displayName ?? "Synthetic Carrier",
    reputationScore: companyContext.reputationScore ?? 50,
    companyPhase: companyContext.companyPhase ?? "startup",
    progressionTier: companyContext.progressionTier ?? 1,
    currentTimeUtc: companyContext.currentTimeUtc,
    currentCashAmount: companyContext.currentCashAmount ?? 0,
    financialPressureBand: companyContext.financialPressureBand ?? "stable",
    reserveBalanceAmount: companyContext.reserveBalanceAmount,
    homeBaseAirportId: companyContext.homeBaseAirportId ?? fallbackHomeBaseAirportId,
    baseAirportIds: companyContext.baseAirportIds ?? [companyContext.homeBaseAirportId ?? fallbackHomeBaseAirportId],
    activeAircraftCount: companyContext.activeAircraftCount ?? fleetState?.aircraft.length ?? 0,
    activeStaffingPackageCount: companyContext.activeStaffingPackageCount ?? 0,
    activeContractCount: companyContext.activeContractCount ?? 0,
  };
}

function haversineDistanceNm(origin: AirportRecord, destination: AirportRecord): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusNm = 3440.065;
  const deltaLatitude = toRadians(destination.latitudeDeg - origin.latitudeDeg);
  const deltaLongitude = toRadians(destination.longitudeDeg - origin.longitudeDeg);
  const latitudeOne = toRadians(origin.latitudeDeg);
  const latitudeTwo = toRadians(destination.latitudeDeg);
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatHours(value: number): string {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(value))}h`;
}
