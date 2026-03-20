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
  host.addEventListener("keydown", handleKeydown);
  host.addEventListener("scroll", handleScroll, true);
  render();
  restoreScrollRegions();

  return {
    destroy(): void {
      persistScrollRegions();
      host.removeEventListener("click", handleClick);
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
