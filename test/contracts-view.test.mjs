/*
 * Regression coverage for contracts view.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";

import {
  createCompanySave,
  createTestHarness,
  uniqueSaveId,
  refreshContractBoard,
} from "./helpers/flightline-testkit.mjs";
import { addCandidateOfferToRoutePlan } from "../dist/ui/route-plan-state.js";
import { loadContractsViewPayload } from "../dist/ui/contracts-view.js";

const harness = await createTestHarness("flightline-contracts-view");
const { backend, airportReference } = harness;

try {
  const saveId = uniqueSaveId("contracts_view");
  const startedAtUtc = await createCompanySave(backend, saveId);
  await refreshContractBoard(backend, saveId, startedAtUtc);

  const initialPayload = await loadContractsViewPayload(backend, airportReference, saveId, "scheduled");
  assert.ok(initialPayload);
  assert.equal(initialPayload.offers.length, initialPayload.board.offerCount);
  const selectedOffer = initialPayload.offers.find((offer) => offer.offerStatus === "available");
  assert.ok(selectedOffer);
  assert.equal(typeof selectedOffer.directDispatchEligible, "boolean");
  assert.equal(typeof selectedOffer.directDispatchReason, "string");
  assert.ok("nearestRelevantAircraft" in selectedOffer);
  assert.equal(selectedOffer.urgencyBand === "stable" || selectedOffer.urgencyBand === "at_risk" || selectedOffer.urgencyBand === "overdue", true);
  assert.ok(initialPayload.offers.some((offer) => offer.urgencyBand === "at_risk"));

  const addResult = await backend.withExistingSaveDatabase(saveId, async (context) => {
    const mutation = addCandidateOfferToRoutePlan(context.saveDatabase, saveId, selectedOffer.contractOfferId);
    await context.saveDatabase.persist();
    return mutation;
  });
  assert.equal(addResult?.success, true);
  assert.ok(addResult?.routePlanItemId);

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
  assert.equal(typeof acceptedContract.hoursRemaining, "number");
  assert.equal(acceptedContract.urgencyBand === "stable" || acceptedContract.urgencyBand === "at_risk" || acceptedContract.urgencyBand === "overdue", true);
  assert.equal(acceptedContract.workState === "in_route_plan" || acceptedContract.workState === "ready_for_dispatch" || acceptedContract.workState === "assigned_elsewhere", true);
  assert.equal(acceptedContract.primaryActionKind === "send_to_route_plan" || acceptedContract.primaryActionKind === "open_route_plan" || acceptedContract.primaryActionKind === "open_dispatch", true);
  assert.equal(typeof acceptedContract.primaryActionLabel, "string");
  assert.equal(typeof acceptedContract.assignedAircraftReady, "boolean");
}
finally {
  await harness.cleanup();
}
