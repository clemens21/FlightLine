import type { JsonObject, SaveId } from "../../domain/common/primitives.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import { loadActiveCompanyContext } from "./company-state.js";

interface EventLogRow extends Record<string, unknown> {
  eventLogEntryId: string;
  eventTimeUtc: string;
  eventType: string;
  sourceObjectType: string | null;
  sourceObjectId: string | null;
  severity: "critical" | "warning" | "info" | "opportunity" | null;
  message: string;
  metadataJson: string | null;
}

export interface EventLogEntryView {
  eventLogEntryId: string;
  eventTimeUtc: string;
  eventType: string;
  sourceObjectType: string | undefined;
  sourceObjectId: string | undefined;
  severity: "critical" | "warning" | "info" | "opportunity" | undefined;
  message: string;
  metadata: JsonObject | undefined;
}

export interface EventLogView {
  saveId: SaveId;
  companyId: string;
  entries: EventLogEntryView[];
}

function parseJsonObject(rawValue: string | null): JsonObject | undefined {
  if (!rawValue) {
    return undefined;
  }

  return JSON.parse(rawValue) as JsonObject;
}

export function loadRecentEventLog(saveDatabase: SqliteFileDatabase, saveId: SaveId, limit = 20): EventLogView | null {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);

  if (!companyContext) {
    return null;
  }

  const rows = saveDatabase.all<EventLogRow>(
    `SELECT
      event_log_entry_id AS eventLogEntryId,
      event_time_utc AS eventTimeUtc,
      event_type AS eventType,
      source_object_type AS sourceObjectType,
      source_object_id AS sourceObjectId,
      severity AS severity,
      message AS message,
      metadata_json AS metadataJson
    FROM event_log_entry
    WHERE save_id = $save_id
    ORDER BY event_time_utc DESC, event_log_entry_id DESC
    LIMIT $limit_value`,
    {
      $save_id: saveId,
      $limit_value: limit,
    },
  );

  return {
    saveId,
    companyId: companyContext.companyId,
    entries: rows.map((row) => ({
      eventLogEntryId: row.eventLogEntryId,
      eventTimeUtc: row.eventTimeUtc,
      eventType: row.eventType,
      sourceObjectType: row.sourceObjectType ?? undefined,
      sourceObjectId: row.sourceObjectId ?? undefined,
      severity: row.severity ?? undefined,
      message: row.message,
      metadata: parseJsonObject(row.metadataJson),
    })),
  };
}
