/*
 * Declares the domain types for staffing so commands, queries, and UI code share the same vocabulary.
 * These files are intentionally descriptive rather than behavioral: they define the shapes that move through the simulation.
 */

import type { AircraftId, CurrencyAmount, MaintenanceTaskId, ScheduleId, StaffingPackageId, UtcIsoString } from "../common/primitives.js";

export type LaborCategory = "pilot" | "flight_attendant" | "mechanic" | "ops_support";
export type EmploymentModel = "direct_hire" | "contract_pool" | "service_agreement";

export interface StaffingPackage {
  staffingPackageId: StaffingPackageId;
  companyId: string;
  sourceOfferId?: string;
  laborCategory: LaborCategory;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  coverageUnits: number;
  fixedCostAmount: CurrencyAmount;
  variableCostRate?: CurrencyAmount;
  serviceRegionCode?: string;
  startsAtUtc: UtcIsoString;
  endsAtUtc?: UtcIsoString;
  status: "pending" | "active" | "expired" | "cancelled";
}

export interface LaborAllocation {
  laborAllocationId: string;
  staffingPackageId: StaffingPackageId;
  aircraftId?: AircraftId;
  scheduleId?: ScheduleId;
  maintenanceTaskId?: MaintenanceTaskId;
  qualificationGroup: string;
  unitsReserved: number;
  reservedFromUtc: UtcIsoString;
  reservedToUtc: UtcIsoString;
  status: "reserved" | "consumed" | "released";
}
