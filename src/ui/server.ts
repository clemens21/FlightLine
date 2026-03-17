// @ts-nocheck
/*
 * Implements the local UI server, its HTML render paths, and its JSON/form action endpoints.
 * This is the largest orchestration file in the project because it connects launcher flows, shell pages, and API routes in one place.
 * A useful way to read it is in layers: static asset routing first, launcher/save-opening HTML second, then API/tab/action routes,
 * all of which translate browser requests into backend-service calls and UI payload builders.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { FlightLineBackend, } from "../index.js";
import { AircraftReferenceRepository } from "../infrastructure/reference/aircraft-reference.js";
import { AirportReferenceRepository } from "../infrastructure/reference/airport-reference.js";
import { deleteSaveFile, isValidSaveId, listSaveIds as listSaveSlotIds, resolveRequestedSaveId } from "./save-slot-files.js";
import { loadContractsViewPayload } from "./contracts-view.js";
import { buildBootstrapPayload, buildTabPayload, normalizeTab as normalizeShellTab } from "./save-shell-fragments.js";
import { loadClockPanelPayload, resolveCalendarAnchorUtc } from "./clock-calendar.js";
import { acceptRoutePlanOffers } from "./route-plan-accept.js";
import { bindRoutePlanToAircraft } from "./route-plan-dispatch.js";
import { addAcceptedContractToRoutePlan, addCandidateOfferToRoutePlan, clearRoutePlan, removeRoutePlanItem, reorderRoutePlanItem, } from "./route-plan-state.js";
import { renderSaveOpeningPage } from "./save-opening-page.js";
import { renderIncrementalSavePage } from "./save-shell-page.js";
import { resolveAircraftImageAsset } from "./aircraft-image-cache.js";
// Process-wide resources are initialized once because every request shares the same backend and the same reference catalogs.
const port = Number.parseInt(process.env.PORT ?? "4321", 10);
const turnaroundMinutes = 45;
const saveDirectoryPath = resolve(process.cwd(), "data", "saves");
const airportDatabasePath = resolve(process.cwd(), "data", "airports", "flightline-airports.sqlite");
const contractsTabClientAssetUrl = new URL("./public/contracts-tab-client.js", import.meta.url);
const aircraftTabClientAssetUrl = new URL("./public/aircraft-tab-client.js", import.meta.url);
const aircraftDatabasePath = resolve(process.cwd(), "data", "aircraft", "flightline-aircraft.sqlite");
const openSaveClientAssetUrl = new URL("./public/open-save-client.js", import.meta.url);
const saveShellClientAssetUrl = new URL("./public/save-shell-client.js", import.meta.url);
const uiBrowserModuleAssetUrls = new Map<string, URL>([
    ["aircraft-image-sources", new URL("./aircraft-image-sources.js", import.meta.url)],
    ["aircraft-tab-model", new URL("./aircraft-tab-model.js", import.meta.url)],
    ["clock-calendar-model", new URL("./clock-calendar-model.js", import.meta.url)],
    ["contracts-view-model", new URL("./contracts-view-model.js", import.meta.url)],
    ["save-shell-model", new URL("./save-shell-model.js", import.meta.url)],
]);
const assetVersion = Date.now().toString(36);
const contractsTabClientAssetPath = `/assets/contracts-tab-client.js?v=${assetVersion}`;
const aircraftTabClientAssetPath = `/assets/aircraft-tab-client.js?v=${assetVersion}`;
const openSaveClientAssetPath = `/assets/open-save-client.js?v=${assetVersion}`;
const saveShellClientAssetPath = `/assets/save-shell-client.js?v=${assetVersion}`;
const saveTabs = [
    { id: "dashboard", label: "Overview" },
    { id: "contracts", label: "Contracts" },
    { id: "aircraft", label: "Aircraft" },
    { id: "staffing", label: "Staff" },
    { id: "dispatch", label: "Dispatch" },
    { id: "activity", label: "Activity" },
];
const starterAircraftOptions = [
    { modelId: "cessna_208b_grand_caravan_ex_passenger", label: "Cessna Caravan Passenger", registrationPrefix: "N208" },
    { modelId: "cessna_208b_grand_caravan_ex_cargo", label: "Cessna Caravan Cargo", registrationPrefix: "N20C" },
    { modelId: "pilatus_pc12_ngx", label: "Pilatus PC-12 NGX", registrationPrefix: "N12P" },
    { modelId: "dhc6_twin_otter_300", label: "DHC-6 Twin Otter 300", registrationPrefix: "N6OT" },
];
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
};
const backend = await FlightLineBackend.create({
    saveDirectoryPath,
    airportDatabasePath,
    aircraftDatabasePath,
});
const airportReference = await AirportReferenceRepository.open(airportDatabasePath);
const aircraftReference = await AircraftReferenceRepository.open(aircraftDatabasePath);
// Small formatting helpers keep the large template strings below readable.
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
function formatMoney(amount) {
    if (amount === undefined) {
        return "-";
    }
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    }).format(amount);
}
function formatDate(value) {
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
function formatNumber(value) {
    if (value === undefined) {
        return "-";
    }
    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
    }).format(value);
}
function formatPercent(value, digits = 0) {
    if (value === undefined) {
        return "-";
    }
    return `${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(value)}%`;
}
function formatAirportSize(size) {
    return size ? `Size ${size}` : "-";
}
function hoursUntil(currentTimeUtc, futureTimeUtc) {
    return (new Date(futureTimeUtc).getTime() - new Date(currentTimeUtc).getTime()) / 3_600_000;
}
function describeAirport(airportId) {
    const airport = airportReference.findAirport(airportId);
    if (!airport) {
        return {
            code: airportId,
            primaryLabel: airportId,
            secondaryLabel: undefined,
        };
    }
    const locationLabel = airport.municipality ?? airport.name;
    const secondaryParts = [
        airport.name !== locationLabel ? airport.name : undefined,
        airport.isoCountry,
    ].filter((part) => Boolean(part));
    return {
        code: airport.identCode || airport.airportKey,
        primaryLabel: locationLabel,
        secondaryLabel: secondaryParts.length > 0 ? secondaryParts.join(" | ") : undefined,
    };
}
function renderAirportDisplay(airportId) {
    const airport = describeAirport(airportId);
    return `<div class="meta-stack"><span class="route">${escapeHtml(airport.code)} | ${escapeHtml(airport.primaryLabel)}</span>${airport.secondaryLabel ? `<span class="muted">${escapeHtml(airport.secondaryLabel)}</span>` : ""}</div>`;
}
function renderRouteDisplay(originAirportId, destinationAirportId) {
    const origin = describeAirport(originAirportId);
    const destination = describeAirport(destinationAirportId);
    return `<div class="meta-stack"><span class="route">${escapeHtml(origin.code)} -> ${escapeHtml(destination.code)}</span><span class="muted">${escapeHtml(origin.primaryLabel)} to ${escapeHtml(destination.primaryLabel)}</span></div>`;
}
function formatPayload(volumeType, passengerCount, cargoWeightLb) {
    return volumeType === "cargo"
        ? `${formatNumber(cargoWeightLb)} lb cargo`
        : `${formatNumber(passengerCount)} pax`;
}
function describeContractsViewRoute(contract) {
    return `${contract.origin.code} - ${contract.origin.name} to ${contract.destination.code} - ${contract.destination.name} (${formatPayload(contract.volumeType, contract.passengerCount, contract.cargoWeightLb)})`;
}
function getMetadataString(result, key) {
    const value = result.metadata?.[key];
    return typeof value === "string" ? value : undefined;
}
function buildAcceptedContractMessage(payload, result, contractOfferId) {
    const companyContractId = getMetadataString(result, "companyContractId");
    const contract = companyContractId ? payload.companyContracts.find((entry) => entry.companyContractId === companyContractId) : undefined;
    return contract ? `Accepted ${describeContractsViewRoute(contract)}.` : `Accepted contract offer ${contractOfferId}.`;
}
function buildCancelledContractMessage(payload, result, companyContractId) {
    const contractId = getMetadataString(result, "companyContractId") ?? companyContractId;
    const contract = payload.companyContracts.find((entry) => entry.companyContractId === contractId);
    return contract ? `Cancelled ${describeContractsViewRoute(contract)} for ${formatMoney(contract.cancellationPenaltyAmount)} penalty.` : `Cancelled contract ${companyContractId}.`;
}
function renderContextRail(cards) {
    return `<section class="context-rail">${cards.map((card) => `<div class="context-card ${card.tone ?? "neutral"}"><div class="eyebrow">${escapeHtml(card.label)}</div><strong>${escapeHtml(card.value)}</strong><span class="muted">${escapeHtml(card.detail)}</span></div>`).join("")}</section>`;
}
function badgeClass(value) {
    if (["critical", "failed", "blocked", "overdue", "confirmed_unavailable"].includes(value)) {
        return "danger";
    }
    if (["warning", "late_completed", "assigned", "due_soon", "not_verified"].includes(value)) {
        return "warn";
    }
    if (["active", "in_flight", "scheduled", "confirmed_available", "opportunity"].includes(value)) {
        return "accent";
    }
    return "neutral";
}
function renderBadge(label) {
    return `<span class="badge ${badgeClass(label)}">${escapeHtml(label.replaceAll("_", " "))}</span>`;
}
function renderTabInput(tab) {
    return `<input type="hidden" name="tab" value="${escapeHtml(tab)}" />`;
}
function normalizeTab(rawValue) {
    return saveTabs.some((tab) => tab.id === rawValue) ? rawValue : "dashboard";
}
function addMinutesIso(utcIsoString, minutes) {
    return new Date(new Date(utcIsoString).getTime() + minutes * 60_000).toISOString();
}
function addHoursIso(utcIsoString, hours) {
    return addMinutesIso(utcIsoString, hours * 60);
}
function haversineDistanceNm(originLatitudeDeg, originLongitudeDeg, destinationLatitudeDeg, destinationLongitudeDeg) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const earthRadiusNm = 3440.065;
    const deltaLat = toRadians(destinationLatitudeDeg - originLatitudeDeg);
    const deltaLon = toRadians(destinationLongitudeDeg - originLongitudeDeg);
    const originLat = toRadians(originLatitudeDeg);
    const destinationLat = toRadians(destinationLatitudeDeg);
    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
        + Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusNm * c;
}
function estimateFlightMinutes(originAirportId, destinationAirportId, cruiseSpeedKtas) {
    const origin = airportReference.findAirport(originAirportId);
    const destination = airportReference.findAirport(destinationAirportId);
    if (!origin || !destination) {
        throw new Error(`Could not resolve route ${originAirportId} to ${destinationAirportId}.`);
    }
    const distanceNm = haversineDistanceNm(origin.latitudeDeg, origin.longitudeDeg, destination.latitudeDeg, destination.longitudeDeg);
    return Math.ceil((distanceNm / Math.max(cruiseSpeedKtas, 100)) * 60 + 30);
}
function commandId(prefix) {
    return `${prefix}_${randomUUID()}`;
}
function registrationFor(prefix) {
    return `${prefix}${Math.floor(100 + Math.random() * 900)}`;
}
function parseOptionalIntegerFormValue(rawValue) {
    if (!rawValue) {
        return undefined;
    }
    const parsedValue = Number.parseInt(String(rawValue), 10);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
}
function parseOptionalCurrencyFormValue(rawValue) {
    if (!rawValue) {
        return undefined;
    }
    const parsedValue = Number.parseFloat(String(rawValue));
    return Number.isFinite(parsedValue) ? Math.round(parsedValue) : undefined;
}
function parseOptionalFloatFormValue(rawValue) {
    if (!rawValue) {
        return undefined;
    }
    const parsedValue = Number.parseFloat(String(rawValue));
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
}
function parseOptionalCadenceFormValue(rawValue) {
    return rawValue === "weekly" || rawValue === "monthly" ? rawValue : undefined;
}
// Route helpers centralize URL building so links, redirects, and client fallbacks stay aligned.
function saveRoute(saveId, options = {}) {
    const search = new URLSearchParams();
    if (options.tab && options.tab !== "dashboard") {
        search.set("tab", options.tab);
    }
    if (options.flash?.notice) {
        search.set("notice", options.flash.notice);
    }
    if (options.flash?.error) {
        search.set("error", options.flash.error);
    }
    const query = search.toString();
    return `/save/${encodeURIComponent(saveId)}${query ? `?${query}` : ""}`;
}
function openSaveRoute(saveId, options = {}) {
    const search = new URLSearchParams();
    if (options.tab && options.tab !== "dashboard") {
        search.set("tab", options.tab);
    }
    const query = search.toString();
    return `/open-save/${encodeURIComponent(saveId)}${query ? `?${query}` : ""}`;
}
function launcherRoute(options = {}) {
    const search = new URLSearchParams();
    if (options.confirmDeleteSaveId) {
        search.set("confirmDelete", options.confirmDeleteSaveId);
    }
    if (options.flash?.notice) {
        search.set("notice", options.flash.notice);
    }
    if (options.flash?.error) {
        search.set("error", options.flash.error);
    }
    const query = search.toString();
    return query ? `/?${query}` : "/";
}
// Request parsing and response helpers bridge raw Node HTTP primitives to the render and action handlers.
async function listSaveIds() {
    return listSaveSlotIds(saveDirectoryPath);
}
function readConfirmDeleteSaveId(url, saveIds) {
    const confirmDeleteSaveId = url.searchParams.get("confirmDelete") ?? undefined;
    if (!confirmDeleteSaveId || !isValidSaveId(confirmDeleteSaveId) || !saveIds.includes(confirmDeleteSaveId)) {
        return undefined;
    }
    return confirmDeleteSaveId;
}
async function loadSavePageModel(saveId) {
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
async function readForm(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}
function sendHtml(response, html) {
    response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
    });
    response.end(html);
}
function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
}
function redirect(response, location) {
    response.writeHead(303, { location });
    response.end();
}
// Server-rendered page helpers still support the launcher and the non-hydrated shell paths.
function renderPanel(title, body, options = {}) {
    const className = options.className ? ` ${options.className}` : "";
    return `<section class="panel${className}"><div class="panel-head"><h3>${escapeHtml(title)}</h3>${options.actionHtml ?? ""}</div><div class="panel-body">${body}</div></section>`;
}
function renderMetricStrip(model) {
    const company = model.companyContext;
    const fleet = model.fleetState?.aircraft ?? [];
    const offers = model.contractBoard?.offers ?? [];
    const dispatchAvailableCount = model.fleetState?.dispatchAvailableCount ?? 0;
    const staffingMonthlyCost = model.staffingState?.totalMonthlyFixedCostAmount ?? 0;
    if (!company) {
        return "";
    }
    return `<section class="metrics-strip">
    <div class="metric-card"><div class="eyebrow">Cash Position</div><strong>${formatMoney(company.currentCashAmount)}</strong><span class="muted">${escapeHtml(company.financialPressureBand.replaceAll("_", " "))}</span></div>
    <div class="metric-card"><div class="eyebrow">Clock</div><strong>${escapeHtml(formatDate(company.currentTimeUtc))}</strong><span class="muted">Home ${escapeHtml(company.homeBaseAirportId)}</span></div>
    <div class="metric-card"><div class="eyebrow">Growth Stage</div><strong>${escapeHtml(company.companyPhase.replaceAll("_", " "))}</strong><span class="muted">Tier ${company.progressionTier} | Rep ${company.reputationScore}</span></div>
    <div class="metric-card"><div class="eyebrow">Fleet Readiness</div><strong>${dispatchAvailableCount}/${fleet.length || 0}</strong><span class="muted">dispatchable aircraft</span></div>
    <div class="metric-card"><div class="eyebrow">Commercial Load</div><strong>${company.activeContractCount}</strong><span class="muted">${offers.filter((offer) => offer.offerStatus === "available").length} offers live | ${formatMoney(staffingMonthlyCost)}/mo labor</span></div>
  </section>`;
}
function renderSaveTabs(saveId, activeTab, tabMeta = {}) {
    return `<nav class="tabbar">${saveTabs.map((tab) => `<a class="tab-link ${tab.id === activeTab ? "current" : ""}" href="${saveRoute(saveId, { tab: tab.id })}"><span>${escapeHtml(tab.label)}</span>${tabMeta[tab.id] ? `<span class="tab-count">${escapeHtml(tabMeta[tab.id] ?? "")}</span>` : ""}</a>`).join("")}</nav>`;
}
function renderShell(title, saveIds, currentSaveId, flash, body, options = {}) {
    void saveIds;
    void options;
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
      --bg-alt: linear-gradient(160deg, rgba(250,244,234,.95), rgba(233,228,216,.9));
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
      --panel: rgba(20,29,40,.84);
      --panel-strong: rgba(17,25,35,.96);
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
    body[data-theme="forest"] {
      color-scheme: dark;
      --bg: #0d1512;
      --bg-alt: radial-gradient(circle at top left, rgba(41,95,74,.28), transparent 34%), linear-gradient(180deg, rgba(13,21,18,.98), rgba(10,17,14,.98));
      --panel: rgba(18,31,26,.9);
      --panel-strong: rgba(15,25,22,.98);
      --text: #eef6f1;
      --muted: #96aaa0;
      --line: rgba(238,246,241,.08);
      --accent: #78d3a7;
      --accent-soft: rgba(120,211,167,.12);
      --danger: #ef8c83;
      --danger-soft: rgba(239,140,131,.14);
      --shadow: 0 24px 60px rgba(0,0,0,.34);
    }
    body[data-theme="forest"] {
      color-scheme: dark;
      --bg: #0d1512;
      --bg-alt: radial-gradient(circle at top left, rgba(41,95,74,.28), transparent 34%), linear-gradient(180deg, rgba(13,21,18,.98), rgba(10,17,14,.98));
      --panel: rgba(18,31,26,.84);
      --panel-strong: rgba(15,25,22,.96);
      --text: #eef6f1;
      --muted: #96aaa0;
      --line: rgba(238,246,241,.08);
      --accent: #78d3a7;
      --accent-soft: rgba(120,211,167,.12);
      --warn: #efb15f;
      --warn-soft: rgba(239,177,95,.12);
      --danger: #ef8c83;
      --danger-soft: rgba(239,140,131,.14);
      --shadow: 0 24px 60px rgba(0,0,0,.34);
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      overflow: hidden;
      background: var(--bg-alt);
      color: var(--text);
      font: 15px/1.45 Aptos, "Segoe UI Variable Text", "Trebuchet MS", sans-serif;
    }
    [hidden] { display: none !important; }
    .app {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    .main {
      min-width: 0;
      min-height: 0;
      width: 100%;
      overflow: hidden;
      padding: 20px 24px 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .topbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 16px;
      flex: 0 0 auto;
    }
    .topbar-meta {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .topbar-copy {
      min-width: 0;
      display: grid;
      gap: 4px;
    }
    .topbar h2 { margin: 0; font-size: 28px; }
    .topbar p { margin: 0; color: var(--muted); }
    .eyebrow { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); }
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
    body[data-theme="dark"] .theme-toggle,
    body[data-theme="dark"] button,
    body[data-theme="dark"] .button-link {
      color: #091018;
      background: var(--accent);
    }
    .button-secondary { background: transparent; color: var(--text); border: 1px solid var(--line); }
    body[data-theme="dark"] .button-secondary { color: var(--text); background: transparent; }
    .flash { padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); flex: 0 0 auto; }
    .flash.notice { background: var(--accent-soft); border-color: rgba(13,106,119,.22); }
    .flash.error { background: var(--danger-soft); border-color: rgba(176,58,46,.24); }
    .tabbar {
      display: flex;
      gap: 10px;
      overflow: auto;
      padding: 2px 2px 4px;
      flex: 0 0 auto;
    }
    .tab-link {
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
      padding: 10px 14px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: inherit;
      text-decoration: none;
      background: var(--panel);
      white-space: nowrap;
    }
    .tab-link.current { border-color: var(--accent); background: var(--accent-soft); }
    .tab-link.current .tab-count { background: rgba(255,255,255,.7); color: var(--accent); }
    body[data-theme="dark"] .tab-link.current .tab-count { background: rgba(9,13,18,.46); }
    .tab-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 26px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--panel-strong);
      color: var(--muted);
      font-size: 12px;
    }
    .content-shell {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .metrics-strip {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 14px;
      flex: 0 0 auto;
    }
    .metric-card {
      display: grid;
      gap: 6px;
      padding: 16px;
      border-radius: 18px;
      background: var(--panel-strong);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
    }
    .metric-card strong { font-size: 22px; }
    .context-rail {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      flex: 0 0 auto;
    }
    .context-card {
      display: grid;
      gap: 6px;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
    }
    .context-card strong { font-size: 18px; }
    .context-card.accent { border-color: rgba(13,106,119,.24); background: color-mix(in srgb, var(--accent-soft) 65%, var(--panel-strong)); }
    .context-card.warn { border-color: rgba(179,108,24,.24); background: color-mix(in srgb, var(--warn-soft) 60%, var(--panel-strong)); }
    .context-card.danger { border-color: rgba(176,58,46,.24); background: color-mix(in srgb, var(--danger-soft) 60%, var(--panel-strong)); }
    .view-grid {
      min-height: 0;
      height: 100%;
      display: grid;
      gap: 18px;
      overflow: hidden;
    }
    .view-grid.two-up { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .view-grid.sidebar-wide { grid-template-columns: minmax(320px, .78fr) minmax(0, 1.22fr); }
    .view-grid.stack-and-side { grid-template-columns: minmax(0, 1.1fr) minmax(340px, .9fr); }
    .stack-column {
      min-height: 0;
      display: grid;
      gap: 18px;
      overflow: hidden;
      grid-auto-rows: minmax(0, 1fr);
    }
    .panel {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 20px;
      background: var(--panel);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }
    .panel-head {
      padding: 16px 18px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--line);
      flex: 0 0 auto;
    }
    .panel-head h3 { margin: 0; font-size: 17px; }
    .panel-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 16px 18px 18px;
    }
    .actions { display: grid; gap: 14px; }
    .action-group { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
    .action-group.tight { gap: 8px; }
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
    table { width: 100%; border-collapse: collapse; min-width: 100%; }
    .table-wrap { min-height: 0; overflow: auto; }
    th, td { text-align: left; padding: 12px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--muted);
      background: var(--panel-strong);
    }
    .badge { display: inline-flex; padding: 4px 8px; border-radius: 999px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    .badge.neutral { background: rgba(127,127,127,.12); }
    .badge.accent { background: var(--accent-soft); color: var(--accent); }
    .badge.warn { background: var(--warn-soft); color: var(--warn); }
    .badge.danger { background: var(--danger-soft); color: var(--danger); }
    .route { font-weight: 600; }
    .meta-stack { display: grid; gap: 4px; }
    .summary-list { display: grid; gap: 12px; }
    .summary-item {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
    }
    .summary-item strong { display: block; font-size: 18px; margin-top: 3px; }
    .event-list { display: grid; gap: 10px; }
    .event-item {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
    }
    .empty-state { padding: 18px; border: 1px dashed var(--line); border-radius: 16px; color: var(--muted); }
    .compact { padding: 12px; }
    .muted { color: var(--muted); }
    .pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill {
      display: inline-flex;
      padding: 7px 10px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
      color: var(--muted);
      font-size: 13px;
    }
    .contracts-app-shell {
      min-height: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .contracts-toolbar {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 16px;
    }
    .contracts-toolbar strong {
      display: block;
      font-size: 20px;
      margin: 4px 0;
    }
    .contracts-grid {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(340px, .9fr);
      gap: 18px;
      overflow: hidden;
    }
    .contracts-side-column {
      min-height: 0;
      display: grid;
      gap: 18px;
      grid-template-rows: minmax(240px, .95fr) minmax(0, .8fr) minmax(0, 1fr);
      overflow: hidden;
    }
    .contracts-main-body {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 14px;
      overflow: hidden;
    }
    .contracts-filters {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      flex: 0 0 auto;
    }
    .contracts-board-wrap {
      min-height: 0;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--panel-strong);
    }
    .contracts-board-table { min-width: 100%; }
    th.sortable { white-space: nowrap; }
    .table-sort,
    body[data-theme="dark"] .table-sort {
      appearance: none;
      border: 0;
      padding: 0;
      margin: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .table-sort.current {
      color: var(--accent);
    }
    .table-sort-direction {
      font-size: 10px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--muted);
    }
     .contract-row.selected td { background: color-mix(in srgb, var(--accent-soft) 55%, transparent); }
    .contract-row.matches-endpoint td:first-child {
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .contract-route-button {
      appearance: none;
      border: 0;
      padding: 0;
      margin: 0;
      width: 100%;
      text-align: left;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
    }
    .contracts-map-body {
      padding: 12px;
      background: linear-gradient(180deg, rgba(13,106,119,.08), transparent 45%);
    }
     .contracts-planner-panel {
      min-height: 0;
      overflow: hidden;
    }
    .contracts-planner-body {
      min-height: 0;
      overflow: auto;
    }
    .planner-list {
      display: grid;
      gap: 10px;
    }
    .planner-item {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px;
      background: var(--panel-strong);
      display: grid;
      gap: 10px;
    }
    .planner-item-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .planner-sequence {
      display: inline-flex;
      width: 28px;
      height: 28px;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--text);
      font-weight: 700;
    }
    .planner-item-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .planner-panel-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }
    .planner-review {
      display: grid;
      gap: 14px;
    }
    .planner-review-actions {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    .planner-review-section {
      display: grid;
      gap: 10px;
    }
    .planner-review-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .planner-review-list {
      display: grid;
      gap: 10px;
    }
    .planner-review-item {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px;
      background: var(--panel-strong);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
    }
    .planner-review-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .planner-review-toggle input {
      width: 18px;
      height: 18px;
      margin: 0;
    }
    .planner-review-toggle.static {
      min-width: 48px;
    }
    .contracts-map {
      width: 100%;
      height: 100%;
      min-height: 240px;
      display: block;
      border-radius: 18px;
      touch-action: none;
    }
    .map-bg { fill: rgba(8, 18, 28, .08); stroke: var(--line); }
    body[data-theme="dark"] .map-bg { fill: rgba(6, 12, 18, .92); }
    .map-grid line { stroke: rgba(127,127,127,.18); stroke-width: 1; }
    .map-route { fill: none; stroke-linecap: round; }
    .map-route.accepted { stroke: rgba(127,127,127,.38); stroke-width: 3; stroke-dasharray: 10 8; }
    .map-route.selected { stroke: var(--accent); stroke-width: 6; }
    .map-point.origin { fill: var(--accent); }
    .map-point.destination { fill: var(--warn); }
    .map-label { fill: var(--text); font-size: 20px; font-weight: 600; }
    .contracts-accepted-body { overflow: auto; }
    @media (max-width: 1240px) {
      .metrics-strip,
      .context-rail,
      .view-grid.two-up,
      .view-grid.sidebar-wide,
      .view-grid.stack-and-side,
      .contracts-grid,
      .contracts-filters {
        grid-template-columns: 1fr;
      }
      .main { padding: 18px; }
      body { overflow: auto; }
      .app { height: auto; min-height: 100vh; }
      .main, .content-shell, .view-grid, .panel, .contracts-app-shell, .contracts-grid, .contracts-side-column { min-height: unset; height: auto; }
      .contracts-side-column { grid-template-rows: none; }
      .topbar { grid-template-columns: 1fr; }
      .topbar-meta { align-items: start; }
      .contracts-toolbar { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="app">
    <main class="main">
      <div class="topbar">
        <div class="topbar-meta">
          <a class="button-link button-secondary" href="/">Back to saves</a>
          <div class="topbar-copy">
            <div class="eyebrow">Save Slot</div>
            <h2>${escapeHtml(title)}</h2>
            <p>${currentSaveId ? `Save ${escapeHtml(currentSaveId)}` : "Local simulation shell"}</p>
          </div>
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
      const themes = ['light', 'dark', 'forest'];
      const themeSet = new Set(themes);
      const root = document.body;
      const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const stored = localStorage.getItem(key);
      const initial = stored && themeSet.has(stored) ? stored : preferred;
      root.dataset.theme = initial;
      window.toggleTheme = () => {
        const currentIndex = themes.indexOf(root.dataset.theme || 'light');
        const next = themes[(currentIndex + 1 + themes.length) % themes.length];
        root.dataset.theme = next;
        localStorage.setItem(key, next);
        window.dispatchEvent(new CustomEvent('flightline:theme-changed', { detail: { theme: next } }));
        return next;
      };
    })();
  </script>
</body>
</html>`;
}
// The launcher remains a pure server render because its interactions are simple and it is the first screen every session hits.
function renderLauncherPage(saveIds, flash, confirmDeleteSaveId) {
    const saveRows = saveIds.length === 0
        ? `<div class="launcher-empty">No saves yet. Create one to start the first company.</div>`
        : saveIds.map((saveId) => {
            const isConfirmingDelete = confirmDeleteSaveId === saveId;
            const openHref = openSaveRoute(saveId);
            const deleteHref = launcherRoute({ confirmDeleteSaveId: saveId });
            return `<article class="launcher-save-row ${isConfirmingDelete ? "warning" : ""}">
        <div class="launcher-save-main">
          <strong>${escapeHtml(saveId)}</strong>
          <span class="muted">${isConfirmingDelete ? "This permanently deletes the local save file." : "Open this save and continue the simulation."}</span>
        </div>
        <div class="launcher-save-actions">
          ${isConfirmingDelete
                ? `<form method="post" action="/actions/delete-save" class="launcher-inline-form"><input type="hidden" name="saveId" value="${escapeHtml(saveId)}" /><button type="submit" class="button-danger">Confirm delete</button></form><a class="button-link button-secondary" href="/">Cancel</a>`
                : `<a class="button-link" href="${openHref}">Open</a><a class="button-link button-secondary" href="${deleteHref}">Delete</a>`}
        </div>
      </article>`;
        }).join("");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Open or Create Save</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #efe9de;
      --bg-alt: linear-gradient(160deg, rgba(250,244,234,.95), rgba(233,228,216,.9));
      --panel: rgba(255,255,255,.88);
      --panel-strong: rgba(255,255,255,.96);
      --text: #182126;
      --muted: #61707b;
      --line: rgba(24,33,38,.08);
      --accent: #0d6a77;
      --accent-soft: rgba(13,106,119,.12);
      --danger: #b03a2e;
      --danger-soft: rgba(176,58,46,.14);
      --shadow: 0 24px 60px rgba(28,33,40,.14);
    }
    body[data-theme="dark"] {
      color-scheme: dark;
      --bg: #0f1720;
      --bg-alt: radial-gradient(circle at top left, rgba(29,74,96,.32), transparent 34%), linear-gradient(180deg, rgba(15,23,32,.98), rgba(14,20,28,.98));
      --panel: rgba(20,29,40,.9);
      --panel-strong: rgba(17,25,35,.98);
      --text: #edf3f7;
      --muted: #8e9daa;
      --line: rgba(237,243,247,.08);
      --accent: #6fc9d4;
      --accent-soft: rgba(111,201,212,.12);
      --danger: #ef8c83;
      --danger-soft: rgba(239,140,131,.14);
      --shadow: 0 24px 60px rgba(0,0,0,.34);
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg-alt);
      color: var(--text);
      font: 15px/1.45 Aptos, "Segoe UI Variable Text", "Trebuchet MS", sans-serif;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    [hidden] { display: none !important; }
    .launcher-shell {
      width: min(760px, 100%);
      display: grid;
      gap: 18px;
    }
    .launcher-header {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 16px;
    }
    .launcher-header h1 {
      margin: 8px 0 6px;
      font-size: 34px;
      line-height: 1.05;
    }
    .launcher-header p {
      margin: 0;
      color: var(--muted);
    }
    .eyebrow { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); }
    .launcher-card {
      display: grid;
      gap: 16px;
      padding: 22px;
      border-radius: 24px;
      background: var(--panel);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }
    .launcher-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .launcher-card-head h2 {
      margin: 0;
      font-size: 18px;
    }
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
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    body[data-theme="dark"] .theme-toggle,
    body[data-theme="dark"] button,
    body[data-theme="dark"] .button-link {
      color: #091018;
      background: var(--accent);
    }
    .button-secondary {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--line);
    }
    body[data-theme="dark"] .button-secondary {
      color: var(--text);
      background: transparent;
    }
    .button-danger {
      background: var(--danger);
      color: #fff;
    }
    body[data-theme="dark"] .button-danger {
      background: var(--danger);
      color: #091018;
    }
    .launcher-form {
      display: flex;
      gap: 12px;
      align-items: end;
      flex-wrap: wrap;
    }
    label {
      display: grid;
      gap: 6px;
      flex: 1 1 280px;
      color: var(--muted);
      font-size: 13px;
    }
    input {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
      color: var(--text);
      padding: 11px 12px;
      font: inherit;
    }
    .flash {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
    }
    .flash.notice { background: var(--accent-soft); border-color: rgba(13,106,119,.22); }
    .flash.error { background: var(--danger-soft); border-color: rgba(176,58,46,.24); }
    .launcher-save-list {
      display: grid;
      gap: 10px;
    }
    .launcher-save-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
    }
    .launcher-save-row.warning {
      border-color: rgba(176,58,46,.32);
      background: color-mix(in srgb, var(--danger-soft) 55%, var(--panel-strong));
    }
    .launcher-save-main {
      min-width: 0;
      display: grid;
      gap: 4px;
    }
    .launcher-save-main strong {
      font-size: 16px;
      overflow-wrap: anywhere;
    }
    .launcher-save-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: end;
    }
    .launcher-inline-form {
      display: inline-flex;
    }
    .launcher-empty {
      padding: 18px;
      border: 1px dashed var(--line);
      border-radius: 16px;
      color: var(--muted);
      text-align: center;
    }
    .muted { color: var(--muted); }
    @media (max-width: 720px) {
      body { padding: 18px; }
      .launcher-card { padding: 18px; }
      .launcher-header,
      .launcher-card-head,
      .launcher-save-row {
        align-items: stretch;
        grid-auto-flow: row;
        flex-direction: column;
      }
      .launcher-save-actions {
        justify-content: stretch;
      }
      .launcher-save-actions > * {
        flex: 1 1 auto;
      }
      .launcher-form button {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <main class="launcher-shell">
    <header class="launcher-header">
      <div>
        <div class="eyebrow">FlightLine</div>
        <h1>Open or Create Save</h1>
        <p>Create a new save or continue an existing local company.</p>
      </div>
      <button class="theme-toggle" type="button" onclick="window.toggleTheme()">Toggle theme</button>
    </header>
    ${flash.notice ? `<div class="flash notice">${escapeHtml(flash.notice)}</div>` : ""}
    ${flash.error ? `<div class="flash error">${escapeHtml(flash.error)}</div>` : ""}
    <section class="launcher-card">
      <div class="launcher-card-head">
        <div>
          <div class="eyebrow">Create</div>
          <h2>New Save</h2>
        </div>
      </div>
      <form method="post" action="/actions/create-save" class="launcher-form">
        <label>Save Name
          <input name="saveName" placeholder="flightline_alpha" autofocus />
        </label>
        <button type="submit">Create save</button>
      </form>
    </section>
    <section class="launcher-card">
      <div class="launcher-card-head">
        <div>
          <div class="eyebrow">Open</div>
          <h2>Existing Saves</h2>
        </div>
        <span class="muted">${saveIds.length} total</span>
      </div>
      <div class="launcher-save-list">${saveRows}</div>
    </section>
  </main>
  <script>
    (() => {
      const key = 'flightline-theme';
      const themes = ['light', 'dark', 'forest'];
      const themeSet = new Set(themes);
      const root = document.body;
      const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const stored = localStorage.getItem(key);
      const initial = stored && themeSet.has(stored) ? stored : preferred;
      root.dataset.theme = initial;
      window.toggleTheme = () => {
        const currentIndex = themes.indexOf(root.dataset.theme || 'light');
        const next = themes[(currentIndex + 1 + themes.length) % themes.length];
        root.dataset.theme = next;
        localStorage.setItem(key, next);
      };
    })();
  </script>
</body>
</html>`;
}
// Save-page rendering composes the loaded projections into either a plain fallback shell or the richer hydrated experience.
function serializeJsonForScript(value) {
    return JSON.stringify(value)
        .replaceAll("&", "\\u0026")
        .replaceAll("<", "\\u003c")
        .replaceAll(">", "\\u003e");
}
function renderContractsTab(saveId, payload) {
    if (!payload) {
        return renderPanel("Contract Market", `<div class="empty-state">The contracts board becomes available after the company exists and the market can be generated.</div>`);
    }
    return `<div class="contracts-app-shell"><div data-contracts-app data-view-url="/api/save/${encodeURIComponent(saveId)}/contracts/view" data-accept-url="/api/save/${encodeURIComponent(saveId)}/contracts/accept"><script type="application/json" data-contracts-payload>${serializeJsonForScript(payload)}</script><div class="panel"><div class="panel-body"><div class="empty-state compact">Loading contracts board...</div></div></div></div><script type="module" src="${contractsTabClientAssetPath}"></script></div>`;
}
function renderSavePage(model, saveIds, flash, activeTab, contractsPayload = null) {
    if (!model.companyContext) {
        return renderShell(`Save ${model.saveId}`, saveIds, model.saveId, flash, `<div class="content-shell">${renderPanel("Create Company", `<form method="post" action="/actions/create-company" class="actions">
        <input type="hidden" name="saveId" value="${escapeHtml(model.saveId)}" />
        ${renderTabInput(activeTab)}
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
      </form>`)}
      </div>`);
    }
    const company = model.companyContext;
    const fleet = model.fleetState?.aircraft ?? [];
    const contracts = model.companyContracts?.contracts ?? [];
    const offers = model.contractBoard?.offers ?? [];
    const schedules = model.schedules;
    const staffingPackages = model.staffingState?.staffingPackages ?? [];
    const staffingCoverage = model.staffingState?.coverageSummaries ?? [];
    const activeSchedules = schedules.filter((schedule) => !schedule.isDraft && schedule.scheduleState !== "completed");
    const draftSchedules = schedules.filter((schedule) => schedule.isDraft);
    const unassignedContracts = contracts.filter((contract) => contract.contractState === "accepted");
    const assignedContracts = contracts.filter((contract) => contract.contractState === "assigned");
    const inFlightContracts = contracts.filter((contract) => contract.contractState === "active");
    const upcomingContracts = contracts.filter((contract) => ["accepted", "assigned", "active"].includes(contract.contractState));
    const idleAircraftCount = fleet.filter((aircraft) => aircraft.dispatchAvailable).length;
    const groundedAircraftCount = fleet.length - idleAircraftCount;
    const offersAvailableCount = offers.filter((offer) => offer.offerStatus === "available").length;
    const urgentContracts = upcomingContracts.filter((contract) => hoursUntil(company.currentTimeUtc, contract.deadlineUtc) <= 24);
    const aircraftById = new Map(fleet.map((aircraft) => [aircraft.aircraftId, aircraft]));
    const pilotOptions = fleet
        .map((aircraft) => `<option value="${escapeHtml(aircraft.aircraftId)}">${escapeHtml(aircraft.registration)} | ${escapeHtml(aircraft.modelDisplayName)} | ${escapeHtml(aircraft.currentAirportId)}</option>`)
        .join("");
    const hiddenContext = `<input type="hidden" name="saveId" value="${escapeHtml(model.saveId)}" />${renderTabInput(activeTab)}`;
    const priorityItems = [];
    if (fleet.length === 0) {
        priorityItems.push({
            label: "Acquire your first aircraft",
            detail: "No aircraft are available to service contracts or build schedules.",
            tone: "danger",
        });
    }
    if (staffingPackages.length === 0) {
        priorityItems.push({
            label: "Activate pilot and cabin coverage",
            detail: "Your operation has no active staffing packages, so dispatch will remain blocked.",
            tone: "danger",
        });
    }
    if (!model.contractBoard || offersAvailableCount === 0) {
        priorityItems.push({
            label: "Refresh the contract market",
            detail: "There is no live contract board to evaluate for new work.",
            tone: "warn",
        });
    }
    if (unassignedContracts.length > 0) {
        priorityItems.push({
            label: "Assign accepted work",
            detail: `${unassignedContracts.length} accepted contract${unassignedContracts.length === 1 ? " is" : "s are"} still waiting for aircraft assignment.`,
            tone: urgentContracts.length > 0 ? "danger" : "warn",
        });
    }
    if (draftSchedules.length > 0) {
        priorityItems.push({
            label: "Commit drafted schedules",
            detail: `${draftSchedules.length} draft schedule${draftSchedules.length === 1 ? " is" : "s are"} ready for commitment.`,
            tone: "warn",
        });
    }
    if (priorityItems.length === 0) {
        priorityItems.push({
            label: "Stable operating state",
            detail: "Refresh the market for better contracts or advance time to execute the current plan.",
            tone: "accent",
        });
    }
    const firstPriority = priorityItems[0] ?? {
        label: "Stable operating state",
        detail: "Refresh the market for better contracts or advance time to execute the current plan.",
        tone: "accent",
    };
    const contextCards = [
        {
            label: "Current Focus",
            value: firstPriority.label,
            detail: firstPriority.detail,
            tone: firstPriority.tone,
        },
        {
            label: "Accepted Work",
            value: `${unassignedContracts.length} unassigned`,
            detail: `${assignedContracts.length} assigned | ${inFlightContracts.length} active`,
            tone: urgentContracts.length > 0 ? "warn" : "neutral",
        },
        {
            label: "Dispatch Readiness",
            value: `${idleAircraftCount}/${fleet.length || 0} aircraft`,
            detail: `${draftSchedules.length} drafts | ${activeSchedules.length} active schedules`,
            tone: idleAircraftCount > 0 ? "accent" : "warn",
        },
        {
            label: "Deadline Pressure",
            value: urgentContracts.length > 0 ? `${urgentContracts.length} due in 24h` : "Clear",
            detail: urgentContracts.length > 0 ? "Advance time carefully or rework the dispatch queue." : "No accepted contract is nearing an immediate deadline.",
            tone: urgentContracts.length > 0 ? "danger" : "accent",
        },
    ];
    const tabMeta = {
        dashboard: urgentContracts.length > 0 ? `${urgentContracts.length}!` : `${upcomingContracts.length}`,
        contracts: `${offersAvailableCount}/${contracts.length}`,
        aircraft: `${idleAircraftCount}/${fleet.length || 0}`,
        staffing: `${model.staffingState?.totalActiveCoverageUnits ?? 0}`,
        dispatch: `${draftSchedules.length + activeSchedules.length}`,
        activity: `${model.eventLog?.entries.length ?? 0}`,
    };
    const contractsLink = `<a class="button-link button-secondary" href="${saveRoute(model.saveId, { tab: "contracts" })}">Open contract board</a>`;
    const advanceTimeForm = `<form method="post" action="/actions/advance-time" class="actions">
    ${hiddenContext}
    <div class="action-group">
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
    </div>
  </form>`;
    const acquireAircraftForm = `<form method="post" action="/actions/acquire-aircraft" class="actions">
    ${hiddenContext}
    <label>Starter Aircraft
      <select name="aircraftModelId">${starterAircraftOptions.map((option) => `<option value="${option.modelId}">${escapeHtml(option.label)}</option>`).join("")}</select>
    </label>
    <button type="submit">Acquire aircraft</button>
  </form>`;
    const staffingActionRow = Object.entries(staffingPresets).map(([presetKey, preset]) => `<form method="post" action="/actions/add-staffing" class="inline">${hiddenContext}<input type="hidden" name="presetKey" value="${escapeHtml(presetKey)}" /><button type="submit">${escapeHtml(preset.label)}</button></form>`).join("");
    const contractBoardBody = offers.length === 0
        ? `<div class="empty-state">No active contract board is currently visible.</div>`
        : `<div class="table-wrap"><table><thead><tr><th>Route</th><th>Fit</th><th>Payload</th><th>Window</th><th>Payout</th><th></th></tr></thead><tbody>${offers.map((offer) => `<tr><td>${renderRouteDisplay(offer.originAirportId, offer.destinationAirportId)}</td><td><div class="meta-stack">${renderBadge(offer.difficultyBand)}<span class="muted">${escapeHtml(offer.likelyRole.replaceAll("_", " "))}</span></div></td><td>${escapeHtml(formatPayload(offer.volumeType, offer.passengerCount, offer.cargoWeightLb))}</td><td><div class="meta-stack"><span>${escapeHtml(formatDate(offer.earliestStartUtc))}</span><span class="muted">due ${escapeHtml(formatDate(offer.latestCompletionUtc))}</span></div></td><td>${formatMoney(offer.payoutAmount)}</td><td>${offer.offerStatus === "available" ? `<form method="post" action="/actions/accept-contract" class="inline">${hiddenContext}<input type="hidden" name="contractOfferId" value="${escapeHtml(offer.contractOfferId)}" /><button type="submit">Accept</button></form>` : renderBadge(offer.offerStatus)}</td></tr>`).join("")}</tbody></table></div>`;
    const companyContractsBody = contracts.length === 0
        ? `<div class="empty-state">No accepted company contracts yet.</div>`
        : `<div class="table-wrap"><table><thead><tr><th>State</th><th>Route</th><th>Payload</th><th>Deadline</th><th>Assignment</th><th></th></tr></thead><tbody>${contracts.map((contract) => {
            const assignedAircraft = contract.assignedAircraftId ? aircraftById.get(contract.assignedAircraftId) : undefined;
            const assignmentHtml = assignedAircraft
                ? `<div class="meta-stack"><span>${escapeHtml(assignedAircraft.registration)}</span><span class="muted">${escapeHtml(assignedAircraft.modelDisplayName)}</span></div>`
                : `<span class="muted">Unassigned</span>`;
            return `<tr><td>${renderBadge(contract.contractState)}</td><td>${renderRouteDisplay(contract.originAirportId, contract.destinationAirportId)}</td><td>${escapeHtml(formatPayload(contract.volumeType, contract.passengerCount, contract.cargoWeightLb))}</td><td><div class="meta-stack"><span>${escapeHtml(formatDate(contract.deadlineUtc))}</span><span class="muted">earliest ${escapeHtml(formatDate(contract.earliestStartUtc))}</span></div></td><td>${assignmentHtml}</td><td>${fleet.length > 0 && ["accepted", "assigned"].includes(contract.contractState) ? `<form method="post" action="/actions/auto-plan-contract" class="inline">${hiddenContext}<input type="hidden" name="companyContractId" value="${escapeHtml(contract.companyContractId)}" /><label>Aircraft<select name="aircraftId">${pilotOptions}</select></label><button type="submit">Auto-plan</button></form>` : ""}</td></tr>`;
        }).join("")}</tbody></table></div>`;
    const fleetSummaryBody = `<div class="summary-list">
    <div class="summary-item"><div class="eyebrow">Dispatchable</div><strong>${formatNumber(idleAircraftCount)}</strong><div class="muted">${formatPercent(fleet.length > 0 ? (idleAircraftCount / fleet.length) * 100 : 0)} of fleet ready now.</div></div>
    <div class="summary-item"><div class="eyebrow">Grounded or busy</div><strong>${formatNumber(groundedAircraftCount)}</strong><div class="muted">Aircraft unavailable due to schedule or state.</div></div>
    <div class="summary-item"><div class="eyebrow">MSFS overlap</div><strong>${formatNumber(fleet.filter((aircraft) => aircraft.msfs2024Status === "confirmed_available").length)}</strong><div class="muted">Currently confirmed as available in MSFS 2024.</div></div>
    <div class="summary-item"><div class="eyebrow">Lease or finance load</div><strong>${formatMoney((model.fleetState?.aircraft ?? []).reduce((sum, aircraft) => sum + (aircraft.recurringPaymentAmount ?? 0), 0))}</strong><div class="muted">Recurring aircraft obligations currently visible.</div></div>
  </div>`;
    const fleetBody = fleet.length === 0
        ? `<div class="empty-state">No aircraft in the fleet yet.</div>`
        : `<div class="table-wrap"><table><thead><tr><th>Aircraft</th><th>Status</th><th>Location</th><th>Operating Envelope</th><th>MSFS</th></tr></thead><tbody>${fleet.map((aircraft) => `<tr><td><div class="meta-stack"><span class="route">${escapeHtml(aircraft.registration)}</span><span class="muted">${escapeHtml(aircraft.modelDisplayName)} | ${escapeHtml(aircraft.ownershipType)}</span></div></td><td><div class="meta-stack">${renderBadge(aircraft.statusInput)}<span class="muted">${formatPercent(aircraft.conditionValue, 0)} condition | dispatch ${aircraft.dispatchAvailable ? "yes" : "no"}</span></div></td><td>${renderAirportDisplay(aircraft.currentAirportId)}</td><td><div class="meta-stack"><span>${aircraft.maxPassengers} pax | ${formatNumber(aircraft.maxCargoLb)} lb | ${formatNumber(aircraft.rangeNm)} nm</span><span class="muted">${formatAirportSize(aircraft.minimumAirportSize)} | ${formatNumber(aircraft.minimumRunwayFt)} ft runway</span></div></td><td>${renderBadge(aircraft.msfs2024Status.replaceAll("_", " "))}</td></tr>`).join("")}</tbody></table></div>`;
    const eventLogBody = !model.eventLog || model.eventLog.entries.length === 0
        ? `<div class="empty-state">No event log entries yet.</div>`
        : `<div class="event-list">${model.eventLog.entries.map((entry) => `<div class="event-item"><div class="meta-stack"><div>${entry.severity ? renderBadge(entry.severity) : ""} <strong>${escapeHtml(entry.message)}</strong></div><div class="muted">${escapeHtml(formatDate(entry.eventTimeUtc))} | ${escapeHtml(entry.eventType)}</div></div></div>`).join("")}</div>`;
    const quickActionsPanel = renderPanel("Control Tower", `<div class="actions">
    <div class="action-group tight">${contractsLink}</div>
    ${advanceTimeForm}
  </div>`, {
        actionHtml: `<div class="pill-row"><span class="pill">${offersAvailableCount} live offers</span><span class="pill">${upcomingContracts.length} active contracts</span></div>`,
    });
    const overviewFocusPanel = renderPanel("Immediate Priorities", `<div class="summary-list">${priorityItems.map((item) => `<div class="summary-item"><div class="meta-stack">${renderBadge(item.tone === "danger" ? "critical" : item.tone === "warn" ? "warning" : "active")}<strong>${escapeHtml(item.label)}</strong><span class="muted">${escapeHtml(item.detail)}</span></div></div>`).join("")}</div>`);
    const dashboardSnapshotPanel = renderPanel("Operating Snapshot", `<div class="summary-list">
    <div class="summary-item"><div class="eyebrow">Accepted contracts waiting</div><strong>${formatNumber(unassignedContracts.length)}</strong><div class="muted">Need assignment before execution.</div></div>
    <div class="summary-item"><div class="eyebrow">Draft schedules</div><strong>${formatNumber(draftSchedules.length)}</strong><div class="muted">Ready for review and commit.</div></div>
    <div class="summary-item"><div class="eyebrow">Active schedules</div><strong>${formatNumber(activeSchedules.length)}</strong><div class="muted">Currently holding aircraft capacity.</div></div>
    <div class="summary-item"><div class="eyebrow">Staff coverage</div><strong>${formatNumber(model.staffingState?.totalActiveCoverageUnits ?? 0)}</strong><div class="muted">${formatMoney(model.staffingState?.totalMonthlyFixedCostAmount ?? 0)} monthly fixed labor cost.</div></div>
  </div>`);
    const dashboardQueuePanel = renderPanel("Execution Queue", upcomingContracts.length === 0
        ? `<div class="empty-state">No active company contracts are waiting for action.</div>`
        : `<div class="summary-list">${upcomingContracts.slice(0, 6).map((contract) => `<div class="summary-item"><div class="meta-stack">${renderRouteDisplay(contract.originAirportId, contract.destinationAirportId)}<span class="muted">${formatMoney(contract.acceptedPayoutAmount)} | due ${escapeHtml(formatDate(contract.deadlineUtc))}</span></div></div>`).join("")}</div>`);
    const contractsMarketSummaryPanel = renderPanel("Market Snapshot", `<div class="summary-list">
    <div class="summary-item"><div class="eyebrow">Live offers</div><strong>${formatNumber(offersAvailableCount)}</strong><div class="muted">${model.contractBoard ? `Board expires ${escapeHtml(formatDate(model.contractBoard.expiresAtUtc))}.` : "No active board."}</div></div>
    <div class="summary-item"><div class="eyebrow">Accepted work</div><strong>${formatNumber(contracts.length)}</strong><div class="muted">${formatNumber(unassignedContracts.length)} still need aircraft assignment.</div></div>
    <div class="summary-item"><div class="eyebrow">Near-term pressure</div><strong>${formatNumber(urgentContracts.length)}</strong><div class="muted">Contracts due within the next 24 hours.</div></div>
  </div>`);
    const staffingSummaryPanel = renderPanel("Coverage Posture", `<div class="summary-list">
    <div class="summary-item"><div class="eyebrow">Active units</div><strong>${formatNumber(model.staffingState?.totalActiveCoverageUnits ?? 0)}</strong><div class="muted">Coverage currently in force.</div></div>
    <div class="summary-item"><div class="eyebrow">Pending units</div><strong>${formatNumber(model.staffingState?.totalPendingCoverageUnits ?? 0)}</strong><div class="muted">Packages not yet active.</div></div>
    <div class="summary-item"><div class="eyebrow">Qualification lines</div><strong>${formatNumber(staffingCoverage.length)}</strong><div class="muted">Distinct labor/qualification combinations tracked.</div></div>
    <div class="summary-item"><div class="eyebrow">Monthly cost</div><strong>${formatMoney(model.staffingState?.totalMonthlyFixedCostAmount ?? 0)}</strong><div class="muted">Visible fixed labor obligation.</div></div>
  </div>`);
    const dispatchControlsPanel = renderPanel("Dispatch Controls", `<div class="actions">${advanceTimeForm}</div>`, {
        actionHtml: `<div class="pill-row"><span class="pill">${activeSchedules.length} active</span><span class="pill">${draftSchedules.length} drafts</span></div>`,
    });
    const dispatchQueuePanel = renderPanel("Contracts Ready For Dispatch", companyContractsBody, {
        actionHtml: `<div class="pill-row"><span class="pill">${unassignedContracts.length} unassigned</span><span class="pill">${assignedContracts.length} assigned</span></div>`,
    });
    const activitySnapshotPanel = renderPanel("Dispatch Snapshot", `<div class="summary-list"><div class="summary-item"><div class="eyebrow">Current time</div><strong>${escapeHtml(formatDate(company.currentTimeUtc))}</strong><div class="muted">Home base ${escapeHtml(company.homeBaseAirportId)}</div></div><div class="summary-item"><div class="eyebrow">Event volume</div><strong>${formatNumber(model.eventLog?.entries.length ?? 0)}</strong><div class="muted">Most recent operational events in this save.</div></div><div class="summary-item"><div class="eyebrow">Open contracts</div><strong>${formatNumber(upcomingContracts.length)}</strong><div class="muted">Accepted contracts still in play.</div></div><div class="summary-item"><div class="eyebrow">Dispatchable fleet</div><strong>${formatNumber(idleAircraftCount)}</strong><div class="muted">Aircraft available for new work.</div></div></div>`);
    const activeTabBody = (() => {
        switch (activeTab) {
            case "contracts":
                return renderContractsTab(model.saveId, contractsPayload);
            case "aircraft":
                return `<div class="view-grid stack-and-side"><div class="stack-column">${renderPanel("Aircraft Actions", `<div class="actions">${acquireAircraftForm}</div>`)}${renderPanel("Fleet Posture", fleetSummaryBody)}</div><div class="stack-column">${renderPanel("Fleet", fleetBody, { actionHtml: `<div class="pill-row"><span class="pill">${idleAircraftCount} ready</span><span class="pill">${groundedAircraftCount} unavailable</span></div>` })}${renderPanel("Access and Fit", `<div class="summary-list"><div class="summary-item"><div class="eyebrow">Airport access floor</div><strong>${fleet.length > 0 ? formatAirportSize(Math.max(...fleet.map((aircraft) => aircraft.minimumAirportSize))) : "-"}</strong><div class="muted">Largest minimum airport size currently required by the fleet.</div></div><div class="summary-item"><div class="eyebrow">Runway floor</div><strong>${fleet.length > 0 ? `${formatNumber(Math.max(...fleet.map((aircraft) => aircraft.minimumRunwayFt)))} ft` : "-"}</strong><div class="muted">Highest minimum runway requirement in the active fleet.</div></div><div class="summary-item"><div class="eyebrow">Typical labor model</div><strong>${fleet[0] ? escapeHtml(fleet[0].pilotQualificationGroup) : "-"}</strong><div class="muted">Use the staffing tab to build coverage against qualification groups.</div></div></div>`)}</div></div>`;
            case "staffing":
                return `<div class="view-grid stack-and-side"><div class="stack-column">${renderPanel("Staffing Actions", `<div class="actions"><div class="action-group tight">${staffingActionRow}</div></div>`)}${staffingSummaryPanel}</div><div class="stack-column">${renderPanel("Coverage Summary", staffingCoverageBody)}${renderPanel("Active Packages", staffingPackagesBody)}</div></div>`;
            case "dispatch":
                return `<div class="view-grid stack-and-side"><div class="stack-column">${renderPanel("Schedules", schedulesBody)}${dispatchControlsPanel}</div><div class="stack-column">${dispatchQueuePanel}</div></div>`;
            case "activity":
                return `<div class="view-grid two-up">${renderPanel("Recent Activity", eventLogBody)}${activitySnapshotPanel}</div>`;
            case "dashboard":
            default:
                return `<div class="view-grid stack-and-side"><div class="stack-column">${quickActionsPanel}${overviewFocusPanel}${dashboardSnapshotPanel}</div><div class="stack-column">${dashboardQueuePanel}${renderPanel("Recent Activity", eventLogBody)}</div></div>`;
        }
    })();
    return renderShell(company.displayName, saveIds, model.saveId, flash, `<div class="content-shell">${renderMetricStrip(model)}${renderSaveTabs(model.saveId, activeTab, tabMeta)}${activeTab === "contracts" ? "" : renderContextRail(contextCards)}${activeTabBody}</div>`);
}
// Legacy form actions keep the older full-page flows working and provide simple fallbacks when debugging without the hydrated shell.
async function handleCreateSave(response, form) {
    const saveId = resolveRequestedSaveId(form.get("saveName"), `save_${Date.now()}`);
    const worldSeed = `world_${randomUUID()}`;
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
    if (!result.success) {
        redirect(response, launcherRoute({ flash: { error: result.hardBlockers[0] ?? "Could not create save." } }));
        return;
    }
    redirect(response, openSaveRoute(saveId));
}
async function handleDeleteSave(response, form) {
    const saveId = form.get("saveId")?.trim() ?? "";
    try {
        await backend.closeSaveSession(saveId);
        await deleteSaveFile(saveDirectoryPath, saveId);
        redirect(response, launcherRoute({ flash: { notice: `Deleted save ${saveId}.` } }));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Could not delete save.";
        redirect(response, launcherRoute({ flash: { error: message } }));
    }
}
async function handleCreateCompany(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
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
    redirect(response, saveRoute(saveId, {
        tab,
        flash: result.success
            ? { notice: `Created company ${form.get("displayName") ?? "FlightLine Regional"}.` }
            : { error: result.hardBlockers[0] ?? "Could not create company." },
    }));
}
async function handleAcquireAircraft(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
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
    redirect(response, saveRoute(saveId, {
        tab,
        flash: result.success
            ? { notice: `Acquired ${selectedOption.label}.` }
            : { error: result.hardBlockers[0] ?? "Could not acquire aircraft." },
    }));
}
async function handleAddStaffing(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
    const presetKey = form.get("presetKey");
    const preset = presetKey ? staffingPresets[presetKey] : null;
    if (!preset) {
        redirect(response, saveRoute(saveId, { tab, flash: { error: "Unknown staffing preset." } }));
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
    redirect(response, saveRoute(saveId, {
        tab,
        flash: result.success
            ? { notice: `Activated ${preset.label}.` }
            : { error: result.hardBlockers[0] ?? "Could not add staffing." },
    }));
}
async function handleRefreshContractBoard(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
    const result = await backend.dispatch({
        commandId: commandId("cmd_refresh"),
        saveId,
        commandName: "RefreshContractBoard",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: { refreshReason: "manual" },
    });
    redirect(response, saveRoute(saveId, {
        tab,
        flash: result.success
            ? { notice: "Refreshed contract board." }
            : { error: result.hardBlockers[0] ?? "Could not refresh contract board." },
    }));
}
async function handleAcceptContract(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
    const contractOfferId = form.get("contractOfferId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_accept"),
        saveId,
        commandName: "AcceptContractOffer",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: { contractOfferId },
    });
    const payload = result.success ? await loadContractsViewPayload(backend, airportReference, saveId, "scheduled") : null;
    redirect(response, saveRoute(saveId, {
        tab,
        flash: result.success
            ? { notice: payload ? buildAcceptedContractMessage(payload, result, contractOfferId) : (result.validationMessages[0] ?? `Accepted contract offer ${contractOfferId}.`) }
            : { error: result.hardBlockers[0] ?? "Could not accept contract." },
    }));
}
async function handleContractsViewApi(response, saveId) {
    const payload = await loadContractsViewPayload(backend, airportReference, saveId, "scheduled");
    if (!payload) {
        sendJson(response, 409, {
            error: "Contracts view is not available for this save yet.",
        });
        return;
    }
    sendJson(response, 200, {
        payload,
    });
}
async function handleAcceptContractApi(response, saveId, form) {
    const contractOfferId = form.get("contractOfferId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_accept_api"),
        saveId,
        commandName: "AcceptContractOffer",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: { contractOfferId },
    });
    const payload = await loadContractsViewPayload(backend, airportReference, saveId, "scheduled");
    const tabPayload = await buildTabApiPayload(saveId, "contracts");
    if (!payload || !tabPayload) {
        sendJson(response, 500, {
            success: false,
            error: result.success
                ? "The contract was accepted, but the updated market view could not be loaded."
                : result.hardBlockers[0] ?? "Could not accept contract.",
        });
        return;
    }
    sendJson(response, result.success ? 200 : 400, {
        success: result.success,
        message: result.success ? buildAcceptedContractMessage(payload, result, contractOfferId) : undefined,
        error: result.success ? undefined : result.hardBlockers[0] ?? "Could not accept contract.",
        notificationLevel: result.success ? "important" : undefined,
        shell: tabPayload.shell,
        payload,
    });
}
async function handleCancelContractApi(response, saveId, form) {
    const companyContractId = form.get("companyContractId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_cancel_contract_api"),
        saveId,
        commandName: "CancelCompanyContract",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: { companyContractId },
    });
    const payload = await loadContractsViewPayload(backend, airportReference, saveId, "scheduled");
    const tabPayload = await buildTabApiPayload(saveId, "contracts");
    if (!payload || !tabPayload) {
        sendJson(response, 500, {
            success: false,
            error: result.success
                ? "The contract was cancelled, but the updated market view could not be loaded."
                : result.hardBlockers[0] ?? "Could not cancel contract.",
        });
        return;
    }
    sendJson(response, result.success ? 200 : 400, {
        success: result.success,
        message: result.success ? buildCancelledContractMessage(payload, result, companyContractId) : undefined,
        error: result.success ? undefined : result.hardBlockers[0] ?? "Could not cancel contract.",
        notificationLevel: result.success ? "important" : undefined,
        shell: tabPayload.shell,
        payload,
    });
}
async function sendContractsTabApiResponse(response, saveId, result) {
    const payload = await loadContractsViewPayload(backend, airportReference, saveId, "scheduled");
    const tabPayload = await buildTabApiPayload(saveId, "contracts");
    if (!payload || !tabPayload) {
        sendJson(response, 500, {
            success: false,
            error: result.success
                ? "The contracts view could not be reloaded after the update."
                : result.error ?? "Could not refresh contracts.",
        });
        return;
    }
    sendJson(response, result.success ? 200 : 400, {
        success: result.success,
        message: result.message,
        error: result.error,
        notificationLevel: result.notificationLevel,
        shell: tabPayload.shell,
        payload,
    });
}
async function handlePlannerAddApi(response, saveId, form) {
    const sourceType = form.get("sourceType") === "accepted_contract" ? "accepted_contract" : "candidate_offer";
    const sourceId = form.get("sourceId") ?? "";
    const result = await backend.withExistingSaveDatabase(saveId, async (context) => {
        const mutationResult = sourceType === "accepted_contract"
            ? addAcceptedContractToRoutePlan(context.saveDatabase, saveId, sourceId)
            : addCandidateOfferToRoutePlan(context.saveDatabase, saveId, sourceId);
        await context.saveDatabase.persist();
        return mutationResult;
    });
    await sendContractsTabApiResponse(response, saveId, {
        success: result?.success ?? false,
        message: result?.success ? result.message ?? "Added item to the route plan." : undefined,
        error: result?.success ? undefined : result?.error ?? "Could not add item to the route plan.",
        notificationLevel: result?.success ? "routine" : undefined,
    });
}
async function handlePlannerRemoveApi(response, saveId, form) {
    const routePlanItemId = form.get("routePlanItemId") ?? "";
    const result = await backend.withExistingSaveDatabase(saveId, async (context) => {
        const mutationResult = removeRoutePlanItem(context.saveDatabase, saveId, routePlanItemId);
        await context.saveDatabase.persist();
        return mutationResult;
    });
    await sendContractsTabApiResponse(response, saveId, {
        success: result?.success ?? false,
        message: result?.success ? result.message ?? "Removed route plan item." : undefined,
        error: result?.success ? undefined : result?.error ?? "Could not remove route plan item.",
        notificationLevel: result?.success ? "routine" : undefined,
    });
}
async function handlePlannerReorderApi(response, saveId, form) {
    const routePlanItemId = form.get("routePlanItemId") ?? "";
    const direction = form.get("direction") === "down" ? "down" : "up";
    const result = await backend.withExistingSaveDatabase(saveId, async (context) => {
        const mutationResult = reorderRoutePlanItem(context.saveDatabase, saveId, routePlanItemId, direction);
        await context.saveDatabase.persist();
        return mutationResult;
    });
    await sendContractsTabApiResponse(response, saveId, {
        success: result?.success ?? false,
        message: result?.success ? result.message ?? "Reordered route plan item." : undefined,
        error: result?.success ? undefined : result?.error ?? "Could not reorder route plan item.",
        notificationLevel: result?.success ? "routine" : undefined,
    });
}
async function handlePlannerClearApi(response, saveId) {
    const result = await backend.withExistingSaveDatabase(saveId, async (context) => {
        const mutationResult = clearRoutePlan(context.saveDatabase, saveId);
        await context.saveDatabase.persist();
        return mutationResult;
    });
    await sendContractsTabApiResponse(response, saveId, {
        success: result?.success ?? false,
        message: result?.success ? result.message ?? "Cleared route plan." : undefined,
        error: result?.success ? undefined : result?.error ?? "Could not clear route plan.",
        notificationLevel: result?.success ? "routine" : undefined,
    });
}
async function handlePlannerAcceptApi(response, saveId, form) {
    const routePlanItemIds = form.getAll("routePlanItemId").map((value) => String(value));
    const result = await acceptRoutePlanOffers(backend, saveId, routePlanItemIds, commandId("cmd_route_plan_accept"));
    await sendContractsTabApiResponse(response, saveId, {
        success: result.success,
        message: result.success ? result.message ?? "Accepted planned offers." : undefined,
        error: result.success ? undefined : result.error ?? "Could not accept planned offers.",
        notificationLevel: result.success ? "important" : undefined,
    });
}
async function handleAutoPlanContract(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
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
        redirect(response, saveRoute(saveId, { tab, flash: { error: "Could not resolve the contract or aircraft for auto-planning." } }));
        return;
    }
    try {
        const earliestStart = contract.earliestStartUtc && contract.earliestStartUtc > companyContext.currentTimeUtc
            ? contract.earliestStartUtc
            : companyContext.currentTimeUtc;
        const legs = [];
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
            redirect(response, saveRoute(saveId, { tab, flash: { error: "Auto-plan would miss the contract deadline for this aircraft." } }));
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
        redirect(response, saveRoute(saveId, {
            tab,
            flash: result.hardBlockers.length > 0
                ? { error: result.hardBlockers[0] }
                : { notice: `Drafted schedule ${String(result.metadata?.scheduleId ?? "")}.` },
        }));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Auto-plan failed.";
        redirect(response, saveRoute(saveId, { tab, flash: { error: message } }));
    }
}
async function handleCommitSchedule(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
    const scheduleId = form.get("scheduleId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_commit"),
        saveId,
        commandName: "CommitAircraftSchedule",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: { scheduleId },
    });
    redirect(response, saveRoute(saveId, {
        tab,
        flash: result.success
            ? { notice: `Committed schedule ${scheduleId}.` }
            : { error: result.hardBlockers[0] ?? "Could not commit schedule." },
    }));
}
async function handleAdvanceTime(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
    const companyContext = await backend.loadCompanyContext(saveId);
    if (!companyContext) {
        redirect(response, saveRoute(saveId, { tab, flash: { error: "Could not load the save company context." } }));
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
    redirect(response, saveRoute(saveId, {
        tab,
        flash: result.success
            ? { notice: `Advanced time to ${String(result.metadata?.advancedToUtc ?? targetTimeUtc)} (${String(result.metadata?.stoppedBecause ?? "target_time")}).` }
            : { error: result.hardBlockers[0] ?? "Could not advance time." },
    }));
}
// The legacy action map supports the non-hydrated pages and keeps server form posts declarative.
const actionHandlers = {
    "/actions/create-save": handleCreateSave,
    "/actions/delete-save": handleDeleteSave,
    "/actions/create-company": handleCreateCompany,
    "/actions/acquire-aircraft": handleAcquireAircraft,
    "/actions/add-staffing": handleAddStaffing,
    "/actions/refresh-contract-board": handleRefreshContractBoard,
    "/actions/accept-contract": handleAcceptContract,
    "/actions/auto-plan-contract": handleAutoPlanContract,
    "/actions/commit-schedule": handleCommitSchedule,
    "/actions/advance-time": handleAdvanceTime,
};
function readFlashState(url) {
    const notice = url.searchParams.get("notice") ?? undefined;
    const error = url.searchParams.get("error") ?? undefined;
    return { notice, error };
}
function sendNotFound(response, saveIds, message) {
    response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    response.end(renderShell("Not Found", saveIds, undefined, { error: message }, `<div class="empty-state">${escapeHtml(message)}</div>`));
}
function logUiTiming(label, startedAtMs) {
    const durationMs = Date.now() - startedAtMs;
    console.log(`[ui:timing] ${label} ${durationMs}ms`);
}
async function withUiTiming(label, operation) {
    const startedAtMs = Date.now();
    try {
        return await operation();
    }
    finally {
        logUiTiming(label, startedAtMs);
    }
}
// The request router fans the raw Node request into assets, HTML pages, and incremental JSON shell endpoints.
async function handleRequest(request, response) {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? `localhost:${port}`}`);
    const pathname = requestUrl.pathname;
    const flash = readFlashState(requestUrl);
    const contractsViewMatch = pathname.match(/^\/api\/save\/([^/]+)\/contracts\/view$/);
    const contractsAcceptMatch = pathname.match(/^\/api\/save\/([^/]+)\/contracts\/accept$/);
    const contractsCancelMatch = pathname.match(/^\/api\/save\/([^/]+)\/contracts\/cancel$/);
    const contractsPlannerMatch = pathname.match(/^\/api\/save\/([^/]+)\/contracts\/planner\/([^/]+)$/);
    const bootstrapMatch = pathname.match(/^\/api\/save\/([^/]+)\/bootstrap$/);
    const tabMatch = pathname.match(/^\/api\/save\/([^/]+)\/tab\/([^/]+)$/);
    const clockMatch = pathname.match(/^\/api\/save\/([^/]+)\/clock(?:\/([^/]+))?$/);
    const actionApiMatch = pathname.match(/^\/api\/save\/([^/]+)\/actions\/([^/]+)$/);
    const openSaveMatch = pathname.match(/^\/open-save\/([^/]+)$/);
    const aircraftModelImageMatch = pathname.match(/^\/assets\/aircraft-images\/model\/([^/]+)$/);
    const aircraftImageMatch = pathname.match(/^\/assets\/aircraft-images\/([^/]+)$/);
    if (request.method === "GET" && pathname === "/assets/save-shell-client.js") {
        const assetSource = await readFile(saveShellClientAssetUrl, "utf8");
        response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    if (request.method === "GET" && pathname === "/assets/aircraft-tab-client.js") {
        const assetSource = await readFile(aircraftTabClientAssetUrl, "utf8");
        response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    if (request.method === "GET" && pathname === "/assets/contracts-tab-client.js") {
        const assetSource = await readFile(contractsTabClientAssetUrl, "utf8");
        response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    if (request.method === "GET" && pathname === "/assets/open-save-client.js") {
        const assetSource = await readFile(openSaveClientAssetUrl, "utf8");
        response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    if (request.method === "GET" && aircraftModelImageMatch) {
        const modelId = decodeURIComponent(aircraftModelImageMatch[1] ?? "");
        const resolved = await resolveAircraftImageAsset(modelId, aircraftReference.findModel(modelId));
        response.writeHead(200, {
            "content-type": resolved.contentType,
            "cache-control": resolved.cacheControl,
        });
        response.end(await readFile(resolved.filePath));
        return;
    }
    if (request.method === "GET" && aircraftImageMatch) {
        const resolved = await resolveAircraftImageAsset(aircraftImageMatch[1] ?? "");
        response.writeHead(200, {
            "content-type": resolved.contentType,
            "cache-control": resolved.cacheControl,
        });
        response.end(await readFile(resolved.filePath));
        return;
    }
    const uiBrowserModuleMatch = pathname.match(/^\/([a-z0-9-]+)\.js$/i);
    if (request.method === "GET" && uiBrowserModuleMatch) {
        const moduleName = uiBrowserModuleMatch[1]?.toLowerCase() ?? "";
        const moduleUrl = uiBrowserModuleAssetUrls.get(moduleName);
        if (moduleUrl) {
            const moduleSource = await readFile(moduleUrl, "utf8");
            response.writeHead(200, {
                "content-type": "text/javascript; charset=utf-8",
                "cache-control": "no-store",
            });
            response.end(moduleSource);
            return;
        }
    }
    if (request.method === "GET" && pathname === "/") {
        const saveIds = await listSaveIds();
        const confirmDeleteSaveId = readConfirmDeleteSaveId(requestUrl, saveIds);
        sendHtml(response, renderLauncherPage(saveIds, flash, confirmDeleteSaveId));
        return;
    }
    if (request.method === "GET" && bootstrapMatch) {
        const saveId = decodeURIComponent(bootstrapMatch[1] ?? "");
        const requestedTab = normalizeShellTab(requestUrl.searchParams.get("tab"));
        await withUiTiming(`bootstrap save=${saveId} tab=${requestedTab}`, () => handleBootstrapApi(response, saveId, requestedTab));
        return;
    }
    if (request.method === "GET" && tabMatch) {
        const saveId = decodeURIComponent(tabMatch[1] ?? "");
        const tabId = normalizeShellTab(tabMatch[2] ?? "dashboard");
        await withUiTiming(`tab save=${saveId} tab=${tabId}`, () => handleTabApi(response, saveId, tabId));
        return;
    }
    if (request.method === "GET" && clockMatch && !clockMatch[2]) {
        const saveId = decodeURIComponent(clockMatch[1] ?? "");
        const selectedLocalDate = requestUrl.searchParams.get("selectedDate") ?? undefined;
        await withUiTiming(`clock save=${saveId}`, () => handleClockApi(response, saveId, selectedLocalDate));
        return;
    }
    if (request.method === "POST" && clockMatch) {
        const saveId = decodeURIComponent(clockMatch[1] ?? "");
        const clockAction = clockMatch[2] ?? "";
        const form = await readForm(request);
        switch (clockAction) {
            case "tick":
                await withUiTiming(`clock save=${saveId} action=tick`, () => handleClockTickApi(response, saveId, form));
                return;
            case "advance-to-calendar-anchor":
                await withUiTiming(`clock save=${saveId} action=advance-to-calendar-anchor`, () => handleClockAdvanceToCalendarAnchorApi(response, saveId, form));
                return;
            default:
                sendJson(response, 404, { success: false, error: `Unknown clock action ${clockAction}.` });
                return;
        }
    }
    if (request.method === "POST" && actionApiMatch) {
        const saveId = decodeURIComponent(actionApiMatch[1] ?? "");
        const actionName = actionApiMatch[2] ?? "";
        const form = await readForm(request);
        switch (actionName) {
            case "create-company":
                await withUiTiming(`action save=${saveId} name=create-company`, () => handleCreateCompanyApi(response, saveId, form));
                return;
            case "acquire-aircraft":
                await withUiTiming(`action save=${saveId} name=acquire-aircraft`, () => handleAcquireAircraftApi(response, saveId, form));
                return;
            case "acquire-aircraft-offer":
                await withUiTiming(`action save=${saveId} name=acquire-aircraft-offer`, () => handleAcquireAircraftOfferApi(response, saveId, form));
                return;
            case "add-staffing":
                await withUiTiming(`action save=${saveId} name=add-staffing`, () => handleAddStaffingApi(response, saveId, form));
                return;
            case "auto-plan-contract":
                await withUiTiming(`action save=${saveId} name=auto-plan-contract`, () => handleAutoPlanContractApi(response, saveId, form));
                return;
            case "commit-schedule":
                await withUiTiming(`action save=${saveId} name=commit-schedule`, () => handleCommitScheduleApi(response, saveId, form));
                return;
            case "advance-time":
                await withUiTiming(`action save=${saveId} name=advance-time`, () => handleAdvanceTimeApi(response, saveId, form));
                return;
            case "bind-route-plan":
                await withUiTiming(`action save=${saveId} name=bind-route-plan`, () => handleBindRoutePlanApi(response, saveId, form));
                return;
            default:
                sendJson(response, 404, { success: false, error: `Unknown action ${actionName}.` });
                return;
        }
    }
    if (request.method === "GET" && contractsViewMatch) {
        const saveId = decodeURIComponent(contractsViewMatch[1] ?? "");
        await withUiTiming(`contracts-view save=${saveId}`, () => handleContractsViewApi(response, saveId));
        return;
    }
    if (request.method === "POST" && contractsAcceptMatch) {
        const saveId = decodeURIComponent(contractsAcceptMatch[1] ?? "");
        const form = await readForm(request);
        await withUiTiming(`contracts-accept save=${saveId}`, () => handleAcceptContractApi(response, saveId, form));
        return;
    }
    if (request.method === "POST" && contractsCancelMatch) {
        const saveId = decodeURIComponent(contractsCancelMatch[1] ?? "");
        const form = await readForm(request);
        await withUiTiming(`contracts-cancel save=${saveId}`, () => handleCancelContractApi(response, saveId, form));
        return;
    }
    if (request.method === "POST" && contractsPlannerMatch) {
        const saveId = decodeURIComponent(contractsPlannerMatch[1] ?? "");
        const plannerAction = contractsPlannerMatch[2] ?? "";
        const form = await readForm(request);
        switch (plannerAction) {
            case "add":
                await withUiTiming(`contracts-planner save=${saveId} action=add`, () => handlePlannerAddApi(response, saveId, form));
                return;
            case "remove":
                await withUiTiming(`contracts-planner save=${saveId} action=remove`, () => handlePlannerRemoveApi(response, saveId, form));
                return;
            case "reorder":
                await withUiTiming(`contracts-planner save=${saveId} action=reorder`, () => handlePlannerReorderApi(response, saveId, form));
                return;
            case "clear":
                await withUiTiming(`contracts-planner save=${saveId} action=clear`, () => handlePlannerClearApi(response, saveId));
                return;
            case "accept":
                await withUiTiming(`contracts-planner save=${saveId} action=accept`, () => handlePlannerAcceptApi(response, saveId, form));
                return;
            default:
                sendJson(response, 404, { success: false, error: `Unknown planner action ${plannerAction}.` });
                return;
        }
    }
    if (request.method === "GET" && openSaveMatch) {
        const saveIds = await listSaveIds();
        const saveId = decodeURIComponent(openSaveMatch[1] ?? "");
        if (!saveId || !saveIds.includes(saveId)) {
            sendNotFound(response, saveIds, `Save ${saveId || "(missing)"} was not found.`);
            return;
        }
        const activeTab = normalizeShellTab(requestUrl.searchParams.get("tab"));
        const destinationUrl = `${saveRoute(saveId, { tab: activeTab })}${activeTab === "dashboard" ? "?opened=1" : "&opened=1"}`;
        sendHtml(response, renderSaveOpeningPage(saveId, activeTab, destinationUrl, openSaveClientAssetPath));
        return;
    }
    if (request.method === "GET" && pathname.startsWith("/save/")) {
        const saveIds = await listSaveIds();
        const saveId = decodeURIComponent(pathname.slice("/save/".length));
        if (!saveId || !saveIds.includes(saveId)) {
            sendNotFound(response, saveIds, `Save ${saveId || "(missing)"} was not found.`);
            return;
        }
        sendHtml(response, renderIncrementalSavePage(saveId, normalizeShellTab(requestUrl.searchParams.get("tab")), saveShellClientAssetPath));
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
        response.end(renderShell("Server Error", await listSaveIds(), undefined, { error: message }, `<div class="empty-state">The local UI hit an unexpected error. Check the terminal for details.</div>`));
    });
});
let shuttingDown = false;
async function closeServer() {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    await new Promise((resolveClose) => {
        server.close(() => resolveClose());
    });
    await Promise.allSettled([
        backend.close(),
        airportReference.close(),
        aircraftReference.close(),
    ]);
}
for (const signal of ["SIGINT", "SIGTERM"]) {
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
await new Promise((resolveListen) => {
    server.listen(port, () => resolveListen());
});
console.log(`FlightLine UI running at http://localhost:${port}`);
// Incremental shell rendering is factored into this object so individual tabs can be reloaded over JSON without rebuilding the entire page.
const saveShellRenderers = {
    renderCreateCompany(saveId, tabId) {
        return `<section class="panel"><div class="panel-head"><h3>Create Company</h3></div><div class="panel-body"><form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/create-company" class="actions" data-api-form>${renderHiddenContext(saveId, tabId)}<div class="action-group"><label>Display Name<input name="displayName" value="FlightLine Regional" /></label><label>Starter Airport<input name="starterAirportId" value="KDEN" /></label><label>Starting Cash<input name="startingCashAmount" value="3500000" /></label></div><button type="submit" data-pending-label="Creating company...">Create company</button></form></div></section>`;
    },
    renderOverview(saveId, tabId, source, airportRepo) {
        const company = source.companyContext;
        const fleet = source.fleetState?.aircraft ?? [];
        const contracts = source.companyContracts?.contracts ?? [];
        const schedules = source.schedules.filter((schedule) => schedule.scheduleState !== "completed");
        const idleCount = fleet.filter((aircraft) => aircraft.dispatchAvailable).length;
        return `<div class="view-grid two-up"><section class="panel"><div class="panel-head"><h3>Control Tower</h3><form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/advance-time" class="inline" data-api-form>${renderHiddenContext(saveId, tabId)}<input type="hidden" name="hours" value="12" /><input type="hidden" name="stopMode" value="target_time" /><button type="submit" data-pending-label="Advancing time...">Advance 12h</button></form></div><div class="panel-body"><div class="summary-list"><div class="summary-item"><div class="eyebrow">Company</div><strong>${escapeHtml(company.displayName)}</strong><div class="muted">${escapeHtml(company.companyPhase.replaceAll("_", " "))} | Tier ${company.progressionTier}</div></div><div class="summary-item"><div class="eyebrow">Fleet posture</div><strong>${idleCount}/${fleet.length}</strong><div class="muted">Dispatch-ready aircraft.</div></div><div class="summary-item"><div class="eyebrow">Schedule load</div><strong>${schedules.length}</strong><div class="muted">Draft and committed schedules currently visible.</div></div></div></div></section><section class="panel"><div class="panel-head"><h3>Execution Queue</h3></div><div class="panel-body">${contracts.length === 0 ? `<div class="empty-state">No accepted company contracts yet.</div>` : `<div class="summary-list">${contracts.slice(0, 6).map((contract) => `<div class="summary-item compact"><div class="meta-stack"><div class="pill-row">${renderBadge(contract.contractState)}</div><strong>${renderRouteDisplay(contract.originAirportId, contract.destinationAirportId)}</strong><span class="muted">${formatPayload(contract.volumeType, contract.passengerCount, contract.cargoWeightLb)} | due ${formatDate(contract.deadlineUtc)}</span></div></div>`).join("")}</div>`}</div></section></div>`;
    },
    renderAircraft(saveId, tabId, source, airportRepo) {
        void tabId;
        void airportRepo;
        void source;
        return `<div class="aircraft-tab-main" data-aircraft-tab-host><section class="panel"><div class="panel-body"><div class="empty-state compact">Loading aircraft workspace...</div></div></section></div>`;
    },
    renderStaffing(saveId, tabId, source) {
        const staffingState = source.staffingState;
        const coverage = staffingState?.coverageSummaries ?? [];
        const packages = staffingState?.staffingPackages ?? [];
        const actionButtons = Object.entries(staffingPresets).map(([presetKey, preset]) => `<form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/add-staffing" class="inline" data-api-form>${renderHiddenContext(saveId, tabId)}<input type="hidden" name="presetKey" value="${escapeHtml(presetKey)}" /><button type="submit" data-pending-label="Activating staffing...">${escapeHtml(preset.label)}</button></form>`).join("");
        return `<div class="view-grid two-up"><section class="panel"><div class="panel-head"><h3>Activate Staffing</h3></div><div class="panel-body"><div class="actions"><div class="action-group tight">${actionButtons}</div></div></div></section><section class="panel"><div class="panel-head"><h3>Coverage Summary</h3></div><div class="panel-body">${coverage.length === 0 ? `<div class="empty-state">No staffing coverage is active yet.</div>` : `<div class="table-wrap"><table><thead><tr><th>Category</th><th>Qualification</th><th>Active</th><th>Pending</th></tr></thead><tbody>${coverage.map((summary) => `<tr><td>${escapeHtml(summary.laborCategory)}</td><td>${escapeHtml(summary.qualificationGroup)}</td><td>${formatNumber(summary.activeCoverageUnits)}</td><td>${formatNumber(summary.pendingCoverageUnits)}</td></tr>`).join("")}</tbody></table></div>`}</div></section></div><section class="panel"><div class="panel-head"><h3>Packages</h3></div><div class="panel-body">${packages.length === 0 ? `<div class="empty-state">Activate packages to create labor capacity.</div>` : `<div class="table-wrap"><table><thead><tr><th>Category</th><th>Model</th><th>Coverage</th><th>Cost</th></tr></thead><tbody>${packages.map((pkg) => `<tr><td>${escapeHtml(pkg.laborCategory)}</td><td>${escapeHtml(pkg.qualificationGroup)}</td><td>${formatNumber(pkg.coverageUnits)}</td><td>${formatMoney(pkg.fixedCostAmount)}</td></tr>`).join("")}</tbody></table></div>`}</div></section>`;
    },
    renderDispatch(saveId, tabId, source, airportRepo) {
        void airportRepo;
        const fleet = source.fleetState?.aircraft ?? [];
        const contracts = source.companyContracts?.contracts ?? [];
        const schedules = source.schedules;
        const routePlanItems = source.routePlan?.items ?? [];
        const acceptedReadyItems = routePlanItems.filter((item) => item.plannerItemStatus === "accepted_ready");
        const blockerItems = routePlanItems.filter((item) => item.plannerItemStatus === "candidate_available" || item.plannerItemStatus === "candidate_stale");
        const scheduledPlanItems = routePlanItems.filter((item) => item.plannerItemStatus === "scheduled");
        const aircraftById = new Map(fleet.map((aircraft) => [aircraft.aircraftId, aircraft]));
        const pilotOptions = fleet.map((aircraft) => `<option value="${escapeHtml(aircraft.aircraftId)}">${escapeHtml(aircraft.registration)} | ${escapeHtml(aircraft.modelDisplayName)} | ${escapeHtml(aircraft.currentAirportId)}</option>`).join("");
        const acceptedContracts = contracts.filter((contract) => contract.contractState === "accepted");
        return `<div class="view-grid two-up"><section class="panel"><div class="panel-head"><h3>Advance Time</h3></div><div class="panel-body"><form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/advance-time" class="actions" data-api-form>${renderHiddenContext(saveId, tabId)}<div class="action-group"><label>Hours<input name="hours" type="number" min="1" value="24" /></label><label>Stop Mode<select name="stopMode"><option value="target_time">Target time</option><option value="leg_completed">Until leg completed</option></select></label></div><button type="submit" data-pending-label="Advancing time...">Advance time</button></form></div></section><section class="panel"><div class="panel-head"><h3>Route Plan Handoff</h3></div><div class="panel-body">${routePlanItems.length === 0 ? `<div class="empty-state">Add contracts to the route plan from the Contracts tab to hand them off here.</div>` : `<div class="summary-list">${routePlanItems.map((item) => `<div class="summary-item compact"><div class="meta-stack"><div class="pill-row">${renderBadge(item.plannerItemStatus)}</div><strong>${renderRouteDisplay(item.originAirportId, item.destinationAirportId)}</strong><span class="muted">${escapeHtml(formatPayload(item.volumeType, item.passengerCount, item.cargoWeightLb))} | due ${escapeHtml(formatDate(item.deadlineUtc))}</span></div></div>`).join("")}</div><div class="summary-list"><div class="summary-item compact"><div class="eyebrow">Accepted-ready</div><strong>${acceptedReadyItems.length}</strong><span class="muted">${blockerItems.length} blockers | ${scheduledPlanItems.length} scheduled</span></div><div class="summary-item compact"><div class="eyebrow">Current endpoint</div><strong>${escapeHtml(source.routePlan?.endpointAirportId ?? "-")}</strong><span class="muted">Last non-stale planned destination.</span></div></div>${acceptedReadyItems.length > 0 && fleet.length > 0 ? `<form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/bind-route-plan" class="actions" data-api-form>${renderHiddenContext(saveId, tabId)}<label>Aircraft<select name="aircraftId">${pilotOptions}</select></label><button type="submit" data-pending-label="Drafting route plan...">Draft from route plan</button></form>` : fleet.length === 0 ? `<div class="empty-state compact">Acquire aircraft before binding a route plan.</div>` : `<div class="empty-state compact">No accepted-ready planner items yet. Accept planned offers first.</div>`}`} </div></section></div><div class="view-grid two-up"><section class="panel"><div class="panel-head"><h3>Accepted Work</h3></div><div class="panel-body">${acceptedContracts.length === 0 ? `<div class="empty-state">No accepted contracts waiting for assignment.</div>` : `<div class="table-wrap"><table><thead><tr><th>Route</th><th>Deadline</th><th>Aircraft</th><th></th></tr></thead><tbody>${acceptedContracts.map((contract) => `<tr><td>${renderRouteDisplay(contract.originAirportId, contract.destinationAirportId)}</td><td>${formatDate(contract.deadlineUtc)}</td><td><select name="aircraftId" form="auto-plan-${escapeHtml(contract.companyContractId)}">${pilotOptions}</select></td><td>${fleet.length > 0 ? `<form id="auto-plan-${escapeHtml(contract.companyContractId)}" method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/auto-plan-contract" class="inline" data-api-form>${renderHiddenContext(saveId, tabId)}<input type="hidden" name="companyContractId" value="${escapeHtml(contract.companyContractId)}" /><button type="submit" data-pending-label="Drafting schedule...">Auto-plan</button></form>` : `<span class="muted">Acquire aircraft first.</span>`}</td></tr>`).join("")}</tbody></table></div>`}</div></section><section class="panel"><div class="panel-head"><h3>Schedules</h3></div><div class="panel-body">${schedules.length === 0 ? `<div class="empty-state">No schedules created yet.</div>` : `<div class="table-wrap"><table><thead><tr><th>Aircraft</th><th>State</th><th>Timing</th><th></th></tr></thead><tbody>${schedules.map((schedule) => { const aircraft = aircraftById.get(schedule.aircraftId); return `<tr><td><div class="meta-stack"><span class="route">${escapeHtml(aircraft?.registration ?? schedule.aircraftId)}</span><span class="muted">${escapeHtml(aircraft?.modelDisplayName ?? schedule.aircraftId)}</span></div></td><td>${renderBadge(schedule.isDraft ? "draft" : schedule.scheduleState)}</td><td><div class="meta-stack"><span>${formatDate(schedule.plannedStartUtc)}</span><span class="muted">to ${formatDate(schedule.plannedEndUtc)}</span></div></td><td>${schedule.isDraft ? `<form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/commit-schedule" class="inline" data-api-form>${renderHiddenContext(saveId, tabId)}<input type="hidden" name="scheduleId" value="${escapeHtml(schedule.scheduleId)}" /><button type="submit" data-pending-label="Committing schedule...">Commit</button></form>` : ``}</td></tr>`; }).join("")}</tbody></table></div>`}</div></section></div>`;
    },
    renderActivity(source) {
        return `<section class="panel"><div class="panel-head"><h3>Recent Activity</h3></div><div class="panel-body">${!source.eventLog || source.eventLog.entries.length === 0 ? `<div class="empty-state">No event log entries yet.</div>` : `<div class="event-list">${source.eventLog.entries.map((entry) => `<div class="event-item"><div class="meta-stack"><div>${renderBadge(entry.severity ?? "info")} <strong>${escapeHtml(entry.message)}</strong></div><div class="muted">${formatDate(entry.eventTimeUtc)} | ${escapeHtml(entry.eventType)}</div></div></div>`).join("")}</div>`}</div></section>`;
    },
    renderContractsHost(saveId) {
        return `<div class="contracts-host" data-contracts-host><section class="panel"><div class="panel-body"><div class="empty-state compact">Loading contracts board...</div></div></section></div>`;
    },
};
// These JSON endpoints power the hydrated shell by reloading only the chrome, tab, and clock fragments that changed.
async function buildBootstrapApiPayload(saveId, initialTab) {
    return buildBootstrapPayload(backend, saveId, initialTab);
}
async function buildTabApiPayload(saveId, tabId) {
    return buildTabPayload(backend, saveId, tabId, saveShellRenderers);
}
async function buildClockApiPayload(saveId, selectedLocalDate) {
    return loadClockPanelPayload(backend, saveId, selectedLocalDate);
}
async function sendClockActionResponse(response, saveId, tab, selectedLocalDate, result, options = {}) {
    const [bootstrapPayload, clockPayload, tabPayload] = await Promise.all([
        buildBootstrapApiPayload(saveId, tab),
        buildClockApiPayload(saveId, selectedLocalDate),
        options.includeTab ? buildTabApiPayload(saveId, tab) : Promise.resolve(null),
    ]);
    if (!bootstrapPayload || !clockPayload) {
        sendJson(response, 409, {
            success: false,
            error: result.error ?? "The clock state could not be reloaded.",
        });
        return;
    }
    if (options.includeTab && !tabPayload) {
        sendJson(response, 409, {
            success: false,
            error: result.error ?? "The active tab could not be reloaded.",
            shell: bootstrapPayload.shell,
            clock: clockPayload,
        });
        return;
    }
    sendJson(response, result.success ? 200 : 400, {
        success: result.success,
        message: result.message,
        error: result.error,
        notificationLevel: result.notificationLevel,
        shell: tabPayload?.shell ?? bootstrapPayload.shell,
        tab: tabPayload ?? undefined,
        clock: clockPayload,
    });
}
function renderHiddenContext(saveId, tabId) {
    return `<input type="hidden" name="saveId" value="${escapeHtml(saveId)}" /><input type="hidden" name="tab" value="${escapeHtml(tabId)}" />`;
}
async function handleBindRoutePlanApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const aircraftId = form.get("aircraftId") ?? "";
    try {
        const result = await bindRoutePlanToAircraft(backend, saveId, aircraftId, commandId("cmd_route_plan_bind_api"));
        await sendShellActionResponse(response, saveId, tab, result.success
            ? { success: true, message: result.message ?? "Drafted route plan schedule.", notificationLevel: "important" }
            : { success: false, error: result.error ?? "Could not draft the route plan schedule." });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Route plan binding failed.";
        await sendShellActionResponse(response, saveId, tab, { success: false, error: message });
    }
}
async function sendShellActionResponse(response, saveId, tab, result) {
    const tabPayload = await buildTabApiPayload(saveId, tab);
    if (!tabPayload) {
        sendJson(response, 409, {
            success: false,
            error: result.error ?? "The save shell could not be reloaded.",
        });
        return;
    }
    sendJson(response, result.success ? 200 : 400, {
        success: result.success,
        message: result.message,
        error: result.error,
        notificationLevel: result.notificationLevel,
        shell: tabPayload.shell,
        tab: tabPayload,
    });
}
async function handleBootstrapApi(response, saveId, requestedTab) {
    const payload = await buildBootstrapApiPayload(saveId, requestedTab);
    if (!payload) {
        sendJson(response, 404, { error: `Save ${saveId} was not found.` });
        return;
    }
    sendJson(response, 200, payload);
}
async function handleTabApi(response, saveId, tabId) {
    const payload = await buildTabApiPayload(saveId, tabId);
    if (!payload) {
        sendJson(response, 404, { error: `Save ${saveId} was not found.` });
        return;
    }
    sendJson(response, 200, payload);
}
async function handleCreateCompanyApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const displayName = form.get("displayName")?.trim() || "FlightLine Regional";
    const result = await backend.dispatch({
        commandId: commandId("cmd_company_api"),
        saveId,
        commandName: "CreateCompany",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            displayName,
            starterAirportId: form.get("starterAirportId")?.trim().toUpperCase() || "KDEN",
            startingCashAmount: Number.parseInt(form.get("startingCashAmount") ?? "3500000", 10),
        },
    });
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: `Created company ${displayName}.`, notificationLevel: "important" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not create company." });
}
async function handleAcquireAircraftApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const company = await backend.loadCompanyContext(saveId);
    const selectedOption = starterAircraftOptions.find((option) => option.modelId === form.get("aircraftModelId")) ?? starterAircraftOptions[0];
    const result = await backend.dispatch({
        commandId: commandId("cmd_acquire_api"),
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
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: `Acquired ${selectedOption.label}.`, notificationLevel: "important" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not acquire aircraft." });
}
async function handleAcquireAircraftOfferApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const aircraftOfferId = form.get("aircraftOfferId") ?? "";
    const ownershipType = form.get("ownershipType");
    if (ownershipType !== "owned" && ownershipType !== "financed" && ownershipType !== "leased") {
        await sendShellActionResponse(response, saveId, tab, { success: false, error: "Unknown aircraft deal structure." });
        return;
    }
    const market = await backend.loadActiveAircraftMarket(saveId);
    const offer = market?.offers.find((entry) => entry.aircraftOfferId === aircraftOfferId && entry.offerStatus === "available");
    if (!offer) {
        await sendShellActionResponse(response, saveId, tab, { success: false, error: "That aircraft listing is no longer available." });
        return;
    }
    const model = aircraftReference.findModel(offer.aircraftModelId);
    const dealLabel = ownershipType === "financed" ? "loan" : ownershipType === "leased" ? "lease" : "purchase";
    const termMonths = parseOptionalIntegerFormValue(form.get("termMonths"));
    const upfrontPaymentAmount = parseOptionalCurrencyFormValue(form.get("upfrontPaymentAmount"));
    const recurringPaymentAmount = parseOptionalCurrencyFormValue(form.get("recurringPaymentAmount"));
    const rateBandOrApr = parseOptionalFloatFormValue(form.get("rateBandOrApr"));
    const paymentCadence = parseOptionalCadenceFormValue(form.get("paymentCadence"));
    const result = await backend.dispatch({
        commandId: commandId("cmd_aircraft_offer_acquire_api"),
        saveId,
        commandName: "AcquireAircraft",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            aircraftModelId: offer.aircraftModelId,
            activeCabinLayoutId: offer.activeCabinLayoutId,
            deliveryAirportId: offer.currentAirportId,
            ownershipType,
            registration: offer.registration,
            displayName: offer.displayName,
            sourceOfferId: offer.aircraftOfferId,
            upfrontPaymentAmount,
            recurringPaymentAmount,
            paymentCadence,
            termMonths,
            rateBandOrApr,
        },
    });
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: `Acquired ${model?.displayName ?? offer.displayName} at ${offer.currentAirportId} via ${dealLabel}${termMonths ? ` (${termMonths} mo)` : ""}.`, notificationLevel: "important" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not acquire that aircraft listing." });
}
async function handleAddStaffingApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const preset = staffingPresets[form.get("presetKey")];
    if (!preset) {
        await sendShellActionResponse(response, saveId, tab, { success: false, error: "Unknown staffing preset." });
        return;
    }
    const result = await backend.dispatch({
        commandId: commandId("cmd_staffing_api"),
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
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: `Activated ${preset.label}.`, notificationLevel: "routine" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not add staffing." });
}
async function handleCommitScheduleApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const scheduleId = form.get("scheduleId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_commit_api"),
        saveId,
        commandName: "CommitAircraftSchedule",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: { scheduleId },
    });
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: `Committed schedule ${scheduleId}.`, notificationLevel: "important" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not commit schedule." });
}
async function handleAdvanceTimeApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const companyContext = await backend.loadCompanyContext(saveId);
    if (!companyContext) {
        await sendShellActionResponse(response, saveId, tab, { success: false, error: "Could not load the save company context." });
        return;
    }
    const requestedHours = Number.parseInt(form.get("hours") ?? "24", 10);
    const hours = Number.isNaN(requestedHours) ? 24 : Math.max(1, Math.min(requestedHours, 24 * 14));
    const stopMode = form.get("stopMode") === "leg_completed" ? "leg_completed" : "target_time";
    const targetTimeUtc = addHoursIso(companyContext.currentTimeUtc, hours);
    const result = await backend.dispatch({
        commandId: commandId("cmd_advance_api"),
        saveId,
        commandName: "AdvanceTime",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            targetTimeUtc,
            stopConditions: stopMode === "leg_completed" ? ["leg_completed"] : ["target_time"],
        },
    });
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: `Advanced time to ${String(result.metadata?.advancedToUtc ?? targetTimeUtc)} (${String(result.metadata?.stoppedBecause ?? "target_time")}).`, notificationLevel: "routine" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not advance time." });
}
async function handleClockApi(response, saveId, selectedLocalDate) {
    const payload = await buildClockApiPayload(saveId, selectedLocalDate);
    if (!payload) {
        sendJson(response, 404, { error: `Clock view for save ${saveId} is not available.` });
        return;
    }
    sendJson(response, 200, { payload });
}
async function handleClockTickApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const selectedLocalDate = form.get("selectedLocalDate") ?? undefined;
    const companyContext = await backend.loadCompanyContext(saveId);
    if (!companyContext) {
        await sendClockActionResponse(response, saveId, tab, selectedLocalDate, {
            success: false,
            error: "Could not load the save company context.",
        });
        return;
    }
    const requestedMinutes = Number.parseInt(form.get("minutes") ?? "0", 10);
    const minutes = Number.isNaN(requestedMinutes) ? 0 : Math.max(0, Math.min(requestedMinutes, 24 * 60));
    if (minutes <= 0) {
        await sendClockActionResponse(response, saveId, tab, selectedLocalDate, {
            success: true,
        });
        return;
    }
    const targetTimeUtc = addMinutesIso(companyContext.currentTimeUtc, minutes);
    const result = await backend.dispatch({
        commandId: commandId("cmd_clock_tick_api"),
        saveId,
        commandName: "AdvanceTime",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            targetTimeUtc,
            stopConditions: ["target_time", "critical_alert"],
        },
    });
    const stoppedBecause = String(result.metadata?.stoppedBecause ?? "target_time");
    const includeTab = tab === "aircraft" && Boolean(result.metadata?.aircraftMarketChanged);
    await sendClockActionResponse(response, saveId, tab, selectedLocalDate, result.success
        ? {
            success: true,
            message: stoppedBecause !== "target_time" ? `Clock paused at ${String(result.metadata?.advancedToUtc ?? targetTimeUtc)} because ${stoppedBecause.replaceAll("_", " ")}.` : undefined,
            notificationLevel: stoppedBecause !== "target_time" ? "important" : undefined,
        }
        : {
            success: false,
            error: result.hardBlockers[0] ?? "Could not advance the simulation clock.",
        }, { includeTab });
}
async function handleClockAdvanceToCalendarAnchorApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const localDate = form.get("localDate") ?? "";
    const clockPayload = await buildClockApiPayload(saveId, localDate || undefined);
    if (!clockPayload) {
        await sendClockActionResponse(response, saveId, tab, localDate || undefined, {
            success: false,
            error: "Clock view is not available for this save.",
        });
        return;
    }
    const targetTimeUtc = resolveCalendarAnchorUtc(localDate, "06:00", clockPayload.timeZone);
    if (Date.parse(targetTimeUtc) <= Date.parse(clockPayload.currentTimeUtc)) {
        await sendClockActionResponse(response, saveId, tab, localDate || undefined, {
            success: false,
            error: "Sim to the selected morning is not available for that day.",
        });
        return;
    }
    const result = await backend.dispatch({
        commandId: commandId("cmd_clock_anchor_api"),
        saveId,
        commandName: "AdvanceTime",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            targetTimeUtc,
            stopConditions: ["target_time", "critical_alert"],
        },
    });
    const stoppedBecause = String(result.metadata?.stoppedBecause ?? "target_time");
    const includeTab = tab === "aircraft" && Boolean(result.metadata?.aircraftMarketChanged);
    await sendClockActionResponse(response, saveId, tab, localDate, result.success
        ? {
            success: true,
            message: stoppedBecause === "target_time"
                ? `Advanced to the selected morning on ${localDate}.`
                : `Stopped before the selected morning on ${localDate} because ${stoppedBecause.replaceAll("_", " ")}.`,
            notificationLevel: stoppedBecause === "target_time" ? "routine" : "important",
        }
        : {
            success: false,
            error: result.hardBlockers[0] ?? "Could not advance to the selected calendar anchor.",
        }, { includeTab });
}
async function handleAutoPlanContractApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
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
        await sendShellActionResponse(response, saveId, tab, { success: false, error: "Could not resolve the contract or aircraft for auto-planning." });
        return;
    }
    try {
        const earliestStart = contract.earliestStartUtc && contract.earliestStartUtc > companyContext.currentTimeUtc
            ? contract.earliestStartUtc
            : companyContext.currentTimeUtc;
        const legs = [];
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
            await sendShellActionResponse(response, saveId, tab, { success: false, error: "Auto-plan would miss the contract deadline for this aircraft." });
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
            commandId: commandId("cmd_draft_api"),
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
        await sendShellActionResponse(response, saveId, tab, result.hardBlockers.length > 0
            ? { success: false, error: result.hardBlockers[0] ?? "Could not draft the schedule." }
            : { success: true, message: `Drafted schedule ${String(result.metadata?.scheduleId ?? "")}.`, notificationLevel: "important" });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Auto-plan failed.";
        await sendShellActionResponse(response, saveId, tab, { success: false, error: message });
    }
}

