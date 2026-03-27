/*
 * Regression coverage for ui smoke.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";

import { addAcceptedContractToRoutePlan } from "../dist/ui/route-plan-state.js";
import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  dispatchOrThrow,
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

async function forceButtonSubmit(page, selector) {
  await page.locator(selector).evaluate((element, buttonSelector) => {
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error(`Expected ${buttonSelector} to resolve to a button.`);
    }

    element.disabled = false;
    element.click();
  }, selector);
}

try {
  const backend = await createWorkspaceBackend();
  try {
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T13:00:00.000Z",
      displayName,
      startingCashAmount: 500_000_000,
    });

    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N208UI",
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N20CUI",
      aircraftModelId: "cessna_208b_grand_caravan_ex_cargo",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N20DUI",
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 3,
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
    assert.equal(fleetState.aircraft.length, 3);

    const leadAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N208UI");
    const constrainedAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N20CUI");
    const draftAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N20DUI");
    assert.ok(leadAircraft);
    assert.ok(constrainedAircraft);
    assert.ok(draftAircraft);

    const board = await backend.loadActiveContractBoard(saveId);
    assert.ok(board);
    const seededOffers = board.offers.filter((offer) => offer.offerStatus === "available").slice(0, 2);
    assert.equal(seededOffers.length, 2);

    const seededAcceptedContractIds = [];
    for (const [index, offer] of seededOffers.entries()) {
      const accepted = await dispatchOrThrow(backend, {
        commandId: `cmd_${saveId}_seed_accept_${index}`,
        saveId,
        commandName: "AcceptContractOffer",
        issuedAtUtc: startedAtUtc,
        actorType: "player",
        payload: {
          contractOfferId: offer.contractOfferId,
        },
      });
      seededAcceptedContractIds.push(String(accepted.metadata?.companyContractId ?? ""));
    }

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      for (const companyContractId of seededAcceptedContractIds) {
        const mutation = addAcceptedContractToRoutePlan(context.saveDatabase, saveId, companyContractId);
        assert.equal(mutation.success, true);
      }
      await context.saveDatabase.persist();
    });

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
        {
          legType: "reposition",
          originAirportId: "KCOS",
          destinationAirportId: "KDEN",
          plannedDepartureUtc: "2026-03-16T17:00:00.000Z",
          plannedArrivalUtc: "2026-03-16T18:10:00.000Z",
        },
      ],
    );

    const draftResult = await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_draft_${draftAircraft.aircraftId}`,
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
          {
            legType: "reposition",
            originAirportId: "KCOS",
            destinationAirportId: "KDEN",
            plannedDepartureUtc: "2026-03-16T17:25:00.000Z",
            plannedArrivalUtc: "2026-03-16T18:35:00.000Z",
          },
        ],
      },
    });
    assert.equal(draftResult.hardBlockers.length, 0);

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

  await page.goto(`${server.baseUrl}/save/${encodeURIComponent(saveId)}?tab=dispatch`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === `/save/${saveId}` && url.searchParams.get("tab") === "dispatch");
  await waitForShellTitle(page, displayName);

  assert.equal(await page.locator("[data-shell-title]").textContent(), displayName);
  assert.equal(await page.evaluate(() => new URL(window.location.href).searchParams.get("tab")), "dispatch");

  await clickUi(page.locator("[data-shell-open-finance]"));
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get("tab") === null);
  await page.waitForFunction(() => document.querySelector("[data-overview-finance-section]")?.textContent?.includes("Finance outlook"));
  await page.waitForFunction(() => document.activeElement?.hasAttribute("data-overview-finance-section"));
  assert.equal(await page.locator("[data-overview-finance-section]").isVisible(), true);
  assert.equal(await page.locator("[data-overview-finance-graph]").isVisible(), true);
  await clickUi(page.locator("[data-finance-horizon='8w']").first());
  await page.waitForFunction(() => document.querySelector("[data-finance-horizon='8w']")?.classList.contains("current"));
  assert.equal(await page.evaluate((save) => {
    const raw = localStorage.getItem(`flightline-overview-finance:${encodeURIComponent(save)}`);
    return raw ? JSON.parse(raw).horizonId : null;
  }, saveId), "8w");

  await clickUi(page.locator("[data-shell-tab='dispatch']"));
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get("tab") === "dispatch");
  await page.waitForFunction(() => document.querySelectorAll("[data-dispatch-aircraft-card]").length === 3);
  await clickUi(page.locator("[data-shell-tab='dashboard']"));
  await page.waitForFunction(() => document.querySelector("[data-overview-finance-section]")?.textContent?.includes("Finance outlook"));
  await page.waitForFunction(() => document.querySelector("[data-finance-horizon='8w']")?.classList.contains("current"));
  await clickUi(page.locator("[data-finance-reset='1']").first());
  await page.waitForFunction(() => document.querySelector("[data-finance-horizon='4w']")?.classList.contains("current"));
  await clickUi(page.locator("[data-shell-tab='dispatch']"));
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get("tab") === "dispatch");
  await page.waitForFunction(() => document.querySelectorAll("[data-dispatch-aircraft-card]").length === 3);

  await clickUi(page.locator("[data-settings-menu] summary"));
  await page.waitForFunction(() => {
    const settings = document.querySelector("[data-settings-menu]");
    return settings instanceof HTMLDetailsElement && settings.open;
  });
  await clickUi(page.locator("[data-settings-open-help]"));
  await page.waitForFunction(() => {
    const help = document.querySelector("[data-help-center]");
    const settings = document.querySelector("[data-settings-menu]");
    return help instanceof HTMLElement
      && !help.hidden
      && settings instanceof HTMLDetailsElement
      && !settings.open
      && help.textContent?.includes("Help Home")
      && help.textContent?.includes("Do This Next")
      && help.textContent?.includes("Why Am I Blocked?")
      && help.textContent?.includes("Key Concepts");
  });
  await clickUi(page.locator("[data-help-section-tab='blocked']"));
  await page.waitForFunction(() => {
    const panel = document.querySelector("[data-help-section-panel='blocked']");
    return panel instanceof HTMLElement && !panel.hidden;
  });
  await clickUi(page.locator("[data-help-section-panel='blocked'] [data-help-topic-button='i-cannot-dispatch-this-contract']").first());
  await page.waitForFunction(() => {
    const article = document.querySelector("[data-help-topic-panel='i-cannot-dispatch-this-contract']");
    return article instanceof HTMLElement
      && !article.hidden
      && article.textContent?.includes("Dispatch validation");
  });
  await clickUi(page.locator("[data-help-close]").first());
  await page.waitForFunction(() => {
    const help = document.querySelector("[data-help-center]");
    return help instanceof HTMLElement && help.hidden;
  });
  assert.equal(await page.evaluate(() => new URL(window.location.href).searchParams.get("tab")), "dispatch");

  await page.waitForFunction(() => document.querySelectorAll("[data-dispatch-aircraft-card]").length === 3);
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-aircraft]")?.textContent?.includes("N20DUI"));
  assert.equal((await page.locator("[data-dispatch-input-lane]").textContent())?.includes("Advance time"), true);
  assert.equal((await page.locator("[data-dispatch-commit-button]").textContent())?.includes("Commit draft"), true);
  assert.equal(await page.locator("[data-dispatch-commit-button]").isEnabled(), true);
  await clickUi(page.locator("[data-dispatch-aircraft-card]").filter({ hasText: "N208UI" }).first());
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-aircraft]")?.textContent?.includes("N208UI"));
  await page.waitForFunction(() => document.querySelectorAll("[data-dispatch-assigned-pilot]").length === 1);
  assert.equal((await page.locator("[data-dispatch-assigned-pilots]").textContent())?.includes("Reserved until"), true);
  assert.equal((await page.locator("[data-dispatch-pilot-assignment-summary]").textContent())?.includes("named pilots"), true);
  const committedRecoveryText = (await page.locator("[data-dispatch-readiness-recovery]").textContent()) ?? "";
  assert.equal(committedRecoveryText.length > 0, true);
  assert.equal(committedRecoveryText.includes("Stage a draft to evaluate dispatch readiness."), false);
  assert.equal(await page.locator("[data-dispatch-calendar-reflection]").isVisible(), true);
  assert.equal((await page.locator("[data-dispatch-calendar-reflection]").textContent())?.includes("Clock & Calendar already shows N208UI as occupied"), true);
  assert.equal(await page.locator("[data-dispatch-discard-draft]").count(), 0);
  await clickUi(page.locator("[data-dispatch-aircraft-card]").filter({ hasText: "N20DUI" }).first());
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-aircraft]")?.textContent?.includes("N20DUI"));
  assert.equal((await page.locator("[data-dispatch-draft-status]").textContent())?.includes("Discard it if you want a clean planning lane first."), true);
  assert.equal(await page.locator("[data-dispatch-discard-draft]").isVisible(), true);
  assert.equal(await page.locator("[data-dispatch-calendar-reflection]").count(), 0);
  await clickUi(page.locator("[data-dispatch-leg-select]").nth(1));
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-leg-detail]")?.textContent?.includes("KCOS -> KDEN"));

  await clickUi(page.locator("[data-shell-tab='contracts']"));
  await page.waitForFunction(() => document.querySelectorAll(".contracts-workspace-tab[data-workspace-tab='board']").length === 1);
  await page.waitForFunction(() => document.querySelectorAll(".contracts-workspace-tab[data-workspace-tab='planning']").length === 1);
  await page.waitForFunction(() => document.querySelectorAll(".contracts-board-table tbody tr").length > 0);
  assert.equal(await page.locator(".contracts-workspace-tab[data-workspace-tab='board']").getAttribute("aria-selected"), "true");
  assert.equal(await page.locator(".contracts-workspace-tab[data-workspace-tab='planning']").getAttribute("aria-selected"), "false");
  assert.equal(await page.locator("[data-plan-add-offer]").count(), 0);
  assert.ok((await page.locator(".contracts-board-table tbody tr").count()) > 0);
  assert.equal(await page.locator(".contracts-main-body > .contracts-filters").count(), 0);
  assert.ok((await page.locator("[data-contracts-board-popover-toggle]").count()) >= 4);
  const contractsBoardTable = page.locator(".contracts-board-table").first();
  const contractsHeaderText = (await contractsBoardTable.locator("thead").textContent()) ?? "";
  assert.equal(/\bSORT\b|\bASC\b|\bDESC\b/.test(contractsHeaderText), false);
  const contractsRouteHeaderStyle = await contractsBoardTable.locator("button[aria-label='Route search']").first().evaluate((button) => {
    const headerControl = button.closest(".table-header-control");
    const label = headerControl?.querySelector(".table-header-label, .table-sort");
    return label instanceof HTMLElement
      ? {
          textTransform: window.getComputedStyle(label).textTransform,
          fontSize: window.getComputedStyle(label).fontSize,
        }
      : null;
  });
  assert.ok(contractsRouteHeaderStyle);
  assert.equal(contractsRouteHeaderStyle.textTransform, "none");
  assert.equal(contractsRouteHeaderStyle.fontSize, "13px");
  const contractsPopoverToggleColumns = await contractsBoardTable.locator("[data-contracts-board-popover-toggle]").evaluateAll((elements) => {
    return elements.map((element) => ({
      column: element.getAttribute("data-contracts-board-popover-toggle") ?? "",
      label: element.getAttribute("aria-label") ?? "",
    }));
  });
  for (const { column, label } of contractsPopoverToggleColumns) {
    const buttonLocator = contractsBoardTable.locator(`button[aria-label="${label}"]`).first();
    await clickUi(buttonLocator.locator("svg").first());
    await page.waitForFunction(([expectedColumn, expectedLabel]) => {
      const popover = document.querySelector(`[data-contracts-board-popover="${expectedColumn}"]`);
      const toggle = document.querySelector(`button[aria-label="${expectedLabel}"]`);
      return popover instanceof HTMLElement
        && !popover.hidden
        && toggle instanceof HTMLElement
        && toggle.getAttribute("aria-expanded") === "true";
    }, [column, label]);
    await clickUi(buttonLocator.locator("svg").first());
    await page.waitForFunction((expectedLabel) => {
      const toggle = document.querySelector(`button[aria-label="${expectedLabel}"]`);
      return toggle instanceof HTMLElement
        && toggle.getAttribute("aria-expanded") === "false";
    }, label);
  }
  await clickUi(contractsBoardTable.locator("button[aria-label='Payout filter']").first().locator("svg"));
  await page.waitForFunction(() => document.querySelector("[data-contracts-board-popover='payout']") instanceof HTMLElement
    && !(document.querySelector("[data-contracts-board-popover='payout']")).hidden);
  const payoutPopoverBounds = await page.locator("[data-contracts-board-popover='payout']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
    };
  });
  assert.ok(payoutPopoverBounds);
  await clickUi(contractsBoardTable.locator("button[aria-label='Payout filter']").first().locator("svg"));
  await page.waitForFunction(() => document.querySelector("button[aria-label='Payout filter']")?.getAttribute("aria-expanded") === "false");
  const baselineContractRows = await page.locator(".contracts-board-table tbody tr").count();
  const firstRouteCellText = (await page.locator(".contracts-board-table tbody tr").first().locator("td").first().textContent()) ?? "";
  const firstRouteCode = firstRouteCellText.match(/\b[A-Z]{3,4}\b/)?.[0] ?? "";
  assert.ok(firstRouteCode.length > 0);
  await clickUi(page.locator("button[aria-label='Route search']").first().locator("svg"));
  await page.waitForFunction(() => document.querySelector("[data-contracts-board-popover='route']") instanceof HTMLElement && !(document.querySelector("[data-contracts-board-popover='route']")).hidden);
  await page.locator("[data-contracts-board-popover='route'] input[name='searchText']").fill(firstRouteCode);
  await page.waitForFunction(([expectedCode, expectedCount]) => {
    const rows = [...document.querySelectorAll(".contracts-board-table tbody tr")];
    return rows.length > 0 && rows.length <= expectedCount
      && rows.every((row) => (row.textContent ?? "").includes(expectedCode));
  }, [firstRouteCode, baselineContractRows]);
  await clickUi(page.locator("[data-contracts-board-popover='route'] [data-contracts-board-clear='route']"));
  await page.waitForFunction((expectedCount) => document.querySelectorAll(".contracts-board-table tbody tr").length === expectedCount, baselineContractRows);
  await clickUi(page.locator("button[aria-label='Route search']").first().locator("svg"));
  await page.waitForFunction(() => document.querySelector("button[aria-label='Route search']")?.getAttribute("aria-expanded") === "false");

  await clickUi(page.locator("[data-accept-offer]").first());
  await page.waitForFunction(() => document.querySelector(".contracts-next-step")?.textContent?.includes("Accept and dispatch"));
  assert.equal(await page.locator(".contracts-next-step [data-next-step-dispatch]").count(), 1);
  assert.equal((await page.locator(".contracts-next-step").textContent())?.includes("Accept and dispatch"), true);
  assert.equal(await page.locator(".contracts-workspace-tab[data-workspace-tab='board']").getAttribute("aria-selected"), "true");
  assert.equal(await page.locator(".contracts-workspace-tab[data-workspace-tab='planning']").getAttribute("aria-selected"), "false");
  assert.equal(await page.locator("[data-plan-add-offer]").count(), 0);
  await clickUi(page.locator(".contracts-next-step [data-open-route-plan]"));
  await page.waitForFunction(() => document.querySelector(".contracts-workspace-tab[data-workspace-tab='planning'][aria-selected='true']"));
  await page.waitForFunction(() => document.body.innerText.includes("Route Planning"));
  assert.equal(await page.locator(".contracts-planner-panel").count(), 1);
  assert.match((await page.locator(".contracts-planner-panel").textContent()) ?? "", /item[s]? \| endpoint/);
  await clickUi(page.locator(".contracts-workspace-tab[data-workspace-tab='board']"));
  await page.waitForFunction(() => document.querySelector(".contracts-workspace-tab[data-workspace-tab='board'][aria-selected='true']"));
  await clickUi(page.locator("[data-board-tab='active']"));
  await page.waitForFunction(() => document.body.innerText.includes("accepted / active contracts"));
  await page.goto(`${server.baseUrl}/save/${encodeURIComponent(saveId)}?tab=contracts&contractsView=my_contracts`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector(".contracts-board-tab[data-board-scope='my_contracts'][aria-selected='true']"));
  assert.equal(await page.locator(".contracts-board-tab[data-board-scope='my_contracts']").getAttribute("aria-selected"), "true");
  assert.equal((await page.locator(".contracts-toolbar").textContent())?.includes("at-risk / overdue contracts"), true);
  assert.equal((await page.locator(".contracts-board-tabs.compact").textContent())?.includes("My Contracts"), true);

  await clickUi(page.locator("[data-shell-tab='dispatch']"));
  await page.waitForFunction(() => document.querySelectorAll("[data-dispatch-aircraft-card]").length === 3);
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-aircraft]")?.textContent?.includes("N20DUI"));
  assert.equal((await page.locator("[data-dispatch-input-lane]").textContent())?.includes("Dispatch Source"), true);
  assert.equal((await page.locator("[data-dispatch-input-lane]").textContent())?.includes("Accepted Contracts"), true);
  assert.equal((await page.locator("[data-dispatch-input-lane]").textContent())?.includes("Planned Routes"), true);
  assert.equal(await page.locator("[data-dispatch-input-lane] [data-dispatch-source-mode='accepted_contracts'][role='tab']").isVisible(), true);
  assert.equal(await page.locator("[data-dispatch-input-lane] [data-dispatch-source-mode='planned_routes'][role='tab']").isVisible(), true);
  assert.equal(await page.locator("[data-dispatch-selected-work]").isVisible(), true);
  assert.equal((await page.locator("[data-dispatch-draft-status]").textContent())?.includes("Current draft staged"), true);
  assert.equal(await page.locator("[data-dispatch-discard-draft]").isVisible(), true);
  assert.equal((await page.locator("[data-dispatch-commit-button]").textContent())?.includes("Commit draft"), true);
  assert.equal(await page.locator("[data-dispatch-commit-button]").isEnabled(), true);
  assert.equal((await page.locator("[data-dispatch-selected-work]").textContent())?.includes("Use Discard draft first"), true);
  await clickUi(page.locator("[data-dispatch-aircraft-card]").filter({ hasText: "N208UI" }).first());
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-aircraft]")?.textContent?.includes("N208UI"));
  await page.waitForFunction(() => document.querySelector("[data-dispatch-calendar-reflection]")?.textContent?.includes("Clock & Calendar"));
  assert.equal((await page.locator("[data-dispatch-calendar-reflection]").textContent())?.includes("Clock & Calendar"), true);

  await clickUi(page.locator("[data-dispatch-aircraft-card]").filter({ hasText: "N20CUI" }).first());
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-aircraft]")?.textContent?.includes("N20CUI"));
  assert.equal((await page.locator("[data-dispatch-commit-button]").textContent())?.includes("No draft to commit"), true);
  await page.waitForFunction(() => document.querySelector("[data-dispatch-validation-rail]")?.textContent?.includes("Readiness Checklist"));
  const readinessRailText = (await page.locator("[data-dispatch-validation-rail]").textContent()) ?? "";
  assert.equal(readinessRailText.includes("Pass"), true);
  assert.equal(readinessRailText.includes("Watch"), true);
  assert.equal(readinessRailText.includes("Blocked"), true);
  assert.equal(readinessRailText.includes("Likely recovery"), true);
  assert.equal(readinessRailText.includes("Stage selected work on this aircraft first."), true);
  assert.equal(readinessRailText.includes("Why It Matters"), true);
  assert.equal(readinessRailText.includes("Next Step"), true);
  assert.equal(
    await page.locator("[data-dispatch-readiness-item='work-selected']").evaluate((node) => node.hasAttribute("open")),
    true,
  );
  const commitBarText = (await page.locator("[data-dispatch-commit-bar]").textContent()) ?? "";
  assert.equal(commitBarText.includes("Commit impact"), true);
  assert.equal(commitBarText.includes("Aircraft impact"), true);
  assert.equal(commitBarText.includes("Pilot impact"), true);
  assert.equal(commitBarText.includes("Calendar impact"), true);

  await clickUi(page.locator("[data-dispatch-input-lane] [data-dispatch-source-mode='planned_routes'][role='tab']"));
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-work]")?.textContent?.includes("Planned Routes"));
  await page.waitForFunction(() => document.querySelectorAll("[data-dispatch-source-item]").length >= 2);
  await page.waitForFunction(() => {
    const packageContext = document.querySelector("[data-dispatch-route-plan-package]")?.textContent ?? "";
    const selectedRow = document.querySelector("[data-dispatch-route-plan-selected-row]")?.textContent ?? "";
    const ribbonSteps = document.querySelectorAll("[data-dispatch-route-step]").length;
    return packageContext.includes("Package context")
      && selectedRow.includes("Selected row")
      && ribbonSteps >= 2;
  });
  assert.equal((await page.locator("[data-dispatch-route-plan-package]").textContent())?.includes("Package context"), true);
  assert.equal((await page.locator("[data-dispatch-route-plan-selected-row]").textContent())?.includes("Selected row"), true);
  assert.equal(await page.locator("[data-dispatch-route-ribbon]").isVisible(), true);
  assert.ok((await page.locator("[data-dispatch-route-step]").count()) >= 2);
  await clickUi(page.locator("[data-dispatch-source-item]").nth(0));
  await page.waitForFunction(() => document.querySelector("[data-dispatch-route-plan-package]")?.textContent?.includes("Package")
    && document.querySelector("[data-dispatch-route-plan-selected-row]")?.textContent?.includes("Selected row"));
  const routePlanPackageTextFirst = await page.locator("[data-dispatch-route-plan-package]").textContent();
  const routePlanSelectedRowTextFirst = await page.locator("[data-dispatch-route-plan-selected-row]").textContent();
  assert.equal(routePlanPackageTextFirst?.includes("Package"), true);
  assert.equal(routePlanSelectedRowTextFirst?.includes("Selected row"), true);
  assert.notEqual(routePlanPackageTextFirst, routePlanSelectedRowTextFirst);
  assert.equal((await page.locator("[data-dispatch-source-item]").nth(0).textContent())?.includes("Status"), true);
  assert.equal((await page.locator("[data-dispatch-source-item]").nth(0).textContent())?.includes("Window"), true);
  assert.equal((await page.locator("[data-dispatch-source-item]").nth(0).textContent())?.includes("Payload"), true);
  assert.equal((await page.locator("[data-dispatch-source-item]").nth(0).textContent())?.includes("Payout"), true);
  await clickUi(page.locator("[data-dispatch-source-item]").nth(1));
  await page.waitForFunction(() => document.querySelector("[data-dispatch-route-plan-selected-row]")?.textContent?.includes("Selected row"));
  const routePlanPackageTextSecond = await page.locator("[data-dispatch-route-plan-package]").textContent();
  assert.equal(routePlanPackageTextSecond, routePlanPackageTextFirst);
  await forceButtonSubmit(page, "[data-dispatch-stage-draft]");
  await page.waitForFunction(() => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const selectedAircraft = document.querySelector("[data-dispatch-selected-aircraft]")?.textContent ?? "";
    const commitButton = document.querySelector("[data-dispatch-commit-button]")?.textContent ?? "";
    return flashText.includes("Selected aircraft is not dispatch ready.")
      && selectedAircraft.includes("N20CUI")
      && commitButton.includes("No draft to commit");
  });

  await clickUi(page.locator("[data-dispatch-input-lane] [data-dispatch-source-mode='accepted_contracts'][role='tab']"));
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-work]")?.textContent?.includes("Accepted Contracts"));
  await clickUi(page.locator("[data-dispatch-source-item]").first());
  assert.equal((await page.locator("[data-dispatch-source-item]").first().textContent())?.includes("Status"), true);
  assert.equal((await page.locator("[data-dispatch-source-item]").first().textContent())?.includes("Window"), true);
  assert.equal((await page.locator("[data-dispatch-source-item]").first().textContent())?.includes("Payload"), true);
  assert.equal((await page.locator("[data-dispatch-source-item]").first().textContent())?.includes("Payout"), true);
  assert.equal((await page.locator("[data-dispatch-selected-work]").textContent())?.includes("Single contract path"), true);
  await forceButtonSubmit(page, "[data-dispatch-stage-draft]");
  await page.waitForFunction(() => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const commitButton = document.querySelector("[data-dispatch-commit-button]")?.textContent ?? "";
    const legButtons = document.querySelectorAll("[data-dispatch-leg-select]");
    const previewFailure = flashText.includes("is not dispatchable in its current state.")
      || flashText.includes("would miss the contract deadline for this aircraft.");
    return previewFailure
      && commitButton.includes("No draft to commit")
      && legButtons.length === 0;
  }, { timeout: 45_000 });

  const acceptedContractOutcome = await page.evaluate(() => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const commitButton = document.querySelector("[data-dispatch-commit-button]")?.textContent ?? "";
    const legButtons = document.querySelectorAll("[data-dispatch-leg-select]").length;
    return {
      flashText,
      commitButton,
      legButtons,
      previewFailed: flashText.includes("is not dispatchable in its current state.")
        || flashText.includes("would miss the contract deadline for this aircraft."),
    };
  });

  assert.equal(acceptedContractOutcome.previewFailed, true);
  assert.equal(acceptedContractOutcome.commitButton.includes("No draft to commit"), true);
  assert.equal(acceptedContractOutcome.commitButton.includes("Resolve blockers"), false);
  assert.equal(acceptedContractOutcome.legButtons, 0);

  await clickUi(page.locator("[data-dispatch-aircraft-card]").filter({ hasText: "N20DUI" }).first());
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-aircraft]")?.textContent?.includes("N20DUI"));
  await page.waitForFunction(() => document.querySelector("[data-dispatch-draft-pilot-assignment]"));
  assert.equal(await page.locator("[data-dispatch-draft-pilot-assignment]").isVisible(), true);
  assert.equal((await page.locator("[data-dispatch-pilot-recommendation]").textContent())?.includes("Recommended"), true);
  assert.equal(await page.locator("[data-dispatch-pilot-option-reason]").count() >= 1, true);
  const { recommendedPilotId, overridePilotId } = await page.evaluate(() => {
    const optionCards = [...document.querySelectorAll("[data-dispatch-pilot-option]")];
    const selectableCards = optionCards.filter((card) => card.querySelector("[data-dispatch-pilot-override]"));
    const recommendedCard = selectableCards.find((card) =>
      (card.textContent ?? "").toLowerCase().includes("recommended"));
    const alternateCard = selectableCards.find((card) => card !== recommendedCard);
    return {
      recommendedPilotId: recommendedCard?.getAttribute("data-dispatch-pilot-option") ?? null,
      overridePilotId: alternateCard?.getAttribute("data-dispatch-pilot-option") ?? null,
    };
  });
  assert.ok(recommendedPilotId);
  assert.ok(overridePilotId);
  assert.notEqual(overridePilotId, recommendedPilotId);
  await clickUi(page.locator(`[data-dispatch-pilot-override='${overridePilotId}']`));
  assert.equal((await page.locator("[data-dispatch-commit-button]").textContent())?.includes("Commit draft"), true);
  assert.equal(await page.locator("[data-dispatch-commit-button]").isEnabled(), true);
  await clickUi(page.locator("[data-dispatch-leg-select]").nth(1));
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-leg-detail]")?.textContent?.includes("KCOS -> KDEN"));
  assert.equal((await page.locator("[data-dispatch-selected-leg-detail]").textContent())?.includes("KCOS -> KDEN"), true);
  await clickUi(page.locator(`[data-dispatch-pilot-override='${overridePilotId}']`));
  await clickUi(page.locator("[data-dispatch-commit-button]"));
  await page.waitForFunction((selectedPilotId) => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const commitButton = document.querySelector("[data-dispatch-commit-button]");
    return flashText.includes("Committed schedule")
      && commitButton?.textContent?.includes("Already committed")
      && typeof selectedPilotId === "string"
      && Boolean(document.querySelector(`[data-dispatch-assigned-pilot='${selectedPilotId}']`));
  }, overridePilotId);

  await clickUi(page.locator("[data-shell-tab='aircraft']"));
  await page.waitForFunction(() => document.querySelectorAll(".aircraft-row-button").length === 3);
  await page.waitForFunction(() => {
    const filters = [...document.querySelectorAll("[data-aircraft-filter]")];
    return filters.length === 2
      && filters.every((entry) => entry instanceof HTMLSelectElement && entry.selectedOptions[0]?.textContent?.trim() === "All");
  });
  await page.waitForFunction(() => {
    const labels = [...document.querySelectorAll(".aircraft-toolbar label")].map((entry) => entry.textContent ?? "");
    return labels.some((label) => label.includes("Readiness"))
      && labels.some((label) => label.includes("Health"))
      && labels.every((label) => !label.includes("Staffing"));
  });
  const constrainedRow = page.locator(".aircraft-row").filter({ hasText: "N20CUI" }).first();
  await clickUi(constrainedRow.locator("td").nth(1));
  await page.waitForFunction(() => document.querySelector(".aircraft-detail-panel")?.textContent?.includes("N20CUI"));
  assert.equal((await page.locator(".aircraft-detail-panel").textContent())?.includes("N20CUI"), true);
  assert.equal((await page.locator(".aircraft-detail-panel").textContent())?.toLowerCase().includes("grounded"), true);

  await page.locator("[data-aircraft-filter='risk']").selectOption("critical");
  await page.waitForFunction(() => document.querySelectorAll(".aircraft-row-button").length === 1);
  assert.equal(await page.locator(".aircraft-row-button").count(), 1);
  assert.equal((await page.locator(".aircraft-detail-panel").textContent())?.includes("N20CUI"), true);

  await page.setViewportSize({ width: 1300, height: 380 });
  await clickUi(page.locator("[data-shell-tab='staffing']"));
  await page.waitForFunction(() => document.querySelectorAll("[data-staffing-pilot-row]").length === 3);
  await page.waitForFunction(() => (document.querySelector("[data-staffing-roster]")?.textContent ?? "").includes("N208UI"));
  await page.waitForFunction(() => {
    const panel = document.querySelector("[data-shell-tab-panel]");
    return panel instanceof HTMLElement && panel.scrollHeight - panel.clientHeight <= 2;
  });
  await clickUi(page.locator("[data-staffing-workspace-tab='hire']"));
  await page.waitForFunction(() => {
    const hirePanel = document.querySelector("[data-staffing-workspace-panel='hire']");
    const employeePanel = document.querySelector("[data-staffing-workspace-panel='employees']");
    return hirePanel instanceof HTMLElement
      && employeePanel instanceof HTMLElement
      && !hirePanel.hidden
      && employeePanel.hidden;
  });
  assert.ok((await page.locator("[data-pilot-candidate-market]").count()) >= 1);
  await page.waitForFunction(() => document.querySelectorAll("[data-pilot-candidate-row]").length >= 8);
  assert.equal(await page.locator("[data-staffing-hire-overlay]").isVisible(), false);
  assert.equal(await page.locator("[data-staffing-hire-column] [data-staffing-hire-sort-button]").count() >= 10, true);
  assert.equal(await page.locator("[data-staffing-hire-popover-toggle]").count(), 10);
  assert.equal(await page.locator("[data-staffing-hire-more-toggle]").count(), 0);
  assert.equal(await page.locator("[data-staffing-hire-reset]").count(), 0);
  assert.equal(await page.locator("[data-staffing-hire-popover]").count() >= 10, true);
  assert.equal(await page.locator("[data-staffing-hire-clear]").count(), 0);
  assert.equal(await page.locator("[data-pilot-candidate-market] th").filter({ hasText: "Reliability" }).count(), 1);
  assert.equal(await page.locator("[data-pilot-candidate-market] th").filter({ hasText: "Stress" }).count(), 1);
  assert.equal(await page.locator("[data-pilot-candidate-market] th").filter({ hasText: "Procedure" }).count(), 1);
  assert.equal(await page.locator("[data-pilot-candidate-market] th").filter({ hasText: "Training" }).count(), 1);
  await page.setViewportSize({ width: 1800, height: 1000 });
  assert.equal(await page.locator("button[aria-label='Pilot search']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Pilot filter']").count(), 0);
  assert.equal(await page.locator("button[aria-label='Base search']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Base filter']").count(), 0);
  assert.equal(await page.locator("button[aria-label='Certification(s) search']").count(), 0);
  assert.equal(await page.locator("button[aria-label='Certification(s) filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Total hours filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Reliability filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Stress filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Procedure filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Training filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Direct hire filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Contract hire filter']").count(), 1);
  const baselineCandidates = await page.evaluate(() => {
    return [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")].map((row) => ({
      name: row.getAttribute("data-staffing-candidate-name") ?? "",
      baseSearch: row.getAttribute("data-staffing-candidate-base-search") ?? "",
      certifications: (row.getAttribute("data-staffing-candidate-certifications") ?? "").split("|").filter(Boolean),
      hours: Number.parseFloat(row.getAttribute("data-staffing-candidate-hours") ?? "0") || 0,
      reliability: Number.parseFloat(row.getAttribute("data-staffing-candidate-operational-reliability") ?? "0") || 0,
      directAvailability: row.getAttribute("data-staffing-candidate-direct-availability") ?? "not_offered",
      directCost: Number.parseFloat(row.getAttribute("data-staffing-candidate-direct-cost") ?? ""),
      contractAvailability: row.getAttribute("data-staffing-candidate-contract-availability") ?? "not_offered",
      contractHourlyRate: Number.parseFloat(row.getAttribute("data-staffing-candidate-contract-hourly-rate") ?? ""),
    }));
  });
  const baselineVisibleCandidates = baselineCandidates.length;
  const candidateSample = baselineCandidates[0];
  const multiCertCandidate = baselineCandidates.find((candidate) => candidate.certifications.length >= 2) ?? candidateSample;
  const firstCandidateName = candidateSample?.name ?? "";
  const pilotSearchTerm = firstCandidateName.split(" ")[0] ?? firstCandidateName;
  const baseSearchTerm = (candidateSample?.baseSearch ?? "").split(/\s+/)[0] ?? "";
  const selectedHours = String(multiCertCandidate?.hours ?? 0);
  const selectedReliability = String(multiCertCandidate?.reliability ?? 0);
  assert.ok(baselineVisibleCandidates >= 8);
  assert.ok(pilotSearchTerm.length > 0);
  assert.ok(baseSearchTerm.length > 0);
  assert.ok((multiCertCandidate?.certifications?.length ?? 0) >= 2);
  const baselineColumnWidths = await page.evaluate(() => {
    return [...document.querySelectorAll("[data-staffing-hire-column]")].map((column) => ({
      key: column.getAttribute("data-staffing-hire-column") ?? "",
      width: Math.round(column.getBoundingClientRect().width),
    }));
  });

  await clickUi(page.locator("button[aria-label='Pilot search']"));
  await page.waitForFunction(() => {
    const control = document.querySelector("[data-staffing-hire-popover='pilot']");
    return control instanceof HTMLElement && !control.hidden;
  });
  const pilotSearchGeometry = await page.evaluate(() => {
    const control = document.querySelector("[data-staffing-hire-popover='pilot']");
    const header = document.querySelector("[data-staffing-hire-column='pilot']");
    const button = document.querySelector("button[aria-label='Pilot search']");
    if (!(control instanceof HTMLElement) || !(header instanceof HTMLElement) || !(button instanceof HTMLElement)) {
      return null;
    }
    const controlRect = control.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return {
      controlLeft: controlRect.left,
      controlRight: controlRect.right,
      controlWidth: controlRect.width,
      headerLeft: headerRect.left,
      headerRight: headerRect.right,
      buttonLeft: buttonRect.left,
    };
  });
  assert.ok(pilotSearchGeometry);
  assert.equal(pilotSearchGeometry.controlWidth >= 180, true);
  assert.equal(pilotSearchGeometry.controlLeft <= pilotSearchGeometry.headerRight - 24, true);
  assert.equal(pilotSearchGeometry.controlLeft < pilotSearchGeometry.buttonLeft, true);
  await page.locator("[data-staffing-hire-popover='pilot'] [data-staffing-hire-field='pilotSearch']").fill(pilotSearchTerm);
  await clickUi(page.locator("[data-staffing-hire-column='hours'] .staffing-hire-sort-button"));
  await page.waitForFunction(() => {
    const control = document.querySelector("[data-staffing-hire-popover='pilot']");
    return !(control instanceof HTMLElement) || control.hidden;
  });
  await page.waitForFunction((expectedSearch) => {
    const visibleRows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    return visibleRows.length > 0
      && visibleRows.length < (document.querySelectorAll("[data-pilot-candidate-row]").length || 0)
      && visibleRows.every((row) => (row.getAttribute("data-staffing-candidate-name") ?? "").toLowerCase().includes(expectedSearch));
  }, pilotSearchTerm.toLowerCase());
  const filteredColumnWidths = await page.evaluate(() => {
    return [...document.querySelectorAll("[data-staffing-hire-column]")].map((column) => ({
      key: column.getAttribute("data-staffing-hire-column") ?? "",
      width: Math.round(column.getBoundingClientRect().width),
    }));
  });
  assert.deepEqual(filteredColumnWidths, baselineColumnWidths);
  await clickUi(page.locator("button[aria-label='Pilot search']"));
  await page.locator("[data-staffing-hire-popover='pilot'] [data-staffing-hire-field='pilotSearch']").fill("");
  await clickUi(page.locator("[data-staffing-hire-column='hours'] .staffing-hire-sort-button"));
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])").length === expectedCount, baselineVisibleCandidates);

  await clickUi(page.locator("button[aria-label='Base search']"));
  await page.locator("[data-staffing-hire-popover='base'] [data-staffing-hire-field='baseSearch']").fill(baseSearchTerm);
  await clickUi(page.locator("[data-staffing-hire-column='hours'] .staffing-hire-sort-button"));
  await page.waitForFunction((expectedSearch) => {
    const visibleRows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    return visibleRows.length > 0
      && visibleRows.every((row) => (row.getAttribute("data-staffing-candidate-base-search") ?? "").toLowerCase().includes(expectedSearch));
  }, baseSearchTerm.toLowerCase());
  await clickUi(page.locator("button[aria-label='Base search']"));
  await page.locator("[data-staffing-hire-popover='base'] [data-staffing-hire-field='baseSearch']").fill("");
  await clickUi(page.locator("[data-staffing-hire-column='hours'] .staffing-hire-sort-button"));
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])").length === expectedCount, baselineVisibleCandidates);

  await clickUi(page.locator("button[aria-label='Certification(s) filter']"));
  const certificationFilterGeometry = await page.evaluate(() => {
    const options = [...document.querySelectorAll("[data-staffing-hire-popover='certifications'] .staffing-hire-checkbox-option")].slice(0, 2);
    if (options.length < 2) {
      return null;
    }
    return options.map((option) => {
      const optionRect = option.getBoundingClientRect();
      const input = option.querySelector("input");
      const text = option.querySelector("span");
      const inputRect = input instanceof HTMLElement ? input.getBoundingClientRect() : optionRect;
      const textRect = text instanceof HTMLElement ? text.getBoundingClientRect() : optionRect;
      return {
        left: Math.round(optionRect.left),
        top: Math.round(optionRect.top),
        inputLeft: Math.round(inputRect.left),
        textLeft: Math.round(textRect.left),
      };
    });
  });
  assert.ok(certificationFilterGeometry);
  assert.equal(certificationFilterGeometry[0].left, certificationFilterGeometry[1].left);
  assert.equal(certificationFilterGeometry[1].top > certificationFilterGeometry[0].top, true);
  assert.equal(certificationFilterGeometry[0].textLeft > certificationFilterGeometry[0].inputLeft, true);
  await page.locator(`[data-staffing-hire-popover='certifications'] input[value='${multiCertCandidate.certifications[0]}']`).check();
  await page.locator(`[data-staffing-hire-popover='certifications'] input[value='${multiCertCandidate.certifications[1]}']`).check();
  await page.waitForFunction((certifications) => {
    const visibleRows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    return visibleRows.length > 0
      && visibleRows.every((row) => {
        const rowCertifications = (row.getAttribute("data-staffing-candidate-certifications") ?? "").split("|").filter(Boolean);
        return certifications.every((entry) => rowCertifications.includes(entry));
      });
  }, multiCertCandidate.certifications.slice(0, 2));
  await page.locator(`[data-staffing-hire-popover='certifications'] input[value='${multiCertCandidate.certifications[0]}']`).uncheck();
  await page.locator(`[data-staffing-hire-popover='certifications'] input[value='${multiCertCandidate.certifications[1]}']`).uncheck();
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])").length === expectedCount, baselineVisibleCandidates);
  await page.keyboard.press("Escape");

  await clickUi(page.locator("button[aria-label='Total hours filter']"));
  await page.locator("[data-staffing-hire-popover='hours'] [data-staffing-hire-field='hoursMin']").fill(selectedHours);
  await page.locator("[data-staffing-hire-popover='hours'] [data-staffing-hire-field='hoursMax']").fill(selectedHours);
  await page.waitForFunction((expectedHours) => {
    const visibleRows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    return visibleRows.length > 0
      && visibleRows.every((row) => (row.getAttribute("data-staffing-candidate-hours") ?? "") === expectedHours);
  }, selectedHours);
  await page.locator("[data-staffing-hire-popover='hours'] [data-staffing-hire-field='hoursMin']").fill("");
  await page.locator("[data-staffing-hire-popover='hours'] [data-staffing-hire-field='hoursMax']").fill("");
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])").length === expectedCount, baselineVisibleCandidates);
  await page.keyboard.press("Escape");

  await clickUi(page.locator("button[aria-label='Reliability filter']"));
  await page.locator("[data-staffing-hire-popover='reliability'] [data-staffing-hire-field='reliabilityMin']").fill(selectedReliability);
  await page.locator("[data-staffing-hire-popover='reliability'] [data-staffing-hire-field='reliabilityMax']").fill(selectedReliability);
  await page.waitForFunction((expectedScore) => {
    const visibleRows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    return visibleRows.length > 0
      && visibleRows.every((row) => (row.getAttribute("data-staffing-candidate-operational-reliability") ?? "") === expectedScore);
  }, selectedReliability);
  await page.locator("[data-staffing-hire-popover='reliability'] [data-staffing-hire-field='reliabilityMin']").fill("");
  await page.locator("[data-staffing-hire-popover='reliability'] [data-staffing-hire-field='reliabilityMax']").fill("");
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])").length === expectedCount, baselineVisibleCandidates);
  await page.keyboard.press("Escape");

  await clickUi(page.locator("button[aria-label='Direct hire filter']"));
  await page.locator("[data-staffing-hire-popover='direct_hire'] [data-staffing-hire-field='directCostMin']").fill("1");
  await page.waitForFunction(() => {
    const visibleRows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    return visibleRows.length > 0
      && visibleRows.every((row) => (row.getAttribute("data-staffing-candidate-direct-availability") ?? "") === "offered");
  });
  await page.locator("[data-staffing-hire-popover='direct_hire'] [data-staffing-hire-field='directCostMin']").fill("");
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])").length === expectedCount, baselineVisibleCandidates);
  await page.keyboard.press("Escape");

  await clickUi(page.locator("button[aria-label='Contract hire filter']"));
  await page.waitForFunction(() => document.querySelector("button[aria-label='Contract hire filter']")?.getAttribute("aria-expanded") === "true");
  const contractHirePopoverBounds = await page.locator("[data-staffing-hire-popover='contract_hire']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    const market = document.querySelector("[data-pilot-candidate-market]");
    const marketRect = market instanceof HTMLElement ? market.getBoundingClientRect() : rect;
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      marketLeft: marketRect.left,
      marketRight: marketRect.right,
      viewportWidth: window.innerWidth,
    };
  });
  assert.ok(contractHirePopoverBounds);
  assert.equal(contractHirePopoverBounds.left >= Math.max(12, contractHirePopoverBounds.marketLeft + 12), true);
  assert.equal(contractHirePopoverBounds.right <= Math.min(contractHirePopoverBounds.viewportWidth - 12, contractHirePopoverBounds.marketRight - 12), true);
  await page.locator("[data-staffing-hire-popover='contract_hire'] [data-staffing-hire-field='contractSortBasis']").selectOption("hourly");
  await clickUi(page.locator("[data-staffing-hire-sort-button='contract_cost']"));
  await page.waitForFunction(() => document.querySelector("[data-staffing-hire-column='contract_hire']")?.getAttribute("aria-sort") === "ascending");
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    const values = rows.map((row) => {
      const raw = row.getAttribute("data-staffing-candidate-contract-hourly-rate") ?? "";
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    });
    return values.every((value, index) => index === 0 || values[index - 1] <= value);
  });
  await clickUi(page.locator("button[aria-label='Contract hire filter']"));
  await page.waitForFunction(() => document.querySelector("button[aria-label='Contract hire filter']")?.getAttribute("aria-expanded") === "true");
  await page.locator("[data-staffing-hire-popover='contract_hire'] [data-staffing-hire-field='contractSortBasis']").selectOption("upfront");
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    const values = rows.map((row) => {
      const raw = row.getAttribute("data-staffing-candidate-contract-cost") ?? "";
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    });
    return values.every((value, index) => index === 0 || values[index - 1] <= value);
  });
  await page.locator("[data-staffing-hire-popover='contract_hire'] [data-staffing-hire-field='contractHourlyMin']").fill("1");
  await page.waitForFunction(() => {
    const visibleRows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    return visibleRows.length > 0
      && visibleRows.every((row) => (row.getAttribute("data-staffing-candidate-contract-availability") ?? "") === "offered");
  });
  await page.locator("[data-staffing-hire-popover='contract_hire'] [data-staffing-hire-field='contractHourlyMin']").fill("");
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])").length === expectedCount, baselineVisibleCandidates);
  await page.keyboard.press("Escape");

  await clickUi(page.locator("[data-staffing-hire-sort-button='name']"));
  await page.waitForFunction(() => document.querySelector("[data-pilot-candidate-row]") !== null);
  assert.equal(await page.locator("[data-staffing-hire-column='pilot']").getAttribute("aria-sort"), "ascending");
  await clickUi(page.locator("[data-staffing-hire-sort-button='name']"));
  await page.waitForFunction(() => document.querySelector("[data-staffing-hire-column='pilot']")?.getAttribute("aria-sort") === "descending");
  assert.equal(await page.locator("[data-staffing-hire-column='pilot']").getAttribute("aria-sort"), "descending");

  const hireMarketOverflow = await page.locator("[data-pilot-candidate-market]").evaluate((element) => {
    return element instanceof HTMLElement ? window.getComputedStyle(element).overflowY : "hidden";
  });
  assert.equal(["auto", "scroll"].includes(hireMarketOverflow), true);
  const hireMarketScroll = await page.locator("[data-pilot-candidate-market]").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return { scrollHeight: 0, clientHeight: 0, scrollTop: 0 };
    }

    const previousMaxHeight = element.style.maxHeight;
    const previousHeight = element.style.height;
    element.style.maxHeight = "120px";
    element.style.height = "120px";
    element.scrollTop = 0;
    element.scrollTop = 160;
    const snapshot = {
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollTop: element.scrollTop,
    };
    element.style.maxHeight = previousMaxHeight;
    element.style.height = previousHeight;
    return snapshot;
  });
  assert.ok(hireMarketScroll.scrollHeight > hireMarketScroll.clientHeight);
  assert.ok(hireMarketScroll.scrollTop > 0);
  assert.ok((await page.locator("[data-pilot-candidate-row] [data-staff-portrait-surface='hire-row']").count()) >= 1);
  const firstCandidateRow = page.locator("[data-pilot-candidate-row]:not([hidden])").first();
  const firstCandidatePilotCellText = (await firstCandidateRow.locator("td").first().textContent()) ?? "";
  assert.match(firstCandidatePilotCellText, /[A-Za-z]/);
  assert.equal(firstCandidatePilotCellText.includes("Broader fit"), false);
  assert.equal(firstCandidatePilotCellText.includes("Core fit"), false);
  assert.equal(firstCandidatePilotCellText.includes("Adjacent fit"), false);
  assert.equal(firstCandidatePilotCellText.includes("Direct + Contract"), false);
  assert.equal(firstCandidatePilotCellText.includes("Direct only"), false);
  assert.equal(firstCandidatePilotCellText.includes("Contract only"), false);
  assert.equal(firstCandidatePilotCellText.includes("Available now"), false);
  assert.ok(await page.locator("[data-pilot-candidate-row]").first().locator("[data-pilot-stat-rating='operationalReliability']").count() >= 1);
  await page.setViewportSize({ width: 1440, height: 900 });
  const visibleCandidateRows = page.locator("[data-pilot-candidate-row]:not([hidden])");
  const bothOfferCandidateRows = page.locator("[data-pilot-candidate-row]:not([hidden])[data-staffing-candidate-direct-availability='offered'][data-staffing-candidate-contract-availability='offered']");
  const selectedCandidateRow = (await bothOfferCandidateRows.count()) > 0
    ? bothOfferCandidateRows.first()
    : visibleCandidateRows.first();
  const selectedCandidatePilotCell = selectedCandidateRow.locator("td").first();
  const firstVisibleCandidateName = (await selectedCandidateRow.locator("strong").textContent())?.trim() ?? "";
  const selectedDirectAvailability = await selectedCandidateRow.getAttribute("data-staffing-candidate-direct-availability");
  const selectedContractAvailability = await selectedCandidateRow.getAttribute("data-staffing-candidate-contract-availability");
  const firstCandidatePortrait = await selectedCandidateRow.locator("[data-staff-portrait-surface='hire-row']").getAttribute("src");
  assert.ok(firstCandidatePortrait);
  assert.equal(firstCandidatePortrait.startsWith("/assets/staff-portraits/"), true);
  await clickUi(selectedCandidatePilotCell);
  await page.waitForFunction((expectedName) => {
    const selectedName = document.querySelector("[data-pilot-candidate-row][aria-selected='true'] strong")?.textContent?.trim() ?? "";
    return selectedName === expectedName;
  }, firstVisibleCandidateName);
  await page.waitForFunction((expectedName) => {
    const overlay = document.querySelector("[data-staffing-hire-overlay]");
    const title = document.querySelector("[data-staffing-detail-title='hire']")?.textContent ?? "";
    return overlay instanceof HTMLElement
      && !overlay.hidden
      && title.includes(expectedName);
  }, firstVisibleCandidateName);
  const hireDetailText = (await page.locator("[data-staffing-detail-body='hire']").textContent()) ?? "";
  assert.equal(hireDetailText.includes("Pilot snapshot"), true);
  assert.equal(hireDetailText.includes("Pricing summary"), false);
  assert.equal(hireDetailText.includes("Choose hire path"), false);
  assert.equal(hireDetailText.includes("Qualification lane"), false);
  assert.equal(hireDetailText.includes("Certification hours"), true);
  assert.equal(hireDetailText.includes("Strengths and weaknesses"), true);
  assert.equal(hireDetailText.includes("which means this pilot should"), true);
  assert.equal(hireDetailText.includes("Pilot candidate"), false);
  assert.equal(hireDetailText.includes(firstCandidateName), false);
  assert.equal(hireDetailText.includes("Coverage posture"), false);
  assert.equal(hireDetailText.includes("Hire type"), false);
  assert.equal(hireDetailText.includes("Open-ended named pilot hire."), false);
  assert.equal(hireDetailText.includes("Fixed-term named pilot hire."), false);
  assert.equal(hireDetailText.includes("Monthly fixed staffing cost for this named hire."), false);
  assert.equal(hireDetailText.includes("Hiring activates this candidate into the roster at the listed availability window."), false);
  assert.equal(hireDetailText.includes("Type and availability are fixed by this staffing offer."), false);
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-support-coverage-start]").count(), 0);
  const expectedDirectCards = selectedDirectAvailability === "offered" ? 1 : 0;
  const expectedContractCards = selectedContractAvailability === "offered" ? 1 : 0;
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-staffing-hire-offer-path='direct_hire']").count(), expectedDirectCards);
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-staffing-hire-offer-path='contract_hire']").count(), expectedContractCards);
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-staffing-hire-offer-path='direct_hire'] [data-pilot-candidate-hire]").count(), expectedDirectCards);
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-staffing-hire-offer-path='contract_hire'] [data-pilot-candidate-hire]").count(), expectedContractCards);
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-pilot-candidate-hire]").count(), expectedDirectCards + expectedContractCards);
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-staffing-cert-hours]").count(), 1);
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-staffing-strengths-weaknesses] li").count(), 3);
  const hireDetailScroll = await page.locator("[data-staffing-detail-body='hire']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return { scrollHeight: 0, clientHeight: 0 };
    }
    return { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
  });
  assert.ok(hireDetailScroll.scrollHeight - hireDetailScroll.clientHeight <= 6, `expected no hire detail scroll, got ${hireDetailScroll.scrollHeight - hireDetailScroll.clientHeight}`);
  const hireOverlayGeometry = await page.locator("[data-staffing-hire-overlay]").evaluate((overlayElement) => {
    if (!(overlayElement instanceof HTMLElement)) {
      return {
        overlayPosition: "",
        overlayHidden: true,
        viewportWidth: 0,
        viewportHeight: 0,
      backdropWidth: 0,
      backdropHeight: 0,
      backdropBackgroundColor: "",
      cardWidth: 0,
      cardHeight: 0,
    };
    }

    const backdrop = overlayElement.querySelector(".staffing-hire-overlay-backdrop");
    const card = overlayElement.querySelector(".staffing-hire-overlay-card");
    if (!(backdrop instanceof HTMLElement) || !(card instanceof HTMLElement)) {
      return {
        overlayPosition: "",
        overlayHidden: true,
        viewportWidth: 0,
        viewportHeight: 0,
        backdropWidth: 0,
        backdropHeight: 0,
        backdropBackgroundColor: "",
        cardWidth: 0,
        cardHeight: 0,
      };
    }

    const backdropRect = backdrop.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const backdropStyle = window.getComputedStyle(backdrop);

    return {
      overlayPosition: window.getComputedStyle(overlayElement).position,
      overlayHidden: overlayElement.hidden,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      backdropWidth: backdropRect.width,
      backdropHeight: backdropRect.height,
      backdropBackgroundColor: backdropStyle.backgroundColor,
      cardWidth: cardRect.width,
      cardHeight: cardRect.height,
    };
  });
  const hireOverlayBackdropAlpha = (() => {
    const match = hireOverlayGeometry.backdropBackgroundColor.match(/rgba?\(([^)]+)\)/i);
    if (!match) {
      return 1;
    }
    const channels = match[1].split(",").map((value) => Number.parseFloat(value.trim()));
    return channels.length >= 4 && Number.isFinite(channels[3]) ? channels[3] : 1;
  })();
  assert.equal(hireOverlayGeometry.overlayPosition, "fixed");
  assert.equal(hireOverlayGeometry.overlayHidden, false);
  assert.ok(hireOverlayBackdropAlpha <= 0.08, `expected subtle overlay backdrop, got ${hireOverlayGeometry.backdropBackgroundColor}`);
  assert.ok(hireOverlayGeometry.cardWidth < hireOverlayGeometry.viewportWidth);
  assert.ok(hireOverlayGeometry.cardHeight < hireOverlayGeometry.viewportHeight);
  const hireDetailTitleFontSize = await page.locator("[data-staffing-detail-title='hire']").evaluate((element) => {
    return element instanceof HTMLElement ? Number.parseFloat(window.getComputedStyle(element).fontSize) : 0;
  });
  assert.ok(hireDetailTitleFontSize >= 28);
  const hireDetailPortraitBox = await page.locator("[data-staffing-detail-panel='hire'] [data-staff-portrait-frame='hire-detail']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return { width: 0, height: 0 };
    }

    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  assert.ok(hireDetailPortraitBox.width >= 76 && hireDetailPortraitBox.width <= 84);
  assert.ok(hireDetailPortraitBox.height >= 76 && hireDetailPortraitBox.height <= 84);
  assert.equal(await page.locator("[data-staffing-detail-panel='hire'] [data-staff-portrait-surface='hire-detail']").getAttribute("src"), firstCandidatePortrait);
  await clickUi(page.locator("[data-staffing-detail-close='hire']").first());
  await page.waitForFunction(() => {
    const overlay = document.querySelector("[data-staffing-hire-overlay]");
    return overlay instanceof HTMLElement && overlay.hidden;
  });
  await clickUi(page.locator("[data-pilot-candidate-row]").first());
  await page.waitForFunction(() => {
    const overlay = document.querySelector("[data-staffing-hire-overlay]");
    return overlay instanceof HTMLElement && !overlay.hidden;
  });
  await clickUi(page.locator("[data-staffing-workspace-tab='employees']"));
  await page.waitForFunction(() => {
    const hirePanel = document.querySelector("[data-staffing-workspace-panel='hire']");
    const employeePanel = document.querySelector("[data-staffing-workspace-panel='employees']");
    return hirePanel instanceof HTMLElement
      && employeePanel instanceof HTMLElement
      && hirePanel.hidden
      && !employeePanel.hidden;
  });
  await page.setViewportSize({ width: 1300, height: 520 });
  assert.equal(await page.locator("[data-staffing-pilot-row]").count(), 3);
  assert.equal(await page.locator("[data-staffing-pilot-row] [data-staff-portrait-surface='employees-row']").count(), 3);
  assert.equal((await page.locator("[data-staffing-roster]").textContent())?.toLowerCase().includes("reserved"), true);
  const reservedPilotRow = page.locator("[data-staffing-pilot-row]").filter({ hasText: "N208UI" }).first();
  const reservedPilotPortrait = await reservedPilotRow.locator("[data-staff-portrait-surface='employees-row']").getAttribute("src");
  assert.ok(reservedPilotPortrait);
  assert.equal(reservedPilotPortrait.startsWith("/assets/staff-portraits/"), true);
  await clickUi(reservedPilotRow);
  await page.waitForFunction(() => {
    const detail = document.querySelector("[data-staffing-detail-body='employees']")?.textContent ?? "";
    return detail.includes("N208UI") && /reserved/i.test(detail);
  });
  assert.equal(await page.locator("[data-staffing-detail-body='employees'] [data-staff-portrait-surface='employees-detail']").getAttribute("src"), reservedPilotPortrait);
  await clickUi(page.locator("[data-staffing-pilot-row]").filter({ hasText: /ready/i }).first());
  await page.waitForFunction(() => {
    const detail = document.querySelector("[data-staffing-detail-body='employees']")?.textContent ?? "";
    return detail.includes("Start training");
  });
  await page.waitForFunction(() => {
    const detail = document.querySelector("[data-staffing-detail-body='employees']");
    return detail instanceof HTMLElement && detail.scrollHeight > detail.clientHeight + 20;
  });
  const detailScrollBefore = await page.locator("[data-staffing-detail-body='employees']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return 0;
    }
    element.scrollTop = 160;
    return element.scrollTop;
  });
  assert.ok(detailScrollBefore > 0);
  assert.equal(await page.locator("[data-pilot-training-start]").count(), 1);
  await page.locator("[data-pilot-training-target]").first().selectOption("MEPL");
  await clickUi(page.locator("[data-pilot-training-start]").first());
  await page.waitForFunction(() => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const detailText = document.querySelector("[data-staffing-detail-body='employees']")?.textContent ?? "";
    return /training/i.test(flashText) && /training/i.test(detailText);
  });
  assert.equal((await page.locator("[data-staffing-detail-body='employees']").textContent())?.toLowerCase().includes("training"), true);
  const detailScrollAfter = await page.locator("[data-staffing-detail-body='employees']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return { scrollTop: 0, maxScrollTop: 0 };
    }
    return {
      scrollTop: element.scrollTop,
      maxScrollTop: Math.max(0, element.scrollHeight - element.clientHeight),
    };
  });
  assert.ok(detailScrollAfter.scrollTop > 40);
  assert.ok(detailScrollAfter.scrollTop >= Math.min(detailScrollBefore, detailScrollAfter.maxScrollTop) - 24);
  assert.equal(await page.locator("[data-shell-tab-panel]").evaluate((element) => {
    return element instanceof HTMLElement ? element.scrollTop : -1;
  }), 0);

  await clickUi(page.locator("[data-shell-tab='aircraft']"));
  await page.waitForFunction(() => document.querySelector(".aircraft-detail-panel") !== null);
  await clickUi(page.locator("[data-aircraft-workspace='market']"));
  await page.waitForFunction(() => document.querySelector("[data-aircraft-workspace='market']")?.getAttribute("aria-selected") === "true");
  const initialMarketRows = await page.locator("[data-market-select]").count();
  assert.ok(initialMarketRows > 0);
  assert.equal(await page.locator(".market-toolbar").count(), 0);
  assert.ok((await page.locator("[data-market-popover-toggle]").count()) >= 8);
  const aircraftMarketTable = page.locator(".aircraft-market-table").first();
  const aircraftHeaderText = (await aircraftMarketTable.locator("thead").textContent()) ?? "";
  assert.equal(/\bSORT\b|\bASC\b|\bDESC\b/.test(aircraftHeaderText), false);
  assert.equal(aircraftHeaderText.includes("Capability"), false);
  assert.equal(aircraftHeaderText.includes("Passengers"), true);
  assert.equal(aircraftHeaderText.includes("Cargo"), true);
  assert.equal(aircraftHeaderText.includes("Range"), true);
  const aircraftListingHeaderStyle = await aircraftMarketTable.locator("button[aria-label='Listing search']").first().evaluate((button) => {
    const headerControl = button.closest(".table-header-control");
    const label = headerControl?.querySelector(".table-header-label, .table-sort");
    return label instanceof HTMLElement
      ? {
          textTransform: window.getComputedStyle(label).textTransform,
          fontSize: window.getComputedStyle(label).fontSize,
        }
      : null;
  });
  assert.ok(aircraftListingHeaderStyle);
  assert.equal(aircraftListingHeaderStyle.textTransform, "none");
  assert.equal(aircraftListingHeaderStyle.fontSize, "13px");
  const marketPopoverToggleColumns = await aircraftMarketTable.locator("[data-market-popover-toggle]").evaluateAll((elements) => {
    return elements.map((element) => ({
      column: element.getAttribute("data-market-popover-toggle") ?? "",
      label: element.getAttribute("aria-label") ?? "",
    }));
  });
  for (const { column, label } of marketPopoverToggleColumns) {
    const buttonLocator = aircraftMarketTable.locator(`button[aria-label="${label}"]`).first();
    await clickUi(buttonLocator.locator("svg").first());
    await page.waitForFunction(([expectedColumn, expectedLabel]) => {
      const popover = document.querySelector(`[data-market-popover="${expectedColumn}"]`);
      const toggle = document.querySelector(`button[aria-label="${expectedLabel}"]`);
      return popover instanceof HTMLElement
        && !popover.hidden
        && toggle instanceof HTMLElement
        && toggle.getAttribute("aria-expanded") === "true";
    }, [column, label]);
    await clickUi(buttonLocator.locator("svg").first());
    await page.waitForFunction((expectedLabel) => {
      const toggle = document.querySelector(`button[aria-label="${expectedLabel}"]`);
      return toggle instanceof HTMLElement
        && toggle.getAttribute("aria-expanded") === "false";
    }, label);
  }
  await clickUi(aircraftMarketTable.locator("button[aria-label='Distance filter']").first().locator("svg"));
  await page.waitForFunction(() => document.querySelector("[data-market-popover='distance']") instanceof HTMLElement
    && !(document.querySelector("[data-market-popover='distance']")).hidden);
  const distancePopoverBounds = await page.locator("[data-market-popover='distance']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
    };
  });
  assert.ok(distancePopoverBounds);
  await clickUi(aircraftMarketTable.locator("button[aria-label='Distance filter']").first().locator("svg"));
  await page.waitForFunction(() => document.querySelector("button[aria-label='Distance filter']")?.getAttribute("aria-expanded") === "false");
  const firstListingLabel = ((await page.locator("[data-market-select]").first().locator(".aircraft-market-listing .route").textContent()) ?? "").trim();
  const firstListingRegistration = (((await page.locator("[data-market-select]").first().locator(".aircraft-market-listing .muted").textContent()) ?? "").split("|")[0] ?? "").trim();
  assert.ok(firstListingLabel.length > 0);
  assert.ok(firstListingRegistration.length > 0);
  await clickUi(page.locator("button[aria-label='Listing search']").first().locator("svg"));
  await page.waitForFunction(() => document.querySelector("[data-market-popover='listing']") instanceof HTMLElement && !(document.querySelector("[data-market-popover='listing']")).hidden);
  await page.locator("[data-market-popover='listing'] input[data-market-field='listingSearchText']").fill(firstListingRegistration);
  await page.waitForFunction(([expectedRegistration, expectedCount]) => {
    const rows = [...document.querySelectorAll("[data-market-select]")];
    return rows.length > 0
      && rows.length <= expectedCount
      && rows.every((row) => (row.textContent ?? "").includes(expectedRegistration));
  }, [firstListingRegistration, initialMarketRows]);
  await page.waitForFunction(() => document.querySelectorAll("[data-market-select]").length === 1);
  await clickUi(page.locator("[data-market-select]").first());
  await page.waitForFunction(() => !document.querySelector("[data-aircraft-market-overlay]")?.hasAttribute("hidden"));
  await page.waitForTimeout(150);
  const filteredMarketOverlayBounds = await page.locator(".aircraft-market-overlay-card").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const marketPanel = document.querySelector(".aircraft-market-panel");
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      marketPanelTop: marketPanel instanceof HTMLElement ? marketPanel.getBoundingClientRect().top : rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
  assert.ok(filteredMarketOverlayBounds);
  assert.ok(Math.abs(filteredMarketOverlayBounds.top - filteredMarketOverlayBounds.marketPanelTop) <= 2);
  assert.ok(filteredMarketOverlayBounds.top >= -2);
  assert.ok(filteredMarketOverlayBounds.left >= -2);
  assert.ok(filteredMarketOverlayBounds.right <= filteredMarketOverlayBounds.viewportWidth + 2);
  await clickUi(page.locator("[data-aircraft-market-close]").first());
  await page.waitForFunction(() => document.querySelector("[data-aircraft-market-overlay]")?.hasAttribute("hidden") ?? false);
  await clickUi(page.locator("button[aria-label='Condition filter']").first().locator("svg"));
  await page.waitForFunction(() => document.querySelector("[data-market-popover='condition']") instanceof HTMLElement
    && !(document.querySelector("[data-market-popover='condition']")).hidden);
  const conditionPopoverBounds = await page.locator("[data-market-popover='condition']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return null;
    }
    const stage = document.querySelector("[data-aircraft-market-stage]");
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      stageTop: stage instanceof HTMLElement ? stage.getBoundingClientRect().top : 0,
      stageBottom: stage instanceof HTMLElement ? stage.getBoundingClientRect().bottom : window.innerHeight,
      stageLeft: stage instanceof HTMLElement ? stage.getBoundingClientRect().left : 0,
      stageRight: stage instanceof HTMLElement ? stage.getBoundingClientRect().right : window.innerWidth,
    };
  });
  assert.ok(conditionPopoverBounds);
  assert.ok(conditionPopoverBounds.top >= 0);
  assert.ok(conditionPopoverBounds.bottom <= conditionPopoverBounds.stageBottom);
  assert.ok(conditionPopoverBounds.left >= conditionPopoverBounds.stageLeft);
  assert.ok(conditionPopoverBounds.right <= conditionPopoverBounds.stageRight);
  await clickUi(page.locator("button[aria-label='Condition filter']").first().locator("svg"));
  await page.waitForFunction(() => document.querySelector("button[aria-label='Condition filter']")?.getAttribute("aria-expanded") === "false");
  await clickUi(page.locator(".aircraft-market-panel .panel-head h3").first());
  await page.waitForFunction(() => {
    const popover = document.querySelector("[data-market-popover='listing']");
    return !(popover instanceof HTMLElement) || popover.hidden;
  });
  await page.waitForFunction(([expectedRegistration, expectedCount]) => {
    const rows = [...document.querySelectorAll("[data-market-select]")];
    return rows.length > 0
      && rows.length <= expectedCount
      && rows.every((row) => (row.textContent ?? "").includes(expectedRegistration));
  }, [firstListingRegistration, initialMarketRows]);
  await clickUi(page.locator("button[aria-label='Listing search']").first().locator("svg"));
  await page.waitForFunction(() => document.querySelector("[data-market-popover='listing']") instanceof HTMLElement && !(document.querySelector("[data-market-popover='listing']")).hidden);
  await page.locator("[data-market-popover='listing'] input[data-market-field='listingSearchText']").fill("");
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-market-select]").length === expectedCount, initialMarketRows);
  await clickUi(page.locator("button[aria-label='Listing search']").first().locator("svg"));
  await page.waitForFunction(() => {
    const toggle = document.querySelector("button[aria-label='Listing search']");
    const popover = document.querySelector("[data-market-popover='listing']");
    return toggle?.getAttribute("aria-expanded") === "false"
      && (!(popover instanceof HTMLElement) || popover.hidden);
  });
  const firstMarketRow = page.locator("[data-market-select]").first();
  assert.equal(await firstMarketRow.locator(".aircraft-market-listing-thumb img").count(), 1);
  const selectedOfferId = await firstMarketRow.getAttribute("data-market-select");
  assert.ok(selectedOfferId);
  await clickUi(firstMarketRow);
  await page.waitForFunction(() => !document.querySelector("[data-aircraft-market-overlay]")?.hasAttribute("hidden"));
  assert.equal(await page.locator("[data-aircraft-market-stage]").evaluate((element) => {
    return element instanceof HTMLElement && element.classList.contains("overlay-open");
  }), true);
  const marketOverlay = page.locator(".aircraft-market-overlay-card");
  assert.equal(
    await marketOverlay.locator("[data-market-review='owned']").first().getAttribute("data-market-review-offer"),
    selectedOfferId,
  );
  await clickUi(marketOverlay.locator("[data-market-review='owned']").first());
  await page.waitForFunction(() => document.querySelector(".market-review-card") !== null);
  await clickUi(marketOverlay.getByRole("button", { name: "Confirm purchase" }));
  await page.waitForFunction(() => {
    const marketTab = document.querySelector("[data-aircraft-workspace='market']");
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const overlayHidden = document.querySelector("[data-aircraft-market-overlay]")?.hasAttribute("hidden") ?? false;
    return marketTab?.getAttribute("aria-selected") === "true" && overlayHidden && flashText.includes("Acquired");
  });
  assert.equal(await page.locator("[data-aircraft-workspace='market']").getAttribute("aria-selected"), "true");
  assert.equal(await page.locator(`[data-market-select='${selectedOfferId}']`).count(), 0);
  assert.equal(await page.locator("[data-market-select]").count(), initialMarketRows - 1);

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
