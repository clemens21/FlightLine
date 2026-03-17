/*
 * Regression coverage for ui clock.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  pickFlyableOffer,
  refreshContractBoard,
  saveAndCommitSchedule,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import {
  allocatePort,
  createWorkspaceBackend,
  removeWorkspaceSave,
  startUiServer,
} from "./helpers/ui-testkit.mjs";
import {
  clickUi,
  launchBrowser,
  saveUrlPattern,
  waitForShellTitle,
} from "./helpers/playwright-ui-testkit.mjs";

const companySaveId = uniqueSaveId("ui_clock");
const displayName = `UI Clock ${companySaveId}`;

let server = null;
let browser = null;

async function openClock(page, { expectCalendar = true } = {}) {
  await clickUi(page.locator("[data-clock-menu] summary"));
  await page.waitForFunction(() => document.querySelector("[data-clock-menu]")?.open === true);
  if (expectCalendar) {
    await page.waitForFunction(() => document.querySelectorAll("[data-clock-day]").length === 42);
  } else {
    await page.waitForFunction(() => {
      const text = document.querySelector("[data-clock-panel]")?.textContent ?? "";
      return text.includes("Create a company before opening the clock and calendar.");
    });
  }
}

async function closeClockWithEscape(page) {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("[data-clock-menu]")?.open !== true);
}

try {
  const backend = await createWorkspaceBackend();
  try {
    const startedAtUtc = await createCompanySave(backend, companySaveId, {
      startedAtUtc: "2026-03-16T13:00:00.000Z",
      displayName,
      startingCashAmount: 6_500_000,
    });

    await acquireAircraft(backend, companySaveId, startedAtUtc, {
      registration: "N208CLK",
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    });
    await activateStaffingPackage(backend, companySaveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 2,
      fixedCostAmount: 12_000,
    });
    await refreshContractBoard(backend, companySaveId, startedAtUtc);

    const [fleetState, board] = await Promise.all([
      backend.loadFleetState(companySaveId),
      backend.loadActiveContractBoard(companySaveId),
    ]);
    assert.ok(fleetState?.aircraft[0]);
    assert.ok(board);

    const selectedOffer = pickFlyableOffer(board, fleetState.aircraft[0], backend.getAirportReference());
    assert.ok(selectedOffer);

    const acceptResult = await backend.dispatch({
      commandId: `cmd_${companySaveId}_accept`,
      saveId: companySaveId,
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
      companySaveId,
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

    await backend.withExistingSaveDatabase(companySaveId, async (context) => {
      const companyContext = await backend.loadCompanyContext(companySaveId);
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
          $maintenance_task_id: `task_${companySaveId}_today`,
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
          $maintenance_task_id: `task_${companySaveId}_tomorrow`,
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
  } finally {
    await backend.close();
  }

  const port = await allocatePort();
  server = await startUiServer(port);
  browser = await launchBrowser();
  const page = await browser.newPage();

  await page.goto(`${server.baseUrl}/save/${encodeURIComponent(companySaveId)}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(saveUrlPattern(companySaveId));
  await waitForShellTitle(page, displayName);
  await page.waitForFunction(() => {
    const label = document.querySelector("[data-clock-label]")?.textContent?.trim() ?? "";
    return label.length > 0 && label !== "Loading...";
  });

  const initialClockLabel = await page.locator("[data-clock-label]").textContent();
  assert.ok(initialClockLabel?.includes("Mar 16, 2026"));
  assert.equal(await page.locator("[data-clock-rate]").textContent(), "1x");

  await openClock(page);
  const initialClockPanelText = await page.locator("[data-clock-panel]").textContent();
  assert.ok(initialClockPanelText?.includes("Simulation Clock"));
  assert.ok(initialClockPanelText?.includes("Agenda"));
  assert.ok(initialClockPanelText?.includes("Payment Due"));
  assert.ok(initialClockPanelText?.includes("Planned Departure"));
  assert.ok(initialClockPanelText?.includes("Maintenance Start"));
  assert.equal(await page.locator("[data-clock-day]").count(), 42);
  assert.equal(await page.locator("[data-clock-day].today.selected").count(), 1);

  await clickUi(page.locator("[data-clock-day='2026-03-16']"));
  await page.waitForFunction(() => document.querySelector("[data-clock-day-action-close]"));
  assert.equal(await page.locator("[data-clock-sim-anchor-date]").isDisabled(), true);
  assert.ok((await page.locator("[data-clock-panel]").textContent())?.includes("already passed"));
  await clickUi(page.locator("[data-clock-day-action-close]"));
  await page.waitForFunction(() => !document.querySelector("[data-clock-day-action-close]"));

  await clickUi(page.locator("[data-clock-day='2026-03-17']"));
  await page.waitForFunction(() => document.querySelector("[data-clock-day-action-close]"));
  const futureActionText = await page.locator("[data-clock-panel]").textContent();
  assert.ok(futureActionText?.includes("Warning:"));
  assert.ok(futureActionText?.includes("Maintenance Start"));
  assert.ok((await page.locator(".clock-warning-item").count()) >= 1);
  assert.equal(await page.locator("[data-clock-sim-anchor-date]").isDisabled(), false);
  assert.ok((await page.locator("[data-clock-panel]").textContent())?.includes("Tue, March 17, 2026"));
  const beforeAnchorAdvance = await page.locator("[data-clock-label]").textContent();
  await clickUi(page.locator("[data-clock-sim-anchor-date]"));
  await page.waitForFunction((previousLabel) => {
    const nextLabel = document.querySelector("[data-clock-label]")?.textContent ?? "";
    return nextLabel !== "" && nextLabel !== previousLabel;
  }, beforeAnchorAdvance, { timeout: 15_000 });
  await page.waitForFunction(() => !document.querySelector("[data-clock-day-action-close]"));
  assert.equal(await page.locator("[data-clock-day-action-close]").count(), 0);
  const afterAnchorAdvance = await page.locator("[data-clock-label]").textContent();
  assert.notEqual(afterAnchorAdvance, beforeAnchorAdvance);
  assert.ok(afterAnchorAdvance?.includes("Mar 17, 2026"));

  const preTickLabel = await page.locator("[data-clock-label]").textContent();
  await clickUi(page.locator("[data-clock-rate-mode='60x']"));
  await page.waitForFunction(() => document.querySelector("[data-clock-rate]")?.textContent === "60x");
  await page.waitForFunction((previousLabel) => {
    const nextLabel = document.querySelector("[data-clock-label]")?.textContent ?? "";
    return nextLabel !== "" && nextLabel !== previousLabel;
  }, preTickLabel, { timeout: 15_000 });
  const advancedClockLabel = await page.locator("[data-clock-label]").textContent();
  assert.notEqual(advancedClockLabel, preTickLabel);
  assert.equal(await page.evaluate((saveId) => localStorage.getItem(`flightline-clock-rate:${encodeURIComponent(saveId)}`), companySaveId), "60x");

  await clickUi(page.locator("[data-clock-rate-mode='paused']"));
  await page.waitForFunction(() => document.querySelector("[data-clock-rate]")?.textContent === "Pause");
  const pausedLabel = await page.locator("[data-clock-label]").textContent();
  await page.waitForTimeout(2500);
  assert.equal(await page.locator("[data-clock-label]").textContent(), pausedLabel);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForURL(saveUrlPattern(companySaveId));
  await waitForShellTitle(page, displayName);
  await page.waitForFunction(() => document.querySelector("[data-clock-rate]")?.textContent === "Pause");
  assert.equal(await page.locator("[data-clock-rate]").textContent(), "Pause");

  await openClock(page);
  await closeClockWithEscape(page);
  await clickUi(page.locator("[data-settings-menu] summary"));
  await page.waitForFunction(() => document.querySelector("[data-settings-menu]")?.open === true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("[data-settings-menu]")?.open !== true);
} finally {
  await Promise.allSettled([
    browser?.close(),
    server?.stop(),
  ]);
  await Promise.allSettled([
    removeWorkspaceSave(companySaveId),
  ]);
}
