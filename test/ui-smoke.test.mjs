/*
 * Regression coverage for ui smoke.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
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
  waitForShellTitle,
} from "./helpers/playwright-ui-testkit.mjs";

const saveId = uniqueSaveId("ui_smoke");
const displayName = `UI Smoke ${saveId}`;
let server = null;
let browser = null;

try {
  const backend = await createWorkspaceBackend();
  try {
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T13:00:00.000Z",
      displayName,
      startingCashAmount: 6_500_000,
    });

    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N208UI",
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N20CUI",
      aircraftModelId: "cessna_208b_grand_caravan_ex_cargo",
    });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 2,
      fixedCostAmount: 12_000,
    });

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

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    assert.equal(fleetState.aircraft.length, 2);

    const leadAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N208UI");
    const constrainedAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N20CUI");
    assert.ok(leadAircraft);
    assert.ok(constrainedAircraft);

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

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      const companyContext = await backend.loadCompanyContext(saveId);
      assert.ok(companyContext);

      context.saveDatabase.run(
        `UPDATE company_aircraft
         SET status_input = $status_input,
             dispatch_available = $dispatch_available
         WHERE aircraft_id = $aircraft_id`,
        {
          $status_input: "grounded",
          $dispatch_available: 0,
          $aircraft_id: constrainedAircraft.aircraftId,
        },
      );

      context.saveDatabase.run(
        `UPDATE maintenance_program_state
         SET condition_band_input = $condition_band_input,
             hours_since_inspection = $hours_since_inspection,
             cycles_since_inspection = $cycles_since_inspection,
             hours_to_service = $hours_to_service,
             maintenance_state_input = $maintenance_state_input,
             aog_flag = $aog_flag
         WHERE aircraft_id = $aircraft_id`,
        {
          $condition_band_input: "poor",
          $hours_since_inspection: 210,
          $cycles_since_inspection: 38,
          $hours_to_service: -6.5,
          $maintenance_state_input: "aog",
          $aog_flag: 1,
          $aircraft_id: constrainedAircraft.aircraftId,
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
          $maintenance_task_id: `task_${saveId}`,
          $aircraft_id: constrainedAircraft.aircraftId,
          $maintenance_type: "inspection_a",
          $provider_source: "scheduled_shop",
          $planned_start_utc: "2026-03-16T17:00:00.000Z",
          $planned_end_utc: "2026-03-16T19:00:00.000Z",
          $cost_estimate_amount: 3500,
          $task_state: "planned",
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

      await context.saveDatabase.persist();
    });
  } finally {
    await backend.close();
  }

  const port = await allocatePort();
  server = await startUiServer(port);
  browser = await launchBrowser();
  const page = await browser.newPage();

  await page.goto(`${server.baseUrl}/open-save/${encodeURIComponent(saveId)}?tab=contracts`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(new RegExp(`/save/${saveId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  await waitForShellTitle(page, displayName);

  assert.equal(await page.locator("[data-shell-title]").textContent(), displayName);

  await page.waitForFunction(() => document.querySelectorAll(".contracts-board-table tbody tr").length > 0);
  assert.ok((await page.locator(".contracts-board-table tbody tr").count()) > 0);

  await clickUi(page.locator("[data-plan-add-offer]").first());
  await page.waitForFunction(() => document.body.innerText.includes("1 item | endpoint"));
  assert.equal((await page.locator(".contracts-planner-panel").textContent())?.includes("1 item | endpoint"), true);

  await clickUi(page.locator("[data-plan-review-open]"));
  await page.waitForFunction(() => document.querySelectorAll("[data-plan-review-select]").length > 0);
  await clickUi(page.locator("[data-plan-accept-selected]"));
  await page.waitForFunction(() => document.body.innerText.includes("Accepted 1 planned offer"));
  await clickUi(page.locator("[data-board-tab='active']"));
  await page.waitForFunction(() => document.body.innerText.includes("accepted / active contracts"));
  assert.ok((await page.locator(".contracts-board-table tbody tr").count()) >= 1);

  await clickUi(page.locator("[data-shell-tab='aircraft']"));
  await page.waitForFunction(() => document.querySelectorAll(".aircraft-row-button").length === 2);
  await clickUi(page.locator(".aircraft-row-button").filter({ hasText: "N20CUI" }).first());
  await page.waitForFunction(() => document.querySelector(".aircraft-detail-panel")?.textContent?.includes("N20CUI"));
  assert.equal((await page.locator(".aircraft-detail-panel").textContent())?.includes("N20CUI"), true);
  assert.equal((await page.locator(".aircraft-detail-panel").textContent())?.toLowerCase().includes("grounded"), true);

  await page.locator(".aircraft-toolbar select").nth(1).selectOption("critical");
  await page.waitForFunction(() => document.querySelectorAll(".aircraft-row-button").length === 1);
  assert.equal(await page.locator(".aircraft-row-button").count(), 1);
  assert.equal((await page.locator(".aircraft-detail-panel").textContent())?.includes("N20CUI"), true);

  await clickUi(page.locator("[data-clock-menu] summary"));
  await page.waitForFunction(() => document.querySelectorAll("[data-clock-day]").length === 42);
  const clockPanelText = await page.locator("[data-clock-panel]").textContent();
  assert.ok(clockPanelText?.includes("Agenda"));
  assert.ok(clockPanelText?.includes("Payment Due"));
  assert.ok(clockPanelText?.includes("Planned Departure"));
} finally {
  await Promise.allSettled([
    browser?.close(),
    server?.stop(),
  ]);
  await removeWorkspaceSave(saveId);
}


