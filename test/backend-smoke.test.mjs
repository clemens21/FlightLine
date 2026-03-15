import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { FlightLineBackend } from "../dist/index.js";

function addHours(utcIsoString, hours) {
  return new Date(new Date(utcIsoString).getTime() + hours * 60 * 60 * 1000).toISOString();
}

const saveDirectoryPath = await mkdtemp(join(tmpdir(), "flightline-save-"));
const backend = await FlightLineBackend.create({
  saveDirectoryPath,
  airportDatabasePath: resolve(process.cwd(), "data", "airports", "flightline-airports.sqlite"),
  aircraftDatabasePath: resolve(process.cwd(), "data", "aircraft", "flightline-aircraft.sqlite"),
});

const saveId = `test_${Date.now()}`;
const missingSaveId = `${saveId}_missing`;
const startedAtUtc = new Date().toISOString();

try {
  const missingSaveResult = await backend.dispatch({
    commandId: `cmd_${missingSaveId}_company`,
    saveId: missingSaveId,
    commandName: "CreateCompany",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      displayName: "Ghost Carrier",
      starterAirportId: "KDEN",
      startingCashAmount: 500_000,
    },
  });

  assert.equal(missingSaveResult.success, false);
  assert.match(missingSaveResult.hardBlockers[0] ?? "", /does not exist/i);
  assert.equal((await readdir(saveDirectoryPath)).length, 0);

  const createSaveResult = await backend.dispatch({
    commandId: `cmd_${saveId}_save`,
    saveId,
    commandName: "CreateSaveGame",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      worldSeed: "seed-integration-1",
      difficultyProfile: "standard",
      startTimeUtc: startedAtUtc,
    },
  });

  assert.equal(createSaveResult.success, true);
  await stat(join(saveDirectoryPath, `${saveId}.sqlite`));

  const createCompanyResult = await backend.dispatch({
    commandId: `cmd_${saveId}_company`,
    saveId,
    commandName: "CreateCompany",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      displayName: "Mile High Regional",
      starterAirportId: "KDEN",
      startingCashAmount: 3_500_000,
    },
  });

  assert.equal(createCompanyResult.success, true);
  assert.equal(createCompanyResult.emittedLedgerEntryIds.length, 1);

  const acquireAircraftResult = await backend.dispatch({
    commandId: `cmd_${saveId}_aircraft`,
    saveId,
    commandName: "AcquireAircraft",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      deliveryAirportId: "KDEN",
      ownershipType: "owned",
      registration: "N208FL",
    },
  });

  assert.equal(acquireAircraftResult.success, true);
  assert.equal(acquireAircraftResult.emittedLedgerEntryIds.length, 1);

  const activateStaffingResult = await backend.dispatch({
    commandId: `cmd_${saveId}_staffing`,
    saveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      laborCategory: "pilot",
      employmentModel: "direct_hire",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 2,
      fixedCostAmount: 12_000,
    },
  });

  assert.equal(activateStaffingResult.success, true);
  assert.equal(activateStaffingResult.emittedLedgerEntryIds.length, 1);

  const activateCabinStaffingResult = await backend.dispatch({
    commandId: `cmd_${saveId}_staffing_cabin`,
    saveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      laborCategory: "flight_attendant",
      employmentModel: "direct_hire",
      qualificationGroup: "cabin_general",
      coverageUnits: 1,
      fixedCostAmount: 6_000,
    },
  });

  assert.equal(activateCabinStaffingResult.success, true);
  assert.equal(activateCabinStaffingResult.emittedLedgerEntryIds.length, 1);

  const companyContext = await backend.loadCompanyContext(saveId);
  assert.ok(companyContext);
  assert.equal(companyContext.displayName, "Mile High Regional");
  assert.equal(companyContext.activeAircraftCount, 1);
  assert.equal(companyContext.activeStaffingPackageCount, 2);
  assert.equal(companyContext.activeContractCount, 0);

  const fleetState = await backend.loadFleetState(saveId);
  assert.ok(fleetState);
  assert.equal(fleetState.totalAircraftCount, 1);
  assert.equal(fleetState.aircraft[0]?.aircraftModelId, "cessna_208b_grand_caravan_ex_passenger");
  assert.equal(fleetState.aircraft[0]?.registration, "N208FL");

  const staffingState = await backend.loadStaffingState(saveId);
  assert.ok(staffingState);
  assert.equal(staffingState.staffingPackages.length, 2);
  const pilotCoverageSummary = staffingState.coverageSummaries.find((summary) => summary.laborCategory === "pilot");
  const cabinCoverageSummary = staffingState.coverageSummaries.find((summary) => summary.laborCategory === "flight_attendant");
  assert.equal(pilotCoverageSummary?.activeCoverageUnits, 2);
  assert.equal(cabinCoverageSummary?.activeCoverageUnits, 1);

  const refreshBoardResult = await backend.dispatch({
    commandId: `cmd_${saveId}_refresh`,
    saveId,
    commandName: "RefreshContractBoard",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      refreshReason: "bootstrap",
    },
  });

  assert.equal(refreshBoardResult.success, true);

  const board = await backend.loadActiveContractBoard(saveId);
  assert.ok(board);
  assert.ok(board.offers.length >= 10);

  const selectedOffer = board.offers.find((offer) => {
    const windowHours = (new Date(offer.latestCompletionUtc).getTime() - new Date(offer.earliestStartUtc).getTime()) / (60 * 60 * 1000);
    return offer.originAirportId === "KDEN" && windowHours >= 6;
  }) ?? board.offers[0];
  assert.ok(selectedOffer);
  assert.equal(selectedOffer.offerStatus, "available");

  const acceptOfferResult = await backend.dispatch({
    commandId: `cmd_${saveId}_accept`,
    saveId,
    commandName: "AcceptContractOffer",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      contractOfferId: selectedOffer.contractOfferId,
    },
  });

  assert.equal(acceptOfferResult.success, true);

  const boardAfterAccept = await backend.loadActiveContractBoard(saveId);
  assert.ok(boardAfterAccept);
  const acceptedOffer = boardAfterAccept.offers.find((offer) => offer.contractOfferId === selectedOffer.contractOfferId);
  assert.ok(acceptedOffer);
  assert.equal(acceptedOffer.offerStatus, "accepted");

  const departureUtc = selectedOffer.earliestStartUtc;
  const latestSafeArrival = new Date(new Date(selectedOffer.latestCompletionUtc).getTime() - 30 * 60 * 1000).toISOString();
  const nominalArrival = addHours(departureUtc, 4);
  const arrivalUtc = nominalArrival < latestSafeArrival ? nominalArrival : latestSafeArrival;

  const saveDraftResult = await backend.dispatch({
    commandId: `cmd_${saveId}_draft`,
    saveId,
    commandName: "SaveScheduleDraft",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      aircraftId: fleetState.aircraft[0].aircraftId,
      scheduleKind: "operational",
      legs: [
        {
          legType: "contract_flight",
          linkedCompanyContractId: String(acceptOfferResult.metadata?.companyContractId),
          originAirportId: selectedOffer.originAirportId,
          destinationAirportId: selectedOffer.destinationAirportId,
          plannedDepartureUtc: departureUtc,
          plannedArrivalUtc: arrivalUtc,
        },
      ],
    },
  });

  assert.equal(saveDraftResult.success, true);
  assert.equal(saveDraftResult.hardBlockers.length, 0);
  const draftScheduleId = String(saveDraftResult.metadata?.scheduleId);

  const draftSchedules = await backend.loadAircraftSchedules(saveId, fleetState.aircraft[0].aircraftId);
  assert.equal(draftSchedules.length, 1);
  assert.equal(draftSchedules[0]?.isDraft, true);
  assert.equal(draftSchedules[0]?.scheduleId, draftScheduleId);
  assert.equal(draftSchedules[0]?.legs.length, 1);

  const commitScheduleResult = await backend.dispatch({
    commandId: `cmd_${saveId}_commit`,
    saveId,
    commandName: "CommitAircraftSchedule",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      scheduleId: draftScheduleId,
    },
  });

  assert.equal(commitScheduleResult.success, true);

  const committedSchedules = await backend.loadAircraftSchedules(saveId, fleetState.aircraft[0].aircraftId);
  assert.equal(committedSchedules.length, 1);
  assert.equal(committedSchedules[0]?.isDraft, false);
  assert.equal(committedSchedules[0]?.scheduleState, "committed");
  assert.equal(committedSchedules[0]?.laborAllocations.length, 1);
  assert.equal(committedSchedules[0]?.legs[0]?.linkedCompanyContractId, String(acceptOfferResult.metadata?.companyContractId));

  const fleetStateAfterCommit = await backend.loadFleetState(saveId);
  assert.ok(fleetStateAfterCommit);
  assert.equal(fleetStateAfterCommit.aircraft[0]?.dispatchAvailable, false);
  assert.equal(fleetStateAfterCommit.aircraft[0]?.activeScheduleId, draftScheduleId);

  const companyContextAfterAccept = await backend.loadCompanyContext(saveId);
  assert.ok(companyContextAfterAccept);
  assert.equal(companyContextAfterAccept.activeContractCount, 1);

  const advanceResult = await backend.dispatch({
    commandId: `cmd_${saveId}_advance`,
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: addHours(arrivalUtc, 6),
      stopConditions: ["leg_completed"],
    },
  });

  assert.equal(advanceResult.success, true);
  assert.equal(advanceResult.hardBlockers.length, 0);
  assert.equal(advanceResult.emittedLedgerEntryIds.length, 2);
  assert.equal(advanceResult.metadata?.stoppedBecause, "leg_completed");
  assert.equal(advanceResult.metadata?.advancedToUtc, arrivalUtc);
  assert.equal(advanceResult.metadata?.processedEventCount, 2);

  const schedulesAfterAdvance = await backend.loadAircraftSchedules(saveId, fleetState.aircraft[0].aircraftId);
  assert.equal(schedulesAfterAdvance.length, 1);
  assert.equal(schedulesAfterAdvance[0]?.scheduleState, "completed");
  assert.equal(schedulesAfterAdvance[0]?.legs[0]?.legState, "completed");
  assert.equal(schedulesAfterAdvance[0]?.legs[0]?.actualDepartureUtc, departureUtc);
  assert.equal(schedulesAfterAdvance[0]?.legs[0]?.actualArrivalUtc, arrivalUtc);
  assert.equal(schedulesAfterAdvance[0]?.laborAllocations[0]?.status, "consumed");

  const fleetStateAfterAdvance = await backend.loadFleetState(saveId);
  assert.ok(fleetStateAfterAdvance);
  assert.equal(fleetStateAfterAdvance.aircraft[0]?.dispatchAvailable, true);
  assert.equal(fleetStateAfterAdvance.aircraft[0]?.activeScheduleId, undefined);
  assert.equal(fleetStateAfterAdvance.aircraft[0]?.currentAirportId, selectedOffer.destinationAirportId);

  const companyContextAfterAdvance = await backend.loadCompanyContext(saveId);
  assert.ok(companyContextAfterAdvance);
  assert.equal(companyContextAfterAdvance.activeContractCount, 0);
  assert.equal(companyContextAfterAdvance.currentTimeUtc, arrivalUtc);
  assert.notEqual(companyContextAfterAdvance.currentCashAmount, companyContextAfterAccept.currentCashAmount);

  const duplicateAcceptResult = await backend.dispatch({
    commandId: `cmd_${saveId}_accept_duplicate`,
    saveId,
    commandName: "AcceptContractOffer",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      contractOfferId: selectedOffer.contractOfferId,
    },
  });

  assert.equal(duplicateAcceptResult.success, false);
  assert.match(duplicateAcceptResult.hardBlockers[0] ?? "", /already been accepted|no longer available/i);

  const duplicateCompanyResult = await backend.dispatch({
    commandId: `cmd_${saveId}_company_duplicate`,
    saveId,
    commandName: "CreateCompany",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      displayName: "Second Carrier",
      starterAirportId: "KDEN",
      startingCashAmount: 1_000_000,
    },
  });

  assert.equal(duplicateCompanyResult.success, false);
  assert.match(duplicateCompanyResult.hardBlockers[0] ?? "", /already has an active company/i);
} finally {
  await backend.close();
  await rm(saveDirectoryPath, { recursive: true, force: true });
}



