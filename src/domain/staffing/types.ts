/*
 * Declares the domain types for staffing so commands, queries, and UI code share the same vocabulary.
 * These files are intentionally descriptive rather than behavioral: they define the shapes that move through the simulation.
 */

import type {
  AircraftId,
  CurrencyAmount,
  MaintenanceTaskId,
  NamedPilotAssignmentId,
  NamedPilotId,
  ScheduleId,
  StaffingPackageId,
  UtcIsoString,
} from "../common/primitives.js";

export type LaborCategory = "pilot" | "flight_attendant" | "mechanic" | "ops_support";
export type EmploymentModel = "direct_hire" | "contract_hire" | "contract_pool" | "service_agreement";
export type PilotCertificationCode = "SEPL" | "SEPS" | "MEPL" | "MEPS" | "JET";
export type NamedPilotTrainingProgramKind = "recurrent" | "certification";
export type PilotStatBand = "developing" | "solid" | "strong" | "exceptional";

export interface PilotVisibleStatProfile {
  operationalReliability: PilotStatBand;
  stressTolerance: PilotStatBand;
  procedureDiscipline: PilotStatBand;
  trainingAptitude: PilotStatBand;
}

export interface PilotVisibleProfile {
  candidateProfileId: string;
  qualificationLane: string;
  totalCareerHours: number;
  primaryQualificationFamilyHours: number;
  companyHours: number;
  statProfile: PilotVisibleStatProfile;
}

export interface StaffingPricingExplanation {
  summary: string;
  drivers: string[];
}

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

export type NamedPilotAvailabilityState =
  | "ready"
  | "reserved"
  | "flying"
  | "resting"
  | "training"
  | "traveling"
  | "pending"
  | "cancelled"
  | "expired";

export interface NamedPilot {
  namedPilotId: NamedPilotId;
  companyId: string;
  staffingPackageId: StaffingPackageId;
  rosterSlotNumber: number;
  displayName: string;
  certifications: PilotCertificationCode[];
  homeAirportId?: string;
  currentAirportId?: string;
  restingUntilUtc?: UtcIsoString;
  trainingProgramKind?: NamedPilotTrainingProgramKind;
  trainingTargetCertificationCode?: PilotCertificationCode;
  trainingStartedAtUtc?: UtcIsoString;
  trainingUntilUtc?: UtcIsoString;
  travelOriginAirportId?: string;
  travelDestinationAirportId?: string;
  travelStartedAtUtc?: UtcIsoString;
  travelUntilUtc?: UtcIsoString;
  createdAtUtc: UtcIsoString;
  updatedAtUtc: UtcIsoString;
}

export interface NamedPilotAssignment {
  namedPilotAssignmentId: NamedPilotAssignmentId;
  namedPilotId: NamedPilotId;
  aircraftId: AircraftId;
  scheduleId: ScheduleId;
  qualificationGroup: string;
  assignedFromUtc: UtcIsoString;
  assignedToUtc: UtcIsoString;
  status: "reserved" | "flying" | "completed" | "cancelled";
  createdAtUtc: UtcIsoString;
  updatedAtUtc: UtcIsoString;
}
