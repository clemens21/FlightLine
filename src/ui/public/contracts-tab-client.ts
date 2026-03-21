/*
 * Browser controller for the contracts tab inside the save shell.
 * It owns filter state, workspace tabs, board tabs, planner actions, map focus, and the client-side refresh loop for contracts data.
 * The browser here is intentionally rich because the contracts board behaves more like a workstation than a form page:
 * selection, filtering, map context, and in-place acceptance all stay client-side for responsiveness.
 */

import type {
  ContractsViewAcceptedContract,
  ContractsRoutePlanItem,
  ContractsViewAirport,
  ContractsViewCompanyContract,
  ContractsViewOffer,
  ContractsViewPayload,
} from "../contracts-view-model.js";
import type { NotificationLevel, ShellSummaryPayload } from "../save-shell-model.js";

interface FilterState {
  searchText: string;
  originCode: string;
  destinationCode: string;
  volumeType: string;
  fitBucket: string;
  payoutMin: string;
  payoutMax: string;
  passengerCountMin: string;
  passengerCountMax: string;
  cargoWeightMin: string;
  cargoWeightMax: string;
}

interface MapState {
  zoom: number;
  centerLongitudeNorm: number;
  centerLatitudeNorm: number;
}

interface AppliedTextFilters {
  searchText: string;
  originCode: string;
  destinationCode: string;
}

interface PlannerReviewState {
  isOpen: boolean;
  selectedRoutePlanItemIds: string[];
}

interface ContractsUiState {
  payload: ContractsViewPayload;
  filters: FilterState;
  appliedTextFilters: AppliedTextFilters;
  plannerReview: PlannerReviewState;
  workspaceTab: ContractsWorkspaceTab;
  boardTab: ContractsBoardTab;
  sortField: SortField | null;
  sortDirection: SortDirection;
  selectedOfferId: string | null;
  selectedCompanyContractId: string | null;
  acceptanceNextStepTab: ContractsWorkspaceTab | null;
  message: { tone: "notice" | "error"; text: string; notificationLevel?: NotificationLevel | undefined } | null;
  map: MapState;
}

interface FocusState {
  controlName: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

type ContractsBoardTab = "available" | "active" | "closed";
type ContractsWorkspaceTab = "board" | "planning";
type SortField = "distanceNm" | "hoursRemaining";
type SortDirection = "asc" | "desc";
type RouteLike = ContractsViewOffer | ContractsViewCompanyContract;

interface SelectedRoute {
  kind: "offer" | "company_contract";
  route: RouteLike;
}

export interface MountContractsTabOptions {
  viewUrl: string;
  acceptUrl: string;
  cancelUrl: string;
  plannerAddUrl: string;
  plannerRemoveUrl: string;
  plannerReorderUrl: string;
  plannerClearUrl: string;
  plannerAcceptUrl: string;
  onShellUpdate?: (shell: ShellSummaryPayload) => void;
  onMessage?: (message: { tone: "notice" | "error"; text: string; notificationLevel?: NotificationLevel | undefined } | null) => void;
}

export interface ContractsTabController {
  destroy(): void;
  syncCurrentTime(nextCurrentTimeUtc: string): Promise<void>;
}

const mapViewWidthPx = 1000;
const mapViewHeightPx = 560;
const mapTileSizePx = 256;
const minMapZoom = 1;
const maxMapZoom = 6;
const mapPaddingPx = 96;
const openStreetMapTileUrl = "https://tile.openstreetmap.org";
const debouncedTextFilterNames = new Set(["searchText", "originCode", "destinationCode"]);
const textFilterDebounceMs = 300;
const defaultMapState: MapState = {
  zoom: 2,
  centerLongitudeNorm: 0.5,
  centerLatitudeNorm: 0.36,
};
const activeContractStates = new Set(["accepted", "assigned", "active"]);
const closedContractStates = new Set(["completed", "late_completed", "failed", "cancelled"]);

export function resolveCompanyContractBadgeState(
  contract: ContractsViewCompanyContract,
  boardTab: ContractsBoardTab,
): string {
  if (boardTab === "closed" && closedContractStates.has(contract.contractState)) {
    return contract.contractState;
  }

  return contract.routePlanItemStatus ?? contract.contractState;
}

export function resolveContractsWorkspaceTabLabel(tab: ContractsWorkspaceTab): string {
  return tab === "planning" ? "Route Planning" : "Contract Board";
}

// Mounting wraps the entire contracts surface in one event-delegated controller because the tab rerenders wholesale after most interactions.
export function mountContractsTab(
  root: HTMLElement,
  initialPayload: ContractsViewPayload | null,
  options: MountContractsTabOptions,
): ContractsTabController {
  if (!initialPayload) {
    root.innerHTML = `<section class="panel"><div class="panel-body"><div class="empty-state">The contracts board becomes available after the company exists and the market can be generated.</div></div></section>`;
    return {
      async syncCurrentTime() {
        return;
      },
      destroy() {
        root.replaceChildren();
      },
    };
  }

  const state: ContractsUiState = {
    payload: initialPayload,
    filters: {
      searchText: "",
      originCode: "",
      destinationCode: "",
      volumeType: "all",
      fitBucket: "all",
      payoutMin: "",
      payoutMax: "",
      passengerCountMin: "",
      passengerCountMax: "",
      cargoWeightMin: "",
      cargoWeightMax: "",
    },
    appliedTextFilters: {
      searchText: "",
      originCode: "",
      destinationCode: "",
    },
    plannerReview: {
      isOpen: false,
      selectedRoutePlanItemIds: [],
    },
    workspaceTab: "board",
    boardTab: "available",
    sortField: null,
    sortDirection: "asc",
    selectedOfferId: selectDefaultOfferId(initialPayload),
    selectedCompanyContractId: selectDefaultCompanyContractId(initialPayload, "active"),
    acceptanceNextStepTab: null,
    message: null,
    map: { ...defaultMapState },
  };

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let textFilterDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

  focusSelectedRoute(state);
  render();

  // Click actions cover board navigation, planner mutations, acceptance or cancellation, and selection changes.
  const handleClick = (event: Event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }

    const workspaceTabButton = target.closest<HTMLElement>("[data-workspace-tab]");
    if (workspaceTabButton) {
      const nextTab = workspaceTabButton.dataset.workspaceTab as ContractsWorkspaceTab | undefined;
      if (nextTab) {
        state.workspaceTab = nextTab;
        if (nextTab === "planning") {
          state.acceptanceNextStepTab = null;
        }
        if (nextTab === "board") {
          focusSelectedRoute(state);
        }
        render();
      }
      return;
    }

    const boardTabButton = target.closest<HTMLElement>("[data-board-tab]");
    if (boardTabButton) {
      const nextTab = boardTabButton.dataset.boardTab as ContractsBoardTab | undefined;
      if (nextTab) {
        state.boardTab = nextTab;
        if (nextTab !== "available") {
          state.acceptanceNextStepTab = null;
        }
        ensureActiveTabSelection(state);
        focusSelectedRoute(state);
        render();
      }
      return;
    }

    const sortButton = target.closest<HTMLElement>("[data-sort-field]");
    if (sortButton) {
      const nextField = sortButton.dataset.sortField as SortField | undefined;
      if (nextField) {
        if (state.sortField === nextField) {
          state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
        } else {
          state.sortField = nextField;
          state.sortDirection = "asc";
        }
        render();
      }
      return;
    }

    const reviewOpenButton = target.closest<HTMLButtonElement>("[data-plan-review-open]");
    if (reviewOpenButton) {
      event.preventDefault();
      event.stopPropagation();
      openPlannerReview(state);
      render();
      return;
    }

    const reviewCloseButton = target.closest<HTMLButtonElement>("[data-plan-review-close]");
    if (reviewCloseButton) {
      event.preventDefault();
      event.stopPropagation();
      closePlannerReview(state);
      render();
      return;
    }

    const acceptPlannedButton = target.closest<HTMLButtonElement>("[data-plan-accept-selected]");
    if (acceptPlannedButton) {
      event.preventDefault();
      event.stopPropagation();
      const selectedRoutePlanItemIds = state.plannerReview.selectedRoutePlanItemIds;
      if (selectedRoutePlanItemIds.length > 0) {
        const params = new URLSearchParams();
        for (const routePlanItemId of selectedRoutePlanItemIds) {
          params.append("routePlanItemId", routePlanItemId);
        }
        void plannerAction(
          options.plannerAcceptUrl,
          params,
          acceptPlannedButton,
          "Accepting...",
        );
      }
      return;
    }

    const addContractButton = target.closest<HTMLButtonElement>("[data-plan-add-contract]");
    if (addContractButton) {
      event.preventDefault();
      event.stopPropagation();
      const sourceId = addContractButton.dataset.planAddContract ?? "";
      void plannerAction(
        options.plannerAddUrl,
        new URLSearchParams({ sourceType: "accepted_contract", sourceId }),
        addContractButton,
        "Sending...",
      );
      return;
    }
    const removePlanButton = target.closest<HTMLButtonElement>("[data-plan-remove-item]");
    if (removePlanButton) {
      event.preventDefault();
      event.stopPropagation();
      const routePlanItemId = removePlanButton.dataset.planRemoveItem ?? "";
      void plannerAction(
        options.plannerRemoveUrl,
        new URLSearchParams({ routePlanItemId }),
        removePlanButton,
        "Removing...",
      );
      return;
    }
    const movePlanButton = target.closest<HTMLButtonElement>("[data-plan-move-item]");
    if (movePlanButton) {
      event.preventDefault();
      event.stopPropagation();
      const routePlanItemId = movePlanButton.dataset.planMoveItem ?? "";
      const direction = movePlanButton.dataset.planMoveDirection === "down" ? "down" : "up";
      void plannerAction(
        options.plannerReorderUrl,
        new URLSearchParams({ routePlanItemId, direction }),
        movePlanButton,
        "Moving...",
      );
      return;
    }
    const clearPlanButton = target.closest<HTMLButtonElement>("[data-plan-clear]");
    if (clearPlanButton) {
      event.preventDefault();
      event.stopPropagation();
      void plannerAction(
        options.plannerClearUrl,
        new URLSearchParams(),
        clearPlanButton,
        "Clearing...",
      );
      return;
    }
    const acceptButton = target.closest<HTMLButtonElement>("[data-accept-offer]");
    if (acceptButton) {
      event.preventDefault();
      const contractOfferId = acceptButton.dataset.acceptOffer ?? "";
      void acceptOffer(contractOfferId, acceptButton);
      return;
    }

    const cancelButton = target.closest<HTMLButtonElement>("[data-cancel-contract]");
    if (cancelButton) {
      event.preventDefault();
      event.stopPropagation();
      const companyContractId = cancelButton.dataset.cancelContract ?? "";
      void cancelContract(companyContractId, cancelButton);
      return;
    }

    const offerRow = target.closest<HTMLElement>("[data-select-offer-row]");
    if (offerRow) {
      state.boardTab = "available";
      state.selectedOfferId = offerRow.dataset.selectOfferRow ?? null;
      focusSelectedRoute(state);
      render();
      return;
    }

    const companyContractRow = target.closest<HTMLElement>("[data-select-company-contract-row]");
    if (companyContractRow) {
      state.boardTab = (companyContractRow.dataset.contractBoardTab as ContractsBoardTab | undefined) ?? state.boardTab;
      state.selectedCompanyContractId = companyContractRow.dataset.selectCompanyContractRow ?? null;
      focusSelectedRoute(state);
      render();
      return;
    }

    const selectedDestinationButton = target.closest<HTMLButtonElement>("[data-use-selected-destination]");
    if (selectedDestinationButton) {
      event.preventDefault();
      const selectedRoute = resolveSelectedRoute(state, getFilteredOffers(state), getFilteredCompanyContracts(state));
      const destinationCode = selectedRoute?.route.destination.code ?? "";
      state.filters = {
        ...state.filters,
        originCode: destinationCode,
      };
      state.appliedTextFilters = {
        ...state.appliedTextFilters,
        originCode: destinationCode,
      };
      ensureActiveTabSelection(state);
      render();
      return;
    }

    const resetButton = target.closest<HTMLElement>("[data-map-reset]");
    if (resetButton) {
      focusSelectedRoute(state);
      render();
    }
  };

  // Filter changes stay client-side; text fields debounce so typing does not constantly reset the user's selection.
  const handleFilterChange = (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement | null;
    if (!target) {
      return;
    }

    const plannerReviewSelectId = target.dataset.planReviewSelect;
    if (plannerReviewSelectId && target instanceof HTMLInputElement) {
      togglePlannerReviewSelection(state, plannerReviewSelectId, target.checked);
      render();
      return;
    }

    if (!target.name) {
      return;
    }

    if (!Object.hasOwn(state.filters, target.name)) {
      return;
    }

    const nextValue = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
    state.filters = {
      ...state.filters,
      [target.name]: nextValue,
    };

    if (debouncedTextFilterNames.has(target.name)) {
      const focusState = captureFocusState(root);
      render(focusState);

      if (textFilterDebounceTimeout) {
        clearTimeout(textFilterDebounceTimeout);
      }

      textFilterDebounceTimeout = setTimeout(() => {
        textFilterDebounceTimeout = null;
        state.appliedTextFilters = {
          searchText: state.filters.searchText,
          originCode: state.filters.originCode,
          destinationCode: state.filters.destinationCode,
        };
        ensureActiveTabSelection(state);
        render(captureFocusState(root));
      }, textFilterDebounceMs);
      return;
    }

    ensureActiveTabSelection(state);
    render(captureFocusState(root));
  };

  const handleWheel = (event: WheelEvent) => {
    const svg = resolveContractsMapSvg(event.target);
    if (!svg) {
      return;
    }

    event.preventDefault();
    const nextZoom = clamp(state.map.zoom + (event.deltaY < 0 ? 1 : -1), minMapZoom, maxMapZoom);
    if (nextZoom === state.map.zoom) {
      return;
    }

    state.map = {
      ...state.map,
      zoom: nextZoom,
    };
    renderMap(root, state, resolveSelectedRoute(state, getFilteredOffers(state), getFilteredCompanyContracts(state)));
  };

  const handlePointerDown = (event: PointerEvent) => {
    const svg = resolveContractsMapSvg(event.target);
    if (!svg) {
      return;
    }

    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    svg.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!dragging) {
      return;
    }

    const worldSizePx = mapTileSizePx * 2 ** state.map.zoom;
    state.map = {
      ...state.map,
      centerLongitudeNorm: wrapUnitInterval(state.map.centerLongitudeNorm - (event.clientX - lastX) / worldSizePx),
      centerLatitudeNorm: clamp(state.map.centerLatitudeNorm - (event.clientY - lastY) / worldSizePx, 0.02, 0.98),
    };
    lastX = event.clientX;
    lastY = event.clientY;
    renderMap(root, state, resolveSelectedRoute(state, getFilteredOffers(state), getFilteredCompanyContracts(state)));
  };

  const handlePointerUp = (event: PointerEvent) => {
    const svg = resolveContractsMapSvg(event.target);
    dragging = false;
    if (svg?.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerCancel = () => {
    dragging = false;
  };

  root.addEventListener("click", handleClick);
  root.addEventListener("input", handleFilterChange);
  root.addEventListener("change", handleFilterChange);
  root.addEventListener("wheel", handleWheel, { passive: false });
  root.addEventListener("pointerdown", handlePointerDown);
  root.addEventListener("pointermove", handlePointerMove);
  root.addEventListener("pointerup", handlePointerUp);
  root.addEventListener("pointercancel", handlePointerCancel);

  // Server refreshes are reserved for board expiry or planner mutations; ordinary filtering and sorting stay entirely local.
  async function refreshContractsView(): Promise<void> {
    if (!options.viewUrl) {
      return;
    }

    const response = await fetch(options.viewUrl);
    const result = await response.json() as { payload?: ContractsViewPayload; error?: string };
    if (!response.ok || !result.payload) {
      throw new Error(result.error ?? "Could not refresh the contracts view.");
    }

    state.payload = result.payload;
    ensureActiveTabSelection(state);
    focusSelectedRoute(state);
    render();
  }

  return {
    async syncCurrentTime(nextCurrentTimeUtc: string) {
      if (state.payload.currentTimeUtc === nextCurrentTimeUtc) {
        return;
      }

      state.payload = {
        ...state.payload,
        currentTimeUtc: nextCurrentTimeUtc,
      };

      if (Date.parse(nextCurrentTimeUtc) >= Date.parse(state.payload.board.expiresAtUtc)) {
        await refreshContractsView();
        return;
      }

      ensureActiveTabSelection(state);
      render();
    },
    destroy() {
      if (textFilterDebounceTimeout) {
        clearTimeout(textFilterDebounceTimeout);
        textFilterDebounceTimeout = null;
      }
      root.removeEventListener("click", handleClick);
      root.removeEventListener("input", handleFilterChange);
      root.removeEventListener("change", handleFilterChange);
      root.removeEventListener("wheel", handleWheel);
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerup", handlePointerUp);
      root.removeEventListener("pointercancel", handlePointerCancel);
      root.replaceChildren();
    },
  };
  async function acceptOffer(contractOfferId: string, button: HTMLButtonElement): Promise<void> {
    if (!contractOfferId || !options.acceptUrl) {
      return;
    }

    const originalLabel = button.textContent ?? "Accept";
    button.disabled = true;
    button.textContent = "Accepting...";

    try {
      const response = await fetch(options.acceptUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({ contractOfferId }),
      });
      const result = await response.json() as {
        success: boolean;
        message?: string;
        payload?: ContractsViewPayload;
        shell?: ShellSummaryPayload;
        error?: string;
        notificationLevel?: NotificationLevel;
      };

      if (!response.ok || !result.success || !result.payload || !result.shell) {
        state.message = {
          tone: "error",
          text: result.error ?? result.message ?? "Could not accept the selected contract.",
        };
        options.onMessage?.(state.message);
        render();
        return;
      }

      state.payload = result.payload;
      closePlannerReview(state);
      state.message = {
        tone: "notice",
        text: result.message ?? "Contract accepted.",
        notificationLevel: result.notificationLevel,
      };
      state.acceptanceNextStepTab = "planning";

      if (!getFilteredOffers(state).some((offer) => offer.contractOfferId === state.selectedOfferId)) {
        state.selectedOfferId = selectDefaultOfferId(state.payload);
      }

      if (!state.payload.companyContracts.some((contract) => contract.companyContractId === state.selectedCompanyContractId)) {
        state.selectedCompanyContractId = selectDefaultCompanyContractId(state.payload, state.boardTab);
      }

      ensureActiveTabSelection(state);
      focusSelectedRoute(state);
      options.onShellUpdate?.(result.shell);
      options.onMessage?.(state.message);
      render();
    } catch (error) {
      state.message = {
        tone: "error",
        text: error instanceof Error ? error.message : "Could not accept the selected contract.",
      };
      options.onMessage?.(state.message);
      render();
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async function cancelContract(companyContractId: string, button: HTMLButtonElement): Promise<void> {
    if (!companyContractId || !options.cancelUrl) {
      return;
    }

    const originalLabel = button.textContent ?? "Cancel";
    button.disabled = true;
    button.textContent = "Cancelling...";

    try {
      const response = await fetch(options.cancelUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({ companyContractId }),
      });
      const result = await response.json() as {
        success: boolean;
        message?: string;
        payload?: ContractsViewPayload;
        shell?: ShellSummaryPayload;
        error?: string;
        notificationLevel?: NotificationLevel;
      };

      if (!response.ok || !result.success || !result.payload || !result.shell) {
        state.message = {
          tone: "error",
          text: result.error ?? result.message ?? "Could not cancel the selected contract.",
        };
        options.onMessage?.(state.message);
        render();
        return;
      }

      state.payload = result.payload;
      state.message = {
        tone: "notice",
        text: result.message ?? "Contract cancelled.",
        notificationLevel: result.notificationLevel,
      };

      ensureActiveTabSelection(state);
      focusSelectedRoute(state);
      options.onShellUpdate?.(result.shell);
      options.onMessage?.(state.message);
      render();
    } catch (error) {
      state.message = {
        tone: "error",
        text: error instanceof Error ? error.message : "Could not cancel the selected contract.",
      };
      options.onMessage?.(state.message);
      render();
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async function plannerAction(
    url: string,
    body: URLSearchParams,
    button: HTMLButtonElement,
    pendingLabel: string,
  ): Promise<void> {
    if (!url) {
      return;
    }

    const originalLabel = button.textContent ?? "Update";
    button.disabled = true;
    button.textContent = pendingLabel;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
      });
      const result = await response.json() as {
        success: boolean;
        message?: string;
        payload?: ContractsViewPayload;
        shell?: ShellSummaryPayload;
        error?: string;
        notificationLevel?: NotificationLevel;
      };

      if (!response.ok || !result.success || !result.payload || !result.shell) {
        state.message = {
          tone: "error",
          text: result.error ?? result.message ?? "Could not update the route plan.",
        };
        options.onMessage?.(state.message);
        render();
        return;
      }

      state.payload = result.payload;
      closePlannerReview(state);
      state.message = {
        tone: "notice",
        text: result.message ?? "Route plan updated.",
        notificationLevel: result.notificationLevel,
      };
      state.acceptanceNextStepTab = null;
      ensureActiveTabSelection(state);
      focusSelectedRoute(state);
      options.onShellUpdate?.(result.shell);
      options.onMessage?.(state.message);
      render();
    } catch (error) {
      state.message = {
        tone: "error",
        text: error instanceof Error ? error.message : "Could not update the route plan.",
      };
      options.onMessage?.(state.message);
      render();
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  function render(focusState: FocusState | null = null): void {
    const filteredOffers = getFilteredOffers(state);
    const filteredCompanyContracts = getFilteredCompanyContracts(state);
    const sortedOffers = sortOffers(filteredOffers, state);
    const sortedCompanyContracts = sortCompanyContracts(filteredCompanyContracts, state.payload.currentTimeUtc, state);
    ensureActiveTabSelection(state, sortedOffers, sortedCompanyContracts);
    const selectedRoute = resolveSelectedRoute(state, sortedOffers, sortedCompanyContracts);
    const availableCount = state.payload.offers.filter((offer) => offer.offerStatus === "available").length;
    const activeCount = getActiveContracts(state.payload).length;
    const closedCount = getClosedContracts(state.payload).length;
    const routePlanCount = state.payload.routePlan?.items.length ?? 0;
    const selectedLabel = selectedRoute
      ? `${selectedRoute.route.origin.code} -> ${selectedRoute.route.destination.code}`
      : "Select a row to focus the route map.";
    const toolbarHeadline = state.workspaceTab === "planning"
      ? `${formatNumber(routePlanCount)} route plan item${routePlanCount === 1 ? "" : "s"}`
      : renderHeadline(state.boardTab, availableCount, activeCount, closedCount);
    const toolbarSubtitle = state.workspaceTab === "planning"
      ? `Route plan endpoint ${escapeHtml(state.payload.plannerEndpointAirportId ?? "-")} | ${escapeHtml(formatDate(state.payload.currentTimeUtc))} company time`
      : `Board expires ${escapeHtml(formatDate(state.payload.board.expiresAtUtc))} | ${escapeHtml(formatDate(state.payload.currentTimeUtc))} company time`;

    const boardWorkspaceHtml = `
      <div class="contracts-grid">
        <section class="panel contracts-main-panel">
          <div class="panel-head contracts-main-head">
            <div>
              <h3>Contract Board</h3>
              <span class="muted">Browse the market, then switch views to review accepted work and closed jobs.</span>
            </div>
            <div class="contracts-board-tabs" role="tablist" aria-label="Contract board views">
              ${renderBoardTab("available", "Available", availableCount, state.boardTab)}
              ${renderBoardTab("active", "Accepted / Active", activeCount, state.boardTab)}
              ${renderBoardTab("closed", "Closed", closedCount, state.boardTab)}
            </div>
          </div>
          <div class="panel-body contracts-main-body">
            <section class="contracts-filters">
              <label>Search
                <input name="searchText" value="${escapeHtml(state.filters.searchText)}" placeholder="Airport, city, or route code" />
              </label>
              <label>Departure airport
                <input name="originCode" value="${escapeHtml(state.filters.originCode)}" placeholder="Type code or airport" />
              </label>
              ${selectedRoute
                ? `<div class="filter-shortcut"><span class="muted">Selected destination: ${escapeHtml(selectedRoute.route.destination.code)}</span><button type="button" class="button-secondary" data-use-selected-destination>Use as departure filter</button></div>`
                : `<div class="filter-shortcut"><span class="muted">Select a contract row to use its destination as the next departure filter.</span></div>`}
              <label>Destination airport
                <input name="destinationCode" value="${escapeHtml(state.filters.destinationCode)}" placeholder="Type code or airport" />
              </label>
              <label>Payload Type
                <select name="volumeType">
                  <option value="all">All</option>
                  <option value="passenger" ${state.filters.volumeType === "passenger" ? "selected" : ""}>Passenger</option>
                  <option value="cargo" ${state.filters.volumeType === "cargo" ? "selected" : ""}>Cargo</option>
                </select>
              </label>
              ${state.boardTab === "available"
                ? `<label>Fit
                  <select name="fitBucket">
                    <option value="all">All</option>
                    <option value="flyable_now" ${state.filters.fitBucket === "flyable_now" ? "selected" : ""}>Flyable now</option>
                    <option value="flyable_with_reposition" ${state.filters.fitBucket === "flyable_with_reposition" ? "selected" : ""}>Needs reposition</option>
                    <option value="stretch_growth" ${state.filters.fitBucket === "stretch_growth" ? "selected" : ""}>Stretch growth</option>
                    <option value="blocked_now" ${state.filters.fitBucket === "blocked_now" ? "selected" : ""}>Blocked now</option>
                  </select>
                </label>`
                : `<div class="contracts-filter-placeholder"><div class="eyebrow">View</div><strong>${escapeHtml(renderTabDescription(state.boardTab))}</strong></div>`}
              <div class="range-field">
                <span>Payout</span>
                <div class="range-inputs">
                  <input name="payoutMin" type="number" min="0" value="${escapeHtml(state.filters.payoutMin)}" placeholder="Min" />
                  <input name="payoutMax" type="number" min="0" value="${escapeHtml(state.filters.payoutMax)}" placeholder="Max" />
                </div>
              </div>
              <div class="range-field">
                <span>Passengers</span>
                <div class="range-inputs">
                  <input name="passengerCountMin" type="number" min="0" value="${escapeHtml(state.filters.passengerCountMin)}" placeholder="Min" />
                  <input name="passengerCountMax" type="number" min="0" value="${escapeHtml(state.filters.passengerCountMax)}" placeholder="Max" />
                </div>
              </div>
              <div class="range-field">
                <span>Cargo (lb)</span>
                <div class="range-inputs">
                  <input name="cargoWeightMin" type="number" min="0" value="${escapeHtml(state.filters.cargoWeightMin)}" placeholder="Min" />
                  <input name="cargoWeightMax" type="number" min="0" value="${escapeHtml(state.filters.cargoWeightMax)}" placeholder="Max" />
                </div>
              </div>
            </section>

            ${state.acceptanceNextStepTab === "planning" && state.message?.tone === "notice"
              ? `<div class="panel-inline-callout contracts-next-step"><div><strong>${escapeHtml(state.message.text)}</strong><div class="muted">Use Accepted / Active to inspect the newly accepted work, or switch to Route Planning to stage the next step.</div></div><div class="pill-row"><button type="button" class="button-secondary" data-board-tab="active">View Accepted / Active</button><button type="button" class="button-secondary" data-workspace-tab="planning">Open Route Planning</button></div></div>`
              : ""}

            <div class="contracts-board-wrap">
              ${state.boardTab === "available"
                ? renderOffersTable(sortedOffers, state.selectedOfferId, state)
                : renderCompanyContractsTable(sortedCompanyContracts, state.selectedCompanyContractId, state.payload.currentTimeUtc, state.boardTab, state)}
            </div>
          </div>
        </section>
        <div class="contracts-side-column">
          <section class="panel contracts-map-panel">
            <div class="panel-head">
              <div>
                <h3>Route Map</h3>
                <span class="muted">${escapeHtml(selectedLabel)}</span>
              </div>
              <button type="button" class="button-secondary" data-map-reset>Refocus</button>
            </div>
            <div class="panel-body contracts-map-body">
              <svg class="contracts-map" data-contracts-map viewBox="0 0 1000 560" role="img" aria-label="Selected contract route map"></svg>
              <div class="map-attribution">Base map data from OpenStreetMap contributors. Aviation chart overlays can come later.</div>
            </div>
          </section>
        </div>
      </div>
    `;

    const planningWorkspaceHtml = `
      <section class="panel contracts-planner-panel contracts-planning-panel">
        <div class="panel-head">
          <div>
            <h3>Route Planning</h3>
            <span class="muted">${escapeHtml(renderPlannerHeadline(state.payload))}</span>
          </div>
          <div class="planner-panel-actions">
            ${state.payload.routePlan?.items.length
              ? `${state.plannerReview.isOpen ? "" : `<button type="button" class="button-secondary" data-plan-review-open>Review & accept planned offers</button>`}<button type="button" class="button-secondary" data-plan-clear>Clear plan</button>`
              : ""}
          </div>
        </div>
        <div class="panel-body contracts-planner-body">
          ${renderPlannerPanel(state.payload.routePlan, state.plannerReview)}
        </div>
      </section>
    `;

    root.innerHTML = `
      <div class="contracts-app-shell">
        <div class="contracts-toolbar">
          <div>
            <div class="eyebrow">Contracts Network</div>
            <strong>${escapeHtml(toolbarHeadline)}</strong>
            <span class="muted">${toolbarSubtitle}</span>
          </div>
          <div class="pill-row">
            <span class="pill">${escapeHtml(String(availableCount + activeCount + closedCount))} visible</span>
            <span class="pill">${escapeHtml(String(availableCount))} open market</span>
            <span class="pill">${escapeHtml(String(activeCount))} accepted / active</span>
            <span class="pill">${escapeHtml(String(closedCount))} closed</span>
            <span class="pill">${escapeHtml(String(routePlanCount))} route plan</span>
          </div>
        </div>
        <div class="contracts-workspace-tabs" role="tablist" aria-label="Contracts workspace">
          ${renderWorkspaceTab("board", resolveContractsWorkspaceTabLabel("board"), state.workspaceTab)}
          ${renderWorkspaceTab("planning", `${resolveContractsWorkspaceTabLabel("planning")} ${routePlanCount > 0 ? `(${routePlanCount})` : ""}`.trim(), state.workspaceTab)}
        </div>
        ${state.workspaceTab === "board" ? boardWorkspaceHtml : planningWorkspaceHtml}
      </div>
    `;

    if (state.workspaceTab === "board") {
      renderMap(root, state, selectedRoute);
    }
    restoreFocusState(root, focusState);
  }
}

// Focus bookkeeping preserves text inputs across full rerenders of the tab body.
function captureFocusState(root: HTMLElement): FocusState | null {
  const activeElement = document.activeElement;

  if (
    !(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLSelectElement)
    || !root.contains(activeElement)
    || !activeElement.name
  ) {
    return null;
  }

  return {
    controlName: activeElement.name,
    selectionStart: activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
      ? activeElement.selectionStart
      : null,
    selectionEnd: activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
      ? activeElement.selectionEnd
      : null,
  };
}

function restoreFocusState(root: HTMLElement, focusState: FocusState | null): void {
  if (!focusState) {
    return;
  }

  const nextControl = Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[name]")).find((control) => control.name === focusState.controlName);

  if (!nextControl) {
    return;
  }

  nextControl.focus();

  if (
    (nextControl instanceof HTMLInputElement || nextControl instanceof HTMLTextAreaElement)
    && focusState.selectionStart !== null
    && focusState.selectionEnd !== null
  ) {
    nextControl.setSelectionRange(focusState.selectionStart, focusState.selectionEnd);
  }
}

// Rendering helpers below turn the current UI state into tables, planner cards, and selected-route callouts.
function renderBoardTab(tabId: ContractsBoardTab, label: string, count: number, activeTab: ContractsBoardTab): string {
  return `<button type="button" class="contracts-board-tab ${activeTab === tabId ? "current" : ""}" data-board-tab="${tabId}" role="tab" aria-selected="${activeTab === tabId ? "true" : "false"}"><span>${escapeHtml(label)}</span><span class="contracts-board-tab-count">${escapeHtml(String(count))}</span></button>`;
}

function renderWorkspaceTab(tabId: ContractsWorkspaceTab, label: string, activeTab: ContractsWorkspaceTab): string {
  return `<button type="button" class="contracts-workspace-tab ${activeTab === tabId ? "current" : ""}" data-workspace-tab="${tabId}" role="tab" aria-selected="${activeTab === tabId ? "true" : "false"}"><span>${escapeHtml(label)}</span></button>`;
}

function renderOffersTable(offers: ContractsViewOffer[], selectedOfferId: string | null, state: ContractsUiState): string {
  if (offers.length === 0) {
    return `<div class="empty-state">No available contracts match the current filters.</div>`;
  }

  return `
    <table class="contracts-board-table">
      <thead>
        <tr>
          <th>Route</th>
          <th>Fit</th>
          <th>Payload</th>
          <th class="sortable">${renderSortButton("distanceNm", "Distance", state)}</th>
          <th class="sortable">${renderSortButton("hoursRemaining", "Hours Left", state)}</th>
          <th>Due</th>
          <th>Payout</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${offers.map((offer) => renderOfferRow(offer, selectedOfferId === offer.contractOfferId)).join("")}
      </tbody>
    </table>
  `;
}

function renderCompanyContractsTable(
  contracts: ContractsViewCompanyContract[],
  selectedCompanyContractId: string | null,
  currentTimeUtc: string,
  boardTab: ContractsBoardTab,
  state: ContractsUiState,
): string {
  if (contracts.length === 0) {
    return `<div class="empty-state">No ${boardTab === "active" ? "accepted or active" : "closed"} contracts match the current filters.</div>`;
  }

  return `
    <table class="contracts-board-table">
      <thead>
        <tr>
          <th>Route</th>
          <th>State</th>
          <th>Payload</th>
          <th class="sortable">${renderSortButton("distanceNm", "Distance", state)}</th>
          <th class="sortable">${renderSortButton("hoursRemaining", "Hours Left", state)}</th>
          <th>Due</th>
          <th>Payout</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${contracts.map((contract) => renderCompanyContractRow(contract, selectedCompanyContractId === contract.companyContractId, currentTimeUtc, boardTab)).join("")}
      </tbody>
    </table>
  `;
}

function renderCompanyContractRow(
  contract: ContractsViewCompanyContract,
  isSelected: boolean,
  currentTimeUtc: string,
  boardTab: ContractsBoardTab,
): string {
  const remainingHours = routeHoursRemaining(contract, currentTimeUtc);
  const sendPlanHtml = boardTab === "active"
    ? contract.routePlanItemId
      ? `<button type="button" class="button-secondary" disabled>Planned</button>`
      : `<button type="button" class="button-secondary" data-plan-add-contract="${escapeHtml(contract.companyContractId)}">Send to route plan</button>`
    : "";
  const cancelHtml = boardTab === "active" && contract.contractState === "accepted"
    ? `<button type="button" class="button-secondary" data-cancel-contract="${escapeHtml(contract.companyContractId)}">Cancel (${escapeHtml(formatMoney(contract.cancellationPenaltyAmount))})</button>`
    : "";
  const actionsHtml = [sendPlanHtml, cancelHtml].filter(Boolean).join("");

  return `
    <tr class="contract-row ${isSelected ? "selected" : ""}" data-select-company-contract-row="${escapeHtml(contract.companyContractId)}" data-contract-board-tab="${escapeHtml(boardTab)}">
      <td>
        ${renderRouteColumn(contract.origin, contract.destination)}
      </td>
      <td>
        <div class="meta-stack">
          ${renderBadge(resolveCompanyContractBadgeState(contract, boardTab))}
          <span class="muted">${escapeHtml(contract.archetype.replaceAll("_", " "))}</span>
        </div>
      </td>
      <td>${escapeHtml(formatPayload(contract))}</td>
      <td>${escapeHtml(formatDistance(routeDistanceNm(contract)))}</td>
      <td>${escapeHtml(formatHoursLeft(remainingHours))}</td>
      <td>${escapeHtml(formatDate(contract.deadlineUtc))}</td>
      <td>${escapeHtml(formatMoney(contract.payoutAmount))}</td>
      <td>${actionsHtml ? `<div class="contract-row-actions">${actionsHtml}</div>` : ``}</td>
    </tr>
  `;
}

function renderOfferRow(offer: ContractsViewOffer, isSelected: boolean): string {
  return `
    <tr class="contract-row ${isSelected ? "selected" : ""} ${offer.matchesPlannerEndpoint ? "matches-endpoint" : ""}" data-select-offer-row="${escapeHtml(offer.contractOfferId)}">
      <td>
        ${renderRouteColumn(offer.origin, offer.destination)}
      </td>
      <td>
        <div class="meta-stack">
          ${renderBadge(offer.fitBucket ?? offer.offerStatus)}
          <span class="muted">${escapeHtml(offer.likelyRole.replaceAll("_", " "))} | ${escapeHtml(offer.difficultyBand)}</span>
        </div>
      </td>
      <td>${escapeHtml(formatPayload(offer))}</td>
      <td>${escapeHtml(formatDistance(routeDistanceNm(offer)))}</td>
      <td>${escapeHtml(formatHoursLeft(offer.timeRemainingHours))}</td>
      <td>${escapeHtml(formatDate(offer.latestCompletionUtc))}</td>
      <td>${escapeHtml(formatMoney(offer.payoutAmount))}</td>
      <td>
        <button type="button" data-accept-offer="${escapeHtml(offer.contractOfferId)}">Accept now</button>
      </td>
    </tr>
  `;
}

function renderPlannerHeadline(payload: ContractsViewPayload): string {
  const itemCount = payload.routePlan?.items.length ?? 0;
  if (itemCount === 0) {
    return "Save a chain of offers and accepted work.";
  }

  return `${itemCount} item${itemCount === 1 ? "" : "s"} | endpoint ${payload.plannerEndpointAirportId ?? "-"}`;
}

function renderPlannerPanel(routePlan: ContractsViewPayload["routePlan"], plannerReview: PlannerReviewState): string {
  if (!routePlan || routePlan.items.length === 0) {
    return `<div class="empty-state compact">Saved route plans and accepted work will appear here.</div>`;
  }

  if (plannerReview.isOpen) {
    const reviewModel = buildPlannerReviewModel(routePlan);
    const selectedCount = plannerReview.selectedRoutePlanItemIds.length;
    return `
      <div class="planner-review">
        <div class="planner-review-actions">
          <button type="button" class="button-secondary" data-plan-review-close>Cancel review</button>
          <button type="button" data-plan-accept-selected ${selectedCount === 0 ? "disabled" : ""}>Accept selected planned offers</button>
        </div>
        ${renderPlannerReviewSection("Ready to accept", reviewModel.readyToAccept, plannerReview.selectedRoutePlanItemIds, true)}
        ${renderPlannerReviewSection("Already accepted / scheduled", reviewModel.acceptedOrScheduled, plannerReview.selectedRoutePlanItemIds, false)}
        ${renderPlannerReviewSection("Unavailable / stale", reviewModel.unavailableOrStale, plannerReview.selectedRoutePlanItemIds, false)}
      </div>
    `;
  }

  const displayItems = [...routePlan.items].sort((left, right) => right.sequenceNumber - left.sequenceNumber);
  return `<div class="planner-list">${displayItems.map((item) => `<article class="planner-item ${item.plannerItemStatus}"><div class="planner-item-head"><span class="planner-sequence">${item.sequenceNumber}</span><div class="pill-row">${renderBadge(item.plannerItemStatus)}</div></div><div class="meta-stack"><strong>${escapeHtml(item.origin.code)} -> ${escapeHtml(item.destination.code)}</strong><span class="muted">${escapeHtml(formatPayload(item))} | due ${escapeHtml(formatDate(item.deadlineUtc))}</span></div><div class="planner-item-actions"><button type="button" class="button-secondary" data-plan-move-item="${escapeHtml(item.routePlanItemId)}" data-plan-move-direction="up">Up</button><button type="button" class="button-secondary" data-plan-move-item="${escapeHtml(item.routePlanItemId)}" data-plan-move-direction="down">Down</button><button type="button" class="button-secondary" data-plan-remove-item="${escapeHtml(item.routePlanItemId)}">Remove</button></div></article>`).join("")}</div>`;
}

function renderRouteColumn(origin: ContractsViewAirport, destination: ContractsViewAirport): string {
  return `
    <div class="contract-route-content">
      <span class="muted contract-route-detail"><strong>Departure:</strong> ${escapeHtml(origin.code)} - ${escapeHtml(origin.name)}</span>
      <span class="muted contract-route-detail"><strong>Destination:</strong> ${escapeHtml(destination.code)} - ${escapeHtml(destination.name)}</span>
    </div>
  `;
}

function renderPlannerReviewSection(
  title: string,
  items: ContractsRoutePlanItem[],
  selectedRoutePlanItemIds: string[],
  canSelect: boolean,
): string {
  return `
    <section class="planner-review-section">
      <div class="planner-review-heading">
        <strong>${escapeHtml(title)}</strong>
        <span class="muted">${escapeHtml(String(items.length))}</span>
      </div>
      ${items.length === 0
        ? `<div class="empty-state compact">No items in this section.</div>`
        : `<div class="planner-review-list">${items.map((item) => renderPlannerReviewItem(item, selectedRoutePlanItemIds, canSelect)).join("")}</div>`}
    </section>
  `;
}

function renderPlannerReviewItem(
  item: ContractsRoutePlanItem,
  selectedRoutePlanItemIds: string[],
  canSelect: boolean,
): string {
  const isSelected = selectedRoutePlanItemIds.includes(item.routePlanItemId);
  return `
    <article class="planner-review-item ${item.plannerItemStatus}">
      ${canSelect ? `<label class="planner-review-toggle"><input type="checkbox" data-plan-review-select="${escapeHtml(item.routePlanItemId)}" ${isSelected ? "checked" : ""} /><span>Select</span></label>` : `<div class="planner-review-toggle static"><span>Locked</span></div>`}
      <div class="meta-stack">
        <strong>${escapeHtml(item.origin.code)} -> ${escapeHtml(item.destination.code)}</strong>
        <span class="muted">${escapeHtml(formatPayload(item))} | due ${escapeHtml(formatDate(item.deadlineUtc))}</span>
      </div>
      <div class="pill-row">${renderBadge(item.plannerItemStatus)}</div>
    </article>
  `;
}

function buildPlannerReviewModel(routePlan: ContractsViewPayload["routePlan"]): {
  readyToAccept: ContractsRoutePlanItem[];
  acceptedOrScheduled: ContractsRoutePlanItem[];
  unavailableOrStale: ContractsRoutePlanItem[];
} {
  const readyToAccept: ContractsRoutePlanItem[] = [];
  const acceptedOrScheduled: ContractsRoutePlanItem[] = [];
  const unavailableOrStale: ContractsRoutePlanItem[] = [];

  for (const item of routePlan?.items ?? []) {
    if (isPlannerItemActionable(item)) {
      readyToAccept.push(item);
      continue;
    }

    if (item.sourceType === "candidate_offer") {
      unavailableOrStale.push(item);
      continue;
    }

    acceptedOrScheduled.push(item);
  }

  return { readyToAccept, acceptedOrScheduled, unavailableOrStale };
}

function isPlannerItemActionable(item: ContractsRoutePlanItem): boolean {
  return item.sourceType === "candidate_offer" && item.plannerItemStatus === "candidate_available";
}

function openPlannerReview(state: ContractsUiState): void {
  state.plannerReview = {
    isOpen: true,
    selectedRoutePlanItemIds: (state.payload.routePlan?.items ?? []).filter(isPlannerItemActionable).map((item) => item.routePlanItemId),
  };
}

function closePlannerReview(state: ContractsUiState): void {
  state.plannerReview = {
    isOpen: false,
    selectedRoutePlanItemIds: [],
  };
}

function togglePlannerReviewSelection(state: ContractsUiState, routePlanItemId: string, checked: boolean): void {
  const nextSelection = new Set(state.plannerReview.selectedRoutePlanItemIds);
  if (checked) {
    nextSelection.add(routePlanItemId);
  } else {
    nextSelection.delete(routePlanItemId);
  }
  state.plannerReview = {
    ...state.plannerReview,
    selectedRoutePlanItemIds: [...nextSelection],
  };
}

function renderSortButton(field: SortField, label: string, state: ContractsUiState): string {
  const isCurrent = state.sortField === field;
  const directionLabel = isCurrent ? (state.sortDirection === "asc" ? "ASC" : "DESC") : "SORT";
  return `<button type="button" class="table-sort ${isCurrent ? "current" : ""}" data-sort-field="${field}"><span>${escapeHtml(label)}</span><span class="table-sort-direction">${directionLabel}</span></button>`;
}

function sortOffers(offers: ContractsViewOffer[], state: ContractsUiState): ContractsViewOffer[] {
  const sortField = state.sortField;
  if (!sortField) {
    return offers;
  }

  return [...offers].sort((left, right) => compareRoutes(left, right, sortField, state.sortDirection, state.payload.currentTimeUtc));
}

function sortCompanyContracts(
  contracts: ContractsViewCompanyContract[],
  currentTimeUtc: string,
  state: ContractsUiState,
): ContractsViewCompanyContract[] {
  const sortField = state.sortField;
  if (!sortField) {
    return contracts;
  }

  return [...contracts].sort((left, right) => compareRoutes(left, right, sortField, state.sortDirection, currentTimeUtc));
}

function compareRoutes(
  left: RouteLike,
  right: RouteLike,
  sortField: SortField,
  sortDirection: SortDirection,
  currentTimeUtc: string,
): number {
  const leftValue = sortField === "distanceNm" ? routeDistanceNm(left) : routeHoursRemaining(left, currentTimeUtc);
  const rightValue = sortField === "distanceNm" ? routeDistanceNm(right) : routeHoursRemaining(right, currentTimeUtc);
  const delta = sortDirection === "asc" ? leftValue - rightValue : rightValue - leftValue;

  if (delta !== 0) {
    return delta;
  }

  return (left.origin.code + left.destination.code).localeCompare(right.origin.code + right.destination.code);
}

// Geometry and formatting helpers stay at the bottom so the main controller reads in product terms.
function routeHoursRemaining(route: RouteLike, currentTimeUtc: string): number {
  if ("timeRemainingHours" in route) {
    return route.timeRemainingHours;
  }

  return Math.max(0, (new Date(route.deadlineUtc).getTime() - new Date(currentTimeUtc).getTime()) / 3_600_000);
}

function routeDistanceNm(route: RouteLike): number {
  return haversineDistanceNm(route.origin.latitudeDeg, route.origin.longitudeDeg, route.destination.latitudeDeg, route.destination.longitudeDeg);
}

function haversineDistanceNm(
  originLatitudeDeg: number,
  originLongitudeDeg: number,
  destinationLatitudeDeg: number,
  destinationLongitudeDeg: number,
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusNm = 3440.065;
  const deltaLatitude = toRadians(destinationLatitudeDeg - originLatitudeDeg);
  const deltaLongitude = toRadians(destinationLongitudeDeg - originLongitudeDeg);
  const latitudeOne = toRadians(originLatitudeDeg);
  const latitudeTwo = toRadians(destinationLatitudeDeg);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

function formatDistance(distanceNm: number): string {
  return `${formatNumber(Math.round(distanceNm))} nm`;
}

function formatHoursLeft(hoursRemaining: number): string {
  return `${formatNumber(Math.max(0, Math.round(hoursRemaining)))}h`;
}

function renderBadge(value: string): string {
  const tone = ["blocked_now", "failed", "expired", "cancelled"].includes(value)
    ? "danger"
    : ["stretch_growth", "warning", "assigned", "accepted", "late_completed"].includes(value)
    ? "warn"
    : ["flyable_now", "flyable_with_reposition", "active", "available", "completed"].includes(value)
    ? "accent"
    : "neutral";
  return `<span class="badge ${tone}">${escapeHtml(value.replaceAll("_", " "))}</span>`;
}

function renderHeadline(tab: ContractsBoardTab, availableCount: number, activeCount: number, closedCount: number): string {
  if (tab === "active") {
    return `${formatNumber(activeCount)} accepted / active contracts`;
  }

  if (tab === "closed") {
    return `${formatNumber(closedCount)} closed contracts`;
  }

  return `${formatNumber(availableCount)} available offers`;
}

function renderTabDescription(tab: ContractsBoardTab): string {
  if (tab === "active") {
    return "Accepted, assigned, and active company work";
  }

  if (tab === "closed") {
    return "Completed, late, failed, and cancelled jobs";
  }

  return "Market view";
}

function formatPayload(entry: Pick<ContractsViewOffer, "volumeType" | "passengerCount" | "cargoWeightLb">): string {
  return entry.volumeType === "cargo"
    ? `${formatNumber(entry.cargoWeightLb ?? 0)} lb cargo`
    : `${formatNumber(entry.passengerCount ?? 0)} pax`;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function selectDefaultOfferId(payload: ContractsViewPayload): string | null {
  return payload.offers.find((offer) => offer.offerStatus === "available")?.contractOfferId ?? null;
}

function selectDefaultCompanyContractId(
  payload: ContractsViewPayload,
  tab: ContractsBoardTab,
): string | null {
  const source = tab === "closed" ? getClosedContracts(payload) : getActiveContracts(payload);
  return source[0]?.companyContractId ?? null;
}

function getActiveContracts(payload: ContractsViewPayload): ContractsViewAcceptedContract[] {
  return payload.acceptedContracts.filter((contract) => activeContractStates.has(contract.contractState));
}

function getClosedContracts(payload: ContractsViewPayload): ContractsViewCompanyContract[] {
  return payload.companyContracts.filter((contract) => closedContractStates.has(contract.contractState));
}

// Derived collections centralize filter rules so selection, counts, and rendering all agree on the same visible set.
function getFilteredOffers(state: ContractsUiState): ContractsViewOffer[] {
  const minPayout = Number.parseInt(state.filters.payoutMin, 10);
  const maxPayout = Number.parseInt(state.filters.payoutMax, 10);

  const passengerCountMin = Number.parseInt(state.filters.passengerCountMin, 10);
  const passengerCountMax = Number.parseInt(state.filters.passengerCountMax, 10);
  const cargoWeightMin = Number.parseInt(state.filters.cargoWeightMin, 10);
  const cargoWeightMax = Number.parseInt(state.filters.cargoWeightMax, 10);
  const searchText = state.appliedTextFilters.searchText.trim().toLowerCase();

  return state.payload.offers.filter((offer) => {
    if (offer.offerStatus !== "available") {
      return false;
    }

    if (searchText && !buildAirportSearchHaystack(offer).includes(searchText)) {
      return false;
    }

    if (!matchesAirportFilter(offer.origin, state.appliedTextFilters.originCode)) {
      return false;
    }

    if (!matchesAirportFilter(offer.destination, state.appliedTextFilters.destinationCode)) {
      return false;
    }

    if (state.filters.volumeType !== "all" && offer.volumeType !== state.filters.volumeType) {
      return false;
    }

    if (state.filters.fitBucket !== "all" && offer.fitBucket !== state.filters.fitBucket) {
      return false;
    }

    if (!Number.isNaN(minPayout) && offer.payoutAmount < minPayout) {
      return false;
    }

    if (!Number.isNaN(maxPayout) && offer.payoutAmount > maxPayout) {
      return false;
    }


    if (!matchesVolumeRangeFilters(offer, passengerCountMin, passengerCountMax, cargoWeightMin, cargoWeightMax)) {
      return false;
    }

    return true;
  });
}

function getFilteredCompanyContracts(state: ContractsUiState): ContractsViewCompanyContract[] {
  const source = state.boardTab === "closed"
    ? getClosedContracts(state.payload)
    : getActiveContracts(state.payload);
  const minPayout = Number.parseInt(state.filters.payoutMin, 10);
  const maxPayout = Number.parseInt(state.filters.payoutMax, 10);

  const passengerCountMin = Number.parseInt(state.filters.passengerCountMin, 10);
  const passengerCountMax = Number.parseInt(state.filters.passengerCountMax, 10);
  const cargoWeightMin = Number.parseInt(state.filters.cargoWeightMin, 10);
  const cargoWeightMax = Number.parseInt(state.filters.cargoWeightMax, 10);
  const searchText = state.appliedTextFilters.searchText.trim().toLowerCase();

  return source.filter((contract) => {
    const remainingHours = Math.max(0, (new Date(contract.deadlineUtc).getTime() - new Date(state.payload.currentTimeUtc).getTime()) / 3_600_000);

    if (searchText && !buildAirportSearchHaystack(contract).includes(searchText)) {
      return false;
    }

    if (!matchesAirportFilter(contract.origin, state.appliedTextFilters.originCode)) {
      return false;
    }

    if (!matchesAirportFilter(contract.destination, state.appliedTextFilters.destinationCode)) {
      return false;
    }

    if (state.filters.volumeType !== "all" && contract.volumeType !== state.filters.volumeType) {
      return false;
    }

    if (!Number.isNaN(minPayout) && contract.payoutAmount < minPayout) {
      return false;
    }

    if (!Number.isNaN(maxPayout) && contract.payoutAmount > maxPayout) {
      return false;
    }


    if (!matchesVolumeRangeFilters(contract, passengerCountMin, passengerCountMax, cargoWeightMin, cargoWeightMax)) {
      return false;
    }

    return true;
  });
}

function matchesVolumeRangeFilters(
  route: Pick<RouteLike, "volumeType" | "passengerCount" | "cargoWeightLb">,
  passengerCountMin: number,
  passengerCountMax: number,
  cargoWeightMin: number,
  cargoWeightMax: number,
): boolean {
  const hasPassengerRange = !Number.isNaN(passengerCountMin) || !Number.isNaN(passengerCountMax);
  const hasCargoRange = !Number.isNaN(cargoWeightMin) || !Number.isNaN(cargoWeightMax);

  if (hasPassengerRange) {
    if (route.volumeType !== "passenger") {
      return false;
    }

    const passengerCount = route.passengerCount ?? 0;
    if (!Number.isNaN(passengerCountMin) && passengerCount < passengerCountMin) {
      return false;
    }

    if (!Number.isNaN(passengerCountMax) && passengerCount > passengerCountMax) {
      return false;
    }
  }

  if (hasCargoRange) {
    if (route.volumeType !== "cargo") {
      return false;
    }

    const cargoWeight = route.cargoWeightLb ?? 0;
    if (!Number.isNaN(cargoWeightMin) && cargoWeight < cargoWeightMin) {
      return false;
    }

    if (!Number.isNaN(cargoWeightMax) && cargoWeight > cargoWeightMax) {
      return false;
    }
  }

  return true;
}

function matchesAirportFilter(airport: ContractsViewAirport, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [airport.code, airport.name, airport.municipality]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function buildAirportSearchHaystack(route: RouteLike): string {
  return [
    route.origin.code,
    route.origin.name,
    route.origin.municipality,
    route.destination.code,
    route.destination.name,
    route.destination.municipality,
    `${route.origin.code} ${route.destination.code}`,
  ].filter((value): value is string => Boolean(value)).join(" ").toLowerCase();
}

function buildAirportOptions(...airportCollections: ContractsViewAirport[][]): Array<{ code: string; label: string }> {
  const seen = new Map<string, string>();

  for (const airports of airportCollections) {
    for (const airport of airports) {
      if (!seen.has(airport.code)) {
        seen.set(airport.code, `${airport.code} | ${airport.name}`);
      }
    }
  }

  return [...seen.entries()]
    .map(([code, label]) => ({ code, label }))
    .sort((left, right) => left.code.localeCompare(right.code));
}

function ensureActiveTabSelection(
  state: ContractsUiState,
  filteredOffers: ContractsViewOffer[] = getFilteredOffers(state),
  filteredCompanyContracts: ContractsViewCompanyContract[] = getFilteredCompanyContracts(state),
): void {
  if (state.boardTab === "available") {
    if (!filteredOffers.some((offer) => offer.contractOfferId === state.selectedOfferId)) {
      state.selectedOfferId = filteredOffers[0]?.contractOfferId ?? null;
    }
    return;
  }

  if (!filteredCompanyContracts.some((contract) => contract.companyContractId === state.selectedCompanyContractId)) {
    state.selectedCompanyContractId = filteredCompanyContracts[0]?.companyContractId ?? selectDefaultCompanyContractId(state.payload, state.boardTab);
  }
}

function resolveSelectedRoute(
  state: ContractsUiState,
  filteredOffers: ContractsViewOffer[],
  filteredCompanyContracts: ContractsViewCompanyContract[],
): SelectedRoute | null {
  if (state.boardTab === "available") {
    const selectedOffer = filteredOffers.find((offer) => offer.contractOfferId === state.selectedOfferId)
      ?? filteredOffers[0]
      ?? null;

    state.selectedOfferId = selectedOffer?.contractOfferId ?? null;
    return selectedOffer ? { kind: "offer", route: selectedOffer } : null;
  }

  const selectedCompanyContract = filteredCompanyContracts.find((contract) => contract.companyContractId === state.selectedCompanyContractId)
    ?? filteredCompanyContracts[0]
    ?? null;

  state.selectedCompanyContractId = selectedCompanyContract?.companyContractId ?? null;
  return selectedCompanyContract ? { kind: "company_contract", route: selectedCompanyContract } : null;
}

function focusSelectedRoute(state: ContractsUiState): void {
  const selectedRoute = resolveSelectedRoute(state, getFilteredOffers(state), getFilteredCompanyContracts(state));

  if (!selectedRoute) {
    state.map = { ...defaultMapState };
    return;
  }

  const points = [
    selectedRoute.route.origin,
    selectedRoute.route.destination,
  ].map(toMercatorPoint);

  const minLongitudeNorm = Math.min(...points.map((point) => point.longitudeNorm));
  const maxLongitudeNorm = Math.max(...points.map((point) => point.longitudeNorm));
  const minLatitudeNorm = Math.min(...points.map((point) => point.latitudeNorm));
  const maxLatitudeNorm = Math.max(...points.map((point) => point.latitudeNorm));
  const widthNorm = Math.max(0.015, maxLongitudeNorm - minLongitudeNorm);
  const heightNorm = Math.max(0.015, maxLatitudeNorm - minLatitudeNorm);
  const zoomX = Math.log2((mapViewWidthPx - mapPaddingPx * 2) / Math.max(widthNorm * mapTileSizePx, 1));
  const zoomY = Math.log2((mapViewHeightPx - mapPaddingPx * 2) / Math.max(heightNorm * mapTileSizePx, 1));
  const zoom = clamp(Math.floor(Math.min(zoomX, zoomY)), minMapZoom, maxMapZoom);

  state.map = {
    zoom,
    centerLongitudeNorm: wrapUnitInterval((minLongitudeNorm + maxLongitudeNorm) / 2),
    centerLatitudeNorm: clamp((minLatitudeNorm + maxLatitudeNorm) / 2, 0.02, 0.98),
  };
}

// The route map is rendered as a lightweight SVG overlay instead of a heavier mapping library.
function renderMap(root: HTMLElement, state: ContractsUiState, selectedRoute: SelectedRoute | null): void {
  const svg = root.querySelector<SVGSVGElement>("[data-contracts-map]");
  if (!svg) {
    return;
  }

  const worldSizePx = mapTileSizePx * 2 ** state.map.zoom;
  const tileCount = 2 ** state.map.zoom;
  const centerWorldX = state.map.centerLongitudeNorm * worldSizePx;
  const centerWorldY = state.map.centerLatitudeNorm * worldSizePx;
  const viewportLeftPx = centerWorldX - mapViewWidthPx / 2;
  const viewportTopPx = centerWorldY - mapViewHeightPx / 2;
  const xStartTile = Math.floor(viewportLeftPx / mapTileSizePx);
  const xEndTile = Math.floor((viewportLeftPx + mapViewWidthPx) / mapTileSizePx);
  const yStartTile = Math.max(0, Math.floor(viewportTopPx / mapTileSizePx));
  const yEndTile = Math.min(tileCount - 1, Math.floor((viewportTopPx + mapViewHeightPx) / mapTileSizePx));

  const tileImages: string[] = [];
  for (let tileY = yStartTile; tileY <= yEndTile; tileY += 1) {
    for (let tileX = xStartTile; tileX <= xEndTile; tileX += 1) {
      const wrappedTileX = ((tileX % tileCount) + tileCount) % tileCount;
      tileImages.push(`
        <image href="${buildTileUrl(state.map.zoom, wrappedTileX, tileY)}" x="${tileX * mapTileSizePx - viewportLeftPx}" y="${tileY * mapTileSizePx - viewportTopPx}" width="${mapTileSizePx}" height="${mapTileSizePx}" class="map-tile" preserveAspectRatio="none" />
      `);
    }
  }

  const selectedOverlay = selectedRoute
    ? renderSelectedOverlay(selectedRoute, viewportLeftPx, viewportTopPx, worldSizePx)
    : `<text x="500" y="280" text-anchor="middle" class="map-label muted">Select a contract row to draw the route.</text>`;

  svg.innerHTML = `
    <rect x="0" y="0" width="${mapViewWidthPx}" height="${mapViewHeightPx}" rx="24" class="map-bg" />
    <g class="map-tiles">${tileImages.join("")}</g>
    <rect x="0" y="0" width="${mapViewWidthPx}" height="${mapViewHeightPx}" rx="24" class="map-scrim" />
    <g class="map-grid">
      ${[-120, -60, 0, 60, 120].map((longitude) => {
        const x = wrapUnitInterval((longitude + 180) / 360) * worldSizePx - viewportLeftPx;
        return `<line x1="${x}" y1="16" x2="${x}" y2="${mapViewHeightPx - 16}" />`;
      }).join("")}
      ${[-60, -30, 0, 30, 60].map((latitude) => {
        const y = latitudeToMercatorNorm(latitude) * worldSizePx - viewportTopPx;
        return `<line x1="16" y1="${y}" x2="${mapViewWidthPx - 16}" y2="${y}" />`;
      }).join("")}
    </g>
    <g class="map-overlay">
      ${selectedOverlay}
    </g>
  `;
}

function renderSelectedOverlay(
  selectedRoute: SelectedRoute,
  viewportLeftPx: number,
  viewportTopPx: number,
  worldSizePx: number,
): string {
  const origin = projectAirportToViewport(selectedRoute.route.origin, viewportLeftPx, viewportTopPx, worldSizePx);
  const destination = projectAirportToViewport(selectedRoute.route.destination, viewportLeftPx, viewportTopPx, worldSizePx);

  return `
    <circle cx="${origin.x}" cy="${origin.y}" r="28" class="map-range-ring origin" />
    <circle cx="${destination.x}" cy="${destination.y}" r="28" class="map-range-ring destination" />
    <line x1="${origin.x}" y1="${origin.y}" x2="${destination.x}" y2="${destination.y}" class="map-route selected" />
    <circle cx="${origin.x}" cy="${origin.y}" r="9" class="map-point origin" />
    <circle cx="${destination.x}" cy="${destination.y}" r="9" class="map-point destination" />
    <text x="${origin.x + 14}" y="${origin.y - 14}" class="map-label">${escapeHtml(selectedRoute.route.origin.code)}</text>
    <text x="${destination.x + 14}" y="${destination.y - 14}" class="map-label">${escapeHtml(selectedRoute.route.destination.code)}</text>
  `;
}

function projectAirportToViewport(
  airport: ContractsViewAirport,
  viewportLeftPx: number,
  viewportTopPx: number,
  worldSizePx: number,
): { x: number; y: number } {
  const point = toMercatorPoint(airport);
  return {
    x: point.longitudeNorm * worldSizePx - viewportLeftPx,
    y: point.latitudeNorm * worldSizePx - viewportTopPx,
  };
}

function toMercatorPoint(airport: ContractsViewAirport): { longitudeNorm: number; latitudeNorm: number } {
  return {
    longitudeNorm: wrapUnitInterval((airport.longitudeDeg + 180) / 360),
    latitudeNorm: latitudeToMercatorNorm(airport.latitudeDeg),
  };
}

function latitudeToMercatorNorm(latitudeDeg: number): number {
  const clampedLatitude = clamp(latitudeDeg, -85, 85);
  const latitudeRad = (clampedLatitude * Math.PI) / 180;
  return (1 - Math.log(Math.tan(latitudeRad) + 1 / Math.cos(latitudeRad)) / Math.PI) / 2;
}

function buildTileUrl(zoom: number, tileX: number, tileY: number): string {
  return `${openStreetMapTileUrl}/${zoom}/${tileX}/${tileY}.png`;
}

function resolveContractsMapSvg(target: EventTarget | null): SVGSVGElement | null {
  return target instanceof Element
    ? target.closest<SVGSVGElement>("[data-contracts-map]")
    : null;
}

function wrapUnitInterval(value: number): number {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}






























