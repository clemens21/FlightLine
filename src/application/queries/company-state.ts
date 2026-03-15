import type { SaveId, UtcIsoString } from "../../domain/common/primitives.js";
import type { CompanyPhase } from "../../domain/company/types.js";
import type { FinancialPressureBand } from "../../domain/finance/types.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";

interface CompanyContextRow extends Record<string, unknown> {
  saveId: string;
  worldSeed: string;
  activeCompanyId: string;
  displayName: string;
  reputationScore: number;
  companyPhase: CompanyPhase;
  progressionTier: number;
  currentTimeUtc: string;
  currentCashAmount: number;
  financialPressureBand: FinancialPressureBand;
  reserveBalanceAmount: number | null;
}

interface BaseRow extends Record<string, unknown> {
  airportId: string;
  baseRole: string;
}

interface CountRow extends Record<string, unknown> {
  countValue: number;
}

export interface CompanyContext {
  saveId: SaveId;
  companyId: string;
  worldSeed: string;
  displayName: string;
  reputationScore: number;
  companyPhase: CompanyPhase;
  progressionTier: number;
  currentTimeUtc: UtcIsoString;
  currentCashAmount: number;
  financialPressureBand: FinancialPressureBand;
  reserveBalanceAmount: number | undefined;
  homeBaseAirportId: string;
  baseAirportIds: string[];
  activeAircraftCount: number;
  activeStaffingPackageCount: number;
  activeContractCount: number;
}

export function loadActiveCompanyContext(
  saveDatabase: SqliteFileDatabase,
  saveId: SaveId,
): CompanyContext | null {
  const row = saveDatabase.getOne<CompanyContextRow>(
    `SELECT
      sg.save_id AS saveId,
      sg.world_seed AS worldSeed,
      sg.active_company_id AS activeCompanyId,
      c.display_name AS displayName,
      c.reputation_score AS reputationScore,
      c.company_phase AS companyPhase,
      c.progression_tier AS progressionTier,
      gc.current_time_utc AS currentTimeUtc,
      cfs.current_cash_amount AS currentCashAmount,
      cfs.financial_pressure_band AS financialPressureBand,
      cfs.reserve_balance_amount AS reserveBalanceAmount
    FROM save_game AS sg
    JOIN game_clock AS gc ON gc.save_id = sg.save_id
    JOIN company AS c ON c.company_id = sg.active_company_id
    JOIN company_financial_state AS cfs ON cfs.company_id = c.company_id
    WHERE sg.save_id = $save_id
    LIMIT 1`,
    { $save_id: saveId },
  );

  if (!row) {
    return null;
  }

  const baseRows = saveDatabase.all<BaseRow>(
    `SELECT airport_id AS airportId, base_role AS baseRole
    FROM company_base
    WHERE company_id = $company_id
    ORDER BY CASE base_role
      WHEN 'home_base' THEN 0
      WHEN 'focus' THEN 1
      ELSE 2
    END, activated_at_utc`,
    { $company_id: row.activeCompanyId },
  );

  const homeBase = baseRows[0];
  if (!homeBase) {
    return null;
  }

  const aircraftCountRow = saveDatabase.getOne<CountRow>(
    `SELECT COUNT(*) AS countValue
    FROM company_aircraft
    WHERE company_id = $company_id
      AND delivery_state IN ('delivered', 'available')`,
    { $company_id: row.activeCompanyId },
  );
  const staffingCountRow = saveDatabase.getOne<CountRow>(
    `SELECT COUNT(*) AS countValue
    FROM staffing_package
    WHERE company_id = $company_id
      AND status IN ('pending', 'active')`,
    { $company_id: row.activeCompanyId },
  );
  const contractCountRow = saveDatabase.getOne<CountRow>(
    `SELECT COUNT(*) AS countValue
    FROM company_contract
    WHERE company_id = $company_id
      AND contract_state IN ('accepted', 'assigned', 'active')`,
    { $company_id: row.activeCompanyId },
  );

  return {
    saveId: row.saveId,
    companyId: row.activeCompanyId,
    worldSeed: row.worldSeed,
    displayName: row.displayName,
    reputationScore: row.reputationScore,
    companyPhase: row.companyPhase,
    progressionTier: row.progressionTier,
    currentTimeUtc: row.currentTimeUtc,
    currentCashAmount: row.currentCashAmount,
    financialPressureBand: row.financialPressureBand,
    reserveBalanceAmount: row.reserveBalanceAmount ?? undefined,
    homeBaseAirportId: homeBase.airportId,
    baseAirportIds: baseRows.map((base) => base.airportId),
    activeAircraftCount: aircraftCountRow?.countValue ?? 0,
    activeStaffingPackageCount: staffingCountRow?.countValue ?? 0,
    activeContractCount: contractCountRow?.countValue ?? 0,
  };
}
