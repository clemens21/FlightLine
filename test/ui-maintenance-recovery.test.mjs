/*
 * Browser smoke for the Aircraft maintenance recovery flow.
 * This exercises the player path through the real UI: open Aircraft, start service, then advance time through Clock.
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
  openSaveUrlPattern,
  saveUrlPattern,
  waitForOpenSaveProgress,
} from "./helpers/playwright-ui-testkit.mjs";

const saveId = uniqueSaveId("ui_maintenance_browser");
const displayName = `UI Maintenance Browser ${saveId}`;
let server = null;
let browser = null;

function launcherSaveRow(page, saveId) {
  return page.locator(".launcher-save-row").filter({ hasText: saveId }).first();
}

async function placeAircraftInMaintenanceWindow(backend, saveId, aircraftId) {
  await backend.withExistingSaveDatabase(saveId, async (context) => {
    context.saveDatabase.run(
      `UPDATE company_aircraft
       SET status_input = 'available',
           dispatch_available = 1,
           active_schedule_id = NULL,
           active_maintenance_task_id = NULL
       WHERE aircraft_id = $aircraft_id`,
      { $aircraft_id: aircraftId },
    );

    context.saveDatabase.run(
      `UPDATE maintenance_program_state
       SET condition_band_input = 'fair',
           hours_since_inspection = 84,
           cycles_since_inspection = 17,
           hours_to_service = 4,
           maintenance_state_input = 'due_soon',
           aog_flag = 0
       WHERE aircraft_id = $aircraft_id`,
      { $aircraft_id: aircraftId },
    );

    await context.saveDatabase.persist();
  });
}

try {
  const backend = await createWorkspaceBackend();

  try {
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T13:00:00.000Z",
      displayName,
      startingCashAmount: 3_500_000,
    });

    await acquireAircraft(backend, saveId, startedAtUtc, {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      registration: "N208MB",
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    const aircraftId = fleetState.aircraft[0]?.aircraftId;
    assert.ok(aircraftId);

    await placeAircraftInMaintenanceWindow(backend, saveId, aircraftId);
  } finally {
    await backend.close();
  }

  const port = await allocatePort();
  server = await startUiServer(port);
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((currentSaveId) => {
    return [...document.querySelectorAll(".launcher-save-row")]
      .some((element) => (element.textContent ?? "").includes(currentSaveId));
  }, saveId);
  await Promise.all([
    page.waitForURL(openSaveUrlPattern(saveId)),
    clickUi(launcherSaveRow(page, saveId).getByRole("link", { name: "Open" })),
  ]);
  await waitForOpenSaveProgress(page);
  await page.waitForURL(saveUrlPattern(saveId));
  await page.waitForFunction(() => {
    return document.querySelector("[data-shell-tab='aircraft']") instanceof HTMLElement;
  });
  await clickUi(page.locator("[data-shell-tab='aircraft']"));
  await page.waitForFunction(() => {
    const aircraftHost = document.querySelector("[data-aircraft-tab-host]");
    const bodyText = document.body.textContent ?? "";
    return aircraftHost instanceof HTMLElement && bodyText.includes("Aircraft Workspace");
  });

  await page.waitForFunction(() => document.body.textContent?.includes("Maintenance recovery"));
  await clickUi(page.locator("button").filter({ hasText: "Start maintenance" }));
  await page.waitForFunction(() => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    return flashText.includes("Started maintenance recovery")
      && (document.body.textContent ?? "").includes("Maintenance in service");
  });

  await clickUi(page.locator("[data-clock-menu] summary"));
  await page.waitForFunction(() => document.querySelectorAll("[data-clock-day]").length === 42);
  const nextLocalDate = await page.evaluate(() => {
    const selected = document.querySelector(".clock-day.selected")?.getAttribute("data-clock-day") ?? "";
    const selectedMs = Date.parse(`${selected}T00:00:00`);
    const futureDates = [...document.querySelectorAll("[data-clock-day]")]
      .map((element) => element.getAttribute("data-clock-day") ?? "")
      .filter((date) => {
        const dateMs = Date.parse(`${date}T00:00:00`);
        return Number.isFinite(dateMs) && dateMs - selectedMs >= 3 * 24 * 3_600_000;
      })
      .sort();
    return futureDates[0] ?? "";
  });
  assert.ok(nextLocalDate);
  await clickUi(page.locator(`[data-clock-day='${nextLocalDate}']`));
  await page.waitForFunction((localDate) => {
    const button = document.querySelector(`[data-clock-sim-anchor-date="${localDate}"]`);
    return button instanceof HTMLButtonElement && !button.disabled;
  }, nextLocalDate);
  await clickUi(page.locator(`[data-clock-sim-anchor-date='${nextLocalDate}']`));
  await page.waitForFunction(() => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const bodyText = document.body.textContent ?? "";
    return flashText.length > 0
      && !bodyText.includes("Maintenance in service")
      && !bodyText.includes("Maintenance recovery");
  });

  assert.equal((await page.locator("body").textContent())?.includes("Maintenance in service"), false);
  assert.equal((await page.locator("body").textContent())?.includes("Maintenance recovery"), false);
} finally {
  await Promise.allSettled([
    browser?.close(),
    server?.stop(),
    removeWorkspaceSave(saveId),
  ]);
}
