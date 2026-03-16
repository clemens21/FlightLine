import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { FlightLineBackend } from "../dist/index.js";
import { AirportReferenceRepository } from "../dist/infrastructure/reference/airport-reference.js";
import { effectiveCargoCapacityLb, effectivePassengerCapacity } from "./helpers/flightline-testkit.mjs";

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
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

function estimateFlightMinutes(airportReference, originAirportId, destinationAirportId, cruiseSpeedKtas = 180) {
  const origin = airportReference.findAirport(originAirportId);
  const destination = airportReference.findAirport(destinationAirportId);

  if (!origin || !destination) {
    throw new Error(`Could not resolve route ${originAirportId} to ${destinationAirportId}.`);
  }

  return Math.ceil((haversineDistanceNm(origin, destination) / Math.max(cruiseSpeedKtas, 100)) * 60 + 30);
}

function pickPreferredOffer(board, aircraft, airportReference, currentTimeUtc, cruiseSpeedKtas = 180) {
  const currentTimeMs = new Date(currentTimeUtc).getTime();
  const candidateOffers = board.offers.filter((offer) => {
    const fitsPassengers = offer.passengerCount === undefined || offer.passengerCount <= effectivePassengerCapacity(aircraft);
    const fitsCargo = offer.cargoWeightLb === undefined || offer.cargoWeightLb <= effectiveCargoCapacityLb(aircraft);
    const contractFlightMinutes = estimateFlightMinutes(
      airportReference,
      offer.originAirportId,
      offer.destinationAirportId,
      cruiseSpeedKtas,
    );
    const repositionMinutes = aircraft.currentAirportId === offer.originAirportId
      ? 0
      : estimateFlightMinutes(airportReference, aircraft.currentAirportId, offer.originAirportId, cruiseSpeedKtas);
    const earliestStartMs = new Date(offer.earliestStartUtc).getTime();
    const earliestDepartureMs = Math.max(
      earliestStartMs,
      currentTimeMs + repositionMinutes * 60_000 + (repositionMinutes > 0 ? 45 * 60_000 : 0),
    );
    const arrivalMs = earliestDepartureMs + contractFlightMinutes * 60_000;
    const latestCompletionMs = new Date(offer.latestCompletionUtc).getTime();
    const origin = airportReference.findAirport(offer.originAirportId);
    const destination = airportReference.findAirport(offer.destinationAirportId);
    const contractDistanceNm = origin && destination ? haversineDistanceNm(origin, destination) : Number.POSITIVE_INFINITY;
    const repositionDistanceNm = aircraft.currentAirportId === offer.originAirportId
      ? 0
      : (() => {
        const repositionOrigin = airportReference.findAirport(aircraft.currentAirportId);
        return repositionOrigin && origin ? haversineDistanceNm(repositionOrigin, origin) : Number.POSITIVE_INFINITY;
      })();
    const fitBucket = typeof offer.explanationMetadata?.fit_bucket === "string" ? offer.explanationMetadata.fit_bucket : undefined;

    return fitsPassengers
      && fitsCargo
      && contractDistanceNm <= aircraft.rangeNm * 0.6
      && repositionDistanceNm <= aircraft.rangeNm * 0.6
      && Number.isFinite(contractFlightMinutes)
      && Number.isFinite(repositionMinutes)
      && arrivalMs <= latestCompletionMs
      && (fitBucket === "flyable_now" || fitBucket === "flyable_with_reposition");
  });

  return candidateOffers.find((offer) => offer.originAirportId === aircraft.currentAirportId)
    ?? candidateOffers[0];
}

const saveDirectoryPath = await mkdtemp(join(tmpdir(), "flightline-save-"));
const airportDatabasePath = resolve(process.cwd(), "data", "airports", "flightline-airports.sqlite");
const backend = await FlightLineBackend.create({
  saveDirectoryPath,
  airportDatabasePath,
  aircraftDatabasePath: resolve(process.cwd(), "data", "aircraft", "flightline-aircraft.sqlite"),
});
const airportReference = await AirportReferenceRepository.open(airportDatabasePath);

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

  let board = await backend.loadActiveContractBoard(saveId);
  assert.ok(board);
  assert.ok(board.offers.length >= 200);
  assert.ok(new Set(board.offers.map((offer) => offer.originAirportId)).size > 1);
  assert.ok(board.offers.some((offer) => board.offers.some((candidate) => candidate.originAirportId === offer.destinationAirportId)));

  const aircraftModel = backend.getAircraftReference().findModel(fleetState.aircraft[0].aircraftModelId);
  let selectedOffer = pickPreferredOffer(board, fleetState.aircraft[0], airportReference, startedAtUtc, aircraftModel?.cruiseSpeedKtas ?? 180);

  for (let attempt = 0; !selectedOffer && attempt < 2; attempt += 1) {
    const refreshRetryResult = await backend.dispatch({
      commandId: `cmd_${saveId}_refresh_retry_${attempt}`,
      saveId,
      commandName: "RefreshContractBoard",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        refreshReason: "bootstrap_retry",
      },
    });

    assert.equal(refreshRetryResult.success, true);
    board = await backend.loadActiveContractBoard(saveId);
    assert.ok(board);
    selectedOffer = pickPreferredOffer(board, fleetState.aircraft[0], airportReference, startedAtUtc, aircraftModel?.cruiseSpeedKtas ?? 180);
  }

  assert.ok(selectedOffer, "Expected at least one flyable contract offer.");
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
  assert.equal(boardAfterAccept.offerWindowId, board.offerWindowId);
  assert.equal(boardAfterAccept.offers.length, board.offers.length);

  const scheduleLegs = [];
  let scheduleCursorUtc = companyContext.currentTimeUtc;

  if (fleetState.aircraft[0].currentAirportId !== selectedOffer.originAirportId) {
    const repositionArrivalUtc = addMinutes(
      scheduleCursorUtc,
      estimateFlightMinutes(airportReference, fleetState.aircraft[0].currentAirportId, selectedOffer.originAirportId, 180),
    );
    scheduleLegs.push({
      legType: "reposition",
      originAirportId: fleetState.aircraft[0].currentAirportId,
      destinationAirportId: selectedOffer.originAirportId,
      plannedDepartureUtc: scheduleCursorUtc,
      plannedArrivalUtc: repositionArrivalUtc,
    });
    scheduleCursorUtc = addMinutes(repositionArrivalUtc, 45);
  }

  const departureUtc = scheduleCursorUtc > selectedOffer.earliestStartUtc ? scheduleCursorUtc : selectedOffer.earliestStartUtc;
  const contractFlightMinutes = estimateFlightMinutes(
    airportReference,
    selectedOffer.originAirportId,
    selectedOffer.destinationAirportId,
    180,
  );
  const latestSafeArrival = new Date(new Date(selectedOffer.latestCompletionUtc).getTime() - 30 * 60 * 1000).toISOString();
  const nominalArrival = addMinutes(departureUtc, contractFlightMinutes);
  const arrivalUtc = nominalArrival < latestSafeArrival ? nominalArrival : latestSafeArrival;

  scheduleLegs.push({
    legType: "contract_flight",
    linkedCompanyContractId: String(acceptOfferResult.metadata?.companyContractId),
    originAirportId: selectedOffer.originAirportId,
    destinationAirportId: selectedOffer.destinationAirportId,
    plannedDepartureUtc: departureUtc,
    plannedArrivalUtc: arrivalUtc,
  });

  const saveDraftResult = await backend.dispatch({
    commandId: `cmd_${saveId}_draft`,
    saveId,
    commandName: "SaveScheduleDraft",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      aircraftId: fleetState.aircraft[0].aircraftId,
      scheduleKind: "operational",
      legs: scheduleLegs,
    },
  });

  assert.equal(saveDraftResult.success, true);
  assert.ok(saveDraftResult.metadata?.scheduleId);
  const draftScheduleId = String(saveDraftResult.metadata?.scheduleId);

  const draftSchedules = await backend.loadAircraftSchedules(saveId, fleetState.aircraft[0].aircraftId);
  assert.equal(draftSchedules.length, 1);
  assert.equal(draftSchedules[0]?.isDraft, true);
  assert.equal(draftSchedules[0]?.scheduleId, draftScheduleId);
  assert.equal(draftSchedules[0]?.legs.length, scheduleLegs.length);

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
  assert.equal(committedSchedules[0]?.laborAllocations.length >= 1, true);
  assert.equal(committedSchedules[0]?.legs.at(-1)?.linkedCompanyContractId, String(acceptOfferResult.metadata?.companyContractId));

  const fleetStateAfterCommit = await backend.loadFleetState(saveId);
  assert.ok(fleetStateAfterCommit);
  assert.equal(fleetStateAfterCommit.aircraft[0]?.dispatchAvailable, false);
  assert.equal(fleetStateAfterCommit.aircraft[0]?.activeScheduleId, draftScheduleId);

  const companyContextAfterAccept = await backend.loadCompanyContext(saveId);
  assert.ok(companyContextAfterAccept);
  assert.equal(companyContextAfterAccept.activeContractCount, 1);

  const firstAdvanceResult = await backend.dispatch({
    commandId: `cmd_${saveId}_advance_1`,
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: addHours(arrivalUtc, 6),
      stopConditions: ["leg_completed"],
    },
  });

  assert.equal(firstAdvanceResult.success, true);
  assert.equal(firstAdvanceResult.hardBlockers.length, 0);

  let finalAdvanceResult = firstAdvanceResult;
  let emittedLedgerEntryCount = firstAdvanceResult.emittedLedgerEntryIds.length;

  if (scheduleLegs.length > 1) {
    const secondAdvanceResult = await backend.dispatch({
      commandId: `cmd_${saveId}_advance_2`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: addHours(arrivalUtc, 6),
        stopConditions: ["leg_completed"],
      },
    });

    assert.equal(secondAdvanceResult.success, true);
    assert.equal(secondAdvanceResult.hardBlockers.length, 0);
    finalAdvanceResult = secondAdvanceResult;
    emittedLedgerEntryCount += secondAdvanceResult.emittedLedgerEntryIds.length;
  }

  assert.equal(finalAdvanceResult.metadata?.stoppedBecause, "leg_completed");
  assert.equal(finalAdvanceResult.metadata?.advancedToUtc, arrivalUtc);
  assert.ok(emittedLedgerEntryCount >= 2);
  assert.ok((finalAdvanceResult.metadata?.processedEventCount ?? 0) >= 2);
  const schedulesAfterAdvance = await backend.loadAircraftSchedules(saveId, fleetState.aircraft[0].aircraftId);
  assert.equal(schedulesAfterAdvance.length, 1);
  assert.equal(schedulesAfterAdvance[0]?.scheduleState, "completed");
  assert.equal(schedulesAfterAdvance[0]?.legs.at(-1)?.legState, "completed");
  assert.equal(schedulesAfterAdvance[0]?.legs.at(-1)?.actualDepartureUtc, departureUtc);
  assert.equal(schedulesAfterAdvance[0]?.legs.at(-1)?.actualArrivalUtc, arrivalUtc);
  assert.equal(schedulesAfterAdvance[0]?.laborAllocations.at(-1)?.status, "consumed");

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
  await Promise.allSettled([
    backend.closeSaveSession(saveId),
    backend.close(),
    airportReference.close(),
  ]);
}







