/*
 * Loads the active recurring-obligation read model used by overview finance visibility and clock/calendar views.
 * The query stays read-only and enriches obligations with the narrow labels the UI needs without changing
 * the authoritative finance tables or settlement logic.
 */

import type { SaveId, UtcIsoString } from "../../domain/common/primitives.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import { loadActiveCompanyContext } from "./company-state.js";

interface RecurringObligationRow extends Record<string, unknown> {
  recurringObligationId: string;
  obligationType: string;
  sourceObjectType: string;
  sourceObjectId: string;
  amount: number;
  cadence: "weekly" | "monthly";
  nextDueAtUtc: string;
  endAtUtc: string | null;
  status: string;
  staffingLaborCategory: string | null;
  staffingQualificationGroup: string | null;
  staffingEmploymentModel: string | null;
  aircraftId: string | null;
  aircraftRegistration: string | null;
  aircraftDisplayName: string | null;
  aircraftOwnershipType: string | null;
}

export interface RecurringObligationView {
  recurringObligationId: string;
  obligationType: string;
  sourceObjectType: string;
  sourceObjectId: string;
  amount: number;
  cadence: "weekly" | "monthly";
  nextDueAtUtc: UtcIsoString;
  endAtUtc: UtcIsoString | undefined;
  status: string;
  staffingLaborCategory: string | undefined;
  staffingQualificationGroup: string | undefined;
  staffingEmploymentModel: string | undefined;
  aircraftId: string | undefined;
  aircraftRegistration: string | undefined;
  aircraftDisplayName: string | undefined;
  aircraftOwnershipType: string | undefined;
}

export function loadRecurringObligations(
  saveDatabase: SqliteFileDatabase,
  saveId: SaveId,
): RecurringObligationView[] {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);

  if (!companyContext) {
    return [];
  }

  const rows = saveDatabase.all<RecurringObligationRow>(
    `SELECT
      ro.recurring_obligation_id AS recurringObligationId,
      ro.obligation_type AS obligationType,
      ro.source_object_type AS sourceObjectType,
      ro.source_object_id AS sourceObjectId,
      ro.amount AS amount,
      ro.cadence AS cadence,
      ro.next_due_at_utc AS nextDueAtUtc,
      ro.end_at_utc AS endAtUtc,
      ro.status AS status,
      sp.labor_category AS staffingLaborCategory,
      sp.qualification_group AS staffingQualificationGroup,
      sp.employment_model AS staffingEmploymentModel,
      ca.aircraft_id AS aircraftId,
      ca.registration AS aircraftRegistration,
      ca.display_name AS aircraftDisplayName,
      ca.ownership_type AS aircraftOwnershipType
    FROM recurring_obligation AS ro
    LEFT JOIN staffing_package AS sp
      ON ro.source_object_type = 'staffing_package'
     AND ro.source_object_id = sp.staffing_package_id
    LEFT JOIN acquisition_agreement AS aa
      ON ro.source_object_type = 'acquisition_agreement'
     AND ro.source_object_id = aa.acquisition_agreement_id
    LEFT JOIN company_aircraft AS ca
      ON ca.aircraft_id = aa.aircraft_id
    WHERE ro.company_id = $company_id
      AND ro.status = 'active'
    ORDER BY ro.next_due_at_utc ASC, ro.recurring_obligation_id ASC`,
    { $company_id: companyContext.companyId },
  );

  return rows.map((row) => ({
    recurringObligationId: row.recurringObligationId,
    obligationType: row.obligationType,
    sourceObjectType: row.sourceObjectType,
    sourceObjectId: row.sourceObjectId,
    amount: row.amount,
    cadence: row.cadence,
    nextDueAtUtc: row.nextDueAtUtc,
    endAtUtc: row.endAtUtc ?? undefined,
    status: row.status,
    staffingLaborCategory: row.staffingLaborCategory ?? undefined,
    staffingQualificationGroup: row.staffingQualificationGroup ?? undefined,
    staffingEmploymentModel: row.staffingEmploymentModel ?? undefined,
    aircraftId: row.aircraftId ?? undefined,
    aircraftRegistration: row.aircraftRegistration ?? undefined,
    aircraftDisplayName: row.aircraftDisplayName ?? undefined,
    aircraftOwnershipType: row.aircraftOwnershipType ?? undefined,
  }));
}
