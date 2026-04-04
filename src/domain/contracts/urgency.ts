export type ContractUrgencyBand = "stable" | "at_risk" | "overdue";

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
