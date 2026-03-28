/*
 * Binds a saved route plan to an aircraft by drafting the corresponding schedule.
 * This is the UI-facing seam between commercial planning and dispatch execution.
 */

import type { FlightLineBackend, ScheduleDraftLegPayload } from "../index.js";
import { validateProposedSchedule } from "../application/dispatch/schedule-validation.js";
import { aggregateContractPayload, defaultPassengerWeightLb } from "../domain/contracts/payload.js";
import { loadRoutePlanState } from "./route-plan-state.js";

const turnaroundMinutes = 45;

export interface BindRoutePlanResult {
  success: boolean;
  message?: string | undefined;
  error?: string | undefined;
  scheduleId?: string | undefined;
  boundContractIds?: string[] | undefined;
  blockerItemIds?: string[] | undefined;
}

export async function bindRoutePlanToAircraft(
  backend: FlightLineBackend,
  saveId: string,
  aircraftId: string,
  commandId: string,
): Promise<BindRoutePlanResult> {
  const [companyContext, companyContracts, fleetState, routePlan] = await Promise.all([
    backend.loadCompanyContext(saveId),
    backend.loadCompanyContracts(saveId),
    backend.loadFleetState(saveId),
    backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId)),
  ]);

  if (!companyContext || !companyContracts || !fleetState) {
    return { success: false, error: "Could not load the save state for route-plan binding." };
  }

  const aircraft = fleetState.aircraft.find((entry) => entry.aircraftId === aircraftId);
  const aircraftModel = aircraft ? backend.getAircraftReference().findModel(aircraft.aircraftModelId) : null;

  if (!aircraft || !aircraftModel) {
    return { success: false, error: "Could not resolve the selected aircraft for route-plan binding." };
  }

  if (!routePlan || routePlan.items.length === 0) {
    return { success: false, error: "Route plan is empty." };
  }

  if (!aircraft.dispatchAvailable) {
    return { success: false, error: "Selected aircraft is not dispatch ready." };
  }

  const acceptedReadyItems = routePlan.items.filter((item) => item.plannerItemStatus === "accepted_ready");
  const blockerItems = routePlan.items.filter((item) => item.plannerItemStatus === "candidate_available" || item.plannerItemStatus === "candidate_stale");

  if (acceptedReadyItems.length === 0) {
    return { success: false, error: "No accepted-ready route plan items are available to draft." };
  }

  const contractsById = new Map(companyContracts.contracts.map((contract) => [contract.companyContractId, contract]));
  const legs: ScheduleDraftLegPayload[] = [];
  const boundContractIds: string[] = [];
  let cursorAirportId = aircraft.currentAirportId;
  let cursorTimeUtc = companyContext.currentTimeUtc;

  for (let itemIndex = 0; itemIndex < acceptedReadyItems.length; itemIndex += 1) {
    const item = acceptedReadyItems[itemIndex];
    if (!item) {
      continue;
    }
    const contract = contractsById.get(item.sourceId);
    if (!contract) {
      return { success: false, error: `Planned contract ${item.sourceId} is no longer available.` };
    }

    if (cursorAirportId !== contract.originAirportId) {
      const repositionArrival = addMinutesIso(
        cursorTimeUtc,
        estimateFlightMinutes(
          backend,
          cursorAirportId,
          contract.originAirportId,
          aircraftModel.cruiseSpeedKtas,
        ),
      );
      legs.push({
        legType: "reposition",
        originAirportId: cursorAirportId,
        destinationAirportId: contract.originAirportId,
        plannedDepartureUtc: cursorTimeUtc,
        plannedArrivalUtc: repositionArrival,
      });
      cursorAirportId = contract.originAirportId;
      cursorTimeUtc = addMinutesIso(repositionArrival, turnaroundMinutes);
    }

    const groupedContracts = [contract];
    let groupedItemIndex = itemIndex + 1;
    const routeFlightMinutes = estimateFlightMinutes(
      backend,
      contract.originAirportId,
      contract.destinationAirportId,
      aircraftModel.cruiseSpeedKtas,
    );
    while (groupedItemIndex < acceptedReadyItems.length) {
      const nextItem = acceptedReadyItems[groupedItemIndex];
      if (!nextItem) {
        break;
      }
      const nextContract = contractsById.get(nextItem.sourceId);
      if (!nextContract) {
        return { success: false, error: `Planned contract ${nextItem.sourceId} is no longer available.` };
      }
      if (nextContract.originAirportId !== contract.originAirportId || nextContract.destinationAirportId !== contract.destinationAirportId) {
        break;
      }

      const candidateGroup = [...groupedContracts, nextContract];
      if (!canAircraftCarryGroupedContracts(aircraft, aircraftModel, candidateGroup)) {
        break;
      }

      const candidateDepartureUtc = resolveGroupedDepartureUtc(cursorTimeUtc, candidateGroup);
      const candidateArrivalUtc = addMinutesIso(candidateDepartureUtc, routeFlightMinutes);
      if (candidateGroup.some((candidate) => candidateArrivalUtc > candidate.deadlineUtc)) {
        break;
      }

      groupedContracts.push(nextContract);
      groupedItemIndex += 1;
    }

    const earliestStartUtc = resolveGroupedDepartureUtc(cursorTimeUtc, groupedContracts);
    const contractArrivalUtc = addMinutesIso(
      earliestStartUtc,
      estimateFlightMinutes(
        backend,
        contract.originAirportId,
        contract.destinationAirportId,
        aircraftModel.cruiseSpeedKtas,
      ),
    );

    if (groupedContracts.some((groupedContract) => contractArrivalUtc > groupedContract.deadlineUtc)) {
      return { success: false, error: `Route plan would miss the deadline for ${contract.originAirportId} -> ${contract.destinationAirportId}.` };
    }

    legs.push({
      legType: "contract_flight",
      linkedCompanyContractIds: groupedContracts.map((entry) => entry.companyContractId),
      ...(groupedContracts[0] ? { linkedCompanyContractId: groupedContracts[0].companyContractId } : {}),
      originAirportId: contract.originAirportId,
      destinationAirportId: contract.destinationAirportId,
      plannedDepartureUtc: earliestStartUtc,
      plannedArrivalUtc: contractArrivalUtc,
    });
    boundContractIds.push(...groupedContracts.map((entry) => entry.companyContractId));
    cursorAirportId = contract.destinationAirportId;
    cursorTimeUtc = addMinutesIso(contractArrivalUtc, turnaroundMinutes);
    itemIndex = groupedItemIndex - 1;
  }

  const preview = await backend.withExistingSaveDatabase(saveId, (context) => validateProposedSchedule({
    aircraftId,
    scheduleKind: "operational",
    legs,
  }, {
    saveDatabase: context.saveDatabase,
    airportReference: backend.getAirportReference(),
    aircraftReference: backend.getAircraftReference(),
    companyId: companyContext.companyId,
    currentTimeUtc: companyContext.currentTimeUtc,
  }));
  if (!preview) {
    return { success: false, error: "Could not validate the route plan schedule." };
  }
  const previewBlocker = preview.snapshot.validationMessages.find((message) => message.severity === "blocker")?.summary;
  if (previewBlocker) {
    return { success: false, error: previewBlocker };
  }

  const draftResult = await backend.dispatch({
    commandId,
    saveId,
    commandName: "SaveScheduleDraft",
    issuedAtUtc: new Date().toISOString(),
    actorType: "player",
    payload: {
      aircraftId,
      scheduleKind: "operational",
      legs,
    },
  });

  if (!draftResult.success || draftResult.hardBlockers.length > 0 || typeof draftResult.metadata?.scheduleId !== "string") {
    return {
      success: false,
      error: draftResult.hardBlockers[0] ?? "Could not draft the route plan schedule.",
    };
  }

  const blockerSuffix = blockerItems.length > 0
    ? ` ${blockerItems.length} planned item${blockerItems.length === 1 ? " remains" : "s remain"} unscheduled until accepted.`
    : "";

  return {
    success: true,
    message: `Drafted route plan schedule ${String(draftResult.metadata?.scheduleId)} with ${boundContractIds.length} contract leg${boundContractIds.length === 1 ? "" : "s"}.${blockerSuffix}`,
    scheduleId: String(draftResult.metadata?.scheduleId),
    boundContractIds,
    blockerItemIds: blockerItems.map((item) => item.routePlanItemId),
  };
}

function resolveGroupedDepartureUtc(
  cursorTimeUtc: string,
  contracts: ReadonlyArray<{ earliestStartUtc?: string | undefined }>,
): string {
  return contracts.reduce((latestStartUtc, contract) => (
    contract.earliestStartUtc && contract.earliestStartUtc > latestStartUtc
      ? contract.earliestStartUtc
      : latestStartUtc
  ), cursorTimeUtc);
}

function canAircraftCarryGroupedContracts(
  aircraft: {
    activeCabinSeats?: number | undefined;
    activeCabinCargoCapacityLb?: number | undefined;
    maxPassengers: number;
    maxCargoLb: number;
  },
  aircraftModel: { maxPayloadLb: number },
  contracts: ReadonlyArray<{
    volumeType: "passenger" | "cargo";
    passengerCount?: number | undefined;
    cargoWeightLb?: number | undefined;
  }>,
): boolean {
  const payloadTotals = aggregateContractPayload(contracts, defaultPassengerWeightLb);
  const seatCapacity = Math.min(aircraft.activeCabinSeats ?? aircraft.maxPassengers, aircraft.maxPassengers);
  const cargoCapacity = Math.min(aircraft.activeCabinCargoCapacityLb ?? aircraft.maxCargoLb, aircraft.maxCargoLb);

  return payloadTotals.passengerCount <= seatCapacity
    && payloadTotals.cargoWeightLb <= cargoCapacity
    && payloadTotals.totalPayloadWeightLb <= aircraftModel.maxPayloadLb;
}

function addMinutesIso(utcIsoString: string, minutes: number): string {
  return new Date(new Date(utcIsoString).getTime() + minutes * 60_000).toISOString();
}

function estimateFlightMinutes(
  backend: FlightLineBackend,
  originAirportId: string,
  destinationAirportId: string,
  cruiseSpeedKtas: number,
): number {
  const origin = backend.getAirportReference().findAirport(originAirportId);
  const destination = backend.getAirportReference().findAirport(destinationAirportId);

  if (!origin || !destination) {
    throw new Error(`Could not resolve route ${originAirportId} to ${destinationAirportId}.`);
  }

  const distanceNm = haversineDistanceNm(
    origin.latitudeDeg,
    origin.longitudeDeg,
    destination.latitudeDeg,
    destination.longitudeDeg,
  );

  return Math.ceil((distanceNm / Math.max(cruiseSpeedKtas, 100)) * 60 + 30);
}

function haversineDistanceNm(
  originLatitudeDeg: number,
  originLongitudeDeg: number,
  destinationLatitudeDeg: number,
  destinationLongitudeDeg: number,
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusNm = 3440.065;
  const deltaLatitude = toRadians(destinationLatitudeDeg - originLatitudeDeg);
  const deltaLongitude = toRadians(destinationLongitudeDeg - originLongitudeDeg);
  const latitudeOne = toRadians(originLatitudeDeg);
  const latitudeTwo = toRadians(destinationLatitudeDeg);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}
