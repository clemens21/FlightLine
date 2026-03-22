/*
 * Regression coverage for the player-facing maintenance recovery loop.
 * This locks in the command path, cash movement, maintenance-task lifecycle, and time-advance recovery.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  createCompanySave,
  createTestHarness,
  dispatchOrThrow,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import { loadMaintenanceTasks } from "../dist/application/queries/maintenance-tasks.js";

function addHours(utcIsoString, hours) {
  return new Date(new Date(utcIsoString).getTime() + hours * 3_600_000).toISOString();
}

async function placeAircraftInMaintenanceWindow(backend, saveId, aircraftId, {
  maintenanceStateInput = "due_soon",
  hoursToService = 4,
  aogFlag = 0,
} = {}) {
  await backend.withExistingSaveDatabase(saveId, async (context) => {
    context.saveDatabase.run(
      `UPDATE company_aircraft
       SET status_input = $status_input,
           dispatch_available = $dispatch_available,
           active_schedule_id = NULL,
           active_maintenance_task_id = NULL
       WHERE aircraft_id = $aircraft_id`,
      {
        $status_input: "available",
        $dispatch_available: 1,
        $aircraft_id: aircraftId,
      },
    );

    context.saveDatabase.run(
      `UPDATE maintenance_program_state
       SET condition_band_input = $condition_band_input,
           hours_since_inspection = $hours_since_inspection,
           cycles_since_inspection = $cycles_since_inspection,
           hours_to_service = $hours_to_service,
           maintenance_state_input = $maintenance_state_input,
           aog_flag = $aog_flag
       WHERE aircraft_id = $aircraft_id`,
      {
        $condition_band_input: maintenanceStateInput === "aog" ? "poor" : "fair",
        $hours_since_inspection: 120,
        $cycles_since_inspection: 22,
        $hours_to_service: hoursToService,
        $maintenance_state_input: maintenanceStateInput,
        $aog_flag: aogFlag,
        $aircraft_id: aircraftId,
      },
    );

    await context.saveDatabase.persist();
  });
}

async function loadAircraftState(backend, saveId, aircraftId) {
  return backend.withExistingSaveDatabase(saveId, async (context) =>
    context.saveDatabase.getOne(
      `SELECT
        ca.status_input AS statusInput,
        ca.dispatch_available AS dispatchAvailable,
        ca.active_maintenance_task_id AS activeMaintenanceTaskId,
        ca.condition_value AS conditionValue,
        mps.maintenance_state_input AS maintenanceStateInput,
        mps.hours_since_inspection AS hoursSinceInspection,
        mps.cycles_since_inspection AS cyclesSinceInspection
      FROM company_aircraft AS ca
      JOIN maintenance_program_state AS mps ON mps.aircraft_id = ca.aircraft_id
      WHERE ca.aircraft_id = $aircraft_id
      LIMIT 1`,
      { $aircraft_id: aircraftId },
    ),
  );
}

async function loadMaintenanceRow(backend, saveId, aircraftId) {
  return backend.withExistingSaveDatabase(saveId, async (context) =>
    context.saveDatabase.getOne(
      `SELECT
        ca.condition_value AS conditionValue,
        mps.condition_band_input AS conditionBandInput,
        mps.hours_to_service AS hoursToService,
        mps.maintenance_state_input AS maintenanceStateInput,
        mps.aog_flag AS aogFlag
      FROM company_aircraft AS ca
      JOIN maintenance_program_state AS mps ON mps.aircraft_id = ca.aircraft_id
      WHERE ca.aircraft_id = $aircraft_id
      LIMIT 1`,
      { $aircraft_id: aircraftId },
    ),
  );
}

const harness = await createTestHarness("flightline-maintenance-recovery-backend");
const { backend } = harness;
const saveId = uniqueSaveId("maintenance_recovery");
const startedAtUtc = "2026-03-16T13:00:00.000Z";

try {
  await createCompanySave(backend, saveId, {
    startedAtUtc,
    displayName: `Maintenance Recovery ${saveId}`,
    startingCashAmount: 3_500_000,
  });

  await acquireAircraft(backend, saveId, startedAtUtc, {
    aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    registration: "N208MR",
  });

  const fleetState = await backend.loadFleetState(saveId);
  assert.ok(fleetState);
  const aircraftId = fleetState.aircraft[0]?.aircraftId;
  assert.ok(aircraftId);

  await placeAircraftInMaintenanceWindow(backend, saveId, aircraftId, {
    maintenanceStateInput: "due_soon",
    hoursToService: 4,
  });

  const aircraftBeforeStart = await loadAircraftState(backend, saveId, aircraftId);
  assert.ok(aircraftBeforeStart);
  assert.equal(aircraftBeforeStart.maintenanceStateInput, "due_soon");

  const maintenanceTasksBefore = await backend.withExistingSaveDatabase(saveId, async (context) =>
    loadMaintenanceTasks(context.saveDatabase, saveId),
  );
  assert.equal(maintenanceTasksBefore.length, 0);

  const scheduleResult = await dispatchOrThrow(backend, {
    commandId: `cmd_${saveId}_schedule_maintenance`,
    saveId,
    commandName: "ScheduleMaintenance",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      aircraftId,
    },
  });
  assert.match(scheduleResult.validationMessages[0] ?? "", /Started maintenance recovery/i);

  const aircraftAfterStart = await loadAircraftState(backend, saveId, aircraftId);
  assert.ok(aircraftAfterStart);
  assert.equal(aircraftAfterStart.statusInput, "maintenance");
  assert.equal(aircraftAfterStart.dispatchAvailable, 0);
  assert.ok(aircraftAfterStart.activeMaintenanceTaskId);
  assert.equal(aircraftAfterStart.maintenanceStateInput, "current");

  const maintenanceTasksDuring = await backend.withExistingSaveDatabase(saveId, async (context) =>
    loadMaintenanceTasks(context.saveDatabase, saveId),
  );
  assert.equal(maintenanceTasksDuring.length, 1);
  assert.equal(maintenanceTasksDuring[0]?.taskState, "in_progress");
  assert.equal(maintenanceTasksDuring[0]?.maintenanceType, "inspection_a");
  assert.ok(maintenanceTasksDuring[0]?.plannedEndUtc);

  const companyContextAfterStart = await backend.loadCompanyContext(saveId);
  assert.ok(companyContextAfterStart);
  assert.ok(companyContextAfterStart.currentCashAmount < 3_500_000);

  const advanceResult = await dispatchOrThrow(backend, {
    commandId: `cmd_${saveId}_advance_maintenance`,
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: addHours(String(maintenanceTasksDuring[0]?.plannedEndUtc), 1),
      stopConditions: ["target_time"],
    },
  });

  assert.equal(advanceResult.metadata?.stoppedBecause, "target_time");

  const aircraftAfterCompletion = await loadAircraftState(backend, saveId, aircraftId);
  assert.ok(aircraftAfterCompletion);
  assert.equal(aircraftAfterCompletion.statusInput, "available");
  assert.equal(aircraftAfterCompletion.dispatchAvailable, 1);
  assert.equal(aircraftAfterCompletion.activeMaintenanceTaskId, null);
  assert.equal(aircraftAfterCompletion.maintenanceStateInput, "current");
  assert.equal(aircraftAfterCompletion.hoursSinceInspection, 0);
  assert.equal(aircraftAfterCompletion.cyclesSinceInspection, 0);

  const maintenanceRowAfterCompletion = await loadMaintenanceRow(backend, saveId, aircraftId);
  assert.ok(maintenanceRowAfterCompletion);
  assert.equal(maintenanceRowAfterCompletion.maintenanceStateInput, "current");
  assert.equal(maintenanceRowAfterCompletion.aogFlag, 0);
  assert.equal(maintenanceRowAfterCompletion.conditionBandInput, "excellent");
  assert.equal(maintenanceRowAfterCompletion.conditionValue, 0.92);
  assert.ok(Number(maintenanceRowAfterCompletion.hoursToService) > 5);

  const maintenanceTasksAfter = await backend.withExistingSaveDatabase(saveId, async (context) =>
    loadMaintenanceTasks(context.saveDatabase, saveId, {
      includeCompleted: true,
    }),
  );
  assert.equal(maintenanceTasksAfter.length, 1);
  assert.equal(maintenanceTasksAfter[0]?.taskState, "completed");
  assert.equal(maintenanceTasksAfter[0]?.plannedEndUtc, maintenanceTasksDuring[0]?.plannedEndUtc);

  const companyContextAfterCompletion = await backend.loadCompanyContext(saveId);
  assert.ok(companyContextAfterCompletion);
  assert.equal(
    companyContextAfterCompletion.currentTimeUtc,
    advanceResult.metadata?.advancedToUtc,
  );
} finally {
  await Promise.allSettled([
    backend.closeSaveSession(saveId),
    backend.close(),
  ]);
}
