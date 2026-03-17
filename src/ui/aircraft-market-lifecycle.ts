/*
 * Keeps the aircraft market fresh enough for UI consumption without forcing every caller to understand market refresh rules.
 * This module is the bridge between the backend command/query layer and the save-shell market experience.
 */

import type { FlightLineBackend } from "../application/backend-service.js";
import type { AircraftMarketView } from "../application/queries/aircraft-market.js";
import type { CompanyContext } from "../application/queries/company-state.js";

export interface EnsuredAircraftMarketResult {
  companyContext: CompanyContext | null;
  aircraftMarket: AircraftMarketView | null;
  refreshed: boolean;
}

export async function ensureActiveAircraftMarket(
  backend: FlightLineBackend,
  saveId: string,
  refreshReason: "scheduled" | "manual" | "bootstrap" = "scheduled",
): Promise<EnsuredAircraftMarketResult> {
  const startedAtMs = Date.now();
  let [companyContext, aircraftMarket] = await Promise.all([
    backend.loadCompanyContext(saveId),
    backend.loadActiveAircraftMarket(saveId),
  ]);

  if (!companyContext) {
    return {
      companyContext: null,
      aircraftMarket: null,
      refreshed: false,
    };
  }

  const refreshResult = await backend.reconcileAircraftMarket(saveId, refreshReason);
  const refreshed = Boolean(refreshResult?.success && refreshResult.changed);

  [companyContext, aircraftMarket] = await Promise.all([
    backend.loadCompanyContext(saveId),
    backend.loadActiveAircraftMarket(saveId),
  ]);

  console.log(
    `[ui:timing] aircraft-market ${saveId} refresh=${refreshReason} ${refreshed ? "reconciled" : "stable"} ${Date.now() - startedAtMs}ms offers=${aircraftMarket?.offers.length ?? 0}`,
  );
  return {
    companyContext,
    aircraftMarket,
    refreshed,
  };
}
