/*
 * Regression coverage for contracts view.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  createTestHarness,
  uniqueSaveId,
  refreshContractBoard,
} from "./helpers/flightline-testkit.mjs";
import { addCandidateOfferToRoutePlan } from "../dist/ui/route-plan-state.js";
import { loadContractsViewPayload } from "../dist/ui/contracts-view.js";

function addHours(utcIsoString, hours) {
  return new Date(new Date(utcIsoString).getTime() + hours * 60 * 60 * 1000).toISOString();
}

const harness = await createTestHarness("flightline-contracts-view");
const { backend, airportReference } = harness;

try {
  const saveId = uniqueSaveId("contracts_view");
  const startedAtUtc = await createCompanySave(backend, saveId);
  await refreshContractBoard(backend, saveId, startedAtUtc);

  const initialPayload = await loadContractsViewPayload(backend, airportReference, saveId, "scheduled");
  assert.ok(initialPayload);
  assert.equal(
    initialPayload.offers.filter((offer) => offer.offerStatus === "available").length,
    initialPayload.board.offerCount,
  );
  const selectedOffer = initialPayload.offers.find((offer) => offer.offerStatus === "available");
  assert.ok(selectedOffer);
  assert.equal(typeof selectedOffer.directDispatchEligible, "boolean");
  assert.equal(typeof selectedOffer.directDispatchReason, "string");
  assert.ok("nearestRelevantAircraft" in selectedOffer);
  assert.equal(selectedOffer.urgencyBand === "stable" || selectedOffer.urgencyBand === "at_risk" || selectedOffer.urgencyBand === "overdue", true);
  assert.ok(initialPayload.offers.some((offer) => offer.urgencyBand === "at_risk"));
  const dynamicOffer = initialPayload.offers.find((offer) =>
    offer.offerStatus === "available"
    && offer.contractOfferId !== selectedOffer.contractOfferId
    && offer.timeRemainingHours > 48
    && offer.timeRemainingHours <= 72,
  );
  assert.ok(dynamicOffer);
  const initialDynamicPayoutAmount = dynamicOffer.payoutAmount;
  const advanceHoursToAtRisk = Math.max(1, Math.ceil(dynamicOffer.timeRemainingHours - 47));

  const advanceResult = await backend.dispatch({
    commandId: `cmd_${saveId}_advance_dynamic_offer`,
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: addHours(initialPayload.currentTimeUtc, advanceHoursToAtRisk),
      stopConditions: ["target_time"],
    },
  });
  assert.equal(advanceResult.success, true);

  const advancedPayload = await loadContractsViewPayload(backend, airportReference, saveId, "scheduled");
  assert.ok(advancedPayload);
  const advancedDynamicOffer = advancedPayload.offers.find((offer) => offer.contractOfferId === dynamicOffer.contractOfferId);
  assert.ok(advancedDynamicOffer);
  assert.ok(advancedDynamicOffer.payoutAmount > initialDynamicPayoutAmount);

  const addResult = await backend.withExistingSaveDatabase(saveId, async (context) => {
    const mutation = addCandidateOfferToRoutePlan(context.saveDatabase, saveId, dynamicOffer.contractOfferId);
    await context.saveDatabase.persist();
    return mutation;
  });
  assert.equal(addResult?.success, true);
  assert.ok(addResult?.routePlanItemId);

  const acceptResult = await backend.dispatch({
    commandId: `cmd_${saveId}_accept`,
    saveId,
    commandName: "AcceptContractOffer",
    issuedAtUtc: advancedPayload.currentTimeUtc,
    actorType: "player",
    payload: {
      contractOfferId: advancedDynamicOffer.contractOfferId,
    },
  });
  assert.equal(acceptResult.success, true);

  const acceptedPayload = await loadContractsViewPayload(backend, airportReference, saveId, "scheduled");
  assert.ok(acceptedPayload);
  assert.ok(acceptedPayload.routePlan);
  assert.equal(acceptedPayload.routePlan.items[0].sourceType, "accepted_contract");
  assert.equal(acceptedPayload.routePlan.items[0].plannerItemStatus, "accepted_ready");
  assert.equal(acceptedPayload.acceptedContracts.length, 1);

  const acceptedContract = acceptedPayload.acceptedContracts[0];
  assert.equal(acceptedContract.routePlanItemId, addResult.routePlanItemId);
  assert.equal(acceptedContract.routePlanItemStatus, "accepted_ready");
  assert.equal(acceptedPayload.companyContracts.some((contract) => contract.companyContractId === acceptedContract.companyContractId), true);
  assert.equal(acceptedContract.originContractOfferId, advancedDynamicOffer.contractOfferId);
  assert.equal(acceptedContract.payoutAmount, advancedDynamicOffer.payoutAmount);
  const acceptedPayoutAmount = acceptedContract.payoutAmount;
  assert.equal(typeof acceptedContract.hoursRemaining, "number");
  assert.equal(acceptedContract.urgencyBand === "stable" || acceptedContract.urgencyBand === "at_risk" || acceptedContract.urgencyBand === "overdue", true);
  assert.equal(acceptedContract.workState === "in_route_plan" || acceptedContract.workState === "ready_for_dispatch" || acceptedContract.workState === "assigned_elsewhere", true);
  assert.equal(acceptedContract.primaryActionKind === "send_to_route_plan" || acceptedContract.primaryActionKind === "open_route_plan" || acceptedContract.primaryActionKind === "open_dispatch", true);
  assert.equal(typeof acceptedContract.primaryActionLabel, "string");
  assert.equal(typeof acceptedContract.assignedAircraftReady, "boolean");

  const acceptedAdvanceResult = await backend.dispatch({
    commandId: `cmd_${saveId}_advance_after_accept`,
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: acceptedPayload.currentTimeUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: addHours(acceptedPayload.currentTimeUtc, 12),
      stopConditions: ["target_time"],
    },
  });
  assert.equal(acceptedAdvanceResult.success, true);

  const afterAcceptedAdvancePayload = await loadContractsViewPayload(backend, airportReference, saveId, "scheduled");
  assert.ok(afterAcceptedAdvancePayload);
  const lockedAcceptedContract = afterAcceptedAdvancePayload.acceptedContracts.find((contract) =>
    contract.companyContractId === acceptedContract.companyContractId,
  );
  assert.ok(lockedAcceptedContract);
  assert.equal(lockedAcceptedContract.payoutAmount, acceptedPayoutAmount);

  const rangeTruthSaveId = uniqueSaveId("contracts_view_range_truth");
  const rangeTruthStartedAtUtc = await createCompanySave(backend, rangeTruthSaveId, {
    startedAtUtc: "2026-03-16T13:00:00.000Z",
    startingCashAmount: 10_000_000,
  });
  await acquireAircraft(backend, rangeTruthSaveId, rangeTruthStartedAtUtc, {
    aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    registration: `N${rangeTruthSaveId.slice(-5).toUpperCase()}`,
  });
  await activateStaffingPackage(backend, rangeTruthSaveId, rangeTruthStartedAtUtc, {
    laborCategory: "pilot",
    employmentModel: "direct_hire",
    qualificationGroup: "single_turboprop_utility",
    coverageUnits: 1,
    fixedCostAmount: 4_200,
  });
  await refreshContractBoard(backend, rangeTruthSaveId, rangeTruthStartedAtUtc, "bootstrap");

  const rangeTruthBoard = await backend.loadActiveContractBoard(rangeTruthSaveId);
  assert.ok(rangeTruthBoard);
  const rangeTruthOffer = rangeTruthBoard.offers.find((offer) => offer.offerStatus === "available");
  assert.ok(rangeTruthOffer);
  await backend.withExistingSaveDatabase(rangeTruthSaveId, async (context) => {
    context.saveDatabase.run(
      `UPDATE contract_offer
       SET origin_airport_id = 'KDEN',
           destination_airport_id = 'LFPG',
           volume_type = 'passenger',
           passenger_count = 7,
           cargo_weight_lb = NULL,
           earliest_start_utc = '2026-03-16T15:00:00.000Z',
           latest_completion_utc = '2026-03-17T23:00:00.000Z'
       WHERE contract_offer_id = $contract_offer_id`,
      {
        $contract_offer_id: rangeTruthOffer.contractOfferId,
      },
    );
    await context.saveDatabase.persist();
  });

  const rangeTruthPayload = await loadContractsViewPayload(backend, airportReference, rangeTruthSaveId, "scheduled");
  assert.ok(rangeTruthPayload);
  const blockedRangeOffer = rangeTruthPayload.offers.find((offer) => offer.contractOfferId === rangeTruthOffer.contractOfferId);
  assert.ok(blockedRangeOffer);
  assert.equal(blockedRangeOffer.directDispatchEligible, false);
  assert.equal(blockedRangeOffer.nearestRelevantAircraft, null);
}
finally {
  await harness.cleanup();
}
