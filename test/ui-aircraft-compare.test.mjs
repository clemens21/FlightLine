/*
 * Browser coverage for the aircraft comparison workspace.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  createCompanySave,
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

const saveId = uniqueSaveId("ui_aircraft_compare");
const displayName = `Aircraft Compare ${saveId}`;

let server = null;
let browser = null;

try {
  const backend = await createWorkspaceBackend();
  try {
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T13:00:00.000Z",
      displayName,
      startingCashAmount: 500_000_000,
    });

    for (const [index, aircraftModelId] of [
      "cessna_208b_grand_caravan_ex_passenger",
      "cessna_208b_grand_caravan_ex_passenger",
      "cessna_208b_grand_caravan_ex_passenger",
      "cessna_208b_grand_caravan_ex_passenger",
      "cessna_208b_grand_caravan_ex_passenger",
    ].entries()) {
      await acquireAircraft(backend, saveId, startedAtUtc, {
        registration: `N${201 + index}CF`,
        aircraftModelId,
      });
    }

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    assert.ok(fleetState.aircraft.length >= 5);
    const [firstAircraft, secondAircraft, thirdAircraft, fourthAircraft, fifthAircraft] = fleetState.aircraft;
    assert.ok(firstAircraft);
    assert.ok(secondAircraft);
    assert.ok(thirdAircraft);
    assert.ok(fourthAircraft);
    assert.ok(fifthAircraft);

    const port = await allocatePort();
    server = await startUiServer(port);
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.goto(`${server.baseUrl}/save/${encodeURIComponent(saveId)}?tab=aircraft`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === `/save/${saveId}` && url.searchParams.get("tab") === "aircraft");
    await waitForShellTitle(page, displayName);
    await page.waitForFunction(() => document.querySelectorAll(".aircraft-row").length >= 5);

    await clickUi(page.locator(`.aircraft-table-wrap .aircraft-row[data-aircraft-select='${firstAircraft.aircraftId}'] [data-aircraft-compare-toggle]`));
    await clickUi(page.locator(`.aircraft-table-wrap .aircraft-row[data-aircraft-select='${secondAircraft.aircraftId}'] [data-aircraft-compare-toggle]`));
    await page.waitForFunction(() => {
      const overlay = document.querySelector("[data-aircraft-compare-overlay]");
      const cards = document.querySelectorAll("[data-aircraft-compare-focus]");
      return overlay instanceof HTMLElement
        && !overlay.hidden
        && cards.length === 2
        && (document.querySelector("[data-aircraft-compare-open]")?.textContent ?? "").includes("Compare 2");
    });

    await clickUi(page.locator(`[data-aircraft-compare-overlay] [data-aircraft-compare-id='${secondAircraft.aircraftId}'] [data-aircraft-compare-baseline]`).first());
    await page.waitForFunction((expectedId) => {
      const baselineCard = document.querySelector("[data-aircraft-compare-focus].baseline");
      return baselineCard instanceof HTMLElement && baselineCard.getAttribute("data-aircraft-compare-id") === expectedId;
    }, secondAircraft.aircraftId);

    await clickUi(page.locator("[data-aircraft-compare-close]").first());
    await page.waitForFunction(() => {
      const dock = document.querySelector("[data-aircraft-compare-dock]");
      const overlay = document.querySelector("[data-aircraft-compare-overlay]");
      return dock instanceof HTMLElement
        && !dock.hidden
        && (!overlay || overlay.hidden);
    });

    await clickUi(page.locator("[data-aircraft-compare-open]").first());
    await page.waitForFunction(() => {
      const overlay = document.querySelector("[data-aircraft-compare-overlay]");
      return overlay instanceof HTMLElement && !overlay.hidden;
    });

    await clickUi(page.locator("[data-aircraft-compare-close]").first());
    await page.waitForFunction(() => {
      const dock = document.querySelector("[data-aircraft-compare-dock]");
      return dock instanceof HTMLElement && !dock.hidden;
    });

    await clickUi(page.locator(`.aircraft-table-wrap .aircraft-row[data-aircraft-select='${thirdAircraft.aircraftId}'] [data-aircraft-compare-toggle]`));
    await page.waitForFunction(() => {
      const overlay = document.querySelector("[data-aircraft-compare-overlay]");
      const cards = document.querySelectorAll("[data-aircraft-compare-focus]");
      return overlay instanceof HTMLElement && !overlay.hidden && cards.length === 3;
    });

    await clickUi(page.locator("[data-aircraft-compare-close]").first());
    await clickUi(page.locator(`.aircraft-table-wrap .aircraft-row[data-aircraft-select='${fourthAircraft.aircraftId}'] [data-aircraft-compare-toggle]`));
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll("[data-aircraft-compare-focus]");
      return cards.length === 4;
    });

    await clickUi(page.locator("[data-aircraft-compare-close]").first());
    await clickUi(page.locator("[data-shell-tab='aircraft']"));
    await clickUi(page.locator("[data-aircraft-workspace='market']"));
    await page.waitForFunction(() => document.querySelectorAll(".aircraft-market-panel .aircraft-row").length > 0);

    const marketCompareRow = page.locator(".aircraft-market-panel .aircraft-row").first();
    const marketCompareButton = marketCompareRow.locator("[data-aircraft-compare-toggle]").first();
    const fifthCompareId = await marketCompareButton.getAttribute("data-aircraft-compare-id");
    assert.ok(fifthCompareId);
    const fifthCompareLabel = (await marketCompareRow.locator(".aircraft-market-listing .route").first().textContent())?.trim() ?? "";
    await clickUi(marketCompareButton);
    await page.waitForFunction((expectedId) => {
      const overlay = document.querySelector("[data-aircraft-compare-overlay]");
      const banner = document.querySelector(".aircraft-compare-replacement");
      const cards = document.querySelectorAll("[data-aircraft-compare-focus]");
      return overlay instanceof HTMLElement
        && !overlay.hidden
        && banner instanceof HTMLElement
        && cards.length === 4
        && (banner.textContent ?? "").includes("Choose one aircraft to replace");
    }, fifthCompareId);

    await clickUi(page.locator("[data-aircraft-compare-replace]").first());
    await page.waitForFunction((expectedLabel) => {
      const overlay = document.querySelector("[data-aircraft-compare-overlay]");
      const cards = [...document.querySelectorAll("[data-aircraft-compare-focus]")];
      const overlayText = overlay?.textContent ?? "";
      return overlay instanceof HTMLElement
        && !overlay.hidden
        && cards.length === 4
        && overlayText.includes(expectedLabel);
    }, fifthCompareLabel);

    await clickUi(page.locator(`[data-aircraft-compare-focus]`).filter({ hasText: fifthCompareLabel }).first().locator("[data-aircraft-compare-baseline]").first());
    await page.waitForFunction((expectedLabel) => {
      const baselineCard = document.querySelector("[data-aircraft-compare-focus].baseline");
      return baselineCard instanceof HTMLElement && (baselineCard.textContent ?? "").includes(expectedLabel);
    }, fifthCompareLabel);

    await page.setViewportSize({ width: 900, height: 700 });
    await page.waitForFunction(() => {
      const layout = document.querySelector("[data-aircraft-compare-overlay] .aircraft-compare-layout");
      const content = document.querySelector("[data-aircraft-compare-overlay] .aircraft-compare-content");
      const rail = document.querySelector("[data-aircraft-compare-overlay] .aircraft-compare-rail");
      if (!(layout instanceof HTMLElement) || !(content instanceof HTMLElement) || !(rail instanceof HTMLElement)) {
        return false;
      }

      const gridTemplateColumns = window.getComputedStyle(layout).gridTemplateColumns;
      const contentRect = content.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      return gridTemplateColumns.split(" ").length === 1 && railRect.top >= contentRect.bottom - 2;
    });
  } finally {
    await backend.close();
  }
} finally {
  if (browser) {
    await browser.close();
  }
  if (server) {
    await server.stop();
  }
  await removeWorkspaceSave(saveId);
}
