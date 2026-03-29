/*
 * Focused browser coverage for the Staffing employee detail pane.
 * This keeps the roster-detail layout and visible stat profile behavior covered without depending on the denser hire-market suite.
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

const saveId = uniqueSaveId("ui_staffing_employees");
const displayName = `Staffing Employees ${saveId}`;

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

  await page.goto(`${server.baseUrl}/save/${encodeURIComponent(saveId)}?tab=staffing`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === `/save/${saveId}` && url.searchParams.get("tab") === "staffing");
  await waitForShellTitle(page, displayName);

  await page.waitForFunction(() => document.querySelectorAll("[data-staffing-pilot-row]").length === 3);
  await page.waitForFunction(() => {
    const employeePanel = document.querySelector("[data-staffing-workspace-panel='employees']");
    return employeePanel instanceof HTMLElement && !employeePanel.hidden;
  });

  const panelWidths = await page.evaluate(() => {
    const rosterPanel = document.querySelector("[data-staffing-workspace-panel='employees'] .aircraft-fleet-panel");
    const detailPanel = document.querySelector("[data-staffing-detail-panel='employees']");
    if (!(rosterPanel instanceof HTMLElement) || !(detailPanel instanceof HTMLElement)) {
      return null;
    }
    return {
      rosterWidth: Math.round(rosterPanel.getBoundingClientRect().width),
      detailWidth: Math.round(detailPanel.getBoundingClientRect().width),
    };
  });
  assert.ok(panelWidths);
  assert.equal(panelWidths.detailWidth > panelWidths.rosterWidth, true);

  await clickUi(page.locator("[data-staffing-pilot-row]").filter({ hasText: /ready/i }).first());
  await page.waitForFunction(() => {
    const detail = document.querySelector("[data-staffing-detail-body='employees']");
    return detail instanceof HTMLElement
      && detail.textContent?.includes("Operational profile")
      && detail.textContent?.includes("Coverage posture")
      && detail.textContent?.includes("Hometown")
      && detail.textContent?.includes("Start training")
      && detail.querySelectorAll("[data-pilot-stat-rating]").length >= 4;
  });

  const detailOverflow = await page.locator("[data-staffing-detail-body='employees']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return { scrollHeight: 0, clientHeight: 0 };
    }
    return {
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };
  });
  assert.ok(detailOverflow.scrollHeight - detailOverflow.clientHeight <= 6);
} finally {
  await Promise.allSettled([
    browser?.close(),
    server?.stop(),
    backend?.close(),
  ]);
  await removeWorkspaceSave(saveId);
}
