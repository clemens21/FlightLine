/*
 * Regression coverage for canonical UTC ingress.
 * These scenarios lock down invalid-timestamp rejection and offset-input normalization
 * across save creation, staffing, dispatch, contracts, and time advance.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  createTestHarness,
  dispatchOrThrow,
  estimateFlightMinutes,
  pickFlyableOffer,
  refreshContractBoard,
  saveAndCommitSchedule,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";

function addMinutes(utcIsoString, minutes) {
  return new Date(Date.parse(utcIsoString) + minutes * 60_000).toISOString();
}

function addHours(utcIsoString, hours) {
  return addMinutes(utcIsoString, hours * 60);
}

function toOffsetIso(utcIsoString, offsetMinutes) {
  const localInstant = new Date(Date.parse(utcIsoString) + offsetMinutes * 60_000).toISOString().replace("Z", "");
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteOffsetMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteOffsetMinutes % 60).padStart(2, "0");
  return `${localInstant}${sign}${hours}:${minutes}`;
}

const startupStartingCashAmount = 3_500_000;

const harness = await createTestHarness("flightline-utc-ingress");
const { backend, airportReference } = harness;

try {
  {
    const saveId = uniqueSaveId("invalid_save_timestamp");
    const badStartTimeUtc = "not-a-date";
    const createSaveResult = await backend.dispatch({
      commandId: `cmd_${saveId}_save`,
      saveId,
      commandName: "CreateSaveGame",
      issuedAtUtc: "2026-03-18T12:00:00.000Z",
      actorType: "player",
      payload: {
        worldSeed: `seed_${saveId}`,
        difficultyProfile: "standard",
        startTimeUtc: badStartTimeUtc,
      },
    });

    assert.equal(createSaveResult.success, false);
    assert.equal(
      createSaveResult.hardBlockers.some((message) => /not a valid UTC timestamp/i.test(message)),
      true,
    );

    const createCompanyResult = await backend.dispatch({
      commandId: `cmd_${saveId}_company`,
      saveId,
      commandName: "CreateCompany",
      issuedAtUtc: "2026-03-18T12:00:00.000Z",
      actorType: "player",
      payload: {
        displayName: "Invalid Clock Air",
        starterAirportId: "KDEN",
        startingCashAmount: startupStartingCashAmount,
      },
    });

    assert.equal(createCompanyResult.success, false);
    assert.equal(await backend.loadCompanyContext(saveId), null);
  }

  {
    const saveId = uniqueSaveId("offset_save_contract_truth");
    const offsetStartTimeUtc = "2026-03-18T23:00:00+14:00";
    await createCompanySave(backend, saveId, {
      startedAtUtc: offsetStartTimeUtc,
    });

    const companyContext = await backend.loadCompanyContext(saveId);
    assert.ok(companyContext);
    assert.equal(companyContext.currentTimeUtc, "2026-03-18T09:00:00.000Z");

    await refreshContractBoard(backend, saveId, offsetStartTimeUtc, "manual");
    const board = await backend.loadActiveContractBoard(saveId);
    assert.ok(board);
    const availableOffer = board.offers.find((offer) => offer.offerStatus === "available");
    assert.ok(availableOffer);

    const acceptResult = await backend.dispatch({
      commandId: `cmd_${saveId}_accept_offer`,
      saveId,
      commandName: "AcceptContractOffer",
      issuedAtUtc: offsetStartTimeUtc,
      actorType: "player",
      payload: {
        contractOfferId: availableOffer.contractOfferId,
      },
    });

    assert.equal(acceptResult.success, true, acceptResult.hardBlockers?.[0] ?? "Expected available offer to accept.");
  }

  {
    const saveId = uniqueSaveId("offset_save_staffing_truth");
    const offsetStartTimeUtc = "2026-03-18T21:00:00+02:00";
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: offsetStartTimeUtc,
    });

    const activateResult = await backend.dispatch({
      commandId: `cmd_${saveId}_future_staffing`,
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
        startsAtUtc: "2026-03-18T20:30:00.000Z",
      },
    });

    assert.equal(activateResult.success, true, activateResult.hardBlockers?.[0] ?? "Expected staffing activation to succeed.");
    assert.equal(activateResult.metadata?.initialStatus, "pending");

    const staffingState = await backend.loadStaffingState(saveId);
    assert.ok(staffingState);
    assert.equal(staffingState.staffingPackages[0]?.status, "pending");
    assert.equal(staffingState.namedPilots[0]?.availabilityState, "pending");

    const companyContext = await backend.loadCompanyContext(saveId);
    assert.ok(companyContext);
    assert.equal(companyContext.currentCashAmount, startupStartingCashAmount);
  }

  {
    const saveId = uniqueSaveId("invalid_schedule_timestamp");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-18T12:00:00.000Z",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208TZ" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 12_000,
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    const aircraft = fleetState.aircraft.find((entry) => entry.registration === "N208TZ");
    assert.ok(aircraft);

    const invalidDraftResult = await backend.dispatch({
      commandId: `cmd_${saveId}_invalid_draft`,
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftId: aircraft.aircraftId,
        scheduleKind: "operational",
        legs: [
          {
            legType: "reposition",
            originAirportId: "KDEN",
            destinationAirportId: "KCOS",
            plannedDepartureUtc: "zzz",
            plannedArrivalUtc: "zzzz",
          },
        ],
      },
    });

    assert.equal(invalidDraftResult.success, false);
    assert.equal(
      invalidDraftResult.hardBlockers.some((message) => /valid UTC timestamp/i.test(message)),
      true,
    );

    const persistedCounts = await backend.withExistingSaveDatabase(saveId, (context) => ({
      scheduleCount: context.saveDatabase.getOne(
        `SELECT COUNT(*) AS countValue
         FROM aircraft_schedule
         WHERE aircraft_id = $aircraft_id`,
        { $aircraft_id: aircraft.aircraftId },
      )?.countValue ?? 0,
      eventCount: context.saveDatabase.getOne(
        `SELECT COUNT(*) AS countValue
         FROM scheduled_event
         WHERE save_id = $save_id`,
        { $save_id: saveId },
      )?.countValue ?? 0,
    }));

    assert.equal(persistedCounts.scheduleCount, 0);
    assert.equal(persistedCounts.eventCount, 0);
  }

  {
    const saveId = uniqueSaveId("offset_schedule_execution_truth");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-18T08:00:00.000Z",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208TO" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 12_000,
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    const aircraft = fleetState.aircraft.find((entry) => entry.registration === "N208TO");
    assert.ok(aircraft);

    const departureUtc = "2026-03-18T14:00:00.000Z";
    const arrivalUtc = "2026-03-18T16:00:00.000Z";
    const scheduleId = await saveAndCommitSchedule(
      backend,
      saveId,
      startedAtUtc,
      aircraft.aircraftId,
      [
        {
          legType: "reposition",
          originAirportId: "KDEN",
          destinationAirportId: "KCOS",
          plannedDepartureUtc: toOffsetIso(departureUtc, -240),
          plannedArrivalUtc: toOffsetIso(arrivalUtc, -240),
        },
      ],
    );

    const persistedSchedule = await backend.withExistingSaveDatabase(saveId, (context) => ({
      leg: context.saveDatabase.getOne(
        `SELECT planned_departure_utc AS plannedDepartureUtc,
                planned_arrival_utc AS plannedArrivalUtc
         FROM flight_leg
         WHERE schedule_id = $schedule_id
         ORDER BY sequence_number ASC
         LIMIT 1`,
        { $schedule_id: scheduleId },
      ),
      events: context.saveDatabase.all(
        `SELECT event_type AS eventType, scheduled_time_utc AS scheduledTimeUtc
         FROM scheduled_event
         WHERE save_id = $save_id
         ORDER BY event_type ASC, scheduled_time_utc ASC`,
        { $save_id: saveId },
      ),
    }));

    assert.equal(persistedSchedule.leg?.plannedDepartureUtc, departureUtc);
    assert.equal(persistedSchedule.leg?.plannedArrivalUtc, arrivalUtc);
    assert.equal(
      persistedSchedule.events.some((event) => event.eventType === "flight_leg_departure_due" && event.scheduledTimeUtc === departureUtc),
      true,
    );
    assert.equal(
      persistedSchedule.events.some((event) => event.eventType === "flight_leg_arrival_due" && event.scheduledTimeUtc === arrivalUtc),
      true,
    );

    const earlyAdvanceResult = await backend.dispatch({
      commandId: `cmd_${saveId}_advance_early`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: "2026-03-18T11:00:00.000Z",
        stopConditions: ["target_time"],
      },
    });

    assert.equal(earlyAdvanceResult.success, true);
    assert.equal(earlyAdvanceResult.metadata?.processedEventCount, 0);

    const schedulesAfterEarlyAdvance = await backend.loadAircraftSchedules(saveId, aircraft.aircraftId);
    assert.equal(schedulesAfterEarlyAdvance[0]?.legs[0]?.legState, "planned");
    assert.equal(schedulesAfterEarlyAdvance[0]?.legs[0]?.actualDepartureUtc, undefined);
  }

  {
    const saveId = uniqueSaveId("offset_schedule_overlap_truth");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-18T08:00:00.000Z",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208TV" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 12_000,
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    const aircraft = fleetState.aircraft.find((entry) => entry.registration === "N208TV");
    assert.ok(aircraft);

    await saveAndCommitSchedule(
      backend,
      saveId,
      startedAtUtc,
      aircraft.aircraftId,
      [
        {
          legType: "reposition",
          originAirportId: "KDEN",
          destinationAirportId: "KCOS",
          plannedDepartureUtc: "2026-03-18T12:00:00.000Z",
          plannedArrivalUtc: "2026-03-18T13:00:00.000Z",
        },
        {
          legType: "reposition",
          originAirportId: "KCOS",
          destinationAirportId: "KDEN",
          plannedDepartureUtc: "2026-03-18T13:20:00.000Z",
          plannedArrivalUtc: "2026-03-18T14:30:00.000Z",
        },
      ],
    );

    const laterDraftResult = await backend.dispatch({
      commandId: `cmd_${saveId}_later_offset_draft`,
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftId: aircraft.aircraftId,
        scheduleKind: "operational",
        legs: [
          {
            legType: "reposition",
            originAirportId: "KDEN",
            destinationAirportId: "KCOS",
            plannedDepartureUtc: "2026-03-18T10:31:00-04:00",
            plannedArrivalUtc: "2026-03-18T12:31:00-04:00",
          },
        ],
      },
    });

    assert.equal(laterDraftResult.success, true);
    assert.equal(
      laterDraftResult.hardBlockers.some((message) => /overlapping committed schedule|named pilots are currently available/i.test(message)),
      false,
    );
  }

  {
    const saveId = uniqueSaveId("offset_contract_deadline_truth");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-18T08:00:00.000Z",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208TC" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 12_000,
    });
    await refreshContractBoard(backend, saveId, startedAtUtc, "bootstrap");

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    const aircraft = fleetState.aircraft.find((entry) => entry.registration === "N208TC");
    assert.ok(aircraft);

    const board = await backend.loadActiveContractBoard(saveId);
    assert.ok(board);
    const offer = pickFlyableOffer(board, aircraft, airportReference);
    assert.ok(offer);

    const acceptResult = await backend.dispatch({
      commandId: `cmd_${saveId}_accept_contract`,
      saveId,
      commandName: "AcceptContractOffer",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        contractOfferId: offer.contractOfferId,
      },
    });

    assert.equal(acceptResult.success, true, acceptResult.hardBlockers?.[0] ?? "Expected flyable offer to accept.");
    const companyContractId = String(acceptResult.metadata?.companyContractId ?? "");
    assert.ok(companyContractId);
    const acceptedContract = await backend.withExistingSaveDatabase(saveId, (context) => context.saveDatabase.getOne(
      `SELECT deadline_utc AS deadlineUtc
       FROM company_contract
       WHERE company_contract_id = $company_contract_id
       LIMIT 1`,
      { $company_contract_id: companyContractId },
    ));
    assert.ok(acceptedContract?.deadlineUtc);

    const lateArrivalUtc = addMinutes(acceptedContract.deadlineUtc, 30);
    const plannedBlockMinutes = estimateFlightMinutes(
      airportReference,
      offer.originAirportId,
      offer.destinationAirportId,
      180,
    ) + 10;
    const lateDepartureUtc = addMinutes(lateArrivalUtc, plannedBlockMinutes * -1);

    const blockedLateDraftResult = await backend.dispatch({
      commandId: `cmd_${saveId}_late_offset_draft`,
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftId: aircraft.aircraftId,
        scheduleKind: "operational",
        legs: [
          {
            legType: "contract_flight",
            linkedCompanyContractId: companyContractId,
            originAirportId: offer.originAirportId,
            destinationAirportId: offer.destinationAirportId,
            plannedDepartureUtc: toOffsetIso(lateDepartureUtc, -240),
            plannedArrivalUtc: toOffsetIso(lateArrivalUtc, -240),
          },
        ],
      },
    });

    assert.equal(blockedLateDraftResult.success, true);
    assert.equal(
      blockedLateDraftResult.hardBlockers.some((message) => /arrives after contract .* deadline/i.test(message)),
      true,
    );
  }

  {
    const saveId = uniqueSaveId("offset_advance_market_truth");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-18T09:00:00.000Z",
    });

    const initialMarket = await backend.loadActiveAircraftMarket(saveId);
    assert.ok(initialMarket);
    const trackedOffer = [...initialMarket.offers].sort((left, right) =>
      Date.parse(left.availableUntilUtc) - Date.parse(right.availableUntilUtc)
    )[0];
    assert.ok(trackedOffer);

    const realTargetUtc = addHours(trackedOffer.availableUntilUtc, -3);
    const offsetTargetUtc = toOffsetIso(realTargetUtc, 14 * 60);
    const advanceResult = await backend.dispatch({
      commandId: `cmd_${saveId}_offset_advance`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: offsetTargetUtc,
        stopConditions: ["target_time"],
      },
    });

    assert.equal(advanceResult.success, true);
    assert.equal(advanceResult.metadata?.advancedToUtc, realTargetUtc);

    const companyContext = await backend.loadCompanyContext(saveId);
    assert.ok(companyContext);
    assert.equal(companyContext.currentTimeUtc, realTargetUtc);

    const marketAfterAdvance = await backend.loadActiveAircraftMarket(saveId);
    assert.ok(marketAfterAdvance);
    const trackedOfferAfterAdvance = marketAfterAdvance.offers.find((offer) => offer.aircraftOfferId === trackedOffer.aircraftOfferId);
    assert.ok(trackedOfferAfterAdvance, "Expected tracked offer to remain available before its real expiry.");
  }
} finally {
  await harness.cleanup();
}
