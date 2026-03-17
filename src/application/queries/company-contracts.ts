/*
 * Builds the company contracts read model from persisted save data and reference lookups when needed.
 * These query modules intentionally stay read-only so the UI and tests can ask for consistent snapshots without triggering side effects.
 */

import type { SaveId } from "../../domain/common/primitives.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import { loadActiveCompanyContext } from "./company-state.js";

interface CompanyContractRow extends Record<string, unknown> {
  companyContractId: string;
  originContractOfferId: string | null;
  archetype: string;
  originAirportId: string;
  destinationAirportId: string;
  volumeType: "passenger" | "cargo";
  passengerCount: number | null;
  cargoWeightLb: number | null;
  acceptedPayoutAmount: number;
  penaltyModelJson: string;
  acceptedAtUtc: string;
  earliestStartUtc: string | null;
  deadlineUtc: string;
  contractState: string;
  assignedAircraftId: string | null;
}

export interface CompanyContractView {
  companyContractId: string;
  originContractOfferId: string | undefined;
  archetype: string;
  originAirportId: string;
  destinationAirportId: string;
  volumeType: "passenger" | "cargo";
  passengerCount: number | undefined;
  cargoWeightLb: number | undefined;
  acceptedPayoutAmount: number;
  cancellationPenaltyAmount: number;
  acceptedAtUtc: string;
  earliestStartUtc: string | undefined;
  deadlineUtc: string;
  contractState: string;
  assignedAircraftId: string | undefined;
}

export interface CompanyContractsView {
  saveId: SaveId;
  companyId: string;
  contracts: CompanyContractView[];
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

export function loadCompanyContracts(saveDatabase: SqliteFileDatabase, saveId: SaveId): CompanyContractsView | null {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);

  if (!companyContext) {
    return null;
  }

  const rows = saveDatabase.all<CompanyContractRow>(
    `SELECT
      company_contract_id AS companyContractId,
      origin_contract_offer_id AS originContractOfferId,
      archetype AS archetype,
      origin_airport_id AS originAirportId,
      destination_airport_id AS destinationAirportId,
      volume_type AS volumeType,
      passenger_count AS passengerCount,
      cargo_weight_lb AS cargoWeightLb,
      accepted_payout_amount AS acceptedPayoutAmount,
      penalty_model_json AS penaltyModelJson,
      accepted_at_utc AS acceptedAtUtc,
      earliest_start_utc AS earliestStartUtc,
      deadline_utc AS deadlineUtc,
      contract_state AS contractState,
      assigned_aircraft_id AS assignedAircraftId
    FROM company_contract
    WHERE company_id = $company_id
    ORDER BY CASE contract_state
      WHEN 'accepted' THEN 0
      WHEN 'assigned' THEN 1
      WHEN 'active' THEN 2
      WHEN 'failed' THEN 3
      WHEN 'late_completed' THEN 4
      WHEN 'completed' THEN 5
      ELSE 6
    END,
    deadline_utc ASC,
    accepted_at_utc DESC`,
    { $company_id: companyContext.companyId },
  );

  return {
    saveId,
    companyId: companyContext.companyId,
    contracts: rows.map((row) => ({
      companyContractId: row.companyContractId,
      originContractOfferId: row.originContractOfferId ?? undefined,
      archetype: row.archetype,
      originAirportId: row.originAirportId,
      destinationAirportId: row.destinationAirportId,
      volumeType: row.volumeType,
      passengerCount: row.passengerCount ?? undefined,
      cargoWeightLb: row.cargoWeightLb ?? undefined,
      acceptedPayoutAmount: row.acceptedPayoutAmount,
      cancellationPenaltyAmount: parseCancellationPenaltyAmount(row.penaltyModelJson, row.acceptedPayoutAmount * 0.14),
      acceptedAtUtc: row.acceptedAtUtc,
      earliestStartUtc: row.earliestStartUtc ?? undefined,
      deadlineUtc: row.deadlineUtc,
      contractState: row.contractState,
      assignedAircraftId: row.assignedAircraftId ?? undefined,
    })),
  };
}
