/*
 * Shapes the bounded finance visibility data shown in Overview.
 * This stays intentionally narrow: it summarizes known recurring obligations and accepted-work confidence
 * without trying to model a full finance workstation or broader profitability system.
 */

import type { CompanyContractsView, CompanyContractView } from "../application/queries/company-contracts.js";
import type { CompanyContext } from "../application/queries/company-state.js";
import type { FleetStateView } from "../application/queries/fleet-state.js";
import type { RecurringObligationView } from "../application/queries/recurring-obligations.js";
import type { StaffingStateView } from "../application/queries/staffing-state.js";
import type { RoutePlanState } from "./route-plan-state.js";

export type OverviewFinanceCategory = "Labor" | "Leases" | "Finance" | "Other";
export type OverviewFinanceHorizonId = "2w" | "4w" | "8w";
export type OverviewFinanceConfidenceBand = "none" | "low" | "medium" | "high";

export interface OverviewFinanceSummaryCardView {
  label: string;
  value: string;
  detail: string;
}

export interface OverviewFinanceCategoryView {
  category: OverviewFinanceCategory;
  monthlyEquivalentAmount: number;
  obligationCount: number;
  detail: string;
}

export interface OverviewFinanceObligationView {
  recurringObligationId: string;
  category: OverviewFinanceCategory;
  label: string;
  detail: string;
  amount: number;
  cadence: "weekly" | "monthly";
  nextDueAtUtc: string;
  severity: "normal" | "warning" | "critical";
}

export interface OverviewFinanceProjectionPointView {
  pointId: string;
  label: string;
  daysFromNow: number;
  atUtc: string;
  baseCashAmount: number;
  upliftCashAmount: number;
  upliftAmount: number;
  upliftSourceCount: number;
  confidenceBand: OverviewFinanceConfidenceBand;
}

export interface OverviewFinanceProjectionView {
  defaultHorizonId: OverviewFinanceHorizonId;
  horizons: Array<{
    horizonId: OverviewFinanceHorizonId;
    label: string;
    pointCount: number;
  }>;
  points: OverviewFinanceProjectionPointView[];
}

export interface OverviewFinanceView {
  summaryCards: OverviewFinanceSummaryCardView[];
  categoryTotals: OverviewFinanceCategoryView[];
  obligations: OverviewFinanceObligationView[];
  projection: OverviewFinanceProjectionView;
}

interface AcceptedWorkProjectionCandidate {
  companyContractId: string;
  deadlineUtc: string;
  weightedUpliftAmount: number;
  confidenceWeight: number;
}

const monthFactorByCadence: Record<"weekly" | "monthly", number> = {
  weekly: 52 / 12,
  monthly: 1,
};

const horizonDays: Record<OverviewFinanceHorizonId, number> = {
  "2w": 14,
  "4w": 28,
  "8w": 56,
};

const categoryOrder: OverviewFinanceCategory[] = ["Labor", "Leases", "Finance", "Other"];

export function buildOverviewFinanceView(params: {
  companyContext: CompanyContext;
  companyContracts: CompanyContractsView | null;
  fleetState: FleetStateView | null;
  staffingState: StaffingStateView | null;
  recurringObligations: RecurringObligationView[];
  routePlan: RoutePlanState | null;
}): OverviewFinanceView {
  const obligations = params.recurringObligations.map((obligation) => buildObligationView(params.companyContext.currentTimeUtc, obligation));
  const categoryTotals = buildCategoryTotals(obligations);
  const nextHit = obligations[0];
  const recurringTotalAmount = categoryTotals.reduce((sum, category) => sum + category.monthlyEquivalentAmount, 0);
  const projection = buildProjection({
    currentTimeUtc: params.companyContext.currentTimeUtc,
    currentCashAmount: params.companyContext.currentCashAmount,
    obligations: params.recurringObligations,
    contracts: params.companyContracts?.contracts ?? [],
    routePlan: params.routePlan,
  });

  return {
    summaryCards: [
      {
        label: "Current cash",
        value: formatMoney(params.companyContext.currentCashAmount),
        detail: `${humanize(params.companyContext.financialPressureBand)} pressure band`,
      },
      {
        label: "Next hit",
        value: nextHit ? `${formatMoney(nextHit.amount)} ${humanizeCadence(nextHit.cadence)}` : "No active hit",
        detail: nextHit ? `${nextHit.label} due ${formatDate(nextHit.nextDueAtUtc)}` : "No active recurring obligations are visible.",
      },
      {
        label: "Recurring total",
        value: `${formatMoney(recurringTotalAmount)}/mo`,
        detail: `${obligations.length} active obligation${obligations.length === 1 ? "" : "s"} across labor, aircraft, and other commitments.`,
      },
    ],
    categoryTotals,
    obligations,
    projection,
  };
}

function buildCategoryTotals(obligations: OverviewFinanceObligationView[]): OverviewFinanceCategoryView[] {
  const byCategory = new Map<OverviewFinanceCategory, { monthlyEquivalentAmount: number; obligationCount: number; cadences: Set<string> }>();

  for (const category of categoryOrder) {
    byCategory.set(category, {
      monthlyEquivalentAmount: 0,
      obligationCount: 0,
      cadences: new Set<string>(),
    });
  }

  for (const obligation of obligations) {
    const bucket = byCategory.get(obligation.category)!;
    bucket.monthlyEquivalentAmount += roundCurrency(obligation.amount * monthFactorByCadence[obligation.cadence]);
    bucket.obligationCount += 1;
    bucket.cadences.add(obligation.cadence);
  }

  return categoryOrder.map((category) => {
    const bucket = byCategory.get(category)!;
    return {
      category,
      monthlyEquivalentAmount: roundCurrency(bucket.monthlyEquivalentAmount),
      obligationCount: bucket.obligationCount,
      detail: bucket.obligationCount === 0
        ? "No active obligations."
        : `${bucket.obligationCount} obligation${bucket.obligationCount === 1 ? "" : "s"} | ${[...bucket.cadences].map((cadence) => humanizeCadence(cadence as "weekly" | "monthly")).join(", ")}`,
    };
  });
}

function buildProjection(params: {
  currentTimeUtc: string;
  currentCashAmount: number;
  obligations: RecurringObligationView[];
  contracts: CompanyContractView[];
  routePlan: RoutePlanState | null;
}): OverviewFinanceProjectionView {
  const maxDays = horizonDays["8w"];
  const horizonIds: OverviewFinanceHorizonId[] = ["2w", "4w", "8w"];
  const obligationOccurrences = collectObligationOccurrences(params.obligations, params.currentTimeUtc, maxDays);
  const upliftCandidates = collectAcceptedWorkProjectionCandidates(params.contracts, params.routePlan, params.currentTimeUtc);
  const points: OverviewFinanceProjectionPointView[] = [];

  for (let dayOffset = 0; dayOffset <= maxDays; dayOffset += 7) {
    const pointUtc = addDaysUtc(params.currentTimeUtc, dayOffset);
    const baseCashAmount = roundCurrency(params.currentCashAmount - obligationOccurrences
      .filter((occurrence) => Date.parse(occurrence.dueAtUtc) <= Date.parse(pointUtc))
      .reduce((sum, occurrence) => sum + occurrence.amount, 0));
    const visibleUpliftCandidates = upliftCandidates.filter((candidate) => Date.parse(candidate.deadlineUtc) <= Date.parse(pointUtc));
    const upliftAmount = roundCurrency(visibleUpliftCandidates.reduce((sum, candidate) => sum + candidate.weightedUpliftAmount, 0));

    points.push({
      pointId: `w${dayOffset}`,
      label: dayOffset === 0 ? "Now" : `${Math.round(dayOffset / 7)}w`,
      daysFromNow: dayOffset,
      atUtc: pointUtc,
      baseCashAmount,
      upliftCashAmount: roundCurrency(baseCashAmount + upliftAmount),
      upliftAmount,
      upliftSourceCount: visibleUpliftCandidates.length,
      confidenceBand: deriveConfidenceBand(visibleUpliftCandidates),
    });
  }

  return {
    defaultHorizonId: "4w",
    horizons: horizonIds.map((horizonId) => ({
      horizonId,
      label: horizonId.toUpperCase(),
      pointCount: Math.floor(horizonDays[horizonId] / 7) + 1,
    })),
    points,
  };
}

function collectObligationOccurrences(
  obligations: RecurringObligationView[],
  currentTimeUtc: string,
  maxDays: number,
): Array<{ recurringObligationId: string; amount: number; dueAtUtc: string }> {
  const horizonEndUtc = addDaysUtc(currentTimeUtc, maxDays);
  const occurrences: Array<{ recurringObligationId: string; amount: number; dueAtUtc: string }> = [];

  for (const obligation of obligations) {
    let dueAtUtc = obligation.nextDueAtUtc;
    while (Date.parse(dueAtUtc) <= Date.parse(horizonEndUtc)) {
      if (obligation.endAtUtc && Date.parse(dueAtUtc) > Date.parse(obligation.endAtUtc)) {
        break;
      }

      occurrences.push({
        recurringObligationId: obligation.recurringObligationId,
        amount: obligation.amount,
        dueAtUtc,
      });
      dueAtUtc = addCadenceToUtc(dueAtUtc, obligation.cadence);
    }
  }

  return occurrences.sort((left, right) => Date.parse(left.dueAtUtc) - Date.parse(right.dueAtUtc));
}

function collectAcceptedWorkProjectionCandidates(
  contracts: CompanyContractView[],
  routePlan: RoutePlanState | null,
  currentTimeUtc: string,
): AcceptedWorkProjectionCandidate[] {
  const routePlannedContractIds = new Set(
    routePlan?.items
      .filter((item) => item.sourceType === "accepted_contract" && item.plannerItemStatus !== "closed")
      .map((item) => item.sourceId) ?? [],
  );

  return contracts
    .filter((contract) => ["accepted", "assigned", "active"].includes(contract.contractState))
    .filter((contract) => Date.parse(contract.deadlineUtc) >= Date.parse(currentTimeUtc))
    .map((contract) => {
      const weight = confidenceWeight(contract, routePlannedContractIds);
      return {
      companyContractId: contract.companyContractId,
      deadlineUtc: contract.deadlineUtc,
      weightedUpliftAmount: roundCurrency(contract.acceptedPayoutAmount * weight),
      confidenceWeight: weight,
    };
    });
}

function confidenceWeight(contract: CompanyContractView, routePlannedContractIds: Set<string>): number {
  if (contract.contractState === "active") {
    return 0.95;
  }
  if (contract.contractState === "assigned") {
    return 0.82;
  }
  if (routePlannedContractIds.has(contract.companyContractId)) {
    return 0.66;
  }
  return 0.45;
}

function deriveConfidenceBand(candidates: AcceptedWorkProjectionCandidate[]): OverviewFinanceConfidenceBand {
  if (candidates.length === 0) {
    return "none";
  }

  const average = candidates.reduce((sum, candidate) => sum + candidate.confidenceWeight, 0) / candidates.length;

  if (average >= 0.82) {
    return "high";
  }
  if (average >= 0.62) {
    return "medium";
  }
  return "low";
}

function buildObligationView(currentTimeUtc: string, obligation: RecurringObligationView): OverviewFinanceObligationView {
  const category = categorizeObligation(obligation);
  return {
    recurringObligationId: obligation.recurringObligationId,
    category,
    label: obligationLabel(obligation),
    detail: obligationDetail(obligation),
    amount: obligation.amount,
    cadence: obligation.cadence,
    nextDueAtUtc: obligation.nextDueAtUtc,
    severity: obligationSeverity(currentTimeUtc, obligation.nextDueAtUtc),
  };
}

function categorizeObligation(obligation: RecurringObligationView): OverviewFinanceCategory {
  if (obligation.sourceObjectType === "staffing_package" || obligation.obligationType === "staffing") {
    return "Labor";
  }
  if (obligation.obligationType === "lease" || obligation.aircraftOwnershipType === "leased") {
    return "Leases";
  }
  if (obligation.obligationType === "finance" || obligation.aircraftOwnershipType === "financed") {
    return "Finance";
  }
  return "Other";
}

function obligationLabel(obligation: RecurringObligationView): string {
  if (obligation.sourceObjectType === "staffing_package") {
    const qualification = obligation.staffingQualificationGroup ? humanize(obligation.staffingQualificationGroup) : "Staffing";
    const laborCategory = obligation.staffingLaborCategory ? humanize(obligation.staffingLaborCategory) : "Staff";
    return `${laborCategory} | ${qualification}`;
  }

  if (obligation.sourceObjectType === "acquisition_agreement") {
    const ownershipLabel = obligation.obligationType === "lease" ? "Lease" : obligation.obligationType === "finance" ? "Finance" : "Aircraft";
    const registration = obligation.aircraftRegistration ?? "Aircraft";
    return `${ownershipLabel} | ${registration}`;
  }

  return humanize(obligation.obligationType);
}

function obligationDetail(obligation: RecurringObligationView): string {
  if (obligation.sourceObjectType === "staffing_package") {
    const employmentModel = obligation.staffingEmploymentModel ? humanize(obligation.staffingEmploymentModel) : "Active package";
    return `${employmentModel} staffing obligation`;
  }

  if (obligation.sourceObjectType === "acquisition_agreement") {
    return obligation.aircraftDisplayName ?? "Aircraft agreement";
  }

  return `${humanizeCadence(obligation.cadence)} recurring obligation`;
}

function obligationSeverity(currentTimeUtc: string, nextDueAtUtc: string): "normal" | "warning" | "critical" {
  const hoursRemaining = (Date.parse(nextDueAtUtc) - Date.parse(currentTimeUtc)) / 3_600_000;
  if (hoursRemaining <= 24) {
    return "critical";
  }
  if (hoursRemaining <= 72) {
    return "warning";
  }
  return "normal";
}

function addCadenceToUtc(value: string, cadence: "weekly" | "monthly"): string {
  const date = new Date(value);
  if (cadence === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7);
  } else {
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return date.toISOString();
}

function addDaysUtc(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function roundCurrency(value: number): number {
  return Math.round(value);
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeCadence(cadence: "weekly" | "monthly"): string {
  return cadence === "weekly" ? "weekly" : "monthly";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
