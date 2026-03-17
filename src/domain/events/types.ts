/*
 * Declares the domain types for events so commands, queries, and UI code share the same vocabulary.
 * These files are intentionally descriptive rather than behavioral: they define the shapes that move through the simulation.
 */

import type { EventLogEntryId, JsonObject, UtcIsoString } from "../common/primitives.js";

export interface EventLogEntry {
  eventLogEntryId: EventLogEntryId;
  saveId: string;
  companyId?: string;
  eventTimeUtc: UtcIsoString;
  eventType: string;
  sourceObjectType?: string;
  sourceObjectId?: string;
  severity?: "critical" | "warning" | "info" | "opportunity";
  message: string;
  metadata?: JsonObject;
}

export interface OperationalExecution {
  operationalExecutionId: string;
  flightLegId?: string;
  executionType: string;
  occurredAtUtc: UtcIsoString;
  resultState: string;
  metadata?: JsonObject;
}
