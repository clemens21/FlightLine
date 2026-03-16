import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  createTestHarness,
  pickFlyableOffer,
  refreshContractBoard,
  saveAndCommitSchedule,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import { canAdvanceToLocalAnchor, loadClockPanelPayload, resolveCalendarAnchorUtc } from "../dist/ui/clock-calendar.js";

const harness = await createTestHarness("flightline-clock");
const { backend } = harness;

try {
  const saveId = uniqueSaveId("clock_panel");
  const startedAtUtc = await createCompanySave(backend, saveId, {
    startedAtUtc: "2026-03-16T13:00:00.000Z",
  });

  await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208CL" });
  await activateStaffingPackage(backend, saveId, startedAtUtc, {
    laborCategory: "pilot",
    qualificationGroup: "single_turboprop_utility",
    coverageUnits: 2,
    fixedCostAmount: 12_000,
  });
  await refreshContractBoard(backend, saveId, startedAtUtc);

  const [fleetState, board] = await Promise.all([
    backend.loadFleetState(saveId),
    backend.loadActiveContractBoard(saveId),
  ]);
  assert.ok(fleetState?.aircraft[0]);
  assert.ok(board);

  const selectedOffer = pickFlyableOffer(board, fleetState.aircraft[0], backend.getAirportReference());
  assert.ok(selectedOffer);

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
  const companyContractId = String(acceptResult.metadata?.companyContractId ?? "");
  assert.ok(companyContractId);

  await saveAndCommitSchedule(
    backend,
    saveId,
    startedAtUtc,
    fleetState.aircraft[0].aircraftId,
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

  await backend.withExistingSaveDatabase(saveId, async (context) => {
    const companyContext = await backend.loadCompanyContext(saveId);
    assert.ok(companyContext);

    context.saveDatabase.run(
      `UPDATE company_contract
       SET deadline_utc = $deadline_utc,
           earliest_start_utc = $earliest_start_utc
       WHERE company_contract_id = $company_contract_id`,
      {
        $deadline_utc: "2026-03-16T18:30:00.000Z",
        $earliest_start_utc: "2026-03-16T14:00:00.000Z",
        $company_contract_id: companyContractId,
      },
    );

    context.saveDatabase.run(
      `UPDATE recurring_obligation
       SET next_due_at_utc = $next_due_at_utc
       WHERE company_id = $company_id
         AND status = 'active'`,
      {
        $next_due_at_utc: "2026-03-16T20:00:00.000Z",
        $company_id: companyContext.companyId,
      },
    );

    context.saveDatabase.run(
      `INSERT INTO maintenance_task (
        maintenance_task_id,
        aircraft_id,
        maintenance_type,
        provider_source,
        planned_start_utc,
        planned_end_utc,
        actual_start_utc,
        actual_end_utc,
        cost_estimate_amount,
        actual_cost_amount,
        task_state
      ) VALUES (
        $maintenance_task_id,
        $aircraft_id,
        $maintenance_type,
        $provider_source,
        $planned_start_utc,
        $planned_end_utc,
        NULL,
        NULL,
        $cost_estimate_amount,
        NULL,
        $task_state
      )`,
      {
        $maintenance_task_id: "maintenance_clock_test",
        $aircraft_id: fleetState.aircraft[0].aircraftId,
        $maintenance_type: "inspection_a",
        $provider_source: "scheduled_shop",
        $planned_start_utc: "2026-03-16T17:00:00.000Z",
        $planned_end_utc: "2026-03-16T19:00:00.000Z",
        $cost_estimate_amount: 3500,
        $task_state: "planned",
      },
    );

    context.saveDatabase.run(
      `INSERT INTO maintenance_task (
        maintenance_task_id,
        aircraft_id,
        maintenance_type,
        provider_source,
        planned_start_utc,
        planned_end_utc,
        actual_start_utc,
        actual_end_utc,
        cost_estimate_amount,
        actual_cost_amount,
        task_state
      ) VALUES (
        $maintenance_task_id,
        $aircraft_id,
        $maintenance_type,
        $provider_source,
        $planned_start_utc,
        $planned_end_utc,
        NULL,
        NULL,
        $cost_estimate_amount,
        NULL,
        $task_state
      )`,
      {
        $maintenance_task_id: "maintenance_clock_next_day",
        $aircraft_id: fleetState.aircraft[0].aircraftId,
        $maintenance_type: "inspection_b",
        $provider_source: "scheduled_shop",
        $planned_start_utc: "2026-03-17T11:30:00.000Z",
        $planned_end_utc: "2026-03-17T13:30:00.000Z",
        $cost_estimate_amount: 4200,
        $task_state: "planned",
      },
    );

    await context.saveDatabase.persist();
  });

  const payload = await loadClockPanelPayload(backend, saveId);
  assert.ok(payload);
  assert.equal(payload.days.length, 42);
  assert.equal(payload.currentLocalDate, payload.selectedLocalDate);

  const selectedDay = payload.days.find((day) => day.localDate === payload.selectedLocalDate);
  assert.ok(selectedDay);
  assert.ok(selectedDay.eventCount >= 5);

  const agendaTitles = payload.agenda.map((event) => event.title);
  assert.equal(agendaTitles.includes("Contract Due"), true);
  assert.equal(agendaTitles.includes("Planned Departure"), true);
  assert.equal(agendaTitles.includes("Planned Arrival"), true);
  assert.equal(agendaTitles.includes("Maintenance Start"), true);
  assert.equal(agendaTitles.includes("Maintenance Complete"), true);
  assert.equal(agendaTitles.includes("Payment Due"), true);

  assert.equal(payload.agenda.some((event) => event.category === "contracts"), true);
  assert.equal(payload.agenda.some((event) => event.category === "dispatch"), true);
  assert.equal(payload.agenda.some((event) => event.category === "maintenance"), true);
  assert.equal(payload.agenda.some((event) => event.category === "finance"), true);
  assert.equal(payload.nextCriticalEvent?.title, "Contract Due");

  const tomorrowLocalDate = new Date(`${payload.currentLocalDate}T00:00:00Z`);
  tomorrowLocalDate.setUTCDate(tomorrowLocalDate.getUTCDate() + 1);
  const tomorrow = tomorrowLocalDate.toISOString().slice(0, 10);

  const anchorUtc = resolveCalendarAnchorUtc("2026-03-17", "06:00", payload.timeZone);
  assert.equal(anchorUtc, "2026-03-17T12:00:00.000Z");
  assert.equal(canAdvanceToLocalAnchor(payload.currentTimeUtc, payload.currentLocalDate, "06:00", payload.timeZone), false);
  assert.equal(canAdvanceToLocalAnchor(payload.currentTimeUtc, tomorrow, "06:00", payload.timeZone), true);

  const tomorrowPayload = await loadClockPanelPayload(backend, saveId, tomorrow);
  assert.ok(tomorrowPayload);
  assert.equal(tomorrowPayload.selectedLocalDate, tomorrow);
  assert.equal(tomorrowPayload.quickActions.simTo0600.enabled, true);
  assert.ok(tomorrowPayload.quickActions.simTo0600.warningCount >= 1);
  assert.equal(tomorrowPayload.quickActions.simTo0600.warningEvents.some((event) => event.title === "Maintenance Start"), true);
  assert.equal(tomorrowPayload.quickActions.simTo0600.warningEvents.some((event) => event.category === "maintenance"), true);
  assert.equal(tomorrowPayload.agenda.some((event) => event.title === "Maintenance Start"), true);
  assert.equal(tomorrowPayload.agenda.some((event) => event.title === "Maintenance Complete"), true);
  assert.equal(tomorrowPayload.days.find((day) => day.localDate === tomorrow)?.canSimTo0600, true);
}
finally {
  await harness.cleanup();
}
