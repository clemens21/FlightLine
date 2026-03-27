/*
 * Focused browser coverage for the Contracts workspace.
 * This keeps board, selection, accept, and planner behavior out of the broad shell smoke.
 */

import assert from "node:assert/strict";

import { uniqueSaveId } from "./helpers/flightline-testkit.mjs";
import { seedUiRegressionSave } from "./helpers/ui-regression-scenario.mjs";
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

const saveId = uniqueSaveId("ui_contracts_workspace");
const displayName = `Contracts Workspace ${saveId}`;

let backend = null;
let server = null;
let browser = null;

async function forceRowDoubleClick(locator) {
  await locator.waitFor({ state: "visible" });
  await locator.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "center" });
    element.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      composed: true,
    }));
  });
}

try {
  backend = await createWorkspaceBackend();
  await seedUiRegressionSave(backend, { saveId, displayName });
  await backend.close();
  backend = null;

  const port = await allocatePort();
  server = await startUiServer(port);
  browser = await launchBrowser();
  const page = await browser.newPage();

  await page.goto(`${server.baseUrl}/save/${encodeURIComponent(saveId)}?tab=contracts`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL((url) => url.pathname === `/save/${saveId}` && url.searchParams.get("tab") === "contracts");
  await waitForShellTitle(page, displayName);
  await page.waitForFunction(() => document.querySelectorAll(".contracts-board-table tbody tr").length > 0);

  assert.equal(await page.locator(".contracts-workspace-tab[data-workspace-tab='board']").getAttribute("aria-selected"), "true");
  assert.equal(await page.locator(".contracts-workspace-tab[data-workspace-tab='planning']").getAttribute("aria-selected"), "false");
  assert.equal(await page.locator(".contracts-main-body > .contracts-filters").count(), 0);
  assert.equal(await page.locator("[data-plan-add-offer]").count(), 0);
  assert.ok((await page.locator("[data-contracts-board-popover-toggle]").count()) >= 4);

  const contractsBoardTable = page.locator(".contracts-board-table").first();
  const headerText = (await contractsBoardTable.locator("thead").textContent()) ?? "";
  assert.equal(/\bSORT\b|\bASC\b|\bDESC\b/.test(headerText), false);
  assert.equal(headerText.includes("Fit"), false);
  assert.equal(headerText.includes("Accept now"), false);
  assert.equal(headerText.includes("Nearest Aircraft"), true);
  assert.equal(headerText.includes("Route"), true);
  assert.equal(headerText.includes("Due"), true);

  const routeHeaderStyle = await contractsBoardTable.locator("button[aria-label='Route search']").first().evaluate((button) => {
    const headerControl = button.closest(".table-header-control");
    const label = headerControl?.querySelector(".table-header-label, .table-sort");
    return label instanceof HTMLElement
      ? {
          textTransform: window.getComputedStyle(label).textTransform,
          fontSize: window.getComputedStyle(label).fontSize,
        }
      : null;
  });
  assert.ok(routeHeaderStyle);
  assert.equal(routeHeaderStyle.textTransform, "none");
  assert.equal(routeHeaderStyle.fontSize, "13px");

  const mapBounds = await page.locator(".contracts-map-panel .contracts-map").boundingBox();
  assert.ok(mapBounds);
  assert.equal(Math.abs(mapBounds.width - mapBounds.height) <= 1, true);

  const firstRouteCellText = (await page.locator(".contracts-board-table tbody tr").first().locator("td").nth(0).textContent()) ?? "";
  assert.equal(firstRouteCellText.includes("Nearest aircraft:"), false);
  const firstDueCellText = (await page.locator(".contracts-board-table tbody tr").first().locator("td").nth(5).textContent()) ?? "";
  assert.match(firstDueCellText, /[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}/);
  assert.match(firstDueCellText, /\d{2}D:\d{2}H:\d{2}M/);

  const popoverColumns = await contractsBoardTable.locator("[data-contracts-board-popover-toggle]").evaluateAll((elements) => {
    return elements.map((element) => ({
      column: element.getAttribute("data-contracts-board-popover-toggle") ?? "",
      label: element.getAttribute("aria-label") ?? "",
    }));
  });
  for (const { column, label } of popoverColumns) {
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
      return toggle instanceof HTMLElement && toggle.getAttribute("aria-expanded") === "false";
    }, label);
  }

  const baselineContractRows = await page.locator(".contracts-board-table tbody tr").count();
  const firstRouteCode = firstRouteCellText.match(/\b[A-Z]{3,4}\b/)?.[0] ?? "";
  assert.ok(firstRouteCode.length > 0);
  await clickUi(page.locator("button[aria-label='Route search']").first().locator("svg"));
  await page.waitForFunction(() => {
    const popover = document.querySelector("[data-contracts-board-popover='route']");
    return popover instanceof HTMLElement && !popover.hidden;
  });
  await page.locator("[data-contracts-board-popover='route'] input[name='routeSearchText']").fill(firstRouteCode);
  await page.waitForFunction(([expectedCode, expectedCount]) => {
    const rows = [...document.querySelectorAll(".contracts-board-table tbody tr")];
    return rows.length > 0
      && rows.length <= expectedCount
      && rows.every((row) => (row.textContent ?? "").includes(expectedCode));
  }, [firstRouteCode, baselineContractRows]);
  await page.locator("[data-contracts-board-popover='route'] input[name='routeSearchText']").fill("");
  await page.waitForFunction((expectedCount) => document.querySelectorAll(".contracts-board-table tbody tr").length === expectedCount, baselineContractRows);
  await page.keyboard.press("Escape");

  const firstAvailableRow = page.locator("[data-select-offer-row]").first();
  await clickUi(firstAvailableRow);
  await page.waitForFunction(() => document.querySelector("[data-contracts-selected-panel]")?.textContent?.includes("Selected Contract"));
  assert.equal(await page.locator("[data-accept-selected-offer]").count(), 1);

  const secondAvailableRow = page.locator("[data-select-offer-row]").nth(1);
  const hasSecondRow = (await secondAvailableRow.count()) > 0;
  const doubleClickTarget = hasSecondRow ? secondAvailableRow : firstAvailableRow;
  await forceRowDoubleClick(doubleClickTarget);
  await page.waitForFunction(() => document.querySelector(".contracts-next-step")?.textContent?.includes("Accept and dispatch"));
  assert.equal(await page.locator(".contracts-next-step [data-next-step-dispatch]").count(), 1);
  assert.equal((await page.locator(".contracts-next-step").textContent())?.includes("Send to route plan"), true);

  await clickUi(page.locator("[data-shell-tab='dashboard']"));
  await page.waitForFunction(() => document.querySelector("[data-overview-finance-section]"));
  await clickUi(page.locator("[data-shell-tab='contracts']"));
  await page.waitForFunction(() => document.querySelector(".contracts-workspace-tab[data-workspace-tab='board'][aria-selected='true']"));

  await clickUi(page.locator("[data-select-offer-row]").first());
  await page.waitForFunction(() => document.querySelector("[data-contracts-selected-panel]")?.textContent?.includes("Selected Contract"));
  await clickUi(page.locator("[data-accept-selected-offer]").first());
  await page.waitForFunction(() => document.querySelector(".contracts-next-step")?.textContent?.includes("Accept and dispatch"));
  await clickUi(page.locator(".contracts-next-step [data-open-route-plan]"));
  await page.waitForFunction(() => document.querySelector(".contracts-workspace-tab[data-workspace-tab='planning'][aria-selected='true']"));
  await page.waitForFunction(() => document.querySelector(".contracts-planner-panel")?.textContent?.includes("Route Planning"));
  await page.waitForFunction(() => document.querySelector("[name='plannerMatchCurrentEndpoint']") instanceof HTMLInputElement
    && (document.querySelector("[name='plannerMatchCurrentEndpoint']")?.checked ?? false) === true);

  assert.ok((await page.locator(".planner-summary-panel").textContent())?.includes("Current endpoint"));
  assert.ok((await page.locator(".planner-summary-panel").textContent())?.includes("Payout total"));
  assert.ok((await page.locator(".planner-summary-panel").textContent())?.includes("Continuity"));
  assert.equal(await page.locator(".planner-candidate-panel [data-accept-offer]").count(), 0);
  const plannerAddButtons = page.locator(".planner-candidate-panel [data-planner-add-candidate]");
  const initialPlannerAddCount = await plannerAddButtons.count();
  assert.ok(initialPlannerAddCount > 0);
  const plannerCandidateOfferId = await plannerAddButtons.first().getAttribute("data-planner-add-candidate");
  assert.ok(plannerCandidateOfferId);
  const initialRoutePlanItemCount = await page.locator(".planner-chain-panel .planner-item").count();
  assert.ok((await page.locator(".planner-chain-panel").textContent())?.includes("Accepted work"));

  await clickUi(plannerAddButtons.first());
  await page.waitForFunction((expectedCount) => document.querySelectorAll(".planner-chain-panel .planner-item").length === expectedCount, initialRoutePlanItemCount + 1);
  await page.waitForFunction((offerId) => !document.querySelector(`.planner-candidate-panel [data-planner-add-candidate="${offerId}"]`), plannerCandidateOfferId);
  await page.waitForFunction(() => document.querySelector(".planner-candidate-panel")?.textContent?.includes("Planned"));
  assert.ok((await page.locator(".planner-chain-panel .planner-item-source.accepted").count()) >= 1);
  assert.ok((await page.locator(".planner-chain-panel .planner-item-source.planned").count()) >= 1);
  backend = await createWorkspaceBackend();
  await backend.withExistingSaveDatabase(saveId, async (context) => {
    context.saveDatabase.run(
      `DELETE FROM contract_offer WHERE contract_offer_id = $contract_offer_id`,
      {
        $contract_offer_id: plannerCandidateOfferId,
      },
    );
    await context.saveDatabase.persist();
  });
  await backend.close();
  backend = null;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForURL(saveUrlPattern(saveId));
  await waitForShellTitle(page, displayName);
  await clickUi(page.locator("[data-shell-tab='contracts']"));
  await page.waitForFunction(() => document.querySelector(".contracts-workspace-tab[data-workspace-tab='board'][aria-selected='true']"));
  await clickUi(page.locator(".contracts-workspace-tab[data-workspace-tab='planning']"));
  await page.waitForFunction(() => document.querySelector(".contracts-workspace-tab[data-workspace-tab='planning'][aria-selected='true']"));
  await page.waitForFunction(() => document.querySelector(".planner-candidate-panel .planner-item.stale")?.textContent?.includes("Stale"));
  assert.equal(await page.locator(".planner-candidate-panel .planner-item.stale [data-planner-add-candidate]").count(), 0);

  await clickUi(page.locator(".contracts-workspace-tab[data-workspace-tab='board']"));
  await page.waitForFunction(() => document.querySelector(".contracts-workspace-tab[data-workspace-tab='board'][aria-selected='true']"));
  await clickUi(page.locator("[data-board-tab='active']"));
  await page.waitForFunction(() => document.body.innerText.includes("accepted / active contracts"));
  assert.ok((await page.locator("[data-select-company-contract-row]").count()) >= 1);
  assert.ok((await page.locator("[data-plan-add-contract]").count()) >= 1);

  await page.goto(`${server.baseUrl}/save/${encodeURIComponent(saveId)}?tab=contracts&contractsView=my_contracts`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector(".contracts-board-tab[data-board-scope='my_contracts'][aria-selected='true']"));
  assert.equal(await page.locator(".contracts-board-tab[data-board-scope='my_contracts']").getAttribute("aria-selected"), "true");
  assert.equal((await page.locator(".contracts-toolbar").textContent())?.includes("at-risk / overdue contracts"), true);
} finally {
  await Promise.allSettled([
    browser?.close(),
    server?.stop(),
    backend?.close(),
  ]);
  await removeWorkspaceSave(saveId);
}
