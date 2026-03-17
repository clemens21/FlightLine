/*
 * Declares the domain types for dispatch so commands, queries, and UI code share the same vocabulary.
 * These files are intentionally descriptive rather than behavioral: they define the shapes that move through the simulation.
 */

import type { AirportId, CompanyContractId, JsonObject, ScheduleId, UtcIsoString } from "../common/primitives.js";

export type ScheduleState = "draft" | "committed" | "blocked" | "completed" | "cancelled";
export type FlightLegState = "planned" | "in_progress" | "completed" | "cancelled" | "failed";
export type FlightLegType = "reposition" | "contract_flight" | "maintenance_ferry" | "maintenance_block";

export interface AircraftSchedule {
  scheduleId: ScheduleId;
  aircraftId: string;
  scheduleKind: "operational" | "maintenance_only";
  scheduleState: ScheduleState;
  isDraft: boolean;
  plannedStartUtc: UtcIsoString;
  plannedEndUtc: UtcIsoString;
  validationSnapshot?: JsonObject;
  createdAtUtc: UtcIsoString;
  updatedAtUtc: UtcIsoString;
}

export interface FlightLeg {
  flightLegId: string;
  scheduleId: ScheduleId;
  sequenceNumber: number;
  legType: FlightLegType;
  linkedCompanyContractId?: CompanyContractId;
  originAirportId: AirportId;
  destinationAirportId: AirportId;
  plannedDepartureUtc: UtcIsoString;
  plannedArrivalUtc: UtcIsoString;
  actualDepartureUtc?: UtcIsoString;
  actualArrivalUtc?: UtcIsoString;
  legState: FlightLegState;
  assignedQualificationGroup?: string;
  payloadSnapshot?: JsonObject;
}

export interface ValidationMessage {
  severity: "blocker" | "warning" | "info";
  code: string;
  summary: string;
  affectedLegId?: string;
  suggestedRecoveryAction?: string;
}
