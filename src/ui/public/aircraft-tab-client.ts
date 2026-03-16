import {
  applyAircraftFleetViewState,
  applyAircraftMarketViewState,
  type AircraftFleetViewState,
  type AircraftMarketOfferView,
  type AircraftMarketSort,
  type AircraftMarketSortDirection,
  type AircraftMarketSortKey,
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

export function mountAircraftTab(host: HTMLElement, payload: AircraftTabPayload): AircraftTabController {
  let workspaceTab = loadStoredWorkspace(payload.saveId) ?? payload.defaultWorkspaceTab;
  let fleetFilters: AircraftTableFilters = payload.fleetWorkspace.defaultFilters;
  let fleetSort: AircraftTableSort = payload.fleetWorkspace.defaultSort;
  let selectedAircraftId = payload.fleetWorkspace.aircraft[0]?.aircraftId;
  let marketFilters = payload.marketWorkspace.defaultFilters;
  let marketSort = payload.marketWorkspace.defaultSort;
  let selectedOfferId = payload.marketWorkspace.defaultSelectedOfferId;

  function render(): void {
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
    host.innerHTML = renderAircraftTab(payload, workspaceTab, fleetViewState, marketViewState);
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

  host.addEventListener("click", handleClick);
  host.addEventListener("change", handleChange);
  render();

  return {
    destroy(): void {
      host.removeEventListener("click", handleClick);
      host.removeEventListener("change", handleChange);
    },
  };
}

function renderAircraftTab(
  payload: AircraftTabPayload,
  workspaceTab: AircraftWorkspaceTab,
  fleetViewState: AircraftFleetViewState,
  marketViewState: ReturnType<typeof applyAircraftMarketViewState>,
): string {
  const activeWorkspace = workspaceTab === "market" ? payload.marketWorkspace : payload.fleetWorkspace;

  return `
    <section class="aircraft-summary-grid">
      ${activeWorkspace.summaryCards.map(renderSummaryCard).join("")}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h3>Aircraft Workspace</h3>
        <div class="pill-row">
          <button type="button" class="subtab-link ${workspaceTab === "fleet" ? "current" : ""}" data-aircraft-workspace="fleet">Fleet</button>
          <button type="button" class="subtab-link ${workspaceTab === "market" ? "current" : ""}" data-aircraft-workspace="market">Market</button>
        </div>
      </div>
      <div class="panel-body">
        ${workspaceTab === "fleet"
          ? renderFleetWorkspace(payload, fleetViewState)
          : renderMarketWorkspace(payload, marketViewState)}
      </div>
    </section>
  `;
}

function renderSummaryCard(card: AircraftTabPayload["fleetWorkspace"]["summaryCards"][number]): string {
  return `<article class="context-card ${card.tone}"><div class="eyebrow">${escapeHtml(card.label)}</div><strong>${escapeHtml(card.value)}</strong><span class="muted">${escapeHtml(card.detail)}</span></article>`;
}

function renderFleetWorkspace(payload: AircraftTabPayload, viewState: AircraftFleetViewState): string {
  if (payload.fleetWorkspace.aircraft.length === 0) {
    return `<div class="empty-state">No aircraft in the fleet yet. Switch to <strong>Market</strong> to acquire the first airframe.</div>`;
  }

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
              ["all", "All fleet"],
              ["ready", "Ready"],
              ["constrained", "Constrained"],
            ])}</select></label>
            <label>Risk<select data-aircraft-filter="risk">${renderOptions(viewState.filters.risk, [
              ["all", "All bands"],
              ["healthy", "Healthy"],
              ["watch", "Watch"],
              ["critical", "Critical"],
            ])}</select></label>
            <label>Staffing<select data-aircraft-filter="staffing">${renderOptions(viewState.filters.staffing, [
              ["all", "All coverage"],
              ["covered", "Covered"],
              ["tight", "Tight"],
              ["uncovered", "Uncovered"],
            ])}</select></label>
          </div>
          ${renderFleetTable(viewState)}
        </div>
      </section>
      <section class="panel aircraft-detail-panel">
        <div class="panel-head"><h3>Selected Aircraft</h3></div>
        <div class="panel-body aircraft-detail-body">${renderAircraftDetail(viewState.selectedAircraft)}</div>
      </section>
    </div>
  `;
}

function renderMarketWorkspace(payload: AircraftTabPayload, viewState: ReturnType<typeof applyAircraftMarketViewState>): string {
  return `
    <div class="aircraft-workbench">
      <section class="panel aircraft-market-panel">
        <div class="panel-head">
          <h3>Aircraft Market</h3>
          <div class="pill-row">
            <span class="pill">${escapeHtml(String(viewState.visibleOffers.length))} visible</span>
            <span class="pill">${escapeHtml(String(payload.marketWorkspace.offers.length))} listed</span>
            ${payload.marketWorkspace.expiresAtUtc ? `<span class="pill">Expires ${escapeHtml(formatDate(payload.marketWorkspace.expiresAtUtc))}</span>` : ""}
            <form method="post" action="/api/save/${encodeURIComponent(payload.saveId)}/actions/refresh-aircraft-market" class="inline" data-api-form>
              <input type="hidden" name="tab" value="aircraft" />
              <button type="submit" data-pending-label="Refreshing market...">Refresh market</button>
            </form>
          </div>
        </div>
        <div class="panel-body aircraft-fleet-body">
          <div class="aircraft-toolbar market-toolbar">
            <label>Search<input type="text" value="${escapeHtml(viewState.filters.searchText)}" data-market-filter="searchText" placeholder="Model, role, airport" /></label>
            <label>Role<select data-market-filter="rolePool">${renderOptions(viewState.filters.rolePool, [["all", "All roles"], ...payload.marketWorkspace.filterOptions.rolePools.map((value) => [value, humanize(value)] as [string, string])])}</select></label>
            <label>Condition<select data-market-filter="conditionBand">${renderOptions(viewState.filters.conditionBand, [["all", "All bands"], ...payload.marketWorkspace.filterOptions.conditionBands.map((value) => [value, humanize(value)] as [string, string])])}</select></label>
            <label>Location<input type="text" value="${escapeHtml(viewState.filters.locationText)}" data-market-filter="locationText" placeholder="Airport code or city" /></label>
            <label>Affordability<select data-market-filter="affordability">${renderOptions(viewState.filters.affordability, [
              ["all", "All offers"],
              ["can_buy_now", "Can buy now"],
              ["can_loan_now", "Can loan now"],
              ["can_lease_now", "Can lease now"],
            ])}</select></label>
          </div>
          ${renderMarketTable(viewState)}
        </div>
      </section>
      <section class="panel aircraft-detail-panel">
        <div class="panel-head"><h3>Selected Listing</h3></div>
        <div class="panel-body aircraft-detail-body">${renderMarketDetail(payload.saveId, viewState.selectedOffer)}</div>
      </section>
    </div>
  `;
}

function renderFleetTable(viewState: AircraftFleetViewState): string {
  if (viewState.visibleAircraft.length === 0) {
    return `<div class="empty-state">No aircraft match the current filters. <button type="button" class="button-link button-secondary" data-aircraft-clear-filters="1">Clear filters</button></div>`;
  }

  return `
    <div class="table-wrap aircraft-table-wrap">
      <table>
        <thead>
          <tr>
            <th class="sortable">${renderFleetSortButton(viewState.sort, "tail", "Aircraft")}</th>
            <th class="sortable">${renderFleetSortButton(viewState.sort, "location", "Location")}</th>
            <th class="sortable">${renderFleetSortButton(viewState.sort, "state", "State")}</th>
            <th class="sortable">${renderFleetSortButton(viewState.sort, "condition", "Condition")}</th>
            <th class="sortable">${renderFleetSortButton(viewState.sort, "staffing", "Staffing")}</th>
            <th class="sortable">${renderFleetSortButton(viewState.sort, "payload", "Growth Fit")}</th>
            <th class="sortable">${renderFleetSortButton(viewState.sort, "attention", "Next Event")}</th>
          </tr>
        </thead>
        <tbody>
          ${viewState.visibleAircraft.map((aircraft) => renderAircraftRow(aircraft, viewState.selectedAircraftId)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMarketTable(viewState: ReturnType<typeof applyAircraftMarketViewState>): string {
  if (viewState.visibleOffers.length === 0) {
    return `<div class="empty-state">No aircraft listings match the current market filters. <button type="button" class="button-link button-secondary" data-market-clear-filters="1">Clear filters</button></div>`;
  }

  return `
    <div class="table-wrap aircraft-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Listing</th>
            <th>Airport</th>
            <th class="sortable">${renderMarketSortButton(viewState.sort, "condition", "Condition")}</th>
            <th class="sortable">${renderMarketSortButton(viewState.sort, "range", "Capability")}</th>
            <th class="sortable">${renderMarketSortButton(viewState.sort, "asking_price", "Ask")}</th>
            <th class="sortable">${renderMarketSortButton(viewState.sort, "monthly_burden", "Monthly")}</th>
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
    <tr class="aircraft-row ${isSelected ? "selected" : ""}">
      <td>
        <button type="button" class="aircraft-row-button" data-aircraft-select="${escapeHtml(aircraft.aircraftId)}">
          <div class="meta-stack">
            <span class="route">${escapeHtml(aircraft.registration)}</span>
            <span class="muted">${escapeHtml(aircraft.modelDisplayName)} | ${escapeHtml(aircraft.roleLabel)}</span>
          </div>
        </button>
      </td>
      <td>${renderLocationCell(aircraft.location)}</td>
      <td><div class="meta-stack">${renderBadge(aircraft.operationalState)}<span class="muted">${escapeHtml(aircraft.ownershipType.replaceAll("_", " "))}</span></div></td>
      <td><div class="meta-stack"><div class="pill-row">${renderBadge(aircraft.conditionBand)}${renderBadge(aircraft.maintenanceState)}</div><span class="muted">${formatPercent(aircraft.conditionValue)} condition | ${formatHours(aircraft.hoursToService)} to service</span></div></td>
      <td><div class="meta-stack">${renderBadge(aircraft.staffingFlag)}<span class="muted">${escapeHtml(laborModelLabel(aircraft))}</span></div></td>
      <td><div class="meta-stack"><span>${escapeHtml(envelopeLabel(aircraft.maxPassengers, aircraft.maxCargoLb, aircraft.rangeNm))}</span><span class="muted">${escapeHtml(accessLabel(aircraft.minimumRunwayFt, aircraft.minimumAirportSize))}</span></div></td>
      <td><div class="meta-stack"><span>${escapeHtml(aircraft.nextEvent.label)}</span><span class="muted">${escapeHtml(aircraft.nextEvent.detail)}</span></div></td>
    </tr>
  `;
}

function renderMarketRow(offer: AircraftMarketOfferView, selectedOfferId: string | undefined): string {
  const isSelected = offer.aircraftOfferId === selectedOfferId;
  return `
    <tr class="aircraft-row ${isSelected ? "selected" : ""}" data-market-select="${escapeHtml(offer.aircraftOfferId)}">
      <td><div class="meta-stack"><span class="route">${escapeHtml(offer.modelDisplayName)}</span><span class="muted">${escapeHtml(offer.registration)} | ${escapeHtml(offer.roleLabel)}</span></div></td>
      <td>${renderLocationCell(offer.location)}</td>
      <td><div class="meta-stack"><div class="pill-row">${renderBadge(offer.conditionBand)}${renderBadge(offer.maintenanceState)}</div><span class="muted">${formatPercent(offer.conditionValue)} | ${formatHours(offer.hoursToService)} to service</span></div></td>
      <td><div class="meta-stack"><span>${escapeHtml(envelopeLabel(offer.maxPassengers, offer.maxCargoLb, offer.rangeNm))}</span><span class="muted">${escapeHtml(accessLabel(offer.minimumRunwayFt, offer.minimumAirportSize))}</span></div></td>
      <td>${escapeHtml(formatMoney(offer.askingPurchasePriceAmount))}</td>
      <td>${escapeHtml(formatMoney(offer.lowestRecurringBurdenAmount))}</td>
      <td>${escapeHtml(formatNumber(offer.distanceFromHomeBaseNm))} nm</td>
    </tr>
  `;
}

function renderAircraftDetail(aircraft: AircraftTabAircraftView | null): string {
  if (!aircraft) {
    return `<div class="empty-state">No aircraft are visible with the current filters.</div>`;
  }

  return `
    <div class="aircraft-detail-stack">
      <section class="aircraft-detail-hero">
        <div class="meta-stack">
          <div class="eyebrow">${escapeHtml(aircraft.roleLabel)}</div>
          <strong>${escapeHtml(aircraft.registration)} | ${escapeHtml(aircraft.modelDisplayName)}</strong>
          <span class="muted">${escapeHtml(aircraft.displayName)} | ${escapeHtml(aircraft.location.code)} | ${escapeHtml(aircraft.location.primaryLabel)}</span>
        </div>
        <div class="pill-row">
          ${renderBadge(aircraft.operationalState)}
          ${renderBadge(aircraft.conditionBand)}
          ${renderBadge(aircraft.maintenanceState)}
          ${renderBadge(aircraft.staffingFlag)}
          ${renderBadge(aircraft.msfs2024Status)}
        </div>
      </section>
      <section>
        <div class="eyebrow">Why It Matters</div>
        <ul class="aircraft-why-list">${aircraft.whyItMatters.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
      </section>
      <section class="summary-list">
        <article class="summary-item compact"><div class="eyebrow">Next event</div><strong>${escapeHtml(aircraft.nextEvent.label)}</strong><span class="muted">${escapeHtml(aircraft.nextEvent.detail)}</span></article>
        <article class="summary-item compact"><div class="eyebrow">Current commitment</div><strong>${escapeHtml(aircraft.currentCommitment?.label ?? "Uncommitted")}</strong><span class="muted">${escapeHtml(aircraft.currentCommitment?.detail ?? "No active schedule or maintenance booking is holding this aircraft.")}</span></article>
      </section>
      <section class="summary-list">
        <article class="summary-item compact"><div class="eyebrow">Growth envelope</div><strong>${escapeHtml(envelopeLabel(aircraft.maxPassengers, aircraft.maxCargoLb, aircraft.rangeNm))}</strong><span class="muted">${escapeHtml(accessLabel(aircraft.minimumRunwayFt, aircraft.minimumAirportSize))}</span></article>
        <article class="summary-item compact"><div class="eyebrow">Labor model</div><strong>${escapeHtml(laborModelLabel(aircraft))}</strong><span class="muted">Mechanic group ${escapeHtml(aircraft.mechanicSkillGroup.replaceAll("_", " "))}</span></article>
        <article class="summary-item compact"><div class="eyebrow">Ownership burden</div><strong>${escapeHtml(ownershipDetailLabel(aircraft))}</strong><span class="muted">${escapeHtml(paymentWindowLabel(aircraft))}</span></article>
        <article class="summary-item compact"><div class="eyebrow">Airframe state</div><strong>${escapeHtml(formatPercent(aircraft.conditionValue))} condition</strong><span class="muted">${escapeHtml(formatNumber(aircraft.airframeHoursTotal))} hrs | ${escapeHtml(formatNumber(aircraft.airframeCyclesTotal))} cycles | ${escapeHtml(formatHours(aircraft.hoursSinceInspection))} since inspection</span></article>
      </section>
    </div>
  `;
}

function renderMarketDetail(saveId: string, offer: AircraftMarketOfferView | null): string {
  if (!offer) {
    return `<div class="empty-state">No aircraft listings match the current filters.</div>`;
  }

  return `
    <div class="aircraft-detail-stack">
      <section class="aircraft-detail-hero">
        <div class="meta-stack">
          <div class="eyebrow">${escapeHtml(offer.roleLabel)}</div>
          <strong>${escapeHtml(offer.modelDisplayName)} | ${escapeHtml(offer.registration)}</strong>
          <span class="muted">${escapeHtml(offer.location.code)} | ${escapeHtml(offer.location.primaryLabel)} | ${escapeHtml(offer.displayName)}</span>
        </div>
        <div class="pill-row">
          ${renderBadge(offer.conditionBand)}
          ${renderBadge(offer.maintenanceState)}
          ${renderBadge(offer.listingType)}
          ${renderBadge(offer.msfs2024Status)}
        </div>
      </section>
      <section class="summary-list">
        <article class="summary-item compact"><div class="eyebrow">Airport</div><strong>${escapeHtml(offer.location.code)} | ${escapeHtml(offer.location.primaryLabel)}</strong><span class="muted">${escapeHtml(offer.location.secondaryLabel ?? "Listed away from the home base.")}</span></article>
        <article class="summary-item compact"><div class="eyebrow">Distance from home</div><strong>${escapeHtml(formatNumber(offer.distanceFromHomeBaseNm))} nm</strong><span class="muted">Aircraft stays at the listed airport after acquisition.</span></article>
      </section>
      <section class="summary-list">
        <article class="summary-item compact"><div class="eyebrow">Capability</div><strong>${escapeHtml(envelopeLabel(offer.maxPassengers, offer.maxCargoLb, offer.rangeNm))}</strong><span class="muted">${escapeHtml(accessLabel(offer.minimumRunwayFt, offer.minimumAirportSize))}</span></article>
        <article class="summary-item compact"><div class="eyebrow">Maintenance</div><strong>${escapeHtml(formatPercent(offer.conditionValue))} condition | ${escapeHtml(formatHours(offer.hoursToService))} to service</strong><span class="muted">${escapeHtml(formatNumber(offer.airframeHoursTotal))} hrs | ${escapeHtml(formatNumber(offer.airframeCyclesTotal))} cycles</span></article>
        <article class="summary-item compact"><div class="eyebrow">Support profile</div><strong>${escapeHtml(humanize(offer.requiredGroundServiceLevel))}</strong><span class="muted">${escapeHtml(humanize(offer.gateRequirement))} | ${escapeHtml(humanize(offer.cargoLoadingType))}</span></article>
        <article class="summary-item compact"><div class="eyebrow">MSFS</div><strong>${escapeHtml(humanize(offer.msfs2024Status))}</strong><span class="muted">${escapeHtml(offer.msfs2024UserNote ?? "Availability is tracked separately from game eligibility.")}</span></article>
      </section>
      ${renderReasonsSection("Why it fits", offer.fitReasons)}
      ${renderReasonsSection("Why it is risky", offer.riskReasons)}
      <section class="summary-list market-deals">
        ${renderDealCard(saveId, offer, "owned", "Buy", offer.askingPurchasePriceAmount, undefined, undefined, offer.canBuyNow)}
        ${renderDealCard(saveId, offer, "financed", "Loan", offer.financeTerms.upfrontPaymentAmount, offer.financeTerms.recurringPaymentAmount, offer.financeTerms.termMonths, offer.canLoanNow)}
        ${renderDealCard(saveId, offer, "leased", "Lease", offer.leaseTerms.upfrontPaymentAmount, offer.leaseTerms.recurringPaymentAmount, offer.leaseTerms.termMonths, offer.canLeaseNow)}
      </section>
    </div>
  `;
}

function renderDealCard(
  saveId: string,
  offer: AircraftMarketOfferView,
  ownershipType: "owned" | "financed" | "leased",
  label: string,
  upfrontPaymentAmount: number,
  recurringPaymentAmount: number | undefined,
  termMonths: number | undefined,
  affordable: boolean,
): string {
  return `
    <article class="summary-item compact">
      <div class="eyebrow">${escapeHtml(label)}</div>
      <strong>${escapeHtml(formatMoney(upfrontPaymentAmount))} upfront</strong>
      <span class="muted">${recurringPaymentAmount !== undefined ? `${formatMoney(recurringPaymentAmount)} / mo` : "No recurring burden"}${termMonths ? ` | ${termMonths} mo term` : ""}</span>
      <form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/acquire-aircraft-offer" class="actions" data-api-form>
        <input type="hidden" name="tab" value="aircraft" />
        <input type="hidden" name="aircraftOfferId" value="${escapeHtml(offer.aircraftOfferId)}" />
        <input type="hidden" name="ownershipType" value="${escapeHtml(ownershipType)}" />
        <button type="submit" ${affordable ? "" : "disabled"} data-pending-label="Acquiring aircraft...">${escapeHtml(label)}</button>
      </form>
      ${affordable ? "" : `<span class="muted">Insufficient cash for the required upfront payment.</span>`}
    </article>
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

function renderOptions(currentValue: string, options: Array<[string, string]>): string {
  return options
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === currentValue ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function renderBadge(label: string): string {
  return `<span class="badge ${badgeClass(label)}">${escapeHtml(humanize(label))}</span>`;
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
      return "State";
    case "condition":
      return "Condition";
    case "staffing":
      return "Staffing";
    case "range":
      return "Range";
    case "payload":
      return "Growth Fit";
    case "obligation":
      return "Obligation";
    case "attention":
    default:
      return "Attention";
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
  return `${humanize(aircraft.ownershipType)}${obligation}`;
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
  }).format(Math.abs(value))}h`;
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
