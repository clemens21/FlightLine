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

  const board = await backend.loadActiveContractBoard(saveId);
  assert.ok(board);
  const selectedOffer = board.offers.find((offer) => offer.offerStatus === "available");
  assert.ok(selectedOffer);

  const addResult = await backend.withExistingSaveDatabase(saveId, async (context) => {
    const mutation = addCandidateOfferToRoutePlan(context.saveDatabase, saveId, selectedOffer.contractOfferId);
    await context.saveDatabase.persist();
    return mutation;
  });
  assert.equal(addResult?.success, true);
  assert.ok(addResult?.routePlanItemId);

  const plannedPayload = await loadContractsViewPayload(backend, airportReference, saveId, "scheduled");
  assert.ok(plannedPayload);
  assert.equal(plannedPayload.offers.length, plannedPayload.board.offerCount);
  assert.ok(plannedPayload.routePlan);
  assert.equal(plannedPayload.routePlan.items.length, 1);
  assert.equal(plannedPayload.routePlan.items[0].sourceType, "candidate_offer");
  assert.equal(plannedPayload.routePlan.items[0].plannerItemStatus, "candidate_available");
  assert.equal(plannedPayload.routePlan.items[0].routePlanItemId, addResult.routePlanItemId);

  const plannedOffer = plannedPayload.offers.find((offer) => offer.contractOfferId === selectedOffer.contractOfferId);
  assert.ok(plannedOffer);
  assert.equal(plannedOffer.routePlanItemId, addResult.routePlanItemId);
  assert.equal(plannedOffer.routePlanItemStatus, "candidate_available");
  assert.equal(plannedPayload.plannerEndpointAirportId, plannedPayload.routePlan.items[0].destination.airportId);
  assert.equal(typeof plannedOffer.directDispatchEligible, "boolean");
  assert.equal(typeof plannedOffer.directDispatchReason, "string");
  assert.ok("nearestRelevantAircraft" in plannedOffer);

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

  const acceptedOffer = acceptedPayload.offers.find((offer) => offer.contractOfferId === selectedOffer.contractOfferId);
  assert.ok(acceptedOffer);
  assert.equal(acceptedOffer.offerStatus, "accepted");
  assert.equal(typeof acceptedOffer.directDispatchEligible, "boolean");
  assert.equal(typeof acceptedOffer.directDispatchReason, "string");
}
finally {
  await harness.cleanup();
}
