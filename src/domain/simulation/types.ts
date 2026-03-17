/*
 * Declares the domain types for simulation so commands, queries, and UI code share the same vocabulary.
 * These files are intentionally descriptive rather than behavioral: they define the shapes that move through the simulation.
 */

import type { JsonObject, UtcIsoString } from "../common/primitives.js";

export type AdvanceTimeStopCondition =
  | "critical_alert"
  | "leg_completed"
  | "selected_aircraft_available"
  | "contract_resolved"
  | "target_time";

export interface AdvanceTimeRequest {
  targetTimeUtc: UtcIsoString;
  stopConditions: AdvanceTimeStopCondition[];
  selectedAircraftId?: string;
  selectedContractId?: string;
}

export interface AdvanceTimeResult {
  advancedToUtc: UtcIsoString;
  stoppedBecause: AdvanceTimeStopCondition | "completed";
  processedEventCount: number;
  summary: JsonObject;
}
