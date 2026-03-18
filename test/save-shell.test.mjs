/*
 * Regression coverage for save shell.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";

import {
  createCompanySave,
  createTestHarness,
  uniqueSaveId,
  acquireAircraft,
  activateStaffingPackage,
  dispatchOrThrow,
  saveAndCommitSchedule,
} from "./helpers/flightline-testkit.mjs";
import { buildBootstrapPayload, buildTabPayload, normalizeTab } from "../dist/ui/save-shell-fragments.js";
import { buildDispatchTabPayload } from "../dist/ui/dispatch-tab-model.js";

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

const harness = await createTestHarness("flightline-shell");
const { backend, airportReference } = harness;

try {
  assert.equal(normalizeTab("aircraft"), "aircraft");
  assert.equal(normalizeTab("bogus"), "dashboard");
  assert.equal(normalizeTab(undefined), "dashboard");

  {
    const saveId = uniqueSaveId("shell_empty");
    const startedAtUtc = "2026-03-16T13:00:00.000Z";
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

    const bootstrap = await buildBootstrapPayload(backend, saveId, "dashboard");
    assert.ok(bootstrap);
    assert.equal(bootstrap.shell.hasCompany, false);
    assert.equal(bootstrap.shell.title, `Save ${saveId}`);
    assert.equal(bootstrap.shell.tabCounts.dashboard, "setup");

    const aircraftTab = await buildTabPayload(backend, saveId, "aircraft", renderers);
    assert.ok(aircraftTab);
    assert.equal(aircraftTab.contentHtml, "<div>create-company</div>");
    assert.equal(aircraftTab.aircraftPayload ?? null, null);
  }

  {
    const saveId = uniqueSaveId("shell_live");
    const startedAtUtc = await createCompanySave(backend, saveId);
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208SH" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 2,
      fixedCostAmount: 12_000,
    });
    const staffingState = await backend.loadStaffingState(saveId);
    assert.ok(staffingState);
    assert.equal(staffingState.namedPilots.length, 2);

    const bootstrap = await buildBootstrapPayload(backend, saveId, "dashboard");
    assert.ok(bootstrap);
    assert.equal(bootstrap.shell.hasCompany, true);
    assert.equal(bootstrap.shell.saveId, saveId);
    assert.equal(bootstrap.shell.tabCounts.aircraft, "1/1");
    assert.equal(bootstrap.shell.tabCounts.staffing, "2");
    assert.equal(bootstrap.shell.metrics.some((metric) => metric.label === "Fleet" && metric.value === "1/1"), true);

    const aircraftTab = await buildTabPayload(backend, saveId, "aircraft", renderers);
    assert.ok(aircraftTab);
    assert.equal(aircraftTab.tabId, "aircraft");
    assert.equal(aircraftTab.contentHtml.includes("data-aircraft-tab-host"), true);
    assert.ok(aircraftTab.aircraftPayload);
    assert.equal(aircraftTab.aircraftPayload.aircraft.length, 1);
    assert.equal(aircraftTab.aircraftPayload.summaryCards.length, 4);

    const contractsTab = await buildTabPayload(backend, saveId, "contracts", renderers);
    assert.ok(contractsTab);
    assert.equal(contractsTab.tabId, "contracts");
    assert.ok(contractsTab.contractsPayload);
    assert.equal(contractsTab.contentHtml.includes("data-contracts-host"), true);

    const dispatchTab = await buildTabPayload(backend, saveId, "dispatch", renderers);
    assert.ok(dispatchTab);
    assert.equal(dispatchTab.tabId, "dispatch");
    assert.equal(dispatchTab.contentHtml, "<div>dispatch</div>");
    assert.equal(dispatchTab.aircraftPayload ?? null, null);
    assert.ok(dispatchTab.dispatchPayload);
    assert.equal(dispatchTab.dispatchPayload.aircraft.length, 1);
  }

  {
    const saveId = uniqueSaveId("shell_dispatch_schedule_priority");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208DP" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 2,
      fixedCostAmount: 12_000,
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    const aircraft = fleetState.aircraft.find((entry) => entry.registration === "N208DP");
    assert.ok(aircraft);
    const companyContext = await backend.loadCompanyContext(saveId);
    const staffingState = await backend.loadStaffingState(saveId);
    assert.ok(companyContext);

    const schedules = [
      {
        scheduleId: "schedule_current",
        aircraftId: aircraft.aircraftId,
        scheduleKind: "operational",
        scheduleState: "committed",
        isDraft: false,
        plannedStartUtc: "2026-03-16T16:00:00.000Z",
        plannedEndUtc: "2026-03-16T17:10:00.000Z",
        validationSnapshot: undefined,
        createdAtUtc: "2026-03-16T12:00:00.000Z",
        updatedAtUtc: "2026-03-16T12:05:00.000Z",
        legs: [
          {
            flightLegId: "leg_current",
            sequenceNumber: 1,
            legType: "reposition",
            linkedCompanyContractId: undefined,
            originAirportId: "KDEN",
            destinationAirportId: "KCOS",
            plannedDepartureUtc: "2026-03-16T16:00:00.000Z",
            plannedArrivalUtc: "2026-03-16T17:10:00.000Z",
            actualDepartureUtc: undefined,
            actualArrivalUtc: undefined,
            legState: "planned",
            assignedQualificationGroup: "single_turboprop_utility",
            payloadSnapshot: undefined,
          },
        ],
        laborAllocations: [],
      },
      {
        scheduleId: "schedule_next",
        aircraftId: aircraft.aircraftId,
        scheduleKind: "operational",
        scheduleState: "committed",
        isDraft: false,
        plannedStartUtc: "2026-03-16T19:00:00.000Z",
        plannedEndUtc: "2026-03-16T20:10:00.000Z",
        validationSnapshot: undefined,
        createdAtUtc: "2026-03-16T12:10:00.000Z",
        updatedAtUtc: "2026-03-16T12:15:00.000Z",
        legs: [
          {
            flightLegId: "leg_next",
            sequenceNumber: 1,
            legType: "reposition",
            linkedCompanyContractId: undefined,
            originAirportId: "KCOS",
            destinationAirportId: "KDEN",
            plannedDepartureUtc: "2026-03-16T19:00:00.000Z",
            plannedArrivalUtc: "2026-03-16T20:10:00.000Z",
            actualDepartureUtc: undefined,
            actualArrivalUtc: undefined,
            legState: "planned",
            assignedQualificationGroup: "single_turboprop_utility",
            payloadSnapshot: undefined,
          },
        ],
        laborAllocations: [],
      },
    ];

    const currentPayload = buildDispatchTabPayload({
      saveId,
      companyContext: {
        ...companyContext,
        currentTimeUtc: "2026-03-16T16:30:00.000Z",
      },
      companyContracts: null,
      fleetState,
      staffingState,
      schedules,
      routePlan: null,
      airportReference,
    });
    assert.equal(currentPayload.aircraft.length, 1);
    assert.equal(currentPayload.aircraft[0]?.schedule?.scheduleId, "schedule_current");

    const nextPayload = buildDispatchTabPayload({
      saveId,
      companyContext: {
        ...companyContext,
        currentTimeUtc: "2026-03-16T18:00:00.000Z",
      },
      companyContracts: null,
      fleetState,
      staffingState,
      schedules,
      routePlan: null,
      airportReference,
    });
    assert.equal(nextPayload.aircraft.length, 1);
    assert.equal(nextPayload.aircraft[0]?.schedule?.scheduleId, "schedule_next");
  }

  {
    const saveId = uniqueSaveId("shell_named_pilot_visibility");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208NP" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 2,
      fixedCostAmount: 12_000,
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    const aircraft = fleetState.aircraft.find((entry) => entry.registration === "N208NP");
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
          plannedDepartureUtc: "2026-03-16T15:00:00.000Z",
          plannedArrivalUtc: "2026-03-16T16:10:00.000Z",
        },
      ],
    );

    const dispatchTab = await buildTabPayload(backend, saveId, "dispatch", renderers);
    assert.ok(dispatchTab?.dispatchPayload);
    const committedAircraft = dispatchTab.dispatchPayload.aircraft.find((entry) => entry.registration === "N208NP");
    assert.ok(committedAircraft);
    assert.equal(committedAircraft.assignedPilots.length, 1);
    assert.equal(typeof committedAircraft.assignedPilots[0]?.displayName, "string");
    assert.equal(committedAircraft.assignedPilots[0]?.availabilityState, "reserved");
    assert.equal(committedAircraft.pilotReadiness.readyNowCount, 1);
    assert.equal(committedAircraft.pilotReadiness.assignedPilotCount, 1);
  }

  {
    const saveId = uniqueSaveId("shell_named_pilot_preview_warning");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      startingCashAmount: 50_000_000,
    });
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208PW" });
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N20DPW" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 2,
      fixedCostAmount: 12_000,
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    const leadAircraft = fleetState.aircraft.find((entry) => entry.registration === "N208PW");
    const draftAircraft = fleetState.aircraft.find((entry) => entry.registration === "N20DPW");
    assert.ok(leadAircraft);
    assert.ok(draftAircraft);

    await saveAndCommitSchedule(
      backend,
      saveId,
      startedAtUtc,
      leadAircraft.aircraftId,
      [
        {
          legType: "reposition",
          originAirportId: "KDEN",
          destinationAirportId: "KCOS",
          plannedDepartureUtc: "2026-03-16T15:00:00.000Z",
          plannedArrivalUtc: "2026-03-16T16:10:00.000Z",
        },
      ],
    );

    await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_draft_warning`,
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftId: draftAircraft.aircraftId,
        scheduleKind: "operational",
        legs: [
          {
            legType: "reposition",
            originAirportId: "KDEN",
            destinationAirportId: "KCOS",
            plannedDepartureUtc: "2026-03-16T15:30:00.000Z",
            plannedArrivalUtc: "2026-03-16T16:40:00.000Z",
          },
        ],
      },
    });

    const dispatchTab = await buildTabPayload(backend, saveId, "dispatch", renderers);
    assert.ok(dispatchTab?.dispatchPayload);
    const warningAircraft = dispatchTab.dispatchPayload.aircraft.find((entry) => entry.registration === "N20DPW");
    assert.ok(warningAircraft?.schedule?.validation);
    assert.equal(warningAircraft.schedule.validation.isCommittable, true);
    assert.equal(
      warningAircraft.schedule.validation.validationMessages.some((message) => message.code === "staffing.named_pilot_last_ready"),
      true,
    );
  }

  {
    const saveId = uniqueSaveId("shell_named_pilot_preview_blocker");
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      startingCashAmount: 50_000_000,
    });
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208PB" });
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N20DPB" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 12_000,
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    const aircraftA = fleetState.aircraft.find((entry) => entry.registration === "N208PB");
    const aircraftB = fleetState.aircraft.find((entry) => entry.registration === "N20DPB");
    assert.ok(aircraftA);
    assert.ok(aircraftB);

    await saveAndCommitSchedule(
      backend,
      saveId,
      startedAtUtc,
      aircraftA.aircraftId,
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
      commandId: `cmd_${saveId}_advance_rest_gap`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: "2026-03-16T15:00:00.000Z",
      },
    });

    const blockedDraft = await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_draft_blocked`,
      saveId,
      commandName: "SaveScheduleDraft",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        aircraftId: aircraftB.aircraftId,
        scheduleKind: "operational",
        legs: [
          {
            legType: "reposition",
            originAirportId: "KDEN",
            destinationAirportId: "KCOS",
            plannedDepartureUtc: "2026-03-16T16:00:00.000Z",
            plannedArrivalUtc: "2026-03-16T17:10:00.000Z",
          },
        ],
      },
    });
    assert.equal(
      blockedDraft.hardBlockers.some((message) => message.includes("Not enough named pilots are currently available")),
      true,
    );

    const dispatchTab = await buildTabPayload(backend, saveId, "dispatch", renderers);
    assert.ok(dispatchTab?.dispatchPayload);
    const blockedAircraft = dispatchTab.dispatchPayload.aircraft.find((entry) => entry.registration === "N20DPB");
    assert.ok(blockedAircraft?.schedule?.validation);
    assert.equal(blockedAircraft.schedule.validation.isCommittable, false);
    assert.equal(
      blockedAircraft.schedule.validation.validationMessages.some((message) => message.code === "staffing.named_pilot_gap"),
      true,
    );
  }
} finally {
  await harness.cleanup();
}
