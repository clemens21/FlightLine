/*
 * Implements the accept contract offer command handler for the backend command pipeline.
 * Files in this layer validate a request, mutate save-state tables inside a transaction, and return structured results for callers.
 */

import type { CommandResult, AcceptContractOfferCommand } from "./types.js";
import { createPrefixedId } from "./utils.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";

interface AcceptContractOfferDependencies {
  saveDatabase: SqliteFileDatabase;
}

interface ContractOfferRow extends Record<string, unknown> {
  contractOfferId: string;
  companyId: string;
  offerWindowId: string;
  archetype: string;
  originAirportId: string;
  destinationAirportId: string;
  volumeType: "passenger" | "cargo";
  passengerCount: number | null;
  cargoWeightLb: number | null;
  earliestStartUtc: string;
  latestCompletionUtc: string;
  payoutAmount: number;
  penaltyModelJson: string;
  offerStatus: string;
  windowStatus: string;
  expiresAtUtc: string;
}

interface ExistingAcceptedContractRow extends Record<string, unknown> {
  companyContractId: string;
}

function describeAcceptedContract(
  originAirportId: string,
  destinationAirportId: string,
  volumeType: "passenger" | "cargo",
  passengerCount: number | null,
  cargoWeightLb: number | null,
): string {
  const payload = volumeType === "cargo"
    ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(cargoWeightLb ?? 0)} lb cargo`
    : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(passengerCount ?? 0)} pax`;
  return `${originAirportId} -> ${destinationAirportId} ${volumeType} contract (${payload})`;
}

// Accepts one live contract offer and turns it into a persisted company contract without regenerating the rest of the board.
export async function handleAcceptContractOffer(
  command: AcceptContractOfferCommand,
  dependencies: AcceptContractOfferDependencies,
): Promise<CommandResult> {
  const hardBlockers: string[] = [];
  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);

  if (!companyContext) {
    hardBlockers.push(`Save ${command.saveId} does not have an active company.`);
  }

  const offerRow = companyContext
    ? dependencies.saveDatabase.getOne<ContractOfferRow>(
        `SELECT
          co.contract_offer_id AS contractOfferId,
          co.company_id AS companyId,
          co.offer_window_id AS offerWindowId,
          co.archetype AS archetype,
          co.origin_airport_id AS originAirportId,
          co.destination_airport_id AS destinationAirportId,
          co.volume_type AS volumeType,
          co.passenger_count AS passengerCount,
          co.cargo_weight_lb AS cargoWeightLb,
          co.earliest_start_utc AS earliestStartUtc,
          co.latest_completion_utc AS latestCompletionUtc,
          co.payout_amount AS payoutAmount,
          co.penalty_model_json AS penaltyModelJson,
          co.offer_status AS offerStatus,
          ow.status AS windowStatus,
          ow.expires_at_utc AS expiresAtUtc
        FROM contract_offer AS co
        JOIN offer_window AS ow ON ow.offer_window_id = co.offer_window_id
        WHERE co.contract_offer_id = $contract_offer_id
          AND co.company_id = $company_id
        LIMIT 1`,
        {
          $contract_offer_id: command.payload.contractOfferId,
          $company_id: companyContext.companyId,
        },
      )
    : null;

  if (!offerRow) {
    hardBlockers.push(`Contract offer ${command.payload.contractOfferId} was not found.`);
  }

  if (offerRow && offerRow.windowStatus !== "active") {
    hardBlockers.push(`Contract offer ${command.payload.contractOfferId} is not on an active board.`);
  }

  if (offerRow && !["available", "shortlisted"].includes(offerRow.offerStatus)) {
    hardBlockers.push(`Contract offer ${command.payload.contractOfferId} is no longer available to accept.`);
  }

  if (offerRow && companyContext && offerRow.expiresAtUtc < companyContext.currentTimeUtc) {
    hardBlockers.push(`Contract offer ${command.payload.contractOfferId} has expired.`);
  }

  const existingAcceptedContract = offerRow
    ? dependencies.saveDatabase.getOne<ExistingAcceptedContractRow>(
        `SELECT company_contract_id AS companyContractId
        FROM company_contract
        WHERE origin_contract_offer_id = $origin_contract_offer_id
        LIMIT 1`,
        { $origin_contract_offer_id: offerRow.contractOfferId },
      )
    : null;

  if (existingAcceptedContract) {
    hardBlockers.push(`Contract offer ${command.payload.contractOfferId} has already been accepted.`);
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

  const companyContractId = createPrefixedId("contract");
  const deadlineEventId = createPrefixedId("eventq");
  const eventLogEntryId = createPrefixedId("event");
  const acceptedContractSummary = describeAcceptedContract(
    offerRow!.originAirportId,
    offerRow!.destinationAirportId,
    offerRow!.volumeType,
    offerRow!.passengerCount,
    offerRow!.cargoWeightLb,
  );

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `INSERT INTO company_contract (
        company_contract_id,
        company_id,
        origin_contract_offer_id,
        archetype,
        origin_airport_id,
        destination_airport_id,
        volume_type,
        passenger_count,
        cargo_weight_lb,
        accepted_payout_amount,
        penalty_model_json,
        accepted_at_utc,
        earliest_start_utc,
        deadline_utc,
        contract_state,
        assigned_aircraft_id
      ) VALUES (
        $company_contract_id,
        $company_id,
        $origin_contract_offer_id,
        $archetype,
        $origin_airport_id,
        $destination_airport_id,
        $volume_type,
        $passenger_count,
        $cargo_weight_lb,
        $accepted_payout_amount,
        $penalty_model_json,
        $accepted_at_utc,
        $earliest_start_utc,
        $deadline_utc,
        'accepted',
        NULL
      )`,
      {
        $company_contract_id: companyContractId,
        $company_id: companyContext!.companyId,
        $origin_contract_offer_id: offerRow!.contractOfferId,
        $archetype: offerRow!.archetype,
        $origin_airport_id: offerRow!.originAirportId,
        $destination_airport_id: offerRow!.destinationAirportId,
        $volume_type: offerRow!.volumeType,
        $passenger_count: offerRow!.passengerCount,
        $cargo_weight_lb: offerRow!.cargoWeightLb,
        $accepted_payout_amount: offerRow!.payoutAmount,
        $penalty_model_json: offerRow!.penaltyModelJson,
        $accepted_at_utc: companyContext!.currentTimeUtc,
        $earliest_start_utc: offerRow!.earliestStartUtc,
        $deadline_utc: offerRow!.latestCompletionUtc,
      },
    );

    dependencies.saveDatabase.run(
      `UPDATE contract_offer
      SET offer_status = 'accepted'
      WHERE contract_offer_id = $contract_offer_id`,
      { $contract_offer_id: offerRow!.contractOfferId },
    );

    dependencies.saveDatabase.run(
      `UPDATE route_plan_item
      SET source_type = 'accepted_contract',
          source_id = $company_contract_id,
          planner_item_status = 'accepted_ready',
          origin_airport_id = $origin_airport_id,
          destination_airport_id = $destination_airport_id,
          volume_type = $volume_type,
          passenger_count = $passenger_count,
          cargo_weight_lb = $cargo_weight_lb,
          payout_amount = $payout_amount,
          earliest_start_utc = $earliest_start_utc,
          deadline_utc = $deadline_utc,
          updated_at_utc = $updated_at_utc
      WHERE source_type = 'candidate_offer'
        AND source_id = $contract_offer_id`,
      {
        $company_contract_id: companyContractId,
        $origin_airport_id: offerRow!.originAirportId,
        $destination_airport_id: offerRow!.destinationAirportId,
        $volume_type: offerRow!.volumeType,
        $passenger_count: offerRow!.passengerCount,
        $cargo_weight_lb: offerRow!.cargoWeightLb,
        $payout_amount: offerRow!.payoutAmount,
        $earliest_start_utc: offerRow!.earliestStartUtc,
        $deadline_utc: offerRow!.latestCompletionUtc,
        $updated_at_utc: companyContext!.currentTimeUtc,
        $contract_offer_id: offerRow!.contractOfferId,
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
        'contract_deadline_check',
        $scheduled_time_utc,
        'pending',
        NULL,
        $company_contract_id,
        NULL,
        $payload_json
      )`,
      {
        $scheduled_event_id: deadlineEventId,
        $save_id: command.saveId,
        $scheduled_time_utc: offerRow!.latestCompletionUtc,
        $company_contract_id: companyContractId,
        $payload_json: JSON.stringify({
          companyContractId,
        }),
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
        $event_time_utc: companyContext!.currentTimeUtc,
        $event_type: "contract_accepted",
        $source_object_type: "company_contract",
        $source_object_id: companyContractId,
        $severity: "info",
        $message: `Accepted ${acceptedContractSummary}.`,
        $metadata_json: JSON.stringify({
          contractOfferId: offerRow!.contractOfferId,
          offerWindowId: offerRow!.offerWindowId,
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
        $status,
        $payload_json
      )`,
      {
        $command_id: command.commandId,
        $save_id: command.saveId,
        $command_name: command.commandName,
        $actor_type: command.actorType,
        $issued_at_utc: command.issuedAtUtc,
        $completed_at_utc: command.issuedAtUtc,
        $status: "completed",
        $payload_json: JSON.stringify({
          contractOfferId: offerRow!.contractOfferId,
          companyContractId,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [companyContractId, offerRow!.contractOfferId],
    validationMessages: [`Accepted ${acceptedContractSummary}.`],
    hardBlockers: [],
    warnings: [],
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [],
    metadata: {
      companyContractId,
      contractOfferId: offerRow!.contractOfferId,
      contractSummary: acceptedContractSummary,
    },
  };
}

