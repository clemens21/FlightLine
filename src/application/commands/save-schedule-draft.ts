/*
 * Implements the save schedule draft command handler for the backend command pipeline.
 * Files in this layer validate a request, mutate save-state tables inside a transaction, and return structured results for callers.
 */

import type { CommandResult, SaveScheduleDraftCommand } from "./types.js";
import { createPrefixedId } from "./utils.js";
import { validateProposedSchedule } from "../dispatch/schedule-validation.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";
import type { AirportReferenceRepository } from "../../infrastructure/reference/airport-reference.js";

interface SaveScheduleDraftDependencies {
  saveDatabase: SqliteFileDatabase;
  airportReference: AirportReferenceRepository;
  aircraftReference: AircraftReferenceRepository;
}

interface ExistingDraftRow extends Record<string, unknown> {
  scheduleId: string;
}

export async function handleSaveScheduleDraft(
  command: SaveScheduleDraftCommand,
  dependencies: SaveScheduleDraftDependencies,
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

  if (command.payload.legs.length === 0) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: ["A schedule draft must contain at least one leg."],
      hardBlockers: ["A schedule draft must contain at least one leg."],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const aircraftExists = dependencies.saveDatabase.getOne<{ aircraftId: string }>(
    `SELECT aircraft_id AS aircraftId
    FROM company_aircraft
    WHERE aircraft_id = $aircraft_id
      AND company_id = $company_id
    LIMIT 1`,
    {
      $aircraft_id: command.payload.aircraftId,
      $company_id: companyContext.companyId,
    },
  );

  if (!aircraftExists) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [`Aircraft ${command.payload.aircraftId} is not controlled by the active company.`],
      hardBlockers: [`Aircraft ${command.payload.aircraftId} is not controlled by the active company.`],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const scheduleId = command.payload.scheduleId ?? createPrefixedId("schedule");
  const scheduleKind = command.payload.scheduleKind ?? "operational";
  const validation = validateProposedSchedule(
    {
      scheduleId,
      aircraftId: command.payload.aircraftId,
      scheduleKind,
      legs: command.payload.legs,
    },
    {
      saveDatabase: dependencies.saveDatabase,
      airportReference: dependencies.airportReference,
      aircraftReference: dependencies.aircraftReference,
      companyId: companyContext.companyId,
      currentTimeUtc: companyContext.currentTimeUtc,
    },
  );
  const plannedStartUtc = validation.resolvedLegs[0]?.plannedDepartureUtc;
  const plannedEndUtc = validation.resolvedLegs[validation.resolvedLegs.length - 1]?.plannedArrivalUtc;

  const hardBlockers = validation.snapshot.validationMessages
    .filter((message) => message.severity === "blocker")
    .map((message) => message.summary);
  const warnings = validation.snapshot.validationMessages
    .filter((message) => message.severity === "warning")
    .map((message) => message.summary);
  const hasInvalidTimestampBlocker = validation.snapshot.validationMessages.some((message) => message.code === "leg.invalid_timestamp");

  const existingDraft = command.payload.scheduleId
    ? dependencies.saveDatabase.getOne<ExistingDraftRow>(
        `SELECT schedule_id AS scheduleId
        FROM aircraft_schedule
        WHERE schedule_id = $schedule_id
          AND aircraft_id = $aircraft_id
          AND is_draft = 1
        LIMIT 1`,
        {
          $schedule_id: scheduleId,
          $aircraft_id: command.payload.aircraftId,
        },
      )
    : null;

  if (command.payload.scheduleId && !existingDraft) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [`Draft schedule ${scheduleId} was not found for aircraft ${command.payload.aircraftId}.`],
      hardBlockers: [`Draft schedule ${scheduleId} was not found for aircraft ${command.payload.aircraftId}.`],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  if (hasInvalidTimestampBlocker || !plannedStartUtc || !plannedEndUtc) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [...hardBlockers, ...warnings],
      hardBlockers,
      warnings,
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const stagedContractIds = [...new Set(validation.snapshot.contractIdsAttached)];
  const staleBlockedScheduleIds = stagedContractIds.length > 0
    ? dependencies.saveDatabase.all<{ scheduleId: string }>(
        `SELECT DISTINCT s.schedule_id AS scheduleId
         FROM aircraft_schedule AS s
         JOIN flight_leg AS fl ON fl.schedule_id = s.schedule_id
         JOIN flight_leg_contract AS flc ON flc.flight_leg_id = fl.flight_leg_id
         WHERE s.is_draft = 1
           AND s.schedule_state = 'blocked'
           AND s.schedule_id <> $schedule_id
           AND s.aircraft_id <> $aircraft_id
         GROUP BY s.schedule_id
         HAVING SUM(CASE
             WHEN flc.company_contract_id IN (${stagedContractIds.map((_, index) => `$company_contract_id_${index}`).join(", ")})
             THEN 1
             ELSE 0
           END) > 0
           AND SUM(CASE
             WHEN flc.company_contract_id NOT IN (${stagedContractIds.map((_, index) => `$company_contract_id_${index}`).join(", ")})
             THEN 1
             ELSE 0
           END) = 0`,
        stagedContractIds.reduce<Record<string, string>>((accumulator, contractId, index) => {
          accumulator[`$company_contract_id_${index}`] = contractId;
          return accumulator;
        }, {
          $schedule_id: scheduleId,
          $aircraft_id: command.payload.aircraftId,
        } as Record<string, string>),
      ).map((row) => row.scheduleId)
    : [];
  const eventLogEntryId = createPrefixedId("event");

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `UPDATE aircraft_schedule
      SET schedule_state = 'cancelled',
          updated_at_utc = $updated_at_utc
      WHERE aircraft_id = $aircraft_id
        AND is_draft = 1
        AND schedule_id <> $schedule_id
        AND schedule_state IN ('draft', 'blocked')`,
      {
        $updated_at_utc: companyContext.currentTimeUtc,
        $aircraft_id: command.payload.aircraftId,
        $schedule_id: scheduleId,
      },
    );

    if (staleBlockedScheduleIds.length > 0) {
      const schedulePlaceholders = staleBlockedScheduleIds.map((_, index) => `$stale_schedule_id_${index}`).join(", ");
      const staleBlockedDraftCleanupParams = staleBlockedScheduleIds.reduce<Record<string, string>>((accumulator, staleScheduleId, index) => {
        accumulator[`$stale_schedule_id_${index}`] = staleScheduleId;
        return accumulator;
      }, {
        $updated_at_utc: companyContext.currentTimeUtc,
      } as Record<string, string>);

      // Legacy blocked drafts should not keep accepted contracts hostage once a new viable staging is attempted.
      dependencies.saveDatabase.run(
        `UPDATE aircraft_schedule
         SET schedule_state = 'cancelled',
             is_draft = 0,
             updated_at_utc = $updated_at_utc
         WHERE schedule_id IN (${schedulePlaceholders})`,
        staleBlockedDraftCleanupParams,
      );

      dependencies.saveDatabase.run(
        `DELETE FROM labor_allocation
         WHERE schedule_id IN (${schedulePlaceholders})`,
        staleBlockedDraftCleanupParams,
      );

      dependencies.saveDatabase.run(
        `DELETE FROM flight_leg
         WHERE schedule_id IN (${schedulePlaceholders})`,
        staleBlockedDraftCleanupParams,
      );
    }

    dependencies.saveDatabase.run(
      `DELETE FROM flight_leg WHERE schedule_id = $schedule_id`,
      { $schedule_id: scheduleId },
    );

    if (existingDraft) {
      dependencies.saveDatabase.run(
        `UPDATE aircraft_schedule
        SET schedule_kind = $schedule_kind,
            schedule_state = $schedule_state,
            is_draft = 1,
            planned_start_utc = $planned_start_utc,
            planned_end_utc = $planned_end_utc,
            validation_snapshot_json = $validation_snapshot_json,
            updated_at_utc = $updated_at_utc
        WHERE schedule_id = $schedule_id`,
        {
          $schedule_id: scheduleId,
          $schedule_kind: scheduleKind,
          $schedule_state: validation.snapshot.isCommittable ? "draft" : "blocked",
          $planned_start_utc: plannedStartUtc,
          $planned_end_utc: plannedEndUtc,
          $validation_snapshot_json: JSON.stringify(validation.snapshot),
          $updated_at_utc: companyContext.currentTimeUtc,
        },
      );
    } else {
      dependencies.saveDatabase.run(
        `INSERT INTO aircraft_schedule (
          schedule_id,
          aircraft_id,
          schedule_kind,
          schedule_state,
          is_draft,
          planned_start_utc,
          planned_end_utc,
          validation_snapshot_json,
          created_at_utc,
          updated_at_utc
        ) VALUES (
          $schedule_id,
          $aircraft_id,
          $schedule_kind,
          $schedule_state,
          1,
          $planned_start_utc,
          $planned_end_utc,
          $validation_snapshot_json,
          $created_at_utc,
          $updated_at_utc
        )`,
        {
          $schedule_id: scheduleId,
          $aircraft_id: command.payload.aircraftId,
          $schedule_kind: scheduleKind,
          $schedule_state: validation.snapshot.isCommittable ? "draft" : "blocked",
          $planned_start_utc: plannedStartUtc,
          $planned_end_utc: plannedEndUtc,
          $validation_snapshot_json: JSON.stringify(validation.snapshot),
          $created_at_utc: companyContext.currentTimeUtc,
          $updated_at_utc: companyContext.currentTimeUtc,
        },
      );
    }

    for (const leg of validation.resolvedLegs) {
      const flightLegId = createPrefixedId("leg");
      const linkedCompanyContractIds = leg.linkedCompanyContractIds
        ?? (leg.linkedCompanyContractId ? [leg.linkedCompanyContractId] : []);
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
          $schedule_id: scheduleId,
          $sequence_number: leg.sequenceNumber,
          $leg_type: leg.legType,
          $linked_company_contract_id: linkedCompanyContractIds[0] ?? null,
          $origin_airport_id: leg.originAirportId,
          $destination_airport_id: leg.destinationAirportId,
          $planned_departure_utc: leg.plannedDepartureUtc,
          $planned_arrival_utc: leg.plannedArrivalUtc,
          $assigned_qualification_group: leg.assignedQualificationGroup ?? null,
          $payload_snapshot_json: leg.payloadSnapshot ? JSON.stringify(leg.payloadSnapshot) : null,
        },
      );

      linkedCompanyContractIds.forEach((companyContractId, attachmentOrder) => {
        dependencies.saveDatabase.run(
          `INSERT INTO flight_leg_contract (
            flight_leg_id,
            company_contract_id,
            attachment_order
          ) VALUES (
            $flight_leg_id,
            $company_contract_id,
            $attachment_order
          )`,
          {
            $flight_leg_id: flightLegId,
            $company_contract_id: companyContractId,
            $attachment_order: attachmentOrder,
          },
        );
      });
    }

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
        'schedule_draft_saved',
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
        $source_object_id: scheduleId,
        $message: `Saved schedule draft ${scheduleId} for aircraft ${command.payload.aircraftId}.`,
        $metadata_json: JSON.stringify({
          aircraftId: command.payload.aircraftId,
          legCount: validation.resolvedLegs.length,
          isCommittable: validation.snapshot.isCommittable,
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
          ...command.payload,
          scheduleId,
          validationSnapshot: validation.snapshot,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [scheduleId],
    validationMessages: [`Saved draft schedule ${scheduleId}.`, ...hardBlockers, ...warnings],
    hardBlockers,
    warnings,
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [],
    metadata: {
      scheduleId,
      isCommittable: validation.snapshot.isCommittable,
      validationSnapshot: validation.snapshot,
    },
  };
}
