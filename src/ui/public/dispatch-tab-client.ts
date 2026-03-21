/*
 * Browser controller for the dispatch tab inside the save shell.
 * It keeps only transient UI state such as the selected aircraft and selected leg while the server owns the data model.
 */

import {
  applyDispatchWorkspaceViewState,
  type DispatchAircraftView,
  type DispatchAssignedPilotView,
  type DispatchLegView,
  type DispatchPilotReadinessView,
  type DispatchTabPayload,
  type DispatchValidationSnapshotView,
  type DispatchValidationMessageView,
} from "../dispatch-tab-model.js";

export interface DispatchTabController {
  destroy(): void;
}

const selectionStoragePrefix = "flightline:dispatch-selection:";
type DispatchSourceMode = "accepted_contracts" | "planned_routes";

interface DispatchStoredSelection {
  aircraftId?: string;
  legId?: string;
  sourceMode?: DispatchSourceMode;
  sourceId?: string;
}

type DispatchReadinessState = "pass" | "watch" | "blocked";

export interface DispatchReadinessChecklistItem {
  id: string;
  label: string;
  state: DispatchReadinessState;
  detail: string;
  recoveryAction: string;
}

export interface DispatchReadinessSummary {
  checklist: DispatchReadinessChecklistItem[];
  overallState: DispatchReadinessState;
  recoveryAction: string;
}

export interface DispatchCommitImpactSummary {
  headline: string;
  note: string;
}

const routeOperationalMessagePrefixes = [
  "aircraft.",
  "airport.",
  "payload.",
] as const;
const routeOperationalMessageCodes = new Set([
  "contract.duplicate_attachment",
  "contract.missing_link",
  "contract.missing",
  "contract.state",
  "contract.route_mismatch",
  "leg.unsupported_type",
  "leg.range",
  "leg.block_time",
  "leg.tight_block_time",
  "maintenance.aog",
  "maintenance.overdue",
]);
const timingContinuityMessageCodes = new Set([
  "schedule.empty",
  "leg.invalid_time_window",
  "leg.continuity",
  "leg.overlap",
  "contract.earliest_start",
  "contract.deadline",
  "contract.tight_deadline",
  "maintenance.window",
  "maintenance.tight_window",
]);
const commitmentConflictMessageCodes = new Set([
  "aircraft.overlap",
  "contract.assigned_elsewhere",
]);

export function mountDispatchTab(host: HTMLElement, payload: DispatchTabPayload): DispatchTabController {
  const storedSelection = loadStoredSelection(payload.saveId);
  let selectedAircraftId = storedSelection?.aircraftId ?? payload.defaultSelectedAircraftId;
  let selectedLegId = storedSelection?.legId;
  let selectedSourceMode: DispatchSourceMode | undefined = storedSelection?.sourceMode;
  let selectedSourceId = storedSelection?.sourceId;

  function render(): void {
    const resolvedSourceSelection = resolveSourceSelection(payload, selectedSourceMode, selectedSourceId);
    const viewState = applyDispatchWorkspaceViewState(payload, {
      ...(selectedAircraftId ? { selectedAircraftId } : {}),
      ...(selectedLegId ? { selectedLegId } : {}),
    });

    selectedAircraftId = viewState.selectedAircraftId;
    selectedLegId = viewState.selectedLegId;
    selectedSourceMode = resolvedSourceSelection.sourceMode;
    selectedSourceId = resolvedSourceSelection.sourceId;
    storeSelection(payload.saveId, selectedAircraftId, selectedLegId, selectedSourceMode, selectedSourceId);
    host.innerHTML = renderDispatchWorkspace(
      payload,
      viewState.selectedAircraft,
      viewState.selectedLeg,
      selectedSourceMode,
      selectedSourceId,
    );
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

    const sourceModeButton = target.closest<HTMLElement>("[data-dispatch-source-mode]");
    if (sourceModeButton) {
      event.preventDefault();
      const nextMode = sourceModeButton.dataset.dispatchSourceMode as DispatchSourceMode | undefined;
      if (nextMode) {
        selectedSourceMode = nextMode;
        selectedSourceId = undefined;
        render();
      }
      return;
    }

    const sourceItemButton = target.closest<HTMLElement>("[data-dispatch-source-item]");
    if (sourceItemButton) {
      event.preventDefault();
      const nextMode = sourceItemButton.dataset.dispatchSourceMode as DispatchSourceMode | undefined;
      if (nextMode) {
        selectedSourceMode = nextMode;
      }
      selectedSourceId = sourceItemButton.dataset.dispatchSourceItem ?? selectedSourceId;
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
  selectedSourceMode: DispatchSourceMode | undefined,
  selectedSourceId: string | undefined,
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
            <h3>Dispatch Source</h3>
            <div class="pill-row">
              <span class="pill">${escapeHtml(String(payload.workInputs.routePlanItems.length))} route plan</span>
              <span class="pill">${escapeHtml(String(payload.workInputs.acceptedContracts.length))} accepted</span>
            </div>
          </div>
          <div class="panel-body dispatch-input-body">
            ${renderDispatchSourceSelector(payload, selectedSourceMode)}
            ${renderSelectedWorkSummary(payload, selectedAircraft, selectedSourceMode, selectedSourceId)}
            ${renderSourceModeBody(payload, selectedAircraft, selectedSourceMode, selectedSourceId)}
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
              ${renderSelectedAircraftSummary(payload, selectedAircraft)}
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
            <h3>Readiness Checklist</h3>
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

function renderSelectedAircraftSummary(payload: DispatchTabPayload, selectedAircraft: DispatchAircraftView | undefined): string {
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
        <span class="muted">${schedule ? `${formatDate(schedule.plannedStartUtc)} to ${formatDate(schedule.plannedEndUtc)}` : "Use selected work to stage a draft."}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Maintenance</div>
        <strong>${escapeHtml(humanize(selectedAircraft.maintenanceState))}</strong>
        <span class="muted">${formatHours(selectedAircraft.hoursToService)} to service | ${formatPercent(selectedAircraft.conditionValue)} condition</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Required Cert</div>
        <strong>${escapeHtml(selectedAircraft.requiredPilotCertificationCode ?? humanize(selectedAircraft.pilotQualificationGroup))}</strong>
        <span class="muted">${escapeHtml(String(selectedAircraft.pilotCoverageUnits))} active | ${escapeHtml(String(selectedAircraft.pendingPilotCoverageUnits))} pending units</span>
      </article>
      <article class="summary-item compact" data-dispatch-pilot-assignment-summary>
        <div class="eyebrow">Pilot Assignment</div>
        <strong>${escapeHtml(describePilotAssignmentHeadline(selectedAircraft))}</strong>
        <span class="muted">${escapeHtml(describePilotAssignmentNote(selectedAircraft))}</span>
      </article>
      <article class="summary-item compact" data-dispatch-pilot-readiness>
        <div class="eyebrow">Readiness</div>
        <strong>${escapeHtml(describePilotReadinessHeadline(selectedAircraft.pilotReadiness))}</strong>
        <span class="muted">${escapeHtml(describePilotReadinessNote(selectedAircraft))}</span>
      </article>
    </div>
    ${renderAssignedPilotsSection(selectedAircraft)}
    ${renderDraftControlSummary(payload, selectedAircraft)}
  `;
}

function renderDraftControlSummary(payload: DispatchTabPayload, selectedAircraft: DispatchAircraftView): string {
  const schedule = selectedAircraft.schedule;
  if (!schedule) {
    return `
      <section class="dispatch-message-list" data-dispatch-draft-status>
        <article class="dispatch-message-item info">
          <div class="dispatch-message-head">${renderBadge("info")}<strong>No resumable draft</strong></div>
          <span class="muted">Stage selected work on ${escapeHtml(selectedAircraft.registration)} to create a draft you can revise, discard, or commit later.</span>
        </article>
      </section>
    `;
  }

  if (schedule.isDraft) {
    return `
      <section class="dispatch-message-list" data-dispatch-draft-status>
        <article class="dispatch-message-item info" data-dispatch-current-draft>
          <div class="dispatch-message-head">${renderBadge(schedule.validation?.isCommittable === false ? "blocked_draft" : "draft")}<strong>Current draft staged</strong></div>
          <span class="muted">${escapeHtml(`${selectedAircraft.registration} has a staged draft from ${formatDate(schedule.plannedStartUtc)} to ${formatDate(schedule.plannedEndUtc)}. Replacing selected work will overwrite only this draft. Discard it if you want a clean planning lane first.`)}</span>
        </article>
        <form method="post" action="/api/save/${encodeURIComponent(payload.saveId)}/actions/discard-schedule-draft" class="dispatch-inline-action" data-api-form data-dispatch-draft-discard-form="1">
          <input type="hidden" name="tab" value="dispatch" />
          <input type="hidden" name="saveId" value="${escapeHtml(payload.saveId)}" />
          <input type="hidden" name="scheduleId" value="${escapeHtml(schedule.scheduleId)}" />
          <button type="submit" data-dispatch-discard-draft="1" data-pending-label="Discarding draft...">Discard draft</button>
        </form>
      </section>
    `;
  }

  return `
    <section class="dispatch-message-list" data-dispatch-calendar-reflection>
      <article class="dispatch-message-item info">
        <div class="dispatch-message-head">${renderBadge("committed")}<strong>Calendar reflection</strong></div>
        <span class="muted">${escapeHtml(`Clock & Calendar already shows ${selectedAircraft.registration} as occupied from ${formatDate(schedule.plannedStartUtc)} to ${formatDate(schedule.plannedEndUtc)} for this committed dispatch.`)}</span>
      </article>
    </section>
  `;
}

function renderAssignedPilotsSection(selectedAircraft: DispatchAircraftView): string {
  if (!selectedAircraft.schedule) {
    return `
      <section class="dispatch-message-list" data-dispatch-assigned-pilots>
        <article class="dispatch-message-item info">
          <div class="dispatch-message-head">${renderBadge("info")}<strong>No named-pilot assignment yet</strong></div>
          <span class="muted">Stage or commit a schedule before Dispatch can show who is covering this aircraft.</span>
        </article>
      </section>
    `;
  }

  if (selectedAircraft.schedule.isDraft) {
    return `
      <section class="dispatch-message-list" data-dispatch-assigned-pilots>
        <article class="dispatch-message-item info">
          <div class="dispatch-message-head">${renderBadge("info")}<strong>Named pilots are selected on commit</strong></div>
          <span class="muted">This draft can show current pool pressure, but Dispatch should not pretend specific pilots are already locked.</span>
        </article>
      </section>
    `;
  }

  if (selectedAircraft.assignedPilots.length === 0) {
    return `
      <section class="dispatch-message-list" data-dispatch-assigned-pilots>
        <article class="dispatch-message-item warning">
          <div class="dispatch-message-head">${renderBadge("warning")}<strong>No reserved named pilots are attached</strong></div>
          <span class="muted">This committed schedule does not currently expose a named-pilot reservation. That should be treated as a truth gap.</span>
        </article>
      </section>
    `;
  }

  return `
    <section class="dispatch-message-list" data-dispatch-assigned-pilots>
      ${selectedAircraft.assignedPilots.map((pilot) => renderAssignedPilotCard(pilot)).join("")}
    </section>
  `;
}

function renderAssignedPilotCard(pilot: DispatchAssignedPilotView): string {
  return `
    <article class="dispatch-message-item info" data-dispatch-assigned-pilot="${escapeHtml(pilot.namedPilotId)}">
      <div class="dispatch-message-head">${renderBadge(pilot.availabilityState)}<strong>${escapeHtml(pilot.displayName)}</strong></div>
      <span class="muted">${escapeHtml(`${formatPilotCertifications(pilot.certifications)} | ${describeAssignedPilotContext(pilot)}`)}</span>
    </article>
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
          <div class="eyebrow">Pilot Cert</div>
          <strong>${escapeHtml(selectedLeg.requiredPilotCertificationCode ?? humanize(selectedLeg.assignedQualificationGroup ?? "standard"))}</strong>
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

  const readiness = deriveDispatchReadinessSummary(selectedAircraft);
  const validation = selectedAircraft.schedule?.validation;

  return `
    <div class="dispatch-readiness-stack">
      <article class="summary-item compact">
        <div class="eyebrow">Overall readiness</div>
        <strong>${escapeHtml(formatReadinessStateLabel(readiness.overallState))}</strong>
        <span class="muted">${escapeHtml(describeReadinessStateCount(readiness.checklist, readiness.overallState))}</span>
      </article>
      <article class="summary-item compact" data-dispatch-readiness-recovery="1">
        <div class="eyebrow">Likely recovery</div>
        <strong>${escapeHtml(readiness.recoveryAction)}</strong>
        <span class="muted">${escapeHtml(describeReadinessContext(selectedAircraft))}</span>
      </article>
      <div class="dispatch-readiness-list">
        ${readiness.checklist.map((item) => renderReadinessChecklistItem(item)).join("")}
      </div>
    </div>
  `;
}

function renderDispatchSourceSelector(payload: DispatchTabPayload, selectedSourceMode: DispatchSourceMode | undefined): string {
  const mode = selectedSourceMode ?? resolveDefaultSourceMode(payload);
  const routePlanCount = payload.workInputs.routePlanItems.length;
  const acceptedContractCount = payload.workInputs.acceptedContracts.length;

  return `
    <section class="dispatch-source-selector">
      <div class="contracts-board-tabs" role="tablist" aria-label="Dispatch source">
        <button
          type="button"
          class="contracts-board-tab ${mode === "accepted_contracts" ? "current" : ""}"
          data-dispatch-source-mode="accepted_contracts"
          role="tab"
          aria-selected="${mode === "accepted_contracts" ? "true" : "false"}"
          aria-pressed="${mode === "accepted_contracts" ? "true" : "false"}"
        >
          <span>Accepted Contracts</span>
          <span class="pill">${escapeHtml(String(acceptedContractCount))}</span>
        </button>
        <button
          type="button"
          class="contracts-board-tab ${mode === "planned_routes" ? "current" : ""}"
          data-dispatch-source-mode="planned_routes"
          role="tab"
          aria-selected="${mode === "planned_routes" ? "true" : "false"}"
          aria-pressed="${mode === "planned_routes" ? "true" : "false"}"
        >
          <span>Planned Routes</span>
          <span class="pill">${escapeHtml(String(routePlanCount))}</span>
        </button>
      </div>
    </section>
  `;
}

function renderSelectedWorkSummary(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedSourceMode: DispatchSourceMode | undefined,
  selectedSourceId: string | undefined,
): string {
  const resolved = resolveSourceSelection(payload, selectedSourceMode, selectedSourceId);
  if (resolved.sourceMode === "planned_routes") {
    return renderSelectedRoutePlanSummary(payload, selectedAircraft, resolved.sourceId);
  }

  return renderSelectedAcceptedContractSummary(payload, selectedAircraft, resolved.sourceId);
}

function renderSourceModeBody(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedSourceMode: DispatchSourceMode | undefined,
  selectedSourceId: string | undefined,
): string {
  const resolved = resolveSourceSelection(payload, selectedSourceMode, selectedSourceId);
  if (resolved.sourceMode === "planned_routes") {
    return renderPlannedRoutesList(payload, resolved.sourceId);
  }

  return renderAcceptedContractsList(payload, selectedAircraft, resolved.sourceId);
}

function renderSelectedRoutePlanSummary(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedRoutePlanItemId: string | undefined,
): string {
  const items = payload.workInputs.routePlanItems;
  if (items.length === 0) {
    return `
      <section class="panel dispatch-selected-work-panel" data-dispatch-selected-work>
        <div class="panel-head">
          <h3>Selected work</h3>
          <span class="pill">Planned Routes</span>
        </div>
        <div class="panel-body">
          <div class="empty-state compact">No planned routes are waiting in Dispatch yet.</div>
        </div>
      </section>
    `;
  }

  const selectedItem = findSelectedRoutePlanItem(items, selectedRoutePlanItemId);
  const packageStartItem = items[0]!;
  const packageEndItem = items[items.length - 1]!;
  const summaryItem = selectedItem ?? packageStartItem;
  const totalPayoutAmount = items.reduce((sum, item) => sum + item.payoutAmount, 0);
  const stageButtonDisabled = !selectedAircraft || payload.workInputs.acceptedReadyCount === 0 || !selectedAircraft.dispatchAvailable;
  const stageButtonLabel = selectedAircraft?.schedule?.isDraft ? "Replace draft with route plan" : "Draft route plan";

  return `
    <section class="panel dispatch-selected-work-panel" data-dispatch-selected-work>
      <div class="panel-head">
        <h3>Selected work</h3>
        <div class="pill-row">
          <span class="pill">Planned Routes</span>
          <span class="pill">${escapeHtml(String(payload.workInputs.acceptedReadyCount))} ready</span>
        </div>
      </div>
      <div class="panel-body">
        <div class="summary-list dispatch-selected-work-summary">
          <article class="summary-item compact" data-dispatch-route-plan-package>
            <div class="eyebrow">Package</div>
            <strong>${escapeHtml(packageStartItem.originAirport.code)} -> ${escapeHtml(packageEndItem.destinationAirport.code)}</strong>
            <span class="muted">${escapeHtml(packageStartItem.originAirport.primaryLabel)} to ${escapeHtml(packageEndItem.destinationAirport.primaryLabel)}</span>
          </article>
          <article class="summary-item compact">
            <div class="eyebrow">Timing</div>
            <strong>${escapeHtml(formatDate(packageStartItem.earliestStartUtc ?? packageStartItem.deadlineUtc))} to ${escapeHtml(formatDate(packageEndItem.deadlineUtc))}</strong>
            <span class="muted">${escapeHtml(String(items.length))} planned item${items.length === 1 ? "" : "s"}</span>
          </article>
          <article class="summary-item compact">
            <div class="eyebrow">Payload</div>
            <strong>${escapeHtml(formatMoney(totalPayoutAmount))}</strong>
            <span class="muted">${escapeHtml(formatPayload(summaryItem.volumeType, summaryItem.passengerCount, summaryItem.cargoWeightLb))} selected as context</span>
          </article>
          <article class="summary-item compact" data-dispatch-route-plan-selected-row>
            <div class="eyebrow">Selected row</div>
            <strong>${escapeHtml(summaryItem.originAirport.code)} -> ${escapeHtml(summaryItem.destinationAirport.code)}</strong>
            <span class="muted">${escapeHtml(summaryItem.originAirport.primaryLabel)} to ${escapeHtml(summaryItem.destinationAirport.primaryLabel)}</span>
          </article>
          <article class="summary-item compact" data-dispatch-draft-impact>
            <div class="eyebrow">Draft impact</div>
            <strong>${escapeHtml(selectedAircraft ? selectedAircraft.registration : "No aircraft selected")}</strong>
            <span class="muted">${escapeHtml(describeDraftReplacementImpact(selectedAircraft))}</span>
          </article>
          <article class="summary-item compact">
            <div class="eyebrow">Chain</div>
            <strong>${escapeHtml(String(items.length))} planned items</strong>
            <span class="muted">${escapeHtml(describeRoutePlanPackage(items, packageStartItem, packageEndItem, summaryItem))}</span>
          </article>
        </div>
        <div class="dispatch-selected-work-actions">
          ${selectedAircraft ? `
            <form method="post" action="/api/save/${encodeURIComponent(payload.saveId)}/actions/bind-route-plan" class="dispatch-inline-action" data-api-form>
              <input type="hidden" name="tab" value="dispatch" />
              <input type="hidden" name="saveId" value="${escapeHtml(payload.saveId)}" />
              <input type="hidden" name="aircraftId" value="${escapeHtml(selectedAircraft.aircraftId)}" />
              <button type="submit" ${stageButtonDisabled ? "disabled" : ""} data-dispatch-bind-route-plan="1" data-dispatch-stage-draft="1" data-pending-label="Drafting route plan...">${escapeHtml(stageButtonLabel)}</button>
            </form>
          ` : `<div class="muted">Select an aircraft to stage this route plan.</div>`}
        </div>
        <div class="muted dispatch-section-note">${escapeHtml(describeRoutePlanSummaryNote(items, packageStartItem, packageEndItem, summaryItem))}</div>
      </div>
    </section>
  `;
}

function renderSelectedAcceptedContractSummary(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedCompanyContractId: string | undefined,
): string {
  const contracts = payload.workInputs.acceptedContracts;
  if (contracts.length === 0) {
    return `
      <section class="panel dispatch-selected-work-panel" data-dispatch-selected-work>
        <div class="panel-head">
          <h3>Selected work</h3>
          <span class="pill">Accepted Contracts</span>
        </div>
        <div class="panel-body">
          <div class="empty-state compact">No accepted contracts are waiting for planning yet.</div>
        </div>
      </section>
    `;
  }

  const selectedContract = (findSelectedAcceptedContract(contracts, selectedCompanyContractId) ?? contracts[0])!;
  const actionDisabled = !selectedAircraft;

  return `
    <section class="panel dispatch-selected-work-panel" data-dispatch-selected-work>
      <div class="panel-head">
        <h3>Selected work</h3>
        <div class="pill-row">
          <span class="pill">Accepted Contracts</span>
          <span class="pill">${escapeHtml(String(contracts.length))}</span>
        </div>
      </div>
      <div class="panel-body">
        <div class="dispatch-selected-work-summary">
          <article class="summary-item compact">
            <div class="eyebrow">Package</div>
            <strong>${escapeHtml(selectedContract.originAirport.code)} -> ${escapeHtml(selectedContract.destinationAirport.code)}</strong>
            <span class="muted">${escapeHtml(selectedContract.originAirport.primaryLabel)} to ${escapeHtml(selectedContract.destinationAirport.primaryLabel)}</span>
          </article>
          <article class="summary-item compact">
            <div class="eyebrow">Timing</div>
            <strong>${escapeHtml(formatDate(selectedContract.deadlineUtc))}</strong>
            <span class="muted">${selectedContract.earliestStartUtc ? `Earliest ${escapeHtml(formatDate(selectedContract.earliestStartUtc))}` : "No earliest start window"}</span>
          </article>
          <article class="summary-item compact">
            <div class="eyebrow">Payload</div>
            <strong>${escapeHtml(formatPayload(selectedContract.volumeType, selectedContract.passengerCount, selectedContract.cargoWeightLb))}</strong>
            <span class="muted">${escapeHtml(formatMoney(selectedContract.acceptedPayoutAmount))}</span>
          </article>
          <article class="summary-item compact">
            <div class="eyebrow">Draft impact</div>
            <strong>${escapeHtml(selectedAircraft ? selectedAircraft.registration : "No aircraft selected")}</strong>
            <span class="muted">${escapeHtml(describeDraftReplacementImpact(selectedAircraft))}</span>
          </article>
        </div>
        <div class="dispatch-selected-work-actions">
          ${selectedAircraft ? `
            <form method="post" action="/api/save/${encodeURIComponent(payload.saveId)}/actions/auto-plan-contract" class="dispatch-inline-action" data-api-form>
              <input type="hidden" name="tab" value="dispatch" />
              <input type="hidden" name="saveId" value="${escapeHtml(payload.saveId)}" />
              <input type="hidden" name="companyContractId" value="${escapeHtml(selectedContract.companyContractId)}" />
              <input type="hidden" name="aircraftId" value="${escapeHtml(selectedAircraft.aircraftId)}" />
              <button type="submit" ${actionDisabled ? "disabled" : ""} data-dispatch-auto-plan-contract="1" data-dispatch-stage-draft="1" data-pending-label="Drafting schedule...">Draft selected contract${selectedAircraft ? ` on ${escapeHtml(selectedAircraft.registration)}` : ""}</button>
            </form>
          ` : `<div class="muted">Select an aircraft to stage this contract.</div>`}
        </div>
        <div class="muted dispatch-section-note">${escapeHtml(describeAcceptedContractSummaryNote(selectedAircraft, selectedContract))}</div>
      </div>
    </section>
  `;
}

function renderPlannedRoutesList(payload: DispatchTabPayload, selectedRoutePlanItemId: string | undefined): string {
  const routePlanItems = payload.workInputs.routePlanItems;
  if (routePlanItems.length === 0) {
    return `<div class="empty-state compact">Add contracts to the route plan from Contracts, then accept them there before handing them off into Dispatch.</div>`;
  }

  return `
    <section class="dispatch-input-list dispatch-source-list" aria-label="Planned routes">
      ${routePlanItems.map((item) => renderRoutePlanItem(item, item.routePlanItemId === selectedRoutePlanItemId)).join("")}
    </section>
  `;
}

function renderAcceptedContractsList(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedCompanyContractId: string | undefined,
): string {
  const contracts = payload.workInputs.acceptedContracts;
  const attachedContractIds = new Set(
    selectedAircraft?.schedule?.legs
      .map((leg) => leg.linkedCompanyContractId)
      .filter((entry): entry is string => Boolean(entry)) ?? [],
  );

  if (contracts.length === 0) {
    return `<div class="empty-state compact">No accepted contracts are waiting for a dispatch plan.</div>`;
  }

  return `
    <section class="dispatch-input-list dispatch-source-list" aria-label="Accepted contracts">
      ${contracts.map((contract) => renderAcceptedContract(contract, contract.companyContractId === selectedCompanyContractId, attachedContractIds.has(contract.companyContractId))).join("")}
    </section>
  `;
}

function renderRoutePlanItem(
  item: DispatchTabPayload["workInputs"]["routePlanItems"][number],
  selected: boolean,
): string {
  return `
    <button
      type="button"
      class="dispatch-input-card dispatch-source-card ${selected ? "selected" : ""}"
      data-dispatch-source-item="${escapeHtml(item.routePlanItemId)}"
      data-dispatch-source-mode="planned_routes"
      aria-pressed="${selected ? "true" : "false"}"
    >
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
    </button>
  `;
}

function renderAcceptedContract(
  contract: DispatchTabPayload["workInputs"]["acceptedContracts"][number],
  selected: boolean,
  alreadyInDraft: boolean,
): string {
  return `
    <button
      type="button"
      class="dispatch-input-card dispatch-source-card ${selected ? "selected" : ""}"
      data-dispatch-source-item="${escapeHtml(contract.companyContractId)}"
      data-dispatch-source-mode="accepted_contracts"
      aria-pressed="${selected ? "true" : "false"}"
    >
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
    </button>
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
  const commitImpact = deriveDispatchCommitImpactSummary(selectedAircraft);
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
        <div class="eyebrow">Commit impact</div>
        <strong>${escapeHtml(commitImpact.headline)}</strong>
        <span class="muted">${escapeHtml(commitImpact.note)}</span>
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

function describePilotAssignmentHeadline(selectedAircraft: DispatchAircraftView): string {
  if (!selectedAircraft.schedule) {
    return "No schedule staged";
  }

  if (selectedAircraft.schedule.isDraft) {
    return "Reserved on commit";
  }

  if (selectedAircraft.assignedPilots.length === 0) {
    return "No pilots shown";
  }

  return `${selectedAircraft.assignedPilots.length}/${selectedAircraft.pilotReadiness.pilotsRequired} named pilots`;
}

function describePilotAssignmentNote(selectedAircraft: DispatchAircraftView): string {
  if (!selectedAircraft.schedule) {
    return "Dispatch can only show named coverage once a schedule exists.";
  }

  if (selectedAircraft.schedule.isDraft) {
    return "Drafts stay truthful by showing pool posture only until commit locks specific pilots.";
  }

  if (selectedAircraft.assignedPilots.length === 0) {
    return "Committed schedules should normally show reserved named pilots here.";
  }

  return selectedAircraft.assignedPilots.map((pilot) => pilot.displayName).join(" | ");
}

function describePilotReadinessHeadline(readiness: DispatchPilotReadinessView): string {
  return `${readiness.readyNowCount} ready | ${readiness.reservedNowCount + readiness.flyingNowCount} committed`;
}

function describePilotReadinessNote(selectedAircraft: DispatchAircraftView): string {
  const readiness = selectedAircraft.pilotReadiness;
  const parts = [
    readiness.requiredCertificationCode ? `Requires ${readiness.requiredCertificationCode}` : undefined,
    `${readiness.restingNowCount} resting`,
  ];

  if (readiness.trainingNowCount > 0) {
    parts.push(`${readiness.trainingNowCount} training`);
  }

  if (readiness.travelingNowCount > 0) {
    parts.push(`${readiness.travelingNowCount} traveling`);
  }

  if (readiness.pendingStartCount > 0) {
    parts.push(`${readiness.pendingStartCount} pending start`);
  }

  if (selectedAircraft.schedule && !selectedAircraft.schedule.isDraft && selectedAircraft.assignedPilots.length > 0) {
    parts.push(readiness.noReadyReserveRemaining
      ? "No ready reserve remains"
      : `${readiness.readyNowCount} ready reserve${readiness.readyNowCount === 1 ? "" : "s"} remain`);
  }

  return parts.filter((part): part is string => Boolean(part)).join(" | ");
}

function describeAssignedPilotContext(pilot: DispatchAssignedPilotView): string {
  const parts: string[] = [];

  if (pilot.packageStatus === "pending") {
    parts.push(`Package starts ${formatDate(pilot.startsAtUtc)}`);
  }

  if (pilot.availabilityState === "training" && pilot.trainingUntilUtc) {
    parts.push(`Training until ${formatDate(pilot.trainingUntilUtc)}`);
  } else if (pilot.availabilityState === "traveling" && pilot.travelUntilUtc) {
    parts.push(`Traveling to ${pilot.travelDestinationAirport?.code ?? pilot.currentAirport?.code ?? "assignment"} until ${formatDate(pilot.travelUntilUtc)}`);
  } else if (pilot.availabilityState === "resting" && pilot.restingUntilUtc) {
    parts.push(`Ready ${formatDate(pilot.restingUntilUtc)}`);
  } else if ((pilot.availabilityState === "reserved" || pilot.availabilityState === "flying") && pilot.assignmentToUtc) {
    parts.push(`${pilot.availabilityState === "flying" ? "Flying" : "Reserved"} until ${formatDate(pilot.assignmentToUtc)}`);
  } else if (pilot.currentAirport) {
    parts.push(`At ${pilot.currentAirport.code}`);
  }

  return parts.join(" | ") || "Assigned";
}

function formatPilotCertifications(certifications: string[]): string {
  return certifications.length > 0 ? certifications.join(", ") : "Uncertified";
}

function buildDispatchReadinessChecklist(selectedAircraft: DispatchAircraftView): DispatchReadinessChecklistItem[] {
  const schedule = selectedAircraft.schedule;
  const validation = schedule?.validation;

  const routeMessages = getDispatchValidationMessages(validation, ownsRouteOperationalMessage);
  const staffingMessages = getDispatchValidationMessages(validation, ["staffing."]);
  const timingMessages = getDispatchValidationMessages(validation, ownsTimingContinuityMessage);
  const conflictMessages = getDispatchValidationMessages(validation, ownsCommitmentConflictMessage);

  const workSelectedState: DispatchReadinessState = schedule ? "pass" : "blocked";
  const aircraftSelectedState: DispatchReadinessState = selectedAircraft ? "pass" : "blocked";
  const routeState = determineDispatchReadinessState(routeMessages, schedule ? "pass" : "watch");
  const staffingState = determineDispatchReadinessState(staffingMessages, determineStaffingFallbackState(selectedAircraft));
  const timingState = determineDispatchReadinessState(timingMessages, schedule ? "pass" : "watch");
  const conflictState = determineDispatchReadinessState(conflictMessages, schedule ? "pass" : "watch");

  return [
    {
      id: "work-selected",
      label: "Work selected",
      state: workSelectedState,
      detail: schedule
        ? schedule.isDraft
          ? "A draft is staged on this aircraft."
          : "A committed schedule is already attached to this aircraft."
        : "No draft is staged on this aircraft yet.",
      recoveryAction: schedule
        ? "No action needed here."
        : "Stage selected work on this aircraft first.",
    },
    {
      id: "aircraft-selected",
      label: "Aircraft selected",
      state: aircraftSelectedState,
      detail: `${selectedAircraft.registration} is the active dispatch target.`,
      recoveryAction: "Choose an aircraft before staging a draft.",
    },
    {
      id: "route-operational-fit",
      label: "Route / operational fit",
      state: routeState,
      detail: describeChecklistDetail(routeMessages, schedule
        ? "Route and aircraft fit are clear."
        : "Select work to evaluate route and operational fit."),
      recoveryAction: chooseChecklistRecoveryAction(routeMessages, "Adjust the route, payload, or aircraft fit."),
    },
    {
      id: "pilot-coverage",
      label: "Pilot coverage / named-pilot readiness",
      state: staffingState,
      detail: describePilotCoverageChecklistDetail(selectedAircraft, staffingMessages, validation),
      recoveryAction: chooseChecklistRecoveryAction(staffingMessages, "Free a ready pilot or stage with enough pilot coverage."),
    },
    {
      id: "timing-continuity",
      label: "Timing and continuity",
      state: timingState,
      detail: describeChecklistDetail(timingMessages, schedule
        ? `Draft timing spans ${formatDate(schedule.plannedStartUtc)} to ${formatDate(schedule.plannedEndUtc)}.`
        : "Stage work to inspect timing and continuity."),
      recoveryAction: chooseChecklistRecoveryAction(timingMessages, "Shift the window or rearrange the route chain."),
    },
    {
      id: "commitment-conflicts",
      label: "Commitment conflict status",
      state: conflictState,
      detail: describeChecklistDetail(conflictMessages, schedule
        ? "No aircraft or contract overlap is attached to this draft."
        : "Stage work to inspect overlapping commitments."),
      recoveryAction: chooseChecklistRecoveryAction(conflictMessages, "Clear the overlapping assignment or choose a different aircraft."),
    },
  ];
}

export function deriveDispatchReadinessSummary(selectedAircraft: DispatchAircraftView): DispatchReadinessSummary {
  const checklist = buildDispatchReadinessChecklist(selectedAircraft);
  return {
    checklist,
    overallState: summarizeDispatchReadinessState(checklist),
    recoveryAction: chooseDispatchRecoveryAction(selectedAircraft, checklist),
  };
}

function renderReadinessChecklistItem(item: DispatchReadinessChecklistItem): string {
  return `
    <article class="dispatch-readiness-item ${item.state}" data-dispatch-readiness-item="${escapeHtml(item.id)}">
      <div class="dispatch-message-head">
        <div class="meta-stack">
          <strong>${escapeHtml(item.label)}</strong>
          <span class="muted">${escapeHtml(item.detail)}</span>
        </div>
        ${renderReadinessStateBadge(item.state)}
      </div>
    </article>
  `;
}

function renderReadinessStateBadge(state: DispatchReadinessState): string {
  return `<span class="badge ${dispatchReadinessBadgeClass(state)}">${escapeHtml(formatReadinessStateLabel(state))}</span>`;
}

function dispatchReadinessBadgeClass(state: DispatchReadinessState): string {
  if (state === "blocked") {
    return "danger";
  }

  if (state === "watch") {
    return "warn";
  }

  return "accent";
}

function formatReadinessStateLabel(state: DispatchReadinessState): string {
  if (state === "blocked") {
    return "Blocked";
  }

  if (state === "watch") {
    return "Watch";
  }

  return "Pass";
}

function determineDispatchReadinessState(
  messages: DispatchValidationMessageView[],
  fallbackState: DispatchReadinessState,
): DispatchReadinessState {
  if (messages.some((message) => message.severity === "blocker")) {
    return "blocked";
  }

  if (messages.some((message) => message.severity === "warning")) {
    return "watch";
  }

  return fallbackState;
}

function determineStaffingFallbackState(selectedAircraft: DispatchAircraftView): DispatchReadinessState {
  if (!selectedAircraft.schedule) {
    return "watch";
  }

  return selectedAircraft.pilotReadiness.readyNowCount >= selectedAircraft.pilotReadiness.pilotsRequired ? "pass" : "watch";
}

function getDispatchValidationMessages(
  validation: DispatchValidationSnapshotView | undefined,
  ownershipRule: readonly string[] | ((code: string) => boolean),
): DispatchValidationMessageView[] {
  if (!validation) {
    return [];
  }

  if (typeof ownershipRule === "function") {
    return validation.validationMessages.filter((message) => ownershipRule(message.code));
  }

  return validation.validationMessages.filter((message) => ownershipRule.some((prefix) => message.code.startsWith(prefix)));
}

function ownsRouteOperationalMessage(code: string): boolean {
  if (ownsTimingContinuityMessage(code) || ownsCommitmentConflictMessage(code)) {
    return false;
  }

  return routeOperationalMessageCodes.has(code)
    || routeOperationalMessagePrefixes.some((prefix) => code.startsWith(prefix));
}

function ownsTimingContinuityMessage(code: string): boolean {
  return timingContinuityMessageCodes.has(code);
}

function ownsCommitmentConflictMessage(code: string): boolean {
  return commitmentConflictMessageCodes.has(code);
}

function ownsCommitImpactFinanceMessage(code: string): boolean {
  return code === "finance.negative_margin" || code === "finance.thin_margin";
}

function describeChecklistDetail(
  messages: DispatchValidationMessageView[],
  fallback: string,
): string {
  return messages[0]?.summary ?? fallback;
}

function chooseChecklistRecoveryAction(
  messages: DispatchValidationMessageView[],
  fallback: string,
): string {
  return messages[0]?.suggestedRecoveryAction ?? fallback;
}

function describePilotCoverageChecklistDetail(
  selectedAircraft: DispatchAircraftView,
  staffingMessages: DispatchValidationMessageView[],
  validation: DispatchValidationSnapshotView | undefined,
): string {
  if (staffingMessages.length > 0) {
    return staffingMessages[0]?.summary ?? "Pilot coverage needs attention.";
  }

  if (!selectedAircraft.schedule) {
    return `${selectedAircraft.pilotReadiness.readyNowCount} ready | ${selectedAircraft.pilotReadiness.reservedNowCount} reserved | ${selectedAircraft.pilotReadiness.restingNowCount} resting`;
  }

  if (validation) {
    return `${selectedAircraft.pilotReadiness.readyNowCount} ready | ${selectedAircraft.pilotReadiness.reservedNowCount} reserved | ${selectedAircraft.pilotReadiness.flyingNowCount} flying`;
  }

  return selectedAircraft.pilotReadiness.readyNowCount >= selectedAircraft.pilotReadiness.pilotsRequired
    ? `${selectedAircraft.pilotReadiness.readyNowCount} ready pilots cover this aircraft.`
    : `${selectedAircraft.pilotReadiness.readyNowCount} ready | ${selectedAircraft.pilotReadiness.pilotsRequired} required`;
}

function summarizeDispatchReadinessState(items: DispatchReadinessChecklistItem[]): DispatchReadinessState {
  if (items.some((item) => item.state === "blocked")) {
    return "blocked";
  }

  if (items.some((item) => item.state === "watch")) {
    return "watch";
  }

  return "pass";
}

function chooseDispatchRecoveryAction(
  selectedAircraft: DispatchAircraftView,
  items: DispatchReadinessChecklistItem[],
): string {
  const blockedItem = items.find((item) => item.state === "blocked");
  if (blockedItem) {
    return blockedItem.recoveryAction;
  }

  const watchItem = items.find((item) => item.state === "watch");
  if (watchItem) {
    return watchItem.recoveryAction;
  }

  if (!selectedAircraft.schedule) {
    return "Stage selected work on this aircraft first.";
  }

  if (!selectedAircraft.schedule.validation) {
    return selectedAircraft.schedule.isDraft
      ? "Restage or refresh the draft if readiness details are missing."
      : "This aircraft already has a committed schedule. Review the current timeline instead of staging a draft here.";
  }

  return selectedAircraft.schedule.validation.isCommittable
    ? "No recovery action needed right now."
    : "Resolve the checklist items above before committing.";
}

function describeReadinessContext(selectedAircraft: DispatchAircraftView): string {
  return `${selectedAircraft.registration} | ${selectedAircraft.modelDisplayName} | The checklist below reflects the current draft and validation snapshot.`;
}

function describeReadinessStateCount(
  checklist: DispatchReadinessChecklistItem[],
  overallState: DispatchReadinessState,
): string {
  const blockedCount = checklist.filter((item) => item.state === "blocked").length;
  const watchCount = checklist.filter((item) => item.state === "watch").length;
  if (overallState === "pass") {
    return "All checklist items are passing.";
  }

  return `${blockedCount} blocked | ${watchCount} watch`;
}

function describeCommitImpactHeadline(selectedAircraft: DispatchAircraftView | undefined): string {
  if (!selectedAircraft) {
    return "Select an aircraft to see commit consequences.";
  }

  const schedule = selectedAircraft.schedule;
  if (!schedule) {
    return `Stage selected work on ${selectedAircraft.registration} to preview commit impact.`;
  }

  if (!schedule.isDraft) {
    return `${selectedAircraft.registration} is already committed.`;
  }

  return `Commit will reserve ${selectedAircraft.registration} and lock the staged plan into the calendar.`;
}

export function deriveDispatchCommitImpactSummary(
  selectedAircraft: DispatchAircraftView | undefined,
): DispatchCommitImpactSummary {
  return {
    headline: describeCommitImpactHeadline(selectedAircraft),
    note: describeCommitImpactNote(selectedAircraft),
  };
}

function describeCommitImpactNote(selectedAircraft: DispatchAircraftView | undefined): string {
  if (!selectedAircraft) {
    return "Pick an aircraft first, then stage work to see what the commit will change.";
  }

  const schedule = selectedAircraft.schedule;
  if (!schedule) {
    return "Once work is staged, this bar will summarize the operational consequence before you commit.";
  }

  if (!schedule.isDraft) {
    return "No draft remains to commit on this aircraft.";
  }

  const draftScope = `${schedule.legs.length} leg${schedule.legs.length === 1 ? "" : "s"} and ${schedule.laborAllocationCount} labor allocation${schedule.laborAllocationCount === 1 ? "" : "s"} are already in the draft.`;
  const financeMessage = schedule.validation?.validationMessages.find((message) => ownsCommitImpactFinanceMessage(message.code));
  if (financeMessage) {
    return `${financeMessage.summary} ${draftScope}`;
  }

  return draftScope;
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
  if (["warning", "warn", "assigned", "due_soon", "tight", "watch", "maintenance", "candidate_available", "accepted_ready", "blocked_draft", "reserved", "resting", "training", "traveling"].includes(value)) {
    return "warn";
  }
  if (["active", "scheduled", "available", "draft_ready", "draft", "committed", "info", "flying", "ready"].includes(value)) {
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

function loadStoredSelection(saveId: string): DispatchStoredSelection | null {
  try {
    const raw = window.sessionStorage.getItem(`${selectionStoragePrefix}${saveId}`);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as DispatchStoredSelection;
  } catch {
    return null;
  }
}

function storeSelection(
  saveId: string,
  aircraftId: string | undefined,
  legId: string | undefined,
  sourceMode: DispatchSourceMode | undefined,
  sourceId: string | undefined,
): void {
  try {
    window.sessionStorage.setItem(`${selectionStoragePrefix}${saveId}`, JSON.stringify({
      ...(aircraftId ? { aircraftId } : {}),
      ...(legId ? { legId } : {}),
      ...(sourceMode ? { sourceMode } : {}),
      ...(sourceId ? { sourceId } : {}),
    }));
  } catch {
    // Ignore storage failures in desktop mode.
  }
}

function resolveDefaultSourceMode(payload: DispatchTabPayload): DispatchSourceMode {
  return payload.workInputs.acceptedContracts.length > 0 ? "accepted_contracts" : "planned_routes";
}

function resolveSourceSelection(
  payload: DispatchTabPayload,
  sourceMode: DispatchSourceMode | undefined,
  sourceId: string | undefined,
): { sourceMode: DispatchSourceMode; sourceId?: string } {
  if (sourceMode) {
    const modeItems = getSourceItems(payload, sourceMode);
    const resolvedSourceId = sourceId && modeItems.some((item) => item.id === sourceId)
      ? sourceId
      : modeItems[0]?.id;

    return {
      sourceMode,
      ...(resolvedSourceId ? { sourceId: resolvedSourceId } : {}),
    };
  }

  const defaultMode = resolveDefaultSourceMode(payload);
  const defaultItems = getSourceItems(payload, defaultMode);
  const alternateMode: DispatchSourceMode = defaultMode === "accepted_contracts" ? "planned_routes" : "accepted_contracts";
  const resolvedMode = defaultItems.length > 0 ? defaultMode : alternateMode;
  const resolvedItems = getSourceItems(payload, resolvedMode);
  const resolvedSourceId = sourceId && resolvedItems.some((item) => item.id === sourceId)
    ? sourceId
    : resolvedItems[0]?.id;

  return {
    sourceMode: resolvedMode,
    ...(resolvedSourceId ? { sourceId: resolvedSourceId } : {}),
  };
}

function getSourceItems(
  payload: DispatchTabPayload,
  sourceMode: DispatchSourceMode,
): { id: string; title: string; subtitle: string; status: string; meta: string; originAirportCode: string; destinationAirportCode: string }[] {
  if (sourceMode === "planned_routes") {
    return payload.workInputs.routePlanItems.map((item) => ({
      id: item.routePlanItemId,
      title: `${item.originAirport.code} -> ${item.destinationAirport.code}`,
      subtitle: `${item.originAirport.primaryLabel} to ${item.destinationAirport.primaryLabel}`,
      status: item.plannerItemStatus,
      meta: `${formatPayload(item.volumeType, item.passengerCount, item.cargoWeightLb)} | ${formatMoney(item.payoutAmount)} | Due ${formatDate(item.deadlineUtc)}`,
      originAirportCode: item.originAirport.code,
      destinationAirportCode: item.destinationAirport.code,
    }));
  }

  return payload.workInputs.acceptedContracts.map((contract) => ({
    id: contract.companyContractId,
    title: `${contract.originAirport.code} -> ${contract.destinationAirport.code}`,
    subtitle: `${contract.originAirport.primaryLabel} to ${contract.destinationAirport.primaryLabel}`,
    status: contract.contractState,
    meta: `${formatPayload(contract.volumeType, contract.passengerCount, contract.cargoWeightLb)} | ${formatMoney(contract.acceptedPayoutAmount)} | Due ${formatDate(contract.deadlineUtc)}`,
    originAirportCode: contract.originAirport.code,
    destinationAirportCode: contract.destinationAirport.code,
  }));
}

function findSelectedRoutePlanItem(
  items: DispatchTabPayload["workInputs"]["routePlanItems"],
  selectedRoutePlanItemId: string | undefined,
): DispatchTabPayload["workInputs"]["routePlanItems"][number] | undefined {
  return items.find((item) => item.routePlanItemId === selectedRoutePlanItemId) ?? items[0];
}

function findSelectedAcceptedContract(
  items: DispatchTabPayload["workInputs"]["acceptedContracts"],
  selectedCompanyContractId: string | undefined,
): DispatchTabPayload["workInputs"]["acceptedContracts"][number] | undefined {
  return items.find((item) => item.companyContractId === selectedCompanyContractId) ?? items[0];
}

function describeRoutePlanPackage(
  items: DispatchTabPayload["workInputs"]["routePlanItems"],
  packageStartItem: DispatchTabPayload["workInputs"]["routePlanItems"][number],
  packageEndItem: DispatchTabPayload["workInputs"]["routePlanItems"][number],
  selectedItem: DispatchTabPayload["workInputs"]["routePlanItems"][number],
): string {
  if (!selectedItem) {
    return "No route plan item is selected.";
  }

  const acceptedReadyCount = items.filter((item) => item.plannerItemStatus === "accepted_ready").length;
  const blockerCount = items.filter((item) => item.plannerItemStatus === "candidate_available" || item.plannerItemStatus === "candidate_stale").length;
  const scheduledCount = items.filter((item) => item.plannerItemStatus === "scheduled").length;

  return `Route package starts at ${packageStartItem.originAirport.code}, ends at ${packageEndItem.destinationAirport.code}, and has ${acceptedReadyCount} ready, ${blockerCount} blocked, and ${scheduledCount} scheduled item${items.length === 1 ? "" : "s"}. Staging binds the accepted-ready chain in order; the selected row stays as context only.`;
}

function describeRoutePlanSummaryNote(
  items: DispatchTabPayload["workInputs"]["routePlanItems"],
  packageStartItem: DispatchTabPayload["workInputs"]["routePlanItems"][number],
  packageEndItem: DispatchTabPayload["workInputs"]["routePlanItems"][number],
  selectedItem: DispatchTabPayload["workInputs"]["routePlanItems"][number],
): string {
  return items.length > 1
    ? `Selected row: ${selectedItem.originAirport.code} -> ${selectedItem.destinationAirport.code}. Dispatch stages the ready items in the chain from ${packageStartItem.originAirport.code} to ${packageEndItem.destinationAirport.code}, not just the selected row.`
    : `This selected row is the whole planned route package.`;
}

function describeAcceptedContractSummaryNote(
  selectedAircraft: DispatchAircraftView | undefined,
  selectedContract: DispatchTabPayload["workInputs"]["acceptedContracts"][number],
): string {
  return selectedAircraft
    ? `Drafting ${selectedContract.originAirport.code} -> ${selectedContract.destinationAirport.code} will use ${selectedAircraft.registration}. ${describeDraftReplacementImpact(selectedAircraft)}`
    : `Select an aircraft first to stage ${selectedContract.originAirport.code} -> ${selectedContract.destinationAirport.code}.`;
}

function describeDraftReplacementImpact(selectedAircraft: DispatchAircraftView | undefined): string {
  if (!selectedAircraft) {
    return "Select an aircraft first to stage this work.";
  }

  if (selectedAircraft.schedule?.isDraft) {
    return `Replacing selected work clears only the current draft window ${formatDate(selectedAircraft.schedule.plannedStartUtc)} to ${formatDate(selectedAircraft.schedule.plannedEndUtc)}. Use Discard draft first if you want to abandon it without staging new work.`;
  }

  if (selectedAircraft.schedule) {
    return `This stages a new draft on ${selectedAircraft.registration} and does not undo the committed schedule already reflected in Clock & Calendar.`;
  }

  return `This stages a new draft on ${selectedAircraft.registration}.`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
