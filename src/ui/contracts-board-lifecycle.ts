/*
 * Keeps the contract board valid and refreshed for UI consumers.
 * It decides when the persisted board can be reused and when the backend needs to regenerate market offers.
 */

import type { FlightLineBackend } from "../application/backend-service.js";
import type { CompanyContext } from "../application/queries/company-state.js";
import type { ContractBoardView } from "../application/queries/contract-board.js";

export interface EnsuredContractBoardResult {
  companyContext: CompanyContext | null;
  contractBoard: ContractBoardView | null;
  refreshed: boolean;
}

const minimumContractBoardOfferCount = 400;

export async function ensureActiveContractBoard(
  backend: FlightLineBackend,
  saveId: string,
  refreshReason: "scheduled" | "manual" | "bootstrap" = "scheduled",
): Promise<EnsuredContractBoardResult> {
  const startedAtMs = Date.now();
  let [companyContext, contractBoard] = await Promise.all([
    backend.loadCompanyContext(saveId),
    backend.loadActiveContractBoard(saveId),
  ]);

  if (!companyContext) {
    return {
      companyContext: null,
      contractBoard: null,
      refreshed: false,
    };
  }

  const activeBoard = contractBoard;
  const boardExpired = !activeBoard || new Date(activeBoard.expiresAtUtc).getTime() <= new Date(companyContext.currentTimeUtc).getTime();
  const boardUndersized = activeBoard != null && activeBoard.offers.length < minimumContractBoardOfferCount;

  if (activeBoard && !boardExpired && !boardUndersized) {
    console.log(`[ui:timing] contracts-board ${saveId} refresh=${refreshReason} reused ${Date.now() - startedAtMs}ms offers=${activeBoard.offers.length}`);
    return {
      companyContext,
      contractBoard: activeBoard,
      refreshed: false,
    };
  }

  const refreshResult = await backend.dispatch({
    commandId: `cmd_contract_board_${Date.now()}`,
    saveId,
    commandName: "RefreshContractBoard",
    issuedAtUtc: new Date().toISOString(),
    actorType: "system",
    payload: {
      refreshReason,
    },
  });

  if (!refreshResult.success) {
    return {
      companyContext,
      contractBoard,
      refreshed: false,
    };
  }

  [companyContext, contractBoard] = await Promise.all([
    backend.loadCompanyContext(saveId),
    backend.loadActiveContractBoard(saveId),
  ]);

  console.log(`[ui:timing] contracts-board ${saveId} refresh=${refreshReason} regenerated ${Date.now() - startedAtMs}ms offers=${contractBoard?.offers.length ?? 0}`);
  return {
    companyContext,
    contractBoard,
    refreshed: true,
  };
}



