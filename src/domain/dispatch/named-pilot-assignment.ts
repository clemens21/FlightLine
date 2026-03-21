/*
 * Shared named-pilot assignment logic for Dispatch.
 * This stays browser-safe so the Dispatch UI and commit path can use the same recommendation and override rules.
 */

import type { NamedPilotAvailabilityState, PilotCertificationCode } from "../staffing/types.js";
import {
  pilotCertificationsSatisfyQualificationGroup,
  requiredCertificationForQualificationGroup,
} from "../staffing/pilot-certifications.js";
import type { AirportReferenceRepository } from "../../infrastructure/reference/airport-reference.js";

export interface DispatchPilotAssignmentPilotInput {
  namedPilotId: string;
  displayName: string;
  certifications: PilotCertificationCode[];
  availabilityState: NamedPilotAvailabilityState;
  packageStatus: "pending" | "active" | "expired" | "cancelled";
  currentAirportId: string | undefined;
  restingUntilUtc: string | undefined;
  trainingUntilUtc: string | undefined;
  travelDestinationAirportId: string | undefined;
  travelStartedAtUtc: string | undefined;
  travelUntilUtc: string | undefined;
  assignedScheduleId: string | undefined;
  assignmentToUtc: string | undefined;
}

export interface DispatchPilotAssignmentRequirement {
  qualificationGroup: string;
  pilotsRequired: number;
  assignedFromUtc: string;
  assignedToUtc: string;
  currentTimeUtc: string;
  currentScheduleId?: string;
  requiredOriginAirportId?: string;
}

export interface DispatchSelectedNamedPilotAssignment {
  namedPilotId: string;
  qualificationGroup: string;
  assignedFromUtc: string;
  assignedToUtc: string;
  travelOriginAirportId?: string;
  travelDestinationAirportId?: string;
  travelStartedAtUtc?: string;
  travelUntilUtc?: string;
}

export interface DispatchPilotAssignmentCandidateOption {
  namedPilotId: string;
  displayName: string;
  certifications: PilotCertificationCode[];
  availabilityState: NamedPilotAvailabilityState;
  selectable: boolean;
  recommended: boolean;
  reason?: string;
  currentAirportId?: string;
  travelOriginAirportId?: string;
  travelDestinationAirportId?: string;
  travelStartedAtUtc?: string;
  travelUntilUtc?: string;
}

export interface DispatchPilotAssignmentResolution {
  requiredCertificationCode?: string;
  recommendedPilotIds: string[];
  selectedAssignments: DispatchSelectedNamedPilotAssignment[];
  hardBlockers: string[];
  candidateOptions: DispatchPilotAssignmentCandidateOption[];
}

interface EvaluatedCandidate {
  pilot: DispatchPilotAssignmentPilotInput;
  selectable: boolean;
  reason?: string;
  currentAirportId?: string;
  travelOriginAirportId?: string;
  travelDestinationAirportId?: string;
  travelStartedAtUtc?: string;
  travelUntilUtc?: string;
}

export function resolveDispatchPilotAssignment(
  pilots: ReadonlyArray<DispatchPilotAssignmentPilotInput>,
  requirement: DispatchPilotAssignmentRequirement,
  airportReference: AirportReferenceRepository,
  selectedPilotIds?: ReadonlyArray<string>,
): DispatchPilotAssignmentResolution {
  const requiredCertificationCode = requiredCertificationForQualificationGroup(requirement.qualificationGroup);
  const activePilots = pilots.filter((pilot) => pilot.packageStatus === "active");
  const evaluatedCandidates = activePilots
    .map((pilot) => evaluateCandidate(pilot, requirement, airportReference))
    .sort(compareEvaluatedCandidates);
  const selectableCandidates = evaluatedCandidates.filter((candidate) => candidate.selectable);
  const recommendedPilotIds = selectableCandidates
    .slice(0, requirement.pilotsRequired)
    .map((candidate) => candidate.pilot.namedPilotId);
  const requestedPilotIds = selectedPilotIds && selectedPilotIds.length > 0
    ? [...new Set(selectedPilotIds)]
    : recommendedPilotIds;
  const hardBlockers: string[] = [];

  if (requestedPilotIds.length > 0 && requestedPilotIds.length !== requirement.pilotsRequired) {
    hardBlockers.push(
      `Dispatch needs ${requirement.pilotsRequired} named pilot${requirement.pilotsRequired === 1 ? "" : "s"} for `
      + `${describeRequirementLabel(requirement.qualificationGroup, requiredCertificationCode)}; `
      + `selected ${requestedPilotIds.length}.`,
    );
  }

  const selectedAssignments: DispatchSelectedNamedPilotAssignment[] = [];
  for (const pilotId of requestedPilotIds) {
    const selectedCandidate = evaluatedCandidates.find((candidate) => candidate.pilot.namedPilotId === pilotId);
    if (!selectedCandidate) {
      hardBlockers.push(`Selected pilot ${pilotId} is not in the active pilot roster for this dispatch.`);
      continue;
    }

    if (!pilotCertificationsSatisfyQualificationGroup(selectedCandidate.pilot.certifications, requirement.qualificationGroup)) {
      hardBlockers.push(
        `${selectedCandidate.pilot.displayName} does not hold ${describeRequirementLabel(requirement.qualificationGroup, requiredCertificationCode)}.`,
      );
      continue;
    }

    if (!selectedCandidate.selectable) {
      hardBlockers.push(
        `${selectedCandidate.pilot.displayName} cannot cover this draft${selectedCandidate.reason ? `: ${selectedCandidate.reason}.` : "."}`,
      );
      continue;
    }

    selectedAssignments.push({
      namedPilotId: selectedCandidate.pilot.namedPilotId,
      qualificationGroup: requirement.qualificationGroup,
      assignedFromUtc: requirement.assignedFromUtc,
      assignedToUtc: requirement.assignedToUtc,
      ...(selectedCandidate.travelOriginAirportId ? { travelOriginAirportId: selectedCandidate.travelOriginAirportId } : {}),
      ...(selectedCandidate.travelDestinationAirportId ? { travelDestinationAirportId: selectedCandidate.travelDestinationAirportId } : {}),
      ...(selectedCandidate.travelStartedAtUtc ? { travelStartedAtUtc: selectedCandidate.travelStartedAtUtc } : {}),
      ...(selectedCandidate.travelUntilUtc ? { travelUntilUtc: selectedCandidate.travelUntilUtc } : {}),
    });
  }

  if (selectedAssignments.length === 0 && selectableCandidates.length < requirement.pilotsRequired) {
    hardBlockers.push(
      `Not enough named pilots are available for ${describeRequirementLabel(requirement.qualificationGroup, requiredCertificationCode)}; `
      + `need ${requirement.pilotsRequired}, found ${selectableCandidates.length}.`,
    );
  }

  const candidateOptions = evaluatedCandidates.map<DispatchPilotAssignmentCandidateOption>((candidate) => ({
    namedPilotId: candidate.pilot.namedPilotId,
    displayName: candidate.pilot.displayName,
    certifications: candidate.pilot.certifications,
    availabilityState: candidate.pilot.availabilityState,
    selectable: candidate.selectable,
    recommended: recommendedPilotIds.includes(candidate.pilot.namedPilotId),
    ...(candidate.reason ? { reason: candidate.reason } : {}),
    ...(candidate.currentAirportId ? { currentAirportId: candidate.currentAirportId } : {}),
    ...(candidate.travelOriginAirportId ? { travelOriginAirportId: candidate.travelOriginAirportId } : {}),
    ...(candidate.travelDestinationAirportId ? { travelDestinationAirportId: candidate.travelDestinationAirportId } : {}),
    ...(candidate.travelStartedAtUtc ? { travelStartedAtUtc: candidate.travelStartedAtUtc } : {}),
    ...(candidate.travelUntilUtc ? { travelUntilUtc: candidate.travelUntilUtc } : {}),
  }));

  return {
    ...(requiredCertificationCode ? { requiredCertificationCode } : {}),
    recommendedPilotIds,
    selectedAssignments: hardBlockers.length > 0 ? [] : selectedAssignments.slice(0, requirement.pilotsRequired),
    hardBlockers,
    candidateOptions,
  };
}

function evaluateCandidate(
  pilot: DispatchPilotAssignmentPilotInput,
  requirement: DispatchPilotAssignmentRequirement,
  airportReference: AirportReferenceRepository,
): EvaluatedCandidate {
  if (!pilotCertificationsSatisfyQualificationGroup(pilot.certifications, requirement.qualificationGroup)) {
    return {
      pilot,
      selectable: false,
      reason: "Missing the required certification",
      ...(pilot.currentAirportId ? { currentAirportId: pilot.currentAirportId } : {}),
    };
  }

  if (pilot.assignedScheduleId
    && pilot.assignedScheduleId !== requirement.currentScheduleId
    && pilot.assignmentToUtc
    && compareUtc(pilot.assignmentToUtc, requirement.assignedFromUtc) > 0) {
    return {
      pilot,
      selectable: false,
      reason: `Committed elsewhere until ${formatShortUtc(pilot.assignmentToUtc)}`,
      ...(pilot.currentAirportId ? { currentAirportId: pilot.currentAirportId } : {}),
    };
  }

  if (pilot.trainingUntilUtc && compareUtc(pilot.trainingUntilUtc, requirement.assignedFromUtc) > 0) {
    return {
      pilot,
      selectable: false,
      reason: `Training until ${formatShortUtc(pilot.trainingUntilUtc)}`,
      ...(pilot.currentAirportId ? { currentAirportId: pilot.currentAirportId } : {}),
    };
  }

  if (pilot.restingUntilUtc && compareUtc(pilot.restingUntilUtc, requirement.assignedFromUtc) > 0) {
    return {
      pilot,
      selectable: false,
      reason: `Resting until ${formatShortUtc(pilot.restingUntilUtc)}`,
      ...(pilot.currentAirportId ? { currentAirportId: pilot.currentAirportId } : {}),
    };
  }

  const earliestMovementTime = maxUtc(
    requirement.currentTimeUtc,
    pilot.restingUntilUtc && compareUtc(pilot.restingUntilUtc, requirement.currentTimeUtc) > 0 ? pilot.restingUntilUtc : undefined,
    pilot.trainingUntilUtc && compareUtc(pilot.trainingUntilUtc, requirement.currentTimeUtc) > 0 ? pilot.trainingUntilUtc : undefined,
    pilot.travelUntilUtc && compareUtc(pilot.travelUntilUtc, requirement.currentTimeUtc) > 0 ? pilot.travelUntilUtc : undefined,
  ) ?? requirement.currentTimeUtc;

  const effectiveAirportId = pilot.travelUntilUtc
    && compareUtc(pilot.travelUntilUtc, earliestMovementTime) >= 0
    && compareUtc(pilot.travelUntilUtc, requirement.currentTimeUtc) > 0
    ? pilot.travelDestinationAirportId ?? pilot.currentAirportId
    : pilot.currentAirportId;
  const activeTransferArrivalUtc = pilot.travelUntilUtc
    && compareUtc(pilot.travelUntilUtc, requirement.currentTimeUtc) > 0
    ? pilot.travelUntilUtc
    : undefined;

  if (!requirement.requiredOriginAirportId || effectiveAirportId === requirement.requiredOriginAirportId) {
    if (activeTransferArrivalUtc && compareUtc(activeTransferArrivalUtc, requirement.assignedFromUtc) > 0) {
      return {
        pilot,
        selectable: false,
        reason: `Traveling until ${formatShortUtc(activeTransferArrivalUtc)}`,
        ...(effectiveAirportId ? { currentAirportId: effectiveAirportId } : {}),
      };
    }

    return {
      pilot,
      selectable: true,
      ...(effectiveAirportId ? { currentAirportId: effectiveAirportId } : {}),
    };
  }

  if (!effectiveAirportId) {
    return {
      pilot,
      selectable: false,
      reason: "Current position is unavailable",
    };
  }

  const travelUntilUtc = deriveDispatchPilotTravelUntil(
    earliestMovementTime,
    effectiveAirportId,
    requirement.requiredOriginAirportId,
    airportReference,
  );

  if (!travelUntilUtc || compareUtc(travelUntilUtc, requirement.assignedFromUtc) > 0) {
    return {
      pilot,
      selectable: false,
      reason: `Cannot reach ${requirement.requiredOriginAirportId} in time`,
      currentAirportId: effectiveAirportId,
    };
  }

  return {
    pilot,
    selectable: true,
    currentAirportId: effectiveAirportId,
    travelOriginAirportId: effectiveAirportId,
    travelDestinationAirportId: requirement.requiredOriginAirportId,
    travelStartedAtUtc: earliestMovementTime,
    travelUntilUtc,
  };
}

function compareEvaluatedCandidates(left: EvaluatedCandidate, right: EvaluatedCandidate): number {
  if (left.selectable !== right.selectable) {
    return left.selectable ? -1 : 1;
  }

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

  if (left.reason && right.reason) {
    const reasonComparison = left.reason.localeCompare(right.reason);
    if (reasonComparison !== 0) {
      return reasonComparison;
    }
  }

  return left.pilot.displayName.localeCompare(right.pilot.displayName);
}

function deriveDispatchPilotTravelUntil(
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

  const distanceNm = haversineDistanceNm(
    originAirport.latitudeDeg,
    originAirport.longitudeDeg,
    destinationAirport.latitudeDeg,
    destinationAirport.longitudeDeg,
  );
  const travelMinutes = Math.ceil((distanceNm / 280) * 60 + 60);
  return addMinutesIso(startedAtUtc, Math.max(travelMinutes, 60));
}

function haversineDistanceNm(
  originLatitudeDeg: number,
  originLongitudeDeg: number,
  destinationLatitudeDeg: number,
  destinationLongitudeDeg: number,
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusNm = 3440.065;
  const deltaLatitude = toRadians(destinationLatitudeDeg - originLatitudeDeg);
  const deltaLongitude = toRadians(destinationLongitudeDeg - originLongitudeDeg);
  const originLatitude = toRadians(originLatitudeDeg);
  const destinationLatitude = toRadians(destinationLatitudeDeg);

  const a =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2)
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

function describeRequirementLabel(qualificationGroup: string, requiredCertificationCode?: string): string {
  return requiredCertificationCode ?? qualificationGroup.replaceAll("_", " ");
}

function compareUtc(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

function maxUtc(...values: Array<string | undefined>): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .sort(compareUtc)
    .at(-1);
}

function addMinutesIso(utcIsoString: string, minutes: number): string {
  return new Date(new Date(utcIsoString).getTime() + minutes * 60_000).toISOString();
}

function formatShortUtc(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
