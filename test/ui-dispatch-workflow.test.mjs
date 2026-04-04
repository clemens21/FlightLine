/*
 * Focused browser coverage for the Dispatch workspace.
 * This keeps draft, source-lane, readiness, and pilot-override assertions out of the broad shell smoke.
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

const saveId = uniqueSaveId("ui_dispatch_workflow");
const displayName = `Dispatch Workflow ${saveId}`;

let backend = null;
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

  await page.waitForFunction(() => document.querySelectorAll("[data-dispatch-aircraft-row]").length === 3);
  await page.waitForFunction((registration) => {
    const selected = document.querySelector("[data-dispatch-selected-aircraft]")?.textContent ?? "";
    return selected.includes(registration);
  }, uiRegressionRegistrations.draft);
  assert.equal((await page.locator("[data-dispatch-selected-aircraft]").textContent())?.includes("Crew Requirement"), true);
  assert.equal((await page.locator("[data-dispatch-selected-aircraft]").textContent())?.includes("Route Load"), true);
  assert.equal((await page.locator("[data-dispatch-input-lane]").textContent())?.includes("Dispatch Inputs"), true);
  assert.equal((await page.locator("[data-dispatch-input-lane]").textContent())?.includes("Accepted Contracts"), true);
  assert.equal((await page.locator("[data-dispatch-input-lane]").textContent())?.includes("Planned Routes"), true);
  assert.equal((await page.locator("[data-dispatch-selected-work]").first().textContent())?.includes("Selected Contract"), true);
  assert.equal((await page.locator("[data-dispatch-selected-work]").first().textContent())?.includes("Next Step"), true);
  assert.equal((await page.locator("[data-dispatch-commit-button]").textContent())?.includes("Build selected contract draft"), true);
  assert.equal(await page.locator("[data-dispatch-commit-button]").isEnabled(), false);
  assert.equal((await page.locator("[data-dispatch-source-table]").textContent())?.includes("Assignment"), true);

  await clickUi(page.locator("[data-dispatch-source-mode='planned_routes']").first());
  await page.waitForFunction(() => document.querySelectorAll("[data-dispatch-selected-work]").length === 1);
  await page.waitForFunction(() => {
    const selected = document.querySelector("[data-dispatch-selected-work]")?.textContent ?? "";
    return selected.includes("Selected Route Plan");
  });
  assert.equal((await page.locator("[data-dispatch-selected-work]").first().textContent())?.includes("Selected row"), true);
  assert.equal(await page.locator("[data-dispatch-bind-route-plan]").isVisible(), true);
  assert.equal((await page.locator("[data-dispatch-source-table]").textContent())?.includes("Sequence"), true);

  await clickUi(page.locator("[data-dispatch-source-mode='accepted_contracts']").first());
  await page.waitForFunction(() => document.querySelectorAll("[data-dispatch-selected-work]").length === 1);
  await page.waitForFunction(() => {
    const selected = document.querySelector("[data-dispatch-selected-work]")?.textContent ?? "";
    return selected.includes("Selected Contract");
  });

  await clickUi(page.locator("[data-dispatch-aircraft-row]").filter({ hasText: uiRegressionRegistrations.lead }).first());
  await page.waitForFunction((registration) => {
    const selected = document.querySelector("[data-dispatch-selected-aircraft]")?.textContent ?? "";
    return selected.includes(registration);
  }, uiRegressionRegistrations.lead);
  await page.waitForFunction(() => document.querySelectorAll("[data-dispatch-assigned-pilot]").length === 1);
  assert.equal((await page.locator("[data-dispatch-assigned-pilots]").textContent())?.includes("Certifications"), true);
  assert.equal((await page.locator("[data-dispatch-pilot-assignment-summary]").textContent())?.includes("named pilots"), true);
  assert.equal(await page.locator("[data-dispatch-calendar-reflection]").isVisible(), true);
  assert.equal((await page.locator("[data-dispatch-calendar-reflection]").textContent())?.includes("Clock & Calendar already shows N208UI as occupied"), true);
  assert.equal(await page.locator("[data-dispatch-discard-draft]").count(), 0);

  await clickUi(page.locator("[data-dispatch-aircraft-row]").filter({ hasText: uiRegressionRegistrations.draft }).first());
  await page.waitForFunction((registration) => {
    const selected = document.querySelector("[data-dispatch-selected-aircraft]")?.textContent ?? "";
    return selected.includes(registration);
  }, uiRegressionRegistrations.draft);
  assert.equal((await page.locator("[data-dispatch-draft-status]").textContent())?.includes("Discard it if you want a clean planning lane first."), true);
  assert.equal(await page.locator("[data-dispatch-discard-draft]").isVisible(), true);
  await clickUi(page.locator("[data-dispatch-leg-select]").nth(1));
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-leg-detail]")?.textContent?.includes("KCOS -> KDEN"));
  assert.equal((await page.locator("[data-dispatch-selected-leg-detail]").textContent())?.includes("attached contract"), true);

  assert.equal((await page.locator("[data-dispatch-input-lane]").textContent())?.includes("Accepted Contracts"), true);
  assert.equal(await page.locator("[data-dispatch-selected-work]").first().isVisible(), true);

  await clickUi(page.locator("[data-dispatch-aircraft-row]").filter({ hasText: uiRegressionRegistrations.constrained }).first());
  await page.waitForFunction((registration) => {
    const selected = document.querySelector("[data-dispatch-selected-aircraft]")?.textContent ?? "";
    return selected.includes(registration);
  }, uiRegressionRegistrations.constrained);
  assert.equal((await page.locator("[data-dispatch-commit-button]").textContent())?.includes("No dispatch draft"), true);
  await page.waitForFunction(() => document.querySelector("[data-dispatch-validation-rail]")?.textContent?.includes("Dispatch Review"));
  const readinessRailText = (await page.locator("[data-dispatch-validation-rail]").textContent()) ?? "";
  assert.equal(readinessRailText.includes("Overall readiness"), true);
  assert.equal(readinessRailText.includes("Likely recovery"), true);
  assert.equal(readinessRailText.includes("Validation snapshot"), true);
  assert.equal(readinessRailText.includes("Route / operational fit"), true);
  const commitBarText = (await page.locator("[data-dispatch-commit-bar]").textContent()) ?? "";
  assert.equal(commitBarText.includes("Dispatch action"), true);
  assert.equal(commitBarText.includes("Aircraft impact"), true);
  assert.equal(commitBarText.includes("Pilot impact"), true);
  assert.equal(commitBarText.includes("Calendar impact"), true);

  await clickUi(page.locator("[data-dispatch-source-item]").nth(0));
  assert.equal((await page.locator("[data-dispatch-accepted-route-context]").textContent())?.includes("Route"), true);
  assert.equal((await page.locator("[data-dispatch-source-item]").nth(0).textContent())?.includes("Departure:"), true);
  assert.equal((await page.locator("[data-dispatch-source-item]").nth(0).textContent())?.includes("pax"), true);
  assert.equal((await page.locator("[data-dispatch-source-table]").textContent())?.includes("Payout"), true);
  await forceButtonSubmit(page, "[data-dispatch-auto-plan-contract]");
  await page.waitForFunction(() => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const selectedAircraft = document.querySelector("[data-dispatch-selected-aircraft]")?.textContent ?? "";
    const commitButton = document.querySelector("[data-dispatch-commit-button]")?.textContent ?? "";
    return flashText.includes("is not dispatchable in its current state.")
      && selectedAircraft.includes("N20CUI")
      && commitButton.includes("No dispatch draft");
  });

  await clickUi(page.locator("[data-dispatch-source-item]").first());
  assert.equal((await page.locator("[data-dispatch-selected-work]").first().textContent())?.includes("Aircraft Assignment"), true);
  await forceButtonSubmit(page, "[data-dispatch-auto-plan-contract]");
  await page.waitForFunction(() => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const commitButton = document.querySelector("[data-dispatch-commit-button]")?.textContent ?? "";
    const legButtons = document.querySelectorAll("[data-dispatch-leg-select]");
    const previewFailed = flashText.includes("is not dispatchable in its current state.")
      || flashText.includes("would miss the contract deadline for this aircraft.");
    return previewFailed
      && commitButton.includes("No dispatch draft")
      && legButtons.length === 0;
  }, { timeout: 45_000 });

  await clickUi(page.locator("[data-dispatch-aircraft-row]").filter({ hasText: uiRegressionRegistrations.draft }).first());
  await page.waitForFunction(() => document.querySelector("[data-dispatch-draft-pilot-assignment]"));
  assert.equal(await page.locator("[data-dispatch-draft-pilot-assignment]").isVisible(), true);
  assert.equal((await page.locator("[data-dispatch-pilot-recommendation]").textContent())?.includes("Recommended"), true);
  assert.equal(await page.locator("[data-dispatch-pilot-option-reason]").count() >= 1, true);
  await forceButtonSubmit(page, "[data-dispatch-auto-plan-contract]");
  await page.waitForFunction(() => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const commitButton = document.querySelector("[data-dispatch-commit-button]")?.textContent ?? "";
    const legButtons = document.querySelectorAll("[data-dispatch-leg-select]");
    return flashText.includes("Drafted schedule")
      && commitButton.includes("Dispatch contract")
      && legButtons.length === 1;
  });

  const { recommendedPilotId, overridePilotId } = await page.evaluate(() => {
    const optionCards = [...document.querySelectorAll("[data-dispatch-pilot-option]")];
    const selectableCards = optionCards.filter((card) => card.querySelector("[data-dispatch-pilot-override]"));
    const recommendedCard = selectableCards.find((card) =>
      (card.textContent ?? "").toLowerCase().includes("recommended"));
    const alternateCard = selectableCards.find((card) => card !== recommendedCard);
    return {
      recommendedPilotId: recommendedCard?.getAttribute("data-dispatch-pilot-option") ?? null,
      overridePilotId: alternateCard?.getAttribute("data-dispatch-pilot-option") ?? null,
    };
  });
  assert.ok(recommendedPilotId);
  assert.ok(overridePilotId);
  assert.notEqual(overridePilotId, recommendedPilotId);

  await clickUi(page.locator(`[data-dispatch-pilot-override='${overridePilotId}']`));
  assert.equal((await page.locator("[data-dispatch-commit-button]").textContent())?.includes("Dispatch contract"), true);
  assert.equal(await page.locator("[data-dispatch-commit-button]").isEnabled(), true);
  await clickUi(page.locator("[data-dispatch-leg-select]").first());
  await page.waitForFunction(() => document.querySelector("[data-dispatch-selected-leg-detail]")?.textContent?.includes("KDEN -> KCOS"));
  await clickUi(page.locator("[data-dispatch-commit-button]"));
  await page.waitForFunction((selectedPilotId) => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const commitButton = document.querySelector("[data-dispatch-commit-button]");
    return flashText.includes("Committed schedule")
      && commitButton?.textContent?.includes("Already dispatched")
      && Boolean(document.querySelector(`[data-dispatch-assigned-pilot='${selectedPilotId}']`));
  }, overridePilotId);
} finally {
  await Promise.allSettled([
    browser?.close(),
    server?.stop(),
    backend?.close(),
  ]);
  await removeWorkspaceSave(saveId);
}
