/*
 * Browser controller for the dispatch tab inside the save shell.
 * It keeps only transient UI state such as the selected aircraft and selected leg while the server owns the data model.
 */

import {
  applyDispatchWorkspaceViewState,
  type DispatchAircraftView,
  type DispatchLegView,
  type DispatchTabPayload,
  type DispatchValidationSnapshotView,
  type DispatchValidationMessageView,
} from "../dispatch-tab-model.js";

export interface DispatchTabController {
  destroy(): void;
}

const selectionStoragePrefix = "flightline:dispatch-selection:";

export function mountDispatchTab(host: HTMLElement, payload: DispatchTabPayload): DispatchTabController {
  const storedSelection = loadStoredSelection(payload.saveId);
  let selectedAircraftId = storedSelection?.aircraftId ?? payload.defaultSelectedAircraftId;
  let selectedLegId = storedSelection?.legId;

  function render(): void {
    const viewState = applyDispatchWorkspaceViewState(payload, {
      ...(selectedAircraftId ? { selectedAircraftId } : {}),
      ...(selectedLegId ? { selectedLegId } : {}),
    });

    selectedAircraftId = viewState.selectedAircraftId;
    selectedLegId = viewState.selectedLegId;
    storeSelection(payload.saveId, selectedAircraftId, selectedLegId);
    host.innerHTML = renderDispatchWorkspace(payload, viewState.selectedAircraft, viewState.selectedLeg);
  }

  function handleClick(event: MouseEvent): void {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }

    const aircraftButton = target.closest<HTMLElement>("[data-dispatch-aircraft-select]");
    if (aircraftButton) {
      event.preventDefault();
      selectedAircraftId = aircraftButton.dataset.dispatchAircraftSelect ?? selectedAircraftId;
      selectedLegId = undefined;
      render();
      return;
    }

    const legButton = target.closest<HTMLElement>("[data-dispatch-leg-select]");
    if (legButton) {
      event.preventDefault();
      selectedLegId = legButton.dataset.dispatchLegSelect ?? selectedLegId;
      render();
    }
  }

  host.addEventListener("click", handleClick);
  render();

  return {
    destroy(): void {
      host.removeEventListener("click", handleClick);
    },
  };
}

function renderDispatchWorkspace(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedLeg: DispatchLegView | undefined,
): string {
  return `
    <div class="dispatch-workspace">
      <section class="dispatch-hero-card">
        <div class="meta-stack">
          <div class="eyebrow">Dispatch</div>
          <strong>Single-aircraft planning board</strong>
          <span class="muted">Select one aircraft, stage work, inspect the current leg queue, and commit only when backend validation clears the plan.</span>
        </div>
        <div class="pill-row">
          <span class="pill">${escapeHtml(String(payload.aircraft.length))} aircraft</span>
          <span class="pill">${escapeHtml(String(payload.timeUtility.draftScheduleCount))} drafts</span>
          <span class="pill">${escapeHtml(String(payload.timeUtility.committedScheduleCount))} committed</span>
        </div>
      </section>
      ${renderAircraftStrip(payload.aircraft, selectedAircraft?.aircraftId)}
      <div class="dispatch-board">
        <section class="panel dispatch-input-panel" data-dispatch-input-lane>
          <div class="panel-head">
            <h3>Work Inputs</h3>
            <div class="pill-row">
              <span class="pill">${escapeHtml(String(payload.workInputs.routePlanItems.length))} route plan</span>
              <span class="pill">${escapeHtml(String(payload.workInputs.acceptedContracts.length))} accepted</span>
            </div>
          </div>
          <div class="panel-body dispatch-input-body">
            ${renderRoutePlanSection(payload, selectedAircraft)}
            ${renderAcceptedWorkSection(payload, selectedAircraft)}
            ${renderAdvanceTimeUtility(payload)}
          </div>
        </section>
        <div class="dispatch-plan-column">
          <section class="panel dispatch-selected-aircraft-panel" data-dispatch-selected-aircraft>
            <div class="panel-head">
              <h3>${escapeHtml(selectedAircraft ? `${selectedAircraft.registration} | ${selectedAircraft.modelDisplayName}` : "Selected aircraft")}</h3>
              ${selectedAircraft ? `<div class="pill-row">${renderBadge(selectedAircraft.dispatchAvailable ? "available" : selectedAircraft.operationalState)}${renderBadge(selectedAircraft.maintenanceState)}</div>` : ""}
            </div>
            <div class="panel-body">
              ${renderSelectedAircraftSummary(selectedAircraft)}
            </div>
          </section>
          <section class="panel dispatch-timeline-panel">
            <div class="panel-head">
              <h3>Timeline Summary</h3>
              ${selectedAircraft?.schedule ? `<span class="pill">${escapeHtml(selectedAircraft.schedule.isDraft ? "draft" : selectedAircraft.schedule.scheduleState)}</span>` : ""}
            </div>
            <div class="panel-body dispatch-timeline-body">
              ${renderTimeline(selectedAircraft?.schedule?.legs)}
            </div>
          </section>
          <div class="dispatch-queue-grid">
            <section class="panel dispatch-queue-panel">
              <div class="panel-head">
                <h3>Leg Queue</h3>
                ${selectedAircraft?.schedule ? `<span class="pill">${escapeHtml(String(selectedAircraft.schedule.legs.length))} legs</span>` : ""}
              </div>
              <div class="panel-body dispatch-queue-body" data-dispatch-leg-queue>
                ${renderLegQueue(selectedAircraft?.schedule?.legs, selectedLeg?.flightLegId)}
              </div>
            </section>
            <section class="panel dispatch-leg-detail-panel" data-dispatch-selected-leg-detail>
              <div class="panel-head">
                <h3>Selected Leg</h3>
                ${selectedLeg ? `<span class="pill">Leg ${escapeHtml(String(selectedLeg.sequenceNumber))}</span>` : ""}
              </div>
              <div class="panel-body">
                ${renderSelectedLeg(selectedLeg)}
              </div>
            </section>
          </div>
        </div>
        <section class="panel dispatch-validation-panel" data-dispatch-validation-rail>
          <div class="panel-head">
            <h3>Validation Rail</h3>
            ${selectedAircraft?.schedule?.validation ? `<span class="pill">${escapeHtml(selectedAircraft.schedule.validation.projectedRiskBand)} risk</span>` : ""}
          </div>
          <div class="panel-body dispatch-validation-body">
            ${renderValidationRail(selectedAircraft)}
          </div>
        </section>
      </div>
      <section class="dispatch-commit-bar" data-dispatch-commit-bar>
        ${renderCommitBar(payload, selectedAircraft)}
      </section>
    </div>
  `;
}

function renderAircraftStrip(aircraft: DispatchAircraftView[], selectedAircraftId: string | undefined): string {
  if (aircraft.length === 0) {
    return `<section class="dispatch-aircraft-strip"><div class="empty-state">Acquire an aircraft before using Dispatch as a planning board.</div></section>`;
  }

  return `
    <section class="dispatch-aircraft-strip">
      ${aircraft.map((entry) => renderAircraftCard(entry, entry.aircraftId === selectedAircraftId)).join("")}
    </section>
  `;
}

function renderAircraftCard(aircraft: DispatchAircraftView, selected: boolean): string {
  const planLabel = aircraft.schedule
    ? aircraft.schedule.isDraft
      ? aircraft.schedule.validation?.isCommittable === false
        ? "blocked_draft"
        : "draft_ready"
      : aircraft.schedule.scheduleState
    : aircraft.dispatchAvailable
      ? "available"
      : aircraft.operationalState;

  return `
    <button
      type="button"
      class="dispatch-aircraft-card ${selected ? "selected" : ""}"
      data-dispatch-aircraft-select="${escapeHtml(aircraft.aircraftId)}"
      data-dispatch-aircraft-card="1"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <div class="dispatch-aircraft-card-head">
        <div class="meta-stack">
          <strong>${escapeHtml(aircraft.registration)}</strong>
          <span class="muted">${escapeHtml(aircraft.modelDisplayName)}</span>
        </div>
        ${renderBadge(planLabel)}
      </div>
      <div class="dispatch-aircraft-card-meta">
        <span>${escapeHtml(aircraft.currentAirport.code)}</span>
        <span>${escapeHtml(aircraft.currentAirport.primaryLabel)}</span>
      </div>
      <div class="dispatch-aircraft-card-facts">
        <span>${escapeHtml(humanize(aircraft.conditionBand))}</span>
        <span>${escapeHtml(humanize(aircraft.maintenanceState))}</span>
        <span>${escapeHtml(String(aircraft.pilotCoverageUnits))} pilot units</span>
      </div>
    </button>
  `;
}

function renderSelectedAircraftSummary(selectedAircraft: DispatchAircraftView | undefined): string {
  if (!selectedAircraft) {
    return `<div class="empty-state">No aircraft is selected yet.</div>`;
  }

  const schedule = selectedAircraft.schedule;
  const scheduleLabel = schedule
    ? schedule.isDraft
      ? schedule.validation?.isCommittable === false ? "Blocked draft" : "Draft staged"
      : `Committed ${humanize(schedule.scheduleState)}`
    : "No draft staged";

  return `
    <div class="dispatch-selected-aircraft-grid">
      <article class="summary-item compact">
        <div class="eyebrow">Location</div>
        <strong>${escapeHtml(selectedAircraft.currentAirport.code)}</strong>
        <span class="muted">${escapeHtml(selectedAircraft.currentAirport.primaryLabel)}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Plan Stage</div>
        <strong>${escapeHtml(scheduleLabel)}</strong>
        <span class="muted">${schedule ? `${formatDate(schedule.plannedStartUtc)} to ${formatDate(schedule.plannedEndUtc)}` : "Use accepted work or route-plan handoff to stage a draft."}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Maintenance</div>
        <strong>${escapeHtml(humanize(selectedAircraft.maintenanceState))}</strong>
        <span class="muted">${formatHours(selectedAircraft.hoursToService)} to service | ${formatPercent(selectedAircraft.conditionValue)} condition</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Pilot Group</div>
        <strong>${escapeHtml(humanize(selectedAircraft.pilotQualificationGroup))}</strong>
        <span class="muted">${escapeHtml(String(selectedAircraft.pilotCoverageUnits))} active | ${escapeHtml(String(selectedAircraft.pendingPilotCoverageUnits))} pending units</span>
      </article>
    </div>
  `;
}

function renderTimeline(legs: DispatchLegView[] | undefined): string {
  if (!legs || legs.length === 0) {
    return `<div class="empty-state">No leg queue is staged for this aircraft yet.</div>`;
  }

  return `
    <ol class="dispatch-timeline-list">
      ${legs.map((leg) => `
        <li class="dispatch-timeline-item">
          <div class="dispatch-timeline-time">${escapeHtml(formatTime(leg.plannedDepartureUtc))}</div>
          <div class="dispatch-timeline-copy">
            <strong>${escapeHtml(leg.originAirport.code)} -> ${escapeHtml(leg.destinationAirport.code)}</strong>
            <span class="muted">${escapeHtml(humanize(leg.legType))} | ${escapeHtml(leg.payloadLabel)} | arrive ${escapeHtml(formatTime(leg.plannedArrivalUtc))}</span>
          </div>
        </li>
      `).join("")}
    </ol>
  `;
}

function renderLegQueue(legs: DispatchLegView[] | undefined, selectedLegId: string | undefined): string {
  if (!legs || legs.length === 0) {
    return `<div class="empty-state">No schedule is staged for this aircraft.</div>`;
  }

  return `
    <div class="dispatch-queue-list">
      ${legs.map((leg) => `
        <button
          type="button"
          class="dispatch-leg-button ${leg.flightLegId === selectedLegId ? "selected" : ""}"
          data-dispatch-leg-select="${escapeHtml(leg.flightLegId)}"
          aria-pressed="${leg.flightLegId === selectedLegId ? "true" : "false"}"
        >
          <div class="dispatch-leg-button-head">
            <span class="dispatch-leg-sequence">${escapeHtml(String(leg.sequenceNumber))}</span>
            <div class="meta-stack">
              <strong>${escapeHtml(leg.originAirport.code)} -> ${escapeHtml(leg.destinationAirport.code)}</strong>
              <span class="muted">${escapeHtml(leg.payloadLabel)}</span>
            </div>
          </div>
          <div class="dispatch-leg-button-meta">
            <span>${escapeHtml(formatDate(leg.plannedDepartureUtc))}</span>
            <span>${escapeHtml(formatDuration(leg.durationMinutes))}</span>
            ${renderValidationCountBadge(leg.validationMessages)}
          </div>
        </button>
      `).join("")}
    </div>
  `;
}

function renderSelectedLeg(selectedLeg: DispatchLegView | undefined): string {
  if (!selectedLeg) {
    return `<div class="empty-state">Select a planned leg to inspect route, timing, and validation detail.</div>`;
  }

  return `
    <div class="dispatch-leg-detail-stack" data-dispatch-selected-leg="1">
      <section class="dispatch-detail-card">
        <div class="eyebrow">${escapeHtml(humanize(selectedLeg.legType))}</div>
        <strong>${escapeHtml(selectedLeg.originAirport.code)} -> ${escapeHtml(selectedLeg.destinationAirport.code)}</strong>
        <span class="muted">${escapeHtml(selectedLeg.originAirport.primaryLabel)} to ${escapeHtml(selectedLeg.destinationAirport.primaryLabel)}</span>
      </section>
      <section class="dispatch-detail-grid">
        <article class="summary-item compact">
          <div class="eyebrow">Window</div>
          <strong>${escapeHtml(formatDate(selectedLeg.plannedDepartureUtc))}</strong>
          <span class="muted">Arrive ${escapeHtml(formatDate(selectedLeg.plannedArrivalUtc))}</span>
        </article>
        <article class="summary-item compact">
          <div class="eyebrow">Payload</div>
          <strong>${escapeHtml(selectedLeg.payloadLabel)}</strong>
          <span class="muted">${escapeHtml(formatDuration(selectedLeg.durationMinutes))}</span>
        </article>
        <article class="summary-item compact">
          <div class="eyebrow">Revenue</div>
          <strong>${selectedLeg.contractPayoutAmount !== undefined ? escapeHtml(formatMoney(selectedLeg.contractPayoutAmount)) : "No payout"}</strong>
          <span class="muted">${selectedLeg.contractDeadlineUtc ? `Due ${escapeHtml(formatDate(selectedLeg.contractDeadlineUtc))}` : "Support leg"}</span>
        </article>
        <article class="summary-item compact">
          <div class="eyebrow">Qualification</div>
          <strong>${escapeHtml(humanize(selectedLeg.assignedQualificationGroup ?? "standard"))}</strong>
          <span class="muted">${selectedLeg.contractState ? `Contract ${escapeHtml(humanize(selectedLeg.contractState))}` : "No contract attached"}</span>
        </article>
      </section>
      ${renderLegValidationMessages(selectedLeg.validationMessages)}
    </div>
  `;
}

function renderLegValidationMessages(messages: DispatchValidationMessageView[]): string {
  if (messages.length === 0) {
    return `<div class="dispatch-message-list"><article class="dispatch-message-item info"><strong>No leg-specific warnings.</strong><span class="muted">This leg is not carrying its own blocker or warning messages in the current validation snapshot.</span></article></div>`;
  }

  return `
    <div class="dispatch-message-list">
      ${messages.map((message) => `
        <article class="dispatch-message-item ${message.severity}">
          <div class="dispatch-message-head">${renderBadge(message.severity)}<strong>${escapeHtml(message.summary)}</strong></div>
          ${message.suggestedRecoveryAction ? `<span class="muted">${escapeHtml(message.suggestedRecoveryAction)}</span>` : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function renderValidationRail(selectedAircraft: DispatchAircraftView | undefined): string {
  if (!selectedAircraft) {
    return `<div class="empty-state">Select an aircraft to inspect its current planning state.</div>`;
  }

  const schedule = selectedAircraft.schedule;
  const validation = schedule?.validation;
  if (!schedule || !validation) {
    return `
      <div class="summary-list">
        <article class="summary-item compact">
          <div class="eyebrow">Planning status</div>
          <strong>No draft validation yet</strong>
          <span class="muted">Use accepted work or route-plan handoff to run backend schedule validation for this aircraft.</span>
        </article>
        <article class="summary-item compact">
          <div class="eyebrow">Dispatch state</div>
          <strong>${escapeHtml(humanize(selectedAircraft.operationalState))}</strong>
          <span class="muted">${selectedAircraft.dispatchAvailable ? "Aircraft is dispatch ready." : "Aircraft is not currently dispatch ready."}</span>
        </article>
        <article class="summary-item compact">
          <div class="eyebrow">Maintenance</div>
          <strong>${escapeHtml(humanize(selectedAircraft.maintenanceState))}</strong>
          <span class="muted">${formatHours(selectedAircraft.hoursToService)} to service remaining.</span>
        </article>
      </div>
    `;
  }

  const messages = validation.validationMessages;
  const blockerCount = messages.filter((message) => message.severity === "blocker").length;
  const warningCount = messages.filter((message) => message.severity === "warning").length;

  return `
    <div class="dispatch-validation-summary">
      <article class="summary-item compact">
        <div class="eyebrow">Commit readiness</div>
        <strong>${validation.isCommittable ? "Ready" : "Blocked"}</strong>
        <span class="muted">${blockerCount} blockers | ${warningCount} warnings</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Forecast</div>
        <strong>${escapeHtml(formatMoney(validation.projectedScheduleProfit))}</strong>
        <span class="muted">${escapeHtml(formatMoney(validation.projectedScheduleRevenue))} revenue | ${escapeHtml(formatMoney(validation.projectedScheduleCost))} cost</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Risk band</div>
        <strong>${escapeHtml(humanize(validation.projectedRiskBand))}</strong>
        <span class="muted">${escapeHtml(formatNumber(validation.totalDistanceNm))} nm | ${escapeHtml(formatHours(validation.totalBlockHours))} block</span>
      </article>
    </div>
    ${messages.length === 0
      ? `<div class="empty-state compact">No blockers or warnings are attached to the current validation snapshot.</div>`
      : `<div class="dispatch-message-list">${messages.map((message) => `
          <article class="dispatch-message-item ${message.severity}">
            <div class="dispatch-message-head">${renderBadge(message.severity)}<strong>${escapeHtml(message.summary)}</strong></div>
            <span class="muted">${message.affectedLegSequenceNumber ? `Leg ${escapeHtml(String(message.affectedLegSequenceNumber))}` : "Schedule-level check"}${message.suggestedRecoveryAction ? ` | ${escapeHtml(message.suggestedRecoveryAction)}` : ""}</span>
          </article>
        `).join("")}</div>`}
  `;
}

function renderRoutePlanSection(payload: DispatchTabPayload, selectedAircraft: DispatchAircraftView | undefined): string {
  const routePlanItems = payload.workInputs.routePlanItems;
  const bindLabel = selectedAircraft?.schedule?.isDraft ? "Replace draft with route plan" : "Draft route plan";
  const bindButtonDisabled = !selectedAircraft || payload.workInputs.acceptedReadyCount === 0 || !selectedAircraft.dispatchAvailable;

  return `
    <section class="dispatch-input-section">
      <div class="dispatch-input-section-head">
        <div class="meta-stack">
          <div class="eyebrow">Route Plan Handoff</div>
          <strong>${escapeHtml(String(payload.workInputs.acceptedReadyCount))} accepted-ready items</strong>
          <span class="muted">${escapeHtml(String(payload.workInputs.blockerCount))} blockers | ${escapeHtml(String(payload.workInputs.scheduledCount))} scheduled${payload.workInputs.endpointAirport ? ` | endpoint ${escapeHtml(payload.workInputs.endpointAirport.code)}` : ""}</span>
        </div>
        ${selectedAircraft ? `
          <form method="post" action="/api/save/${encodeURIComponent(payload.saveId)}/actions/bind-route-plan" class="dispatch-inline-action" data-api-form>
            <input type="hidden" name="tab" value="dispatch" />
            <input type="hidden" name="saveId" value="${escapeHtml(payload.saveId)}" />
            <input type="hidden" name="aircraftId" value="${escapeHtml(selectedAircraft.aircraftId)}" />
            <button type="submit" ${bindButtonDisabled ? "disabled" : ""} data-dispatch-bind-route-plan="1" data-pending-label="Drafting route plan...">${escapeHtml(bindLabel)}</button>
          </form>
        ` : ""}
      </div>
      ${selectedAircraft?.schedule?.isDraft ? `<div class="muted dispatch-section-note">Drafting from the route plan will replace this aircraft's current draft.</div>` : ""}
      ${!selectedAircraft ? `<div class="muted dispatch-section-note">Select an aircraft to draft a route-plan handoff.</div>` : ""}
      ${selectedAircraft && !selectedAircraft.dispatchAvailable ? `<div class="muted dispatch-section-note">The selected aircraft is not dispatch ready, so route-plan binding stays unavailable.</div>` : ""}
      ${routePlanItems.length === 0
        ? `<div class="empty-state compact">Add contracts to the route plan from Contracts, then accept them there before handing them off into Dispatch.</div>`
        : `<div class="dispatch-input-list">${routePlanItems.map((item) => renderRoutePlanItem(item)).join("")}</div>`}
    </section>
  `;
}

function renderRoutePlanItem(item: DispatchTabPayload["workInputs"]["routePlanItems"][number]): string {
  return `
    <article class="dispatch-input-card" data-dispatch-route-plan-item="${escapeHtml(item.routePlanItemId)}">
      <div class="dispatch-input-card-head">
        <div class="meta-stack">
          <strong>${escapeHtml(item.originAirport.code)} -> ${escapeHtml(item.destinationAirport.code)}</strong>
          <span class="muted">${escapeHtml(item.originAirport.primaryLabel)} to ${escapeHtml(item.destinationAirport.primaryLabel)}</span>
        </div>
        <div class="pill-row">
          ${renderBadge(item.plannerItemStatus)}
          ${item.linkedAircraftId ? `<span class="pill">linked</span>` : ""}
        </div>
      </div>
      <div class="dispatch-input-card-meta">
        <span>${escapeHtml(formatPayload(item.volumeType, item.passengerCount, item.cargoWeightLb))}</span>
        <span>${escapeHtml(formatMoney(item.payoutAmount))}</span>
        <span>Due ${escapeHtml(formatDate(item.deadlineUtc))}</span>
      </div>
    </article>
  `;
}

function renderAcceptedWorkSection(payload: DispatchTabPayload, selectedAircraft: DispatchAircraftView | undefined): string {
  const attachedContractIds = new Set(
    selectedAircraft?.schedule?.legs
      .map((leg) => leg.linkedCompanyContractId)
      .filter((entry): entry is string => Boolean(entry)) ?? [],
  );

  return `
    <section class="dispatch-input-section">
      <div class="dispatch-input-section-head">
        <div class="meta-stack">
          <div class="eyebrow">Accepted Work</div>
          <strong>${escapeHtml(String(payload.workInputs.acceptedContracts.length))} contracts waiting for planning</strong>
          <span class="muted">Auto-plan preserves the existing backend draft flow and will replace the selected aircraft draft if one exists.</span>
        </div>
      </div>
      ${payload.workInputs.acceptedContracts.length === 0
        ? `<div class="empty-state compact">No accepted contracts are waiting for a dispatch plan.</div>`
        : `<div class="dispatch-input-list">${payload.workInputs.acceptedContracts.map((contract) => renderAcceptedContract(payload.saveId, contract, selectedAircraft, attachedContractIds.has(contract.companyContractId))).join("")}</div>`}
    </section>
  `;
}

function renderAcceptedContract(
  saveId: string,
  contract: DispatchTabPayload["workInputs"]["acceptedContracts"][number],
  selectedAircraft: DispatchAircraftView | undefined,
  alreadyInDraft: boolean,
): string {
  const actionDisabled = !selectedAircraft;

  return `
    <article class="dispatch-input-card" data-dispatch-accepted-contract="${escapeHtml(contract.companyContractId)}">
      <div class="dispatch-input-card-head">
        <div class="meta-stack">
          <strong>${escapeHtml(contract.originAirport.code)} -> ${escapeHtml(contract.destinationAirport.code)}</strong>
          <span class="muted">${escapeHtml(contract.originAirport.primaryLabel)} to ${escapeHtml(contract.destinationAirport.primaryLabel)}</span>
        </div>
        <div class="pill-row">
          ${renderBadge(contract.contractState)}
          ${alreadyInDraft ? `<span class="pill">in selected draft</span>` : ""}
        </div>
      </div>
      <div class="dispatch-input-card-meta">
        <span>${escapeHtml(formatPayload(contract.volumeType, contract.passengerCount, contract.cargoWeightLb))}</span>
        <span>${escapeHtml(formatMoney(contract.acceptedPayoutAmount))}</span>
        <span>Due ${escapeHtml(formatDate(contract.deadlineUtc))}</span>
      </div>
      <form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/auto-plan-contract" class="dispatch-inline-form" data-api-form>
        <input type="hidden" name="tab" value="dispatch" />
        <input type="hidden" name="saveId" value="${escapeHtml(saveId)}" />
        <input type="hidden" name="companyContractId" value="${escapeHtml(contract.companyContractId)}" />
        <input type="hidden" name="aircraftId" value="${escapeHtml(selectedAircraft?.aircraftId ?? "")}" />
        <button type="submit" ${actionDisabled ? "disabled" : ""} data-pending-label="Drafting schedule...">Auto-plan${selectedAircraft ? ` on ${escapeHtml(selectedAircraft.registration)}` : ""}</button>
      </form>
    </article>
  `;
}

function renderAdvanceTimeUtility(payload: DispatchTabPayload): string {
  return `
    <section class="dispatch-input-section dispatch-time-utility">
      <div class="dispatch-input-section-head">
        <div class="meta-stack">
          <div class="eyebrow">Execution Utility</div>
          <strong>Advance time</strong>
          <span class="muted">Keep time movement available, but secondary to schedule planning and validation.</span>
        </div>
        <span class="pill">${escapeHtml(String(payload.timeUtility.committedScheduleCount))} active schedules</span>
      </div>
      <form method="post" action="/api/save/${encodeURIComponent(payload.saveId)}/actions/advance-time" class="dispatch-advance-form" data-api-form data-dispatch-advance-form="1">
        <input type="hidden" name="tab" value="dispatch" />
        <input type="hidden" name="saveId" value="${escapeHtml(payload.saveId)}" />
        <label>Hours<input name="hours" type="number" min="1" value="6" /></label>
        <label>Stop mode<select name="stopMode"><option value="target_time">Target time</option><option value="leg_completed">Until leg completed</option></select></label>
        <button type="submit" data-pending-label="Advancing time...">Advance time</button>
      </form>
    </section>
  `;
}

function renderCommitBar(payload: DispatchTabPayload, selectedAircraft: DispatchAircraftView | undefined): string {
  const schedule = selectedAircraft?.schedule;
  const validation = schedule?.validation;
  const canCommit = Boolean(schedule?.isDraft && validation?.isCommittable);
  const staffingImpact = describeValidationArea(validation, "staffing");
  const maintenancePressure = describeValidationArea(validation, "maintenance");
  const readinessLabel = !selectedAircraft
    ? "Select an aircraft"
    : !schedule
      ? "No draft staged"
      : !schedule.isDraft
        ? "Schedule already committed"
        : validation?.isCommittable
          ? "Ready to commit"
          : `${validation?.hardBlockerCount ?? 0} blockers to resolve`;
  const commitButtonLabel = !schedule
    ? "No draft to commit"
    : !schedule.isDraft
      ? "Already committed"
      : validation?.isCommittable
        ? "Commit draft"
        : "Resolve blockers";

  return `
    <div class="dispatch-commit-copy">
      <div class="meta-stack">
        <div class="eyebrow">Commitment Bar</div>
        <strong>${escapeHtml(readinessLabel)}</strong>
        <span class="muted">${selectedAircraft ? `${escapeHtml(selectedAircraft.registration)} | ${escapeHtml(selectedAircraft.modelDisplayName)}` : "Dispatch needs a selected aircraft before it can commit a plan."}</span>
      </div>
      <div class="dispatch-commit-metrics">
        <div class="dispatch-commit-metric"><span class="eyebrow">Projected profit</span><strong>${validation ? escapeHtml(formatMoney(validation.projectedScheduleProfit)) : "-"}</strong></div>
        <div class="dispatch-commit-metric"><span class="eyebrow">Staffing impact</span><strong>${escapeHtml(staffingImpact)}</strong></div>
        <div class="dispatch-commit-metric"><span class="eyebrow">Maintenance pressure</span><strong>${escapeHtml(maintenancePressure)}</strong></div>
        <div class="dispatch-commit-metric"><span class="eyebrow">Risk state</span><strong>${validation ? escapeHtml(humanize(validation.projectedRiskBand)) : "-"}</strong></div>
      </div>
    </div>
    <div class="dispatch-commit-actions">
      ${schedule?.isDraft ? `
        <form method="post" action="/api/save/${encodeURIComponent(payload.saveId)}/actions/commit-schedule" class="dispatch-inline-action" data-api-form>
          <input type="hidden" name="tab" value="dispatch" />
          <input type="hidden" name="saveId" value="${escapeHtml(payload.saveId)}" />
          <input type="hidden" name="scheduleId" value="${escapeHtml(schedule.scheduleId)}" />
          <button type="submit" ${canCommit ? "" : "disabled"} data-dispatch-commit-button="1" data-pending-label="Committing schedule...">${escapeHtml(commitButtonLabel)}</button>
        </form>
      ` : `<button type="button" disabled data-dispatch-commit-button="1">${escapeHtml(commitButtonLabel)}</button>`}
      <a class="button-link button-secondary" href="/save/${encodeURIComponent(payload.saveId)}?tab=contracts">Open contracts</a>
    </div>
  `;
}

function describeValidationArea(
  validation: DispatchValidationSnapshotView | undefined,
  prefix: string,
): string {
  if (!validation) {
    return "Evaluate after drafting";
  }

  const matchingMessages = validation.validationMessages.filter((message) => message.code.startsWith(`${prefix}.`));
  if (matchingMessages.some((message) => message.severity === "blocker")) {
    return "Blocked";
  }
  if (matchingMessages.some((message) => message.severity === "warning")) {
    return "Watch";
  }
  return prefix === "staffing" ? "Covered" : "Stable";
}

function renderValidationCountBadge(messages: DispatchValidationMessageView[]): string {
  const blockers = messages.filter((message) => message.severity === "blocker").length;
  const warnings = messages.filter((message) => message.severity === "warning").length;
  if (blockers === 0 && warnings === 0) {
    return `<span class="pill">Clear</span>`;
  }

  return `<span class="pill">${escapeHtml(String(blockers))} blockers | ${escapeHtml(String(warnings))} warnings</span>`;
}

function renderBadge(value: string): string {
  return `<span class="badge ${badgeClass(value)}">${escapeHtml(labelForUi(value))}</span>`;
}

function badgeClass(value: string): string {
  if (["critical", "failed", "blocked", "overdue", "aog", "grounded", "blocker", "candidate_stale"].includes(value)) {
    return "danger";
  }
  if (["warning", "warn", "assigned", "due_soon", "tight", "watch", "maintenance", "candidate_available", "accepted_ready", "blocked_draft"].includes(value)) {
    return "warn";
  }
  if (["active", "scheduled", "available", "draft_ready", "draft", "committed", "info"].includes(value)) {
    return "accent";
  }
  return "neutral";
}

function labelForUi(value: string): string {
  return humanize(value);
}

function formatPayload(volumeType: "passenger" | "cargo", passengerCount: number | undefined, cargoWeightLb: number | undefined): string {
  return volumeType === "cargo"
    ? `${formatNumber(cargoWeightLb ?? 0)} lb cargo`
    : `${formatNumber(passengerCount ?? 0)} pax`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(durationMinutes: number): string {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatHours(value: number): string {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(value))}h`;
}

function formatMoney(amount: number): string {
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

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function loadStoredSelection(saveId: string): { aircraftId?: string; legId?: string } | null {
  try {
    const raw = window.sessionStorage.getItem(`${selectionStoragePrefix}${saveId}`);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as { aircraftId?: string; legId?: string };
  } catch {
    return null;
  }
}

function storeSelection(saveId: string, aircraftId: string | undefined, legId: string | undefined): void {
  try {
    window.sessionStorage.setItem(`${selectionStoragePrefix}${saveId}`, JSON.stringify({
      ...(aircraftId ? { aircraftId } : {}),
      ...(legId ? { legId } : {}),
    }));
  } catch {
    // Ignore storage failures in desktop mode.
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
