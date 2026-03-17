/*
 * Builds the maintenance tasks read model from persisted save data and reference lookups when needed.
 * These query modules intentionally stay read-only so the UI and tests can ask for consistent snapshots without triggering side effects.
 */

import type { SaveId, UtcIsoString } from "../../domain/common/primitives.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import { loadActiveCompanyContext } from "./company-state.js";

interface MaintenanceTaskRow extends Record<string, unknown> {
  maintenanceTaskId: string;
  aircraftId: string;
  registration: string;
  maintenanceType: string;
  plannedStartUtc: string;
  plannedEndUtc: string;
  taskState: "planned" | "in_progress" | "completed" | "cancelled";
}

export interface MaintenanceTaskView {
  maintenanceTaskId: string;
  aircraftId: string;
  registration: string;
  maintenanceType: string;
  plannedStartUtc: UtcIsoString;
  plannedEndUtc: UtcIsoString;
  taskState: "planned" | "in_progress" | "completed" | "cancelled";
}

export function loadMaintenanceTasks(
  saveDatabase: SqliteFileDatabase,
  saveId: SaveId,
  options: {
    includeCompleted?: boolean;
  } = {},
): MaintenanceTaskView[] {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);

  if (!companyContext) {
    return [];
  }

  const statePredicate = options.includeCompleted
    ? `mt.task_state IN ('planned', 'in_progress', 'completed', 'cancelled')`
    : `mt.task_state IN ('planned', 'in_progress')`;

  return saveDatabase.all<MaintenanceTaskRow>(
    `SELECT
      mt.maintenance_task_id AS maintenanceTaskId,
      mt.aircraft_id AS aircraftId,
      ca.registration AS registration,
      mt.maintenance_type AS maintenanceType,
      mt.planned_start_utc AS plannedStartUtc,
      mt.planned_end_utc AS plannedEndUtc,
      mt.task_state AS taskState
    FROM maintenance_task AS mt
    JOIN company_aircraft AS ca ON ca.aircraft_id = mt.aircraft_id
    WHERE ca.company_id = $company_id
      AND ${statePredicate}
    ORDER BY mt.planned_start_utc ASC, mt.maintenance_task_id ASC`,
    { $company_id: companyContext.companyId },
  );
}
