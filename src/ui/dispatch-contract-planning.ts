/*
 * Shares the minimal contract auto-planning math between the contracts board and dispatch actions.
 * The goal is one timing path for "can this aircraft stage this work right now?" without broadening scope.
 */

import type { AircraftModelRecord } from "../infrastructure/reference/aircraft-reference.js";
import type { AirportReferenceRepository } from "../infrastructure/reference/airport-reference.js";

export interface DispatchContractPlanningWork {
  linkedCompanyContractId?: string;
  originAirportId: string;
  destinationAirportId: string;
  earliestStartUtc?: string;
  deadlineUtc: string;
}

export interface PlannedDispatchContractLeg {
  legType: "reposition" | "contract_flight";
  linkedCompanyContractId?: string;
  originAirportId: string;
  destinationAirportId: string;
  plannedDepartureUtc: string;
  plannedArrivalUtc: string;
}

export type PlanDispatchContractWorkResult =
  | {
      success: true;
      needsReposition: boolean;
      contractDepartureUtc: string;
      contractArrivalUtc: string;
      legs: PlannedDispatchContractLeg[];
    }
  | {
      success: false;
      reason: "route_unresolved" | "misses_deadline";
      message: string;
    };

export const dispatchContractTurnaroundMinutes = 45;

function addMinutesIso(utcIsoString: string, minutes: number): string {
  return new Date(new Date(utcIsoString).getTime() + minutes * 60_000).toISOString();
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
    Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

function estimateFlightMinutes(
  airportReference: AirportReferenceRepository,
  originAirportId: string,
  destinationAirportId: string,
  cruiseSpeedKtas: number,
): number | null {
  const origin = airportReference.findAirport(originAirportId);
  const destination = airportReference.findAirport(destinationAirportId);

  if (!origin || !destination) {
    return null;
  }

  return Math.ceil(
    (haversineDistanceNm(
      origin.latitudeDeg,
      origin.longitudeDeg,
      destination.latitudeDeg,
      destination.longitudeDeg,
    ) / Math.max(cruiseSpeedKtas, 100)) * 60 + 30,
  );
}

export function planDispatchContractWork(
  currentTimeUtc: string,
  aircraftCurrentAirportId: string,
  aircraftModel: AircraftModelRecord,
  work: DispatchContractPlanningWork,
  airportReference: AirportReferenceRepository,
): PlanDispatchContractWorkResult {
  const legs: PlannedDispatchContractLeg[] = [];
  let cursorTimeUtc = currentTimeUtc;
  let needsReposition = false;

  if (aircraftCurrentAirportId !== work.originAirportId) {
    const repositionMinutes = estimateFlightMinutes(
      airportReference,
      aircraftCurrentAirportId,
      work.originAirportId,
      aircraftModel.cruiseSpeedKtas,
    );

    if (repositionMinutes === null) {
      return {
        success: false,
        reason: "route_unresolved",
        message: `Could not resolve route ${aircraftCurrentAirportId} to ${work.originAirportId}.`,
      };
    }

    const repositionArrivalUtc = addMinutesIso(cursorTimeUtc, repositionMinutes);
    legs.push({
      legType: "reposition",
      originAirportId: aircraftCurrentAirportId,
      destinationAirportId: work.originAirportId,
      plannedDepartureUtc: cursorTimeUtc,
      plannedArrivalUtc: repositionArrivalUtc,
    });
    cursorTimeUtc = addMinutesIso(repositionArrivalUtc, dispatchContractTurnaroundMinutes);
    needsReposition = true;
  }

  const contractDepartureUtc = work.earliestStartUtc && work.earliestStartUtc > cursorTimeUtc
    ? work.earliestStartUtc
    : cursorTimeUtc;
  const contractFlightMinutes = estimateFlightMinutes(
    airportReference,
    work.originAirportId,
    work.destinationAirportId,
    aircraftModel.cruiseSpeedKtas,
  );

  if (contractFlightMinutes === null) {
    return {
      success: false,
      reason: "route_unresolved",
      message: `Could not resolve route ${work.originAirportId} to ${work.destinationAirportId}.`,
    };
  }

  const contractArrivalUtc = addMinutesIso(contractDepartureUtc, contractFlightMinutes);
  if (contractArrivalUtc > work.deadlineUtc) {
    return {
      success: false,
      reason: "misses_deadline",
      message: "Auto-plan would miss the contract deadline for this aircraft.",
    };
  }

  legs.push({
    legType: "contract_flight",
    ...(work.linkedCompanyContractId ? { linkedCompanyContractId: work.linkedCompanyContractId } : {}),
    originAirportId: work.originAirportId,
    destinationAirportId: work.destinationAirportId,
    plannedDepartureUtc: contractDepartureUtc,
    plannedArrivalUtc: contractArrivalUtc,
  });

  return {
    success: true,
    needsReposition,
    contractDepartureUtc,
    contractArrivalUtc,
    legs,
  };
}
