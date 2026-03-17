/*
 * Implements the utils command handler for the backend command pipeline.
 * Files in this layer validate a request, mutate save-state tables inside a transaction, and return structured results for callers.
 */

import { randomUUID } from "node:crypto";

import type { CurrencyAmount } from "../../domain/common/primitives.js";
import type { FinancialPressureBand } from "../../domain/finance/types.js";

export function createPrefixedId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function deriveFinancialPressureBand(currentCashAmount: CurrencyAmount): FinancialPressureBand {
  if (currentCashAmount < 250_000) {
    return "stressed";
  }

  if (currentCashAmount < 1_000_000) {
    return "tight";
  }

  return "stable";
}

export function normalizeUpperCode(value: string): string {
  return value.trim().toUpperCase();
}

export function addUtcDays(utcIsoString: string, days: number): string {
  const next = new Date(utcIsoString);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

export function addUtcWeeks(utcIsoString: string, weeks: number): string {
  return addUtcDays(utcIsoString, weeks * 7);
}

export function addUtcMonths(utcIsoString: string, months: number): string {
  const next = new Date(utcIsoString);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next.toISOString();
}

export function addCadenceToUtc(utcIsoString: string, cadence: "daily" | "weekly" | "monthly"): string {
  switch (cadence) {
    case "daily":
      return addUtcDays(utcIsoString, 1);
    case "weekly":
      return addUtcWeeks(utcIsoString, 1);
    case "monthly":
      return addUtcMonths(utcIsoString, 1);
  }
}

export function calculateFinanceRecurringPayment(
  principalAmount: CurrencyAmount,
  annualRatePercent: number,
  termMonths: number,
  cadence: "weekly" | "monthly",
): CurrencyAmount {
  const periods = cadence === "monthly" ? termMonths : Math.max(1, Math.round((termMonths * 52) / 12));

  if (periods <= 0) {
    return 0;
  }

  const ratePerPeriod = cadence === "monthly"
    ? annualRatePercent / 100 / 12
    : annualRatePercent / 100 / 52;

  if (principalAmount <= 0) {
    return 0;
  }

  if (ratePerPeriod <= 0) {
    return Math.ceil(principalAmount / periods);
  }

  const factor = Math.pow(1 + ratePerPeriod, periods);
  return Math.ceil((principalAmount * ratePerPeriod * factor) / (factor - 1));
}
