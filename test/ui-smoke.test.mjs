/*
 * Thin end-to-end browser smoke for the shared shell.
 * This intentionally covers only cross-surface shell behavior:
 * - opening a seeded save
 * - finance shortcut and persistence
 * - help center access
 * - clock availability
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
  waitForShellTitle,
} from "./helpers/playwright-ui-testkit.mjs";

const saveId = uniqueSaveId("ui_smoke");
const displayName = `UI Smoke ${saveId}`;

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
  const page = await browser.newPage();

  await page.goto(`${server.baseUrl}/save/${encodeURIComponent(saveId)}?tab=dispatch`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === `/save/${saveId}` && url.searchParams.get("tab") === "dispatch");
  await waitForShellTitle(page, displayName);

  assert.equal(await page.locator("[data-shell-title]").textContent(), displayName);
  assert.equal(await page.evaluate(() => new URL(window.location.href).searchParams.get("tab")), "dispatch");
  await page.waitForFunction(() => document.querySelectorAll("[data-dispatch-aircraft-card]").length === 3);

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
      && help.textContent?.includes("Why Am I Blocked?");
  });
  await clickUi(page.locator("[data-help-section-tab='blocked']"));
  await page.waitForFunction(() => {
    const panel = document.querySelector("[data-help-section-panel='blocked']");
    return panel instanceof HTMLElement && !panel.hidden;
  });
  await clickUi(page.locator("[data-help-section-panel='blocked'] [data-help-topic-button='i-cannot-dispatch-this-contract']").first());
  await page.waitForFunction(() => {
    const article = document.querySelector("[data-help-topic-panel='i-cannot-dispatch-this-contract']");
    return article instanceof HTMLElement && !article.hidden && article.textContent?.includes("Dispatch validation");
  });
  await clickUi(page.locator("[data-help-close]").first());
  await page.waitForFunction(() => {
    const help = document.querySelector("[data-help-center]");
    return help instanceof HTMLElement && help.hidden;
  });
  assert.equal(await page.evaluate(() => new URL(window.location.href).searchParams.get("tab")), "dispatch");

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
    backend?.close(),
  ]);
  await removeWorkspaceSave(saveId);
}
