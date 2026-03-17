/*
 * Builds shell summaries and tab payloads from backend state for the browser-rendered save shell.
 * This file is the central adapter between raw backend queries and the smaller UI payload contracts.
 * The server uses these helpers to keep HTML rendering thin: fetch backend snapshots once, reshape them here,
 * then hand the browser a stable per-tab payload instead of making the client understand simulation tables.
 */

import type { FlightLineBackend } from "../application/backend-service.js";
import { loadActiveCompanyContext, type CompanyContext } from "../application/queries/company-state.js";
import { loadCompanyContracts, type CompanyContractsView } from "../application/queries/company-contracts.js";
import { loadActiveContractBoard, type ContractBoardView } from "../application/queries/contract-board.js";
import { loadRecentEventLog, type EventLogView } from "../application/queries/event-log.js";
import { loadFleetState, type FleetStateView } from "../application/queries/fleet-state.js";
import { loadMaintenanceTasks, type MaintenanceTaskView } from "../application/queries/maintenance-tasks.js";
import { loadAircraftSchedules, type AircraftScheduleView } from "../application/queries/schedule-state.js";
import { loadStaffingState, type StaffingStateView } from "../application/queries/staffing-state.js";
import type { AirportReferenceRepository } from "../infrastructure/reference/airport-reference.js";
import { buildAircraftTabPayload } from "./aircraft-tab-model.js";
import { ensureActiveAircraftMarket } from "./aircraft-market-lifecycle.js";
import { loadContractsViewPayload } from "./contracts-view.js";
import { loadRoutePlanState, type RoutePlanState } from "./route-plan-state.js";
import type { SaveBootstrapPayload, SavePageTab, SaveTabPayload, ShellSummaryPayload } from "./save-shell-model.js";

export function normalizeTab(rawValue: string | null | undefined): SavePageTab {
  return rawValue === "contracts"
    || rawValue === "aircraft"
    || rawValue === "staffing"
    || rawValue === "dispatch"
    || rawValue === "activity"
    ? rawValue
    : "dashboard";
}

interface ShellSummarySource {
  companyContext: CompanyContext | null;
  companyContracts: CompanyContractsView | null;
  contractBoard: ContractBoardView | null;
  fleetState: FleetStateView | null;
  staffingState: StaffingStateView | null;
  maintenanceTasks: MaintenanceTaskView[];
  schedules: AircraftScheduleView[];
  eventLog: EventLogView | null;
  routePlan: RoutePlanState | null;
}

export async function buildBootstrapPayload(
  backend: FlightLineBackend,
  saveId: string,
  initialTab: SavePageTab,
): Promise<SaveBootstrapPayload | null> {
  const source = await loadShellSummarySource(backend, saveId, false);
  if (!source) {
    return null;
  }

  return {
    saveId,
    initialTab,
    shell: buildShellSummary(saveId, source),
  };
}

export async function buildTabPayload(
  backend: FlightLineBackend,
  saveId: string,
  tabId: SavePageTab,
  renderers: SaveShellRenderers,
): Promise<SaveTabPayload | null> {
  if (tabId === "contracts") {
    const contractsPayload = await loadContractsViewPayload(backend, backend.getAirportReference(), saveId, "scheduled");
    const source = await loadShellSummarySource(backend, saveId, true);
    if (!source) {
      return null;
    }

    return {
      saveId,
      tabId,
      shell: buildShellSummary(saveId, source),
      contentHtml: renderers.renderContractsHost(saveId),
      contractsPayload,
    };
  }

  let source = await loadShellSummarySource(backend, saveId, false);
  if (!source) {
    return null;
  }

  let aircraftPayload: SaveTabPayload["aircraftPayload"] | undefined;
  if (tabId === "aircraft" && source.companyContext) {
    const ensuredMarket = await ensureActiveAircraftMarket(backend, saveId, "scheduled");
    if (ensuredMarket.refreshed) {
      source = await loadShellSummarySource(backend, saveId, false) ?? source;
    }
    if (!source.companyContext) {
      return null;
    }

    aircraftPayload = buildAircraftTabPayload({
      companyContext: source.companyContext,
      companyContracts: source.companyContracts,
      fleetState: source.fleetState,
      staffingState: source.staffingState,
      schedules: source.schedules,
      maintenanceTasks: source.maintenanceTasks,
      airportReference: backend.getAirportReference(),
      aircraftReference: backend.getAircraftReference(),
      aircraftMarket: ensuredMarket.aircraftMarket,
    });
  }

  return {
    saveId,
    tabId,
    shell: buildShellSummary(saveId, source),
    contentHtml: renderTabContent(renderers, tabId, saveId, source, backend.getAirportReference()),
    contractsPayload: null,
    aircraftPayload: aircraftPayload ?? null,
  };
}

async function loadShellSummarySource(
  backend: FlightLineBackend,
  saveId: string,
  includeContractBoard: boolean,
): Promise<ShellSummarySource | null> {
  return backend.withExistingSaveDatabase(saveId, (context) => {
    const companyContext = loadActiveCompanyContext(context.saveDatabase, saveId);
    const companyContracts = loadCompanyContracts(context.saveDatabase, saveId);
    const fleetState = loadFleetState(context.saveDatabase, backend.getAircraftReference(), saveId);
    const staffingState = loadStaffingState(context.saveDatabase, saveId);
    const maintenanceTasks = loadMaintenanceTasks(context.saveDatabase, saveId);
    const schedules = loadAircraftSchedules(context.saveDatabase, saveId);
    const eventLog = loadRecentEventLog(context.saveDatabase, saveId, 8);
    const contractBoard = includeContractBoard ? loadActiveContractBoard(context.saveDatabase, saveId) : null;
    const routePlan = loadRoutePlanState(context.saveDatabase, saveId);

    return {
      companyContext,
      companyContracts,
      contractBoard,
      fleetState,
      staffingState,
      maintenanceTasks,
      schedules,
      eventLog,
      routePlan,
    } satisfies ShellSummarySource;
  });
}

export function buildShellSummary(saveId: string, source: ShellSummarySource): ShellSummaryPayload {
  const company = source.companyContext;
  const contracts = source.companyContracts?.contracts ?? [];
  const fleet = source.fleetState?.aircraft ?? [];
  const staffingCoverage = source.staffingState?.coverageSummaries ?? [];
  const dispatchReady = fleet.filter((aircraft) => aircraft.dispatchAvailable).length;
  const activeCoverage = staffingCoverage.reduce((total, summary) => total + summary.activeCoverageUnits, 0);
  const activeContracts = contracts.filter((contract) => ["accepted", "assigned", "active"].includes(contract.contractState));
  const scheduleCount = source.schedules.filter((schedule) => schedule.scheduleState !== "completed").length;
  const activityCount = source.eventLog?.entries.length ?? 0;
  const activeOfferCount = source.contractBoard?.offers.filter((offer) => offer.offerStatus === "available").length ?? null;

  if (!company) {
    return {
      saveId,
      title: `Save ${saveId}`,
      subtitle: "Create a company to begin operating.",
      hasCompany: false,
      currentTimeUtc: null,
      currentCashAmount: null,
      financialPressureBand: null,
      companyPhase: null,
      progressionTier: null,
      homeBaseAirportId: null,
      activeOfferCount,
      tabCounts: {
        dashboard: "setup",
        contracts: "0",
        aircraft: "0",
        staffing: "0",
        dispatch: "0",
        activity: String(activityCount),
      },
      metrics: [
        { label: "Status", value: "Awaiting company", detail: "Create the first carrier to unlock the save." },
        { label: "Save slot", value: saveId, detail: "Local SQLite save is ready." },
        { label: "Activity", value: String(activityCount), detail: "System history retained." },
      ],
    };
  }

  return {
    saveId,
    title: company.displayName,
    subtitle: `${company.companyPhase.replaceAll("_", " ")} | Tier ${company.progressionTier} | Home ${company.homeBaseAirportId}`,
    hasCompany: true,
    currentTimeUtc: company.currentTimeUtc,
    currentCashAmount: company.currentCashAmount,
    financialPressureBand: company.financialPressureBand,
    companyPhase: company.companyPhase,
    progressionTier: company.progressionTier,
    homeBaseAirportId: company.homeBaseAirportId,
    activeOfferCount,
    tabCounts: {
      dashboard: String(activeContracts.length),
      contracts: activeOfferCount === null ? String(activeContracts.length) : `${activeOfferCount}/${activeContracts.length}`,
      aircraft: `${dispatchReady}/${fleet.length}`,
      staffing: String(activeCoverage),
      dispatch: String(scheduleCount),
      activity: String(activityCount),
    },
    metrics: [
      { label: "Cash", value: formatMoney(company.currentCashAmount), detail: company.financialPressureBand.replaceAll("_", " ") },
      { label: "Contracts", value: String(activeContracts.length), detail: activeOfferCount === null ? "Board loads on demand" : `${activeOfferCount} live offers` },
      { label: "Fleet", value: `${dispatchReady}/${fleet.length}`, detail: "Dispatch-ready aircraft" },
      { label: "Staff", value: String(activeCoverage), detail: `${formatMoney(source.staffingState?.totalMonthlyFixedCostAmount ?? 0)}/mo coverage` },
    ],
  };
}

export interface SaveShellRenderers {
  renderCreateCompany(saveId: string, tabId: SavePageTab): string;
  renderOverview(saveId: string, tabId: SavePageTab, source: ShellSummarySource, airportReference: AirportReferenceRepository): string;
  renderAircraft(saveId: string, tabId: SavePageTab, source: ShellSummarySource, airportReference: AirportReferenceRepository): string;
  renderStaffing(saveId: string, tabId: SavePageTab, source: ShellSummarySource): string;
  renderDispatch(saveId: string, tabId: SavePageTab, source: ShellSummarySource, airportReference: AirportReferenceRepository): string;
  renderActivity(source: ShellSummarySource): string;
  renderContractsHost(saveId: string): string;
}

function renderTabContent(
  renderers: SaveShellRenderers,
  tabId: SavePageTab,
  saveId: string,
  source: ShellSummarySource,
  airportReference: AirportReferenceRepository,
): string {
  if (!source.companyContext) {
    return renderers.renderCreateCompany(saveId, tabId);
  }

  switch (tabId) {
    case "aircraft":
      return renderers.renderAircraft(saveId, tabId, source, airportReference);
    case "staffing":
      return renderers.renderStaffing(saveId, tabId, source);
    case "dispatch":
      return renderers.renderDispatch(saveId, tabId, source, airportReference);
    case "activity":
      return renderers.renderActivity(source);
    case "dashboard":
    default:
      return renderers.renderOverview(saveId, tabId, source, airportReference);
  }
}

function formatMoney(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
