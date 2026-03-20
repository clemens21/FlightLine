/*
 * Focused backend coverage for the first-pass pilot hiring market.
 * This locks in market hire-type truth, named candidate identity, and the contract-hire training restriction.
 */

import assert from "node:assert/strict";

import {
  activateStaffingPackage,
  acquireAircraft,
  createCompanySave,
  createTestHarness,
  refreshContractBoard,
  refreshStaffingMarket,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";

const harness = await createTestHarness("flightline-staffing-market");
const { backend } = harness;

function collectFitBuckets(board) {
  return [...new Set(
    board.offers
      .map((offer) => typeof offer.explanationMetadata?.fit_bucket === "string" ? offer.explanationMetadata.fit_bucket : undefined)
      .filter((fitBucket) => typeof fitBucket === "string"),
  )].sort();
}

try {
  const saveId = uniqueSaveId("staffing_market");
  const startedAtUtc = await createCompanySave(backend, saveId, {
    startedAtUtc: "2026-03-16T12:00:00.000Z",
    startingCashAmount: 10_000_000,
  });

  const refreshResult = await refreshStaffingMarket(backend, saveId, startedAtUtc, "bootstrap");
  assert.equal(refreshResult.success, true);

  const staffingMarket = await backend.loadActiveStaffingMarket(saveId);
  assert.ok(staffingMarket);
  assert.ok(staffingMarket.offers.length >= 1);
  assert.equal(staffingMarket.offers.every((offer) => offer.laborCategory === "pilot"), true);
  assert.equal(staffingMarket.offers.every((offer) => typeof offer.displayName === "string" && offer.displayName.length > 0), true);
  assert.equal(staffingMarket.offers.every((offer) => offer.candidateState === "available_now"), true);
  assert.equal(staffingMarket.offers.every((offer) => Array.isArray(offer.certifications) && offer.certifications.length >= 1), true);
  assert.equal(staffingMarket.offers.some((offer) => offer.employmentModel === "direct_hire"), true);
  assert.equal(staffingMarket.offers.some((offer) => offer.employmentModel === "contract_hire"), true);
  assert.equal(
    staffingMarket.offers
      .filter((offer) => offer.employmentModel === "contract_hire")
      .every((offer) => typeof offer.endsAtUtc === "string" && offer.endsAtUtc.length > 0),
    true,
  );
  assert.equal(
    staffingMarket.offers
      .filter((offer) => offer.employmentModel === "direct_hire")
      .every((offer) => offer.endsAtUtc === undefined),
    true,
  );

  const selectedOffer = staffingMarket.offers.find((offer) => offer.employmentModel === "contract_hire");
  assert.ok(selectedOffer);

  const hireResult = await backend.dispatch({
    commandId: `cmd_${saveId}_hire_candidate`,
    saveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      laborCategory: selectedOffer.laborCategory,
      employmentModel: selectedOffer.employmentModel,
      qualificationGroup: selectedOffer.qualificationGroup,
      coverageUnits: selectedOffer.coverageUnits,
      fixedCostAmount: selectedOffer.fixedCostAmount,
      variableCostRate: selectedOffer.variableCostRate,
      startsAtUtc: selectedOffer.startsAtUtc,
      endsAtUtc: selectedOffer.endsAtUtc,
      sourceOfferId: selectedOffer.staffingOfferId,
    },
  });
  assert.equal(hireResult.success, true, hireResult.hardBlockers?.[0] ?? "Expected selected pilot candidate hire to succeed.");

  const staffingState = await backend.loadStaffingState(saveId);
  assert.ok(staffingState);
  const hiredPackage = staffingState.staffingPackages.find((entry) => entry.sourceOfferId === selectedOffer.staffingOfferId);
  assert.ok(hiredPackage);
  assert.equal(hiredPackage.employmentModel, "contract_hire");
  assert.equal(hiredPackage.endsAtUtc, selectedOffer.endsAtUtc);
  const hiredPilot = staffingState.namedPilots.find((pilot) => pilot.staffingPackageId === hiredPackage.staffingPackageId);
  assert.ok(hiredPilot);
  assert.equal(hiredPilot.employmentModel, "contract_hire");
  assert.equal(hiredPilot.endsAtUtc, selectedOffer.endsAtUtc);
  assert.equal(
    staffingState.namedPilots.some((pilot) =>
      pilot.displayName === selectedOffer.displayName
      && pilot.certifications.join(",") === selectedOffer.certifications.join(",")),
    true,
  );

  const updatedMarket = await backend.loadActiveStaffingMarket(saveId);
  assert.ok(updatedMarket);
  assert.equal(updatedMarket.offers.some((offer) => offer.staffingOfferId === selectedOffer.staffingOfferId), false);

  await backend.closeSaveSession(saveId);

  const reloadedStaffingState = await backend.loadStaffingState(saveId);
  assert.ok(reloadedStaffingState);
  const reloadedPackage = reloadedStaffingState.staffingPackages.find((entry) => entry.sourceOfferId === selectedOffer.staffingOfferId);
  assert.ok(reloadedPackage);
  assert.equal(reloadedPackage.employmentModel, "contract_hire");
  assert.equal(reloadedPackage.endsAtUtc, selectedOffer.endsAtUtc);
  const reloadedPilot = reloadedStaffingState.namedPilots.find((pilot) => pilot.staffingPackageId === reloadedPackage.staffingPackageId);
  assert.ok(reloadedPilot);
  assert.equal(reloadedPilot.employmentModel, "contract_hire");
  assert.equal(reloadedPilot.endsAtUtc, selectedOffer.endsAtUtc);
  assert.equal(
    reloadedStaffingState.namedPilots.some((pilot) =>
      pilot.displayName === selectedOffer.displayName
      && pilot.certifications.join(",") === selectedOffer.certifications.join(",")),
    true,
  );

  const blockedCertificationResult = await backend.dispatch({
    commandId: `cmd_${saveId}_contract_certification_block`,
    saveId,
    commandName: "StartNamedPilotTraining",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      namedPilotId: reloadedPilot.namedPilotId,
      targetCertificationCode: "MEPL",
    },
  });
  assert.equal(blockedCertificationResult.success, false);
  assert.match(blockedCertificationResult.hardBlockers?.[0] ?? "", /contract hire/i);

  const recurrentTrainingResult = await backend.dispatch({
    commandId: `cmd_${saveId}_contract_recurrent_training`,
    saveId,
    commandName: "StartNamedPilotTraining",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      namedPilotId: reloadedPilot.namedPilotId,
    },
  });
  assert.equal(
    recurrentTrainingResult.success,
    true,
    recurrentTrainingResult.hardBlockers?.[0] ?? "Expected recurrent training for a contract hire to succeed.",
  );
  assert.equal(recurrentTrainingResult.metadata?.trainingProgramKind, "recurrent");

  const contractEndUtc = selectedOffer.endsAtUtc;
  assert.ok(contractEndUtc);
  const postExpiryTargetUtc = new Date(new Date(contractEndUtc).getTime() + 3_600_000).toISOString();
  const expiryAdvanceResult = await backend.dispatch({
    commandId: `cmd_${saveId}_contract_expiry_rollover`,
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: postExpiryTargetUtc,
      stopConditions: ["target_time"],
    },
  });
  assert.equal(expiryAdvanceResult.success, true, expiryAdvanceResult.hardBlockers?.[0] ?? "Expected contract expiry rollover to succeed.");

  const companyContextAfterExpiry = await backend.loadCompanyContext(saveId);
  assert.ok(companyContextAfterExpiry);
  assert.equal(companyContextAfterExpiry.activeStaffingPackageCount, 0);

  const staffingStateAfterExpiry = await backend.loadStaffingState(saveId);
  assert.ok(staffingStateAfterExpiry);
  const expiredPackage = staffingStateAfterExpiry.staffingPackages.find((entry) => entry.staffingPackageId === reloadedPackage.staffingPackageId);
  assert.ok(expiredPackage);
  assert.equal(expiredPackage.status, "expired");
  assert.equal(expiredPackage.recurringObligationId, undefined);
  assert.equal(staffingStateAfterExpiry.totalActiveCoverageUnits, 0);
  assert.equal(staffingStateAfterExpiry.totalMonthlyFixedCostAmount, 0);
  const expiredPilot = staffingStateAfterExpiry.namedPilots.find((pilot) => pilot.namedPilotId === reloadedPilot.namedPilotId);
  assert.ok(expiredPilot);
  assert.equal(expiredPilot.packageStatus, "expired");
  assert.equal(expiredPilot.availabilityState, "expired");

  const eventLogAfterExpiry = await backend.loadRecentEventLog(saveId, 12);
  assert.ok(eventLogAfterExpiry);
  assert.equal(
    eventLogAfterExpiry.entries.some((entry) =>
      entry.eventType === "staffing_package_expired"
      && entry.sourceObjectId === reloadedPackage.staffingPackageId),
    true,
  );

  const blockedExpiredTrainingResult = await backend.dispatch({
    commandId: `cmd_${saveId}_contract_expired_training_block`,
    saveId,
    commandName: "StartNamedPilotTraining",
    issuedAtUtc: postExpiryTargetUtc,
    actorType: "player",
    payload: {
      namedPilotId: expiredPilot.namedPilotId,
    },
  });
  assert.equal(blockedExpiredTrainingResult.success, false);
  assert.match(blockedExpiredTrainingResult.hardBlockers?.[0] ?? "", /active pilot coverage/i);

  const pendingSaveId = uniqueSaveId("staffing_pending");
  const pendingStartedAtUtc = await createCompanySave(backend, pendingSaveId, {
    startedAtUtc: "2026-03-16T13:00:00.000Z",
    startingCashAmount: 3_500_000,
  });
  await acquireAircraft(backend, pendingSaveId, pendingStartedAtUtc, {
    aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    registration: "N208PD",
  });
  await refreshContractBoard(backend, pendingSaveId, pendingStartedAtUtc, "bootstrap");
  const pendingBoardBeforeStaffing = await backend.loadActiveContractBoard(pendingSaveId);
  assert.ok(pendingBoardBeforeStaffing);
  assert.deepEqual(collectFitBuckets(pendingBoardBeforeStaffing), ["blocked_now"]);

  const pendingPackageStartsAtUtc = "2026-03-17T13:00:00.000Z";
  const pendingActivationResult = await activateStaffingPackage(backend, pendingSaveId, pendingStartedAtUtc, {
    laborCategory: "pilot",
    employmentModel: "direct_hire",
    qualificationGroup: "single_turboprop_utility",
    coverageUnits: 1,
    fixedCostAmount: 4_200,
    startsAtUtc: pendingPackageStartsAtUtc,
    endsAtUtc: "2026-03-18T13:00:00.000Z",
  });
  assert.equal(
    pendingActivationResult.success,
    true,
    pendingActivationResult.hardBlockers?.[0] ?? "Expected future-start pilot staffing package to activate.",
  );

  const pendingCompanyContext = await backend.loadCompanyContext(pendingSaveId);
  assert.ok(pendingCompanyContext);
  assert.equal(pendingCompanyContext.activeStaffingPackageCount, 0);

  const pendingStaffingState = await backend.loadStaffingState(pendingSaveId);
  assert.ok(pendingStaffingState);
  assert.equal(pendingStaffingState.totalActiveCoverageUnits, 0);
  assert.equal(pendingStaffingState.totalPendingCoverageUnits, 1);
  assert.equal(pendingStaffingState.totalMonthlyFixedCostAmount, 0);
  assert.equal(pendingStaffingState.namedPilots.length, 1);
  assert.equal(pendingStaffingState.namedPilots[0]?.packageStatus, "pending");
  assert.equal(pendingStaffingState.namedPilots[0]?.availabilityState, "pending");
  const pendingPackage = pendingStaffingState.staffingPackages[0];
  assert.ok(pendingPackage);

  const pendingEventLog = await backend.loadRecentEventLog(pendingSaveId, 8);
  assert.ok(pendingEventLog);
  assert.equal(
    pendingEventLog.entries.some((entry) =>
      entry.eventType === "staffing_package_scheduled"
      && entry.sourceObjectId === pendingPackage.staffingPackageId),
    true,
  );
  assert.equal(
    pendingEventLog.entries.some((entry) =>
      entry.eventType === "staffing_package_activated"
      && entry.sourceObjectId === pendingPackage.staffingPackageId),
    false,
  );

  await refreshContractBoard(backend, pendingSaveId, pendingStartedAtUtc, "manual");
  const pendingBoardAfterFutureStaffing = await backend.loadActiveContractBoard(pendingSaveId);
  assert.ok(pendingBoardAfterFutureStaffing);
  assert.deepEqual(collectFitBuckets(pendingBoardAfterFutureStaffing), ["blocked_now"]);

  const pendingStartAdvanceResult = await backend.dispatch({
    commandId: `cmd_${pendingSaveId}_advance_staffing_start`,
    saveId: pendingSaveId,
    commandName: "AdvanceTime",
    issuedAtUtc: pendingStartedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: "2026-03-17T14:00:00.000Z",
      stopConditions: ["target_time"],
    },
  });
  assert.equal(
    pendingStartAdvanceResult.success,
    true,
    pendingStartAdvanceResult.hardBlockers?.[0] ?? "Expected pending staffing package to activate on time advance.",
  );

  const companyContextAfterPendingStart = await backend.loadCompanyContext(pendingSaveId);
  assert.ok(companyContextAfterPendingStart);
  assert.equal(companyContextAfterPendingStart.activeStaffingPackageCount, 1);

  const staffingStateAfterPendingStart = await backend.loadStaffingState(pendingSaveId);
  assert.ok(staffingStateAfterPendingStart);
  const activePackage = staffingStateAfterPendingStart.staffingPackages.find((entry) => entry.staffingPackageId === pendingPackage.staffingPackageId);
  assert.ok(activePackage);
  assert.equal(activePackage.status, "active");
  assert.equal(staffingStateAfterPendingStart.totalActiveCoverageUnits, 1);
  assert.equal(staffingStateAfterPendingStart.totalPendingCoverageUnits, 0);
  assert.equal(staffingStateAfterPendingStart.totalMonthlyFixedCostAmount, 4_200);
  const activePilot = staffingStateAfterPendingStart.namedPilots.find((pilot) => pilot.staffingPackageId === pendingPackage.staffingPackageId);
  assert.ok(activePilot);
  assert.equal(activePilot.packageStatus, "active");
  assert.equal(activePilot.availabilityState, "ready");

  const eventLogAfterPendingStart = await backend.loadRecentEventLog(pendingSaveId, 12);
  assert.ok(eventLogAfterPendingStart);
  assert.equal(
    eventLogAfterPendingStart.entries.some((entry) =>
      entry.eventType === "staffing_package_activated"
      && entry.sourceObjectId === pendingPackage.staffingPackageId),
    true,
  );

  const postPendingExpiryAdvanceResult = await backend.dispatch({
    commandId: `cmd_${pendingSaveId}_advance_staffing_expiry`,
    saveId: pendingSaveId,
    commandName: "AdvanceTime",
    issuedAtUtc: "2026-03-17T14:00:00.000Z",
    actorType: "player",
    payload: {
      targetTimeUtc: "2026-03-18T14:00:00.000Z",
      stopConditions: ["target_time"],
    },
  });
  assert.equal(
    postPendingExpiryAdvanceResult.success,
    true,
    postPendingExpiryAdvanceResult.hardBlockers?.[0] ?? "Expected pending staffing package to expire after its end time.",
  );

  const companyContextAfterPendingExpiry = await backend.loadCompanyContext(pendingSaveId);
  assert.ok(companyContextAfterPendingExpiry);
  assert.equal(companyContextAfterPendingExpiry.activeStaffingPackageCount, 0);

  const staffingStateAfterPendingExpiry = await backend.loadStaffingState(pendingSaveId);
  assert.ok(staffingStateAfterPendingExpiry);
  const expiredPendingPackage = staffingStateAfterPendingExpiry.staffingPackages.find((entry) => entry.staffingPackageId === pendingPackage.staffingPackageId);
  assert.ok(expiredPendingPackage);
  assert.equal(expiredPendingPackage.status, "expired");
  assert.equal(staffingStateAfterPendingExpiry.totalActiveCoverageUnits, 0);
  assert.equal(staffingStateAfterPendingExpiry.totalPendingCoverageUnits, 0);
  assert.equal(staffingStateAfterPendingExpiry.totalMonthlyFixedCostAmount, 0);
  const expiredPendingPilot = staffingStateAfterPendingExpiry.namedPilots.find((pilot) => pilot.staffingPackageId === pendingPackage.staffingPackageId);
  assert.ok(expiredPendingPilot);
  assert.equal(expiredPendingPilot.packageStatus, "expired");
  assert.equal(expiredPendingPilot.availabilityState, "expired");

  const blockedExpiredTransferResult = await backend.dispatch({
    commandId: `cmd_${pendingSaveId}_expired_transfer_block`,
    saveId: pendingSaveId,
    commandName: "StartNamedPilotTransfer",
    issuedAtUtc: "2026-03-18T14:00:00.000Z",
    actorType: "player",
    payload: {
      namedPilotId: expiredPendingPilot.namedPilotId,
      destinationAirportId: "KDEN",
    },
  });
  assert.equal(blockedExpiredTransferResult.success, false);
  assert.match(blockedExpiredTransferResult.hardBlockers?.[0] ?? "", /active pilot coverage/i);
} finally {
  await harness.cleanup();
}
