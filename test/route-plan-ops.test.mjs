/*
 * Regression coverage for route plan ops.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  createTestHarness,
  pickFlyableOffer,
  refreshContractBoard,
  saveAndCommitSchedule,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import { acceptRoutePlanOffers } from "../dist/ui/route-plan-accept.js";
import { bindRoutePlanToAircraft } from "../dist/ui/route-plan-dispatch.js";
import {
  addCandidateOfferToRoutePlan,
  clearRoutePlan,
  loadRoutePlanState,
  removeRoutePlanItem,
  reorderRoutePlanItem,
} from "../dist/ui/route-plan-state.js";

const harness = await createTestHarness("flightline-route-plan-ops");
const { backend } = harness;

try {
  {
    const saveId = uniqueSaveId("route_plan_ops");
    const startedAtUtc = await createCompanySave(backend, saveId);
    await refreshContractBoard(backend, saveId, startedAtUtc);

    const board = await backend.loadActiveContractBoard(saveId);
    assert.ok(board);
    const offers = board.offers.filter((offer) => offer.offerStatus === "available").slice(0, 3);
    assert.equal(offers.length, 3);

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      for (const offer of offers) {
        const mutation = addCandidateOfferToRoutePlan(context.saveDatabase, saveId, offer.contractOfferId);
        assert.equal(mutation.success, true);
      }
      await context.saveDatabase.persist();
    });

    let routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items.length, 3);

    const firstItemId = routePlan.items[0].routePlanItemId;
    const secondItemId = routePlan.items[1].routePlanItemId;
    const thirdItemId = routePlan.items[2].routePlanItemId;

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      const reorder = reorderRoutePlanItem(context.saveDatabase, saveId, secondItemId, "up");
      assert.equal(reorder.success, true);
      await context.saveDatabase.persist();
    });

    routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items[0].routePlanItemId, secondItemId);
    assert.equal(routePlan.items[1].routePlanItemId, firstItemId);
    assert.equal(routePlan.items[2].routePlanItemId, thirdItemId);

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      const reorder = reorderRoutePlanItem(context.saveDatabase, saveId, secondItemId, "down", 3);
      assert.equal(reorder.success, true);
      await context.saveDatabase.persist();
    });

    routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items[0].routePlanItemId, firstItemId);
    assert.equal(routePlan.items[1].routePlanItemId, thirdItemId);
    assert.equal(routePlan.items[2].routePlanItemId, secondItemId);

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      const remove = removeRoutePlanItem(context.saveDatabase, saveId, firstItemId);
      assert.equal(remove.success, true);
      await context.saveDatabase.persist();
    });

    routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items.length, 2);
    assert.equal(routePlan.items[0].sequenceNumber, 1);
    assert.equal(routePlan.items[0].routePlanItemId, thirdItemId);
    assert.equal(routePlan.items[1].sequenceNumber, 2);
    assert.equal(routePlan.items[1].routePlanItemId, secondItemId);

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      const cleared = clearRoutePlan(context.saveDatabase, saveId);
      assert.equal(cleared.success, true);
      await context.saveDatabase.persist();
    });

    routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items.length, 0);
  }

  {
    const saveId = uniqueSaveId("route_plan_errors");
    const startedAtUtc = await createCompanySave(backend, saveId);
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208RO" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 2,
      fixedCostAmount: 12_000,
    });
    await refreshContractBoard(backend, saveId, startedAtUtc);

    const emptyAccept = await acceptRoutePlanOffers(backend, saveId, [], `cmd_${saveId}_batch`);
    assert.equal(emptyAccept.success, false);
    assert.match(emptyAccept.error ?? "", /select at least one/i);

    const fleetState = await backend.loadFleetState(saveId);
    const board = await backend.loadActiveContractBoard(saveId);
    assert.ok(fleetState?.aircraft[0]);
    assert.ok(board);

    const selectedOffer = pickFlyableOffer(board, fleetState.aircraft[0], backend.getAirportReference());
    assert.ok(selectedOffer);

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      const mutation = addCandidateOfferToRoutePlan(context.saveDatabase, saveId, selectedOffer.contractOfferId);
      assert.equal(mutation.success, true);
      await context.saveDatabase.persist();
    });

    const acceptResult = await backend.dispatch({
      commandId: `cmd_${saveId}_accept`,
      saveId,
      commandName: "AcceptContractOffer",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        contractOfferId: selectedOffer.contractOfferId,
      },
    });
    assert.equal(acceptResult.success, true);

    await saveAndCommitSchedule(
      backend,
      saveId,
      startedAtUtc,
      fleetState.aircraft[0].aircraftId,
      [
        {
          legType: "reposition",
          originAirportId: "KDEN",
          destinationAirportId: "KCOS",
          plannedDepartureUtc: "2026-03-16T16:00:00.000Z",
          plannedArrivalUtc: "2026-03-16T17:10:00.000Z",
        },
      ],
    );

    const bindResult = await bindRoutePlanToAircraft(
      backend,
      saveId,
      fleetState.aircraft[0].aircraftId,
      `cmd_${saveId}_bind`,
    );
    assert.equal(bindResult.success, false);
    assert.match(bindResult.error ?? "", /not dispatch ready/i);
  }
} finally {
  await harness.cleanup();
}
