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
  setContractsBoardBrowserTestMode,
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
const traceSteps = process.env.UI_TEST_TRACE_STEPS === "1";
const suiteStartedAtMs = Date.now();

let backend = null;
let server = null;
let browser = null;
const restoreContractsBoardBrowserTestMode = setContractsBoardBrowserTestMode();

function markStep(label) {
  if (!traceSteps) {
    return;
  }

  console.log(`[ui-contracts-workspace] +${Date.now() - suiteStartedAtMs}ms ${label}`);
}

async function assertContractsHeaderSort(page, field) {
  const button = page.locator(`.contracts-board-table [data-sort-field='${field}']`).first();
  await clickUi(button);
  const headerState = await button.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const column = element.closest("th");
    const probe = document.createElement("span");
    probe.style.color = "var(--accent)";
    document.body.appendChild(probe);
    const accentColor = window.getComputedStyle(probe).color;
    probe.remove();

    return {
      ariaSort: column?.getAttribute("aria-sort") ?? "",
      color: window.getComputedStyle(element).color,
      arrow: window.getComputedStyle(element, "::after").content,
      accentColor,
    };
  });

  assert.ok(headerState);
  assert.equal(headerState.ariaSort, "ascending");
  assert.equal(headerState.color, headerState.accentColor);
  assert.equal(headerState.arrow.includes("↑"), true);
}

try {
  markStep("start");
  backend = await createWorkspaceBackend();
  await seedUiRegressionSave(backend, { saveId, displayName });
  markStep("seeded save");
  await backend.close();
  backend = null;

  const port = await allocatePort();
  server = await startUiServer(port);
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 2200, height: 1300 } });
  markStep("server started");

  await page.goto(`${server.baseUrl}/save/${encodeURIComponent(saveId)}?tab=contracts`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL((url) => url.pathname === `/save/${saveId}` && url.searchParams.get("tab") === "contracts");
  await waitForShellTitle(page, displayName);
  await page.waitForFunction(() => document.querySelectorAll(".contracts-board-table tbody tr").length > 0);
  markStep("board loaded");

  assert.equal(await page.locator(".contracts-workspace-tab[data-workspace-tab='board']").getAttribute("aria-selected"), "true");
  assert.equal(await page.locator(".contracts-workspace-tab[data-workspace-tab='planning']").getAttribute("aria-selected"), "false");
  assert.equal(await page.locator(".contracts-toolbar-actions").count(), 1);
  assert.equal(await page.locator(".contracts-workspace-tabs").count(), 1);
  assert.equal(await page.locator(".contracts-toolbar .pill-row").count(), 0);
  assert.equal(await page.locator(".contracts-main-body > .contracts-filters").count(), 0);
  assert.equal(await page.locator("[data-plan-add-offer]").count(), 0);
  assert.ok((await page.locator("[data-contracts-board-popover-toggle]").count()) >= 7);

  const contractsBoardTable = page.locator(".contracts-board-table").first();
  const headerText = (await contractsBoardTable.locator("thead").textContent()) ?? "";
  assert.equal(/\bSORT\b|\bASC\b|\bDESC\b/.test(headerText), false);
  assert.equal(headerText.includes("Fit"), false);
  assert.equal(headerText.includes("Accept now"), false);
  assert.equal(headerText.includes("Nearest Aircraft"), true);
  assert.equal(headerText.includes("Route"), true);
  assert.equal(headerText.includes("Due"), true);
  const headerOrder = await contractsBoardTable.locator("thead th").evaluateAll((cells) =>
    cells.map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
  assert.deepEqual(headerOrder.slice(0, 7), [
    "Route",
    "Payload",
    "Payout",
    "Distance",
    "Hours Left",
    "Due",
    "Nearest Aircraft",
  ]);

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

  const mapPanelLayout = await page.evaluate(() => {
    const panel = document.querySelector(".contracts-map-panel");
    const map = panel?.querySelector(".contracts-map");
    const resetButton = panel?.querySelector("[data-map-reset]");
    if (!(panel instanceof HTMLElement) || !(map instanceof SVGElement) || !(resetButton instanceof HTMLButtonElement)) {
      return null;
    }

    const panelBounds = panel.getBoundingClientRect();
    const mapBounds = map.getBoundingClientRect();
    const resetBounds = resetButton.getBoundingClientRect();
    return {
      panelWidth: Math.round(panelBounds.width),
      panelHeight: Math.round(panelBounds.height),
      mapWidth: Math.round(mapBounds.width),
      mapHeight: Math.round(mapBounds.height),
      resetTopOffset: Math.round(resetBounds.top - panelBounds.top),
      resetRightOffset: Math.round(panelBounds.right - resetBounds.right),
      hasHeader: panel.querySelector("h3") instanceof HTMLElement,
      hasAttribution: panel.querySelector(".map-attribution") instanceof HTMLElement,
      hasResetIcon: resetButton.querySelector("svg") instanceof SVGElement,
      resetText: (resetButton.textContent ?? "").trim(),
    };
  });
  assert.ok(mapPanelLayout);
  assert.equal(Math.abs(mapPanelLayout.mapWidth - mapPanelLayout.mapHeight) <= 1, true);
  assert.ok(mapPanelLayout.mapWidth >= 360);
  assert.ok(mapPanelLayout.mapWidth >= mapPanelLayout.panelWidth - 4);
  assert.ok(mapPanelLayout.mapHeight >= mapPanelLayout.panelHeight - 4);
  assert.equal(mapPanelLayout.hasHeader, false);
  assert.equal(mapPanelLayout.hasAttribution, false);
  assert.equal(mapPanelLayout.hasResetIcon, true);
  assert.equal(mapPanelLayout.resetText, "");
  assert.ok(mapPanelLayout.resetTopOffset >= 8);
  assert.ok(mapPanelLayout.resetTopOffset <= 20);
  assert.ok(mapPanelLayout.resetRightOffset >= 8);
  assert.ok(mapPanelLayout.resetRightOffset <= 20);

  const firstRouteCellText = (await page.locator(".contracts-board-table tbody tr").first().locator("td").nth(0).textContent()) ?? "";
  assert.equal(firstRouteCellText.includes("Nearest aircraft:"), false);
  const firstDueCellText = (await page.locator(".contracts-board-table tbody tr").first().locator("td").nth(5).textContent()) ?? "";
  assert.match(firstDueCellText, /[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}/);
  assert.match(firstDueCellText, /\d{2}D:\d{2}H:\d{2}M/);

  await assertContractsHeaderSort(page, "distanceNm");
  await assertContractsHeaderSort(page, "route");
  await assertContractsHeaderSort(page, "payload");
  await assertContractsHeaderSort(page, "hoursRemaining");
  await assertContractsHeaderSort(page, "nearestAircraft");
  await assertContractsHeaderSort(page, "dueUtc");
  await assertContractsHeaderSort(page, "payout");
  markStep("header sorts");

  const baselineContractRows = await page.locator(".contracts-board-table tbody tr").count();
  const baselineColumnWidths = await page.evaluate(() => {
    return [...document.querySelectorAll(".contracts-board-table thead th")].map((column) => ({
      text: (column.textContent ?? "").trim(),
      width: Math.round(column.getBoundingClientRect().width),
    }));
  });
  const routeCodes = firstRouteCellText.match(/\b[A-Z]{3,4}\b/g) ?? [];
  const departureCode = routeCodes[0] ?? "";
  const destinationCode = routeCodes[1] ?? "";
  assert.ok(departureCode.length > 0);
  assert.ok(destinationCode.length > 0);
  await clickUi(page.locator("button[aria-label='Route search']").first());
  await page.waitForFunction(() => {
    const popover = document.querySelector("[data-contracts-board-popover='routeSearch']");
    return popover instanceof HTMLElement
      && popover.classList.contains("contracts-board-header-popover--search")
      && popover.querySelector("input[name='departureSearchText']") instanceof HTMLInputElement
      && popover.querySelector("input[name='destinationSearchText']") instanceof HTMLInputElement;
  });
  const routeSearchPopoverBounds = await page.evaluate(() => {
    const popover = document.querySelector("[data-contracts-board-popover='routeSearch']");
    if (!(popover instanceof HTMLElement)) {
      return null;
    }

    const bounds = popover.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      width: bounds.width,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  assert.ok(routeSearchPopoverBounds);
  assert.ok(routeSearchPopoverBounds.width >= 320);
  assert.ok(routeSearchPopoverBounds.left >= 0);
  assert.ok(routeSearchPopoverBounds.right <= routeSearchPopoverBounds.viewportWidth);
  assert.ok(routeSearchPopoverBounds.bottom <= routeSearchPopoverBounds.viewportHeight);
  const departureSearchInput = page.locator("[data-contracts-board-popover='routeSearch'] input[name='departureSearchText']");
  const departureSearchTerm = departureCode.slice(0, Math.max(1, Math.min(3, departureCode.length)));
  await departureSearchInput.fill("");
  await departureSearchInput.type(departureSearchTerm);
  await page.waitForFunction(() => {
    const input = document.querySelector("[data-contracts-board-popover='routeSearch'] input[name='departureSearchText']");
    return input instanceof HTMLInputElement
      && input.selectionStart === input.value.length
      && input.selectionEnd === input.value.length;
  });
  const departureSearchCaret = await departureSearchInput.evaluate((input) => ({
    value: input.value,
    selectionStart: input.selectionStart,
    selectionEnd: input.selectionEnd,
  }));
  assert.equal(departureSearchCaret.selectionStart, departureSearchCaret.value.length);
  assert.equal(departureSearchCaret.selectionEnd, departureSearchCaret.value.length);
  await departureSearchInput.fill(departureCode);
  await page.waitForFunction(([expectedCode, expectedCount]) => {
    const rows = [...document.querySelectorAll(".contracts-board-table tbody tr")];
    return rows.length > 0
      && rows.length <= expectedCount
      && rows.every((row) => (row.textContent ?? "").includes(expectedCode));
  }, [departureCode, baselineContractRows]);
  const filteredColumnWidths = await page.evaluate(() => {
    return [...document.querySelectorAll(".contracts-board-table thead th")].map((column) => ({
      text: (column.textContent ?? "").trim(),
      width: Math.round(column.getBoundingClientRect().width),
    }));
  });
  assert.deepEqual(filteredColumnWidths, baselineColumnWidths);
  await page.locator("[data-contracts-board-popover='routeSearch'] input[name='destinationSearchText']").fill(destinationCode);
  await page.waitForFunction(([expectedDeparture, expectedDestination, expectedCount]) => {
    const rows = [...document.querySelectorAll(".contracts-board-table tbody tr")];
    return rows.length > 0
      && rows.length <= expectedCount
      && rows.every((row) => {
        const text = row.textContent ?? "";
        return text.includes(expectedDeparture) && text.includes(expectedDestination);
      });
  }, [departureCode, destinationCode, baselineContractRows]);
  await page.locator("[data-contracts-board-popover='routeSearch'] input[name='departureSearchText']").fill("");
  await page.locator("[data-contracts-board-popover='routeSearch'] input[name='destinationSearchText']").fill("");
  await page.waitForFunction((expectedCount) => document.querySelectorAll(".contracts-board-table tbody tr").length === expectedCount, baselineContractRows);
  await page.keyboard.press("Escape");
  markStep("route search");

  await clickUi(page.locator("button[aria-label='Nearest Aircraft search']").first());
  await page.waitForFunction(() => {
    const popover = document.querySelector("[data-contracts-board-popover='aircraftSearch']");
    return popover instanceof HTMLElement
      && popover.classList.contains("contracts-board-header-popover--search")
      && popover.querySelector("input[name='nearestAircraftSearchText']") instanceof HTMLInputElement;
  });
  await page.keyboard.press("Escape");

  await clickUi(page.locator("button[aria-label='Nearest Aircraft filter']").first());
  await page.waitForFunction(() => {
    const popover = document.querySelector("[data-contracts-board-popover='aircraftFilter']");
    return popover instanceof HTMLElement
      && popover.classList.contains("contracts-board-header-popover--filter")
      && popover.querySelector("input[name='readyAircraft']") instanceof HTMLInputElement
      && popover.querySelector("input[name='noReadyAircraft']") instanceof HTMLInputElement;
  });
  assert.equal(await page.locator("[data-contracts-board-clear]").count(), 0);
  await page.keyboard.press("Escape");
  markStep("nearest aircraft controls");

  const payloadSamples = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".contracts-board-table tbody tr")];
    const passengerRow = rows.find((row) => /(\d[\d,]*)\s*pax/.test(row.textContent ?? ""));
    const cargoRow = rows.find((row) => /(\d[\d,]*)\s*lb cargo/.test(row.textContent ?? ""));
    const parseValue = (row, pattern) => {
      const text = row?.textContent ?? "";
      const match = text.match(pattern);
      return match ? Number.parseInt(match[1].replaceAll(",", ""), 10) : null;
    };
    return {
      passengerValue: parseValue(passengerRow, /(\d[\d,]*)\s*pax/),
      cargoValue: parseValue(cargoRow, /(\d[\d,]*)\s*lb cargo/),
      rowCount: rows.length,
    };
  });
  assert.ok(typeof payloadSamples.passengerValue === "number");
  assert.ok(typeof payloadSamples.cargoValue === "number");

  await clickUi(page.locator("button[aria-label='Payload filter']").first());
  await page.waitForFunction(() => {
    const popover = document.querySelector("[data-contracts-board-popover='payloadFilter']");
    return popover instanceof HTMLElement
      && popover.classList.contains("contracts-board-header-popover--filter")
      && popover.querySelector("input[name='passengerPayloadMin']") instanceof HTMLInputElement
      && popover.querySelector("input[name='passengerPayloadMax']") instanceof HTMLInputElement
      && popover.querySelector("input[name='cargoPayloadMin']") instanceof HTMLInputElement
      && popover.querySelector("input[name='cargoPayloadMax']") instanceof HTMLInputElement;
  });
  await page.locator("[data-contracts-board-popover='payloadFilter'] input[name='passengerPayloadMin']").fill(String(Math.max(0, payloadSamples.passengerValue - 1)));
  await page.locator("[data-contracts-board-popover='payloadFilter'] input[name='passengerPayloadMax']").fill(String(payloadSamples.passengerValue + 1));
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll(".contracts-board-table tbody tr")];
    return rows.length > 0 && rows.every((row) => /\bpax\b/.test(row.textContent ?? ""));
  });
  await page.locator("[data-contracts-board-popover='payloadFilter'] input[name='passengerPayloadMin']").fill("");
  await page.locator("[data-contracts-board-popover='payloadFilter'] input[name='passengerPayloadMax']").fill("");
  await page.waitForFunction((expectedCount) => document.querySelectorAll(".contracts-board-table tbody tr").length === expectedCount, payloadSamples.rowCount);
  await page.locator("[data-contracts-board-popover='payloadFilter'] input[name='cargoPayloadMin']").fill(String(Math.max(0, payloadSamples.cargoValue - 100)));
  await page.locator("[data-contracts-board-popover='payloadFilter'] input[name='cargoPayloadMax']").fill(String(payloadSamples.cargoValue + 100));
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll(".contracts-board-table tbody tr")];
    return rows.length > 0 && rows.every((row) => /\blb cargo\b/.test(row.textContent ?? ""));
  });
  await page.locator("[data-contracts-board-popover='payloadFilter'] input[name='cargoPayloadMin']").fill("");
  await page.locator("[data-contracts-board-popover='payloadFilter'] input[name='cargoPayloadMax']").fill("");
  await page.waitForFunction((expectedCount) => document.querySelectorAll(".contracts-board-table tbody tr").length === expectedCount, payloadSamples.rowCount);
  await page.keyboard.press("Escape");
  markStep("payload filter");

  const firstAvailableRow = page.locator("[data-select-offer-row]").first();
  await clickUi(firstAvailableRow);
  await page.waitForFunction(() => {
    const panel = document.querySelector("[data-contracts-selected-panel][data-accept-selected-pane]");
    return panel instanceof HTMLElement && panel.querySelector(".contracts-selected-route-title") instanceof HTMLElement;
  });
  assert.equal(await page.locator("[data-accept-selected-offer]").count(), 0);
  const selectedPanelLayout = await page.evaluate(() => {
    const selectedBody = document.querySelector(".contracts-selected-panel > .panel-body");
    const routeTitle = document.querySelector(".contracts-selected-route-title")?.textContent?.trim() ?? "";
    const summaryRows = document.querySelectorAll(".contracts-selected-summary-row").length;
    const pairRows = document.querySelectorAll(".contracts-selected-pair-row").length;
    return selectedBody instanceof HTMLElement
      ? {
        scrollHeight: selectedBody.scrollHeight,
        clientHeight: selectedBody.clientHeight,
          routeTitle,
          summaryRows,
          pairRows,
        }
      : null;
  });
  assert.ok(selectedPanelLayout);
  assert.ok(selectedPanelLayout.scrollHeight <= selectedPanelLayout.clientHeight + 2);
  assert.ok(selectedPanelLayout.routeTitle.includes("->"));
  assert.ok(selectedPanelLayout.summaryRows >= 1);
  assert.ok(selectedPanelLayout.pairRows >= 2);
  markStep("selected contract");

  await clickUi(page.locator("[data-accept-selected-pane]").first());
  await page.waitForFunction(() => document.querySelector(".contracts-next-step")?.textContent?.includes("Accept and dispatch"));
  assert.equal(await page.locator(".contracts-next-step [data-next-step-dispatch]").count(), 1);
  assert.equal((await page.locator(".contracts-next-step").textContent())?.includes("Send to route plan"), true);
  markStep("pane accept");

  await clickUi(page.locator("[data-shell-tab='dashboard']"));
  await page.waitForFunction(() => document.querySelector("[data-overview-finance-section]"));
  await clickUi(page.locator("[data-shell-tab='contracts']"));
  await page.waitForFunction(() => document.querySelector(".contracts-workspace-tab[data-workspace-tab='board'][aria-selected='true']"));
  markStep("accepted workflow persisted after tab round-trip");

  await clickUi(page.locator("[data-select-offer-row]").first());
  await page.waitForFunction(() => {
    const panel = document.querySelector("[data-contracts-selected-panel][data-accept-selected-pane]");
    return panel instanceof HTMLElement && panel.querySelector(".contracts-selected-route-title") instanceof HTMLElement;
  });
  await clickUi(page.locator("[data-accept-selected-pane]").first());
  await page.waitForFunction(() => document.querySelector(".contracts-next-step")?.textContent?.includes("Accept and dispatch"));
  await clickUi(page.locator(".contracts-next-step [data-open-route-plan]"));
  await page.waitForFunction(() => document.querySelector(".contracts-workspace-tab[data-workspace-tab='planning'][aria-selected='true']"));
  await page.waitForFunction(() => document.querySelector(".contracts-planner-panel")?.textContent?.includes("Route Planning"));
  await page.waitForFunction(() => document.querySelector(".planner-anchor-table tbody tr.selected"));
  await page.waitForFunction(() => document.querySelectorAll(".planner-table-panel [data-planner-table-view]").length === 2);
  markStep("planner opened");

  assert.equal(await page.locator(".planner-table-panel [data-planner-table-view='accepted']").count(), 1);
  assert.equal(await page.locator(".planner-table-panel [data-planner-table-view='candidates']").count(), 1);
  assert.equal(await page.locator(".planner-table-panel [data-planner-table-view='accepted'][aria-selected='true']").count(), 1);
  assert.equal(await page.locator(".planner-anchor-table.contracts-board-table").count(), 1);
  assert.equal(await page.locator(".planner-candidate-table.contracts-board-table").count(), 0);
  assert.equal(await page.locator(".planner-anchor-table [data-planner-anchor-popover-toggle='plannerRouteSearch']").count(), 1);
  assert.equal(await page.locator(".planner-anchor-table [data-planner-anchor-popover-toggle='plannerHoursFilter']").count(), 1);
  assert.equal(await page.locator(".planner-anchor-table [data-planner-anchor-popover-toggle='plannerDueFilter']").count(), 1);
  assert.equal(await page.locator(".planner-inline-callout").count(), 0);
  assert.equal(await page.locator("[data-contracts-plan-map]").count(), 0);
  assert.equal(await page.locator(".planner-chain-map-card").count(), 0);
  const plannerAnchorHeaderOrder = await page.locator(".planner-anchor-table thead th").evaluateAll((cells) =>
    cells.map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
  assert.deepEqual(plannerAnchorHeaderOrder, [
    "Route",
    "Hours Left",
    "Due",
  ]);
  assert.equal(await page.locator("select[name='plannerAircraftId']").count(), 1);
  const plannerBodyLayout = await page.evaluate(() => {
    const plannerBody = document.querySelector(".contracts-planner-body");
    const anchorWrap = document.querySelector(".planner-anchor-table-wrap");
    const plannerShell = document.querySelector(".planner-shell");
    const tablePanel = document.querySelector(".planner-table-panel");
    return plannerBody instanceof HTMLElement
      && anchorWrap instanceof HTMLElement
      && plannerShell instanceof HTMLElement
      && tablePanel instanceof HTMLElement
      ? {
          plannerOverflowY: window.getComputedStyle(plannerBody).overflowY,
          anchorOverflowY: window.getComputedStyle(anchorWrap).overflowY,
          anchorWidth: tablePanel.getBoundingClientRect().width,
          shellWidth: plannerShell.getBoundingClientRect().width,
        }
      : null;
  });
  assert.ok(plannerBodyLayout);
  assert.equal(plannerBodyLayout.plannerOverflowY, "hidden");
  assert.ok(["auto", "scroll"].includes(plannerBodyLayout.anchorOverflowY));
  assert.ok((plannerBodyLayout.anchorWidth / plannerBodyLayout.shellWidth) > 0.43);
  assert.ok((plannerBodyLayout.anchorWidth / plannerBodyLayout.shellWidth) < 0.57);
  const plannerAnchorFirstRouteText = (await page.locator(".planner-anchor-table tbody tr").first().locator("td").nth(0).textContent()) ?? "";
  const plannerAnchorCodes = plannerAnchorFirstRouteText.match(/\b[A-Z]{3,4}\b/g) ?? [];
  const plannerAnchorDepartureCode = plannerAnchorCodes[0] ?? "";
  assert.ok(plannerAnchorDepartureCode.length > 0);
  await clickUi(page.locator(".planner-anchor-table [data-planner-anchor-popover-toggle='plannerRouteSearch']").first());
  await page.waitForFunction(() => {
    const popover = document.querySelector("[data-planner-anchor-popover='plannerRouteSearch']");
    return popover instanceof HTMLElement
      && popover.querySelector("input[name='departureSearchText']") instanceof HTMLInputElement
      && popover.querySelector("input[name='destinationSearchText']") instanceof HTMLInputElement;
  });
  await page.locator("[data-planner-anchor-popover='plannerRouteSearch'] input[name='departureSearchText']").fill(plannerAnchorDepartureCode);
  await page.waitForFunction((expectedCode) => {
    const rows = [...document.querySelectorAll(".planner-anchor-table tbody tr")];
    return rows.length > 0 && rows.every((row) => (row.textContent ?? "").includes(expectedCode));
  }, plannerAnchorDepartureCode);
  await page.locator("[data-planner-anchor-popover='plannerRouteSearch'] input[name='departureSearchText']").fill("");
  await page.keyboard.press("Escape");
  await clickUi(page.locator(".planner-anchor-table button[data-planner-anchor-sort-field='dueUtc']").first());
  const plannerAnchorDueSort = await page.locator(".planner-anchor-table button[data-planner-anchor-sort-field='dueUtc']").evaluate((button) => {
    const column = button.closest("th");
    return {
      ariaSort: column?.getAttribute("aria-sort") ?? "",
      current: button.classList.contains("current"),
    };
  });
  assert.equal(plannerAnchorDueSort.ariaSort, "ascending");
  assert.equal(plannerAnchorDueSort.current, true);
  await clickUi(page.locator(".planner-table-panel [data-planner-table-view='candidates']").first());
  await page.waitForFunction(() => document.querySelector(".planner-table-panel [data-planner-table-view='candidates'][aria-selected='true']"));
  await page.waitForFunction(() => document.querySelector(".planner-candidate-table"));
  const plannerCandidateHeaderOrder = await page.locator(".planner-candidate-table thead th").evaluateAll((cells) =>
    cells.map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
  assert.deepEqual(plannerCandidateHeaderOrder, [
    "Route",
    "Payload",
    "Payout",
    "Distance",
    "Hours Left",
    "Due",
    "Plan",
  ]);
  const plannerAddButtons = page.locator(".planner-table-panel [data-planner-add-candidate]");
  let initialPlannerAddCount = await plannerAddButtons.count();
  if (initialPlannerAddCount === 0) {
    await clickUi(page.locator(".planner-table-panel [data-planner-table-view='accepted']").first());
    await page.waitForFunction(() => document.querySelector(".planner-table-panel [data-planner-table-view='accepted'][aria-selected='true']"));
    await page.waitForFunction(() => document.querySelector(".planner-anchor-table"));
    const inChainAnchorRow = page.locator(".planner-anchor-table tbody tr[data-planner-anchor-in-chain='true']").first();
    assert.equal(await inChainAnchorRow.count(), 1);
    await clickUi(inChainAnchorRow);
    await clickUi(page.locator(".planner-table-panel [data-planner-table-view='candidates']").first());
    await page.waitForFunction(() => document.querySelector(".planner-table-panel [data-planner-table-view='candidates'][aria-selected='true']"));
    await page.waitForFunction(() => document.querySelectorAll(".planner-table-panel [data-planner-add-candidate]").length > 0);
    initialPlannerAddCount = await plannerAddButtons.count();
  }
  assert.ok(initialPlannerAddCount > 0);
  const plannerNextOriginCode = ((await page.locator("[data-planner-next-origin] strong").textContent()) ?? "").trim();
  assert.ok(plannerNextOriginCode.length > 0);
  await page.waitForFunction((expectedOriginCode) => {
    const rows = [...document.querySelectorAll(".planner-candidate-table tbody tr")];
    return rows.length > 0 && rows.every((row) => {
      const routeCell = row.querySelector("td");
      const text = (routeCell?.textContent ?? "").replace(/\s+/g, " ").trim();
      return text.includes(`Departure: ${expectedOriginCode} -`);
    });
  }, plannerNextOriginCode);
  const plannerAircraftSelect = page.locator("select[name='plannerAircraftId']");
  const plannerAircraftOptions = await plannerAircraftSelect.locator("option").evaluateAll((options) =>
    options.map((option) => ({
      value: option.getAttribute("value") ?? "",
      text: option.textContent ?? "",
    })),
  );
  assert.ok(plannerAircraftOptions.length > 1);
  const firstAircraftOption = plannerAircraftOptions.find((option) => option.value);
  assert.ok(firstAircraftOption);
  await plannerAircraftSelect.selectOption(firstAircraftOption.value);
  await page.waitForFunction((registration) => {
    return document.querySelector(".planner-setup-strip")?.textContent?.includes(registration) ?? false;
  }, firstAircraftOption.text.split("|")[0]?.trim() ?? "");
  const filteredPlannerAddCount = await plannerAddButtons.count();
  assert.ok(filteredPlannerAddCount <= initialPlannerAddCount);
  await plannerAircraftSelect.selectOption("");
  await page.waitForFunction(() => document.querySelectorAll(".planner-table-panel [data-planner-add-candidate]").length > 0);
  const plannerCandidateOfferId = await plannerAddButtons.first().getAttribute("data-planner-add-candidate");
  assert.ok(plannerCandidateOfferId);
  const initialRoutePlanItemCount = await page.locator(".planner-chain-panel .planner-item").count();
  assert.ok((await page.locator(".planner-chain-panel").textContent())?.includes("Accepted work"));

  await clickUi(plannerAddButtons.first());
  await page.waitForFunction((expectedCount) => document.querySelectorAll(".planner-chain-panel .planner-item").length === expectedCount, initialRoutePlanItemCount + 1);
  await page.waitForFunction((offerId) => !document.querySelector(`.planner-table-panel [data-planner-add-candidate="${offerId}"]`), plannerCandidateOfferId);
  await page.waitForFunction(() => document.querySelector(".planner-chain-panel")?.textContent?.includes("Planned candidate"));
  markStep("planner add candidate");
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
  await page.waitForFunction(() => document.querySelector(".planner-chain-panel .planner-item.candidate_stale, .planner-chain-panel .planner-item.candidate_offer.candidate_stale, .planner-chain-panel .planner-item.candidate_stale") || document.querySelector(".planner-chain-panel")?.textContent?.includes("candidate stale"));
  markStep("reload and stale candidate verification");
  assert.equal(await page.locator(".planner-chain-panel [data-plan-remove-item]").count() >= 1, true);

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
  markStep("suite complete");
} finally {
  await Promise.allSettled([
    browser?.close(),
    server?.stop(),
    backend?.close(),
  ]);
  await removeWorkspaceSave(saveId);
  restoreContractsBoardBrowserTestMode();
}
