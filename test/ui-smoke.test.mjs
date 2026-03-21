/*
 * Regression coverage for ui smoke.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";

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
  await clickUi(page.locator("[data-dispatch-aircraft-card]").filter({ hasText: "N20DUI" }).first());
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-aircraft]")?.textContent?.includes("N20DUI"));
  await clickUi(page.locator("[data-dispatch-leg-select]").nth(1));
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-leg-detail]")?.textContent?.includes("KCOS -> KDEN"));

  await clickUi(page.locator("[data-shell-tab='contracts']"));
  await page.waitForFunction(() => document.querySelectorAll(".contracts-board-table tbody tr").length > 0);
  assert.ok((await page.locator(".contracts-board-table tbody tr").count()) > 0);

  await clickUi(page.locator("[data-plan-add-offer]").first());
  await page.waitForFunction(() => document.body.innerText.includes("1 item | endpoint"));
  assert.equal((await page.locator(".contracts-planner-panel").textContent())?.includes("1 item | endpoint"), true);
  await clickUi(page.locator("[data-plan-add-offer]").nth(1));
  await page.waitForFunction(() => document.body.innerText.includes("2 items | endpoint"));
  assert.equal((await page.locator(".contracts-planner-panel").textContent())?.includes("2 items | endpoint"), true);

  await clickUi(page.locator("[data-plan-review-open]"));
  await page.waitForFunction(() => document.querySelectorAll("[data-plan-review-select]").length > 0);
  await clickUi(page.locator("[data-plan-accept-selected]"));
  await page.waitForFunction(() => document.querySelectorAll(".contracts-board-table tbody tr").length > 0);
  await clickUi(page.locator("[data-board-tab='active']"));
  await page.waitForFunction(() => document.body.innerText.includes("accepted / active contracts"));

  await clickUi(page.locator("[data-shell-tab='dispatch']"));
  await page.waitForFunction(() => document.querySelectorAll("[data-dispatch-aircraft-card]").length === 3);
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-aircraft]")?.textContent?.includes("N20DUI"));
  assert.equal((await page.locator("[data-dispatch-input-lane]").textContent())?.includes("Dispatch Source"), true);
  assert.equal((await page.locator("[data-dispatch-input-lane]").textContent())?.includes("Accepted Contracts"), true);
  assert.equal((await page.locator("[data-dispatch-input-lane]").textContent())?.includes("Planned Routes"), true);
  assert.equal(await page.locator("[data-dispatch-input-lane] [data-dispatch-source-mode='accepted_contracts'][role='tab']").isVisible(), true);
  assert.equal(await page.locator("[data-dispatch-input-lane] [data-dispatch-source-mode='planned_routes'][role='tab']").isVisible(), true);
  assert.equal(await page.locator("[data-dispatch-selected-work]").isVisible(), true);
  assert.equal((await page.locator("[data-dispatch-commit-button]").textContent())?.includes("Commit draft"), true);
  assert.equal(await page.locator("[data-dispatch-commit-button]").isEnabled(), true);

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
  const commitBarText = (await page.locator("[data-dispatch-commit-bar]").textContent()) ?? "";
  assert.equal(commitBarText.includes("Commit impact"), true);
  assert.equal(commitBarText.includes("preview commit impact"), true);

  await clickUi(page.locator("[data-dispatch-input-lane] [data-dispatch-source-mode='planned_routes'][role='tab']"));
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-work]")?.textContent?.includes("Planned Routes"));
  await page.waitForFunction(() => document.querySelectorAll("[data-dispatch-source-item]").length >= 2);
  await clickUi(page.locator("[data-dispatch-source-item]").nth(0));
  await page.waitForFunction(() => document.querySelector("[data-dispatch-route-plan-package]")?.textContent?.includes("Package")
    && document.querySelector("[data-dispatch-route-plan-selected-row]")?.textContent?.includes("Selected row"));
  const routePlanPackageTextFirst = await page.locator("[data-dispatch-route-plan-package]").textContent();
  const routePlanSelectedRowTextFirst = await page.locator("[data-dispatch-route-plan-selected-row]").textContent();
  assert.equal(routePlanPackageTextFirst?.includes("Package"), true);
  assert.equal(routePlanSelectedRowTextFirst?.includes("Selected row"), true);
  assert.notEqual(routePlanPackageTextFirst, routePlanSelectedRowTextFirst);
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
  await forceButtonSubmit(page, "[data-dispatch-stage-draft]");
  await page.waitForFunction(() => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const commitButton = document.querySelector("[data-dispatch-commit-button]")?.textContent ?? "";
    const legButtons = document.querySelectorAll("[data-dispatch-leg-select]");
    return (
      flashText.includes("is not dispatchable in its current state.")
      && commitButton.includes("Resolve blockers")
      && legButtons.length >= 1
    ) || (
      flashText.includes("would miss the contract deadline for this aircraft.")
      && commitButton.includes("No draft to commit")
      && legButtons.length === 0
    );
  }, { timeout: 45_000 });

  const acceptedContractOutcome = await page.evaluate(() => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const commitButton = document.querySelector("[data-dispatch-commit-button]")?.textContent ?? "";
    const legButtons = document.querySelectorAll("[data-dispatch-leg-select]").length;
    return {
      flashText,
      commitButton,
      legButtons,
      blockedByAircraftState: flashText.includes("is not dispatchable in its current state.")
        && commitButton.includes("Resolve blockers")
        && legButtons >= 1,
    };
  });

  if (acceptedContractOutcome.blockedByAircraftState) {
    await clickUi(page.locator("[data-dispatch-leg-select]").first());
    await page.waitForFunction(() => {
      const detail = document.querySelector("[data-dispatch-selected-leg-detail]")?.textContent ?? "";
      return detail.includes("Selected Leg") && detail.includes("->");
    });
    const blockedLegDetailText = await page.locator("[data-dispatch-selected-leg-detail]").textContent();
    await forceButtonSubmit(page, "[data-dispatch-commit-button]");
    await page.waitForFunction((expectedDetail) => {
      const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
      const detail = document.querySelector("[data-dispatch-selected-leg-detail]")?.textContent ?? "";
      const commitButton = document.querySelector("[data-dispatch-commit-button]");
      return flashText.includes("is not dispatchable in its current state.")
        && detail === expectedDetail
        && commitButton?.textContent?.includes("Resolve blockers")
        && commitButton instanceof HTMLButtonElement
        && commitButton.disabled;
    }, blockedLegDetailText ?? "", { timeout: 45_000 });
  } else {
    assert.equal(acceptedContractOutcome.flashText.includes("would miss the contract deadline for this aircraft."), true);
    assert.equal(acceptedContractOutcome.commitButton.includes("No draft to commit"), true);
    assert.equal(acceptedContractOutcome.legButtons, 0);
  }

  await clickUi(page.locator("[data-dispatch-aircraft-card]").filter({ hasText: "N20DUI" }).first());
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-aircraft]")?.textContent?.includes("N20DUI"));
  assert.equal((await page.locator("[data-dispatch-commit-button]").textContent())?.includes("Commit draft"), true);
  assert.equal(await page.locator("[data-dispatch-commit-button]").isEnabled(), true);
  await clickUi(page.locator("[data-dispatch-leg-select]").nth(1));
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-leg-detail]")?.textContent?.includes("KCOS -> KDEN"));
  assert.equal((await page.locator("[data-dispatch-selected-leg-detail]").textContent())?.includes("KCOS -> KDEN"), true);
  await clickUi(page.locator("[data-dispatch-commit-button]"));
  await page.waitForFunction(() => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const commitButton = document.querySelector("[data-dispatch-commit-button]");
    return flashText.includes("Committed schedule") && commitButton?.textContent?.includes("Already committed");
  });

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
  const firstCandidateRowText = (await page.locator("[data-pilot-candidate-row]").first().textContent()) ?? "";
  assert.equal(firstCandidateRowText.includes("Available now"), false);
  assert.equal(firstCandidateRowText.includes("Direct hire"), false);
  assert.equal(firstCandidateRowText.includes("Contract hire"), false);
  const hireRowPortraitBox = await page.locator("[data-pilot-candidate-row] [data-staff-portrait-frame='hire-row']").first().evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return { width: 0, height: 0 };
    }

    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  assert.ok(hireRowPortraitBox.width <= 8);
  assert.ok(hireRowPortraitBox.height <= 8);
  await page.setViewportSize({ width: 1300, height: 520 });
  const firstCandidateName = (await page.locator("[data-pilot-candidate-row]").first().locator("strong").textContent())?.trim() ?? "";
  const firstCandidatePortrait = await page.locator("[data-pilot-candidate-row]").first().locator("[data-staff-portrait-surface='hire-row']").getAttribute("src");
  assert.ok(firstCandidatePortrait);
  assert.equal(firstCandidatePortrait.startsWith("/assets/staff-portraits/"), true);
  await clickUi(page.locator("[data-pilot-candidate-row]").first());
  await page.waitForFunction((expectedName) => {
    const overlay = document.querySelector("[data-staffing-hire-overlay]");
    const title = document.querySelector("[data-staffing-detail-title='hire']")?.textContent ?? "";
    const detail = document.querySelector("[data-staffing-detail-body='hire']")?.textContent ?? "";
    return overlay instanceof HTMLElement
      && !overlay.hidden
      && title.includes(expectedName)
      && detail.includes("Qualification lane")
      && detail.includes("Total career hours")
      && detail.includes("Operational reliability")
      && detail.includes("Choose hire path")
      && detail.includes("Availability")
      && detail.includes("Direct hire")
      && detail.includes("Contract hire");
  }, firstCandidateName);
  const hireDetailText = (await page.locator("[data-staffing-detail-body='hire']").textContent()) ?? "";
  assert.equal(hireDetailText.includes("Identity brief"), true);
  assert.equal(hireDetailText.includes("Flight profile"), true);
  assert.equal(hireDetailText.includes("Pricing summary"), true);
  assert.equal(hireDetailText.includes("Choose hire path"), true);
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
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-staffing-hire-path='direct_hire']").count(), 1);
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-staffing-hire-path='contract_hire']").count(), 1);
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-pilot-candidate-hire]").count(), 2);
  const hireOverlayGeometry = await page.locator("[data-staffing-hire-overlay]").evaluate((overlayElement) => {
    if (!(overlayElement instanceof HTMLElement)) {
      return {
        overlayPosition: "",
        overlayHidden: true,
        stageWidth: 0,
      stageHeight: 0,
      backdropWidth: 0,
      backdropHeight: 0,
      backdropBackgroundColor: "",
      cardWidth: 0,
      cardHeight: 0,
    };
    }

    const stageElement = overlayElement.closest("[data-staffing-hire-stage]");
    const backdrop = overlayElement.querySelector(".staffing-hire-overlay-backdrop");
    const card = overlayElement.querySelector(".staffing-hire-overlay-card");
    if (!(stageElement instanceof HTMLElement) || !(backdrop instanceof HTMLElement) || !(card instanceof HTMLElement)) {
      return {
        overlayPosition: "",
        overlayHidden: true,
        stageWidth: 0,
        stageHeight: 0,
        backdropWidth: 0,
        backdropHeight: 0,
        backdropBackgroundColor: "",
        cardWidth: 0,
        cardHeight: 0,
      };
    }

    const stageRect = stageElement.getBoundingClientRect();
    const backdropRect = backdrop.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const backdropStyle = window.getComputedStyle(backdrop);

    return {
      overlayPosition: window.getComputedStyle(overlayElement).position,
      overlayHidden: overlayElement.hidden,
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
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
  assert.equal(hireOverlayGeometry.overlayPosition, "absolute");
  assert.equal(hireOverlayGeometry.overlayHidden, false);
  assert.ok(Math.abs(hireOverlayGeometry.backdropWidth - hireOverlayGeometry.stageWidth) <= 2);
  assert.ok(Math.abs(hireOverlayGeometry.backdropHeight - hireOverlayGeometry.stageHeight) <= 2);
  assert.ok(hireOverlayBackdropAlpha <= 0.08, `expected subtle overlay backdrop, got ${hireOverlayGeometry.backdropBackgroundColor}`);
  assert.ok(hireOverlayGeometry.cardWidth < hireOverlayGeometry.stageWidth);
  assert.ok(hireOverlayGeometry.cardHeight < hireOverlayGeometry.stageHeight);
  const hireDetailPortraitBox = await page.locator("[data-staffing-detail-panel='hire'] [data-staff-portrait-frame='hire-detail']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return { width: 0, height: 0 };
    }

    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  assert.ok(hireDetailPortraitBox.width <= 16);
  assert.ok(hireDetailPortraitBox.height <= 16);
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
  const marketDetailPanel = page.locator(".aircraft-detail-panel");
  const selectedOfferId = await marketDetailPanel.locator("[data-market-review='owned']").first().getAttribute("data-market-review-offer");
  assert.ok(selectedOfferId);
  await clickUi(marketDetailPanel.locator("[data-market-review='owned']").first());
  await page.waitForFunction(() => document.querySelector(".market-review-card") !== null);
  await clickUi(marketDetailPanel.getByRole("button", { name: "Confirm purchase" }));
  await page.waitForFunction(() => {
    const marketTab = document.querySelector("[data-aircraft-workspace='market']");
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    return marketTab?.getAttribute("aria-selected") === "true" && flashText.includes("Acquired");
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
