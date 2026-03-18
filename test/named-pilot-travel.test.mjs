/*
 * Focused regression coverage for first-pass named-pilot travel.
 * This test locks down travel-aware preview, commit-time travel activation,
 * and time-advance transition truth for pilots repositioning to a first-leg origin.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  createTestHarness,
  dispatchOrThrow,
  saveAndCommitSchedule,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import { buildTabPayload } from "../dist/ui/save-shell-fragments.js";

const renderers = {
  renderCreateCompany() {
    return "<div>create-company</div>";
  },
  renderOverview() {
    return "<div>overview</div>";
  },
  renderAircraft() {
    return "<div data-aircraft-tab-host></div>";
  },
  renderStaffing() {
    return "<div>staffing</div>";
  },
  renderDispatch() {
    return "<div>dispatch</div>";
  },
  renderActivity() {
    return "<div>activity</div>";
  },
  renderContractsHost() {
    return "<div data-contracts-host></div>";
  },
};

const harness = await createTestHarness("flightline-pilot-travel");
const { backend } = harness;

try {
  {
    const saveId = uniqueSaveId("pilot_manual_transfer");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      startingCashAmount: 25_000_000,
    });

    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208TM" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 12_000,
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    const aircraft = fleetState.aircraft.find((entry) => entry.registration === "N208TM");
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
          plannedDepartureUtc: "2026-03-16T13:00:00.000Z",
          plannedArrivalUtc: "2026-03-16T14:10:00.000Z",
        },
      ],
    );

    await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_advance_ready_for_transfer`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: "2026-03-17T00:30:00.000Z",
      },
    });

    const staffingStateReady = await backend.loadStaffingState(saveId);
    assert.ok(staffingStateReady);
    const readyPilot = staffingStateReady.namedPilots[0];
    assert.equal(readyPilot?.availabilityState, "ready");
    assert.equal(readyPilot?.currentAirportId, "KCOS");

    const invalidTransfer = await backend.dispatch({
      commandId: `cmd_${saveId}_transfer_invalid`,
      saveId,
      commandName: "StartNamedPilotTransfer",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        namedPilotId: readyPilot.namedPilotId,
        destinationAirportId: "KLAX",
      },
    });
    assert.equal(invalidTransfer.success, false);
    assert.match(invalidTransfer.hardBlockers[0] ?? "", /home base and current fleet airports/i);

    const transferResult = await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_transfer_home`,
      saveId,
      commandName: "StartNamedPilotTransfer",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        namedPilotId: readyPilot.namedPilotId,
        destinationAirportId: "KDEN",
      },
    });
    assert.equal(transferResult.success, true);

    const staffingStateTraveling = await backend.loadStaffingState(saveId);
    assert.ok(staffingStateTraveling);
    const travelingPilot = staffingStateTraveling.namedPilots[0];
    assert.equal(travelingPilot?.availabilityState, "traveling");
    assert.equal(travelingPilot?.travelDestinationAirportId, "KDEN");
    assert.ok(travelingPilot?.travelUntilUtc);

    await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_advance_transfer_complete`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: "2026-03-17T04:30:00.000Z",
      },
    });

    const staffingStateAfterTransfer = await backend.loadStaffingState(saveId);
    assert.ok(staffingStateAfterTransfer);
    assert.equal(staffingStateAfterTransfer.namedPilots[0]?.availabilityState, "ready");
    assert.equal(staffingStateAfterTransfer.namedPilots[0]?.currentAirportId, "KDEN");
  }

  {
    const saveId = uniqueSaveId("pilot_travel_ready");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      startingCashAmount: 25_000_000,
    });

    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208TV" });
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N20DTV" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 12_000,
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    const travelSourceAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N208TV");
    const travelTargetAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N20DTV");
    assert.ok(travelSourceAircraft);
    assert.ok(travelTargetAircraft);

    await saveAndCommitSchedule(
      backend,
      saveId,
      startedAtUtc,
      travelSourceAircraft.aircraftId,
      [
        {
          legType: "reposition",
          originAirportId: "KDEN",
          destinationAirportId: "KCOS",
          plannedDepartureUtc: "2026-03-16T13:00:00.000Z",
          plannedArrivalUtc: "2026-03-16T14:10:00.000Z",
        },
      ],
    );

    await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_advance_ready_at_kcos`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: "2026-03-17T00:30:00.000Z",
      },
    });

    const staffingStateAtOriginGap = await backend.loadStaffingState(saveId);
    assert.ok(staffingStateAtOriginGap);
    assert.equal(staffingStateAtOriginGap.namedPilots[0]?.availabilityState, "ready");
    assert.equal(staffingStateAtOriginGap.namedPilots[0]?.currentAirportId, "KCOS");

    const travelDraft = await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_travel_warning_draft`,
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftId: travelTargetAircraft.aircraftId,
        scheduleKind: "operational",
        legs: [
          {
            legType: "reposition",
            originAirportId: "KDEN",
            destinationAirportId: "KCOS",
            plannedDepartureUtc: "2026-03-17T04:00:00.000Z",
            plannedArrivalUtc: "2026-03-17T05:10:00.000Z",
          },
        ],
      },
    });
    const travelScheduleId = String(travelDraft.metadata?.scheduleId ?? "");
    assert.ok(travelScheduleId);
    const travelValidation = travelDraft.metadata?.validationSnapshot ?? {};
    assert.match(JSON.stringify(travelValidation), /named_pilot_travel_required/i);

    const travelCommit = await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_travel_commit`,
      saveId,
      commandName: "CommitAircraftSchedule",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        scheduleId: travelScheduleId,
      },
    });
    assert.equal(travelCommit.success, true);

    const staffingStateDuringTravel = await backend.loadStaffingState(saveId);
    assert.ok(staffingStateDuringTravel);
    const travelingPilot = staffingStateDuringTravel.namedPilots[0];
    assert.equal(travelingPilot?.availabilityState, "traveling");
    assert.equal(travelingPilot?.travelDestinationAirportId, "KDEN");
    assert.ok(travelingPilot?.travelUntilUtc);

    const dispatchTab = await buildTabPayload(backend, saveId, "dispatch", renderers);
    assert.ok(dispatchTab?.dispatchPayload);
    const committedTravelAircraft = dispatchTab.dispatchPayload.aircraft.find((aircraft) => aircraft.registration === "N20DTV");
    assert.ok(committedTravelAircraft);
    assert.equal(committedTravelAircraft.assignedPilots[0]?.availabilityState, "traveling");
    assert.equal(committedTravelAircraft.pilotReadiness.travelingNowCount, 1);

    const travelAdvance = await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_travel_advance_departure`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: "2026-03-17T05:30:00.000Z",
      },
    });
    assert.equal(travelAdvance.success, true);

    const schedulesAfterTravel = await backend.loadAircraftSchedules(saveId);
    const committedTravelSchedule = schedulesAfterTravel.find((schedule) => schedule.scheduleId === travelScheduleId);
    assert.equal(committedTravelSchedule?.scheduleState, "completed");

    const staffingStateAfterArrival = await backend.loadStaffingState(saveId);
    assert.ok(staffingStateAfterArrival);
    assert.equal(staffingStateAfterArrival.namedPilots[0]?.currentAirportId, "KCOS");
    assert.equal(staffingStateAfterArrival.namedPilots[0]?.availabilityState, "resting");
  }

  {
    const saveId = uniqueSaveId("pilot_travel_blocked");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      startingCashAmount: 25_000_000,
    });

    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208TB" });
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N20DTB" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 12_000,
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    const sourceAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N208TB");
    const targetAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N20DTB");
    assert.ok(sourceAircraft);
    assert.ok(targetAircraft);

    await saveAndCommitSchedule(
      backend,
      saveId,
      startedAtUtc,
      sourceAircraft.aircraftId,
      [
        {
          legType: "reposition",
          originAirportId: "KDEN",
          destinationAirportId: "KCOS",
          plannedDepartureUtc: "2026-03-16T13:00:00.000Z",
          plannedArrivalUtc: "2026-03-16T14:10:00.000Z",
        },
      ],
    );

    await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_advance_ready_gap`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: "2026-03-17T00:30:00.000Z",
      },
    });

    const blockedDraft = await backend.dispatch({
      commandId: `cmd_${saveId}_travel_blocked_draft`,
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftId: targetAircraft.aircraftId,
        scheduleKind: "operational",
        legs: [
          {
            legType: "reposition",
            originAirportId: "KDEN",
            destinationAirportId: "KCOS",
            plannedDepartureUtc: "2026-03-17T00:45:00.000Z",
            plannedArrivalUtc: "2026-03-17T01:55:00.000Z",
          },
        ],
      },
    });

    assert.equal(blockedDraft.success, true);
    assert.equal(blockedDraft.hardBlockers.some((message) => /reach KDEN in time/i.test(message)), true);

    const dispatchTab = await buildTabPayload(backend, saveId, "dispatch", renderers);
    assert.ok(dispatchTab?.dispatchPayload);
    const blockedAircraft = dispatchTab.dispatchPayload.aircraft.find((aircraft) => aircraft.registration === "N20DTB");
    assert.ok(blockedAircraft?.schedule?.validation);
    assert.equal(
      blockedAircraft.schedule.validation.validationMessages.some((message) => message.code === "staffing.named_pilot_gap"),
      true,
    );
  }
} finally {
  await harness.cleanup();
}
