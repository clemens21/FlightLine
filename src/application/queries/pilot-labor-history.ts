/*
 * Builds a player-readable pilot labor history from persisted staffing events and finance entries.
 * This stays as a pilot-scoped read model so staffing views can explain labor truth without carrying full timelines everywhere.
 */

import type { SaveId, UtcIsoString } from "../../domain/common/primitives.js";
import type { JsonObject } from "../../domain/common/primitives.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import { loadActiveCompanyContext } from "./company-state.js";

interface NamedPilotLaborRow extends Record<string, unknown> {
  namedPilotId: string;
  staffingPackageId: string;
  displayName: string;
}

interface EventLogRow extends Record<string, unknown> {
  eventLogEntryId: string;
  eventTimeUtc: string;
  eventType: string;
  sourceObjectType: string | null;
  sourceObjectId: string | null;
  message: string;
  metadataJson: string | null;
}

interface LedgerEntryRow extends Record<string, unknown> {
  ledgerEntryId: string;
  entryTimeUtc: string;
  entryType: string;
  amount: number;
  sourceObjectType: string | null;
  sourceObjectId: string | null;
  description: string;
  metadataJson: string | null;
}

export type PilotLaborRecordType =
  | "hire_started"
  | "hire_scheduled"
  | "conversion"
  | "dismissal"
  | "contract_end"
  | "contract_engagement_fee"
  | "contract_usage_billed"
  | "salary_collected";

export interface PilotLaborRecordEntryView {
  recordId: string;
  recordType: PilotLaborRecordType;
  occurredAtUtc: UtcIsoString;
  title: string;
  detail: string;
  amount: number | undefined;
  hours: number | undefined;
}

export interface PilotLaborHistoryView {
  saveId: SaveId;
  companyId: string;
  namedPilotId: string;
  staffingPackageId: string;
  displayName: string;
  entries: PilotLaborRecordEntryView[];
}

function parseJsonObject(rawValue: string | null | undefined): JsonObject | undefined {
  if (!rawValue) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue) as JsonObject;
  } catch {
    return undefined;
  }
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toEntryFromEvent(row: EventLogRow): PilotLaborRecordEntryView | null {
  const metadata = parseJsonObject(row.metadataJson);

  switch (row.eventType) {
    case "staffing_package_activated":
      return {
        recordId: row.eventLogEntryId,
        recordType: "hire_started",
        occurredAtUtc: row.eventTimeUtc,
        title: metadata?.employmentModel === "contract_hire" ? "Contract started" : "Hire started",
        detail: row.message,
        amount: undefined,
        hours: undefined,
      };
    case "staffing_package_scheduled":
      return {
        recordId: row.eventLogEntryId,
        recordType: "hire_scheduled",
        occurredAtUtc: row.eventTimeUtc,
        title: "Hire scheduled",
        detail: row.message,
        amount: undefined,
        hours: undefined,
      };
    case "named_pilot_converted_to_direct_hire":
      return {
        recordId: row.eventLogEntryId,
        recordType: "conversion",
        occurredAtUtc: row.eventTimeUtc,
        title: "Converted to direct hire",
        detail: row.message,
        amount: asNumber(metadata?.directSalaryAmount),
        hours: undefined,
      };
    case "named_pilot_dismissed":
      return {
        recordId: row.eventLogEntryId,
        recordType: "dismissal",
        occurredAtUtc: row.eventTimeUtc,
        title: "Dismissed from active coverage",
        detail: row.message,
        amount: undefined,
        hours: undefined,
      };
    case "staffing_package_expired":
      return {
        recordId: row.eventLogEntryId,
        recordType: "contract_end",
        occurredAtUtc: row.eventTimeUtc,
        title: "Contract ended",
        detail: row.message,
        amount: undefined,
        hours: undefined,
      };
    default:
      return null;
  }
}

function toEntryFromLedger(row: LedgerEntryRow): PilotLaborRecordEntryView | null {
  const metadata = parseJsonObject(row.metadataJson);

  switch (row.entryType) {
    case "staffing_activation":
      return {
        recordId: row.ledgerEntryId,
        recordType: "contract_engagement_fee",
        occurredAtUtc: row.entryTimeUtc,
        title: "Contract engagement fee",
        detail: row.description,
        amount: row.amount,
        hours: undefined,
      };
    case "contract_staffing_usage":
      return {
        recordId: row.ledgerEntryId,
        recordType: "contract_usage_billed",
        occurredAtUtc: row.entryTimeUtc,
        title: "Contract flight hours billed",
        detail: row.description,
        amount: row.amount,
        hours: asNumber(metadata?.durationHours),
      };
    case "staffing_payment":
      return {
        recordId: row.ledgerEntryId,
        recordType: "salary_collected",
        occurredAtUtc: row.entryTimeUtc,
        title: "Salary collected",
        detail: row.description,
        amount: row.amount,
        hours: undefined,
      };
    default:
      return null;
  }
}

export function loadPilotLaborHistoryCollection(
  saveDatabase: SqliteFileDatabase,
  saveId: SaveId,
  namedPilotIds?: readonly string[],
  limit = 16,
): Map<string, PilotLaborHistoryView> {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);

  if (!companyContext) {
    return new Map();
  }

  const targetPilotIds = namedPilotIds ? new Set(namedPilotIds) : null;
  const pilotRows = saveDatabase
    .all<NamedPilotLaborRow>(
      `SELECT
        np.named_pilot_id AS namedPilotId,
        np.staffing_package_id AS staffingPackageId,
        np.display_name AS displayName
      FROM named_pilot AS np
      JOIN staffing_package AS sp
        ON sp.staffing_package_id = np.staffing_package_id
      WHERE sp.company_id = $company_id
      ORDER BY np.named_pilot_id ASC`,
      { $company_id: companyContext.companyId },
    )
    .filter((row) => !targetPilotIds || targetPilotIds.has(row.namedPilotId));

  if (pilotRows.length === 0) {
    return new Map();
  }

  const packageIds = new Set(pilotRows.map((row) => row.staffingPackageId));
  const pilotIds = new Set(pilotRows.map((row) => row.namedPilotId));
  const historyMap = new Map<string, PilotLaborHistoryView>(
    pilotRows.map((row) => [
      row.namedPilotId,
      {
        saveId,
        companyId: companyContext.companyId,
        namedPilotId: row.namedPilotId,
        staffingPackageId: row.staffingPackageId,
        displayName: row.displayName,
        entries: [],
      },
    ]),
  );

  const eventRows = saveDatabase.all<EventLogRow>(
    `SELECT
      event_log_entry_id AS eventLogEntryId,
      event_time_utc AS eventTimeUtc,
      event_type AS eventType,
      source_object_type AS sourceObjectType,
      source_object_id AS sourceObjectId,
      message AS message,
      metadata_json AS metadataJson
    FROM event_log_entry
    WHERE save_id = $save_id
      AND event_type IN (
        'staffing_package_activated',
        'staffing_package_scheduled',
        'staffing_package_expired',
        'named_pilot_converted_to_direct_hire',
        'named_pilot_dismissed'
      )
    ORDER BY event_time_utc DESC, event_log_entry_id DESC`,
    { $save_id: saveId },
  );

  for (const row of eventRows) {
    const targetHistory = row.sourceObjectType === "staffing_package"
      ? pilotRows.find((pilot) => pilot.staffingPackageId === row.sourceObjectId)
      : row.sourceObjectType === "named_pilot"
        ? pilotRows.find((pilot) => pilot.namedPilotId === row.sourceObjectId)
        : undefined;

    if (!targetHistory) {
      continue;
    }

    const entry = toEntryFromEvent(row);
    if (entry) {
      historyMap.get(targetHistory.namedPilotId)?.entries.push(entry);
    }
  }

  const ledgerRows = saveDatabase.all<LedgerEntryRow>(
    `SELECT
      ledger_entry_id AS ledgerEntryId,
      entry_time_utc AS entryTimeUtc,
      entry_type AS entryType,
      amount AS amount,
      source_object_type AS sourceObjectType,
      source_object_id AS sourceObjectId,
      description AS description,
      metadata_json AS metadataJson
    FROM ledger_entry
    WHERE company_id = $company_id
      AND source_object_type = 'staffing_package'
      AND entry_type IN ('staffing_activation', 'contract_staffing_usage', 'staffing_payment')
    ORDER BY entry_time_utc DESC, ledger_entry_id DESC`,
    { $company_id: companyContext.companyId },
  );

  for (const row of ledgerRows) {
    if (!row.sourceObjectId || !packageIds.has(row.sourceObjectId)) {
      continue;
    }

    const targetPilot = pilotRows.find((pilot) => pilot.staffingPackageId === row.sourceObjectId);
    if (!targetPilot) {
      continue;
    }

    const entry = toEntryFromLedger(row);
    if (entry) {
      historyMap.get(targetPilot.namedPilotId)?.entries.push(entry);
    }
  }

  for (const history of historyMap.values()) {
    history.entries = history.entries
      .sort((left, right) => {
        const timeDelta = Date.parse(right.occurredAtUtc) - Date.parse(left.occurredAtUtc);
        if (timeDelta !== 0) {
          return timeDelta;
        }

        return right.recordId.localeCompare(left.recordId);
      })
      .slice(0, Math.max(limit, 1));
  }

  return historyMap;
}

export function loadPilotLaborHistory(
  saveDatabase: SqliteFileDatabase,
  saveId: SaveId,
  namedPilotId: string,
  limit = 16,
): PilotLaborHistoryView | null {
  return loadPilotLaborHistoryCollection(saveDatabase, saveId, [namedPilotId], limit).get(namedPilotId) ?? null;
}
