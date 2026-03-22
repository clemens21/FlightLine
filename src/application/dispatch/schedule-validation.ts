/*
 * Centralizes schedule validation rules for aircraft legs, contract bindings, timing windows, and dispatch readiness.
 * Command handlers use these helpers to keep draft and committed schedules consistent with the simulation rules.
 * If schedule behavior looks surprising, this is the first file to inspect because it owns the rulebook for what is
 * considered legal, risky, or blocked before a schedule ever reaches the database.
 */

import type { AirportId, CompanyContractId, JsonObject } from "../../domain/common/primitives.js";
import { normalizeUtcTimestamp } from "../../domain/common/utc.js";
import type { FlightLegType, ValidationMessage } from "../../domain/dispatch/types.js";
import type { LaborCategory } from "../../domain/staffing/types.js";
import { requiredCertificationForQualificationGroup } from "../../domain/staffing/pilot-certifications.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AircraftModelRecord, AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";
import type { AirportReferenceRepository, AirportRecord } from "../../infrastructure/reference/airport-reference.js";
import {
  deriveNamedPilotRequirements,
  selectNamedPilotsForRequirements,
} from "../staffing/named-pilot-roster.js";

export interface ProposedScheduleLegInput {
  legType: FlightLegType;
  linkedCompanyContractId?: CompanyContractId;
  originAirportId: AirportId;
  destinationAirportId: AirportId;
  plannedDepartureUtc: string;
  plannedArrivalUtc: string;
  assignedQualificationGroup?: string;
  payloadSnapshot?: JsonObject;
}

export interface ProposedScheduleInput {
  scheduleId?: string;
  aircraftId: string;
  scheduleKind: "operational" | "maintenance_only";
  legs: ProposedScheduleLegInput[];
}

interface CompanyAircraftRow extends Record<string, unknown> {
  aircraftId: string;
  aircraftModelId: string;
  activeCabinLayoutId: string | null;
  currentAirportId: string;
  deliveryState: string;
  statusInput: string;
  activeMaintenanceTaskId: string | null;
}

interface CompanyContractRow extends Record<string, unknown> {
  companyContractId: string;
  originAirportId: string;
  destinationAirportId: string;
  volumeType: "passenger" | "cargo";
  passengerCount: number | null;
  cargoWeightLb: number | null;
  acceptedPayoutAmount: number;
  earliestStartUtc: string | null;
  deadlineUtc: string;
  contractState: string;
  assignedAircraftId: string | null;
}

interface MaintenanceProgramRow extends Record<string, unknown> {
  hoursToService: number;
  maintenanceStateInput: string;
  aogFlag: number;
}

interface OverlappingScheduleRow extends Record<string, unknown> {
  scheduleId: string;
}

interface CompetingDraftContractRow extends Record<string, unknown> {
  scheduleId: string;
  aircraftId: string;
}

interface StaffingPackageRow extends Record<string, unknown> {
  staffingPackageId: string;
  coverageUnits: number;
}

interface ReservedUnitsRow extends Record<string, unknown> {
  staffingPackageId: string;
  reservedUnits: number;
}

export interface ProposedLaborReservation {
  sequenceNumber: number;
  staffingPackageId: string;
  laborCategory: LaborCategory;
  qualificationGroup: string;
  unitsReserved: number;
  reservedFromUtc: string;
  reservedToUtc: string;
}

export interface ResolvedScheduleLeg {
  sequenceNumber: number;
  legType: FlightLegType;
  linkedCompanyContractId?: CompanyContractId;
  originAirportId: AirportId;
  destinationAirportId: AirportId;
  plannedDepartureUtc: string;
  plannedArrivalUtc: string;
  assignedQualificationGroup?: string;
  payloadSnapshot?: JsonObject;
  distanceNm: number;
  plannedDurationMinutes: number;
}

export interface ScheduleValidationSnapshot {
  isCommittable: boolean;
  hardBlockerCount: number;
  warningCount: number;
  projectedScheduleProfit: number;
  projectedScheduleRevenue: number;
  projectedScheduleCost: number;
  projectedRiskBand: "low" | "medium" | "high";
  aircraftOperationalStateAfterCommit: string;
  contractIdsAttached: string[];
  totalDistanceNm: number;
  totalBlockHours: number;
  validationMessages: ValidationMessage[];
}

export interface ScheduleValidationResult {
  snapshot: ScheduleValidationSnapshot;
  resolvedLegs: ResolvedScheduleLeg[];
  laborReservations: ProposedLaborReservation[];
}

interface ValidateProposedScheduleDependencies {
  saveDatabase: SqliteFileDatabase;
  airportReference: AirportReferenceRepository;
  aircraftReference: AircraftReferenceRepository;
  companyId: string;
  currentTimeUtc: string;
}

interface StaffingRequirement {
  sequenceNumber: number;
  laborCategory: LaborCategory;
  qualificationGroup: string;
  unitsRequired: number;
  reservedFromUtc: string;
  reservedToUtc: string;
}

function minutesBetween(startUtc: string, endUtc: string): number {
  return Math.round((new Date(endUtc).getTime() - new Date(startUtc).getTime()) / 60_000);
}

function hoursBetween(startUtc: string, endUtc: string): number {
  return minutesBetween(startUtc, endUtc) / 60;
}

function compareCanonicalUtc(leftUtc: string, rightUtc: string): number {
  if (leftUtc < rightUtc) {
    return -1;
  }

  if (leftUtc > rightUtc) {
    return 1;
  }

  return 0;
}

function haversineDistanceNm(origin: AirportRecord, destination: AirportRecord): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusNm = 3440.065;
  const deltaLat = toRadians(destination.latitudeDeg - origin.latitudeDeg);
  const deltaLon = toRadians(destination.longitudeDeg - origin.longitudeDeg);
  const originLat = toRadians(origin.latitudeDeg);
  const destinationLat = toRadians(destination.latitudeDeg);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
    + Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

function pushMessage(
  messages: ValidationMessage[],
  severity: "blocker" | "warning" | "info",
  code: string,
  summary: string,
  affectedLegId?: string,
  suggestedRecoveryAction?: string,
): void {
  const message: ValidationMessage = {
    severity,
    code,
    summary,
  };

  if (affectedLegId) {
    message.affectedLegId = affectedLegId;
  }

  if (suggestedRecoveryAction) {
    message.suggestedRecoveryAction = suggestedRecoveryAction;
  }

  messages.push(message);
}

function determineRiskBand(hardBlockerCount: number, warningCount: number, projectedScheduleProfit: number): "low" | "medium" | "high" {
  if (hardBlockerCount > 0) {
    return "high";
  }

  if (warningCount >= 3 || projectedScheduleProfit < 0) {
    return "high";
  }

  if (warningCount > 0 || projectedScheduleProfit < 25_000) {
    return "medium";
  }

  return "low";
}

function resolveFlightAttendantQualificationGroup(_aircraftModel: AircraftModelRecord): string {
  return "cabin_general";
}

function buildPayloadSnapshot(contract: CompanyContractRow | null, inputPayloadSnapshot: JsonObject | undefined): JsonObject | undefined {
  if (!contract) {
    return inputPayloadSnapshot;
  }

  return {
    volumeType: contract.volumeType,
    passengerCount: contract.passengerCount ?? undefined,
    cargoWeightLb: contract.cargoWeightLb ?? undefined,
    acceptedPayoutAmount: contract.acceptedPayoutAmount,
    ...(inputPayloadSnapshot ?? {}),
  };
}

function findAvailableStaffingPackages(
  saveDatabase: SqliteFileDatabase,
  companyId: string,
  laborCategory: LaborCategory,
  qualificationGroup: string,
  reservedFromUtc: string,
  reservedToUtc: string,
): StaffingPackageRow[] {
  const qualificationClause = laborCategory === "pilot"
    ? ""
    : "AND qualification_group = $qualification_group";
  return saveDatabase.all<StaffingPackageRow>(
    `SELECT
      staffing_package_id AS staffingPackageId,
      coverage_units AS coverageUnits
    FROM staffing_package
    WHERE company_id = $company_id
      AND labor_category = $labor_category
      ${qualificationClause}
      AND status IN ('active', 'pending')
      AND starts_at_utc <= $reserved_from_utc
      AND (ends_at_utc IS NULL OR ends_at_utc >= $reserved_to_utc)
    ORDER BY starts_at_utc ASC, staffing_package_id ASC`,
    {
      $company_id: companyId,
      $labor_category: laborCategory,
      $qualification_group: qualificationGroup,
      $reserved_from_utc: reservedFromUtc,
      $reserved_to_utc: reservedToUtc,
    },
  );
}

function findReservedUnitsByPackage(
  saveDatabase: SqliteFileDatabase,
  staffingPackageIds: string[],
  reservedFromUtc: string,
  reservedToUtc: string,
): Map<string, number> {
  if (staffingPackageIds.length === 0) {
    return new Map();
  }

  const placeholders = staffingPackageIds.map((_, index) => `$staffing_package_id_${index}`).join(", ");
  const params: Record<string, string> = {
    $reserved_from_utc: reservedFromUtc,
    $reserved_to_utc: reservedToUtc,
  };

  staffingPackageIds.forEach((staffingPackageId, index) => {
    params[`$staffing_package_id_${index}`] = staffingPackageId;
  });

  const rows = saveDatabase.all<ReservedUnitsRow>(
    `SELECT
      staffing_package_id AS staffingPackageId,
      COALESCE(SUM(units_reserved), 0) AS reservedUnits
    FROM labor_allocation
    WHERE staffing_package_id IN (${placeholders})
      AND status = 'reserved'
      AND NOT (reserved_to_utc <= $reserved_from_utc OR reserved_from_utc >= $reserved_to_utc)
    GROUP BY staffing_package_id`,
    params,
  );

  return new Map(rows.map((row) => [row.staffingPackageId, row.reservedUnits]));
}

export function validateProposedSchedule(
  proposedSchedule: ProposedScheduleInput,
  dependencies: ValidateProposedScheduleDependencies,
): ScheduleValidationResult {
  const messages: ValidationMessage[] = [];
  const laborReservations: ProposedLaborReservation[] = [];
  const staffingRequirements: StaffingRequirement[] = [];
  const attachedContractIds: string[] = [];
  const resolvedLegs: ResolvedScheduleLeg[] = [];

  if (proposedSchedule.legs.length === 0) {
    pushMessage(messages, "blocker", "schedule.empty", "A schedule must contain at least one leg.");
  }

  const normalizedProposedLegs = proposedSchedule.legs.map((leg, index) => {
    const legKey = `leg_${index + 1}`;
    const normalizedDepartureUtc = normalizeUtcTimestamp(leg.plannedDepartureUtc);
    const normalizedArrivalUtc = normalizeUtcTimestamp(leg.plannedArrivalUtc);

    if (!normalizedDepartureUtc) {
      pushMessage(
        messages,
        "blocker",
        "leg.invalid_timestamp",
        "Planned departure must be a valid UTC timestamp.",
        legKey,
      );
    }

    if (!normalizedArrivalUtc) {
      pushMessage(
        messages,
        "blocker",
        "leg.invalid_timestamp",
        "Planned arrival must be a valid UTC timestamp.",
        legKey,
      );
    }

    if (!normalizedDepartureUtc || !normalizedArrivalUtc) {
      return null;
    }

    return {
      ...leg,
      plannedDepartureUtc: normalizedDepartureUtc,
      plannedArrivalUtc: normalizedArrivalUtc,
    } satisfies ProposedScheduleLegInput;
  });
  const validProposedLegs = normalizedProposedLegs.filter((leg): leg is ProposedScheduleLegInput => leg !== null);

  const aircraftRow = dependencies.saveDatabase.getOne<CompanyAircraftRow>(
    `SELECT
      aircraft_id AS aircraftId,
      aircraft_model_id AS aircraftModelId,
      active_cabin_layout_id AS activeCabinLayoutId,
      current_airport_id AS currentAirportId,
      delivery_state AS deliveryState,
      status_input AS statusInput,
      active_maintenance_task_id AS activeMaintenanceTaskId
    FROM company_aircraft
    WHERE aircraft_id = $aircraft_id
      AND company_id = $company_id
    LIMIT 1`,
    {
      $aircraft_id: proposedSchedule.aircraftId,
      $company_id: dependencies.companyId,
    },
  );

  if (!aircraftRow) {
    pushMessage(messages, "blocker", "aircraft.missing", `Aircraft ${proposedSchedule.aircraftId} is not controlled by the active company.`);
  }

  const aircraftModel = aircraftRow
    ? dependencies.aircraftReference.findModel(aircraftRow.aircraftModelId)
    : null;
  const activeCabinLayout = aircraftRow?.activeCabinLayoutId
    ? dependencies.aircraftReference.findLayout(aircraftRow.activeCabinLayoutId)
    : null;

  if (aircraftRow && !aircraftModel) {
    pushMessage(messages, "blocker", "aircraft.model_missing", `Aircraft model ${aircraftRow.aircraftModelId} is missing from the reference catalog.`);
  }

  const plannedStartUtc = normalizedProposedLegs[0]?.plannedDepartureUtc;
  const plannedEndUtc = normalizedProposedLegs[normalizedProposedLegs.length - 1]?.plannedArrivalUtc;

  if (plannedStartUtc && plannedEndUtc) {
    const overlappingSchedule = dependencies.saveDatabase.getOne<OverlappingScheduleRow>(
      `SELECT schedule_id AS scheduleId
      FROM aircraft_schedule
      WHERE aircraft_id = $aircraft_id
        AND is_draft = 0
        AND schedule_state IN ('committed', 'blocked')
        AND schedule_id <> COALESCE($schedule_id, '')
        AND NOT (planned_end_utc <= $planned_start_utc OR planned_start_utc >= $planned_end_utc)
      LIMIT 1`,
      {
        $aircraft_id: proposedSchedule.aircraftId,
        $schedule_id: proposedSchedule.scheduleId ?? null,
        $planned_start_utc: plannedStartUtc,
        $planned_end_utc: plannedEndUtc,
      },
    );

    if (overlappingSchedule) {
      pushMessage(messages, "blocker", "aircraft.overlap", `Aircraft ${proposedSchedule.aircraftId} already has an overlapping committed schedule.`);
    }
  }

  if (aircraftRow) {
    if (!["available", "delivered"].includes(aircraftRow.deliveryState)) {
      pushMessage(messages, "blocker", "aircraft.delivery_state", `Aircraft ${aircraftRow.aircraftId} is not in an operable delivery state.`);
    }

    if (["grounded", "maintenance"].includes(aircraftRow.statusInput)) {
      pushMessage(
        messages,
        "blocker",
        "aircraft.unavailable",
        `Aircraft ${aircraftRow.aircraftId} is not dispatchable in its current state.`,
        undefined,
        "Open Aircraft and start maintenance recovery, or wait for the current service state to clear before dispatching.",
      );
    }

    if (aircraftRow.activeMaintenanceTaskId) {
      pushMessage(
        messages,
        "blocker",
        "aircraft.maintenance_active",
        `Aircraft ${aircraftRow.aircraftId} has an active maintenance task.`,
        undefined,
        "Let the current maintenance task finish, then return to Dispatch once the aircraft is back in service.",
      );
    }
  }

  const maintenanceProgram = aircraftRow
    ? dependencies.saveDatabase.getOne<MaintenanceProgramRow>(
        `SELECT
          hours_to_service AS hoursToService,
          maintenance_state_input AS maintenanceStateInput,
          aog_flag AS aogFlag
        FROM maintenance_program_state
        WHERE aircraft_id = $aircraft_id
        LIMIT 1`,
        { $aircraft_id: aircraftRow.aircraftId },
      )
    : null;

  if (maintenanceProgram?.aogFlag === 1 || maintenanceProgram?.maintenanceStateInput === "aog") {
    pushMessage(
      messages,
      "blocker",
      "maintenance.aog",
      `Aircraft ${proposedSchedule.aircraftId} is AOG and cannot be scheduled.`,
      undefined,
      "Open Aircraft and start maintenance recovery before trying to dispatch this airframe again.",
    );
  }

  if (maintenanceProgram?.maintenanceStateInput === "overdue") {
    pushMessage(
      messages,
      "blocker",
      "maintenance.overdue",
      `Aircraft ${proposedSchedule.aircraftId} is past a hard maintenance threshold.`,
      undefined,
      "Open Aircraft and start maintenance recovery before committing more flying on this aircraft.",
    );
  }

  const contractIds = validProposedLegs
    .map((leg) => leg.linkedCompanyContractId)
    .filter((contractId): contractId is string => typeof contractId === "string");
  const uniqueContractIds = [...new Set(contractIds)];

  if (uniqueContractIds.length !== contractIds.length) {
    pushMessage(messages, "blocker", "contract.duplicate_attachment", "The same contract cannot be attached to more than one leg in this slice.");
  }

  const contractRows = uniqueContractIds.length > 0
    ? dependencies.saveDatabase.all<CompanyContractRow>(
        `SELECT
          company_contract_id AS companyContractId,
          origin_airport_id AS originAirportId,
          destination_airport_id AS destinationAirportId,
          volume_type AS volumeType,
          passenger_count AS passengerCount,
          cargo_weight_lb AS cargoWeightLb,
          accepted_payout_amount AS acceptedPayoutAmount,
          earliest_start_utc AS earliestStartUtc,
          deadline_utc AS deadlineUtc,
          contract_state AS contractState,
          assigned_aircraft_id AS assignedAircraftId
        FROM company_contract
        WHERE company_id = $company_id
          AND company_contract_id IN (${uniqueContractIds.map((_, index) => `$contract_id_${index}`).join(", ")})`,
        {
          $company_id: dependencies.companyId,
          ...uniqueContractIds.reduce<Record<string, string>>((accumulator, contractId, index) => {
            accumulator[`$contract_id_${index}`] = contractId;
            return accumulator;
          }, {}),
        },
      )
    : [];
  const contractById = new Map(contractRows.map((row) => [row.companyContractId, row]));

  let previousLeg: ResolvedScheduleLeg | null = null;
  let totalDistanceNm = 0;
  let totalBlockHours = 0;

  validProposedLegs.forEach((leg, index) => {
    const sequenceNumber = index + 1;
    const legKey = `leg_${sequenceNumber}`;
    const originAirport = dependencies.airportReference.findAirport(leg.originAirportId);
    const destinationAirport = dependencies.airportReference.findAirport(leg.destinationAirportId);
    const contract = leg.linkedCompanyContractId ? contractById.get(leg.linkedCompanyContractId) ?? null : null;
    const plannedDurationMinutes = minutesBetween(leg.plannedDepartureUtc, leg.plannedArrivalUtc);

    if (!["reposition", "contract_flight"].includes(leg.legType)) {
      pushMessage(messages, "blocker", "leg.unsupported_type", `Leg type ${leg.legType} is not supported in the first dispatch slice.`, legKey);
    }

    if (plannedDurationMinutes <= 0) {
      pushMessage(messages, "blocker", "leg.invalid_time_window", "Planned arrival must be later than planned departure.", legKey);
    }

    if (!originAirport) {
      pushMessage(messages, "blocker", "airport.origin_missing", `Origin airport ${leg.originAirportId} was not found.`, legKey);
    }

    if (!destinationAirport) {
      pushMessage(messages, "blocker", "airport.destination_missing", `Destination airport ${leg.destinationAirportId} was not found.`, legKey);
    }

    if (sequenceNumber === 1 && aircraftRow && leg.originAirportId !== aircraftRow.currentAirportId) {
      pushMessage(messages, "blocker", "aircraft.location_mismatch", `The first leg must start at the aircraft's current airport ${aircraftRow.currentAirportId}.`, legKey);
    }

    if (previousLeg) {
      if (previousLeg.destinationAirportId !== leg.originAirportId) {
        pushMessage(messages, "blocker", "leg.continuity", "Leg continuity is broken between consecutive legs.", legKey);
      }

      if (compareCanonicalUtc(leg.plannedDepartureUtc, previousLeg.plannedArrivalUtc) < 0) {
        pushMessage(messages, "blocker", "leg.overlap", "Leg times overlap or run backward.", legKey);
      }
    }

    if (originAirport && !originAirport.accessibleNow) {
      pushMessage(messages, "blocker", "airport.origin_inaccessible", `Origin airport ${originAirport.airportKey} is not currently accessible.`, legKey);
    }

    if (destinationAirport && !destinationAirport.accessibleNow) {
      pushMessage(messages, "blocker", "airport.destination_inaccessible", `Destination airport ${destinationAirport.airportKey} is not currently accessible.`, legKey);
    }

    if (aircraftModel && originAirport) {
      if (originAirport.airportSize !== null && originAirport.airportSize < aircraftModel.minimumAirportSize) {
        pushMessage(messages, "blocker", "airport.origin_size", `Origin airport ${originAirport.airportKey} is too small for ${aircraftModel.displayName}.`, legKey);
      }

      if (originAirport.longestHardRunwayFt !== undefined && originAirport.longestHardRunwayFt < aircraftModel.minimumRunwayFt) {
        pushMessage(messages, "blocker", "airport.origin_runway", `Origin airport ${originAirport.airportKey} runway is too short for ${aircraftModel.displayName}.`, legKey);
      }
    }

    if (aircraftModel && destinationAirport) {
      if (destinationAirport.airportSize !== null && destinationAirport.airportSize < aircraftModel.minimumAirportSize) {
        pushMessage(messages, "blocker", "airport.destination_size", `Destination airport ${destinationAirport.airportKey} is too small for ${aircraftModel.displayName}.`, legKey);
      }

      if (destinationAirport.longestHardRunwayFt !== undefined && destinationAirport.longestHardRunwayFt < aircraftModel.minimumRunwayFt) {
        pushMessage(messages, "blocker", "airport.destination_runway", `Destination airport ${destinationAirport.airportKey} runway is too short for ${aircraftModel.displayName}.`, legKey);
      }
    }

    let distanceNm = 0;

    if (originAirport && destinationAirport) {
      distanceNm = haversineDistanceNm(originAirport, destinationAirport);
      totalDistanceNm += distanceNm;

      if (aircraftModel && distanceNm > aircraftModel.rangeNm * 0.9) {
        pushMessage(messages, "blocker", "leg.range", `Leg distance exceeds the modeled range envelope for ${aircraftModel.displayName}.`, legKey);
      }

      if (aircraftModel) {
        const minimumDurationMinutes = Math.ceil((distanceNm / Math.max(aircraftModel.cruiseSpeedKtas, 100)) * 60 + 30);

        if (plannedDurationMinutes < minimumDurationMinutes) {
          pushMessage(messages, "blocker", "leg.block_time", "Planned block time is too short for the route distance.", legKey);
        } else if (plannedDurationMinutes < minimumDurationMinutes + 20) {
          pushMessage(messages, "warning", "leg.tight_block_time", "Planned block time is tight for the route distance.", legKey);
        }
      }
    }

    totalBlockHours += Math.max(plannedDurationMinutes, 0) / 60;

    if (leg.legType === "contract_flight") {
      if (!leg.linkedCompanyContractId) {
        pushMessage(messages, "blocker", "contract.missing_link", "Contract-flight legs must reference an accepted company contract.", legKey);
      }

      if (leg.linkedCompanyContractId && !contract) {
        pushMessage(messages, "blocker", "contract.missing", `Contract ${leg.linkedCompanyContractId} was not found.`, legKey);
      }

      if (contract) {
        attachedContractIds.push(contract.companyContractId);

        if (!["accepted", "assigned"].includes(contract.contractState)) {
          pushMessage(messages, "blocker", "contract.state", `Contract ${contract.companyContractId} is not in a schedulable state.`, legKey);
        }

        if (contract.assignedAircraftId && contract.assignedAircraftId !== proposedSchedule.aircraftId) {
          pushMessage(messages, "blocker", "contract.assigned_elsewhere", `Contract ${contract.companyContractId} is already assigned to another aircraft.`, legKey);
        }

        const competingDraft = dependencies.saveDatabase.getOne<CompetingDraftContractRow>(
          `SELECT
            s.schedule_id AS scheduleId,
            s.aircraft_id AS aircraftId
          FROM flight_leg AS fl
          JOIN aircraft_schedule AS s ON s.schedule_id = fl.schedule_id
          WHERE fl.linked_company_contract_id = $company_contract_id
            AND s.is_draft = 1
            AND s.schedule_state = 'draft'
            AND s.schedule_id <> $schedule_id
            AND s.aircraft_id <> $aircraft_id
          LIMIT 1`,
          {
            $company_contract_id: contract.companyContractId,
            $schedule_id: proposedSchedule.scheduleId ?? "__new_schedule__",
            $aircraft_id: proposedSchedule.aircraftId,
          },
        );

        if (competingDraft) {
          pushMessage(
            messages,
            "blocker",
            "contract.planned_elsewhere",
            `Contract ${contract.companyContractId} is already attached to another aircraft draft.`,
            legKey,
          );
        }

        if (contract.originAirportId !== leg.originAirportId || contract.destinationAirportId !== leg.destinationAirportId) {
          pushMessage(messages, "blocker", "contract.route_mismatch", `Contract ${contract.companyContractId} does not match the leg route.`, legKey);
        }

        if (contract.earliestStartUtc && compareCanonicalUtc(leg.plannedDepartureUtc, contract.earliestStartUtc) < 0) {
          pushMessage(messages, "blocker", "contract.earliest_start", `Leg departs before contract ${contract.companyContractId} may begin.`, legKey);
        }

        if (compareCanonicalUtc(leg.plannedArrivalUtc, contract.deadlineUtc) > 0) {
          pushMessage(messages, "blocker", "contract.deadline", `Leg arrives after contract ${contract.companyContractId} deadline.`, legKey);
        } else if (hoursBetween(leg.plannedArrivalUtc, contract.deadlineUtc) < 2) {
          pushMessage(messages, "warning", "contract.tight_deadline", `Leg leaves little margin before contract ${contract.companyContractId} deadline.`, legKey);
        }

        if (aircraftModel) {
          if (contract.volumeType === "passenger") {
            const seatCapacity = activeCabinLayout?.totalSeats ?? aircraftModel.maxPassengers;

            if ((contract.passengerCount ?? 0) > seatCapacity || (contract.passengerCount ?? 0) > aircraftModel.maxPassengers) {
              pushMessage(messages, "blocker", "payload.passenger_capacity", "Passenger count exceeds the aircraft cabin capacity.", legKey);
            }

            if (aircraftModel.flightAttendantsRequired > 0 && (contract.passengerCount ?? 0) > 0) {
              staffingRequirements.push({
                sequenceNumber,
                laborCategory: "flight_attendant",
                qualificationGroup: resolveFlightAttendantQualificationGroup(aircraftModel),
                unitsRequired: aircraftModel.flightAttendantsRequired,
                reservedFromUtc: leg.plannedDepartureUtc,
                reservedToUtc: leg.plannedArrivalUtc,
              });
            }
          }

          if (contract.volumeType === "cargo") {
            const layoutCargoCapacity = activeCabinLayout?.cargoCapacityLb ?? aircraftModel.maxCargoLb;
            const cargoCapacity = Math.min(layoutCargoCapacity, aircraftModel.maxCargoLb);

            if ((contract.cargoWeightLb ?? 0) > cargoCapacity || (contract.cargoWeightLb ?? 0) > aircraftModel.maxPayloadLb) {
              pushMessage(messages, "blocker", "payload.cargo_capacity", "Cargo weight exceeds the modeled payload capability.", legKey);
            }
          }
        }
      }
    }

    if (aircraftModel && ["reposition", "contract_flight"].includes(leg.legType)) {
      staffingRequirements.push({
        sequenceNumber,
        laborCategory: "pilot",
        qualificationGroup: leg.assignedQualificationGroup ?? aircraftModel.pilotQualificationGroup,
        unitsRequired: aircraftModel.pilotsRequired,
        reservedFromUtc: leg.plannedDepartureUtc,
        reservedToUtc: leg.plannedArrivalUtc,
      });
    }

    const resolvedAssignedQualificationGroup = aircraftModel
      ? leg.assignedQualificationGroup ?? aircraftModel.pilotQualificationGroup
      : leg.assignedQualificationGroup;
    const resolvedPayloadSnapshot = buildPayloadSnapshot(contract, leg.payloadSnapshot);
    const resolvedLeg: ResolvedScheduleLeg = {
      sequenceNumber,
      legType: leg.legType,
      originAirportId: leg.originAirportId,
      destinationAirportId: leg.destinationAirportId,
      plannedDepartureUtc: leg.plannedDepartureUtc,
      plannedArrivalUtc: leg.plannedArrivalUtc,
      distanceNm,
      plannedDurationMinutes,
      ...(leg.linkedCompanyContractId ? { linkedCompanyContractId: leg.linkedCompanyContractId } : {}),
      ...(resolvedAssignedQualificationGroup ? { assignedQualificationGroup: resolvedAssignedQualificationGroup } : {}),
      ...(resolvedPayloadSnapshot ? { payloadSnapshot: resolvedPayloadSnapshot } : {}),
    };

    resolvedLegs.push(resolvedLeg);
    previousLeg = resolvedLeg;
  });

  if (maintenanceProgram) {
    if (maintenanceProgram.hoursToService <= totalBlockHours) {
      pushMessage(
        messages,
        "blocker",
        "maintenance.window",
        "The planned schedule would exhaust the remaining maintenance window.",
        undefined,
        "Open Aircraft and start maintenance now, or shorten the draft so it stays inside the remaining service window.",
      );
    } else if (maintenanceProgram.hoursToService <= totalBlockHours + 5) {
      pushMessage(
        messages,
        "warning",
        "maintenance.tight_window",
        "The planned schedule leaves very little maintenance margin.",
        undefined,
        "Consider sending the aircraft to service from Aircraft before adding more flying, or keep this draft very short.",
      );
    }
  }

  for (const requirement of staffingRequirements) {
    const requiredCertificationCode = requirement.laborCategory === "pilot"
      ? requiredCertificationForQualificationGroup(requirement.qualificationGroup)
      : undefined;
    const staffingLabel = requirement.laborCategory === "pilot"
      ? `pilot coverage${requiredCertificationCode ? ` for ${requiredCertificationCode}` : ""}`
      : `${requirement.laborCategory} coverage for ${requirement.qualificationGroup}`;
    const candidatePackages = findAvailableStaffingPackages(
      dependencies.saveDatabase,
      dependencies.companyId,
      requirement.laborCategory,
      requirement.qualificationGroup,
      requirement.reservedFromUtc,
      requirement.reservedToUtc,
    );

    if (candidatePackages.length === 0) {
      pushMessage(messages, "blocker", "staffing.missing_package", `No ${staffingLabel} is available.`, `leg_${requirement.sequenceNumber}`);
      continue;
    }

    const reservedUnitsByPackage = findReservedUnitsByPackage(
      dependencies.saveDatabase,
      candidatePackages.map((entry) => entry.staffingPackageId),
      requirement.reservedFromUtc,
      requirement.reservedToUtc,
    );

    let remainingUnits = requirement.unitsRequired;
    let totalAvailableUnits = 0;

    for (const candidatePackage of candidatePackages) {
      const reservedUnits = reservedUnitsByPackage.get(candidatePackage.staffingPackageId) ?? 0;
      totalAvailableUnits += Math.max(0, candidatePackage.coverageUnits - reservedUnits);
    }

    if (totalAvailableUnits < requirement.unitsRequired) {
      pushMessage(messages, "blocker", "staffing.coverage_gap", `Not enough ${staffingLabel} is available.`, `leg_${requirement.sequenceNumber}`);
      continue;
    }

    if (totalAvailableUnits === requirement.unitsRequired) {
      pushMessage(messages, "warning", "staffing.last_spare_unit", `This schedule uses the last available ${staffingLabel}.`, `leg_${requirement.sequenceNumber}`);
    }

    for (const candidatePackage of candidatePackages) {
      if (remainingUnits <= 0) {
        break;
      }

      const reservedUnits = reservedUnitsByPackage.get(candidatePackage.staffingPackageId) ?? 0;
      const availableUnits = Math.max(0, candidatePackage.coverageUnits - reservedUnits);

      if (availableUnits <= 0) {
        continue;
      }

      const unitsReserved = Math.min(availableUnits, remainingUnits);
      remainingUnits -= unitsReserved;
      laborReservations.push({
        sequenceNumber: requirement.sequenceNumber,
        staffingPackageId: candidatePackage.staffingPackageId,
        laborCategory: requirement.laborCategory,
        qualificationGroup: requirement.qualificationGroup,
        unitsReserved,
        reservedFromUtc: requirement.reservedFromUtc,
        reservedToUtc: requirement.reservedToUtc,
      });
    }
  }

  const namedPilotRequirements = deriveNamedPilotRequirements(laborReservations);
  if (namedPilotRequirements.length > 0) {
    const namedPilotSelection = selectNamedPilotsForRequirements(
      dependencies.saveDatabase,
      dependencies.companyId,
      proposedSchedule.scheduleId ?? "__draft_preview__",
      namedPilotRequirements,
      {
        currentTimeUtc: dependencies.currentTimeUtc,
        airportReference: dependencies.airportReference,
        ...(resolvedLegs[0]?.originAirportId ? { requiredOriginAirportId: resolvedLegs[0].originAirportId } : {}),
      },
    );

    for (const assessment of namedPilotSelection.assessments) {
      const requiredCertificationLabel = assessment.requiredCertificationCode
        ? `${assessment.requiredCertificationCode} certification`
        : assessment.qualificationGroup;
      if (assessment.availableCandidateCount < assessment.unitsRequired) {
        const blockerSummary = assessment.blockedByCertificationCount > 0
          ? `Not enough named pilots are currently available for ${requiredCertificationLabel}; `
            + `${assessment.blockedByCertificationCount} lack that certification.`
          : assessment.blockedByTrainingCount > 0
          ? `Not enough named pilots are currently available for ${requiredCertificationLabel}; `
            + `${assessment.blockedByTrainingCount} in training.`
          : assessment.blockedByRestingCount > 0
            ? `Not enough named pilots are currently available for ${requiredCertificationLabel}; `
              + `${assessment.blockedByRestingCount} still resting.`
            : assessment.blockedByTravelCount > 0
              ? `Not enough named pilots are currently available for ${requiredCertificationLabel}; `
                + `${assessment.blockedByTravelCount} cannot reach ${resolvedLegs[0]?.originAirportId ?? "the first-leg origin"} in time.`
            : `Not enough named pilots are currently available for ${requiredCertificationLabel}; `
              + `need ${assessment.unitsRequired}, found ${assessment.availableCandidateCount}.`;
        const recoveryAction = assessment.blockedByCertificationCount > 0
          ? "Hire or train a pilot with the required certification."
          : assessment.blockedByTrainingCount > 0
          ? "Wait for training to complete or use a different pilot qualification group."
          : assessment.blockedByRestingCount > 0
            ? "Wait for a resting pilot to become ready or free another qualified pilot."
            : assessment.blockedByTravelCount > 0
              ? "Delay the schedule or use a pilot who is already at the first-leg origin."
            : "Free an overlapping assignment or wait until a resting pilot becomes ready.";
        pushMessage(
          messages,
          "blocker",
          "staffing.named_pilot_gap",
          blockerSummary,
          undefined,
          recoveryAction,
        );
        continue;
      }

      if (assessment.selectedTravelCount > 0) {
        pushMessage(
          messages,
          "warning",
          "staffing.named_pilot_travel_required",
          `${assessment.selectedTravelCount} named pilot${assessment.selectedTravelCount === 1 ? "" : "s"} would need to travel to ${resolvedLegs[0]?.originAirportId ?? "the first-leg origin"} before this schedule starts.`,
          undefined,
          "Commit only if that reposition window is acceptable for this schedule.",
        );
      }

      if (assessment.availableCandidateCount === assessment.unitsRequired) {
        pushMessage(
          messages,
          "warning",
          "staffing.named_pilot_last_ready",
          `This schedule would use the last ready named pilot coverage for ${requiredCertificationLabel}.`,
          undefined,
          "Commit only if you can afford to leave no ready reserve in this qualification group.",
        );
      }
    }
  }

  const uniqueAttachedContractIds = [...new Set(attachedContractIds)];
  const projectedScheduleRevenue = contractRows
    .filter((contract) => uniqueAttachedContractIds.includes(contract.companyContractId))
    .reduce((sum, contract) => sum + contract.acceptedPayoutAmount, 0);
  const projectedScheduleCost = aircraftModel
    ? Math.round(totalBlockHours * (aircraftModel.variableOperatingCostPerHourUsd + aircraftModel.maintenanceReservePerHourUsd) + resolvedLegs.length * 250)
    : 0;
  const projectedScheduleProfit = projectedScheduleRevenue - projectedScheduleCost;

  if (projectedScheduleProfit < 0) {
    pushMessage(messages, "warning", "finance.negative_margin", "Projected schedule profit is negative.");
  } else if (projectedScheduleProfit < 25_000) {
    pushMessage(messages, "warning", "finance.thin_margin", "Projected schedule profit is thin.");
  }

  const hardBlockerCount = messages.filter((message) => message.severity === "blocker").length;
  const warningCount = messages.filter((message) => message.severity === "warning").length;

  return {
    snapshot: {
      isCommittable: hardBlockerCount === 0,
      hardBlockerCount,
      warningCount,
      projectedScheduleProfit,
      projectedScheduleRevenue,
      projectedScheduleCost,
      projectedRiskBand: determineRiskBand(hardBlockerCount, warningCount, projectedScheduleProfit),
      aircraftOperationalStateAfterCommit: hardBlockerCount === 0 ? "scheduled" : aircraftRow?.statusInput ?? "unknown",
      contractIdsAttached: uniqueAttachedContractIds,
      totalDistanceNm: Math.round(totalDistanceNm),
      totalBlockHours: Number(totalBlockHours.toFixed(2)),
      validationMessages: messages,
    },
    resolvedLegs,
    laborReservations,
  };
}
