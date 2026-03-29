/*
 * Focused browser coverage for launcher and shell navigation behavior.
 * Contracts, staffing, dispatch, and aircraft workspace details live in targeted suites.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  pickFlyableOffer,
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
let backend = null;

function themeLabel(theme) {
  switch (theme) {
    case "dark":
      return "Dark Blue";
    case "forest":
      return "Dark Green";
    default:
      return "Light";
  }
}

function nextTheme(theme) {
  switch (theme) {
    case "light":
      return "dark";
    case "dark":
      return "forest";
    default:
      return "light";
  }
}

function launcherSaveRow(page, saveId) {
  return page.locator(".launcher-save-row").filter({ hasText: saveId }).first();
}

function createSameOriginScriptFailureTracker(page, baseUrl) {
  const failures = [];
  const baseOrigin = new URL(baseUrl).origin;
  const onResponse = (response) => {
    const url = new URL(response.url());
    if (url.origin !== baseOrigin || !url.pathname.endsWith(".js") || response.status() < 400) {
      return;
    }

    failures.push({
      path: url.pathname,
      status: response.status(),
    });
  };

  page.on("response", onResponse);

  return {
    failures,
    stop() {
      page.off("response", onResponse);
    },
  };
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
  backend = await createWorkspaceBackend();
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

  const [fleetState, board] = await Promise.all([
    backend.loadFleetState(seededSaveId),
    backend.loadActiveContractBoard(seededSaveId),
  ]);
  assert.ok(fleetState?.aircraft[0]);
  assert.ok(board);

  const seededOffer = pickFlyableOffer(board, fleetState.aircraft[0], backend.getAirportReference());
  assert.ok(seededOffer);

  const seededAcceptResult = await backend.dispatch({
    commandId: `cmd_${seededSaveId}_seed_accept`,
    saveId: seededSaveId,
    commandName: "AcceptContractOffer",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      contractOfferId: seededOffer.contractOfferId,
    },
  });
  assert.equal(seededAcceptResult.success, true);

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

  const port = await allocatePort();
  server = await startUiServer(port);
  browser = await launchBrowser();
  const page = await browser.newPage();
  const warmedTabResponses = [];
  const onResponse = (response) => {
    const url = new URL(response.url());
    const match = url.pathname.match(new RegExp(`^/api/save/${seededSaveId}/tab/(contracts|aircraft|staffing)$`));
    if (!match || response.status() >= 400) {
      return;
    }

    warmedTabResponses.push(match[1]);
  };
  page.on("response", onResponse);

  await page.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
  await waitForLauncher(page);
  assert.equal(await page.title(), "Open or Create Save");
  assert.equal(await launcherSaveRow(page, seededSaveId).count(), 1);
  assert.equal(await page.locator(".theme-toggle").count(), 0);

  const launcherTheme = await readTheme(page);

  await page.locator("input[name='saveName']").fill(launcherSaveId);
  await Promise.all([
    page.waitForURL(openSaveUrlPattern(launcherSaveId)),
    clickUi(page.getByRole("button", { name: "Create save" })),
  ]);
  await waitForOpenSaveProgress(page);
  await page.waitForURL(saveUrlPattern(launcherSaveId));
  await waitForShellTitle(page, `Save ${launcherSaveId}`);
  assert.equal(await page.locator("[data-shell-subtitle]").textContent(), "Create a company to begin operating.");
  assert.equal(await page.locator("[data-clock-label]").textContent(), "Setup first");

  await clickUi(page.locator("[data-settings-menu] summary"));
  const settingsThemeLabel = themeLabel(launcherTheme);
  await page.waitForFunction((label) => document.querySelector("[data-settings-theme-label]")?.textContent === label, settingsThemeLabel);
  assert.equal((await page.locator("[data-settings-menu]").textContent())?.includes(launcherSaveId), true);

  const shellTheme = nextTheme(launcherTheme);
  await clickUi(page.locator("[data-settings-theme]"));
  await waitForTheme(page, shellTheme);
  await page.waitForFunction((label) => document.querySelector("[data-settings-theme-label]")?.textContent === label, themeLabel(shellTheme));

  const thirdTheme = nextTheme(shellTheme);
  await clickUi(page.locator("[data-settings-theme]"));
  await waitForTheme(page, thirdTheme);
  await page.waitForFunction((label) => document.querySelector("[data-settings-theme-label]")?.textContent === label, themeLabel(thirdTheme));

  await clickUi(page.locator("[data-settings-popup-mode-toggle]"));
  await page.waitForFunction(() => document.querySelector("[data-settings-popup-label]")?.textContent === "Important only");
  assert.equal(await page.evaluate(() => localStorage.getItem("flightline-activity-popups")), "important_only");

  await Promise.all([
    page.waitForURL((url) => url.pathname === "/"),
    clickUi(page.locator("[data-settings-menu] a[href='/']")),
  ]);
  await waitForLauncher(page);
  assert.equal(await readTheme(page), thirdTheme);
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

  await Promise.all([
    page.waitForURL(openSaveUrlPattern(seededSaveId)),
    clickUi(launcherSaveRow(page, seededSaveId).getByRole("link", { name: "Open" })),
  ]);
  const seededSaveOpenScriptFailures = createSameOriginScriptFailureTracker(page, server.baseUrl);
  await waitForOpenSaveProgress(page);
  await page.waitForURL(saveUrlPattern(seededSaveId));
  await waitForShellTitle(page, displayName);
  await page.waitForFunction(() => document.body.innerText.includes("Control Tower"));
  await waitForCompanyClock(page);
  seededSaveOpenScriptFailures.stop();
  assert.deepEqual(seededSaveOpenScriptFailures.failures, []);
  await page.waitForFunction(() => document.querySelector("[data-shell-tab='contracts']") instanceof HTMLElement);
  await page.waitForFunction(() => document.querySelector("[data-shell-tab='aircraft']") instanceof HTMLElement);
  await page.waitForFunction(() => document.querySelector("[data-shell-tab='staffing']") instanceof HTMLElement);
  await page.waitForFunction(() => true);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (["contracts", "aircraft", "staffing"].every((tabId) => warmedTabResponses.includes(tabId))) {
      break;
    }
    await page.waitForTimeout(250);
  }
  assert.deepEqual(
    [...new Set(warmedTabResponses)].sort(),
    ["aircraft", "contracts", "staffing"],
  );
  const warmedRequestCount = warmedTabResponses.length;

  await clickUi(page.locator("[data-shell-tab='contracts']"));
  await page.waitForFunction(() => document.querySelectorAll("[data-select-offer-row]").length > 0);
  await clickUi(page.locator("[data-shell-tab='aircraft']"));
  await page.waitForFunction(() => document.querySelector("[data-aircraft-tab-host]") instanceof HTMLElement);
  await clickUi(page.locator("[data-shell-tab='staffing']"));
  await page.waitForFunction(() => document.querySelector("[data-staffing-roster]") instanceof HTMLElement);
  await page.waitForTimeout(250);
  assert.equal(warmedTabResponses.length, warmedRequestCount);

  await clickUi(page.locator("[data-settings-menu] summary"));
  await page.waitForFunction(() => document.querySelector("[data-settings-menu]")?.open === true);
  await clickUi(page.locator("[data-settings-open-activity]"));
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get("tab") === "activity");

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
    backend?.close(),
  ]);
  await Promise.all([
    removeWorkspaceSave(seededSaveId),
    removeWorkspaceSave(launcherSaveId),
    removeWorkspaceSave(deleteSaveId),
  ]);
}
