/*
 * Defines the payload types that describe save-shell chrome, tabs, and incremental updates.
 * Both the server and browser client rely on these shared shapes to keep shell handoffs predictable.
 */

import type { AircraftTabPayload } from "./aircraft-tab-model.js";
import type { ContractsViewPayload } from "./contracts-view-model.js";

export const saveTabs = [
  { id: "dashboard", label: "Overview" },
  { id: "contracts", label: "Contracts" },
  { id: "aircraft", label: "Aircraft" },
  { id: "staffing", label: "Staff" },
  { id: "dispatch", label: "Dispatch" },
  { id: "activity", label: "Activity" },
] as const;

export type SavePageTab = (typeof saveTabs)[number]["id"];
export type NotificationLevel = "routine" | "important";

export interface FlashState {
  notice?: string | undefined;
  error?: string | undefined;
}

export interface ShellSummaryPayload {
  saveId: string;
  title: string;
  subtitle: string;
  hasCompany: boolean;
  currentTimeUtc: string | null;
  currentCashAmount: number | null;
  financialPressureBand: string | null;
  companyPhase: string | null;
  progressionTier: number | null;
  homeBaseAirportId: string | null;
  activeOfferCount: number | null;
  tabCounts: Record<SavePageTab, string>;
  metrics: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
}

export interface SaveBootstrapPayload {
  saveId: string;
  initialTab: SavePageTab;
  shell: ShellSummaryPayload;
}

export interface SaveTabPayload {
  saveId: string;
  tabId: SavePageTab;
  shell: ShellSummaryPayload;
  contentHtml: string;
  contractsPayload?: ContractsViewPayload | null;
  aircraftPayload?: AircraftTabPayload | null;
}

export interface SaveActionResponse {
  success: boolean;
  shell: ShellSummaryPayload;
  tab?: SaveTabPayload | undefined;
  message?: string | undefined;
  error?: string | undefined;
  notificationLevel?: NotificationLevel | undefined;
}
