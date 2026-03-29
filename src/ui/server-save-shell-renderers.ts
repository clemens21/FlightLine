// @ts-nocheck

import { difficultyProfileOptions } from "../domain/save-runtime/difficulty-profile.js";

function formatDifficultyStartingCapital(amount) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    }).format(amount);
}

function renderCreateCompanyDifficultyChoices(escapeHtml) {
    return `<div class="choice-grid difficulty-choice-grid">${difficultyProfileOptions.map((option) => `<label class="choice-card difficulty-choice-card">
      <input
        type="radio"
        name="difficultyProfile"
        value="${escapeHtml(option.profile)}"
        ${option.profile === "hard" ? "checked" : ""}
      />
      <div class="choice-card-copy">
        <strong>${escapeHtml(option.label)}</strong>
        <span class="muted">${escapeHtml(formatDifficultyStartingCapital(option.startingCashAmount))} starting capital</span>
        <span class="muted">${escapeHtml(option.summary)}</span>
      </div>
    </label>`).join("")}</div>`;
}

export function createSaveShellRenderers(deps) {
    const {
        escapeHtml,
        formatMoney,
        formatDate,
        renderHiddenContext,
        renderBadge,
        renderRouteDisplay,
        formatPayload,
        saveRoute,
        renderOverviewFinanceSection,
        serializeJsonForScript,
        renderStaffingWorkspace,
    } = deps;

    const saveShellRenderers = {
        renderCreateCompany(saveId, tabId) {
            return `<section class="panel"><div class="panel-head"><h3>Create Company</h3></div><div class="panel-body"><form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/create-company" class="actions" data-api-form>${renderHiddenContext(saveId, tabId)}<div class="action-group"><label>Display Name<input name="displayName" value="FlightLine Regional" /></label><label>Starter Airport<input name="starterAirportId" value="KDEN" /></label></div><div class="summary-item"><div class="eyebrow">Difficulty</div><strong>Choose your startup profile</strong><div class="muted">Difficulty stays with the save and adjusts startup capital plus ongoing buy and hire prices.</div></div>${renderCreateCompanyDifficultyChoices(escapeHtml)}<button type="submit" data-pending-label="Creating company...">Create company</button></form></div></section>`;
        },
        renderOverview(saveId, tabId, source, airportRepo) {
            const company = source.companyContext;
            const fleet = source.fleetState?.aircraft ?? [];
            const contracts = source.companyContracts?.contracts ?? [];
            const schedules = source.schedules.filter((schedule) => schedule.scheduleState !== "completed");
            const idleCount = fleet.filter((aircraft) => aircraft.dispatchAvailable).length;
            const contractsLink = `<a class="button-link button-secondary" href="${saveRoute(saveId, { tab: "contracts" })}">Open contract board</a>`;
            const riskyContractsLink = `<a class="button-link button-secondary" href="${saveRoute(saveId, { tab: "contracts", contractsView: "my_contracts" })}">Open risky contracts</a>`;
            const riskyContracts = contracts.filter((contract) => {
                const hoursRemaining = (new Date(contract.deadlineUtc).getTime() - new Date(company.currentTimeUtc).getTime()) / 3_600_000;
                return ["accepted", "assigned", "active"].includes(contract.contractState) && hoursRemaining <= 24;
            }).length;
            void airportRepo;
            return `<div class="stack-column"><div class="view-grid two-up"><section class="panel"><div class="panel-head"><h3>Control Tower</h3></div><div class="panel-body"><div class="summary-list"><div class="summary-item"><div class="eyebrow">Company</div><strong>${escapeHtml(company.displayName)}</strong><div class="muted">${escapeHtml(company.companyPhase.replaceAll("_", " "))} | Tier ${company.progressionTier}</div></div><div class="summary-item"><div class="eyebrow">Fleet posture</div><strong>${idleCount}/${fleet.length}</strong><div class="muted">Dispatch-ready aircraft.</div></div><div class="summary-item"><div class="eyebrow">Schedule load</div><strong>${schedules.length}</strong><div class="muted">Draft and committed schedules currently visible.</div></div><div class="summary-item"><div class="eyebrow">Risky contracts</div><strong>${riskyContracts}</strong><div class="muted">Accepted work due in the next 24 hours.</div></div></div><div class="actions"><div class="action-group tight">${contractsLink}${riskyContractsLink}</div></div></div></section><section class="panel"><div class="panel-head"><h3>Execution Queue</h3></div><div class="panel-body">${contracts.length === 0 ? `<div class="empty-state">No accepted company contracts yet.</div>` : `<div class="summary-list">${contracts.slice(0, 6).map((contract) => `<div class="summary-item compact"><div class="meta-stack"><div class="pill-row">${renderBadge(contract.contractState)}</div><strong>${renderRouteDisplay(contract.originAirportId, contract.destinationAirportId)}</strong><span class="muted">${formatPayload(contract.volumeType, contract.passengerCount, contract.cargoWeightLb)} | due ${formatDate(contract.deadlineUtc)}</span></div></div>`).join("")}</div>`}</div></section></div>${renderOverviewFinanceSection(source.financeOverview, {
                escapeHtml,
                formatMoney,
                formatDate,
                renderBadge,
                serializeJsonForScript,
            })}</div>`;
        },
        renderAircraft(saveId, tabId, source, airportRepo) {
            void saveId;
            void tabId;
            void source;
            void airportRepo;
            return `<div class="aircraft-tab-main" data-aircraft-tab-host><section class="panel"><div class="panel-body"><div class="empty-state compact">Loading aircraft workspace...</div></div></section></div>`;
        },
        renderStaffing(saveId, tabId, source) {
            return renderStaffingWorkspace(saveId, tabId, source);
        },
        renderDispatch(saveId, tabId, source, airportRepo) {
            void saveId;
            void tabId;
            void source;
            void airportRepo;
            return `<div class="dispatch-tab-host" data-dispatch-tab-host><section class="panel"><div class="panel-body"><div class="empty-state compact">Loading dispatch workspace...</div></div></section></div>`;
        },
        renderActivity(source) {
            return `<section class="panel"><div class="panel-head"><h3>Recent Activity</h3></div><div class="panel-body">${!source.eventLog || source.eventLog.entries.length === 0 ? `<div class="empty-state">No event log entries yet.</div>` : `<div class="event-list">${source.eventLog.entries.map((entry) => `<div class="event-item"><div class="meta-stack"><div>${renderBadge(entry.severity ?? "info")} <strong>${escapeHtml(entry.message)}</strong></div><div class="muted">${formatDate(entry.eventTimeUtc)} | ${escapeHtml(entry.eventType)}</div></div></div>`).join("")}</div>`}</div></section>`;
        },
        renderContractsHost(saveId) {
            void saveId;
            return `<div class="contracts-host" data-contracts-host><section class="panel"><div class="panel-body"><div class="empty-state compact">Loading contracts board...</div></div></section></div>`;
        },
    };

    return {
        saveShellRenderers,
    };
}
