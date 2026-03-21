/*
 * Regression coverage for backend smoke.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { FlightLineBackend } from "../dist/index.js";
import { resolveDispatchPilotAssignment } from "../dist/domain/dispatch/named-pilot-assignment.js";
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

function pickReachableRecoveryDestinationAirportId(originAirportId, aircraft, airportReference) {
  const origin = airportReference.findAirport(originAirportId);

  if (!origin) {
    return null;
  }

  const reachableDestinations = airportReference
    .listContractDestinations(origin, 200)
    .map((destination) => ({
      destination,
      distanceNm: haversineDistanceNm(origin, destination),
    }))
    .filter(({ destination, distanceNm }) =>
      destination.airportKey !== originAirportId
      && Number.isFinite(distanceNm)
      && distanceNm > 0
      && distanceNm <= aircraft.rangeNm * 0.6,
    )
    .sort((left, right) => left.distanceNm - right.distanceNm);

  return reachableDestinations[0]?.destination.airportKey ?? null;
}

function resolveDraftPilotRecommendation(staffingState, aircraft, schedule, currentTimeUtc, airportReference) {
  const qualificationGroup = schedule.legs.find((leg) => typeof leg.assignedQualificationGroup === "string")
    ?.assignedQualificationGroup
    ?? aircraft.pilotQualificationGroup;

  return resolveDispatchPilotAssignment(
    staffingState.namedPilots,
    {
      qualificationGroup,
      pilotsRequired: aircraft.pilotsRequired,
      assignedFromUtc: schedule.plannedStartUtc,
      assignedToUtc: schedule.plannedEndUtc,
      currentTimeUtc,
      currentScheduleId: schedule.scheduleId,
      ...(schedule.legs[0]?.originAirportId ? { requiredOriginAirportId: schedule.legs[0].originAirportId } : {}),
    },
    airportReference,
  );
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
      coverageUnits: 1,
      fixedCostAmount: 12_000,
    },
  });

  assert.equal(activateStaffingResult.success, true);
  assert.equal(activateStaffingResult.emittedLedgerEntryIds.length, 0);

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
  assert.equal(activateCabinStaffingResult.emittedLedgerEntryIds.length, 0);

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
  assert.equal(staffingState.namedPilots.length, 1);
  assert.equal(staffingState.namedPilots.every((pilot) => pilot.availabilityState === "ready"), true);
  const pilotCoverageSummary = staffingState.coverageSummaries.find((summary) => summary.laborCategory === "pilot");
  const cabinCoverageSummary = staffingState.coverageSummaries.find((summary) => summary.laborCategory === "flight_attendant");
  assert.equal(pilotCoverageSummary?.activeCoverageUnits, 1);
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
  const staffingStateAfterCommit = await backend.loadStaffingState(saveId);
  assert.ok(staffingStateAfterCommit);
  assert.equal(staffingStateAfterCommit.namedPilots.some((pilot) => pilot.availabilityState === "reserved"), true);
  assert.equal(
    staffingStateAfterCommit.namedPilots.some((pilot) => pilot.availabilityState === "reserved" && pilot.assignedScheduleId === draftScheduleId),
    true,
  );

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
  const staffingStateAfterAdvance = await backend.loadStaffingState(saveId);
  assert.ok(staffingStateAfterAdvance);
  assert.equal(staffingStateAfterAdvance.namedPilots.some((pilot) => pilot.availabilityState === "resting"), true);
  assert.equal(
    staffingStateAfterAdvance.namedPilots.some((pilot) =>
      pilot.availabilityState === "resting" && pilot.currentAirportId === selectedOffer.destinationAirportId),
    true,
  );

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

  const recoveryDestinationAirportId = pickReachableRecoveryDestinationAirportId(
    selectedOffer.destinationAirportId,
    fleetState.aircraft[0],
    airportReference,
  );
  assert.ok(recoveryDestinationAirportId, "Expected a reachable recovery destination.");
  const recoveryDepartureUtc = addHours(arrivalUtc, 2);
  const recoveryArrivalUtc = addMinutes(
    recoveryDepartureUtc,
    estimateFlightMinutes(airportReference, selectedOffer.destinationAirportId, recoveryDestinationAirportId, 180),
  );
  const postRestDraftResult = await backend.dispatch({
    commandId: `cmd_${saveId}_draft_rest_blocked`,
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
          originAirportId: selectedOffer.destinationAirportId,
          destinationAirportId: recoveryDestinationAirportId,
          plannedDepartureUtc: recoveryDepartureUtc,
          plannedArrivalUtc: recoveryArrivalUtc,
        },
      ],
    },
  });

  assert.equal(postRestDraftResult.success, true);
  const postRestScheduleId = String(postRestDraftResult.metadata?.scheduleId ?? "");
  assert.ok(postRestScheduleId);
  const blockedByRestResult = await backend.dispatch({
    commandId: `cmd_${saveId}_commit_rest_blocked`,
    saveId,
    commandName: "CommitAircraftSchedule",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      scheduleId: postRestScheduleId,
    },
  });

  assert.equal(blockedByRestResult.success, false);
  assert.equal(blockedByRestResult.hardBlockers.some((blocker) => /named pilots/i.test(blocker)), true);

  const discardBlockedDraftResult = await backend.dispatch({
    commandId: `cmd_${saveId}_discard_rest_blocked`,
    saveId,
    commandName: "DiscardAircraftScheduleDraft",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      scheduleId: postRestScheduleId,
    },
  });

  assert.equal(discardBlockedDraftResult.success, true);
  const schedulesAfterDiscard = await backend.loadAircraftSchedules(saveId, fleetState.aircraft[0].aircraftId);
  const discardedSchedule = schedulesAfterDiscard.find((schedule) => schedule.scheduleId === postRestScheduleId);
  assert.ok(discardedSchedule);
  assert.equal(discardedSchedule?.isDraft, false);
  assert.equal(discardedSchedule?.scheduleState, "cancelled");
  assert.equal(discardedSchedule?.legs.length, 0);
  assert.equal(
    schedulesAfterDiscard.some((schedule) => schedule.scheduleId === draftScheduleId && schedule.scheduleState === "completed"),
    true,
  );

  const postRestAdvanceResult = await backend.dispatch({
    commandId: `cmd_${saveId}_advance_rest`,
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: addHours(arrivalUtc, 11),
      stopConditions: ["target_time"],
    },
  });

  assert.equal(postRestAdvanceResult.success, true);
  const staffingStateAfterRest = await backend.loadStaffingState(saveId);
  assert.ok(staffingStateAfterRest);
  assert.equal(staffingStateAfterRest.namedPilots.every((pilot) => pilot.availabilityState === "ready"), true);
  const trainingPilotId = staffingStateAfterRest.namedPilots[0]?.namedPilotId;
  assert.ok(trainingPilotId);
  const startTrainingResult = await backend.dispatch({
    commandId: `cmd_${saveId}_training_start`,
    saveId,
    commandName: "StartNamedPilotTraining",
    issuedAtUtc: String(postRestAdvanceResult.metadata?.advancedToUtc ?? addHours(arrivalUtc, 11)),
    actorType: "player",
    payload: {
      namedPilotId: trainingPilotId,
      targetCertificationCode: "MEPL",
    },
  });

  assert.equal(startTrainingResult.success, true);
  const staffingStateDuringTraining = await backend.loadStaffingState(saveId);
  assert.ok(staffingStateDuringTraining);
  assert.equal(staffingStateDuringTraining.namedPilots.some((pilot) => pilot.availabilityState === "training"), true);
  assert.equal(
    staffingStateDuringTraining.namedPilots.some((pilot) =>
      pilot.namedPilotId === trainingPilotId
      && pilot.trainingUntilUtc
      && pilot.trainingTargetCertificationCode === "MEPL"),
    true,
  );

  const recoveredDepartureUtc = addHours(String(postRestAdvanceResult.metadata?.advancedToUtc ?? addHours(arrivalUtc, 11)), 1);
  const recoveredArrivalUtc = addMinutes(
    recoveredDepartureUtc,
    estimateFlightMinutes(airportReference, selectedOffer.destinationAirportId, recoveryDestinationAirportId, 180),
  );
  const recoveredDraftResult = await backend.dispatch({
    commandId: `cmd_${saveId}_draft_rest_ready`,
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
          originAirportId: selectedOffer.destinationAirportId,
          destinationAirportId: recoveryDestinationAirportId,
          plannedDepartureUtc: recoveredDepartureUtc,
          plannedArrivalUtc: recoveredArrivalUtc,
        },
      ],
    },
  });

  assert.equal(recoveredDraftResult.success, true);
  assert.match(
    JSON.stringify(recoveredDraftResult.metadata?.validationSnapshot ?? {}),
    /training/i,
  );
  assert.equal(
    recoveredDraftResult.hardBlockers.some((message) => /training/i.test(message)),
    true,
  );
  const recoveredScheduleId = String(recoveredDraftResult.metadata?.scheduleId ?? "");
  assert.ok(recoveredScheduleId);
  const commitDuringTrainingResult = await backend.dispatch({
    commandId: `cmd_${saveId}_commit_training_blocked`,
    saveId,
    commandName: "CommitAircraftSchedule",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      scheduleId: recoveredScheduleId,
    },
  });

  assert.equal(commitDuringTrainingResult.success, false);
  assert.match(commitDuringTrainingResult.hardBlockers[0] ?? "", /training|named pilots/i);

  const postTrainingAdvanceResult = await backend.dispatch({
    commandId: `cmd_${saveId}_advance_training`,
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: addHours(String(postRestAdvanceResult.metadata?.advancedToUtc ?? addHours(arrivalUtc, 11)), 73),
      stopConditions: ["target_time"],
    },
  });

  assert.equal(postTrainingAdvanceResult.success, true);
  const staffingStateAfterTraining = await backend.loadStaffingState(saveId);
  assert.ok(staffingStateAfterTraining);
  assert.equal(staffingStateAfterTraining.namedPilots.every((pilot) => pilot.availabilityState === "ready"), true);
  assert.equal(
    staffingStateAfterTraining.namedPilots.some((pilot) =>
      pilot.namedPilotId === trainingPilotId
      && pilot.certifications.includes("MEPL")
      && pilot.certifications.includes("SEPL")),
    true,
  );

  const commitAfterTrainingResult = await backend.dispatch({
    commandId: `cmd_${saveId}_commit_training_ready`,
    saveId,
    commandName: "CommitAircraftSchedule",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      scheduleId: recoveredScheduleId,
    },
  });

  assert.equal(commitAfterTrainingResult.success, true);

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

  const pilotOverrideSaveId = `${saveId}_pilot_override`;
  const pilotOverrideStartedAtUtc = addHours(startedAtUtc, 6);

  const createPilotOverrideSaveResult = await backend.dispatch({
    commandId: `cmd_${pilotOverrideSaveId}_save`,
    saveId: pilotOverrideSaveId,
    commandName: "CreateSaveGame",
    issuedAtUtc: pilotOverrideStartedAtUtc,
    actorType: "player",
    payload: {
      worldSeed: "seed-pilot-override",
      difficultyProfile: "standard",
      startTimeUtc: pilotOverrideStartedAtUtc,
    },
  });
  assert.equal(createPilotOverrideSaveResult.success, true);

  const createPilotOverrideCompanyResult = await backend.dispatch({
    commandId: `cmd_${pilotOverrideSaveId}_company`,
    saveId: pilotOverrideSaveId,
    commandName: "CreateCompany",
    issuedAtUtc: pilotOverrideStartedAtUtc,
    actorType: "player",
    payload: {
      displayName: "Pilot Override Air",
      starterAirportId: "KDEN",
      startingCashAmount: 3_500_000,
    },
  });
  assert.equal(createPilotOverrideCompanyResult.success, true);

  const acquirePilotOverrideAircraftAResult = await backend.dispatch({
    commandId: `cmd_${pilotOverrideSaveId}_aircraft_a`,
    saveId: pilotOverrideSaveId,
    commandName: "AcquireAircraft",
    issuedAtUtc: pilotOverrideStartedAtUtc,
    actorType: "player",
    payload: {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      deliveryAirportId: "KDEN",
      ownershipType: "owned",
      registration: "N208PO",
    },
  });
  assert.equal(acquirePilotOverrideAircraftAResult.success, true);

  const activatePilotOverrideStaffingResult = await backend.dispatch({
    commandId: `cmd_${pilotOverrideSaveId}_staffing`,
    saveId: pilotOverrideSaveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: pilotOverrideStartedAtUtc,
    actorType: "player",
    payload: {
      laborCategory: "pilot",
      employmentModel: "direct_hire",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 3,
      fixedCostAmount: 12_000,
    },
  });
  assert.equal(activatePilotOverrideStaffingResult.success, true);

  const pilotOverrideFleetState = await backend.loadFleetState(pilotOverrideSaveId);
  assert.ok(pilotOverrideFleetState);
  const pilotOverrideAircraftA = pilotOverrideFleetState.aircraft.find((aircraft) => aircraft.registration === "N208PO");
  assert.ok(pilotOverrideAircraftA);

  const manualDraftResult = await backend.dispatch({
    commandId: `cmd_${pilotOverrideSaveId}_draft_manual`,
    saveId: pilotOverrideSaveId,
    commandName: "SaveScheduleDraft",
    issuedAtUtc: pilotOverrideStartedAtUtc,
    actorType: "player",
    payload: {
      aircraftId: pilotOverrideAircraftA.aircraftId,
      scheduleKind: "operational",
      legs: [
        {
          legType: "reposition",
          originAirportId: "KDEN",
          destinationAirportId: "KCOS",
          plannedDepartureUtc: addHours(pilotOverrideStartedAtUtc, 1),
          plannedArrivalUtc: addHours(pilotOverrideStartedAtUtc, 2),
        },
      ],
    },
  });
  assert.equal(manualDraftResult.success, true);
  const manualDraftScheduleId = String(manualDraftResult.metadata?.scheduleId ?? "");
  assert.ok(manualDraftScheduleId);

  const pilotOverrideStaffingState = await backend.loadStaffingState(pilotOverrideSaveId);
  assert.ok(pilotOverrideStaffingState);
  assert.equal(pilotOverrideStaffingState.namedPilots.length >= 3, true);
  const manualDraftSchedules = await backend.loadAircraftSchedules(pilotOverrideSaveId, pilotOverrideAircraftA.aircraftId);
  const manualDraftSchedule = manualDraftSchedules.find((schedule) => schedule.scheduleId === manualDraftScheduleId);
  assert.ok(manualDraftSchedule);
  const manualRecommendation = resolveDraftPilotRecommendation(
    pilotOverrideStaffingState,
    pilotOverrideAircraftA,
    manualDraftSchedule,
    pilotOverrideStartedAtUtc,
    airportReference,
  );
  assert.equal(manualRecommendation.recommendedPilotIds.length, 1);
  const manualSelectedPilotId = manualRecommendation.candidateOptions.find((option) =>
    option.selectable && !option.recommended,
  )?.namedPilotId;
  assert.ok(manualSelectedPilotId);

  const manualCommitResult = await backend.dispatch({
    commandId: `cmd_${pilotOverrideSaveId}_commit_manual`,
    saveId: pilotOverrideSaveId,
    commandName: "CommitAircraftSchedule",
    issuedAtUtc: pilotOverrideStartedAtUtc,
    actorType: "player",
    payload: {
      scheduleId: manualDraftScheduleId,
      selectedNamedPilotIds: [manualSelectedPilotId],
    },
  });
  assert.equal(manualCommitResult.success, true);

  const staffingStateAfterManualCommit = await backend.loadStaffingState(pilotOverrideSaveId);
  assert.ok(staffingStateAfterManualCommit);
  assert.equal(
    staffingStateAfterManualCommit.namedPilots.some((pilot) =>
      pilot.namedPilotId === manualSelectedPilotId
      && pilot.assignedScheduleId === manualDraftScheduleId
      && pilot.availabilityState === "reserved"),
    true,
  );

  const fallbackDraftResult = await backend.dispatch({
    commandId: `cmd_${pilotOverrideSaveId}_draft_fallback`,
    saveId: pilotOverrideSaveId,
    commandName: "SaveScheduleDraft",
    issuedAtUtc: pilotOverrideStartedAtUtc,
    actorType: "player",
    payload: {
      aircraftId: pilotOverrideAircraftA.aircraftId,
      scheduleKind: "operational",
      legs: [
        {
          legType: "reposition",
          originAirportId: "KDEN",
          destinationAirportId: "KCOS",
          plannedDepartureUtc: addHours(pilotOverrideStartedAtUtc, 3),
          plannedArrivalUtc: addHours(pilotOverrideStartedAtUtc, 4),
        },
      ],
    },
  });
  assert.equal(fallbackDraftResult.success, true);
  const fallbackDraftScheduleId = String(fallbackDraftResult.metadata?.scheduleId ?? "");
  assert.ok(fallbackDraftScheduleId);
  const fallbackDraftSchedules = await backend.loadAircraftSchedules(pilotOverrideSaveId, pilotOverrideAircraftA.aircraftId);
  const fallbackDraftSchedule = fallbackDraftSchedules.find((schedule) => schedule.scheduleId === fallbackDraftScheduleId);
  const staffingStateBeforeFallbackCommit = await backend.loadStaffingState(pilotOverrideSaveId);
  assert.ok(fallbackDraftSchedule);
  assert.ok(staffingStateBeforeFallbackCommit);
  const fallbackRecommendation = resolveDraftPilotRecommendation(
    staffingStateBeforeFallbackCommit,
    pilotOverrideAircraftA,
    fallbackDraftSchedule,
    pilotOverrideStartedAtUtc,
    airportReference,
  );
  assert.equal(fallbackRecommendation.recommendedPilotIds.length, 1);

  const fallbackCommitResult = await backend.dispatch({
    commandId: `cmd_${pilotOverrideSaveId}_commit_fallback`,
    saveId: pilotOverrideSaveId,
    commandName: "CommitAircraftSchedule",
    issuedAtUtc: pilotOverrideStartedAtUtc,
    actorType: "player",
    payload: {
      scheduleId: fallbackDraftScheduleId,
    },
  });
  assert.equal(fallbackCommitResult.success, true);

  const staffingStateAfterFallbackCommit = await backend.loadStaffingState(pilotOverrideSaveId);
  assert.ok(staffingStateAfterFallbackCommit);
  const fallbackAssignedPilot = staffingStateAfterFallbackCommit.namedPilots.find((pilot) =>
    pilot.assignedScheduleId === fallbackDraftScheduleId
    && pilot.availabilityState === "reserved");
  assert.ok(fallbackAssignedPilot);
  assert.equal(fallbackAssignedPilot.namedPilotId, fallbackRecommendation.recommendedPilotIds[0]);

  const discardSaveId = `${saveId}_discard`;
  const discardStartedAtUtc = addHours(startedAtUtc, 4);

  const createDiscardSaveResult = await backend.dispatch({
    commandId: `cmd_${discardSaveId}_save`,
    saveId: discardSaveId,
    commandName: "CreateSaveGame",
    issuedAtUtc: discardStartedAtUtc,
    actorType: "player",
    payload: {
      worldSeed: "seed-discard-regression",
      difficultyProfile: "standard",
      startTimeUtc: discardStartedAtUtc,
    },
  });
  assert.equal(createDiscardSaveResult.success, true);

  const createDiscardCompanyResult = await backend.dispatch({
    commandId: `cmd_${discardSaveId}_company`,
    saveId: discardSaveId,
    commandName: "CreateCompany",
    issuedAtUtc: discardStartedAtUtc,
    actorType: "player",
    payload: {
      displayName: "Discard Draft Air",
      starterAirportId: "KDEN",
      startingCashAmount: 3_500_000,
    },
  });
  assert.equal(createDiscardCompanyResult.success, true);

  const acquireDiscardAircraftResult = await backend.dispatch({
    commandId: `cmd_${discardSaveId}_aircraft`,
    saveId: discardSaveId,
    commandName: "AcquireAircraft",
    issuedAtUtc: discardStartedAtUtc,
    actorType: "player",
    payload: {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      deliveryAirportId: "KDEN",
      ownershipType: "owned",
      registration: "N208DD",
    },
  });
  assert.equal(acquireDiscardAircraftResult.success, true);

  const activateDiscardStaffingResult = await backend.dispatch({
    commandId: `cmd_${discardSaveId}_staffing`,
    saveId: discardSaveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: discardStartedAtUtc,
    actorType: "player",
    payload: {
      laborCategory: "pilot",
      employmentModel: "direct_hire",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 12_000,
    },
  });
  assert.equal(activateDiscardStaffingResult.success, true);

  const discardFleetState = await backend.loadFleetState(discardSaveId);
  assert.ok(discardFleetState);
  const discardAircraft = discardFleetState.aircraft[0];
  assert.ok(discardAircraft);

  const committedDraftResult = await backend.dispatch({
    commandId: `cmd_${discardSaveId}_draft_committed`,
    saveId: discardSaveId,
    commandName: "SaveScheduleDraft",
    issuedAtUtc: discardStartedAtUtc,
    actorType: "player",
    payload: {
      aircraftId: discardAircraft.aircraftId,
      scheduleKind: "operational",
      legs: [
        {
          legType: "reposition",
          originAirportId: "KDEN",
          destinationAirportId: "KCOS",
          plannedDepartureUtc: addHours(discardStartedAtUtc, 1),
          plannedArrivalUtc: addHours(discardStartedAtUtc, 2),
        },
      ],
    },
  });
  assert.equal(committedDraftResult.success, true);
  const committedScheduleId = String(committedDraftResult.metadata?.scheduleId ?? "");
  assert.ok(committedScheduleId);

  const commitDiscardScheduleResult = await backend.dispatch({
    commandId: `cmd_${discardSaveId}_commit_committed`,
    saveId: discardSaveId,
    commandName: "CommitAircraftSchedule",
    issuedAtUtc: discardStartedAtUtc,
    actorType: "player",
    payload: {
      scheduleId: committedScheduleId,
    },
  });
  assert.equal(commitDiscardScheduleResult.success, true);

  const resumableDraftResult = await backend.dispatch({
    commandId: `cmd_${discardSaveId}_draft_resumable`,
    saveId: discardSaveId,
    commandName: "SaveScheduleDraft",
    issuedAtUtc: discardStartedAtUtc,
    actorType: "player",
    payload: {
      aircraftId: discardAircraft.aircraftId,
      scheduleKind: "operational",
      legs: [
        {
          legType: "reposition",
          originAirportId: "KCOS",
          destinationAirportId: "KDEN",
          plannedDepartureUtc: addHours(discardStartedAtUtc, 4),
          plannedArrivalUtc: addHours(discardStartedAtUtc, 5),
        },
      ],
    },
  });
  assert.equal(resumableDraftResult.success, true);
  const resumableDraftScheduleId = String(resumableDraftResult.metadata?.scheduleId ?? "");
  assert.ok(resumableDraftScheduleId);
  assert.notEqual(resumableDraftScheduleId, committedScheduleId);

  const discardDraftResult = await backend.dispatch({
    commandId: `cmd_${discardSaveId}_discard`,
    saveId: discardSaveId,
    commandName: "DiscardAircraftScheduleDraft",
    issuedAtUtc: discardStartedAtUtc,
    actorType: "player",
    payload: {
      scheduleId: resumableDraftScheduleId,
    },
  });
  assert.equal(discardDraftResult.success, true);

  const discardSchedules = await backend.loadAircraftSchedules(discardSaveId, discardAircraft.aircraftId);
  assert.equal(discardSchedules.length, 2);
  const committedScheduleAfterDiscard = discardSchedules.find((schedule) => schedule.scheduleId === committedScheduleId);
  const discardedScheduleAfterDiscard = discardSchedules.find((schedule) => schedule.scheduleId === resumableDraftScheduleId);
  assert.ok(committedScheduleAfterDiscard);
  assert.ok(discardedScheduleAfterDiscard);
  assert.equal(committedScheduleAfterDiscard.isDraft, false);
  assert.equal(committedScheduleAfterDiscard.scheduleState, "committed");
  assert.equal(committedScheduleAfterDiscard.legs.length, 1);
  assert.equal(discardedScheduleAfterDiscard.isDraft, false);
  assert.equal(discardedScheduleAfterDiscard.scheduleState, "cancelled");
  assert.equal(discardedScheduleAfterDiscard.legs.length, 0);
  assert.equal(discardedScheduleAfterDiscard.laborAllocations.length, 0);
} finally {
  await Promise.allSettled([
    backend.closeSaveSession(saveId),
    backend.closeSaveSession(`${saveId}_pilot_override`),
    backend.closeSaveSession(`${saveId}_discard`),
    backend.close(),
    airportReference.close(),
  ]);
}







