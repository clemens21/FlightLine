import type { AircraftId, CurrencyAmount, UtcIsoString } from "../common/primitives.js";

export interface MaintenanceProgramState {
  aircraftId: AircraftId;
  conditionBandInput: string;
  hoursSinceInspection: number;
  cyclesSinceInspection: number;
  hoursToService: number;
  lastInspectionAtUtc?: UtcIsoString;
  lastHeavyServiceAtUtc?: UtcIsoString;
  maintenanceStateInput: string;
  aogFlag: boolean;
  updatedAtUtc: UtcIsoString;
}

export interface MaintenanceTask {
  maintenanceTaskId: string;
  aircraftId: AircraftId;
  maintenanceType: string;
  providerSource: string;
  plannedStartUtc: UtcIsoString;
  plannedEndUtc: UtcIsoString;
  actualStartUtc?: UtcIsoString;
  actualEndUtc?: UtcIsoString;
  costEstimateAmount?: CurrencyAmount;
  actualCostAmount?: CurrencyAmount;
  taskState: "planned" | "in_service" | "completed" | "cancelled";
}
