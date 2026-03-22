/*
 * Shared maintenance-recovery math for the player-facing return-to-service loop.
 * Commands, queries, and UI code use this helper so the visible recovery promise matches the actual command outcome.
 */

import type { CurrencyAmount, UtcIsoString } from "../common/primitives.js";

export type MaintenanceRecoverySeverity = "due_soon" | "overdue" | "aog";

export interface MaintenanceRecoveryModel {
  maintenanceDowntimeHours: number;
  maintenanceReservePerHourUsd: number;
  fixedSupportCostPerDayUsd: number;
}

export interface MaintenanceRecoveryPlan {
  maintenanceType: "inspection_a" | "recovery_service";
  severity: MaintenanceRecoverySeverity;
  durationHours: number;
  estimatedCostAmount: CurrencyAmount;
  readyAtUtc: UtcIsoString;
}

export function resolveMaintenanceRecoverySeverity(input: {
  maintenanceStateInput: string;
  aogFlag: boolean;
}): MaintenanceRecoverySeverity | null {
  if (input.aogFlag || input.maintenanceStateInput === "aog") {
    return "aog";
  }

  if (input.maintenanceStateInput === "overdue") {
    return "overdue";
  }

  if (input.maintenanceStateInput === "due_soon") {
    return "due_soon";
  }

  return null;
}

export function deriveMaintenanceRecoveryPlan(
  severity: MaintenanceRecoverySeverity,
  model: MaintenanceRecoveryModel,
  currentTimeUtc: UtcIsoString,
): MaintenanceRecoveryPlan {
  const baseDowntimeHours = Math.max(4, Math.ceil(model.maintenanceDowntimeHours));
  const durationHours = severity === "due_soon"
    ? baseDowntimeHours
    : severity === "overdue"
      ? baseDowntimeHours + 4
      : baseDowntimeHours + 8;
  const severityMultiplier = severity === "due_soon" ? 1 : severity === "overdue" ? 1.35 : 1.7;
  const estimatedCostAmount = Math.max(
    2_500,
    Math.round(
      (model.maintenanceReservePerHourUsd * durationHours
        + model.fixedSupportCostPerDayUsd * Math.max(1, Math.ceil(durationHours / 24)))
      * severityMultiplier,
    ),
  );

  return {
    maintenanceType: severity === "due_soon" ? "inspection_a" : "recovery_service",
    severity,
    durationHours,
    estimatedCostAmount,
    readyAtUtc: new Date(Date.parse(currentTimeUtc) + durationHours * 3_600_000).toISOString(),
  };
}
