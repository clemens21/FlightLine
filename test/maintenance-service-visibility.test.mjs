/*
 * Locks the proactive maintenance visibility slice into Dispatch and Aircraft.
 * The player should get a concrete recovery hint before dispatching into a maintenance dead-end.
 */

import assert from "node:assert/strict";

import { validateProposedSchedule } from "../dist/application/dispatch/schedule-validation.js";
import {
  acquireAircraft,
  createCompanySave,
  createTestHarness,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";

const harness = await createTestHarness("flightline-maintenance-visibility");
const { backend, airportReference } = harness;
const aircraftReference = backend.getAircraftReference();
const saveId = uniqueSaveId("maintenance_visibility");
const startedAtUtc = "2026-03-16T13:00:00.000Z";

try {
  await createCompanySave(backend, saveId, {
    startedAtUtc,
    displayName: `Maintenance Visibility ${saveId}`,
    startingCashAmount: 3_500_000,
  });

  await acquireAircraft(backend, saveId, startedAtUtc, {
    aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    registration: "N208MV",
  });

  const fleetState = await backend.loadFleetState(saveId);
  assert.ok(fleetState);
  const aircraftId = fleetState.aircraft[0]?.aircraftId;
  assert.ok(aircraftId);

  const validationResult = await backend.withExistingSaveDatabase(saveId, async (context) => {
    context.saveDatabase.run(
      `UPDATE maintenance_program_state
       SET condition_band_input = 'fair',
           hours_since_inspection = 120,
           cycles_since_inspection = 22,
           hours_to_service = 1.5,
           maintenance_state_input = 'due_soon',
           aog_flag = 0
       WHERE aircraft_id = $aircraft_id`,
      { $aircraft_id: aircraftId },
    );

    await context.saveDatabase.persist();

    const saveRow = context.saveDatabase.getOne(
      `SELECT active_company_id AS companyId
       FROM save_game
       WHERE save_id = $save_id
       LIMIT 1`,
      { $save_id: saveId },
    );
    assert.ok(saveRow?.companyId);

    return validateProposedSchedule(
      {
        aircraftId,
        scheduleKind: "operational",
        legs: [
          {
            legType: "reposition",
            originAirportId: "KDEN",
            destinationAirportId: "KCOS",
            plannedDepartureUtc: "2026-03-16T16:00:00.000Z",
            plannedArrivalUtc: "2026-03-16T18:30:00.000Z",
          },
        ],
      },
      {
        saveDatabase: context.saveDatabase,
        airportReference,
        aircraftReference,
        companyId: saveRow.companyId,
        currentTimeUtc: startedAtUtc,
      },
    );
  });

  const maintenanceWindowMessage = validationResult.snapshot.validationMessages.find((message) =>
    message.code === "maintenance.window");
  assert.ok(maintenanceWindowMessage);
  assert.equal(maintenanceWindowMessage.severity, "blocker");
  assert.match(
    maintenanceWindowMessage.suggestedRecoveryAction ?? "",
    /Open Aircraft and start maintenance now/i,
  );
} finally {
  await harness.cleanup();
}
