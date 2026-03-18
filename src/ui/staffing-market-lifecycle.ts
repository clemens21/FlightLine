/*
 * Keeps the staffing market fresh enough for the Staff workspace without forcing the UI to know refresh rules.
 * The first pass only cares about having an active pilot-candidate market when the staffing tab is rendered.
 */

import type { FlightLineBackend } from "../application/backend-service.js";
import type { CompanyContext } from "../application/queries/company-state.js";
import type { StaffingMarketView } from "../application/queries/staffing-market.js";

export interface EnsuredStaffingMarketResult {
  companyContext: CompanyContext | null;
  staffingMarket: StaffingMarketView | null;
  refreshed: boolean;
}

export async function ensureActiveStaffingMarket(
  backend: FlightLineBackend,
  saveId: string,
  refreshReason: "scheduled" | "manual" | "bootstrap" = "scheduled",
): Promise<EnsuredStaffingMarketResult> {
  const startedAtMs = Date.now();
  let [companyContext, staffingMarket] = await Promise.all([
    backend.loadCompanyContext(saveId),
    backend.loadActiveStaffingMarket(saveId),
  ]);

  if (!companyContext) {
    return {
      companyContext: null,
      staffingMarket: null,
      refreshed: false,
    };
  }

  const refreshResult = await backend.reconcileStaffingMarket(saveId, refreshReason);
  const refreshed = Boolean(refreshResult?.success && refreshResult.changed);

  [companyContext, staffingMarket] = await Promise.all([
    backend.loadCompanyContext(saveId),
    backend.loadActiveStaffingMarket(saveId),
  ]);

  console.log(
    `[ui:timing] staffing-market ${saveId} refresh=${refreshReason} ${refreshed ? "reconciled" : "stable"} ${Date.now() - startedAtMs}ms offers=${staffingMarket?.offers.length ?? 0}`,
  );

  return {
    companyContext,
    staffingMarket,
    refreshed,
  };
}
