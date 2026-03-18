/*
 * Starts a fixed recurrent training window for one named pilot.
 * This first-pass handler is intentionally narrow: immediate start, no future scheduling,
 * no qualification changes, and no travel simulation.
 */

import type { CommandResult, StartNamedPilotTrainingCommand } from "./types.js";
import { createPrefixedId } from "./utils.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import { loadNamedPilotRoster, deriveNamedPilotTrainingUntil } from "../staffing/named-pilot-roster.js";
import {
  canTrainToCertification,
  formatPilotCertificationList,
} from "../../domain/staffing/pilot-certifications.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";

interface StartNamedPilotTrainingDependencies {
  saveDatabase: SqliteFileDatabase;
}

export async function handleStartNamedPilotTraining(
  command: StartNamedPilotTrainingCommand,
  dependencies: StartNamedPilotTrainingDependencies,
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

  const roster = loadNamedPilotRoster(
    dependencies.saveDatabase,
    companyContext.companyId,
    companyContext.currentTimeUtc,
  );
  const namedPilot = roster.find((pilot) => pilot.namedPilotId === command.payload.namedPilotId);

  if (!namedPilot) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [`Pilot ${command.payload.namedPilotId} was not found.`],
      hardBlockers: [`Pilot ${command.payload.namedPilotId} was not found.`],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  if (namedPilot.packageStatus !== "active") {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [`${namedPilot.displayName} is not part of active pilot coverage yet.`],
      hardBlockers: [`${namedPilot.displayName} is not part of active pilot coverage yet.`],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  if (namedPilot.availabilityState !== "ready") {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [`${namedPilot.displayName} is currently ${namedPilot.availabilityState} and cannot start training.`],
      hardBlockers: [`${namedPilot.displayName} is currently ${namedPilot.availabilityState} and cannot start training.`],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const requestedProgramKind = command.payload.trainingProgramKind;
  const requestedTargetCertificationCode = command.payload.targetCertificationCode;
  const trainingProgramKind = requestedTargetCertificationCode
    ? "certification"
    : requestedProgramKind === "certification"
      ? "certification"
      : "recurrent";

  if (trainingProgramKind === "certification" && !requestedTargetCertificationCode) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: ["Certification training requires a target certification."],
      hardBlockers: ["Certification training requires a target certification."],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  if (trainingProgramKind === "certification" && namedPilot.employmentModel === "contract_hire") {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [`${namedPilot.displayName} is a contract hire and cannot start certification training.`],
      hardBlockers: [`${namedPilot.displayName} is a contract hire and cannot start certification training.`],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  if (
    requestedTargetCertificationCode
    && !canTrainToCertification(namedPilot.certifications, requestedTargetCertificationCode)
  ) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [
        `${namedPilot.displayName} cannot train to ${requestedTargetCertificationCode} from ${formatPilotCertificationList(namedPilot.certifications)}.`,
      ],
      hardBlockers: [
        `${namedPilot.displayName} cannot train to ${requestedTargetCertificationCode} from ${formatPilotCertificationList(namedPilot.certifications)}.`,
      ],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const trainingUntilUtc = deriveNamedPilotTrainingUntil(companyContext.currentTimeUtc, trainingProgramKind);
  const eventLogEntryId = createPrefixedId("event");
  const trainingSummary = trainingProgramKind === "certification"
    ? `${requestedTargetCertificationCode} certification training`
    : "recurrent training";

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `UPDATE named_pilot
      SET training_program_kind = $training_program_kind,
          training_target_certification_code = $training_target_certification_code,
          training_started_at_utc = $training_started_at_utc,
          training_until_utc = $training_until_utc,
          resting_until_utc = NULL,
          updated_at_utc = $updated_at_utc
      WHERE named_pilot_id = $named_pilot_id`,
      {
        $named_pilot_id: namedPilot.namedPilotId,
        $training_program_kind: trainingProgramKind,
        $training_target_certification_code: requestedTargetCertificationCode ?? null,
        $training_started_at_utc: companyContext.currentTimeUtc,
        $training_until_utc: trainingUntilUtc,
        $updated_at_utc: companyContext.currentTimeUtc,
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
        'pilot_training_started',
        'named_pilot',
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
        $source_object_id: namedPilot.namedPilotId,
        $message: `${namedPilot.displayName} started ${trainingSummary} until ${trainingUntilUtc}.`,
        $metadata_json: JSON.stringify({
          namedPilotId: namedPilot.namedPilotId,
          displayName: namedPilot.displayName,
          certifications: namedPilot.certifications,
          qualificationGroup: namedPilot.qualificationGroup,
          trainingProgramKind,
          targetCertificationCode: requestedTargetCertificationCode ?? undefined,
          trainingStartedAtUtc: companyContext.currentTimeUtc,
          trainingUntilUtc,
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
          namedPilotId: namedPilot.namedPilotId,
          trainingProgramKind,
          targetCertificationCode: requestedTargetCertificationCode ?? undefined,
          trainingStartedAtUtc: companyContext.currentTimeUtc,
          trainingUntilUtc,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [namedPilot.namedPilotId],
    validationMessages: [`${namedPilot.displayName} started ${trainingSummary}.`],
    hardBlockers: [],
    warnings: [],
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [],
    metadata: {
      namedPilotId: namedPilot.namedPilotId,
      trainingProgramKind,
      targetCertificationCode: requestedTargetCertificationCode ?? undefined,
      trainingStartedAtUtc: companyContext.currentTimeUtc,
      trainingUntilUtc,
    },
  };
}
