/*
 * Browser controller for the aircraft tab inside the save shell.
 * It manages client-side selection, filtering, sorting, and detail-panel updates for the fleet command view.
 * The guiding split is: this file owns transient UI state only, while `aircraft-tab-model.ts` owns the expensive
 * simulation-derived shaping. If you need to change what the player sees conceptually, start in the model file first.
 */

import {
  applyAircraftFleetViewState,
  applyAircraftMarketViewState,
  type AircraftDealStructure,
  type AircraftCompareSource,
  type AircraftCompareItemView,
  type AircraftCompareRef,
  type AircraftCompareTab,
  compareKeyForRef,
  resolveAircraftCompareItem,
  type AircraftFleetViewState,
  type AircraftMarketDealOptionView,
  type AircraftMarketFilters,
  type AircraftMarketOfferView,
  type AircraftMarketSort,
  type AircraftMarketSortDirection,
  type AircraftMarketSortKey,
  type AircraftMarketViewState,
  type AircraftMarketWorkspacePayload,
  type AircraftTabAircraftView,
  type AircraftTabPayload,
  type AircraftWorkspaceTab,
  type AircraftTableFilters,
  type AircraftTableSort,
  type AircraftTableSortDirection,
  type AircraftTableSortKey,
} from "../aircraft-tab-model.js";

export interface AircraftTabController {
  destroy(): void;
}

const workspaceStoragePrefix = "flightline:aircraft-workspace:";

interface AcquisitionReviewState {
  offerId: string;
  ownershipType: AircraftDealStructure;
  selectedOptionId: string;
}

interface AircraftCompareState {
  isOpen: boolean;
  items: AircraftCompareRef[];
  baselineKey: string | null;
  focusedKey: string | null;
  activeTab: AircraftCompareTab;
  pendingReplacement: AircraftCompareRef | null;
}

type AircraftMarketPopoverKey = "listing" | "airport" | "condition" | "passengers" | "cargo" | "range" | "ask" | "distance";

interface StoredAircraftCompareState {
  isOpen?: boolean;
  items?: AircraftCompareRef[];
  baselineKey?: string | null;
  focusedKey?: string | null;
  activeTab?: AircraftCompareTab;
}

const compareStoragePrefix = "flightline:aircraft-compare:";
const compareTabs: AircraftCompareTab[] = ["specs", "maintenance", "economics"];
type AircraftMarketFilterField = Extract<keyof AircraftMarketFilters, string>;

// Mounts the aircraft workspace controller and keeps only short-lived UI state such as selected rows and filter choices.
// All expensive fleet/market shaping is already done server-side in `aircraft-tab-model.ts`.
export function mountAircraftTab(host: HTMLElement, payload: AircraftTabPayload): AircraftTabController {
  let workspaceTab = loadStoredWorkspace(payload.saveId) ?? payload.defaultWorkspaceTab;
  storeWorkspace(payload.saveId, workspaceTab);
  let fleetFilters: AircraftTableFilters = payload.fleetWorkspace.defaultFilters;
  let fleetSort: AircraftTableSort = payload.fleetWorkspace.defaultSort;
  let selectedAircraftId = payload.fleetWorkspace.aircraft[0]?.aircraftId;
  let marketFilters = payload.marketWorkspace.defaultFilters;
  let marketSort = payload.marketWorkspace.defaultSort;
  let selectedOfferId = payload.marketWorkspace.defaultSelectedOfferId;
  let acquisitionReview: AcquisitionReviewState | null = null;
  let activeMarketPopover: AircraftMarketPopoverKey | null = null;
  let marketOverlayOpen = false;
  let compareState = loadStoredCompareState(payload.saveId) ?? {
    isOpen: false,
    items: [],
    baselineKey: null,
    focusedKey: null,
    activeTab: "specs",
    pendingReplacement: null,
  };
  let fleetListScrollTop = 0;
  let marketListScrollTop = 0;

  function captureScrollState(): void {
    const fleetList = host.querySelector<HTMLElement>("[data-aircraft-scroll='fleet-list']");
    const marketList = host.querySelector<HTMLElement>("[data-aircraft-scroll='market-list']");
    if (fleetList) {
      fleetListScrollTop = fleetList.scrollTop;
    }
    if (marketList) {
      marketListScrollTop = marketList.scrollTop;
    }
  }

  function render(): void {
    captureScrollState();
    const previousSelectedOfferId = selectedOfferId;
    compareState = normalizeCompareState(compareState, payload);
    const fleetViewState = applyAircraftFleetViewState(payload.fleetWorkspace, {
      filters: fleetFilters,
      sort: fleetSort,
      selectedAircraftId,
    });
    const marketViewState = applyAircraftMarketViewState(payload.marketWorkspace, {
      filters: marketFilters,
      sort: marketSort,
      selectedOfferId,
    });

    selectedAircraftId = fleetViewState.selectedAircraftId;
    selectedOfferId = marketViewState.selectedOfferId;
    acquisitionReview = normalizeAcquisitionReview(acquisitionReview, marketViewState);
    if (
      marketOverlayOpen
      && previousSelectedOfferId
      && !marketViewState.visibleOffers.some((offer) => offer.aircraftOfferId === previousSelectedOfferId)
    ) {
      marketOverlayOpen = false;
      acquisitionReview = null;
    }
    host.innerHTML = renderAircraftTab(payload, workspaceTab, fleetViewState, marketViewState, acquisitionReview, compareState, activeMarketPopover);
    syncMarketHeaderState();
    setMarketOverlayVisible(workspaceTab === "market" && marketOverlayOpen);
    const fleetList = host.querySelector<HTMLElement>("[data-aircraft-scroll='fleet-list']");
    const marketList = host.querySelector<HTMLElement>("[data-aircraft-scroll='market-list']");
    if (fleetList) {
      fleetList.scrollTop = fleetListScrollTop;
    }
    if (marketList) {
      marketList.scrollTop = marketListScrollTop;
    }
    positionActiveMarketPopover();
    positionMarketOverlay();
  }

  function syncMarketHeaderState(): void {
    host.querySelectorAll<HTMLElement>("[data-market-sort-key]").forEach((button) => {
      const sortKey = button.dataset.marketSortKey as AircraftMarketSortKey | undefined;
      const column = button.closest<HTMLElement>("[data-aircraft-market-column]");
      if (!sortKey || !column) {
        return;
      }

      const isActive = marketSort.key === sortKey;
      column.setAttribute("aria-sort", isActive
        ? marketSort.direction === "asc" ? "ascending" : "descending"
        : "none");
      column.classList.toggle("is-sorted", isActive);
      button.classList.toggle("current", isActive);
    });
  }

  function focusMarketField(fieldName: string): void {
    if (activeMarketPopover === null) {
      return;
    }

    window.requestAnimationFrame(() => {
      const field = host.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[data-market-popover="${activeMarketPopover}"] [data-market-field="${fieldName}"]`,
      );
      if (!field) {
        return;
      }
      field.focus();
      if (field instanceof HTMLInputElement && (field.type === "search" || field.type === "text")) {
        field.selectionStart = field.selectionEnd = field.value.length;
      }
    });
  }

  function positionActiveMarketPopover(): void {
    if (activeMarketPopover === null) {
      return;
    }

    const popover = host.querySelector<HTMLElement>(`[data-market-popover="${activeMarketPopover}"]`);
    const toggle = host.querySelector<HTMLElement>(`[data-market-popover-toggle="${activeMarketPopover}"]`);
    const stage = host.querySelector<HTMLElement>("[data-aircraft-market-stage]");
    if (!popover || popover.hidden || !toggle || !stage) {
      return;
    }

    const controlType = popover.dataset.marketControlType ?? "filter";
    const viewportPadding = 12;
    const toggleRect = toggle.getBoundingClientRect();
    const headerRect = toggle.closest("th")?.getBoundingClientRect() ?? toggleRect;
    const stageRect = stage.getBoundingClientRect();
    const viewportLeft = viewportPadding;
    const viewportRight = window.innerWidth - viewportPadding;
    const viewportTop = viewportPadding;
    const viewportBottom = window.innerHeight - viewportPadding;
    const clampViewportLeft = (left: number, width: number): number => {
      const maxLeft = Math.max(viewportLeft, viewportRight - width);
      return Math.max(viewportLeft, Math.min(left, maxLeft));
    };

    popover.style.removeProperty("--aircraft-market-popover-width");
    popover.style.removeProperty("--aircraft-market-popover-left");
    popover.style.removeProperty("--aircraft-market-popover-top");
    delete popover.dataset.marketPopoverSide;
    delete popover.dataset.marketPopoverVertical;

    if (controlType === "search") {
      const preferredWidth = Math.max(180, Math.min(320, Math.round(headerRect.width - 16)));
      const width = Math.min(preferredWidth, window.innerWidth - (viewportPadding * 2));
      const left = clampViewportLeft(toggleRect.right - width, width);
      const top = Math.max(viewportTop, Math.min(
        Math.round(toggleRect.top + (toggleRect.height / 2)),
        viewportBottom,
      ));
      popover.style.setProperty("--aircraft-market-popover-width", `${width}px`);
      popover.style.setProperty("--aircraft-market-popover-left", `${Math.round(left - stageRect.left)}px`);
      popover.style.setProperty("--aircraft-market-popover-top", `${Math.round(top - stageRect.top)}px`);
      return;
    }

    const preferredWidth = Math.min(236, window.innerWidth - (viewportPadding * 2));
    const width = Math.max(180, preferredWidth);
    const left = clampViewportLeft(toggleRect.right - width, width);
    popover.style.setProperty("--aircraft-market-popover-width", `${width}px`);
    popover.style.setProperty("--aircraft-market-popover-left", `${Math.round(left - stageRect.left)}px`);

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
      popover.dataset.marketPopoverVertical = "above";
    } else {
      popover.dataset.marketPopoverVertical = "below";
    }
    const maxTop = Math.max(viewportTop, viewportBottom - popoverHeight);
    const clampedTop = Math.max(viewportTop, Math.min(top, maxTop));
    popover.style.setProperty("--aircraft-market-popover-top", `${Math.round(clampedTop - stageRect.top)}px`);
  }

  function setMarketOverlayVisible(isVisible: boolean): void {
    const overlay = host.querySelector<HTMLElement>("[data-aircraft-market-overlay]");
    const stage = host.querySelector<HTMLElement>("[data-aircraft-market-stage]");
    if (!overlay || !stage) {
      return;
    }

    overlay.hidden = !isVisible;
    stage.classList.toggle("overlay-open", isVisible);
    if (!isVisible) {
      overlay.style.removeProperty("--aircraft-market-overlay-max-height");
      const overlayCard = overlay.querySelector<HTMLElement>(".aircraft-market-overlay-card");
      overlayCard?.style.removeProperty("--aircraft-market-overlay-nudge");
    }
  }

  function positionMarketOverlay(): void {
    if (!marketOverlayOpen || workspaceTab !== "market") {
      return;
    }

    const overlay = host.querySelector<HTMLElement>("[data-aircraft-market-overlay]");
    const panel = host.querySelector<HTMLElement>(".aircraft-market-panel");
    const overlayCard = overlay?.querySelector<HTMLElement>(".aircraft-market-overlay-card");
    if (!overlay || overlay.hidden || !panel || !overlayCard) {
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    const topOffset = Math.max(12, Math.round(panelRect.top));
    const bottomPadding = 12;
    const maxHeight = Math.max(320, Math.round(window.innerHeight - topOffset - bottomPadding));
    overlay.style.setProperty("--aircraft-market-overlay-max-height", `${maxHeight}px`);
    overlayCard.style.removeProperty("--aircraft-market-overlay-nudge");
    const cardRect = overlayCard.getBoundingClientRect();
    const nudge = Math.round(topOffset - cardRect.top);
    overlayCard.style.setProperty("--aircraft-market-overlay-nudge", `${nudge}px`);
  }

  function closeMarketOverlay(): void {
    marketOverlayOpen = false;
    acquisitionReview = null;
    render();
  }

  function closeMarketPopover(): void {
    if (activeMarketPopover === null) {
      return;
    }

    activeMarketPopover = null;
    render();
  }

  function toggleMarketPopover(popoverKey: AircraftMarketPopoverKey): void {
    activeMarketPopover = activeMarketPopover === popoverKey ? null : popoverKey;
    render();
    if (activeMarketPopover !== null) {
      focusMarketField(defaultMarketFieldForPopover(activeMarketPopover));
    }
  }

  function handleClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const compareToggleButton = target.closest<HTMLElement>("[data-aircraft-compare-toggle]");
    if (compareToggleButton) {
      event.preventDefault();
      const compareSource = compareToggleButton.dataset.aircraftCompareSource as AircraftCompareSource | undefined;
      const aircraftId = compareToggleButton.dataset.aircraftCompareId;
      if (!compareSource || !aircraftId) {
        return;
      }
      toggleCompareSelection({ source: compareSource, aircraftId });
      return;
    }

    if (target.closest("[data-aircraft-compare-open]")) {
      event.preventDefault();
      if (compareState.items.length > 0) {
        compareState = {
          ...compareState,
          isOpen: true,
        };
        saveCompareState(payload.saveId, compareState);
        render();
      }
      return;
    }

    if (target.closest("[data-aircraft-compare-close]")) {
      event.preventDefault();
      compareState = {
        ...compareState,
        isOpen: false,
        pendingReplacement: null,
      };
      saveCompareState(payload.saveId, compareState);
      render();
      return;
    }

    if (target.closest("[data-aircraft-compare-clear]")) {
      event.preventDefault();
      compareState = {
        isOpen: false,
        items: [],
        baselineKey: null,
        focusedKey: null,
        activeTab: "specs",
        pendingReplacement: null,
      };
      saveCompareState(payload.saveId, compareState);
      render();
      return;
    }

    const compareBaselineButton = target.closest<HTMLElement>("[data-aircraft-compare-baseline]");
    if (compareBaselineButton) {
      event.preventDefault();
      const compareSource = compareBaselineButton.dataset.aircraftCompareSource as AircraftCompareSource | undefined;
      const aircraftId = compareBaselineButton.dataset.aircraftCompareId;
      if (!compareSource || !aircraftId) {
        return;
      }
      setCompareBaseline({ source: compareSource, aircraftId });
      return;
    }

    const compareFocusButton = target.closest<HTMLElement>("[data-aircraft-compare-focus]");
    if (compareFocusButton) {
      event.preventDefault();
      const compareSource = compareFocusButton.dataset.aircraftCompareSource as AircraftCompareSource | undefined;
      const aircraftId = compareFocusButton.dataset.aircraftCompareId;
      if (!compareSource || !aircraftId) {
        return;
      }
      focusCompareSelection({ source: compareSource, aircraftId });
      return;
    }

    const compareTabButton = target.closest<HTMLElement>("[data-aircraft-compare-tab]");
    if (compareTabButton) {
      event.preventDefault();
      const tab = compareTabButton.dataset.aircraftCompareTab as AircraftCompareTab | undefined;
      if (!tab) {
        return;
      }
      compareState = {
        ...compareState,
        activeTab: tab,
      };
      saveCompareState(payload.saveId, compareState);
      render();
      return;
    }

    const compareReplaceButton = target.closest<HTMLElement>("[data-aircraft-compare-replace]");
    if (compareReplaceButton) {
      event.preventDefault();
      const compareSource = compareReplaceButton.dataset.aircraftCompareSource as AircraftCompareSource | undefined;
      const aircraftId = compareReplaceButton.dataset.aircraftCompareId;
      if (!compareSource || !aircraftId || !compareState.pendingReplacement) {
        return;
      }
      replaceCompareSelection({ source: compareSource, aircraftId });
      return;
    }

    const compareRemoveButton = target.closest<HTMLElement>("[data-aircraft-compare-remove]");
    if (compareRemoveButton) {
      event.preventDefault();
      const compareSource = compareRemoveButton.dataset.aircraftCompareSource as AircraftCompareSource | undefined;
      const aircraftId = compareRemoveButton.dataset.aircraftCompareId;
      if (!compareSource || !aircraftId) {
        return;
      }
      removeCompareSelection({ source: compareSource, aircraftId });
      return;
    }

    if (target.closest("[data-aircraft-compare-cancel]")) {
      event.preventDefault();
      compareState = {
        ...compareState,
        pendingReplacement: null,
      };
      saveCompareState(payload.saveId, compareState);
      render();
      return;
    }

    const workspaceButton = target.closest<HTMLElement>("[data-aircraft-workspace]");
    if (workspaceButton) {
      event.preventDefault();
      const nextWorkspace = workspaceButton.dataset.aircraftWorkspace as AircraftWorkspaceTab | undefined;
      if (!nextWorkspace) {
        return;
      }
      workspaceTab = nextWorkspace;
      acquisitionReview = null;
      if (workspaceTab !== "market") {
        marketOverlayOpen = false;
      }
      activeMarketPopover = null;
      storeWorkspace(payload.saveId, workspaceTab);
      render();
      return;
    }

    const selectAircraftButton = target.closest<HTMLElement>("[data-aircraft-select]");
    if (selectAircraftButton) {
      event.preventDefault();
      selectedAircraftId = selectAircraftButton.dataset.aircraftSelect ?? selectedAircraftId;
      render();
      return;
    }

    const selectOfferRow = target.closest<HTMLElement>("[data-market-select]");
    if (selectOfferRow && !target.closest("form")) {
      event.preventDefault();
      selectedOfferId = selectOfferRow.dataset.marketSelect ?? selectedOfferId;
      marketOverlayOpen = true;
      acquisitionReview = null;
      activeMarketPopover = null;
      render();
      setMarketOverlayVisible(workspaceTab === "market" && marketOverlayOpen);
      return;
    }

    if (target.closest("[data-aircraft-market-close]")) {
      event.preventDefault();
      closeMarketOverlay();
      return;
    }

    const marketPopoverToggle = target.closest<HTMLElement>("[data-market-popover-toggle]");
    if (marketPopoverToggle) {
      event.preventDefault();
      event.stopPropagation();
      const popoverKey = normalizeAircraftMarketPopoverKey(marketPopoverToggle.dataset.marketPopoverToggle);
      if (popoverKey) {
        toggleMarketPopover(popoverKey);
      }
      return;
    }

    const reviewButton = target.closest<HTMLElement>("[data-market-review]");
    if (reviewButton) {
      event.preventDefault();
      const ownershipType = reviewButton.dataset.marketReview as AircraftDealStructure | undefined;
      const offerId = reviewButton.dataset.marketReviewOffer ?? selectedOfferId;
      if (!ownershipType || !offerId) {
        return;
      }
      const offer = payload.marketWorkspace.offers.find((entry) => entry.aircraftOfferId === offerId);
      const options = offer ? optionsForDeal(offer, ownershipType) : [];
      if (!offer || options.length === 0) {
        return;
      }
      selectedOfferId = offerId;
      acquisitionReview = {
        offerId,
        ownershipType,
        selectedOptionId: defaultOptionIdForDeal(offer, ownershipType) ?? options[0]!.optionId,
      };
      marketOverlayOpen = true;
      render();
      setMarketOverlayVisible(workspaceTab === "market" && marketOverlayOpen);
      return;
    }

    const reviewOptionButton = target.closest<HTMLElement>("[data-market-review-option]");
    if (reviewOptionButton && acquisitionReview) {
      event.preventDefault();
      acquisitionReview = {
        ...acquisitionReview,
        selectedOptionId: reviewOptionButton.dataset.marketReviewOption ?? acquisitionReview.selectedOptionId,
      };
      render();
      return;
    }

    if (target.closest("[data-market-review-back]")) {
      event.preventDefault();
      acquisitionReview = null;
      render();
      return;
    }

    const fleetSortButton = target.closest<HTMLElement>("[data-aircraft-sort-key]");
    if (fleetSortButton) {
      event.preventDefault();
      const key = fleetSortButton.dataset.aircraftSortKey as AircraftTableSortKey | undefined;
      if (!key) {
        return;
      }
      fleetSort = {
        key,
        direction: nextFleetSortDirection(fleetSort, key),
      };
      render();
      return;
    }

    const marketSortButton = target.closest<HTMLElement>("[data-market-sort-key]");
    if (marketSortButton) {
      event.preventDefault();
      const key = marketSortButton.dataset.marketSortKey as AircraftMarketSortKey | undefined;
      if (!key) {
        return;
      }
      activeMarketPopover = null;
      marketSort = {
        key,
        direction: nextMarketSortDirection(marketSort, key),
      };
      render();
      return;
    }

    if (target.closest("[data-aircraft-clear-filters]")) {
      event.preventDefault();
      fleetFilters = payload.fleetWorkspace.defaultFilters;
      render();
      return;
    }

    if (target.closest("[data-market-clear-filters]")) {
      event.preventDefault();
      marketFilters = payload.marketWorkspace.defaultFilters;
      activeMarketPopover = null;
      render();
      return;
    }

    if (activeMarketPopover !== null && !target.closest("[data-market-popover]") && !target.closest("[data-market-popover-toggle]")) {
      activeMarketPopover = null;
      render();
    }
  }

  function handleFieldEvent(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) && !(target instanceof HTMLInputElement)) {
      return;
    }

    const fleetFilterName = target.dataset.aircraftFilter as keyof AircraftTableFilters | undefined;
    if (fleetFilterName) {
      fleetFilters = {
        ...fleetFilters,
        [fleetFilterName]: target.value,
      } as AircraftTableFilters;
      render();
      return;
    }

    const marketFieldName = target.dataset.marketField as AircraftMarketFilterField | "conditionBands" | undefined;
    if (!marketFieldName) {
      return;
    }

    event.stopPropagation();

    switch (marketFieldName) {
      case "conditionBands":
        marketFilters = {
          ...marketFilters,
          conditionBands: Array.from(
            host.querySelectorAll<HTMLInputElement>("input[data-market-field='conditionBands']:checked"),
          ).map((input) => normalizeAircraftConditionBand(input.value)).filter((value): value is NonNullable<typeof value> => value !== null),
        };
        render();
        focusMarketField("conditionBands");
        return;
      default:
        marketFilters = {
          ...marketFilters,
          [marketFieldName]: target.value,
        };
        render();
        focusMarketField(marketFieldName);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && activeMarketPopover !== null) {
      event.preventDefault();
      closeMarketPopover();
      return;
    }

    if (event.key === "Escape" && marketOverlayOpen) {
      event.preventDefault();
      closeMarketOverlay();
    }
  }

  function handleDocumentClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || activeMarketPopover === null) {
      return;
    }
    if (host.contains(target)) {
      return;
    }
    activeMarketPopover = null;
    render();
  }

  function handleWindowResize(): void {
    positionActiveMarketPopover();
    positionMarketOverlay();
  }

  function handleMarketScroll(): void {
    positionActiveMarketPopover();
    positionMarketOverlay();
  }

  function saveCompareSelectionState(): void {
    saveCompareState(payload.saveId, compareState);
  }

  function toggleCompareSelection(ref: AircraftCompareRef): void {
    const compareKey = compareKeyForRef(ref);
    const compareItems = resolveCompareItems(payload, compareState);
    const existingIndex = compareItems.findIndex((item) => item.compareKey === compareKey);
    let nextState: AircraftCompareState;

    if (existingIndex >= 0) {
      nextState = normalizeCompareState({
        ...compareState,
        items: compareState.items.filter((item) => compareKeyForRef(item) !== compareKey),
        pendingReplacement: null,
      }, payload);
    } else if (compareItems.length >= 4) {
      nextState = normalizeCompareState({
        ...compareState,
        isOpen: true,
        pendingReplacement: ref,
      }, payload);
    } else {
      const nextItems = [...compareState.items, ref];
      nextState = normalizeCompareState({
        ...compareState,
        items: nextItems,
        isOpen: nextItems.length >= 2 || compareState.isOpen,
        focusedKey: compareKey,
        baselineKey: compareState.baselineKey ?? compareKey,
        pendingReplacement: null,
      }, payload);
    }

    compareState = nextState;
    saveCompareSelectionState();
    render();
  }

  function removeCompareSelection(ref: AircraftCompareRef): void {
    const compareKey = compareKeyForRef(ref);
    compareState = normalizeCompareState({
      ...compareState,
      items: compareState.items.filter((item) => compareKeyForRef(item) !== compareKey),
      pendingReplacement: null,
    }, payload);
    saveCompareSelectionState();
    render();
  }

  function setCompareBaseline(ref: AircraftCompareRef): void {
    const compareKey = compareKeyForRef(ref);
    if (!resolveCompareItems(payload, compareState).some((item) => item.compareKey === compareKey)) {
      return;
    }

    compareState = normalizeCompareState({
      ...compareState,
      baselineKey: compareKey,
      focusedKey: compareKey,
      isOpen: true,
      pendingReplacement: null,
    }, payload);
    saveCompareSelectionState();
    render();
  }

  function focusCompareSelection(ref: AircraftCompareRef): void {
    const compareKey = compareKeyForRef(ref);
    if (!resolveCompareItems(payload, compareState).some((item) => item.compareKey === compareKey)) {
      return;
    }

    compareState = {
      ...compareState,
      focusedKey: compareKey,
      isOpen: true,
    };
    saveCompareSelectionState();
    render();
  }

  function replaceCompareSelection(ref: AircraftCompareRef): void {
    if (!compareState.pendingReplacement) {
      return;
    }

    const currentKey = compareKeyForRef(ref);
    const pendingKey = compareKeyForRef(compareState.pendingReplacement);
    if (currentKey === pendingKey) {
      compareState = {
        ...compareState,
        pendingReplacement: null,
      };
      saveCompareSelectionState();
      render();
      return;
    }

    compareState = normalizeCompareState({
      ...compareState,
      items: [
        ...compareState.items.filter((item) => compareKeyForRef(item) !== currentKey),
        compareState.pendingReplacement,
      ],
      pendingReplacement: null,
      focusedKey: pendingKey,
      baselineKey: compareState.baselineKey === currentKey ? pendingKey : compareState.baselineKey,
      isOpen: true,
    }, payload);
    saveCompareSelectionState();
    render();
  }

  host.addEventListener("click", handleClick);
  host.addEventListener("input", handleFieldEvent);
  host.addEventListener("change", handleFieldEvent);
  host.addEventListener("keydown", handleKeydown);
  document.addEventListener("click", handleDocumentClick, true);
  window.addEventListener("resize", handleWindowResize);
  host.addEventListener("scroll", handleMarketScroll, true);
  render();

  return {
    destroy(): void {
      host.removeEventListener("click", handleClick);
      host.removeEventListener("input", handleFieldEvent);
      host.removeEventListener("change", handleFieldEvent);
      host.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("resize", handleWindowResize);
      host.removeEventListener("scroll", handleMarketScroll, true);
    },
  };
}

// Chooses between the Fleet and Market workspaces while preserving the shared aircraft workbench layout.
function renderAircraftTab(
  payload: AircraftTabPayload,
  workspaceTab: AircraftWorkspaceTab,
  fleetViewState: AircraftFleetViewState,
  marketViewState: ReturnType<typeof applyAircraftMarketViewState>,
  reviewState: AcquisitionReviewState | null,
  compareState: AircraftCompareState,
  activeMarketPopover: AircraftMarketPopoverKey | null = null,
): string {
  return `
    <section class="panel">
      <div class="panel-head">
        <h3>Aircraft Workspace</h3>
        <div class="panel-head-actions">
          <div class="contracts-board-tabs" role="tablist" aria-label="Aircraft workspace">
            <button
              type="button"
              class="contracts-board-tab ${workspaceTab === "fleet" ? "current" : ""}"
              data-aircraft-workspace="fleet"
              role="tab"
              aria-selected="${workspaceTab === "fleet" ? "true" : "false"}"
            >Fleet</button>
            <button
              type="button"
              class="contracts-board-tab ${workspaceTab === "market" ? "current" : ""}"
              data-aircraft-workspace="market"
              role="tab"
              aria-selected="${workspaceTab === "market" ? "true" : "false"}"
            >Market</button>
          </div>
          ${compareState.items.length > 0
            ? `<button type="button" class="pill aircraft-compare-pill" data-aircraft-compare-open>Compare ${compareState.items.length}</button>`
            : ""}
        </div>
      </div>
      <div class="panel-body aircraft-workspace-body">
        <div class="aircraft-workspace-shell" data-aircraft-workspace-shell>
          ${workspaceTab === "fleet"
            ? renderFleetWorkspace(payload, fleetViewState, compareState)
            : renderMarketWorkspace(payload, marketViewState, reviewState, compareState, activeMarketPopover)}
          ${renderAircraftCompareOverlay(payload, compareState)}
        </div>
      </div>
    </section>
    ${workspaceTab === "market"
      ? renderAircraftMarketOverlay(payload, marketViewState, reviewState, compareState)
      : ""}
  `;
}

// Fleet workspace emphasizes triage: filters, sortable table, and a single selected-aircraft detail rail.
function renderFleetWorkspace(
  payload: AircraftTabPayload,
  viewState: AircraftFleetViewState,
  compareState: AircraftCompareState,
): string {
  if (payload.fleetWorkspace.aircraft.length === 0) {
    return `<div class="empty-state">No aircraft in the fleet yet. Switch to <strong>Market</strong> to acquire the first airframe.</div>`;
  }

  const selectedAircraftTitle = viewState.selectedAircraft
    ? `${viewState.selectedAircraft.registration} | ${viewState.selectedAircraft.modelDisplayName}`
    : "Selected Aircraft";

  return `
    <div class="aircraft-workbench">
      <section class="panel aircraft-fleet-panel">
        <div class="panel-head">
          <h3>Fleet</h3>
          <div class="pill-row">
            <span class="pill">${escapeHtml(String(viewState.visibleAircraft.length))} visible</span>
            <span class="pill">${escapeHtml(String(payload.fleetWorkspace.aircraft.length))} total</span>
            <span class="pill">Sort: ${escapeHtml(fleetSortLabel(viewState.sort.key))}</span>
          </div>
        </div>
        <div class="panel-body aircraft-fleet-body">
          <div class="aircraft-toolbar">
            <label>Readiness<select data-aircraft-filter="readiness">${renderOptions(viewState.filters.readiness, [
              ["all", "All"],
              ["ready", "Ready"],
              ["constrained", "Constrained"],
            ])}</select></label>
            <label>Health<select data-aircraft-filter="risk">${renderOptions(viewState.filters.risk, [
              ["all", "All"],
              ["healthy", "Healthy"],
              ["watch", "Watch"],
              ["critical", "Critical"],
            ])}</select></label>
          </div>
          ${renderFleetTable(viewState, compareState)}
        </div>
      </section>
      <section class="panel aircraft-detail-panel">
        <div class="panel-head"><h3>${escapeHtml(selectedAircraftTitle)}</h3></div>
        <div class="panel-body aircraft-detail-body">${renderAircraftDetail(payload.saveId, viewState.selectedAircraft, compareState)}</div>
      </section>
    </div>
  `;
}

// Market workspace keeps the market table primary and opens listing detail in an overlay so acquisition research stays focused.
function renderMarketWorkspace(
  payload: AircraftTabPayload,
  viewState: ReturnType<typeof applyAircraftMarketViewState>,
  reviewState: AcquisitionReviewState | null,
  compareState: AircraftCompareState,
  activePopover: AircraftMarketPopoverKey | null = null,
): string {
  return `
    <div class="aircraft-market-stage" data-aircraft-market-stage>
      <section class="panel aircraft-market-panel">
        <div class="panel-head">
          <h3>Aircraft Market</h3>
          <div class="pill-row">
            <span class="pill">${escapeHtml(String(viewState.visibleOffers.length))} visible</span>
            <span class="pill">${escapeHtml(String(payload.marketWorkspace.offers.length))} listed</span>
            <span class="pill">Live market</span>
          </div>
        </div>
        <div class="panel-body aircraft-fleet-body aircraft-market-body">
          ${renderMarketTable(payload, viewState, compareState, activePopover)}
        </div>
      </section>
      ${renderAircraftMarketActivePopover(payload, viewState, activePopover)}
    </div>
  `;
}

function renderAircraftMarketOverlay(
  payload: AircraftTabPayload,
  viewState: ReturnType<typeof applyAircraftMarketViewState>,
  reviewState: AcquisitionReviewState | null,
  compareState: AircraftCompareState,
): string {
  return `
    <div class="aircraft-market-overlay" data-aircraft-market-overlay hidden>
      <button
        type="button"
        class="aircraft-market-overlay-backdrop"
        data-aircraft-market-close
        aria-label="Close aircraft listing detail"
      ></button>
      <section class="panel aircraft-market-overlay-card" role="dialog" aria-modal="true" aria-label="Aircraft listing detail">
        <button type="button" class="ghost-button aircraft-market-overlay-close" data-aircraft-market-close>Close</button>
        <div class="panel-body aircraft-detail-body" data-aircraft-market-detail-body>
          ${renderMarketDetail(payload, payload.marketWorkspace.currentCashAmount, viewState.selectedOffer, reviewState, compareState)}
        </div>
      </section>
    </div>
  `;
}

// Renders the fleet table view, leaving selection and sorting to the lightweight browser controller.
function renderFleetTable(
  viewState: AircraftFleetViewState,
  compareState: AircraftCompareState,
): string {
  if (viewState.visibleAircraft.length === 0) {
    return `<div class="empty-state">No aircraft match the current filters. <button type="button" class="button-link button-secondary" data-aircraft-clear-filters="1">Clear filters</button></div>`;
  }

  return `
    <div class="table-wrap aircraft-table-wrap" data-aircraft-scroll="fleet-list">
      <table>
        <thead>
          <tr>
            ${renderFleetHeaderCell(viewState.sort, "tail", "Aircraft")}
            ${renderFleetHeaderCell(viewState.sort, "location", "Location")}
            ${renderFleetHeaderCell(viewState.sort, "state", "Ownership")}
            ${renderFleetHeaderCell(viewState.sort, "condition", "Condition")}
            ${renderFleetHeaderCell(viewState.sort, "payload", "Mission Profile")}
            ${renderFleetHeaderCell(viewState.sort, "attention", "Next Milestone")}
            ${renderFleetStaticHeaderCell("Compare")}
          </tr>
        </thead>
        <tbody>
          ${viewState.visibleAircraft.map((aircraft) => renderAircraftRow(aircraft, viewState.selectedAircraftId, compareState)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// Renders the aircraft market table while keeping rows simple enough for cheap full rerenders on every interaction.
function renderMarketTable(
  payload: AircraftTabPayload,
  viewState: ReturnType<typeof applyAircraftMarketViewState>,
  compareState: AircraftCompareState,
  activePopover: AircraftMarketPopoverKey | null,
): string {
  if (viewState.visibleOffers.length === 0) {
    return `<div class="empty-state">No aircraft listings match the current market filters.</div>`;
  }
  const columnGroup = `<colgroup><col style="width:340px" /><col style="width:220px" /><col style="width:170px" /><col style="width:120px" /><col style="width:130px" /><col style="width:120px" /><col style="width:150px" /><col style="width:120px" /><col style="width:110px" /></colgroup>`;

  return `
    <div class="table-wrap aircraft-table-wrap" data-aircraft-scroll="market-list">
      <table class="aircraft-market-table">
        ${columnGroup}
        <thead>
          <tr>
            ${renderAircraftMarketHeaderCell("listing", "Listing", viewState.sort, "listing", ["search"], activePopover)}
            ${renderAircraftMarketHeaderCell("airport", "Airport", viewState.sort, "airport", ["search"], activePopover)}
            ${renderAircraftMarketHeaderCell("condition", "Condition", viewState.sort, "condition", ["filter"], activePopover)}
            ${renderAircraftMarketHeaderCell("passengers", "Passengers", viewState.sort, "passengers", ["filter"], activePopover)}
            ${renderAircraftMarketHeaderCell("cargo", "Cargo", viewState.sort, "cargo", ["filter"], activePopover)}
            ${renderAircraftMarketHeaderCell("range", "Range", viewState.sort, "range", ["filter"], activePopover)}
            ${renderAircraftMarketHeaderCell("ask", "Ask", viewState.sort, "asking_price", ["filter"], activePopover)}
            ${renderAircraftMarketHeaderCell("distance", "Distance", viewState.sort, "distance", ["filter"], activePopover)}
            ${renderAircraftMarketStaticHeaderCell("Compare")}
          </tr>
        </thead>
        <tbody>
          ${viewState.visibleOffers.map((offer) => renderMarketRow(offer, viewState.selectedOfferId, compareState)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAircraftMarketActivePopover(
  payload: AircraftTabPayload,
  viewState: ReturnType<typeof applyAircraftMarketViewState>,
  activePopover: AircraftMarketPopoverKey | null,
): string {
  if (activePopover === null) {
    return "";
  }

  switch (activePopover) {
    case "listing":
      return renderAircraftMarketSearchControl("listing", "listingSearchText", "Model or registration", "Search listing model or registration", viewState.filters.listingSearchText).replace(" hidden", "");
    case "airport":
      return renderAircraftMarketSearchControl("airport", "airportSearchText", "Airport code or name", "Search airport code or name", viewState.filters.airportSearchText).replace(" hidden", "");
    case "condition":
      return renderAircraftMarketFilterControl(
        "condition",
        renderAircraftMarketCompactField(
          "Condition",
          renderAircraftMarketCheckboxFieldset(
            "conditionBands",
            payload.marketWorkspace.filterOptions.conditionBands.map((value) => ({
              value,
              label: marketConditionLabel(value),
            })),
            viewState.filters.conditionBands,
          ),
        ),
      ).replace(" hidden", "");
    case "passengers":
      return renderAircraftMarketFilterControl(
        "passengers",
        renderAircraftMarketCompactField(
          "Passengers",
          renderAircraftMarketRangeFields("passengerMin", "passengerMax", {
            minimum: 0,
            step: 1,
            minPlaceholder: "Min",
            maxPlaceholder: "Max",
            minValue: viewState.filters.passengerMin,
            maxValue: viewState.filters.passengerMax,
          }),
        ),
      ).replace(" hidden", "");
    case "cargo":
      return renderAircraftMarketFilterControl(
        "cargo",
        renderAircraftMarketCompactField(
          "Cargo (lb)",
          renderAircraftMarketRangeFields("cargoMin", "cargoMax", {
            minimum: 0,
            step: 250,
            minPlaceholder: "Min",
            maxPlaceholder: "Max",
            minValue: viewState.filters.cargoMin,
            maxValue: viewState.filters.cargoMax,
          }),
        ),
      ).replace(" hidden", "");
    case "range":
      return renderAircraftMarketFilterControl(
        "range",
        renderAircraftMarketCompactField(
          "Range (nm)",
          renderAircraftMarketRangeFields("rangeMin", "rangeMax", {
            minimum: 0,
            step: 25,
            minPlaceholder: "Min",
            maxPlaceholder: "Max",
            minValue: viewState.filters.rangeMin,
            maxValue: viewState.filters.rangeMax,
          }),
        ),
      ).replace(" hidden", "");
    case "ask":
      return renderAircraftMarketFilterControl(
        "ask",
        renderAircraftMarketCompactField(
          "Ask",
          renderAircraftMarketRangeFields("askMin", "askMax", {
            minimum: 0,
            step: 25000,
            minPlaceholder: "Min",
            maxPlaceholder: "Max",
            minValue: viewState.filters.askMin,
            maxValue: viewState.filters.askMax,
          }),
        ),
      ).replace(" hidden", "");
    case "distance":
      return renderAircraftMarketFilterControl(
        "distance",
        renderAircraftMarketCompactField(
          "Distance (nm)",
          renderAircraftMarketRangeFields("distanceMin", "distanceMax", {
            minimum: 0,
            step: 25,
            minPlaceholder: "Min",
            maxPlaceholder: "Max",
            minValue: viewState.filters.distanceMin,
            maxValue: viewState.filters.distanceMax,
          }),
        ),
      ).replace(" hidden", "");
    default:
      return "";
  }
}

function renderFleetSortButton(sort: AircraftTableSort, key: AircraftTableSortKey, label: string): string {
  return `<button type="button" class="table-sort" data-aircraft-sort-key="${escapeHtml(key)}"><span class="table-header-label">${escapeHtml(label)}</span></button>`;
}

function renderFleetHeaderCell(sort: AircraftTableSort, key: AircraftTableSortKey, label: string): string {
  const isSorted = sort.key === key;
  const ariaSort = isSorted
    ? sort.direction === "asc" ? "ascending" : "descending"
    : "none";
  return `<th class="sortable table-header-column${isSorted ? " is-sorted" : ""}" aria-sort="${ariaSort}"><div class="table-header-control">${renderFleetSortButton(sort, key, label)}<span class="table-header-actions" aria-hidden="true"></span></div></th>`;
}

function renderFleetStaticHeaderCell(label: string): string {
  return `<th class="table-header-column"><div class="table-header-control"><span class="table-header-label">${escapeHtml(label)}</span><span class="table-header-actions" aria-hidden="true"></span></div></th>`;
}

function renderMarketSortButton(sort: AircraftMarketSort, key: AircraftMarketSortKey, label: string): string {
  return `<button type="button" class="table-sort" data-market-sort-key="${escapeHtml(key)}"><span class="table-header-label">${escapeHtml(label)}</span></button>`;
}

function renderAircraftHeaderIcon(kind: "search" | "filter"): string {
  if (kind === "search") {
    return `<svg focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M10.5 3a7.5 7.5 0 1 1 0 15a7.5 7.5 0 0 1 0-15Zm0 2a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11Zm8.2 12.8 2.8 2.8-1.4 1.4-2.8-2.8 1.4-1.4Z"/></svg>`;
  }

  return `<svg focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 6.56l-5.2 5.58v6.11a1.5 1.5 0 0 1-2.44 1.17l-2.4-1.95a1.5 1.5 0 0 1-.56-1.17v-4.16L4.34 6.56A1.5 1.5 0 0 1 4 5.5Z"/></svg>`;
}

function renderAircraftMarketIconButton(columnKey: AircraftMarketPopoverKey, kind: "search" | "filter", label: string, isExpanded: boolean): string {
  return `<button type="button" class="table-header-icon-button" data-market-popover-toggle="${escapeHtml(columnKey)}" aria-label="${escapeHtml(label)}" aria-expanded="${isExpanded ? "true" : "false"}">${renderAircraftHeaderIcon(kind)}</button>`;
}

function renderAircraftMarketSearchControl(
  columnKey: AircraftMarketPopoverKey,
  field: AircraftMarketFilterField,
  placeholder: string,
  ariaLabel: string,
  value: string,
): string {
  return `<div class="aircraft-market-header-popover aircraft-market-header-popover--search" data-market-popover="${escapeHtml(columnKey)}" data-market-control-type="search" hidden><input type="search" class="aircraft-market-inline-search" value="${escapeHtml(value)}" data-market-field="${escapeHtml(field)}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(ariaLabel)}" /></div>`;
}

function renderAircraftMarketCompactField(label: string, controlMarkup: string): string {
  return `<label class="aircraft-market-popover-field"><span class="eyebrow">${escapeHtml(label)}</span>${controlMarkup}</label>`;
}

function renderAircraftMarketRangeFields(
  minField: AircraftMarketFilterField,
  maxField: AircraftMarketFilterField,
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
  return `<div class="aircraft-market-range-fields"><label class="aircraft-market-range-field"><span class="eyebrow">Min</span><input type="number" min="${escapeHtml(String(minimum))}" step="${escapeHtml(String(step))}" inputmode="numeric" data-market-field="${escapeHtml(minField)}" placeholder="${escapeHtml(minPlaceholder)}" value="${escapeHtml(options.minValue ?? "")}" /></label><label class="aircraft-market-range-field"><span class="eyebrow">Max</span><input type="number" min="${escapeHtml(String(minimum))}" step="${escapeHtml(String(step))}" inputmode="numeric" data-market-field="${escapeHtml(maxField)}" placeholder="${escapeHtml(maxPlaceholder)}" value="${escapeHtml(options.maxValue ?? "")}" /></label></div>`;
}

function renderAircraftMarketCheckboxFieldset(
  field: "conditionBands",
  values: Array<{ value: string; label: string }>,
  selectedValues: string[],
): string {
  return `<div class="aircraft-market-checkbox-list">${values.map(({ value, label }) => `<label class="aircraft-market-checkbox-option"><input type="checkbox" data-market-field="${escapeHtml(field)}" value="${escapeHtml(value)}"${selectedValues.includes(value) ? " checked" : ""} /><span>${escapeHtml(label)}</span></label>`).join("")}</div>`;
}

function renderAircraftMarketFilterControl(columnKey: AircraftMarketPopoverKey, bodyMarkup: string): string {
  return `<div class="aircraft-market-header-popover aircraft-market-header-popover--filter" data-market-popover="${escapeHtml(columnKey)}" data-market-control-type="filter" hidden><div class="aircraft-market-popover-body">${bodyMarkup}</div></div>`;
}

function renderAircraftMarketHeaderCell(
  columnKey: AircraftMarketPopoverKey,
  label: string,
  sort: AircraftMarketSort,
  sortKey: AircraftMarketSortKey,
  iconKinds: Array<"search" | "filter">,
  activePopover: AircraftMarketPopoverKey | null,
): string {
  const isSorted = sort.key === sortKey;
  const ariaSort = isSorted
    ? sort.direction === "asc" ? "ascending" : "descending"
    : "none";
  const popoverOpen = activePopover === columnKey;
  const iconButtons = iconKinds.map((kind) => renderAircraftMarketIconButton(columnKey, kind, `${label} ${kind === "search" ? "search" : "filter"}`, popoverOpen)).join("");
  return `<th class="sortable table-header-column${isSorted ? " is-sorted" : ""}" aria-sort="${ariaSort}" data-aircraft-market-column="${escapeHtml(columnKey)}"><div class="table-header-control">${renderMarketSortButton(sort, sortKey, label)}<span class="table-header-actions">${iconButtons}</span></div></th>`;
}

function renderAircraftMarketStaticHeaderCell(label: string): string {
  return `<th class="table-header-column"><div class="table-header-control"><span class="table-header-label">${escapeHtml(label)}</span><span class="table-header-actions" aria-hidden="true"></span></div></th>`;
}

function normalizeAircraftMarketPopoverKey(value: string | undefined): AircraftMarketPopoverKey | null {
  switch (value) {
    case "listing":
    case "airport":
    case "condition":
    case "passengers":
    case "cargo":
    case "range":
    case "ask":
    case "distance":
      return value;
    default:
      return null;
  }
}

function defaultMarketFieldForPopover(popoverKey: AircraftMarketPopoverKey): AircraftMarketFilterField | "conditionBands" {
  switch (popoverKey) {
    case "listing":
      return "listingSearchText";
    case "airport":
      return "airportSearchText";
    case "condition":
      return "conditionBands";
    case "passengers":
      return "passengerMin";
    case "cargo":
      return "cargoMin";
    case "range":
      return "rangeMin";
    case "ask":
      return "askMin";
    case "distance":
    default:
      return "distanceMin";
  }
}

function normalizeAircraftConditionBand(value: string): "new" | "excellent" | "fair" | "rough" | null {
  switch (value) {
    case "new":
    case "excellent":
    case "fair":
    case "rough":
      return value;
    default:
      return null;
  }
}

function renderAircraftRow(
  aircraft: AircraftTabAircraftView,
  selectedAircraftId: string | undefined,
  compareState: AircraftCompareState,
): string {
  const isSelected = aircraft.aircraftId === selectedAircraftId;
  const compareRef: AircraftCompareRef = { source: "fleet", aircraftId: aircraft.aircraftId };
  const isCompared = compareState.items.some((entry) => compareKeyForRef(entry) === compareKeyForRef(compareRef));
  const compareLabel = isCompared ? "Remove" : compareState.items.length >= 4 ? "Swap in" : "Compare";
  return `
    <tr
      class="aircraft-row ${isSelected ? "selected" : ""}"
      data-aircraft-select="${escapeHtml(aircraft.aircraftId)}"
      aria-selected="${isSelected ? "true" : "false"}"
    >
      <td>
        <button type="button" class="aircraft-row-button" data-aircraft-select="${escapeHtml(aircraft.aircraftId)}">
          <div class="meta-stack">
            <span class="route">${escapeHtml(aircraft.registration)}</span>
            <span class="muted">${escapeHtml(aircraft.modelDisplayName)} | ${escapeHtml(aircraft.roleLabel)}</span>
          </div>
        </button>
      </td>
      <td>${renderLocationCell(aircraft.location)}</td>
      <td><div class="meta-stack">${renderBadge(aircraft.ownershipType)}<span class="muted">${escapeHtml(labelForUi(aircraft.operationalState))}</span></div></td>
      <td><div class="meta-stack"><div class="pill-row">${renderBadge(aircraft.conditionBand)}${renderCriticalMaintenanceBadge(aircraft.maintenanceState)}</div><span class="muted">${formatPercent(aircraft.conditionValue)} condition | ${formatHours(aircraft.hoursToService)} to service</span></div></td>
      <td><div class="meta-stack"><span>${escapeHtml(envelopeLabel(aircraft.maxPassengers, aircraft.maxCargoLb, aircraft.rangeNm))}</span><span class="muted">${escapeHtml(accessLabel(aircraft.minimumRunwayFt, aircraft.minimumAirportSize))}</span></div></td>
      <td><div class="meta-stack"><span>${escapeHtml(aircraft.nextEvent.label)}</span><span class="muted">${escapeHtml(aircraft.nextEvent.detail)}</span></div></td>
      <td>
        <button type="button" class="button-secondary compare-toggle-button ${isCompared ? "current" : ""}" data-aircraft-compare-toggle data-aircraft-compare-source="fleet" data-aircraft-compare-id="${escapeHtml(aircraft.aircraftId)}">${escapeHtml(compareLabel)}</button>
      </td>
    </tr>
  `;
}

function renderMarketRow(
  offer: AircraftMarketOfferView,
  selectedOfferId: string | undefined,
  compareState: AircraftCompareState,
): string {
  const isSelected = offer.aircraftOfferId === selectedOfferId;
  const compareRef: AircraftCompareRef = { source: "market", aircraftId: offer.aircraftOfferId };
  const isCompared = compareState.items.some((entry) => compareKeyForRef(entry) === compareKeyForRef(compareRef));
  const compareLabel = isCompared ? "Remove" : compareState.items.length >= 4 ? "Swap in" : "Compare";
  return `
    <tr class="aircraft-row ${isSelected ? "selected" : ""}" data-market-select="${escapeHtml(offer.aircraftOfferId)}">
      <td>
        <div class="aircraft-market-listing">
          <figure class="aircraft-market-listing-thumb">
            <img
              src="${escapeHtml(offer.imageAssetPath)}"
              alt="${escapeHtml(offer.modelDisplayName)}"
              loading="lazy"
              onerror="this.onerror=null;this.src='/assets/aircraft-images/fallback.svg';"
            />
          </figure>
          <div class="meta-stack">
            <span class="route">${escapeHtml(offer.modelDisplayName)}</span>
            <span class="muted">${escapeHtml(offer.registration)} | ${escapeHtml(offer.roleLabel)}</span>
          </div>
        </div>
      </td>
      <td>${renderLocationCell(offer.location)}</td>
      <td><div class="meta-stack"><div class="pill-row">${renderBadge(offer.conditionBand)}${renderBadge(offer.maintenanceState)}</div><span class="muted">${formatPercent(offer.conditionValue)} | ${formatHours(offer.hoursToService)} to service</span></div></td>
      <td>${escapeHtml(formatNumber(offer.maxPassengers))}</td>
      <td>${escapeHtml(formatNumber(offer.maxCargoLb))} lb</td>
      <td>${escapeHtml(formatNumber(offer.rangeNm))} nm</td>
      <td>${escapeHtml(formatMoney(offer.askingPurchasePriceAmount))}</td>
      <td>${escapeHtml(formatNumber(offer.distanceFromHomeBaseNm))} nm</td>
      <td>
        <button type="button" class="button-secondary compare-toggle-button ${isCompared ? "current" : ""}" data-aircraft-compare-toggle data-aircraft-compare-source="market" data-aircraft-compare-id="${escapeHtml(offer.aircraftOfferId)}">${escapeHtml(compareLabel)}</button>
      </td>
    </tr>
  `;
}

// Expands one owned aircraft into an operational brief that answers "what can this airframe do right now?"
function renderAircraftDetail(
  saveId: string,
  aircraft: AircraftTabAircraftView | null,
  compareState: AircraftCompareState,
): string {
  if (!aircraft) {
    return `<div class="empty-state">No aircraft are visible with the current filters.</div>`;
  }

  const topBadges = [
    renderBadge(aircraft.operationalState),
    renderBadge(aircraft.ownershipType),
    aircraft.maintenanceState === "overdue" || aircraft.maintenanceState === "aog" || aircraft.maintenanceState === "scheduled" || aircraft.maintenanceState === "in_service"
      ? renderBadge(aircraft.maintenanceState)
      : "",
    aircraft.staffingFlag === "uncovered" || aircraft.staffingFlag === "tight" ? renderBadge(aircraft.staffingFlag) : "",
  ].filter(Boolean).join("");

  return `
    <div class="aircraft-detail-stack">
      <section class="aircraft-detail-hero">
        <div class="meta-stack">
          <div class="eyebrow">${escapeHtml(aircraft.roleLabel)}</div>
          <strong>${escapeHtml(aircraft.registration)} | ${escapeHtml(aircraft.modelDisplayName)}</strong>
          <span class="muted">${escapeHtml(aircraft.displayName)} | ${escapeHtml(aircraft.location.code)} | ${escapeHtml(aircraft.location.primaryLabel)}</span>
          ${topBadges ? `<div class="pill-row">${topBadges}</div>` : ""}
        </div>
        <figure class="aircraft-hero-image">
          <img
            src="${escapeHtml(aircraft.imageAssetPath)}"
            alt="${escapeHtml(aircraft.modelDisplayName)}"
            loading="lazy"
            onerror="this.onerror=null;this.src='/assets/aircraft-images/fallback.svg';"
          />
        </figure>
      </section>
      <section class="aircraft-facts-card">
        <div class="eyebrow">Aircraft brief</div>
        <div class="aircraft-facts-list">
          ${renderFactRow(
            "Location",
            `${aircraft.location.code} | ${aircraft.location.primaryLabel}`,
            aircraft.location.secondaryLabel ?? "Aircraft is currently positioned at this airport.",
          )}
          ${renderFactRow(
            "Operational status",
            labelForUi(aircraft.operationalState),
            aircraft.isReadyForNewWork
              ? "Ready to take on new flying with no current dispatch blocker."
              : aircraft.nextEvent.detail,
          )}
          ${renderFactRow(
            "Crew readiness",
            aircraft.staffingSummary,
            `${aircraft.staffingDetail} ${laborModelLabel(aircraft)} required.`,
          )}
          ${renderFactRow(
            "Next milestone",
            aircraft.nextEvent.label,
            aircraft.nextEvent.detail,
          )}
          ${renderFactRow(
            "Active assignment",
            aircraft.currentCommitment?.label ?? "No active assignment",
            aircraft.currentCommitment?.detail ?? "No active schedule or maintenance booking is holding this aircraft right now.",
          )}
          ${renderFactRow(
            "Mission profile",
            envelopeLabel(aircraft.maxPassengers, aircraft.maxCargoLb, aircraft.rangeNm),
            accessLabel(aircraft.minimumRunwayFt, aircraft.minimumAirportSize),
          )}
          ${renderFactRow(
            "Ownership plan",
            ownershipDetailLabel(aircraft),
            paymentWindowLabel(aircraft),
          )}
          ${renderFactRow(
            "Airframe condition",
            `${formatPercent(aircraft.conditionValue)} condition | ${formatHours(aircraft.hoursToService)} to service`,
            `${formatNumber(aircraft.airframeHoursTotal)} hrs | ${formatNumber(aircraft.airframeCyclesTotal)} cycles | ${formatHours(aircraft.hoursSinceInspection)} since inspection`,
          )}
          <div class="aircraft-detail-actions">
            ${renderCompareAction({ source: "fleet", aircraftId: aircraft.aircraftId }, compareState)}
          </div>
          ${renderMaintenanceRecoveryPanel(saveId, aircraft)}
          ${renderFactListRow("Why it matters", aircraft.whyItMatters)}
        </div>
      </section>
    </div>
  `;
}

function renderMaintenanceRecoveryPanel(saveId: string, aircraft: AircraftTabAircraftView): string {
  if (!aircraft.maintenanceRecovery) {
    return "";
  }

  const recovery = aircraft.maintenanceRecovery;

  return `
    <section class="aircraft-maintenance-recovery">
      <div class="eyebrow">Maintenance recovery</div>
      <div class="aircraft-facts-list">
        ${renderFactRow(
          "Service type",
          recovery.maintenanceTypeLabel,
          recovery.summary,
        )}
        ${renderFactRow(
          "Estimated downtime",
          `${formatHours(recovery.estimatedDowntimeHours)}`,
          `Ready again around ${formatDate(recovery.readyAtUtc)}.`,
        )}
        ${renderFactRow(
          "Player cost",
          recovery.playerPaysCost ? formatMoney(recovery.estimatedCostAmount) : "Covered by lease",
          recovery.playerPaysCost
            ? "Collected immediately when service starts."
            : "You still schedule the work, but the lease covers this maintenance cost.",
        )}
      </div>
      <form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/schedule-maintenance" class="actions" data-api-form>
        <input type="hidden" name="tab" value="aircraft" />
        <input type="hidden" name="saveId" value="${escapeHtml(saveId)}" />
        <input type="hidden" name="aircraftId" value="${escapeHtml(aircraft.aircraftId)}" />
        <button type="submit" data-pending-label="Starting maintenance...">Start maintenance</button>
      </form>
    </section>
  `;
}

// Expands one market listing into acquisition details, terms, and risk/fit context.
function renderMarketDetail(
  payload: AircraftTabPayload,
  currentCashAmount: number,
  offer: AircraftMarketOfferView | null,
  reviewState: AcquisitionReviewState | null,
  compareState: AircraftCompareState,
): string {
  if (!offer) {
    return `<div class="empty-state">No aircraft listings match the current filters.</div>`;
  }

  const activeReview = reviewState?.offerId === offer.aircraftOfferId ? reviewState : null;

  return `
    <div class="aircraft-detail-stack">
      <section class="aircraft-detail-hero">
        <div class="meta-stack">
          <div class="eyebrow">${escapeHtml(offer.roleLabel)}</div>
          <strong>${escapeHtml(offer.modelDisplayName)} | ${escapeHtml(offer.registration)}</strong>
          <span class="muted">${escapeHtml(offer.location.code)} | ${escapeHtml(offer.location.primaryLabel)} | ${escapeHtml(offer.displayName)}</span>
          <div class="aircraft-detail-actions">
            ${renderCompareAction({ source: "market", aircraftId: offer.aircraftOfferId }, compareState)}
          </div>
        </div>
        <figure class="aircraft-hero-image">
          <img
            src="${escapeHtml(offer.imageAssetPath)}"
            alt="${escapeHtml(offer.modelDisplayName)}"
            loading="lazy"
            onerror="this.onerror=null;this.src='/assets/aircraft-images/fallback.svg';"
          />
        </figure>
      </section>
      ${activeReview
        ? renderDealReview(payload.saveId, currentCashAmount, offer, activeReview)
        : `<section class="summary-list market-deals">
            ${renderDealCard(offer, offer.buyOption, "Buy")}
            ${renderDealCard(offer, cheapestOption(offer.financeOptions), "Finance")}
            ${renderDealCard(offer, cheapestOption(offer.leaseOptions), "Lease")}
          </section>`}
      <section class="aircraft-facts-card">
        <div class="eyebrow">Listing brief</div>
        <div class="aircraft-facts-list">
          ${renderFactRow(
            "Location",
            `${offer.location.code} | ${offer.location.primaryLabel}`,
            offer.location.secondaryLabel ?? "Aircraft stays at the listed airport after acquisition.",
          )}
          ${renderFactRow(
            "Home distance",
            `${formatNumber(offer.distanceFromHomeBaseNm)} nm`,
            "Useful for ferry cost and reposition planning.",
          )}
          ${renderFactRow(
            "Capability",
            envelopeLabel(offer.maxPassengers, offer.maxCargoLb, offer.rangeNm),
            accessLabel(offer.minimumRunwayFt, offer.minimumAirportSize),
          )}
          ${renderFactRow(
            "Maintenance",
            `${formatPercent(offer.conditionValue)} condition | ${formatHours(offer.hoursToService)} to service`,
            `${formatNumber(offer.airframeHoursTotal)} hrs | ${formatNumber(offer.airframeCyclesTotal)} cycles | ${formatHours(offer.hoursSinceInspection)} since inspection`,
          )}
          ${renderFactRow(
            "Support",
            humanize(offer.requiredGroundServiceLevel),
            `${humanize(offer.gateRequirement)} | ${humanize(offer.cargoLoadingType)}`,
          )}
          ${renderFactRow(
            "MSFS",
            humanize(offer.msfs2024Status),
            offer.msfs2024UserNote ?? "Availability is tracked separately from game eligibility.",
          )}
          ${renderFactListRow("Fit", offer.fitReasons)}
          ${renderFactListRow("Watchouts", offer.riskReasons)}
        </div>
      </section>
    </div>
  `;
}

function renderAircraftCompareOverlay(
  payload: AircraftTabPayload,
  compareState: AircraftCompareState,
): string {
  const compareItems = resolveCompareItems(payload, compareState);
  if (compareItems.length === 0) {
    return "";
  }

  if (!compareState.isOpen) {
    return `
      <div class="aircraft-compare-dock panel" data-aircraft-compare-dock>
        <div class="panel-head">
          <h3>Aircraft Compare</h3>
          <div class="panel-head-actions">
            <div class="pill-row">
              <span class="pill">${compareItems.length} pinned</span>
              <span class="pill">${compareState.activeTab}</span>
            </div>
            <button type="button" class="button-secondary" data-aircraft-compare-open>Open compare</button>
            <button type="button" class="button-secondary" data-aircraft-compare-clear>Clear</button>
          </div>
        </div>
        <div class="panel-body aircraft-compare-dock-body">
          ${renderCompareRail(compareItems, compareState, true)}
        </div>
      </div>
    `;
  }

  const focusedItem = compareItems.find((item) => item.compareKey === compareState.focusedKey) ?? compareItems[0]!;
  const baselineKey = compareState.baselineKey ?? compareItems[0]!.compareKey;

  return `
    <div class="aircraft-compare-overlay" data-aircraft-compare-overlay>
      <button
        type="button"
        class="aircraft-compare-backdrop"
        data-aircraft-compare-close
        aria-label="Close aircraft compare"
      ></button>
      <section class="panel aircraft-compare-card" role="dialog" aria-modal="true" aria-label="Aircraft compare">
        <div class="panel-head">
          <h3>Aircraft Compare</h3>
          <div class="panel-head-actions">
            <div class="pill-row">
              <span class="pill">${compareItems.length} pinned</span>
              <span class="pill">${escapeHtml(compareState.activeTab)}</span>
              ${compareState.pendingReplacement ? `<span class="pill">Replace one to add another</span>` : ""}
            </div>
            <button type="button" class="button-secondary" data-aircraft-compare-close>Close</button>
            <button type="button" class="button-secondary" data-aircraft-compare-clear>Clear</button>
          </div>
        </div>
        <div class="panel-body aircraft-compare-body">
          ${compareState.pendingReplacement ? renderCompareReplacementBanner(payload, compareState, compareItems) : ""}
          <div class="aircraft-compare-layout">
            <aside class="aircraft-compare-rail">
              ${renderCompareRail(compareItems, compareState, false)}
            </aside>
            <section class="aircraft-compare-content">
              ${renderCompareFocusPeek(focusedItem)}
              <div class="compare-tabbar" role="tablist" aria-label="Aircraft compare tabs">
                ${compareTabs.map((tab) => `
                  <button
                    type="button"
                    class="contracts-board-tab ${compareState.activeTab === tab ? "current" : ""}"
                    data-aircraft-compare-tab="${escapeHtml(tab)}"
                    role="tab"
                    aria-selected="${compareState.activeTab === tab ? "true" : "false"}"
                  >${escapeHtml(compareTabLabel(tab))}</button>
                `).join("")}
              </div>
              ${renderCompareMatrix(compareItems, compareState.activeTab, baselineKey)}
            </section>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderCompareRail(
  items: AircraftCompareItemView[],
  compareState: AircraftCompareState,
  compact: boolean,
): string {
  return `
    <div class="aircraft-compare-rail-list ${compact ? "compact" : ""}">
      ${items.map((item) => renderCompareRailCard(item, compareState)).join("")}
    </div>
  `;
}

function renderCompareRailCard(
  item: AircraftCompareItemView,
  compareState: AircraftCompareState,
): string {
  const isBaseline = item.compareKey === compareState.baselineKey;
  const isFocused = item.compareKey === compareState.focusedKey;
  const isPendingTarget = compareState.pendingReplacement?.aircraftId === item.ref.aircraftId
    && compareState.pendingReplacement?.source === item.ref.source;
  return `
    <article
      class="aircraft-compare-card-item ${isBaseline ? "baseline" : ""} ${isFocused ? "focused" : ""}"
      data-aircraft-compare-focus="${escapeHtml(item.compareKey)}"
      data-aircraft-compare-source="${escapeHtml(item.ref.source)}"
      data-aircraft-compare-id="${escapeHtml(item.ref.aircraftId)}"
    >
      <div class="meta-stack">
        <div class="eyebrow">${escapeHtml(item.sourceLabel)}</div>
        <strong>${escapeHtml(item.title)}</strong>
        <span class="muted">${escapeHtml(item.subtitle)}</span>
        <span class="muted">${escapeHtml(item.summary)}</span>
      </div>
      <div class="pill-row aircraft-compare-card-actions">
        <button type="button" class="button-secondary" data-aircraft-compare-baseline data-aircraft-compare-source="${escapeHtml(item.ref.source)}" data-aircraft-compare-id="${escapeHtml(item.ref.aircraftId)}">${isBaseline ? "Baseline" : "Set baseline"}</button>
        <button type="button" class="button-secondary" data-aircraft-compare-remove data-aircraft-compare-source="${escapeHtml(item.ref.source)}" data-aircraft-compare-id="${escapeHtml(item.ref.aircraftId)}">Remove</button>
        ${compareState.pendingReplacement ? `<button type="button" class="button-secondary" data-aircraft-compare-replace data-aircraft-compare-source="${escapeHtml(item.ref.source)}" data-aircraft-compare-id="${escapeHtml(item.ref.aircraftId)}">Replace</button>` : ""}
        ${isPendingTarget ? `<span class="pill">Pending target</span>` : ""}
      </div>
    </article>
  `;
}

function renderCompareReplacementBanner(
  payload: AircraftTabPayload,
  compareState: AircraftCompareState,
  items: AircraftCompareItemView[],
): string {
  const pending = resolveAircraftCompareItem(payload, compareState.pendingReplacement!);
  if (!pending) {
    return "";
  }

  return `
    <section class="aircraft-compare-replacement">
      <div class="meta-stack">
        <div class="eyebrow">Compare full</div>
        <strong>Choose one aircraft to replace</strong>
        <span class="muted">${escapeHtml(pending.title)} will join the compare set when you pick a card below.</span>
      </div>
      <button type="button" class="button-secondary" data-aircraft-compare-cancel>Cancel</button>
      <div class="muted">Current set: ${items.map((item) => escapeHtml(item.title)).join(" | ")}</div>
    </section>
  `;
}

function renderCompareFocusPeek(item: AircraftCompareItemView): string {
  return `
    <section class="aircraft-compare-focus">
      <figure class="aircraft-compare-focus-image">
        <img
          src="${escapeHtml(item.imageAssetPath)}"
          alt="${escapeHtml(item.title)}"
          loading="lazy"
          onerror="this.onerror=null;this.src='/assets/aircraft-images/fallback.svg';"
        />
      </figure>
      <div class="meta-stack">
        <div class="eyebrow">${escapeHtml(item.sourceLabel)}</div>
        <strong>${escapeHtml(item.title)}</strong>
        <span class="muted">${escapeHtml(item.subtitle)}</span>
        <span class="muted">${escapeHtml(item.summary)}</span>
      </div>
    </section>
  `;
}

function renderCompareMatrix(
  items: AircraftCompareItemView[],
  activeTab: AircraftCompareTab,
  baselineKey: string,
): string {
  const rows = items[0]?.rows[activeTab] ?? [];
  const baselineItem = items.find((item) => item.compareKey === baselineKey) ?? items[0]!;
  return `
    <div class="aircraft-compare-matrix">
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(compareTabLabel(activeTab))}</th>
            ${items.map((item) => `<th class="${item.compareKey === baselineItem.compareKey ? "baseline" : ""}">${escapeHtml(item.title)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, rowIndex) => `
            <tr>
              <th>${escapeHtml(row.label)}</th>
              ${items.map((item) => {
                const cell = item.rows[activeTab][rowIndex] ?? row;
                const baselineCell = baselineItem.rows[activeTab][rowIndex] ?? row;
                const isDelta = item.compareKey !== baselineItem.compareKey && cell.value !== baselineCell.value;
                return `<td class="${item.compareKey === baselineItem.compareKey ? "baseline" : ""} ${isDelta ? "delta" : ""}"><div class="meta-stack"><strong>${escapeHtml(cell.value)}</strong><span class="muted">${escapeHtml(cell.detail)}</span></div></td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCompareAction(ref: AircraftCompareRef, compareState: AircraftCompareState): string {
  const isSelected = compareState.items.some((item) => compareKeyForRef(item) === compareKeyForRef(ref));
  const isFullAndAvailable = !isSelected && compareState.items.length >= 4;
  return `
    <button
      type="button"
      class="button-secondary compare-action-button ${isSelected ? "current" : ""}"
      data-aircraft-compare-toggle
      data-aircraft-compare-source="${escapeHtml(ref.source)}"
      data-aircraft-compare-id="${escapeHtml(ref.aircraftId)}"
    >${isSelected ? "Remove from compare" : isFullAndAvailable ? "Swap in" : "Compare"}</button>
  `;
}

function resolveCompareItems(payload: AircraftTabPayload, compareState: AircraftCompareState): AircraftCompareItemView[] {
  const seen = new Set<string>();
  const items: AircraftCompareItemView[] = [];
  for (const ref of compareState.items) {
    const compareKey = compareKeyForRef(ref);
    if (seen.has(compareKey)) {
      continue;
    }
    const item = resolveAircraftCompareItem(payload, ref);
    if (!item) {
      continue;
    }
    seen.add(compareKey);
    items.push(item);
    if (items.length === 4) {
      break;
    }
  }
  return items;
}

function normalizeCompareState(
  compareState: AircraftCompareState,
  payload: AircraftTabPayload,
): AircraftCompareState {
  const items = resolveCompareItems(payload, compareState);
  if (items.length === 0) {
    return {
      isOpen: false,
      items: [],
      baselineKey: null,
      focusedKey: null,
      activeTab: compareTabs.includes(compareState.activeTab) ? compareState.activeTab : "specs",
      pendingReplacement: null,
    };
  }

  const itemKeys = new Set(items.map((item) => item.compareKey));
  const baselineKey = compareState.baselineKey && itemKeys.has(compareState.baselineKey)
    ? compareState.baselineKey
    : items[0]!.compareKey;
  const focusedKey = compareState.focusedKey && itemKeys.has(compareState.focusedKey)
    ? compareState.focusedKey
    : baselineKey;

  return {
    ...compareState,
    items: items.map((item) => item.ref),
    baselineKey,
    focusedKey,
    activeTab: compareTabs.includes(compareState.activeTab) ? compareState.activeTab : "specs",
    pendingReplacement: compareState.pendingReplacement && resolveAircraftCompareItem(payload, compareState.pendingReplacement)
      ? compareState.pendingReplacement
      : null,
  };
}

function loadStoredCompareState(saveId: string): AircraftCompareState | null {
  try {
    const value = window.localStorage.getItem(`${compareStoragePrefix}${saveId}`);
    if (!value) {
      return null;
    }
    const parsed = JSON.parse(value) as StoredAircraftCompareState;
    return {
      isOpen: Boolean(parsed.isOpen),
      items: Array.isArray(parsed.items)
        ? parsed.items.filter((item): item is AircraftCompareRef => Boolean(item && typeof item.source === "string" && typeof item.aircraftId === "string"))
        : [],
      baselineKey: typeof parsed.baselineKey === "string" ? parsed.baselineKey : null,
      focusedKey: typeof parsed.focusedKey === "string" ? parsed.focusedKey : null,
      activeTab: compareTabs.includes(parsed.activeTab ?? "specs") ? parsed.activeTab ?? "specs" : "specs",
      pendingReplacement: null,
    };
  } catch {
    return null;
  }
}

function saveCompareState(saveId: string, compareState: AircraftCompareState): void {
  try {
    const stored: StoredAircraftCompareState = {
      isOpen: compareState.isOpen,
      items: compareState.items,
      baselineKey: compareState.baselineKey,
      focusedKey: compareState.focusedKey,
      activeTab: compareState.activeTab,
    };
    window.localStorage.setItem(`${compareStoragePrefix}${saveId}`, JSON.stringify(stored));
  } catch {
    // Ignore local storage failures in local desktop mode.
  }
}

function compareTabLabel(tab: AircraftCompareTab): string {
  switch (tab) {
    case "specs":
      return "Specs";
    case "maintenance":
      return "Maintenance";
    case "economics":
      return "Economics";
  }
}

function renderFactRow(label: string, value: string, detail: string): string {
  return `
    <div class="aircraft-fact-row">
      <div class="eyebrow">${escapeHtml(label)}</div>
      <div class="aircraft-fact-copy">
        <strong>${escapeHtml(value)}</strong>
        <span class="muted">${escapeHtml(detail)}</span>
      </div>
    </div>
  `;
}

function renderFactListRow(label: string, reasons: string[]): string {
  if (reasons.length === 0) {
    return "";
  }

  return `
    <div class="aircraft-fact-row">
      <div class="eyebrow">${escapeHtml(label)}</div>
      <div class="aircraft-fact-copy">
        <ul class="aircraft-fact-list">
          ${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
        </ul>
      </div>
    </div>
  `;
}

// Deal cards post directly back into the shell action API using whichever listing is currently selected.
function renderDealCard(
  offer: AircraftMarketOfferView,
  option: AircraftMarketDealOptionView | null,
  label: string,
): string {
  if (!option) {
    return "";
  }

  return `
    <article class="summary-item compact market-deal-card">
      <div class="eyebrow">${escapeHtml(label)}</div>
      <strong>${escapeHtml(formatMoney(option.upfrontPaymentAmount))} upfront</strong>
      <span class="muted">${option.recurringPaymentAmount !== undefined ? `${formatMoney(option.recurringPaymentAmount)} / month` : "No recurring burden"}${option.termMonths ? ` | ${option.termMonths} months` : ""}</span>
      <button
        type="button"
        data-market-review="${escapeHtml(option.ownershipType)}"
        data-market-review-offer="${escapeHtml(offer.aircraftOfferId)}"
      >${escapeHtml(label)}</button>
      ${option.isAffordable ? "" : `<span class="muted">Insufficient cash for the required upfront payment.</span>`}
    </article>
  `;
}

function renderDealReview(
  saveId: string,
  currentCashAmount: number,
  offer: AircraftMarketOfferView,
  reviewState: AcquisitionReviewState,
): string {
  const options = optionsForDeal(offer, reviewState.ownershipType);
  const selectedOption = options.find((option) => option.optionId === reviewState.selectedOptionId) ?? options[0] ?? null;

  if (!selectedOption) {
    return "";
  }

  const reviewLabel = reviewState.ownershipType === "owned"
    ? "Purchase terms"
    : reviewState.ownershipType === "financed"
      ? "Finance terms"
      : "Lease terms";
  const pendingLabel = reviewState.ownershipType === "owned"
    ? "Purchasing aircraft..."
    : reviewState.ownershipType === "financed"
      ? "Finalizing finance..."
      : "Finalizing lease...";
  const cashAfterUpfrontAmount = currentCashAmount - selectedOption.upfrontPaymentAmount;

  return `
    <section class="aircraft-facts-card market-review-card">
      <div class="market-review-header">
        <div class="meta-stack">
          <div class="eyebrow">${escapeHtml(reviewLabel)}</div>
          <strong>${escapeHtml(offer.modelDisplayName)}</strong>
          <span class="muted">${escapeHtml(offer.location.code)} | ${escapeHtml(offer.location.primaryLabel)} | ${escapeHtml(offer.registration)}</span>
        </div>
        <button type="button" class="button-secondary" data-market-review-back>Back</button>
      </div>
      ${options.length > 1
        ? `<div class="market-option-list">
            ${options.map((option) => renderDealOptionButton(option, option.optionId === selectedOption.optionId)).join("")}
          </div>`
        : ""}
      <div class="summary-list market-review-summary">
        <article class="summary-item compact">
          <div class="eyebrow">Selected terms</div>
          <strong>${escapeHtml(selectedOption.label)}</strong>
          <span class="muted">${escapeHtml(selectedOption.detail)}</span>
        </article>
        <article class="summary-item compact">
          <div class="eyebrow">Upfront</div>
          <strong>${escapeHtml(formatMoney(selectedOption.upfrontPaymentAmount))}</strong>
          <span class="muted">Cash after upfront: ${escapeHtml(formatMoney(cashAfterUpfrontAmount))}</span>
        </article>
        <article class="summary-item compact">
          <div class="eyebrow">Recurring</div>
          <strong>${selectedOption.recurringPaymentAmount !== undefined ? escapeHtml(formatMoney(selectedOption.recurringPaymentAmount)) : "None"}</strong>
          <span class="muted">${selectedOption.termMonths ? `${selectedOption.termMonths} months` : "No recurring agreement"}${selectedOption.paymentCadence ? ` | ${escapeHtml(selectedOption.paymentCadence)}` : ""}</span>
        </article>
      </div>
      <form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/acquire-aircraft-offer" class="market-confirm-form" data-api-form>
        <input type="hidden" name="tab" value="aircraft" />
        <input type="hidden" name="aircraftOfferId" value="${escapeHtml(offer.aircraftOfferId)}" />
        <input type="hidden" name="ownershipType" value="${escapeHtml(reviewState.ownershipType)}" />
        <input type="hidden" name="upfrontPaymentAmount" value="${escapeHtml(String(selectedOption.upfrontPaymentAmount))}" />
        ${selectedOption.recurringPaymentAmount !== undefined ? `<input type="hidden" name="recurringPaymentAmount" value="${escapeHtml(String(selectedOption.recurringPaymentAmount))}" />` : ""}
        ${selectedOption.termMonths !== undefined ? `<input type="hidden" name="termMonths" value="${escapeHtml(String(selectedOption.termMonths))}" />` : ""}
        ${selectedOption.rateBandOrApr !== undefined ? `<input type="hidden" name="rateBandOrApr" value="${escapeHtml(String(selectedOption.rateBandOrApr))}" />` : ""}
        ${selectedOption.paymentCadence ? `<input type="hidden" name="paymentCadence" value="${escapeHtml(selectedOption.paymentCadence)}" />` : ""}
        <button type="submit" ${selectedOption.isAffordable ? "" : "disabled"} data-pending-label="${escapeHtml(pendingLabel)}">Confirm ${escapeHtml(reviewState.ownershipType === "owned" ? "purchase" : reviewState.ownershipType === "financed" ? "finance" : "lease")}</button>
        ${selectedOption.isAffordable
          ? `<span class="muted">This aircraft will remain at ${escapeHtml(offer.location.code)} after acquisition.</span>`
          : `<span class="muted">Insufficient cash for the required upfront payment.</span>`}
      </form>
    </section>
  `;
}

function renderDealOptionButton(option: AircraftMarketDealOptionView, selected: boolean): string {
  return `
    <button
      type="button"
      class="market-option-button ${selected ? "current" : ""}"
      data-market-review-option="${escapeHtml(option.optionId)}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <span class="market-option-title">${escapeHtml(option.label)}</span>
      <span class="market-option-copy">${escapeHtml(formatMoney(option.upfrontPaymentAmount))} upfront</span>
      <span class="market-option-copy">${option.recurringPaymentAmount !== undefined ? `${escapeHtml(formatMoney(option.recurringPaymentAmount))} / month` : "No recurring payment"}</span>
      ${option.detail ? `<span class="market-option-copy">${escapeHtml(option.detail)}</span>` : ""}
    </button>
  `;
}

function renderReasonsSection(title: string, reasons: string[]): string {
  if (reasons.length === 0) {
    return "";
  }

  return `
    <section>
      <div class="eyebrow">${escapeHtml(title)}</div>
      <ul class="aircraft-why-list">${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
    </section>
  `;
}

function renderLocationCell(location: { code: string; primaryLabel: string }): string {
  return `<div class="meta-stack"><span class="route">${escapeHtml(location.code)}</span><span class="muted">${escapeHtml(location.primaryLabel)}</span></div>`;
}

function normalizeAcquisitionReview(
  reviewState: AcquisitionReviewState | null,
  marketViewState: AircraftMarketViewState,
): AcquisitionReviewState | null {
  if (!reviewState) {
    return null;
  }

  const offer = marketViewState.visibleOffers.find((entry) => entry.aircraftOfferId === reviewState.offerId);
  if (!offer) {
    return null;
  }

  const options = optionsForDeal(offer, reviewState.ownershipType);
  if (options.length === 0) {
    return null;
  }

  const selectedOption = options.find((option) => option.optionId === reviewState.selectedOptionId) ?? options[0];
  if (!selectedOption) {
    return null;
  }
  return {
    offerId: reviewState.offerId,
    ownershipType: reviewState.ownershipType,
    selectedOptionId: selectedOption.optionId,
  };
}

function defaultOptionIdForDeal(
  offer: AircraftMarketOfferView,
  ownershipType: AircraftDealStructure,
): string | null {
  if (ownershipType === "owned") {
    return offer.buyOption.optionId;
  }

  const targetTermMonths = ownershipType === "financed" ? offer.financeTerms.termMonths : offer.leaseTerms.termMonths;
  const options = optionsForDeal(offer, ownershipType);
  return options.find((option) => option.termMonths === targetTermMonths)?.optionId ?? options[0]?.optionId ?? null;
}

function optionsForDeal(
  offer: AircraftMarketOfferView,
  ownershipType: AircraftDealStructure,
): AircraftMarketDealOptionView[] {
  switch (ownershipType) {
    case "owned":
      return [offer.buyOption];
    case "financed":
      return offer.financeOptions;
    case "leased":
      return offer.leaseOptions;
  }
}

function cheapestOption(options: AircraftMarketDealOptionView[]): AircraftMarketDealOptionView | null {
  if (options.length === 0) {
    return null;
  }

  return options
    .slice()
    .sort((left, right) => {
      const leftRecurring = left.recurringPaymentAmount ?? Number.POSITIVE_INFINITY;
      const rightRecurring = right.recurringPaymentAmount ?? Number.POSITIVE_INFINITY;
      if (leftRecurring !== rightRecurring) {
        return leftRecurring - rightRecurring;
      }
      return left.upfrontPaymentAmount - right.upfrontPaymentAmount;
    })[0] ?? null;
}

function renderOptions(currentValue: string, options: Array<[string, string]>): string {
  return options
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === currentValue ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function renderBadge(label: string): string {
  return `<span class="badge ${badgeClass(label)}">${escapeHtml(labelForUi(label))}</span>`;
}

function renderCriticalMaintenanceBadge(maintenanceState: string): string {
  if (maintenanceState === "due_soon" || maintenanceState === "not_due") {
    return "";
  }

  return renderBadge(maintenanceState);
}

function badgeClass(value: string): string {
  if (["critical", "failed", "blocked", "overdue", "confirmed_unavailable", "uncovered", "aog", "grounded", "rough"].includes(value)) {
    return "danger";
  }
  if (["warning", "late_completed", "assigned", "due_soon", "not_verified", "tight", "watch", "maintenance", "in_service", "leased", "financed"].includes(value)) {
    return "warn";
  }
  if (["active", "in_flight", "scheduled", "confirmed_available", "opportunity", "available", "covered", "excellent", "healthy", "owned", "new"].includes(value)) {
    return "accent";
  }
  return "neutral";
}

// The remaining helpers translate sort intent, labels, and local storage into small UI-only utilities.
function nextFleetSortDirection(sort: AircraftTableSort, key: AircraftTableSortKey): AircraftTableSortDirection {
  if (sort.key !== key) {
    return defaultFleetSortDirection(key);
  }
  return sort.direction === "asc" ? "desc" : "asc";
}

function nextMarketSortDirection(sort: AircraftMarketSort, key: AircraftMarketSortKey): AircraftMarketSortDirection {
  if (sort.key !== key) {
    return defaultMarketSortDirection(key);
  }
  return sort.direction === "asc" ? "desc" : "asc";
}

function defaultFleetSortDirection(key: AircraftTableSortKey): AircraftTableSortDirection {
  return key === "tail" || key === "location" ? "asc" : "desc";
}

function defaultMarketSortDirection(key: AircraftMarketSortKey): AircraftMarketSortDirection {
  switch (key) {
    case "listing":
    case "airport":
    case "asking_price":
    case "distance":
      return "asc";
    default:
      return "desc";
  }
}

function fleetSortLabel(key: AircraftTableSortKey): string {
  switch (key) {
    case "tail":
      return "Aircraft";
    case "location":
      return "Location";
    case "state":
      return "Ownership";
    case "condition":
      return "Condition";
    case "staffing":
      return "Staffing";
    case "range":
      return "Range";
    case "payload":
      return "Mission Profile";
    case "obligation":
      return "Obligation";
    case "attention":
    default:
      return "Next Milestone";
  }
}

function envelopeLabel(maxPassengers: number, maxCargoLb: number, rangeNm: number): string {
  return `${formatNumber(maxPassengers)} pax | ${formatNumber(maxCargoLb)} lb | ${formatNumber(rangeNm)} nm`;
}

function accessLabel(minimumRunwayFt: number, minimumAirportSize: number): string {
  return `${formatNumber(minimumRunwayFt)} ft runway | Size ${minimumAirportSize}`;
}

function laborModelLabel(aircraft: AircraftTabAircraftView): string {
  const attendants = aircraft.flightAttendantsRequired > 0 ? ` | ${aircraft.flightAttendantsRequired} cabin` : "";
  return `${aircraft.pilotsRequired} pilot${aircraft.pilotsRequired === 1 ? "" : "s"}${attendants} | ${humanize(aircraft.pilotQualificationGroup)}`;
}

function ownershipDetailLabel(aircraft: AircraftTabAircraftView): string {
  const obligation = aircraft.recurringPaymentAmount ? ` | ${formatMoney(aircraft.recurringPaymentAmount)}` : "";
  return `${labelForUi(aircraft.ownershipType)}${obligation}`;
}

function paymentWindowLabel(aircraft: AircraftTabAircraftView): string {
  if (!aircraft.paymentCadence && !aircraft.agreementEndAtUtc) {
    return aircraft.activeCabinLayoutDisplayName
      ? `${aircraft.activeCabinLayoutDisplayName} layout active.`
      : "No recurring aircraft agreement is visible.";
  }

  const cadence = aircraft.paymentCadence ? `${aircraft.paymentCadence} obligation` : "Agreement visible";
  const endLabel = aircraft.agreementEndAtUtc ? ` through ${formatDate(aircraft.agreementEndAtUtc)}` : "";
  return `${cadence}${endLabel}.`;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function labelForUi(value: string): string {
  if (value === "financed") {
    return "Financed";
  }
  if (value === "watch") {
    return "Attention";
  }

  return humanize(value);
}

function marketConditionLabel(value: string): string {
  switch (value) {
    case "new":
      return "New";
    case "excellent":
      return "Excellent";
    case "fair":
      return "Fair";
    case "rough":
      return "Rough";
    default:
      return labelForUi(value);
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value * 100)}%`;
}

function formatHours(value: number): string {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}h`;
}

function loadStoredWorkspace(saveId: string): AircraftWorkspaceTab | null {
  try {
    const value = window.sessionStorage.getItem(`${workspaceStoragePrefix}${saveId}`);
    return value === "fleet" || value === "market" ? value : null;
  } catch {
    return null;
  }
}

function storeWorkspace(saveId: string, value: AircraftWorkspaceTab): void {
  try {
    window.sessionStorage.setItem(`${workspaceStoragePrefix}${saveId}`, value);
  } catch {
    // Ignore session storage failures in local desktop mode.
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
