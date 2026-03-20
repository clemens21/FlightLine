/*
 * Implements the cancel company contract command handler for the backend command pipeline.
 * Files in this layer validate a request, mutate save-state tables inside a transaction, and return structured results for callers.
 */

import type { CommandResult, CancelCompanyContractCommand } from "./types.js";
import { createPrefixedId, deriveFinancialPressureBand } from "./utils.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";

interface CancelCompanyContractDependencies {
  saveDatabase: SqliteFileDatabase;
}

interface CompanyContractRow extends Record<string, unknown> {
  companyContractId: string;
  companyId: string;
  originAirportId: string;
  destinationAirportId: string;
  volumeType: "passenger" | "cargo";
  passengerCount: number | null;
  cargoWeightLb: number | null;
  acceptedPayoutAmount: number;
  penaltyModelJson: string;
  contractState: string;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function describeContract(row: CompanyContractRow): string {
  const payload = row.volumeType === "cargo"
    ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(row.cargoWeightLb ?? 0)} lb cargo`
    : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(row.passengerCount ?? 0)} pax`;
  return `${row.originAirportId} -> ${row.destinationAirportId} ${row.volumeType} contract (${payload})`;
}

function parseCancellationPenaltyAmount(penaltyModelJson: string, fallbackAmount: number): number {
  try {
    const parsed = JSON.parse(penaltyModelJson) as Record<string, unknown>;
    if (typeof parsed.cancellationPenaltyAmount === "number" && Number.isFinite(parsed.cancellationPenaltyAmount)) {
      return Math.max(0, Math.round(parsed.cancellationPenaltyAmount));
    }
  } catch {
    // Ignore malformed penalty metadata and use fallback.
  }

  return Math.max(0, Math.round(fallbackAmount));
}

// Cancels an already accepted contract, applies the configured penalty, and records the resulting financial/event side effects.
export async function handleCancelCompanyContract(
  command: CancelCompanyContractCommand,
  dependencies: CancelCompanyContractDependencies,
): Promise<CommandResult> {
  const hardBlockers: string[] = [];
  const warnings: string[] = [];
  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);

  if (!companyContext) {
    hardBlockers.push(`Save ${command.saveId} does not have an active company.`);
  }

  const contractRow = companyContext
    ? dependencies.saveDatabase.getOne<CompanyContractRow>(
        `SELECT
          company_contract_id AS companyContractId,
          company_id AS companyId,
          origin_airport_id AS originAirportId,
          destination_airport_id AS destinationAirportId,
          volume_type AS volumeType,
          passenger_count AS passengerCount,
          cargo_weight_lb AS cargoWeightLb,
          accepted_payout_amount AS acceptedPayoutAmount,
          penalty_model_json AS penaltyModelJson,
          contract_state AS contractState
        FROM company_contract
        WHERE company_contract_id = $company_contract_id
          AND company_id = $company_id
        LIMIT 1`,
        {
          $company_contract_id: command.payload.companyContractId,
          $company_id: companyContext.companyId,
        },
      )
    : null;

  if (!contractRow) {
    hardBlockers.push(`Company contract ${command.payload.companyContractId} was not found.`);
  }

  if (contractRow && contractRow.contractState !== "accepted") {
    hardBlockers.push("Only unassigned accepted contracts can be cancelled right now.");
  }

  if (hardBlockers.length > 0) {
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

  const resolvedCompanyContext = companyContext!;
  const resolvedContractRow = contractRow!;
  const cancellationPenaltyAmount = parseCancellationPenaltyAmount(
    resolvedContractRow.penaltyModelJson,
    resolvedContractRow.acceptedPayoutAmount * 0.14,
  );
  const contractSummary = describeContract(resolvedContractRow);
  const message = `Cancelled ${contractSummary} for ${formatMoney(cancellationPenaltyAmount)} penalty.`;
  const ledgerEntryId = createPrefixedId("ledger");
  const eventLogEntryId = createPrefixedId("event");
  const updatedCashAmount = resolvedCompanyContext.currentCashAmount - cancellationPenaltyAmount;
  const financialPressureBand = deriveFinancialPressureBand(updatedCashAmount);

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `UPDATE company_contract
      SET contract_state = 'cancelled',
          assigned_aircraft_id = NULL
      WHERE company_contract_id = $company_contract_id`,
      { $company_contract_id: resolvedContractRow.companyContractId },
    );

    dependencies.saveDatabase.run(
      `UPDATE route_plan_item
      SET planner_item_status = 'closed',
          linked_aircraft_id = NULL,
          linked_schedule_id = NULL,
          updated_at_utc = $updated_at_utc
      WHERE source_type = 'accepted_contract'
        AND source_id = $company_contract_id`,
      {
        $updated_at_utc: resolvedCompanyContext.currentTimeUtc,
        $company_contract_id: resolvedContractRow.companyContractId,
      },
    );

    dependencies.saveDatabase.run(
      `UPDATE company_financial_state
      SET current_cash_amount = $current_cash_amount,
          financial_pressure_band = $financial_pressure_band,
          updated_at_utc = $updated_at_utc
      WHERE company_id = $company_id`,
      {
        $current_cash_amount: updatedCashAmount,
        $financial_pressure_band: financialPressureBand,
        $updated_at_utc: resolvedCompanyContext.currentTimeUtc,
        $company_id: resolvedCompanyContext.companyId,
      },
    );

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
        'contract_cancellation_penalty',
        $amount,
        'USD',
        'company_contract',
        $source_object_id,
        $description,
        $metadata_json
      )`,
      {
        $ledger_entry_id: ledgerEntryId,
        $company_id: resolvedCompanyContext.companyId,
        $entry_time_utc: resolvedCompanyContext.currentTimeUtc,
        $amount: cancellationPenaltyAmount * -1,
        $source_object_id: resolvedContractRow.companyContractId,
        $description: `Cancellation penalty for ${contractSummary}`,
        $metadata_json: JSON.stringify({
          companyContractId: resolvedContractRow.companyContractId,
          cancellationPenaltyAmount,
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
        $company_id: resolvedCompanyContext.companyId,
        $event_time_utc: resolvedCompanyContext.currentTimeUtc,
        $event_type: 'contract_cancelled',
        $source_object_type: 'company_contract',
        $source_object_id: resolvedContractRow.companyContractId,
        $severity: 'warning',
        $message: message,
        $metadata_json: JSON.stringify({
          companyContractId: resolvedContractRow.companyContractId,
          cancellationPenaltyAmount,
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
        $status: 'completed',
        $payload_json: JSON.stringify({
          companyContractId: resolvedContractRow.companyContractId,
          cancellationPenaltyAmount,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [resolvedContractRow.companyContractId],
    validationMessages: [message],
    hardBlockers: [],
    warnings,
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [ledgerEntryId],
    metadata: {
      companyContractId: resolvedContractRow.companyContractId,
      cancellationPenaltyAmount,
      contractSummary,
    },
  };
}
