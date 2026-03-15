import type { JsonObject, SaveId } from "../../domain/common/primitives.js";
import type { FlightLegType, FlightLegState, ScheduleState } from "../../domain/dispatch/types.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import { loadActiveCompanyContext } from "./company-state.js";

interface ScheduleRow extends Record<string, unknown> {
  scheduleId: string;
  aircraftId: string;
  scheduleKind: "operational" | "maintenance_only";
  scheduleState: ScheduleState;
  isDraft: number;
  plannedStartUtc: string;
  plannedEndUtc: string;
  validationSnapshotJson: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}

interface FlightLegRow extends Record<string, unknown> {
  flightLegId: string;
  scheduleId: string;
  sequenceNumber: number;
  legType: FlightLegType;
  linkedCompanyContractId: string | null;
  originAirportId: string;
  destinationAirportId: string;
  plannedDepartureUtc: string;
  plannedArrivalUtc: string;
  actualDepartureUtc: string | null;
  actualArrivalUtc: string | null;
  legState: FlightLegState;
  assignedQualificationGroup: string | null;
  payloadSnapshotJson: string | null;
}

interface LaborAllocationRow extends Record<string, unknown> {
  laborAllocationId: string;
  scheduleId: string;
  staffingPackageId: string;
  qualificationGroup: string;
  unitsReserved: number;
  reservedFromUtc: string;
  reservedToUtc: string;
  status: string;
}

function parseJsonObject(rawValue: string | null): JsonObject | undefined {
  if (!rawValue) {
    return undefined;
  }

  return JSON.parse(rawValue) as JsonObject;
}

export interface ScheduleLegView {
  flightLegId: string;
  sequenceNumber: number;
  legType: FlightLegType;
  linkedCompanyContractId: string | undefined;
  originAirportId: string;
  destinationAirportId: string;
  plannedDepartureUtc: string;
  plannedArrivalUtc: string;
  actualDepartureUtc: string | undefined;
  actualArrivalUtc: string | undefined;
  legState: FlightLegState;
  assignedQualificationGroup: string | undefined;
  payloadSnapshot: JsonObject | undefined;
}

export interface ScheduleLaborAllocationView {
  laborAllocationId: string;
  staffingPackageId: string;
  qualificationGroup: string;
  unitsReserved: number;
  reservedFromUtc: string;
  reservedToUtc: string;
  status: string;
}

export interface AircraftScheduleView {
  scheduleId: string;
  aircraftId: string;
  scheduleKind: "operational" | "maintenance_only";
  scheduleState: ScheduleState;
  isDraft: boolean;
  plannedStartUtc: string;
  plannedEndUtc: string;
  validationSnapshot: JsonObject | undefined;
  createdAtUtc: string;
  updatedAtUtc: string;
  legs: ScheduleLegView[];
  laborAllocations: ScheduleLaborAllocationView[];
}

export function loadAircraftSchedules(
  saveDatabase: SqliteFileDatabase,
  saveId: SaveId,
  aircraftId?: string,
): AircraftScheduleView[] {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);

  if (!companyContext) {
    return [];
  }

  const rows = saveDatabase.all<ScheduleRow>(
    `SELECT
      s.schedule_id AS scheduleId,
      s.aircraft_id AS aircraftId,
      s.schedule_kind AS scheduleKind,
      s.schedule_state AS scheduleState,
      s.is_draft AS isDraft,
      s.planned_start_utc AS plannedStartUtc,
      s.planned_end_utc AS plannedEndUtc,
      s.validation_snapshot_json AS validationSnapshotJson,
      s.created_at_utc AS createdAtUtc,
      s.updated_at_utc AS updatedAtUtc
    FROM aircraft_schedule AS s
    JOIN company_aircraft AS ca ON ca.aircraft_id = s.aircraft_id
    WHERE ca.company_id = $company_id
      AND ($aircraft_id IS NULL OR s.aircraft_id = $aircraft_id)
    ORDER BY s.planned_start_utc ASC, s.schedule_id ASC`,
    {
      $company_id: companyContext.companyId,
      $aircraft_id: aircraftId ?? null,
    },
  );

  if (rows.length === 0) {
    return [];
  }

  const scheduleIds = rows.map((row) => row.scheduleId);
  const placeholders = scheduleIds.map((_, index) => `$schedule_id_${index}`).join(", ");
  const params = scheduleIds.reduce<Record<string, string>>((accumulator, scheduleId, index) => {
    accumulator[`$schedule_id_${index}`] = scheduleId;
    return accumulator;
  }, {});

  const flightLegRows = saveDatabase.all<FlightLegRow>(
    `SELECT
      flight_leg_id AS flightLegId,
      schedule_id AS scheduleId,
      sequence_number AS sequenceNumber,
      leg_type AS legType,
      linked_company_contract_id AS linkedCompanyContractId,
      origin_airport_id AS originAirportId,
      destination_airport_id AS destinationAirportId,
      planned_departure_utc AS plannedDepartureUtc,
      planned_arrival_utc AS plannedArrivalUtc,
      actual_departure_utc AS actualDepartureUtc,
      actual_arrival_utc AS actualArrivalUtc,
      leg_state AS legState,
      assigned_qualification_group AS assignedQualificationGroup,
      payload_snapshot_json AS payloadSnapshotJson
    FROM flight_leg
    WHERE schedule_id IN (${placeholders})
    ORDER BY schedule_id ASC, sequence_number ASC`,
    params,
  );

  const laborAllocationRows = saveDatabase.all<LaborAllocationRow>(
    `SELECT
      labor_allocation_id AS laborAllocationId,
      schedule_id AS scheduleId,
      staffing_package_id AS staffingPackageId,
      qualification_group AS qualificationGroup,
      units_reserved AS unitsReserved,
      reserved_from_utc AS reservedFromUtc,
      reserved_to_utc AS reservedToUtc,
      status AS status
    FROM labor_allocation
    WHERE schedule_id IN (${placeholders})
    ORDER BY schedule_id ASC, reserved_from_utc ASC, labor_allocation_id ASC`,
    params,
  );

  const legsByScheduleId = new Map<string, ScheduleLegView[]>();
  for (const row of flightLegRows) {
    const scheduleLegs = legsByScheduleId.get(row.scheduleId) ?? [];
    scheduleLegs.push({
      flightLegId: row.flightLegId,
      sequenceNumber: row.sequenceNumber,
      legType: row.legType,
      linkedCompanyContractId: row.linkedCompanyContractId ?? undefined,
      originAirportId: row.originAirportId,
      destinationAirportId: row.destinationAirportId,
      plannedDepartureUtc: row.plannedDepartureUtc,
      plannedArrivalUtc: row.plannedArrivalUtc,
      actualDepartureUtc: row.actualDepartureUtc ?? undefined,
      actualArrivalUtc: row.actualArrivalUtc ?? undefined,
      legState: row.legState,
      assignedQualificationGroup: row.assignedQualificationGroup ?? undefined,
      payloadSnapshot: parseJsonObject(row.payloadSnapshotJson),
    });
    legsByScheduleId.set(row.scheduleId, scheduleLegs);
  }

  const allocationsByScheduleId = new Map<string, ScheduleLaborAllocationView[]>();
  for (const row of laborAllocationRows) {
    const scheduleAllocations = allocationsByScheduleId.get(row.scheduleId) ?? [];
    scheduleAllocations.push({
      laborAllocationId: row.laborAllocationId,
      staffingPackageId: row.staffingPackageId,
      qualificationGroup: row.qualificationGroup,
      unitsReserved: row.unitsReserved,
      reservedFromUtc: row.reservedFromUtc,
      reservedToUtc: row.reservedToUtc,
      status: row.status,
    });
    allocationsByScheduleId.set(row.scheduleId, scheduleAllocations);
  }

  return rows.map((row) => ({
    scheduleId: row.scheduleId,
    aircraftId: row.aircraftId,
    scheduleKind: row.scheduleKind,
    scheduleState: row.scheduleState,
    isDraft: row.isDraft === 1,
    plannedStartUtc: row.plannedStartUtc,
    plannedEndUtc: row.plannedEndUtc,
    validationSnapshot: parseJsonObject(row.validationSnapshotJson),
    createdAtUtc: row.createdAtUtc,
    updatedAtUtc: row.updatedAtUtc,
    legs: legsByScheduleId.get(row.scheduleId) ?? [],
    laborAllocations: allocationsByScheduleId.get(row.scheduleId) ?? [],
  }));
}
