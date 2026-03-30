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
import { buildGeneratedSaveId, deleteSaveFile, listSaveIds as listSaveSlotIds, resolveRequestedSaveId } from "./save-slot-files.js";
import { loadContractsViewPayload } from "./contracts-view.js";
import { buildBootstrapPayload, buildTabPayload, normalizeTab as normalizeShellTab } from "./save-shell-fragments.js";
import { loadClockPanelPayload, resolveCalendarAnchorUtc } from "./clock-calendar.js";
import { acceptRoutePlanOffers } from "./route-plan-accept.js";
import { bindRoutePlanToAircraft } from "./route-plan-dispatch.js";
import { addAcceptedContractToRoutePlan, addCandidateOfferToRoutePlan, clearRoutePlan, removeRoutePlanItem, reorderRoutePlanItem, } from "./route-plan-state.js";
import { renderSaveOpeningPage } from "./save-opening-page.js";
import { renderIncrementalSavePage } from "./save-shell-page.js";
import { resolveAircraftImageAsset } from "./aircraft-image-cache.js";
import { ensureStaffPortraitAsset, isValidStaffPortraitAssetId, readStaffPortraitAsset, resolveStaffPortraitAssetId, } from "./staff-portrait-cache.js";
import { validateProposedSchedule } from "../application/dispatch/schedule-validation.js";
import {
    isRecognizedDifficultyProfile,
    normalizeDifficultyProfile,
    startingCashAmountForDifficulty,
} from "../domain/save-runtime/difficulty-profile.js";
import { planDispatchContractWork } from "./dispatch-contract-planning.js";
import { launcherRoute, openSaveRoute, readConfirmDeleteSaveId, readFlashState, readForm, redirect, saveRoute, sendHtml, sendJson, withUiTiming } from "./server-http.js";
import { createServerPageHandlers } from "./server-page-routes.js";
import { renderOverviewFinanceSection } from "./server-overview-finance-render.js";
import { createServerRequestRouter } from "./server-request-router.js";
import { createSaveShellRenderers } from "./server-save-shell-renderers.js";
import { createShellApiHandlers } from "./server-shell-api.js";
import { createServerShellPageRenderers } from "./server-shell-page-render.js";
import { createStaffingRenderers } from "./server-staffing-render.js";
// Process-wide resources are initialized once because every request shares the same backend and the same reference catalogs.
const port = Number.parseInt(process.env.PORT ?? "4321", 10);
const turnaroundMinutes = 45;
const saveDirectoryPath = resolve(process.cwd(), "data", "saves");
const airportDatabasePath = resolve(process.cwd(), "data", "airports", "flightline-airports.sqlite");
const contractsTabClientAssetUrl = new URL("./public/contracts-tab-client.js", import.meta.url);
const aircraftTabClientAssetUrl = new URL("./public/aircraft-tab-client.js", import.meta.url);
const dispatchTabClientAssetUrl = new URL("./public/dispatch-tab-client.js", import.meta.url);
const staffingTabClientAssetUrl = new URL("./public/staffing-tab-client.js", import.meta.url);
const aircraftDatabasePath = resolve(process.cwd(), "data", "aircraft", "flightline-aircraft.sqlite");
const openSaveClientAssetUrl = new URL("./public/open-save-client.js", import.meta.url);
const saveShellClientAssetUrl = new URL("./public/save-shell-client.js", import.meta.url);
const pilotCertificationsModuleAssetUrl = new URL("../domain/staffing/pilot-certifications.js", import.meta.url);
const dispatchPilotAssignmentModuleAssetUrl = new URL("../domain/dispatch/named-pilot-assignment.js", import.meta.url);
const maintenanceRecoveryModuleAssetUrl = new URL("../domain/maintenance/maintenance-recovery.js", import.meta.url);
const uiBrowserModuleAssetUrls = new Map<string, URL>([
    ["aircraft-image-sources", new URL("./aircraft-image-sources.js", import.meta.url)],
    ["aircraft-tab-model", new URL("./aircraft-tab-model.js", import.meta.url)],
    ["clock-calendar-model", new URL("./clock-calendar-model.js", import.meta.url)],
    ["contracts-board-model", new URL("./contracts-board-model.js", import.meta.url)],
    ["contracts-view-model", new URL("./contracts-view-model.js", import.meta.url)],
    ["dispatch-tab-model", new URL("./dispatch-tab-model.js", import.meta.url)],
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
const pilotCertificationDisplayOrder = ["SEPL", "SEPS", "MEPL", "MEPS", "JET", "JUMBO"];
const staffingQualificationLaneOrder = [
    "single_turboprop_utility",
    "single_turboprop_premium",
    "regional_turboprop",
    "twin_turboprop_utility",
    "twin_turboprop_commuter",
    "light_business_jet",
    "super_midsize_business_jet",
    "classic_regional_jet",
    "regional_jet",
    "narrowbody_airline",
    "widebody_airline",
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
function renderCompactAirportDisplay(airportId) {
    const airport = describeAirport(airportId);
    return `<span class="route">${escapeHtml(airport.code)} | ${escapeHtml(airport.primaryLabel)}</span>`;
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
function badgeClass(value) {
    if (["critical", "failed", "blocked", "overdue", "confirmed_unavailable"].includes(value)) {
        return "danger";
    }
    if (["warning", "late_completed", "assigned", "due_soon", "not_verified", "resting", "training", "reserved", "traveling", "available_soon", "pending"].includes(value)) {
        return "warn";
    }
    if (["active", "in_flight", "scheduled", "confirmed_available", "opportunity", "ready", "flying", "available_now"].includes(value)) {
        return "accent";
    }
    return "neutral";
}
function renderBadge(label) {
    return `<span class="badge ${badgeClass(label)}">${escapeHtml(label.replaceAll("_", " "))}</span>`;
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
function resolveCreateCompanySubmission(form) {
    const rawDifficultyProfile = typeof form.get("difficultyProfile") === "string"
        ? form.get("difficultyProfile").trim()
        : "";
    const difficultyProfile = rawDifficultyProfile.length > 0 ? rawDifficultyProfile : undefined;
    const difficultyForFixedCash = difficultyProfile && isRecognizedDifficultyProfile(difficultyProfile)
        ? normalizeDifficultyProfile(difficultyProfile)
        : "hard";
    const rawStartingCashAmount = form.get("startingCashAmount");
    const parsedStartingCashAmount = parseOptionalIntegerFormValue(rawStartingCashAmount);
    const startingCashAmount = typeof rawStartingCashAmount === "string" && rawStartingCashAmount.trim().length > 0
        ? (parsedStartingCashAmount ?? Number.NaN)
        : startingCashAmountForDifficulty(difficultyForFixedCash);
    return {
        difficultyProfile,
        startingCashAmount,
    };
}
// Route helpers centralize URL building so links, redirects, and client fallbacks stay aligned.
// Request parsing and response helpers bridge raw Node HTTP primitives to the render and action handlers.
async function listSaveIds() {
    return listSaveSlotIds(saveDirectoryPath);
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
function resolveSelectedNamedPilotIdsFromForm(form) {
    return [...new Set(
        [...form.getAll("selectedNamedPilotIds"), ...form.getAll("selectedNamedPilotId")]
            .map((entry) => typeof entry === "string" ? entry.trim() : "")
            .filter((entry) => entry.length > 0),
    )];
}
// Server-rendered page helpers still support the launcher and the non-hydrated shell paths.
async function handleCreateSave(response, form) {
    const saveId = resolveRequestedSaveId(form.get("saveName"), buildGeneratedSaveId("save"));
    const worldSeed = `world_${randomUUID()}`;
    const result = await backend.dispatch({
        commandId: commandId("cmd_save"),
        saveId,
        commandName: "CreateSaveGame",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            worldSeed,
            difficultyProfile: "hard",
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
    const { difficultyProfile, startingCashAmount } = resolveCreateCompanySubmission(form);
    const result = await backend.dispatch({
        commandId: commandId("cmd_company"),
        saveId,
        commandName: "CreateCompany",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            displayName: form.get("displayName")?.trim() || "FlightLine Regional",
            starterAirportId: form.get("starterAirportId")?.trim().toUpperCase() || "KDEN",
            difficultyProfile,
            startingCashAmount,
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
async function handleHirePilotCandidate(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
    const staffingOfferId = form.get("staffingOfferId") ?? "";
    const baseAirportId = String(form.get("baseAirportId") ?? "").trim().toUpperCase();
    const market = await backend.loadActiveStaffingMarket(saveId);
    const offer = market?.offers.find((entry) => entry.staffingOfferId === staffingOfferId && entry.offerStatus === "available" && entry.laborCategory === "pilot");
    if (!offer) {
        redirect(response, saveRoute(saveId, { tab, flash: { error: "That pilot candidate is no longer available." } }));
        return;
    }
    const result = await backend.dispatch({
        commandId: commandId("cmd_hire_pilot"),
        saveId,
        commandName: "ActivateStaffingPackage",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            laborCategory: offer.laborCategory,
            employmentModel: offer.employmentModel,
            qualificationGroup: offer.qualificationGroup,
            coverageUnits: offer.coverageUnits,
            fixedCostAmount: offer.fixedCostAmount,
            variableCostRate: offer.variableCostRate,
            baseAirportId,
            startsAtUtc: offer.startsAtUtc,
            endsAtUtc: offer.endsAtUtc,
            sourceOfferId: offer.staffingOfferId,
        },
    });
    redirect(response, saveRoute(saveId, {
        tab,
        flash: result.success
            ? { notice: result.validationMessages[0] ?? `Hired ${offer.displayName ?? "pilot"}.` }
            : { error: result.hardBlockers[0] ?? "Could not hire that pilot candidate." },
    }));
}
async function handleStartPilotTraining(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
    const namedPilotId = form.get("namedPilotId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_pilot_training"),
        saveId,
        commandName: "StartNamedPilotTraining",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            namedPilotId,
        },
    });
    redirect(response, saveRoute(saveId, {
        tab,
        flash: result.success
            ? { notice: result.validationMessages[0] ?? "Started pilot training." }
            : { error: result.hardBlockers[0] ?? "Could not start pilot training." },
    }));
}
async function handleStartPilotTransfer(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
    const namedPilotId = form.get("namedPilotId") ?? "";
    const destinationAirportId = form.get("destinationAirportId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_pilot_transfer"),
        saveId,
        commandName: "StartNamedPilotTransfer",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            namedPilotId,
            destinationAirportId,
        },
    });
    redirect(response, saveRoute(saveId, {
        tab,
        flash: result.success
            ? { notice: result.validationMessages[0] ?? "Started pilot transfer." }
            : { error: result.hardBlockers[0] ?? "Could not start pilot transfer." },
    }));
}
async function handleConvertPilotToDirectHire(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
    const namedPilotId = form.get("namedPilotId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_pilot_convert"),
        saveId,
        commandName: "ConvertNamedPilotToDirectHire",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            namedPilotId,
        },
    });
    redirect(response, saveRoute(saveId, {
        tab,
        flash: result.success
            ? { notice: result.validationMessages[0] ?? "Converted pilot to direct hire." }
            : { error: result.hardBlockers[0] ?? "Could not convert that pilot to direct hire." },
    }));
}
async function handleDismissPilot(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
    const namedPilotId = form.get("namedPilotId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_pilot_dismiss"),
        saveId,
        commandName: "DismissNamedPilot",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            namedPilotId,
        },
    });
    redirect(response, saveRoute(saveId, {
        tab,
        flash: result.success
            ? { notice: result.validationMessages[0] ?? "Dismissed pilot from active coverage." }
            : { error: result.hardBlockers[0] ?? "Could not dismiss that pilot." },
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
async function draftAcceptedContractOnAircraft(saveId, companyContractId, aircraftId, commandName) {
    const [companyContext, companyContracts, fleetState] = await Promise.all([
        backend.loadCompanyContext(saveId),
        backend.loadCompanyContracts(saveId),
        backend.loadFleetState(saveId),
    ]);
    const contract = companyContracts?.contracts.find((entry) => entry.companyContractId === companyContractId);
    const aircraft = fleetState?.aircraft.find((entry) => entry.aircraftId === aircraftId);
    const aircraftModel = aircraft ? aircraftReference.findModel(aircraft.aircraftModelId) : null;
    if (!companyContext || !contract || !aircraft || !aircraftModel) {
        return { success: false, error: "Could not resolve the contract or aircraft for auto-planning." };
    }
    const planningResult = planDispatchContractWork(companyContext.currentTimeUtc, aircraft.currentAirportId, aircraftModel, {
        linkedCompanyContractId: contract.companyContractId,
        originAirportId: contract.originAirportId,
        destinationAirportId: contract.destinationAirportId,
        earliestStartUtc: contract.earliestStartUtc,
        deadlineUtc: contract.deadlineUtc,
    }, airportReference);
    if (!planningResult.success) {
        return { success: false, error: planningResult.message };
    }
    const preview = await backend.withExistingSaveDatabase(saveId, (context) => validateProposedSchedule({
        aircraftId,
        scheduleKind: "operational",
        legs: planningResult.legs,
    }, {
        saveDatabase: context.saveDatabase,
        airportReference,
        aircraftReference,
        companyId: companyContext.companyId,
        currentTimeUtc: companyContext.currentTimeUtc,
    }));
    const previewBlocker = preview?.snapshot.validationMessages.find((message) => message.severity === "blocker")?.summary;
    if (previewBlocker) {
        return { success: false, error: previewBlocker };
    }
    const result = await backend.dispatch({
        commandId: commandId(commandName),
        saveId,
        commandName: "SaveScheduleDraft",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            aircraftId,
            scheduleKind: "operational",
            legs: planningResult.legs,
        },
    });
    return result.hardBlockers.length > 0
        ? { success: false, error: result.hardBlockers[0] ?? "Could not draft the schedule." }
        : { success: true, scheduleId: String(result.metadata?.scheduleId ?? "") };
}
async function handleAutoPlanContract(response, form) {
    const saveId = form.get("saveId") ?? "";
    const tab = normalizeTab(form.get("tab"));
    const companyContractId = form.get("companyContractId") ?? "";
    const aircraftId = form.get("aircraftId") ?? "";
    try {
        const result = await draftAcceptedContractOnAircraft(saveId, companyContractId, aircraftId, "cmd_draft");
        redirect(response, saveRoute(saveId, {
            tab,
            flash: result.success
                ? { notice: `Drafted schedule ${result.scheduleId}.` }
                : { error: result.error },
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
    const selectedNamedPilotIds = resolveSelectedNamedPilotIdsFromForm(form);
    const result = await backend.dispatch({
        commandId: commandId("cmd_commit"),
        saveId,
        commandName: "CommitAircraftSchedule",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            scheduleId,
            ...(selectedNamedPilotIds.length > 0 ? { selectedNamedPilotIds } : {}),
        },
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
    "/actions/hire-pilot-candidate": handleHirePilotCandidate,
    "/actions/start-pilot-training": handleStartPilotTraining,
    "/actions/start-pilot-transfer": handleStartPilotTransfer,
    "/actions/convert-pilot-to-direct-hire": handleConvertPilotToDirectHire,
    "/actions/dismiss-pilot": handleDismissPilot,
    "/actions/refresh-contract-board": handleRefreshContractBoard,
    "/actions/accept-contract": handleAcceptContract,
    "/actions/auto-plan-contract": handleAutoPlanContract,
    "/actions/commit-schedule": handleCommitSchedule,
    "/actions/advance-time": handleAdvanceTime,
};
const {
    renderLauncherPage,
    renderSavePage,
    renderShell,
    serializeJsonForScript,
} = createServerShellPageRenderers({
    contractsTabClientAssetPath,
    escapeHtml,
    formatMoney,
    formatDate,
    formatNumber,
    formatPercent,
    formatAirportSize,
    hoursUntil,
    renderAirportDisplay,
    renderRouteDisplay,
    formatPayload,
    renderBadge,
    launcherRoute,
    openSaveRoute,
    saveRoute,
    saveTabs,
    starterAircraftOptions,
    staffingPresets,
});
function renderHiddenContext(saveId, tabId) {
    return `<input type="hidden" name="saveId" value="${escapeHtml(saveId)}" /><input type="hidden" name="tab" value="${escapeHtml(tabId)}" />`;
}
const { renderStaffing: renderStaffingWorkspace } = createStaffingRenderers({
    assetVersion,
    escapeHtml,
    formatMoney,
    formatDate,
    formatNumber,
    renderBadge,
    describeAirport,
    renderCompactAirportDisplay,
    renderHiddenContext,
    pilotCertificationDisplayOrder,
    staffingPresets,
    staffingQualificationLaneOrder,
});
const { saveShellRenderers } = createSaveShellRenderers({
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
});
function sendNotFound(response, saveIds, message) {
    response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    response.end(renderShell("Not Found", saveIds, undefined, { error: message }, `<div class="empty-state">${escapeHtml(message)}</div>`));
}
const pageHandlers = createServerPageHandlers({
    listSaveIds,
    readConfirmDeleteSaveId,
    sendHtml,
    sendNotFound,
    normalizeShellTab,
    saveRoute,
    renderLauncherPage,
    renderSaveOpeningPage,
    renderIncrementalSavePage,
    openSaveClientAssetPath,
    saveShellClientAssetPath,
});
const {
    buildBootstrapApiPayload,
    buildTabApiPayload,
    buildClockApiPayload,
    sendShellActionResponse,
    sendClockActionResponse,
    handleBootstrapApi,
    handleTabApi,
    handleClockApi,
    handleClockTickApi,
    handleClockAdvanceToCalendarAnchorApi,
} = createShellApiHandlers({
    backend,
    saveShellRenderers,
    buildBootstrapPayload,
    buildTabPayload,
    loadClockPanelPayload,
    resolveCalendarAnchorUtc,
    normalizeShellTab,
    sendJson,
    addMinutesIso,
    commandId,
});
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
async function handleCreateCompanyApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const displayName = form.get("displayName")?.trim() || "FlightLine Regional";
    const { difficultyProfile, startingCashAmount } = resolveCreateCompanySubmission(form);
    const result = await backend.dispatch({
        commandId: commandId("cmd_company_api"),
        saveId,
        commandName: "CreateCompany",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            displayName,
            starterAirportId: form.get("starterAirportId")?.trim().toUpperCase() || "KDEN",
            difficultyProfile,
            startingCashAmount,
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
    const dealLabel = ownershipType === "financed" ? "finance" : ownershipType === "leased" ? "lease" : "purchase";
    const canonicalTermMonths = ownershipType === "financed" ? offer.financeTerms.termMonths : ownershipType === "leased" ? offer.leaseTerms.termMonths : undefined;
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
        },
    });
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: `Acquired ${model?.displayName ?? offer.displayName} at ${offer.currentAirportId} via ${dealLabel}${canonicalTermMonths ? ` (${canonicalTermMonths} mo)` : ""}.`, notificationLevel: "important" }
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
async function handleScheduleMaintenanceApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const aircraftId = form.get("aircraftId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_schedule_maintenance_api"),
        saveId,
        commandName: "ScheduleMaintenance",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            aircraftId,
        },
    });
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: result.validationMessages[0] ?? "Started maintenance recovery.", notificationLevel: "important" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not start maintenance recovery." });
}
async function handleHirePilotCandidateApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const staffingOfferId = form.get("staffingOfferId") ?? "";
    const baseAirportId = String(form.get("baseAirportId") ?? "").trim().toUpperCase();
    const market = await backend.loadActiveStaffingMarket(saveId);
    const offer = market?.offers.find((entry) => entry.staffingOfferId === staffingOfferId && entry.offerStatus === "available" && entry.laborCategory === "pilot");
    if (!offer) {
        await sendShellActionResponse(response, saveId, tab, { success: false, error: "That pilot candidate is no longer available." });
        return;
    }
    const result = await backend.dispatch({
        commandId: commandId("cmd_hire_pilot_api"),
        saveId,
        commandName: "ActivateStaffingPackage",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            laborCategory: offer.laborCategory,
            employmentModel: offer.employmentModel,
            qualificationGroup: offer.qualificationGroup,
            coverageUnits: offer.coverageUnits,
            fixedCostAmount: offer.fixedCostAmount,
            variableCostRate: offer.variableCostRate,
            baseAirportId,
            startsAtUtc: offer.startsAtUtc,
            endsAtUtc: offer.endsAtUtc,
            sourceOfferId: offer.staffingOfferId,
        },
    });
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: result.validationMessages[0] ?? `Hired ${offer.displayName ?? "pilot"}.`, notificationLevel: "important" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not hire that pilot candidate." });
}
async function handleStartPilotTrainingApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const namedPilotId = form.get("namedPilotId") ?? "";
    const targetCertificationCode = form.get("targetCertificationCode")?.trim() || undefined;
    const result = await backend.dispatch({
        commandId: commandId("cmd_pilot_training_api"),
        saveId,
        commandName: "StartNamedPilotTraining",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            namedPilotId,
            targetCertificationCode,
        },
    });
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: result.validationMessages[0] ?? "Started pilot training.", notificationLevel: "routine" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not start pilot training." });
}
async function handleStartPilotTransferApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const namedPilotId = form.get("namedPilotId") ?? "";
    const destinationAirportId = form.get("destinationAirportId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_pilot_transfer_api"),
        saveId,
        commandName: "StartNamedPilotTransfer",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            namedPilotId,
            destinationAirportId,
        },
    });
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: result.validationMessages[0] ?? "Started pilot transfer.", notificationLevel: "routine" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not start pilot transfer." });
}
async function handleConvertPilotToDirectHireApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const namedPilotId = form.get("namedPilotId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_pilot_convert_api"),
        saveId,
        commandName: "ConvertNamedPilotToDirectHire",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            namedPilotId,
        },
    });
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: result.validationMessages[0] ?? "Converted pilot to direct hire.", notificationLevel: "important" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not convert that pilot to direct hire." });
}
async function handleDismissPilotApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const namedPilotId = form.get("namedPilotId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_pilot_dismiss_api"),
        saveId,
        commandName: "DismissNamedPilot",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            namedPilotId,
        },
    });
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: result.validationMessages[0] ?? "Dismissed pilot from active coverage.", notificationLevel: "important" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not dismiss that pilot." });
}
async function handleCommitScheduleApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const scheduleId = form.get("scheduleId") ?? "";
    const selectedNamedPilotIds = resolveSelectedNamedPilotIdsFromForm(form);
    const result = await backend.dispatch({
        commandId: commandId("cmd_commit_api"),
        saveId,
        commandName: "CommitAircraftSchedule",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: {
            scheduleId,
            ...(selectedNamedPilotIds.length > 0 ? { selectedNamedPilotIds } : {}),
        },
    });
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: `Committed schedule ${scheduleId}.`, notificationLevel: "important" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not commit schedule." });
}
async function handleDiscardScheduleDraftApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const scheduleId = form.get("scheduleId") ?? "";
    const result = await backend.dispatch({
        commandId: commandId("cmd_discard_draft_api"),
        saveId,
        commandName: "DiscardAircraftScheduleDraft",
        issuedAtUtc: new Date().toISOString(),
        actorType: "player",
        payload: { scheduleId },
    });
    await sendShellActionResponse(response, saveId, tab, result.success
        ? { success: true, message: `Discarded draft schedule ${scheduleId}.`, notificationLevel: "important" }
        : { success: false, error: result.hardBlockers[0] ?? "Could not discard the draft schedule." });
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
async function handleAutoPlanContractApi(response, saveId, form) {
    const tab = normalizeShellTab(form.get("tab"));
    const companyContractId = form.get("companyContractId") ?? "";
    const aircraftId = form.get("aircraftId") ?? "";
    try {
        const result = await draftAcceptedContractOnAircraft(saveId, companyContractId, aircraftId, "cmd_draft_api");
        await sendShellActionResponse(response, saveId, tab, result.success
            ? { success: true, message: `Drafted schedule ${result.scheduleId}.`, notificationLevel: "important" }
            : { success: false, error: result.error });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Auto-plan failed.";
        await sendShellActionResponse(response, saveId, tab, { success: false, error: message });
    }
}

const { handleRequest } = createServerRequestRouter({
    port,
    readFile,
    readForm,
    readFlashState,
    sendHtml,
    sendJson,
    withUiTiming,
    listSaveIds,
    sendNotFound,
    normalizeShellTab,
    pageHandlers,
    handleBootstrapApi,
    handleTabApi,
    handleClockApi,
    handleClockTickApi,
    handleClockAdvanceToCalendarAnchorApi,
    handleContractsViewApi,
    handleAcceptContractApi,
    handleCancelContractApi,
    handlePlannerAddApi,
    handlePlannerRemoveApi,
    handlePlannerReorderApi,
    handlePlannerClearApi,
    handlePlannerAcceptApi,
    handleCreateCompanyApi,
    handleAcquireAircraftApi,
    handleAcquireAircraftOfferApi,
    handleAddStaffingApi,
    handleScheduleMaintenanceApi,
    handleHirePilotCandidateApi,
    handleStartPilotTrainingApi,
    handleStartPilotTransferApi,
    handleConvertPilotToDirectHireApi,
    handleDismissPilotApi,
    handleAutoPlanContractApi,
    handleCommitScheduleApi,
    handleDiscardScheduleDraftApi,
    handleAdvanceTimeApi,
    handleBindRoutePlanApi,
    actionHandlers,
    saveShellClientAssetUrl,
    aircraftTabClientAssetUrl,
    dispatchTabClientAssetUrl,
    staffingTabClientAssetUrl,
    contractsTabClientAssetUrl,
    openSaveClientAssetUrl,
    pilotCertificationsModuleAssetUrl,
    dispatchPilotAssignmentModuleAssetUrl,
    maintenanceRecoveryModuleAssetUrl,
    uiBrowserModuleAssetUrls,
    resolveAircraftImageAsset,
    aircraftReference,
    ensureStaffPortraitAsset,
    isValidStaffPortraitAssetId,
    readStaffPortraitAsset,
    resolveStaffPortraitAssetId,
    escapeHtml,
});

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

