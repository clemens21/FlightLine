import type { CompanyId, JsonObject, SaveId, UtcIsoString } from "../common/primitives.js";

export type DifficultyProfile = "relaxed" | "standard" | "challenging";

export interface SaveGame {
  saveId: SaveId;
  saveVersion: number;
  createdAtUtc: UtcIsoString;
  updatedAtUtc: UtcIsoString;
  worldSeed: string;
  difficultyProfile: DifficultyProfile;
  airportSnapshotVersion: string;
  aircraftSnapshotVersion: string;
  activeCompanyId?: CompanyId;
}

export interface GameClock {
  saveId: SaveId;
  currentTimeUtc: UtcIsoString;
  lastAdvancedAtUtc?: UtcIsoString;
  lastAdvanceResult?: JsonObject;
}

export type ScheduledEventType =
  | "offer_window_expired"
  | "staffing_package_activated"
  | "staffing_package_expired"
  | "recurring_payment_due"
  | "maintenance_start_due"
  | "maintenance_complete_due"
  | "flight_leg_departure_due"
  | "flight_leg_arrival_due"
  | "contract_deadline_check";

export interface ScheduledEvent {
  scheduledEventId: string;
  saveId: SaveId;
  eventType: ScheduledEventType;
  scheduledTimeUtc: UtcIsoString;
  status: "pending" | "processed" | "cancelled";
  aircraftId?: string;
  companyContractId?: string;
  maintenanceTaskId?: string;
  payload?: JsonObject;
}
