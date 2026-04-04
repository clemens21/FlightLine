/*
 * Browser controller for the dispatch tab inside the save shell.
 * It keeps only transient UI state such as the selected aircraft and selected leg while the server owns the data model.
 */

import {
  applyDispatchWorkspaceViewState,
  type DispatchAirportView,
  type DispatchAircraftView,
  type DispatchAssignedPilotView,
  type DispatchDraftPilotAssignmentView,
  type DispatchLegView,
  type DispatchPilotReadinessView,
  type DispatchTabPayload,
  type DispatchValidationSnapshotView,
  type DispatchValidationMessageView,
} from "../dispatch-tab-model.js";
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
  impact: string;
  recoveryAction: string;
  openByDefault: boolean;
}

export interface DispatchReadinessSummary {
  checklist: DispatchReadinessChecklistItem[];
  overallState: DispatchReadinessState;
  recoveryAction: string;
}

export interface DispatchCommitImpactSection {
  id: "aircraft" | "pilots" | "calendar";
  label: string;
  headline: string;
  detail: string;
  tone: "neutral" | DispatchReadinessState;
}

export interface DispatchCommitImpactSummary {
  headline: string;
  note: string;
  sections: DispatchCommitImpactSection[];
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
  const navigationSelection = loadNavigationSelection();
  let selectedAircraftId = storedSelection?.aircraftId ?? payload.defaultSelectedAircraftId;
  let selectedLegId = storedSelection?.legId;
  let selectedSourceMode: DispatchSourceMode | undefined = "accepted_contracts";
  let selectedSourceId = navigationSelection?.sourceId ?? storedSelection?.sourceId;
  const selectedPilotOverrideIdsByScheduleId = new Map<string, string[]>();

  function render(): void {
    const viewState = applyDispatchWorkspaceViewState(payload, {
      ...(selectedAircraftId ? { selectedAircraftId } : {}),
      ...(selectedLegId ? { selectedLegId } : {}),
    });
    const resolvedSourceSelection = resolveSourceSelection(
      payload,
      selectedSourceMode,
      selectedSourceId,
      viewState.selectedAircraft,
    );

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
      viewState.selectedAircraft?.schedule?.isDraft
        ? selectedPilotOverrideIdsByScheduleId.get(viewState.selectedAircraft.schedule.scheduleId)
        : undefined,
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
      const nextAircraft = payload.aircraft.find((entry) => entry.aircraftId === selectedAircraftId);
      if (listAttachedContractIds(nextAircraft).size > 0) {
        selectedSourceId = undefined;
      }
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

  function handleChange(event: Event): void {
    const target = event.target instanceof HTMLInputElement ? event.target : null;
    if (!target) {
      return;
    }

    if (target.matches("[data-dispatch-pilot-override]")) {
      const scheduleId = target.dataset.dispatchScheduleId;
      if (!scheduleId) {
        return;
      }

      const selectedOverrideIds = Array.from(
        host.querySelectorAll<HTMLInputElement>(`[data-dispatch-pilot-override][data-dispatch-schedule-id="${scheduleId}"]:checked`),
      )
        .map((input) => input.value)
        .filter((value) => value.length > 0);

      if (selectedOverrideIds.length > 0) {
        selectedPilotOverrideIdsByScheduleId.set(scheduleId, selectedOverrideIds);
      } else {
        selectedPilotOverrideIdsByScheduleId.delete(scheduleId);
      }
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

function renderDispatchWorkspace(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedLeg: DispatchLegView | undefined,
  selectedSourceMode: DispatchSourceMode | undefined,
  selectedSourceId: string | undefined,
  selectedPilotOverrideIds: readonly string[] | undefined,
): string {
  const resolvedSourceSelection = resolveSourceSelection(payload, selectedSourceMode, selectedSourceId, selectedAircraft);
  const sourceMode = resolvedSourceSelection.sourceMode;
  const sourceId = resolvedSourceSelection.sourceId;
  return `
    <div class="dispatch-workspace dispatch-workspace--dense">
      <div class="dispatch-dense-shell">
        ${renderDispatchSourceLane(payload, selectedAircraft, sourceMode, sourceId)}
        <div class="dispatch-dense-main">
          <section class="panel dispatch-contract-focus-panel" data-dispatch-selected-work>
            <div class="panel-head">
              <h3>${sourceMode === "planned_routes" ? "Selected Route Plan" : "Selected Contract"}</h3>
              <div class="pill-row">
                <span class="pill">${escapeHtml(sourceMode === "planned_routes" ? "route plan" : "accepted contract")}</span>
                ${sourceMode === "accepted_contracts" && sourceId
                  ? (() => {
                    const selectedContract = findSelectedAcceptedContract(
                      prioritizeAcceptedContracts(payload.workInputs.acceptedContracts, selectedAircraft),
                      sourceId,
                    );
                    return selectedContract?.assignedAircraftId ? renderBadge("scheduled") : "";
                  })()
                  : ""}
              </div>
            </div>
            <div class="panel-body">
              ${renderSelectedWorkSummary(payload, selectedAircraft, sourceMode, sourceId)}
            </div>
          </section>
          <div class="dispatch-dense-grid">
            ${renderAircraftSelectionPanel(payload, selectedAircraft, selectedPilotOverrideIds)}
            <div class="dispatch-review-stack">
              ${renderPilotAssignmentPanel(selectedAircraft, selectedPilotOverrideIds)}
              ${renderDispatchReviewPanel(payload, selectedAircraft, selectedLeg, sourceMode, sourceId, selectedPilotOverrideIds)}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderDispatchSourceLane(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedSourceMode: DispatchSourceMode,
  selectedSourceId: string | undefined,
): string {
  const sourceCount = selectedSourceMode === "planned_routes"
    ? payload.workInputs.routePlanItems.length
    : payload.workInputs.acceptedContracts.length;

  return `
    <section class="panel dispatch-source-panel" data-dispatch-input-lane>
      <div class="panel-head">
        <div>
          <h3>Dispatch Inputs</h3>
          <span class="muted">Choose accepted work or a saved route plan, then assign the aircraft that will fly it.</span>
        </div>
        <div class="pill-row">
          <span class="pill">${escapeHtml(String(payload.workInputs.acceptedContracts.length))} accepted</span>
          <span class="pill">${escapeHtml(String(payload.workInputs.routePlanItems.length))} route items</span>
        </div>
      </div>
      <div class="panel-body dispatch-source-panel-body">
        ${renderDispatchSourceSelector(payload, selectedSourceMode)}
        <div class="dispatch-table-frame dispatch-source-table-wrap" data-dispatch-source-table>
          ${renderSourceModeBody(payload, selectedAircraft, selectedSourceMode, selectedSourceId)}
        </div>
        <div class="muted dispatch-table-note">${escapeHtml(
          selectedSourceMode === "planned_routes"
            ? `${sourceCount} route-plan item${sourceCount === 1 ? "" : "s"} are available for dispatch context. Selecting a row keeps that stop as context, but dispatch binds the full ready chain.`
            : `${sourceCount} accepted contract${sourceCount === 1 ? "" : "s"} are ready for aircraft assignment and draft staging.`,
        )}</div>
      </div>
    </section>
  `;
}

function renderAircraftSelectionPanel(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedPilotOverrideIds: readonly string[] | undefined,
): string {
  return `
    <section class="panel dispatch-selected-aircraft-panel" data-dispatch-selected-aircraft>
      <div class="panel-head">
        <div>
          <h3>Aircraft Assignment</h3>
          <span class="muted">Select the aircraft first. The draft and pilot recommendation update immediately off that choice.</span>
        </div>
        ${selectedAircraft ? `
          <div class="pill-row">
            ${renderBadge(selectedAircraft.dispatchAvailable ? "available" : selectedAircraft.operationalState)}
            ${renderBadge(selectedAircraft.maintenanceState)}
            ${selectedAircraft.schedule ? renderBadge(selectedAircraft.schedule.isDraft ? (selectedAircraft.schedule.validation?.isCommittable === false ? "blocked_draft" : "draft_ready") : "committed") : ""}
          </div>
        ` : ""}
      </div>
      <div class="panel-body dispatch-aircraft-selection-body">
        <div class="dispatch-table-frame dispatch-aircraft-table-wrap" data-dispatch-aircraft-table>
          ${renderAircraftSelectionTable(payload.aircraft, selectedAircraft?.aircraftId)}
        </div>
        ${renderSelectedAircraftSummary(payload, selectedAircraft, selectedPilotOverrideIds)}
      </div>
    </section>
  `;
}

function renderAircraftSelectionTable(
  aircraft: DispatchAircraftView[],
  selectedAircraftId: string | undefined,
): string {
  if (aircraft.length === 0) {
    return `<div class="empty-state compact">Acquire an aircraft before using Dispatch.</div>`;
  }

  return `
    <table class="contracts-board-table dispatch-compact-table dispatch-aircraft-table">
      <colgroup>
        <col style="width:260px" />
        <col style="width:210px" />
        <col style="width:200px" />
        <col style="width:170px" />
        <col style="width:190px" />
      </colgroup>
      <thead>
        <tr>
          ${renderDispatchStaticHeaderCell("Aircraft")}
          ${renderDispatchStaticHeaderCell("Current")}
          ${renderDispatchStaticHeaderCell("Schedule")}
          ${renderDispatchStaticHeaderCell("Pilot Coverage")}
          ${renderDispatchStaticHeaderCell("Status")}
        </tr>
      </thead>
      <tbody>
        ${aircraft.map((entry) => renderAircraftSelectionRow(entry, entry.aircraftId === selectedAircraftId)).join("")}
      </tbody>
    </table>
  `;
}

function renderAircraftSelectionRow(
  aircraft: DispatchAircraftView,
  selected: boolean,
): string {
  const scheduleLabel = aircraft.schedule
    ? aircraft.schedule.isDraft
      ? aircraft.schedule.validation?.isCommittable === false
        ? "Blocked draft"
        : "Draft staged"
      : "Committed"
    : "No schedule";
  const coverageLabel = `${aircraft.pilotReadiness.readyNowCount} ready | ${aircraft.pilotReadiness.assignedPilotCount} assigned`;

  return `
    <tr
      class="contract-row dispatch-aircraft-row ${selected ? "selected" : ""}"
      data-dispatch-aircraft-select="${escapeHtml(aircraft.aircraftId)}"
      data-dispatch-aircraft-row="${escapeHtml(aircraft.aircraftId)}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <td>
        <div class="meta-stack">
          <strong>${escapeHtml(aircraft.registration)}</strong>
          <span class="muted">${escapeHtml(aircraft.modelDisplayName)}</span>
          <span class="muted">${escapeHtml(humanize(aircraft.ownershipType))}</span>
        </div>
      </td>
      <td>
        <div class="meta-stack">
          <strong>${escapeHtml(aircraft.currentAirport.code)}</strong>
          <span class="muted">${escapeHtml(aircraft.currentAirport.primaryLabel)}</span>
        </div>
      </td>
      <td>
        <div class="meta-stack">
          <strong>${escapeHtml(scheduleLabel)}</strong>
          <span class="muted">${aircraft.schedule ? `${escapeHtml(formatDate(aircraft.schedule.plannedStartUtc))} -> ${escapeHtml(formatDate(aircraft.schedule.plannedEndUtc))}` : "Ready for new work"}</span>
        </div>
      </td>
      <td>
        <div class="meta-stack">
          <strong>${escapeHtml(coverageLabel)}</strong>
          <span class="muted">${escapeHtml(aircraft.requiredPilotCertificationCode ?? humanize(aircraft.pilotQualificationGroup))}</span>
        </div>
      </td>
      <td>
        <div class="pill-row">
          ${renderBadge(aircraft.dispatchAvailable ? "available" : aircraft.operationalState)}
          ${renderBadge(aircraft.maintenanceState)}
          ${renderBadge(aircraft.conditionBand)}
        </div>
      </td>
    </tr>
  `;
}

function renderPilotAssignmentPanel(
  selectedAircraft: DispatchAircraftView | undefined,
  selectedPilotOverrideIds: readonly string[] | undefined,
): string {
  const schedule = selectedAircraft?.schedule;
  return `
    <section class="panel dispatch-pilot-panel" data-dispatch-assigned-pilots>
      <div class="panel-head">
        <div>
          <h3>Pilot Assignment</h3>
          <span class="muted">Recommended coverage appears after a draft is staged. Override only when you want to force a different named pilot.</span>
        </div>
        ${selectedAircraft ? `<div class="pill-row"><span class="pill">${escapeHtml(selectedAircraft.registration)}</span></div>` : ""}
      </div>
      <div class="panel-body">
        ${!selectedAircraft
          ? `<div class="empty-state compact">Select an aircraft first to review the pilot assignment for this dispatch.</div>`
          : !schedule
            ? `<div class="empty-state compact">Build a draft on ${escapeHtml(selectedAircraft.registration)} to review the pilot assignment.</div>`
            : schedule.isDraft
              ? renderDraftPilotAssignmentTable(selectedAircraft, selectedPilotOverrideIds)
              : renderCommittedPilotAssignmentTable(selectedAircraft)}
      </div>
    </section>
  `;
}

function renderDispatchReviewPanel(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedLeg: DispatchLegView | undefined,
  selectedSourceMode: DispatchSourceMode,
  selectedSourceId: string | undefined,
  selectedPilotOverrideIds: readonly string[] | undefined,
): string {
  const schedule = selectedAircraft?.schedule;
  return `
    <section class="panel dispatch-review-panel" data-dispatch-validation-rail>
      <div class="panel-head">
        <div>
          <h3>Dispatch Review</h3>
          <span class="muted">Review the active draft, current blockers, and commit impact before dispatching.</span>
        </div>
        <div class="pill-row">
          ${schedule ? `<span class="pill">${escapeHtml(String(schedule.legs.length))} legs</span>` : ""}
          ${schedule?.validation ? `<span class="pill">${escapeHtml(schedule.validation.projectedRiskBand)} risk</span>` : ""}
        </div>
      </div>
      <div class="panel-body dispatch-review-panel-body">
        ${renderDraftControlSummary(payload, selectedAircraft ?? undefined)}
        ${renderDispatchCheckSummary(selectedAircraft)}
        ${renderPlanSnapshot(selectedAircraft)}
        <div class="dispatch-table-frame dispatch-leg-table-wrap" data-dispatch-leg-queue>
          ${renderDispatchLegTable(schedule?.legs, selectedLeg?.flightLegId, payload.timeUtility.currentTimeUtc)}
        </div>
        <div class="dispatch-selected-leg-inline" data-dispatch-selected-leg-detail>
          ${selectedLeg ? renderSelectedLegInline(selectedLeg) : `<div class="muted">Select a staged leg if you want to inspect its exact window and attached work.</div>`}
        </div>
        <div class="dispatch-commit-panel-inline dispatch-commit-bar" data-dispatch-commit-bar>
          ${renderCommitBar(payload, selectedAircraft, selectedSourceMode, selectedSourceId, selectedPilotOverrideIds)}
        </div>
      </div>
    </section>
  `;
}

function renderDispatchCheckSummary(selectedAircraft: DispatchAircraftView | undefined): string {
  if (!selectedAircraft) {
    return `<div class="empty-state compact">Select an aircraft to inspect dispatch readiness.</div>`;
  }

  const readiness = deriveDispatchReadinessSummary(selectedAircraft);
  const validation = selectedAircraft.schedule?.validation;
  const topMessages = validation?.validationMessages.slice(0, 3) ?? [];

  return `
    <div class="dispatch-check-grid">
      <article class="summary-item compact">
        <div class="eyebrow">Overall readiness</div>
        <strong>${escapeHtml(formatReadinessStateLabel(readiness.overallState))}</strong>
        <span class="muted">${escapeHtml(describeReadinessStateCount(readiness.checklist, readiness.overallState))}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Likely recovery</div>
        <strong>${escapeHtml(readiness.recoveryAction)}</strong>
        <span class="muted">${escapeHtml(describeReadinessContext(selectedAircraft))}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Validation snapshot</div>
        <strong>${validation ? `${escapeHtml(String(validation.hardBlockerCount))} blockers | ${escapeHtml(String(validation.warningCount))} warnings` : "No draft validation"}</strong>
        <span class="muted">${validation ? `${escapeHtml(humanize(validation.projectedRiskBand))} risk | ${escapeHtml(formatMoney(validation.projectedScheduleProfit))} projected profit` : "Stage work to populate this snapshot."}</span>
      </article>
    </div>
    <div class="dispatch-message-list dispatch-message-list--tight">
      ${readiness.checklist.slice(0, 3).map((item) => `
        <article class="dispatch-message-item ${escapeHtml(item.state)}" data-dispatch-readiness-item="${escapeHtml(item.id)}">
          <div class="dispatch-message-head">
            ${renderBadge(item.state)}
            <strong>${escapeHtml(item.label)}</strong>
          </div>
          <span class="muted">${escapeHtml(item.detail)}</span>
          <span class="muted">${escapeHtml(item.recoveryAction)}</span>
        </article>
      `).join("")}
      ${topMessages.map((message) => `
        <article class="dispatch-message-item ${escapeHtml(message.severity)}">
          <div class="dispatch-message-head">
            ${renderBadge(message.severity)}
            <strong>${escapeHtml(message.summary)}</strong>
          </div>
          ${message.suggestedRecoveryAction ? `<span class="muted">${escapeHtml(message.suggestedRecoveryAction)}</span>` : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function renderDispatchLegTable(
  legs: DispatchLegView[] | undefined,
  selectedLegId: string | undefined,
  currentTimeUtc: string,
): string {
  if (!legs || legs.length === 0) {
    return `<div class="empty-state compact">No dispatch draft is currently staged on the selected aircraft.</div>`;
  }

  return `
    <table class="contracts-board-table dispatch-compact-table dispatch-leg-table">
      <colgroup>
        <col style="width:270px" />
        <col style="width:120px" />
        <col style="width:180px" />
        <col style="width:150px" />
        <col style="width:170px" />
      </colgroup>
      <thead>
        <tr>
          ${renderDispatchStaticHeaderCell("Route")}
          ${renderDispatchStaticHeaderCell("Payload")}
          ${renderDispatchStaticHeaderCell("Window")}
          ${renderDispatchStaticHeaderCell("Due")}
          ${renderDispatchStaticHeaderCell("Attached Work")}
        </tr>
      </thead>
      <tbody>
        ${legs.map((leg) => renderDispatchLegRow(leg, leg.flightLegId === selectedLegId, currentTimeUtc)).join("")}
      </tbody>
    </table>
  `;
}

function renderDispatchLegRow(
  leg: DispatchLegView,
  selected: boolean,
  currentTimeUtc: string,
): string {
  const attachedContractCount = leg.linkedCompanyContractIds?.length ?? (leg.linkedCompanyContractId ? 1 : 0);
  return `
    <tr
      class="contract-row dispatch-leg-row ${selected ? "selected" : ""}"
      data-dispatch-leg-select="${escapeHtml(leg.flightLegId)}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <td>${renderDispatchRouteCell(leg.originAirport, leg.destinationAirport, `Leg ${leg.sequenceNumber} | ${humanize(leg.legType)}`)}</td>
      <td>${escapeHtml(leg.payloadLabel)}</td>
      <td>
        <div class="meta-stack">
          <strong>${escapeHtml(formatDate(leg.plannedDepartureUtc))}</strong>
          <span class="muted">Arrive ${escapeHtml(formatDate(leg.plannedArrivalUtc))}</span>
        </div>
      </td>
      <td>${leg.contractDeadlineUtc ? renderDispatchDueTableCell(leg.contractDeadlineUtc, currentTimeUtc) : `<span class="muted">Support leg</span>`}</td>
      <td>
        <div class="meta-stack">
          <strong>${escapeHtml(String(attachedContractCount))} contract${attachedContractCount === 1 ? "" : "s"}</strong>
          <span class="muted">${leg.validationMessages[0] ? escapeHtml(leg.validationMessages[0].summary) : "No leg-specific blockers"}</span>
        </div>
      </td>
    </tr>
  `;
}

function renderDispatchStaticHeaderCell(label: string): string {
  return renderStaticTableHeaderCell(label);
}

function renderDispatchRouteCell(
  originAirport: DispatchAirportView,
  destinationAirport: DispatchAirportView,
  note: string | undefined,
): string {
  return renderTableRouteCell(
    { code: originAirport.code, label: originAirport.primaryLabel },
    { code: destinationAirport.code, label: destinationAirport.primaryLabel },
    note,
  );
}

function renderDispatchDueTableCell(deadlineUtc: string, currentTimeUtc: string): string {
  return renderTableDueCell(deadlineUtc, currentTimeUtc, formatDate);
}

function renderSelectedAircraftSummary(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedPilotOverrideIds: readonly string[] | undefined,
): string {
  void payload;
  void selectedPilotOverrideIds;
  if (!selectedAircraft) {
    return `<div class="empty-state">No aircraft is selected yet.</div>`;
  }

  const schedule = selectedAircraft.schedule;
  const validation = schedule?.validation;
  const attachedContractCount = validation?.contractIdsAttached.length ?? countAttachedContracts(schedule?.legs);
  const scheduleLabel = schedule
    ? schedule.isDraft
      ? schedule.validation?.isCommittable === false ? "Blocked draft" : "Draft staged"
      : `Committed ${humanize(schedule.scheduleState)}`
    : "No draft staged";

  return `
    <section class="dispatch-aircraft-summary-head">
      <div class="meta-stack">
        <div class="eyebrow">Selected aircraft</div>
        <strong>${escapeHtml(`${selectedAircraft.registration} | ${selectedAircraft.modelDisplayName}`)}</strong>
        <span class="muted">${escapeHtml(`${selectedAircraft.currentAirport.code} | ${selectedAircraft.currentAirport.primaryLabel} | ${humanize(selectedAircraft.ownershipType)}`)}</span>
      </div>
      <div class="pill-row">
        ${renderBadge(selectedAircraft.dispatchAvailable ? "available" : selectedAircraft.operationalState)}
        ${renderBadge(selectedAircraft.maintenanceState)}
        ${renderBadge(selectedAircraft.conditionBand)}
      </div>
    </section>
    <div class="dispatch-selected-aircraft-grid">
      <article class="summary-item compact">
        <div class="eyebrow">Plan Stage</div>
        <strong>${escapeHtml(scheduleLabel)}</strong>
        <span class="muted">${schedule ? `${formatDate(schedule.plannedStartUtc)} to ${formatDate(schedule.plannedEndUtc)}` : "Stage selected work to create a draft."}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Route Load</div>
        <strong>${schedule ? `${escapeHtml(String(schedule.legs.length))} legs | ${escapeHtml(String(attachedContractCount))} contract${attachedContractCount === 1 ? "" : "s"}` : "No staged work"}</strong>
        <span class="muted">${validation ? `${escapeHtml(formatNumber(validation.totalDistanceNm))} nm | ${escapeHtml(formatHours(validation.totalBlockHours))} block` : "Distance and block time appear after staging."}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Crew Requirement</div>
        <strong>${escapeHtml(selectedAircraft.requiredPilotCertificationCode ?? humanize(selectedAircraft.pilotQualificationGroup))}</strong>
        <span class="muted">${escapeHtml(String(selectedAircraft.pilotCoverageUnits))} active | ${escapeHtml(String(selectedAircraft.pendingPilotCoverageUnits))} pending units</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Maintenance</div>
        <strong>${escapeHtml(humanize(selectedAircraft.maintenanceState))}</strong>
        <span class="muted">${formatHours(selectedAircraft.hoursToService)} to service | ${formatPercent(selectedAircraft.conditionValue)} condition</span>
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
  `;
}

function renderDraftControlSummary(payload: DispatchTabPayload, selectedAircraft: DispatchAircraftView | undefined): string {
  if (!selectedAircraft) {
    return `<div class="empty-state compact">Select an aircraft to inspect its draft or committed schedule state.</div>`;
  }
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

function renderCommittedPilotAssignmentTable(selectedAircraft: DispatchAircraftView): string {
  if (selectedAircraft.assignedPilots.length === 0) {
    return `
      <div class="dispatch-message-list">
        <article class="dispatch-message-item warning">
          <div class="dispatch-message-head">${renderBadge("warning")}<strong>No reserved named pilots are attached</strong></div>
          <span class="muted">This committed schedule does not currently expose a named-pilot reservation. That should be treated as a truth gap.</span>
        </article>
      </div>
    `;
  }

  return `
    <div class="dispatch-table-frame dispatch-pilot-table-wrap">
      <table class="contracts-board-table dispatch-compact-table dispatch-pilot-table">
        <colgroup>
          <col style="width:190px" />
          <col style="width:140px" />
          <col style="width:120px" />
          <col style="width:220px" />
        </colgroup>
        <thead>
          <tr>
            ${renderDispatchStaticHeaderCell("Pilot")}
            ${renderDispatchStaticHeaderCell("Certifications")}
            ${renderDispatchStaticHeaderCell("Status")}
            ${renderDispatchStaticHeaderCell("Context")}
          </tr>
        </thead>
        <tbody>
          ${selectedAircraft.assignedPilots.map((pilot) => `
            <tr class="dispatch-pilot-row" data-dispatch-assigned-pilot="${escapeHtml(pilot.namedPilotId)}">
              <td><div class="meta-stack"><strong>${escapeHtml(pilot.displayName)}</strong></div></td>
              <td>${escapeHtml(formatPilotCertifications(pilot.certifications))}</td>
              <td>${renderBadge(pilot.availabilityState)}</td>
              <td><span class="muted">${escapeHtml(describeAssignedPilotContext(pilot))}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDraftPilotAssignmentTable(
  selectedAircraft: DispatchAircraftView,
  selectedPilotOverrideIds: readonly string[] | undefined,
): string {
  const schedule = selectedAircraft.schedule;
  const assignment = schedule?.draftPilotAssignment;
  if (!schedule || !schedule.isDraft || !assignment) {
    return `
      <section class="dispatch-message-list">
        <article class="dispatch-message-item info">
          <div class="dispatch-message-head">${renderBadge("info")}<strong>Draft pilot recommendation unavailable</strong></div>
          <span class="muted">Dispatch could not derive a draft-time named-pilot recommendation for this aircraft yet.</span>
        </article>
      </section>
    `;
  }

  const recommendedOptions = assignment.candidateOptions.filter((option) => option.recommended);
  const selectableOptions = assignment.candidateOptions.filter((option) => option.selectable);
  const recommendedNames = recommendedOptions.map((option) => option.displayName).join(" | ");

  return `
    <section class="dispatch-draft-pilot-panel" data-dispatch-draft-pilot-assignment="${escapeHtml(schedule.scheduleId)}">
      <article class="dispatch-message-item info" data-dispatch-pilot-recommendation>
        <div class="dispatch-message-head">
          ${renderBadge(recommendedOptions.length >= assignment.pilotsRequired ? "ready" : "warning")}
          <strong>${escapeHtml(recommendedOptions.length > 0 ? `Recommended: ${recommendedNames}` : "No recommended pilot assignment")}</strong>
        </div>
        <span class="muted">${escapeHtml(describeDraftPilotAssignmentSummary(selectedAircraft))}</span>
      </article>
      ${assignment.hardBlockers.map((blocker) => `
        <article class="dispatch-message-item blocker">
          <div class="dispatch-message-head">${renderBadge("blocked")}<strong>Assignment blocker</strong></div>
          <span class="muted">${escapeHtml(blocker)}</span>
        </article>
      `).join("")}
      <article class="dispatch-message-item info">
        <div class="dispatch-message-head">
          ${renderBadge("info")}
          <strong>Manual override before commit</strong>
        </div>
        <span class="muted">${escapeHtml(selectableOptions.length > 0
          ? "Leave every override control blank to commit with the recommendation. Pick a different pilot only if you want to override it explicitly."
          : "No selectable pilot override is available from the current named-pilot pool.")}</span>
      </article>
      <div class="dispatch-table-frame dispatch-pilot-table-wrap">
        <table class="contracts-board-table dispatch-compact-table dispatch-pilot-table">
          <colgroup>
            <col style="width:170px" />
            <col style="width:130px" />
            <col style="width:110px" />
            <col style="width:230px" />
            <col style="width:190px" />
          </colgroup>
          <thead>
            <tr>
              ${renderDispatchStaticHeaderCell("Pilot")}
              ${renderDispatchStaticHeaderCell("Certifications")}
              ${renderDispatchStaticHeaderCell("Status")}
              ${renderDispatchStaticHeaderCell("Context")}
              ${renderDispatchStaticHeaderCell("Override")}
            </tr>
          </thead>
          <tbody>
            ${assignment.candidateOptions.map((option) =>
              renderDraftPilotOptionRow(schedule.scheduleId, assignment.pilotsRequired, option, selectedPilotOverrideIds)).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDraftPilotOptionRow(
  scheduleId: string,
  pilotsRequired: number,
  option: DispatchDraftPilotAssignmentView["candidateOptions"][number],
  selectedPilotOverrideIds: readonly string[] | undefined,
): string {
  const controlId = `dispatch-pilot-override-${option.namedPilotId}`;
  const controlType = pilotsRequired > 1 ? "checkbox" : "radio";
  const checked = selectedPilotOverrideIds?.includes(option.namedPilotId) ?? false;
  const overrideControl = option.selectable
    ? `<label class="dispatch-pilot-override-control" for="${escapeHtml(controlId)}">
        <input
          id="${escapeHtml(controlId)}"
          type="${escapeHtml(controlType)}"
          name="selectedNamedPilotIds"
          value="${escapeHtml(option.namedPilotId)}"
          form="${escapeHtml(dispatchCommitFormId(scheduleId))}"
          data-dispatch-pilot-override="${escapeHtml(option.namedPilotId)}"
          data-dispatch-schedule-id="${escapeHtml(scheduleId)}"
          ${checked ? "checked" : ""}
        />
        <span>${escapeHtml(controlType === "radio" ? "Select this pilot instead" : "Include this pilot in the override")}</span>
      </label>`
    : `<span class="muted" data-dispatch-pilot-option-reason="${escapeHtml(option.namedPilotId)}">${escapeHtml(option.reason ?? "Unavailable for this draft.")}</span>`;

  return `
    <tr
      class="dispatch-pilot-row ${option.selectable ? "" : "dispatch-pilot-row--disabled"}"
      data-dispatch-pilot-option="${escapeHtml(option.namedPilotId)}"
    >
      <td>
        <div class="meta-stack">
          <strong>${escapeHtml(option.displayName)}</strong>
          ${option.recommended ? `<span class="muted">Recommended</span>` : ""}
        </div>
      </td>
      <td>${escapeHtml(formatPilotCertifications(option.certifications))}</td>
      <td>
        <div class="pill-row">
          ${option.recommended ? renderBadge("recommended") : ""}
          ${renderBadge(option.availabilityState)}
        </div>
      </td>
      <td><span class="muted">${escapeHtml(describeDraftPilotOptionContext(option))}</span></td>
      <td>${overrideControl}</td>
    </tr>
  `;
}

function describeDraftPilotAssignmentSummary(selectedAircraft: DispatchAircraftView): string {
  const assignment = selectedAircraft.schedule?.draftPilotAssignment;
  if (!assignment) {
    return "No draft pilot recommendation is available.";
  }

  const certificationLabel = assignment.requiredCertificationCode ?? humanize(assignment.qualificationGroup);
  const selectableCount = assignment.candidateOptions.filter((option) => option.selectable).length;
  return `${selectedAircraft.registration} needs ${assignment.pilotsRequired} ${certificationLabel} pilot${assignment.pilotsRequired === 1 ? "" : "s"} from ${formatDate(selectedAircraft.schedule!.plannedStartUtc)} to ${formatDate(selectedAircraft.schedule!.plannedEndUtc)}. ${selectableCount} selectable option${selectableCount === 1 ? "" : "s"} are available right now.`;
}

function describeDraftPilotOptionContext(
  option: DispatchDraftPilotAssignmentView["candidateOptions"][number],
): string {
  const parts = [
    option.currentAirport ? `Current airport ${option.currentAirport.code}` : undefined,
    option.travelDestinationAirport && option.travelUntilUtc
      ? `Can reposition to ${option.travelDestinationAirport.code} by ${formatDate(option.travelUntilUtc)}`
      : undefined,
    !option.selectable ? option.reason : undefined,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" | ");
}

function renderPlanSnapshot(selectedAircraft: DispatchAircraftView | undefined): string {
  const schedule = selectedAircraft?.schedule;
  const validation = schedule?.validation;

  if (!selectedAircraft || !schedule) {
    return `<div class="empty-state compact">Stage selected work on the active aircraft to open the plan board.</div>`;
  }

  const attachedContractCount = validation?.contractIdsAttached.length ?? countAttachedContracts(schedule.legs);
  const firstLeg = schedule.legs[0];
  const lastLeg = schedule.legs[schedule.legs.length - 1];

  return `
    <div class="dispatch-plan-summary">
      <article class="summary-item compact">
        <div class="eyebrow">Window</div>
        <strong>${escapeHtml(formatDate(schedule.plannedStartUtc))}</strong>
        <span class="muted">Ends ${escapeHtml(formatDate(schedule.plannedEndUtc))}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Plan path</div>
        <strong>${firstLeg && lastLeg ? `${escapeHtml(firstLeg.originAirport.code)} -> ${escapeHtml(lastLeg.destinationAirport.code)}` : "No staged route"}</strong>
        <span class="muted">${escapeHtml(String(schedule.legs.length))} legs | ${escapeHtml(String(attachedContractCount))} attached contract${attachedContractCount === 1 ? "" : "s"}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Distance / block</div>
        <strong>${validation ? `${escapeHtml(formatNumber(validation.totalDistanceNm))} nm` : "Pending validation"}</strong>
        <span class="muted">${validation ? `${escapeHtml(formatHours(validation.totalBlockHours))} planned block time` : "Refresh the draft if totals are missing."}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Validation snapshot</div>
        <strong>${validation ? `${escapeHtml(String(validation.hardBlockerCount))} blockers | ${escapeHtml(String(validation.warningCount))} warnings` : "No validation snapshot"}</strong>
        <span class="muted">${validation ? `${escapeHtml(humanize(validation.projectedRiskBand))} risk | ${escapeHtml(formatMoney(validation.projectedScheduleProfit))} projected profit` : "Stage or refresh the draft to inspect risk."}</span>
      </article>
    </div>
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
          <div class="dispatch-leg-button-route">
            <span class="dispatch-leg-sequence">${escapeHtml(String(leg.sequenceNumber))}</span>
            <div class="meta-stack">
              <strong>${escapeHtml(leg.originAirport.code)} -> ${escapeHtml(leg.destinationAirport.code)}</strong>
              <span class="muted">${escapeHtml(humanize(leg.legType))} | ${escapeHtml(leg.originAirport.primaryLabel)} to ${escapeHtml(leg.destinationAirport.primaryLabel)}</span>
            </div>
            ${renderValidationCountBadge(leg.validationMessages)}
          </div>
          <div class="dispatch-leg-button-stats">
            <span><strong>Dep</strong> ${escapeHtml(formatDate(leg.plannedDepartureUtc))}</span>
            <span><strong>Arr</strong> ${escapeHtml(formatDate(leg.plannedArrivalUtc))}</span>
            <span><strong>Payload</strong> ${escapeHtml(leg.payloadLabel)}</span>
            <span><strong>Block</strong> ${escapeHtml(formatDuration(leg.durationMinutes))}</span>
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

  const attachedContractCount = selectedLeg.linkedCompanyContractIds?.length ?? (selectedLeg.linkedCompanyContractId ? 1 : 0);
  return `
    <div class="dispatch-leg-detail-stack" data-dispatch-selected-leg="1">
      <section class="dispatch-detail-card dispatch-leg-detail-hero">
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
          <div class="eyebrow">Crew</div>
          <strong>${escapeHtml(selectedLeg.requiredPilotCertificationCode ?? humanize(selectedLeg.assignedQualificationGroup ?? "standard"))}</strong>
          <span class="muted">${selectedLeg.contractState ? `Contract ${escapeHtml(humanize(selectedLeg.contractState))}` : "No contract attached"}</span>
        </article>
        <article class="summary-item compact">
          <div class="eyebrow">Attached Work</div>
          <strong>${escapeHtml(String(attachedContractCount))} contract${attachedContractCount === 1 ? "" : "s"}</strong>
          <span class="muted">${selectedLeg.contractDeadlineUtc ? `Deadline ${escapeHtml(formatDate(selectedLeg.contractDeadlineUtc))}` : "Support leg with no contract deadline"}</span>
        </article>
        <article class="summary-item compact">
          <div class="eyebrow">Validation</div>
          <strong>${escapeHtml(String(selectedLeg.validationMessages.filter((message) => message.severity === "blocker").length))} blockers | ${escapeHtml(String(selectedLeg.validationMessages.filter((message) => message.severity === "warning").length))} warnings</strong>
          <span class="muted">${selectedLeg.validationMessages[0] ? escapeHtml(selectedLeg.validationMessages[0].summary) : "This leg is currently clear."}</span>
        </article>
      </section>
      ${renderLegValidationMessages(selectedLeg.validationMessages)}
    </div>
  `;
}

function renderSelectedLegInline(selectedLeg: DispatchLegView): string {
  const attachedContractCount = selectedLeg.linkedCompanyContractIds?.length ?? (selectedLeg.linkedCompanyContractId ? 1 : 0);
  return `
    <div class="summary-item compact" data-dispatch-selected-leg="1">
      <div class="eyebrow">Selected leg</div>
      <strong>${escapeHtml(selectedLeg.originAirport.code)} -> ${escapeHtml(selectedLeg.destinationAirport.code)}</strong>
      <span class="muted">${escapeHtml(formatDate(selectedLeg.plannedDepartureUtc))} -> ${escapeHtml(formatDate(selectedLeg.plannedArrivalUtc))} | ${escapeHtml(selectedLeg.payloadLabel)}</span>
      <span class="muted">${escapeHtml(String(attachedContractCount))} attached contract${attachedContractCount === 1 ? "" : "s"} | ${selectedLeg.validationMessages[0] ? escapeHtml(selectedLeg.validationMessages[0].summary) : "No leg-specific blockers"}</span>
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
      <div class="dispatch-validation-summary">
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
        <article class="summary-item compact">
          <div class="eyebrow">Validation snapshot</div>
          <strong>${validation ? `${escapeHtml(String(validation.hardBlockerCount))} blockers | ${escapeHtml(String(validation.warningCount))} warnings` : "No draft validation"}</strong>
          <span class="muted">${validation ? `${escapeHtml(humanize(validation.projectedRiskBand))} risk | ${escapeHtml(formatMoney(validation.projectedScheduleProfit))} projected profit` : "Stage work to populate this snapshot."}</span>
        </article>
      </div>
      <div class="dispatch-readiness-list">
        ${readiness.checklist.map((item) => renderReadinessChecklistItem(item)).join("")}
      </div>
    </div>
  `;
}

function countAttachedContracts(legs: DispatchLegView[] | undefined): number {
  if (!legs || legs.length === 0) {
    return 0;
  }

  const attachedIds = new Set<string>();
  for (const leg of legs) {
    if (leg.linkedCompanyContractId) {
      attachedIds.add(leg.linkedCompanyContractId);
    }
    for (const contractId of leg.linkedCompanyContractIds ?? []) {
      attachedIds.add(contractId);
    }
  }

  return attachedIds.size;
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
  const resolved = resolveSourceSelection(payload, selectedSourceMode, selectedSourceId, selectedAircraft);
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
  const resolved = resolveSourceSelection(payload, selectedSourceMode, selectedSourceId, selectedAircraft);
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
    return `<div class="empty-state compact">No planned routes are waiting in Dispatch yet.</div>`;
  }

  const selectedItem = findSelectedRoutePlanItem(items, selectedRoutePlanItemId);
  const packageStartItem = items[0]!;
  const packageEndItem = items[items.length - 1]!;
  const summaryItem = selectedItem ?? packageStartItem;
  const packageEndpoint = payload.workInputs.endpointAirport ?? packageEndItem.destinationAirport;
  const routePathCodes = buildRoutePathCodes(items);
  const totalPayoutAmount = items.reduce((sum, item) => sum + item.payoutAmount, 0);
  const stageButtonDisabled = !selectedAircraft || payload.workInputs.acceptedReadyCount === 0 || !selectedAircraft.dispatchAvailable;
  const stageButtonLabel = selectedAircraft?.schedule?.isDraft ? "Replace draft with route plan" : "Draft route plan";

  return `
    <div class="summary-list dispatch-selected-work-summary">
      <article class="summary-item compact" data-dispatch-route-context="planned_routes" data-dispatch-route-plan-package>
        <div class="eyebrow">Route context</div>
        <strong>${escapeHtml(packageStartItem.originAirport.code)} -> ${escapeHtml(packageEndpoint.code)}</strong>
        <div class="pill-row" data-dispatch-route-ribbon>
          ${renderRouteRibbon(routePathCodes)}
        </div>
        <span class="muted">${escapeHtml(describeRouteRibbon(routePathCodes, items.length))}</span>
        <span class="muted">${escapeHtml(describeRoutePlanPackageSummary(payload, packageStartItem, packageEndItem))}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Timing</div>
        <strong>${escapeHtml(formatDate(packageStartItem.earliestStartUtc ?? packageStartItem.deadlineUtc))} to ${escapeHtml(formatDate(packageEndItem.deadlineUtc))}</strong>
        <span class="muted">${escapeHtml(String(items.length))} planned item${items.length === 1 ? "" : "s"}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Payload</div>
        <strong>${escapeHtml(formatMoney(totalPayoutAmount))}</strong>
        <span class="muted">${escapeHtml(formatPayload(summaryItem.volumeType, summaryItem.passengerCount, summaryItem.cargoWeightLb))} selected as row context</span>
      </article>
      <article class="summary-item compact" data-dispatch-route-selected-row data-dispatch-route-plan-selected-row>
        <div class="eyebrow">Selected row</div>
        <strong>${escapeHtml(summaryItem.originAirport.code)} -> ${escapeHtml(summaryItem.destinationAirport.code)}</strong>
        <span class="muted">${escapeHtml(summaryItem.originAirport.primaryLabel)} to ${escapeHtml(summaryItem.destinationAirport.primaryLabel)}</span>
        <span class="muted">Stop ${escapeHtml(String(summaryItem.sequenceNumber))} of ${escapeHtml(String(items.length))}</span>
        <span class="muted">Window ${escapeHtml(formatWindow(summaryItem.earliestStartUtc, summaryItem.deadlineUtc))}</span>
      </article>
      <article class="summary-item compact" data-dispatch-draft-impact>
        <div class="eyebrow">Draft impact</div>
        <strong>${escapeHtml(selectedAircraft ? selectedAircraft.registration : "No aircraft selected")}</strong>
        <span class="muted">${escapeHtml(describeDraftReplacementImpact(selectedAircraft))}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Chain</div>
        <strong>${escapeHtml(String(items.length))} planned items</strong>
        <span class="muted">${escapeHtml(describeRoutePlanChain(items, packageStartItem, packageEndItem, summaryItem))}</span>
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
  `;
}

function renderSelectedAcceptedContractSummary(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedCompanyContractId: string | undefined,
): string {
  const contracts = prioritizeAcceptedContracts(payload.workInputs.acceptedContracts, selectedAircraft);
  if (contracts.length === 0) {
    return `<div class="empty-state compact">No accepted contracts are waiting for planning yet.</div>`;
  }

  const selectedContract = (findSelectedAcceptedContract(contracts, selectedCompanyContractId) ?? contracts[0])!;
  const attachedToSelectedAircraft = Boolean(selectedAircraft?.schedule?.legs.some((leg) =>
    leg.linkedCompanyContractId === selectedContract.companyContractId
    || leg.linkedCompanyContractIds?.includes(selectedContract.companyContractId),
  ));
  const actionDisabled = !selectedAircraft;
  const stageButtonLabel = selectedAircraft?.schedule?.isDraft
    ? `Replace draft on ${selectedAircraft.registration}`
    : selectedAircraft
      ? `Build dispatch draft on ${selectedAircraft.registration}`
      : "Select an aircraft first";

  return `
    <div class="dispatch-selected-work-summary dispatch-selected-work-summary--contract-first">
      <article class="summary-item compact" data-dispatch-route-context="accepted_contracts" data-dispatch-accepted-route-context>
        <div class="eyebrow">Route</div>
        <strong>${escapeHtml(selectedContract.originAirport.code)} -> ${escapeHtml(selectedContract.destinationAirport.code)}</strong>
        <span class="muted">${escapeHtml(selectedContract.originAirport.primaryLabel)} to ${escapeHtml(selectedContract.destinationAirport.primaryLabel)}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Deadline</div>
        <strong>${escapeHtml(formatDate(selectedContract.deadlineUtc))}</strong>
        <span class="muted">${selectedContract.earliestStartUtc ? `Earliest ${escapeHtml(formatDate(selectedContract.earliestStartUtc))}` : "No earliest start window"}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Load</div>
        <strong>${escapeHtml(formatPayload(selectedContract.volumeType, selectedContract.passengerCount, selectedContract.cargoWeightLb))}</strong>
        <span class="muted">Accepted work package</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Payout</div>
        <strong>${escapeHtml(formatMoney(selectedContract.acceptedPayoutAmount))}</strong>
        <span class="muted">${escapeHtml(humanize(selectedContract.contractState))}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Aircraft Assignment</div>
        <strong>${escapeHtml(selectedAircraft ? selectedAircraft.registration : "No aircraft selected")}</strong>
        <span class="muted">${escapeHtml(selectedAircraft ? describeDraftReplacementImpact(selectedAircraft) : "Choose an aircraft first.")}</span>
      </article>
      <article class="summary-item compact">
        <div class="eyebrow">Dispatch Status</div>
        <strong>${attachedToSelectedAircraft ? "Draft staged on selected aircraft" : "Pending draft"}</strong>
        <span class="muted">${escapeHtml(attachedToSelectedAircraft ? "Pilot recommendation and dispatch preview now reflect this contract." : "Build the dispatch draft after choosing the aircraft.")}</span>
      </article>
      <article class="summary-item compact dispatch-selected-work-action-card">
        <div class="eyebrow">Next Step</div>
        <strong>${escapeHtml(selectedAircraft ? `Stage ${selectedContract.originAirport.code} -> ${selectedContract.destinationAirport.code}` : "Choose aircraft")}</strong>
        <div class="dispatch-selected-work-actions">
          ${selectedAircraft ? `
            <form method="post" action="/api/save/${encodeURIComponent(payload.saveId)}/actions/auto-plan-contract" class="dispatch-inline-action" data-api-form>
              <input type="hidden" name="tab" value="dispatch" />
              <input type="hidden" name="saveId" value="${escapeHtml(payload.saveId)}" />
              <input type="hidden" name="companyContractId" value="${escapeHtml(selectedContract.companyContractId)}" />
              <input type="hidden" name="aircraftId" value="${escapeHtml(selectedAircraft.aircraftId)}" />
              <button type="submit" ${actionDisabled ? "disabled" : ""} data-dispatch-auto-plan-contract="1" data-dispatch-stage-draft="1" data-pending-label="Building dispatch draft...">${escapeHtml(stageButtonLabel)}</button>
            </form>
          ` : `<div class="muted">Select an aircraft to build the dispatch draft.</div>`}
        </div>
        <span class="muted">${escapeHtml(describeAcceptedContractSummaryNote(selectedAircraft, selectedContract))}</span>
      </article>
    </div>
  `;
}

function renderPlannedRoutesList(payload: DispatchTabPayload, selectedRoutePlanItemId: string | undefined): string {
  const routePlanItems = payload.workInputs.routePlanItems;
  if (routePlanItems.length === 0) {
    return `<div class="empty-state compact">Add contracts to the route plan from Contracts, then accept them there before handing them off into Dispatch.</div>`;
  }

  return `
    <table class="contracts-board-table dispatch-compact-table dispatch-source-table dispatch-route-plan-table" aria-label="Planned routes">
      <colgroup>
        <col style="width:300px" />
        <col style="width:130px" />
        <col style="width:120px" />
        <col style="width:130px" />
        <col style="width:170px" />
        <col style="width:120px" />
      </colgroup>
      <thead>
        <tr>
          ${renderDispatchStaticHeaderCell("Route")}
          ${renderDispatchStaticHeaderCell("Status")}
          ${renderDispatchStaticHeaderCell("Payload")}
          ${renderDispatchStaticHeaderCell("Payout")}
          ${renderDispatchStaticHeaderCell("Due")}
          ${renderDispatchStaticHeaderCell("Sequence")}
        </tr>
      </thead>
      <tbody>
        ${routePlanItems.map((item) => renderRoutePlanItem(item, item.routePlanItemId === selectedRoutePlanItemId, payload.timeUtility.currentTimeUtc)).join("")}
      </tbody>
    </table>
  `;
}

function renderAcceptedContractsList(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedCompanyContractId: string | undefined,
): string {
  const contracts = prioritizeAcceptedContracts(payload.workInputs.acceptedContracts, selectedAircraft);
  const attachedContractIds = listAttachedContractIds(selectedAircraft);

  if (contracts.length === 0) {
    return `<div class="empty-state compact">No accepted contracts are waiting for a dispatch plan.</div>`;
  }

  return `
    <table class="contracts-board-table dispatch-compact-table dispatch-source-table dispatch-accepted-contract-table" aria-label="Accepted contracts">
      <colgroup>
        <col style="width:300px" />
        <col style="width:130px" />
        <col style="width:120px" />
        <col style="width:130px" />
        <col style="width:170px" />
        <col style="width:150px" />
      </colgroup>
      <thead>
        <tr>
          ${renderDispatchStaticHeaderCell("Route")}
          ${renderDispatchStaticHeaderCell("State")}
          ${renderDispatchStaticHeaderCell("Payload")}
          ${renderDispatchStaticHeaderCell("Payout")}
          ${renderDispatchStaticHeaderCell("Due")}
          ${renderDispatchStaticHeaderCell("Assignment")}
        </tr>
      </thead>
      <tbody>
        ${contracts.map((contract) => renderAcceptedContract(contract, contract.companyContractId === selectedCompanyContractId, attachedContractIds.has(contract.companyContractId), payload.timeUtility.currentTimeUtc)).join("")}
      </tbody>
    </table>
  `;
}

function renderRoutePlanItem(
  item: DispatchTabPayload["workInputs"]["routePlanItems"][number],
  selected: boolean,
  currentTimeUtc: string,
): string {
  return `
    <tr
      class="contract-row dispatch-source-row ${selected ? "selected" : ""}"
      data-dispatch-source-item="${escapeHtml(item.routePlanItemId)}"
      data-dispatch-source-mode="planned_routes"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <td>${renderDispatchRouteCell(item.originAirport, item.destinationAirport, `${labelForUi(item.sourceType)} | ${selected ? "selected row" : "row context"}`)}</td>
      <td>
        <div class="pill-row">
          ${renderBadge(item.plannerItemStatus)}
          ${item.linkedAircraftId ? renderBadge("linked") : ""}
        </div>
      </td>
      <td>${escapeHtml(formatPayload(item.volumeType, item.passengerCount, item.cargoWeightLb))}</td>
      <td>${escapeHtml(formatMoney(item.payoutAmount))}</td>
      <td>${renderDispatchDueTableCell(item.deadlineUtc, currentTimeUtc)}</td>
      <td>
        <div class="meta-stack">
          <strong>Stop ${escapeHtml(String(item.sequenceNumber))}</strong>
          <span class="muted">${escapeHtml(formatWindow(item.earliestStartUtc, item.deadlineUtc))}</span>
        </div>
      </td>
    </tr>
  `;
}

function renderAcceptedContract(
  contract: DispatchTabPayload["workInputs"]["acceptedContracts"][number],
  selected: boolean,
  alreadyInDraft: boolean,
  currentTimeUtc: string,
): string {
  return `
    <tr
      class="contract-row dispatch-source-row ${selected ? "selected" : ""}"
      data-dispatch-source-item="${escapeHtml(contract.companyContractId)}"
      data-dispatch-source-mode="accepted_contracts"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <td>${renderDispatchRouteCell(contract.originAirport, contract.destinationAirport, `${selected ? "selected work" : "click to dispatch"} | ${formatWindow(contract.earliestStartUtc, contract.deadlineUtc)}`)}</td>
      <td><div class="pill-row">${renderBadge(contract.contractState)}${alreadyInDraft ? renderBadge("draft_ready") : ""}</div></td>
      <td>${escapeHtml(formatPayload(contract.volumeType, contract.passengerCount, contract.cargoWeightLb))}</td>
      <td>${escapeHtml(formatMoney(contract.acceptedPayoutAmount))}</td>
      <td>${renderDispatchDueTableCell(contract.deadlineUtc, currentTimeUtc)}</td>
      <td>
        <div class="meta-stack">
          <strong>${escapeHtml(contract.assignedAircraftId ? "Assigned" : "Unassigned")}</strong>
          <span class="muted">${escapeHtml(contract.assignedAircraftId ?? (alreadyInDraft ? "In selected draft" : "Choose aircraft"))}</span>
        </div>
      </td>
    </tr>
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

function renderCommitBar(
  payload: DispatchTabPayload,
  selectedAircraft: DispatchAircraftView | undefined,
  selectedSourceMode: DispatchSourceMode,
  selectedSourceId: string | undefined,
  selectedPilotOverrideIds: readonly string[] | undefined,
): string {
  const schedule = selectedAircraft?.schedule;
  const validation = schedule?.validation;
  const routePlanSelected = selectedSourceMode === "planned_routes";
  const selectedContractAttached = Boolean(
    selectedSourceId
    && (validation?.contractIdsAttached.includes(selectedSourceId)
      || schedule?.legs.some((leg) =>
        leg.linkedCompanyContractId === selectedSourceId
        || leg.linkedCompanyContractIds?.includes(selectedSourceId),
      )),
  );
  const canCommit = Boolean(
    schedule?.isDraft
    && validation?.isCommittable
    && (routePlanSelected ? (schedule.legs.length > 0) : selectedContractAttached),
  );
  const commitImpact = deriveDispatchCommitImpactSummary(selectedAircraft);
  const commitButtonLabel = routePlanSelected
    ? !selectedSourceId
      ? "No route plan selected"
      : !schedule
        ? "No route plan draft"
        : !schedule.isDraft
          ? "Already dispatched"
          : validation?.isCommittable
            ? "Dispatch route plan"
            : "Resolve blockers"
    : !selectedSourceId
      ? "No contract selected"
      : !schedule
        ? "No dispatch draft"
        : !schedule.isDraft
          ? selectedContractAttached
            ? "Already dispatched"
            : "Committed elsewhere"
          : !selectedContractAttached
            ? "Build selected contract draft"
            : validation?.isCommittable
              ? "Dispatch contract"
              : "Resolve blockers";

  return `
      <div class="dispatch-commit-copy">
        <div class="meta-stack">
          <div class="eyebrow">Dispatch action</div>
          <strong>${escapeHtml(commitImpact.headline)}</strong>
          <span class="muted">${escapeHtml(routePlanSelected ? `${commitImpact.note} This action commits the staged ready route-plan chain on the selected aircraft.` : commitImpact.note)}</span>
        </div>
        <div class="dispatch-commit-metrics">
          ${commitImpact.sections.map((section) => renderCommitImpactSection(section)).join("")}
        </div>
      </div>
      <div class="dispatch-commit-actions">
        ${schedule?.isDraft ? `
        <form
          method="post"
          action="/api/save/${encodeURIComponent(payload.saveId)}/actions/commit-schedule"
          class="dispatch-inline-action"
          data-api-form
          id="${escapeHtml(dispatchCommitFormId(schedule.scheduleId))}"
        >
          <input type="hidden" name="tab" value="dispatch" />
          <input type="hidden" name="saveId" value="${escapeHtml(payload.saveId)}" />
          <input type="hidden" name="scheduleId" value="${escapeHtml(schedule.scheduleId)}" />
          ${schedule.draftPilotAssignment && selectedPilotOverrideIds && selectedPilotOverrideIds.length > 0
            ? selectedPilotOverrideIds.map((namedPilotId) =>
                `<input type="hidden" name="selectedNamedPilotIds" value="${escapeHtml(namedPilotId)}" data-dispatch-selected-pilot-hidden="${escapeHtml(namedPilotId)}" />`).join("")
            : ""}
          <button type="submit" ${canCommit ? "" : "disabled"} data-dispatch-commit-button="1" data-pending-label="Committing schedule...">${escapeHtml(commitButtonLabel)}</button>
        </form>
      ` : `<button type="button" disabled data-dispatch-commit-button="1">${escapeHtml(commitButtonLabel)}</button>`}
      <a class="button-link button-secondary" href="/save/${encodeURIComponent(payload.saveId)}?tab=contracts">Open contracts</a>
    </div>
  `;
}

function dispatchCommitFormId(scheduleId: string): string {
  return `dispatch-commit-${scheduleId}`;
}

function describePilotAssignmentHeadline(selectedAircraft: DispatchAircraftView): string {
  if (!selectedAircraft.schedule) {
    return "No schedule staged";
  }

  if (selectedAircraft.schedule.isDraft) {
    const recommendedCount = selectedAircraft.schedule.draftPilotAssignment?.recommendedPilotIds.length ?? 0;
    return recommendedCount > 0
      ? `${recommendedCount}/${selectedAircraft.pilotReadiness.pilotsRequired} pilots recommended`
      : "Recommendation blocked";
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
    const assignment = selectedAircraft.schedule.draftPilotAssignment;
    if (!assignment) {
      return "Drafts should expose a named-pilot recommendation before commit.";
    }

    const recommendedNames = assignment.candidateOptions
      .filter((option) => option.recommended)
      .map((option) => option.displayName);
    return recommendedNames.length > 0
      ? `Recommended now: ${recommendedNames.join(" | ")}. Override remains optional before commit.`
      : assignment.hardBlockers[0] ?? "No named pilot can cover this draft right now.";
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

  const checklist: DispatchReadinessChecklistItem[] = [
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
      impact: describeChecklistImpact("work-selected", selectedAircraft, workSelectedState),
      openByDefault: shouldOpenChecklistItem("work-selected", workSelectedState, selectedAircraft),
    },
    {
      id: "aircraft-selected",
      label: "Aircraft selected",
      state: aircraftSelectedState,
      detail: `${selectedAircraft.registration} is the active dispatch target.`,
      recoveryAction: "Choose an aircraft before staging a draft.",
      impact: describeChecklistImpact("aircraft-selected", selectedAircraft, aircraftSelectedState),
      openByDefault: shouldOpenChecklistItem("aircraft-selected", aircraftSelectedState, selectedAircraft),
    },
    {
      id: "route-operational-fit",
      label: "Route / operational fit",
      state: routeState,
      detail: describeChecklistDetail(routeMessages, schedule
        ? "Route and aircraft fit are clear."
        : "Select work to evaluate route and operational fit."),
      recoveryAction: chooseChecklistRecoveryAction(routeMessages, "Adjust the route, payload, or aircraft fit."),
      impact: describeChecklistImpact("route-operational-fit", selectedAircraft, routeState),
      openByDefault: shouldOpenChecklistItem("route-operational-fit", routeState, selectedAircraft),
    },
    {
      id: "pilot-coverage",
      label: "Pilot coverage / named-pilot readiness",
      state: staffingState,
      detail: describePilotCoverageChecklistDetail(selectedAircraft, staffingMessages, validation),
      recoveryAction: chooseChecklistRecoveryAction(staffingMessages, "Free a ready pilot or stage with enough pilot coverage."),
      impact: describeChecklistImpact("pilot-coverage", selectedAircraft, staffingState),
      openByDefault: shouldOpenChecklistItem("pilot-coverage", staffingState, selectedAircraft),
    },
    {
      id: "timing-continuity",
      label: "Timing and continuity",
      state: timingState,
      detail: describeChecklistDetail(timingMessages, schedule
        ? `Draft timing spans ${formatDate(schedule.plannedStartUtc)} to ${formatDate(schedule.plannedEndUtc)}.`
        : "Stage work to inspect timing and continuity."),
      recoveryAction: chooseChecklistRecoveryAction(timingMessages, "Shift the window or rearrange the route chain."),
      impact: describeChecklistImpact("timing-continuity", selectedAircraft, timingState),
      openByDefault: shouldOpenChecklistItem("timing-continuity", timingState, selectedAircraft),
    },
    {
      id: "commitment-conflicts",
      label: "Commitment conflict status",
      state: conflictState,
      detail: describeChecklistDetail(conflictMessages, schedule
        ? "No aircraft or contract overlap is attached to this draft."
        : "Stage work to inspect overlapping commitments."),
      recoveryAction: chooseChecklistRecoveryAction(conflictMessages, "Clear the overlapping assignment or choose a different aircraft."),
      impact: describeChecklistImpact("commitment-conflicts", selectedAircraft, conflictState),
      openByDefault: shouldOpenChecklistItem("commitment-conflicts", conflictState, selectedAircraft),
    },
  ];

  return checklist;
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
    <details class="dispatch-readiness-item ${item.state}" data-dispatch-readiness-item="${escapeHtml(item.id)}" ${item.openByDefault ? "open" : ""}>
      <summary class="dispatch-readiness-summary">
        <div class="dispatch-message-head">
          <div class="meta-stack">
            <strong>${escapeHtml(item.label)}</strong>
            <span class="muted">${escapeHtml(item.detail)}</span>
          </div>
          ${renderReadinessStateBadge(item.state)}
        </div>
      </summary>
      <div class="dispatch-readiness-detail">
        <div class="dispatch-readiness-detail-grid">
          <article class="dispatch-readiness-detail-card">
            <div class="eyebrow">Why It Matters</div>
            <strong>${escapeHtml(item.impact)}</strong>
          </article>
          <article class="dispatch-readiness-detail-card">
            <div class="eyebrow">Next Step</div>
            <strong>${escapeHtml(item.recoveryAction)}</strong>
          </article>
        </div>
      </div>
    </details>
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

function describeChecklistImpact(
  itemId: DispatchReadinessChecklistItem["id"],
  selectedAircraft: DispatchAircraftView,
  state: DispatchReadinessState,
): string {
  if (itemId === "work-selected") {
    if (!selectedAircraft.schedule) {
      return "Dispatch cannot preview pilot reservations, calendar impact, or commit consequences until work is staged on this aircraft.";
    }

    if (!selectedAircraft.schedule.isDraft) {
      return "This aircraft already has live work attached, so Dispatch is describing the committed plan rather than a new draft.";
    }

    return "The staged draft is the source of truth for every downstream Dispatch check.";
  }

  if (itemId === "aircraft-selected") {
    return "Every timing, staffing, and commitment check in this pane is tied to the currently selected aircraft.";
  }

  if (itemId === "route-operational-fit") {
    return state === "pass"
      ? "The aircraft, payload, and route are aligned well enough to keep the draft moving toward commit."
      : "Route, payload, or operational mismatches can quickly turn into hard dispatch blockers if they stay unresolved.";
  }

  if (itemId === "pilot-coverage") {
    return state === "pass"
      ? "Named-pilot readiness is strong enough that this plan should have crew support when you commit."
      : "Pilot availability decides whether the draft can actually launch once it leaves planning.";
  }

  if (itemId === "timing-continuity") {
    return state === "pass"
      ? "The current window fits the route chain, contract timing, and maintenance envelope."
      : "Calendar timing controls whether the aircraft can complete the work without missing deadlines or service windows.";
  }

  return state === "pass"
    ? "The current draft is not colliding with another contract or aircraft commitment."
    : "Overlapping commitments can steal the aircraft or contract away from this draft even if the rest of the plan looks healthy.";
}

function shouldOpenChecklistItem(
  itemId: DispatchReadinessChecklistItem["id"],
  state: DispatchReadinessState,
  selectedAircraft: DispatchAircraftView,
): boolean {
  if (state !== "pass") {
    return true;
  }

  return itemId === "work-selected" && !selectedAircraft.schedule;
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
  return `${selectedAircraft.registration} | ${selectedAircraft.modelDisplayName} | Open each row to see why it matters and the fastest next step.`;
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
    sections: buildDispatchCommitImpactSections(selectedAircraft),
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

function buildDispatchCommitImpactSections(
  selectedAircraft: DispatchAircraftView | undefined,
): DispatchCommitImpactSection[] {
  if (!selectedAircraft) {
    return [
      {
        id: "aircraft",
        label: "Aircraft impact",
        headline: "No aircraft selected",
        detail: "Pick an aircraft first to preview how commit changes its operating state.",
        tone: "neutral",
      },
      {
        id: "pilots",
        label: "Pilot impact",
        headline: "No pilot reservation preview",
        detail: "Pilot consequences appear once a draft exists on a selected aircraft.",
        tone: "neutral",
      },
      {
        id: "calendar",
        label: "Calendar impact",
        headline: "No calendar block yet",
        detail: "Stage work to see what commit will lock into the schedule.",
        tone: "neutral",
      },
    ];
  }

  const schedule = selectedAircraft.schedule;
  if (!schedule) {
    return [
      {
        id: "aircraft",
        label: "Aircraft impact",
        headline: `${selectedAircraft.registration} stays available`,
        detail: "No draft is staged yet, so this aircraft is not reserved for new work.",
        tone: "neutral",
      },
      {
        id: "pilots",
        label: "Pilot impact",
        headline: "Pilot availability unchanged",
        detail: "Dispatch has not reserved or recommended pilots because no draft exists on this aircraft yet.",
        tone: "neutral",
      },
      {
        id: "calendar",
        label: "Calendar impact",
        headline: "No calendar hold yet",
        detail: "Stage selected work to preview the exact window this aircraft would lock into the calendar.",
        tone: "neutral",
      },
    ];
  }

  if (!schedule.isDraft) {
    return [
      {
        id: "aircraft",
        label: "Aircraft impact",
        headline: `${selectedAircraft.registration} already committed`,
        detail: `The live schedule already holds this aircraft from ${formatDate(schedule.plannedStartUtc)} to ${formatDate(schedule.plannedEndUtc)}.`,
        tone: "neutral",
      },
      {
        id: "pilots",
        label: "Pilot impact",
        headline: `${selectedAircraft.assignedPilots.length}/${selectedAircraft.pilotReadiness.pilotsRequired} named pilots attached`,
        detail: selectedAircraft.assignedPilots.length > 0
          ? "Any staffing change now happens against a committed plan, not a draft recommendation."
          : "This committed plan currently has no named pilots surfaced in the Dispatch summary.",
        tone: selectedAircraft.assignedPilots.length > 0 ? "pass" : "watch",
      },
      {
        id: "calendar",
        label: "Calendar impact",
        headline: "Calendar window already locked",
        detail: `${schedule.legs.length} leg${schedule.legs.length === 1 ? "" : "s"} are already reflected in the live schedule window.`,
        tone: "neutral",
      },
    ];
  }

  const validation = schedule.validation;
  const routeMessages = getDispatchValidationMessages(validation, ownsRouteOperationalMessage);
  const staffingMessages = getDispatchValidationMessages(validation, ["staffing."]);
  const timingMessages = getDispatchValidationMessages(validation, ownsTimingContinuityMessage);
  const conflictMessages = getDispatchValidationMessages(validation, ownsCommitmentConflictMessage);
  const aircraftTone = determineDispatchReadinessState(
    [...routeMessages, ...conflictMessages],
    validation?.isCommittable ? "pass" : "watch",
  );
  const pilotTone = determineDispatchReadinessState(staffingMessages, determineStaffingFallbackState(selectedAircraft));
  const calendarTone = determineDispatchReadinessState(timingMessages, validation?.isCommittable ? "pass" : "watch");
  const recommendedCount = schedule.draftPilotAssignment?.recommendedPilotIds.length ?? 0;
  const pilotsRequired = selectedAircraft.pilotReadiness.pilotsRequired;

  return [
    {
      id: "aircraft",
      label: "Aircraft impact",
      headline: `Reserve ${selectedAircraft.registration} from ${formatDate(schedule.plannedStartUtc)} to ${formatDate(schedule.plannedEndUtc)}`,
      detail: routeMessages[0]?.summary
        ?? conflictMessages[0]?.summary
        ?? `${schedule.legs.length} leg${schedule.legs.length === 1 ? "" : "s"} would move this aircraft into ${humanize(validation?.aircraftOperationalStateAfterCommit ?? "reserved")} on commit.`,
      tone: aircraftTone,
    },
    {
      id: "pilots",
      label: "Pilot impact",
      headline: staffingMessages.some((message) => message.severity === "blocker")
        ? "Pilot coverage still blocks commit"
        : `${recommendedCount}/${pilotsRequired} named pilots ready to reserve`,
      detail: staffingMessages[0]?.summary
        ?? `${selectedAircraft.pilotReadiness.readyNowCount} ready | ${selectedAircraft.pilotReadiness.restingNowCount} resting | ${selectedAircraft.pilotReadiness.trainingNowCount} training`,
      tone: pilotTone,
    },
    {
      id: "calendar",
      label: "Calendar impact",
      headline: `${formatDate(schedule.plannedStartUtc)} to ${formatDate(schedule.plannedEndUtc)} locks into the calendar`,
      detail: timingMessages[0]?.summary
        ?? `${schedule.legs.length} leg${schedule.legs.length === 1 ? "" : "s"} and ${schedule.laborAllocationCount} labor allocation${schedule.laborAllocationCount === 1 ? "" : "s"} would become live schedule commitments.`,
      tone: calendarTone,
    },
  ];
}

function renderCommitImpactSection(section: DispatchCommitImpactSection): string {
  return `
    <article class="dispatch-commit-metric ${section.tone}" data-dispatch-commit-impact="${escapeHtml(section.id)}">
      <div class="eyebrow">${escapeHtml(section.label)}</div>
      <strong>${escapeHtml(section.headline)}</strong>
      <span class="muted">${escapeHtml(section.detail)}</span>
    </article>
  `;
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
  if (["active", "scheduled", "available", "draft_ready", "draft", "committed", "info", "flying", "ready", "recommended"].includes(value)) {
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

function loadNavigationSelection(): Pick<DispatchStoredSelection, "sourceMode" | "sourceId"> | null {
  try {
    const url = new URL(window.location.href);
    const sourceMode = url.searchParams.get("dispatchSourceMode") as DispatchSourceMode | null;
    if (sourceMode !== "accepted_contracts" && sourceMode !== "planned_routes") {
      return null;
    }

    const sourceId = url.searchParams.get("dispatchSourceId") ?? undefined;
    return {
      sourceMode,
      ...(sourceId ? { sourceId } : {}),
    };
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

export function resolveSourceSelection(
  payload: DispatchTabPayload,
  sourceMode: DispatchSourceMode | undefined,
  sourceId: string | undefined,
  selectedAircraft: DispatchAircraftView | undefined,
): { sourceMode: DispatchSourceMode; sourceId?: string } {
  if (sourceMode) {
    const modeItems = getSourceItems(payload, sourceMode, selectedAircraft);
    if (modeItems.length > 0) {
      const resolvedSourceId = sourceMode === "accepted_contracts"
        ? resolveAcceptedContractSourceId(payload.workInputs.acceptedContracts, selectedAircraft, sourceId)
        : resolveSourceId(modeItems, sourceId);

      return {
        sourceMode,
        ...(resolvedSourceId ? { sourceId: resolvedSourceId } : {}),
      };
    }

    const alternateMode: DispatchSourceMode = sourceMode === "accepted_contracts" ? "planned_routes" : "accepted_contracts";
    const alternateItems = getSourceItems(payload, alternateMode, selectedAircraft);
    const resolvedAlternateSourceId = alternateMode === "accepted_contracts"
      ? resolveAcceptedContractSourceId(payload.workInputs.acceptedContracts, selectedAircraft, sourceId)
      : resolveSourceId(alternateItems, sourceId);

    return {
      sourceMode: alternateMode,
      ...(resolvedAlternateSourceId ? { sourceId: resolvedAlternateSourceId } : {}),
    };
  }

  const defaultMode = resolveDefaultSourceMode(payload);
  const defaultItems = getSourceItems(payload, defaultMode, selectedAircraft);
  const alternateMode: DispatchSourceMode = defaultMode === "accepted_contracts" ? "planned_routes" : "accepted_contracts";
  const resolvedMode = defaultItems.length > 0 ? defaultMode : alternateMode;
  const resolvedItems = getSourceItems(payload, resolvedMode, selectedAircraft);
  const resolvedSourceId = resolvedMode === "accepted_contracts"
    ? resolveAcceptedContractSourceId(payload.workInputs.acceptedContracts, selectedAircraft, sourceId)
    : resolveSourceId(resolvedItems, sourceId);

  return {
    sourceMode: resolvedMode,
    ...(resolvedSourceId ? { sourceId: resolvedSourceId } : {}),
  };
}

function getSourceItems(
  payload: DispatchTabPayload,
  sourceMode: DispatchSourceMode,
  selectedAircraft: DispatchAircraftView | undefined,
): { id: string; title: string; subtitle: string; status: string; meta: string; originAirportCode: string; destinationAirportCode: string }[] {
  if (sourceMode === "planned_routes") {
    return payload.workInputs.routePlanItems.map((item) => ({
      id: item.routePlanItemId,
      title: `${item.originAirport.code} -> ${item.destinationAirport.code}`,
      subtitle: `${item.originAirport.primaryLabel} to ${item.destinationAirport.primaryLabel}`,
      status: item.plannerItemStatus,
      meta: `Status ${labelForUi(item.plannerItemStatus)} | Stop ${item.sequenceNumber} | Window ${formatWindow(item.earliestStartUtc, item.deadlineUtc)} | Payload ${formatPayload(item.volumeType, item.passengerCount, item.cargoWeightLb)} | Payout ${formatMoney(item.payoutAmount)}`,
      originAirportCode: item.originAirport.code,
      destinationAirportCode: item.destinationAirport.code,
    }));
  }

  return prioritizeAcceptedContracts(payload.workInputs.acceptedContracts, selectedAircraft).map((contract) => ({
    id: contract.companyContractId,
    title: `${contract.originAirport.code} -> ${contract.destinationAirport.code}`,
    subtitle: `${contract.originAirport.primaryLabel} to ${contract.destinationAirport.primaryLabel}`,
    status: contract.contractState,
    meta: `Status ${labelForUi(contract.contractState)} | Window ${formatWindow(contract.earliestStartUtc, contract.deadlineUtc)} | Payload ${formatPayload(contract.volumeType, contract.passengerCount, contract.cargoWeightLb)} | Payout ${formatMoney(contract.acceptedPayoutAmount)}`,
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

function listAttachedContractIds(selectedAircraft: DispatchAircraftView | undefined): Set<string> {
  return new Set(
    selectedAircraft?.schedule?.legs
      .map((leg) => leg.linkedCompanyContractId)
      .filter((entry): entry is string => Boolean(entry)) ?? [],
  );
}

export function prioritizeAcceptedContracts(
  contracts: DispatchTabPayload["workInputs"]["acceptedContracts"],
  selectedAircraft: DispatchAircraftView | undefined,
): DispatchTabPayload["workInputs"]["acceptedContracts"] {
  const attachedContractIds = listAttachedContractIds(selectedAircraft);
  return [...contracts].sort((left, right) => {
    const leftAttached = attachedContractIds.has(left.companyContractId) ? 1 : 0;
    const rightAttached = attachedContractIds.has(right.companyContractId) ? 1 : 0;
    if (leftAttached !== rightAttached) {
      return rightAttached - leftAttached;
    }

    return left.deadlineUtc.localeCompare(right.deadlineUtc);
  });
}

function resolveSourceId(
  items: { id: string }[],
  sourceId: string | undefined,
): string | undefined {
  return sourceId && items.some((item) => item.id === sourceId)
    ? sourceId
    : items[0]?.id;
}

export function resolveAcceptedContractSourceId(
  contracts: DispatchTabPayload["workInputs"]["acceptedContracts"],
  selectedAircraft: DispatchAircraftView | undefined,
  sourceId: string | undefined,
): string | undefined {
  const prioritizedContracts = prioritizeAcceptedContracts(contracts, selectedAircraft);
  const attachedContractIds = listAttachedContractIds(selectedAircraft);

  if (sourceId && prioritizedContracts.some((contract) => contract.companyContractId === sourceId) && !attachedContractIds.has(sourceId)) {
    return sourceId;
  }

  return prioritizedContracts[0]?.companyContractId;
}

function describeRoutePlanChain(
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

  return `${packageStartItem.originAirport.code} to ${packageEndItem.destinationAirport.code} has ${acceptedReadyCount} ready, ${blockerCount} blocked, and ${scheduledCount} scheduled item${items.length === 1 ? "" : "s"}. Staging binds the accepted-ready chain in order; the selected row stays as context only.`;
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

function describeAcceptedRouteContext(selectedContract: DispatchTabPayload["workInputs"]["acceptedContracts"][number]): string {
  return `Single contract path from ${selectedContract.originAirport.code} to ${selectedContract.destinationAirport.code}.`;
}

function describeAcceptedContractSummaryNote(
  selectedAircraft: DispatchAircraftView | undefined,
  selectedContract: DispatchTabPayload["workInputs"]["acceptedContracts"][number],
): string {
  return selectedAircraft
    ? `Drafting ${selectedContract.originAirport.code} -> ${selectedContract.destinationAirport.code} will use ${selectedAircraft.registration}. ${describeDraftReplacementImpact(selectedAircraft)}`
    : `Select an aircraft first to stage ${selectedContract.originAirport.code} -> ${selectedContract.destinationAirport.code}.`;
}

function buildRoutePathCodes(items: DispatchTabPayload["workInputs"]["routePlanItems"]): string[] {
  if (items.length === 0) {
    return [];
  }

  return [
    items[0]!.originAirport.code,
    ...items.map((item) => item.destinationAirport.code),
  ];
}

function renderRouteRibbon(routePathCodes: string[]): string {
  if (routePathCodes.length === 0) {
    return `<span class="muted">No route context</span>`;
  }

  return routePathCodes.map((code, index) => `
    ${index > 0 ? `<span class="muted">-&gt;</span>` : ""}
    <span class="pill" data-dispatch-route-step="${escapeHtml(code)}">${escapeHtml(code)}</span>
  `).join("");
}

function describeRouteRibbon(routePathCodes: string[], itemCount: number): string {
  if (routePathCodes.length === 0) {
    return "No route context is available yet.";
  }

  return itemCount > 1
    ? `Route ribbon shows ${routePathCodes.length - 1} planned legs with intermediate stops in order.`
    : `Route ribbon shows the single planned leg from origin to destination.`;
}

function formatWindow(earliestStartUtc: string | undefined, deadlineUtc: string): string {
  return `${formatDate(earliestStartUtc ?? deadlineUtc)} - ${formatDate(deadlineUtc)}`;
}

function describeRoutePlanPackageSummary(
  payload: DispatchTabPayload,
  packageStartItem: DispatchTabPayload["workInputs"]["routePlanItems"][number],
  packageEndItem: DispatchTabPayload["workInputs"]["routePlanItems"][number],
): string {
  const endpointAirport = payload.workInputs.endpointAirport ?? packageEndItem.destinationAirport;
  return `Package context stays on ${packageStartItem.originAirport.code} -> ${endpointAirport.code}; selected-row detail stays below as stop-by-stop context.`;
}

function describeAcceptedContractPackageSummary(
  selectedContract: DispatchTabPayload["workInputs"]["acceptedContracts"][number],
): string {
  return `Single contract path keeps package context aligned with the selected row: ${selectedContract.originAirport.code} -> ${selectedContract.destinationAirport.code}.`;
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
