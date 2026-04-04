import type { SaveId } from "../../domain/common/primitives.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import { loadActiveCompanyContext, type CompanyContext } from "./company-state.js";

export type OfferWindowType = "aircraft_market" | "contract_board" | "staffing_market";

export interface ActiveOfferWindowRow extends Record<string, unknown> {
  offerWindowId: string;
  companyId: string;
  generatedAtUtc: string;
  expiresAtUtc: string;
  windowSeed: string;
  generationContextHash: string;
  refreshReason: string;
  status: string;
}

export interface ActiveCompanyOfferWindow {
  companyContext: CompanyContext;
  windowRow: ActiveOfferWindowRow;
}

export function loadActiveCompanyOfferWindow(
  saveDatabase: SqliteFileDatabase,
  saveId: SaveId,
  windowType: OfferWindowType,
): ActiveCompanyOfferWindow | null {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);

  if (!companyContext) {
    return null;
  }

  const windowRow = saveDatabase.getOne<ActiveOfferWindowRow>(
    `SELECT
      offer_window_id AS offerWindowId,
      company_id AS companyId,
      generated_at_utc AS generatedAtUtc,
      expires_at_utc AS expiresAtUtc,
      window_seed AS windowSeed,
      generation_context_hash AS generationContextHash,
      refresh_reason AS refreshReason,
      status AS status
    FROM offer_window
    WHERE company_id = $company_id
      AND window_type = $window_type
      AND status = 'active'
    ORDER BY generated_at_utc DESC
    LIMIT 1`,
    {
      $company_id: companyContext.companyId,
      $window_type: windowType,
    },
  );

  if (!windowRow) {
    return null;
  }

  return {
    companyContext,
    windowRow,
  };
}
