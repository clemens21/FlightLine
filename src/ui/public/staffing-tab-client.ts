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

type StaffingMarketPopoverKey =
  | "pilot"
  | "certifications"
  | "hours"
  | "reliability"
  | "stress"
  | "procedure"
  | "training"
  | "direct_hire"
  | "contract_hire"
  | null;
type StaffingContractSortBasis = "upfront" | "hourly";
type StaffingMarketSortKey =
  | "relevance"
  | "name"
  | "certifications"
  | "hours"
  | "operationalReliability"
  | "stressTolerance"
  | "procedureDiscipline"
  | "trainingAptitude"
  | "direct_cost"
  | "contract_cost";
type StaffingMarketSortDirection = "asc" | "desc";

interface StaffingMarketState {
  pilotSearch: string;
  certificationFilters: string[];
  hoursMin: string;
  hoursMax: string;
  reliabilityMin: string;
  reliabilityMax: string;
  stressMin: string;
  stressMax: string;
  procedureMin: string;
  procedureMax: string;
  trainingMin: string;
  trainingMax: string;
  directCostMin: string;
  directCostMax: string;
  contractHourlyMin: string;
  contractHourlyMax: string;
  contractSortBasis: StaffingContractSortBasis;
  sortKey: StaffingMarketSortKey;
  sortDirection: StaffingMarketSortDirection;
}

const defaultMarketState: StaffingMarketState = {
  pilotSearch: "",
  certificationFilters: [],
  hoursMin: "",
  hoursMax: "",
  reliabilityMin: "",
  reliabilityMax: "",
  stressMin: "",
  stressMax: "",
  procedureMin: "",
  procedureMax: "",
  trainingMin: "",
  trainingMax: "",
  directCostMin: "",
  directCostMax: "",
  contractHourlyMin: "",
  contractHourlyMax: "",
  contractSortBasis: "upfront",
  sortKey: "relevance",
  sortDirection: "desc",
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
  let activePopover: StaffingMarketPopoverKey = null;
  let marketState = restoreMarketState(saveId) ?? {
    ...defaultMarketState,
    pilotSearch: host.dataset.staffingDefaultSearch ?? defaultMarketState.pilotSearch,
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
    host.dataset.staffingActiveView = activeView;
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
    syncMarketControls(host, marketState, activePopover);
    applyMarketState(host, marketState, activePopover);
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

  function closeActivePopover(): void {
    if (activePopover === null) {
      return;
    }

    activePopover = null;
    render();
  }

  function toggleMarketPopover(popoverKey: StaffingMarketPopoverKey): void {
    activePopover = activePopover === popoverKey ? null : popoverKey;
    render();
    if (activePopover !== null) {
      window.requestAnimationFrame(() => {
        const firstField = host.querySelector<HTMLInputElement | HTMLSelectElement>(
          `[data-staffing-hire-popover="${activePopover}"] [data-staffing-hire-field]`,
        );
        if (!firstField) {
          return;
        }
        firstField.focus();
        if (firstField instanceof HTMLInputElement && firstField.type === "search") {
          firstField.select();
        }
      });
    }
  }

  function updateMarketState(nextState: Partial<StaffingMarketState>): void {
    marketState = {
      ...marketState,
      ...nextState,
    };
    storeMarketState(saveId, marketState);
    applyMarketState(host, marketState, activePopover);
  }

  function handleClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const workspaceButton = target?.closest<HTMLElement>("[data-staffing-workspace-tab]");
    if (workspaceButton) {
      event.preventDefault();
      event.stopPropagation();
      activeView = normalizeWorkspaceView(workspaceButton.dataset.staffingWorkspaceTab);
      if (activeView !== "hire") {
        hireOverlayOpen = false;
      }
      activePopover = null;
      storeWorkspaceView(saveId, activeView);
      render();
      return;
    }

    const closeButton = target?.closest<HTMLElement>("[data-staffing-detail-close='hire']");
    if (closeButton) {
      event.preventDefault();
      event.stopPropagation();
      closeHireOverlay();
      return;
    }

    const sortButton = target?.closest<HTMLButtonElement>("[data-staffing-hire-sort-button]");
    if (sortButton) {
      event.preventDefault();
      event.stopPropagation();
      const nextSortKey = normalizeMarketSortKey(sortButton.dataset.staffingHireSortButton);
      const nextSortDirection =
        marketState.sortKey === nextSortKey
          ? marketState.sortDirection === "asc"
            ? "desc"
            : "asc"
          : defaultSortDirectionForKey(nextSortKey);
      activePopover = null;
      marketState = {
        ...marketState,
        sortKey: nextSortKey,
        sortDirection: nextSortDirection,
      };
      storeMarketState(saveId, marketState);
      render();
      return;
    }

    const popoverToggle = target?.closest<HTMLElement>("[data-staffing-hire-popover-toggle]");
    if (popoverToggle) {
      event.preventDefault();
      event.stopPropagation();
      toggleMarketPopover(normalizeMarketPopoverKey(popoverToggle.dataset.staffingHirePopoverToggle));
      return;
    }

    const popover = target?.closest<HTMLElement>("[data-staffing-hire-popover]");
    if (activePopover !== null && !popover && !target?.closest("[data-staffing-hire-popover-toggle]")) {
      activePopover = null;
      render();
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
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const field = target.closest<HTMLElement>("[data-staffing-hire-field]")?.dataset.staffingHireField;
    if (!field) {
      return;
    }

    event.stopPropagation();

    switch (field) {
      case "pilotSearch":
        updateMarketState({ pilotSearch: (target as HTMLInputElement).value });
        return;
      case "certificationFilter":
        updateMarketState({
          certificationFilters: Array.from(
            host.querySelectorAll<HTMLInputElement>(
              "input[data-staffing-hire-field='certificationFilter']:checked",
            ),
          ).map((input) => input.value),
        });
        return;
      case "hoursMin":
        updateMarketState({ hoursMin: (target as HTMLInputElement).value });
        return;
      case "hoursMax":
        updateMarketState({ hoursMax: (target as HTMLInputElement).value });
        return;
      case "reliabilityMin":
        updateMarketState({ reliabilityMin: (target as HTMLInputElement).value });
        return;
      case "reliabilityMax":
        updateMarketState({ reliabilityMax: (target as HTMLInputElement).value });
        return;
      case "stressMin":
        updateMarketState({ stressMin: (target as HTMLInputElement).value });
        return;
      case "stressMax":
        updateMarketState({ stressMax: (target as HTMLInputElement).value });
        return;
      case "procedureMin":
        updateMarketState({ procedureMin: (target as HTMLInputElement).value });
        return;
      case "procedureMax":
        updateMarketState({ procedureMax: (target as HTMLInputElement).value });
        return;
      case "trainingMin":
        updateMarketState({ trainingMin: (target as HTMLInputElement).value });
        return;
      case "trainingMax":
        updateMarketState({ trainingMax: (target as HTMLInputElement).value });
        return;
      case "directCostMin":
        updateMarketState({ directCostMin: (target as HTMLInputElement).value });
        return;
      case "directCostMax":
        updateMarketState({ directCostMax: (target as HTMLInputElement).value });
        return;
      case "contractHourlyMin":
        updateMarketState({ contractHourlyMin: (target as HTMLInputElement).value });
        return;
      case "contractHourlyMax":
        updateMarketState({ contractHourlyMax: (target as HTMLInputElement).value });
        return;
      case "contractSortBasis":
        updateMarketState({ contractSortBasis: normalizeContractSortBasis((target as HTMLSelectElement).value) });
        return;
      default:
        return;
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && activePopover !== null) {
      event.preventDefault();
      closeActivePopover();
      return;
    }

    if (event.key === "Escape" && hireOverlayOpen) {
      event.preventDefault();
      closeHireOverlay();
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
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

  function handleDocumentClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    if (activePopover === null) {
      return;
    }

    if (host.contains(target)) {
      return;
    }

    activePopover = null;
    render();
  }

  function handleScroll(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
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
  document.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("click", handleDocumentClick, true);
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
      document.removeEventListener("keydown", handleKeydown, true);
      document.removeEventListener("click", handleDocumentClick, true);
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

    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return {
      pilotSearch: typeof parsed.pilotSearch === "string"
        ? parsed.pilotSearch
        : typeof parsed.search === "string"
          ? parsed.search
          : defaultMarketState.pilotSearch,
      certificationFilters: normalizeCertificationFilters(parsed.certificationFilters ?? parsed.certificationFilter),
      hoursMin: normalizeOptionalNumberString(parsed.hoursMin),
      hoursMax: normalizeOptionalNumberString(parsed.hoursMax),
      reliabilityMin: normalizeOptionalNumberString(parsed.reliabilityMin),
      reliabilityMax: normalizeOptionalNumberString(parsed.reliabilityMax),
      stressMin: normalizeOptionalNumberString(parsed.stressMin),
      stressMax: normalizeOptionalNumberString(parsed.stressMax),
      procedureMin: normalizeOptionalNumberString(parsed.procedureMin),
      procedureMax: normalizeOptionalNumberString(parsed.procedureMax),
      trainingMin: normalizeOptionalNumberString(parsed.trainingMin),
      trainingMax: normalizeOptionalNumberString(parsed.trainingMax),
      directCostMin: normalizeOptionalNumberString(parsed.directCostMin),
      directCostMax: normalizeOptionalNumberString(parsed.directCostMax),
      contractHourlyMin: normalizeOptionalNumberString(parsed.contractHourlyMin),
      contractHourlyMax: normalizeOptionalNumberString(parsed.contractHourlyMax),
      contractSortBasis: normalizeContractSortBasis(parsed.contractSortBasis),
      sortKey: normalizeMarketSortKey(parsed.sortKey),
      sortDirection: normalizeMarketSortDirection(parsed.sortDirection),
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

function normalizeCertificationFilters(rawValue: unknown): string[] {
  if (Array.isArray(rawValue)) {
    return rawValue
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }
  if (typeof rawValue === "string") {
    const normalized = rawValue.trim();
    if (!normalized || normalized === "all") {
      return [];
    }
    return [normalized];
  }
  return [];
}

function normalizeMarketSortKey(rawValue: unknown): StaffingMarketSortKey {
  return rawValue === "name"
    || rawValue === "certifications"
    || rawValue === "hours"
    || rawValue === "operationalReliability"
    || rawValue === "stressTolerance"
    || rawValue === "procedureDiscipline"
    || rawValue === "trainingAptitude"
    || rawValue === "direct_cost"
    || rawValue === "contract_cost"
    ? rawValue
    : "relevance";
}

function normalizeMarketSortDirection(rawValue: unknown): StaffingMarketSortDirection {
  return rawValue === "asc" ? "asc" : "desc";
}

function normalizeContractSortBasis(rawValue: unknown): StaffingContractSortBasis {
  return rawValue === "hourly" ? "hourly" : "upfront";
}

function normalizeOptionalNumberString(rawValue: unknown): string {
  if (typeof rawValue !== "string") {
    return "";
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "";
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function parseOptionalNumber(rawValue: string): number | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMarketPopoverKey(rawValue: unknown): StaffingMarketPopoverKey {
  return rawValue === "pilot"
    || rawValue === "certifications"
    || rawValue === "hours"
    || rawValue === "reliability"
    || rawValue === "stress"
    || rawValue === "procedure"
    || rawValue === "training"
    || rawValue === "direct_hire"
    || rawValue === "contract_hire"
    ? rawValue
    : null;
}

function defaultSortDirectionForKey(sortKey: StaffingMarketSortKey): StaffingMarketSortDirection {
  switch (sortKey) {
    case "relevance":
    case "certifications":
    case "hours":
    case "operationalReliability":
    case "stressTolerance":
    case "procedureDiscipline":
    case "trainingAptitude":
      return "desc";
    case "name":
    case "direct_cost":
    case "contract_cost":
    default:
      return "asc";
  }
}

function getSortKeyForHeader(columnKey: string | undefined): StaffingMarketSortKey {
  switch (columnKey) {
    case "pilot":
      return "name";
    case "certifications":
      return "certifications";
    case "hours":
      return "hours";
    case "reliability":
      return "operationalReliability";
    case "stress":
      return "stressTolerance";
    case "procedure":
      return "procedureDiscipline";
    case "training":
      return "trainingAptitude";
    case "direct_hire":
      return "direct_cost";
    case "contract_hire":
      return "contract_cost";
    default:
      return "relevance";
  }
}

function positionActivePopover(host: HTMLElement, activePopover: StaffingMarketPopoverKey): void {
  if (activePopover === null) {
    return;
  }

  const popover = host.querySelector<HTMLElement>(
    `[data-staffing-hire-popover="${activePopover}"]`,
  );
  const marketRegion = host.querySelector<HTMLElement>("[data-pilot-candidate-market]");
  if (!popover || popover.hidden || !marketRegion) {
    return;
  }

  const controlType = popover.dataset.staffingHireControlType ?? "filter";
  popover.dataset.staffingHirePopoverSide = controlType === "search" ? "overlay" : "end";
  popover.style.removeProperty("--staffing-hire-popover-nudge");

  const viewportPadding = 12;
  const marketRect = marketRegion.getBoundingClientRect();
  const allowedLeft = Math.max(viewportPadding, marketRect.left + viewportPadding);
  const allowedRight = Math.min(window.innerWidth - viewportPadding, marketRect.right - viewportPadding);

  let popoverRect = popover.getBoundingClientRect();
  if (controlType !== "search" && popoverRect.left < allowedLeft) {
    popover.dataset.staffingHirePopoverSide = "start";
    popoverRect = popover.getBoundingClientRect();
  }

  let nudge = 0;
  if (popoverRect.right > allowedRight) {
    nudge -= popoverRect.right - allowedRight;
  }
  if (popoverRect.left < allowedLeft) {
    nudge += allowedLeft - popoverRect.left;
  }
  if (nudge !== 0) {
    popover.style.setProperty("--staffing-hire-popover-nudge", `${Math.round(nudge)}px`);
  }
}

function syncMarketControls(host: HTMLElement, marketState: StaffingMarketState, activePopover: StaffingMarketPopoverKey): void {
  const controls: Array<[string, string]> = [
    ["pilotSearch", "input[data-staffing-hire-field='pilotSearch']"],
    ["hoursMin", "input[data-staffing-hire-field='hoursMin']"],
    ["hoursMax", "input[data-staffing-hire-field='hoursMax']"],
    ["reliabilityMin", "input[data-staffing-hire-field='reliabilityMin']"],
    ["reliabilityMax", "input[data-staffing-hire-field='reliabilityMax']"],
    ["stressMin", "input[data-staffing-hire-field='stressMin']"],
    ["stressMax", "input[data-staffing-hire-field='stressMax']"],
    ["procedureMin", "input[data-staffing-hire-field='procedureMin']"],
    ["procedureMax", "input[data-staffing-hire-field='procedureMax']"],
    ["trainingMin", "input[data-staffing-hire-field='trainingMin']"],
    ["trainingMax", "input[data-staffing-hire-field='trainingMax']"],
    ["directCostMin", "input[data-staffing-hire-field='directCostMin']"],
    ["directCostMax", "input[data-staffing-hire-field='directCostMax']"],
    ["contractHourlyMin", "input[data-staffing-hire-field='contractHourlyMin']"],
    ["contractHourlyMax", "input[data-staffing-hire-field='contractHourlyMax']"],
    ["contractSortBasis", "select[data-staffing-hire-field='contractSortBasis']"],
  ];

  for (const [field, selector] of controls) {
    const control = host.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
    if (!control) {
      continue;
    }

    switch (field) {
      case "pilotSearch":
        control.value = marketState.pilotSearch;
        break;
      case "hoursMin":
        control.value = marketState.hoursMin;
        break;
      case "hoursMax":
        control.value = marketState.hoursMax;
        break;
      case "reliabilityMin":
        control.value = marketState.reliabilityMin;
        break;
      case "reliabilityMax":
        control.value = marketState.reliabilityMax;
        break;
      case "stressMin":
        control.value = marketState.stressMin;
        break;
      case "stressMax":
        control.value = marketState.stressMax;
        break;
      case "procedureMin":
        control.value = marketState.procedureMin;
        break;
      case "procedureMax":
        control.value = marketState.procedureMax;
        break;
      case "trainingMin":
        control.value = marketState.trainingMin;
        break;
      case "trainingMax":
        control.value = marketState.trainingMax;
        break;
      case "directCostMin":
        control.value = marketState.directCostMin;
        break;
      case "directCostMax":
        control.value = marketState.directCostMax;
        break;
      case "contractHourlyMin":
        control.value = marketState.contractHourlyMin;
        break;
      case "contractHourlyMax":
        control.value = marketState.contractHourlyMax;
        break;
      case "contractSortBasis":
        control.value = marketState.contractSortBasis;
        break;
      default:
        break;
    }
  }

  host.querySelectorAll<HTMLInputElement>("input[data-staffing-hire-field='certificationFilter']").forEach((checkbox) => {
    checkbox.checked = marketState.certificationFilters.includes(checkbox.value);
  });

  host.querySelectorAll<HTMLElement>("[data-staffing-hire-popover]").forEach((popover) => {
    const popoverKey = normalizeMarketPopoverKey(popover.dataset.staffingHirePopover);
    popover.hidden = popoverKey !== activePopover;
  });

  host.querySelectorAll<HTMLButtonElement>("[data-staffing-hire-popover-toggle]").forEach((toggle) => {
    const togglePopover = normalizeMarketPopoverKey(toggle.dataset.staffingHirePopoverToggle);
    toggle.setAttribute("aria-expanded", togglePopover === activePopover ? "true" : "false");
  });

  host.querySelectorAll<HTMLElement>("[data-staffing-hire-column]").forEach((column) => {
    const sortKey = getSortKeyForHeader(column.dataset.staffingHireColumn);
    const isActive = sortKey === marketState.sortKey;
    column.setAttribute("aria-sort", isActive
      ? marketState.sortDirection === "asc"
        ? "ascending"
        : "descending"
      : "none");
    column.classList.toggle("is-sorted", isActive);
  });

  positionActivePopover(host, activePopover);
}

function applyMarketState(host: HTMLElement, marketState: StaffingMarketState, activePopover: StaffingMarketPopoverKey): void {
  const marketShell = host.querySelector<HTMLElement>("[data-staffing-hire-market-shell]");
  const table = host.querySelector<HTMLTableElement>("[data-pilot-candidate-market-table] table");
  const emptyState = host.querySelector<HTMLElement>("[data-staffing-market-empty]");
  if (!marketShell || !table) {
    return;
  }

  syncMarketControls(host, marketState, activePopover);

  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("[data-pilot-candidate-row]"));
  const visibleRows = rows.filter((row) => {
    if (!matchesTextFilter(row.dataset.staffingCandidateName, marketState.pilotSearch)) {
      return false;
    }
    if (!matchesCertificationFilters(row, marketState.certificationFilters)) {
      return false;
    }
    if (!matchesRangeFilter(row.dataset.staffingCandidateHours, marketState.hoursMin, marketState.hoursMax)) {
      return false;
    }
    if (!matchesRangeFilter(row.dataset.staffingCandidateOperationalReliability, marketState.reliabilityMin, marketState.reliabilityMax)) {
      return false;
    }
    if (!matchesRangeFilter(row.dataset.staffingCandidateStressTolerance, marketState.stressMin, marketState.stressMax)) {
      return false;
    }
    if (!matchesRangeFilter(row.dataset.staffingCandidateProcedureDiscipline, marketState.procedureMin, marketState.procedureMax)) {
      return false;
    }
    if (!matchesRangeFilter(row.dataset.staffingCandidateTrainingAptitude, marketState.trainingMin, marketState.trainingMax)) {
      return false;
    }
    if (!matchesOptionalOfferRangeFilter(row.dataset.staffingCandidateDirectCost, marketState.directCostMin, marketState.directCostMax)) {
      return false;
    }
    if (!matchesOptionalOfferRangeFilter(row.dataset.staffingCandidateContractHourlyRate, marketState.contractHourlyMin, marketState.contractHourlyMax)) {
      return false;
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

function matchesTextFilter(value: string | undefined, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return (value ?? "").toLowerCase().includes(normalizedSearch);
}

function matchesRangeFilter(rawValue: string | undefined, minimum: string, maximum: string): boolean {
  const value = Number.parseFloat(rawValue ?? "");
  if (!Number.isFinite(value)) {
    return false;
  }

  const minValue = parseOptionalNumber(minimum);
  const maxValue = parseOptionalNumber(maximum);
  if (minValue !== null && value < minValue) {
    return false;
  }
  if (maxValue !== null && value > maxValue) {
    return false;
  }
  return true;
}

function matchesOptionalOfferRangeFilter(rawValue: string | undefined, minimum: string, maximum: string): boolean {
  const minValue = parseOptionalNumber(minimum);
  const maxValue = parseOptionalNumber(maximum);
  if (minValue === null && maxValue === null) {
    return true;
  }

  const value = Number.parseFloat(rawValue ?? "");
  if (!Number.isFinite(value)) {
    return false;
  }
  if (minValue !== null && value < minValue) {
    return false;
  }
  if (maxValue !== null && value > maxValue) {
    return false;
  }
  return true;
}

function matchesCertificationFilters(row: HTMLTableRowElement, certificationFilters: string[]): boolean {
  if (certificationFilters.length === 0) {
    return true;
  }

  const certifications = (row.dataset.staffingCandidateCertifications ?? "")
    .split("|")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return certificationFilters.every((entry) => certifications.includes(entry));
}

function compareCandidateRows(left: HTMLTableRowElement, right: HTMLTableRowElement, state: StaffingMarketState): number {
  switch (state.sortKey) {
    case "name": {
      const comparison = (left.dataset.staffingCandidateName ?? "").localeCompare(right.dataset.staffingCandidateName ?? "");
      if (comparison !== 0) {
        return state.sortDirection === "asc" ? comparison : -comparison;
      }
      break;
    }
    case "certifications": {
      const leftCount = Number.parseFloat(left.dataset.staffingCandidateCertCount ?? "0") || 0;
      const rightCount = Number.parseFloat(right.dataset.staffingCandidateCertCount ?? "0") || 0;
      if (leftCount !== rightCount) {
        return state.sortDirection === "asc" ? leftCount - rightCount : rightCount - leftCount;
      }
      const comparison = (left.dataset.staffingCandidateCertifications ?? "").localeCompare(right.dataset.staffingCandidateCertifications ?? "");
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
    case "operationalReliability":
    case "stressTolerance":
    case "procedureDiscipline":
    case "trainingAptitude": {
      const leftScore = Number.parseFloat(
        state.sortKey === "operationalReliability"
          ? left.dataset.staffingCandidateOperationalReliability ?? ""
          : state.sortKey === "stressTolerance"
            ? left.dataset.staffingCandidateStressTolerance ?? ""
            : state.sortKey === "procedureDiscipline"
              ? left.dataset.staffingCandidateProcedureDiscipline ?? ""
              : left.dataset.staffingCandidateTrainingAptitude ?? "",
      ) || 0;
      const rightScore = Number.parseFloat(
        state.sortKey === "operationalReliability"
          ? right.dataset.staffingCandidateOperationalReliability ?? ""
          : state.sortKey === "stressTolerance"
            ? right.dataset.staffingCandidateStressTolerance ?? ""
            : state.sortKey === "procedureDiscipline"
              ? right.dataset.staffingCandidateProcedureDiscipline ?? ""
              : right.dataset.staffingCandidateTrainingAptitude ?? "",
      ) || 0;
      if (leftScore !== rightScore) {
        return state.sortDirection === "asc" ? leftScore - rightScore : rightScore - leftScore;
      }
      break;
    }
    case "direct_cost":
    case "contract_cost": {
      const leftCost = Number.parseFloat(
        state.sortKey === "direct_cost"
          ? left.dataset.staffingCandidateDirectCost ?? ""
          : state.contractSortBasis === "hourly"
            ? left.dataset.staffingCandidateContractHourlyRate ?? ""
            : left.dataset.staffingCandidateContractCost ?? "",
      );
      const rightCost = Number.parseFloat(
        state.sortKey === "direct_cost"
          ? right.dataset.staffingCandidateDirectCost ?? ""
          : state.contractSortBasis === "hourly"
            ? right.dataset.staffingCandidateContractHourlyRate ?? ""
            : right.dataset.staffingCandidateContractCost ?? "",
      );
      const normalizedLeftCost = Number.isFinite(leftCost) ? leftCost : Number.POSITIVE_INFINITY;
      const normalizedRightCost = Number.isFinite(rightCost) ? rightCost : Number.POSITIVE_INFINITY;
      const leftAvailable = Number.isFinite(leftCost);
      const rightAvailable = Number.isFinite(rightCost);
      if (leftAvailable !== rightAvailable) {
        return leftAvailable ? -1 : 1;
      }
      if (normalizedLeftCost !== normalizedRightCost) {
        return state.sortDirection === "asc"
          ? normalizedLeftCost - normalizedRightCost
          : normalizedRightCost - normalizedLeftCost;
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
