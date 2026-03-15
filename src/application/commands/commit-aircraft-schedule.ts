import type { CommandResult, CommitAircraftScheduleCommand } from "./types.js";
import { createPrefixedId } from "./utils.js";
import { validateProposedSchedule, type ProposedScheduleInput } from "../dispatch/schedule-validation.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";
import type { AirportReferenceRepository } from "../../infrastructure/reference/airport-reference.js";
import type { FlightLegType } from "../../domain/dispatch/types.js";
import type { JsonObject } from "../../domain/common/primitives.js";

interface CommitAircraftScheduleDependencies {
  saveDatabase: SqliteFileDatabase;
  airportReference: AirportReferenceRepository;
  aircraftReference: AircraftReferenceRepository;
}

interface DraftScheduleRow extends Record<string, unknown> {
  scheduleId: string;
  aircraftId: string;
  scheduleKind: "operational" | "maintenance_only";
  isDraft: number;
}

interface DraftFlightLegRow extends Record<string, unknown> {
  sequenceNumber: number;
  legType: FlightLegType;
  linkedCompanyContractId: string | null;
  originAirportId: string;
  destinationAirportId: string;
  plannedDepartureUtc: string;
  plannedArrivalUtc: string;
  assignedQualificationGroup: string | null;
  payloadSnapshotJson: string | null;
}

interface ContractDeadlineRow extends Record<string, unknown> {
  companyContractId: string;
  deadlineUtc: string;
}

function parsePayloadSnapshot(rawValue: string | null): JsonObject | undefined {
  if (!rawValue) {
    return undefined;
  }

  return JSON.parse(rawValue) as JsonObject;
}

export async function handleCommitAircraftSchedule(
  command: CommitAircraftScheduleCommand,
  dependencies: CommitAircraftScheduleDependencies,
): Promise<CommandResult> {
  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);

  if (!companyContext) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [`Save ${command.saveId} does not have an active company.`],
      hardBlockers: [`Save ${command.saveId} does not have an active company.`],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const scheduleRow = dependencies.saveDatabase.getOne<DraftScheduleRow>(
    `SELECT
      s.schedule_id AS scheduleId,
      s.aircraft_id AS aircraftId,
      s.schedule_kind AS scheduleKind,
      s.is_draft AS isDraft
    FROM aircraft_schedule AS s
    JOIN company_aircraft AS ca ON ca.aircraft_id = s.aircraft_id
    WHERE s.schedule_id = $schedule_id
      AND ca.company_id = $company_id
    LIMIT 1`,
    {
      $schedule_id: command.payload.scheduleId,
      $company_id: companyContext.companyId,
    },
  );

  if (!scheduleRow) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [`Schedule ${command.payload.scheduleId} was not found.`],
      hardBlockers: [`Schedule ${command.payload.scheduleId} was not found.`],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  if (scheduleRow.isDraft !== 1) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [`Schedule ${command.payload.scheduleId} is not a draft schedule.`],
      hardBlockers: [`Schedule ${command.payload.scheduleId} is not a draft schedule.`],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const legRows = dependencies.saveDatabase.all<DraftFlightLegRow>(
    `SELECT
      sequence_number AS sequenceNumber,
      leg_type AS legType,
      linked_company_contract_id AS linkedCompanyContractId,
      origin_airport_id AS originAirportId,
      destination_airport_id AS destinationAirportId,
      planned_departure_utc AS plannedDepartureUtc,
      planned_arrival_utc AS plannedArrivalUtc,
      assigned_qualification_group AS assignedQualificationGroup,
      payload_snapshot_json AS payloadSnapshotJson
    FROM flight_leg
    WHERE schedule_id = $schedule_id
    ORDER BY sequence_number ASC`,
    { $schedule_id: scheduleRow.scheduleId },
  );

  if (legRows.length === 0) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [`Schedule ${command.payload.scheduleId} does not contain any legs.`],
      hardBlockers: [`Schedule ${command.payload.scheduleId} does not contain any legs.`],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const proposedSchedule: ProposedScheduleInput = {
    scheduleId: scheduleRow.scheduleId,
    aircraftId: scheduleRow.aircraftId,
    scheduleKind: scheduleRow.scheduleKind,
    legs: legRows.map((legRow) => {
      const payloadSnapshot = parsePayloadSnapshot(legRow.payloadSnapshotJson);
      return {
        legType: legRow.legType,
        originAirportId: legRow.originAirportId,
        destinationAirportId: legRow.destinationAirportId,
        plannedDepartureUtc: legRow.plannedDepartureUtc,
        plannedArrivalUtc: legRow.plannedArrivalUtc,
        ...(legRow.linkedCompanyContractId ? { linkedCompanyContractId: legRow.linkedCompanyContractId } : {}),
        ...(legRow.assignedQualificationGroup ? { assignedQualificationGroup: legRow.assignedQualificationGroup } : {}),
        ...(payloadSnapshot ? { payloadSnapshot } : {}),
      };
    }),
  };

  const validation = validateProposedSchedule(proposedSchedule, {
    saveDatabase: dependencies.saveDatabase,
    airportReference: dependencies.airportReference,
    aircraftReference: dependencies.aircraftReference,
    companyId: companyContext.companyId,
  });

  const hardBlockers = validation.snapshot.validationMessages
    .filter((message) => message.severity === "blocker")
    .map((message) => message.summary);
  const warnings = validation.snapshot.validationMessages
    .filter((message) => message.severity === "warning")
    .map((message) => message.summary);

  if (!validation.snapshot.isCommittable) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [scheduleRow.scheduleId],
      validationMessages: [...hardBlockers, ...warnings],
      hardBlockers,
      warnings,
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
      metadata: {
        scheduleId: scheduleRow.scheduleId,
        validationSnapshot: validation.snapshot,
      },
    };
  }

  const eventLogEntryId = createPrefixedId("event");
  const flightLegIds = new Map<number, string>();
  const laborAllocationIds: string[] = [];
  const scheduledEventIds: string[] = [];

  validation.resolvedLegs.forEach((leg) => {
    flightLegIds.set(leg.sequenceNumber, createPrefixedId("leg"));
  });

  const uniqueContractIds = [...new Set(validation.snapshot.contractIdsAttached)];
  const contractDeadlineById = new Map(
    uniqueContractIds.length > 0
      ? (() => {
          const deadlineParams: Record<string, string> = {
            $company_id: companyContext.companyId,
          };
          uniqueContractIds.forEach((contractId, index) => {
            deadlineParams[`$contract_id_${index}`] = contractId;
          });

          return dependencies.saveDatabase
            .all<ContractDeadlineRow>(
              `SELECT
                company_contract_id AS companyContractId,
                deadline_utc AS deadlineUtc
              FROM company_contract
              WHERE company_id = $company_id
                AND company_contract_id IN (${uniqueContractIds.map((_, index) => `$contract_id_${index}`).join(", ")})`,
              deadlineParams,
            )
            .map((row) => [row.companyContractId, row.deadlineUtc]);
        })()
      : [],
  );

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `DELETE FROM flight_leg WHERE schedule_id = $schedule_id`,
      { $schedule_id: scheduleRow.scheduleId },
    );

    dependencies.saveDatabase.run(
      `DELETE FROM labor_allocation WHERE schedule_id = $schedule_id`,
      { $schedule_id: scheduleRow.scheduleId },
    );

    dependencies.saveDatabase.run(
      `UPDATE aircraft_schedule
      SET schedule_state = 'committed',
          is_draft = 0,
          validation_snapshot_json = $validation_snapshot_json,
          updated_at_utc = $updated_at_utc
      WHERE schedule_id = $schedule_id`,
      {
        $schedule_id: scheduleRow.scheduleId,
        $validation_snapshot_json: JSON.stringify(validation.snapshot),
        $updated_at_utc: companyContext.currentTimeUtc,
      },
    );

    for (const leg of validation.resolvedLegs) {
      const flightLegId = flightLegIds.get(leg.sequenceNumber)!;
      dependencies.saveDatabase.run(
        `INSERT INTO flight_leg (
          flight_leg_id,
          schedule_id,
          sequence_number,
          leg_type,
          linked_company_contract_id,
          origin_airport_id,
          destination_airport_id,
          planned_departure_utc,
          planned_arrival_utc,
          actual_departure_utc,
          actual_arrival_utc,
          leg_state,
          assigned_qualification_group,
          payload_snapshot_json
        ) VALUES (
          $flight_leg_id,
          $schedule_id,
          $sequence_number,
          $leg_type,
          $linked_company_contract_id,
          $origin_airport_id,
          $destination_airport_id,
          $planned_departure_utc,
          $planned_arrival_utc,
          NULL,
          NULL,
          'planned',
          $assigned_qualification_group,
          $payload_snapshot_json
        )`,
        {
          $flight_leg_id: flightLegId,
          $schedule_id: scheduleRow.scheduleId,
          $sequence_number: leg.sequenceNumber,
          $leg_type: leg.legType,
          $linked_company_contract_id: leg.linkedCompanyContractId ?? null,
          $origin_airport_id: leg.originAirportId,
          $destination_airport_id: leg.destinationAirportId,
          $planned_departure_utc: leg.plannedDepartureUtc,
          $planned_arrival_utc: leg.plannedArrivalUtc,
          $assigned_qualification_group: leg.assignedQualificationGroup ?? null,
          $payload_snapshot_json: leg.payloadSnapshot ? JSON.stringify(leg.payloadSnapshot) : null,
        },
      );

      const departureEventId = createPrefixedId("eventq");
      const arrivalEventId = createPrefixedId("eventq");
      scheduledEventIds.push(departureEventId, arrivalEventId);

      dependencies.saveDatabase.run(
        `INSERT INTO scheduled_event (
          scheduled_event_id,
          save_id,
          event_type,
          scheduled_time_utc,
          status,
          aircraft_id,
          company_contract_id,
          maintenance_task_id,
          payload_json
        ) VALUES (
          $scheduled_event_id,
          $save_id,
          'flight_leg_departure_due',
          $scheduled_time_utc,
          'pending',
          $aircraft_id,
          $company_contract_id,
          NULL,
          $payload_json
        )`,
        {
          $scheduled_event_id: departureEventId,
          $save_id: command.saveId,
          $scheduled_time_utc: leg.plannedDepartureUtc,
          $aircraft_id: scheduleRow.aircraftId,
          $company_contract_id: leg.linkedCompanyContractId ?? null,
          $payload_json: JSON.stringify({
            scheduleId: scheduleRow.scheduleId,
            flightLegId,
            sequenceNumber: leg.sequenceNumber,
          }),
        },
      );

      dependencies.saveDatabase.run(
        `INSERT INTO scheduled_event (
          scheduled_event_id,
          save_id,
          event_type,
          scheduled_time_utc,
          status,
          aircraft_id,
          company_contract_id,
          maintenance_task_id,
          payload_json
        ) VALUES (
          $scheduled_event_id,
          $save_id,
          'flight_leg_arrival_due',
          $scheduled_time_utc,
          'pending',
          $aircraft_id,
          $company_contract_id,
          NULL,
          $payload_json
        )`,
        {
          $scheduled_event_id: arrivalEventId,
          $save_id: command.saveId,
          $scheduled_time_utc: leg.plannedArrivalUtc,
          $aircraft_id: scheduleRow.aircraftId,
          $company_contract_id: leg.linkedCompanyContractId ?? null,
          $payload_json: JSON.stringify({
            scheduleId: scheduleRow.scheduleId,
            flightLegId,
            sequenceNumber: leg.sequenceNumber,
          }),
        },
      );
    }

    for (const reservation of validation.laborReservations) {
      const laborAllocationId = createPrefixedId("labor");
      laborAllocationIds.push(laborAllocationId);
      dependencies.saveDatabase.run(
        `INSERT INTO labor_allocation (
          labor_allocation_id,
          staffing_package_id,
          aircraft_id,
          schedule_id,
          maintenance_task_id,
          qualification_group,
          units_reserved,
          reserved_from_utc,
          reserved_to_utc,
          status
        ) VALUES (
          $labor_allocation_id,
          $staffing_package_id,
          $aircraft_id,
          $schedule_id,
          NULL,
          $qualification_group,
          $units_reserved,
          $reserved_from_utc,
          $reserved_to_utc,
          'reserved'
        )`,
        {
          $labor_allocation_id: laborAllocationId,
          $staffing_package_id: reservation.staffingPackageId,
          $aircraft_id: scheduleRow.aircraftId,
          $schedule_id: scheduleRow.scheduleId,
          $qualification_group: reservation.qualificationGroup,
          $units_reserved: reservation.unitsReserved,
          $reserved_from_utc: reservation.reservedFromUtc,
          $reserved_to_utc: reservation.reservedToUtc,
        },
      );
    }

    if (uniqueContractIds.length > 0) {
      const placeholders = uniqueContractIds.map((_, index) => `$contract_id_${index}`).join(", ");
      const params: Record<string, string> = {
        $assigned_aircraft_id: scheduleRow.aircraftId,
      };

      uniqueContractIds.forEach((contractId, index) => {
        params[`$contract_id_${index}`] = contractId;
      });

      dependencies.saveDatabase.run(
        `UPDATE company_contract
        SET assigned_aircraft_id = $assigned_aircraft_id,
            contract_state = 'assigned'
        WHERE company_contract_id IN (${placeholders})`,
        params,
      );

      for (const contractId of uniqueContractIds) {
        const deadlineUtc = contractDeadlineById.get(contractId);
        if (!deadlineUtc) {
          continue;
        }

        const deadlineEventId = createPrefixedId("eventq");
        scheduledEventIds.push(deadlineEventId);
        dependencies.saveDatabase.run(
          `INSERT INTO scheduled_event (
            scheduled_event_id,
            save_id,
            event_type,
            scheduled_time_utc,
            status,
            aircraft_id,
            company_contract_id,
            maintenance_task_id,
            payload_json
          ) VALUES (
            $scheduled_event_id,
            $save_id,
            'contract_deadline_check',
            $scheduled_time_utc,
            'pending',
            $aircraft_id,
            $company_contract_id,
            NULL,
            $payload_json
          )`,
          {
            $scheduled_event_id: deadlineEventId,
            $save_id: command.saveId,
            $scheduled_time_utc: deadlineUtc,
            $aircraft_id: scheduleRow.aircraftId,
            $company_contract_id: contractId,
            $payload_json: JSON.stringify({
              scheduleId: scheduleRow.scheduleId,
              companyContractId: contractId,
            }),
          },
        );
      }
    }

    dependencies.saveDatabase.run(
      `UPDATE company_aircraft
      SET status_input = 'scheduled',
          dispatch_available = 0,
          active_schedule_id = $active_schedule_id
      WHERE aircraft_id = $aircraft_id`,
      {
        $active_schedule_id: scheduleRow.scheduleId,
        $aircraft_id: scheduleRow.aircraftId,
      },
    );

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
        'schedule_committed',
        'aircraft_schedule',
        $source_object_id,
        'info',
        $message,
        $metadata_json
      )`,
      {
        $event_log_entry_id: eventLogEntryId,
        $save_id: command.saveId,
        $company_id: companyContext.companyId,
        $event_time_utc: companyContext.currentTimeUtc,
        $source_object_id: scheduleRow.scheduleId,
        $message: `Committed schedule ${scheduleRow.scheduleId} for aircraft ${scheduleRow.aircraftId}.`,
        $metadata_json: JSON.stringify({
          aircraftId: scheduleRow.aircraftId,
          contractIdsAttached: uniqueContractIds,
          laborAllocationCount: laborAllocationIds.length,
          scheduledEventCount: scheduledEventIds.length,
          validationSnapshot: validation.snapshot,
        }),
      },
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
        $completed_at_utc: companyContext.currentTimeUtc,
        $payload_json: JSON.stringify({
          scheduleId: scheduleRow.scheduleId,
          validationSnapshot: validation.snapshot,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [scheduleRow.scheduleId, scheduleRow.aircraftId, ...uniqueContractIds],
    validationMessages: [`Committed schedule ${scheduleRow.scheduleId}.`, ...warnings],
    hardBlockers: [],
    warnings,
    emittedEventIds: [eventLogEntryId, ...scheduledEventIds],
    emittedLedgerEntryIds: [],
    metadata: {
      scheduleId: scheduleRow.scheduleId,
      aircraftId: scheduleRow.aircraftId,
      contractIdsAttached: uniqueContractIds,
      laborAllocationIds,
      validationSnapshot: validation.snapshot,
    },
  };
}

