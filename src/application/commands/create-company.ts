/*
 * Implements the create company command handler for the backend command pipeline.
 * Files in this layer validate a request, mutate save-state tables inside a transaction, and return structured results for callers.
 */

import type { CommandResult, CreateCompanyCommand } from "./types.js";
import { createPrefixedId, deriveFinancialPressureBand } from "./utils.js";
import type { AirportReferenceRepository } from "../../infrastructure/reference/airport-reference.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";

interface CreateCompanyDependencies {
  saveDatabase: SqliteFileDatabase;
  airportReference: AirportReferenceRepository;
}

interface SaveStateRow extends Record<string, unknown> {
  save_id: string;
  active_company_id: string | null;
}

const startupStartingCashAmount = 3_500_000;
const startupProgressionTier = 1;
const startupReputationScore = 0;
const startupCompanyPhase = "startup";

// Creates the first company inside a save, including its starting finances, identity, and home-base footprint.
export async function handleCreateCompany(
  command: CreateCompanyCommand,
  dependencies: CreateCompanyDependencies,
): Promise<CommandResult> {
  const hardBlockers: string[] = [];
  const warnings: string[] = [];

  if (!command.payload.displayName.trim()) {
    hardBlockers.push("Company display name is required.");
  }

  const saveState = dependencies.saveDatabase.getOne<SaveStateRow>(
    "SELECT save_id, active_company_id FROM save_game WHERE save_id = $save_id LIMIT 1",
    { $save_id: command.saveId },
  );

  if (!saveState) {
    hardBlockers.push(`Save ${command.saveId} does not exist.`);
  }

  if (saveState?.active_company_id) {
    hardBlockers.push(`Save ${command.saveId} already has an active company.`);
  }

  const starterAirport = dependencies.airportReference.findAirport(command.payload.starterAirportId);

  if (!starterAirport) {
    hardBlockers.push(`Starter airport ${command.payload.starterAirportId} was not found in the airport reference database.`);
  } else {
    if (!starterAirport.accessibleNow) {
      hardBlockers.push(`Starter airport ${starterAirport.airportKey} is not currently accessible for gameplay.`);
    }

    if (!starterAirport.supportsSmallUtility) {
      hardBlockers.push(`Starter airport ${starterAirport.airportKey} does not support the startup fleet lane.`);
    }

    if ((starterAirport.airportSize ?? 0) >= 5) {
      warnings.push(`Starter airport ${starterAirport.airportKey} is a large hub and may create a steeper early-game cost profile.`);
    }
  }

  if (saveState && !saveState.active_company_id) {
    if (!Number.isFinite(command.payload.startingCashAmount)) {
      hardBlockers.push("Starting cash must be a finite number.");
    } else if (command.payload.startingCashAmount < 0) {
      hardBlockers.push("Starting cash cannot be negative.");
    } else if (command.payload.startingCashAmount !== startupStartingCashAmount) {
      hardBlockers.push(`Starting cash is fixed at ${startupStartingCashAmount} during company creation.`);
    }

    if (command.payload.companyPhase && command.payload.companyPhase !== startupCompanyPhase) {
      hardBlockers.push("Company phase is fixed at startup during company creation.");
    }

    if (command.payload.progressionTier !== undefined) {
      if (!Number.isFinite(command.payload.progressionTier) || !Number.isInteger(command.payload.progressionTier)) {
        hardBlockers.push("Progression tier must be a finite whole number.");
      } else if (command.payload.progressionTier !== startupProgressionTier) {
        hardBlockers.push(`Company progression tier is fixed at ${startupProgressionTier} during company creation.`);
      }
    }

    if (command.payload.startingReputationScore !== undefined) {
      if (!Number.isFinite(command.payload.startingReputationScore)) {
        hardBlockers.push("Starting reputation score must be a finite number.");
      } else if (command.payload.startingReputationScore !== startupReputationScore) {
        hardBlockers.push(`Starting reputation score is fixed at ${startupReputationScore} during company creation.`);
      }
    }
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

  const companyId = createPrefixedId("company");
  const companyBaseId = createPrefixedId("base");
  const ledgerEntryId = createPrefixedId("ledger");
  const eventLogEntryId = createPrefixedId("event");
  const startingCashAmount = startupStartingCashAmount;
  const progressionTier = startupProgressionTier;
  const reputationScore = startupReputationScore;
  const companyPhase = startupCompanyPhase;
  const baseRole = command.payload.baseRole ?? "home_base";
  const reserveBalanceAmount = command.payload.reserveBalanceAmount ?? null;
  const financialPressureBand = deriveFinancialPressureBand(startingCashAmount);

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `INSERT INTO company (
        company_id,
        save_id,
        display_name,
        reputation_score,
        company_phase,
        progression_tier,
        created_at_utc
      ) VALUES (
        $company_id,
        $save_id,
        $display_name,
        $reputation_score,
        $company_phase,
        $progression_tier,
        $created_at_utc
      )`,
      {
        $company_id: companyId,
        $save_id: command.saveId,
        $display_name: command.payload.displayName,
        $reputation_score: reputationScore,
        $company_phase: companyPhase,
        $progression_tier: progressionTier,
        $created_at_utc: command.issuedAtUtc,
      },
    );

    dependencies.saveDatabase.run(
      `INSERT INTO company_base (
        company_base_id,
        company_id,
        airport_id,
        base_role,
        activated_at_utc
      ) VALUES (
        $company_base_id,
        $company_id,
        $airport_id,
        $base_role,
        $activated_at_utc
      )`,
      {
        $company_base_id: companyBaseId,
        $company_id: companyId,
        $airport_id: starterAirport!.airportKey,
        $base_role: baseRole,
        $activated_at_utc: command.issuedAtUtc,
      },
    );

    dependencies.saveDatabase.run(
      `INSERT INTO company_financial_state (
        company_id,
        current_cash_amount,
        financial_pressure_band,
        reserve_balance_amount,
        updated_at_utc
      ) VALUES (
        $company_id,
        $current_cash_amount,
        $financial_pressure_band,
        $reserve_balance_amount,
        $updated_at_utc
      )`,
      {
        $company_id: companyId,
        $current_cash_amount: startingCashAmount,
        $financial_pressure_band: financialPressureBand,
        $reserve_balance_amount: reserveBalanceAmount,
        $updated_at_utc: command.issuedAtUtc,
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
        $entry_type,
        $amount,
        $currency_code,
        $source_object_type,
        $source_object_id,
        $description,
        $metadata_json
      )`,
      {
        $ledger_entry_id: ledgerEntryId,
        $company_id: companyId,
        $entry_time_utc: command.issuedAtUtc,
        $entry_type: "initial_capital",
        $amount: startingCashAmount,
        $currency_code: "USD",
        $source_object_type: "company",
        $source_object_id: companyId,
        $description: "Initial company capital established.",
        $metadata_json: JSON.stringify({ reserveBalanceAmount }),
      },
    );

    dependencies.saveDatabase.run(
      `UPDATE save_game
      SET active_company_id = $active_company_id,
          updated_at_utc = $updated_at_utc
      WHERE save_id = $save_id`,
      {
        $active_company_id: companyId,
        $updated_at_utc: command.issuedAtUtc,
        $save_id: command.saveId,
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
        $company_id: companyId,
        $event_time_utc: command.issuedAtUtc,
        $event_type: "company_created",
        $source_object_type: "company",
        $source_object_id: companyId,
        $severity: "info",
        $message: `Company ${command.payload.displayName} created at ${starterAirport!.airportKey}.`,
        $metadata_json: JSON.stringify({
          starterAirportId: starterAirport!.airportKey,
          starterAirportName: starterAirport!.name,
          baseRole,
          financialPressureBand,
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
          ...command.payload,
          starterAirportId: starterAirport!.airportKey,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [companyId, companyBaseId],
    validationMessages: [`Company ${command.payload.displayName} created successfully.`, ...warnings],
    hardBlockers: [],
    warnings,
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: [ledgerEntryId],
    metadata: {
      companyId,
      companyBaseId,
      starterAirportId: starterAirport!.airportKey,
      financialPressureBand,
    },
  };
}
