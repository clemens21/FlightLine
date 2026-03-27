/*
 * Focused browser coverage for the Aircraft Market workspace.
 * This keeps header-control, filtering, overlay, and purchase assertions out of the broad shell smoke.
 */

import assert from "node:assert/strict";

import { uniqueSaveId } from "./helpers/flightline-testkit.mjs";
import {
  seedUiRegressionSave,
  uiRegressionRegistrations,
} from "./helpers/ui-regression-scenario.mjs";
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

const saveId = uniqueSaveId("ui_aircraft_market");
const displayName = `Aircraft Market ${saveId}`;

let backend = null;
let server = null;
let browser = null;

try {
  backend = await createWorkspaceBackend();
  await seedUiRegressionSave(backend, { saveId, displayName });
  await backend.close();
  backend = null;

  const port = await allocatePort();
  server = await startUiServer(port);
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${server.baseUrl}/save/${encodeURIComponent(saveId)}?tab=aircraft`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === `/save/${saveId}` && url.searchParams.get("tab") === "aircraft");
  await waitForShellTitle(page, displayName);

  await page.waitForFunction(() => document.querySelector(".aircraft-detail-panel") !== null);
  await page.waitForFunction(() => {
    const filters = [...document.querySelectorAll("[data-aircraft-filter]")];
    return filters.length === 2
      && filters.every((entry) => entry instanceof HTMLSelectElement && entry.selectedOptions[0]?.textContent?.trim() === "All");
  });
  const constrainedRow = page.locator(".aircraft-row").filter({ hasText: uiRegressionRegistrations.constrained }).first();
  await clickUi(constrainedRow.locator("td").nth(1));
  await page.waitForFunction(() => document.querySelector(".aircraft-detail-panel")?.textContent?.includes("N20CUI"));
  assert.equal((await page.locator(".aircraft-detail-panel").textContent())?.toLowerCase().includes("grounded"), true);
  await page.locator("[data-aircraft-filter='risk']").selectOption("critical");
  await page.waitForFunction(() => document.querySelectorAll(".aircraft-row-button").length === 1);
  assert.equal(await page.locator(".aircraft-row-button").count(), 1);

  await clickUi(page.locator("[data-aircraft-workspace='market']"));
  await page.waitForFunction(() => document.querySelector("[data-aircraft-workspace='market']")?.getAttribute("aria-selected") === "true");
  const initialMarketRows = await page.locator("[data-market-select]").count();
  assert.ok(initialMarketRows > 0);
  assert.equal(await page.locator(".market-toolbar").count(), 0);
  assert.ok((await page.locator("[data-market-popover-toggle]").count()) >= 7);

  const aircraftMarketTable = page.locator(".aircraft-market-table").first();
  const headerText = (await aircraftMarketTable.locator("thead").textContent()) ?? "";
  assert.equal(/\bSORT\b|\bASC\b|\bDESC\b/.test(headerText), false);
  assert.equal(headerText.includes("Capability"), false);
  assert.equal(headerText.includes("Passengers"), true);
  assert.equal(headerText.includes("Cargo"), true);
  assert.equal(headerText.includes("Range"), true);

  const listingHeaderStyle = await aircraftMarketTable.locator("button[aria-label='Listing search']").first().evaluate((button) => {
    const headerControl = button.closest(".table-header-control");
    const label = headerControl?.querySelector(".table-header-label, .table-sort");
    return label instanceof HTMLElement
      ? {
          textTransform: window.getComputedStyle(label).textTransform,
          fontSize: window.getComputedStyle(label).fontSize,
        }
      : null;
  });
  assert.ok(listingHeaderStyle);
  assert.equal(listingHeaderStyle.textTransform, "none");
  assert.equal(listingHeaderStyle.fontSize, "13px");

  const popoverColumns = await aircraftMarketTable.locator("[data-market-popover-toggle]").evaluateAll((elements) => {
    return elements.map((element) => ({
      column: element.getAttribute("data-market-popover-toggle") ?? "",
      label: element.getAttribute("aria-label") ?? "",
    }));
  });
  for (const { column, label } of popoverColumns) {
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
      return toggle instanceof HTMLElement && toggle.getAttribute("aria-expanded") === "false";
    }, label);
  }

  await clickUi(aircraftMarketTable.locator("button[aria-label='Distance filter']").first().locator("svg"));
  await page.waitForFunction(() => {
    const popover = document.querySelector("[data-market-popover='distance']");
    return popover instanceof HTMLElement && !popover.hidden;
  });
  const distancePopoverBounds = await page.locator("[data-market-popover='distance']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
    };
  });
  assert.ok(distancePopoverBounds);
  assert.ok(distancePopoverBounds.left >= 0);
  assert.ok(distancePopoverBounds.right <= distancePopoverBounds.viewportWidth);
  await clickUi(aircraftMarketTable.locator("button[aria-label='Distance filter']").first().locator("svg"));
  await page.waitForFunction(() => document.querySelector("button[aria-label='Distance filter']")?.getAttribute("aria-expanded") === "false");

  const firstListingLabel = ((await page.locator("[data-market-select]").first().locator(".aircraft-market-listing .route").textContent()) ?? "").trim();
  const firstListingRegistration = (((await page.locator("[data-market-select]").first().locator(".aircraft-market-listing .muted").textContent()) ?? "").split("|")[0] ?? "").trim();
  assert.ok(firstListingLabel.length > 0);
  assert.ok(firstListingRegistration.length > 0);
  await clickUi(page.locator("button[aria-label='Listing search']").first().locator("svg"));
  await page.waitForFunction(() => {
    const popover = document.querySelector("[data-market-popover='listing']");
    return popover instanceof HTMLElement && !popover.hidden;
  });
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
  assert.ok(filteredMarketOverlayBounds.left >= -2);
  assert.ok(filteredMarketOverlayBounds.right <= filteredMarketOverlayBounds.viewportWidth + 2);
  await clickUi(page.locator("[data-aircraft-market-close]").first());
  await page.waitForFunction(() => document.querySelector("[data-aircraft-market-overlay]")?.hasAttribute("hidden") ?? false);

  await clickUi(page.locator("button[aria-label='Condition filter']").first().locator("svg"));
  await page.waitForFunction(() => {
    const popover = document.querySelector("[data-market-popover='condition']");
    return popover instanceof HTMLElement && !popover.hidden;
  });
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
  await page.waitForFunction(() => {
    const popover = document.querySelector("[data-market-popover='listing']");
    return popover instanceof HTMLElement && !popover.hidden;
  });
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
  assert.equal(await page.locator(`[data-market-select='${selectedOfferId}']`).count(), 0);
  assert.equal(await page.locator("[data-market-select]").count(), initialMarketRows - 1);
} finally {
  await Promise.allSettled([
    browser?.close(),
    server?.stop(),
    backend?.close(),
  ]);
  await removeWorkspaceSave(saveId);
}
