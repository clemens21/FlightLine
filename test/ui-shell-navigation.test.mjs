/*
 * Regression coverage for ui shell navigation.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
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
  readTheme,
  saveUrlPattern,
  waitForOpenSaveProgress,
  waitForShellTitle,
  waitForTheme,
} from "./helpers/playwright-ui-testkit.mjs";

const seededSaveId = uniqueSaveId("ui_shell");
const launcherSaveId = uniqueSaveId("ui_launcher");
const deleteSaveId = uniqueSaveId("ui_delete");
const displayName = `UI Shell ${seededSaveId}`;

let server = null;
let browser = null;

function launcherSaveRow(page, saveId) {
  return page.locator(".launcher-save-row").filter({ hasText: saveId }).first();
}

function parseAirportCode(detailText, prefix) {
  const match = new RegExp(`${prefix}:\\s*([A-Z0-9]{3,4})\\s*-`).exec(detailText ?? "");
  assert.ok(match, `Could not parse ${prefix} airport code from "${detailText}".`);
  return match[1];
}

async function waitForLauncher(page) {
  await page.waitForURL((url) => url.pathname === "/");
  await page.waitForFunction(() => document.body.innerText.includes("Open or Create Save"));
}

async function waitForCompanyClock(page) {
  await page.waitForFunction(() => {
    const text = document.querySelector("[data-clock-label]")?.textContent?.trim() ?? "";
    return text.length > 0 && text !== "Loading..." && text !== "Setup first";
  });
}

try {
  const backend = await createWorkspaceBackend();
  try {
    const startedAtUtc = await createCompanySave(backend, seededSaveId, {
      startedAtUtc: "2026-03-16T13:00:00.000Z",
      displayName,
      startingCashAmount: 6_500_000,
    });

    await acquireAircraft(backend, seededSaveId, startedAtUtc, {
      registration: "N208NAV",
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    });
    await activateStaffingPackage(backend, seededSaveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 2,
      fixedCostAmount: 12_000,
    });

    const refreshBoardResult = await backend.dispatch({
      commandId: `cmd_${seededSaveId}_refresh`,
      saveId: seededSaveId,
      commandName: "RefreshContractBoard",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        refreshReason: "bootstrap",
      },
    });
    assert.equal(refreshBoardResult.success, true);

    const createDeleteSaveResult = await backend.dispatch({
      commandId: `cmd_${deleteSaveId}_create`,
      saveId: deleteSaveId,
      commandName: "CreateSaveGame",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        worldSeed: deleteSaveId,
        difficultyProfile: "standard",
        startTimeUtc: startedAtUtc,
      },
    });
    assert.equal(createDeleteSaveResult.success, true);
  } finally {
    await backend.close();
  }

  const port = await allocatePort();
  server = await startUiServer(port);
  browser = await launchBrowser();
  const page = await browser.newPage();

  await page.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
  await waitForLauncher(page);
  assert.equal(await page.title(), "Open or Create Save");
  assert.equal(await launcherSaveRow(page, seededSaveId).count(), 1);

  const launcherTheme = await readTheme(page);
  const toggledLauncherTheme = launcherTheme === "dark" ? "light" : "dark";
  await clickUi(page.locator(".theme-toggle"));
  await waitForTheme(page, toggledLauncherTheme);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForLauncher(page);
  assert.equal(await readTheme(page), toggledLauncherTheme);

  await page.locator("input[name='saveName']").fill(launcherSaveId);
  await Promise.all([
    page.waitForURL(openSaveUrlPattern(launcherSaveId)),
    clickUi(page.getByRole("button", { name: "Create save" })),
  ]);
  await waitForOpenSaveProgress(page);
  assert.equal((await page.locator("[data-loader-title]").textContent())?.includes(launcherSaveId), true);

  await page.waitForURL(saveUrlPattern(launcherSaveId));
  await waitForShellTitle(page, `Save ${launcherSaveId}`);
  assert.equal(await page.locator("[data-shell-subtitle]").textContent(), "Create a company to begin operating.");
  assert.equal(await page.locator("[data-clock-label]").textContent(), "Setup first");
  assert.equal(await page.locator("[data-clock-rate]").textContent(), "--");

  await clickUi(page.locator("[data-clock-menu] summary"));
  await page.waitForFunction(() => document.querySelector("[data-clock-menu]")?.open === true);
  assert.ok((await page.locator("[data-clock-panel]").textContent())?.includes("Create a company before opening the clock and calendar."));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("[data-clock-menu]")?.open !== true);

  await clickUi(page.locator("[data-settings-menu] summary"));
  const settingsThemeLabel = toggledLauncherTheme === "dark" ? "Dark" : "Light";
  await page.waitForFunction((label) => document.querySelector("[data-settings-theme-label]")?.textContent === label, settingsThemeLabel);
  assert.equal((await page.locator("[data-settings-menu]").textContent())?.includes(launcherSaveId), true);

  const shellTheme = toggledLauncherTheme === "dark" ? "light" : "dark";
  const shellThemeLabel = shellTheme === "dark" ? "Dark" : "Light";
  await clickUi(page.locator("[data-settings-theme]"));
  await waitForTheme(page, shellTheme);
  await page.waitForFunction((label) => document.querySelector("[data-settings-theme-label]")?.textContent === label, shellThemeLabel);

  await clickUi(page.locator("[data-settings-menu] summary"));
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/"),
    clickUi(page.locator("[data-settings-menu] a[href='/']")),
  ]);
  await waitForLauncher(page);
  assert.equal(await readTheme(page), shellTheme);
  assert.equal(await launcherSaveRow(page, launcherSaveId).count(), 1);
  assert.equal(await launcherSaveRow(page, deleteSaveId).count(), 1);

  await Promise.all([
    page.waitForURL((url) => url.pathname === "/" && url.searchParams.get("confirmDelete") === launcherSaveId),
    clickUi(launcherSaveRow(page, launcherSaveId).getByRole("link", { name: "Delete" })),
  ]);
  await page.waitForFunction((saveId) => {
    const row = [...document.querySelectorAll(".launcher-save-row")]
      .find((entry) => entry.textContent?.includes(saveId));
    return row?.textContent?.includes("Confirm delete") && row.textContent?.includes("Cancel");
  }, launcherSaveId);

  await Promise.all([
    page.waitForURL((url) => url.pathname === "/" && !url.searchParams.has("confirmDelete")),
    clickUi(page.getByRole("link", { name: "Cancel" })),
  ]);
  await waitForLauncher(page);
  assert.equal(await launcherSaveRow(page, launcherSaveId).count(), 1);

  await Promise.all([
    page.waitForURL((url) => url.pathname === "/" && url.searchParams.get("confirmDelete") === deleteSaveId),
    clickUi(launcherSaveRow(page, deleteSaveId).getByRole("link", { name: "Delete" })),
  ]);
  await page.waitForFunction((saveId) => {
    const row = [...document.querySelectorAll(".launcher-save-row")]
      .find((entry) => entry.textContent?.includes(saveId));
    return row?.textContent?.includes("Confirm delete");
  }, deleteSaveId);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/" && !url.searchParams.has("confirmDelete")),
    clickUi(page.getByRole("button", { name: "Confirm delete" })),
  ]);
  await waitForLauncher(page);
  await page.waitForFunction((saveId) => {
    return ![...document.querySelectorAll(".launcher-save-row")]
      .some((entry) => entry.textContent?.includes(saveId));
  }, deleteSaveId);

  await Promise.all([
    page.waitForURL(openSaveUrlPattern(seededSaveId)),
    clickUi(launcherSaveRow(page, seededSaveId).getByRole("link", { name: "Open" })),
  ]);
  await waitForOpenSaveProgress(page);
  await page.waitForURL(saveUrlPattern(seededSaveId));
  await waitForShellTitle(page, displayName);

  await page.waitForFunction(() => document.body.innerText.includes("Control Tower"));
  await waitForCompanyClock(page);
  const initialClockLabel = await page.locator("[data-clock-label]").textContent();
  await clickUi(page.getByRole("button", { name: "Advance 12h" }));
  await page.waitForFunction(() => document.querySelector("[data-shell-flash]")?.textContent?.includes("Advanced time to"));
  await page.waitForFunction((previousLabel) => {
    const nextLabel = document.querySelector("[data-clock-label]")?.textContent;
    return Boolean(nextLabel) && nextLabel !== "Loading..." && nextLabel !== previousLabel;
  }, initialClockLabel);
  assert.equal(await page.locator(".panel").filter({ hasText: "Control Tower" }).count(), 1);

  await clickUi(page.locator("[data-shell-tab='contracts']"));
  await page.waitForFunction(() => document.querySelectorAll("[data-select-offer-row]").length > 0);
  assert.equal(await page.locator("[data-contracts-map]").count(), 1);

  const initialOfferCount = await page.locator("[data-select-offer-row]").count();
  const firstOfferRow = page.locator("[data-select-offer-row]").first();
  const destinationDetail = await firstOfferRow.locator(".contract-route-detail").nth(1).textContent();
  const destinationCode = parseAirportCode(destinationDetail, "Destination");

  await page.locator("input[name='searchText']").fill(destinationCode);
  await page.waitForFunction((code) => {
    const rows = [...document.querySelectorAll("[data-select-offer-row]")];
    return rows.length > 0 && rows.every((row) => row.textContent?.includes(code));
  }, destinationCode);
  const searchedOfferCount = await page.locator("[data-select-offer-row]").count();
  assert.ok(searchedOfferCount <= initialOfferCount);

  await page.locator("input[name='searchText']").fill("");
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll("[data-select-offer-row]");
    return rows.length > 0 && (document.querySelector("input[name='searchText']")?.value ?? "") === "";
  });

  const refreshedFirstRow = page.locator("[data-select-offer-row]").first();
  const refreshedDestinationDetail = await refreshedFirstRow.locator(".contract-route-detail").nth(1).textContent();
  const refreshedDestinationCode = parseAirportCode(refreshedDestinationDetail, "Destination");
  await clickUi(page.locator("[data-use-selected-destination]"));
  await page.waitForFunction((code) => (document.querySelector("input[name='originCode']")?.value ?? "") === code, refreshedDestinationCode);
  await page.waitForFunction((code) => {
    const rows = [...document.querySelectorAll("[data-select-offer-row]")];
    return rows.length > 0 && rows.every((row) => row.textContent?.includes(code));
  }, refreshedDestinationCode);

  await page.locator("input[name='originCode']").fill("");
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll("[data-select-offer-row]");
    return rows.length > 0 && (document.querySelector("input[name='originCode']")?.value ?? "") === "";
  });

  const fitBadgeText = await page.locator("[data-select-offer-row] .badge").first().textContent();
  const fitBucket = fitBadgeText?.trim().toLowerCase().replace(/\s+/g, "_") ?? "all";
  assert.ok(["flyable_now", "flyable_with_reposition", "stretch_growth", "blocked_now"].includes(fitBucket), `Unexpected fit bucket ${fitBucket}.`);
  await page.locator("select[name='fitBucket']").selectOption(fitBucket);
  await page.waitForFunction((expectedFitBucket) => {
    const rows = [...document.querySelectorAll("[data-select-offer-row]")];
    return rows.length > 0 && rows.every((row) => {
      const badgeText = row.querySelector(".badge")?.textContent?.trim().toLowerCase().replace(/\s+/g, "_");
      return badgeText === expectedFitBucket;
    });
  }, fitBucket);

  await page.locator("select[name='fitBucket']").selectOption("all");
  await page.waitForFunction(() => document.querySelectorAll("[data-select-offer-row]").length > 0);

  await clickUi(page.locator("[data-plan-add-offer]").first());
  await page.waitForFunction(() => document.querySelector(".contracts-planner-panel")?.textContent?.includes("1 item | endpoint"));

  const endpointMatchCount = await page.locator("[data-select-offer-row].matches-endpoint").count();
  await page.locator("input[name='matchPlannerEndpoint']").check();
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-select-offer-row]").length === expectedCount, endpointMatchCount);
  assert.equal(await page.locator("[data-select-offer-row]").count(), endpointMatchCount);
  assert.equal(await page.locator("[data-select-offer-row]:not(.matches-endpoint)").count(), 0);
  await page.locator("input[name='matchPlannerEndpoint']").uncheck();
  await page.waitForFunction(() => document.querySelectorAll("[data-select-offer-row]").length > 0);

  await clickUi(page.locator("[data-plan-review-open]"));
  await page.waitForFunction(() => document.querySelectorAll("[data-plan-review-select]").length > 0);
  await page.locator("[data-plan-review-select]").first().check();
  await clickUi(page.locator("[data-plan-accept-selected]"));
  await page.waitForFunction(() => document.body.innerText.includes("Accepted 1 planned offer"));

  await clickUi(page.locator("[data-board-tab='active']"));
  await page.waitForFunction(() => document.body.innerText.includes("accepted / active contracts"));
  assert.ok((await page.locator("[data-select-company-contract-row]").count()) >= 1);

  await clickUi(page.locator("[data-shell-tab='dashboard']"));
  await page.waitForFunction(() => document.body.innerText.includes("Execution Queue"));
  let queuePanelText = await page.locator(".panel").filter({ hasText: "Execution Queue" }).textContent();
  if (queuePanelText?.includes("No accepted company contracts yet.")) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForURL(saveUrlPattern(seededSaveId));
    await waitForShellTitle(page, displayName);
    await page.waitForFunction(() => document.body.innerText.includes("Execution Queue"));
    queuePanelText = await page.locator(".panel").filter({ hasText: "Execution Queue" }).textContent();
  }
  assert.ok(queuePanelText && !queuePanelText.includes("No accepted company contracts yet."));
} finally {
  await Promise.allSettled([
    browser?.close(),
    server?.stop(),
  ]);
  await Promise.allSettled([
    removeWorkspaceSave(seededSaveId),
    removeWorkspaceSave(launcherSaveId),
    removeWorkspaceSave(deleteSaveId),
  ]);
}
