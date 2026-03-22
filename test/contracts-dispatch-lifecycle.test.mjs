import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  createTestHarness,
  dispatchOrThrow,
  effectiveCargoCapacityLb,
  pickFlyableOffer,
  refreshContractBoard,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import { loadContractsViewPayload } from "../dist/ui/contracts-view.js";
import { bindRoutePlanToAircraft } from "../dist/ui/route-plan-dispatch.js";
import { addCandidateOfferToRoutePlan, loadRoutePlanState } from "../dist/ui/route-plan-state.js";
import { buildDispatchTabPayload } from "../dist/ui/dispatch-tab-model.js";

function addHours(utcIsoString, hours) {
  return new Date(new Date(utcIsoString).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function addMinutes(utcIsoString, minutes) {
  return new Date(new Date(utcIsoString).getTime() + minutes * 60 * 1000).toISOString();
}

function haversineDistanceNm(origin, destination) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusNm = 3440.065;
  const deltaLatitude = toRadians(destination.latitudeDeg - origin.latitudeDeg);
  const deltaLongitude = toRadians(destination.longitudeDeg - origin.longitudeDeg);
  const latitudeOne = toRadians(origin.latitudeDeg);
  const latitudeTwo = toRadians(destination.latitudeDeg);
  const a =
    Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

function estimateFlightMinutes(airportReference, originAirportId, destinationAirportId, cruiseSpeedKtas) {
  const origin = airportReference.findAirport(originAirportId);
  const destination = airportReference.findAirport(destinationAirportId);
  assert.ok(origin, `Expected airport ${originAirportId} to exist.`);
  assert.ok(destination, `Expected airport ${destinationAirportId} to exist.`);
  return Math.ceil((haversineDistanceNm(origin, destination) / Math.max(cruiseSpeedKtas, 100)) * 60 + 30);
}

function midwayUtc(startUtc, endUtc) {
  const startMs = new Date(startUtc).getTime();
  const endMs = new Date(endUtc).getTime();
  return new Date(startMs + Math.floor((endMs - startMs) / 2)).toISOString();
}

async function createOperationalSave(backend, saveId, { aircraftCount = 1, pilotCoverageUnits = 1 } = {}) {
  const startedAtUtc = await createCompanySave(backend, saveId, {
    startedAtUtc: "2026-03-16T13:00:00.000Z",
    startingCashAmount: 10_000_000,
  });

  for (let index = 0; index < aircraftCount; index += 1) {
    await acquireAircraft(backend, saveId, startedAtUtc, {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      registration: `N20${String(index + 1).padStart(2, "0")}${saveId.slice(-2).toUpperCase()}`,
    });
  }

  await activateStaffingPackage(backend, saveId, startedAtUtc, {
    laborCategory: "pilot",
    employmentModel: "direct_hire",
    qualificationGroup: "single_turboprop_utility",
    coverageUnits: pilotCoverageUnits,
    fixedCostAmount: 12_000,
  });

  await refreshContractBoard(backend, saveId, startedAtUtc, "bootstrap");

  const fleetState = await backend.loadFleetState(saveId);
  const board = await backend.loadActiveContractBoard(saveId);
  assert.ok(fleetState?.aircraft[0]);
  assert.ok(board);
  const selectedOffer = pickFlyableOffer(board, fleetState.aircraft[0], backend.getAirportReference());
  assert.ok(selectedOffer, `Expected a flyable contract offer for ${saveId}.`);

  return {
    startedAtUtc,
    fleetState,
    selectedOffer,
  };
}

async function createBindableAcceptedRoutePlanSave(
  backend,
  savePrefix,
  options = {},
) {
  const maxAttempts = 12;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const saveId = uniqueSaveId(`${savePrefix}_${attempt}`);
    const { startedAtUtc, fleetState, selectedOffer } = await createOperationalSave(backend, saveId, options);
    await addOfferToRoutePlan(backend, saveId, selectedOffer.contractOfferId);
    const companyContractId = await acceptSelectedOffer(backend, saveId, startedAtUtc, selectedOffer);

    const routePlanBeforeProbe = await backend.withExistingSaveDatabase(
      saveId,
      (context) => loadRoutePlanState(context.saveDatabase, saveId),
    );
    assert.ok(routePlanBeforeProbe);
    assert.equal(routePlanBeforeProbe.items[0]?.sourceId, companyContractId);
    assert.equal(routePlanBeforeProbe.items[0]?.plannerItemStatus, "accepted_ready");

    const probeBindResult = await bindRoutePlanToAircraft(
      backend,
      saveId,
      fleetState.aircraft[0].aircraftId,
      `cmd_${saveId}_probe_bind`,
    );

    if (!probeBindResult.success) {
      continue;
    }

    const routePlanAfterProbe = await backend.withExistingSaveDatabase(
      saveId,
      (context) => loadRoutePlanState(context.saveDatabase, saveId),
    );
    assert.ok(routePlanAfterProbe);
    assert.equal(routePlanAfterProbe.items[0]?.plannerItemStatus, "accepted_ready");
    assert.equal(routePlanAfterProbe.items[0]?.linkedAircraftId, undefined);
    assert.equal(routePlanAfterProbe.items[0]?.linkedScheduleId, undefined);

    return {
      saveId,
      startedAtUtc,
      fleetState,
      selectedOffer,
      companyContractId,
    };
  }

  throw new Error(`Could not create a bindable accepted route-plan scenario for ${savePrefix} after ${maxAttempts} attempts.`);
}

async function acceptSelectedOffer(backend, saveId, startedAtUtc, selectedOffer, commandSuffix = "accept") {
  const acceptResult = await dispatchOrThrow(backend, {
    commandId: `cmd_${saveId}_${commandSuffix}`,
    saveId,
    commandName: "AcceptContractOffer",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      contractOfferId: selectedOffer.contractOfferId,
    },
  });
  const companyContractId = String(acceptResult.metadata?.companyContractId ?? "");
  assert.ok(companyContractId);
  return companyContractId;
}

async function addOfferToRoutePlan(backend, saveId, contractOfferId) {
  await backend.withExistingSaveDatabase(saveId, async (context) => {
    const mutation = addCandidateOfferToRoutePlan(context.saveDatabase, saveId, contractOfferId);
    assert.equal(mutation.success, true);
    await context.saveDatabase.persist();
  });
}

function appendAcceptedContractLegs(backend, currentAirportId, currentTimeUtc, aircraftModelId, contract) {
  const aircraftModel = backend.getAircraftReference().findModel(aircraftModelId);
  assert.ok(aircraftModel);

  const legs = [];
  let cursorAirportId = currentAirportId;
  let cursorTime = currentTimeUtc;
  if (cursorAirportId !== contract.originAirportId) {
    const repositionArrivalUtc = addMinutes(
      cursorTime,
      estimateFlightMinutes(
        backend.getAirportReference(),
        cursorAirportId,
        contract.originAirportId,
        aircraftModel.cruiseSpeedKtas,
      ),
    );
    legs.push({
      legType: "reposition",
      originAirportId: cursorAirportId,
      destinationAirportId: contract.originAirportId,
      plannedDepartureUtc: cursorTime,
      plannedArrivalUtc: repositionArrivalUtc,
    });
    cursorAirportId = contract.originAirportId;
    cursorTime = addMinutes(repositionArrivalUtc, 45);
  }

  const contractDepartureUtc = contract.earliestStartUtc && contract.earliestStartUtc > cursorTime
    ? contract.earliestStartUtc
    : cursorTime;
  const contractArrivalUtc = addMinutes(
    contractDepartureUtc,
    estimateFlightMinutes(
      backend.getAirportReference(),
      contract.originAirportId,
      contract.destinationAirportId,
      aircraftModel.cruiseSpeedKtas,
    ),
  );
  legs.push({
    legType: "contract_flight",
    linkedCompanyContractId: contract.companyContractId,
    originAirportId: contract.originAirportId,
    destinationAirportId: contract.destinationAirportId,
    plannedDepartureUtc: contractDepartureUtc,
    plannedArrivalUtc: contractArrivalUtc,
  });

  return {
    legs,
    nextAirportId: contract.destinationAirportId,
    nextTimeUtc: addMinutes(contractArrivalUtc, 45),
  };
}

function buildAcceptedContractLegs(backend, currentTimeUtc, aircraft, contract) {
  return appendAcceptedContractLegs(
    backend,
    aircraft.currentAirportId,
    currentTimeUtc,
    aircraft.aircraftModelId,
    contract,
  ).legs;
}

const harness = await createTestHarness("flightline-contract-dispatch-lifecycle");
const { backend } = harness;

try {
  {
    const saveId = uniqueSaveId("contracts_fit_truth");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T13:00:00.000Z",
      startingCashAmount: 10_000_000,
    });

    await acquireAircraft(backend, saveId, startedAtUtc, {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      registration: `N20FIT${saveId.slice(-2).toUpperCase()}`,
    });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      employmentModel: "direct_hire",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 12_000,
    });
    await refreshContractBoard(backend, saveId, startedAtUtc, "bootstrap");

    const fleetState = await backend.loadFleetState(saveId);
    const board = await backend.loadActiveContractBoard(saveId);
    const companyContext = await backend.loadCompanyContext(saveId);
    assert.ok(fleetState?.aircraft[0]);
    assert.ok(board);
    assert.ok(companyContext);

    const aircraft = fleetState.aircraft[0];
    const aircraftModel = backend.getAircraftReference().findModel(aircraft.aircraftModelId);
    assert.ok(aircraftModel);

    const cargoRepositionOffer = board.offers.find((offer) =>
      offer.volumeType === "cargo"
      && offer.originAirportId !== aircraft.currentAirportId
      && (offer.cargoWeightLb ?? 0) <= effectiveCargoCapacityLb(aircraft));
    assert.ok(cargoRepositionOffer, "Expected a cargo offer that requires repositioning.");

    const repositionArrivalUtc = addMinutes(
      companyContext.currentTimeUtc,
      estimateFlightMinutes(
        backend.getAirportReference(),
        aircraft.currentAirportId,
        cargoRepositionOffer.originAirportId,
        aircraftModel.cruiseSpeedKtas,
      ),
    );
    const contractDepartureUtc = cargoRepositionOffer.earliestStartUtc > addMinutes(repositionArrivalUtc, 45)
      ? cargoRepositionOffer.earliestStartUtc
      : addMinutes(repositionArrivalUtc, 45);
    const contractArrivalUtc = addMinutes(
      contractDepartureUtc,
      estimateFlightMinutes(
        backend.getAirportReference(),
        cargoRepositionOffer.originAirportId,
        cargoRepositionOffer.destinationAirportId,
        aircraftModel.cruiseSpeedKtas,
      ),
    );

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      context.saveDatabase.run(
        `UPDATE contract_offer
         SET latest_completion_utc = $latest_completion_utc
         WHERE contract_offer_id = $contract_offer_id`,
        {
          $latest_completion_utc: addMinutes(contractArrivalUtc, -15),
          $contract_offer_id: cargoRepositionOffer.contractOfferId,
        },
      );
      await context.saveDatabase.persist();
    });

    const contractsView = await loadContractsViewPayload(backend, backend.getAirportReference(), saveId, "scheduled");
    assert.ok(contractsView);
    const updatedOffer = contractsView.offers.find((offer) => offer.contractOfferId === cargoRepositionOffer.contractOfferId);
    assert.ok(updatedOffer);
    assert.equal(updatedOffer.fitBucket, "blocked_now");
  }

  {
    const saveId = uniqueSaveId("contract_cancel_ledger");
    const { startedAtUtc, selectedOffer } = await createOperationalSave(backend, saveId);
    const companyContractId = await acceptSelectedOffer(backend, saveId, startedAtUtc, selectedOffer);
    const companyContextBeforeCancel = await backend.loadCompanyContext(saveId);
    assert.ok(companyContextBeforeCancel);

    const cancelResult = await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_cancel`,
      saveId,
      commandName: "CancelCompanyContract",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        companyContractId,
      },
    });
    assert.equal(cancelResult.success, true);

    const companyContextAfterCancel = await backend.loadCompanyContext(saveId);
    assert.ok(companyContextAfterCancel);
    const companyContractsAfterCancel = await backend.loadCompanyContracts(saveId);
    assert.ok(companyContractsAfterCancel);
    const cancelledContract = companyContractsAfterCancel.contracts.find((contract) => contract.companyContractId === companyContractId);
    assert.ok(cancelledContract);
    const cashDelta = companyContextAfterCancel.currentCashAmount - companyContextBeforeCancel.currentCashAmount;
    assert.equal(cashDelta, cancelledContract.cancellationPenaltyAmount * -1);

    const cancellationLedgerEntry = await backend.withExistingSaveDatabase(saveId, async (context) => context.saveDatabase.getOne(
      `SELECT amount AS amount
       FROM ledger_entry
       WHERE source_object_type = 'company_contract'
         AND source_object_id = $source_object_id
         AND entry_type = 'contract_cancellation_penalty'
       LIMIT 1`,
      { $source_object_id: companyContractId },
    ));
    assert.equal(cancellationLedgerEntry?.amount, cancelledContract.cancellationPenaltyAmount * -1);
  }

  {
    const saveId = uniqueSaveId("accepted_contract_deadline");
    const { startedAtUtc, selectedOffer } = await createOperationalSave(backend, saveId);
    const companyContractId = await acceptSelectedOffer(backend, saveId, startedAtUtc, selectedOffer);

    const deadlineEventAfterAccept = await backend.withExistingSaveDatabase(saveId, async (context) => context.saveDatabase.getOne(
      `SELECT scheduled_time_utc AS scheduledTimeUtc, aircraft_id AS aircraftId
       FROM scheduled_event
       WHERE company_contract_id = $company_contract_id
         AND event_type = 'contract_deadline_check'
         AND status = 'pending'
       LIMIT 1`,
      { $company_contract_id: companyContractId },
    ));
    assert.equal(deadlineEventAfterAccept?.scheduledTimeUtc, selectedOffer.latestCompletionUtc);
    assert.equal(deadlineEventAfterAccept?.aircraftId, null);

    // Simulate an older save created before the deadline-event fix so advance-time must backfill it.
    await backend.withExistingSaveDatabase(saveId, async (context) => {
      context.saveDatabase.run(
        `DELETE FROM scheduled_event
         WHERE company_contract_id = $company_contract_id
           AND event_type = 'contract_deadline_check'
           AND status = 'pending'`,
        { $company_contract_id: companyContractId },
      );
      await context.saveDatabase.persist();
    });

    await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_advance_past_deadline`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: addHours(selectedOffer.latestCompletionUtc, 2),
        stopConditions: ["target_time"],
      },
    });

    const companyContractsAfterDeadline = await backend.loadCompanyContracts(saveId);
    assert.ok(companyContractsAfterDeadline);
    const failedContract = companyContractsAfterDeadline.contracts.find((contract) => contract.companyContractId === companyContractId);
    assert.ok(failedContract);
    assert.equal(failedContract.contractState, "failed");
    assert.equal(failedContract.assignedAircraftId, undefined);

    const failureLedgerEntry = await backend.withExistingSaveDatabase(saveId, async (context) => context.saveDatabase.getOne(
      `SELECT amount AS amount
       FROM ledger_entry
       WHERE source_object_type = 'company_contract'
         AND source_object_id = $source_object_id
         AND entry_type = 'contract_failure_penalty'
       LIMIT 1`,
      { $source_object_id: companyContractId },
    ));
    assert.ok((failureLedgerEntry?.amount ?? 0) < 0);

    const eventLogAfterDeadline = await backend.loadRecentEventLog(saveId, 12);
    assert.ok(eventLogAfterDeadline);
    assert.equal(
      eventLogAfterDeadline.entries.some((entry) => entry.eventType === "contract_failed" && entry.sourceObjectId === companyContractId),
      true,
    );
  }

  {
    const { saveId, startedAtUtc, fleetState, companyContractId } = await createBindableAcceptedRoutePlanSave(
      backend,
      "stale_blocked_draft_recovery",
      {
        aircraftCount: 2,
        pilotCoverageUnits: 2,
      },
    );

    const companyContracts = await backend.loadCompanyContracts(saveId);
    assert.ok(companyContracts);
    const contract = companyContracts.contracts.find((entry) => entry.companyContractId === companyContractId);
    assert.ok(contract);

    const blockedAircraft = fleetState.aircraft[0];
    const recoveryAircraft = fleetState.aircraft[1];
    const blockedDraftLegs = buildAcceptedContractLegs(backend, startedAtUtc, blockedAircraft, contract);
    const recoveryDraftLegs = buildAcceptedContractLegs(backend, startedAtUtc, recoveryAircraft, contract);

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      context.saveDatabase.run(
        `UPDATE company_aircraft
         SET status_input = 'grounded',
             dispatch_available = 0
         WHERE aircraft_id = $aircraft_id`,
        { $aircraft_id: blockedAircraft.aircraftId },
      );
      await context.saveDatabase.persist();
    });

    const blockedDraftResult = await backend.dispatch({
      commandId: `cmd_${saveId}_blocked_draft`,
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftId: blockedAircraft.aircraftId,
        scheduleKind: "operational",
        legs: blockedDraftLegs,
      },
    });
    assert.equal(blockedDraftResult.success, true);
    assert.equal(blockedDraftResult.hardBlockers.some((message) => /not dispatchable/i.test(message)), true);
    const blockedScheduleId = String(blockedDraftResult.metadata?.scheduleId ?? "");
    assert.ok(blockedScheduleId);

    const recoveryDraftResult = await backend.dispatch({
      commandId: `cmd_${saveId}_recovery_draft`,
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftId: recoveryAircraft.aircraftId,
        scheduleKind: "operational",
        legs: recoveryDraftLegs,
      },
    });
    assert.equal(recoveryDraftResult.success, true);
    assert.equal(recoveryDraftResult.hardBlockers.length, 0);
    const recoveryScheduleId = String(recoveryDraftResult.metadata?.scheduleId ?? "");
    assert.ok(recoveryScheduleId);

    const blockedAircraftSchedules = await backend.loadAircraftSchedules(saveId, blockedAircraft.aircraftId);
    const cancelledBlockedDraft = blockedAircraftSchedules.find((schedule) => schedule.scheduleId === blockedScheduleId);
    assert.ok(cancelledBlockedDraft);
    assert.equal(cancelledBlockedDraft.scheduleState, "cancelled");
    assert.equal(cancelledBlockedDraft.isDraft, false);
    assert.equal(cancelledBlockedDraft.legs.length, 0);

    const commitRecoveryResult = await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_recovery_commit`,
      saveId,
      commandName: "CommitAircraftSchedule",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        scheduleId: recoveryScheduleId,
      },
    });
    assert.equal(commitRecoveryResult.success, true);
  }

  {
    const saveId = uniqueSaveId("stale_blocked_draft_preserves_unrelated");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T13:00:00.000Z",
      startingCashAmount: 10_000_000,
    });

    await acquireAircraft(backend, saveId, startedAtUtc, {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      registration: `N20A${saveId.slice(-3).toUpperCase()}`,
    });
    await acquireAircraft(backend, saveId, startedAtUtc, {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      registration: `N20B${saveId.slice(-3).toUpperCase()}`,
    });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      employmentModel: "direct_hire",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 2,
      fixedCostAmount: 12_000,
    });
    await refreshContractBoard(backend, saveId, startedAtUtc, "bootstrap");

    const fleetState = await backend.loadFleetState(saveId);
    const board = await backend.loadActiveContractBoard(saveId);
    assert.ok(fleetState);
    assert.ok(board);
    assert.equal(fleetState.aircraft.length, 2);

    const sharedOffer = pickFlyableOffer(board, fleetState.aircraft[1], backend.getAirportReference());
    assert.ok(sharedOffer);
    const unrelatedOffer = board.offers.find((offer) =>
      offer.offerStatus === "available"
      && offer.contractOfferId !== sharedOffer.contractOfferId);
    assert.ok(unrelatedOffer);
    const acceptedOffers = [sharedOffer, unrelatedOffer];
    const acceptedContractIds = [];
    for (const [index, offer] of acceptedOffers.entries()) {
      acceptedContractIds.push(await acceptSelectedOffer(backend, saveId, startedAtUtc, offer, `accept_${index}`));
    }

    const companyContracts = await backend.loadCompanyContracts(saveId);
    assert.ok(companyContracts);
    const sharedContract = companyContracts.contracts.find((entry) => entry.companyContractId === acceptedContractIds[0]);
    const unrelatedContract = companyContracts.contracts.find((entry) => entry.companyContractId === acceptedContractIds[1]);
    assert.ok(sharedContract);
    assert.ok(unrelatedContract);

    const blockedAircraft = fleetState.aircraft[0];
    const recoveryAircraft = fleetState.aircraft[1];
    const firstBlockedSegment = appendAcceptedContractLegs(
      backend,
      blockedAircraft.currentAirportId,
      startedAtUtc,
      blockedAircraft.aircraftModelId,
      sharedContract,
    );
    const secondBlockedSegment = appendAcceptedContractLegs(
      backend,
      firstBlockedSegment.nextAirportId,
      firstBlockedSegment.nextTimeUtc,
      blockedAircraft.aircraftModelId,
      unrelatedContract,
    );
    const blockedDraftLegs = [
      ...firstBlockedSegment.legs,
      ...secondBlockedSegment.legs,
    ];
    const recoveryDraftLegs = buildAcceptedContractLegs(backend, startedAtUtc, recoveryAircraft, sharedContract);

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      context.saveDatabase.run(
        `UPDATE company_aircraft
         SET status_input = 'grounded',
             dispatch_available = 0
         WHERE aircraft_id = $aircraft_id`,
        { $aircraft_id: blockedAircraft.aircraftId },
      );
      await context.saveDatabase.persist();
    });

    const blockedDraftResult = await backend.dispatch({
      commandId: `cmd_${saveId}_mixed_blocked`,
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftId: blockedAircraft.aircraftId,
        scheduleKind: "operational",
        legs: blockedDraftLegs,
      },
    });
    assert.equal(blockedDraftResult.success, true);
    const blockedScheduleId = String(blockedDraftResult.metadata?.scheduleId ?? "");
    assert.ok(blockedScheduleId);

    const recoveryDraftResult = await backend.dispatch({
      commandId: `cmd_${saveId}_mixed_recovery`,
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftId: recoveryAircraft.aircraftId,
        scheduleKind: "operational",
        legs: recoveryDraftLegs,
      },
    });
    assert.equal(recoveryDraftResult.success, true);
    assert.equal(recoveryDraftResult.hardBlockers.length, 0);

    const blockedAircraftSchedules = await backend.loadAircraftSchedules(saveId, blockedAircraft.aircraftId);
    const preservedBlockedDraft = blockedAircraftSchedules.find((schedule) => schedule.scheduleId === blockedScheduleId);
    assert.ok(preservedBlockedDraft);
    assert.equal(preservedBlockedDraft.scheduleState, "blocked");
    assert.equal(preservedBlockedDraft.isDraft, true);
    assert.deepEqual(
      preservedBlockedDraft.legs
        .map((leg) => leg.linkedCompanyContractId)
        .filter((entry) => Boolean(entry))
        .sort(),
      [sharedContract.companyContractId, unrelatedContract.companyContractId].sort(),
    );
  }

  {
    const saveId = uniqueSaveId("route_plan_bind_preview_failure");
    const { startedAtUtc, fleetState, selectedOffer } = await createOperationalSave(backend, saveId);
    await addOfferToRoutePlan(backend, saveId, selectedOffer.contractOfferId);
    const companyContractId = await acceptSelectedOffer(backend, saveId, startedAtUtc, selectedOffer, "bind_preview_accept");

    const routePlanBeforeBind = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlanBeforeBind);
    assert.equal(routePlanBeforeBind.items[0]?.sourceId, companyContractId);
    assert.equal(routePlanBeforeBind.items[0]?.plannerItemStatus, "accepted_ready");

    const blockedAircraft = fleetState.aircraft[0];
    await backend.withExistingSaveDatabase(saveId, async (context) => {
      context.saveDatabase.run(
        `UPDATE maintenance_program_state
         SET maintenance_state_input = 'aog',
             aog_flag = 1
         WHERE aircraft_id = $aircraft_id`,
        { $aircraft_id: blockedAircraft.aircraftId },
      );
      await context.saveDatabase.persist();
    });

    const bindResult = await bindRoutePlanToAircraft(
      backend,
      saveId,
      blockedAircraft.aircraftId,
      `cmd_${saveId}_bind_preview_fail`,
    );
    assert.equal(bindResult.success, false);
    assert.match(bindResult.error ?? "", /AOG|cannot be scheduled/i);

    const blockedAircraftSchedules = await backend.loadAircraftSchedules(saveId, blockedAircraft.aircraftId);
    assert.equal(blockedAircraftSchedules.length, 0);

    const routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items[0]?.sourceId, companyContractId);
    assert.equal(routePlan.items[0]?.plannerItemStatus, "accepted_ready");
    assert.equal(routePlan.items[0]?.linkedAircraftId, undefined);
    assert.equal(routePlan.items[0]?.linkedScheduleId, undefined);
  }

  {
    const { saveId, startedAtUtc, fleetState, companyContractId } = await createBindableAcceptedRoutePlanSave(
      backend,
      "route_plan_truth",
    );

    let routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items[0]?.sourceId, companyContractId);
    assert.equal(routePlan.items[0]?.plannerItemStatus, "accepted_ready");

    const firstBindResult = await bindRoutePlanToAircraft(
      backend,
      saveId,
      fleetState.aircraft[0].aircraftId,
      `cmd_${saveId}_bind_first`,
    );
    assert.equal(firstBindResult.success, true);
    assert.ok(firstBindResult.scheduleId);

    routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items[0]?.plannerItemStatus, "accepted_ready");
    assert.equal(routePlan.items[0]?.linkedAircraftId, undefined);
    assert.equal(routePlan.items[0]?.linkedScheduleId, undefined);

    const replacementDraftResult = await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_replacement_draft`,
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftId: fleetState.aircraft[0].aircraftId,
        scheduleKind: "operational",
        legs: [
          {
            legType: "reposition",
            originAirportId: "KDEN",
            destinationAirportId: "KCOS",
            plannedDepartureUtc: "2026-03-16T15:00:00.000Z",
            plannedArrivalUtc: "2026-03-16T16:10:00.000Z",
          },
        ],
      },
    });
    assert.equal(replacementDraftResult.success, true);

    const schedulesAfterReplacement = await backend.loadAircraftSchedules(saveId, fleetState.aircraft[0].aircraftId);
    assert.equal(
      schedulesAfterReplacement.some((schedule) => schedule.scheduleId === firstBindResult.scheduleId && schedule.scheduleState === "cancelled"),
      true,
    );

    routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items[0]?.plannerItemStatus, "accepted_ready");
    assert.equal(routePlan.items[0]?.linkedAircraftId, undefined);
    assert.equal(routePlan.items[0]?.linkedScheduleId, undefined);

    const secondBindResult = await bindRoutePlanToAircraft(
      backend,
      saveId,
      fleetState.aircraft[0].aircraftId,
      `cmd_${saveId}_bind_second`,
    );
    assert.equal(secondBindResult.success, true);
    assert.ok(secondBindResult.scheduleId);

    const commitResult = await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_commit_bound_route_plan`,
      saveId,
      commandName: "CommitAircraftSchedule",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        scheduleId: secondBindResult.scheduleId,
      },
    });
    assert.equal(commitResult.success, true);

    const pendingDeadlineEventsAfterCommit = await backend.withExistingSaveDatabase(saveId, async (context) => context.saveDatabase.all(
      `SELECT scheduled_event_id AS scheduledEventId, aircraft_id AS aircraftId
       FROM scheduled_event
       WHERE company_contract_id = $company_contract_id
         AND event_type = 'contract_deadline_check'
         AND status = 'pending'`,
      { $company_contract_id: companyContractId },
    ));
    assert.equal(pendingDeadlineEventsAfterCommit.length, 1);
    assert.equal(pendingDeadlineEventsAfterCommit[0]?.aircraftId, fleetState.aircraft[0].aircraftId);

    routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items[0]?.plannerItemStatus, "scheduled");
    assert.equal(routePlan.items[0]?.linkedAircraftId, fleetState.aircraft[0].aircraftId);
    assert.equal(routePlan.items[0]?.linkedScheduleId, secondBindResult.scheduleId);

    const committedSchedules = await backend.loadAircraftSchedules(saveId, fleetState.aircraft[0].aircraftId);
    const committedRoutePlanSchedule = committedSchedules.find((schedule) => schedule.scheduleId === secondBindResult.scheduleId);
    assert.ok(committedRoutePlanSchedule?.legs.length);
    const finalArrivalUtc = committedRoutePlanSchedule.legs.at(-1)?.plannedArrivalUtc;
    assert.ok(finalArrivalUtc);

    await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_advance_contract_complete`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: addHours(finalArrivalUtc, 2),
        stopConditions: ["target_time"],
      },
    });

    const companyContractsAfterAdvance = await backend.loadCompanyContracts(saveId);
    assert.ok(companyContractsAfterAdvance);
    const completedContract = companyContractsAfterAdvance.contracts.find((contract) => contract.companyContractId === companyContractId);
    assert.ok(completedContract);
    assert.equal(completedContract.contractState, "completed");
    assert.equal(completedContract.assignedAircraftId, undefined);

    routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items[0]?.plannerItemStatus, "closed");
    assert.equal(routePlan.items[0]?.linkedAircraftId, undefined);
    assert.equal(routePlan.items[0]?.linkedScheduleId, undefined);

    const contractsViewAfterCompletion = await loadContractsViewPayload(backend, backend.getAirportReference(), saveId, "scheduled");
    assert.ok(contractsViewAfterCompletion);
    assert.equal(contractsViewAfterCompletion.routePlan, null);
    assert.equal(contractsViewAfterCompletion.plannerEndpointAirportId, undefined);

    const companyContextAfterCompletion = await backend.loadCompanyContext(saveId);
    assert.ok(companyContextAfterCompletion);
    const dispatchPayloadAfterCompletion = buildDispatchTabPayload({
      saveId,
      companyContext: companyContextAfterCompletion,
      companyContracts: companyContractsAfterAdvance,
      fleetState: await backend.loadFleetState(saveId),
      staffingState: await backend.loadStaffingState(saveId),
      schedules: committedSchedules,
      routePlan,
      airportReference: backend.getAirportReference(),
    });
    assert.equal(dispatchPayloadAfterCompletion.workInputs.routePlanItems.length, 0);
    assert.equal(dispatchPayloadAfterCompletion.workInputs.acceptedContracts.length, 0);
  }

  {
    const { saveId, startedAtUtc, fleetState } = await createBindableAcceptedRoutePlanSave(backend, "contract_draft_exclusive", {
      aircraftCount: 2,
      pilotCoverageUnits: 2,
    });

    const firstBindResult = await bindRoutePlanToAircraft(
      backend,
      saveId,
      fleetState.aircraft[0].aircraftId,
      `cmd_${saveId}_bind_first_aircraft`,
    );
    assert.equal(firstBindResult.success, true);
    assert.ok(firstBindResult.scheduleId);

    const aircraftOneSchedules = await backend.loadAircraftSchedules(saveId, fleetState.aircraft[0].aircraftId);
    const firstDraftSchedule = aircraftOneSchedules.find((schedule) => schedule.scheduleId === firstBindResult.scheduleId);
    assert.ok(firstDraftSchedule?.legs.length);

    const duplicateDraftResult = await backend.dispatch({
      commandId: `cmd_${saveId}_duplicate_draft`,
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftId: fleetState.aircraft[1].aircraftId,
        scheduleKind: "operational",
        legs: firstDraftSchedule.legs.map((leg) => ({
          legType: leg.legType,
          linkedCompanyContractId: leg.linkedCompanyContractId,
          originAirportId: leg.originAirportId,
          destinationAirportId: leg.destinationAirportId,
          plannedDepartureUtc: leg.plannedDepartureUtc,
          plannedArrivalUtc: leg.plannedArrivalUtc,
          assignedQualificationGroup: leg.assignedQualificationGroup,
        })),
      },
    });
    assert.equal(duplicateDraftResult.success, true);
    assert.equal(
      duplicateDraftResult.hardBlockers.some((message) => /already attached to another aircraft draft/i.test(message)),
      true,
    );
  }

  {
    const { saveId, startedAtUtc, fleetState, companyContractId } = await createBindableAcceptedRoutePlanSave(
      backend,
      "contract_late_complete",
    );

    const bindResult = await bindRoutePlanToAircraft(
      backend,
      saveId,
      fleetState.aircraft[0].aircraftId,
      `cmd_${saveId}_bind_late`,
    );
    assert.equal(bindResult.success, true);
    assert.ok(bindResult.scheduleId);

    await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_commit_late`,
      saveId,
      commandName: "CommitAircraftSchedule",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        scheduleId: bindResult.scheduleId,
      },
    });

    const committedSchedules = await backend.loadAircraftSchedules(saveId, fleetState.aircraft[0].aircraftId);
    const committedLateSchedule = committedSchedules.find((schedule) => schedule.scheduleId === bindResult.scheduleId);
    const contractLeg = committedLateSchedule?.legs.find((leg) => leg.linkedCompanyContractId === companyContractId);
    assert.ok(contractLeg?.plannedDepartureUtc);
    assert.ok(contractLeg?.plannedArrivalUtc);
    const forcedDeadlineUtc = midwayUtc(contractLeg.plannedDepartureUtc, contractLeg.plannedArrivalUtc);

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      context.saveDatabase.run(
        `UPDATE company_contract
         SET deadline_utc = $deadline_utc
         WHERE company_contract_id = $company_contract_id`,
        {
          $deadline_utc: forcedDeadlineUtc,
          $company_contract_id: companyContractId,
        },
      );
      context.saveDatabase.run(
        `UPDATE scheduled_event
         SET scheduled_time_utc = $scheduled_time_utc
         WHERE company_contract_id = $company_contract_id
           AND event_type = 'contract_deadline_check'
           AND status = 'pending'`,
        {
          $scheduled_time_utc: forcedDeadlineUtc,
          $company_contract_id: companyContractId,
        },
      );
      await context.saveDatabase.persist();
    });

    await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_advance_late_arrival`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: addHours(contractLeg.plannedArrivalUtc, 2),
        stopConditions: ["target_time"],
      },
    });

    const companyContractsAfterLateAdvance = await backend.loadCompanyContracts(saveId);
    assert.ok(companyContractsAfterLateAdvance);
    const lateCompletedContract = companyContractsAfterLateAdvance.contracts.find((contract) => contract.companyContractId === companyContractId);
    assert.ok(lateCompletedContract);
    assert.equal(lateCompletedContract.contractState, "late_completed");
    assert.equal(lateCompletedContract.assignedAircraftId, undefined);

    const contractLedgerEntries = await backend.withExistingSaveDatabase(saveId, async (context) => context.saveDatabase.all(
      `SELECT entry_type AS entryType, amount AS amount
       FROM ledger_entry
       WHERE source_object_type = 'company_contract'
         AND source_object_id = $source_object_id
       ORDER BY entry_time_utc ASC`,
      { $source_object_id: companyContractId },
    ));
    assert.equal(contractLedgerEntries.some((entry) => entry.entryType === "contract_revenue" && entry.amount > 0), true);
    assert.equal(contractLedgerEntries.some((entry) => entry.entryType === "contract_failure_penalty"), false);

    const eventLogAfterLateAdvance = await backend.loadRecentEventLog(saveId, 12);
    assert.ok(eventLogAfterLateAdvance);
    assert.equal(eventLogAfterLateAdvance.entries.some((entry) => entry.eventType === "contract_late_completed" && entry.sourceObjectId === companyContractId), true);
    assert.equal(eventLogAfterLateAdvance.entries.some((entry) => entry.eventType === "contract_failed" && entry.sourceObjectId === companyContractId), false);
  }

  {
    const saveId = uniqueSaveId("contract_deadline_missing_dispatch");
    const { startedAtUtc, selectedOffer } = await createOperationalSave(backend, saveId);
    const companyContractId = await acceptSelectedOffer(backend, saveId, startedAtUtc, selectedOffer);
    const companyContractsBeforeAdvance = await backend.loadCompanyContracts(saveId);
    assert.ok(companyContractsBeforeAdvance);
    const acceptedContract = companyContractsBeforeAdvance.contracts.find((contract) => contract.companyContractId === companyContractId);
    assert.ok(acceptedContract);
    assert.equal(acceptedContract.contractState, "accepted");

    await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_advance_deadline_failure`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: addHours(acceptedContract.deadlineUtc, 2),
        stopConditions: ["target_time"],
      },
    });

    const companyContractsAfterAdvance = await backend.loadCompanyContracts(saveId);
    assert.ok(companyContractsAfterAdvance);
    const failedContract = companyContractsAfterAdvance.contracts.find((contract) => contract.companyContractId === companyContractId);
    assert.ok(failedContract);
    assert.equal(failedContract.contractState, "failed");
    assert.equal(failedContract.assignedAircraftId, undefined);

    const eventLogAfterAdvance = await backend.loadRecentEventLog(saveId, 12);
    assert.ok(eventLogAfterAdvance);
    assert.equal(
      eventLogAfterAdvance.entries.some((entry) => entry.eventType === "contract_failed" && entry.sourceObjectId === companyContractId),
      true,
    );
  }
} finally {
  await harness.cleanup();
}
