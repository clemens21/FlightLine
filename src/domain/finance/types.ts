/*
 * Declares the domain types for finance so commands, queries, and UI code share the same vocabulary.
 * These files are intentionally descriptive rather than behavioral: they define the shapes that move through the simulation.
 */

import type { CompanyId, CurrencyAmount, JsonObject, UtcIsoString } from "../common/primitives.js";

export type FinancialPressureBand = "stable" | "tight" | "stressed";
export type RecurringObligationType = "lease" | "finance" | "staffing" | "service_agreement" | "base_overhead";

export interface CompanyFinancialState {
  companyId: CompanyId;
  currentCashAmount: CurrencyAmount;
  financialPressureBand: FinancialPressureBand;
  reserveBalanceAmount?: CurrencyAmount;
  updatedAtUtc: UtcIsoString;
}

export interface RecurringObligation {
  recurringObligationId: string;
  companyId: CompanyId;
  obligationType: RecurringObligationType;
  sourceObjectType: string;
  sourceObjectId: string;
  amount: CurrencyAmount;
  cadence: "daily" | "weekly" | "monthly";
  nextDueAtUtc: UtcIsoString;
  endAtUtc?: UtcIsoString;
  status: "active" | "completed" | "cancelled";
}

export interface LedgerEntry {
  ledgerEntryId: string;
  companyId: CompanyId;
  entryTimeUtc: UtcIsoString;
  entryType: string;
  amount: CurrencyAmount;
  currencyCode: "USD";
  sourceObjectType?: string;
  sourceObjectId?: string;
  description: string;
  metadata?: JsonObject;
}
