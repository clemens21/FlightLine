/*
 * Regression coverage for the Aircraft workspace maintenance recovery UI and shell actions.
 * This verifies the player can see recovery truth, start maintenance from Aircraft, and recover after time advance.
 */

import assert from "node:assert/strict";

import { acquireAircraft, createCompanySave, uniqueSaveId } from "./helpers/flightline-testkit.mjs";
import { allocatePort, createWorkspaceBackend, removeWorkspaceSave, startUiServer } from "./helpers/ui-testkit.mjs";

async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.ok, true, `Expected GET ${path} to succeed, received ${response.status}.`);
  return response.json();
}

async function postFormJson(baseUrl, path, fields) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, String(value));
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body,
  });

  assert.equal(response.ok, true, `Expected POST ${path} to succeed, received ${response.status}.`);
  return response.json();
}

async function placeAircraftInMaintenanceWindow(backend, saveId, aircraftId, maintenanceStateInput = "due_soon") {
  await backend.withExistingSaveDatabase(saveId, async (context) => {
    context.saveDatabase.run(
      `UPDATE company_aircraft
       SET status_input = 'available',
           dispatch_available = 1,
           active_schedule_id = NULL,
           active_maintenance_task_id = NULL
       WHERE aircraft_id = $aircraft_id`,
      { $aircraft_id: aircraftId },
    );

    context.saveDatabase.run(
      `UPDATE maintenance_program_state
       SET condition_band_input = $condition_band_input,
           hours_since_inspection = 84,
           cycles_since_inspection = 17,
           hours_to_service = $hours_to_service,
           maintenance_state_input = $maintenance_state_input,
           aog_flag = $aog_flag
       WHERE aircraft_id = $aircraft_id`,
      {
        $condition_band_input: maintenanceStateInput === "aog" ? "poor" : "fair",
        $hours_to_service: maintenanceStateInput === "due_soon" ? 4 : maintenanceStateInput === "overdue" ? -3 : -18,
        $maintenance_state_input: maintenanceStateInput,
        $aog_flag: maintenanceStateInput === "aog" ? 1 : 0,
        $aircraft_id: aircraftId,
      },
    );

    await context.saveDatabase.persist();
  });
}

function addHours(utcIsoString, hours) {
  return new Date(new Date(utcIsoString).getTime() + hours * 3_600_000).toISOString();
}

const saveId = uniqueSaveId("ui_maintenance_recovery");
const financedSaveId = uniqueSaveId("ui_maintenance_recovery_financed");
const leasedSaveId = uniqueSaveId("ui_maintenance_recovery_leased");
const startedAtUtc = "2026-03-16T13:00:00.000Z";
let server = null;
let aircraftId = "";
let financedAircraftId = "";
let leasedAircraftId = "";

try {
  const backend = await createWorkspaceBackend();

  try {
    await createCompanySave(backend, saveId, {
      startedAtUtc,
      displayName: `UI Maintenance ${saveId}`,
      startingCashAmount: 3_500_000,
    });

    await acquireAircraft(backend, saveId, startedAtUtc, {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      registration: "N208UI",
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    aircraftId = fleetState.aircraft[0]?.aircraftId ?? "";
    assert.ok(aircraftId);

    await placeAircraftInMaintenanceWindow(backend, saveId, aircraftId, "due_soon");

    await createCompanySave(backend, financedSaveId, {
      startedAtUtc,
      displayName: `UI Maintenance ${financedSaveId}`,
      startingCashAmount: 3_500_000,
    });
    await acquireAircraft(backend, financedSaveId, startedAtUtc, {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      ownershipType: "financed",
      registration: "N208UF",
    });
    const financedFleetState = await backend.loadFleetState(financedSaveId);
    assert.ok(financedFleetState);
    financedAircraftId = financedFleetState.aircraft[0]?.aircraftId ?? "";
    assert.ok(financedAircraftId);
    await placeAircraftInMaintenanceWindow(backend, financedSaveId, financedAircraftId, "due_soon");

    await createCompanySave(backend, leasedSaveId, {
      startedAtUtc,
      displayName: `UI Maintenance ${leasedSaveId}`,
      startingCashAmount: 3_500_000,
    });
    await acquireAircraft(backend, leasedSaveId, startedAtUtc, {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      ownershipType: "leased",
      registration: "N208UL",
    });
    const leasedFleetState = await backend.loadFleetState(leasedSaveId);
    assert.ok(leasedFleetState);
    leasedAircraftId = leasedFleetState.aircraft[0]?.aircraftId ?? "";
    assert.ok(leasedAircraftId);
    await placeAircraftInMaintenanceWindow(backend, leasedSaveId, leasedAircraftId, "due_soon");
  } finally {
    await backend.close();
  }

  const port = await allocatePort();
  server = await startUiServer(port);

  const aircraftTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/tab/aircraft`);
  assert.equal(aircraftTab.tabId, "aircraft");
  assert.ok(aircraftTab.aircraftPayload);
  assert.equal(aircraftTab.aircraftPayload.aircraft.length, 1);
  const aircraft = aircraftTab.aircraftPayload.aircraft[0];
  assert.ok(aircraft);
  assert.equal(aircraft.maintenanceState, "due_soon");
  assert.equal(aircraft.operationalState, "available");
  assert.ok(aircraft.maintenanceRecovery);
  assert.equal(aircraft.maintenanceRecovery.maintenanceType, "inspection_a");
  assert.equal(aircraft.maintenanceRecovery.severity, "due_soon");
  assert.ok(aircraftTab.aircraftPayload.summaryCards.some((card) =>
    card.label === "Service pressure"
      && card.detail.includes("due soon")
      && card.tone === "accent"));
  assert.match(aircraftTab.contentHtml, /data-aircraft-tab-host/);

  const scheduleResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/actions/schedule-maintenance`, {
    tab: "aircraft",
    saveId,
    aircraftId,
  });
  assert.equal(scheduleResult.success, true);
  assert.ok(scheduleResult.tab?.aircraftPayload);
  const aircraftAfterStart = scheduleResult.tab.aircraftPayload.aircraft.find((entry) => entry.aircraftId === aircraftId);
  assert.ok(aircraftAfterStart);
  assert.equal(aircraftAfterStart.operationalState, "maintenance");
  assert.equal(aircraftAfterStart.maintenanceState, "in_service");
  assert.equal(aircraftAfterStart.maintenanceRecovery, null);
  assert.equal(aircraftAfterStart.currentCommitment?.label, "Maintenance in service");
  assert.ok(scheduleResult.tab.aircraftPayload.summaryCards.some((card) =>
    card.label === "Service pressure"
      && card.detail.includes("in service")));
  assert.match(scheduleResult.tab.contentHtml, /data-aircraft-tab-host/);

  const financedAircraftTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(financedSaveId)}/tab/aircraft`);
  const financedAircraft = financedAircraftTab.aircraftPayload.aircraft.find((entry) => entry.aircraftId === financedAircraftId);
  assert.ok(financedAircraft?.maintenanceRecovery);
  assert.equal(financedAircraft.ownershipType, "financed");
  assert.equal(financedAircraft.maintenanceRecovery.playerPaysCost, true);

  const leasedAircraftTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(leasedSaveId)}/tab/aircraft`);
  const leasedAircraft = leasedAircraftTab.aircraftPayload.aircraft.find((entry) => entry.aircraftId === leasedAircraftId);
  assert.ok(leasedAircraft?.maintenanceRecovery);
  assert.equal(leasedAircraft.ownershipType, "leased");
  assert.equal(leasedAircraft.maintenanceRecovery.playerPaysCost, false);
  assert.equal(leasedAircraft.maintenanceRecovery.estimatedCostAmount, 0);

  const leasedScheduleResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(leasedSaveId)}/actions/schedule-maintenance`, {
    tab: "aircraft",
    saveId: leasedSaveId,
    aircraftId: leasedAircraftId,
  });
  assert.equal(leasedScheduleResult.success, true);
  assert.match(leasedScheduleResult.message ?? "", /lease-covered maintenance/i);

  const advanceResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/actions/advance-time`, {
    tab: "aircraft",
    saveId,
    hours: 96,
    stopMode: "target_time",
  });
  assert.equal(advanceResult.success, true);
  assert.ok(advanceResult.tab?.aircraftPayload);
  const aircraftAfterCompletion = advanceResult.tab.aircraftPayload.aircraft.find((entry) => entry.aircraftId === aircraftId);
  assert.ok(aircraftAfterCompletion);
  assert.equal(aircraftAfterCompletion.operationalState, "available");
  assert.equal(aircraftAfterCompletion.maintenanceState, "not_due");
  assert.equal(aircraftAfterCompletion.maintenanceRecovery, null);
  assert.equal(aircraftAfterCompletion.currentCommitment, undefined);
  assert.match(advanceResult.tab.contentHtml, /data-aircraft-tab-host/);
} finally {
  await Promise.allSettled([
    server?.stop(),
    removeWorkspaceSave(financedSaveId),
    removeWorkspaceSave(leasedSaveId),
    removeWorkspaceSave(saveId),
  ]);
}
