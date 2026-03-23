/*
 * Browser controller for the local Staff workspace split inside the save shell.
 * It owns the Hire versus Employees view toggle plus row-level detail selection.
 */

export interface StaffingTabController {
  destroy(): void;
}

type StaffingWorkspaceView = "employees" | "hire";

const workspaceStoragePrefix = "flightline:staffing-workspace:";
const selectionStoragePrefix = "flightline:staffing-selection:";
const scrollStoragePrefix = "flightline:staffing-scroll:";
const marketStoragePrefix = "flightline:staffing-market:";

type StaffingMarketFitFilter = "all" | "core" | "adjacent" | "broader";
type StaffingMarketPathFilter = "all" | "both" | "direct" | "contract";
type StaffingMarketSortKey = "relevance" | "fit" | "name" | "hours" | "direct_cost" | "contract_cost" | "base";
type StaffingMarketSortDirection = "asc" | "desc";

interface StaffingMarketState {
  search: string;
  fit: StaffingMarketFitFilter;
  path: StaffingMarketPathFilter;
  sortKey: StaffingMarketSortKey;
  sortDirection: StaffingMarketSortDirection;
  moreOpen: boolean;
}

const defaultMarketState: StaffingMarketState = {
  search: "",
  fit: "all",
  path: "all",
  sortKey: "relevance",
  sortDirection: "desc",
  moreOpen: false,
};

export function mountStaffingTab(host: HTMLElement): StaffingTabController {
  const saveId = host.dataset.staffingSaveId ?? "";
  let activeView = normalizeWorkspaceView(
    restoreWorkspaceView(saveId)
      ?? host.dataset.staffingDefaultView
      ?? "employees",
  );
  const selectedDetailIds: Record<StaffingWorkspaceView, string | null> = {
    employees: restoreSelection(saveId, "employees")
      ?? host.dataset.staffingDefaultEmployeeId
      ?? null,
    hire: restoreSelection(saveId, "hire")
      ?? host.dataset.staffingDefaultHireId
      ?? null,
  };
  let hireOverlayOpen = false;
  let marketState = restoreMarketState(saveId) ?? {
    ...defaultMarketState,
    search: host.dataset.staffingDefaultSearch ?? defaultMarketState.search,
    fit: normalizeMarketFitFilter(host.dataset.staffingDefaultFit),
    path: normalizeMarketPathFilter(host.dataset.staffingDefaultPath),
    sortKey: normalizeMarketSortKey(host.dataset.staffingDefaultSortKey),
    sortDirection: normalizeMarketSortDirection(host.dataset.staffingDefaultSortDirection),
  };

  function detailRows(view: StaffingWorkspaceView): HTMLElement[] {
    return Array.from(
      host.querySelectorAll<HTMLElement>(`[data-staffing-row-select="${view}"]`),
    );
  }

  function detailTemplates(view: StaffingWorkspaceView): HTMLTemplateElement[] {
    return Array.from(
      host.querySelectorAll<HTMLTemplateElement>(
        `template[data-staffing-detail-template="${view}"]`,
      ),
    );
  }

  function ensureValidSelection(view: StaffingWorkspaceView): void {
    const rows = detailRows(view);
    const rowIds = rows
      .map((row) => row.dataset.staffingDetailId ?? "")
      .filter((detailId) => detailId.length > 0);
    const fallbackId = (
      view === "employees"
        ? host.dataset.staffingDefaultEmployeeId
        : host.dataset.staffingDefaultHireId
    ) ?? rowIds[0] ?? null;

    if (!selectedDetailIds[view] || !rowIds.includes(selectedDetailIds[view] ?? "")) {
      selectedDetailIds[view] = fallbackId;
    }

    const selectedId = selectedDetailIds[view];
    if (selectedId) {
      storeSelection(saveId, view, selectedId);
    } else {
      clearSelection(saveId, view);
    }
  }

  function renderSelection(view: StaffingWorkspaceView): void {
    ensureValidSelection(view);
    const selectedId = selectedDetailIds[view];
    const rows = detailRows(view);
    const titleNode = host.querySelector<HTMLElement>(
      `[data-staffing-detail-title="${view}"]`,
    );
    const portraitNode = host.querySelector<HTMLImageElement>(
      `[data-staffing-detail-portrait="${view}"]`,
    );
    const bodyNode = host.querySelector<HTMLElement>(
      `[data-staffing-detail-body="${view}"]`,
    );

    rows.forEach((row) => {
      const isSelected = (row.dataset.staffingDetailId ?? "") === selectedId;
      row.classList.toggle("selected", isSelected);
      row.setAttribute("aria-selected", isSelected ? "true" : "false");
      row.tabIndex = 0;
    });

    if (!selectedId || !titleNode || !bodyNode) {
      if (view === "hire") {
        hireOverlayOpen = false;
        setHireOverlayVisible(false);
      }
      return;
    }

    const template = detailTemplates(view).find(
      (entry) => entry.dataset.staffingDetailId === selectedId,
    );
    if (!template) {
      if (view === "hire") {
        hireOverlayOpen = false;
        setHireOverlayVisible(false);
      }
      return;
    }

    titleNode.textContent = template.dataset.staffingDetailTitle
      ?? defaultDetailTitle(view);
    if (portraitNode) {
      const portraitSrc = template.dataset.staffingDetailPortraitSrc ?? "";
      if (portraitSrc) {
        portraitNode.src = portraitSrc;
      }
    }
    bodyNode.replaceChildren(template.content.cloneNode(true));

    if (view === "hire") {
      setHireOverlayVisible(activeView === "hire" && hireOverlayOpen);
    }
  }

  function render(): void {
    const buttons = host.querySelectorAll<HTMLElement>("[data-staffing-workspace-tab]");
    const panels = host.querySelectorAll<HTMLElement>("[data-staffing-workspace-panel]");

    buttons.forEach((button) => {
      const buttonView = normalizeWorkspaceView(button.dataset.staffingWorkspaceTab);
      const isCurrent = buttonView === activeView;
      button.classList.toggle("current", isCurrent);
      button.setAttribute("aria-selected", isCurrent ? "true" : "false");
    });

    panels.forEach((panel) => {
      const panelView = normalizeWorkspaceView(panel.dataset.staffingWorkspacePanel);
      panel.hidden = panelView !== activeView;
    });

    renderSelection("employees");
    renderSelection("hire");
    syncMarketControls(host, marketState);
    applyMarketState(host, marketState);
  }

  function setHireOverlayVisible(isVisible: boolean): void {
    const overlay = host.querySelector<HTMLElement>("[data-staffing-hire-overlay]");
    const stage = host.querySelector<HTMLElement>("[data-staffing-hire-stage]");
    if (!overlay || !stage) {
      return;
    }

    overlay.hidden = !isVisible;
    stage.classList.toggle("overlay-open", isVisible);
  }

  function closeHireOverlay(): void {
    hireOverlayOpen = false;
    render();
  }

  function restoreScrollRegions(): void {
    const regions = host.querySelectorAll<HTMLElement>("[data-staffing-scroll-region]");
    regions.forEach((region) => {
      const regionId = region.dataset.staffingScrollRegion ?? "";
      if (!regionId) {
        return;
      }

      const storedTop = restoreScrollTop(saveId, regionId);
      if (storedTop !== null) {
        region.scrollTop = storedTop;
      }
    });
  }

  function persistScrollRegions(): void {
    const regions = host.querySelectorAll<HTMLElement>("[data-staffing-scroll-region]");
    regions.forEach((region) => {
      const regionId = region.dataset.staffingScrollRegion ?? "";
      if (!regionId) {
        return;
      }

      storeScrollTop(saveId, regionId, region.scrollTop);
    });
  }

  function handleClick(event: MouseEvent): void {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const workspaceButton = target?.closest<HTMLElement>("[data-staffing-workspace-tab]");
    if (workspaceButton) {
      event.preventDefault();
      activeView = normalizeWorkspaceView(workspaceButton.dataset.staffingWorkspaceTab);
      if (activeView !== "hire") {
        hireOverlayOpen = false;
      }
      storeWorkspaceView(saveId, activeView);
      render();
      return;
    }

    const closeButton = target?.closest<HTMLElement>("[data-staffing-detail-close='hire']");
    if (closeButton) {
      event.preventDefault();
      closeHireOverlay();
      return;
    }

    const moreToggle = target?.closest<HTMLElement>("[data-staffing-hire-more-toggle]");
    if (moreToggle) {
      event.preventDefault();
      marketState = {
        ...marketState,
        moreOpen: !marketState.moreOpen,
      };
      storeMarketState(saveId, marketState);
      render();
      return;
    }

    const resetButton = target?.closest<HTMLElement>("[data-staffing-hire-reset]");
    if (resetButton) {
      event.preventDefault();
      marketState = { ...defaultMarketState };
      storeMarketState(saveId, marketState);
      render();
      return;
    }

    if (target?.closest("button, a, input, select, textarea, summary, label")) {
      return;
    }

    const row = target?.closest<HTMLElement>("[data-staffing-row-select]");
    if (!row || !host.contains(row)) {
      return;
    }

    event.preventDefault();
    const rowView = normalizeWorkspaceView(row.dataset.staffingRowSelect);
    const detailId = row.dataset.staffingDetailId ?? "";
    if (!detailId) {
      return;
    }

    selectedDetailIds[rowView] = detailId;
    storeSelection(saveId, rowView, detailId);
    if (rowView === "hire") {
      hireOverlayOpen = true;
    }
    render();
    if (rowView === "hire") {
      setHireOverlayVisible(activeView === "hire");
    }
  }

  function handleMarketControlEvent(event: Event): void {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }

    const searchInput = target.closest<HTMLInputElement>("[data-staffing-hire-search]");
    if (searchInput) {
      marketState = {
        ...marketState,
        search: searchInput.value,
      };
      storeMarketState(saveId, marketState);
      applyMarketState(host, marketState);
      return;
    }

    const fitSelect = target.closest<HTMLSelectElement>("[data-staffing-hire-fit]");
    if (fitSelect) {
      marketState = {
        ...marketState,
        fit: normalizeMarketFitFilter(fitSelect.value),
      };
      storeMarketState(saveId, marketState);
      applyMarketState(host, marketState);
      return;
    }

    const pathSelect = target.closest<HTMLSelectElement>("[data-staffing-hire-path-filter]");
    if (pathSelect) {
      marketState = {
        ...marketState,
        path: normalizeMarketPathFilter(pathSelect.value),
      };
      storeMarketState(saveId, marketState);
      applyMarketState(host, marketState);
      return;
    }

    const sortSelect = target.closest<HTMLSelectElement>("[data-staffing-hire-sort]");
    if (sortSelect) {
      marketState = {
        ...marketState,
        sortKey: normalizeMarketSortKey(sortSelect.value),
      };
      storeMarketState(saveId, marketState);
      applyMarketState(host, marketState);
      return;
    }

    const directionSelect = target.closest<HTMLSelectElement>("[data-staffing-hire-direction]");
    if (directionSelect) {
      marketState = {
        ...marketState,
        sortDirection: normalizeMarketSortDirection(directionSelect.value),
      };
      storeMarketState(saveId, marketState);
      applyMarketState(host, marketState);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && hireOverlayOpen) {
      event.preventDefault();
      closeHireOverlay();
      return;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;
    const row = target?.closest<HTMLElement>("[data-staffing-row-select]");
    if (!row || !host.contains(row)) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    if (target?.closest("button, a, input, select, textarea, summary, label")) {
      return;
    }

    event.preventDefault();
    const rowView = normalizeWorkspaceView(row.dataset.staffingRowSelect);
    const detailId = row.dataset.staffingDetailId ?? "";
    if (!detailId) {
      return;
    }

    selectedDetailIds[rowView] = detailId;
    storeSelection(saveId, rowView, detailId);
    if (rowView === "hire") {
      hireOverlayOpen = true;
    }
    render();
    if (rowView === "hire") {
      setHireOverlayVisible(activeView === "hire");
    }
  }

  function handleScroll(event: Event): void {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const region = target?.closest<HTMLElement>("[data-staffing-scroll-region]");
    if (!region || !host.contains(region)) {
      return;
    }

    const regionId = region.dataset.staffingScrollRegion ?? "";
    if (!regionId) {
      return;
    }

    storeScrollTop(saveId, regionId, region.scrollTop);
  }

  host.addEventListener("click", handleClick);
  host.addEventListener("input", handleMarketControlEvent);
  host.addEventListener("change", handleMarketControlEvent);
  host.addEventListener("keydown", handleKeydown);
  host.addEventListener("scroll", handleScroll, true);
  render();
  restoreScrollRegions();

  return {
    destroy(): void {
      persistScrollRegions();
      host.removeEventListener("click", handleClick);
      host.removeEventListener("input", handleMarketControlEvent);
      host.removeEventListener("change", handleMarketControlEvent);
      host.removeEventListener("keydown", handleKeydown);
      host.removeEventListener("scroll", handleScroll, true);
    },
  };
}

function normalizeWorkspaceView(rawValue: string | undefined): StaffingWorkspaceView {
  return rawValue === "hire" ? "hire" : "employees";
}

function storageKey(saveId: string): string {
  return `${workspaceStoragePrefix}${saveId}`;
}

function restoreWorkspaceView(saveId: string): StaffingWorkspaceView | null {
  if (!saveId) {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey(saveId));
    return storedValue ? normalizeWorkspaceView(storedValue) : null;
  } catch {
    return null;
  }
}

function storeWorkspaceView(saveId: string, view: StaffingWorkspaceView): void {
  if (!saveId) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey(saveId), view);
  } catch {
    // Ignore storage failures; the view still works for the active session.
  }
}

function selectionStorageKey(saveId: string, view: StaffingWorkspaceView): string {
  return `${selectionStoragePrefix}${saveId}:${view}`;
}

function restoreSelection(saveId: string, view: StaffingWorkspaceView): string | null {
  if (!saveId) {
    return null;
  }

  try {
    return window.localStorage.getItem(selectionStorageKey(saveId, view));
  } catch {
    return null;
  }
}

function storeSelection(saveId: string, view: StaffingWorkspaceView, detailId: string): void {
  if (!saveId || !detailId) {
    return;
  }

  try {
    window.localStorage.setItem(selectionStorageKey(saveId, view), detailId);
  } catch {
    // Ignore storage failures; the selection still works for the active session.
  }
}

function clearSelection(saveId: string, view: StaffingWorkspaceView): void {
  if (!saveId) {
    return;
  }

  try {
    window.localStorage.removeItem(selectionStorageKey(saveId, view));
  } catch {
    // Ignore storage failures; the selection still works for the active session.
  }
}

function defaultDetailTitle(view: StaffingWorkspaceView): string {
  return view === "hire" ? "Hiring Detail" : "Employee Detail";
}

function scrollStorageKey(saveId: string, regionId: string): string {
  return `${scrollStoragePrefix}${saveId}:${regionId}`;
}

function restoreScrollTop(saveId: string, regionId: string): number | null {
  if (!saveId || !regionId) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(scrollStorageKey(saveId, regionId));
    if (!rawValue) {
      return null;
    }
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function storeScrollTop(saveId: string, regionId: string, scrollTop: number): void {
  if (!saveId || !regionId) {
    return;
  }

  try {
    window.localStorage.setItem(
      scrollStorageKey(saveId, regionId),
      String(Math.max(0, Math.round(scrollTop))),
    );
  } catch {
    // Ignore storage failures; the current session still works.
  }
}

function restoreMarketState(saveId: string): StaffingMarketState | null {
  if (!saveId) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(`${marketStoragePrefix}${saveId}`);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<StaffingMarketState>;
    return {
      search: typeof parsed.search === "string" ? parsed.search : defaultMarketState.search,
      fit: normalizeMarketFitFilter(parsed.fit),
      path: normalizeMarketPathFilter(parsed.path),
      sortKey: normalizeMarketSortKey(parsed.sortKey),
      sortDirection: normalizeMarketSortDirection(parsed.sortDirection),
      moreOpen: parsed.moreOpen === true,
    };
  } catch {
    return null;
  }
}

function storeMarketState(saveId: string, state: StaffingMarketState): void {
  if (!saveId) {
    return;
  }

  try {
    window.localStorage.setItem(`${marketStoragePrefix}${saveId}`, JSON.stringify(state));
  } catch {
    // Ignore storage failures; the current session still works.
  }
}

function normalizeMarketFitFilter(rawValue: unknown): StaffingMarketFitFilter {
  return rawValue === "core" || rawValue === "adjacent" || rawValue === "broader"
    ? rawValue
    : "all";
}

function normalizeMarketPathFilter(rawValue: unknown): StaffingMarketPathFilter {
  return rawValue === "both" || rawValue === "direct" || rawValue === "contract"
    ? rawValue
    : "all";
}

function normalizeMarketSortKey(rawValue: unknown): StaffingMarketSortKey {
  return rawValue === "fit"
    || rawValue === "name"
    || rawValue === "hours"
    || rawValue === "direct_cost"
    || rawValue === "contract_cost"
    || rawValue === "base"
    ? rawValue
    : "relevance";
}

function normalizeMarketSortDirection(rawValue: unknown): StaffingMarketSortDirection {
  return rawValue === "asc" ? "asc" : "desc";
}

function syncMarketControls(host: HTMLElement, marketState: StaffingMarketState): void {
  const searchInput = host.querySelector<HTMLInputElement>("[data-staffing-hire-search]");
  const fitSelect = host.querySelector<HTMLSelectElement>("[data-staffing-hire-fit]");
  const sortSelect = host.querySelector<HTMLSelectElement>("[data-staffing-hire-sort]");
  const pathSelect = host.querySelector<HTMLSelectElement>("[data-staffing-hire-path-filter]");
  const directionSelect = host.querySelector<HTMLSelectElement>("[data-staffing-hire-direction]");
  const morePanel = host.querySelector<HTMLElement>("[data-staffing-hire-more]");
  const moreToggle = host.querySelector<HTMLButtonElement>("[data-staffing-hire-more-toggle]");

  if (searchInput) {
    searchInput.value = marketState.search;
  }
  if (fitSelect) {
    fitSelect.value = marketState.fit;
  }
  if (sortSelect) {
    sortSelect.value = marketState.sortKey;
  }
  if (pathSelect) {
    pathSelect.value = marketState.path;
  }
  if (directionSelect) {
    directionSelect.value = marketState.sortDirection;
  }
  if (morePanel) {
    morePanel.hidden = !marketState.moreOpen;
  }
  if (moreToggle) {
    moreToggle.setAttribute("aria-expanded", marketState.moreOpen ? "true" : "false");
  }
}

function applyMarketState(host: HTMLElement, marketState: StaffingMarketState): void {
  const marketShell = host.querySelector<HTMLElement>("[data-staffing-hire-market-shell]");
  const table = host.querySelector<HTMLTableElement>("[data-pilot-candidate-market-table] table");
  const emptyState = host.querySelector<HTMLElement>("[data-staffing-market-empty]");
  if (!marketShell || !table) {
    return;
  }

  syncMarketControls(host, marketState);

  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("[data-pilot-candidate-row]"));
  const normalizedSearch = marketState.search.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    const fitBucket = normalizeMarketFitFilter(row.dataset.staffingCandidateFit);
    const path = normalizeMarketPathFilter(row.dataset.staffingCandidatePath);
    if (marketState.fit !== "all" && marketState.fit !== fitBucket) {
      return false;
    }
    if (marketState.path !== "all" && marketState.path !== path) {
      return false;
    }
    if (normalizedSearch.length > 0) {
      const searchIndex = (row.dataset.staffingCandidateSearch ?? "").toLowerCase();
      return searchIndex.includes(normalizedSearch);
    }
    return true;
  });

  visibleRows.sort((left, right) => compareCandidateRows(left, right, marketState));

  const tbody = table.querySelector("tbody");
  if (tbody) {
    tbody.append(...visibleRows);
  }

  rows.forEach((row) => {
    const isVisible = visibleRows.includes(row);
    row.hidden = !isVisible;
    row.setAttribute("aria-hidden", isVisible ? "false" : "true");
  });

  if (emptyState) {
    emptyState.hidden = visibleRows.length > 0;
  }

  marketShell.dataset.staffingVisibleCandidates = String(visibleRows.length);
  marketShell.dataset.staffingVisibleCandidateNames = visibleRows.map((row) => row.dataset.staffingCandidateName ?? "").join("|");
}

function fitBucketRank(value: StaffingMarketFitFilter): number {
  switch (value) {
    case "core":
      return 0;
    case "adjacent":
      return 1;
    case "broader":
      return 2;
    default:
      return 3;
  }
}

function compareCandidateRows(left: HTMLTableRowElement, right: HTMLTableRowElement, state: StaffingMarketState): number {
  switch (state.sortKey) {
    case "fit": {
      const leftFit = fitBucketRank(normalizeMarketFitFilter(left.dataset.staffingCandidateFit));
      const rightFit = fitBucketRank(normalizeMarketFitFilter(right.dataset.staffingCandidateFit));
      if (leftFit !== rightFit) {
        return state.sortDirection === "asc" ? leftFit - rightFit : rightFit - leftFit;
      }
      break;
    }
    case "name": {
      const comparison = (left.dataset.staffingCandidateName ?? "").localeCompare(right.dataset.staffingCandidateName ?? "");
      if (comparison !== 0) {
        return state.sortDirection === "asc" ? comparison : -comparison;
      }
      break;
    }
    case "hours": {
      const leftHours = Number.parseFloat(left.dataset.staffingCandidateHours ?? "0") || 0;
      const rightHours = Number.parseFloat(right.dataset.staffingCandidateHours ?? "0") || 0;
      if (leftHours !== rightHours) {
        return state.sortDirection === "asc" ? leftHours - rightHours : rightHours - leftHours;
      }
      break;
    }
    case "direct_cost":
    case "contract_cost": {
      const leftCost = Number.parseFloat(
        state.sortKey === "direct_cost"
          ? left.dataset.staffingCandidateDirectCost ?? ""
          : left.dataset.staffingCandidateContractCost ?? "",
      );
      const rightCost = Number.parseFloat(
        state.sortKey === "direct_cost"
          ? right.dataset.staffingCandidateDirectCost ?? ""
          : right.dataset.staffingCandidateContractCost ?? "",
      );
      const normalizedLeftCost = Number.isFinite(leftCost) ? leftCost : Number.POSITIVE_INFINITY;
      const normalizedRightCost = Number.isFinite(rightCost) ? rightCost : Number.POSITIVE_INFINITY;
      if (normalizedLeftCost !== normalizedRightCost) {
        return state.sortDirection === "asc"
          ? normalizedLeftCost - normalizedRightCost
          : normalizedRightCost - normalizedLeftCost;
      }
      break;
    }
    case "base": {
      const comparison = (left.dataset.staffingCandidateBase ?? "").localeCompare(right.dataset.staffingCandidateBase ?? "");
      if (comparison !== 0) {
        return state.sortDirection === "asc" ? comparison : -comparison;
      }
      break;
    }
    case "relevance":
    default: {
      const leftRelevance = Number.parseFloat(left.dataset.staffingCandidateRelevance ?? "0") || 0;
      const rightRelevance = Number.parseFloat(right.dataset.staffingCandidateRelevance ?? "0") || 0;
      if (leftRelevance !== rightRelevance) {
        return state.sortDirection === "asc" ? leftRelevance - rightRelevance : rightRelevance - leftRelevance;
      }
      break;
    }
  }

  return (left.dataset.staffingCandidateName ?? "").localeCompare(right.dataset.staffingCandidateName ?? "");
}
