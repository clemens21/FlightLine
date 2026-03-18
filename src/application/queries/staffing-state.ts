/*
 * Builds the staffing state read model from persisted save data and reference lookups when needed.
 * These query modules intentionally stay read-only so the UI and tests can ask for consistent snapshots without triggering side effects.
 */

import type { SaveId, UtcIsoString } from "../../domain/common/primitives.js";
import type {
  EmploymentModel,
  LaborCategory,
  NamedPilotAvailabilityState,
  NamedPilotTrainingProgramKind,
  PilotCertificationCode,
} from "../../domain/staffing/types.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import { loadNamedPilotRoster } from "../staffing/named-pilot-roster.js";
import { loadActiveCompanyContext } from "./company-state.js";

interface StaffingPackageRow extends Record<string, unknown> {
  staffingPackageId: string;
  sourceOfferId: string | null;
  laborCategory: LaborCategory;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  coverageUnits: number;
  fixedCostAmount: number;
  variableCostRate: number | null;
  serviceRegionCode: string | null;
  startsAtUtc: string;
  endsAtUtc: string | null;
  status: "pending" | "active" | "expired" | "cancelled";
  recurringObligationId: string | null;
  nextDueAtUtc: string | null;
}

export interface StaffingPackageView {
  staffingPackageId: string;
  sourceOfferId: string | undefined;
  laborCategory: LaborCategory;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  coverageUnits: number;
  fixedCostAmount: number;
  variableCostRate: number | undefined;
  serviceRegionCode: string | undefined;
  startsAtUtc: UtcIsoString;
  endsAtUtc: UtcIsoString | undefined;
  status: "pending" | "active" | "expired" | "cancelled";
  recurringObligationId: string | undefined;
  nextDueAtUtc: UtcIsoString | undefined;
}

export interface StaffingCoverageSummaryView {
  laborCategory: LaborCategory;
  qualificationGroup: string;
  activeCoverageUnits: number;
  pendingCoverageUnits: number;
  activePackageCount: number;
  pendingPackageCount: number;
}

export interface NamedPilotView {
  namedPilotId: string;
  staffingPackageId: string;
  sourceOfferId: string | undefined;
  rosterSlotNumber: number;
  displayName: string;
  qualificationGroup: string;
  certifications: PilotCertificationCode[];
  employmentModel: EmploymentModel;
  packageStatus: "pending" | "active" | "expired" | "cancelled";
  startsAtUtc: UtcIsoString;
  endsAtUtc: UtcIsoString | undefined;
  homeAirportId: string | undefined;
  currentAirportId: string | undefined;
  restingUntilUtc: UtcIsoString | undefined;
  trainingProgramKind: NamedPilotTrainingProgramKind | undefined;
  trainingTargetCertificationCode: PilotCertificationCode | undefined;
  trainingStartedAtUtc: UtcIsoString | undefined;
  trainingUntilUtc: UtcIsoString | undefined;
  travelOriginAirportId: string | undefined;
  travelDestinationAirportId: string | undefined;
  travelStartedAtUtc: UtcIsoString | undefined;
  travelUntilUtc: UtcIsoString | undefined;
  availabilityState: NamedPilotAvailabilityState;
  assignedScheduleId: string | undefined;
  assignedAircraftId: string | undefined;
  assignmentFromUtc: UtcIsoString | undefined;
  assignmentToUtc: UtcIsoString | undefined;
}

export interface StaffingStateView {
  saveId: SaveId;
  companyId: string;
  staffingPackages: StaffingPackageView[];
  coverageSummaries: StaffingCoverageSummaryView[];
  namedPilots: NamedPilotView[];
  totalActiveCoverageUnits: number;
  totalPendingCoverageUnits: number;
  totalMonthlyFixedCostAmount: number;
}

export function loadStaffingState(saveDatabase: SqliteFileDatabase, saveId: SaveId): StaffingStateView | null {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);

  if (!companyContext) {
    return null;
  }

  const rows = saveDatabase.all<StaffingPackageRow>(
    `SELECT
      sp.staffing_package_id AS staffingPackageId,
      sp.source_offer_id AS sourceOfferId,
      sp.labor_category AS laborCategory,
      sp.employment_model AS employmentModel,
      sp.qualification_group AS qualificationGroup,
      sp.coverage_units AS coverageUnits,
      sp.fixed_cost_amount AS fixedCostAmount,
      sp.variable_cost_rate AS variableCostRate,
      sp.service_region_code AS serviceRegionCode,
      sp.starts_at_utc AS startsAtUtc,
      sp.ends_at_utc AS endsAtUtc,
      sp.status AS status,
      ro.recurring_obligation_id AS recurringObligationId,
      ro.next_due_at_utc AS nextDueAtUtc
    FROM staffing_package AS sp
    LEFT JOIN recurring_obligation AS ro
      ON ro.source_object_type = 'staffing_package'
     AND ro.source_object_id = sp.staffing_package_id
     AND ro.status = 'active'
    WHERE sp.company_id = $company_id
    ORDER BY sp.starts_at_utc, sp.labor_category, sp.qualification_group`,
    { $company_id: companyContext.companyId },
  );

  const staffingPackages = rows.map<StaffingPackageView>((row) => ({
    staffingPackageId: row.staffingPackageId,
    sourceOfferId: row.sourceOfferId ?? undefined,
    laborCategory: row.laborCategory,
    employmentModel: row.employmentModel,
    qualificationGroup: row.qualificationGroup,
    coverageUnits: row.coverageUnits,
    fixedCostAmount: row.fixedCostAmount,
    variableCostRate: row.variableCostRate ?? undefined,
    serviceRegionCode: row.serviceRegionCode ?? undefined,
    startsAtUtc: row.startsAtUtc,
    endsAtUtc: row.endsAtUtc ?? undefined,
    status: row.status,
    recurringObligationId: row.recurringObligationId ?? undefined,
    nextDueAtUtc: row.nextDueAtUtc ?? undefined,
  }));

  const summaryMap = new Map<string, StaffingCoverageSummaryView>();

  for (const staffingPackage of staffingPackages) {
    const summaryKey = `${staffingPackage.laborCategory}:${staffingPackage.qualificationGroup}`;
    const existingSummary = summaryMap.get(summaryKey) ?? {
      laborCategory: staffingPackage.laborCategory,
      qualificationGroup: staffingPackage.qualificationGroup,
      activeCoverageUnits: 0,
      pendingCoverageUnits: 0,
      activePackageCount: 0,
      pendingPackageCount: 0,
    };

    if (staffingPackage.status === "active") {
      existingSummary.activeCoverageUnits += staffingPackage.coverageUnits;
      existingSummary.activePackageCount += 1;
    }

    if (staffingPackage.status === "pending") {
      existingSummary.pendingCoverageUnits += staffingPackage.coverageUnits;
      existingSummary.pendingPackageCount += 1;
    }

    summaryMap.set(summaryKey, existingSummary);
  }

  const coverageSummaries = [...summaryMap.values()].sort((left, right) => {
    if (left.laborCategory === right.laborCategory) {
      return left.qualificationGroup.localeCompare(right.qualificationGroup);
    }

    return left.laborCategory.localeCompare(right.laborCategory);
  });
  const namedPilots = loadNamedPilotRoster(saveDatabase, companyContext.companyId, companyContext.currentTimeUtc);

  return {
    saveId,
    companyId: companyContext.companyId,
    staffingPackages,
    coverageSummaries,
    namedPilots,
    totalActiveCoverageUnits: staffingPackages
      .filter((entry) => entry.status === "active")
      .reduce((sum, entry) => sum + entry.coverageUnits, 0),
    totalPendingCoverageUnits: staffingPackages
      .filter((entry) => entry.status === "pending")
      .reduce((sum, entry) => sum + entry.coverageUnits, 0),
    totalMonthlyFixedCostAmount: staffingPackages
      .filter((entry) => entry.status === "active" || entry.status === "pending")
      .reduce((sum, entry) => sum + entry.fixedCostAmount, 0),
  };
}
