/*
 * Builds the server-side contracts payload by combining company work, market offers, route planning, and airport metadata.
 * The contracts client consumes this model as its single snapshot of commercial state.
 * This is where offer rows stop being raw contracts data and become player-facing board entries with fit buckets,
 * route labels, planner overlays, and the extra fields needed for fast client-side filtering and sorting.
 */

import type { JsonObject } from "../domain/common/primitives.js";
import { aggregateContractPayload, defaultPassengerWeightLb } from "../domain/contracts/payload.js";
import type { FlightLineBackend } from "../application/backend-service.js";
import { loadCompanyContracts, type CompanyContractsView } from "../application/queries/company-contracts.js";
import type { CompanyContext } from "../application/queries/company-state.js";
import type { ContractBoardView } from "../application/queries/contract-board.js";
import { loadFleetState, type FleetAircraftView, type FleetStateView } from "../application/queries/fleet-state.js";
import { loadStaffingState, type StaffingStateView } from "../application/queries/staffing-state.js";
import { pilotCertificationsSatisfyQualificationGroup } from "../domain/staffing/pilot-certifications.js";
import type { AircraftReferenceRepository } from "../infrastructure/reference/aircraft-reference.js";
import type { AirportReferenceRepository, AirportRecord } from "../infrastructure/reference/airport-reference.js";
import { ensureActiveContractBoard } from "./contracts-board-lifecycle.js";
import { planDispatchContractWork } from "./dispatch-contract-planning.js";
import {
  loadRoutePlanState,
  buildVisibleRoutePlanState,
  type RoutePlanItemState,
  type RoutePlanState,
} from "./route-plan-state.js";
import type {
  ContractsContractPrimaryActionKind,
  ContractsContractUrgencyBand,
  ContractsContractWorkState,
  ContractsViewAircraftCue,
  ContractsRoutePlanItem,
  ContractsRoutePlanItemStatus,
  ContractsViewAcceptedContract,
  ContractsViewAirport,
  ContractsViewCompanyContract,
  ContractsViewOffer,
  ContractsViewPayload,
} from "./contracts-view-model.js";

const fitBuckets = new Set(["flyable_now", "flyable_with_reposition", "stretch_growth", "blocked_now"]);
const activeCompanyContractStates = new Set(["accepted", "assigned", "active"]);

function readFitBucket(explanationMetadata: JsonObject): ContractsViewOffer["fitBucket"] {
  const fitBucket = explanationMetadata.fit_bucket;

  if (typeof fitBucket === "string" && fitBuckets.has(fitBucket)) {
    return fitBucket as ContractsViewOffer["fitBucket"];
  }

  return undefined;
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

function hasCoverageUnits(
  staffingState: StaffingStateView | null,
  laborCategory: string,
  qualificationGroup: string,
  unitsRequired: number,
): boolean {
  if (unitsRequired <= 0) {
    return true;
  }

  if (laborCategory === "pilot") {
    const activePilotCoverageUnits = (staffingState?.coverageSummaries ?? [])
      .filter((entry) => entry.laborCategory === "pilot")
      .reduce((sum, entry) => sum + entry.activeCoverageUnits, 0);
    const qualifiedActivePilots = (staffingState?.namedPilots ?? []).filter((pilot) =>
      pilot.packageStatus === "active"
      && pilotCertificationsSatisfyQualificationGroup(pilot.certifications, qualificationGroup)
    ).length;

    return activePilotCoverageUnits >= unitsRequired && qualifiedActivePilots >= unitsRequired;
  }

  const summary = staffingState?.coverageSummaries.find((entry) =>
    entry.laborCategory === laborCategory
      && entry.qualificationGroup === qualificationGroup);

  return (summary?.activeCoverageUnits ?? 0) >= unitsRequired;
}

function hasReadyPilotCoverage(
  staffingState: StaffingStateView | null,
  qualificationGroup: string,
  unitsRequired: number,
): boolean {
  if (unitsRequired <= 0) {
    return true;
  }

  const readyQualifiedPilots = (staffingState?.namedPilots ?? []).filter((pilot) =>
    pilot.packageStatus === "active"
    && pilot.availabilityState === "ready"
    && pilotCertificationsSatisfyQualificationGroup(pilot.certifications, qualificationGroup)
  ).length;

  return readyQualifiedPilots >= unitsRequired;
}

function canAircraftStructurallyOperateOffer(
  aircraft: FleetAircraftView,
  aircraftReference: AircraftReferenceRepository,
  offer: ContractBoardView["offers"][number],
  originAirport: AirportRecord,
  destinationAirport: AirportRecord,
  distanceNm: number,
): boolean {
  const originAirportSize = originAirport.airportSize ?? 0;
  const destinationAirportSize = destinationAirport.airportSize ?? 0;
  const originRunwayFt = originAirport.longestHardRunwayFt ?? 0;
  const destinationRunwayFt = destinationAirport.longestHardRunwayFt ?? 0;

  if (!["available", "delivered"].includes(aircraft.deliveryState)) {
    return false;
  }

  if (originAirportSize > 0 && originAirportSize < aircraft.minimumAirportSize) {
    return false;
  }

  if (destinationAirportSize > 0 && destinationAirportSize < aircraft.minimumAirportSize) {
    return false;
  }

  if (originRunwayFt > 0 && originRunwayFt < aircraft.minimumRunwayFt) {
    return false;
  }

  if (destinationRunwayFt > 0 && destinationRunwayFt < aircraft.minimumRunwayFt) {
    return false;
  }

  if (distanceNm > aircraft.rangeNm * 0.9) {
    return false;
  }

  const aircraftModel = aircraftReference.findModel(aircraft.aircraftModelId);
  if (!aircraftModel) {
    return false;
  }

  if (offer.volumeType === "passenger") {
    const seatCapacity = Math.min(aircraft.activeCabinSeats ?? aircraft.maxPassengers, aircraft.maxPassengers);
    const payloadTotals = aggregateContractPayload([{
      volumeType: offer.volumeType,
      passengerCount: offer.passengerCount ?? null,
      cargoWeightLb: offer.cargoWeightLb ?? null,
    }], defaultPassengerWeightLb);
    return payloadTotals.passengerCount <= seatCapacity
      && payloadTotals.totalPayloadWeightLb <= aircraftModel.maxPayloadLb;
  }

  const cargoCapacity = Math.min(aircraft.activeCabinCargoCapacityLb ?? aircraft.maxCargoLb, aircraft.maxCargoLb);
  return (offer.cargoWeightLb ?? 0) <= cargoCapacity && (offer.cargoWeightLb ?? 0) <= aircraftModel.maxPayloadLb;
}

function hasNominalCrewCoverage(
  aircraft: FleetAircraftView,
  offer: ContractBoardView["offers"][number],
  staffingState: StaffingStateView | null,
): boolean {
  if (!hasCoverageUnits(staffingState, "pilot", aircraft.pilotQualificationGroup, aircraft.pilotsRequired)) {
    return false;
  }

  if (
    offer.volumeType === "passenger"
    && aircraft.flightAttendantsRequired > 0
    && !hasCoverageUnits(staffingState, "flight_attendant", "cabin_general", aircraft.flightAttendantsRequired)
  ) {
    return false;
  }

  return true;
}

function hasCurrentCrewReadiness(
  aircraft: FleetAircraftView,
  offer: ContractBoardView["offers"][number],
  staffingState: StaffingStateView | null,
): boolean {
  if (!hasReadyPilotCoverage(staffingState, aircraft.pilotQualificationGroup, aircraft.pilotsRequired)) {
    return false;
  }

  if (
    offer.volumeType === "passenger"
    && aircraft.flightAttendantsRequired > 0
    && !hasCoverageUnits(staffingState, "flight_attendant", "cabin_general", aircraft.flightAttendantsRequired)
  ) {
    return false;
  }

  return true;
}

interface RouteCapacityRequirements {
  volumeType: "passenger" | "cargo";
  passengerCount: number | undefined;
  cargoWeightLb: number | undefined;
}

interface RouteScheduleRequirements {
  originAirportId: string;
  destinationAirportId: string;
  earliestStartUtc: string | undefined;
  deadlineUtc: string;
}

function canAircraftOperateRoute(
  aircraft: FleetAircraftView,
  aircraftReference: AircraftReferenceRepository,
  routeRequirements: RouteCapacityRequirements & RouteScheduleRequirements,
  originAirport: AirportRecord,
  destinationAirport: AirportRecord,
  distanceNm: number,
): boolean {
  const originAirportSize = originAirport.airportSize ?? 0;
  const destinationAirportSize = destinationAirport.airportSize ?? 0;
  const originRunwayFt = originAirport.longestHardRunwayFt ?? 0;
  const destinationRunwayFt = destinationAirport.longestHardRunwayFt ?? 0;

  if (!["available", "delivered"].includes(aircraft.deliveryState)) {
    return false;
  }

  if (originAirportSize > 0 && originAirportSize < aircraft.minimumAirportSize) {
    return false;
  }

  if (destinationAirportSize > 0 && destinationAirportSize < aircraft.minimumAirportSize) {
    return false;
  }

  if (originRunwayFt > 0 && originRunwayFt < aircraft.minimumRunwayFt) {
    return false;
  }

  if (destinationRunwayFt > 0 && destinationRunwayFt < aircraft.minimumRunwayFt) {
    return false;
  }

  if (distanceNm > aircraft.rangeNm * 0.9) {
    return false;
  }

  const aircraftModel = aircraftReference.findModel(aircraft.aircraftModelId);
  if (!aircraftModel) {
    return false;
  }

  if (routeRequirements.volumeType === "passenger") {
    const seatCapacity = Math.min(aircraft.activeCabinSeats ?? aircraft.maxPassengers, aircraft.maxPassengers);
    return (routeRequirements.passengerCount ?? 0) <= seatCapacity;
  }

  const cargoCapacity = Math.min(aircraft.activeCabinCargoCapacityLb ?? aircraft.maxCargoLb, aircraft.maxCargoLb);
  return (routeRequirements.cargoWeightLb ?? 0) <= cargoCapacity && (routeRequirements.cargoWeightLb ?? 0) <= aircraftModel.maxPayloadLb;
}

function canAircraftCoverRoute(
  aircraft: FleetAircraftView,
  aircraftReference: AircraftReferenceRepository,
  routeRequirements: RouteCapacityRequirements & RouteScheduleRequirements,
  originAirport: AirportRecord,
  destinationAirport: AirportRecord,
  distanceNm: number,
  staffingState: StaffingStateView | null,
  airportReference: AirportReferenceRepository,
): boolean {
  if (!canAircraftOperateRoute(aircraft, aircraftReference, routeRequirements, originAirport, destinationAirport, distanceNm)) {
    return false;
  }

  const aircraftModel = aircraftReference.findModel(aircraft.aircraftModelId);
  if (!aircraftModel) {
    return false;
  }

  const routeOffer = {
    volumeType: routeRequirements.volumeType,
    passengerCount: routeRequirements.passengerCount,
    cargoWeightLb: routeRequirements.cargoWeightLb,
    originAirportId: routeRequirements.originAirportId,
    destinationAirportId: routeRequirements.destinationAirportId,
    earliestStartUtc: routeRequirements.earliestStartUtc ?? routeRequirements.deadlineUtc,
    latestCompletionUtc: routeRequirements.deadlineUtc,
  } satisfies Pick<ContractBoardView["offers"][number], "volumeType" | "passengerCount" | "cargoWeightLb" | "originAirportId" | "destinationAirportId" | "earliestStartUtc" | "latestCompletionUtc">;

    return hasNominalCrewCoverage(aircraft, routeOffer as ContractBoardView["offers"][number], staffingState)
      && hasCurrentCrewReadiness(aircraft, routeOffer as ContractBoardView["offers"][number], staffingState)
      && planDispatchContractWork(
      routeRequirements.earliestStartUtc ?? routeRequirements.deadlineUtc,
      aircraft.currentAirportId,
      aircraftModel,
      {
        originAirportId: routeRequirements.originAirportId,
        destinationAirportId: routeRequirements.destinationAirportId,
        earliestStartUtc: routeRequirements.earliestStartUtc ?? routeRequirements.deadlineUtc,
        deadlineUtc: routeRequirements.deadlineUtc,
      },
      airportReference,
    ).success;
}

function buildAircraftCue(
  aircraft: FleetAircraftView,
  airportMap: Map<string, AirportRecord>,
  routeRequirements: RouteCapacityRequirements & RouteScheduleRequirements,
  aircraftReference: AircraftReferenceRepository,
  staffingState: StaffingStateView | null,
  airportReference: AirportReferenceRepository,
): ContractsViewAircraftCue | null {
  const currentAirport = airportMap.get(aircraft.currentAirportId.toUpperCase()) ?? null;
  const originAirport = airportMap.get(routeRequirements.originAirportId.toUpperCase()) ?? null;
  const destinationAirport = airportMap.get(routeRequirements.destinationAirportId.toUpperCase()) ?? null;

  if (!currentAirport || !originAirport || !destinationAirport) {
    return null;
  }

  const distanceNm = haversineDistanceNm(currentAirport, originAirport);
  if (!canAircraftCoverRoute(
    aircraft,
    aircraftReference,
    routeRequirements,
    originAirport,
    destinationAirport,
    distanceNm,
    staffingState,
    airportReference,
  )) {
    return null;
  }

  return {
    aircraftId: aircraft.aircraftId,
    registration: aircraft.registration,
    modelDisplayName: aircraft.modelDisplayName,
    currentAirport: mapAirport(currentAirport, aircraft.currentAirportId),
    distanceNm,
    dispatchAvailable: aircraft.dispatchAvailable,
  };
}

function buildBestAircraftCue(
  airportMap: Map<string, AirportRecord>,
  routeRequirements: RouteCapacityRequirements & RouteScheduleRequirements,
  fleetState: FleetStateView | null,
  staffingState: StaffingStateView | null,
  aircraftReference: AircraftReferenceRepository,
  airportReference: AirportReferenceRepository,
): ContractsViewAircraftCue | null {
  const cues = (fleetState?.aircraft ?? [])
    .map((aircraft) => buildAircraftCue(
      aircraft,
      airportMap,
      routeRequirements,
      aircraftReference,
      staffingState,
      airportReference,
    ))
    .filter((cue): cue is ContractsViewAircraftCue => Boolean(cue));

  cues.sort((left, right) => left.distanceNm - right.distanceNm || left.registration.localeCompare(right.registration));
  return cues[0] ?? null;
}

function buildUrgencyBand(hoursRemaining: number): ContractsContractUrgencyBand {
  if (hoursRemaining <= 0) {
    return "overdue";
  }

  if (hoursRemaining <= 24) {
    return "at_risk";
  }

  return "stable";
}

function buildContractWorkState(
  routePlanItemId: string | undefined,
  routePlanItemStatus: ContractsRoutePlanItemStatus | undefined,
  assignedAircraftId: string | undefined,
  assignedAircraftReady: boolean,
): ContractsContractWorkState {
  if (routePlanItemId) {
    return routePlanItemStatus === "accepted_ready" || routePlanItemStatus === "scheduled"
      ? "ready_for_dispatch"
      : "in_route_plan";
  }

  if (assignedAircraftId) {
    return assignedAircraftReady ? "ready_for_dispatch" : "assigned_elsewhere";
  }

  return "assigned_elsewhere";
}

function buildContractPrimaryActionKind(
  routePlanItemId: string | undefined,
  workState: ContractsContractWorkState,
): ContractsContractPrimaryActionKind {
  if (routePlanItemId && workState === "ready_for_dispatch") {
    return "open_route_plan";
  }

  if (routePlanItemId) {
    return "open_route_plan";
  }

  if (workState === "ready_for_dispatch") {
    return "open_dispatch";
  }

  return "send_to_route_plan";
}

function buildContractPrimaryActionLabel(
  routePlanItemId: string | undefined,
  workState: ContractsContractWorkState,
): string {
  if (routePlanItemId) {
    return workState === "ready_for_dispatch" ? "Open dispatch" : "Open route plan";
  }

  return workState === "ready_for_dispatch" ? "Open dispatch" : "Send to route plan";
}

function deriveOfferFitBucket(
  currentTimeUtc: string,
  offer: ContractBoardView["offers"][number],
  airportMap: Map<string, AirportRecord>,
  fleetState: FleetStateView | null,
  staffingState: StaffingStateView | null,
  aircraftReference: AircraftReferenceRepository,
): ContractsViewOffer["fitBucket"] {
  const fallbackFitBucket = readFitBucket(offer.explanationMetadata);
  const originAirport = airportMap.get(offer.originAirportId.toUpperCase()) ?? null;
  const destinationAirport = airportMap.get(offer.destinationAirportId.toUpperCase()) ?? null;
  const fleetAircraft = fleetState?.aircraft ?? [];

  if (!originAirport || !destinationAirport || fleetAircraft.length === 0) {
    return fallbackFitBucket;
  }

  const distanceNm = haversineDistanceNm(originAirport, destinationAirport);
  const structurallyCompatibleAircraft = fleetAircraft.filter((aircraft) =>
    canAircraftStructurallyOperateOffer(aircraft, aircraftReference, offer, originAirport, destinationAirport, distanceNm));
  const crewCompatibleAircraft = structurallyCompatibleAircraft.filter((aircraft) =>
    hasNominalCrewCoverage(aircraft, offer, staffingState));
  const currentlyOperableAircraft = crewCompatibleAircraft.filter((aircraft) =>
    aircraft.dispatchAvailable
    && hasCurrentCrewReadiness(aircraft, offer, staffingState)
    && (() => {
      const aircraftModel = aircraftReference.findModel(aircraft.aircraftModelId);
      if (!aircraftModel) {
        return false;
      }

      return planDispatchContractWork(
        currentTimeUtc,
        aircraft.currentAirportId,
        aircraftModel,
        {
          originAirportId: offer.originAirportId,
          destinationAirportId: offer.destinationAirportId,
          earliestStartUtc: offer.earliestStartUtc,
          deadlineUtc: offer.latestCompletionUtc,
        },
        {
          findAirport: (airportId: string) => airportMap.get(airportId.toUpperCase()) ?? null,
        } as AirportReferenceRepository,
      ).success;
    })());

  if (currentlyOperableAircraft.some((aircraft) => aircraft.currentAirportId === offer.originAirportId)) {
    return "flyable_now";
  }

  if (currentlyOperableAircraft.length > 0) {
    return "flyable_with_reposition";
  }

  if (crewCompatibleAircraft.length > 0) {
    return "blocked_now";
  }

  return fallbackFitBucket === "blocked_now" ? "blocked_now" : "stretch_growth";
}

function mapAirport(airport: AirportRecord | null, fallbackAirportId: string): ContractsViewAirport {
  if (!airport) {
    return {
      airportId: fallbackAirportId,
      code: fallbackAirportId,
      name: fallbackAirportId,
      municipality: undefined,
      countryCode: undefined,
      timezone: undefined,
      latitudeDeg: 0,
      longitudeDeg: 0,
    };
  }

  return {
    airportId: airport.airportKey,
    code: airport.identCode || airport.airportKey,
    name: airport.name,
    municipality: airport.municipality,
    countryCode: airport.isoCountry,
    timezone: airport.timezone,
    latitudeDeg: airport.latitudeDeg,
    longitudeDeg: airport.longitudeDeg,
  };
}

function resolveAirportMap(
  airportReference: AirportReferenceRepository,
  board: ContractBoardView,
  companyContracts: CompanyContractsView | null,
  routePlan: RoutePlanState | null,
): Map<string, AirportRecord> {
  const airportIds = new Set<string>();

  for (const offer of board.offers) {
    airportIds.add(offer.originAirportId);
    airportIds.add(offer.destinationAirportId);
  }

  for (const contract of companyContracts?.contracts ?? []) {
    airportIds.add(contract.originAirportId);
    airportIds.add(contract.destinationAirportId);
  }

  for (const item of routePlan?.items ?? []) {
    airportIds.add(item.originAirportId);
    airportIds.add(item.destinationAirportId);
  }

  return airportReference.findAirportsByAirportKeys([...airportIds]);
}

function buildRoutePlanIndexes(routePlan: RoutePlanState | null): {
  plannedOfferIds: Map<string, RoutePlanItemState>;
  plannedCompanyContractIds: Map<string, RoutePlanItemState>;
} {
  const plannedOfferIds = new Map<string, RoutePlanItemState>();
  const plannedCompanyContractIds = new Map<string, RoutePlanItemState>();

  for (const item of routePlan?.items ?? []) {
    if (item.sourceType === "candidate_offer") {
      plannedOfferIds.set(item.sourceId, item);
    } else {
      plannedCompanyContractIds.set(item.sourceId, item);
    }
  }

  return { plannedOfferIds, plannedCompanyContractIds };
}

function buildOfferView(
  currentTimeUtc: string,
  board: ContractBoardView,
  airportMap: Map<string, AirportRecord>,
  routePlan: RoutePlanState | null,
  fleetState: FleetStateView | null,
  staffingState: StaffingStateView | null,
  aircraftReference: AircraftReferenceRepository,
  airportReference: AirportReferenceRepository,
): ContractsViewOffer[] {
  const { plannedOfferIds } = buildRoutePlanIndexes(routePlan);

  return board.offers.map((offer) => {
    const plannedItem = plannedOfferIds.get(offer.contractOfferId);
    const routeRequirements = {
      volumeType: offer.volumeType,
      passengerCount: offer.passengerCount,
      cargoWeightLb: offer.cargoWeightLb,
      originAirportId: offer.originAirportId,
      destinationAirportId: offer.destinationAirportId,
      earliestStartUtc: offer.earliestStartUtc,
      deadlineUtc: offer.latestCompletionUtc,
    } satisfies RouteCapacityRequirements & RouteScheduleRequirements;
    const nearestRelevantAircraft = buildBestAircraftCue(
      airportMap,
      routeRequirements,
      fleetState,
      staffingState,
      aircraftReference,
      airportReference,
    );

    return {
      contractOfferId: offer.contractOfferId,
      archetype: offer.archetype,
      volumeType: offer.volumeType,
      passengerCount: offer.passengerCount,
      cargoWeightLb: offer.cargoWeightLb,
      payoutAmount: offer.payoutAmount,
      earliestStartUtc: offer.earliestStartUtc,
      latestCompletionUtc: offer.latestCompletionUtc,
      offerStatus: offer.offerStatus,
      likelyRole: offer.likelyRole,
      difficultyBand: offer.difficultyBand,
      fitBucket: deriveOfferFitBucket(currentTimeUtc, offer, airportMap, fleetState, staffingState, aircraftReference),
      timeRemainingHours: Math.max(
        0,
        (new Date(offer.latestCompletionUtc).getTime() - new Date(currentTimeUtc).getTime()) / 3_600_000,
      ),
      origin: mapAirport(airportMap.get(offer.originAirportId.toUpperCase()) ?? null, offer.originAirportId),
      destination: mapAirport(airportMap.get(offer.destinationAirportId.toUpperCase()) ?? null, offer.destinationAirportId),
      routePlanItemId: plannedItem?.routePlanItemId,
      routePlanItemStatus: plannedItem?.plannerItemStatus,
      matchesPlannerEndpoint: Boolean(routePlan?.endpointAirportId) && offer.originAirportId === routePlan?.endpointAirportId,
      directDispatchEligible: Boolean(nearestRelevantAircraft),
      directDispatchReason: nearestRelevantAircraft
        ? `Nearest dispatch-ready aircraft: ${nearestRelevantAircraft.registration} at ${nearestRelevantAircraft.currentAirport.code}.`
        : "No dispatch-ready aircraft can plausibly cover this route right now.",
      nearestRelevantAircraft,
    } satisfies ContractsViewOffer;
  });
}

function buildCompanyContractsView(
  companyContracts: CompanyContractsView | null,
  airportMap: Map<string, AirportRecord>,
  routePlan: RoutePlanState | null,
  fleetState: FleetStateView | null,
  staffingState: StaffingStateView | null,
  aircraftReference: AircraftReferenceRepository,
  airportReference: AirportReferenceRepository,
  currentTimeUtc: string,
): ContractsViewCompanyContract[] {
  const { plannedCompanyContractIds } = buildRoutePlanIndexes(routePlan);
  const assignedAircraftById = new Map((fleetState?.aircraft ?? []).map((aircraft) => [aircraft.aircraftId, aircraft]));

  return (companyContracts?.contracts ?? [])
    .map((contract) => {
      const plannedItem = plannedCompanyContractIds.get(contract.companyContractId);
      const assignedAircraft = contract.assignedAircraftId ? assignedAircraftById.get(contract.assignedAircraftId) ?? null : null;
      const routeRequirements = {
        volumeType: contract.volumeType,
        passengerCount: contract.passengerCount,
        cargoWeightLb: contract.cargoWeightLb,
        originAirportId: contract.originAirportId,
        destinationAirportId: contract.destinationAirportId,
        earliestStartUtc: contract.earliestStartUtc,
        deadlineUtc: contract.deadlineUtc,
      } satisfies RouteCapacityRequirements & RouteScheduleRequirements;
      const hoursRemaining = Math.max(0, (new Date(contract.deadlineUtc).getTime() - new Date(currentTimeUtc).getTime()) / 3_600_000);
      const nearestRelevantAircraft = buildBestAircraftCue(
        airportMap,
        routeRequirements,
        fleetState,
        staffingState,
        aircraftReference,
        airportReference,
      );
      const assignedAircraftReady = Boolean(
        plannedItem?.plannerItemStatus === "accepted_ready"
        || plannedItem?.plannerItemStatus === "scheduled"
        || assignedAircraft?.dispatchAvailable,
      );
      const workState = buildContractWorkState(
        plannedItem?.routePlanItemId,
        plannedItem?.plannerItemStatus,
        contract.assignedAircraftId,
        assignedAircraftReady,
      );

      return {
        companyContractId: contract.companyContractId,
        originContractOfferId: contract.originContractOfferId,
        contractState: contract.contractState,
        archetype: contract.archetype,
        volumeType: contract.volumeType,
        passengerCount: contract.passengerCount,
        cargoWeightLb: contract.cargoWeightLb,
        payoutAmount: contract.acceptedPayoutAmount,
        cancellationPenaltyAmount: contract.cancellationPenaltyAmount,
        earliestStartUtc: contract.earliestStartUtc,
        deadlineUtc: contract.deadlineUtc,
        assignedAircraftId: contract.assignedAircraftId,
        origin: mapAirport(airportMap.get(contract.originAirportId.toUpperCase()) ?? null, contract.originAirportId),
        destination: mapAirport(airportMap.get(contract.destinationAirportId.toUpperCase()) ?? null, contract.destinationAirportId),
        routePlanItemId: plannedItem?.routePlanItemId,
        routePlanItemStatus: plannedItem?.plannerItemStatus,
        hoursRemaining,
        urgencyBand: buildUrgencyBand(hoursRemaining),
        workState,
        primaryActionKind: buildContractPrimaryActionKind(plannedItem?.routePlanItemId, workState),
        primaryActionLabel: buildContractPrimaryActionLabel(plannedItem?.routePlanItemId, workState),
        nearestRelevantAircraft,
        assignedAircraftReady,
      } satisfies ContractsViewCompanyContract;
    });
}

function buildRoutePlanView(
  routePlan: RoutePlanState | null,
  airportMap: Map<string, AirportRecord>,
): ContractsViewPayload["routePlan"] {
  const visibleRoutePlan = buildVisibleRoutePlanState(routePlan);

  if (!visibleRoutePlan) {
    return null;
  }

  return {
    routePlanId: visibleRoutePlan.routePlanId,
    endpointAirportId: visibleRoutePlan.endpointAirportId,
    items: visibleRoutePlan.items.map((item) => ({
      routePlanItemId: item.routePlanItemId,
      sequenceNumber: item.sequenceNumber,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      plannerItemStatus: item.plannerItemStatus,
      volumeType: item.volumeType,
      passengerCount: item.passengerCount,
      cargoWeightLb: item.cargoWeightLb,
      payoutAmount: item.payoutAmount,
      earliestStartUtc: item.earliestStartUtc,
      deadlineUtc: item.deadlineUtc,
      linkedAircraftId: item.linkedAircraftId,
      linkedScheduleId: item.linkedScheduleId,
      origin: mapAirport(airportMap.get(item.originAirportId.toUpperCase()) ?? null, item.originAirportId),
      destination: mapAirport(airportMap.get(item.destinationAirportId.toUpperCase()) ?? null, item.destinationAirportId),
    } satisfies ContractsRoutePlanItem)),
  };
}

// Turns raw contract, fleet, staffing, and route-plan state into the player-facing contracts workspace payload.
export function buildContractsViewPayload(
  saveId: string,
  companyContext: CompanyContext,
  board: ContractBoardView,
  companyContracts: CompanyContractsView | null,
  routePlan: RoutePlanState | null,
  fleetState: FleetStateView | null,
  staffingState: StaffingStateView | null,
  aircraftReference: AircraftReferenceRepository,
  airportReference: AirportReferenceRepository,
): ContractsViewPayload {
  const visibleRoutePlan = buildVisibleRoutePlanState(routePlan);
  const airportMap = resolveAirportMap(airportReference, board, companyContracts, visibleRoutePlan);
  const offers = buildOfferView(
    companyContext.currentTimeUtc,
    board,
    airportMap,
    visibleRoutePlan,
    fleetState,
    staffingState,
    aircraftReference,
    airportReference,
  );
  const companyContractsView = buildCompanyContractsView(
    companyContracts,
    airportMap,
    visibleRoutePlan,
    fleetState,
    staffingState,
    aircraftReference,
    airportReference,
    companyContext.currentTimeUtc,
  );
  const acceptedContracts = companyContractsView.filter((contract) => activeCompanyContractStates.has(contract.contractState));

  return {
    saveId,
    companyId: companyContext.companyId,
    currentTimeUtc: companyContext.currentTimeUtc,
    homeBaseAirportId: companyContext.homeBaseAirportId,
    board: {
      offerWindowId: board.offerWindowId,
      generatedAtUtc: board.generatedAtUtc,
      expiresAtUtc: board.expiresAtUtc,
      refreshReason: board.refreshReason,
      offerCount: offers.length,
    },
    offers,
    acceptedContracts,
    companyContracts: companyContractsView,
    routePlan: buildRoutePlanView(visibleRoutePlan, airportMap),
    plannerEndpointAirportId: visibleRoutePlan?.endpointAirportId,
  };
}

// Loads and assembles the current contracts workspace in one backend round-trip, including board lifecycle reconciliation.
export async function loadContractsViewPayload(
  backend: FlightLineBackend,
  airportReference: AirportReferenceRepository,
  saveId: string,
  refreshReason: "scheduled" | "manual" | "bootstrap" = "scheduled",
): Promise<ContractsViewPayload | null> {
  const ensuredBoard = await ensureActiveContractBoard(backend, saveId, refreshReason);

  if (!ensuredBoard.companyContext || !ensuredBoard.contractBoard) {
    return null;
  }

  const supportingState = await backend.withExistingSaveDatabase(saveId, (context) => ({
    companyContracts: loadCompanyContracts(context.saveDatabase, saveId),
    fleetState: loadFleetState(context.saveDatabase, backend.getAircraftReference(), saveId),
    routePlan: loadRoutePlanState(context.saveDatabase, saveId),
    staffingState: loadStaffingState(context.saveDatabase, saveId),
  }));

  return buildContractsViewPayload(
    saveId,
    ensuredBoard.companyContext,
    ensuredBoard.contractBoard,
    supportingState?.companyContracts ?? null,
    supportingState?.routePlan ?? null,
    supportingState?.fleetState ?? null,
    supportingState?.staffingState ?? null,
    backend.getAircraftReference(),
    airportReference,
  );
}

