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
  type AircraftFleetViewState,
  type AircraftMarketDealOptionView,
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
  let marketOverlayOpen = false;
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
    host.innerHTML = renderAircraftTab(payload, workspaceTab, fleetViewState, marketViewState, acquisitionReview);
    setMarketOverlayVisible(workspaceTab === "market" && marketOverlayOpen);
    const fleetList = host.querySelector<HTMLElement>("[data-aircraft-scroll='fleet-list']");
    const marketList = host.querySelector<HTMLElement>("[data-aircraft-scroll='market-list']");
    if (fleetList) {
      fleetList.scrollTop = fleetListScrollTop;
    }
    if (marketList) {
      marketList.scrollTop = marketListScrollTop;
    }
  }

  function setMarketOverlayVisible(isVisible: boolean): void {
    const overlay = host.querySelector<HTMLElement>("[data-aircraft-market-overlay]");
    const stage = host.querySelector<HTMLElement>("[data-aircraft-market-stage]");
    if (!overlay || !stage) {
      return;
    }

    overlay.hidden = !isVisible;
    stage.classList.toggle("overlay-open", isVisible);
  }

  function closeMarketOverlay(): void {
    marketOverlayOpen = false;
    acquisitionReview = null;
    render();
  }

  function handleClick(event: MouseEvent): void {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
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
      render();
      setMarketOverlayVisible(workspaceTab === "market" && marketOverlayOpen);
      return;
    }

    if (target.closest("[data-aircraft-market-close]")) {
      event.preventDefault();
      closeMarketOverlay();
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
      render();
    }
  }

  function handleChange(event: Event): void {
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

    const marketFilterName = target.dataset.marketFilter as keyof typeof marketFilters | undefined;
    if (marketFilterName) {
      marketFilters = {
        ...marketFilters,
        [marketFilterName]: target.value,
      };
      render();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && marketOverlayOpen) {
      event.preventDefault();
      closeMarketOverlay();
    }
  }

  host.addEventListener("click", handleClick);
  host.addEventListener("change", handleChange);
  host.addEventListener("keydown", handleKeydown);
  render();

  return {
    destroy(): void {
      host.removeEventListener("click", handleClick);
      host.removeEventListener("change", handleChange);
      host.removeEventListener("keydown", handleKeydown);
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
): string {
  return `
    <section class="panel">
      <div class="panel-head">
        <h3>Aircraft Workspace</h3>
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
      </div>
      <div class="panel-body aircraft-workspace-body">
        ${workspaceTab === "fleet"
          ? renderFleetWorkspace(payload, fleetViewState)
          : renderMarketWorkspace(payload, marketViewState, reviewState)}
      </div>
    </section>
  `;
}

// Fleet workspace emphasizes triage: filters, sortable table, and a single selected-aircraft detail rail.
function renderFleetWorkspace(payload: AircraftTabPayload, viewState: AircraftFleetViewState): string {
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
          ${renderFleetTable(viewState)}
        </div>
      </section>
      <section class="panel aircraft-detail-panel">
        <div class="panel-head"><h3>${escapeHtml(selectedAircraftTitle)}</h3></div>
        <div class="panel-body aircraft-detail-body">${renderAircraftDetail(viewState.selectedAircraft)}</div>
      </section>
    </div>
  `;
}

// Market workspace keeps the market table primary and opens listing detail in an overlay so acquisition research stays focused.
function renderMarketWorkspace(
  payload: AircraftTabPayload,
  viewState: ReturnType<typeof applyAircraftMarketViewState>,
  reviewState: AcquisitionReviewState | null,
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
        <div class="panel-body aircraft-fleet-body">
          <div class="aircraft-toolbar market-toolbar">
            <label>Search<input type="text" value="${escapeHtml(viewState.filters.searchText)}" data-market-filter="searchText" placeholder="Model or airport" /></label>
            <label>Condition<select data-market-filter="conditionBand">${renderOptions(viewState.filters.conditionBand, [["all", "All conditions"], ...payload.marketWorkspace.filterOptions.conditionBands.map((value) => [value, marketConditionLabel(value)] as [string, string])])}</select></label>
            <div class="range-field aircraft-location-range">
              <span>Location radius</span>
              <div class="range-inputs">
                <input type="text" value="${escapeHtml(viewState.filters.locationAirportText)}" data-market-filter="locationAirportText" placeholder="Airport code or name" />
                <input type="number" min="0" step="25" value="${escapeHtml(viewState.filters.maxDistanceNm)}" data-market-filter="maxDistanceNm" placeholder="Max nm" />
              </div>
            </div>
          </div>
          ${renderMarketTable(viewState)}
        </div>
      </section>
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
            ${renderMarketDetail(payload.saveId, payload.marketWorkspace.currentCashAmount, viewState.selectedOffer, reviewState)}
          </div>
        </section>
      </div>
    </div>
  `;
}

// Renders the fleet table view, leaving selection and sorting to the lightweight browser controller.
function renderFleetTable(viewState: AircraftFleetViewState): string {
  if (viewState.visibleAircraft.length === 0) {
    return `<div class="empty-state">No aircraft match the current filters. <button type="button" class="button-link button-secondary" data-aircraft-clear-filters="1">Clear filters</button></div>`;
  }

  return `
    <div class="table-wrap aircraft-table-wrap" data-aircraft-scroll="fleet-list">
      <table>
        <thead>
          <tr>
            <th class="sortable">${renderFleetSortButton(viewState.sort, "tail", "Aircraft")}</th>
            <th class="sortable">${renderFleetSortButton(viewState.sort, "location", "Location")}</th>
            <th class="sortable">${renderFleetSortButton(viewState.sort, "state", "Ownership")}</th>
            <th class="sortable">${renderFleetSortButton(viewState.sort, "condition", "Condition")}</th>
            <th class="sortable">${renderFleetSortButton(viewState.sort, "payload", "Mission Profile")}</th>
            <th class="sortable">${renderFleetSortButton(viewState.sort, "attention", "Next Milestone")}</th>
          </tr>
        </thead>
        <tbody>
          ${viewState.visibleAircraft.map((aircraft) => renderAircraftRow(aircraft, viewState.selectedAircraftId)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// Renders the aircraft market table while keeping rows simple enough for cheap full rerenders on every interaction.
function renderMarketTable(viewState: ReturnType<typeof applyAircraftMarketViewState>): string {
  if (viewState.visibleOffers.length === 0) {
    return `<div class="empty-state">No aircraft listings match the current market filters. <button type="button" class="button-link button-secondary" data-market-clear-filters="1">Clear filters</button></div>`;
  }

  return `
    <div class="table-wrap aircraft-table-wrap" data-aircraft-scroll="market-list">
      <table>
        <thead>
          <tr>
            <th>Listing</th>
            <th>Airport</th>
            <th class="sortable">${renderMarketSortButton(viewState.sort, "condition", "Condition")}</th>
            <th class="sortable">${renderMarketSortButton(viewState.sort, "range", "Capability")}</th>
            <th class="sortable">${renderMarketSortButton(viewState.sort, "asking_price", "Ask")}</th>
            <th class="sortable">${renderMarketSortButton(viewState.sort, "distance", "Distance")}</th>
          </tr>
        </thead>
        <tbody>
          ${viewState.visibleOffers.map((offer) => renderMarketRow(offer, viewState.selectedOfferId)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderFleetSortButton(sort: AircraftTableSort, key: AircraftTableSortKey, label: string): string {
  const isCurrent = sort.key === key;
  const direction = isCurrent ? sort.direction : defaultFleetSortDirection(key);
  return `<button type="button" class="table-sort ${isCurrent ? "current" : ""}" data-aircraft-sort-key="${escapeHtml(key)}"><span>${escapeHtml(label)}</span><span class="table-sort-direction">${direction === "asc" ? "Asc" : "Desc"}</span></button>`;
}

function renderMarketSortButton(sort: AircraftMarketSort, key: AircraftMarketSortKey, label: string): string {
  const isCurrent = sort.key === key;
  const direction = isCurrent ? sort.direction : defaultMarketSortDirection(key);
  return `<button type="button" class="table-sort ${isCurrent ? "current" : ""}" data-market-sort-key="${escapeHtml(key)}"><span>${escapeHtml(label)}</span><span class="table-sort-direction">${direction === "asc" ? "Asc" : "Desc"}</span></button>`;
}

function renderAircraftRow(aircraft: AircraftTabAircraftView, selectedAircraftId: string | undefined): string {
  const isSelected = aircraft.aircraftId === selectedAircraftId;
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
    </tr>
  `;
}

function renderMarketRow(offer: AircraftMarketOfferView, selectedOfferId: string | undefined): string {
  const isSelected = offer.aircraftOfferId === selectedOfferId;
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
      <td><div class="meta-stack"><span>${escapeHtml(envelopeLabel(offer.maxPassengers, offer.maxCargoLb, offer.rangeNm))}</span><span class="muted">${escapeHtml(accessLabel(offer.minimumRunwayFt, offer.minimumAirportSize))}</span></div></td>
      <td>${escapeHtml(formatMoney(offer.askingPurchasePriceAmount))}</td>
      <td>${escapeHtml(formatNumber(offer.distanceFromHomeBaseNm))} nm</td>
    </tr>
  `;
}

// Expands one owned aircraft into an operational brief that answers "what can this airframe do right now?"
function renderAircraftDetail(aircraft: AircraftTabAircraftView | null): string {
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
          ${renderFactListRow("Why it matters", aircraft.whyItMatters)}
        </div>
      </section>
    </div>
  `;
}

// Expands one market listing into acquisition details, terms, and risk/fit context.
function renderMarketDetail(
  saveId: string,
  currentCashAmount: number,
  offer: AircraftMarketOfferView | null,
  reviewState: AcquisitionReviewState | null,
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
        ? renderDealReview(saveId, currentCashAmount, offer, activeReview)
        : `<section class="summary-list market-deals">
            ${renderDealCard(offer, offer.buyOption, "Buy")}
            ${renderDealCard(offer, cheapestOption(offer.financeOptions), "Loan")}
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
      ? "Loan terms"
      : "Lease terms";
  const pendingLabel = reviewState.ownershipType === "owned"
    ? "Purchasing aircraft..."
    : reviewState.ownershipType === "financed"
      ? "Finalizing loan..."
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
        <button type="submit" ${selectedOption.isAffordable ? "" : "disabled"} data-pending-label="${escapeHtml(pendingLabel)}">Confirm ${escapeHtml(reviewState.ownershipType === "owned" ? "purchase" : reviewState.ownershipType === "financed" ? "loan" : "lease")}</button>
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
  return key === "asking_price" || key === "distance" ? "asc" : "desc";
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
    return "Loaned";
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
