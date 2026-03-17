/*
 * Applies route-plan acceptance actions on behalf of the contracts UI.
 * It translates planner selections into the command-layer mutations that create or update company work.
 */

import type { FlightLineBackend } from "../index.js";
import { loadRoutePlanState } from "./route-plan-state.js";

export interface AcceptRoutePlanOffersResult {
  success: boolean;
  acceptedCount: number;
  unavailableCount: number;
  failedCount: number;
  message?: string | undefined;
  error?: string | undefined;
  failedMessages?: string[] | undefined;
  acceptedRoutePlanItemIds?: string[] | undefined;
}

export async function acceptRoutePlanOffers(
  backend: FlightLineBackend,
  saveId: string,
  routePlanItemIds: string[],
  commandIdBase: string,
): Promise<AcceptRoutePlanOffersResult> {
  const requestedRoutePlanItemIds = [...new Set(routePlanItemIds.filter(Boolean))];
  if (requestedRoutePlanItemIds.length === 0) {
    return {
      success: false,
      acceptedCount: 0,
      unavailableCount: 0,
      failedCount: 0,
      error: "Select at least one planned offer to accept.",
    };
  }

  const routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
  if (!routePlan || routePlan.items.length === 0) {
    return {
      success: false,
      acceptedCount: 0,
      unavailableCount: 0,
      failedCount: 0,
      error: "Route plan is empty.",
    };
  }

  const requestedItemIds = new Set(requestedRoutePlanItemIds);
  const selectedItems = routePlan.items.filter((item) => requestedItemIds.has(item.routePlanItemId));
  if (selectedItems.length === 0) {
    return {
      success: false,
      acceptedCount: 0,
      unavailableCount: 0,
      failedCount: 0,
      error: "Selected route plan items were not found.",
    };
  }

  const readyItems = selectedItems.filter((item) => item.sourceType === "candidate_offer" && item.plannerItemStatus === "candidate_available");
  const unavailableItems = selectedItems.filter((item) => item.sourceType === "candidate_offer" && item.plannerItemStatus !== "candidate_available");

  if (readyItems.length === 0) {
    return {
      success: false,
      acceptedCount: 0,
      unavailableCount: unavailableItems.length,
      failedCount: 0,
      error: "No planned offers are ready to accept.",
    };
  }

  const acceptedRoutePlanItemIds: string[] = [];
  const failedMessages: string[] = [];

  for (const [index, item] of readyItems.entries()) {
    const result = await backend.dispatch({
      commandId: `${commandIdBase}_${index + 1}`,
      saveId,
      commandName: "AcceptContractOffer",
      issuedAtUtc: new Date().toISOString(),
      actorType: "player",
      payload: {
        contractOfferId: item.sourceId,
      },
    });

    if (result.success) {
      acceptedRoutePlanItemIds.push(item.routePlanItemId);
      continue;
    }

    failedMessages.push(result.hardBlockers[0] ?? `Could not accept planned offer ${item.sourceId}.`);
  }

  const acceptedCount = acceptedRoutePlanItemIds.length;
  const failedCount = failedMessages.length;
  const messageParts = [`Accepted ${acceptedCount} planned offer${acceptedCount === 1 ? "" : "s"}`];

  if (unavailableItems.length > 0) {
    messageParts.push(`${unavailableItems.length} unavailable`);
  }

  if (failedCount > 0) {
    messageParts.push(`${failedCount} failed`);
  }

  return {
    success: true,
    acceptedCount,
    unavailableCount: unavailableItems.length,
    failedCount,
    failedMessages,
    acceptedRoutePlanItemIds,
    message: `${messageParts.join(", ")}.`,
  };
}
