import type { JsonObject } from "../common/primitives.js";

export type ContractUrgencyBand = "stable" | "at_risk" | "overdue";

const contractUrgencyPayoutFloor = 0.88;
const contractUrgencyPayoutCeiling = 1.35;
const contractUrgencyPayoutDecayHours = 24;

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

export function resolveContractUrgencyPayoutMultiplier(hoursRemaining: number): number {
  const multiplier =
    contractUrgencyPayoutFloor
    + (contractUrgencyPayoutCeiling - contractUrgencyPayoutFloor) * Math.exp(-hoursRemaining / contractUrgencyPayoutDecayHours);

  return Math.min(
    contractUrgencyPayoutCeiling,
    Math.max(contractUrgencyPayoutFloor, multiplier),
  );
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
  return Math.max(1, Math.round(basePayoutAmount * resolveContractUrgencyPayoutMultiplier(hoursRemaining)));
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
