/*
 * Implements the advance time command handler for the backend command pipeline.
 * Files in this layer validate a request, mutate save-state tables inside a transaction, and return structured results for callers.
 * This file is effectively the simulation heartbeat: it advances company time, resolves due events, settles money movement,
 * updates contracts and schedules, and triggers any rolling-market maintenance that depends on simulated time.
 */

import type { AdvanceTimeCommand, CommandResult } from "./types.js";
import { addCadenceToUtc, createPrefixedId, deriveFinancialPressureBand } from "./utils.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import { deriveNamedPilotRestUntil } from "../staffing/named-pilot-roster.js";
import { normalizeUtcTimestamp } from "../../domain/common/utc.js";
import {
  applyCertificationTrainingAward,
  parsePilotCertificationsJson,
} from "../../domain/staffing/pilot-certifications.js";
import type { JsonObject } from "../../domain/common/primitives.js";
import type { AdvanceTimeStopCondition } from "../../domain/simulation/types.js";
import type { EmploymentModel, LaborCategory, PilotCertificationCode } from "../../domain/staffing/types.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";

interface AdvanceTimeDependencies {
  saveDatabase: SqliteFileDatabase;
  aircraftReference: AircraftReferenceRepository;
}

interface ScheduledEventRow extends Record<string, unknown> {
  scheduledEventId: string;
  eventType: string;
  scheduledTimeUtc: string;
  status: string;
  aircraftId: string | null;
  companyContractId: string | null;
  maintenanceTaskId: string | null;
  payloadJson: string | null;
}

interface FlightEventPayload {
  scheduleId: string;
  flightLegId: string;
  sequenceNumber: number;
}

interface FlightLegExecutionRow extends Record<string, unknown> {
  flightLegId: string;
  scheduleId: string;
  sequenceNumber: number;
  legType: string;
  linkedCompanyContractId: string | null;
  assignedQualificationGroup: string | null;
  originAirportId: string;
  destinationAirportId: string;
  plannedDepartureUtc: string;
  plannedArrivalUtc: string;
  actualDepartureUtc: string | null;
  actualArrivalUtc: string | null;
  legState: string;
  scheduleState: string;
  aircraftId: string;
  aircraftModelId: string;
  currentAirportId: string;
  activeScheduleId: string | null;
  statusInput: string;
  dispatchAvailable: number;
  deliveryState: string;
  conditionValue: number;
  airframeHoursTotal: number;
  airframeCyclesTotal: number;
  companyContractId: string | null;
  contractState: string | null;
  deadlineUtc: string | null;
  acceptedPayoutAmount: number | null;
  penaltyModelJson: string | null;
}

interface MaintenanceProgramRow extends Record<string, unknown> {
  hoursSinceInspection: number;
  cyclesSinceInspection: number;
  hoursToService: number;
  maintenanceStateInput: string;
  aogFlag: number;
}

interface CountRow extends Record<string, unknown> {
  countValue: number;
}

interface NamedPilotAssignmentStateRow extends Record<string, unknown> {
  namedPilotAssignmentId: string;
  namedPilotId: string;
  displayName: string;
  aircraftId: string;
  scheduleId: string;
  qualificationGroup: string;
  assignedFromUtc: string;
  assignedToUtc: string;
  status: "reserved" | "flying" | "completed" | "cancelled";
  currentAirportId: string | null;
  restingUntilUtc: string | null;
  travelDestinationAirportId: string | null;
  travelStartedAtUtc: string | null;
  travelUntilUtc: string | null;
}

interface ContractPilotUsageRow extends Record<string, unknown> {
  namedPilotId: string;
  staffingPackageId: string;
  displayName: string;
  variableCostRate: number;
}

interface CompletedTrainingRow extends Record<string, unknown> {
  namedPilotId: string;
  displayName: string;
  qualificationGroup: string;
  certificationsJson: string | null;
  trainingProgramKind: string | null;
  trainingTargetCertificationCode: string | null;
  trainingStartedAtUtc: string | null;
  trainingUntilUtc: string;
}

interface CompletedTravelRow extends Record<string, unknown> {
  namedPilotId: string;
  displayName: string;
  travelOriginAirportId: string | null;
  travelDestinationAirportId: string;
  travelStartedAtUtc: string | null;
  travelUntilUtc: string;
}

interface ExpiringStaffingPackageRow extends Record<string, unknown> {
  staffingPackageId: string;
  laborCategory: LaborCategory;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  startsAtUtc: string;
  endsAtUtc: string;
  status: "pending" | "active";
  recurringObligationId: string | null;
}

interface ActivatingStaffingPackageRow extends Record<string, unknown> {
  staffingPackageId: string;
  laborCategory: LaborCategory;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  startsAtUtc: string;
  endsAtUtc: string | null;
}

interface DueRecurringObligationRow extends Record<string, unknown> {
  recurringObligationId: string;
  obligationType: string;
  sourceObjectType: string;
  sourceObjectId: string;
  amount: number;
  cadence: "daily" | "weekly" | "monthly";
  nextDueAtUtc: string;
  endAtUtc: string | null;
}

interface StaffingPackagePilotRow extends Record<string, unknown> {
  namedPilotId: string;
  displayName: string;
}

interface ContractDeadlineRow extends Record<string, unknown> {
  companyContractId: string;
  contractState: string;
  acceptedPayoutAmount: number;
  penaltyModelJson: string;
  assignedAircraftId: string | null;
  deadlineUtc: string;
}

interface ContractPenaltyModel extends Record<string, unknown> {
  failurePenaltyAmount?: number;
  lateCompletionPenaltyPercent?: number;
}

interface MutableBatchOutcome {
  criticalAlertTriggered: boolean;
  completedLegIds: Set<string>;
  resolvedContractIds: Set<string>;
  availableAircraftIds: Set<string>;
}

interface AdvanceTimeTransactionResult {
  advancedToUtc: string;
  stoppedBecause: AdvanceTimeStopCondition;
  processedEventCount: number;
  emittedEventIds: string[];
  emittedLedgerEntryIds: string[];
  changedAggregateIds: string[];
  summary: JsonObject;
}

// Small parsers normalize scheduled-event payloads before the transaction loop starts mutating persistent state.
function parseJsonObject(rawValue: string | null): JsonObject | undefined {
  if (!rawValue) {
    return undefined;
  }

  return JSON.parse(rawValue) as JsonObject;
}

function parseFlightEventPayload(rawValue: string | null): FlightEventPayload | null {
  const payload = parseJsonObject(rawValue);

  if (!payload) {
    return null;
  }

  const flightLegId = typeof payload.flightLegId === "string" ? payload.flightLegId : null;
  const scheduleId = typeof payload.scheduleId === "string" ? payload.scheduleId : null;
  const sequenceNumber = typeof payload.sequenceNumber === "number" ? payload.sequenceNumber : null;

  if (!flightLegId || !scheduleId || sequenceNumber === null) {
    return null;
  }

  return {
    scheduleId,
    flightLegId,
    sequenceNumber,
  };
}

function normalizeStopConditions(stopConditions: AdvanceTimeStopCondition[] | undefined): AdvanceTimeStopCondition[] {
  return [...new Set([...(stopConditions ?? []), "target_time"])] as AdvanceTimeStopCondition[];
}

function hoursBetween(startUtc: string, endUtc: string): number {
  return Math.max(0, (new Date(endUtc).getTime() - new Date(startUtc).getTime()) / 3_600_000);
}

function humanizeIdentifier(value: string): string {
  return value.replaceAll("_", " ");
}

function recurringObligationEntryType(obligationType: string): string {
  switch (obligationType) {
    case "lease":
      return "lease_payment";
    case "finance":
      return "finance_payment";
    case "staffing":
      return "staffing_payment";
    case "service_agreement":
      return "service_agreement_payment";
    default:
      return "recurring_obligation_payment";
  }
}

function recurringObligationDescription(obligationType: string): string {
  return `${humanizeIdentifier(obligationType).replace(/^./, (value) => value.toUpperCase())} payment collected.`;
}

function deriveConditionBandInput(conditionValue: number): string {
  if (conditionValue >= 0.85) {
    return "excellent";
  }

  if (conditionValue >= 0.65) {
    return "good";
  }

  if (conditionValue >= 0.45) {
    return "fair";
  }

  return "poor";
}

function deriveMaintenanceStatus(hoursToService: number, conditionValue: number): {
  conditionBandInput: string;
  maintenanceStateInput: string;
  aogFlag: number;
} {
  const conditionBandInput = deriveConditionBandInput(conditionValue);

  if (conditionValue <= 0.15 || hoursToService <= -10) {
    return {
      conditionBandInput,
      maintenanceStateInput: "aog",
      aogFlag: 1,
    };
  }

  if (hoursToService <= 0) {
    return {
      conditionBandInput,
      maintenanceStateInput: "overdue",
      aogFlag: 0,
    };
  }

  if (hoursToService <= 5) {
    return {
      conditionBandInput,
      maintenanceStateInput: "due_soon",
      aogFlag: 0,
    };
  }

  return {
    conditionBandInput,
    maintenanceStateInput: "current",
    aogFlag: 0,
  };
}

function determineStopReason(
  stopConditions: AdvanceTimeStopCondition[],
  batchOutcome: MutableBatchOutcome,
  selectedAircraftId: string | undefined,
  selectedContractId: string | undefined,
): AdvanceTimeStopCondition | null {
  if (stopConditions.includes("critical_alert") && batchOutcome.criticalAlertTriggered) {
    return "critical_alert";
  }

  if (stopConditions.includes("leg_completed") && batchOutcome.completedLegIds.size > 0) {
    return "leg_completed";
  }

  if (stopConditions.includes("selected_aircraft_available") && batchOutcome.availableAircraftIds.size > 0) {
    if (!selectedAircraftId || batchOutcome.availableAircraftIds.has(selectedAircraftId)) {
      return "selected_aircraft_available";
    }
  }

  if (stopConditions.includes("contract_resolved") && batchOutcome.resolvedContractIds.size > 0) {
    if (!selectedContractId || batchOutcome.resolvedContractIds.has(selectedContractId)) {
      return "contract_resolved";
    }
  }

  return null;
}

// Time advancement runs inside a single transaction so scheduled events, cash, and status transitions stay consistent.
export async function handleAdvanceTime(
  command: AdvanceTimeCommand,
  dependencies: AdvanceTimeDependencies,
): Promise<CommandResult> {
  const hardBlockers: string[] = [];
  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);
  const normalizedTargetTimeUtc = normalizeUtcTimestamp(command.payload.targetTimeUtc);

  if (!companyContext) {
    hardBlockers.push(`Save ${command.saveId} does not have an active company.`);
  }

  const parsedTargetTimestamp = normalizedTargetTimeUtc ? Date.parse(normalizedTargetTimeUtc) : Number.NaN;
  const targetTimestamp = Number.isNaN(parsedTargetTimestamp) ? null : parsedTargetTimestamp;
  const currentTimestamp = companyContext ? Date.parse(companyContext.currentTimeUtc) : null;

  if (targetTimestamp === null) {
    hardBlockers.push(`Target time ${command.payload.targetTimeUtc} is not a valid UTC timestamp.`);
  }

  if (targetTimestamp !== null && currentTimestamp !== null && targetTimestamp <= currentTimestamp) {
    hardBlockers.push("AdvanceTime requires a target time later than the current game clock.");
  }

  if (hardBlockers.length > 0) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: hardBlockers,
      hardBlockers,
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const stopConditions = normalizeStopConditions(command.payload.stopConditions);
  // The transaction replays due events in chronological order and can stop early when one of the requested milestones is reached.
  const transactionResult = dependencies.saveDatabase.transaction<AdvanceTimeTransactionResult>(() => {
    let currentCashAmount = companyContext!.currentCashAmount;
    let processedEventCount = 0;
    let advancedToUtc = companyContext!.currentTimeUtc;
    let stoppedBecause: AdvanceTimeStopCondition = "target_time";

    const emittedEventIds: string[] = [];
    const emittedLedgerEntryIds: string[] = [];
    const changedAggregateIds = new Set<string>([companyContext!.companyId]);
    const processedEventTypes: string[] = [];
    const completedLegIds = new Set<string>();
    const resolvedContractIds = new Set<string>();
    const availableAircraftIds = new Set<string>();

    const syncFinancialState = (effectiveTimeUtc: string): void => {
      dependencies.saveDatabase.run(
        `UPDATE company_financial_state
        SET current_cash_amount = $current_cash_amount,
            financial_pressure_band = $financial_pressure_band,
            updated_at_utc = $updated_at_utc
        WHERE company_id = $company_id`,
        {
          $current_cash_amount: currentCashAmount,
          $financial_pressure_band: deriveFinancialPressureBand(currentCashAmount),
          $updated_at_utc: effectiveTimeUtc,
          $company_id: companyContext!.companyId,
        },
      );
    };

    const insertEventLog = (
      eventTimeUtc: string,
      eventType: string,
      sourceObjectType: string | null,
      sourceObjectId: string | null,
      severity: "critical" | "warning" | "info" | "opportunity",
      message: string,
      metadata?: JsonObject,
    ): string => {
      const eventLogEntryId = createPrefixedId("event");
      dependencies.saveDatabase.run(
        `INSERT INTO event_log_entry (
          event_log_entry_id,
          save_id,
          company_id,
          event_time_utc,
          event_type,
          source_object_type,
          source_object_id,
          severity,
          message,
          metadata_json
        ) VALUES (
          $event_log_entry_id,
          $save_id,
          $company_id,
          $event_time_utc,
          $event_type,
          $source_object_type,
          $source_object_id,
          $severity,
          $message,
          $metadata_json
        )`,
        {
          $event_log_entry_id: eventLogEntryId,
          $save_id: command.saveId,
          $company_id: companyContext!.companyId,
          $event_time_utc: eventTimeUtc,
          $event_type: eventType,
          $source_object_type: sourceObjectType,
          $source_object_id: sourceObjectId,
          $severity: severity,
          $message: message,
          $metadata_json: metadata ? JSON.stringify(metadata) : null,
        },
      );
      emittedEventIds.push(eventLogEntryId);
      return eventLogEntryId;
    };

    const insertLedgerEntry = (
      eventTimeUtc: string,
      entryType: string,
      amount: number,
      sourceObjectType: string | null,
      sourceObjectId: string | null,
      description: string,
      metadata?: JsonObject,
    ): string | null => {
      if (amount === 0) {
        return null;
      }

      const ledgerEntryId = createPrefixedId("ledger");
      currentCashAmount += amount;
      dependencies.saveDatabase.run(
        `INSERT INTO ledger_entry (
          ledger_entry_id,
          company_id,
          entry_time_utc,
          entry_type,
          amount,
          currency_code,
          source_object_type,
          source_object_id,
          description,
          metadata_json
        ) VALUES (
          $ledger_entry_id,
          $company_id,
          $entry_time_utc,
          $entry_type,
          $amount,
          'USD',
          $source_object_type,
          $source_object_id,
          $description,
          $metadata_json
        )`,
        {
          $ledger_entry_id: ledgerEntryId,
          $company_id: companyContext!.companyId,
          $entry_time_utc: eventTimeUtc,
          $entry_type: entryType,
          $amount: amount,
          $source_object_type: sourceObjectType,
          $source_object_id: sourceObjectId,
          $description: description,
          $metadata_json: metadata ? JSON.stringify(metadata) : null,
        },
      );
      syncFinancialState(eventTimeUtc);
      emittedLedgerEntryIds.push(ledgerEntryId);
      return ledgerEntryId;
    };

    const markScheduledEventProcessed = (scheduledEventId: string): void => {
      dependencies.saveDatabase.run(
        `UPDATE scheduled_event
        SET status = 'processed'
        WHERE scheduled_event_id = $scheduled_event_id`,
        { $scheduled_event_id: scheduledEventId },
      );
    };

    const loadFlightLegExecution = (flightLegId: string): FlightLegExecutionRow | null => (
      dependencies.saveDatabase.getOne<FlightLegExecutionRow>(
        `SELECT
          fl.flight_leg_id AS flightLegId,
          fl.schedule_id AS scheduleId,
          fl.sequence_number AS sequenceNumber,
          fl.leg_type AS legType,
          fl.linked_company_contract_id AS linkedCompanyContractId,
          fl.assigned_qualification_group AS assignedQualificationGroup,
          fl.origin_airport_id AS originAirportId,
          fl.destination_airport_id AS destinationAirportId,
          fl.planned_departure_utc AS plannedDepartureUtc,
          fl.planned_arrival_utc AS plannedArrivalUtc,
          fl.actual_departure_utc AS actualDepartureUtc,
          fl.actual_arrival_utc AS actualArrivalUtc,
          fl.leg_state AS legState,
          s.schedule_state AS scheduleState,
          s.aircraft_id AS aircraftId,
          ca.aircraft_model_id AS aircraftModelId,
          ca.current_airport_id AS currentAirportId,
          ca.active_schedule_id AS activeScheduleId,
          ca.status_input AS statusInput,
          ca.dispatch_available AS dispatchAvailable,
          ca.delivery_state AS deliveryState,
          ca.condition_value AS conditionValue,
          ca.airframe_hours_total AS airframeHoursTotal,
          ca.airframe_cycles_total AS airframeCyclesTotal,
          cc.company_contract_id AS companyContractId,
          cc.contract_state AS contractState,
          cc.deadline_utc AS deadlineUtc,
          cc.accepted_payout_amount AS acceptedPayoutAmount,
          cc.penalty_model_json AS penaltyModelJson
        FROM flight_leg AS fl
        JOIN aircraft_schedule AS s ON s.schedule_id = fl.schedule_id
        JOIN company_aircraft AS ca ON ca.aircraft_id = s.aircraft_id
        LEFT JOIN company_contract AS cc ON cc.company_contract_id = fl.linked_company_contract_id
        WHERE fl.flight_leg_id = $flight_leg_id
        LIMIT 1`,
        { $flight_leg_id: flightLegId },
      )
    );

    const loadMaintenanceProgram = (aircraftId: string): MaintenanceProgramRow | null => (
      dependencies.saveDatabase.getOne<MaintenanceProgramRow>(
        `SELECT
          hours_since_inspection AS hoursSinceInspection,
          cycles_since_inspection AS cyclesSinceInspection,
          hours_to_service AS hoursToService,
          maintenance_state_input AS maintenanceStateInput,
          aog_flag AS aogFlag
        FROM maintenance_program_state
        WHERE aircraft_id = $aircraft_id
        LIMIT 1`,
        { $aircraft_id: aircraftId },
      )
    );

    const loadNamedPilotAssignments = (
      scheduleId: string,
      qualificationGroup: string,
      eventTimeUtc: string,
    ): NamedPilotAssignmentStateRow[] => (
      dependencies.saveDatabase.all<NamedPilotAssignmentStateRow>(
        `SELECT
          npa.named_pilot_assignment_id AS namedPilotAssignmentId,
          npa.named_pilot_id AS namedPilotId,
          np.display_name AS displayName,
          npa.aircraft_id AS aircraftId,
          npa.schedule_id AS scheduleId,
          npa.qualification_group AS qualificationGroup,
          npa.assigned_from_utc AS assignedFromUtc,
          npa.assigned_to_utc AS assignedToUtc,
          npa.status AS status,
          np.current_airport_id AS currentAirportId,
          np.resting_until_utc AS restingUntilUtc,
          np.travel_destination_airport_id AS travelDestinationAirportId,
          np.travel_started_at_utc AS travelStartedAtUtc,
          np.travel_until_utc AS travelUntilUtc
        FROM named_pilot_assignment AS npa
        JOIN named_pilot AS np ON np.named_pilot_id = npa.named_pilot_id
        WHERE npa.schedule_id = $schedule_id
          AND npa.qualification_group = $qualification_group
          AND npa.status IN ('reserved', 'flying')
          AND npa.assigned_from_utc <= $event_time_utc
          AND npa.assigned_to_utc > $event_time_utc
        ORDER BY npa.named_pilot_assignment_id ASC`,
        {
          $schedule_id: scheduleId,
          $qualification_group: qualificationGroup,
          $event_time_utc: eventTimeUtc,
        },
      )
    );

    const loadContractPilotUsage = (
      scheduleId: string,
      qualificationGroup: string,
      eventTimeUtc: string,
    ): ContractPilotUsageRow[] => (
      dependencies.saveDatabase.all<ContractPilotUsageRow>(
        `SELECT
          np.named_pilot_id AS namedPilotId,
          sp.staffing_package_id AS staffingPackageId,
          np.display_name AS displayName,
          sp.variable_cost_rate AS variableCostRate
        FROM named_pilot_assignment AS npa
        JOIN named_pilot AS np ON np.named_pilot_id = npa.named_pilot_id
        JOIN staffing_package AS sp ON sp.staffing_package_id = np.staffing_package_id
        WHERE sp.company_id = $company_id
          AND sp.labor_category = 'pilot'
          AND sp.employment_model = 'contract_hire'
          AND sp.status = 'active'
          AND sp.variable_cost_rate IS NOT NULL
          AND npa.schedule_id = $schedule_id
          AND npa.qualification_group = $qualification_group
          AND npa.status IN ('reserved', 'flying')
          AND npa.assigned_from_utc <= $event_time_utc
          AND npa.assigned_to_utc >= $event_time_utc
        ORDER BY np.named_pilot_id ASC`,
        {
          $company_id: companyContext!.companyId,
          $schedule_id: scheduleId,
          $qualification_group: qualificationGroup,
          $event_time_utc: eventTimeUtc,
        },
      )
    );

    const cancelNamedPilotAssignments = (scheduleId: string, eventTimeUtc: string): void => {
      dependencies.saveDatabase.run(
        `UPDATE named_pilot_assignment
        SET status = 'cancelled',
            updated_at_utc = $updated_at_utc
        WHERE schedule_id = $schedule_id
          AND status IN ('reserved', 'flying')`,
        {
          $updated_at_utc: eventTimeUtc,
          $schedule_id: scheduleId,
        },
      );
    };

    const setNamedPilotAssignmentsInFlight = (
      scheduleId: string,
      qualificationGroup: string,
      eventTimeUtc: string,
    ): void => {
      dependencies.saveDatabase.run(
        `UPDATE named_pilot_assignment
        SET status = 'flying',
            updated_at_utc = $updated_at_utc
        WHERE schedule_id = $schedule_id
          AND qualification_group = $qualification_group
          AND status = 'reserved'
          AND assigned_from_utc <= $event_time_utc
          AND assigned_to_utc > $event_time_utc`,
        {
          $updated_at_utc: eventTimeUtc,
          $schedule_id: scheduleId,
          $qualification_group: qualificationGroup,
          $event_time_utc: eventTimeUtc,
        },
      );

      dependencies.saveDatabase.run(
        `UPDATE named_pilot
        SET resting_until_utc = NULL,
            travel_origin_airport_id = NULL,
            travel_destination_airport_id = NULL,
            travel_started_at_utc = NULL,
            travel_until_utc = NULL,
            updated_at_utc = $updated_at_utc
        WHERE named_pilot_id IN (
          SELECT named_pilot_id
          FROM named_pilot_assignment
          WHERE schedule_id = $schedule_id
            AND qualification_group = $qualification_group
            AND assigned_from_utc <= $event_time_utc
            AND assigned_to_utc > $event_time_utc
        )`,
        {
          $updated_at_utc: eventTimeUtc,
          $schedule_id: scheduleId,
          $qualification_group: qualificationGroup,
          $event_time_utc: eventTimeUtc,
        },
      );
    };

    const setNamedPilotAssignmentsReserved = (
      scheduleId: string,
      qualificationGroup: string,
      destinationAirportId: string,
      eventTimeUtc: string,
    ): void => {
      dependencies.saveDatabase.run(
        `UPDATE named_pilot_assignment
        SET status = 'reserved',
            updated_at_utc = $updated_at_utc
        WHERE schedule_id = $schedule_id
          AND qualification_group = $qualification_group
          AND status = 'flying'`,
        {
          $updated_at_utc: eventTimeUtc,
          $schedule_id: scheduleId,
          $qualification_group: qualificationGroup,
        },
      );

      dependencies.saveDatabase.run(
        `UPDATE named_pilot
        SET current_airport_id = $current_airport_id,
            resting_until_utc = NULL,
            travel_origin_airport_id = NULL,
            travel_destination_airport_id = NULL,
            travel_started_at_utc = NULL,
            travel_until_utc = NULL,
            updated_at_utc = $updated_at_utc
        WHERE named_pilot_id IN (
          SELECT named_pilot_id
          FROM named_pilot_assignment
          WHERE schedule_id = $schedule_id
            AND qualification_group = $qualification_group
        )`,
        {
          $current_airport_id: destinationAirportId,
          $updated_at_utc: eventTimeUtc,
          $schedule_id: scheduleId,
          $qualification_group: qualificationGroup,
        },
      );
    };

    const completeNamedPilotAssignments = (
      scheduleId: string,
      destinationAirportId: string,
      eventTimeUtc: string,
    ): void => {
      const restingUntilUtc = deriveNamedPilotRestUntil(eventTimeUtc);
      dependencies.saveDatabase.run(
        `UPDATE named_pilot_assignment
        SET status = 'completed',
            updated_at_utc = $updated_at_utc
        WHERE schedule_id = $schedule_id
          AND status IN ('reserved', 'flying')`,
        {
          $updated_at_utc: eventTimeUtc,
          $schedule_id: scheduleId,
        },
      );

      dependencies.saveDatabase.run(
        `UPDATE named_pilot
        SET current_airport_id = $current_airport_id,
            resting_until_utc = $resting_until_utc,
            travel_origin_airport_id = NULL,
            travel_destination_airport_id = NULL,
            travel_started_at_utc = NULL,
            travel_until_utc = NULL,
            updated_at_utc = $updated_at_utc
        WHERE named_pilot_id IN (
          SELECT named_pilot_id
          FROM named_pilot_assignment
          WHERE schedule_id = $schedule_id
        )`,
        {
          $current_airport_id: destinationAirportId,
          $resting_until_utc: restingUntilUtc,
          $updated_at_utc: eventTimeUtc,
          $schedule_id: scheduleId,
        },
      );
    };

    const markScheduleBlocked = (
      eventTimeUtc: string,
      scheduleId: string,
      aircraftId: string,
      flightLegId: string | null,
      message: string,
      metadata?: JsonObject,
    ): void => {
      dependencies.saveDatabase.run(
        `UPDATE aircraft_schedule
        SET schedule_state = 'blocked',
            updated_at_utc = $updated_at_utc
        WHERE schedule_id = $schedule_id`,
        {
          $updated_at_utc: eventTimeUtc,
          $schedule_id: scheduleId,
        },
      );

      if (flightLegId) {
        dependencies.saveDatabase.run(
          `UPDATE flight_leg
          SET leg_state = CASE
            WHEN leg_state = 'completed' THEN leg_state
            ELSE 'failed'
          END
          WHERE flight_leg_id = $flight_leg_id`,
          { $flight_leg_id: flightLegId },
        );
      }

      dependencies.saveDatabase.run(
        `UPDATE company_aircraft
        SET status_input = 'scheduled',
            dispatch_available = 0,
            active_schedule_id = COALESCE(active_schedule_id, $schedule_id)
        WHERE aircraft_id = $aircraft_id`,
        {
          $schedule_id: scheduleId,
          $aircraft_id: aircraftId,
        },
      );

      cancelNamedPilotAssignments(scheduleId, eventTimeUtc);

      insertEventLog(
        eventTimeUtc,
        "schedule_execution_blocked",
        "aircraft_schedule",
        scheduleId,
        "critical",
        message,
        metadata,
      );
      changedAggregateIds.add(scheduleId);
      changedAggregateIds.add(aircraftId);
      if (flightLegId) {
        changedAggregateIds.add(flightLegId);
      }
    };
    const processDepartureEvent = (scheduledEvent: ScheduledEventRow, batchOutcome: MutableBatchOutcome): void => {
      const eventTimeUtc = scheduledEvent.scheduledTimeUtc;
      const payload = parseFlightEventPayload(scheduledEvent.payloadJson);

      if (!payload) {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        insertEventLog(
          eventTimeUtc,
          "scheduled_event_invalid",
          "scheduled_event",
          scheduledEvent.scheduledEventId,
          "critical",
          `Scheduled departure event ${scheduledEvent.scheduledEventId} is missing its flight-leg payload.`,
        );
        batchOutcome.criticalAlertTriggered = true;
        return;
      }

      const legRow = loadFlightLegExecution(payload.flightLegId);

      if (!legRow) {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        insertEventLog(
          eventTimeUtc,
          "scheduled_event_invalid",
          "scheduled_event",
          scheduledEvent.scheduledEventId,
          "critical",
          `Scheduled departure event ${scheduledEvent.scheduledEventId} could not resolve flight leg ${payload.flightLegId}.`,
          {
            flightLegId: payload.flightLegId,
            scheduleId: payload.scheduleId,
          },
        );
        batchOutcome.criticalAlertTriggered = true;
        return;
      }

      if (legRow.legState === "completed" || legRow.legState === "in_progress") {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        return;
      }

      if (legRow.legState === "failed" || legRow.scheduleState === "blocked") {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        return;
      }

      const blockerReasons: string[] = [];

      if (legRow.scheduleState !== "committed") {
        blockerReasons.push(`schedule ${legRow.scheduleId} is ${legRow.scheduleState}`);
      }

      if (legRow.legState !== "planned") {
        blockerReasons.push(`flight leg ${legRow.flightLegId} is ${legRow.legState}`);
      }

      if (!["available", "delivered"].includes(legRow.deliveryState)) {
        blockerReasons.push(`aircraft delivery state is ${legRow.deliveryState}`);
      }

      if (legRow.currentAirportId !== legRow.originAirportId) {
        blockerReasons.push(`aircraft is at ${legRow.currentAirportId} instead of ${legRow.originAirportId}`);
      }

      if (legRow.activeScheduleId !== legRow.scheduleId) {
        blockerReasons.push(`aircraft active schedule is ${legRow.activeScheduleId ?? "none"}`);
      }

      if (["maintenance", "grounded"].includes(legRow.statusInput)) {
        blockerReasons.push(`aircraft status is ${legRow.statusInput}`);
      }

      if (legRow.linkedCompanyContractId && !["assigned", "active"].includes(legRow.contractState ?? "")) {
        blockerReasons.push(`linked contract is ${legRow.contractState ?? "missing"}`);
      }

      const aircraftModel = dependencies.aircraftReference.findModel(legRow.aircraftModelId);
      const assignedQualificationGroup = legRow.assignedQualificationGroup ?? aircraftModel?.pilotQualificationGroup;

      if (!aircraftModel) {
        blockerReasons.push(`aircraft model ${legRow.aircraftModelId} is missing`);
      }

      if (assignedQualificationGroup && aircraftModel) {
        const namedPilotAssignments = loadNamedPilotAssignments(
          legRow.scheduleId,
          assignedQualificationGroup,
          eventTimeUtc,
        );

        if (namedPilotAssignments.length < aircraftModel.pilotsRequired) {
          blockerReasons.push(`named pilot coverage is short for ${assignedQualificationGroup}`);
        }

        const restingPilots = namedPilotAssignments
          .filter((assignment) =>
            assignment.restingUntilUtc
            && new Date(assignment.restingUntilUtc).getTime() > new Date(eventTimeUtc).getTime()
          )
          .map((assignment) => assignment.displayName);

        if (restingPilots.length > 0) {
          blockerReasons.push(`named pilots are still resting: ${restingPilots.join(", ")}`);
        }

        const travelingPilots = namedPilotAssignments
          .filter((assignment) =>
            assignment.travelUntilUtc
            && new Date(assignment.travelUntilUtc).getTime() > new Date(eventTimeUtc).getTime()
          )
          .map((assignment) => assignment.displayName);

        if (travelingPilots.length > 0) {
          blockerReasons.push(`named pilots are still traveling: ${travelingPilots.join(", ")}`);
        }

        const offAirportPilots = namedPilotAssignments
          .filter((assignment) =>
            !assignment.travelUntilUtc
            && assignment.currentAirportId
            && assignment.currentAirportId !== legRow.originAirportId
          )
          .map((assignment) => `${assignment.displayName} at ${assignment.currentAirportId}`);

        if (offAirportPilots.length > 0) {
          blockerReasons.push(`named pilots are not at ${legRow.originAirportId}: ${offAirportPilots.join(", ")}`);
        }
      }

      if (blockerReasons.length > 0) {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        markScheduleBlocked(
          eventTimeUtc,
          legRow.scheduleId,
          legRow.aircraftId,
          legRow.flightLegId,
          `Blocked schedule ${legRow.scheduleId} before departure because ${blockerReasons.join(", ")}.`,
          {
            flightLegId: legRow.flightLegId,
            blockerReasons,
          },
        );
        batchOutcome.criticalAlertTriggered = true;
        return;
      }

      if (assignedQualificationGroup) {
        setNamedPilotAssignmentsInFlight(legRow.scheduleId, assignedQualificationGroup, eventTimeUtc);
      }

      dependencies.saveDatabase.run(
        `UPDATE flight_leg
        SET leg_state = 'in_progress',
            actual_departure_utc = $actual_departure_utc
        WHERE flight_leg_id = $flight_leg_id`,
        {
          $actual_departure_utc: eventTimeUtc,
          $flight_leg_id: legRow.flightLegId,
        },
      );

      dependencies.saveDatabase.run(
        `UPDATE company_aircraft
        SET status_input = 'in_flight',
            dispatch_available = 0
        WHERE aircraft_id = $aircraft_id`,
        { $aircraft_id: legRow.aircraftId },
      );

      if (legRow.linkedCompanyContractId && legRow.contractState === "assigned") {
        dependencies.saveDatabase.run(
          `UPDATE company_contract
          SET contract_state = 'active'
          WHERE company_contract_id = $company_contract_id`,
          { $company_contract_id: legRow.linkedCompanyContractId },
        );
        changedAggregateIds.add(legRow.linkedCompanyContractId);
      }

      markScheduledEventProcessed(scheduledEvent.scheduledEventId);
      insertEventLog(
        eventTimeUtc,
        "flight_leg_departed",
        "flight_leg",
        legRow.flightLegId,
        "info",
        `Flight leg ${legRow.flightLegId} departed ${legRow.originAirportId}.`,
        {
          aircraftId: legRow.aircraftId,
          scheduleId: legRow.scheduleId,
          destinationAirportId: legRow.destinationAirportId,
          linkedCompanyContractId: legRow.linkedCompanyContractId ?? undefined,
        },
      );

      changedAggregateIds.add(legRow.flightLegId);
      changedAggregateIds.add(legRow.scheduleId);
      changedAggregateIds.add(legRow.aircraftId);
    };

    const processArrivalEvent = (scheduledEvent: ScheduledEventRow, batchOutcome: MutableBatchOutcome): void => {
      const eventTimeUtc = scheduledEvent.scheduledTimeUtc;
      const payload = parseFlightEventPayload(scheduledEvent.payloadJson);

      if (!payload) {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        insertEventLog(
          eventTimeUtc,
          "scheduled_event_invalid",
          "scheduled_event",
          scheduledEvent.scheduledEventId,
          "critical",
          `Scheduled arrival event ${scheduledEvent.scheduledEventId} is missing its flight-leg payload.`,
        );
        batchOutcome.criticalAlertTriggered = true;
        return;
      }

      const legRow = loadFlightLegExecution(payload.flightLegId);

      if (!legRow) {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        insertEventLog(
          eventTimeUtc,
          "scheduled_event_invalid",
          "scheduled_event",
          scheduledEvent.scheduledEventId,
          "critical",
          `Scheduled arrival event ${scheduledEvent.scheduledEventId} could not resolve flight leg ${payload.flightLegId}.`,
          {
            flightLegId: payload.flightLegId,
            scheduleId: payload.scheduleId,
          },
        );
        batchOutcome.criticalAlertTriggered = true;
        return;
      }

      if (legRow.legState === "completed") {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        return;
      }

      if (legRow.legState === "failed" || legRow.scheduleState === "blocked") {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        return;
      }

      if (legRow.legState !== "in_progress") {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        markScheduleBlocked(
          eventTimeUtc,
          legRow.scheduleId,
          legRow.aircraftId,
          legRow.flightLegId,
          `Blocked schedule ${legRow.scheduleId} on arrival because flight leg ${legRow.flightLegId} never entered an in-progress state.`,
          {
            flightLegId: legRow.flightLegId,
            legState: legRow.legState,
          },
        );
        batchOutcome.criticalAlertTriggered = true;
        return;
      }

      const aircraftModel = dependencies.aircraftReference.findModel(legRow.aircraftModelId);
      if (!aircraftModel) {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        markScheduleBlocked(
          eventTimeUtc,
          legRow.scheduleId,
          legRow.aircraftId,
          legRow.flightLegId,
          `Blocked schedule ${legRow.scheduleId} because aircraft model ${legRow.aircraftModelId} is missing from the reference catalog.`,
        );
        batchOutcome.criticalAlertTriggered = true;
        return;
      }
      const assignedQualificationGroup = legRow.assignedQualificationGroup ?? aircraftModel.pilotQualificationGroup;

      const maintenanceProgram = loadMaintenanceProgram(legRow.aircraftId);
      if (!maintenanceProgram) {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        markScheduleBlocked(
          eventTimeUtc,
          legRow.scheduleId,
          legRow.aircraftId,
          legRow.flightLegId,
          `Blocked schedule ${legRow.scheduleId} because aircraft ${legRow.aircraftId} is missing maintenance program state.`,
        );
        batchOutcome.criticalAlertTriggered = true;
        return;
      }
      const durationHours = hoursBetween(legRow.actualDepartureUtc ?? legRow.plannedDepartureUtc, eventTimeUtc);
      const updatedConditionValue = Math.max(
        0,
        Number((legRow.conditionValue - (durationHours * 0.0125 + 0.006)).toFixed(4)),
      );
      const updatedHoursToService = Number((maintenanceProgram.hoursToService - durationHours).toFixed(2));
      const updatedHoursSinceInspection = Number((maintenanceProgram.hoursSinceInspection + durationHours).toFixed(2));
      const updatedCyclesSinceInspection = maintenanceProgram.cyclesSinceInspection + 1;
      const maintenanceStatus = deriveMaintenanceStatus(updatedHoursToService, updatedConditionValue);
      const updatedAirframeHoursTotal = Number((legRow.airframeHoursTotal + durationHours).toFixed(2));
      const updatedAirframeCyclesTotal = legRow.airframeCyclesTotal + 1;
      const operatingCostAmount = Math.round(
        durationHours * (aircraftModel.variableOperatingCostPerHourUsd + aircraftModel.maintenanceReservePerHourUsd)
        + 250,
      ) * -1;

      dependencies.saveDatabase.run(
        `UPDATE flight_leg
        SET leg_state = 'completed',
            actual_arrival_utc = $actual_arrival_utc
        WHERE flight_leg_id = $flight_leg_id`,
        {
          $actual_arrival_utc: eventTimeUtc,
          $flight_leg_id: legRow.flightLegId,
        },
      );

      dependencies.saveDatabase.run(
        `UPDATE labor_allocation
        SET status = 'consumed'
        WHERE schedule_id = $schedule_id
          AND status = 'reserved'
          AND reserved_to_utc <= $reserved_to_utc`,
        {
          $schedule_id: legRow.scheduleId,
          $reserved_to_utc: eventTimeUtc,
        },
      );

      dependencies.saveDatabase.run(
        `UPDATE maintenance_program_state
        SET condition_band_input = $condition_band_input,
            hours_since_inspection = $hours_since_inspection,
            cycles_since_inspection = $cycles_since_inspection,
            hours_to_service = $hours_to_service,
            maintenance_state_input = $maintenance_state_input,
            aog_flag = $aog_flag,
            updated_at_utc = $updated_at_utc
        WHERE aircraft_id = $aircraft_id`,
        {
          $condition_band_input: maintenanceStatus.conditionBandInput,
          $hours_since_inspection: updatedHoursSinceInspection,
          $cycles_since_inspection: updatedCyclesSinceInspection,
          $hours_to_service: updatedHoursToService,
          $maintenance_state_input: maintenanceStatus.maintenanceStateInput,
          $aog_flag: maintenanceStatus.aogFlag,
          $updated_at_utc: eventTimeUtc,
          $aircraft_id: legRow.aircraftId,
        },
      );

      insertLedgerEntry(
        eventTimeUtc,
        "flight_operating_cost",
        operatingCostAmount,
        "flight_leg",
        legRow.flightLegId,
        `Operated flight leg ${legRow.flightLegId} from ${legRow.originAirportId} to ${legRow.destinationAirportId}.`,
        {
          aircraftId: legRow.aircraftId,
          scheduleId: legRow.scheduleId,
          durationHours: Number(durationHours.toFixed(2)),
        },
      );

      const contractPilotUsageRows = loadContractPilotUsage(
        legRow.scheduleId,
        assignedQualificationGroup,
        eventTimeUtc,
      );

      for (const contractPilot of contractPilotUsageRows) {
        const usageChargeAmount = Math.round(durationHours * contractPilot.variableCostRate) * -1;
        const usageMetadata: JsonObject = {
          namedPilotId: contractPilot.namedPilotId,
          staffingPackageId: contractPilot.staffingPackageId,
          scheduleId: legRow.scheduleId,
          flightLegId: legRow.flightLegId,
          qualificationGroup: assignedQualificationGroup,
          durationHours: Number(durationHours.toFixed(2)),
          variableCostRate: contractPilot.variableCostRate,
        };
        const usageLedgerEntryId = insertLedgerEntry(
          eventTimeUtc,
          "contract_staffing_usage",
          usageChargeAmount,
          "staffing_package",
          contractPilot.staffingPackageId,
          `Billed contract pilot ${contractPilot.displayName} for completed leg ${legRow.flightLegId}.`,
          usageMetadata,
        );

        insertEventLog(
          eventTimeUtc,
          "contract_staffing_usage_billed",
          "staffing_package",
          contractPilot.staffingPackageId,
          "info",
          `Billed ${contractPilot.displayName} for ${Number(durationHours.toFixed(2))} completed contract pilot hours.`,
          {
            ...usageMetadata,
            ledgerEntryId: usageLedgerEntryId ?? undefined,
            usageChargeAmount: Math.abs(usageChargeAmount),
          },
        );

        changedAggregateIds.add(contractPilot.namedPilotId);
        changedAggregateIds.add(contractPilot.staffingPackageId);
      }

      if (legRow.linkedCompanyContractId && ["assigned", "active"].includes(legRow.contractState ?? "")) {
        const penaltyModel = parseJsonObject(legRow.penaltyModelJson) as ContractPenaltyModel | undefined;
        const lateCompletionPenaltyPercent = typeof penaltyModel?.lateCompletionPenaltyPercent === "number"
          ? penaltyModel.lateCompletionPenaltyPercent
          : 25;
        const arrivedLate = eventTimeUtc > String(legRow.deadlineUtc);
        const revenueAmount = arrivedLate
          ? Math.round((legRow.acceptedPayoutAmount ?? 0) * (1 - lateCompletionPenaltyPercent / 100))
          : Math.round(legRow.acceptedPayoutAmount ?? 0);
        const resolvedContractState = arrivedLate ? "late_completed" : "completed";

        dependencies.saveDatabase.run(
          `UPDATE company_contract
          SET contract_state = $contract_state
              ,assigned_aircraft_id = NULL
          WHERE company_contract_id = $company_contract_id`,
          {
            $contract_state: resolvedContractState,
            $company_contract_id: legRow.linkedCompanyContractId,
          },
        );

        insertLedgerEntry(
          eventTimeUtc,
          "contract_revenue",
          revenueAmount,
          "company_contract",
          legRow.linkedCompanyContractId,
          arrivedLate
            ? `Completed contract ${legRow.linkedCompanyContractId} after deadline.`
            : `Completed contract ${legRow.linkedCompanyContractId}.`,
          {
            aircraftId: legRow.aircraftId,
            flightLegId: legRow.flightLegId,
            resolvedContractState,
          },
        );

        insertEventLog(
          eventTimeUtc,
          arrivedLate ? "contract_late_completed" : "contract_completed",
          "company_contract",
          legRow.linkedCompanyContractId,
          arrivedLate ? "warning" : "info",
          arrivedLate
            ? `Contract ${legRow.linkedCompanyContractId} completed late.`
            : `Contract ${legRow.linkedCompanyContractId} completed successfully.`,
          {
            aircraftId: legRow.aircraftId,
            flightLegId: legRow.flightLegId,
            payoutAmount: revenueAmount,
          },
        );

        batchOutcome.resolvedContractIds.add(legRow.linkedCompanyContractId);
        resolvedContractIds.add(legRow.linkedCompanyContractId);
        changedAggregateIds.add(legRow.linkedCompanyContractId);
      }

      const remainingLegsRow = dependencies.saveDatabase.getOne<CountRow>(
        `SELECT COUNT(*) AS countValue
        FROM flight_leg
        WHERE schedule_id = $schedule_id
          AND leg_state IN ('planned', 'in_progress')`,
        { $schedule_id: legRow.scheduleId },
      );
      const remainingLegCount = remainingLegsRow?.countValue ?? 0;
      const aircraftGroundStatus = remainingLegCount === 0
        ? (maintenanceStatus.maintenanceStateInput === "current" || maintenanceStatus.maintenanceStateInput === "due_soon"
            ? { statusInput: "idle", dispatchAvailable: 1, activeScheduleId: null as string | null }
            : { statusInput: "maintenance", dispatchAvailable: 0, activeScheduleId: null as string | null })
        : { statusInput: "scheduled", dispatchAvailable: 0, activeScheduleId: legRow.scheduleId };

      if (remainingLegCount === 0) {
        completeNamedPilotAssignments(
          legRow.scheduleId,
          legRow.destinationAirportId,
          eventTimeUtc,
        );
      } else {
        setNamedPilotAssignmentsReserved(
          legRow.scheduleId,
          assignedQualificationGroup,
          legRow.destinationAirportId,
          eventTimeUtc,
        );
      }

      dependencies.saveDatabase.run(
        `UPDATE company_aircraft
        SET current_airport_id = $current_airport_id,
            airframe_hours_total = $airframe_hours_total,
            airframe_cycles_total = $airframe_cycles_total,
            condition_value = $condition_value,
            status_input = $status_input,
            dispatch_available = $dispatch_available,
            active_schedule_id = $active_schedule_id
        WHERE aircraft_id = $aircraft_id`,
        {
          $current_airport_id: legRow.destinationAirportId,
          $airframe_hours_total: updatedAirframeHoursTotal,
          $airframe_cycles_total: updatedAirframeCyclesTotal,
          $condition_value: updatedConditionValue,
          $status_input: aircraftGroundStatus.statusInput,
          $dispatch_available: aircraftGroundStatus.dispatchAvailable,
          $active_schedule_id: aircraftGroundStatus.activeScheduleId,
          $aircraft_id: legRow.aircraftId,
        },
      );

      if (remainingLegCount === 0) {
        dependencies.saveDatabase.run(
          `UPDATE aircraft_schedule
          SET schedule_state = 'completed',
              updated_at_utc = $updated_at_utc
          WHERE schedule_id = $schedule_id`,
          {
            $updated_at_utc: eventTimeUtc,
            $schedule_id: legRow.scheduleId,
          },
        );

        if (aircraftGroundStatus.dispatchAvailable === 1) {
          batchOutcome.availableAircraftIds.add(legRow.aircraftId);
          availableAircraftIds.add(legRow.aircraftId);
        }
      }

      markScheduledEventProcessed(scheduledEvent.scheduledEventId);
      insertEventLog(
        eventTimeUtc,
        "flight_leg_arrived",
        "flight_leg",
        legRow.flightLegId,
        "info",
        `Flight leg ${legRow.flightLegId} arrived at ${legRow.destinationAirportId}.`,
        {
          aircraftId: legRow.aircraftId,
          scheduleId: legRow.scheduleId,
          durationHours: Number(durationHours.toFixed(2)),
          maintenanceStateInput: maintenanceStatus.maintenanceStateInput,
          dispatchAvailable: aircraftGroundStatus.dispatchAvailable === 1,
        },
      );

      batchOutcome.completedLegIds.add(legRow.flightLegId);
      completedLegIds.add(legRow.flightLegId);
      changedAggregateIds.add(legRow.flightLegId);
      changedAggregateIds.add(legRow.scheduleId);
      changedAggregateIds.add(legRow.aircraftId);
    };

    const processContractDeadlineEvent = (scheduledEvent: ScheduledEventRow, batchOutcome: MutableBatchOutcome): void => {
      const eventTimeUtc = scheduledEvent.scheduledTimeUtc;
      const companyContractId = scheduledEvent.companyContractId;

      if (!companyContractId) {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        insertEventLog(
          eventTimeUtc,
          "scheduled_event_invalid",
          "scheduled_event",
          scheduledEvent.scheduledEventId,
          "critical",
          `Scheduled deadline event ${scheduledEvent.scheduledEventId} is missing its contract reference.`,
        );
        batchOutcome.criticalAlertTriggered = true;
        return;
      }
      const contractRow = dependencies.saveDatabase.getOne<ContractDeadlineRow>(
        `SELECT
          company_contract_id AS companyContractId,
          contract_state AS contractState,
          accepted_payout_amount AS acceptedPayoutAmount,
          penalty_model_json AS penaltyModelJson,
          assigned_aircraft_id AS assignedAircraftId,
          deadline_utc AS deadlineUtc
        FROM company_contract
        WHERE company_id = $company_id
          AND company_contract_id = $company_contract_id
        LIMIT 1`,
        {
          $company_id: companyContext!.companyId,
          $company_contract_id: companyContractId,
        },
      );

      if (!contractRow) {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        insertEventLog(
          eventTimeUtc,
          "scheduled_event_invalid",
          "scheduled_event",
          scheduledEvent.scheduledEventId,
          "critical",
          `Scheduled deadline event ${scheduledEvent.scheduledEventId} could not resolve contract ${companyContractId}.`,
        );
        batchOutcome.criticalAlertTriggered = true;
        return;
      }

      if (["completed", "late_completed", "failed", "cancelled"].includes(contractRow.contractState)) {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        return;
      }

      const penaltyModel = parseJsonObject(contractRow.penaltyModelJson) as ContractPenaltyModel | undefined;
      const failurePenaltyAmount = typeof penaltyModel?.failurePenaltyAmount === "number"
        ? penaltyModel.failurePenaltyAmount
        : Math.round(contractRow.acceptedPayoutAmount * 0.22);
      const dispatchedLegRow = dependencies.saveDatabase.getOne<CountRow>(
        `SELECT COUNT(*) AS countValue
        FROM flight_leg AS fl
        JOIN aircraft_schedule AS s ON s.schedule_id = fl.schedule_id
        WHERE fl.linked_company_contract_id = $company_contract_id
          AND s.schedule_state = 'committed'
          AND fl.leg_state IN ('in_progress', 'completed')`,
        { $company_contract_id: contractRow.companyContractId },
      );

      if ((dispatchedLegRow?.countValue ?? 0) > 0) {
        markScheduledEventProcessed(scheduledEvent.scheduledEventId);
        return;
      }

      dependencies.saveDatabase.run(
        `UPDATE company_contract
        SET contract_state = 'failed'
            ,assigned_aircraft_id = NULL
        WHERE company_contract_id = $company_contract_id`,
        { $company_contract_id: contractRow.companyContractId },
      );

      insertLedgerEntry(
        eventTimeUtc,
        "contract_failure_penalty",
        failurePenaltyAmount * -1,
        "company_contract",
        contractRow.companyContractId,
        `Failed contract ${contractRow.companyContractId} at deadline.`,
        {
          assignedAircraftId: contractRow.assignedAircraftId ?? undefined,
          deadlineUtc: contractRow.deadlineUtc,
        },
      );

      markScheduledEventProcessed(scheduledEvent.scheduledEventId);
      insertEventLog(
        eventTimeUtc,
        "contract_failed",
        "company_contract",
        contractRow.companyContractId,
        "critical",
        `Contract ${contractRow.companyContractId} failed at deadline.`,
        {
          assignedAircraftId: contractRow.assignedAircraftId ?? undefined,
          failurePenaltyAmount,
        },
      );

      batchOutcome.criticalAlertTriggered = true;
      batchOutcome.resolvedContractIds.add(contractRow.companyContractId);
      resolvedContractIds.add(contractRow.companyContractId);
      changedAggregateIds.add(contractRow.companyContractId);
    };

    let pilotTransitionCursorUtc = companyContext!.currentTimeUtc;

    const completeDuePilotTraining = (fromUtc: string, toUtc: string): void => {
      const completedTrainingRows = dependencies.saveDatabase.all<CompletedTrainingRow>(
        `SELECT
          np.named_pilot_id AS namedPilotId,
          np.display_name AS displayName,
          sp.qualification_group AS qualificationGroup,
          np.certifications_json AS certificationsJson,
          np.training_program_kind AS trainingProgramKind,
          np.training_target_certification_code AS trainingTargetCertificationCode,
          np.training_started_at_utc AS trainingStartedAtUtc,
          np.training_until_utc AS trainingUntilUtc
        FROM named_pilot AS np
        JOIN staffing_package AS sp ON sp.staffing_package_id = np.staffing_package_id
        WHERE np.company_id = $company_id
          AND np.training_until_utc IS NOT NULL
          AND np.training_until_utc > $from_utc
          AND np.training_until_utc <= $to_utc
        ORDER BY np.training_until_utc ASC, np.named_pilot_id ASC`,
        {
          $company_id: companyContext!.companyId,
          $from_utc: fromUtc,
          $to_utc: toUtc,
        },
      );

      for (const completedTraining of completedTrainingRows) {
        const updatedCertifications =
          completedTraining.trainingProgramKind === "certification" && completedTraining.trainingTargetCertificationCode
            ? applyCertificationTrainingAward(
                parsePilotCertificationsJson(
                  completedTraining.certificationsJson,
                  completedTraining.qualificationGroup,
                ),
                completedTraining.trainingTargetCertificationCode as PilotCertificationCode,
              )
            : parsePilotCertificationsJson(
                completedTraining.certificationsJson,
                completedTraining.qualificationGroup,
              );
        const trainingMessage = completedTraining.trainingProgramKind === "certification"
          && completedTraining.trainingTargetCertificationCode
          ? `${completedTraining.displayName} completed ${completedTraining.trainingTargetCertificationCode} certification training.`
          : `${completedTraining.displayName} completed recurrent training.`;
        dependencies.saveDatabase.run(
          `UPDATE named_pilot
          SET training_program_kind = NULL,
              training_target_certification_code = NULL,
              certifications_json = $certifications_json,
              training_started_at_utc = NULL,
              training_until_utc = NULL,
              updated_at_utc = $updated_at_utc
          WHERE named_pilot_id = $named_pilot_id`,
          {
            $certifications_json: JSON.stringify(updatedCertifications),
            $updated_at_utc: completedTraining.trainingUntilUtc,
            $named_pilot_id: completedTraining.namedPilotId,
          },
        );

        insertEventLog(
          completedTraining.trainingUntilUtc,
          "pilot_training_completed",
          "named_pilot",
          completedTraining.namedPilotId,
          "info",
          trainingMessage,
          {
            qualificationGroup: completedTraining.qualificationGroup,
            trainingProgramKind: completedTraining.trainingProgramKind ?? "recurrent",
            targetCertificationCode: completedTraining.trainingTargetCertificationCode ?? undefined,
            certifications: updatedCertifications,
            trainingStartedAtUtc: completedTraining.trainingStartedAtUtc ?? undefined,
            trainingUntilUtc: completedTraining.trainingUntilUtc,
          },
        );

        changedAggregateIds.add(completedTraining.namedPilotId);
      }
    };

    const completeDuePilotTravel = (fromUtc: string, toUtc: string): void => {
      const completedTravelRows = dependencies.saveDatabase.all<CompletedTravelRow>(
        `SELECT
          named_pilot_id AS namedPilotId,
          display_name AS displayName,
          travel_origin_airport_id AS travelOriginAirportId,
          travel_destination_airport_id AS travelDestinationAirportId,
          travel_started_at_utc AS travelStartedAtUtc,
          travel_until_utc AS travelUntilUtc
        FROM named_pilot
        WHERE company_id = $company_id
          AND travel_until_utc IS NOT NULL
          AND travel_destination_airport_id IS NOT NULL
          AND travel_until_utc > $from_utc
          AND travel_until_utc <= $to_utc
        ORDER BY travel_until_utc ASC, named_pilot_id ASC`,
        {
          $company_id: companyContext!.companyId,
          $from_utc: fromUtc,
          $to_utc: toUtc,
        },
      );

      for (const completedTravel of completedTravelRows) {
        dependencies.saveDatabase.run(
          `UPDATE named_pilot
          SET current_airport_id = $current_airport_id,
              travel_origin_airport_id = NULL,
              travel_destination_airport_id = NULL,
              travel_started_at_utc = NULL,
              travel_until_utc = NULL,
              updated_at_utc = $updated_at_utc
          WHERE named_pilot_id = $named_pilot_id`,
          {
            $current_airport_id: completedTravel.travelDestinationAirportId,
            $updated_at_utc: completedTravel.travelUntilUtc,
            $named_pilot_id: completedTravel.namedPilotId,
          },
        );

        insertEventLog(
          completedTravel.travelUntilUtc,
          "pilot_travel_completed",
          "named_pilot",
          completedTravel.namedPilotId,
          "info",
          `${completedTravel.displayName} arrived at ${completedTravel.travelDestinationAirportId}.`,
          {
            travelOriginAirportId: completedTravel.travelOriginAirportId ?? undefined,
            travelDestinationAirportId: completedTravel.travelDestinationAirportId,
            travelStartedAtUtc: completedTravel.travelStartedAtUtc ?? undefined,
            travelUntilUtc: completedTravel.travelUntilUtc,
          },
        );

        changedAggregateIds.add(completedTravel.namedPilotId);
      }
    };

    const expireDueStaffingPackages = (toUtc: string): void => {
      const expiringPackages = dependencies.saveDatabase.all<ExpiringStaffingPackageRow>(
        `SELECT
          sp.staffing_package_id AS staffingPackageId,
          sp.labor_category AS laborCategory,
          sp.employment_model AS employmentModel,
          sp.qualification_group AS qualificationGroup,
          sp.starts_at_utc AS startsAtUtc,
          sp.ends_at_utc AS endsAtUtc,
          sp.status AS status,
          ro.recurring_obligation_id AS recurringObligationId
        FROM staffing_package AS sp
        LEFT JOIN recurring_obligation AS ro
          ON ro.source_object_type = 'staffing_package'
         AND ro.source_object_id = sp.staffing_package_id
         AND ro.status = 'active'
        WHERE sp.company_id = $company_id
          AND sp.status IN ('pending', 'active')
          AND sp.ends_at_utc IS NOT NULL
          AND sp.ends_at_utc <= $to_utc
        ORDER BY sp.ends_at_utc ASC, sp.staffing_package_id ASC`,
        {
          $company_id: companyContext!.companyId,
          $to_utc: toUtc,
        },
      );

      for (const staffingPackage of expiringPackages) {
        const packagePilots = staffingPackage.laborCategory === "pilot"
          ? dependencies.saveDatabase.all<StaffingPackagePilotRow>(
              `SELECT
                named_pilot_id AS namedPilotId,
                display_name AS displayName
              FROM named_pilot
              WHERE company_id = $company_id
                AND staffing_package_id = $staffing_package_id
              ORDER BY roster_slot_number ASC, named_pilot_id ASC`,
              {
                $company_id: companyContext!.companyId,
                $staffing_package_id: staffingPackage.staffingPackageId,
              },
            )
          : [];

        dependencies.saveDatabase.run(
          `UPDATE staffing_package
          SET status = 'expired'
          WHERE staffing_package_id = $staffing_package_id`,
          { $staffing_package_id: staffingPackage.staffingPackageId },
        );

        if (staffingPackage.recurringObligationId) {
          dependencies.saveDatabase.run(
            `UPDATE recurring_obligation
            SET status = 'expired',
                end_at_utc = COALESCE(end_at_utc, $end_at_utc)
            WHERE recurring_obligation_id = $recurring_obligation_id`,
            {
              $recurring_obligation_id: staffingPackage.recurringObligationId,
              $end_at_utc: staffingPackage.endsAtUtc,
            },
          );
          changedAggregateIds.add(staffingPackage.recurringObligationId);
        }

        if (packagePilots.length > 0) {
          dependencies.saveDatabase.run(
            `UPDATE named_pilot
            SET resting_until_utc = NULL,
                training_program_kind = NULL,
                training_target_certification_code = NULL,
                training_started_at_utc = NULL,
                training_until_utc = NULL,
                travel_origin_airport_id = NULL,
                travel_destination_airport_id = NULL,
                travel_started_at_utc = NULL,
                travel_until_utc = NULL,
                updated_at_utc = $updated_at_utc
            WHERE company_id = $company_id
              AND staffing_package_id = $staffing_package_id`,
            {
              $company_id: companyContext!.companyId,
              $staffing_package_id: staffingPackage.staffingPackageId,
              $updated_at_utc: staffingPackage.endsAtUtc,
            },
          );
        }

        const employmentLabel = humanizeIdentifier(staffingPackage.employmentModel);
        const laborLabel = humanizeIdentifier(staffingPackage.laborCategory);
        const qualificationLabel = humanizeIdentifier(staffingPackage.qualificationGroup);
        insertEventLog(
          staffingPackage.endsAtUtc,
          "staffing_package_expired",
          "staffing_package",
          staffingPackage.staffingPackageId,
          "info",
          `${employmentLabel.charAt(0).toUpperCase() + employmentLabel.slice(1)} ${laborLabel} coverage for ${qualificationLabel} expired.`,
          {
            laborCategory: staffingPackage.laborCategory,
            employmentModel: staffingPackage.employmentModel,
            qualificationGroup: staffingPackage.qualificationGroup,
            startsAtUtc: staffingPackage.startsAtUtc,
            endsAtUtc: staffingPackage.endsAtUtc,
            previousStatus: staffingPackage.status,
            recurringObligationId: staffingPackage.recurringObligationId ?? undefined,
            namedPilotIds: packagePilots.map((pilot) => pilot.namedPilotId),
          },
        );

        changedAggregateIds.add(staffingPackage.staffingPackageId);
        packagePilots.forEach((pilot) => changedAggregateIds.add(pilot.namedPilotId));
      }
    };

    const activateDueStaffingPackages = (toUtc: string): void => {
      const activatingPackages = dependencies.saveDatabase.all<ActivatingStaffingPackageRow>(
        `SELECT
          staffing_package_id AS staffingPackageId,
          labor_category AS laborCategory,
          employment_model AS employmentModel,
          qualification_group AS qualificationGroup,
          starts_at_utc AS startsAtUtc,
          ends_at_utc AS endsAtUtc
        FROM staffing_package
        WHERE company_id = $company_id
          AND status = 'pending'
          AND starts_at_utc <= $to_utc
        ORDER BY starts_at_utc ASC, staffing_package_id ASC`,
        {
          $company_id: companyContext!.companyId,
          $to_utc: toUtc,
        },
      );

      for (const staffingPackage of activatingPackages) {
        const packagePilots = staffingPackage.laborCategory === "pilot"
          ? dependencies.saveDatabase.all<StaffingPackagePilotRow>(
              `SELECT
                named_pilot_id AS namedPilotId,
                display_name AS displayName
              FROM named_pilot
              WHERE company_id = $company_id
                AND staffing_package_id = $staffing_package_id
              ORDER BY roster_slot_number ASC, named_pilot_id ASC`,
              {
                $company_id: companyContext!.companyId,
                $staffing_package_id: staffingPackage.staffingPackageId,
              },
            )
          : [];

        dependencies.saveDatabase.run(
          `UPDATE staffing_package
          SET status = 'active'
          WHERE staffing_package_id = $staffing_package_id`,
          { $staffing_package_id: staffingPackage.staffingPackageId },
        );

        if (packagePilots.length > 0) {
          dependencies.saveDatabase.run(
            `UPDATE named_pilot
            SET updated_at_utc = $updated_at_utc
            WHERE company_id = $company_id
              AND staffing_package_id = $staffing_package_id`,
            {
              $company_id: companyContext!.companyId,
              $staffing_package_id: staffingPackage.staffingPackageId,
              $updated_at_utc: staffingPackage.startsAtUtc,
            },
          );
        }

        const employmentLabel = humanizeIdentifier(staffingPackage.employmentModel);
        const laborLabel = humanizeIdentifier(staffingPackage.laborCategory);
        const qualificationLabel = humanizeIdentifier(staffingPackage.qualificationGroup);
        insertEventLog(
          staffingPackage.startsAtUtc,
          "staffing_package_activated",
          "staffing_package",
          staffingPackage.staffingPackageId,
          "info",
          `${employmentLabel.charAt(0).toUpperCase() + employmentLabel.slice(1)} ${laborLabel} coverage for ${qualificationLabel} activated.`,
          {
            laborCategory: staffingPackage.laborCategory,
            employmentModel: staffingPackage.employmentModel,
            qualificationGroup: staffingPackage.qualificationGroup,
            startsAtUtc: staffingPackage.startsAtUtc,
            endsAtUtc: staffingPackage.endsAtUtc ?? undefined,
            namedPilotIds: packagePilots.map((pilot) => pilot.namedPilotId),
          },
        );

        changedAggregateIds.add(staffingPackage.staffingPackageId);
        packagePilots.forEach((pilot) => changedAggregateIds.add(pilot.namedPilotId));
      }
    };

    const settleDueRecurringObligations = (toUtc: string): void => {
      while (true) {
        const recurringObligation = dependencies.saveDatabase.getOne<DueRecurringObligationRow>(
          `SELECT
            recurring_obligation_id AS recurringObligationId,
            obligation_type AS obligationType,
            source_object_type AS sourceObjectType,
            source_object_id AS sourceObjectId,
            amount AS amount,
            cadence AS cadence,
            next_due_at_utc AS nextDueAtUtc,
            end_at_utc AS endAtUtc
          FROM recurring_obligation
          WHERE company_id = $company_id
            AND status = 'active'
            AND next_due_at_utc <= $to_utc
          ORDER BY next_due_at_utc ASC, recurring_obligation_id ASC
          LIMIT 1`,
          {
            $company_id: companyContext!.companyId,
            $to_utc: toUtc,
          },
        );

        if (!recurringObligation) {
          return;
        }

        if (
          recurringObligation.endAtUtc
          && Date.parse(recurringObligation.nextDueAtUtc) > Date.parse(recurringObligation.endAtUtc)
        ) {
          dependencies.saveDatabase.run(
            `UPDATE recurring_obligation
            SET status = 'completed'
            WHERE recurring_obligation_id = $recurring_obligation_id`,
            { $recurring_obligation_id: recurringObligation.recurringObligationId },
          );
          changedAggregateIds.add(recurringObligation.recurringObligationId);
          changedAggregateIds.add(recurringObligation.sourceObjectId);
          continue;
        }

        const paymentMetadata: JsonObject = {
          recurringObligationId: recurringObligation.recurringObligationId,
          obligationType: recurringObligation.obligationType,
          cadence: recurringObligation.cadence,
          dueAtUtc: recurringObligation.nextDueAtUtc,
        };
        const ledgerEntryId = insertLedgerEntry(
          recurringObligation.nextDueAtUtc,
          recurringObligationEntryType(recurringObligation.obligationType),
          recurringObligation.amount * -1,
          recurringObligation.sourceObjectType,
          recurringObligation.sourceObjectId,
          recurringObligationDescription(recurringObligation.obligationType),
          paymentMetadata,
        );
        const nextDueAtUtc = addCadenceToUtc(recurringObligation.nextDueAtUtc, recurringObligation.cadence);
        const completesAfterCollection = recurringObligation.endAtUtc !== null
          && Date.parse(nextDueAtUtc) > Date.parse(recurringObligation.endAtUtc);

        dependencies.saveDatabase.run(
          `UPDATE recurring_obligation
          SET next_due_at_utc = $next_due_at_utc,
              status = $status
          WHERE recurring_obligation_id = $recurring_obligation_id`,
          {
            $next_due_at_utc: completesAfterCollection
              ? recurringObligation.endAtUtc
              : nextDueAtUtc,
            $status: completesAfterCollection ? "completed" : "active",
            $recurring_obligation_id: recurringObligation.recurringObligationId,
          },
        );

        insertEventLog(
          recurringObligation.nextDueAtUtc,
          "recurring_obligation_collected",
          "recurring_obligation",
          recurringObligation.recurringObligationId,
          "info",
          `${humanizeIdentifier(recurringObligation.obligationType).replace(/^./, (value) => value.toUpperCase())} payment of ${Math.abs(recurringObligation.amount)} collected.`,
          {
            ...paymentMetadata,
            ledgerEntryId: ledgerEntryId ?? undefined,
            amount: recurringObligation.amount,
            nextDueAtUtc: completesAfterCollection ? undefined : nextDueAtUtc,
            completedAtUtc: completesAfterCollection ? recurringObligation.nextDueAtUtc : undefined,
          },
        );

        changedAggregateIds.add(recurringObligation.recurringObligationId);
        changedAggregateIds.add(recurringObligation.sourceObjectId);
      }
    };

    const resolveDuePilotTransitions = (toUtc: string): void => {
      if (new Date(toUtc).getTime() <= new Date(pilotTransitionCursorUtc).getTime()) {
        return;
      }

      completeDuePilotTraining(pilotTransitionCursorUtc, toUtc);
      completeDuePilotTravel(pilotTransitionCursorUtc, toUtc);
      pilotTransitionCursorUtc = toUtc;
    };

    while (true) {
      const nextScheduledEvent = dependencies.saveDatabase.getOne<ScheduledEventRow>(
        `SELECT
          scheduled_event_id AS scheduledEventId,
          event_type AS eventType,
          scheduled_time_utc AS scheduledTimeUtc,
          status AS status,
          aircraft_id AS aircraftId,
          company_contract_id AS companyContractId,
          maintenance_task_id AS maintenanceTaskId,
          payload_json AS payloadJson
        FROM scheduled_event
        WHERE save_id = $save_id
          AND status = 'pending'
          AND scheduled_time_utc <= $target_time_utc
        ORDER BY scheduled_time_utc ASC,
          CASE event_type
            WHEN 'flight_leg_departure_due' THEN 0
            WHEN 'flight_leg_arrival_due' THEN 1
            WHEN 'contract_deadline_check' THEN 2
            ELSE 99
          END ASC,
          scheduled_event_id ASC
        LIMIT 1`,
        {
          $save_id: command.saveId,
          $target_time_utc: normalizedTargetTimeUtc!,
        },
      );

      if (!nextScheduledEvent) {
        advancedToUtc = normalizedTargetTimeUtc!;
        stoppedBecause = "target_time";
        break;
      }

      resolveDuePilotTransitions(nextScheduledEvent.scheduledTimeUtc);
      activateDueStaffingPackages(nextScheduledEvent.scheduledTimeUtc);
      settleDueRecurringObligations(nextScheduledEvent.scheduledTimeUtc);

      const dueEvents = dependencies.saveDatabase.all<ScheduledEventRow>(
        `SELECT
          scheduled_event_id AS scheduledEventId,
          event_type AS eventType,
          scheduled_time_utc AS scheduledTimeUtc,
          status AS status,
          aircraft_id AS aircraftId,
          company_contract_id AS companyContractId,
          maintenance_task_id AS maintenanceTaskId,
          payload_json AS payloadJson
        FROM scheduled_event
        WHERE save_id = $save_id
          AND status = 'pending'
          AND scheduled_time_utc = $scheduled_time_utc
        ORDER BY CASE event_type
          WHEN 'flight_leg_departure_due' THEN 0
          WHEN 'flight_leg_arrival_due' THEN 1
          WHEN 'contract_deadline_check' THEN 2
          ELSE 99
        END ASC,
        scheduled_event_id ASC`,
        {
          $save_id: command.saveId,
          $scheduled_time_utc: nextScheduledEvent.scheduledTimeUtc,
        },
      );

      const batchOutcome: MutableBatchOutcome = {
        criticalAlertTriggered: false,
        completedLegIds: new Set<string>(),
        resolvedContractIds: new Set<string>(),
        availableAircraftIds: new Set<string>(),
      };

      for (const dueEvent of dueEvents) {
        processedEventTypes.push(dueEvent.eventType);
        processedEventCount += 1;

        switch (dueEvent.eventType) {
          case "flight_leg_departure_due":
            processDepartureEvent(dueEvent, batchOutcome);
            break;
          case "flight_leg_arrival_due":
            processArrivalEvent(dueEvent, batchOutcome);
            break;
          case "contract_deadline_check":
            processContractDeadlineEvent(dueEvent, batchOutcome);
            break;
          default:
            markScheduledEventProcessed(dueEvent.scheduledEventId);
            insertEventLog(
              dueEvent.scheduledTimeUtc,
              "scheduled_event_skipped",
              "scheduled_event",
              dueEvent.scheduledEventId,
              "warning",
              `Skipped unsupported scheduled event type ${dueEvent.eventType}.`,
            );
            break;
        }
      }

      expireDueStaffingPackages(nextScheduledEvent.scheduledTimeUtc);
      advancedToUtc = nextScheduledEvent.scheduledTimeUtc;
      const stopReason = determineStopReason(
        stopConditions,
        batchOutcome,
        command.payload.selectedAircraftId,
        command.payload.selectedContractId,
      );

      if (stopReason) {
        stoppedBecause = stopReason;
        break;
      }
    }

    resolveDuePilotTransitions(advancedToUtc);
    activateDueStaffingPackages(advancedToUtc);
    settleDueRecurringObligations(advancedToUtc);
    expireDueStaffingPackages(advancedToUtc);

    const summary: JsonObject = {
      processedEventTypes,
      completedLegIds: [...completedLegIds],
      resolvedContractIds: [...resolvedContractIds],
      availableAircraftIds: [...availableAircraftIds],
      requestedTargetTimeUtc: normalizedTargetTimeUtc!,
      stopConditions,
    };

    if (command.payload.selectedAircraftId) {
      summary.selectedAircraftId = command.payload.selectedAircraftId;
    }

    if (command.payload.selectedContractId) {
      summary.selectedContractId = command.payload.selectedContractId;
    }

    const advanceResult: JsonObject = {
      advancedToUtc,
      stoppedBecause,
      processedEventCount,
      summary,
    };

    dependencies.saveDatabase.run(
      `UPDATE game_clock
      SET current_time_utc = $current_time_utc,
          last_advanced_at_utc = $last_advanced_at_utc,
          last_advance_result_json = $last_advance_result_json
      WHERE save_id = $save_id`,
      {
        $current_time_utc: advancedToUtc,
        $last_advanced_at_utc: advancedToUtc,
        $last_advance_result_json: JSON.stringify(advanceResult),
        $save_id: command.saveId,
      },
    );

    insertEventLog(
      advancedToUtc,
      "time_advanced",
      "save_game",
      command.saveId,
      "info",
      `Advanced time to ${advancedToUtc}.`,
      advanceResult,
    );

    dependencies.saveDatabase.run(
      `INSERT INTO command_log (
        command_id,
        save_id,
        command_name,
        actor_type,
        issued_at_utc,
        completed_at_utc,
        status,
        payload_json
      ) VALUES (
        $command_id,
        $save_id,
        $command_name,
        $actor_type,
        $issued_at_utc,
        $completed_at_utc,
        'completed',
        $payload_json
      )`,
      {
        $command_id: command.commandId,
        $save_id: command.saveId,
        $command_name: command.commandName,
        $actor_type: command.actorType,
        $issued_at_utc: command.issuedAtUtc,
        $completed_at_utc: advancedToUtc,
        $payload_json: JSON.stringify({
          ...command.payload,
          result: advanceResult,
        }),
      },
    );

    return {
      advancedToUtc,
      stoppedBecause,
      processedEventCount,
      emittedEventIds,
      emittedLedgerEntryIds,
      changedAggregateIds: [...changedAggregateIds],
      summary,
    };
  });

  await dependencies.saveDatabase.persist();

  const warnings = transactionResult.stoppedBecause === "critical_alert"
    ? ["AdvanceTime stopped because a critical operational alert was raised."]
    : [];

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: transactionResult.changedAggregateIds,
    validationMessages: [
      `Advanced time to ${transactionResult.advancedToUtc}.`,
      `Stopped because ${transactionResult.stoppedBecause}.`,
      ...warnings,
    ],
    hardBlockers: [],
    warnings,
    emittedEventIds: transactionResult.emittedEventIds,
    emittedLedgerEntryIds: transactionResult.emittedLedgerEntryIds,
    metadata: {
      advancedToUtc: transactionResult.advancedToUtc,
      stoppedBecause: transactionResult.stoppedBecause,
      processedEventCount: transactionResult.processedEventCount,
      summary: transactionResult.summary,
    },
  };
}
