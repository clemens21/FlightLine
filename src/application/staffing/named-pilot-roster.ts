/*
 * Centralizes the thin named-pilot layer that sits on top of package staffing.
 * The first slice keeps this logic intentionally narrow: roster reconciliation, schedule assignment,
 * and derived availability for the Staffing workspace.
 */

import { createPrefixedId } from "../commands/utils.js";
import type {
  LaborCategory,
  EmploymentModel,
  NamedPilotAvailabilityState,
  PilotCertificationCode,
  NamedPilotTrainingProgramKind,
} from "../../domain/staffing/types.js";
import {
  certificationsForQualificationGroup,
  parsePilotCertificationsJson,
  pilotCertificationsSatisfyQualificationGroup,
  pilotCertificationsToJson,
  requiredCertificationForQualificationGroup,
} from "../../domain/staffing/pilot-certifications.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AirportReferenceRepository, AirportRecord } from "../../infrastructure/reference/airport-reference.js";

interface PilotStaffingPackageRow extends Record<string, unknown> {
  staffingPackageId: string;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  coverageUnits: number;
  startsAtUtc: string;
  endsAtUtc: string | null;
  status: "pending" | "active" | "expired" | "cancelled";
}

interface NamedPilotRow extends Record<string, unknown> {
  namedPilotId: string;
  staffingPackageId: string;
  sourceOfferId: string | null;
  rosterSlotNumber: number;
  displayName: string;
  certificationsJson: string | null;
  homeAirportId: string | null;
  currentAirportId: string | null;
  restingUntilUtc: string | null;
  trainingProgramKind: NamedPilotTrainingProgramKind | null;
  trainingTargetCertificationCode: PilotCertificationCode | null;
  trainingStartedAtUtc: string | null;
  trainingUntilUtc: string | null;
  travelOriginAirportId: string | null;
  travelDestinationAirportId: string | null;
  travelStartedAtUtc: string | null;
  travelUntilUtc: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  packageStatus: "pending" | "active" | "expired" | "cancelled";
  startsAtUtc: string;
  endsAtUtc: string | null;
}

interface NamedPilotAssignmentRow extends Record<string, unknown> {
  namedPilotAssignmentId: string;
  namedPilotId: string;
  aircraftId: string;
  scheduleId: string;
  qualificationGroup: string;
  assignedFromUtc: string;
  assignedToUtc: string;
  status: "reserved" | "flying" | "completed" | "cancelled";
  createdAtUtc: string;
  updatedAtUtc: string;
}

interface CandidatePilotRow extends Record<string, unknown> {
  namedPilotId: string;
  displayName: string;
  qualificationGroup: string;
  certificationsJson: string | null;
  currentAirportId: string | null;
  restingUntilUtc: string | null;
  trainingUntilUtc: string | null;
  travelDestinationAirportId: string | null;
  travelStartedAtUtc: string | null;
  travelUntilUtc: string | null;
}

interface AvailableCandidate {
  candidate: CandidatePilotRow;
  travelOriginAirportId?: string;
  travelDestinationAirportId?: string;
  travelStartedAtUtc?: string;
  travelUntilUtc?: string;
}

export interface PilotReservationLike {
  laborCategory: LaborCategory;
  qualificationGroup: string;
  unitsReserved: number;
  reservedFromUtc: string;
  reservedToUtc: string;
}

export interface NamedPilotRequirement {
  qualificationGroup: string;
  unitsRequired: number;
  assignedFromUtc: string;
  assignedToUtc: string;
}

export interface SelectedNamedPilotAssignment {
  namedPilotId: string;
  qualificationGroup: string;
  assignedFromUtc: string;
  assignedToUtc: string;
  travelOriginAirportId?: string;
  travelDestinationAirportId?: string;
  travelStartedAtUtc?: string;
  travelUntilUtc?: string;
}

export interface NamedPilotRosterView {
  namedPilotId: string;
  staffingPackageId: string;
  sourceOfferId: string | undefined;
  rosterSlotNumber: number;
  displayName: string;
  qualificationGroup: string;
  certifications: PilotCertificationCode[];
  employmentModel: EmploymentModel;
  packageStatus: "pending" | "active" | "expired" | "cancelled";
  startsAtUtc: string;
  endsAtUtc: string | undefined;
  homeAirportId: string | undefined;
  currentAirportId: string | undefined;
  restingUntilUtc: string | undefined;
  trainingProgramKind: NamedPilotTrainingProgramKind | undefined;
  trainingTargetCertificationCode: PilotCertificationCode | undefined;
  trainingStartedAtUtc: string | undefined;
  trainingUntilUtc: string | undefined;
  travelOriginAirportId: string | undefined;
  travelDestinationAirportId: string | undefined;
  travelStartedAtUtc: string | undefined;
  travelUntilUtc: string | undefined;
  availabilityState: NamedPilotAvailabilityState;
  assignedScheduleId: string | undefined;
  assignedAircraftId: string | undefined;
  assignmentFromUtc: string | undefined;
  assignmentToUtc: string | undefined;
}

export interface NamedPilotSelectionResult {
  hardBlockers: string[];
  selectedAssignments: SelectedNamedPilotAssignment[];
  assessments: NamedPilotRequirementAssessment[];
}

export interface SelectNamedPilotsOptions {
  currentTimeUtc: string;
  requiredOriginAirportId?: string;
  airportReference?: AirportReferenceRepository;
}

export interface ReconcileNamedPilotsResult {
  changed: boolean;
  createdPilotCount: number;
}

export interface NamedPilotRequirementAssessment {
  qualificationGroup: string;
  requiredCertificationCode?: PilotCertificationCode;
  unitsRequired: number;
  availableCandidateCount: number;
  blockedByCertificationCount: number;
  blockedByTrainingCount: number;
  blockedByRestingCount: number;
  blockedByTravelCount: number;
  blockedByOverlapCount: number;
  selectedTravelCount: number;
  assignedFromUtc: string;
  assignedToUtc: string;
}

const FIRST_NAMES = [
  "Avery",
  "Blake",
  "Cameron",
  "Dakota",
  "Emerson",
  "Finley",
  "Harper",
  "Jamie",
  "Jordan",
  "Kai",
  "Logan",
  "Morgan",
  "Parker",
  "Quinn",
  "Reese",
  "Riley",
  "Sawyer",
  "Skyler",
  "Taylor",
  "Tatum",
] as const;

const LAST_NAMES = [
  "Bennett",
  "Brooks",
  "Calloway",
  "Dalton",
  "Ellis",
  "Foster",
  "Grayson",
  "Hayes",
  "Iverson",
  "Jordan",
  "Kendall",
  "Lawson",
  "Mercer",
  "Nolan",
  "Parker",
  "Quincy",
  "Sawyer",
  "Sterling",
  "Turner",
  "Walker",
] as const;

export const NAMED_PILOT_REST_HOURS = 10;
export const NAMED_PILOT_RECURRENT_TRAINING_HOURS = 48;
export const NAMED_PILOT_CERTIFICATION_TRAINING_HOURS = 72;
export const NAMED_PILOT_TRAVEL_SPEED_KTAS = 280;
export const NAMED_PILOT_TRAVEL_BUFFER_MINUTES = 60;

function compareUtc(leftUtc: string, rightUtc: string): number {
  return new Date(leftUtc).getTime() - new Date(rightUtc).getTime();
}

function addHoursIso(utcIsoString: string, hours: number): string {
  return new Date(new Date(utcIsoString).getTime() + hours * 3_600_000).toISOString();
}

function addMinutesIso(utcIsoString: string, minutes: number): string {
  return new Date(new Date(utcIsoString).getTime() + minutes * 60_000).toISOString();
}

function maxUtc(...utcValues: Array<string | null | undefined>): string | undefined {
  const definedValues = utcValues.filter((value): value is string => Boolean(value));
  if (definedValues.length === 0) {
    return undefined;
  }

  return definedValues.reduce((latest, value) =>
    compareUtc(value, latest) > 0 ? value : latest
  , definedValues[0]!);
}

function haversineDistanceNm(origin: AirportRecord, destination: AirportRecord): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusNm = 3440.065;
  const deltaLatitude = toRadians(destination.latitudeDeg - origin.latitudeDeg);
  const deltaLongitude = toRadians(destination.longitudeDeg - origin.longitudeDeg);
  const originLatitude = toRadians(origin.latitudeDeg);
  const destinationLatitude = toRadians(destination.latitudeDeg);

  const a =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2)
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

function hashString(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }

  return Math.abs(hash);
}

function generatePilotName(staffingPackageId: string, rosterSlotNumber: number, usedNames: Set<string>): string {
  const seed = hashString(`${staffingPackageId}:${rosterSlotNumber}`);

  for (let attempt = 0; attempt < FIRST_NAMES.length * LAST_NAMES.length; attempt += 1) {
    const firstName = FIRST_NAMES[(seed + attempt) % FIRST_NAMES.length]!;
    const lastName = LAST_NAMES[(seed * 7 + attempt) % LAST_NAMES.length]!;
    const candidate = `${firstName} ${lastName}`;

    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }

  const fallback = `Pilot ${rosterSlotNumber}`;
  usedNames.add(fallback);
  return fallback;
}

function pickRelevantAssignment(
  assignments: NamedPilotAssignmentRow[],
  currentTimeUtc: string,
): NamedPilotAssignmentRow | undefined {
  const flyingAssignment = assignments.find((assignment) =>
    assignment.status === "flying"
    && compareUtc(assignment.assignedFromUtc, currentTimeUtc) <= 0
    && compareUtc(currentTimeUtc, assignment.assignedToUtc) < 0
  );

  if (flyingAssignment) {
    return flyingAssignment;
  }

  return assignments.find((assignment) =>
    assignment.status === "reserved"
    && compareUtc(currentTimeUtc, assignment.assignedToUtc) < 0
  );
}

function describeRequirementLabel(
  qualificationGroup: string,
  requiredCertificationCode: PilotCertificationCode | undefined,
): string {
  return requiredCertificationCode ? `${requiredCertificationCode} certification` : qualificationGroup;
}

export function deriveNamedPilotRequirements(
  reservations: ReadonlyArray<PilotReservationLike>,
): NamedPilotRequirement[] {
  const pilotReservations = reservations.filter((reservation) => reservation.laborCategory === "pilot");
  const reservationsByQualification = new Map<string, PilotReservationLike[]>();

  for (const reservation of pilotReservations) {
    const existingReservations = reservationsByQualification.get(reservation.qualificationGroup) ?? [];
    existingReservations.push(reservation);
    reservationsByQualification.set(reservation.qualificationGroup, existingReservations);
  }

  return [...reservationsByQualification.entries()]
    .map(([qualificationGroup, groupedReservations]) => {
      const events = groupedReservations
        .flatMap((reservation) => [
          { timeUtc: reservation.reservedFromUtc, delta: reservation.unitsReserved, order: 1 },
          { timeUtc: reservation.reservedToUtc, delta: reservation.unitsReserved * -1, order: 0 },
        ])
        .sort((left, right) => {
          const timeComparison = compareUtc(left.timeUtc, right.timeUtc);

          if (timeComparison !== 0) {
            return timeComparison;
          }

          return left.order - right.order;
        });

      let concurrentUnits = 0;
      let peakUnits = 0;

      for (const event of events) {
        concurrentUnits += event.delta;
        peakUnits = Math.max(peakUnits, concurrentUnits);
      }

      const assignedFromUtc = groupedReservations.reduce((earliest, reservation) =>
        compareUtc(reservation.reservedFromUtc, earliest) < 0 ? reservation.reservedFromUtc : earliest
      , groupedReservations[0]!.reservedFromUtc);
      const assignedToUtc = groupedReservations.reduce((latest, reservation) =>
        compareUtc(reservation.reservedToUtc, latest) > 0 ? reservation.reservedToUtc : latest
      , groupedReservations[0]!.reservedToUtc);

      return {
        qualificationGroup,
        unitsRequired: peakUnits,
        assignedFromUtc,
        assignedToUtc,
      } satisfies NamedPilotRequirement;
    })
    .sort((left, right) => {
      const timeComparison = compareUtc(left.assignedFromUtc, right.assignedFromUtc);
      return timeComparison !== 0 ? timeComparison : left.qualificationGroup.localeCompare(right.qualificationGroup);
    });
}

export function reconcileNamedPilots(
  saveDatabase: SqliteFileDatabase,
  companyId: string,
  homeBaseAirportId: string,
  currentTimeUtc: string,
): ReconcileNamedPilotsResult {
  const packages = saveDatabase.all<PilotStaffingPackageRow>(
    `SELECT
      staffing_package_id AS staffingPackageId,
      employment_model AS employmentModel,
      qualification_group AS qualificationGroup,
      coverage_units AS coverageUnits,
      starts_at_utc AS startsAtUtc,
      ends_at_utc AS endsAtUtc,
      status AS status
    FROM staffing_package
    WHERE company_id = $company_id
      AND labor_category = 'pilot'
      AND status IN ('pending', 'active')
    ORDER BY starts_at_utc ASC, staffing_package_id ASC`,
    { $company_id: companyId },
  );

  if (packages.length === 0) {
    return {
      changed: false,
      createdPilotCount: 0,
    };
  }

  const existingPilots = saveDatabase.all<NamedPilotRow>(
    `SELECT
      np.named_pilot_id AS namedPilotId,
      np.staffing_package_id AS staffingPackageId,
      sp.source_offer_id AS sourceOfferId,
      np.roster_slot_number AS rosterSlotNumber,
      np.display_name AS displayName,
      np.certifications_json AS certificationsJson,
      np.home_airport_id AS homeAirportId,
      np.current_airport_id AS currentAirportId,
      np.resting_until_utc AS restingUntilUtc,
      np.training_program_kind AS trainingProgramKind,
      np.training_target_certification_code AS trainingTargetCertificationCode,
      np.training_started_at_utc AS trainingStartedAtUtc,
      np.training_until_utc AS trainingUntilUtc,
      np.travel_origin_airport_id AS travelOriginAirportId,
      np.travel_destination_airport_id AS travelDestinationAirportId,
      np.travel_started_at_utc AS travelStartedAtUtc,
      np.travel_until_utc AS travelUntilUtc,
      np.created_at_utc AS createdAtUtc,
      np.updated_at_utc AS updatedAtUtc,
      sp.employment_model AS employmentModel,
      sp.qualification_group AS qualificationGroup,
      sp.status AS packageStatus,
      sp.starts_at_utc AS startsAtUtc,
      sp.ends_at_utc AS endsAtUtc
    FROM named_pilot AS np
    JOIN staffing_package AS sp ON sp.staffing_package_id = np.staffing_package_id
    WHERE np.company_id = $company_id`,
    { $company_id: companyId },
  );

  const usedNames = new Set(existingPilots.map((pilot) => pilot.displayName));
  const pilotsByPackageId = new Map<string, Set<number>>();

  for (const pilot of existingPilots) {
    const slots = pilotsByPackageId.get(pilot.staffingPackageId) ?? new Set<number>();
    slots.add(pilot.rosterSlotNumber);
    pilotsByPackageId.set(pilot.staffingPackageId, slots);
  }

  let createdPilotCount = 0;

  for (const staffingPackage of packages) {
    const existingSlots = pilotsByPackageId.get(staffingPackage.staffingPackageId) ?? new Set<number>();

    for (let rosterSlotNumber = 1; rosterSlotNumber <= staffingPackage.coverageUnits; rosterSlotNumber += 1) {
      if (existingSlots.has(rosterSlotNumber)) {
        continue;
      }

      const namedPilotId = createPrefixedId("pilot");
      const displayName = generatePilotName(staffingPackage.staffingPackageId, rosterSlotNumber, usedNames);
      saveDatabase.run(
        `INSERT INTO named_pilot (
          named_pilot_id,
          company_id,
          staffing_package_id,
          roster_slot_number,
          display_name,
          certifications_json,
          home_airport_id,
          current_airport_id,
          resting_until_utc,
          travel_origin_airport_id,
          travel_destination_airport_id,
          travel_started_at_utc,
          travel_until_utc,
          created_at_utc,
          updated_at_utc
        ) VALUES (
          $named_pilot_id,
          $company_id,
          $staffing_package_id,
          $roster_slot_number,
          $display_name,
          $certifications_json,
          $home_airport_id,
          $current_airport_id,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          $created_at_utc,
          $updated_at_utc
        )`,
        {
          $named_pilot_id: namedPilotId,
          $company_id: companyId,
          $staffing_package_id: staffingPackage.staffingPackageId,
          $roster_slot_number: rosterSlotNumber,
          $display_name: displayName,
          $certifications_json: pilotCertificationsToJson(
            certificationsForQualificationGroup(staffingPackage.qualificationGroup),
          ),
          $home_airport_id: homeBaseAirportId,
          $current_airport_id: homeBaseAirportId,
          $created_at_utc: currentTimeUtc,
          $updated_at_utc: currentTimeUtc,
        },
      );
      existingSlots.add(rosterSlotNumber);
      createdPilotCount += 1;
    }

    pilotsByPackageId.set(staffingPackage.staffingPackageId, existingSlots);
  }

  return {
    changed: createdPilotCount > 0,
    createdPilotCount,
  };
}

export function selectNamedPilotsForRequirements(
  saveDatabase: SqliteFileDatabase,
  companyId: string,
  scheduleId: string,
  requirements: ReadonlyArray<NamedPilotRequirement>,
  options: SelectNamedPilotsOptions,
): NamedPilotSelectionResult {
  const selectedAssignments: SelectedNamedPilotAssignment[] = [];
  const hardBlockers: string[] = [];
  const assessments: NamedPilotRequirementAssessment[] = [];
  const selectedPilotIds = new Set<string>();

  for (const requirement of requirements) {
    const requiredCertificationCode = requiredCertificationForQualificationGroup(requirement.qualificationGroup);
    const candidates = saveDatabase.all<CandidatePilotRow>(
      `SELECT
        np.named_pilot_id AS namedPilotId,
        np.display_name AS displayName,
        sp.qualification_group AS qualificationGroup,
        np.certifications_json AS certificationsJson,
        np.current_airport_id AS currentAirportId,
        np.resting_until_utc AS restingUntilUtc,
        np.training_until_utc AS trainingUntilUtc,
        np.travel_destination_airport_id AS travelDestinationAirportId,
        np.travel_started_at_utc AS travelStartedAtUtc,
        np.travel_until_utc AS travelUntilUtc
      FROM named_pilot AS np
      JOIN staffing_package AS sp ON sp.staffing_package_id = np.staffing_package_id
      WHERE np.company_id = $company_id
        AND sp.labor_category = 'pilot'
        AND sp.status IN ('pending', 'active')
        AND sp.starts_at_utc <= $assigned_from_utc
        AND (sp.ends_at_utc IS NULL OR sp.ends_at_utc >= $assigned_to_utc)
      ORDER BY np.display_name ASC, np.named_pilot_id ASC`,
      {
        $company_id: companyId,
        $assigned_from_utc: requirement.assignedFromUtc,
        $assigned_to_utc: requirement.assignedToUtc,
      },
    );

    if (candidates.length === 0) {
      hardBlockers.push(`No named pilots are available for ${describeRequirementLabel(requirement.qualificationGroup, requiredCertificationCode)}.`);
      assessments.push({
        qualificationGroup: requirement.qualificationGroup,
        ...(requiredCertificationCode ? { requiredCertificationCode } : {}),
        unitsRequired: requirement.unitsRequired,
        availableCandidateCount: 0,
        blockedByCertificationCount: 0,
        blockedByTrainingCount: 0,
        blockedByRestingCount: 0,
        blockedByTravelCount: 0,
        blockedByOverlapCount: 0,
        selectedTravelCount: 0,
        assignedFromUtc: requirement.assignedFromUtc,
        assignedToUtc: requirement.assignedToUtc,
      });
      continue;
    }

    const candidateStates = candidates.map((candidate) => ({
      candidate,
      certifications: parsePilotCertificationsJson(candidate.certificationsJson, candidate.qualificationGroup),
    }));
    const eligibleCandidates = candidateStates.filter((entry) =>
      pilotCertificationsSatisfyQualificationGroup(entry.certifications, requirement.qualificationGroup),
    );
    const blockedByCertificationCount = candidateStates.length - eligibleCandidates.length;

    if (eligibleCandidates.length === 0) {
      hardBlockers.push(`No named pilots are available for ${describeRequirementLabel(requirement.qualificationGroup, requiredCertificationCode)}.`);
      assessments.push({
        qualificationGroup: requirement.qualificationGroup,
        ...(requiredCertificationCode ? { requiredCertificationCode } : {}),
        unitsRequired: requirement.unitsRequired,
        availableCandidateCount: 0,
        blockedByCertificationCount,
        blockedByTrainingCount: 0,
        blockedByRestingCount: 0,
        blockedByTravelCount: 0,
        blockedByOverlapCount: 0,
        selectedTravelCount: 0,
        assignedFromUtc: requirement.assignedFromUtc,
        assignedToUtc: requirement.assignedToUtc,
      });
      continue;
    }

    const candidateIds = eligibleCandidates.map(({ candidate }) => candidate.namedPilotId);
    const overlapParams = candidateIds.reduce<Record<string, string>>((params, candidateId, index) => {
      params[`$named_pilot_id_${index}`] = candidateId;
      return params;
    }, {
      $schedule_id: scheduleId,
      $current_time_utc: options.currentTimeUtc,
    });
    const overlapRows = saveDatabase.all<{ namedPilotId: string }>(
      `SELECT DISTINCT named_pilot_id AS namedPilotId
      FROM named_pilot_assignment
      WHERE named_pilot_id IN (${candidateIds.map((_, index) => `$named_pilot_id_${index}`).join(", ")})
        AND schedule_id <> $schedule_id
        AND status IN ('reserved', 'flying')
        AND assigned_to_utc > $current_time_utc`,
      overlapParams,
    );
    const overlappingPilotIds = new Set(overlapRows.map((row) => row.namedPilotId));
    const blockedByTrainingCount = eligibleCandidates.filter(({ candidate }) =>
      Boolean(candidate.trainingUntilUtc) && compareUtc(candidate.trainingUntilUtc!, requirement.assignedFromUtc) > 0
    ).length;
    const blockedByRestingCount = eligibleCandidates.filter(({ candidate }) =>
      Boolean(candidate.restingUntilUtc) && compareUtc(candidate.restingUntilUtc!, requirement.assignedFromUtc) > 0
    ).length;
    const blockedByOverlapCount = eligibleCandidates.filter(({ candidate }) =>
      overlappingPilotIds.has(candidate.namedPilotId)
    ).length;
    let blockedByTravelCount = 0;
    const unsortedAvailableCandidates: AvailableCandidate[] = eligibleCandidates
      .flatMap(({ candidate }): AvailableCandidate[] => {
        if (selectedPilotIds.has(candidate.namedPilotId) || overlappingPilotIds.has(candidate.namedPilotId)) {
          return [];
        }

        if (candidate.trainingUntilUtc && compareUtc(candidate.trainingUntilUtc, requirement.assignedFromUtc) > 0) {
          return [];
        }

        if (candidate.restingUntilUtc && compareUtc(candidate.restingUntilUtc, requirement.assignedFromUtc) > 0) {
          return [];
        }

        const earliestMovementTime = maxUtc(
          options.currentTimeUtc,
          candidate.restingUntilUtc && compareUtc(candidate.restingUntilUtc, options.currentTimeUtc) > 0 ? candidate.restingUntilUtc : undefined,
          candidate.trainingUntilUtc && compareUtc(candidate.trainingUntilUtc, options.currentTimeUtc) > 0 ? candidate.trainingUntilUtc : undefined,
          candidate.travelUntilUtc && compareUtc(candidate.travelUntilUtc, options.currentTimeUtc) > 0 ? candidate.travelUntilUtc : undefined,
        ) ?? options.currentTimeUtc;

        const effectiveAirportId = candidate.travelUntilUtc
          && compareUtc(candidate.travelUntilUtc, earliestMovementTime) >= 0
          && compareUtc(candidate.travelUntilUtc, options.currentTimeUtc) > 0
          ? candidate.travelDestinationAirportId ?? candidate.currentAirportId
          : candidate.currentAirportId;

        if (!options.requiredOriginAirportId || effectiveAirportId === options.requiredOriginAirportId) {
          return [{
            candidate,
          }];
        }

        if (!effectiveAirportId || !options.airportReference) {
          blockedByTravelCount += 1;
          return [];
        }

        const travelUntilUtc = deriveNamedPilotTravelUntil(
          earliestMovementTime,
          effectiveAirportId,
          options.requiredOriginAirportId,
          options.airportReference,
        );
        if (!travelUntilUtc || compareUtc(travelUntilUtc, requirement.assignedFromUtc) > 0) {
          blockedByTravelCount += 1;
          return [];
        }

        return [{
          candidate,
          travelOriginAirportId: effectiveAirportId,
          travelDestinationAirportId: options.requiredOriginAirportId,
          travelStartedAtUtc: earliestMovementTime,
          travelUntilUtc,
        }];
      });
    const availableCandidates: AvailableCandidate[] = [...unsortedAvailableCandidates].sort((left, right) => {
        const leftNeedsTravel = left.travelUntilUtc ? 1 : 0;
        const rightNeedsTravel = right.travelUntilUtc ? 1 : 0;
        if (leftNeedsTravel !== rightNeedsTravel) {
          return leftNeedsTravel - rightNeedsTravel;
        }

        if (left.travelUntilUtc && right.travelUntilUtc) {
          const travelComparison = compareUtc(left.travelUntilUtc, right.travelUntilUtc);
          if (travelComparison !== 0) {
            return travelComparison;
          }
        }

        return left.candidate.displayName.localeCompare(right.candidate.displayName);
      });
    const selectedCandidates = availableCandidates.slice(0, requirement.unitsRequired);
    const selectedTravelCount = selectedCandidates.filter((candidate) => Boolean(candidate.travelUntilUtc)).length;

    assessments.push({
      qualificationGroup: requirement.qualificationGroup,
      ...(requiredCertificationCode ? { requiredCertificationCode } : {}),
      unitsRequired: requirement.unitsRequired,
      availableCandidateCount: availableCandidates.length,
      blockedByCertificationCount,
      blockedByTrainingCount,
      blockedByRestingCount,
      blockedByTravelCount,
      blockedByOverlapCount,
      selectedTravelCount,
      assignedFromUtc: requirement.assignedFromUtc,
      assignedToUtc: requirement.assignedToUtc,
    });

    if (availableCandidates.length < requirement.unitsRequired) {
      const blockedReason = blockedByCertificationCount > 0
        ? `${blockedByCertificationCount} lack ${describeRequirementLabel(requirement.qualificationGroup, requiredCertificationCode)}`
        : blockedByTrainingCount > 0
        ? `${blockedByTrainingCount} in training`
        : blockedByRestingCount > 0
          ? `${blockedByRestingCount} resting`
          : blockedByTravelCount > 0
            ? `${blockedByTravelCount} cannot reach the origin in time`
          : blockedByOverlapCount > 0
            ? `${blockedByOverlapCount} already committed elsewhere`
            : undefined;
      hardBlockers.push(
        `Not enough named pilots are available for ${describeRequirementLabel(requirement.qualificationGroup, requiredCertificationCode)}; `
        + `need ${requirement.unitsRequired}, found ${availableCandidates.length}`
        + (blockedReason ? ` (${blockedReason}).` : "."),
      );
      continue;
    }

    for (const candidate of selectedCandidates) {
      selectedPilotIds.add(candidate.candidate.namedPilotId);
      selectedAssignments.push({
        namedPilotId: candidate.candidate.namedPilotId,
        qualificationGroup: requirement.qualificationGroup,
        assignedFromUtc: requirement.assignedFromUtc,
        assignedToUtc: requirement.assignedToUtc,
        ...(candidate.travelOriginAirportId ? { travelOriginAirportId: candidate.travelOriginAirportId } : {}),
        ...(candidate.travelDestinationAirportId ? { travelDestinationAirportId: candidate.travelDestinationAirportId } : {}),
        ...(candidate.travelStartedAtUtc ? { travelStartedAtUtc: candidate.travelStartedAtUtc } : {}),
        ...(candidate.travelUntilUtc ? { travelUntilUtc: candidate.travelUntilUtc } : {}),
      });
    }
  }

  return {
    hardBlockers,
    selectedAssignments,
    assessments,
  };
}

export function loadNamedPilotRoster(
  saveDatabase: SqliteFileDatabase,
  companyId: string,
  currentTimeUtc: string,
): NamedPilotRosterView[] {
  const pilots = saveDatabase.all<NamedPilotRow>(
    `SELECT
      np.named_pilot_id AS namedPilotId,
      np.staffing_package_id AS staffingPackageId,
      sp.source_offer_id AS sourceOfferId,
      np.roster_slot_number AS rosterSlotNumber,
      np.display_name AS displayName,
      np.certifications_json AS certificationsJson,
      np.home_airport_id AS homeAirportId,
      np.current_airport_id AS currentAirportId,
      np.resting_until_utc AS restingUntilUtc,
      np.training_program_kind AS trainingProgramKind,
      np.training_target_certification_code AS trainingTargetCertificationCode,
      np.training_started_at_utc AS trainingStartedAtUtc,
      np.training_until_utc AS trainingUntilUtc,
      np.travel_origin_airport_id AS travelOriginAirportId,
      np.travel_destination_airport_id AS travelDestinationAirportId,
      np.travel_started_at_utc AS travelStartedAtUtc,
      np.travel_until_utc AS travelUntilUtc,
      np.created_at_utc AS createdAtUtc,
      np.updated_at_utc AS updatedAtUtc,
      sp.employment_model AS employmentModel,
      sp.qualification_group AS qualificationGroup,
      sp.status AS packageStatus,
      sp.starts_at_utc AS startsAtUtc,
      sp.ends_at_utc AS endsAtUtc
    FROM named_pilot AS np
    JOIN staffing_package AS sp ON sp.staffing_package_id = np.staffing_package_id
    WHERE np.company_id = $company_id
    ORDER BY sp.qualification_group ASC, np.display_name ASC, np.named_pilot_id ASC`,
    { $company_id: companyId },
  );

  if (pilots.length === 0) {
    return [];
  }

  const pilotIds = pilots.map((pilot) => pilot.namedPilotId);
  const assignmentParams = pilotIds.reduce<Record<string, string>>((params, pilotId, index) => {
    params[`$named_pilot_id_${index}`] = pilotId;
    return params;
  }, {});
  const assignments = saveDatabase.all<NamedPilotAssignmentRow>(
    `SELECT
      named_pilot_assignment_id AS namedPilotAssignmentId,
      named_pilot_id AS namedPilotId,
      aircraft_id AS aircraftId,
      schedule_id AS scheduleId,
      qualification_group AS qualificationGroup,
      assigned_from_utc AS assignedFromUtc,
      assigned_to_utc AS assignedToUtc,
      status AS status,
      created_at_utc AS createdAtUtc,
      updated_at_utc AS updatedAtUtc
    FROM named_pilot_assignment
    WHERE named_pilot_id IN (${pilotIds.map((_, index) => `$named_pilot_id_${index}`).join(", ")})
    ORDER BY assigned_from_utc ASC, named_pilot_assignment_id ASC`,
    assignmentParams,
  );

  const assignmentsByPilotId = new Map<string, NamedPilotAssignmentRow[]>();
  for (const assignment of assignments) {
    const pilotAssignments = assignmentsByPilotId.get(assignment.namedPilotId) ?? [];
    pilotAssignments.push(assignment);
    assignmentsByPilotId.set(assignment.namedPilotId, pilotAssignments);
  }

  return pilots.map((pilot) => {
    const certifications = parsePilotCertificationsJson(pilot.certificationsJson, pilot.qualificationGroup);
    const pilotAssignments = assignmentsByPilotId.get(pilot.namedPilotId) ?? [];
    const relevantAssignment = pickRelevantAssignment(pilotAssignments, currentTimeUtc);
    const isResting = Boolean(pilot.restingUntilUtc) && compareUtc(currentTimeUtc, pilot.restingUntilUtc!) < 0;
    const isTraining = Boolean(pilot.trainingUntilUtc) && compareUtc(currentTimeUtc, pilot.trainingUntilUtc!) < 0;
    const isTraveling = Boolean(pilot.travelUntilUtc)
      && compareUtc(currentTimeUtc, pilot.travelUntilUtc!) < 0
      && (!pilot.travelStartedAtUtc || compareUtc(pilot.travelStartedAtUtc, currentTimeUtc) <= 0);
    const availabilityState: NamedPilotAvailabilityState = relevantAssignment?.status === "flying"
      ? "flying"
      : isTraining
        ? "training"
      : isResting
        ? "resting"
        : isTraveling
          ? "traveling"
        : relevantAssignment?.status === "reserved"
          ? "reserved"
          : "ready";

    return {
      namedPilotId: pilot.namedPilotId,
      staffingPackageId: pilot.staffingPackageId,
      sourceOfferId: pilot.sourceOfferId ?? undefined,
      rosterSlotNumber: pilot.rosterSlotNumber,
      displayName: pilot.displayName,
      qualificationGroup: pilot.qualificationGroup,
      certifications,
      employmentModel: pilot.employmentModel,
      packageStatus: pilot.packageStatus,
      startsAtUtc: pilot.startsAtUtc,
      endsAtUtc: pilot.endsAtUtc ?? undefined,
      homeAirportId: pilot.homeAirportId ?? undefined,
      currentAirportId: pilot.currentAirportId ?? undefined,
      restingUntilUtc: pilot.restingUntilUtc ?? undefined,
      trainingProgramKind: pilot.trainingProgramKind ?? undefined,
      trainingTargetCertificationCode: pilot.trainingTargetCertificationCode ?? undefined,
      trainingStartedAtUtc: pilot.trainingStartedAtUtc ?? undefined,
      trainingUntilUtc: pilot.trainingUntilUtc ?? undefined,
      travelOriginAirportId: pilot.travelOriginAirportId ?? undefined,
      travelDestinationAirportId: pilot.travelDestinationAirportId ?? undefined,
      travelStartedAtUtc: pilot.travelStartedAtUtc ?? undefined,
      travelUntilUtc: pilot.travelUntilUtc ?? undefined,
      availabilityState,
      assignedScheduleId: relevantAssignment?.scheduleId,
      assignedAircraftId: relevantAssignment?.aircraftId,
      assignmentFromUtc: relevantAssignment?.assignedFromUtc,
      assignmentToUtc: relevantAssignment?.assignedToUtc,
    } satisfies NamedPilotRosterView;
  });
}

export function deriveNamedPilotRestUntil(arrivalUtc: string): string {
  return addHoursIso(arrivalUtc, NAMED_PILOT_REST_HOURS);
}

export function deriveNamedPilotTrainingUntil(
  startedAtUtc: string,
  trainingProgramKind: NamedPilotTrainingProgramKind = "recurrent",
): string {
  return addHoursIso(
    startedAtUtc,
    trainingProgramKind === "certification"
      ? NAMED_PILOT_CERTIFICATION_TRAINING_HOURS
      : NAMED_PILOT_RECURRENT_TRAINING_HOURS,
  );
}

export function deriveNamedPilotTravelUntil(
  startedAtUtc: string,
  originAirportId: string,
  destinationAirportId: string,
  airportReference: AirportReferenceRepository,
): string | undefined {
  if (originAirportId === destinationAirportId) {
    return startedAtUtc;
  }

  const originAirport = airportReference.findAirport(originAirportId);
  const destinationAirport = airportReference.findAirport(destinationAirportId);
  if (!originAirport || !destinationAirport) {
    return undefined;
  }

  const distanceNm = haversineDistanceNm(originAirport, destinationAirport);
  const travelMinutes = Math.ceil((distanceNm / NAMED_PILOT_TRAVEL_SPEED_KTAS) * 60 + NAMED_PILOT_TRAVEL_BUFFER_MINUTES);
  return addMinutesIso(startedAtUtc, Math.max(travelMinutes, NAMED_PILOT_TRAVEL_BUFFER_MINUTES));
}
