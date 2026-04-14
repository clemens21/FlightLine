/*
 * Browser controller for the contracts tab inside the save shell.
 * It owns filter state, workspace tabs, board tabs, planner actions, map focus, and the client-side refresh loop for contracts data.
 * The browser here is intentionally rich because the contracts board behaves more like a workstation than a form page:
 * selection, filtering, map context, and in-place acceptance all stay client-side for responsiveness.
 */

import type {
  ContractsPlannerAircraft,
  ContractsViewAcceptedContract,
  ContractsRoutePlanItem,
  ContractsViewAirport,
  ContractsViewCompanyContract,
  ContractsContractUrgencyBand,
  ContractsContractWorkState,
  ContractsViewOffer,
  ContractsViewPayload,
} from "../contracts-view-model.js";
import {
  applyContractsBoardViewState,
  type ContractsBoardCompanyContractLike,
  type ContractsBoardCompanyContractRowView,
  type ContractsBoardOfferRowView,
  type ContractsBoardViewState,
} from "../contracts-board-model.js";
import type { NotificationLevel, ShellSummaryPayload } from "../save-shell-model.js";
import {
  captureNamedControlFocus,
  focusControlAtEnd,
  restoreNamedControlFocus,
  type NamedControlFocusState,
} from "../focus-helpers.js";
import {
  escapeHtml,
  formatDeadlineCountdown,
  formatMoney,
  formatNumber,
} from "../browser-ui-primitives.js";
import {
  renderStaticTableHeaderCell,
  renderTableDueCell,
  renderTableRouteCell,
} from "../browser-table-primitives.js";

interface FilterState {
  departureSearchText: string;
  destinationSearchText: string;
  nearestAircraftSearchText: string;
  readyAircraft: boolean;
  noReadyAircraft: boolean;
  passengerPayloadMin: string;
  passengerPayloadMax: string;
  cargoPayloadMin: string;
  cargoPayloadMax: string;
  distanceMin: string;
  distanceMax: string;
  hoursRemainingMin: string;
  hoursRemainingMax: string;
  dueHoursMin: string;
  dueHoursMax: string;
  payoutMin: string;
  payoutMax: string;
}

interface MapState {
  zoom: number;
  centerLongitudeNorm: number;
  centerLatitudeNorm: number;
}

interface AppliedTextFilters {
  departureSearchText: string;
  destinationSearchText: string;
  nearestAircraftSearchText: string;
}

interface PlannerAnchorFilterState {
  departureSearchText: string;
  destinationSearchText: string;
  hoursRemainingMin: string;
  hoursRemainingMax: string;
  dueHoursMin: string;
  dueHoursMax: string;
}

interface PlannerAnchorAppliedTextFilters {
  departureSearchText: string;
  destinationSearchText: string;
}

interface PlannerReviewState {
  isOpen: boolean;
  selectedRoutePlanItemIds: string[];
}

type PlannerCandidateState = "actionable" | "blocked";

interface PlannerCandidateView {
  offer: ContractsViewOffer;
  blockedReason: string | null;
  state: PlannerCandidateState;
  detail: string;
}

interface PlannerSelectionState {
  acceptedContractId: string | null;
  aircraftId: string;
}

interface PlannerChainSummary {
  items: ContractsRoutePlanItem[];
  endpointAirport: ContractsViewAirport | null;
  itemCount: number;
  acceptedWorkCount: number;
  plannedCandidateCount: number;
  payoutTotal: number;
  continuityIssues: string[];
}

type ContractsBoardPopoverKey =
  | "routeSearch"
  | "payloadFilter"
  | "aircraftSearch"
  | "aircraftFilter"
  | "distanceFilter"
  | "hoursFilter"
  | "dueFilter"
  | "payoutFilter";

interface ContractsUiState {
  payload: ContractsViewPayload;
  filters: FilterState;
  appliedTextFilters: AppliedTextFilters;
  plannerAnchorFilters: PlannerAnchorFilterState;
  plannerAnchorAppliedTextFilters: PlannerAnchorAppliedTextFilters;
  plannerSelection: PlannerSelectionState;
  plannerReview: PlannerReviewState;
  plannerTableView: PlannerTableView;
  plannerAnchorSortField: PlannerAnchorSortField | null;
  plannerAnchorSortDirection: SortDirection;
  workspaceTab: ContractsWorkspaceTab;
  boardTab: ContractsBoardTab;
  sortField: SortField | null;
  sortDirection: SortDirection;
  boardScope: ContractsBoardScope;
  selectedOfferId: string | null;
  selectedCompanyContractId: string | null;
  acceptanceNextStepTab: ContractsWorkspaceTab | null;
  acceptanceNextStepOfferId: string | null;
  acceptanceNextStepCompanyContractId: string | null;
  message: { tone: "notice" | "error"; text: string; notificationLevel?: NotificationLevel | undefined } | null;
  map: MapState;
}

type ContractsBoardTab = "available" | "active" | "closed";
type ContractsBoardScope = "all" | "my_contracts";
type ContractsWorkspaceTab = "board" | "planning";
type PlannerTableView = "accepted" | "candidates";
type SortField = "route" | "payload" | "nearestAircraft" | "distanceNm" | "hoursRemaining" | "dueUtc" | "payout";
type PlannerAnchorSortField = "route" | "hoursRemaining" | "dueUtc";
type SortDirection = "asc" | "desc";
type RouteLike = ContractsViewOffer | ContractsBoardCompanyContractLike | ContractsViewAcceptedContract;
type PlannerAnchorPopoverKey = "plannerRouteSearch" | "plannerHoursFilter" | "plannerDueFilter";

type SelectedRoute =
  | { kind: "offer"; route: ContractsViewOffer }
  | { kind: "company_contract"; route: ContractsBoardCompanyContractLike };

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

const boardMapViewWidthPx = 600;
const boardMapViewHeightPx = 600;
const plannerMapViewWidthPx = 1000;
const plannerMapViewHeightPx = 560;
const mapTileSizePx = 256;
const minMapZoom = 1;
const maxMapZoom = 6;
const boardMapPaddingPx = 72;
const plannerMapPaddingPx = 96;
const openStreetMapTileUrl = "https://tile.openstreetmap.org";
const debouncedFilterNames = new Set([
  "departureSearchText",
  "destinationSearchText",
  "nearestAircraftSearchText",
  "passengerPayloadMin",
  "passengerPayloadMax",
  "cargoPayloadMin",
  "cargoPayloadMax",
  "distanceMin",
  "distanceMax",
  "hoursRemainingMin",
  "hoursRemainingMax",
  "dueHoursMin",
  "dueHoursMax",
  "payoutMin",
  "payoutMax",
]);
const plannerAnchorDebouncedFilterNames = new Set([
  "departureSearchText",
  "destinationSearchText",
  "hoursRemainingMin",
  "hoursRemainingMax",
  "dueHoursMin",
  "dueHoursMax",
]);
const filterDebounceMs = 180;
const emptyPlannerCandidates: PlannerCandidateView[] = [];
const defaultMapState: MapState = {
  zoom: 2,
  centerLongitudeNorm: 0.5,
  centerLatitudeNorm: 0.36,
};
const initialUrl = typeof window === "undefined"
  ? new URL("http://localhost/")
  : new URL(window.location.href);
const initialContractsView = initialUrl.searchParams.get("contractsView");
const activeContractStates = new Set(["accepted", "assigned", "active"]);
const closedContractStates = new Set(["completed", "late_completed", "failed", "cancelled"]);

function computeBoardViewState(state: ContractsUiState): ContractsBoardViewState {
  return applyContractsBoardViewState(state.payload, {
    filters: state.filters,
    appliedTextFilters: state.appliedTextFilters,
    boardTab: state.boardTab,
    boardScope: state.boardScope,
    sortField: state.sortField,
    sortDirection: state.sortDirection,
    selectedOfferId: state.selectedOfferId,
    selectedCompanyContractId: state.selectedCompanyContractId,
  });
}

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
      departureSearchText: "",
      destinationSearchText: "",
      nearestAircraftSearchText: "",
      readyAircraft: false,
      noReadyAircraft: false,
      passengerPayloadMin: "",
      passengerPayloadMax: "",
      cargoPayloadMin: "",
      cargoPayloadMax: "",
      distanceMin: "",
      distanceMax: "",
      hoursRemainingMin: "",
      hoursRemainingMax: "",
      dueHoursMin: "",
      dueHoursMax: "",
      payoutMin: "",
      payoutMax: "",
    },
    appliedTextFilters: {
      departureSearchText: "",
      destinationSearchText: "",
      nearestAircraftSearchText: "",
    },
    plannerAnchorFilters: {
      departureSearchText: "",
      destinationSearchText: "",
      hoursRemainingMin: "",
      hoursRemainingMax: "",
      dueHoursMin: "",
      dueHoursMax: "",
    },
    plannerAnchorAppliedTextFilters: {
      departureSearchText: "",
      destinationSearchText: "",
    },
    plannerSelection: {
      acceptedContractId: selectDefaultPlannerAcceptedContractId(initialPayload),
      aircraftId: "",
    },
    plannerReview: {
      isOpen: false,
      selectedRoutePlanItemIds: [],
    },
    plannerTableView: "accepted",
    plannerAnchorSortField: null,
    plannerAnchorSortDirection: "asc",
    workspaceTab: "board",
    boardTab: initialContractsView === "my_contracts" ? "active" : "available",
    sortField: null,
    sortDirection: "asc",
    boardScope: initialContractsView === "my_contracts" ? "my_contracts" : "all",
    selectedOfferId: null,
    selectedCompanyContractId: selectDefaultCompanyContractId(initialPayload, "active"),
    acceptanceNextStepTab: null,
    acceptanceNextStepOfferId: null,
    acceptanceNextStepCompanyContractId: null,
    message: null,
    map: { ...defaultMapState },
  };

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let textFilterDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  let plannerAnchorFilterDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  let activeBoardPopover: ContractsBoardPopoverKey | null = null;
  let activePlannerAnchorPopover: PlannerAnchorPopoverKey | null = null;
  let pendingAvailableOfferSelectionTimeout: number | null = null;
  let pendingAvailableOfferId: string | null = null;
  const acceptingContractOfferIds = new Set<string>();
  let cachedBoardViewState: ContractsBoardViewState | null = null;
  let cachedBoardViewKey = "";
  let cachedBoardPayload: ContractsViewPayload | null = null;
  let cachedPlannerCandidates: PlannerCandidateView[] | null = null;
  let cachedPlannerCandidatesKey = "";
  let cachedPlannerPayload: ContractsViewPayload | null = null;

  function getBoardViewCacheKey(nextState: ContractsUiState): string {
    return JSON.stringify({
      boardTab: nextState.boardTab,
      boardScope: nextState.boardScope,
      sortField: nextState.sortField,
      sortDirection: nextState.sortDirection,
      selectedOfferId: nextState.selectedOfferId,
      selectedCompanyContractId: nextState.selectedCompanyContractId,
      filters: nextState.filters,
      appliedTextFilters: nextState.appliedTextFilters,
    });
  }

  function getCachedBoardViewState(nextState: ContractsUiState): ContractsBoardViewState {
    const nextKey = getBoardViewCacheKey(nextState);
    if (
      cachedBoardViewState
      && cachedBoardPayload === nextState.payload
      && cachedBoardViewKey === nextKey
    ) {
      return cachedBoardViewState;
    }

    const nextBoardViewState = computeBoardViewState(nextState);
    cachedBoardPayload = nextState.payload;
    cachedBoardViewKey = nextKey;
    cachedBoardViewState = nextBoardViewState;
    return nextBoardViewState;
  }

  function getPlannerCandidatesCacheKey(nextState: ContractsUiState): string {
    return JSON.stringify({
      plannerSelection: nextState.plannerSelection,
      routePlanId: nextState.payload.routePlan?.routePlanId ?? null,
      routePlanItemCount: nextState.payload.routePlan?.items.length ?? 0,
    });
  }

  function getCachedPlannerCandidates(nextState: ContractsUiState): PlannerCandidateView[] {
    const nextKey = getPlannerCandidatesCacheKey(nextState);
    if (
      cachedPlannerCandidates
      && cachedPlannerPayload === nextState.payload
      && cachedPlannerCandidatesKey === nextKey
    ) {
      return cachedPlannerCandidates;
    }

    const nextPlannerCandidates = getFilteredPlannerCandidates(nextState);
    cachedPlannerPayload = nextState.payload;
    cachedPlannerCandidatesKey = nextKey;
    cachedPlannerCandidates = nextPlannerCandidates;
    return nextPlannerCandidates;
  }

  function clearPendingAvailableOfferSelection(): void {
    if (pendingAvailableOfferSelectionTimeout !== null) {
      window.clearTimeout(pendingAvailableOfferSelectionTimeout);
      pendingAvailableOfferSelectionTimeout = null;
    }
    pendingAvailableOfferId = null;
  }

  function selectAvailableOffer(contractOfferId: string): void {
    state.boardTab = "available";
    state.selectedOfferId = contractOfferId;
    focusSelectedRoute(state);
    render();
  }

  focusSelectedRoute(state);
  render();

  // Click actions cover board navigation, planner mutations, acceptance or cancellation, and selection changes.
  const handleClick = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }
    const clickedOfferRow = target.closest<HTMLElement>("[data-select-offer-row]");
    if (!clickedOfferRow) {
      clearPendingAvailableOfferSelection();
    }

    const workspaceTabButton = target.closest<HTMLElement>("[data-workspace-tab]");
    if (workspaceTabButton) {
      const nextTab = workspaceTabButton.dataset.workspaceTab as ContractsWorkspaceTab | undefined;
        if (nextTab) {
          state.workspaceTab = nextTab;
          activeBoardPopover = null;
          activePlannerAnchorPopover = null;
          if (nextTab === "planning") {
            state.acceptanceNextStepTab = null;
            focusPlannerChain(state);
        } else {
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
          activeBoardPopover = null;
          activePlannerAnchorPopover = null;
          if (nextTab !== "available") {
            state.acceptanceNextStepTab = null;
            state.acceptanceNextStepOfferId = null;
          state.acceptanceNextStepCompanyContractId = null;
        }
        ensureActiveTabSelection(state);
        focusSelectedRoute(state);
        render();
      }
      return;
    }

    const boardScopeButton = target.closest<HTMLElement>("[data-board-scope]");
    if (boardScopeButton) {
      const nextScope = boardScopeButton.dataset.boardScope as ContractsBoardScope | undefined;
        if (nextScope) {
          state.boardScope = nextScope;
          activeBoardPopover = null;
          activePlannerAnchorPopover = null;
          if (state.boardTab !== "active") {
            state.boardTab = "active";
          }
        ensureActiveTabSelection(state);
        focusSelectedRoute(state);
        render();
      }
      return;
    }

    const boardPopoverToggleButton = target.closest<HTMLElement>("[data-contracts-board-popover-toggle]");
    if (boardPopoverToggleButton) {
      event.preventDefault();
      event.stopPropagation();
      const popoverKey = normalizeContractsBoardPopoverKey(boardPopoverToggleButton.dataset.contractsBoardPopoverToggle);
      if (popoverKey) {
        activePlannerAnchorPopover = null;
        activeBoardPopover = activeBoardPopover === popoverKey ? null : popoverKey;
        render();
      }
      return;
    }

    const plannerAnchorPopoverToggleButton = target.closest<HTMLElement>("[data-planner-anchor-popover-toggle]");
    if (plannerAnchorPopoverToggleButton) {
      event.preventDefault();
      event.stopPropagation();
      const popoverKey = normalizePlannerAnchorPopoverKey(plannerAnchorPopoverToggleButton.dataset.plannerAnchorPopoverToggle);
      if (popoverKey) {
        activeBoardPopover = null;
        activePlannerAnchorPopover = activePlannerAnchorPopover === popoverKey ? null : popoverKey;
        render();
      }
      return;
    }

    const sortButton = target.closest<HTMLElement>("[data-sort-field]");
    if (sortButton) {
      const nextField = sortButton.dataset.sortField as SortField | undefined;
      if (nextField) {
        activeBoardPopover = null;
        activePlannerAnchorPopover = null;
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
    const addCandidateButton = target.closest<HTMLButtonElement>("[data-planner-add-candidate]");
    if (addCandidateButton) {
      event.preventDefault();
      event.stopPropagation();
      const sourceId = addCandidateButton.dataset.plannerAddCandidate ?? "";
      void plannerAction(
        options.plannerAddUrl,
        new URLSearchParams({ sourceType: "candidate_offer", sourceId }),
        addCandidateButton,
        "Adding...",
      );
      return;
    }

    const acceptanceDismissButton = target.closest<HTMLButtonElement>("[data-next-step-dismiss]");
    if (acceptanceDismissButton) {
      event.preventDefault();
      event.stopPropagation();
      state.acceptanceNextStepTab = null;
      state.acceptanceNextStepOfferId = null;
      state.acceptanceNextStepCompanyContractId = null;
      render();
      return;
    }

    const acceptanceDispatchButton = target.closest<HTMLButtonElement>("[data-next-step-dispatch]");
    if (acceptanceDispatchButton) {
      event.preventDefault();
      event.stopPropagation();
      const acceptedOffer = state.payload.offers.find((offer) => offer.contractOfferId === state.acceptanceNextStepOfferId) ?? null;
      if (!acceptedOffer?.directDispatchEligible) {
        state.message = {
          tone: "error",
          text: acceptedOffer?.directDispatchReason ?? "That contract cannot dispatch directly yet.",
        };
        options.onMessage?.(state.message);
        render();
        return;
      }

      window.location.href = buildDispatchUrl(state.acceptanceNextStepCompanyContractId).toString();
      return;
    }

    const openRoutePlanButton = target.closest<HTMLButtonElement>("[data-open-route-plan]");
    if (openRoutePlanButton) {
      event.preventDefault();
      event.stopPropagation();
      const selectedAcceptedContractId = openRoutePlanButton.dataset.openRoutePlan ?? "";
      if (selectedAcceptedContractId && state.payload.acceptedContracts.some((contract) => contract.companyContractId === selectedAcceptedContractId)) {
        state.plannerSelection = {
          ...state.plannerSelection,
          acceptedContractId: selectedAcceptedContractId,
        };
      }
      state.workspaceTab = "planning";
      state.plannerTableView = "accepted";
      state.acceptanceNextStepTab = null;
      state.acceptanceNextStepOfferId = null;
      state.acceptanceNextStepCompanyContractId = null;
      focusPlannerChain(state);
      render();
      return;
    }

    const plannerTableViewButton = target.closest<HTMLButtonElement>("[data-planner-table-view]");
    if (plannerTableViewButton) {
      event.preventDefault();
      event.stopPropagation();
      const nextView = plannerTableViewButton.dataset.plannerTableView === "candidates" ? "candidates" : "accepted";
      if (state.plannerTableView !== nextView) {
        state.plannerTableView = nextView;
        activePlannerAnchorPopover = null;
        render();
      }
      return;
    }

    const plannerSelectContractButton = target.closest<HTMLElement>("[data-planner-select-contract]");
    if (plannerSelectContractButton && !target.closest("button, input, select, textarea, a")) {
      event.preventDefault();
      event.stopPropagation();
      const acceptedContractId = plannerSelectContractButton.dataset.plannerSelectContract ?? "";
      if (acceptedContractId) {
        state.plannerSelection = {
          ...state.plannerSelection,
          acceptedContractId,
        };
        render();
      }
      return;
    }

    const plannerAnchorSortButton = target.closest<HTMLElement>("[data-planner-anchor-sort-field]");
    if (plannerAnchorSortButton) {
      const nextField = plannerAnchorSortButton.dataset.plannerAnchorSortField as PlannerAnchorSortField | undefined;
      if (nextField) {
        activeBoardPopover = null;
        activePlannerAnchorPopover = null;
        if (state.plannerAnchorSortField === nextField) {
          state.plannerAnchorSortDirection = state.plannerAnchorSortDirection === "asc" ? "desc" : "asc";
        } else {
          state.plannerAnchorSortField = nextField;
          state.plannerAnchorSortDirection = "asc";
        }
        render();
      }
      return;
    }

    const plannerStartContractButton = target.closest<HTMLButtonElement>("[data-plan-start-contract]");
    if (plannerStartContractButton) {
      event.preventDefault();
      event.stopPropagation();
      const acceptedContractId = plannerStartContractButton.dataset.planStartContract ?? "";
      if (acceptedContractId) {
        void startPlannerFromAcceptedContract(acceptedContractId, plannerStartContractButton);
      }
      return;
    }

    const openDispatchButton = target.closest<HTMLButtonElement>("[data-open-dispatch]");
    if (openDispatchButton) {
      event.preventDefault();
      event.stopPropagation();
      window.location.href = buildDispatchUrl(openDispatchButton.dataset.openDispatch ?? state.acceptanceNextStepCompanyContractId).toString();
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

    const acceptSelectedPane = target.closest<HTMLElement>("[data-accept-selected-pane]");
    if (acceptSelectedPane && !target.closest("button, a, input, select, textarea, label")) {
      event.preventDefault();
      event.stopPropagation();
      const contractOfferId = acceptSelectedPane.dataset.acceptSelectedPane ?? "";
      void acceptOffer(contractOfferId, acceptSelectedPane);
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

    if (clickedOfferRow) {
      event.preventDefault();
      event.stopPropagation();
      const contractOfferId = clickedOfferRow.dataset.selectOfferRow ?? "";
      if (!contractOfferId) {
        clearPendingAvailableOfferSelection();
        return;
      }
      if (pendingAvailableOfferSelectionTimeout !== null && pendingAvailableOfferId === contractOfferId) {
        clearPendingAvailableOfferSelection();
        void acceptOffer(contractOfferId, null);
        return;
      }
      clearPendingAvailableOfferSelection();
      pendingAvailableOfferId = contractOfferId;
      pendingAvailableOfferSelectionTimeout = window.setTimeout(() => {
        pendingAvailableOfferSelectionTimeout = null;
        pendingAvailableOfferId = null;
        selectAvailableOffer(contractOfferId);
      }, 220);
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

    if (activeBoardPopover !== null && !target.closest("[data-contracts-board-popover]") && !target.closest("[data-contracts-board-popover-toggle]")) {
      activeBoardPopover = null;
      render();
      return;
    }

    if (activePlannerAnchorPopover !== null && !target.closest("[data-planner-anchor-popover]") && !target.closest("[data-planner-anchor-popover-toggle]")) {
      activePlannerAnchorPopover = null;
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

    const isPlannerAnchorFilter = target instanceof HTMLInputElement && target.dataset.plannerAnchorField !== undefined;
    const isBoardFilter = target instanceof HTMLInputElement && target.dataset.contractsBoardField !== undefined;
    const isPlannerAircraftSelect = target.name === "plannerAircraftId";

    if (!isBoardFilter && !isPlannerAnchorFilter && !isPlannerAircraftSelect) {
      return;
    }

    const nextValue = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
    if (isBoardFilter) {
      state.filters = {
        ...state.filters,
        [target.name]: nextValue,
      };
    } else if (isPlannerAnchorFilter) {
      state.plannerAnchorFilters = {
        ...state.plannerAnchorFilters,
        [target.name]: String(nextValue),
      };
    } else {
      state.plannerSelection = {
        ...state.plannerSelection,
        aircraftId: String(nextValue),
      };
    }

    if (isBoardFilter && debouncedFilterNames.has(target.name)) {
      if (textFilterDebounceTimeout) {
        clearTimeout(textFilterDebounceTimeout);
      }

      textFilterDebounceTimeout = setTimeout(() => {
        textFilterDebounceTimeout = null;
        state.appliedTextFilters = {
          departureSearchText: state.filters.departureSearchText,
          destinationSearchText: state.filters.destinationSearchText,
          nearestAircraftSearchText: state.filters.nearestAircraftSearchText,
        };
        ensureActiveTabSelection(state);
        render(captureNamedControlFocus(root));
      }, filterDebounceMs);
      return;
    }

    if (isPlannerAnchorFilter && plannerAnchorDebouncedFilterNames.has(target.name)) {
      if (plannerAnchorFilterDebounceTimeout) {
        clearTimeout(plannerAnchorFilterDebounceTimeout);
      }

      plannerAnchorFilterDebounceTimeout = setTimeout(() => {
        plannerAnchorFilterDebounceTimeout = null;
        state.plannerAnchorAppliedTextFilters = {
          departureSearchText: state.plannerAnchorFilters.departureSearchText,
          destinationSearchText: state.plannerAnchorFilters.destinationSearchText,
        };
        ensurePlannerSelections(state);
        render(captureNamedControlFocus(root));
      }, filterDebounceMs);
      return;
    }

    ensureActiveTabSelection(state);
    ensurePlannerSelections(state);
    render(captureNamedControlFocus(root));
  };

  const handleKeydown = (event: KeyboardEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const acceptSelectedPane = target?.closest<HTMLElement>("[data-accept-selected-pane]");
    if (acceptSelectedPane && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopPropagation();
      const contractOfferId = acceptSelectedPane.dataset.acceptSelectedPane ?? "";
      void acceptOffer(contractOfferId, acceptSelectedPane);
      return;
    }

    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    activeBoardPopover = null;
    activePlannerAnchorPopover = null;
    render(captureNamedControlFocus(root));
  };

  const handleDocumentClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || root.contains(target) || (activeBoardPopover === null && activePlannerAnchorPopover === null)) {
      return;
    }
    activeBoardPopover = null;
    activePlannerAnchorPopover = null;
    render();
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
    renderVisibleMap(root, state, resolveSelectedRoute(state));
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
    renderVisibleMap(root, state, resolveSelectedRoute(state));
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
  root.addEventListener("keydown", handleKeydown);
  document.addEventListener("click", handleDocumentClick, true);
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
    ensurePlannerSelections(state);
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
      ensurePlannerSelections(state);

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
      if (plannerAnchorFilterDebounceTimeout) {
        clearTimeout(plannerAnchorFilterDebounceTimeout);
        plannerAnchorFilterDebounceTimeout = null;
      }
      clearPendingAvailableOfferSelection();
      root.removeEventListener("click", handleClick);
      root.removeEventListener("input", handleFilterChange);
      root.removeEventListener("change", handleFilterChange);
      root.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("click", handleDocumentClick, true);
      root.removeEventListener("wheel", handleWheel);
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerup", handlePointerUp);
      root.removeEventListener("pointercancel", handlePointerCancel);
      root.replaceChildren();
    },
  };
  async function acceptOffer(contractOfferId: string, control: HTMLElement | null): Promise<void> {
    if (!contractOfferId || !options.acceptUrl) {
      return;
    }

    if (acceptingContractOfferIds.has(contractOfferId)) {
      return;
    }
    acceptingContractOfferIds.add(contractOfferId);

    const button = control instanceof HTMLButtonElement ? control : null;
    const originalLabel = button?.textContent ?? "Accept";
    if (control) {
      control.setAttribute("aria-busy", "true");
      control.classList.add("is-busy");
    }
    if (button) {
      button.disabled = true;
      button.textContent = "Accepting...";
    }

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
      ensurePlannerSelections(state);
      const acceptedCompanyContract = result.payload.companyContracts.find((contract) => contract.originContractOfferId === contractOfferId) ?? null;
      state.message = {
        tone: "notice",
        text: result.message ?? "Contract accepted.",
        notificationLevel: result.notificationLevel,
      };
      state.acceptanceNextStepTab = "planning";
      state.acceptanceNextStepOfferId = contractOfferId;
      state.acceptanceNextStepCompanyContractId = acceptedCompanyContract?.companyContractId ?? null;
      if (acceptedCompanyContract?.companyContractId) {
        state.plannerSelection = {
          ...state.plannerSelection,
          acceptedContractId: acceptedCompanyContract.companyContractId,
        };
      }

      state.selectedCompanyContractId = acceptedCompanyContract?.companyContractId
        ?? state.selectedCompanyContractId;
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
      acceptingContractOfferIds.delete(contractOfferId);
      if (control) {
        control.removeAttribute("aria-busy");
        control.classList.remove("is-busy");
      }
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
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
      ensurePlannerSelections(state);
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

  async function executePlannerAction(url: string, body: URLSearchParams): Promise<{
    success: boolean;
    message?: string;
    payload?: ContractsViewPayload;
    shell?: ShellSummaryPayload;
    error?: string;
    notificationLevel?: NotificationLevel;
  }> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
    });

    return response.json() as Promise<{
      success: boolean;
      message?: string;
      payload?: ContractsViewPayload;
      shell?: ShellSummaryPayload;
      error?: string;
      notificationLevel?: NotificationLevel;
    }>;
  }

  function applyPlannerActionResult(
    result: {
      success: boolean;
      message?: string;
      payload?: ContractsViewPayload;
      shell?: ShellSummaryPayload;
      error?: string;
      notificationLevel?: NotificationLevel;
    },
  ): boolean {
    if (!result.success || !result.payload || !result.shell) {
      state.message = {
        tone: "error",
        text: result.error ?? result.message ?? "Could not update the route plan.",
      };
      options.onMessage?.(state.message);
      render();
      return false;
    }

    state.payload = result.payload;
    closePlannerReview(state);
    state.message = {
      tone: "notice",
      text: result.message ?? "Route plan updated.",
      notificationLevel: result.notificationLevel,
    };
    state.acceptanceNextStepTab = null;
    ensurePlannerSelections(state);
    ensureActiveTabSelection(state);
    if (state.workspaceTab === "planning") {
      focusPlannerChain(state);
    } else {
      focusSelectedRoute(state);
    }
    options.onShellUpdate?.(result.shell);
    options.onMessage?.(state.message);
    render();
    return true;
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
      const result = await executePlannerAction(url, body);
      applyPlannerActionResult(result);
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

  async function startPlannerFromAcceptedContract(
    companyContractId: string,
    button: HTMLButtonElement,
  ): Promise<void> {
    if (!options.plannerAddUrl) {
      return;
    }

    const originalLabel = button.textContent ?? "Start route";
    button.disabled = true;
    button.textContent = "Starting...";

    try {
      const currentRoutePlanItemCount = state.payload.routePlan?.items.length ?? 0;
      const selectedAcceptedContract = state.payload.acceptedContracts.find((contract) => contract.companyContractId === companyContractId) ?? null;

      if (!selectedAcceptedContract) {
        state.message = {
          tone: "error",
          text: "That accepted contract is no longer available for route planning.",
        };
        options.onMessage?.(state.message);
        render();
        return;
      }

      if (currentRoutePlanItemCount > 0 && !selectedAcceptedContract.routePlanItemId) {
        const clearResult = await executePlannerAction(options.plannerClearUrl, new URLSearchParams());
        if (!applyPlannerActionResult(clearResult)) {
          return;
        }
      }

      const addResult = await executePlannerAction(
        options.plannerAddUrl,
        new URLSearchParams({ sourceType: "accepted_contract", sourceId: companyContractId }),
      );
      if (applyPlannerActionResult(addResult)) {
        state.plannerSelection = {
          ...state.plannerSelection,
          acceptedContractId: companyContractId,
        };
        focusPlannerChain(state);
        render();
      }
    } catch (error) {
      state.message = {
        tone: "error",
        text: error instanceof Error ? error.message : "Could not start route planning from the selected contract.",
      };
      options.onMessage?.(state.message);
      render();
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  function render(focusState: NamedControlFocusState | null = null): void {
    if (state.workspaceTab === "planning") {
      ensurePlannerSelections(state);
    }
    const boardViewState = getCachedBoardViewState(state);
    const plannerCandidates = state.workspaceTab === "planning"
      ? getCachedPlannerCandidates(state)
      : emptyPlannerCandidates;
    ensureActiveTabSelection(state, boardViewState);
    const selectedRoute = resolveSelectedRoute(state, boardViewState);
    const availableCount = boardViewState.availableCount;
    const activeCount = boardViewState.activeCount;
    const riskyActiveCount = boardViewState.riskyActiveCount;
    const closedCount = boardViewState.closedCount;
    const routePlanCount = state.payload.routePlan?.items.length ?? 0;
    const selectedPlannerAcceptedContract = resolveSelectedPlannerAcceptedContract(state);
    const plannerEndpointAirport = resolvePlannerEndpointAirport(state, selectedPlannerAcceptedContract);
    const toolbarHeadline = state.workspaceTab === "planning"
      ? renderPlannerHeadline(state, plannerCandidates.length)
      : state.boardTab === "active" && state.boardScope === "my_contracts"
        ? `${riskyActiveCount} at-risk / overdue contracts`
        : renderHeadline(state.boardTab, availableCount, activeCount, closedCount);
    const toolbarSubtitle = state.workspaceTab === "planning"
      ? `${selectedPlannerAcceptedContract ? `Anchor ${escapeHtml(selectedPlannerAcceptedContract.origin.code)} -> ${escapeHtml(selectedPlannerAcceptedContract.destination.code)} | next origin ${escapeHtml(plannerEndpointAirport?.code ?? selectedPlannerAcceptedContract.destination.code)}` : "Select accepted work to begin route planning."} | ${escapeHtml(formatDate(state.payload.currentTimeUtc))} company time`
      : state.boardTab === "active" && state.boardScope === "my_contracts"
        ? `Filtered to risky accepted work | ${escapeHtml(formatDate(state.payload.currentTimeUtc))} company time`
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
            ${state.boardTab === "active"
              ? `<div class="contracts-board-tabs compact" role="tablist" aria-label="Accepted work views">${renderBoardScopeTab("all", "All active", activeCount, state.boardScope)}${renderBoardScopeTab("my_contracts", "My Contracts", riskyActiveCount, state.boardScope)}</div>`
              : ""}
          </div>
          <div class="panel-body contracts-main-body">
            ${state.acceptanceNextStepTab === "planning" && state.message?.tone === "notice"
              ? renderAcceptanceCallout(state)
              : ""}

            <div class="contracts-board-stage" data-contracts-board-stage>
              <div class="contracts-board-wrap">
                ${state.boardTab === "available"
                  ? renderOffersTable(boardViewState.visibleOffers, boardViewState.selectedOfferId, state, activeBoardPopover)
                  : renderCompanyContractsTable(boardViewState.visibleCompanyContracts, boardViewState.selectedCompanyContractId, state.payload.currentTimeUtc, state.boardTab, state, selectedRoute, activeBoardPopover)}
              </div>
              ${renderContractsBoardActivePopover(state, activeBoardPopover)}
            </div>
          </div>
        </section>
        <div class="contracts-side-column">
          <section class="panel contracts-map-panel">
            <div class="contracts-map-surface">
              <button type="button" class="contracts-map-reset-button" data-map-reset aria-label="Refocus route map" title="Refocus route map">
                ${renderContractsMapResetIcon()}
              </button>
              <svg class="contracts-map" data-contracts-map viewBox="0 0 600 600" role="img" aria-label="Selected contract route map"></svg>
            </div>
          </section>
          ${renderSelectedRoutePanel(selectedRoute, state)}
        </div>
      </div>
    `;

    const planningWorkspaceHtml = `
      <section class="panel contracts-planner-panel contracts-planning-panel">
        <div class="panel-head">
          <div>
            <h3>Route Planning</h3>
            <span class="muted">${escapeHtml(renderPlannerHeadline(state, plannerCandidates.length))}</span>
          </div>
          <div class="planner-panel-actions">
            ${state.payload.routePlan?.items.length
              ? `${state.plannerReview.isOpen ? "" : `<button type="button" class="button-secondary" data-plan-review-open>Review & accept planned offers</button>`}<button type="button" class="button-secondary" data-plan-clear>Clear plan</button>`
              : ""}
          </div>
        </div>
        <div class="panel-body contracts-planner-body">
          ${renderPlannerPanel(state.payload.routePlan, state.plannerReview, plannerCandidates, state, activePlannerAnchorPopover)}
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
          <div class="contracts-toolbar-actions">
            <div class="contracts-workspace-tabs" role="tablist" aria-label="Contracts workspace">
              ${renderWorkspaceTab("board", resolveContractsWorkspaceTabLabel("board"), state.workspaceTab)}
              ${renderWorkspaceTab("planning", `${resolveContractsWorkspaceTabLabel("planning")} ${routePlanCount > 0 ? `(${routePlanCount})` : ""}`.trim(), state.workspaceTab)}
            </div>
          </div>
        </div>
        ${state.workspaceTab === "board" ? boardWorkspaceHtml : planningWorkspaceHtml}
      </div>
    `;

    syncBoardHeaderState();
    syncPlannerAnchorHeaderState();
    renderVisibleMap(root, state, selectedRoute);
    restoreNamedControlFocus(root, focusState);
    positionActiveBoardPopover();
    positionActivePlannerAnchorPopover();
    focusActiveBoardPopoverField(focusState);
    focusActivePlannerAnchorPopoverField(focusState);
  }

  function syncBoardHeaderState(): void {
    root.querySelectorAll<HTMLElement>("[data-sort-field]").forEach((button) => {
      const sortField = button.dataset.sortField as SortField | undefined;
      const column = button.closest<HTMLElement>(".table-header-column");
      if (!sortField || !column) {
        return;
      }

      const isActive = state.sortField === sortField;
      column.setAttribute("aria-sort", isActive
        ? state.sortDirection === "asc" ? "ascending" : "descending"
        : "none");
      column.classList.toggle("is-sorted", isActive);
      button.classList.toggle("current", isActive);
    });
  }

  function positionActiveBoardPopover(): void {
    if (activeBoardPopover === null) {
      return;
    }

    const popover = root.querySelector<HTMLElement>(`[data-contracts-board-popover="${activeBoardPopover}"]`);
    const toggle = root.querySelector<HTMLElement>(`[data-contracts-board-popover-toggle="${activeBoardPopover}"]`);
    const stage = root.querySelector<HTMLElement>("[data-contracts-board-stage]");
    if (!popover || popover.hidden || !toggle || !stage) {
      return;
    }

    const viewportPadding = 12;
    const toggleRect = toggle.getBoundingClientRect();
    const headerRect = toggle.closest("th")?.getBoundingClientRect() ?? toggleRect;
    const stageRect = stage.getBoundingClientRect();
    const viewportLeft = viewportPadding;
    const viewportRight = window.innerWidth - viewportPadding;
    const viewportTop = viewportPadding;
    const viewportBottom = window.innerHeight - viewportPadding;
    const controlType = popover.dataset.contractsBoardControlType ?? "filter";
    const clampViewportLeft = (left: number, width: number): number => {
      const maxLeft = Math.max(viewportLeft, viewportRight - width);
      return Math.max(viewportLeft, Math.min(left, maxLeft));
    };

    popover.style.removeProperty("--contracts-board-popover-width");
    popover.style.removeProperty("--contracts-board-popover-left");
    popover.style.removeProperty("--contracts-board-popover-top");
    delete popover.dataset.contractsBoardPopoverVertical;

    if (controlType === "search") {
      const searchFieldCount = popover.querySelectorAll(".contracts-board-search-field").length;
      const isSearchGroup = popover.dataset.contractsBoardSearchGroup === "true";
      const preferredWidth = searchFieldCount > 1
        ? Math.max(320, Math.min(420, Math.round(headerRect.width + 140)))
        : Math.max(180, Math.min(320, Math.round(headerRect.width - 16)));
      const width = Math.min(preferredWidth, window.innerWidth - (viewportPadding * 2));
      const left = clampViewportLeft(toggleRect.right - width, width);
      popover.style.setProperty("--contracts-board-popover-width", `${width}px`);
      popover.style.setProperty("--contracts-board-popover-left", `${Math.round(left - stageRect.left)}px`);
      let top = isSearchGroup
        ? Math.round(toggleRect.bottom + 8)
        : Math.max(viewportTop, Math.min(
          Math.round(toggleRect.top + (toggleRect.height / 2)),
          viewportBottom,
        ));
      if (isSearchGroup) {
        const popoverHeight = Math.max(120, Math.ceil(popover.getBoundingClientRect().height));
        if (top + popoverHeight > viewportBottom) {
          top = Math.max(viewportTop, Math.round(toggleRect.top - popoverHeight - 8));
        }
        const maxTop = Math.max(viewportTop, viewportBottom - popoverHeight);
        top = Math.max(viewportTop, Math.min(top, maxTop));
      }
      popover.style.setProperty("--contracts-board-popover-top", `${Math.round(top - stageRect.top)}px`);
      return;
    }

    const preferredWidth = Math.min(236, window.innerWidth - (viewportPadding * 2));
    const width = Math.max(180, preferredWidth);
    const left = clampViewportLeft(toggleRect.right - width, width);
    popover.style.setProperty("--contracts-board-popover-width", `${width}px`);
    popover.style.setProperty("--contracts-board-popover-left", `${Math.round(left - stageRect.left)}px`);

    const previousHidden = popover.hidden;
    const previousVisibility = popover.style.visibility;
    if (previousHidden) {
      popover.hidden = false;
      popover.style.visibility = "hidden";
    }
    const popoverHeight = Math.max(120, Math.ceil(popover.getBoundingClientRect().height));
    if (previousHidden) {
      popover.hidden = true;
      popover.style.visibility = previousVisibility;
    }

    let top = Math.round(toggleRect.bottom + 8);
    if (top + popoverHeight > viewportBottom) {
      top = Math.max(viewportTop, Math.round(toggleRect.top - popoverHeight - 8));
      popover.dataset.contractsBoardPopoverVertical = "above";
    } else {
      popover.dataset.contractsBoardPopoverVertical = "below";
    }
    const maxTop = Math.max(viewportTop, viewportBottom - popoverHeight);
    const clampedTop = Math.max(viewportTop, Math.min(top, maxTop));
    popover.style.setProperty("--contracts-board-popover-top", `${Math.round(clampedTop - stageRect.top)}px`);
  }

  function focusActiveBoardPopoverField(focusState: NamedControlFocusState | null): void {
    if (activeBoardPopover === null || focusState !== null) {
      return;
    }

    const firstField = root.querySelector<HTMLElement>(
      `[data-contracts-board-popover="${activeBoardPopover}"] [data-contracts-board-field]`,
    );
    if (!firstField) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (!(firstField instanceof HTMLInputElement || firstField instanceof HTMLSelectElement || firstField instanceof HTMLTextAreaElement)) {
        return;
      }
      focusControlAtEnd(firstField);
    });
  }

  function syncPlannerAnchorHeaderState(): void {
    root.querySelectorAll<HTMLElement>("[data-planner-anchor-sort-field]").forEach((button) => {
      const sortField = button.dataset.plannerAnchorSortField as PlannerAnchorSortField | undefined;
      const column = button.closest<HTMLElement>(".table-header-column");
      if (!sortField || !column) {
        return;
      }

      const isActive = state.plannerAnchorSortField === sortField;
      column.setAttribute("aria-sort", isActive
        ? state.plannerAnchorSortDirection === "asc" ? "ascending" : "descending"
        : "none");
      column.classList.toggle("is-sorted", isActive);
      button.classList.toggle("current", isActive);
    });
  }

  function positionActivePlannerAnchorPopover(): void {
    if (activePlannerAnchorPopover === null) {
      return;
    }

    const popover = root.querySelector<HTMLElement>(`[data-planner-anchor-popover="${activePlannerAnchorPopover}"]`);
    const toggle = root.querySelector<HTMLElement>(`[data-planner-anchor-popover-toggle="${activePlannerAnchorPopover}"]`);
    const stage = root.querySelector<HTMLElement>("[data-planner-anchor-stage]");
    if (!popover || popover.hidden || !toggle || !stage) {
      return;
    }

    const viewportPadding = 12;
    const toggleRect = toggle.getBoundingClientRect();
    const headerRect = toggle.closest("th")?.getBoundingClientRect() ?? toggleRect;
    const stageRect = stage.getBoundingClientRect();
    const viewportLeft = viewportPadding;
    const viewportRight = window.innerWidth - viewportPadding;
    const viewportTop = viewportPadding;
    const viewportBottom = window.innerHeight - viewportPadding;
    const controlType = popover.dataset.plannerAnchorControlType ?? "filter";
    const clampViewportLeft = (left: number, width: number): number => {
      const maxLeft = Math.max(viewportLeft, viewportRight - width);
      return Math.max(viewportLeft, Math.min(left, maxLeft));
    };

    popover.style.removeProperty("--contracts-board-popover-width");
    popover.style.removeProperty("--contracts-board-popover-left");
    popover.style.removeProperty("--contracts-board-popover-top");

    if (controlType === "search") {
      const searchFieldCount = popover.querySelectorAll(".contracts-board-search-field").length;
      const isSearchGroup = popover.dataset.plannerAnchorSearchGroup === "true";
      const preferredWidth = searchFieldCount > 1
        ? Math.max(320, Math.min(420, Math.round(headerRect.width + 140)))
        : Math.max(180, Math.min(320, Math.round(headerRect.width - 16)));
      const width = Math.min(preferredWidth, window.innerWidth - (viewportPadding * 2));
      const left = clampViewportLeft(toggleRect.right - width, width);
      popover.style.setProperty("--contracts-board-popover-width", `${width}px`);
      popover.style.setProperty("--contracts-board-popover-left", `${Math.round(left - stageRect.left)}px`);
      let top = isSearchGroup
        ? Math.round(toggleRect.bottom + 8)
        : Math.max(viewportTop, Math.min(
          Math.round(toggleRect.top + (toggleRect.height / 2)),
          viewportBottom,
        ));
      if (isSearchGroup) {
        const popoverHeight = Math.max(120, Math.ceil(popover.getBoundingClientRect().height));
        if (top + popoverHeight > viewportBottom) {
          top = Math.max(viewportTop, Math.round(toggleRect.top - popoverHeight - 8));
        }
        const maxTop = Math.max(viewportTop, viewportBottom - popoverHeight);
        top = Math.max(viewportTop, Math.min(top, maxTop));
      }
      popover.style.setProperty("--contracts-board-popover-top", `${Math.round(top - stageRect.top)}px`);
      return;
    }

    const preferredWidth = Math.min(236, window.innerWidth - (viewportPadding * 2));
    const width = Math.max(180, preferredWidth);
    const left = clampViewportLeft(toggleRect.right - width, width);
    popover.style.setProperty("--contracts-board-popover-width", `${width}px`);
    popover.style.setProperty("--contracts-board-popover-left", `${Math.round(left - stageRect.left)}px`);

    const previousHidden = popover.hidden;
    const previousVisibility = popover.style.visibility;
    if (previousHidden) {
      popover.hidden = false;
      popover.style.visibility = "hidden";
    }
    const popoverHeight = Math.max(120, Math.ceil(popover.getBoundingClientRect().height));
    if (previousHidden) {
      popover.hidden = true;
      popover.style.visibility = previousVisibility;
    }

    let top = Math.round(toggleRect.bottom + 8);
    if (top + popoverHeight > viewportBottom) {
      top = Math.max(viewportTop, Math.round(toggleRect.top - popoverHeight - 8));
    }
    const maxTop = Math.max(viewportTop, viewportBottom - popoverHeight);
    const clampedTop = Math.max(viewportTop, Math.min(top, maxTop));
    popover.style.setProperty("--contracts-board-popover-top", `${Math.round(clampedTop - stageRect.top)}px`);
  }

  function focusActivePlannerAnchorPopoverField(focusState: NamedControlFocusState | null): void {
    if (activePlannerAnchorPopover === null || focusState !== null) {
      return;
    }

    const firstField = root.querySelector<HTMLElement>(
      `[data-planner-anchor-popover="${activePlannerAnchorPopover}"] [data-planner-anchor-field]`,
    );
    if (!firstField) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (!(firstField instanceof HTMLInputElement || firstField instanceof HTMLSelectElement || firstField instanceof HTMLTextAreaElement)) {
        return;
      }
      focusControlAtEnd(firstField);
    });
  }
}

function buildDispatchUrl(acceptedCompanyContractId: string | null | undefined): URL {
  const dispatchUrl = new URL(window.location.href);
  dispatchUrl.searchParams.set("tab", "dispatch");
  if (acceptedCompanyContractId) {
    dispatchUrl.searchParams.set("dispatchSourceMode", "accepted_contracts");
    dispatchUrl.searchParams.set("dispatchSourceId", acceptedCompanyContractId);
  }
  return dispatchUrl;
}

// Rendering helpers below turn the current UI state into tables, planner cards, and selected-route callouts.
function renderBoardTab(tabId: ContractsBoardTab, label: string, count: number, activeTab: ContractsBoardTab): string {
  return `<button type="button" class="contracts-board-tab ${activeTab === tabId ? "current" : ""}" data-board-tab="${tabId}" role="tab" aria-selected="${activeTab === tabId ? "true" : "false"}"><span>${escapeHtml(label)}</span><span class="contracts-board-tab-count">${escapeHtml(String(count))}</span></button>`;
}

function renderWorkspaceTab(tabId: ContractsWorkspaceTab, label: string, activeTab: ContractsWorkspaceTab): string {
  return `<button type="button" class="contracts-workspace-tab ${activeTab === tabId ? "current" : ""}" data-workspace-tab="${tabId}" role="tab" aria-selected="${activeTab === tabId ? "true" : "false"}"><span>${escapeHtml(label)}</span></button>`;
}

function renderOffersTable(
  offers: ContractsBoardOfferRowView[],
  selectedOfferId: string | null,
  state: ContractsUiState,
  activePopover: ContractsBoardPopoverKey | null,
): string {
  if (offers.length === 0) {
    return `<div class="empty-state">No available contracts match the current filters.</div>`;
  }

  const columnGroup = `<colgroup><col style="width:370px" /><col style="width:140px" /><col style="width:140px" /><col style="width:120px" /><col style="width:120px" /><col style="width:170px" /><col style="width:210px" /></colgroup>`;

  return `
    <table class="contracts-board-table">
      ${columnGroup}
      <thead>
        <tr>
          ${renderContractsBoardHeaderCell("Route", state, activePopover, {
            search: {
              key: "routeSearch",
              label: "Route search",
            },
            sortField: "route",
          })}
          ${renderContractsBoardHeaderCell("Payload", state, activePopover, {
            filter: {
              key: "payloadFilter",
              label: "Payload filter",
            },
            sortField: "payload",
          })}
          ${renderContractsBoardHeaderCell("Payout", state, activePopover, {
            filter: {
              key: "payoutFilter",
              label: "Payout filter",
            },
            sortField: "payout",
          })}
          ${renderContractsBoardHeaderCell("Distance", state, activePopover, {
            filter: {
              key: "distanceFilter",
              label: "Distance filter",
            },
            sortField: "distanceNm",
          })}
          ${renderContractsBoardHeaderCell("Hours Left", state, activePopover, {
            filter: {
              key: "hoursFilter",
              label: "Hours remaining filter",
            },
            sortField: "hoursRemaining",
          })}
          ${renderContractsBoardHeaderCell("Due", state, activePopover, {
            filter: {
              key: "dueFilter",
              label: "Due filter",
            },
            sortField: "dueUtc",
          })}
          ${renderContractsBoardHeaderCell("Nearest Aircraft", state, activePopover, {
            search: {
              key: "aircraftSearch",
              label: "Nearest Aircraft search",
            },
            filter: {
              key: "aircraftFilter",
              label: "Nearest Aircraft filter",
            },
            sortField: "nearestAircraft",
          })}
        </tr>
      </thead>
      <tbody>
        ${offers.map((offer) => renderOfferRow(offer, selectedOfferId === offer.route.contractOfferId, state.payload.currentTimeUtc)).join("")}
      </tbody>
    </table>
  `;
}

function renderCompanyContractsTable(
  contracts: ContractsBoardCompanyContractRowView[],
  selectedCompanyContractId: string | null,
  currentTimeUtc: string,
  boardTab: ContractsBoardTab,
  state: ContractsUiState,
  selectedRoute: SelectedRoute | null,
  activePopover: ContractsBoardPopoverKey | null,
): string {
  if (contracts.length === 0) {
    const emptyLabel = boardTab === "active"
      ? state.boardScope === "my_contracts"
        ? "risky accepted"
        : "accepted or active"
      : "closed";
    return `<div class="empty-state">No ${emptyLabel} contracts match the current filters.</div>`;
  }

  const columnGroup = `<colgroup><col style="width:330px" /><col style="width:130px" /><col style="width:130px" /><col style="width:140px" /><col style="width:120px" /><col style="width:120px" /><col style="width:160px" /><col style="width:210px" /><col style="width:120px" /></colgroup>`;

  return `
    <table class="contracts-board-table">
      ${columnGroup}
      <thead>
        <tr>
          ${renderContractsBoardHeaderCell("Route", state, activePopover, {
            search: {
              key: "routeSearch",
              label: "Route search",
            },
            sortField: "route",
          })}
          ${renderContractsStaticHeaderCell("State")}
          ${renderContractsBoardHeaderCell("Payload", state, activePopover, {
            filter: {
              key: "payloadFilter",
              label: "Payload filter",
            },
            sortField: "payload",
          })}
          ${renderContractsBoardHeaderCell("Payout", state, activePopover, {
            filter: {
              key: "payoutFilter",
              label: "Payout filter",
            },
            sortField: "payout",
          })}
          ${renderContractsBoardHeaderCell("Distance", state, activePopover, {
            filter: {
              key: "distanceFilter",
              label: "Distance filter",
            },
            sortField: "distanceNm",
          })}
          ${renderContractsBoardHeaderCell("Hours Left", state, activePopover, {
            filter: {
              key: "hoursFilter",
              label: "Hours remaining filter",
            },
            sortField: "hoursRemaining",
          })}
          ${renderContractsBoardHeaderCell("Due", state, activePopover, {
            filter: {
              key: "dueFilter",
              label: "Due filter",
            },
            sortField: "dueUtc",
          })}
          ${renderContractsBoardHeaderCell("Nearest Aircraft", state, activePopover, {
            search: {
              key: "aircraftSearch",
              label: "Nearest Aircraft search",
            },
            filter: {
              key: "aircraftFilter",
              label: "Nearest Aircraft filter",
            },
            sortField: "nearestAircraft",
          })}
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${contracts.map((contract) => renderCompanyContractRow(contract, selectedCompanyContractId === contract.route.companyContractId, currentTimeUtc, boardTab)).join("")}
      </tbody>
    </table>
  `;
}

function renderCompanyContractRow(
  contractView: ContractsBoardCompanyContractRowView,
  isSelected: boolean,
  currentTimeUtc: string,
  boardTab: ContractsBoardTab,
): string {
  const contract = contractView.route;
  const workBadgeHtml = renderContractWorkStateBadge(contract.workState);
  const urgencyBadgeHtml = contract.urgencyBand === "stable" ? "" : renderUrgencyBadge(contract.urgencyBand);
  const primaryActionHtml = boardTab === "active" ? renderCompanyContractPrimaryAction(contract) : "";
  const cancelHtml = boardTab === "active" && contract.contractState === "accepted"
    ? `<button type="button" class="button-secondary" data-cancel-contract="${escapeHtml(contract.companyContractId)}">Cancel (${escapeHtml(formatMoney(contract.cancellationPenaltyAmount))})</button>`
    : "";
  const actionsHtml = [primaryActionHtml, cancelHtml].filter(Boolean).join("");

  return `
    <tr class="contract-row ${isSelected ? "selected" : ""}" data-select-company-contract-row="${escapeHtml(contract.companyContractId)}" data-contract-board-tab="${escapeHtml(boardTab)}">
      <td>
        ${renderRouteColumn(contract.origin, contract.destination)}
      </td>
      <td>
        <div class="meta-stack">
          ${renderBadge(resolveCompanyContractBadgeState(contract, boardTab))}
          ${workBadgeHtml}
          ${urgencyBadgeHtml}
        </div>
      </td>
      <td>${escapeHtml(formatPayload(contract))}</td>
      <td>${escapeHtml(formatMoney(contract.payoutAmount))}</td>
      <td>${escapeHtml(formatDistance(contractView.distanceNm))}</td>
      <td>${renderHoursLeftCell(contractView.hoursRemaining, contract.urgencyBand)}</td>
      <td>${renderDueCell(contract.deadlineUtc, currentTimeUtc)}</td>
      <td>${renderAircraftCueCell(contract.nearestRelevantAircraft)}</td>
      <td>${actionsHtml ? `<div class="contract-row-actions">${actionsHtml}</div>` : ``}</td>
    </tr>
  `;
}

function renderOfferRow(offerView: ContractsBoardOfferRowView, isSelected: boolean, currentTimeUtc: string): string {
  const offer = offerView.route;
  return `
    <tr class="contract-row ${isSelected ? "selected" : ""} ${offer.matchesPlannerEndpoint ? "matches-endpoint" : ""}" data-select-offer-row="${escapeHtml(offer.contractOfferId)}">
      <td>
        ${renderRouteColumn(offer.origin, offer.destination)}
      </td>
      <td>${escapeHtml(formatPayload(offer))}</td>
      <td>${escapeHtml(formatMoney(offer.payoutAmount))}</td>
      <td>${escapeHtml(formatDistance(offerView.distanceNm))}</td>
      <td>${renderHoursLeftCell(offerView.hoursRemaining, offer.urgencyBand)}</td>
      <td>${renderDueCell(offer.latestCompletionUtc, currentTimeUtc)}</td>
      <td>${renderAircraftCueCell(offer.nearestRelevantAircraft)}</td>
    </tr>
  `;
}

function renderPlannerHeadline(state: ContractsUiState, candidateCount: number = 0): string {
  const selectedAcceptedContract = resolveSelectedPlannerAcceptedContract(state);
  const plannerEndpointAirport = resolvePlannerEndpointAirport(state, selectedAcceptedContract);
  const routePlanCount = state.payload.routePlan?.items.length ?? 0;

  if (!selectedAcceptedContract) {
    return `${state.payload.acceptedContracts.length} accepted contract${state.payload.acceptedContracts.length === 1 ? "" : "s"} ready to anchor a route`;
  }

  return `${candidateCount} next-leg candidate${candidateCount === 1 ? "" : "s"} from ${plannerEndpointAirport?.code ?? selectedAcceptedContract.destination.code} | ${routePlanCount} item${routePlanCount === 1 ? "" : "s"} in saved chain`;
}

function renderPlannerPanel(
  routePlan: ContractsViewPayload["routePlan"],
  plannerReview: PlannerReviewState,
  plannerCandidates: PlannerCandidateView[],
  state: ContractsUiState,
  activePlannerAnchorPopover: PlannerAnchorPopoverKey | null,
): string {
  const summary = buildPlannerChainSummary(routePlan);
  const filteredAcceptedContracts = getFilteredPlannerAcceptedContracts(state);
  const selectedAcceptedContract = resolveSelectedPlannerAcceptedContract(state);
  const selectedAircraft = resolveSelectedPlannerAircraft(state);
  const activePlannerTable = state.plannerTableView;
  const routePlanHtml = routePlan && routePlan.items.length > 0
    ? renderPlannerRoutePlan(routePlan, plannerReview, state.payload.currentTimeUtc)
    : `<div class="empty-state compact">No saved route chain.</div>`;

  return `
    <div class="planner-shell">
      <section class="panel planner-table-panel">
        <div class="panel-head">
          <div class="planner-table-switch" role="tablist" aria-label="Route planning tables">
            ${renderPlannerTableToggle("accepted", `Accepted (${filteredAcceptedContracts.length})`, activePlannerTable === "accepted")}
            ${renderPlannerTableToggle("candidates", `Next leg (${plannerCandidates.length})`, activePlannerTable === "candidates")}
          </div>
          <div class="pill-row">
            <span class="pill">${escapeHtml(activePlannerTable === "accepted"
              ? `${filteredAcceptedContracts.length} visible accepted`
              : renderPlannerCandidateSubtitle(state, selectedAcceptedContract, selectedAircraft, plannerCandidates.length))}</span>
          </div>
        </div>
        <div class="panel-body">
          ${activePlannerTable === "accepted"
            ? renderPlannerAcceptedContractList(state, filteredAcceptedContracts, selectedAcceptedContract, activePlannerAnchorPopover)
            : renderPlannerCandidateList(state, plannerCandidates, selectedAcceptedContract, selectedAircraft)}
        </div>
      </section>
      <div class="planner-workbench">
        ${renderPlannerSetupCard(state, selectedAcceptedContract, selectedAircraft, summary)}
        <section class="panel planner-chain-panel">
          <div class="panel-head">
            <strong>Saved route chain</strong>
            <div class="pill-row">
              <span class="pill">${escapeHtml(String(summary.itemCount))} items</span>
              <span class="pill">${escapeHtml(formatMoney(summary.payoutTotal))} total payout</span>
            </div>
          </div>
          <div class="panel-body">
            ${renderPlannerSummary(summary)}
            ${routePlanHtml}
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderPlannerTableToggle(
  view: PlannerTableView,
  label: string,
  isCurrent: boolean,
): string {
  return `
    <button
      type="button"
      class="planner-table-toggle ${isCurrent ? "current" : ""}"
      data-planner-table-view="${escapeHtml(view)}"
      role="tab"
      aria-selected="${isCurrent ? "true" : "false"}"
    >${escapeHtml(label)}</button>
  `;
}

function renderPlannerRoutePlan(
  routePlan: ContractsViewPayload["routePlan"],
  plannerReview: PlannerReviewState,
  currentTimeUtc: string,
): string {
  if (!routePlan) {
    return `<div class="empty-state compact">No saved route chain.</div>`;
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
        ${renderPlannerReviewSection("Planned candidates ready to accept", reviewModel.readyToAccept, plannerReview.selectedRoutePlanItemIds, true)}
        ${renderPlannerReviewSection("Accepted work already in the chain", reviewModel.acceptedOrScheduled, plannerReview.selectedRoutePlanItemIds, false)}
        ${renderPlannerReviewSection("Unavailable or stale snapshots", reviewModel.unavailableOrStale, plannerReview.selectedRoutePlanItemIds, false)}
      </div>
    `;
  }

  const displayItems = [...routePlan.items].sort((left, right) => left.sequenceNumber - right.sequenceNumber);
  return `
    <div class="planner-list">
      ${displayItems.map((item) => renderPlannerRoutePlanItem(item, currentTimeUtc)).join("")}
    </div>
  `;
}

function renderPlannerRoutePlanItem(item: ContractsRoutePlanItem, currentTimeUtc: string): string {
  const sourceLabel = item.sourceType === "accepted_contract" ? "Accepted work" : "Planned candidate";
  const sourceTone = item.sourceType === "accepted_contract" ? "accepted" : "planned";
  const statusLabel = item.sourceType === "candidate_offer" && item.plannerItemStatus === "candidate_available"
    ? "Ready to accept"
    : item.plannerItemStatus.replaceAll("_", " ");

  return `
    <article class="planner-item ${item.plannerItemStatus} ${item.sourceType}">
      <div class="planner-item-row">
        <span class="planner-sequence">${item.sequenceNumber}</span>
        <div class="planner-item-main">
          <div class="planner-item-line">
            <div class="planner-item-route-block">
              <strong class="planner-item-route">${escapeHtml(item.origin.code)} -> ${escapeHtml(item.destination.code)}</strong>
              <div class="planner-item-meta-strip">
                <div class="planner-item-source ${sourceTone}">${escapeHtml(sourceLabel)}</div>
                ${renderBadge(statusLabel)}
              </div>
            </div>
            <div class="planner-item-value-block">
              <span class="eyebrow">Payout</span>
              <strong>${escapeHtml(formatMoney(item.payoutAmount))}</strong>
            </div>
          </div>
          <div class="planner-item-subline muted">
            <span class="planner-item-meta-pill">${escapeHtml(formatPayload(item))}</span>
            <span class="planner-item-meta-pill">Due ${escapeHtml(formatDate(item.deadlineUtc))}</span>
            <span class="planner-item-meta-pill">${escapeHtml(formatDeadlineCountdown(item.deadlineUtc, currentTimeUtc))}</span>
          </div>
        </div>
        <div class="planner-item-actions">
          <button type="button" class="button-secondary" data-plan-move-item="${escapeHtml(item.routePlanItemId)}" data-plan-move-direction="up" aria-label="Move route item up">Up</button>
          <button type="button" class="button-secondary" data-plan-move-item="${escapeHtml(item.routePlanItemId)}" data-plan-move-direction="down" aria-label="Move route item down">Down</button>
          <button type="button" class="button-secondary" data-plan-remove-item="${escapeHtml(item.routePlanItemId)}">Drop</button>
        </div>
      </div>
    </article>
  `;
}

function renderPlannerAcceptedContractList(
  state: ContractsUiState,
  acceptedContracts: ContractsViewAcceptedContract[],
  selectedAcceptedContract: ContractsViewAcceptedContract | null,
  activePlannerAnchorPopover: PlannerAnchorPopoverKey | null,
): string {
  if (state.payload.acceptedContracts.length === 0) {
    return `<div class="empty-state compact">No accepted contracts.</div>`;
  }

  if (acceptedContracts.length === 0) {
    return `
      <div class="planner-anchor-stage" data-planner-anchor-stage>
        <div class="planner-anchor-table-wrap" data-planner-anchor-wrap>
        <table class="contracts-board-table planner-anchor-table" data-planner-anchor-table>
          <colgroup>
            <col />
            <col style="width:118px" />
            <col style="width:154px" />
          </colgroup>
          <thead>
            <tr>
              ${renderPlannerAnchorHeaderCell("Route", state, activePlannerAnchorPopover, {
                search: {
                  key: "plannerRouteSearch",
                  label: "Route search",
                },
                sortField: "route",
              })}
              ${renderPlannerAnchorHeaderCell("Hours Left", state, activePlannerAnchorPopover, {
                filter: {
                  key: "plannerHoursFilter",
                  label: "Hours remaining filter",
                },
                sortField: "hoursRemaining",
              })}
              ${renderPlannerAnchorHeaderCell("Due", state, activePlannerAnchorPopover, {
                filter: {
                  key: "plannerDueFilter",
                  label: "Due filter",
                },
                sortField: "dueUtc",
              })}
            </tr>
          </thead>
        </table>
        </div>
        ${renderPlannerAcceptedContractsActivePopover(state, activePlannerAnchorPopover)}
        <div class="empty-state compact">No accepted contracts match the current planner filters.</div>
      </div>
    `;
  }

  return `
    <div class="planner-anchor-stage" data-planner-anchor-stage>
      <div class="planner-anchor-table-wrap" data-planner-anchor-wrap>
        <table class="contracts-board-table planner-anchor-table" data-planner-anchor-table>
          <colgroup>
            <col />
            <col style="width:118px" />
            <col style="width:154px" />
          </colgroup>
          <thead>
            <tr>
              ${renderPlannerAnchorHeaderCell("Route", state, activePlannerAnchorPopover, {
                search: {
                  key: "plannerRouteSearch",
                  label: "Route search",
                },
                sortField: "route",
              })}
              ${renderPlannerAnchorHeaderCell("Hours Left", state, activePlannerAnchorPopover, {
                filter: {
                  key: "plannerHoursFilter",
                  label: "Hours remaining filter",
                },
                sortField: "hoursRemaining",
              })}
              ${renderPlannerAnchorHeaderCell("Due", state, activePlannerAnchorPopover, {
                filter: {
                  key: "plannerDueFilter",
                  label: "Due filter",
                },
                sortField: "dueUtc",
              })}
            </tr>
          </thead>
          <tbody>
            ${acceptedContracts.map((contract) => renderPlannerAcceptedContractRow(state, contract, selectedAcceptedContract?.companyContractId === contract.companyContractId)).join("")}
          </tbody>
        </table>
      </div>
      ${renderPlannerAcceptedContractsActivePopover(state, activePlannerAnchorPopover)}
    </div>
  `;
}

function renderPlannerAcceptedContractRow(
  state: ContractsUiState,
  contract: ContractsViewAcceptedContract,
  isSelected: boolean,
): string {
  return `
    <tr class="contract-row planner-anchor-row ${isSelected ? "selected" : ""}" data-planner-select-contract="${escapeHtml(contract.companyContractId)}" data-planner-anchor-row="${escapeHtml(contract.companyContractId)}" ${contract.routePlanItemId ? 'data-planner-anchor-in-chain="true"' : ""}>
      <td>
        ${renderRouteColumn(contract.origin, contract.destination)}
      </td>
      <td>${renderHoursLeftCell(routeHoursRemaining(contract, state.payload.currentTimeUtc), contract.urgencyBand)}</td>
      <td>${renderDueCell(contract.deadlineUtc, state.payload.currentTimeUtc)}</td>
    </tr>
  `;
}

function renderPlannerSetupCard(
  state: ContractsUiState,
  selectedAcceptedContract: ContractsViewAcceptedContract | null,
  selectedAircraft: ContractsPlannerAircraft | null,
  summary: PlannerChainSummary,
): string {
  const plannerEndpointAirport = resolvePlannerEndpointAirport(state, selectedAcceptedContract);
  const routePlanHasItems = (state.payload.routePlan?.items.length ?? 0) > 0;
  const aircraftOptions = [`<option value="">All company aircraft</option>`]
    .concat(state.payload.plannerAircraft.map((aircraft) => (
      `<option value="${escapeHtml(aircraft.aircraftId)}" ${state.plannerSelection.aircraftId === aircraft.aircraftId ? "selected" : ""}>${escapeHtml(`${aircraft.registration} | ${aircraft.modelDisplayName}`)}</option>`
    )))
    .join("");
  const routeActionLabel = selectedAcceptedContract
    ? selectedAcceptedContract.routePlanItemId
      ? "Route started"
      : routePlanHasItems
      ? "Clear & start route"
      : "Start route"
    : "Start route";
  const routeActionDisabled = !selectedAcceptedContract || Boolean(selectedAcceptedContract.routePlanItemId);
  const dispatchAction = selectedAcceptedContract?.assignedAircraftReady
    ? `<button type="button" data-open-dispatch="${escapeHtml(selectedAcceptedContract.companyContractId)}">Dispatch</button>`
    : "";

  return `
    <section class="planner-setup-card">
      <div class="planner-setup-grid">
        <article class="planner-setup-metric">
          <span class="eyebrow">Selected contract</span>
          <strong>${escapeHtml(selectedAcceptedContract ? `${selectedAcceptedContract.origin.code} -> ${selectedAcceptedContract.destination.code}` : "No selection")}</strong>
          <span class="muted">${escapeHtml(selectedAcceptedContract ? `${formatPayload(selectedAcceptedContract)} | due ${formatDate(selectedAcceptedContract.deadlineUtc)}` : "No visible accepted contract")}</span>
        </article>
        <article class="planner-setup-metric">
          <span class="eyebrow">Current next origin</span>
          <strong>${escapeHtml(plannerEndpointAirport?.code ?? selectedAcceptedContract?.destination.code ?? "--")}</strong>
          <span class="muted">${escapeHtml(plannerEndpointAirport?.name ?? selectedAcceptedContract?.destination.name ?? "No route anchor selected")}</span>
        </article>
        <label class="planner-setup-metric planner-aircraft-picker">
          <span class="eyebrow">Aircraft filter</span>
          <select name="plannerAircraftId">
            ${aircraftOptions}
          </select>
          <span class="muted">${escapeHtml(selectedAircraft ? `${selectedAircraft.registration} | ${selectedAircraft.modelDisplayName}` : "All company aircraft")}</span>
        </label>
        <article class="planner-setup-metric">
          <span class="eyebrow">Saved chain</span>
          <strong>${escapeHtml(String(summary.itemCount))} item${summary.itemCount === 1 ? "" : "s"}</strong>
          <span class="muted">${escapeHtml(summary.itemCount > 0 ? `${summary.acceptedWorkCount} accepted / ${summary.plannedCandidateCount} planned` : "0 accepted / 0 planned")}</span>
        </article>
      </div>
      <div class="planner-selection-actions">
        <button type="button" class="button-secondary" data-plan-start-contract="${escapeHtml(selectedAcceptedContract?.companyContractId ?? "")}" ${routeActionDisabled ? "disabled" : ""}>${escapeHtml(routeActionLabel)}</button>
        ${dispatchAction}
      </div>
    </section>
  `;
}

function renderPlannerCandidateSubtitle(
  state: ContractsUiState,
  selectedAcceptedContract: ContractsViewAcceptedContract | null,
  selectedAircraft: ContractsPlannerAircraft | null,
  candidateCount: number,
): string {
  if (!selectedAcceptedContract) {
    return "No route anchor";
  }

  const plannerEndpointAirport = resolvePlannerEndpointAirport(state, selectedAcceptedContract);
  const endpointCode = plannerEndpointAirport?.code ?? selectedAcceptedContract.destination.code;
  const aircraftLabel = selectedAircraft ? ` | filtered for ${selectedAircraft.registration}` : "";
  return `${candidateCount} from ${endpointCode}${aircraftLabel}`;
}

function renderPlannerCandidateList(
  state: ContractsUiState,
  plannerCandidates: PlannerCandidateView[],
  selectedAcceptedContract: ContractsViewAcceptedContract | null,
  selectedAircraft: ContractsPlannerAircraft | null,
): string {
  if (!selectedAcceptedContract) {
    return `<div class="empty-state compact">No route anchor selected.</div>`;
  }

  if (plannerCandidates.length === 0) {
    const plannerEndpointAirport = resolvePlannerEndpointAirport(state, selectedAcceptedContract);
    return `<div class="empty-state compact">No available next-leg contracts leave ${escapeHtml(plannerEndpointAirport?.code ?? selectedAcceptedContract.destination.code)}${selectedAircraft ? ` that ${escapeHtml(selectedAircraft.registration)} can fly` : ""}.</div>`;
  }

  return `
    <div class="planner-candidate-table-wrap" data-planner-candidate-wrap>
      <table class="contracts-board-table planner-candidate-table" data-planner-candidate-table>
        <colgroup>
          <col style="width:320px" />
          <col style="width:114px" />
          <col style="width:124px" />
          <col style="width:112px" />
          <col style="width:112px" />
          <col style="width:166px" />
          <col style="width:182px" />
        </colgroup>
        <thead>
          <tr>
            ${renderContractsStaticHeaderCell("Route")}
            ${renderContractsStaticHeaderCell("Payload")}
            ${renderContractsStaticHeaderCell("Payout")}
            ${renderContractsStaticHeaderCell("Distance")}
            ${renderContractsStaticHeaderCell("Hours Left")}
            ${renderContractsStaticHeaderCell("Due")}
            ${renderContractsStaticHeaderCell("Plan")}
          </tr>
        </thead>
        <tbody>
          ${plannerCandidates.map((candidate) => renderPlannerCandidateRow(candidate, selectedAircraft, state.payload.currentTimeUtc)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPlannerCandidateRow(
  candidate: PlannerCandidateView,
  selectedAircraft: ContractsPlannerAircraft | null,
  currentTimeUtc: string,
): string {
  const actionHtml = candidate.state === "actionable"
    ? `<button type="button" class="button-secondary" data-planner-add-candidate="${escapeHtml(candidate.offer.contractOfferId)}">Add to chain</button>`
    : `<span class="muted">${escapeHtml(candidate.blockedReason ?? "Blocked")}</span>`;
  const stateBadge = renderBadge(candidate.offer.fitBucket ?? candidate.offer.offerStatus);

  return `
    <tr class="contract-row planner-candidate-row ${candidate.state === "blocked" ? "planner-candidate-row--blocked" : ""}" data-planner-candidate-row="${escapeHtml(candidate.offer.contractOfferId)}">
      <td>
        <div class="meta-stack">
          ${renderRouteColumn(candidate.offer.origin, candidate.offer.destination)}
          <div class="pill-row">${stateBadge}</div>
        </div>
      </td>
      <td>${escapeHtml(formatPayload(candidate.offer))}</td>
      <td>${escapeHtml(formatMoney(candidate.offer.payoutAmount))}</td>
      <td>${escapeHtml(formatDistance(routeDistanceNm(candidate.offer)))}</td>
      <td>${renderHoursLeftCell(candidate.offer.timeRemainingHours, candidate.offer.urgencyBand)}</td>
      <td>${renderDueCell(candidate.offer.latestCompletionUtc, currentTimeUtc)}</td>
      <td>
        <div class="planner-table-action-cell">
          ${actionHtml}
          <span class="muted">${escapeHtml(selectedAircraft ? `${selectedAircraft.registration} fit confirmed` : candidate.detail)}</span>
        </div>
      </td>
    </tr>
  `;
}

function renderRouteColumn(origin: ContractsViewAirport, destination: ContractsViewAirport): string {
  return renderTableRouteCell(
    { code: origin.code, label: origin.name },
    { code: destination.code, label: destination.name },
  );
}

function renderAircraftCueLine(cue: ContractsViewOffer["nearestRelevantAircraft"] | ContractsViewCompanyContract["nearestRelevantAircraft"]): string {
  if (!cue) {
    return `<div class="muted contract-route-detail">Nearest aircraft: none ready</div>`;
  }

  return `
    <div class="muted contract-route-detail">
      <strong>Nearest aircraft:</strong> ${escapeHtml(cue.registration)} | ${escapeHtml(cue.modelDisplayName)} | ${escapeHtml(cue.currentAirport.code)} ${escapeHtml(String(Math.round(cue.distanceNm)))} nm
    </div>
  `;
}

function renderAircraftCueCell(cue: ContractsViewOffer["nearestRelevantAircraft"] | ContractsViewCompanyContract["nearestRelevantAircraft"]): string {
  if (!cue) {
    return `<span class="muted">No ready aircraft</span>`;
  }

  return `
    <div class="meta-stack">
      <strong>${escapeHtml(cue.registration)}</strong>
      <span class="muted">${escapeHtml(cue.modelDisplayName)}</span>
      <span class="muted">${escapeHtml(cue.currentAirport.code)} | ${escapeHtml(String(Math.round(cue.distanceNm)))} nm</span>
    </div>
  `;
}

function renderUrgencyBadge(urgencyBand: ContractsContractUrgencyBand): string {
  const label = urgencyBand === "overdue" ? "Overdue" : "At risk";
  const tone = urgencyBand === "overdue" ? "danger" : "warn";
  return `<span class="badge ${tone}">${label}</span>`;
}

function renderContractWorkStateBadge(workState: ContractsContractWorkState): string {
  const label = workState === "ready_for_dispatch"
    ? "Ready for dispatch"
    : workState === "assigned_elsewhere"
    ? "Assigned elsewhere"
    : "In route plan";
  const tone = workState === "ready_for_dispatch"
    ? "accent"
    : workState === "assigned_elsewhere"
    ? "danger"
    : "neutral";
  return `<span class="badge ${tone}">${label}</span>`;
}

function renderCompanyContractPrimaryAction(contract: ContractsViewCompanyContract): string {
  if (contract.primaryActionKind === "open_route_plan") {
    return `<button type="button" class="button-secondary" data-open-route-plan="${escapeHtml(contract.companyContractId)}">${escapeHtml(contract.primaryActionLabel)}</button>`;
  }

  if (contract.primaryActionKind === "open_dispatch") {
    return contract.assignedAircraftReady
      ? `<button type="button" data-open-dispatch="${escapeHtml(contract.companyContractId)}">${escapeHtml(contract.primaryActionLabel)}</button>`
      : `<button type="button" class="button-secondary" disabled>${escapeHtml(contract.primaryActionLabel)}</button>`;
  }

  return `<button type="button" class="button-secondary" data-plan-add-contract="${escapeHtml(contract.companyContractId)}">${escapeHtml(contract.primaryActionLabel)}</button>`;
}

function renderBoardScopeTab(tabId: ContractsBoardScope, label: string, count: number, activeTab: ContractsBoardScope): string {
  return `<button type="button" class="contracts-board-tab ${activeTab === tabId ? "current" : ""}" data-board-scope="${tabId}" role="tab" aria-selected="${activeTab === tabId ? "true" : "false"}"><span>${escapeHtml(label)}</span><span class="contracts-board-tab-count">${escapeHtml(String(count))}</span></button>`;
}

function renderAcceptanceCallout(state: ContractsUiState): string {
  const acceptedOffer = state.payload.offers.find((offer) => offer.contractOfferId === state.acceptanceNextStepOfferId) ?? null;
  return `<div class="panel-inline-callout contracts-next-step"><div><strong>${escapeHtml(state.message?.text ?? "Contract accepted.")}</strong><div class="muted">Use Accepted / Active to inspect the newly accepted work, or switch to Route Planning to stage the next step.${acceptedOffer ? ` ${escapeHtml(acceptedOffer.directDispatchReason)}` : ""}</div></div><div class="pill-row"><button type="button" class="button-secondary" data-next-step-dismiss>Keep browsing</button><button type="button" class="button-secondary" data-open-route-plan="${state.acceptanceNextStepCompanyContractId ? escapeHtml(state.acceptanceNextStepCompanyContractId) : ""}">Send to route plan</button><button type="button" ${acceptedOffer?.directDispatchEligible ? "" : "disabled"} data-next-step-dispatch>Accept and dispatch</button></div></div>`;
}

function renderSelectedRoutePanel(selectedRoute: SelectedRoute | null, state: ContractsUiState): string {
  if (!selectedRoute) {
    return `
      <section class="panel contracts-selected-panel">
        <div class="panel-head">
          <div>
            <h3>Selected Contract</h3>
            <span class="muted">Select a row to inspect the contract details.</span>
          </div>
        </div>
        <div class="panel-body contracts-selected-body">
          <div class="empty-state compact">Contract details appear here once a row is selected.</div>
        </div>
      </section>
    `;
  }

  if (selectedRoute.kind === "offer") {
    return renderSelectedOfferPanel(selectedRoute.route, state.payload.currentTimeUtc);
  }

  return renderSelectedCompanyContractPanel(selectedRoute.route, state.payload.currentTimeUtc, state.boardTab);
}

function renderSelectedOfferPanel(offer: ContractsViewOffer, currentTimeUtc: string): string {
  return `
    <section
      class="panel contracts-selected-panel contracts-selected-panel--accept-offer"
      data-contracts-selected-panel
      data-accept-selected-pane="${escapeHtml(offer.contractOfferId)}"
      tabindex="0"
      role="button"
      aria-label="${escapeHtml(`Accept contract ${offer.origin.code} to ${offer.destination.code}`)}"
    >
      <div class="panel-head">
        ${renderSelectedRouteHeading(offer.origin.code, offer.origin.name, offer.destination.code, offer.destination.name)}
        <div class="pill-row">
          ${renderBadge(offer.fitBucket ?? offer.offerStatus)}
        </div>
      </div>
      <div class="panel-body contracts-selected-body">
        <div class="contracts-selected-stack">
          <div class="contracts-selected-pair-row">
            ${renderSelectedPairMetric("Payload", formatPayload(offer), `${offer.likelyRole.replaceAll("_", " ")} | ${offer.difficultyBand}`)}
            ${renderSelectedPairMetric("Payout", formatMoney(offer.payoutAmount), "Dynamic until acceptance")}
          </div>
          <div class="contracts-selected-pair-row">
            ${renderSelectedPairMetric("Distance", formatDistance(routeDistanceNm(offer)), "Direct route")}
            ${renderSelectedPairMetric("Due", formatDate(offer.latestCompletionUtc), formatDeadlineCountdown(offer.latestCompletionUtc, currentTimeUtc))}
          </div>
          ${renderSelectedSummaryRow("Nearest Aircraft", formatSelectedAircraftPrimary(offer.nearestRelevantAircraft), formatSelectedAircraftSecondary(offer.nearestRelevantAircraft))}
        </div>
      </div>
    </section>
  `;
}

function renderDueCell(deadlineUtc: string, currentTimeUtc: string): string {
  return renderTableDueCell(deadlineUtc, currentTimeUtc, formatDate);
}

function renderSelectedCompanyContractPanel(
  contract: ContractsViewCompanyContract,
  currentTimeUtc: string,
  boardTab: ContractsBoardTab,
): string {
  const primaryAction = boardTab === "active" ? renderCompanyContractPrimaryAction(contract) : "";
  const cancelAction = boardTab === "active" && contract.contractState === "accepted"
    ? `<button type="button" class="button-secondary" data-cancel-contract="${escapeHtml(contract.companyContractId)}">Cancel (${escapeHtml(formatMoney(contract.cancellationPenaltyAmount))})</button>`
    : "";
  return `
    <section class="panel contracts-selected-panel" data-contracts-selected-panel>
      <div class="panel-head">
        ${renderSelectedRouteHeading(contract.origin.code, contract.origin.name, contract.destination.code, contract.destination.name)}
        <div class="pill-row">
          ${renderBadge(resolveCompanyContractBadgeState(contract, boardTab))}
          ${renderContractWorkStateBadge(contract.workState)}
          ${contract.urgencyBand === "stable" ? "" : renderUrgencyBadge(contract.urgencyBand)}
        </div>
      </div>
      <div class="panel-body contracts-selected-body">
        <div class="contracts-selected-stack">
          <div class="contracts-selected-pair-row">
            ${renderSelectedPairMetric("Payload", formatPayload(contract), contract.primaryActionLabel)}
            ${renderSelectedPairMetric("Payout", formatMoney(contract.payoutAmount), `Penalty ${formatMoney(contract.cancellationPenaltyAmount)}`)}
          </div>
          <div class="contracts-selected-pair-row">
            ${renderSelectedPairMetric("Distance", formatDistance(routeDistanceNm(contract)), "Direct route")}
            ${renderSelectedPairMetric("Due", formatDate(contract.deadlineUtc), formatDeadlineCountdown(contract.deadlineUtc, currentTimeUtc))}
          </div>
          ${renderSelectedSummaryRow("Nearest Aircraft", formatSelectedAircraftPrimary(contract.nearestRelevantAircraft), formatSelectedAircraftSecondary(contract.nearestRelevantAircraft))}
        </div>
        ${primaryAction || cancelAction ? `<div class="contracts-selected-actions">${primaryAction}${cancelAction}</div>` : ""}
      </div>
    </section>
  `;
}

function renderSelectedRouteHeading(
  originCode: string,
  originName: string,
  destinationCode: string,
  destinationName: string,
): string {
  return `
    <div class="contracts-selected-route-head">
      <h3 class="contracts-selected-route-title">${escapeHtml(`${originCode} -> ${destinationCode}`)}</h3>
      <span class="muted contracts-selected-route-subtitle">${escapeHtml(`${originName} | ${destinationName}`)}</span>
    </div>
  `;
}

function renderSelectedSummaryRow(
  label: string,
  primary: string,
  secondary: string,
): string {
  return `
    <article class="contracts-selected-summary-row">
      <span class="eyebrow contracts-selected-summary-label">${escapeHtml(label)}</span>
      <div class="contracts-selected-summary-copy">
        <strong>${escapeHtml(primary)}</strong>
        <span class="muted">${escapeHtml(secondary)}</span>
      </div>
    </article>
  `;
}

function renderSelectedPairMetric(label: string, primary: string, secondary: string): string {
  return `
    <article class="contracts-selected-pair-metric">
      <span class="eyebrow">${escapeHtml(label)}</span>
      <strong>${escapeHtml(primary)}</strong>
      <span class="muted">${escapeHtml(secondary)}</span>
    </article>
  `;
}

function formatSelectedAircraftPrimary(
  cue: ContractsViewOffer["nearestRelevantAircraft"] | ContractsViewCompanyContract["nearestRelevantAircraft"],
): string {
  return cue ? cue.registration : "No ready aircraft";
}

function formatSelectedAircraftSecondary(
  cue: ContractsViewOffer["nearestRelevantAircraft"] | ContractsViewCompanyContract["nearestRelevantAircraft"],
): string {
  return cue
    ? `${cue.modelDisplayName} | ${cue.currentAirport.code} | ${formatDistance(cue.distanceNm)}`
    : "None can cover this route right now.";
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
  const sourceLabel = item.sourceType === "accepted_contract" ? "Accepted work" : "Planned candidate";
  const sourceTone = item.sourceType === "accepted_contract" ? "accepted" : "planned";
  const stateLabel = item.sourceType === "candidate_offer" && item.plannerItemStatus === "candidate_available"
    ? "Ready to accept"
    : item.plannerItemStatus.replaceAll("_", " ");
  return `
    <article class="planner-review-item ${item.plannerItemStatus} ${item.sourceType}">
      ${canSelect ? `<label class="planner-review-toggle"><input type="checkbox" data-plan-review-select="${escapeHtml(item.routePlanItemId)}" ${isSelected ? "checked" : ""} /><span>Select</span></label>` : `<div class="planner-review-toggle static"><span>Locked</span></div>`}
      <div class="meta-stack">
        <div class="planner-item-source ${sourceTone}">${escapeHtml(sourceLabel)}</div>
        <strong>${escapeHtml(item.origin.code)} -> ${escapeHtml(item.destination.code)}</strong>
        <span class="muted">${escapeHtml(formatPayload(item))} | due ${escapeHtml(formatDate(item.deadlineUtc))}</span>
        <span class="muted">${escapeHtml(stateLabel)}</span>
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

function renderSortButton(field: SortField, label: string): string {
  return `<button type="button" class="table-sort" data-sort-field="${field}"><span class="table-header-label">${escapeHtml(label)}</span></button>`;
}

function renderPlannerAnchorSortButton(field: PlannerAnchorSortField, label: string): string {
  return `<button type="button" class="table-sort" data-planner-anchor-sort-field="${field}"><span class="table-header-label">${escapeHtml(label)}</span></button>`;
}

function renderContractsHeaderIcon(kind: "search" | "filter"): string {
  if (kind === "search") {
    return `<svg focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M10.5 3a7.5 7.5 0 1 1 0 15a7.5 7.5 0 0 1 0-15Zm0 2a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11Zm8.2 12.8 2.8 2.8-1.4 1.4-2.8-2.8 1.4-1.4Z"/></svg>`;
  }

  return `<svg focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 6.56l-5.2 5.58v6.11a1.5 1.5 0 0 1-2.44 1.17l-2.4-1.95a1.5 1.5 0 0 1-.56-1.17v-4.16L4.34 6.56A1.5 1.5 0 0 1 4 5.5Z"/></svg>`;
}

function renderContractsMapResetIcon(): string {
  return `<svg focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M11 3h2v3.05a6.95 6.95 0 0 1 4.95 4.95H21v2h-3.05A6.95 6.95 0 0 1 13 17.95V21h-2v-3.05A6.95 6.95 0 0 1 6.05 13H3v-2h3.05A6.95 6.95 0 0 1 11 6.05V3Zm1 5a5 5 0 1 0 0 10a5 5 0 0 0 0-10Zm0 2.2a2.8 2.8 0 1 1 0 5.6a2.8 2.8 0 0 1 0-5.6Z"/></svg>`;
}

function renderContractsBoardIconButton(
  popoverKey: ContractsBoardPopoverKey,
  kind: "search" | "filter",
  label: string,
  isExpanded: boolean,
): string {
  return `<button type="button" class="table-header-icon-button" data-contracts-board-popover-toggle="${escapeHtml(popoverKey)}" aria-label="${escapeHtml(label)}" aria-expanded="${isExpanded ? "true" : "false"}">${renderContractsHeaderIcon(kind)}</button>`;
}

function renderContractsBoardHeaderCell(
  label: string,
  state: ContractsUiState,
  activePopover: ContractsBoardPopoverKey | null,
  options: {
    search?: {
      key: ContractsBoardPopoverKey;
      label: string;
    };
    filter?: {
      key: ContractsBoardPopoverKey;
      label: string;
    };
    sortField?: SortField;
  },
): string {
  const isSorted = options.sortField ? state.sortField === options.sortField : false;
  const ariaSort = options.sortField
    ? isSorted
      ? state.sortDirection === "asc" ? "ascending" : "descending"
      : "none"
    : undefined;
  const searchButton = options.search
    ? renderContractsBoardIconButton(options.search.key, "search", options.search.label, activePopover === options.search.key)
    : "";
  const filterButton = options.filter
    ? renderContractsBoardIconButton(options.filter.key, "filter", options.filter.label, activePopover === options.filter.key)
    : "";
  const labelHtml = options.sortField
    ? renderSortButton(options.sortField, label)
    : `<span class="table-header-label">${escapeHtml(label)}</span>`;
  return `<th class="table-header-column${options.sortField ? " sortable" : ""}${isSorted ? " is-sorted" : ""}"${ariaSort ? ` aria-sort="${ariaSort}"` : ""}><div class="table-header-control">${labelHtml}<span class="table-header-actions">${searchButton}${filterButton}</span></div></th>`;
}

function renderPlannerAnchorHeaderCell(
  label: string,
  state: ContractsUiState,
  activePopover: PlannerAnchorPopoverKey | null,
  options: {
    search?: {
      key: PlannerAnchorPopoverKey;
      label: string;
    };
    filter?: {
      key: PlannerAnchorPopoverKey;
      label: string;
    };
    sortField?: PlannerAnchorSortField;
  },
): string {
  const isSorted = options.sortField ? state.plannerAnchorSortField === options.sortField : false;
  const ariaSort = options.sortField
    ? isSorted
      ? state.plannerAnchorSortDirection === "asc" ? "ascending" : "descending"
      : "none"
    : undefined;
  const searchButton = options.search
    ? renderPlannerAnchorIconButton(options.search.key, "search", options.search.label, activePopover === options.search.key)
    : "";
  const filterButton = options.filter
    ? renderPlannerAnchorIconButton(options.filter.key, "filter", options.filter.label, activePopover === options.filter.key)
    : "";
  const labelHtml = options.sortField
    ? renderPlannerAnchorSortButton(options.sortField, label)
    : `<span class="table-header-label">${escapeHtml(label)}</span>`;
  return `<th class="table-header-column${options.sortField ? " sortable" : ""}${isSorted ? " is-sorted" : ""}"${ariaSort ? ` aria-sort="${ariaSort}"` : ""}><div class="table-header-control">${labelHtml}<span class="table-header-actions">${searchButton}${filterButton}</span></div></th>`;
}

function renderContractsStaticHeaderCell(label: string): string {
  return renderStaticTableHeaderCell(label);
}

function renderPlannerAnchorIconButton(
  popoverKey: PlannerAnchorPopoverKey,
  kind: "search" | "filter",
  label: string,
  isExpanded: boolean,
): string {
  return `<button type="button" class="table-header-icon-button" data-planner-anchor-popover-toggle="${escapeHtml(popoverKey)}" aria-label="${escapeHtml(label)}" aria-expanded="${isExpanded ? "true" : "false"}">${renderContractsHeaderIcon(kind)}</button>`;
}

function renderContractsBoardActivePopover(
  state: ContractsUiState,
  activePopover: ContractsBoardPopoverKey | null,
): string {
  if (activePopover === null) {
    return "";
  }

  switch (activePopover) {
    case "routeSearch":
      return renderContractsBoardSearchGroupControl(
        "routeSearch",
        [
          {
            fieldName: "departureSearchText",
            label: "Departure",
            placeholder: "Search departure",
            ariaLabel: "Search departure airport",
            value: state.filters.departureSearchText,
          },
          {
            fieldName: "destinationSearchText",
            label: "Destination",
            placeholder: "Search destination",
            ariaLabel: "Search destination airport",
            value: state.filters.destinationSearchText,
          },
        ],
      );
    case "aircraftSearch":
      return renderContractsBoardSearchGroupControl(
        "aircraftSearch",
        [
          {
            fieldName: "nearestAircraftSearchText",
            label: "Tail number",
            placeholder: "Search aircraft tail",
            ariaLabel: "Search nearest aircraft tail number",
            value: state.filters.nearestAircraftSearchText,
          },
        ],
      );
    case "payloadFilter":
      return renderContractsBoardFilterControl(
        "payloadFilter",
        `${renderContractsCompactField(
          "Passengers",
          renderContractsRangeFields("passengerPayloadMin", "passengerPayloadMax", {
            minimum: 0,
            step: 1,
            minPlaceholder: "Min",
            maxPlaceholder: "Max",
            minValue: state.filters.passengerPayloadMin,
            maxValue: state.filters.passengerPayloadMax,
          }),
        )}${renderContractsCompactField(
          "Cargo (lb)",
          renderContractsRangeFields("cargoPayloadMin", "cargoPayloadMax", {
            minimum: 0,
            step: 100,
            minPlaceholder: "Min",
            maxPlaceholder: "Max",
            minValue: state.filters.cargoPayloadMin,
            maxValue: state.filters.cargoPayloadMax,
          }),
        )}`,
      );
    case "aircraftFilter":
      return renderContractsBoardFilterControl(
        "aircraftFilter",
        renderContractsCompactField(
          "Availability",
          renderContractsAircraftAvailabilityFieldset(state),
        ),
      );
    case "distanceFilter":
      return renderContractsBoardFilterControl(
        "distanceFilter",
        renderContractsCompactField(
          "Distance (nm)",
          renderContractsRangeFields("distanceMin", "distanceMax", {
            minimum: 0,
            step: 25,
            minPlaceholder: "Min",
            maxPlaceholder: "Max",
            minValue: state.filters.distanceMin,
            maxValue: state.filters.distanceMax,
          }),
        ),
      );
    case "hoursFilter":
      return renderContractsBoardFilterControl(
        "hoursFilter",
        renderContractsCompactField(
          "Hours left",
          renderContractsRangeFields("hoursRemainingMin", "hoursRemainingMax", {
            minimum: 0,
            step: 1,
            minPlaceholder: "Min",
            maxPlaceholder: "Max",
            minValue: state.filters.hoursRemainingMin,
            maxValue: state.filters.hoursRemainingMax,
          }),
        ),
      );
    case "dueFilter":
      return renderContractsBoardFilterControl(
        "dueFilter",
        renderContractsCompactField(
          "Due in (hours)",
          renderContractsRangeFields("dueHoursMin", "dueHoursMax", {
            minimum: 0,
            step: 1,
            minPlaceholder: "Min",
            maxPlaceholder: "Max",
            minValue: state.filters.dueHoursMin,
            maxValue: state.filters.dueHoursMax,
          }),
        ),
      );
    case "payoutFilter":
      return renderContractsBoardFilterControl(
        "payoutFilter",
        renderContractsCompactField(
          "Payout",
          renderContractsRangeFields("payoutMin", "payoutMax", {
            minimum: 0,
            step: 1000,
            minPlaceholder: "Min",
            maxPlaceholder: "Max",
            minValue: state.filters.payoutMin,
            maxValue: state.filters.payoutMax,
          }),
        ),
      );
    default:
      return "";
  }
}

function renderPlannerAcceptedContractsActivePopover(
  state: ContractsUiState,
  activePopover: PlannerAnchorPopoverKey | null,
): string {
  if (activePopover === null) {
    return "";
  }

  switch (activePopover) {
    case "plannerRouteSearch":
      return renderPlannerAnchorSearchGroupControl(
        "plannerRouteSearch",
        [
          {
            fieldName: "departureSearchText",
            label: "Departure",
            placeholder: "Search departure",
            ariaLabel: "Search accepted contract departure airport",
            value: state.plannerAnchorFilters.departureSearchText,
          },
          {
            fieldName: "destinationSearchText",
            label: "Destination",
            placeholder: "Search destination",
            ariaLabel: "Search accepted contract destination airport",
            value: state.plannerAnchorFilters.destinationSearchText,
          },
        ],
      );
    case "plannerHoursFilter":
      return renderPlannerAnchorFilterControl(
        "plannerHoursFilter",
        renderContractsCompactField(
          "Hours left",
          renderPlannerAnchorRangeFields("hoursRemainingMin", "hoursRemainingMax", {
            minimum: 0,
            step: 1,
            minPlaceholder: "Min",
            maxPlaceholder: "Max",
            minValue: state.plannerAnchorFilters.hoursRemainingMin,
            maxValue: state.plannerAnchorFilters.hoursRemainingMax,
          }),
        ),
      );
    case "plannerDueFilter":
      return renderPlannerAnchorFilterControl(
        "plannerDueFilter",
        renderContractsCompactField(
          "Due in (hours)",
          renderPlannerAnchorRangeFields("dueHoursMin", "dueHoursMax", {
            minimum: 0,
            step: 1,
            minPlaceholder: "Min",
            maxPlaceholder: "Max",
            minValue: state.plannerAnchorFilters.dueHoursMin,
            maxValue: state.plannerAnchorFilters.dueHoursMax,
          }),
        ),
      );
    default:
      return "";
  }
}

function renderContractsBoardSearchGroupControl(
  popoverKey: ContractsBoardPopoverKey,
  fields: Array<{
    fieldName: keyof FilterState;
    label: string;
    placeholder: string;
    ariaLabel: string;
    value: string;
  }>,
): string {
  const isMultiField = fields.length > 1;
  return `<div class="contracts-board-header-popover contracts-board-header-popover--search${isMultiField ? " contracts-board-header-popover--search-group" : ""}" data-contracts-board-popover="${escapeHtml(popoverKey)}" data-contracts-board-control-type="search" data-contracts-board-search-group="${isMultiField ? "true" : "false"}"><div class="contracts-board-popover-body contracts-board-popover-body--search">${fields.map((field) => `<label class="contracts-board-search-field"><span class="eyebrow">${escapeHtml(field.label)}</span><input type="search" class="contracts-board-inline-search" name="${escapeHtml(String(field.fieldName))}" value="${escapeHtml(field.value)}" data-contracts-board-field="${escapeHtml(String(field.fieldName))}" placeholder="${escapeHtml(field.placeholder)}" aria-label="${escapeHtml(field.ariaLabel)}" /></label>`).join("")}</div></div>`;
}

function renderContractsBoardFilterControl(popoverKey: ContractsBoardPopoverKey, bodyMarkup: string): string {
  return `<div class="contracts-board-header-popover contracts-board-header-popover--filter" data-contracts-board-popover="${escapeHtml(popoverKey)}" data-contracts-board-control-type="filter"><div class="contracts-board-popover-body">${bodyMarkup}</div></div>`;
}

function renderPlannerAnchorSearchGroupControl(
  popoverKey: PlannerAnchorPopoverKey,
  fields: Array<{
    fieldName: keyof PlannerAnchorFilterState;
    label: string;
    placeholder: string;
    ariaLabel: string;
    value: string;
  }>,
): string {
  const isMultiField = fields.length > 1;
  return `<div class="contracts-board-header-popover contracts-board-header-popover--search${isMultiField ? " contracts-board-header-popover--search-group" : ""}" data-planner-anchor-popover="${escapeHtml(popoverKey)}" data-planner-anchor-control-type="search" data-planner-anchor-search-group="${isMultiField ? "true" : "false"}"><div class="contracts-board-popover-body contracts-board-popover-body--search">${fields.map((field) => `<label class="contracts-board-search-field"><span class="eyebrow">${escapeHtml(field.label)}</span><input type="search" class="contracts-board-inline-search" name="${escapeHtml(String(field.fieldName))}" value="${escapeHtml(field.value)}" data-planner-anchor-field="${escapeHtml(String(field.fieldName))}" placeholder="${escapeHtml(field.placeholder)}" aria-label="${escapeHtml(field.ariaLabel)}" /></label>`).join("")}</div></div>`;
}

function renderPlannerAnchorFilterControl(popoverKey: PlannerAnchorPopoverKey, bodyMarkup: string): string {
  return `<div class="contracts-board-header-popover contracts-board-header-popover--filter" data-planner-anchor-popover="${escapeHtml(popoverKey)}" data-planner-anchor-control-type="filter"><div class="contracts-board-popover-body">${bodyMarkup}</div></div>`;
}

function renderContractsCompactField(label: string, controlMarkup: string): string {
  return `<label class="contracts-board-popover-field"><span class="eyebrow">${escapeHtml(label)}</span>${controlMarkup}</label>`;
}

function renderContractsRangeFields(
  minName: keyof FilterState,
  maxName: keyof FilterState,
  options: {
    minimum?: number;
    step?: number;
    minPlaceholder?: string;
    maxPlaceholder?: string;
    minValue?: string;
    maxValue?: string;
  } = {},
): string {
  const minimum = options.minimum ?? 0;
  const step = options.step ?? 1;
  const minPlaceholder = options.minPlaceholder ?? "Min";
  const maxPlaceholder = options.maxPlaceholder ?? "Max";
  return `<div class="contracts-board-range-fields"><label class="contracts-board-range-field"><span class="eyebrow">Min</span><input name="${escapeHtml(String(minName))}" type="number" min="${escapeHtml(String(minimum))}" step="${escapeHtml(String(step))}" inputmode="numeric" data-contracts-board-field="${escapeHtml(String(minName))}" placeholder="${escapeHtml(minPlaceholder)}" value="${escapeHtml(options.minValue ?? "")}" /></label><label class="contracts-board-range-field"><span class="eyebrow">Max</span><input name="${escapeHtml(String(maxName))}" type="number" min="${escapeHtml(String(minimum))}" step="${escapeHtml(String(step))}" inputmode="numeric" data-contracts-board-field="${escapeHtml(String(maxName))}" placeholder="${escapeHtml(maxPlaceholder)}" value="${escapeHtml(options.maxValue ?? "")}" /></label></div>`;
}

function renderPlannerAnchorRangeFields(
  minName: keyof PlannerAnchorFilterState,
  maxName: keyof PlannerAnchorFilterState,
  options: {
    minimum?: number;
    step?: number;
    minPlaceholder?: string;
    maxPlaceholder?: string;
    minValue?: string;
    maxValue?: string;
  } = {},
): string {
  const minimum = options.minimum ?? 0;
  const step = options.step ?? 1;
  const minPlaceholder = options.minPlaceholder ?? "Min";
  const maxPlaceholder = options.maxPlaceholder ?? "Max";
  return `<div class="contracts-board-range-fields"><label class="contracts-board-range-field"><span class="eyebrow">Min</span><input name="${escapeHtml(String(minName))}" type="number" min="${escapeHtml(String(minimum))}" step="${escapeHtml(String(step))}" inputmode="numeric" data-planner-anchor-field="${escapeHtml(String(minName))}" placeholder="${escapeHtml(minPlaceholder)}" value="${escapeHtml(options.minValue ?? "")}" /></label><label class="contracts-board-range-field"><span class="eyebrow">Max</span><input name="${escapeHtml(String(maxName))}" type="number" min="${escapeHtml(String(minimum))}" step="${escapeHtml(String(step))}" inputmode="numeric" data-planner-anchor-field="${escapeHtml(String(maxName))}" placeholder="${escapeHtml(maxPlaceholder)}" value="${escapeHtml(options.maxValue ?? "")}" /></label></div>`;
}

function renderContractsAircraftAvailabilityFieldset(state: ContractsUiState): string {
  return `<div class="contracts-board-checkbox-list">${[
    {
      name: "readyAircraft",
      label: "Ready aircraft",
      checked: state.filters.readyAircraft,
    },
    {
      name: "noReadyAircraft",
      label: "No ready aircraft",
      checked: state.filters.noReadyAircraft,
    },
  ].map((option) => `<label class="contracts-board-checkbox-option"><input name="${escapeHtml(option.name)}" type="checkbox" data-contracts-board-field="${escapeHtml(option.name)}"${option.checked ? " checked" : ""} /><span>${escapeHtml(option.label)}</span></label>`).join("")}</div>`;
}

function normalizeContractsBoardPopoverKey(value: string | undefined): ContractsBoardPopoverKey | null {
  switch (value) {
    case "routeSearch":
    case "payloadFilter":
    case "aircraftSearch":
    case "aircraftFilter":
    case "distanceFilter":
    case "hoursFilter":
    case "dueFilter":
    case "payoutFilter":
      return value;
    default:
      return null;
  }
}

function normalizePlannerAnchorPopoverKey(value: string | undefined): PlannerAnchorPopoverKey | null {
  switch (value) {
    case "plannerRouteSearch":
    case "plannerHoursFilter":
    case "plannerDueFilter":
      return value;
    default:
      return null;
  }
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
  if (state.boardTab === "active" && state.boardScope === "my_contracts") {
    return [...contracts].sort((left, right) => compareMyContracts(left, right, currentTimeUtc));
  }

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
  switch (sortField) {
    case "route":
      return compareText(routeSortLabel(left), routeSortLabel(right), sortDirection);
    case "payload":
      return compareNumber(routePayloadAmount(left), routePayloadAmount(right), sortDirection)
        || compareText(routeSortLabel(left), routeSortLabel(right), sortDirection);
    case "nearestAircraft":
      return compareNearestAircraft(left.nearestRelevantAircraft, right.nearestRelevantAircraft, sortDirection)
        || compareText(routeSortLabel(left), routeSortLabel(right), sortDirection);
    case "distanceNm":
      return compareNumber(routeDistanceNm(left), routeDistanceNm(right), sortDirection)
        || compareText(routeSortLabel(left), routeSortLabel(right), sortDirection);
    case "hoursRemaining":
      return compareNumber(routeHoursRemaining(left, currentTimeUtc), routeHoursRemaining(right, currentTimeUtc), sortDirection)
        || compareText(routeSortLabel(left), routeSortLabel(right), sortDirection);
    case "dueUtc":
      return compareText(routeDueUtc(left), routeDueUtc(right), sortDirection)
        || compareText(routeSortLabel(left), routeSortLabel(right), sortDirection);
    case "payout":
      return compareNumber(left.payoutAmount, right.payoutAmount, sortDirection)
        || compareText(routeSortLabel(left), routeSortLabel(right), sortDirection);
    default:
      return compareText(routeSortLabel(left), routeSortLabel(right), sortDirection);
  }
}

function compareMyContracts(
  left: ContractsViewCompanyContract,
  right: ContractsViewCompanyContract,
  currentTimeUtc: string,
): number {
  const urgencyWeight = (contract: ContractsViewCompanyContract): number => {
    if (contract.urgencyBand === "overdue") {
      return 0;
    }
    if (contract.urgencyBand === "at_risk") {
      return 1;
    }
    return 2;
  };

  const urgencyDelta = urgencyWeight(left) - urgencyWeight(right);
  if (urgencyDelta !== 0) {
    return urgencyDelta;
  }

  const hoursDelta = routeHoursRemaining(left, currentTimeUtc) - routeHoursRemaining(right, currentTimeUtc);
  if (hoursDelta !== 0) {
    return hoursDelta;
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

function routeDueUtc(route: RouteLike): string {
  return "latestCompletionUtc" in route ? route.latestCompletionUtc : route.deadlineUtc;
}

function routeSortLabel(route: RouteLike): string {
  return [
    route.origin.code,
    route.origin.name,
    route.destination.code,
    route.destination.name,
  ].join(" -> ");
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

export function resolveContractsHoursLeftToneClass(
  hoursRemaining: number,
  urgencyBand: ContractsContractUrgencyBand,
): string {
  return urgencyBand === "overdue"
    ? "contracts-hours-left--overdue"
    : urgencyBand === "at_risk" && hoursRemaining < 16
    ? "contracts-hours-left--at-risk"
    : "";
}

function renderHoursLeftCell(hoursRemaining: number, urgencyBand: ContractsContractUrgencyBand): string {
  const toneClass = resolveContractsHoursLeftToneClass(hoursRemaining, urgencyBand);
  return `<span class="contracts-hours-left${toneClass}">${escapeHtml(formatHoursLeft(hoursRemaining))}</span>`;
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

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

function selectDefaultPlannerAcceptedContractId(payload: ContractsViewPayload): string | null {
  const plannedAcceptedContractId = payload.routePlan?.items.find((item) => item.sourceType === "accepted_contract")?.sourceId;
  if (plannedAcceptedContractId && payload.acceptedContracts.some((contract) => contract.companyContractId === plannedAcceptedContractId)) {
    return plannedAcceptedContractId;
  }

  return payload.acceptedContracts[0]?.companyContractId ?? null;
}

function getActiveContracts(payload: ContractsViewPayload): ContractsViewAcceptedContract[] {
  return payload.acceptedContracts.filter((contract) => activeContractStates.has(contract.contractState));
}

function getClosedContracts(payload: ContractsViewPayload): ContractsViewCompanyContract[] {
  return payload.companyContracts.filter((contract) => closedContractStates.has(contract.contractState));
}

function ensurePlannerSelections(state: ContractsUiState): void {
  const visibleAcceptedContracts = getFilteredPlannerAcceptedContracts(state);
  if (visibleAcceptedContracts.length === 0) {
    state.plannerSelection = {
      ...state.plannerSelection,
      acceptedContractId: null,
    };
  } else if (!visibleAcceptedContracts.some((contract) => contract.companyContractId === state.plannerSelection.acceptedContractId)) {
    state.plannerSelection = {
      ...state.plannerSelection,
      acceptedContractId: visibleAcceptedContracts[0]?.companyContractId ?? null,
    };
  }

  if (state.plannerSelection.aircraftId && !state.payload.plannerAircraft.some((aircraft) => aircraft.aircraftId === state.plannerSelection.aircraftId)) {
    state.plannerSelection = {
      ...state.plannerSelection,
      aircraftId: "",
    };
  }
}

function resolveSelectedPlannerAcceptedContract(state: ContractsUiState): ContractsViewAcceptedContract | null {
  return state.payload.acceptedContracts.find((contract) => contract.companyContractId === state.plannerSelection.acceptedContractId) ?? null;
}

function resolveSelectedPlannerAircraft(state: ContractsUiState): ContractsPlannerAircraft | null {
  return state.payload.plannerAircraft.find((aircraft) => aircraft.aircraftId === state.plannerSelection.aircraftId) ?? null;
}

function isAcceptedContractInCurrentRoutePlan(state: ContractsUiState, companyContractId: string): boolean {
  return Boolean(state.payload.routePlan?.items.some((item) => item.sourceType === "accepted_contract" && item.sourceId === companyContractId));
}

function isPlannerAnchorActive(
  state: ContractsUiState,
  selectedAcceptedContract: ContractsViewAcceptedContract | null = resolveSelectedPlannerAcceptedContract(state),
): boolean {
  if (!selectedAcceptedContract) {
    return false;
  }

  return (state.payload.routePlan?.items.length ?? 0) === 0
    || isAcceptedContractInCurrentRoutePlan(state, selectedAcceptedContract.companyContractId);
}

function resolvePlannerEndpointAirport(
  state: ContractsUiState,
  selectedAcceptedContract: ContractsViewAcceptedContract | null = resolveSelectedPlannerAcceptedContract(state),
): ContractsViewAirport | null {
  if (!selectedAcceptedContract) {
    return null;
  }

  if (state.payload.routePlan?.items.length && isAcceptedContractInCurrentRoutePlan(state, selectedAcceptedContract.companyContractId)) {
    const summary = buildPlannerChainSummary(state.payload.routePlan);
    return summary.endpointAirport ?? selectedAcceptedContract.destination;
  }

  return selectedAcceptedContract.destination;
}

// Derived collections centralize filter rules so selection, counts, and rendering all agree on the same visible set.
function getFilteredOffers(state: ContractsUiState): ContractsViewOffer[] {
  const passengerPayloadMin = Number.parseInt(state.filters.passengerPayloadMin, 10);
  const passengerPayloadMax = Number.parseInt(state.filters.passengerPayloadMax, 10);
  const cargoPayloadMin = Number.parseInt(state.filters.cargoPayloadMin, 10);
  const cargoPayloadMax = Number.parseInt(state.filters.cargoPayloadMax, 10);
  const distanceMin = Number.parseInt(state.filters.distanceMin, 10);
  const distanceMax = Number.parseInt(state.filters.distanceMax, 10);
  const hoursRemainingMin = Number.parseInt(state.filters.hoursRemainingMin, 10);
  const hoursRemainingMax = Number.parseInt(state.filters.hoursRemainingMax, 10);
  const dueHoursMin = Number.parseInt(state.filters.dueHoursMin, 10);
  const dueHoursMax = Number.parseInt(state.filters.dueHoursMax, 10);
  const minPayout = Number.parseInt(state.filters.payoutMin, 10);
  const maxPayout = Number.parseInt(state.filters.payoutMax, 10);
  const departureSearchText = state.appliedTextFilters.departureSearchText.trim().toLowerCase();
  const destinationSearchText = state.appliedTextFilters.destinationSearchText.trim().toLowerCase();
  const nearestAircraftSearchText = state.appliedTextFilters.nearestAircraftSearchText.trim().toLowerCase();

  return state.payload.offers.filter((offer) => {
    const distanceNm = routeDistanceNm(offer);
    const hoursRemaining = routeHoursRemaining(offer, state.payload.currentTimeUtc);

    if (offer.offerStatus !== "available") {
      return false;
    }

    if (!matchesRouteSearchFilters(offer, departureSearchText, destinationSearchText)) {
      return false;
    }

    if (nearestAircraftSearchText && !buildAircraftSearchHaystack(offer.nearestRelevantAircraft).includes(nearestAircraftSearchText)) {
      return false;
    }

    if (!matchesNearestAircraftFilter(offer.nearestRelevantAircraft, state.filters.readyAircraft, state.filters.noReadyAircraft)) {
      return false;
    }

    if (!matchesPayloadFilters(offer, passengerPayloadMin, passengerPayloadMax, cargoPayloadMin, cargoPayloadMax)) {
      return false;
    }

    if (!matchesNumericRange(distanceNm, distanceMin, distanceMax)) {
      return false;
    }

    if (!matchesNumericRange(hoursRemaining, hoursRemainingMin, hoursRemainingMax)) {
      return false;
    }

    if (!matchesNumericRange(hoursRemaining, dueHoursMin, dueHoursMax)) {
      return false;
    }

    if (!matchesNumericRange(offer.payoutAmount, minPayout, maxPayout)) {
      return false;
    }

    return true;
  });
}

function getFilteredCompanyContracts(state: ContractsUiState): ContractsViewCompanyContract[] {
  const source = state.boardTab === "closed"
    ? getClosedContracts(state.payload)
    : getActiveContracts(state.payload);
  const passengerPayloadMin = Number.parseInt(state.filters.passengerPayloadMin, 10);
  const passengerPayloadMax = Number.parseInt(state.filters.passengerPayloadMax, 10);
  const cargoPayloadMin = Number.parseInt(state.filters.cargoPayloadMin, 10);
  const cargoPayloadMax = Number.parseInt(state.filters.cargoPayloadMax, 10);
  const distanceMin = Number.parseInt(state.filters.distanceMin, 10);
  const distanceMax = Number.parseInt(state.filters.distanceMax, 10);
  const hoursRemainingMin = Number.parseInt(state.filters.hoursRemainingMin, 10);
  const hoursRemainingMax = Number.parseInt(state.filters.hoursRemainingMax, 10);
  const dueHoursMin = Number.parseInt(state.filters.dueHoursMin, 10);
  const dueHoursMax = Number.parseInt(state.filters.dueHoursMax, 10);
  const minPayout = Number.parseInt(state.filters.payoutMin, 10);
  const maxPayout = Number.parseInt(state.filters.payoutMax, 10);
  const departureSearchText = state.appliedTextFilters.departureSearchText.trim().toLowerCase();
  const destinationSearchText = state.appliedTextFilters.destinationSearchText.trim().toLowerCase();
  const nearestAircraftSearchText = state.appliedTextFilters.nearestAircraftSearchText.trim().toLowerCase();

  return source.filter((contract) => {
    const distanceNm = routeDistanceNm(contract);
    const hoursRemaining = routeHoursRemaining(contract, state.payload.currentTimeUtc);

    if (state.boardTab === "active" && state.boardScope === "my_contracts" && contract.urgencyBand === "stable") {
      return false;
    }

    if (!matchesRouteSearchFilters(contract, departureSearchText, destinationSearchText)) {
      return false;
    }

    if (nearestAircraftSearchText && !buildAircraftSearchHaystack(contract.nearestRelevantAircraft).includes(nearestAircraftSearchText)) {
      return false;
    }

    if (!matchesNearestAircraftFilter(contract.nearestRelevantAircraft, state.filters.readyAircraft, state.filters.noReadyAircraft)) {
      return false;
    }

    if (!matchesPayloadFilters(contract, passengerPayloadMin, passengerPayloadMax, cargoPayloadMin, cargoPayloadMax)) {
      return false;
    }

    if (!matchesNumericRange(distanceNm, distanceMin, distanceMax)) {
      return false;
    }

    if (!matchesNumericRange(hoursRemaining, hoursRemainingMin, hoursRemainingMax)) {
      return false;
    }

    if (!matchesNumericRange(hoursRemaining, dueHoursMin, dueHoursMax)) {
      return false;
    }

    if (!matchesNumericRange(contract.payoutAmount, minPayout, maxPayout)) {
      return false;
    }

    return true;
  });
}

function getFilteredPlannerCandidates(state: ContractsUiState): PlannerCandidateView[] {
  const selectedAcceptedContract = resolveSelectedPlannerAcceptedContract(state);
  const plannerEndpointAirport = resolvePlannerEndpointAirport(state, selectedAcceptedContract);
  const selectedAircraft = resolveSelectedPlannerAircraft(state);
  const anchorActive = isPlannerAnchorActive(state, selectedAcceptedContract);
  const plannedOfferIds = new Set(
    (state.payload.routePlan?.items ?? [])
      .filter((item) => item.sourceType === "candidate_offer")
      .map((item) => item.sourceId),
  );

  if (!selectedAcceptedContract || !plannerEndpointAirport) {
    return [];
  }

  return state.payload.offers
    .filter((offer) => offer.offerStatus === "available")
    .filter((offer) => offer.origin.airportId === plannerEndpointAirport.airportId)
    .filter((offer) => !plannedOfferIds.has(offer.contractOfferId))
    .filter((offer) => !selectedAircraft || offer.plannerEligibleAircraftIds.includes(selectedAircraft.aircraftId))
    .sort((left, right) =>
      compareText(left.destination.code, right.destination.code, "asc")
      || compareNumber(Date.parse(left.latestCompletionUtc), Date.parse(right.latestCompletionUtc), "asc")
      || compareNumber(right.payoutAmount, left.payoutAmount, "asc"))
    .map((offer) => ({
      offer,
      blockedReason: anchorActive ? null : "Start the route from the selected accepted contract first.",
      state: anchorActive ? "actionable" : "blocked",
      detail: selectedAircraft
        ? `${selectedAircraft.registration} fits payload, range, and airport requirements for this leg.`
        : `${offer.plannerEligibleAircraftIds.length} aircraft in the fleet can plausibly cover this leg shape.`,
    } satisfies PlannerCandidateView));
}

function getFilteredPlannerAcceptedContracts(state: ContractsUiState): ContractsViewAcceptedContract[] {
  const hoursRemainingMin = Number.parseInt(state.plannerAnchorFilters.hoursRemainingMin, 10);
  const hoursRemainingMax = Number.parseInt(state.plannerAnchorFilters.hoursRemainingMax, 10);
  const dueHoursMin = Number.parseInt(state.plannerAnchorFilters.dueHoursMin, 10);
  const dueHoursMax = Number.parseInt(state.plannerAnchorFilters.dueHoursMax, 10);
  const departureSearchText = state.plannerAnchorAppliedTextFilters.departureSearchText.trim().toLowerCase();
  const destinationSearchText = state.plannerAnchorAppliedTextFilters.destinationSearchText.trim().toLowerCase();

  return state.payload.acceptedContracts.filter((contract) => {
    const hoursRemaining = routeHoursRemaining(contract, state.payload.currentTimeUtc);

    if (!matchesRouteSearchFilters(contract, departureSearchText, destinationSearchText)) {
      return false;
    }

    if (!matchesNumericRange(hoursRemaining, hoursRemainingMin, hoursRemainingMax)) {
      return false;
    }

    if (!matchesNumericRange(hoursRemaining, dueHoursMin, dueHoursMax)) {
      return false;
    }

    return true;
  }).sort((left, right) => comparePlannerAcceptedContracts(left, right, state.plannerAnchorSortField, state.plannerAnchorSortDirection, state.payload.currentTimeUtc));
}

function comparePlannerAcceptedContracts(
  left: ContractsViewAcceptedContract,
  right: ContractsViewAcceptedContract,
  sortField: PlannerAnchorSortField | null,
  sortDirection: SortDirection,
  currentTimeUtc: string,
): number {
  if (!sortField) {
    return compareText(routeSortLabel(left), routeSortLabel(right), "asc");
  }

  switch (sortField) {
    case "route":
      return compareText(routeSortLabel(left), routeSortLabel(right), sortDirection);
    case "hoursRemaining":
      return compareNumber(routeHoursRemaining(left, currentTimeUtc), routeHoursRemaining(right, currentTimeUtc), sortDirection)
        || compareText(routeSortLabel(left), routeSortLabel(right), "asc");
    case "dueUtc":
      return compareText(routeDueUtc(left), routeDueUtc(right), sortDirection)
        || compareText(routeSortLabel(left), routeSortLabel(right), "asc");
    default:
      return compareText(routeSortLabel(left), routeSortLabel(right), "asc");
  }
}

function matchesNumericRange(value: number, min: number, max: number): boolean {
  if (!Number.isNaN(min) && value < min) {
    return false;
  }

  if (!Number.isNaN(max) && value > max) {
    return false;
  }

  return true;
}

function hasActiveNumericRange(min: number, max: number): boolean {
  return !Number.isNaN(min) || !Number.isNaN(max);
}

function matchesPayloadFilters(
  route: Pick<RouteLike, "volumeType" | "passengerCount" | "cargoWeightLb">,
  passengerPayloadMin: number,
  passengerPayloadMax: number,
  cargoPayloadMin: number,
  cargoPayloadMax: number,
): boolean {
  const passengerRangeActive = hasActiveNumericRange(passengerPayloadMin, passengerPayloadMax);
  const cargoRangeActive = hasActiveNumericRange(cargoPayloadMin, cargoPayloadMax);

  if (route.volumeType === "passenger") {
    if (!passengerRangeActive && cargoRangeActive) {
      return false;
    }

    return !passengerRangeActive || matchesNumericRange(route.passengerCount ?? 0, passengerPayloadMin, passengerPayloadMax);
  }

  if (!cargoRangeActive && passengerRangeActive) {
    return false;
  }

  return !cargoRangeActive || matchesNumericRange(route.cargoWeightLb ?? 0, cargoPayloadMin, cargoPayloadMax);
}

function routePayloadAmount(route: Pick<RouteLike, "volumeType" | "passengerCount" | "cargoWeightLb">): number {
  return route.volumeType === "cargo"
    ? route.cargoWeightLb ?? 0
    : route.passengerCount ?? 0;
}

function compareNearestAircraft(
  leftCue: ContractsViewOffer["nearestRelevantAircraft"] | ContractsViewCompanyContract["nearestRelevantAircraft"],
  rightCue: ContractsViewOffer["nearestRelevantAircraft"] | ContractsViewCompanyContract["nearestRelevantAircraft"],
  sortDirection: SortDirection,
): number {
  const leftHasCue = leftCue ? 1 : 0;
  const rightHasCue = rightCue ? 1 : 0;
  const availabilityDelta = rightHasCue - leftHasCue;
  if (availabilityDelta !== 0) {
    return availabilityDelta;
  }

  if (!leftCue || !rightCue) {
    return 0;
  }

  return compareNumber(leftCue.distanceNm, rightCue.distanceNm, sortDirection)
    || compareText(leftCue.registration, rightCue.registration, sortDirection);
}

function compareNumber(left: number, right: number, sortDirection: SortDirection): number {
  const delta = sortDirection === "asc" ? left - right : right - left;
  if (delta < 0) {
    return -1;
  }
  if (delta > 0) {
    return 1;
  }
  return 0;
}

function compareText(left: string, right: string, sortDirection: SortDirection): number {
  return sortDirection === "asc"
    ? left.localeCompare(right)
    : right.localeCompare(left);
}

function matchesNearestAircraftFilter(
  cue: ContractsViewOffer["nearestRelevantAircraft"] | ContractsViewCompanyContract["nearestRelevantAircraft"],
  readyAircraft: boolean,
  noReadyAircraft: boolean,
): boolean {
  if (!readyAircraft && !noReadyAircraft) {
    return true;
  }

  if (cue && readyAircraft) {
    return true;
  }

  return !cue && noReadyAircraft;
}

function buildRouteSearchHaystack(route: RouteLike): string {
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

function matchesRouteSearchFilters(route: RouteLike, departureSearchText: string, destinationSearchText: string): boolean {
  if (departureSearchText && !matchesAirportFilter(route.origin, departureSearchText)) {
    return false;
  }

  if (destinationSearchText && !matchesAirportFilter(route.destination, destinationSearchText)) {
    return false;
  }

  return true;
}

function buildAircraftSearchHaystack(
  cue: ContractsViewOffer["nearestRelevantAircraft"] | ContractsViewCompanyContract["nearestRelevantAircraft"],
): string {
  return cue?.registration.toLowerCase() ?? "";
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
  boardViewState: ContractsBoardViewState = computeBoardViewState(state),
): void {
  if (state.boardTab === "available") {
    state.selectedOfferId = boardViewState.selectedOfferId;
    return;
  }

  state.selectedCompanyContractId = boardViewState.selectedCompanyContractId
    ?? selectDefaultCompanyContractId(state.payload, state.boardTab);
}

function resolveSelectedRoute(
  state: ContractsUiState,
  boardViewState: ContractsBoardViewState = computeBoardViewState(state),
): SelectedRoute | null {
  if (state.boardTab === "available") {
    const selectedOffer = boardViewState.visibleOffers.find((offer) => offer.route.contractOfferId === state.selectedOfferId)
      ?? boardViewState.visibleOffers[0]
      ?? null;

    state.selectedOfferId = selectedOffer?.route.contractOfferId ?? null;
    return selectedOffer ? { kind: "offer", route: selectedOffer.route } : null;
  }

  const selectedCompanyContract = boardViewState.visibleCompanyContracts.find((contract) => contract.route.companyContractId === state.selectedCompanyContractId)
    ?? boardViewState.visibleCompanyContracts[0]
    ?? null;

  state.selectedCompanyContractId = selectedCompanyContract?.route.companyContractId ?? null;
  return selectedCompanyContract ? { kind: "company_contract", route: selectedCompanyContract.route } : null;
}

function focusSelectedRoute(state: ContractsUiState, boardViewState: ContractsBoardViewState = computeBoardViewState(state)): void {
  const selectedRoute = resolveSelectedRoute(state, boardViewState);

  if (!selectedRoute) {
    state.map = { ...defaultMapState };
    return;
  }

  const points = [
    selectedRoute.route.origin,
    selectedRoute.route.destination,
    selectedRoute.route.nearestRelevantAircraft?.currentAirport,
  ].filter((airport): airport is ContractsViewAirport => Boolean(airport)).map(toMercatorPoint);

  const minLongitudeNorm = Math.min(...points.map((point) => point.longitudeNorm));
  const maxLongitudeNorm = Math.max(...points.map((point) => point.longitudeNorm));
  const minLatitudeNorm = Math.min(...points.map((point) => point.latitudeNorm));
  const maxLatitudeNorm = Math.max(...points.map((point) => point.latitudeNorm));
  const widthNorm = Math.max(0.015, maxLongitudeNorm - minLongitudeNorm);
  const heightNorm = Math.max(0.015, maxLatitudeNorm - minLatitudeNorm);
  const zoomX = Math.log2((boardMapViewWidthPx - boardMapPaddingPx * 2) / Math.max(widthNorm * mapTileSizePx, 1));
  const zoomY = Math.log2((boardMapViewHeightPx - boardMapPaddingPx * 2) / Math.max(heightNorm * mapTileSizePx, 1));
  const zoom = clamp(Math.floor(Math.min(zoomX, zoomY)), minMapZoom, maxMapZoom);

  state.map = {
    zoom,
    centerLongitudeNorm: wrapUnitInterval((minLongitudeNorm + maxLongitudeNorm) / 2),
    centerLatitudeNorm: clamp((minLatitudeNorm + maxLatitudeNorm) / 2, 0.02, 0.98),
  };
}

function focusPlannerChain(state: ContractsUiState): void {
  const summary = buildPlannerChainSummary(state.payload.routePlan);
  if (summary.items.length === 0) {
    state.map = { ...defaultMapState };
    return;
  }

  const points = summary.items.flatMap((item) => [item.origin, item.destination]).map(toMercatorPoint);
  const minLongitudeNorm = Math.min(...points.map((point) => point.longitudeNorm));
  const maxLongitudeNorm = Math.max(...points.map((point) => point.longitudeNorm));
  const minLatitudeNorm = Math.min(...points.map((point) => point.latitudeNorm));
  const maxLatitudeNorm = Math.max(...points.map((point) => point.latitudeNorm));
  const widthNorm = Math.max(0.015, maxLongitudeNorm - minLongitudeNorm);
  const heightNorm = Math.max(0.015, maxLatitudeNorm - minLatitudeNorm);
  const zoomX = Math.log2((plannerMapViewWidthPx - plannerMapPaddingPx * 2) / Math.max(widthNorm * mapTileSizePx, 1));
  const zoomY = Math.log2((plannerMapViewHeightPx - plannerMapPaddingPx * 2) / Math.max(heightNorm * mapTileSizePx, 1));
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

  renderRouteMapSvg(svg, state.map, { width: boardMapViewWidthPx, height: boardMapViewHeightPx }, selectedRoute
    ? (viewportLeftPx, viewportTopPx, worldSizePx) => renderSelectedOverlay(selectedRoute, viewportLeftPx, viewportTopPx, worldSizePx)
    : () => `<text x="${boardMapViewWidthPx / 2}" y="${boardMapViewHeightPx / 2}" text-anchor="middle" class="map-label muted">Select a contract row to draw the route.</text>`);
}

function renderPlannerMap(root: HTMLElement, state: ContractsUiState): void {
  const svg = root.querySelector<SVGSVGElement>("[data-contracts-plan-map]");
  if (!svg) {
    return;
  }

  const summary = buildPlannerChainSummary(state.payload.routePlan);
  renderRouteMapSvg(svg, state.map, { width: plannerMapViewWidthPx, height: plannerMapViewHeightPx }, (viewportLeftPx, viewportTopPx, worldSizePx) =>
    summary.items.length > 0
      ? renderPlannerChainOverlay(summary, viewportLeftPx, viewportTopPx, worldSizePx)
      : `<text x="${plannerMapViewWidthPx / 2}" y="${plannerMapViewHeightPx / 2}" text-anchor="middle" class="map-label muted">The route plan map appears here once the chain has items.</text>`);
}

function renderVisibleMap(root: HTMLElement, state: ContractsUiState, selectedRoute: SelectedRoute | null): void {
  if (state.workspaceTab === "planning") {
    return;
  }

  renderMap(root, state, selectedRoute);
}

function renderRouteMapSvg(
  svg: SVGSVGElement,
  map: MapState,
  dimensions: { width: number; height: number },
  overlayRenderer: (viewportLeftPx: number, viewportTopPx: number, worldSizePx: number) => string,
): void {
  const worldSizePx = mapTileSizePx * 2 ** map.zoom;
  const tileCount = 2 ** map.zoom;
  const centerWorldX = map.centerLongitudeNorm * worldSizePx;
  const centerWorldY = map.centerLatitudeNorm * worldSizePx;
  const viewportLeftPx = centerWorldX - dimensions.width / 2;
  const viewportTopPx = centerWorldY - dimensions.height / 2;
  const xStartTile = Math.floor(viewportLeftPx / mapTileSizePx);
  const xEndTile = Math.floor((viewportLeftPx + dimensions.width) / mapTileSizePx);
  const yStartTile = Math.max(0, Math.floor(viewportTopPx / mapTileSizePx));
  const yEndTile = Math.min(tileCount - 1, Math.floor((viewportTopPx + dimensions.height) / mapTileSizePx));

  const tileImages: string[] = [];
  for (let tileY = yStartTile; tileY <= yEndTile; tileY += 1) {
    for (let tileX = xStartTile; tileX <= xEndTile; tileX += 1) {
      const wrappedTileX = ((tileX % tileCount) + tileCount) % tileCount;
      tileImages.push(`<image href="${buildTileUrl(map.zoom, wrappedTileX, tileY)}" x="${tileX * mapTileSizePx - viewportLeftPx}" y="${tileY * mapTileSizePx - viewportTopPx}" width="${mapTileSizePx}" height="${mapTileSizePx}" class="map-tile" preserveAspectRatio="none" />`);
    }
  }

  const overlay = overlayRenderer(viewportLeftPx, viewportTopPx, worldSizePx);

  svg.innerHTML = `
    <rect x="0" y="0" width="${dimensions.width}" height="${dimensions.height}" rx="24" class="map-bg" />
    <g class="map-tiles">${tileImages.join("")}</g>
    <rect x="0" y="0" width="${dimensions.width}" height="${dimensions.height}" rx="24" class="map-scrim" />
    <g class="map-grid">
      ${[-120, -60, 0, 60, 120].map((longitude) => {
        const x = wrapUnitInterval((longitude + 180) / 360) * worldSizePx - viewportLeftPx;
        return `<line x1="${x}" y1="16" x2="${x}" y2="${dimensions.height - 16}" />`;
      }).join("")}
      ${[-60, -30, 0, 30, 60].map((latitude) => {
        const y = latitudeToMercatorNorm(latitude) * worldSizePx - viewportTopPx;
        return `<line x1="16" y1="${y}" x2="${dimensions.width - 16}" y2="${y}" />`;
      }).join("")}
    </g>
    <g class="map-overlay">
      ${overlay}
    </g>
  `;
}

function buildPlannerChainSummary(routePlan: ContractsViewPayload["routePlan"]): PlannerChainSummary {
  const items = [...(routePlan?.items ?? [])].sort((left, right) => left.sequenceNumber - right.sequenceNumber);
  const endpointAirport = resolveRoutePlanEndpointAirport(routePlan, items);
  const acceptedWorkCount = items.filter((item) => item.sourceType === "accepted_contract").length;
  const plannedCandidateCount = items.filter((item) => item.sourceType === "candidate_offer").length;
  const payoutTotal = items.reduce((sum, item) => sum + item.payoutAmount, 0);

  return {
    items,
    endpointAirport,
    itemCount: items.length,
    acceptedWorkCount,
    plannedCandidateCount,
    payoutTotal,
    continuityIssues: buildPlannerContinuityIssues(routePlan, items, endpointAirport),
  };
}

function renderPlannerSummary(summary: PlannerChainSummary): string {
  const continuityStatus = summary.continuityIssues.length === 0 ? "Ready" : `${summary.continuityIssues.length} issue${summary.continuityIssues.length === 1 ? "" : "s"}`;
  const continuityTone = summary.continuityIssues.length > 0 ? "warning" : "accent";
  return `
    <div class="planner-summary-strip">
      <article class="planner-summary-stat">
        <span class="eyebrow">Chain</span>
        <strong>${escapeHtml(`${summary.itemCount} item${summary.itemCount === 1 ? "" : "s"}`)}</strong>
        <span class="muted">${escapeHtml(`${summary.acceptedWorkCount} accepted / ${summary.plannedCandidateCount} planned`)}</span>
      </article>
      <article class="planner-summary-stat">
        <span class="eyebrow">Endpoint</span>
        <strong>${escapeHtml(summary.endpointAirport ? summary.endpointAirport.code : "Not set")}</strong>
        <span class="muted">${escapeHtml(summary.endpointAirport ? summary.endpointAirport.name : "Start a chain to set the endpoint.")}</span>
      </article>
      <article class="planner-summary-stat">
        <span class="eyebrow">Payout</span>
        <strong>${escapeHtml(formatMoney(summary.payoutTotal))}</strong>
        <span class="muted">Accepted plus planned value</span>
      </article>
      <article class="planner-summary-stat ${continuityTone}">
        <span class="eyebrow">Continuity</span>
        <strong>${escapeHtml(continuityStatus)}</strong>
        <span class="muted">${escapeHtml(summary.continuityIssues.length === 0 ? "No breaks visible." : "Review the flagged legs below.")}</span>
      </article>
    </div>
    ${summary.continuityIssues.length > 0
      ? `<div class="planner-continuity-inline-list">${summary.continuityIssues.map((issue) => `<div class="planner-continuity-inline-issue">${escapeHtml(issue)}</div>`).join("")}</div>`
      : ""}
  `;
}

function renderPlannerChainMap(summary: PlannerChainSummary): string {
  return `
    <svg class="contracts-map contracts-plan-map" data-contracts-plan-map viewBox="0 0 1000 560" role="img" aria-label="${escapeHtml(summary.itemCount > 0 ? `Route planning chain map with ${summary.itemCount} items` : "Empty route planning chain map")}"></svg>
  `;
}

function renderPlannerChainOverlay(
  summary: PlannerChainSummary,
  viewportLeftPx: number,
  viewportTopPx: number,
  worldSizePx: number,
): string {
  const segments = summary.items.map((item) => {
    const origin = projectAirportToViewport(item.origin, viewportLeftPx, viewportTopPx, worldSizePx);
    const destination = projectAirportToViewport(item.destination, viewportLeftPx, viewportTopPx, worldSizePx);
    const routeTone = item.sourceType === "accepted_contract" ? "accepted" : "planned";
    const routeLabel = item.sourceType === "accepted_contract" ? "Accepted work" : "Planned candidate";
    const routeStatus = item.plannerItemStatus.replaceAll("_", " ");
    return `
      <g class="map-segment ${routeTone}">
        <circle cx="${origin.x}" cy="${origin.y}" r="14" class="map-sequence ${routeTone}" />
        <text x="${origin.x}" y="${origin.y + 5}" text-anchor="middle" class="map-sequence-text">${item.sequenceNumber}</text>
        <circle cx="${origin.x}" cy="${origin.y}" r="28" class="map-range-ring origin ${routeTone}" />
        <circle cx="${destination.x}" cy="${destination.y}" r="28" class="map-range-ring destination ${routeTone}" />
        <line x1="${origin.x}" y1="${origin.y}" x2="${destination.x}" y2="${destination.y}" class="map-route ${routeTone}" />
        <circle cx="${origin.x}" cy="${origin.y}" r="8" class="map-point ${routeTone}" />
        <circle cx="${destination.x}" cy="${destination.y}" r="8" class="map-point ${routeTone}" />
        <text x="${origin.x + 14}" y="${origin.y - 16}" class="map-label">${escapeHtml(item.origin.code)}</text>
        <text x="${destination.x + 14}" y="${destination.y - 16}" class="map-label">${escapeHtml(item.destination.code)}</text>
        <text x="${destination.x + 14}" y="${destination.y + 18}" class="map-label map-segment-label">${escapeHtml(routeLabel)} | ${escapeHtml(routeStatus)}</text>
      </g>
    `;
  }).join("");

  const endpointPoint = summary.endpointAirport
    ? projectAirportToViewport(summary.endpointAirport, viewportLeftPx, viewportTopPx, worldSizePx)
    : null;

  return `
    ${segments}
    ${endpointPoint
      ? `<circle cx="${endpointPoint.x}" cy="${endpointPoint.y}" r="18" class="map-range-ring destination" /><text x="${endpointPoint.x + 14}" y="${endpointPoint.y + 4}" class="map-label">${escapeHtml(summary.endpointAirport?.code ?? "")}</text>`
      : `<text x="500" y="280" text-anchor="middle" class="map-label muted">No chain endpoint is set yet.</text>`}
  `;
}

function resolveRoutePlanEndpointAirport(
  routePlan: ContractsViewPayload["routePlan"],
  items: ContractsRoutePlanItem[],
): ContractsViewAirport | null {
  if (!routePlan?.endpointAirportId) {
    return null;
  }

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item) {
      continue;
    }
    if (item.destination.airportId === routePlan.endpointAirportId) {
      return item.destination;
    }
    if (item.origin.airportId === routePlan.endpointAirportId) {
      return item.origin;
    }
  }

  return null;
}

function buildPlannerContinuityIssues(
  routePlan: ContractsViewPayload["routePlan"],
  items: ContractsRoutePlanItem[],
  endpointAirport: ContractsViewAirport | null,
): string[] {
  const issues: string[] = [];

  if (items.length === 0) {
    issues.push("No route chain has been built yet.");
    return issues;
  }

  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (!previous || !current) {
      continue;
    }
    if (previous.destination.airportId !== current.origin.airportId) {
      issues.push(`Sequence ${current.sequenceNumber} starts at ${current.origin.code}, but the previous leg ends at ${previous.destination.code}.`);
    }
  }

  const tail = items.at(-1);
  if (routePlan?.endpointAirportId && tail && tail.destination.airportId !== routePlan.endpointAirportId) {
    issues.push(`Current endpoint ${routePlan.endpointAirportId} does not match the chain tail ${tail.destination.code}.`);
  }

  const staleItems = items.filter((item) => item.plannerItemStatus === "candidate_stale");
  if (staleItems.length > 0) {
    issues.push(`${staleItems.length} planned candidate${staleItems.length === 1 ? "" : "s"} are stale.`);
  }

  return issues;
}

function renderSelectedOverlay(
  selectedRoute: SelectedRoute,
  viewportLeftPx: number,
  viewportTopPx: number,
  worldSizePx: number,
): string {
  const origin = projectAirportToViewport(selectedRoute.route.origin, viewportLeftPx, viewportTopPx, worldSizePx);
  const destination = projectAirportToViewport(selectedRoute.route.destination, viewportLeftPx, viewportTopPx, worldSizePx);
  const nearestAircraft = selectedRoute.route.nearestRelevantAircraft;
  const aircraftPoint = nearestAircraft ? projectAirportToViewport(nearestAircraft.currentAirport, viewportLeftPx, viewportTopPx, worldSizePx) : null;

  return `
    ${aircraftPoint
      ? `<line x1="${aircraftPoint.x}" y1="${aircraftPoint.y}" x2="${origin.x}" y2="${origin.y}" class="map-route reposition" />
         <circle cx="${aircraftPoint.x}" cy="${aircraftPoint.y}" r="11" class="map-point aircraft" />
         <text x="${aircraftPoint.x + 14}" y="${aircraftPoint.y - 14}" class="map-label">${escapeHtml(nearestAircraft?.registration ?? "")}</text>`
      : ""}
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
    ? target.closest<SVGSVGElement>("[data-contracts-map], [data-contracts-plan-map]")
    : null;
}

function wrapUnitInterval(value: number): number {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}






























