import type { JsonObject } from "../common/primitives.js";

export type ContractUrgencyBand = "stable" | "at_risk" | "overdue";

export function resolveContractRemainingHours(latestCompletionUtc: string, currentTimeUtc: string): number {
  return (new Date(latestCompletionUtc).getTime() - new Date(currentTimeUtc).getTime()) / 3_600_000;
}

export function buildContractUrgencyBand(hoursRemaining: number): ContractUrgencyBand {
  if (hoursRemaining <= 0) {
    return "overdue";
  }

  if (hoursRemaining <= 48) {
    return "at_risk";
  }

  return "stable";
}

export function resolveContractUrgencyPremiumMultiplier(hoursRemaining: number): number {
  if (hoursRemaining <= 24) {
    return 1.24;
  }

  if (hoursRemaining <= 36) {
    return 1.18;
  }

  if (hoursRemaining <= 48) {
    return 1.12;
  }

  return 1;
}

export function resolveContractOfferBasePayoutAmount(
  storedPayoutAmount: number,
  explanationMetadata: JsonObject | null | undefined,
): number {
  const basePayoutAmount = explanationMetadata?.base_payout_amount;

  if (typeof basePayoutAmount === "number" && Number.isFinite(basePayoutAmount) && basePayoutAmount > 0) {
    return Math.max(1, Math.round(basePayoutAmount));
  }

  return Math.max(1, Math.round(storedPayoutAmount));
}

export function resolveDynamicContractOfferPayoutAmount(basePayoutAmount: number, hoursRemaining: number): number {
  return Math.max(1, Math.round(basePayoutAmount * resolveContractUrgencyPremiumMultiplier(hoursRemaining)));
}

export function resolveDynamicContractOfferPayout(
  storedPayoutAmount: number,
  explanationMetadata: JsonObject | null | undefined,
  latestCompletionUtc: string,
  currentTimeUtc: string,
): number {
  return resolveDynamicContractOfferPayoutAmount(
    resolveContractOfferBasePayoutAmount(storedPayoutAmount, explanationMetadata),
    resolveContractRemainingHours(latestCompletionUtc, currentTimeUtc),
  );
}
