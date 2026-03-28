/*
 * Regression coverage for route planner.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { FlightLineBackend } from "../dist/index.js";
import { acceptRoutePlanOffers } from "../dist/ui/route-plan-accept.js";
import { bindRoutePlanToAircraft } from "../dist/ui/route-plan-dispatch.js";
import { addAcceptedContractToRoutePlan, addCandidateOfferToRoutePlan, loadRoutePlanState } from "../dist/ui/route-plan-state.js";
import { AirportReferenceRepository } from "../dist/infrastructure/reference/airport-reference.js";
import { effectiveCargoCapacityLb, effectivePassengerCapacity, uniqueSaveId } from "./helpers/flightline-testkit.mjs";

function addHours(utcIsoString, hours) {
  return new Date(new Date(utcIsoString).getTime() + hours * 60 * 60 * 1000).toISOString();
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
    return Number.POSITIVE_INFINITY;
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
    ?? candidateOffers[0]
    ?? null;
}

const saveDirectoryPath = await mkdtemp(join(tmpdir(), "flightline-route-plan-"));
const airportDatabasePath = resolve(process.cwd(), "data", "airports", "flightline-airports.sqlite");
const backend = await FlightLineBackend.create({
  saveDirectoryPath,
  airportDatabasePath,
  aircraftDatabasePath: resolve(process.cwd(), "data", "aircraft", "flightline-aircraft.sqlite"),
});
const airportReference = await AirportReferenceRepository.open(airportDatabasePath);

try {
  const setupSave = async (saveId) => {
    const startedAtUtc = new Date().toISOString();
    await backend.dispatch({
      commandId: `cmd_${saveId}_save`,
      saveId,
      commandName: "CreateSaveGame",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        worldSeed: `seed_${saveId}`,
        difficultyProfile: "standard",
        startTimeUtc: startedAtUtc,
      },
    });
    await backend.dispatch({
      commandId: `cmd_${saveId}_company`,
      saveId,
      commandName: "CreateCompany",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        displayName: `Carrier ${saveId}`,
        starterAirportId: "KDEN",
        startingCashAmount: 3_500_000,
      },
    });
    return startedAtUtc;
  };

  {
    const saveId = uniqueSaveId("route_planner");
    const startedAtUtc = await setupSave(saveId);

    await backend.dispatch({
      commandId: `cmd_${saveId}_aircraft`,
      saveId,
      commandName: "AcquireAircraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
        deliveryAirportId: "KDEN",
        ownershipType: "owned",
        registration: "N208RP",
      },
    });
    await backend.dispatch({
      commandId: `cmd_${saveId}_pilot`,
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
    await backend.dispatch({
      commandId: `cmd_${saveId}_cabin`,
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
    await backend.dispatch({
      commandId: `cmd_${saveId}_refresh`,
      saveId,
      commandName: "RefreshContractBoard",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        refreshReason: "bootstrap",
      },
    });

    const fleetState = await backend.loadFleetState(saveId);
    let board = await backend.loadActiveContractBoard(saveId);
    assert.ok(fleetState?.aircraft[0]);
    assert.ok(board);

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

    assert.ok(selectedOffer, "Expected a flyable planner offer.");

    const addResult = await backend.withExistingSaveDatabase(saveId, async (context) => {
      const mutation = addCandidateOfferToRoutePlan(context.saveDatabase, saveId, selectedOffer.contractOfferId);
      await context.saveDatabase.persist();
      return mutation;
    });
    assert.equal(addResult?.success, true);

    let routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items.length, 1);
    assert.equal(routePlan.items[0]?.plannerItemStatus, "candidate_available");
    assert.equal(routePlan.items[0]?.sourceType, "candidate_offer");

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

    routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items.length, 1);
    assert.equal(routePlan.items[0]?.sourceType, "accepted_contract");
    assert.equal(routePlan.items[0]?.plannerItemStatus, "accepted_ready");

    const bindResult = await bindRoutePlanToAircraft(
      backend,
      saveId,
      fleetState.aircraft[0].aircraftId,
      `cmd_${saveId}_bind`,
    );
    assert.equal(bindResult.success, true);
    assert.ok(bindResult.scheduleId);

    routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items[0]?.plannerItemStatus, "accepted_ready");
    assert.equal(routePlan.items[0]?.linkedScheduleId, undefined);
    assert.equal(routePlan.items[0]?.linkedAircraftId, undefined);

    const commitResult = await backend.dispatch({
      commandId: `cmd_${saveId}_commit_bound_route_plan`,
      saveId,
      commandName: "CommitAircraftSchedule",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        scheduleId: bindResult.scheduleId,
      },
    });
    assert.equal(commitResult.success, true);

    routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items[0]?.plannerItemStatus, "scheduled");
    assert.equal(routePlan.items[0]?.linkedScheduleId, bindResult.scheduleId);
    assert.equal(routePlan.items[0]?.linkedAircraftId, fleetState.aircraft[0].aircraftId);
  }

  {
    const saveId = `planner_batch_${Date.now()}`;
    const startedAtUtc = await setupSave(saveId);

    await backend.dispatch({
      commandId: `cmd_${saveId}_refresh`,
      saveId,
      commandName: "RefreshContractBoard",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        refreshReason: "bootstrap",
      },
    });

    let board = await backend.loadActiveContractBoard(saveId);
    assert.ok(board);
    const selectedOffers = board.offers.filter((offer) => offer.offerStatus === "available").slice(0, 2);
    assert.equal(selectedOffers.length, 2);

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      for (const offer of selectedOffers) {
        const mutation = addCandidateOfferToRoutePlan(context.saveDatabase, saveId, offer.contractOfferId);
        assert.equal(mutation.success, true);
      }
      await context.saveDatabase.persist();
    });

    let routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items.length, 2);

    const batchResult = await acceptRoutePlanOffers(
      backend,
      saveId,
      routePlan.items.map((item) => item.routePlanItemId),
      `cmd_${saveId}_batch`,
    );
    assert.equal(batchResult.success, true);
    assert.equal(batchResult.acceptedCount, 2);
    assert.equal(batchResult.failedCount, 0);

    routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items.every((item) => item.sourceType === "accepted_contract"), true);
    assert.equal(routePlan.items.every((item) => item.plannerItemStatus === "accepted_ready"), true);
  }

  {
    const saveId = uniqueSaveId("planner_grouped_same_leg");
    const startedAtUtc = await setupSave(saveId);

    await backend.dispatch({
      commandId: `cmd_${saveId}_aircraft`,
      saveId,
      commandName: "AcquireAircraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
        deliveryAirportId: "KDEN",
        ownershipType: "owned",
        registration: "N208GL",
      },
    });
    await backend.dispatch({
      commandId: `cmd_${saveId}_pilot`,
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
    await backend.dispatch({
      commandId: `cmd_${saveId}_cabin`,
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
    await backend.dispatch({
      commandId: `cmd_${saveId}_refresh`,
      saveId,
      commandName: "RefreshContractBoard",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        refreshReason: "bootstrap",
      },
    });

    const board = await backend.loadActiveContractBoard(saveId);
    assert.ok(board);
    const groupedOffers = board.offers.filter((offer) => offer.offerStatus === "available").slice(0, 2);
    assert.equal(groupedOffers.length, 2);

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      for (const [index, offer] of groupedOffers.entries()) {
        context.saveDatabase.run(
          `UPDATE contract_offer
           SET origin_airport_id = $origin_airport_id,
               destination_airport_id = $destination_airport_id,
               volume_type = 'passenger',
               passenger_count = $passenger_count,
               cargo_weight_lb = NULL,
               earliest_start_utc = $earliest_start_utc,
               latest_completion_utc = $latest_completion_utc,
               payout_amount = $payout_amount
           WHERE contract_offer_id = $contract_offer_id`,
          {
            $contract_offer_id: offer.contractOfferId,
            $origin_airport_id: "KDEN",
            $destination_airport_id: "KCOS",
            $passenger_count: 4 + index,
            $earliest_start_utc: startedAtUtc,
            $latest_completion_utc: addHours(startedAtUtc, 12),
            $payout_amount: 25_000 + index * 5_000,
          },
        );
      }
      await context.saveDatabase.persist();
    });

    for (const offer of groupedOffers) {
      const acceptResult = await backend.dispatch({
        commandId: `cmd_${saveId}_accept_${offer.contractOfferId}`,
        saveId,
        commandName: "AcceptContractOffer",
        issuedAtUtc: startedAtUtc,
        actorType: "player",
        payload: {
          contractOfferId: offer.contractOfferId,
        },
      });
      assert.equal(acceptResult.success, true);
    }

    const companyContracts = await backend.loadCompanyContracts(saveId);
    assert.ok(companyContracts);
    const groupedCompanyContracts = groupedOffers.map((offer) =>
      companyContracts.contracts.find((contract) => contract.originContractOfferId === offer.contractOfferId),
    );
    assert.equal(groupedCompanyContracts.every(Boolean), true);

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      for (const contract of groupedCompanyContracts) {
        const mutation = addAcceptedContractToRoutePlan(context.saveDatabase, saveId, contract.companyContractId);
        assert.equal(mutation.success, true);
      }
      await context.saveDatabase.persist();
    });

    let routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items.length, 2);
    assert.equal(routePlan.items.every((item) => item.plannerItemStatus === "accepted_ready"), true);

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState?.aircraft[0]);

    const bindResult = await bindRoutePlanToAircraft(
      backend,
      saveId,
      fleetState.aircraft[0].aircraftId,
      `cmd_${saveId}_bind_grouped`,
    );
    assert.equal(bindResult.success, true);
    assert.ok(bindResult.scheduleId);
    assert.equal(bindResult.boundContractIds?.length, 2);

    const groupedLegSnapshot = await backend.withExistingSaveDatabase(saveId, async (context) => ({
      contractFlightLegs: context.saveDatabase.all(
        `SELECT
           flight_leg_id AS flightLegId,
           payload_snapshot_json AS payloadSnapshotJson
         FROM flight_leg
         WHERE schedule_id = $schedule_id
           AND leg_type = 'contract_flight'
         ORDER BY sequence_number ASC`,
        { $schedule_id: bindResult.scheduleId },
      ),
      contractLinks: context.saveDatabase.all(
        `SELECT
           flc.company_contract_id AS companyContractId
         FROM flight_leg_contract AS flc
         JOIN flight_leg AS fl ON fl.flight_leg_id = flc.flight_leg_id
         WHERE fl.schedule_id = $schedule_id
         ORDER BY fl.sequence_number ASC, flc.attachment_order ASC`,
        { $schedule_id: bindResult.scheduleId },
      ),
    }));
    assert.equal(groupedLegSnapshot.contractFlightLegs.length, 1);
    assert.equal(groupedLegSnapshot.contractLinks.length, 2);

    const payloadSnapshot = JSON.parse(groupedLegSnapshot.contractFlightLegs[0].payloadSnapshotJson);
    assert.equal(payloadSnapshot.contractCount, 2);
    assert.equal(payloadSnapshot.passengerCount, 9);
    assert.equal(payloadSnapshot.passengerWeightPerPersonLb, 195);
    assert.equal(payloadSnapshot.totalPayloadWeightLb, 9 * 195);

    const commitResult = await backend.dispatch({
      commandId: `cmd_${saveId}_commit_grouped`,
      saveId,
      commandName: "CommitAircraftSchedule",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        scheduleId: bindResult.scheduleId,
      },
    });
    assert.equal(commitResult.success, true);

    routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items.every((item) => item.linkedScheduleId === bindResult.scheduleId), true);
    assert.equal(routePlan.items.every((item) => item.linkedAircraftId === fleetState.aircraft[0].aircraftId), true);
  }

  {
    const saveId = `planner_cancel_${Date.now()}`;
    const startedAtUtc = await setupSave(saveId);

    await backend.dispatch({
      commandId: `cmd_${saveId}_refresh`,
      saveId,
      commandName: "RefreshContractBoard",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        refreshReason: "bootstrap",
      },
    });

    let board = await backend.loadActiveContractBoard(saveId);
    assert.ok(board);
    const selectedOffer = board.offers.find((offer) => offer.offerStatus === "available");
    assert.ok(selectedOffer);

    const accepted = await backend.dispatch({
      commandId: `cmd_${saveId}_accept`,
      saveId,
      commandName: "AcceptContractOffer",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        contractOfferId: selectedOffer.contractOfferId,
      },
    });
    assert.equal(accepted.success, true);

    const companyContextBeforeCancel = await backend.loadCompanyContext(saveId);
    const companyContractsBeforeCancel = await backend.loadCompanyContracts(saveId);
    assert.ok(companyContextBeforeCancel);
    assert.ok(companyContractsBeforeCancel);
    const acceptedContract = companyContractsBeforeCancel.contracts.find((contract) => contract.originContractOfferId === selectedOffer.contractOfferId);
    assert.ok(acceptedContract);

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      const mutation = addAcceptedContractToRoutePlan(context.saveDatabase, saveId, acceptedContract.companyContractId);
      assert.equal(mutation.success, true);
      await context.saveDatabase.persist();
    });

    const cancelResult = await backend.dispatch({
      commandId: `cmd_${saveId}_cancel`,
      saveId,
      commandName: "CancelCompanyContract",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        companyContractId: acceptedContract.companyContractId,
      },
    });
    assert.equal(cancelResult.success, true);

    const companyContextAfterCancel = await backend.loadCompanyContext(saveId);
    const companyContractsAfterCancel = await backend.loadCompanyContracts(saveId);
    const routePlanAfterCancel = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(companyContextAfterCancel);
    assert.ok(companyContractsAfterCancel);
    assert.ok(routePlanAfterCancel);

    const cancelledContract = companyContractsAfterCancel.contracts.find((contract) => contract.companyContractId === acceptedContract.companyContractId);
    assert.ok(cancelledContract);
    assert.equal(cancelledContract.contractState, "cancelled");
    assert.equal(companyContextAfterCancel.currentCashAmount, companyContextBeforeCancel.currentCashAmount - acceptedContract.cancellationPenaltyAmount);
    assert.equal(routePlanAfterCancel.items[0]?.plannerItemStatus, "closed");
  }
  {
    const saveId = `planner_stale_${Date.now()}`;
    const startedAtUtc = await setupSave(saveId);

    await backend.dispatch({
      commandId: `cmd_${saveId}_refresh`,
      saveId,
      commandName: "RefreshContractBoard",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        refreshReason: "bootstrap",
      },
    });

    let board = await backend.loadActiveContractBoard(saveId);
    assert.ok(board);
    const selectedOffer = board.offers.find((offer) => offer.offerStatus === "available");
    assert.ok(selectedOffer);

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      const mutation = addCandidateOfferToRoutePlan(context.saveDatabase, saveId, selectedOffer.contractOfferId);
      assert.equal(mutation.success, true);
      await context.saveDatabase.persist();
    });

    const advanceResult = await backend.dispatch({
      commandId: `cmd_${saveId}_advance`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: addHours(board.expiresAtUtc, 2),
        stopConditions: ["target_time"],
      },
    });
    assert.equal(advanceResult.success, true);

    const routePlan = await backend.withExistingSaveDatabase(saveId, (context) => loadRoutePlanState(context.saveDatabase, saveId));
    assert.ok(routePlan);
    assert.equal(routePlan.items[0]?.plannerItemStatus, "candidate_stale");
  }
} finally {
  await airportReference.close();
  await backend.close();
  await rm(saveDirectoryPath, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}









