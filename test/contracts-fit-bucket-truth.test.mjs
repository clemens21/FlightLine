import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  createTestHarness,
  refreshContractBoard,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import { loadContractsViewPayload } from "../dist/ui/contracts-view.js";

async function seedOperationalContractsSave(backend, airportReference, saveId, startedAtUtc = "2026-03-16T13:00:00.000Z") {
  await createCompanySave(backend, saveId, {
    startedAtUtc,
    startingCashAmount: 10_000_000,
  });
  await acquireAircraft(backend, saveId, startedAtUtc, {
    aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    registration: `N${saveId.slice(-5).toUpperCase()}`,
  });
  await activateStaffingPackage(backend, saveId, startedAtUtc, {
    laborCategory: "pilot",
    employmentModel: "direct_hire",
    qualificationGroup: "single_turboprop_utility",
    coverageUnits: 1,
    fixedCostAmount: 4_200,
  });
  await refreshContractBoard(backend, saveId, startedAtUtc, "bootstrap");

  const staffingState = await backend.loadStaffingState(saveId);
  assert.ok(staffingState?.namedPilots[0]);
  const payload = await loadContractsViewPayload(backend, airportReference, saveId, "scheduled");
  assert.ok(payload);
  const selectedOffer = payload.offers.find((offer) => offer.fitBucket === "flyable_now");
  assert.ok(selectedOffer, `Expected ${saveId} to have at least one flyable-now contract offer.`);

  return {
    startedAtUtc,
    namedPilotId: staffingState.namedPilots[0].namedPilotId,
    selectedOfferId: selectedOffer.contractOfferId,
  };
}

function requireOffer(payload, contractOfferId) {
  const offer = payload.offers.find((entry) => entry.contractOfferId === contractOfferId);
  assert.ok(offer, `Expected contract offer ${contractOfferId} to remain visible in the payload.`);
  return offer;
}

const harness = await createTestHarness("flightline-contract-fit-buckets");
const { backend, airportReference } = harness;

try {
  const trainingSaveId = uniqueSaveId("contracts_training_truth");
  const trainingSeed = await seedOperationalContractsSave(backend, airportReference, trainingSaveId);
  const trainingStartResult = await backend.dispatch({
    commandId: `cmd_${trainingSaveId}_recurrent_training`,
    saveId: trainingSaveId,
    commandName: "StartNamedPilotTraining",
    issuedAtUtc: trainingSeed.startedAtUtc,
    actorType: "player",
    payload: {
      namedPilotId: trainingSeed.namedPilotId,
    },
  });
  assert.equal(trainingStartResult.success, true);

  const trainingPayload = await loadContractsViewPayload(backend, airportReference, trainingSaveId, "scheduled");
  assert.ok(trainingPayload);
  assert.equal(requireOffer(trainingPayload, trainingSeed.selectedOfferId).fitBucket, "blocked_now");

  const restingSaveId = uniqueSaveId("contracts_resting_truth");
  const restingSeed = await seedOperationalContractsSave(backend, airportReference, restingSaveId);
  await backend.withExistingSaveDatabase(restingSaveId, async (context) => {
    context.saveDatabase.run(
      `UPDATE named_pilot
       SET resting_until_utc = $resting_until_utc,
           updated_at_utc = $updated_at_utc
       WHERE named_pilot_id = $named_pilot_id`,
      {
        $resting_until_utc: "2026-03-17T00:10:00.000Z",
        $updated_at_utc: restingSeed.startedAtUtc,
        $named_pilot_id: restingSeed.namedPilotId,
      },
    );
    await context.saveDatabase.persist();
  });

  const restingPayload = await loadContractsViewPayload(backend, airportReference, restingSaveId, "scheduled");
  assert.ok(restingPayload);
  assert.equal(requireOffer(restingPayload, restingSeed.selectedOfferId).fitBucket, "blocked_now");

  const aogSaveId = uniqueSaveId("contracts_aog_truth");
  const aogSeed = await seedOperationalContractsSave(backend, airportReference, aogSaveId);
  const fleetState = await backend.loadFleetState(aogSaveId);
  assert.ok(fleetState?.aircraft[0]);
  await backend.withExistingSaveDatabase(aogSaveId, async (context) => {
    context.saveDatabase.run(
      `UPDATE company_aircraft
       SET dispatch_available = 0
       WHERE aircraft_id = $aircraft_id`,
      {
        $aircraft_id: fleetState.aircraft[0].aircraftId,
      },
    );
    context.saveDatabase.run(
      `UPDATE maintenance_program_state
       SET maintenance_state_input = 'aog',
           aog_flag = 1,
           updated_at_utc = $updated_at_utc
       WHERE aircraft_id = $aircraft_id`,
      {
        $updated_at_utc: aogSeed.startedAtUtc,
        $aircraft_id: fleetState.aircraft[0].aircraftId,
      },
    );
    await context.saveDatabase.persist();
  });

  const aogPayload = await loadContractsViewPayload(backend, airportReference, aogSaveId, "scheduled");
  assert.ok(aogPayload);
  assert.equal(requireOffer(aogPayload, aogSeed.selectedOfferId).fitBucket, "blocked_now");

  const regionalSaveId = uniqueSaveId("contracts_regional_phase");
  const regionalSeed = await seedOperationalContractsSave(backend, airportReference, regionalSaveId);
  await backend.withExistingSaveDatabase(regionalSaveId, async (context) => {
    const companyRow = context.saveDatabase.getOne(
      `SELECT active_company_id AS companyId
       FROM save_game
       WHERE save_id = $save_id
       LIMIT 1`,
      { $save_id: regionalSaveId },
    );
    assert.ok(companyRow?.companyId);
    context.saveDatabase.run(
      `UPDATE company
       SET company_phase = 'regional_carrier',
           progression_tier = 3
       WHERE company_id = $company_id`,
      { $company_id: companyRow.companyId },
    );
    await context.saveDatabase.persist();
  });
  await refreshContractBoard(backend, regionalSaveId, regionalSeed.startedAtUtc, "manual");

  const regionalBoard = await backend.loadActiveContractBoard(regionalSaveId);
  assert.ok(regionalBoard);
  const heavyAndWidebodyBoardOffers = regionalBoard.offers.filter((offer) =>
    offer.likelyRole === "heavy_freighter" || offer.likelyRole === "widebody_airliner");
  assert.ok(heavyAndWidebodyBoardOffers.length > 0);
  assert.equal(
    heavyAndWidebodyBoardOffers.every((offer) => offer.explanationMetadata.fit_bucket === "blocked_now"),
    true,
  );

  const regionalPayload = await loadContractsViewPayload(backend, airportReference, regionalSaveId, "scheduled");
  assert.ok(regionalPayload);
  const heavyAndWidebodyPayloadOffers = regionalPayload.offers.filter((offer) =>
    offer.likelyRole === "heavy_freighter" || offer.likelyRole === "widebody_airliner");
  assert.ok(heavyAndWidebodyPayloadOffers.length > 0);
  assert.equal(
    heavyAndWidebodyPayloadOffers.every((offer) => offer.fitBucket === "blocked_now"),
    true,
  );
} finally {
  await harness.cleanup();
}
