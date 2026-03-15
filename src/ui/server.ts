import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";

import {
  FlightLineBackend,
  type AircraftScheduleView,
  type CompanyContext,
  type CompanyContractsView,
  type ScheduleDraftLegPayload,
  type ContractBoardView,
  type EventLogView,
  type FleetStateView,
  type StaffingStateView,
} from "../index.js";
import { AircraftReferenceRepository } from "../infrastructure/reference/aircraft-reference.js";
import { AirportReferenceRepository } from "../infrastructure/reference/airport-reference.js";

const saveDirectoryPath = resolve(process.cwd(), "data", "saves");
const airportDatabasePath = resolve(process.cwd(), "data", "airports", "flightline-airports.sqlite");
const aircraftDatabasePath = resolve(process.cwd(), "data", "aircraft", "flightline-aircraft.sqlite");
const port = Number.parseInt(process.env.PORT ?? "4321", 10);
const turnaroundMinutes = 45;

const starterAircraftOptions = [
  { modelId: "cessna_208b_grand_caravan_ex_passenger", label: "Cessna Caravan Passenger", registrationPrefix: "N208" },
  { modelId: "cessna_208b_grand_caravan_ex_cargo", label: "Cessna Caravan Cargo", registrationPrefix: "N20C" },
  { modelId: "pilatus_pc12_ngx", label: "Pilatus PC-12 NGX", registrationPrefix: "N12P" },
  { modelId: "dhc6_twin_otter_300", label: "DHC-6 Twin Otter 300", registrationPrefix: "N6OT" },
] as const;

const staffingPresets = {
  utility_pilot: {
    label: "Utility Pilot Coverage",
    laborCategory: "pilot",
    qualificationGroup: "single_turboprop_utility",
    coverageUnits: 2,
    fixedCostAmount: 12000,
  },
  premium_single_pilot: {
    label: "Premium Single Pilot Coverage",
    laborCategory: "pilot",
    qualificationGroup: "single_turboprop_premium",
    coverageUnits: 1,
    fixedCostAmount: 14000,
  },
  utility_twin_pilot: {
    label: "Twin Utility Pilot Coverage",
    laborCategory: "pilot",
    qualificationGroup: "twin_turboprop_utility",
    coverageUnits: 2,
    fixedCostAmount: 18000,
  },
  commuter_twin_pilot: {
    label: "Commuter Twin Pilot Coverage",
    laborCategory: "pilot",
    qualificationGroup: "twin_turboprop_commuter",
    coverageUnits: 2,
    fixedCostAmount: 22000,
  },
  cabin_general: {
    label: "Cabin General Coverage",
    laborCategory: "flight_attendant",
    qualificationGroup: "cabin_general",
    coverageUnits: 1,
    fixedCostAmount: 6000,
  },
} as const;

type StaffingPresetKey = keyof typeof staffingPresets;

interface FlashState {
  notice?: string | undefined;
  error?: string | undefined;
}

interface SavePageModel {
  saveId: string;
  companyContext: CompanyContext | null;
  companyContracts: CompanyContractsView | null;
  contractBoard: ContractBoardView | null;
  fleetState: FleetStateView | null;
  staffingState: StaffingStateView | null;
  schedules: AircraftScheduleView[];
  eventLog: EventLogView | null;
}

const backend = await FlightLineBackend.create({
  saveDirectoryPath,
  airportDatabasePath,
  aircraftDatabasePath,
});
const airportReference = await AirportReferenceRepository.open(airportDatabasePath);
const aircraftReference = await AircraftReferenceRepository.open(aircraftDatabasePath);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(amount: number | undefined): string {
  if (amount === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function badgeClass(value: string): string {
  if (["critical", "failed", "blocked", "overdue"].includes(value)) {
    return "danger";
  }

  if (["warning", "late_completed", "assigned", "due_soon"].includes(value)) {
    return "warn";
  }

  if (["active", "in_flight", "scheduled"].includes(value)) {
    return "accent";
  }

  return "neutral";
}

function renderBadge(label: string): string {
  return `<span class="badge ${badgeClass(label)}">${escapeHtml(label.replaceAll("_", " "))}</span>`;
}

function addMinutesIso(utcIsoString: string, minutes: number): string {
  return new Date(new Date(utcIsoString).getTime() + minutes * 60_000).toISOString();
}

function addHoursIso(utcIsoString: string, hours: number): string {
  return addMinutesIso(utcIsoString, hours * 60);
}

function haversineDistanceNm(
  originLatitudeDeg: number,
  originLongitudeDeg: number,
  destinationLatitudeDeg: number,
  destinationLongitudeDeg: number,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusNm = 3440.065;
  const deltaLat = toRadians(destinationLatitudeDeg - originLatitudeDeg);
  const deltaLon = toRadians(destinationLongitudeDeg - originLongitudeDeg);
  const originLat = toRadians(originLatitudeDeg);
  const destinationLat = toRadians(destinationLatitudeDeg);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
    + Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

function estimateFlightMinutes(originAirportId: string, destinationAirportId: string, cruiseSpeedKtas: number): number {
  const origin = airportReference.findAirport(originAirportId);
  const destination = airportReference.findAirport(destinationAirportId);

  if (!origin || !destination) {
    throw new Error(`Could not resolve route ${originAirportId} to ${destinationAirportId}.`);
  }

  const distanceNm = haversineDistanceNm(
    origin.latitudeDeg,
    origin.longitudeDeg,
    destination.latitudeDeg,
    destination.longitudeDeg,
  );

  return Math.ceil((distanceNm / Math.max(cruiseSpeedKtas, 100)) * 60 + 30);
}

function commandId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function registrationFor(prefix: string): string {
  return `${prefix}${Math.floor(100 + Math.random() * 900)}`;
}

function saveRoute(saveId: string, flash: FlashState = {}): string {
  const search = new URLSearchParams();

  if (flash.notice) {
    search.set("notice", flash.notice);
  }

  if (flash.error) {
    search.set("error", flash.error);
  }

  const query = search.toString();
  return `/save/${encodeURIComponent(saveId)}${query ? `?${query}` : ""}`;
}

async function listSaveIds(): Promise<string[]> {
  try {
    const entries = await readdir(saveDirectoryPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sqlite"))
      .map((entry) => entry.name.replace(/\.sqlite$/i, ""))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

async function loadSavePageModel(saveId: string): Promise<SavePageModel> {
  const [companyContext, companyContracts, contractBoard, fleetState, staffingState, schedules, eventLog] = await Promise.all([
    backend.loadCompanyContext(saveId),
    backend.loadCompanyContracts(saveId),
    backend.loadActiveContractBoard(saveId),
    backend.loadFleetState(saveId),
    backend.loadStaffingState(saveId),
    backend.loadAircraftSchedules(saveId),
    backend.loadRecentEventLog(saveId, 14),
  ]);

  return {
    saveId,
    companyContext,
    companyContracts,
    contractBoard,
    fleetState,
    staffingState,
    schedules,
    eventLog,
  };
}
async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function redirect(response: ServerResponse, location: string): void {
  response.writeHead(303, { location });
  response.end();
}

function renderShell(title: string, saveIds: string[], currentSaveId: string | undefined, flash: FlashState, body: string): string {
  const saveLinks = saveIds.length > 0
    ? saveIds.map((saveId) => `<a class="save-link ${saveId === currentSaveId ? "current" : ""}" href="/save/${encodeURIComponent(saveId)}">${escapeHtml(saveId)}</a>`).join("")
    : `<div class="empty-state compact">No save slots yet.</div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #efe9de;
      --bg-alt: linear-gradient(160deg, rgba(250,244,234,.95), rgba(233,228,216,.88));
      --panel: rgba(255,255,255,.78);
      --panel-strong: rgba(255,255,255,.92);
      --text: #182126;
      --muted: #61707b;
      --line: rgba(24,33,38,.08);
      --accent: #0d6a77;
      --accent-soft: rgba(13,106,119,.12);
      --warn: #b36c18;
      --warn-soft: rgba(179,108,24,.14);
      --danger: #b03a2e;
      --danger-soft: rgba(176,58,46,.14);
      --shadow: 0 20px 50px rgba(28,33,40,.12);
    }
    body[data-theme="dark"] {
      color-scheme: dark;
      --bg: #0f1720;
      --bg-alt: radial-gradient(circle at top left, rgba(29,74,96,.32), transparent 34%), linear-gradient(180deg, rgba(15,23,32,.98), rgba(14,20,28,.98));
      --panel: rgba(20,29,40,.82);
      --panel-strong: rgba(17,25,35,.94);
      --text: #edf3f7;
      --muted: #8e9daa;
      --line: rgba(237,243,247,.08);
      --accent: #6fc9d4;
      --accent-soft: rgba(111,201,212,.12);
      --warn: #efb15f;
      --warn-soft: rgba(239,177,95,.12);
      --danger: #ef8c83;
      --danger-soft: rgba(239,140,131,.14);
      --shadow: 0 24px 60px rgba(0,0,0,.34);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg-alt);
      color: var(--text);
      font: 15px/1.45 Aptos, "Segoe UI Variable Text", "Trebuchet MS", sans-serif;
    }
    .app {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      min-height: 100vh;
    }
    .sidebar {
      padding: 28px 20px;
      border-right: 1px solid var(--line);
      background: rgba(255,255,255,.28);
      backdrop-filter: blur(18px);
    }
    body[data-theme="dark"] .sidebar { background: rgba(9,13,18,.52); }
    .brand { margin-bottom: 24px; }
    .eyebrow { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); }
    .brand h1 { margin: 8px 0 6px; font-size: 30px; line-height: 1; }
    .brand p { margin: 0; color: var(--muted); }
    .save-list { display: grid; gap: 8px; margin-bottom: 24px; }
    .save-link {
      display: block;
      padding: 11px 12px;
      border: 1px solid var(--line);
      border-radius: 14px;
      color: inherit;
      text-decoration: none;
      background: var(--panel);
    }
    .save-link.current { border-color: var(--accent); background: var(--accent-soft); }
    .main { padding: 28px; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
    .topbar h2 { margin: 0; font-size: 28px; }
    .topbar p { margin: 6px 0 0; color: var(--muted); }
    .theme-toggle, button, .button-link {
      appearance: none;
      border: 0;
      border-radius: 12px;
      padding: 10px 14px;
      background: var(--text);
      color: #fff;
      cursor: pointer;
      font: inherit;
      text-decoration: none;
    }
    body[data-theme="dark"] .theme-toggle, body[data-theme="dark"] button, body[data-theme="dark"] .button-link { color: #091018; background: var(--accent); }
    .button-secondary { background: transparent; color: var(--text); border: 1px solid var(--line); }
    .grid { display: grid; gap: 18px; }
    .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .panel {
      border: 1px solid var(--line);
      border-radius: 20px;
      background: var(--panel);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
      padding: 18px;
    }
    .panel h3 { margin: 0 0 12px; font-size: 17px; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
    .metric { padding: 16px; border-radius: 18px; background: var(--panel-strong); border: 1px solid var(--line); }
    .metric strong { display: block; font-size: 25px; margin-top: 6px; }
    .muted { color: var(--muted); }
    .flash { margin-bottom: 16px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); }
    .flash.notice { background: var(--accent-soft); border-color: rgba(13,106,119,.22); }
    .flash.error { background: var(--danger-soft); border-color: rgba(176,58,46,.24); }
    .actions { display: grid; gap: 12px; }
    .action-group { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
    form.inline { display: inline-flex; gap: 8px; align-items: end; flex-wrap: wrap; }
    label { display: grid; gap: 6px; font-size: 13px; color: var(--muted); min-width: 140px; }
    input, select {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
      color: var(--text);
      padding: 10px 12px;
      font: inherit;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 12px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .badge { display: inline-flex; padding: 4px 8px; border-radius: 999px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    .badge.neutral { background: rgba(127,127,127,.12); }
    .badge.accent { background: var(--accent-soft); color: var(--accent); }
    .badge.warn { background: var(--warn-soft); color: var(--warn); }
    .badge.danger { background: var(--danger-soft); color: var(--danger); }
    .route { font-weight: 600; }
    .meta-stack { display: grid; gap: 4px; }
    .event-list { display: grid; gap: 10px; }
    .event-item { padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--panel-strong); }
    .empty-state { padding: 18px; border: 1px dashed var(--line); border-radius: 16px; color: var(--muted); }
    .compact { padding: 12px; }
    @media (max-width: 1100px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { border-right: 0; border-bottom: 1px solid var(--line); }
      .metrics, .grid.two, .grid.three { grid-template-columns: 1fr; }
      .main { padding: 18px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="eyebrow">FlightLine Local Ops</div>
        <h1>FlightLine</h1>
        <p>Management UI on top of the local simulation backend.</p>
      </div>
      <div class="save-list">${saveLinks}</div>
      <a class="button-link button-secondary" href="/">Create or open save</a>
    </aside>
    <main class="main">
      <div class="topbar">
        <div>
          <div class="eyebrow">Operations Console</div>
          <h2>${escapeHtml(title)}</h2>
          <p>${currentSaveId ? `Save slot ${escapeHtml(currentSaveId)}` : "Bootstrap a save, then run the management loop from here."}</p>
        </div>
        <button class="theme-toggle" type="button" onclick="window.toggleTheme()">Toggle theme</button>
      </div>
      ${flash.notice ? `<div class="flash notice">${escapeHtml(flash.notice)}</div>` : ""}
      ${flash.error ? `<div class="flash error">${escapeHtml(flash.error)}</div>` : ""}
      ${body}
    </main>
  </div>
  <script>
    (() => {
      const key = 'flightline-theme';
      const root = document.body;
      const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const initial = localStorage.getItem(key) || preferred;
      root.dataset.theme = initial;
      window.toggleTheme = () => {
        const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
        root.dataset.theme = next;
        localStorage.setItem(key, next);
      };
    })();
  </script>
</body>
</html>`;
}

function renderHomePage(saveIds: string[], flash: FlashState): string {
  return renderShell(
    "Open or Create Save",
    saveIds,
    undefined,
    flash,
    `<div class="grid two">
      <section class="panel">
        <h3>Create Save</h3>
        <form method="post" action="/actions/create-save" class="actions">
          <label>Save Id
            <input name="saveId" placeholder="flightline_alpha" />
          </label>
          <label>World Seed
            <input name="worldSeed" value="flightline-alpha" />
          </label>
          <button type="submit">Create save</button>
        </form>
      </section>
      <section class="panel">
        <h3>What this UI covers</h3>
        <div class="meta-stack muted">
          <div>Create a save and company.</div>
          <div>Acquire starter aircraft and staffing.</div>
          <div>Refresh and accept contracts.</div>
          <div>Auto-plan, commit, and execute schedules.</div>
          <div>Advance time and inspect the resulting state.</div>
        </div>
      </section>
    </div>`,
  );
}
function renderSavePage(model: SavePageModel, saveIds: string[], flash: FlashState): string {
  if (!model.companyContext) {
    return renderShell(
      `Save ${model.saveId}`,
      saveIds,
      model.saveId,
      flash,
      `<section class="panel">
        <h3>Create Company</h3>
        <form method="post" action="/actions/create-company" class="actions">
          <input type="hidden" name="saveId" value="${escapeHtml(model.saveId)}" />
          <label>Display Name
            <input name="displayName" value="FlightLine Regional" />
          </label>
          <label>Starter Airport
            <input name="starterAirportId" value="KDEN" />
          </label>
          <label>Starting Cash
            <input name="startingCashAmount" value="3500000" />
          </label>
          <button type="submit">Create company</button>
        </form>
      </section>`,
    );
  }

  const company = model.companyContext;
  const fleet = model.fleetState?.aircraft ?? [];
  const contracts = model.companyContracts?.contracts ?? [];
  const offers = model.contractBoard?.offers ?? [];
  const schedules = model.schedules;
  const pilotOptions = fleet.map((aircraft) => `<option value="${escapeHtml(aircraft.aircraftId)}">${escapeHtml(aircraft.registration)} - ${escapeHtml(aircraft.modelDisplayName)} - ${escapeHtml(aircraft.currentAirportId)}</option>`).join("");

  const metrics = `<div class="metrics">
    <div class="metric"><div class="eyebrow">Cash</div><strong>${formatMoney(company.currentCashAmount)}</strong><div class="muted">${escapeHtml(company.financialPressureBand)}</div></div>
    <div class="metric"><div class="eyebrow">Clock</div><strong>${escapeHtml(formatDate(company.currentTimeUtc))}</strong><div class="muted">Home ${escapeHtml(company.homeBaseAirportId)}</div></div>
    <div class="metric"><div class="eyebrow">Fleet</div><strong>${fleet.length}</strong><div class="muted">${model.fleetState?.dispatchAvailableCount ?? 0} dispatchable</div></div>
    <div class="metric"><div class="eyebrow">Contracts</div><strong>${company.activeContractCount}</strong><div class="muted">${offers.filter((offer) => offer.offerStatus === "available").length} offers live</div></div>
  </div>`;

  const quickActions = `<section class="panel">
    <h3>Quick Actions</h3>
    <div class="actions">
      <div class="action-group">
        <form method="post" action="/actions/refresh-contract-board" class="inline">
          <input type="hidden" name="saveId" value="${escapeHtml(model.saveId)}" />
          <button type="submit">Refresh contract board</button>
        </form>
        <form method="post" action="/actions/advance-time" class="inline">
          <input type="hidden" name="saveId" value="${escapeHtml(model.saveId)}" />
          <label>Hours
            <input name="hours" type="number" min="1" value="24" />
          </label>
          <label>Stop Mode
            <select name="stopMode">
              <option value="target_time">Target time</option>
              <option value="leg_completed">Until leg completed</option>
            </select>
          </label>
          <button type="submit">Advance time</button>
        </form>
      </div>
      <div class="action-group">
        <form method="post" action="/actions/acquire-aircraft" class="inline">
          <input type="hidden" name="saveId" value="${escapeHtml(model.saveId)}" />
          <label>Starter Aircraft
            <select name="aircraftModelId">${starterAircraftOptions.map((option) => `<option value="${option.modelId}">${escapeHtml(option.label)}</option>`).join("")}</select>
          </label>
          <button type="submit">Acquire aircraft</button>
        </form>
      </div>
      <div class="action-group">
        ${Object.entries(staffingPresets).map(([presetKey, preset]) => `<form method="post" action="/actions/add-staffing" class="inline"><input type="hidden" name="saveId" value="${escapeHtml(model.saveId)}" /><input type="hidden" name="presetKey" value="${escapeHtml(presetKey)}" /><button type="submit">${escapeHtml(preset.label)}</button></form>`).join("")}
      </div>
    </div>
  </section>`;

  const offersSection = `<section class="panel">
    <h3>Contract Board</h3>
    ${offers.length === 0 ? `<div class="empty-state">No active contract board yet. Refresh it from Quick Actions.</div>` : `<table><thead><tr><th>Route</th><th>Payload</th><th>Window</th><th>Payout</th><th>Status</th><th></th></tr></thead><tbody>${offers.slice(0, 12).map((offer) => `<tr><td><div class="meta-stack"><span class="route">${escapeHtml(offer.originAirportId)} -> ${escapeHtml(offer.destinationAirportId)}</span><span class="muted">${escapeHtml(offer.archetype)}</span></div></td><td>${offer.volumeType === "cargo" ? `${offer.cargoWeightLb ?? 0} lb cargo` : `${offer.passengerCount ?? 0} pax`}</td><td><div class="meta-stack"><span>${escapeHtml(formatDate(offer.earliestStartUtc))}</span><span class="muted">due ${escapeHtml(formatDate(offer.latestCompletionUtc))}</span></div></td><td>${formatMoney(offer.payoutAmount)}</td><td>${renderBadge(offer.offerStatus)}</td><td>${offer.offerStatus === "available" ? `<form method="post" action="/actions/accept-contract" class="inline"><input type="hidden" name="saveId" value="${escapeHtml(model.saveId)}" /><input type="hidden" name="contractOfferId" value="${escapeHtml(offer.contractOfferId)}" /><button type="submit">Accept</button></form>` : ""}</td></tr>`).join("")}</tbody></table>`}
  </section>`;

  const contractsSection = `<section class="panel">
    <h3>Company Contracts</h3>
    ${contracts.length === 0 ? `<div class="empty-state">No accepted company contracts yet.</div>` : `<table><thead><tr><th>State</th><th>Route</th><th>Payload</th><th>Deadline</th><th>Assigned</th><th></th></tr></thead><tbody>${contracts.map((contract) => `<tr><td>${renderBadge(contract.contractState)}</td><td><div class="meta-stack"><span class="route">${escapeHtml(contract.originAirportId)} -> ${escapeHtml(contract.destinationAirportId)}</span><span class="muted">${formatMoney(contract.acceptedPayoutAmount)}</span></div></td><td>${contract.volumeType === "cargo" ? `${contract.cargoWeightLb ?? 0} lb cargo` : `${contract.passengerCount ?? 0} pax`}</td><td><div class="meta-stack"><span>${escapeHtml(formatDate(contract.deadlineUtc))}</span><span class="muted">earliest ${escapeHtml(formatDate(contract.earliestStartUtc))}</span></div></td><td>${contract.assignedAircraftId ? escapeHtml(contract.assignedAircraftId) : `<span class="muted">Unassigned</span>`}</td><td>${fleet.length > 0 && ["accepted", "assigned"].includes(contract.contractState) ? `<form method="post" action="/actions/auto-plan-contract" class="inline"><input type="hidden" name="saveId" value="${escapeHtml(model.saveId)}" /><input type="hidden" name="companyContractId" value="${escapeHtml(contract.companyContractId)}" /><label>Aircraft<select name="aircraftId">${pilotOptions}</select></label><button type="submit">Auto-plan</button></form>` : ""}</td></tr>`).join("")}</tbody></table>`}
  </section>`;

  const fleetSection = `<section class="panel">
    <h3>Fleet</h3>
    ${fleet.length === 0 ? `<div class="empty-state">No aircraft in the fleet yet.</div>` : `<table><thead><tr><th>Aircraft</th><th>Status</th><th>Location</th><th>Capability</th></tr></thead><tbody>${fleet.map((aircraft) => `<tr><td><div class="meta-stack"><span class="route">${escapeHtml(aircraft.registration)}</span><span class="muted">${escapeHtml(aircraft.modelDisplayName)}</span></div></td><td><div class="meta-stack">${renderBadge(aircraft.statusInput)}<span class="muted">dispatch ${aircraft.dispatchAvailable ? "yes" : "no"}</span></div></td><td>${escapeHtml(aircraft.currentAirportId)}</td><td><div class="meta-stack"><span>${aircraft.maxPassengers} pax / ${aircraft.maxCargoLb} lb</span><span class="muted">${aircraft.pilotQualificationGroup}</span></div></td></tr>`).join("")}</tbody></table>`}
  </section>`;

  const staffingSection = `<section class="panel">
    <h3>Staffing</h3>
    ${!model.staffingState || model.staffingState.staffingPackages.length === 0 ? `<div class="empty-state">No staffing packages are active yet.</div>` : `<table><thead><tr><th>Category</th><th>Qualification</th><th>Coverage</th><th>Fixed Cost</th></tr></thead><tbody>${model.staffingState.coverageSummaries.map((summary) => `<tr><td>${escapeHtml(summary.laborCategory)}</td><td>${escapeHtml(summary.qualificationGroup)}</td><td>${summary.activeCoverageUnits}</td><td>${formatMoney(model.staffingState?.staffingPackages.filter((entry) => entry.qualificationGroup === summary.qualificationGroup && entry.laborCategory === summary.laborCategory).reduce((sum, entry) => sum + entry.fixedCostAmount, 0))}</td></tr>`).join("")}</tbody></table>`}
  </section>`;

  const schedulesSection = `<section class="panel">
    <h3>Schedules</h3>
    ${schedules.length === 0 ? `<div class="empty-state">No schedules yet.</div>` : `<table><thead><tr><th>Schedule</th><th>State</th><th>Legs</th><th></th></tr></thead><tbody>${schedules.map((schedule) => `<tr><td><div class="meta-stack"><span class="route">${escapeHtml(schedule.scheduleId)}</span><span class="muted">${escapeHtml(schedule.aircraftId)}</span></div></td><td>${renderBadge(schedule.isDraft ? "draft" : schedule.scheduleState)}</td><td><div class="meta-stack">${schedule.legs.map((leg) => `<span>${leg.sequenceNumber}. ${escapeHtml(leg.originAirportId)} -> ${escapeHtml(leg.destinationAirportId)} <span class="muted">${escapeHtml(leg.legState)}</span></span>`).join("")}</div></td><td>${schedule.isDraft ? `<form method="post" action="/actions/commit-schedule" class="inline"><input type="hidden" name="saveId" value="${escapeHtml(model.saveId)}" /><input type="hidden" name="scheduleId" value="${escapeHtml(schedule.scheduleId)}" /><button type="submit">Commit</button></form>` : ""}</td></tr>`).join("")}</tbody></table>`}
  </section>`;

  const eventsSection = `<section class="panel">
    <h3>Recent Activity</h3>
    ${!model.eventLog || model.eventLog.entries.length === 0 ? `<div class="empty-state">No event log entries yet.</div>` : `<div class="event-list">${model.eventLog.entries.map((entry) => `<div class="event-item"><div class="meta-stack"><div>${entry.severity ? renderBadge(entry.severity) : ""} <strong>${escapeHtml(entry.message)}</strong></div><div class="muted">${escapeHtml(formatDate(entry.eventTimeUtc))} - ${escapeHtml(entry.eventType)}</div></div></div>`).join("")}</div>`}
  </section>`;

  return renderShell(
    company.displayName,
    saveIds,
    model.saveId,
    flash,
    `${metrics}<div class="grid two">${quickActions}${offersSection}</div><div class="grid two">${contractsSection}${schedulesSection}</div><div class="grid two">${fleetSection}${staffingSection}</div>${eventsSection}`,
  );
}
async function handleCreateSave(response: ServerResponse, form: URLSearchParams): Promise<void> {
  const saveId = (form.get("saveId")?.trim() || `save_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_");
  const worldSeed = form.get("worldSeed")?.trim() || randomUUID();
  const result = await backend.dispatch({
    commandId: commandId("cmd_save"),
    saveId,
    commandName: "CreateSaveGame",
    issuedAtUtc: new Date().toISOString(),
    actorType: "player",
    payload: {
      worldSeed,
      difficultyProfile: "standard",
      startTimeUtc: new Date().toISOString(),
    },
  });

  redirect(response, result.success ? saveRoute(saveId, { notice: `Created save ${saveId}.` }) : `/?error=${encodeURIComponent(result.hardBlockers[0] ?? "Could not create save.")}`);
}

async function handleCreateCompany(response: ServerResponse, form: URLSearchParams): Promise<void> {
  const saveId = form.get("saveId") ?? "";
  const result = await backend.dispatch({
    commandId: commandId("cmd_company"),
    saveId,
    commandName: "CreateCompany",
    issuedAtUtc: new Date().toISOString(),
    actorType: "player",
    payload: {
      displayName: form.get("displayName")?.trim() || "FlightLine Regional",
      starterAirportId: form.get("starterAirportId")?.trim().toUpperCase() || "KDEN",
      startingCashAmount: Number.parseInt(form.get("startingCashAmount") ?? "3500000", 10),
    },
  });

  redirect(response, saveRoute(saveId, result.success ? { notice: `Created company ${form.get("displayName") ?? "FlightLine Regional"}.` } : { error: result.hardBlockers[0] ?? "Could not create company." }));
}

async function handleAcquireAircraft(response: ServerResponse, form: URLSearchParams): Promise<void> {
  const saveId = form.get("saveId") ?? "";
  const company = await backend.loadCompanyContext(saveId);
  const selectedOption = starterAircraftOptions.find((option) => option.modelId === form.get("aircraftModelId")) ?? starterAircraftOptions[0];
  const result = await backend.dispatch({
    commandId: commandId("cmd_acquire"),
    saveId,
    commandName: "AcquireAircraft",
    issuedAtUtc: new Date().toISOString(),
    actorType: "player",
    payload: {
      aircraftModelId: selectedOption.modelId,
      deliveryAirportId: company?.homeBaseAirportId ?? "KDEN",
      ownershipType: "owned",
      registration: registrationFor(selectedOption.registrationPrefix),
    },
  });

  redirect(response, saveRoute(saveId, result.success ? { notice: `Acquired ${selectedOption.label}.` } : { error: result.hardBlockers[0] ?? "Could not acquire aircraft." }));
}

async function handleAddStaffing(response: ServerResponse, form: URLSearchParams): Promise<void> {
  const saveId = form.get("saveId") ?? "";
  const presetKey = form.get("presetKey") as StaffingPresetKey | null;
  const preset = presetKey ? staffingPresets[presetKey] : null;

  if (!preset) {
    redirect(response, saveRoute(saveId, { error: "Unknown staffing preset." }));
    return;
  }

  const result = await backend.dispatch({
    commandId: commandId("cmd_staffing"),
    saveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: new Date().toISOString(),
    actorType: "player",
    payload: {
      laborCategory: preset.laborCategory,
      employmentModel: "direct_hire",
      qualificationGroup: preset.qualificationGroup,
      coverageUnits: preset.coverageUnits,
      fixedCostAmount: preset.fixedCostAmount,
    },
  });

  redirect(response, saveRoute(saveId, result.success ? { notice: `Activated ${preset.label}.` } : { error: result.hardBlockers[0] ?? "Could not add staffing." }));
}

async function handleRefreshContractBoard(response: ServerResponse, form: URLSearchParams): Promise<void> {
  const saveId = form.get("saveId") ?? "";
  const result = await backend.dispatch({
    commandId: commandId("cmd_refresh"),
    saveId,
    commandName: "RefreshContractBoard",
    issuedAtUtc: new Date().toISOString(),
    actorType: "player",
    payload: { refreshReason: "manual" },
  });

  redirect(response, saveRoute(saveId, result.success ? { notice: "Refreshed contract board." } : { error: result.hardBlockers[0] ?? "Could not refresh contract board." }));
}

async function handleAcceptContract(response: ServerResponse, form: URLSearchParams): Promise<void> {
  const saveId = form.get("saveId") ?? "";
  const contractOfferId = form.get("contractOfferId") ?? "";
  const result = await backend.dispatch({
    commandId: commandId("cmd_accept"),
    saveId,
    commandName: "AcceptContractOffer",
    issuedAtUtc: new Date().toISOString(),
    actorType: "player",
    payload: { contractOfferId },
  });

  redirect(response, saveRoute(saveId, result.success ? { notice: `Accepted contract offer ${contractOfferId}.` } : { error: result.hardBlockers[0] ?? "Could not accept contract." }));
}

async function handleAutoPlanContract(response: ServerResponse, form: URLSearchParams): Promise<void> {
  const saveId = form.get("saveId") ?? "";
  const companyContractId = form.get("companyContractId") ?? "";
  const aircraftId = form.get("aircraftId") ?? "";
  const [companyContext, companyContracts, fleetState] = await Promise.all([
    backend.loadCompanyContext(saveId),
    backend.loadCompanyContracts(saveId),
    backend.loadFleetState(saveId),
  ]);

  const contract = companyContracts?.contracts.find((entry) => entry.companyContractId === companyContractId);
  const aircraft = fleetState?.aircraft.find((entry) => entry.aircraftId === aircraftId);
  const aircraftModel = aircraft ? aircraftReference.findModel(aircraft.aircraftModelId) : null;

  if (!companyContext || !contract || !aircraft || !aircraftModel) {
    redirect(response, saveRoute(saveId, { error: "Could not resolve the contract or aircraft for auto-planning." }));
    return;
  }

  try {
    const earliestStart = contract.earliestStartUtc && contract.earliestStartUtc > companyContext.currentTimeUtc
      ? contract.earliestStartUtc
      : companyContext.currentTimeUtc;
    const legs: ScheduleDraftLegPayload[] = [];
    let cursorTime = companyContext.currentTimeUtc;

    if (aircraft.currentAirportId !== contract.originAirportId) {
      const repositionArrival = addMinutesIso(cursorTime, estimateFlightMinutes(aircraft.currentAirportId, contract.originAirportId, aircraftModel.cruiseSpeedKtas));
      legs.push({
        legType: "reposition",
        originAirportId: aircraft.currentAirportId,
        destinationAirportId: contract.originAirportId,
        plannedDepartureUtc: cursorTime,
        plannedArrivalUtc: repositionArrival,
      });
      cursorTime = addMinutesIso(repositionArrival, turnaroundMinutes);
    }

    const contractDeparture = cursorTime > earliestStart ? cursorTime : earliestStart;
    const contractArrival = addMinutesIso(contractDeparture, estimateFlightMinutes(contract.originAirportId, contract.destinationAirportId, aircraftModel.cruiseSpeedKtas));

    if (contractArrival > contract.deadlineUtc) {
      redirect(response, saveRoute(saveId, { error: "Auto-plan would miss the contract deadline for this aircraft." }));
      return;
    }

    legs.push({
      legType: "contract_flight",
      linkedCompanyContractId: contract.companyContractId,
      originAirportId: contract.originAirportId,
      destinationAirportId: contract.destinationAirportId,
      plannedDepartureUtc: contractDeparture,
      plannedArrivalUtc: contractArrival,
    });

    const result = await backend.dispatch({
      commandId: commandId("cmd_draft"),
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: new Date().toISOString(),
      actorType: "player",
      payload: {
        aircraftId,
        scheduleKind: "operational",
        legs,
      },
    });

    const flash = result.hardBlockers.length > 0
      ? { error: result.hardBlockers[0] }
      : { notice: `Drafted schedule ${String(result.metadata?.scheduleId ?? "")}.` };
    redirect(response, saveRoute(saveId, flash));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto-plan failed.";
    redirect(response, saveRoute(saveId, { error: message }));
  }
}

async function handleCommitSchedule(response: ServerResponse, form: URLSearchParams): Promise<void> {
  const saveId = form.get("saveId") ?? "";
  const scheduleId = form.get("scheduleId") ?? "";
  const result = await backend.dispatch({
    commandId: commandId("cmd_commit"),
    saveId,
    commandName: "CommitAircraftSchedule",
    issuedAtUtc: new Date().toISOString(),
    actorType: "player",
    payload: { scheduleId },
  });

  redirect(
    response,
    saveRoute(
      saveId,
      result.success
        ? { notice: `Committed schedule ${scheduleId}.` }
        : { error: result.hardBlockers[0] ?? "Could not commit schedule." },
    ),
  );
}

async function handleAdvanceTime(response: ServerResponse, form: URLSearchParams): Promise<void> {
  const saveId = form.get("saveId") ?? "";
  const companyContext = await backend.loadCompanyContext(saveId);

  if (!companyContext) {
    redirect(response, saveRoute(saveId, { error: "Could not load the save company context." }));
    return;
  }

  const requestedHours = Number.parseInt(form.get("hours") ?? "24", 10);
  const hours = Number.isNaN(requestedHours) ? 24 : Math.max(1, Math.min(requestedHours, 24 * 14));
  const stopMode = form.get("stopMode") === "leg_completed" ? "leg_completed" : "target_time";
  const targetTimeUtc = addHoursIso(companyContext.currentTimeUtc, hours);

  const result = await backend.dispatch({
    commandId: commandId("cmd_advance"),
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: new Date().toISOString(),
    actorType: "player",
    payload: {
      targetTimeUtc,
      stopConditions: stopMode === "leg_completed" ? ["leg_completed"] : ["target_time"],
    },
  });

  const notice = result.success
    ? `Advanced time to ${String(result.metadata?.advancedToUtc ?? targetTimeUtc)} (${String(result.metadata?.stoppedBecause ?? "target_time")}).`
    : undefined;
  const error = result.success ? undefined : (result.hardBlockers[0] ?? "Could not advance time.");

  redirect(response, saveRoute(saveId, { notice, error }));
}

const actionHandlers: Record<string, (response: ServerResponse, form: URLSearchParams) => Promise<void>> = {
  "/actions/create-save": handleCreateSave,
  "/actions/create-company": handleCreateCompany,
  "/actions/acquire-aircraft": handleAcquireAircraft,
  "/actions/add-staffing": handleAddStaffing,
  "/actions/refresh-contract-board": handleRefreshContractBoard,
  "/actions/accept-contract": handleAcceptContract,
  "/actions/auto-plan-contract": handleAutoPlanContract,
  "/actions/commit-schedule": handleCommitSchedule,
  "/actions/advance-time": handleAdvanceTime,
};

function readFlashState(url: URL): FlashState {
  const notice = url.searchParams.get("notice") ?? undefined;
  const error = url.searchParams.get("error") ?? undefined;
  return { notice, error };
}

function sendNotFound(response: ServerResponse, saveIds: string[], message: string): void {
  response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
  response.end(renderShell("Not Found", saveIds, undefined, { error: message }, `<div class="empty-state">${escapeHtml(message)}</div>`));
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? `localhost:${port}`}`);
  const pathname = requestUrl.pathname;
  const flash = readFlashState(requestUrl);

  if (request.method === "GET" && pathname === "/") {
    const saveIds = await listSaveIds();
    sendHtml(response, renderHomePage(saveIds, flash));
    return;
  }

  if (request.method === "GET" && pathname.startsWith("/save/")) {
    const saveIds = await listSaveIds();
    const saveId = decodeURIComponent(pathname.slice("/save/".length));

    if (!saveId || !saveIds.includes(saveId)) {
      sendNotFound(response, saveIds, `Save ${saveId || "(missing)"} was not found.`);
      return;
    }

    const model = await loadSavePageModel(saveId);
    sendHtml(response, renderSavePage(model, saveIds, flash));
    return;
  }

  if (request.method === "POST") {
    const actionHandler = actionHandlers[pathname];

    if (!actionHandler) {
      const saveIds = await listSaveIds();
      sendNotFound(response, saveIds, `Unknown action ${pathname}.`);
      return;
    }

    const form = await readForm(request);
    await actionHandler(response, form);
    return;
  }

  const saveIds = await listSaveIds();
  sendNotFound(response, saveIds, `No route matched ${pathname}.`);
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch(async (error) => {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    console.error("FlightLine UI request failed:", error);

    response.writeHead(500, { "content-type": "text/html; charset=utf-8" });
    response.end(
      renderShell(
        "Server Error",
        await listSaveIds(),
        undefined,
        { error: message },
        `<div class="empty-state">The local UI hit an unexpected error. Check the terminal for details.</div>`,
      ),
    );
  });
});

let shuttingDown = false;

async function closeServer(): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  await new Promise<void>((resolveClose) => {
    server.close(() => resolveClose());
  });

  await Promise.allSettled([
    backend.close(),
    airportReference.close(),
    aircraftReference.close(),
  ]);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void closeServer().finally(() => process.exit(0));
  });
}

process.on("uncaughtException", (error) => {
  console.error("FlightLine UI uncaught exception:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("FlightLine UI unhandled rejection:", error);
});

await new Promise<void>((resolveListen) => {
  server.listen(port, () => resolveListen());
});

console.log(`FlightLine UI running at http://localhost:${port}`);