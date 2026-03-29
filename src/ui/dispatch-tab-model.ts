/*
 * Shapes the dispatch workspace payload for the save shell.
 * The server resolves canonical state once, then the browser controller only manages aircraft and leg selection.
 */

import type { JsonObject } from "../domain/common/primitives.js";
import type { ValidationMessage } from "../domain/dispatch/types.js";
import {
  pilotCertificationsSatisfyQualificationGroup,
  requiredCertificationForQualificationGroup,
} from "../domain/staffing/pilot-certifications.js";
import type { CompanyContractView, CompanyContractsView } from "../application/queries/company-contracts.js";
import type { CompanyContext } from "../application/queries/company-state.js";
import type { FleetAircraftView, FleetStateView } from "../application/queries/fleet-state.js";
import type { AircraftScheduleView, ScheduleLegView } from "../application/queries/schedule-state.js";
import type { StaffingStateView } from "../application/queries/staffing-state.js";
import { resolveDispatchPilotAssignment } from "../domain/dispatch/named-pilot-assignment.js";
import type { AirportReferenceRepository } from "../infrastructure/reference/airport-reference.js";
import type { ScheduleValidationSnapshot } from "../application/dispatch/schedule-validation.js";
import type { RoutePlanItemState, RoutePlanState } from "./route-plan-state.js";

export interface DispatchAirportView {
  airportId: string;
  code: string;
  primaryLabel: string;
  secondaryLabel?: string;
}

export interface DispatchValidationMessageView {
  severity: "blocker" | "warning" | "info";
  code: string;
  summary: string;
  affectedLegSequenceNumber?: number;
  suggestedRecoveryAction?: string;
}

export interface DispatchValidationSnapshotView {
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
  validationMessages: DispatchValidationMessageView[];
}

export interface DispatchLegView {
  flightLegId: string;
  sequenceNumber: number;
  legType: string;
  originAirport: DispatchAirportView;
  destinationAirport: DispatchAirportView;
  plannedDepartureUtc: string;
  plannedArrivalUtc: string;
  linkedCompanyContractId?: string;
  linkedCompanyContractIds?: string[];
  assignedQualificationGroup?: string;
  requiredPilotCertificationCode?: string;
  payloadLabel: string;
  durationMinutes: number;
  contractState?: string;
  contractPayoutAmount?: number;
  contractDeadlineUtc?: string;
  contractEarliestStartUtc?: string;
  validationMessages: DispatchValidationMessageView[];
}

export interface DispatchScheduleView {
  scheduleId: string;
  scheduleKind: "operational" | "maintenance_only";
  scheduleState: string;
  isDraft: boolean;
  plannedStartUtc: string;
  plannedEndUtc: string;
  validation?: DispatchValidationSnapshotView;
  legs: DispatchLegView[];
  laborAllocationCount: number;
  draftPilotAssignment?: DispatchDraftPilotAssignmentView;
}

export interface DispatchDraftPilotOptionView {
  namedPilotId: string;
  displayName: string;
  certifications: string[];
  availabilityState: StaffingStateView["namedPilots"][number]["availabilityState"];
  selectable: boolean;
  recommended: boolean;
  reason?: string;
  currentAirport?: DispatchAirportView;
  travelOriginAirport?: DispatchAirportView;
  travelDestinationAirport?: DispatchAirportView;
  travelStartedAtUtc?: string;
  travelUntilUtc?: string;
}

export interface DispatchDraftPilotAssignmentView {
  qualificationGroup: string;
  requiredCertificationCode?: string;
  pilotsRequired: number;
  recommendedPilotIds: string[];
  hardBlockers: string[];
  candidateOptions: DispatchDraftPilotOptionView[];
}

export interface DispatchAssignedPilotView {
  namedPilotId: string;
  displayName: string;
  certifications: string[];
  availabilityState: StaffingStateView["namedPilots"][number]["availabilityState"];
  packageStatus: StaffingStateView["namedPilots"][number]["packageStatus"];
  startsAtUtc: string;
  assignmentFromUtc?: string;
  assignmentToUtc?: string;
  restingUntilUtc?: string;
  trainingUntilUtc?: string;
  travelDestinationAirport?: DispatchAirportView;
  travelStartedAtUtc?: string;
  travelUntilUtc?: string;
  currentAirport?: DispatchAirportView;
}

export interface DispatchPilotReadinessView {
  qualificationGroup: string;
  requiredCertificationCode?: string;
  pilotsRequired: number;
  readyNowCount: number;
  reservedNowCount: number;
  flyingNowCount: number;
  restingNowCount: number;
  trainingNowCount: number;
  travelingNowCount: number;
  pendingStartCount: number;
  assignedPilotCount: number;
  noReadyReserveRemaining: boolean;
}

export interface DispatchAircraftView {
  aircraftId: string;
  registration: string;
  modelDisplayName: string;
  currentAirport: DispatchAirportView;
  operationalState: string;
  dispatchAvailable: boolean;
  ownershipType: string;
  conditionBand: string;
  conditionValue: number;
  maintenanceState: string;
  hoursToService: number;
  pilotQualificationGroup: string;
  requiredPilotCertificationCode?: string;
  pilotsRequired: number;
  pilotCoverageUnits: number;
  pendingPilotCoverageUnits: number;
  pilotReadiness: DispatchPilotReadinessView;
  assignedPilots: DispatchAssignedPilotView[];
  schedule?: DispatchScheduleView;
}

export interface DispatchAcceptedContractView {
  companyContractId: string;
  originAirport: DispatchAirportView;
  destinationAirport: DispatchAirportView;
  volumeType: "passenger" | "cargo";
  passengerCount?: number;
  cargoWeightLb?: number;
  acceptedPayoutAmount: number;
  earliestStartUtc?: string;
  deadlineUtc: string;
  contractState: string;
  assignedAircraftId?: string;
}

export interface DispatchRoutePlanItemView {
  routePlanItemId: string;
  sequenceNumber: number;
  sourceType: string;
  plannerItemStatus: string;
  originAirport: DispatchAirportView;
  destinationAirport: DispatchAirportView;
  volumeType: "passenger" | "cargo";
  passengerCount?: number;
  cargoWeightLb?: number;
  payoutAmount: number;
  earliestStartUtc?: string;
  deadlineUtc: string;
  linkedAircraftId?: string;
  linkedScheduleId?: string;
}

export interface DispatchTimeUtilityView {
  currentTimeUtc: string;
  draftScheduleCount: number;
  committedScheduleCount: number;
}

export interface DispatchWorkInputsView {
  routePlanItems: DispatchRoutePlanItemView[];
  acceptedContracts: DispatchAcceptedContractView[];
  acceptedReadyCount: number;
  blockerCount: number;
  scheduledCount: number;
  endpointAirport?: DispatchAirportView;
}

export interface DispatchTabPayload {
  saveId: string;
  aircraft: DispatchAircraftView[];
  workInputs: DispatchWorkInputsView;
  timeUtility: DispatchTimeUtilityView;
  defaultSelectedAircraftId?: string;
}

export interface DispatchWorkspaceViewState {
  selectedAircraftId?: string;
  selectedAircraft?: DispatchAircraftView;
  selectedLegId?: string;
  selectedLeg?: DispatchLegView;
}

interface BuildDispatchTabPayloadArgs {
  saveId: string;
  companyContext: CompanyContext;
  companyContracts: CompanyContractsView | null;
  fleetState: FleetStateView | null;
  staffingState: StaffingStateView | null;
  schedules: AircraftScheduleView[];
  routePlan: RoutePlanState | null;
  airportReference: AirportReferenceRepository;
}

export function buildDispatchTabPayload({
  saveId,
  companyContext,
  companyContracts,
  fleetState,
  staffingState,
  schedules,
  routePlan,
  airportReference,
}: BuildDispatchTabPayloadArgs): DispatchTabPayload {
  const visibleRoutePlan = buildVisibleRoutePlanState(routePlan);
  const contracts = companyContracts?.contracts ?? [];
  const fleet = fleetState?.aircraft ?? [];
  const activeSchedules = schedules.filter((schedule) => schedule.scheduleState !== "completed" && schedule.scheduleState !== "cancelled");
  const contractsById = new Map(contracts.map((contract) => [contract.companyContractId, contract]));
  const allNamedPilots = staffingState?.namedPilots ?? [];
  const pilotCoverageUnits = (staffingState?.coverageSummaries ?? [])
    .filter((summary) => summary.laborCategory === "pilot")
    .reduce((sum, summary) => sum + summary.activeCoverageUnits, 0);
  const pendingPilotCoverageUnits = (staffingState?.coverageSummaries ?? [])
    .filter((summary) => summary.laborCategory === "pilot")
    .reduce((sum, summary) => sum + summary.pendingCoverageUnits, 0);
  const schedulesByAircraftId = new Map<string, AircraftScheduleView[]>();

  for (const schedule of activeSchedules) {
    const aircraftSchedules = schedulesByAircraftId.get(schedule.aircraftId) ?? [];
    aircraftSchedules.push(schedule);
    schedulesByAircraftId.set(schedule.aircraftId, aircraftSchedules);
  }

  const aircraft = fleet.map((entry) =>
    buildDispatchAircraftView(
      entry,
      choosePrimarySchedule(schedulesByAircraftId.get(entry.aircraftId) ?? [], companyContext.currentTimeUtc),
      contractsById,
      pilotCoverageUnits,
      pendingPilotCoverageUnits,
      allNamedPilots,
      companyContext.currentTimeUtc,
      airportReference,
    ),
  );

  const routePlanItems = (visibleRoutePlan?.items ?? []).map((item) => buildRoutePlanItemView(item, airportReference));
  const acceptedContracts = contracts
    .filter((contract) => contract.contractState === "accepted" || contract.contractState === "assigned")
    .map((contract) => buildAcceptedContractView(contract, airportReference));
  const defaultSelectedAircraftId = resolveDefaultSelectedAircraftId(aircraft);

  return {
    saveId,
    aircraft,
    workInputs: {
      routePlanItems,
      acceptedContracts,
      acceptedReadyCount: routePlanItems.filter((item) => item.plannerItemStatus === "accepted_ready").length,
      blockerCount: routePlanItems.filter((item) => item.plannerItemStatus === "candidate_available" || item.plannerItemStatus === "candidate_stale").length,
      scheduledCount: routePlanItems.filter((item) => item.plannerItemStatus === "scheduled").length,
      ...(visibleRoutePlan?.endpointAirportId ? { endpointAirport: describeAirport(visibleRoutePlan.endpointAirportId, airportReference) } : {}),
    },
    timeUtility: {
      currentTimeUtc: companyContext.currentTimeUtc,
      draftScheduleCount: activeSchedules.filter((schedule) => schedule.isDraft).length,
      committedScheduleCount: activeSchedules.filter((schedule) => !schedule.isDraft).length,
    },
    ...(defaultSelectedAircraftId ? { defaultSelectedAircraftId } : {}),
  };
}

function buildVisibleRoutePlanState(routePlan: RoutePlanState | null): RoutePlanState | null {
  if (!routePlan) {
    return null;
  }

  const visibleItems = routePlan.items.filter((item) => item.plannerItemStatus !== "closed");
  if (visibleItems.length === 0) {
    return null;
  }

  return {
    ...routePlan,
    items: visibleItems,
  };
}

export function applyDispatchWorkspaceViewState(
  payload: DispatchTabPayload,
  state: {
    selectedAircraftId?: string;
    selectedLegId?: string;
  },
): DispatchWorkspaceViewState {
  const selectedAircraft = payload.aircraft.find((entry) => entry.aircraftId === state.selectedAircraftId)
    ?? (payload.defaultSelectedAircraftId ? payload.aircraft.find((entry) => entry.aircraftId === payload.defaultSelectedAircraftId) : undefined)
    ?? payload.aircraft[0];
  const selectedLeg = selectedAircraft?.schedule?.legs.find((entry) => entry.flightLegId === state.selectedLegId)
    ?? selectedAircraft?.schedule?.legs[0];

  return {
    ...(selectedAircraft?.aircraftId ? { selectedAircraftId: selectedAircraft.aircraftId } : {}),
    ...(selectedAircraft ? { selectedAircraft } : {}),
    ...(selectedLeg?.flightLegId ? { selectedLegId: selectedLeg.flightLegId } : {}),
    ...(selectedLeg ? { selectedLeg } : {}),
  };
}

function buildDispatchAircraftView(
  aircraft: FleetAircraftView,
  schedule: AircraftScheduleView | undefined,
  contractsById: Map<string, CompanyContractView>,
  pilotCoverageUnits: number,
  pendingPilotCoverageUnits: number,
  namedPilots: StaffingStateView["namedPilots"],
  currentTimeUtc: string,
  airportReference: AirportReferenceRepository,
): DispatchAircraftView {
  const validation = parseValidationSnapshot(schedule?.validationSnapshot);
  const validationMessagesBySequence = buildValidationMessagesBySequence(validation?.validationMessages ?? []);
  const requiredPilotCertificationCode = requiredCertificationForQualificationGroup(aircraft.pilotQualificationGroup);
  const qualifiedNamedPilots = namedPilots.filter((pilot) =>
    pilotCertificationsSatisfyQualificationGroup(pilot.certifications, aircraft.pilotQualificationGroup),
  );
  const activeNamedPilots = qualifiedNamedPilots.filter((pilot) => pilot.packageStatus === "active");
  const assignedPilots = !schedule || schedule.isDraft
    ? []
    : namedPilots
        .filter((pilot) => pilot.assignedScheduleId === schedule.scheduleId)
        .sort((left, right) => left.displayName.localeCompare(right.displayName))
        .map((pilot) => ({
          namedPilotId: pilot.namedPilotId,
          displayName: pilot.displayName,
          certifications: pilot.certifications,
          availabilityState: pilot.availabilityState,
          packageStatus: pilot.packageStatus,
          startsAtUtc: pilot.startsAtUtc,
          ...(pilot.assignmentFromUtc ? { assignmentFromUtc: pilot.assignmentFromUtc } : {}),
          ...(pilot.assignmentToUtc ? { assignmentToUtc: pilot.assignmentToUtc } : {}),
          ...(pilot.restingUntilUtc ? { restingUntilUtc: pilot.restingUntilUtc } : {}),
          ...(pilot.trainingUntilUtc ? { trainingUntilUtc: pilot.trainingUntilUtc } : {}),
          ...(pilot.travelDestinationAirportId ? { travelDestinationAirport: describeAirport(pilot.travelDestinationAirportId, airportReference) } : {}),
          ...(pilot.travelStartedAtUtc ? { travelStartedAtUtc: pilot.travelStartedAtUtc } : {}),
          ...(pilot.travelUntilUtc ? { travelUntilUtc: pilot.travelUntilUtc } : {}),
          ...(pilot.currentAirportId ? { currentAirport: describeAirport(pilot.currentAirportId, airportReference) } : {}),
        }));
  const draftPilotAssignment = schedule?.isDraft
    ? buildDraftPilotAssignmentView(schedule, aircraft, namedPilots, currentTimeUtc, airportReference)
    : undefined;

  return {
    aircraftId: aircraft.aircraftId,
    registration: aircraft.registration,
    modelDisplayName: aircraft.modelDisplayName,
    currentAirport: describeAirport(aircraft.currentAirportId, airportReference),
    operationalState: aircraft.statusInput,
    dispatchAvailable: aircraft.dispatchAvailable,
    ownershipType: aircraft.ownershipType,
    conditionBand: aircraft.conditionBandInput,
    conditionValue: aircraft.conditionValue,
    maintenanceState: aircraft.maintenanceStateInput,
    hoursToService: aircraft.hoursToService,
    pilotQualificationGroup: aircraft.pilotQualificationGroup,
    ...(requiredPilotCertificationCode ? { requiredPilotCertificationCode } : {}),
    pilotsRequired: aircraft.pilotsRequired,
    pilotCoverageUnits,
    pendingPilotCoverageUnits,
    pilotReadiness: {
      qualificationGroup: aircraft.pilotQualificationGroup,
      ...(requiredPilotCertificationCode ? { requiredCertificationCode: requiredPilotCertificationCode } : {}),
      pilotsRequired: aircraft.pilotsRequired,
      readyNowCount: countPilotsByAvailability(activeNamedPilots, "ready"),
      reservedNowCount: countPilotsByAvailability(activeNamedPilots, "reserved"),
      flyingNowCount: countPilotsByAvailability(activeNamedPilots, "flying"),
      restingNowCount: countPilotsByAvailability(activeNamedPilots, "resting"),
      trainingNowCount: countPilotsByAvailability(activeNamedPilots, "training"),
      travelingNowCount: countPilotsByAvailability(activeNamedPilots, "traveling"),
      pendingStartCount: namedPilots.filter((pilot) => pilot.packageStatus === "pending").length,
      assignedPilotCount: assignedPilots.length,
      noReadyReserveRemaining: assignedPilots.length > 0 && countPilotsByAvailability(activeNamedPilots, "ready") === 0,
    },
    assignedPilots,
    ...(schedule ? {
      schedule: {
        scheduleId: schedule.scheduleId,
        scheduleKind: schedule.scheduleKind,
        scheduleState: schedule.scheduleState,
        isDraft: schedule.isDraft,
        plannedStartUtc: schedule.plannedStartUtc,
        plannedEndUtc: schedule.plannedEndUtc,
        ...(validation ? { validation } : {}),
        legs: schedule.legs.map((leg) => buildDispatchLegView(leg, contractsById.get(leg.linkedCompanyContractId ?? ""), validationMessagesBySequence, airportReference)),
        laborAllocationCount: schedule.laborAllocations.length,
        ...(draftPilotAssignment ? { draftPilotAssignment } : {}),
      },
    } : {}),
  };
}

function buildDraftPilotAssignmentView(
  schedule: AircraftScheduleView,
  aircraft: FleetAircraftView,
  namedPilots: StaffingStateView["namedPilots"],
  currentTimeUtc: string,
  airportReference: AirportReferenceRepository,
): DispatchDraftPilotAssignmentView | undefined {
  if (!schedule.isDraft || schedule.legs.length === 0) {
    return undefined;
  }

  const qualificationGroup = schedule.legs.find((leg) => typeof leg.assignedQualificationGroup === "string")
    ?.assignedQualificationGroup
    ?? aircraft.pilotQualificationGroup;
  const assignmentResolution = resolveDispatchPilotAssignment(
    namedPilots,
    {
      qualificationGroup,
      pilotsRequired: aircraft.pilotsRequired,
      assignedFromUtc: schedule.plannedStartUtc,
      assignedToUtc: schedule.plannedEndUtc,
      currentTimeUtc,
      currentScheduleId: schedule.scheduleId,
      ...(schedule.legs[0]?.originAirportId ? { requiredOriginAirportId: schedule.legs[0].originAirportId } : {}),
    },
    airportReference,
  );

  return {
    qualificationGroup,
    ...(assignmentResolution.requiredCertificationCode
      ? { requiredCertificationCode: assignmentResolution.requiredCertificationCode }
      : {}),
    pilotsRequired: aircraft.pilotsRequired,
    recommendedPilotIds: assignmentResolution.recommendedPilotIds,
    hardBlockers: assignmentResolution.hardBlockers,
    candidateOptions: assignmentResolution.candidateOptions.map((candidateOption) => ({
      namedPilotId: candidateOption.namedPilotId,
      displayName: candidateOption.displayName,
      certifications: candidateOption.certifications,
      availabilityState: candidateOption.availabilityState,
      selectable: candidateOption.selectable,
      recommended: candidateOption.recommended,
      ...(candidateOption.reason ? { reason: candidateOption.reason } : {}),
      ...(candidateOption.currentAirportId ? { currentAirport: describeAirport(candidateOption.currentAirportId, airportReference) } : {}),
      ...(candidateOption.travelOriginAirportId ? { travelOriginAirport: describeAirport(candidateOption.travelOriginAirportId, airportReference) } : {}),
      ...(candidateOption.travelDestinationAirportId ? { travelDestinationAirport: describeAirport(candidateOption.travelDestinationAirportId, airportReference) } : {}),
      ...(candidateOption.travelStartedAtUtc ? { travelStartedAtUtc: candidateOption.travelStartedAtUtc } : {}),
      ...(candidateOption.travelUntilUtc ? { travelUntilUtc: candidateOption.travelUntilUtc } : {}),
    })),
  };
}

function countPilotsByAvailability(
  pilots: StaffingStateView["namedPilots"],
  availabilityState: StaffingStateView["namedPilots"][number]["availabilityState"],
): number {
  return pilots.filter((pilot) => pilot.availabilityState === availabilityState).length;
}

function choosePrimarySchedule(
  schedules: AircraftScheduleView[],
  currentTimeUtc: string,
): AircraftScheduleView | undefined {
  if (schedules.length === 0) {
    return undefined;
  }

  const drafts = schedules
    .filter((schedule) => schedule.isDraft)
    .sort((left, right) => Date.parse(right.updatedAtUtc) - Date.parse(left.updatedAtUtc));

  if (drafts.length > 0) {
    return drafts[0];
  }

  const referenceTimeMs = Date.parse(currentTimeUtc);
  const committedSchedules = schedules.filter((schedule) => !schedule.isDraft);
  if (committedSchedules.length === 0) {
    return undefined;
  }

  if (!Number.isFinite(referenceTimeMs)) {
    return committedSchedules
      .slice()
      .sort(compareScheduleByStartUtc)[0];
  }

  const currentSchedules = committedSchedules
    .filter((schedule) => {
      const plannedStartMs = Date.parse(schedule.plannedStartUtc);
      const plannedEndMs = Date.parse(schedule.plannedEndUtc);
      return Number.isFinite(plannedStartMs)
        && Number.isFinite(plannedEndMs)
        && plannedStartMs <= referenceTimeMs
        && referenceTimeMs < plannedEndMs;
    })
    .sort((left, right) => Date.parse(right.plannedStartUtc) - Date.parse(left.plannedStartUtc));

  if (currentSchedules.length > 0) {
    return currentSchedules[0];
  }

  const upcomingSchedules = committedSchedules
    .filter((schedule) => Date.parse(schedule.plannedStartUtc) >= referenceTimeMs)
    .sort(compareScheduleByStartUtc);

  if (upcomingSchedules.length > 0) {
    return upcomingSchedules[0];
  }

  return committedSchedules
    .slice()
    .sort((left, right) => Date.parse(right.plannedEndUtc) - Date.parse(left.plannedEndUtc))[0];
}

function compareScheduleByStartUtc(left: AircraftScheduleView, right: AircraftScheduleView): number {
  const startDifference = Date.parse(left.plannedStartUtc) - Date.parse(right.plannedStartUtc);
  if (startDifference !== 0) {
    return startDifference;
  }

  return Date.parse(right.updatedAtUtc) - Date.parse(left.updatedAtUtc);
}

function buildDispatchLegView(
  leg: ScheduleLegView,
  contract: CompanyContractView | undefined,
  validationMessagesBySequence: Map<number, DispatchValidationMessageView[]>,
  airportReference: AirportReferenceRepository,
): DispatchLegView {
  const payload = readPayloadSnapshot(leg.payloadSnapshot);

  return {
    flightLegId: leg.flightLegId,
    sequenceNumber: leg.sequenceNumber,
    legType: leg.legType,
    originAirport: describeAirport(leg.originAirportId, airportReference),
    destinationAirport: describeAirport(leg.destinationAirportId, airportReference),
    plannedDepartureUtc: leg.plannedDepartureUtc,
    plannedArrivalUtc: leg.plannedArrivalUtc,
    ...(leg.linkedCompanyContractId ? { linkedCompanyContractId: leg.linkedCompanyContractId } : {}),
    ...(Array.isArray(leg.linkedCompanyContractIds) && leg.linkedCompanyContractIds.length > 0
      ? { linkedCompanyContractIds: leg.linkedCompanyContractIds }
      : {}),
    ...(leg.assignedQualificationGroup ? { assignedQualificationGroup: leg.assignedQualificationGroup } : {}),
    ...(() => {
      const requiredPilotCertificationCode = leg.assignedQualificationGroup
        ? requiredCertificationForQualificationGroup(leg.assignedQualificationGroup)
        : undefined;
      return requiredPilotCertificationCode ? { requiredPilotCertificationCode } : {};
    })(),
    payloadLabel: formatPayloadLabel(
      payload?.volumeType,
      payload?.passengerCount,
      payload?.cargoWeightLb,
      contract?.volumeType,
      contract?.passengerCount,
      contract?.cargoWeightLb,
      leg.legType,
    ),
    durationMinutes: minutesBetween(leg.plannedDepartureUtc, leg.plannedArrivalUtc),
    ...(contract ? {
      contractState: contract.contractState,
      contractPayoutAmount: contract.acceptedPayoutAmount,
      contractDeadlineUtc: contract.deadlineUtc,
      ...(contract.earliestStartUtc ? { contractEarliestStartUtc: contract.earliestStartUtc } : {}),
    } : {}),
    validationMessages: validationMessagesBySequence.get(leg.sequenceNumber) ?? [],
  };
}

function buildAcceptedContractView(
  contract: CompanyContractView,
  airportReference: AirportReferenceRepository,
): DispatchAcceptedContractView {
  return {
    companyContractId: contract.companyContractId,
    originAirport: describeAirport(contract.originAirportId, airportReference),
    destinationAirport: describeAirport(contract.destinationAirportId, airportReference),
    volumeType: contract.volumeType,
    ...(contract.passengerCount !== undefined ? { passengerCount: contract.passengerCount } : {}),
    ...(contract.cargoWeightLb !== undefined ? { cargoWeightLb: contract.cargoWeightLb } : {}),
    acceptedPayoutAmount: contract.acceptedPayoutAmount,
    ...(contract.earliestStartUtc ? { earliestStartUtc: contract.earliestStartUtc } : {}),
    deadlineUtc: contract.deadlineUtc,
    contractState: contract.contractState,
    ...(contract.assignedAircraftId ? { assignedAircraftId: contract.assignedAircraftId } : {}),
  };
}

function buildRoutePlanItemView(
  item: RoutePlanItemState,
  airportReference: AirportReferenceRepository,
): DispatchRoutePlanItemView {
  return {
    routePlanItemId: item.routePlanItemId,
    sequenceNumber: item.sequenceNumber,
    sourceType: item.sourceType,
    plannerItemStatus: item.plannerItemStatus,
    originAirport: describeAirport(item.originAirportId, airportReference),
    destinationAirport: describeAirport(item.destinationAirportId, airportReference),
    volumeType: item.volumeType,
    ...(item.passengerCount !== undefined ? { passengerCount: item.passengerCount } : {}),
    ...(item.cargoWeightLb !== undefined ? { cargoWeightLb: item.cargoWeightLb } : {}),
    payoutAmount: item.payoutAmount,
    ...(item.earliestStartUtc ? { earliestStartUtc: item.earliestStartUtc } : {}),
    deadlineUtc: item.deadlineUtc,
    ...(item.linkedAircraftId ? { linkedAircraftId: item.linkedAircraftId } : {}),
    ...(item.linkedScheduleId ? { linkedScheduleId: item.linkedScheduleId } : {}),
  };
}

function buildValidationMessagesBySequence(
  messages: DispatchValidationMessageView[],
): Map<number, DispatchValidationMessageView[]> {
  const messagesBySequence = new Map<number, DispatchValidationMessageView[]>();

  for (const message of messages) {
    if (!message.affectedLegSequenceNumber) {
      continue;
    }

    const existing = messagesBySequence.get(message.affectedLegSequenceNumber) ?? [];
    existing.push(message);
    messagesBySequence.set(message.affectedLegSequenceNumber, existing);
  }

  return messagesBySequence;
}

function parseValidationSnapshot(raw: JsonObject | undefined): DispatchValidationSnapshotView | undefined {
  if (!raw || Array.isArray(raw)) {
    return undefined;
  }

  const snapshot = raw as Partial<ScheduleValidationSnapshot> & Record<string, unknown>;
  const messages = Array.isArray(snapshot.validationMessages)
    ? snapshot.validationMessages
        .map((entry) => parseValidationMessage(entry))
        .filter((entry): entry is DispatchValidationMessageView => Boolean(entry))
    : [];

  return {
    isCommittable: snapshot.isCommittable === true,
    hardBlockerCount: normalizeNumber(snapshot.hardBlockerCount),
    warningCount: normalizeNumber(snapshot.warningCount),
    projectedScheduleProfit: normalizeNumber(snapshot.projectedScheduleProfit),
    projectedScheduleRevenue: normalizeNumber(snapshot.projectedScheduleRevenue),
    projectedScheduleCost: normalizeNumber(snapshot.projectedScheduleCost),
    projectedRiskBand: snapshot.projectedRiskBand === "low" || snapshot.projectedRiskBand === "medium" || snapshot.projectedRiskBand === "high"
      ? snapshot.projectedRiskBand
      : "medium",
    aircraftOperationalStateAfterCommit: typeof snapshot.aircraftOperationalStateAfterCommit === "string"
      ? snapshot.aircraftOperationalStateAfterCommit
      : "unknown",
    contractIdsAttached: Array.isArray(snapshot.contractIdsAttached)
      ? snapshot.contractIdsAttached.filter((entry): entry is string => typeof entry === "string")
      : [],
    totalDistanceNm: normalizeNumber(snapshot.totalDistanceNm),
    totalBlockHours: normalizeNumber(snapshot.totalBlockHours),
    validationMessages: messages,
  };
}

function parseValidationMessage(raw: unknown): DispatchValidationMessageView | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const message = raw as ValidationMessage;
  const affectedLegSequenceNumber = typeof message.affectedLegId === "string"
    ? parseLegSequenceNumber(message.affectedLegId)
    : undefined;

  return {
    severity: message.severity === "blocker" || message.severity === "warning" || message.severity === "info"
      ? message.severity
      : "info",
    code: typeof message.code === "string" ? message.code : "validation.unknown",
    summary: typeof message.summary === "string" ? message.summary : "Validation message unavailable.",
    ...(affectedLegSequenceNumber !== undefined ? { affectedLegSequenceNumber } : {}),
    ...(typeof message.suggestedRecoveryAction === "string" ? { suggestedRecoveryAction: message.suggestedRecoveryAction } : {}),
  };
}

function parseLegSequenceNumber(rawLegId: string): number | undefined {
  const match = /^leg_(\d+)$/.exec(rawLegId);
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readPayloadSnapshot(raw: JsonObject | undefined): {
  volumeType?: string;
  passengerCount?: number;
  cargoWeightLb?: number;
  totalPayloadWeightLb?: number;
} | undefined {
  if (!raw || Array.isArray(raw)) {
    return undefined;
  }

  const snapshot = raw as Record<string, unknown>;
  return {
    ...(typeof snapshot.volumeType === "string" ? { volumeType: snapshot.volumeType } : {}),
    ...(typeof snapshot.passengerCount === "number" ? { passengerCount: snapshot.passengerCount } : {}),
    ...(typeof snapshot.cargoWeightLb === "number" ? { cargoWeightLb: snapshot.cargoWeightLb } : {}),
    ...(typeof snapshot.totalPayloadWeightLb === "number" ? { totalPayloadWeightLb: snapshot.totalPayloadWeightLb } : {}),
  };
}

function resolveDefaultSelectedAircraftId(aircraft: DispatchAircraftView[]): string | undefined {
  return aircraft.find((entry) => entry.schedule?.isDraft)?.aircraftId
    ?? aircraft.find((entry) => entry.schedule)?.aircraftId
    ?? aircraft.find((entry) => entry.dispatchAvailable)?.aircraftId
    ?? aircraft[0]?.aircraftId;
}

function describeAirport(airportId: string, airportReference: AirportReferenceRepository): DispatchAirportView {
  const airport = airportReference.findAirport(airportId);

  if (!airport) {
    return {
      airportId,
      code: airportId,
      primaryLabel: airportId,
    };
  }

  const locationLabel = airport.municipality ?? airport.name;
  const secondaryParts = [
    airport.name !== locationLabel ? airport.name : undefined,
    airport.isoCountry,
  ].filter((entry): entry is string => Boolean(entry));

  return {
    airportId,
    code: airport.identCode || airport.airportKey,
    primaryLabel: locationLabel,
    ...(secondaryParts.length > 0 ? { secondaryLabel: secondaryParts.join(" | ") } : {}),
  };
}

function formatPayloadLabel(
  payloadVolumeType: string | undefined,
  payloadPassengerCount: number | undefined,
  payloadCargoWeightLb: number | undefined,
  contractVolumeType: string | undefined,
  contractPassengerCount: number | undefined,
  contractCargoWeightLb: number | undefined,
  legType: string,
): string {
  const volumeType = payloadVolumeType ?? contractVolumeType;
  const passengerCount = payloadPassengerCount ?? contractPassengerCount;
  const cargoWeightLb = payloadCargoWeightLb ?? contractCargoWeightLb;

  if (volumeType === "cargo") {
    return `${formatNumber(cargoWeightLb ?? 0)} lb cargo`;
  }

  if (volumeType === "passenger") {
    return `${formatNumber(passengerCount ?? 0)} pax`;
  }

  if (volumeType === "mixed") {
    return `${formatNumber(passengerCount ?? 0)} pax + ${formatNumber(cargoWeightLb ?? 0)} lb cargo`;
  }

  return legType === "reposition" ? "Reposition ferry" : humanize(legType);
}

function normalizeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function minutesBetween(startUtc: string, endUtc: string): number {
  return Math.max(0, Math.round((Date.parse(endUtc) - Date.parse(startUtc)) / 60_000));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}
