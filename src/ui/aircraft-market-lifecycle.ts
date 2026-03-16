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

  const marketExpired = !aircraftMarket || new Date(aircraftMarket.expiresAtUtc).getTime() <= new Date(companyContext.currentTimeUtc).getTime();
  if (aircraftMarket && !marketExpired) {
    console.log(`[ui:timing] aircraft-market ${saveId} refresh=${refreshReason} reused ${Date.now() - startedAtMs}ms offers=${aircraftMarket.offers.length}`);
    return {
      companyContext,
      aircraftMarket,
      refreshed: false,
    };
  }

  const refreshResult = await backend.dispatch({
    commandId: `cmd_aircraft_market_${Date.now()}`,
    saveId,
    commandName: "RefreshAircraftMarket",
    issuedAtUtc: new Date().toISOString(),
    actorType: "system",
    payload: {
      refreshReason,
    },
  });

  if (!refreshResult.success) {
    return {
      companyContext,
      aircraftMarket,
      refreshed: false,
    };
  }

  [companyContext, aircraftMarket] = await Promise.all([
    backend.loadCompanyContext(saveId),
    backend.loadActiveAircraftMarket(saveId),
  ]);

  console.log(`[ui:timing] aircraft-market ${saveId} refresh=${refreshReason} regenerated ${Date.now() - startedAtMs}ms offers=${aircraftMarket?.offers.length ?? 0}`);
  return {
    companyContext,
    aircraftMarket,
    refreshed: true,
  };
}
