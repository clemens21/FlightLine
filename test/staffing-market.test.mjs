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
  estimateFlightMinutes,
  refreshContractBoard,
  refreshStaffingMarket,
  saveAndCommitSchedule,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";

const harness = await createTestHarness("flightline-staffing-market");
const { backend, airportReference } = harness;

function collectFitBuckets(board) {
  return [...new Set(
    board.offers
      .map((offer) => typeof offer.explanationMetadata?.fit_bucket === "string" ? offer.explanationMetadata.fit_bucket : undefined)
      .filter((fitBucket) => typeof fitBucket === "string"),
  )].sort();
}

function addMinutes(utcIsoString, minutes) {
  return new Date(new Date(utcIsoString).getTime() + minutes * 60_000).toISOString();
}

function findCandidatePairs(staffingMarket) {
  const pairs = new Map();

  for (const offer of staffingMarket.offers) {
    const candidateId = offer.candidateProfileId ?? offer.staffingOfferId;
    const existing = pairs.get(candidateId) ?? {
      candidateId,
      displayName: offer.displayName,
      directOffer: null,
      contractOffer: null,
    };

    if (offer.employmentModel === "direct_hire") {
      existing.directOffer = offer;
    }

    if (offer.employmentModel === "contract_hire") {
      existing.contractOffer = offer;
    }

    pairs.set(candidateId, existing);
  }

  return [...pairs.values()];
}

try {
  const directSaveId = uniqueSaveId("staffing_market_direct");
  const directStartedAtUtc = await createCompanySave(backend, directSaveId, {
    startedAtUtc: "2026-03-16T12:00:00.000Z",
    startingCashAmount: 10_000_000,
  });

  const directRefreshResult = await refreshStaffingMarket(backend, directSaveId, directStartedAtUtc, "bootstrap");
  assert.equal(directRefreshResult.success, true);

  const directMarket = await backend.loadActiveStaffingMarket(directSaveId);
  assert.ok(directMarket);
  assert.ok(directMarket.offers.length >= 16);
  assert.equal(directMarket.offers.every((offer) => offer.laborCategory === "pilot"), true);
  assert.equal(directMarket.offers.every((offer) => typeof offer.displayName === "string" && offer.displayName.length > 0), true);
  assert.equal(directMarket.offers.every((offer) => offer.candidateState === "available_now"), true);
  assert.equal(directMarket.offers.every((offer) => Array.isArray(offer.certifications) && offer.certifications.length >= 1), true);
  assert.equal(directMarket.offers.some((offer) => offer.employmentModel === "direct_hire"), true);
  assert.equal(directMarket.offers.some((offer) => offer.employmentModel === "contract_hire"), true);
  assert.equal(
    directMarket.offers
      .filter((offer) => offer.employmentModel === "contract_hire")
      .every((offer) =>
        typeof offer.endsAtUtc === "string"
        && offer.endsAtUtc.length > 0
        && typeof offer.variableCostRate === "number"
        && offer.variableCostRate > 0),
    true,
  );
  assert.equal(
    directMarket.offers
      .filter((offer) => offer.employmentModel === "direct_hire")
      .every((offer) => offer.endsAtUtc === undefined && offer.variableCostRate === undefined),
    true,
  );
  assert.equal(
    directMarket.offers.every((offer) =>
      typeof offer.candidateProfileId === "string"
      && offer.candidateProfileId.length > 0
      && typeof offer.candidateProfile?.qualificationLane === "string"
      && offer.candidateProfile.totalCareerHours > 0
      && offer.candidateProfile.primaryQualificationFamilyHours > 0
      && offer.candidateProfile.companyHours === 0
      && typeof offer.pricingExplanation?.summary === "string"
      && Array.isArray(offer.pricingExplanation?.drivers)
      && offer.pricingExplanation.drivers.length >= 4),
    true,
  );
  assert.equal(
    directMarket.offers.every((offer) =>
      offer.pricingExplanation.drivers.some((driver) => driver.startsWith("Qualification lane:"))
      && offer.pricingExplanation.drivers.some((driver) => driver.startsWith("Total career time:"))
      && offer.pricingExplanation.drivers.some((driver) => driver.startsWith("Lane time:"))),
    true,
  );

  const directCandidatePairs = findCandidatePairs(directMarket);
  assert.ok(directCandidatePairs.length >= 8);
  assert.equal(
    directCandidatePairs.every((pair) => pair.directOffer && pair.contractOffer),
    true,
  );

  const selectedDirectPair = directCandidatePairs[0];
  assert.ok(selectedDirectPair?.directOffer);
  assert.ok(selectedDirectPair?.contractOffer);
  const selectedDirectOffer = selectedDirectPair.directOffer;
  const selectedDirectSiblingOffer = selectedDirectPair.contractOffer;
  const directCompanyBeforeHire = await backend.loadCompanyContext(directSaveId);
  assert.ok(directCompanyBeforeHire);

  const directHireResult = await backend.dispatch({
    commandId: `cmd_${directSaveId}_hire_candidate`,
    saveId: directSaveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: directStartedAtUtc,
    actorType: "player",
    payload: {
      laborCategory: selectedDirectOffer.laborCategory,
      employmentModel: selectedDirectOffer.employmentModel,
      qualificationGroup: selectedDirectOffer.qualificationGroup,
      coverageUnits: selectedDirectOffer.coverageUnits,
      fixedCostAmount: selectedDirectOffer.fixedCostAmount,
      variableCostRate: selectedDirectOffer.variableCostRate,
      startsAtUtc: selectedDirectOffer.startsAtUtc,
      endsAtUtc: selectedDirectOffer.endsAtUtc,
      sourceOfferId: selectedDirectOffer.staffingOfferId,
    },
  });
  assert.equal(
    directHireResult.success,
    true,
    directHireResult.hardBlockers?.[0] ?? "Expected selected direct pilot candidate hire to succeed.",
  );
  assert.equal(directHireResult.emittedLedgerEntryIds.length, 0);

  const directCompanyAfterHire = await backend.loadCompanyContext(directSaveId);
  assert.ok(directCompanyAfterHire);
  assert.equal(directCompanyAfterHire.currentCashAmount, directCompanyBeforeHire.currentCashAmount);

  const directStaffingState = await backend.loadStaffingState(directSaveId);
  assert.ok(directStaffingState);
  const directPackage = directStaffingState.staffingPackages.find((entry) => entry.sourceOfferId === selectedDirectOffer.staffingOfferId);
  assert.ok(directPackage);
  assert.equal(directPackage.employmentModel, "direct_hire");
  assert.equal(directPackage.fixedCostAmount, selectedDirectOffer.fixedCostAmount);
  assert.equal(directPackage.variableCostRate, undefined);
  assert.equal(typeof directPackage.recurringObligationId, "string");
  assert.equal(directStaffingState.totalMonthlyFixedCostAmount, selectedDirectOffer.fixedCostAmount);
  const directPilot = directStaffingState.namedPilots.find((pilot) => pilot.staffingPackageId === directPackage.staffingPackageId);
  assert.ok(directPilot);
  assert.equal(directPilot.employmentModel, "direct_hire");
  assert.deepEqual(directPilot.candidateProfile, selectedDirectOffer.candidateProfile);
  assert.equal(directPilot.sourceCandidateProfileId, selectedDirectOffer.candidateProfileId);

  const directMarketAfterHire = await backend.loadActiveStaffingMarket(directSaveId);
  assert.ok(directMarketAfterHire);
  assert.equal(
    directMarketAfterHire.offers.some((offer) => offer.staffingOfferId === selectedDirectOffer.staffingOfferId),
    false,
  );
  assert.equal(
    directMarketAfterHire.offers.some((offer) => offer.staffingOfferId === selectedDirectSiblingOffer.staffingOfferId),
    false,
  );
  assert.equal(
    directMarketAfterHire.offers.some((offer) => offer.candidateProfileId === selectedDirectOffer.candidateProfileId),
    false,
  );

  const blockedSiblingHireResult = await backend.dispatch({
    commandId: `cmd_${directSaveId}_hire_candidate_duplicate_path`,
    saveId: directSaveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: directStartedAtUtc,
    actorType: "player",
    payload: {
      laborCategory: selectedDirectSiblingOffer.laborCategory,
      employmentModel: selectedDirectSiblingOffer.employmentModel,
      qualificationGroup: selectedDirectSiblingOffer.qualificationGroup,
      coverageUnits: selectedDirectSiblingOffer.coverageUnits,
      fixedCostAmount: selectedDirectSiblingOffer.fixedCostAmount,
      variableCostRate: selectedDirectSiblingOffer.variableCostRate,
      startsAtUtc: selectedDirectSiblingOffer.startsAtUtc,
      endsAtUtc: selectedDirectSiblingOffer.endsAtUtc,
      sourceOfferId: selectedDirectSiblingOffer.staffingOfferId,
    },
  });
  assert.equal(blockedSiblingHireResult.success, false);
  assert.match(
    blockedSiblingHireResult.hardBlockers?.join(" ") ?? "",
    /no longer available|already on the roster/i,
  );

  const directStaffingStateAfterBlockedDuplicate = await backend.loadStaffingState(directSaveId);
  assert.ok(directStaffingStateAfterBlockedDuplicate);
  assert.equal(
    directStaffingStateAfterBlockedDuplicate.namedPilots.filter((pilot) =>
      pilot.sourceCandidateProfileId === selectedDirectOffer.candidateProfileId
    ).length,
    1,
  );

  await backend.closeSaveSession(directSaveId);

  const reloadedDirectStaffingState = await backend.loadStaffingState(directSaveId);
  assert.ok(reloadedDirectStaffingState);
  const reloadedDirectPilot = reloadedDirectStaffingState.namedPilots.find((pilot) => pilot.staffingPackageId === directPackage.staffingPackageId);
  assert.ok(reloadedDirectPilot);
  assert.deepEqual(reloadedDirectPilot.candidateProfile, selectedDirectOffer.candidateProfile);
  assert.equal(reloadedDirectPilot.sourceCandidateProfileId, selectedDirectOffer.candidateProfileId);

  const saveId = uniqueSaveId("staffing_market_contract");
  const startedAtUtc = await createCompanySave(backend, saveId, {
    startedAtUtc: "2026-03-16T12:00:00.000Z",
    startingCashAmount: 10_000_000,
  });
  await acquireAircraft(backend, saveId, startedAtUtc, {
    aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    registration: "N208CT",
  });

  const refreshResult = await refreshStaffingMarket(backend, saveId, startedAtUtc, "bootstrap");
  assert.equal(refreshResult.success, true);

  const staffingMarket = await backend.loadActiveStaffingMarket(saveId);
  assert.ok(staffingMarket);
  const candidatePairs = findCandidatePairs(staffingMarket);
  const selectedPair = candidatePairs.find((pair) => pair.contractOffer && pair.directOffer);
  assert.ok(selectedPair?.contractOffer);
  const selectedOffer = selectedPair.contractOffer;
  const companyBeforeContractHire = await backend.loadCompanyContext(saveId);
  assert.ok(companyBeforeContractHire);

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
  assert.equal(hireResult.emittedLedgerEntryIds.length, 1);

  const companyAfterContractHire = await backend.loadCompanyContext(saveId);
  assert.ok(companyAfterContractHire);
  assert.equal(companyAfterContractHire.currentCashAmount, companyBeforeContractHire.currentCashAmount - selectedOffer.fixedCostAmount);

  const staffingState = await backend.loadStaffingState(saveId);
  assert.ok(staffingState);
  const hiredPackage = staffingState.staffingPackages.find((entry) => entry.sourceOfferId === selectedOffer.staffingOfferId);
  assert.ok(hiredPackage);
  assert.equal(hiredPackage.employmentModel, "contract_hire");
  assert.equal(hiredPackage.endsAtUtc, selectedOffer.endsAtUtc);
  assert.equal(hiredPackage.fixedCostAmount, selectedOffer.fixedCostAmount);
  assert.equal(hiredPackage.variableCostRate, selectedOffer.variableCostRate);
  assert.equal(hiredPackage.recurringObligationId, undefined);
  assert.equal(staffingState.totalMonthlyFixedCostAmount, 0);
  const hiredPilot = staffingState.namedPilots.find((pilot) => pilot.staffingPackageId === hiredPackage.staffingPackageId);
  assert.ok(hiredPilot);
  assert.equal(hiredPilot.employmentModel, "contract_hire");
  assert.equal(hiredPilot.endsAtUtc, selectedOffer.endsAtUtc);
  assert.deepEqual(hiredPilot.candidateProfile, selectedOffer.candidateProfile);
  assert.equal(hiredPilot.sourceCandidateProfileId, selectedOffer.candidateProfileId);

  const updatedMarket = await backend.loadActiveStaffingMarket(saveId);
  assert.ok(updatedMarket);
  assert.equal(updatedMarket.offers.some((offer) => offer.staffingOfferId === selectedOffer.staffingOfferId), false);

  const blockedCertificationResult = await backend.dispatch({
    commandId: `cmd_${saveId}_contract_certification_block`,
    saveId,
    commandName: "StartNamedPilotTraining",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      namedPilotId: hiredPilot.namedPilotId,
      targetCertificationCode: "MEPL",
    },
  });
  assert.equal(blockedCertificationResult.success, false);
  assert.match(blockedCertificationResult.hardBlockers?.[0] ?? "", /contract hire/i);

  const fleetState = await backend.loadFleetState(saveId);
  const hiredAircraft = fleetState?.aircraft.find((entry) => entry.registration === "N208CT");
  assert.ok(hiredAircraft);
  const departureUtc = "2026-03-16T15:00:00.000Z";
  const flightMinutes = estimateFlightMinutes(airportReference, "KDEN", "KCOS", 180);
  const arrivalUtc = addMinutes(departureUtc, flightMinutes);
  await saveAndCommitSchedule(backend, saveId, startedAtUtc, hiredAircraft.aircraftId, [
    {
      legType: "reposition",
      originAirportId: "KDEN",
      destinationAirportId: "KCOS",
      plannedDepartureUtc: departureUtc,
      plannedArrivalUtc: arrivalUtc,
      assignedQualificationGroup: selectedOffer.qualificationGroup,
    },
  ]);

  const advanceForUsageResult = await backend.dispatch({
    commandId: `cmd_${saveId}_contract_usage_advance`,
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: addMinutes(arrivalUtc, 60),
      stopConditions: ["target_time"],
    },
  });
  assert.equal(
    advanceForUsageResult.success,
    true,
    advanceForUsageResult.hardBlockers?.[0] ?? "Expected contract pilot usage billing to settle.",
  );

  const contractLedgerEntries = await backend.withExistingSaveDatabase(saveId, async (context) => context.saveDatabase.all(
    `SELECT
       entry_type AS entryType,
       amount AS amount
     FROM ledger_entry
     WHERE source_object_type = 'staffing_package'
       AND source_object_id = $source_object_id
     ORDER BY entry_time_utc ASC, ledger_entry_id ASC`,
    { $source_object_id: hiredPackage.staffingPackageId },
  ));
  assert.equal(
    contractLedgerEntries.some((entry) => entry.entryType === "staffing_activation" && entry.amount === selectedOffer.fixedCostAmount * -1),
    true,
  );
  const usageEntry = contractLedgerEntries.find((entry) => entry.entryType === "contract_staffing_usage");
  assert.ok(usageEntry);
  assert.equal(usageEntry.amount, Math.round((flightMinutes / 60) * (selectedOffer.variableCostRate ?? 0)) * -1);

  const recurrentReadyAdvanceResult = await backend.dispatch({
    commandId: `cmd_${saveId}_contract_recurrent_ready`,
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: addMinutes(arrivalUtc, 60),
    actorType: "player",
    payload: {
      targetTimeUtc: addMinutes(arrivalUtc, 11 * 60),
      stopConditions: ["target_time"],
    },
  });
  assert.equal(
    recurrentReadyAdvanceResult.success,
    true,
    recurrentReadyAdvanceResult.hardBlockers?.[0] ?? "Expected contract pilot rest to clear.",
  );

  const recurrentTrainingResult = await backend.dispatch({
    commandId: `cmd_${saveId}_contract_recurrent_training`,
    saveId,
    commandName: "StartNamedPilotTraining",
    issuedAtUtc: addMinutes(arrivalUtc, 11 * 60),
    actorType: "player",
    payload: {
      namedPilotId: hiredPilot.namedPilotId,
    },
  });
  assert.equal(
    recurrentTrainingResult.success,
    true,
    recurrentTrainingResult.hardBlockers?.[0] ?? "Expected recurrent training for a contract hire to succeed.",
  );
  assert.equal(recurrentTrainingResult.metadata?.trainingProgramKind, "recurrent");

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
  assert.deepEqual(reloadedPilot.candidateProfile, selectedOffer.candidateProfile);

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

  const conversionSaveId = uniqueSaveId("staffing_conversion");
  const conversionStartedAtUtc = await createCompanySave(backend, conversionSaveId, {
    startedAtUtc: "2026-03-16T12:00:00.000Z",
    startingCashAmount: 10_000_000,
  });
  await acquireAircraft(backend, conversionSaveId, conversionStartedAtUtc, {
    aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    registration: "N208CV",
  });
  const conversionRefreshResult = await refreshStaffingMarket(backend, conversionSaveId, conversionStartedAtUtc, "bootstrap");
  assert.equal(conversionRefreshResult.success, true);
  const conversionMarket = await backend.loadActiveStaffingMarket(conversionSaveId);
  assert.ok(conversionMarket);
  const conversionPair = findCandidatePairs(conversionMarket).find((pair) => pair.directOffer && pair.contractOffer);
  assert.ok(conversionPair?.directOffer);
  assert.ok(conversionPair?.contractOffer);
  const conversionDirectOffer = conversionPair.directOffer;
  const conversionContractOffer = conversionPair.contractOffer;

  const contractHireForConversionResult = await backend.dispatch({
    commandId: `cmd_${conversionSaveId}_hire_contract_for_conversion`,
    saveId: conversionSaveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: conversionStartedAtUtc,
    actorType: "player",
    payload: {
      laborCategory: conversionContractOffer.laborCategory,
      employmentModel: conversionContractOffer.employmentModel,
      qualificationGroup: conversionContractOffer.qualificationGroup,
      coverageUnits: conversionContractOffer.coverageUnits,
      fixedCostAmount: conversionContractOffer.fixedCostAmount,
      variableCostRate: conversionContractOffer.variableCostRate,
      startsAtUtc: conversionContractOffer.startsAtUtc,
      endsAtUtc: conversionContractOffer.endsAtUtc,
      sourceOfferId: conversionContractOffer.staffingOfferId,
    },
  });
  assert.equal(contractHireForConversionResult.success, true);

  const contractStaffingBeforeConversion = await backend.loadStaffingState(conversionSaveId);
  assert.ok(contractStaffingBeforeConversion);
  const contractPackageBeforeConversion = contractStaffingBeforeConversion.staffingPackages.find((entry) => entry.sourceOfferId === conversionContractOffer.staffingOfferId);
  assert.ok(contractPackageBeforeConversion);
  const contractPilotBeforeConversion = contractStaffingBeforeConversion.namedPilots.find((pilot) => pilot.staffingPackageId === contractPackageBeforeConversion.staffingPackageId);
  assert.ok(contractPilotBeforeConversion);
  assert.equal(contractPilotBeforeConversion.employmentModel, "contract_hire");
  assert.deepEqual(contractPilotBeforeConversion.candidateProfile, conversionContractOffer.candidateProfile);
  assert.equal(contractPilotBeforeConversion.availabilityState, "ready");

  const conversionResult = await backend.dispatch({
    commandId: `cmd_${conversionSaveId}_convert_contract_pilot`,
    saveId: conversionSaveId,
    commandName: "ConvertNamedPilotToDirectHire",
    issuedAtUtc: conversionStartedAtUtc,
    actorType: "player",
    payload: {
      namedPilotId: contractPilotBeforeConversion.namedPilotId,
    },
  });
  assert.equal(
    conversionResult.success,
    true,
    conversionResult.hardBlockers?.[0] ?? "Expected contract pilot conversion to succeed.",
  );

  const staffingStateAfterConversion = await backend.loadStaffingState(conversionSaveId);
  assert.ok(staffingStateAfterConversion);
  const convertedPackage = staffingStateAfterConversion.staffingPackages.find((entry) => entry.staffingPackageId === contractPackageBeforeConversion.staffingPackageId);
  assert.ok(convertedPackage);
  assert.equal(convertedPackage.employmentModel, "direct_hire");
  assert.equal(convertedPackage.fixedCostAmount, conversionDirectOffer.fixedCostAmount);
  assert.equal(convertedPackage.variableCostRate, undefined);
  assert.equal(convertedPackage.endsAtUtc, undefined);
  assert.equal(typeof convertedPackage.recurringObligationId, "string");
  assert.equal(staffingStateAfterConversion.totalMonthlyFixedCostAmount, conversionDirectOffer.fixedCostAmount);
  const convertedPilot = staffingStateAfterConversion.namedPilots.find((pilot) => pilot.namedPilotId === contractPilotBeforeConversion.namedPilotId);
  assert.ok(convertedPilot);
  assert.equal(convertedPilot.staffingPackageId, contractPackageBeforeConversion.staffingPackageId);
  assert.equal(convertedPilot.employmentModel, "direct_hire");
  assert.deepEqual(convertedPilot.candidateProfile, contractPilotBeforeConversion.candidateProfile);
  assert.equal(convertedPilot.sourceCandidateProfileId, contractPilotBeforeConversion.sourceCandidateProfileId);

  const convertedFleetState = await backend.loadFleetState(conversionSaveId);
  const convertedAircraft = convertedFleetState?.aircraft.find((entry) => entry.registration === "N208CV");
  assert.ok(convertedAircraft);
  const convertedDepartureUtc = "2026-03-16T15:00:00.000Z";
  const convertedFlightMinutes = estimateFlightMinutes(airportReference, "KDEN", "KCOS", 180);
  const convertedArrivalUtc = addMinutes(convertedDepartureUtc, convertedFlightMinutes);
  await saveAndCommitSchedule(backend, conversionSaveId, conversionStartedAtUtc, convertedAircraft.aircraftId, [
    {
      legType: "reposition",
      originAirportId: "KDEN",
      destinationAirportId: "KCOS",
      plannedDepartureUtc: convertedDepartureUtc,
      plannedArrivalUtc: convertedArrivalUtc,
      assignedQualificationGroup: convertedPackage.qualificationGroup,
    },
  ]);

  const postConversionAdvanceResult = await backend.dispatch({
    commandId: `cmd_${conversionSaveId}_advance_post_conversion_leg`,
    saveId: conversionSaveId,
    commandName: "AdvanceTime",
    issuedAtUtc: conversionStartedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: addMinutes(convertedArrivalUtc, 60),
      stopConditions: ["target_time"],
    },
  });
  assert.equal(
    postConversionAdvanceResult.success,
    true,
    postConversionAdvanceResult.hardBlockers?.[0] ?? "Expected converted direct hire to complete scheduled work.",
  );

  const conversionLedgerEntries = await backend.withExistingSaveDatabase(conversionSaveId, async (context) => context.saveDatabase.all(
    `SELECT
       entry_type AS entryType,
       amount AS amount
     FROM ledger_entry
     WHERE source_object_type = 'staffing_package'
       AND source_object_id = $source_object_id
     ORDER BY entry_time_utc ASC, ledger_entry_id ASC`,
    { $source_object_id: convertedPackage.staffingPackageId },
  ));
  assert.equal(
    conversionLedgerEntries.some((entry) => entry.entryType === "contract_staffing_usage"),
    false,
  );

  await backend.closeSaveSession(conversionSaveId);
  const reloadedConversionState = await backend.loadStaffingState(conversionSaveId);
  assert.ok(reloadedConversionState);
  const reloadedConvertedPilot = reloadedConversionState.namedPilots.find((pilot) => pilot.namedPilotId === contractPilotBeforeConversion.namedPilotId);
  assert.ok(reloadedConvertedPilot);
  assert.equal(reloadedConvertedPilot.employmentModel, "direct_hire");
  assert.deepEqual(reloadedConvertedPilot.candidateProfile, contractPilotBeforeConversion.candidateProfile);

  const blockedConversionSaveId = uniqueSaveId("staffing_conversion_blocked");
  const blockedConversionStartedAtUtc = await createCompanySave(backend, blockedConversionSaveId, {
    startedAtUtc: "2026-03-16T12:00:00.000Z",
    startingCashAmount: 10_000_000,
  });
  await acquireAircraft(backend, blockedConversionSaveId, blockedConversionStartedAtUtc, {
    aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    registration: "N208CB",
  });
  const blockedConversionRefreshResult = await refreshStaffingMarket(backend, blockedConversionSaveId, blockedConversionStartedAtUtc, "bootstrap");
  assert.equal(blockedConversionRefreshResult.success, true);
  const blockedConversionMarket = await backend.loadActiveStaffingMarket(blockedConversionSaveId);
  assert.ok(blockedConversionMarket);
  const blockedConversionPair = findCandidatePairs(blockedConversionMarket).find((pair) => pair.contractOffer && pair.directOffer);
  assert.ok(blockedConversionPair?.contractOffer);
  const blockedContractOffer = blockedConversionPair.contractOffer;

  const blockedContractHireResult = await backend.dispatch({
    commandId: `cmd_${blockedConversionSaveId}_hire_contract_for_blocked_conversion`,
    saveId: blockedConversionSaveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: blockedConversionStartedAtUtc,
    actorType: "player",
    payload: {
      laborCategory: blockedContractOffer.laborCategory,
      employmentModel: blockedContractOffer.employmentModel,
      qualificationGroup: blockedContractOffer.qualificationGroup,
      coverageUnits: blockedContractOffer.coverageUnits,
      fixedCostAmount: blockedContractOffer.fixedCostAmount,
      variableCostRate: blockedContractOffer.variableCostRate,
      startsAtUtc: blockedContractOffer.startsAtUtc,
      endsAtUtc: blockedContractOffer.endsAtUtc,
      sourceOfferId: blockedContractOffer.staffingOfferId,
    },
  });
  assert.equal(blockedContractHireResult.success, true);

  const blockedConversionFleetState = await backend.loadFleetState(blockedConversionSaveId);
  const blockedConversionAircraft = blockedConversionFleetState?.aircraft.find((entry) => entry.registration === "N208CB");
  assert.ok(blockedConversionAircraft);
  await saveAndCommitSchedule(backend, blockedConversionSaveId, blockedConversionStartedAtUtc, blockedConversionAircraft.aircraftId, [
    {
      legType: "reposition",
      originAirportId: "KDEN",
      destinationAirportId: "KCOS",
      plannedDepartureUtc: "2026-03-16T16:00:00.000Z",
      plannedArrivalUtc: "2026-03-16T17:10:00.000Z",
      assignedQualificationGroup: blockedContractOffer.qualificationGroup,
    },
  ]);

  const blockedConversionReservedState = await backend.loadStaffingState(blockedConversionSaveId);
  assert.ok(blockedConversionReservedState);
  const reservedContractPilot = blockedConversionReservedState.namedPilots.find((pilot) => pilot.employmentModel === "contract_hire");
  assert.ok(reservedContractPilot);
  assert.equal(reservedContractPilot.availabilityState, "reserved");

  const reservedConversionResult = await backend.dispatch({
    commandId: `cmd_${blockedConversionSaveId}_convert_reserved_contract_pilot`,
    saveId: blockedConversionSaveId,
    commandName: "ConvertNamedPilotToDirectHire",
    issuedAtUtc: blockedConversionStartedAtUtc,
    actorType: "player",
    payload: {
      namedPilotId: reservedContractPilot.namedPilotId,
    },
  });
  assert.equal(reservedConversionResult.success, false);
  assert.match(reservedConversionResult.hardBlockers?.[0] ?? "", /reserved|committed contract work/i);

  const blockedConversionReservedPackage = blockedConversionReservedState.staffingPackages.find((entry) => entry.staffingPackageId === reservedContractPilot.staffingPackageId);
  assert.ok(blockedConversionReservedPackage);
  assert.equal(blockedConversionReservedPackage.employmentModel, "contract_hire");
  assert.equal(typeof blockedConversionReservedPackage.variableCostRate, "number");

  const blockedFlyingAdvanceResult = await backend.dispatch({
    commandId: `cmd_${blockedConversionSaveId}_advance_conversion_flying`,
    saveId: blockedConversionSaveId,
    commandName: "AdvanceTime",
    issuedAtUtc: blockedConversionStartedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: "2026-03-16T16:20:00.000Z",
      stopConditions: ["target_time"],
    },
  });
  assert.equal(blockedFlyingAdvanceResult.success, true);

  const blockedConversionFlyingState = await backend.loadStaffingState(blockedConversionSaveId);
  assert.ok(blockedConversionFlyingState);
  const flyingContractPilot = blockedConversionFlyingState.namedPilots.find((pilot) => pilot.namedPilotId === reservedContractPilot.namedPilotId);
  assert.ok(flyingContractPilot);
  assert.equal(flyingContractPilot.availabilityState, "flying");

  const flyingConversionResult = await backend.dispatch({
    commandId: `cmd_${blockedConversionSaveId}_convert_flying_contract_pilot`,
    saveId: blockedConversionSaveId,
    commandName: "ConvertNamedPilotToDirectHire",
    issuedAtUtc: "2026-03-16T16:20:00.000Z",
    actorType: "player",
    payload: {
      namedPilotId: flyingContractPilot.namedPilotId,
    },
  });
  assert.equal(flyingConversionResult.success, false);
  assert.match(flyingConversionResult.hardBlockers?.[0] ?? "", /flying|committed contract work/i);

  const blockedConversionPackageAfterFlying = blockedConversionFlyingState.staffingPackages.find((entry) => entry.staffingPackageId === flyingContractPilot.staffingPackageId);
  assert.ok(blockedConversionPackageAfterFlying);
  assert.equal(blockedConversionPackageAfterFlying.employmentModel, "contract_hire");
  assert.equal(typeof blockedConversionPackageAfterFlying.variableCostRate, "number");

  const blockedDismissSaveId = uniqueSaveId("staffing_dismiss_blocked");
  const blockedDismissStartedAtUtc = await createCompanySave(backend, blockedDismissSaveId, {
    startedAtUtc: "2026-03-16T12:00:00.000Z",
    startingCashAmount: 6_000_000,
  });
  await acquireAircraft(backend, blockedDismissSaveId, blockedDismissStartedAtUtc, {
    aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    registration: "N208DB",
  });
  await activateStaffingPackage(backend, blockedDismissSaveId, blockedDismissStartedAtUtc, {
    laborCategory: "pilot",
    employmentModel: "direct_hire",
    qualificationGroup: "single_turboprop_utility",
    coverageUnits: 1,
    fixedCostAmount: 4_200,
  });
  const blockedDismissFleet = await backend.loadFleetState(blockedDismissSaveId);
  const blockedDismissAircraft = blockedDismissFleet?.aircraft.find((entry) => entry.registration === "N208DB");
  assert.ok(blockedDismissAircraft);
  await saveAndCommitSchedule(backend, blockedDismissSaveId, blockedDismissStartedAtUtc, blockedDismissAircraft.aircraftId, [
    {
      legType: "reposition",
      originAirportId: "KDEN",
      destinationAirportId: "KCOS",
      plannedDepartureUtc: "2026-03-16T16:00:00.000Z",
      plannedArrivalUtc: "2026-03-16T17:10:00.000Z",
    },
  ]);

  const blockedDismissStaffingReserved = await backend.loadStaffingState(blockedDismissSaveId);
  assert.ok(blockedDismissStaffingReserved?.namedPilots[0]);
  const blockedDismissPilot = blockedDismissStaffingReserved.namedPilots[0];
  assert.equal(blockedDismissPilot.availabilityState, "reserved");

  const reservedDismissResult = await backend.dispatch({
    commandId: `cmd_${blockedDismissSaveId}_dismiss_reserved`,
    saveId: blockedDismissSaveId,
    commandName: "DismissNamedPilot",
    issuedAtUtc: blockedDismissStartedAtUtc,
    actorType: "player",
    payload: {
      namedPilotId: blockedDismissPilot.namedPilotId,
    },
  });
  assert.equal(reservedDismissResult.success, false);
  assert.match(reservedDismissResult.hardBlockers?.[0] ?? "", /reserved/i);

  const flyingAdvanceResult = await backend.dispatch({
    commandId: `cmd_${blockedDismissSaveId}_advance_flying`,
    saveId: blockedDismissSaveId,
    commandName: "AdvanceTime",
    issuedAtUtc: blockedDismissStartedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: "2026-03-16T16:20:00.000Z",
      stopConditions: ["target_time"],
    },
  });
  assert.equal(flyingAdvanceResult.success, true);
  const blockedDismissStaffingFlying = await backend.loadStaffingState(blockedDismissSaveId);
  assert.ok(blockedDismissStaffingFlying?.namedPilots[0]);
  assert.equal(blockedDismissStaffingFlying.namedPilots[0].availabilityState, "flying");

  const flyingDismissResult = await backend.dispatch({
    commandId: `cmd_${blockedDismissSaveId}_dismiss_flying`,
    saveId: blockedDismissSaveId,
    commandName: "DismissNamedPilot",
    issuedAtUtc: "2026-03-16T16:20:00.000Z",
    actorType: "player",
    payload: {
      namedPilotId: blockedDismissPilot.namedPilotId,
    },
  });
  assert.equal(flyingDismissResult.success, false);
  assert.match(flyingDismissResult.hardBlockers?.[0] ?? "", /flying/i);

  const readyAfterFlightAdvanceResult = await backend.dispatch({
    commandId: `cmd_${blockedDismissSaveId}_advance_ready`,
    saveId: blockedDismissSaveId,
    commandName: "AdvanceTime",
    issuedAtUtc: "2026-03-16T16:20:00.000Z",
    actorType: "player",
    payload: {
      targetTimeUtc: "2026-03-17T04:00:00.000Z",
      stopConditions: ["target_time"],
    },
  });
  assert.equal(readyAfterFlightAdvanceResult.success, true);
  const blockedDismissStaffingReady = await backend.loadStaffingState(blockedDismissSaveId);
  assert.ok(blockedDismissStaffingReady?.namedPilots[0]);
  assert.equal(blockedDismissStaffingReady.namedPilots[0].availabilityState, "ready");

  const trainingDismissSetupResult = await backend.dispatch({
    commandId: `cmd_${blockedDismissSaveId}_start_training`,
    saveId: blockedDismissSaveId,
    commandName: "StartNamedPilotTraining",
    issuedAtUtc: "2026-03-17T04:00:00.000Z",
    actorType: "player",
    payload: {
      namedPilotId: blockedDismissPilot.namedPilotId,
    },
  });
  assert.equal(trainingDismissSetupResult.success, true);

  const trainingDismissResult = await backend.dispatch({
    commandId: `cmd_${blockedDismissSaveId}_dismiss_training`,
    saveId: blockedDismissSaveId,
    commandName: "DismissNamedPilot",
    issuedAtUtc: "2026-03-17T04:00:00.000Z",
    actorType: "player",
    payload: {
      namedPilotId: blockedDismissPilot.namedPilotId,
    },
  });
  assert.equal(trainingDismissResult.success, false);
  assert.match(trainingDismissResult.hardBlockers?.[0] ?? "", /training/i);

  const dismissSaveId = uniqueSaveId("staffing_dismiss_ready");
  const dismissStartedAtUtc = await createCompanySave(backend, dismissSaveId, {
    startedAtUtc: "2026-03-16T12:00:00.000Z",
    startingCashAmount: 6_000_000,
  });
  await activateStaffingPackage(backend, dismissSaveId, dismissStartedAtUtc, {
    laborCategory: "pilot",
    employmentModel: "direct_hire",
    qualificationGroup: "single_turboprop_utility",
    coverageUnits: 1,
    fixedCostAmount: 4_200,
  });
  const dismissStaffingStateBefore = await backend.loadStaffingState(dismissSaveId);
  assert.ok(dismissStaffingStateBefore?.namedPilots[0]);
  const dismissPilot = dismissStaffingStateBefore.namedPilots[0];
  assert.equal(dismissPilot.availabilityState, "ready");
  assert.equal(dismissStaffingStateBefore.totalActiveCoverageUnits, 1);
  assert.equal(dismissStaffingStateBefore.totalMonthlyFixedCostAmount, 4_200);

  const dismissResult = await backend.dispatch({
    commandId: `cmd_${dismissSaveId}_dismiss_ready`,
    saveId: dismissSaveId,
    commandName: "DismissNamedPilot",
    issuedAtUtc: dismissStartedAtUtc,
    actorType: "player",
    payload: {
      namedPilotId: dismissPilot.namedPilotId,
    },
  });
  assert.equal(
    dismissResult.success,
    true,
    dismissResult.hardBlockers?.[0] ?? "Expected ready pilot dismissal to succeed.",
  );

  const dismissCompanyContext = await backend.loadCompanyContext(dismissSaveId);
  assert.ok(dismissCompanyContext);
  assert.equal(dismissCompanyContext.activeStaffingPackageCount, 0);
  const dismissStaffingStateAfter = await backend.loadStaffingState(dismissSaveId);
  assert.ok(dismissStaffingStateAfter);
  const dismissedPackage = dismissStaffingStateAfter.staffingPackages.find((entry) => entry.staffingPackageId === dismissPilot.staffingPackageId);
  assert.ok(dismissedPackage);
  assert.equal(dismissedPackage.status, "cancelled");
  assert.equal(dismissStaffingStateAfter.totalActiveCoverageUnits, 0);
  assert.equal(dismissStaffingStateAfter.totalMonthlyFixedCostAmount, 0);
  const dismissedPilot = dismissStaffingStateAfter.namedPilots.find((pilot) => pilot.namedPilotId === dismissPilot.namedPilotId);
  assert.ok(dismissedPilot);
  assert.equal(dismissedPilot.packageStatus, "cancelled");
  assert.equal(dismissedPilot.availabilityState, "cancelled");

  await backend.closeSaveSession(dismissSaveId);
  const reloadedDismissState = await backend.loadStaffingState(dismissSaveId);
  assert.ok(reloadedDismissState);
  const reloadedDismissedPilot = reloadedDismissState.namedPilots.find((pilot) => pilot.namedPilotId === dismissPilot.namedPilotId);
  assert.ok(reloadedDismissedPilot);
  assert.equal(reloadedDismissedPilot.packageStatus, "cancelled");
  assert.equal(reloadedDismissedPilot.availabilityState, "cancelled");
  assert.equal(reloadedDismissedPilot.employmentModel, "direct_hire");
} finally {
  await harness.cleanup();
}
