/*
 * Browser controller for the main save shell once a save is open.
 * It hydrates shell chrome, swaps tabs, coordinates settings and clock menus, and delegates tab-specific behavior to smaller clients.
 * This is the traffic controller for the in-save UI: it owns shell hydration, tab caching, action submission,
 * notifications, settings, and the live sim-clock loop that keeps time-driven screens current.
 */

import { mountAircraftTab, type AircraftTabController } from "./aircraft-tab-client.js";
import { mountContractsTab, type ContractsTabController } from "./contracts-tab-client.js";
import { mountDispatchTab, type DispatchTabController } from "./dispatch-tab-client.js";
import { mountStaffingTab, type StaffingTabController } from "./staffing-tab-client.js";
import type { ClockPanelPayload, ClockRateMode } from "../clock-calendar-model.js";
import { warmContractsBoardViewPayload } from "../contracts-board-model.js";
import { escapeHtml, formatMoney } from "../browser-ui-primitives.js";
import type {
  NotificationLevel,
  SaveBootstrapPayload,
  SavePageTab,
  SaveTabPayload,
  ShellSummaryPayload,
} from "../save-shell-model.js";

interface ActionResponse {
  success: boolean;
  shell: ShellSummaryPayload;
  tab?: SaveTabPayload;
  clock?: ClockPanelPayload;
  message?: string;
  error?: string;
  notificationLevel?: NotificationLevel;
}

interface ClockPayloadResponse {
  payload?: ClockPanelPayload;
  error?: string;
}

interface PrefetchedOpenPayload {
  saveId: string;
  initialTab: SavePageTab;
  bootstrap: SaveBootstrapPayload;
  tab: SaveTabPayload;
  cachedAtUtc: string;
}

interface ShellConfig {
  saveId: string;
  initialTab: SavePageTab;
}

interface OverviewFinanceProjectionPointPayload {
  pointId: string;
  label: string;
  daysFromNow: number;
  atUtc: string;
  baseCashAmount: number;
  upliftCashAmount: number;
  upliftAmount: number;
  upliftSourceCount: number;
  confidenceBand: string;
}

interface OverviewFinanceProjectionPayload {
  defaultHorizonId: "2w" | "4w" | "8w";
  horizons: Array<{
    horizonId: "2w" | "4w" | "8w";
    label: string;
    pointCount: number;
  }>;
  points: OverviewFinanceProjectionPointPayload[];
}

type ActivityPopupMode = "all" | "important_only";
type ThemeName = "light" | "dark" | "forest";
type HelpCenterSection = "home" | "next" | "blocked" | "concepts";

interface FlashMessage {
  tone: "notice" | "error";
  text: string;
  notificationLevel?: NotificationLevel | undefined;
}

// Module bootstrap is intentionally thin: parse inline config and hand control to the mounted controller.
const appRoot = document.querySelector<HTMLElement>("[data-save-shell-app]");
const clockRateModes: ClockRateMode[] = ["paused", "1x", "10x", "60x", "360x"];
const clockRateLabels: Record<ClockRateMode, string> = {
  paused: "Pause",
  "1x": "1x",
  "10x": "10x",
  "60x": "60x",
  "360x": "360x",
};
const themeLabels: Record<ThemeName, string> = {
  light: "Light",
  dark: "Dark Blue",
  forest: "Dark Green",
};

console.info("[save-shell] module loaded", { hasAppRoot: Boolean(appRoot) });

if (appRoot) {
  try {
    const configScript = appRoot.querySelector<HTMLScriptElement>("[data-shell-config]");
    console.info("[save-shell] config script lookup", {
      found: Boolean(configScript),
      hasText: Boolean(configScript?.textContent),
    });

    const config = configScript?.textContent
      ? (JSON.parse(configScript.textContent) as ShellConfig)
      : null;

    console.info("[save-shell] parsed config", config);

    if (config) {
      void mountSaveShell(appRoot, config);
    } else {
      console.error("[save-shell] shell config missing");
    }
  } catch (error) {
    console.error("[save-shell] failed before mount", error);
  }
}

async function mountSaveShell(root: HTMLElement, config: ShellConfig): Promise<void> {
  const loader = root.querySelector<HTMLElement>("[data-shell-loader]");
  const frame = root.querySelector<HTMLElement>("[data-shell-frame]");
  const titleNodeRaw = root.querySelector<HTMLElement>("[data-shell-title]");
  const subtitleNodeRaw = root.querySelector<HTMLElement>("[data-shell-subtitle]");
  const cashCardNodeRaw = root.querySelector<HTMLElement>("[data-shell-cash-card]");
  const tabsNodeRaw = root.querySelector<HTMLElement>("[data-shell-tabs]");
  const flashNodeRaw = root.querySelector<HTMLElement>("[data-shell-flash]");
  const tabPanelNodeRaw = root.querySelector<HTMLElement>("[data-shell-tab-panel]");
  const tabLoadingNodeRaw = root.querySelector<HTMLElement>("[data-shell-tab-loading]");
  const loaderTitleNodeRaw = root.querySelector<HTMLElement>("[data-loader-title]");
  const loaderErrorNodeRaw = root.querySelector<HTMLElement>("[data-loader-error]");
  const loaderActionsNodeRaw = root.querySelector<HTMLElement>("[data-loader-actions]");
  const loaderRetryButtonRaw = root.querySelector<HTMLButtonElement>("[data-loader-retry]");
  const settingsMenuRaw = root.querySelector<HTMLDetailsElement>("[data-settings-menu]");
  const settingsHelpButtonRaw = root.querySelector<HTMLButtonElement>("[data-settings-open-help]");
  const settingsThemeButtonRaw = root.querySelector<HTMLButtonElement>("[data-settings-theme]");
  const settingsThemeLabelRaw = root.querySelector<HTMLElement>("[data-settings-theme-label]");
  const settingsPopupLabelRaw = root.querySelector<HTMLElement>("[data-settings-popup-label]");
  const settingsPopupButtonRaw = root.querySelector<HTMLButtonElement>("[data-settings-popup-mode-toggle]");
  const clockMenuRaw = root.querySelector<HTMLDetailsElement>("[data-clock-menu]");
  const clockLabelRaw = root.querySelector<HTMLElement>("[data-clock-label]");
  const clockRateRaw = root.querySelector<HTMLElement>("[data-clock-rate]");
  const clockPanelRaw = root.querySelector<HTMLElement>("[data-clock-panel]");
  const helpCenterRaw = root.querySelector<HTMLElement>("[data-help-center]");

  if (
    !loader
    || !frame
    || !titleNodeRaw
    || !subtitleNodeRaw
    || !cashCardNodeRaw
    || !tabsNodeRaw
    || !flashNodeRaw
    || !tabPanelNodeRaw
    || !tabLoadingNodeRaw
    || !loaderTitleNodeRaw
    || !loaderErrorNodeRaw
    || !loaderActionsNodeRaw
    || !loaderRetryButtonRaw
    || !settingsMenuRaw
    || !settingsHelpButtonRaw
    || !settingsThemeButtonRaw
    || !settingsThemeLabelRaw
    || !settingsPopupLabelRaw
    || !settingsPopupButtonRaw
    || !clockMenuRaw
    || !clockLabelRaw
    || !clockRateRaw
    || !clockPanelRaw
    || !helpCenterRaw
  ) {
    return;
  }

  const loaderNode: HTMLElement = loader;
  const frameNode: HTMLElement = frame;
  const titleNode: HTMLElement = titleNodeRaw;
  const subtitleNode: HTMLElement = subtitleNodeRaw;
  const cashCardNode: HTMLElement = cashCardNodeRaw;
  const tabsNode: HTMLElement = tabsNodeRaw;
  const flashNode: HTMLElement = flashNodeRaw;
  const tabPanelNode: HTMLElement = tabPanelNodeRaw;
  const tabLoadingNode: HTMLElement = tabLoadingNodeRaw;
  const loaderTitleNode: HTMLElement = loaderTitleNodeRaw;
  const loaderErrorNode: HTMLElement = loaderErrorNodeRaw;
  const loaderActionsNode: HTMLElement = loaderActionsNodeRaw;
  const loaderRetryButton: HTMLButtonElement = loaderRetryButtonRaw;
  const settingsMenu: HTMLDetailsElement = settingsMenuRaw;
  const settingsHelpButton: HTMLButtonElement = settingsHelpButtonRaw;
  const settingsThemeButton: HTMLButtonElement = settingsThemeButtonRaw;
  const settingsThemeLabel: HTMLElement = settingsThemeLabelRaw;
  const settingsPopupLabel: HTMLElement = settingsPopupLabelRaw;
  const settingsPopupButton: HTMLButtonElement = settingsPopupButtonRaw;
  const clockMenu: HTMLDetailsElement = clockMenuRaw;
  const clockLabel: HTMLElement = clockLabelRaw;
  const clockRateNode: HTMLElement = clockRateRaw;
  const clockPanel: HTMLElement = clockPanelRaw;
  const helpCenter: HTMLElement = helpCenterRaw;
  const themeWindow = window as Window & { toggleTheme?: () => string | void };
  void settingsHelpButton;

  // Local shell state mirrors the latest shell, tab, and clock payloads so incremental responses can update only what changed.
  const tabCache = new Map<SavePageTab, SaveTabPayload>();
  const tabLoadInFlight = new Map<SavePageTab, Promise<SaveTabPayload>>();
  const warmOnOpenTabIds: SavePageTab[] = ["contracts", "aircraft", "staffing"];
  let shell: ShellSummaryPayload | null = null;
  let activeTab: SavePageTab = config.initialTab;
  let contractsController: ContractsTabController | null = null;
  let aircraftController: AircraftTabController | null = null;
  let dispatchController: DispatchTabController | null = null;
  let staffingController: StaffingTabController | null = null;
  let clockPayload: ClockPanelPayload | null = null;
  let clockDateActionOpen = false;
  let clockMode = restoreClockRate(config.saveId);
  let clockTickInFlight = false;
  let clockAccumulatedSimMs = 0;
  let lastClockWallMs = Date.now();
  let clockTimerHandle: number | null = null;
  let flashTimerHandle: number | null = null;
  let activityPopupMode: ActivityPopupMode = restoreActivityPopupMode();
  let helpCenterOpen = false;
  let activeHelpSection: HelpCenterSection = "home";
  let pendingOverviewFinanceFocus = false;
  let tabCacheGeneration = 0;
  let warmedCoreTabs = false;
  const activeHelpTopics: Record<Exclude<HelpCenterSection, "home">, string | null> = {
    next: firstHelpTopicId("next"),
    blocked: firstHelpTopicId("blocked"),
    concepts: firstHelpTopicId("concepts"),
  };

  const tabLabels: Array<[SavePageTab, string]> = [
    ["dashboard", "Overview"],
    ["contracts", "Contracts"],
    ["aircraft", "Aircraft"],
    ["staffing", "Staff"],
    ["dispatch", "Dispatch"],
  ];

  loaderTitleNode.textContent = `Opening ${config.saveId}`;

  function invalidateTabCache(): void {
    tabCacheGeneration += 1;
    tabCache.clear();
    tabLoadInFlight.clear();
  }

  function replaceTabCacheWith(payload: SaveTabPayload): void {
    invalidateTabCache();
    warmTabPayload(payload);
    tabCache.set(payload.tabId, payload);
  }

  function warmTabPayload(payload: SaveTabPayload): void {
    if (payload.tabId === "contracts" && payload.contractsPayload) {
      warmContractsBoardViewPayload(payload.contractsPayload);
    }
  }

  async function requestTabPayload(tabId: SavePageTab, force = false): Promise<SaveTabPayload> {
    if (!force) {
      const cached = tabCache.get(tabId);
      if (cached) {
        return cached;
      }

      const inFlight = tabLoadInFlight.get(tabId);
      if (inFlight) {
        return inFlight;
      }
    }

    const requestGeneration = tabCacheGeneration;
    const request = (async () => {
      const response = await fetch(`/api/save/${encodeURIComponent(config.saveId)}/tab/${tabId}`);
      const payload = (await response.json()) as SaveTabPayload | { error: string };
      if (!response.ok || !("contentHtml" in payload)) {
        throw new Error("error" in payload ? payload.error : `Could not load ${tabId}.`);
      }

      if (requestGeneration === tabCacheGeneration) {
        warmTabPayload(payload);
        tabCache.set(tabId, payload);
      }

      return payload;
    })();

    tabLoadInFlight.set(tabId, request);
    try {
      return await request;
    } finally {
      if (tabLoadInFlight.get(tabId) === request) {
        tabLoadInFlight.delete(tabId);
      }
    }
  }

  function warmCoreTabsOnOpen(): void {
    if (warmedCoreTabs) {
      return;
    }

    warmedCoreTabs = true;
    const tabsToWarm = warmOnOpenTabIds.filter((tabId) => tabId !== activeTab && !tabCache.has(tabId));
    if (tabsToWarm.length === 0) {
      return;
    }

    window.setTimeout(() => {
      void Promise.allSettled(
        tabsToWarm.map((tabId) => requestTabPayload(tabId).catch((error) => {
          console.warn("[save-shell] tab warm failed", {
            saveId: config.saveId,
            tabId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        })),
      );
    }, 0);
  }

  // Top-bar helpers keep the chrome synchronized as theme, shell, and clock data change independently.
  function syncSettingsMenuTheme(): void {
    const theme = normalizeThemeName(document.body.dataset.theme);
    settingsThemeLabel.textContent = themeLabels[theme];
    settingsThemeButton.textContent = `Theme: ${themeLabels[theme]}`;
  }

  function syncActivityPopupMode(): void {
    settingsPopupLabel.textContent = activityPopupMode === "important_only" ? "Important only" : "All activity";
    settingsPopupButton.textContent = `Activity popups: ${activityPopupMode === "important_only" ? "Important only" : "All activity"}`;
  }

  function syncClockTrigger(): void {
    if (!shell?.hasCompany) {
      clockLabel.textContent = "Setup first";
      clockRateNode.textContent = "--";
      return;
    }

    clockRateNode.textContent = clockMode === "paused" ? "Pause" : clockMode;
    if (!clockPayload) {
      clockLabel.textContent = "Loading...";
      return;
    }

    clockLabel.textContent = `${clockPayload.currentLocalTimeLabel} | ${clockPayload.currentLocalDateLabel}`;
  }

  function firstHelpTopicId(section: Exclude<HelpCenterSection, "home">): string | null {
    const button = helpCenter.querySelector<HTMLElement>(
      `[data-help-topic-button][data-help-topic-section="${section}"]`,
    );
    return button?.dataset.helpTopicButton ?? null;
  }

  function normalizeHelpSection(rawSection: string | undefined): HelpCenterSection {
    switch (rawSection) {
      case "next":
      case "blocked":
      case "concepts":
        return rawSection;
      default:
        return "home";
    }
  }

  function setActiveHelpSection(section: HelpCenterSection): void {
    activeHelpSection = section;
  }

  function renderHelpCenter(): void {
    helpCenter.hidden = !helpCenterOpen;

    const sectionTabs = helpCenter.querySelectorAll<HTMLElement>("[data-help-section-tab]");
    sectionTabs.forEach((button) => {
      const section = normalizeHelpSection(button.dataset.helpSectionTab);
      const isCurrent = section === activeHelpSection;
      button.classList.toggle("current", isCurrent);
      button.setAttribute("aria-selected", isCurrent ? "true" : "false");
    });

    const sectionPanels = helpCenter.querySelectorAll<HTMLElement>("[data-help-section-panel]");
    sectionPanels.forEach((panel) => {
      const section = normalizeHelpSection(panel.dataset.helpSectionPanel);
      panel.hidden = section !== activeHelpSection;
    });

    const topicButtons = helpCenter.querySelectorAll<HTMLElement>("[data-help-topic-button]");
    topicButtons.forEach((button) => {
      const section = normalizeHelpSection(button.dataset.helpTopicSection);
      if (section === "home") {
        button.classList.remove("current");
        button.setAttribute("aria-current", "false");
        return;
      }

      const isCurrent = activeHelpSection === section
        && activeHelpTopics[section] === (button.dataset.helpTopicButton ?? "");
      button.classList.toggle("current", isCurrent);
      button.setAttribute("aria-current", isCurrent ? "true" : "false");
    });

    const topicPanels = helpCenter.querySelectorAll<HTMLElement>("[data-help-topic-panel]");
    topicPanels.forEach((panel) => {
      const section = normalizeHelpSection(panel.dataset.helpTopicSection);
      if (section === "home") {
        panel.hidden = true;
        return;
      }

      panel.hidden = !(activeHelpSection === section
        && activeHelpTopics[section] === (panel.dataset.helpTopicPanel ?? ""));
    });
  }

  function resetHelpCenter(): void {
    helpCenterOpen = false;
    activeHelpSection = "home";
    activeHelpTopics.next = firstHelpTopicId("next");
    activeHelpTopics.blocked = firstHelpTopicId("blocked");
    activeHelpTopics.concepts = firstHelpTopicId("concepts");
    renderHelpCenter();
  }

  function openHelpCenter(): void {
    helpCenterOpen = true;
    activeHelpSection = "home";
    activeHelpTopics.next = firstHelpTopicId("next");
    activeHelpTopics.blocked = firstHelpTopicId("blocked");
    activeHelpTopics.concepts = firstHelpTopicId("concepts");
    settingsMenu.open = false;
    clockMenu.open = false;
    clockDateActionOpen = false;
    renderHelpCenter();
  }

  function closeHelpCenter(): void {
    resetHelpCenter();
  }

  syncSettingsMenuTheme();
  syncActivityPopupMode();
  syncClockTrigger();
  renderHelpCenter();
  window.addEventListener("flightline:theme-changed", () => {
    syncSettingsMenuTheme();
  });

  loaderRetryButton.addEventListener("click", () => {
    window.location.reload();
  });

  function showLoaderError(message: string): void {
    console.error("[save-shell] handoff failed:", message);
    loaderErrorNode.textContent = message;
    loaderErrorNode.hidden = false;
    loaderActionsNode.hidden = false;
  }

  window.addEventListener("error", (event) => {
    console.error("[save-shell] window error", event.message, event.error);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("[save-shell] unhandled rejection", event.reason);
  });

  function showShellScreen(): void {
    console.info("[save-shell] showing shell screen");
    root.dataset.screen = "shell";
    frameNode.hidden = false;
    loaderNode.hidden = true;
  }

  // Paints the shared shell chrome from the latest summary payload without touching tab-specific content.
  function renderShellChrome(summary: ShellSummaryPayload): void {
    console.info("[save-shell] render chrome", { title: summary.title, tabId: activeTab });
    shell = summary;
    titleNode.textContent = summary.title;
    subtitleNode.textContent = summary.subtitle;
    if (!summary.hasCompany || summary.currentCashAmount === null) {
      cashCardNode.hidden = true;
      cashCardNode.innerHTML = "";
    } else {
      cashCardNode.hidden = false;
      cashCardNode.innerHTML = `<button type="button" class="shell-cash-button" data-shell-open-finance><div class="eyebrow">Cash</div><strong>${escapeHtml(formatMoney(summary.currentCashAmount))}</strong><span class="muted">${escapeHtml((summary.financialPressureBand ?? "stable").replaceAll("_", " "))}</span></button>`;
    }
    tabsNode.innerHTML = tabLabels
      .map(([tabId, label]) => `<a href="#" class="tab-link ${activeTab === tabId ? "current" : ""}" data-shell-tab="${tabId}"><span>${escapeHtml(label)}</span><span class="tab-count">${escapeHtml(summary.tabCounts[tabId])}</span></a>`)
      .join("");
    syncClockTrigger();
  }

  function clearFlashTimer(): void {
    if (flashTimerHandle !== null) {
      window.clearTimeout(flashTimerHandle);
      flashTimerHandle = null;
    }
  }

  function shouldDisplayFlash(message: FlashMessage): boolean {
    if (message.tone === "error") {
      return true;
    }

    if (activityPopupMode === "all") {
      return true;
    }

    return (message.notificationLevel ?? "routine") === "important";
  }

  function showFlash(message: FlashMessage | null): void {
    clearFlashTimer();

    if (!message) {
      flashNode.innerHTML = "";
      return;
    }

    if (!shouldDisplayFlash(message)) {
      flashNode.innerHTML = "";
      return;
    }

    flashNode.innerHTML = `<div class="flash ${message.tone === "error" ? "error" : "notice"}">${escapeHtml(message.text)}</div>`;

    if (message.tone === "notice") {
      flashTimerHandle = window.setTimeout(() => {
        flashTimerHandle = null;
        flashNode.innerHTML = "";
      }, 5000);
    }
  }

  // Clock helpers own the popover UI and the lightweight wall-clock-driven simulation ticker.
  function renderClockPanel(): void {
    if (!shell?.hasCompany) {
      clockPanel.innerHTML = `<div class="empty-state compact">Create a company before opening the clock and calendar.</div>`;
      return;
    }

    if (!clockPayload) {
      clockPanel.innerHTML = `<div class="empty-state compact">Loading clock...</div>`;
      return;
    }

    const dayButtons = clockPayload.days
      .map((day) => {
        const markerCount = Math.min(3, Math.max(day.criticalCount, day.warningCount, day.eventCount));
        const markers = Array.from({ length: markerCount }, (_, index) => {
          const tone = index < day.criticalCount ? "critical" : index < day.criticalCount + day.warningCount ? "warning" : "";
          return `<span class="clock-day-dot ${tone}"></span>`;
        }).join("");
        return `<button type="button" class="clock-day ${day.isCurrentMonth ? "" : "outside"} ${day.isToday ? "today" : ""} ${day.isSelected ? "selected" : ""}" data-clock-day="${escapeHtml(day.localDate)}"><span class="clock-day-number">${day.dayNumber}</span><span class="clock-day-markers">${markers || `<span class="clock-day-dot"></span>`}</span></button>`;
      })
      .join("");

    const agendaItems = clockPayload.agenda.length === 0
      ? `<div class="empty-state compact">No scheduled milestones on ${escapeHtml(clockPayload.selectedDateLabel)}.</div>`
      : `<div class="clock-agenda-list">${clockPayload.agenda.map((event) => `<article class="clock-agenda-item ${event.severity}"><div class="clock-agenda-head"><strong>${escapeHtml(event.title)}</strong><span class="pill">${escapeHtml(event.localTimeLabel)}</span></div><div class="muted">${escapeHtml(event.subtitle)}</div><div class="eyebrow">${escapeHtml(event.category)} | ${escapeHtml(event.relatedTab)}</div></article>`).join("")}</div>`;

    const simTo0600 = clockPayload.quickActions.simTo0600;
    const nextEvent = clockPayload.quickActions.nextEvent;
    const warningList = simTo0600.warningEvents.length === 0
      ? `<div class="muted">No milestones are currently scheduled before the selected morning on ${escapeHtml(clockPayload.selectedDateLabel)}.</div>`
      : `<div class="clock-warning-list">${simTo0600.warningEvents.slice(0, 4).map((event) => `<article class="clock-warning-item ${event.severity}"><div class="clock-agenda-head"><strong>${escapeHtml(event.title)}</strong><span class="pill">${escapeHtml(event.localTimeLabel)}</span></div><div class="muted">${escapeHtml(event.subtitle)}</div></article>`).join("")}${simTo0600.warningCount > 4 ? `<div class="muted">${escapeHtml(String(simTo0600.warningCount - 4))} more milestone${simTo0600.warningCount - 4 === 1 ? "" : "s"} would also be passed.</div>` : ``}</div>`;

    const dayActionCard = clockDateActionOpen
        ? `<section class="clock-day-popover"><div class="clock-day-popover-head"><div><div class="eyebrow">Selected date</div><strong>${escapeHtml(clockPayload.selectedDateLabel)}</strong></div><button type="button" class="button-secondary compact" data-clock-day-action-close="1">Close</button></div>${simTo0600.warningCount > 0 ? `<div class="clock-day-warning"><strong>Warning:</strong> simulating to the selected morning would pass ${escapeHtml(String(simTo0600.warningCount))} milestone${simTo0600.warningCount === 1 ? "" : "s"}.</div>` : ``}${warningList}<div class="clock-day-popover-actions"><button type="button" class="button-secondary" data-clock-sim-anchor-date="${escapeHtml(simTo0600.localDate)}" ${simTo0600.enabled ? "" : "disabled"}>${escapeHtml(simTo0600.label)}</button>${simTo0600.enabled ? `<span class="muted">Advance to the morning anchor for the selected day.</span>` : `<span class="muted">The selected morning anchor on this day has already passed.</span>`}</div></section>`
      : ``;

    clockPanel.innerHTML = `
      <section class="clock-current">
        <div class="eyebrow">Simulation Clock</div>
        <div class="clock-current-time">
          <strong>${escapeHtml(clockPayload.currentLocalTimeLabel)}</strong>
          <span class="pill">${escapeHtml(clockRateLabels[clockMode])}</span>
        </div>
        <div class="clock-meta-line"><span>${escapeHtml(clockPayload.currentLocalDateLabel)}</span><span>${escapeHtml(clockPayload.timeZone)}</span><span>UTC ${escapeHtml(clockPayload.utcTimeLabel)}</span></div>
        ${clockPayload.nextCriticalEvent ? `<div class="muted">Next critical: ${escapeHtml(clockPayload.nextCriticalEvent.localTimeLabel)} � ${escapeHtml(clockPayload.nextCriticalEvent.title)}</div>` : `<div class="muted">No critical calendar items in the current month view.</div>`}
      </section>
      <section class="clock-rate-row">
        ${clockRateModes.map((mode) => `<button type="button" class="clock-rate-button ${clockMode === mode ? "current" : ""}" data-clock-rate-mode="${mode}">${escapeHtml(clockRateLabels[mode])}</button>`).join("")}
        <button type="button" class="clock-rate-button clock-quick-action" data-clock-next-event="1" ${nextEvent.enabled ? "" : "disabled"} title="${nextEvent.event ? escapeHtml(`${nextEvent.event.localTimeLabel} - ${nextEvent.event.title}`) : "No upcoming events"}">${escapeHtml(nextEvent.label)}</button>
      </section>
      <section class="clock-calendar-grid">
        <div class="clock-calendar-head"><div><div class="eyebrow">Calendar</div><strong>${escapeHtml(clockPayload.monthLabel)}</strong></div><div class="muted">${escapeHtml(clockPayload.selectedDateLabel)}</div></div>
        <div class="clock-weekdays">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => `<span class="clock-weekday">${label}</span>`).join("")}</div>
        <div class="clock-days">${dayButtons}</div>
      </section>
      ${dayActionCard}
      <section class="clock-agenda">
        <div class="clock-calendar-head"><div><div class="eyebrow">Agenda</div><strong>${escapeHtml(clockPayload.selectedDateLabel)}</strong></div></div>
        ${agendaItems}
      </section>
    `;
  }
  async function loadClock(selectedLocalDate = clockPayload?.selectedLocalDate, showErrors = false): Promise<ClockPanelPayload | null> {
    if (!shell?.hasCompany) {
      clockPayload = null;
      syncClockTrigger();
      renderClockPanel();
      return null;
    }

    try {
      const response = await fetch(buildClockUrl(config.saveId, selectedLocalDate));
      const result = (await response.json()) as ClockPayloadResponse;
      if (!response.ok || !result.payload) {
        throw new Error(result.error ?? "Could not load the clock.");
      }

      clockPayload = result.payload;
      syncClockTrigger();
      renderClockPanel();
      return clockPayload;
    } catch (error) {
      if (showErrors) {
        showFlash({
          tone: "error",
          text: error instanceof Error ? error.message : "Could not load the clock.",
        });
      }
      clockPanel.innerHTML = `<div class="loading-error">${escapeHtml(error instanceof Error ? error.message : "Could not load the clock.")}</div>`;
      return null;
    }
  }

  function applyClockPayload(nextClock: ClockPanelPayload | undefined): void {
    if (!nextClock) {
      return;
    }
    clockPayload = nextClock;
    syncClockTrigger();
    renderClockPanel();
  }

  function resetClockTicker(now = Date.now()): void {
    lastClockWallMs = now;
    clockAccumulatedSimMs = 0;
  }

  function setClockMode(nextMode: ClockRateMode): void {
    clockMode = nextMode;
    persistClockRate(config.saveId, nextMode);
    resetClockTicker();
    syncClockTrigger();
    renderClockPanel();
  }

  async function tickClockIfNeeded(): Promise<void> {
    if (!shell?.hasCompany || !clockPayload || clockMode === "paused" || clockTickInFlight || root.dataset.screen !== "shell") {
      return;
    }

    const multiplier = rateMultiplier(clockMode);
    if (multiplier <= 0) {
      return;
    }

    const now = Date.now();
    const elapsedWallMs = now - lastClockWallMs;
    lastClockWallMs = now;
    clockAccumulatedSimMs += elapsedWallMs * multiplier;

    const wholeMinutes = Math.floor(clockAccumulatedSimMs / 60_000);
    if (wholeMinutes <= 0) {
      return;
    }

    clockAccumulatedSimMs -= wholeMinutes * 60_000;
    clockTickInFlight = true;

    try {
      const result = await postClockAction("tick", new URLSearchParams({
        minutes: String(wholeMinutes),
        tab: activeTab,
        selectedLocalDate: clockPayload.selectedLocalDate,
      }));

      if (!result.success) {
        setClockMode("paused");
        showFlash({ tone: "error", text: result.error ?? "Clock tick failed." });
        return;
      }

      renderShellChrome(result.shell);
      applyClockPayload(result.clock);
      if (result.tab) {
        replaceTabCacheWith(result.tab);
        activeTab = result.tab.tabId;
        renderTab(result.tab);
      } else if (clockPayload && contractsController) {
        await contractsController.syncCurrentTime(clockPayload.currentTimeUtc);
      }
      if (result.message) {
        setClockMode("paused");
        showFlash({ tone: "notice", text: result.message, notificationLevel: result.notificationLevel });
      }
    } catch (error) {
      setClockMode("paused");
      showFlash({ tone: "error", text: error instanceof Error ? error.message : "Clock tick failed." });
    } finally {
      clockTickInFlight = false;
    }
  }

  async function postClockAction(action: "tick" | "advance-to-calendar-anchor" | "advance-to-next-event", body: URLSearchParams): Promise<ActionResponse> {
    const response = await fetch(`/api/save/${encodeURIComponent(config.saveId)}/clock/${action}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
    });
    return await response.json() as ActionResponse;
  }

  // Tabs arrive as server-rendered HTML, then opt into richer controllers when a tab needs client-only interaction.
  function renderTab(payload: SaveTabPayload): void {
    console.info("[save-shell] render tab", { tabId: payload.tabId, contentLength: payload.contentHtml.length });
    contractsController?.destroy();
    contractsController = null;
    aircraftController?.destroy();
    aircraftController = null;
    dispatchController?.destroy();
    dispatchController = null;
    staffingController?.destroy();
    staffingController = null;
    tabPanelNode.innerHTML = payload.contentHtml;

    if (payload.tabId === "contracts") {
      const host = tabPanelNode.querySelector<HTMLElement>("[data-contracts-host]");
      if (host) {
        contractsController = mountContractsTab(host, payload.contractsPayload ?? null, {
          viewUrl: `/api/save/${encodeURIComponent(config.saveId)}/contracts/view`,
          acceptUrl: `/api/save/${encodeURIComponent(config.saveId)}/contracts/accept`,
          cancelUrl: `/api/save/${encodeURIComponent(config.saveId)}/contracts/cancel`,
          plannerAddUrl: `/api/save/${encodeURIComponent(config.saveId)}/contracts/planner/add`,
          plannerRemoveUrl: `/api/save/${encodeURIComponent(config.saveId)}/contracts/planner/remove`,
          plannerReorderUrl: `/api/save/${encodeURIComponent(config.saveId)}/contracts/planner/reorder`,
          plannerClearUrl: `/api/save/${encodeURIComponent(config.saveId)}/contracts/planner/clear`,
          plannerAcceptUrl: `/api/save/${encodeURIComponent(config.saveId)}/contracts/planner/accept`,
          onShellUpdate(nextShell) {
            invalidateTabCache();
            renderShellChrome(nextShell);
          },
          onMessage(message) {
            showFlash(message);
          },
        });

        if (clockPayload) {
          void contractsController.syncCurrentTime(clockPayload.currentTimeUtc).catch((error) => {
            console.error("[save-shell] contracts clock sync failed", error);
          });
        }
      }
    }

    if (payload.tabId === "aircraft") {
      const host = tabPanelNode.querySelector<HTMLElement>("[data-aircraft-tab-host]");
      if (host && payload.aircraftPayload) {
        aircraftController = mountAircraftTab(host, payload.aircraftPayload);
      }
    }

    if (payload.tabId === "dispatch") {
      const host = tabPanelNode.querySelector<HTMLElement>("[data-dispatch-tab-host]");
      if (host && payload.dispatchPayload) {
        dispatchController = mountDispatchTab(host, payload.dispatchPayload);
      }
    }

    if (payload.tabId === "staffing") {
      const host = tabPanelNode.querySelector<HTMLElement>("[data-staffing-tab-host]");
      if (host) {
        staffingController = mountStaffingTab(host);
      }
    }

    if (payload.tabId === "dashboard") {
      enhanceOverviewFinance(tabPanelNode, config.saveId);
      if (pendingOverviewFinanceFocus) {
        focusOverviewFinanceSection(tabPanelNode);
        pendingOverviewFinanceFocus = false;
      }
    }
  }

  function applyPrefetchedPayload(prefetched: PrefetchedOpenPayload): void {
    try {
      console.info("[save-shell] apply prefetched payload start", { tabId: prefetched.initialTab });
      activeTab = prefetched.initialTab;
      warmTabPayload(prefetched.tab);
      tabCache.set(prefetched.tab.tabId, prefetched.tab);
      renderShellChrome(prefetched.bootstrap.shell);
      renderShellChrome(prefetched.tab.shell);
      renderTab(prefetched.tab);
      showFlash(null);
      history.replaceState(null, "", buildSaveUrl(config.saveId, prefetched.initialTab));
      showShellScreen();
      void loadClock(undefined, false);
      warmCoreTabsOnOpen();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown shell handoff failure.";
      console.error("[save-shell] apply prefetched payload crashed", error);
      showLoaderError(message);
    }
  }

  async function hydrateShellDirectly(tabId: SavePageTab): Promise<void> {
    try {
      console.info("[save-shell] direct hydration start", {
        saveId: config.saveId,
        tabId,
      });

      loaderTitleNode.textContent = `Opening ${config.saveId}`;
      loaderErrorNode.hidden = true;
      loaderErrorNode.textContent = "";
      loaderActionsNode.hidden = true;

      const bootstrapResponse = await fetch(`/api/save/${encodeURIComponent(config.saveId)}/bootstrap?tab=${encodeURIComponent(tabId)}`);
      const bootstrapPayload = (await bootstrapResponse.json()) as SaveBootstrapPayload | { error: string };
      if (!bootstrapResponse.ok || !("shell" in bootstrapPayload)) {
        throw new Error("error" in bootstrapPayload ? bootstrapPayload.error : "Could not load the save bootstrap.");
      }

      const tabPayload = await loadTab(tabId, true);
      renderShellChrome(bootstrapPayload.shell);
      renderShellChrome(tabPayload.shell);
      renderTab(tabPayload);
      showFlash(null);
      history.replaceState(null, "", buildSaveUrl(config.saveId, tabId));
      showShellScreen();
      await loadClock(undefined, false);
      warmCoreTabsOnOpen();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open the save.";
      console.error("[save-shell] direct hydration failed", error);
      showLoaderError(message);
    }
  }

  // Tab loading uses a small in-memory cache until a mutation invalidates it.
  // Loads one tab payload, preferring the in-memory cache until a mutation invalidates it.
  async function loadTab(tabId: SavePageTab, force = false): Promise<SaveTabPayload> {
    activeTab = tabId;
    if (shell) {
      renderShellChrome(shell);
    }

    if (!force) {
      const cached = tabCache.get(tabId);
      if (cached) {
        renderTab(cached);
        history.replaceState(null, "", buildSaveUrl(config.saveId, tabId));
        return cached;
      }
    }

    tabLoadingNode.hidden = false;
    tabLoadingNode.textContent = `Loading ${tabId}...`;

    try {
      const payload = await requestTabPayload(tabId, force);
      renderShellChrome(payload.shell);
      renderTab(payload);
      history.replaceState(null, "", buildSaveUrl(config.saveId, tabId));
      return payload;
    } finally {
      tabLoadingNode.hidden = true;
    }
  }

  // Shell-level event delegation keeps forms and popovers working across repeated innerHTML rerenders.
  root.addEventListener("click", (event: MouseEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }

    const openHelpButton = target.closest<HTMLButtonElement>("[data-settings-open-help]");
    if (openHelpButton) {
      event.preventDefault();
      openHelpCenter();
      return;
    }

    const helpCloseButton = target.closest<HTMLElement>("[data-help-close]");
    if (helpCloseButton) {
      event.preventDefault();
      closeHelpCenter();
      return;
    }

    const openFinanceButton = target.closest<HTMLElement>("[data-shell-open-finance]");
    if (openFinanceButton) {
      event.preventDefault();
      settingsMenu.open = false;
      clockMenu.open = false;
      clockDateActionOpen = false;
      pendingOverviewFinanceFocus = true;
      if (activeTab === "dashboard") {
        focusOverviewFinanceSection(tabPanelNode);
        pendingOverviewFinanceFocus = false;
        return;
      }

      void loadTab("dashboard").catch((error) => {
        pendingOverviewFinanceFocus = false;
        showFlash({
          tone: "error",
          text: error instanceof Error ? error.message : "Could not open the finance overview.",
        });
      });
      return;
    }

    const helpSectionButton = target.closest<HTMLElement>("[data-help-section-tab]");
    if (helpSectionButton) {
      event.preventDefault();
      setActiveHelpSection(normalizeHelpSection(helpSectionButton.dataset.helpSectionTab));
      renderHelpCenter();
      return;
    }

    const helpTopicButton = target.closest<HTMLElement>("[data-help-topic-button]");
    if (helpTopicButton) {
      event.preventDefault();
      const section = normalizeHelpSection(helpTopicButton.dataset.helpTopicSection);
      const topicId = helpTopicButton.dataset.helpTopicButton ?? "";
      if (!topicId || section === "home") {
        return;
      }

      activeHelpTopics[section] = topicId;
      activeHelpSection = section;
      renderHelpCenter();
      return;
    }

    const themeButton = target.closest<HTMLElement>("[data-settings-theme]");
    if (themeButton) {
      event.preventDefault();
      themeWindow.toggleTheme?.();
      syncSettingsMenuTheme();
      return;
    }

    const popupModeButton = target.closest<HTMLButtonElement>("[data-settings-popup-mode-toggle]");
    if (popupModeButton) {
      event.preventDefault();
      const nextMode = activityPopupMode === "all" ? "important_only" : "all";
      activityPopupMode = nextMode;
      persistActivityPopupMode(nextMode);
      syncActivityPopupMode();
      showFlash(null);
      return;
    }

    const openActivityButton = target.closest<HTMLButtonElement>("[data-settings-open-activity]");
    if (openActivityButton) {
      event.preventDefault();
      void loadTab("activity").catch((error) => {
        showFlash({
          tone: "error",
          text: error instanceof Error ? error.message : "Could not load the activity log.",
        });
      });
      return;
    }

    const clockRateButton = target.closest<HTMLElement>("[data-clock-rate-mode]");
    if (clockRateButton) {
      event.preventDefault();
      const mode = clockRateButton.dataset.clockRateMode as ClockRateMode | undefined;
      if (mode && clockRateModes.includes(mode)) {
        setClockMode(mode);
      }
      return;
    }

    const clockDayButton = target.closest<HTMLElement>("[data-clock-day]");
    if (clockDayButton) {
      event.preventDefault();
      const localDate = clockDayButton.dataset.clockDay ?? "";
      if (localDate) {
        clockDateActionOpen = true;
        void loadClock(localDate, true);
      }
      return;
    }
    const clockActionCloseButton = target.closest<HTMLElement>("[data-clock-day-action-close]");
    if (clockActionCloseButton) {
      event.preventDefault();
      clockDateActionOpen = false;
      renderClockPanel();
      return;
    }
    const clockAnchorButton = target.closest<HTMLButtonElement>("[data-clock-sim-anchor-date]");
    if (clockAnchorButton) {
      event.preventDefault();
      const localDate = clockAnchorButton.getAttribute("data-clock-sim-anchor-date") ?? "";
      const originalLabel = clockAnchorButton.textContent ?? "Sim to selected morning";
      clockAnchorButton.disabled = true;
      clockAnchorButton.textContent = "Simulating...";
      void (async () => {
        try {
          const result = await postClockAction("advance-to-calendar-anchor", new URLSearchParams({
            localDate,
            tab: activeTab,
          }));

          if (result.success) {
            clockDateActionOpen = false;
          }

          renderShellChrome(result.shell);
          applyClockPayload(result.clock);
          if (result.tab) {
            replaceTabCacheWith(result.tab);
            activeTab = result.tab.tabId;
            renderTab(result.tab);
          } else if (clockPayload && contractsController) {
            await contractsController.syncCurrentTime(clockPayload.currentTimeUtc);
          }

          showFlash(result.success
            ? result.message
              ? { tone: "notice", text: result.message, notificationLevel: result.notificationLevel }
              : null
            : { tone: "error", text: result.error ?? "Could not advance to the selected morning." });
        } catch (error) {
          showFlash({
            tone: "error",
            text: error instanceof Error ? error.message : "Could not advance to the selected morning.",
          });
        } finally {
          clockAnchorButton.disabled = false;
          clockAnchorButton.textContent = originalLabel;
        }
      })();
      return;
    }
    const clockNextEventButton = target.closest<HTMLButtonElement>("[data-clock-next-event]");
    if (clockNextEventButton) {
      event.preventDefault();
      const originalLabel = clockNextEventButton.textContent ?? "Skip to next event";
      clockNextEventButton.disabled = true;
      clockNextEventButton.textContent = "Skipping...";
      void (async () => {
        try {
          const result = await postClockAction("advance-to-next-event", new URLSearchParams({
            tab: activeTab,
            selectedLocalDate: clockPayload?.selectedLocalDate ?? "",
          }));

          renderShellChrome(result.shell);
          applyClockPayload(result.clock);
          if (result.tab) {
            replaceTabCacheWith(result.tab);
            activeTab = result.tab.tabId;
            renderTab(result.tab);
          } else if (clockPayload && contractsController) {
            await contractsController.syncCurrentTime(clockPayload.currentTimeUtc);
          }

          showFlash(result.success
            ? result.message
              ? { tone: "notice", text: result.message, notificationLevel: result.notificationLevel }
              : null
            : { tone: "error", text: result.error ?? "Could not advance to the next event." });
        } catch (error) {
          showFlash({
            tone: "error",
            text: error instanceof Error ? error.message : "Could not advance to the next event.",
          });
        } finally {
          clockNextEventButton.disabled = false;
          clockNextEventButton.textContent = originalLabel;
        }
      })();
      return;
    }

    if (settingsMenu.open && !target.closest("[data-settings-menu]")) {
      settingsMenu.open = false;
    }

    if (clockMenu.open && !target.closest("[data-clock-menu]")) {
      clockMenu.open = false;
    }
  });

  clockMenu.addEventListener("toggle", () => {
    if (clockMenu.open) {
      settingsMenu.open = false;
      if (helpCenterOpen) {
        closeHelpCenter();
      }
      clockDateActionOpen = false;
      void loadClock(undefined, true);
      return;
    }

    clockDateActionOpen = false;
  });

  settingsMenu.addEventListener("toggle", () => {
    if (settingsMenu.open) {
      clockMenu.open = false;
      clockDateActionOpen = false;
    }
  });

  window.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      if (helpCenterOpen) {
        closeHelpCenter();
        return;
      }
      if (settingsMenu.open) {
        settingsMenu.open = false;
      }
      if (clockMenu.open) {
        clockMenu.open = false;
      }
    }
  });

  tabsNode.addEventListener("click", (event: MouseEvent) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>("[data-shell-tab]")
      : null;
    if (!target) {
      return;
    }

    event.preventDefault();
    const tabId = target.dataset.shellTab as SavePageTab | undefined;
    if (!tabId) {
      return;
    }

    void loadTab(tabId).catch((error) => {
      showFlash({
        tone: "error",
        text: error instanceof Error ? error.message : `Could not load ${tabId}.`,
      });
    });
  });

  // Handles any form that opts into JSON action responses, then refreshes shell/tab state in place.
  root.addEventListener("submit", (event: SubmitEvent) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form || !form.matches("[data-api-form]")) {
      return;
    }

    event.preventDefault();
    const submitter = event.submitter instanceof HTMLButtonElement ? event.submitter : null;
    const originalLabel = submitter?.textContent ?? "";
    if (submitter) {
      submitter.disabled = true;
      submitter.textContent = submitter.dataset.pendingLabel ?? "Working...";
    }

    void (async () => {
      try {
        const response = await fetch(form.action, {
          method: form.method || "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: toFormUrlEncoded(new FormData(form)),
        });
        const result = (await response.json()) as ActionResponse;

        if (result.shell) {
          renderShellChrome(result.shell);
        }

        applyClockPayload(result.clock);

        if (result.tab) {
          replaceTabCacheWith(result.tab);
          activeTab = result.tab.tabId;
          renderTab(result.tab);
        }

        if (!result.clock && shell?.hasCompany) {
          void loadClock(undefined, false);
        }

        showFlash(
          result.success
            ? result.message
              ? { tone: "notice", text: result.message, notificationLevel: result.notificationLevel }
              : null
            : { tone: "error", text: result.error ?? "Action failed." },
        );
      } catch (error) {
        showFlash({
          tone: "error",
          text: error instanceof Error ? error.message : "Action failed.",
        });
      } finally {
        if (submitter) {
          submitter.disabled = false;
          submitter.textContent = originalLabel;
        }
      }
    })();
  });

  // Opening a save prefers loader-prefetched payloads and falls back to direct bootstrap requests when that handoff is missing.
  const prefetched = consumePrefetchedOpenPayload(config.saveId, config.initialTab);
  if (prefetched) {
    console.info("[save-shell] consumed prefetched payload", {
      saveId: config.saveId,
      tabId: prefetched.initialTab,
    });
    applyPrefetchedPayload(prefetched);
  } else {
    console.info("[save-shell] no prefetched payload; hydrating directly", {
      saveId: config.saveId,
      tabId: config.initialTab,
      openedFromLoader: wasOpenedFromLoader(),
    });
    await hydrateShellDirectly(config.initialTab);
  }

  clockTimerHandle = window.setInterval(() => {
    void tickClockIfNeeded();
  }, 1000);

  window.addEventListener("beforeunload", () => {
    if (clockTimerHandle !== null) {
      window.clearInterval(clockTimerHandle);
      clockTimerHandle = null;
    }
    clearFlashTimer();
  });
}

// The remaining helpers isolate URL construction, local storage, and small formatting concerns from the main controller body.
function enhanceOverviewFinance(container: HTMLElement, saveId: string): void {
  const host = container.querySelector<HTMLElement>("[data-overview-finance-graph]");
  if (!host) {
    return;
  }

  const payloadScript = host.querySelector<HTMLScriptElement>("[data-overview-finance-graph-payload]");
  const svgNode = host.querySelector<SVGSVGElement>("[data-finance-graph-svg]");
  const scrubNode = host.querySelector<HTMLInputElement>("[data-finance-scrub]");
  const summaryNode = host.querySelector<HTMLElement>("[data-finance-point-summary]");
  if (!payloadScript?.textContent || !svgNode || !scrubNode || !summaryNode) {
    return;
  }

  const svg: SVGSVGElement = svgNode;
  const scrub: HTMLInputElement = scrubNode;
  const summary: HTMLElement = summaryNode;
  const payload = JSON.parse(payloadScript.textContent) as OverviewFinanceProjectionPayload;
  const horizonButtons = Array.from(host.querySelectorAll<HTMLButtonElement>("[data-finance-horizon]"));
  const resetButton = host.querySelector<HTMLButtonElement>("[data-finance-reset]");
  const persisted = restoreOverviewFinanceState(saveId, payload.defaultHorizonId);
  let currentHorizonId = persisted.horizonId;
  let currentIndex = persisted.scrubIndex;

  function visiblePoints(): OverviewFinanceProjectionPointPayload[] {
    const horizon = payload.horizons.find((entry) => entry.horizonId === currentHorizonId) ?? payload.horizons[0];
    return payload.points.slice(0, Math.max(1, horizon?.pointCount ?? payload.points.length));
  }

  function render(): void {
    const points = visiblePoints();
    currentIndex = clamp(currentIndex, 0, Math.max(0, points.length - 1));
    scrub.max = String(Math.max(0, points.length - 1));
    scrub.value = String(currentIndex);
    for (const button of horizonButtons) {
      button.classList.toggle("current", button.dataset.financeHorizon === currentHorizonId);
      button.classList.toggle("overview-finance-horizon-button", true);
    }

    renderOverviewFinanceGraph(svg, points, currentIndex);
    const point = points[currentIndex] ?? points[0];
    if (point) {
      summary.innerHTML = `<div class="eyebrow">${escapeHtml(point.label)} projection</div><strong>${escapeHtml(formatMoney(point.baseCashAmount))} base | ${escapeHtml(formatMoney(point.upliftCashAmount))} with uplift</strong><div class="muted">${escapeHtml(formatDate(point.atUtc))} | ${escapeHtml(formatMoney(point.upliftAmount))} accepted-work uplift | ${escapeHtml(point.confidenceBand)} confidence from ${escapeHtml(String(point.upliftSourceCount))} work item${point.upliftSourceCount === 1 ? "" : "s"}.</div>`;
    }

    persistOverviewFinanceState(saveId, currentHorizonId, currentIndex);
  }

  for (const button of horizonButtons) {
    button.addEventListener("click", () => {
      const nextHorizonId = button.dataset.financeHorizon as OverviewFinanceProjectionPayload["defaultHorizonId"] | undefined;
      if (!nextHorizonId) {
        return;
      }
      currentHorizonId = nextHorizonId;
      currentIndex = 0;
      render();
    });
  }

  scrub.addEventListener("input", () => {
    currentIndex = Number.parseInt(scrub.value || "0", 10);
    render();
  });

  resetButton?.addEventListener("click", () => {
    currentHorizonId = payload.defaultHorizonId;
    currentIndex = 0;
    render();
  });

  render();
}

function renderOverviewFinanceGraph(
  svg: SVGSVGElement,
  points: OverviewFinanceProjectionPointPayload[],
  selectedIndex: number,
): void {
  const width = 560;
  const height = 220;
  const padding = { top: 12, right: 18, bottom: 34, left: 18 };
  const baseValues = points.map((point) => point.baseCashAmount);
  const upliftValues = points.map((point) => point.upliftCashAmount);
  const minValue = Math.min(...baseValues, ...upliftValues);
  const maxValue = Math.max(...baseValues, ...upliftValues);
  const range = Math.max(1, maxValue - minValue);
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  function x(index: number): number {
    if (points.length <= 1) {
      return padding.left + chartWidth / 2;
    }
    return padding.left + (chartWidth * index) / (points.length - 1);
  }

  function y(value: number): number {
    return padding.top + chartHeight - ((value - minValue) / range) * chartHeight;
  }

  const baseLine = points.map((point, index) => `${x(index)},${y(point.baseCashAmount)}`).join(" ");
  const upliftLine = points.map((point, index) => `${x(index)},${y(point.upliftCashAmount)}`).join(" ");
  const areaPoints = [
    `${x(0)},${y(points[0]?.baseCashAmount ?? 0)}`,
    ...points.map((point, index) => `${x(index)},${y(point.upliftCashAmount)}`),
    ...[...points].reverse().map((point, index) => {
      const reverseIndex = points.length - 1 - index;
      return `${x(reverseIndex)},${y(point.baseCashAmount)}`;
    }),
  ].join(" ");

  const selectedPoint = points[selectedIndex] ?? points[0];
  const selectedBaseCircle = selectedPoint ? `<circle class="overview-finance-graph-point current" cx="${x(selectedIndex)}" cy="${y(selectedPoint.baseCashAmount)}" r="5"></circle>` : "";
  const selectedUpliftCircle = selectedPoint ? `<circle class="overview-finance-graph-point uplift current" cx="${x(selectedIndex)}" cy="${y(selectedPoint.upliftCashAmount)}" r="5"></circle>` : "";
  const xAxisLabels = points.map((point, index) => `<text class="overview-finance-graph-axis-label" x="${x(index)}" y="${height - 10}" text-anchor="${index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}">${escapeHtml(point.label)}</text>`).join("");
  const minLabel = `<text class="overview-finance-graph-axis-label" x="${padding.left}" y="${height - 48}" text-anchor="start">${escapeHtml(formatMoney(minValue))}</text>`;
  const maxLabel = `<text class="overview-finance-graph-axis-label" x="${padding.left}" y="${padding.top + 4}" dominant-baseline="hanging" text-anchor="start">${escapeHtml(formatMoney(maxValue))}</text>`;
  const gridLines = [0, .5, 1].map((ratio) => {
    const yValue = padding.top + chartHeight * ratio;
    return `<line class="overview-finance-graph-grid-line" x1="${padding.left}" y1="${yValue}" x2="${width - padding.right}" y2="${yValue}"></line>`;
  }).join("");

  svg.innerHTML = `
    <g>${gridLines}</g>
    <polygon class="overview-finance-graph-uplift-area" points="${areaPoints}"></polygon>
    <polyline class="overview-finance-graph-base-line" points="${baseLine}"></polyline>
    <polyline class="overview-finance-graph-uplift-line" points="${upliftLine}"></polyline>
    ${selectedBaseCircle}
    ${selectedUpliftCircle}
    ${minLabel}
    ${maxLabel}
    ${xAxisLabels}
  `;
}

function focusOverviewFinanceSection(container: HTMLElement): void {
  const section = container.querySelector<HTMLElement>("[data-overview-finance-section]");
  if (!section) {
    return;
  }

  section.classList.add("overview-finance-focused");
  section.focus({ preventScroll: true });
  section.scrollIntoView({ block: "start", behavior: "smooth" });
  window.setTimeout(() => section.classList.remove("overview-finance-focused"), 1600);
}

function buildOpenSaveUrl(saveId: string, tabId: SavePageTab): string {
  return `/open-save/${encodeURIComponent(saveId)}${tabId === "dashboard" ? "" : `?tab=${tabId}`}`;
}

function wasOpenedFromLoader(): boolean {
  const search = new URLSearchParams(window.location.search);
  return search.get("opened") === "1";
}

function buildSaveUrl(saveId: string, tabId: SavePageTab): string {
  const search = new URLSearchParams();

  if (tabId !== "dashboard") {
    search.set("tab", tabId);
  }

  const query = search.toString();
  return `/save/${encodeURIComponent(saveId)}${query ? `?${query}` : ""}`;
}

function buildClockUrl(saveId: string, selectedDate?: string): string {
  const search = new URLSearchParams();
  if (selectedDate) {
    search.set("selectedDate", selectedDate);
  }
  const query = search.toString();
  return `/api/save/${encodeURIComponent(saveId)}/clock${query ? `?${query}` : ""}`;
}

function buildPrefetchKey(saveId: string, tabId: SavePageTab): string {
  return `flightline-save-prefetch:${encodeURIComponent(saveId)}:${tabId}`;
}

function consumePrefetchedOpenPayload(saveId: string, initialTab: SavePageTab): PrefetchedOpenPayload | null {
  try {
    const cacheKey = buildPrefetchKey(saveId, initialTab);
    const raw = localStorage.getItem(cacheKey);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PrefetchedOpenPayload;

    if (!wasOpenedFromLoader()) {
      return null;
    }

    const cachedAtMs = Date.parse(parsed.cachedAtUtc);
    if (Number.isNaN(cachedAtMs) || Date.now() - cachedAtMs > 5 * 60_000) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    if (
      parsed.saveId !== saveId
      || parsed.initialTab !== initialTab
      || parsed.bootstrap.saveId !== saveId
      || parsed.tab.saveId !== saveId
      || parsed.tab.tabId !== initialTab
    ) {
      return null;
    }

    localStorage.removeItem(cacheKey);
    return parsed;
  } catch {
    return null;
  }
}

function toFormUrlEncoded(formData: FormData): URLSearchParams {
  const search = new URLSearchParams();
  formData.forEach((value, key) => {
    search.append(key, String(value));
  });
  return search;
}

function restoreClockRate(saveId: string): ClockRateMode {
  try {
    const raw = localStorage.getItem(`flightline-clock-rate:${encodeURIComponent(saveId)}`);
    return clockRateModes.includes(raw as ClockRateMode) ? raw as ClockRateMode : "1x";
  } catch {
    return "1x";
  }
}

function persistClockRate(saveId: string, mode: ClockRateMode): void {
  localStorage.setItem(`flightline-clock-rate:${encodeURIComponent(saveId)}`, mode);
}

function restoreActivityPopupMode(): ActivityPopupMode {
  try {
    const raw = localStorage.getItem("flightline-activity-popups");
    return raw === "important_only" ? "important_only" : "all";
  } catch {
    return "all";
  }
}

function persistActivityPopupMode(mode: ActivityPopupMode): void {
  localStorage.setItem("flightline-activity-popups", mode);
}

function restoreOverviewFinanceState(
  saveId: string,
  fallbackHorizonId: OverviewFinanceProjectionPayload["defaultHorizonId"],
): { horizonId: OverviewFinanceProjectionPayload["defaultHorizonId"]; scrubIndex: number } {
  try {
    const raw = localStorage.getItem(`flightline-overview-finance:${encodeURIComponent(saveId)}`);
    if (!raw) {
      return { horizonId: fallbackHorizonId, scrubIndex: 0 };
    }

    const parsed = JSON.parse(raw) as { horizonId?: OverviewFinanceProjectionPayload["defaultHorizonId"]; scrubIndex?: number };
    return {
      horizonId: parsed.horizonId === "2w" || parsed.horizonId === "4w" || parsed.horizonId === "8w"
        ? parsed.horizonId
        : fallbackHorizonId,
      scrubIndex: Number.isFinite(parsed.scrubIndex) ? Math.max(0, Math.floor(parsed.scrubIndex ?? 0)) : 0,
    };
  } catch {
    return { horizonId: fallbackHorizonId, scrubIndex: 0 };
  }
}

function persistOverviewFinanceState(
  saveId: string,
  horizonId: OverviewFinanceProjectionPayload["defaultHorizonId"],
  scrubIndex: number,
): void {
  localStorage.setItem(
    `flightline-overview-finance:${encodeURIComponent(saveId)}`,
    JSON.stringify({ horizonId, scrubIndex }),
  );
}

function normalizeThemeName(rawTheme: string | undefined): ThemeName {
  return rawTheme === "forest" || rawTheme === "dark" ? rawTheme : "light";
}

function rateMultiplier(mode: ClockRateMode): number {
  switch (mode) {
    case "paused":
      return 0;
    case "1x":
      return 1;
    case "10x":
      return 10;
    case "60x":
      return 60;
    case "360x":
      return 360;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}




