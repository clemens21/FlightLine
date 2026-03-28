/*
 * Focused browser coverage for the Staffing workspace.
 * This keeps dense hire-table, filter, overlay, and roster behavior out of the broad shell smoke.
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

const saveId = uniqueSaveId("ui_staffing_hire");
const displayName = `Staffing Hire ${saveId}`;

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
  const page = await browser.newPage({ viewport: { width: 1300, height: 380 } });

  await page.goto(`${server.baseUrl}/save/${encodeURIComponent(saveId)}?tab=staffing`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === `/save/${saveId}` && url.searchParams.get("tab") === "staffing");
  await waitForShellTitle(page, displayName);

  await page.waitForFunction(() => document.querySelectorAll("[data-staffing-pilot-row]").length === 3);
  await page.waitForFunction((registration) => {
    const roster = document.querySelector("[data-staffing-roster]")?.textContent ?? "";
    return roster.includes(registration);
  }, uiRegressionRegistrations.lead);
  await page.waitForFunction(() => {
    const panel = document.querySelector("[data-shell-tab-panel]");
    return panel instanceof HTMLElement && panel.scrollHeight - panel.clientHeight <= 2;
  });

  await clickUi(page.locator("[data-staffing-workspace-tab='hire']"));
  await page.waitForFunction(() => {
    const hirePanel = document.querySelector("[data-staffing-workspace-panel='hire']");
    const employeePanel = document.querySelector("[data-staffing-workspace-panel='employees']");
    return hirePanel instanceof HTMLElement
      && employeePanel instanceof HTMLElement
      && !hirePanel.hidden
      && employeePanel.hidden;
  });

  assert.ok((await page.locator("[data-pilot-candidate-market]").count()) >= 1);
  await page.waitForFunction(() => document.querySelectorAll("[data-pilot-candidate-row]").length >= 8);
  assert.equal(await page.locator("[data-staffing-hire-overlay]").isVisible(), false);
  assert.equal(await page.locator("[data-staffing-hire-more-toggle]").count(), 0);
  assert.equal(await page.locator("[data-staffing-hire-reset]").count(), 0);
  assert.equal(await page.locator("[data-staffing-hire-clear]").count(), 0);

  await page.setViewportSize({ width: 1800, height: 1000 });
  assert.equal(await page.locator("button[aria-label='Pilot search']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Pilot filter']").count(), 0);
  assert.equal(await page.locator("button[aria-label='Base search']").count(), 0);
  assert.equal(await page.locator("button[aria-label='Base filter']").count(), 0);
  assert.equal(await page.locator("button[aria-label='Certification(s) search']").count(), 0);
  assert.equal(await page.locator("button[aria-label='Certification(s) filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Total hours filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Reliability filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Stress filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Procedure filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Training filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Direct hire filter']").count(), 1);
  assert.equal(await page.locator("button[aria-label='Contract hire filter']").count(), 1);

  const baselineCandidates = await page.evaluate(() => {
    return [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")].map((row) => ({
      name: row.getAttribute("data-staffing-candidate-name") ?? "",
      certifications: (row.getAttribute("data-staffing-candidate-certifications") ?? "").split("|").filter(Boolean),
      hours: Number.parseFloat(row.getAttribute("data-staffing-candidate-hours") ?? "0") || 0,
      reliability: Number.parseFloat(row.getAttribute("data-staffing-candidate-operational-reliability") ?? "0") || 0,
      directAvailability: row.getAttribute("data-staffing-candidate-direct-availability") ?? "not_offered",
      contractAvailability: row.getAttribute("data-staffing-candidate-contract-availability") ?? "not_offered",
    }));
  });
  const baselineVisibleCandidates = baselineCandidates.length;
  const candidateSample = baselineCandidates[0];
  const multiCertCandidate = baselineCandidates.find((candidate) => candidate.certifications.length >= 2) ?? candidateSample;
  const firstCandidateName = candidateSample?.name ?? "";
  const pilotSearchTerm = firstCandidateName.split(" ")[0] ?? firstCandidateName;
  const selectedHours = String(multiCertCandidate?.hours ?? 0);
  const selectedReliability = String(multiCertCandidate?.reliability ?? 0);
  assert.ok(baselineVisibleCandidates >= 8);
  assert.ok((multiCertCandidate?.certifications?.length ?? 0) >= 2);

  const baselineColumnWidths = await page.evaluate(() => {
    return [...document.querySelectorAll("[data-staffing-hire-column]")].map((column) => ({
      key: column.getAttribute("data-staffing-hire-column") ?? "",
      width: Math.round(column.getBoundingClientRect().width),
    }));
  });

  await clickUi(page.locator("button[aria-label='Pilot search']"));
  await page.waitForFunction(() => {
    const control = document.querySelector("[data-staffing-hire-popover='pilot']");
    return control instanceof HTMLElement && !control.hidden;
  });
  const pilotSearchGeometry = await page.evaluate(() => {
    const control = document.querySelector("[data-staffing-hire-popover='pilot']");
    const header = document.querySelector("[data-staffing-hire-column='pilot']");
    const button = document.querySelector("button[aria-label='Pilot search']");
    if (!(control instanceof HTMLElement) || !(header instanceof HTMLElement) || !(button instanceof HTMLElement)) {
      return null;
    }
    const controlRect = control.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return {
      controlLeft: controlRect.left,
      controlWidth: controlRect.width,
      headerRight: headerRect.right,
      buttonLeft: buttonRect.left,
    };
  });
  assert.ok(pilotSearchGeometry);
  assert.equal(pilotSearchGeometry.controlWidth >= 180, true);
  assert.equal(pilotSearchGeometry.controlLeft <= pilotSearchGeometry.headerRight - 24, true);
  assert.equal(pilotSearchGeometry.controlLeft < pilotSearchGeometry.buttonLeft, true);
  await page.locator("[data-staffing-hire-popover='pilot'] [data-staffing-hire-field='pilotSearch']").fill(pilotSearchTerm);
  await clickUi(page.locator("[data-staffing-hire-column='hours'] .staffing-hire-sort-button"));
  await page.waitForFunction((expectedSearch) => {
    const visibleRows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    return visibleRows.length > 0
      && visibleRows.every((row) => (row.getAttribute("data-staffing-candidate-name") ?? "").toLowerCase().includes(expectedSearch));
  }, pilotSearchTerm.toLowerCase());
  const filteredColumnWidths = await page.evaluate(() => {
    return [...document.querySelectorAll("[data-staffing-hire-column]")].map((column) => ({
      key: column.getAttribute("data-staffing-hire-column") ?? "",
      width: Math.round(column.getBoundingClientRect().width),
    }));
  });
  assert.deepEqual(filteredColumnWidths, baselineColumnWidths);
  await clickUi(page.locator("button[aria-label='Pilot search']"));
  await page.locator("[data-staffing-hire-popover='pilot'] [data-staffing-hire-field='pilotSearch']").fill("");
  await clickUi(page.locator("[data-staffing-hire-column='hours'] .staffing-hire-sort-button"));
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])").length === expectedCount, baselineVisibleCandidates);

  await clickUi(page.locator("button[aria-label='Certification(s) filter']"));
  const certificationFilterGeometry = await page.evaluate(() => {
    const options = [...document.querySelectorAll("[data-staffing-hire-popover='certifications'] .staffing-hire-checkbox-option")].slice(0, 2);
    if (options.length < 2) {
      return null;
    }
    return options.map((option) => {
      const optionRect = option.getBoundingClientRect();
      const input = option.querySelector("input");
      const text = option.querySelector("span");
      const inputRect = input instanceof HTMLElement ? input.getBoundingClientRect() : optionRect;
      const textRect = text instanceof HTMLElement ? text.getBoundingClientRect() : optionRect;
      return {
        left: Math.round(optionRect.left),
        top: Math.round(optionRect.top),
        inputLeft: Math.round(inputRect.left),
        textLeft: Math.round(textRect.left),
      };
    });
  });
  assert.ok(certificationFilterGeometry);
  assert.equal(certificationFilterGeometry[0].left, certificationFilterGeometry[1].left);
  assert.equal(certificationFilterGeometry[1].top > certificationFilterGeometry[0].top, true);
  assert.equal(certificationFilterGeometry[0].textLeft > certificationFilterGeometry[0].inputLeft, true);
  await page.locator(`[data-staffing-hire-popover='certifications'] input[value='${multiCertCandidate.certifications[0]}']`).check();
  await page.locator(`[data-staffing-hire-popover='certifications'] input[value='${multiCertCandidate.certifications[1]}']`).check();
  await page.waitForFunction((certifications) => {
    const visibleRows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    return visibleRows.length > 0
      && visibleRows.every((row) => {
        const rowCertifications = (row.getAttribute("data-staffing-candidate-certifications") ?? "").split("|").filter(Boolean);
        return certifications.every((entry) => rowCertifications.includes(entry));
      });
  }, multiCertCandidate.certifications.slice(0, 2));
  await page.locator(`[data-staffing-hire-popover='certifications'] input[value='${multiCertCandidate.certifications[0]}']`).uncheck();
  await page.locator(`[data-staffing-hire-popover='certifications'] input[value='${multiCertCandidate.certifications[1]}']`).uncheck();
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])").length === expectedCount, baselineVisibleCandidates);
  await page.keyboard.press("Escape");

  await clickUi(page.locator("button[aria-label='Total hours filter']"));
  await page.locator("[data-staffing-hire-popover='hours'] [data-staffing-hire-field='hoursMin']").fill(selectedHours);
  await page.locator("[data-staffing-hire-popover='hours'] [data-staffing-hire-field='hoursMax']").fill(selectedHours);
  await page.waitForFunction((expectedHours) => {
    const visibleRows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    return visibleRows.length > 0
      && visibleRows.every((row) => (row.getAttribute("data-staffing-candidate-hours") ?? "") === expectedHours);
  }, selectedHours);
  await page.locator("[data-staffing-hire-popover='hours'] [data-staffing-hire-field='hoursMin']").fill("");
  await page.locator("[data-staffing-hire-popover='hours'] [data-staffing-hire-field='hoursMax']").fill("");
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])").length === expectedCount, baselineVisibleCandidates);
  await page.keyboard.press("Escape");

  await clickUi(page.locator("button[aria-label='Reliability filter']"));
  await page.locator("[data-staffing-hire-popover='reliability'] [data-staffing-hire-field='reliabilityMin']").fill(selectedReliability);
  await page.locator("[data-staffing-hire-popover='reliability'] [data-staffing-hire-field='reliabilityMax']").fill(selectedReliability);
  await page.waitForFunction((expectedScore) => {
    const visibleRows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    return visibleRows.length > 0
      && visibleRows.every((row) => (row.getAttribute("data-staffing-candidate-operational-reliability") ?? "") === expectedScore);
  }, selectedReliability);
  await page.locator("[data-staffing-hire-popover='reliability'] [data-staffing-hire-field='reliabilityMin']").fill("");
  await page.locator("[data-staffing-hire-popover='reliability'] [data-staffing-hire-field='reliabilityMax']").fill("");
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])").length === expectedCount, baselineVisibleCandidates);
  await page.keyboard.press("Escape");

  await clickUi(page.locator("button[aria-label='Direct hire filter']"));
  await page.locator("[data-staffing-hire-popover='direct_hire'] [data-staffing-hire-field='directCostMin']").fill("1");
  await page.waitForFunction(() => {
    const visibleRows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    return visibleRows.length > 0
      && visibleRows.every((row) => (row.getAttribute("data-staffing-candidate-direct-availability") ?? "") === "offered");
  });
  await page.locator("[data-staffing-hire-popover='direct_hire'] [data-staffing-hire-field='directCostMin']").fill("");
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])").length === expectedCount, baselineVisibleCandidates);
  await page.keyboard.press("Escape");

  await clickUi(page.locator("button[aria-label='Contract hire filter']"));
  await page.waitForFunction(() => document.querySelector("button[aria-label='Contract hire filter']")?.getAttribute("aria-expanded") === "true");
  const contractHirePopoverBounds = await page.locator("[data-staffing-hire-popover='contract_hire']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    const market = document.querySelector("[data-pilot-candidate-market]");
    const marketRect = market instanceof HTMLElement ? market.getBoundingClientRect() : rect;
    return {
      left: rect.left,
      right: rect.right,
      marketLeft: marketRect.left,
      marketRight: marketRect.right,
      viewportWidth: window.innerWidth,
    };
  });
  assert.ok(contractHirePopoverBounds);
  assert.equal(contractHirePopoverBounds.left >= Math.max(12, contractHirePopoverBounds.marketLeft + 12), true);
  assert.equal(contractHirePopoverBounds.right <= Math.min(contractHirePopoverBounds.viewportWidth - 12, contractHirePopoverBounds.marketRight - 12), true);
  await page.locator("[data-staffing-hire-popover='contract_hire'] [data-staffing-hire-field='contractSortBasis']").selectOption("hourly");
  await clickUi(page.locator("[data-staffing-hire-sort-button='contract_cost']"));
  await page.waitForFunction(() => document.querySelector("[data-staffing-hire-column='contract_hire']")?.getAttribute("aria-sort") === "ascending");
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    const values = rows.map((row) => {
      const raw = row.getAttribute("data-staffing-candidate-contract-hourly-rate") ?? "";
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    });
    return values.every((value, index) => index === 0 || values[index - 1] <= value);
  });
  await clickUi(page.locator("button[aria-label='Contract hire filter']"));
  await page.waitForFunction(() => document.querySelector("button[aria-label='Contract hire filter']")?.getAttribute("aria-expanded") === "true");
  await page.locator("[data-staffing-hire-popover='contract_hire'] [data-staffing-hire-field='contractSortBasis']").selectOption("upfront");
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    const values = rows.map((row) => {
      const raw = row.getAttribute("data-staffing-candidate-contract-cost") ?? "";
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    });
    return values.every((value, index) => index === 0 || values[index - 1] <= value);
  });
  await page.locator("[data-staffing-hire-popover='contract_hire'] [data-staffing-hire-field='contractHourlyMin']").fill("1");
  await page.waitForFunction(() => {
    const visibleRows = [...document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])")];
    return visibleRows.length > 0
      && visibleRows.every((row) => (row.getAttribute("data-staffing-candidate-contract-availability") ?? "") === "offered");
  });
  await page.locator("[data-staffing-hire-popover='contract_hire'] [data-staffing-hire-field='contractHourlyMin']").fill("");
  await page.waitForFunction((expectedCount) => document.querySelectorAll("[data-pilot-candidate-row]:not([hidden])").length === expectedCount, baselineVisibleCandidates);
  await page.keyboard.press("Escape");

  await clickUi(page.locator("[data-staffing-hire-sort-button='name']"));
  assert.equal(await page.locator("[data-staffing-hire-column='pilot']").getAttribute("aria-sort"), "ascending");
  await clickUi(page.locator("[data-staffing-hire-sort-button='name']"));
  await page.waitForFunction(() => document.querySelector("[data-staffing-hire-column='pilot']")?.getAttribute("aria-sort") === "descending");

  const hireMarketOverflow = await page.locator("[data-pilot-candidate-market]").evaluate((element) => {
    return element instanceof HTMLElement ? window.getComputedStyle(element).overflowY : "hidden";
  });
  assert.equal(["auto", "scroll"].includes(hireMarketOverflow), true);
  const hireMarketScroll = await page.locator("[data-pilot-candidate-market]").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return { scrollHeight: 0, clientHeight: 0, scrollTop: 0 };
    }

    const previousMaxHeight = element.style.maxHeight;
    const previousHeight = element.style.height;
    element.style.maxHeight = "120px";
    element.style.height = "120px";
    element.scrollTop = 0;
    element.scrollTop = 160;
    const snapshot = {
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollTop: element.scrollTop,
    };
    element.style.maxHeight = previousMaxHeight;
    element.style.height = previousHeight;
    return snapshot;
  });
  assert.ok(hireMarketScroll.scrollHeight > hireMarketScroll.clientHeight);
  assert.ok(hireMarketScroll.scrollTop > 0);

  const firstCandidateRow = page.locator("[data-pilot-candidate-row]:not([hidden])").first();
  const firstCandidatePilotCellText = (await firstCandidateRow.locator("td").first().textContent()) ?? "";
  assert.match(firstCandidatePilotCellText, /[A-Za-z]/);
  assert.equal(firstCandidatePilotCellText.includes("Broader fit"), false);
  assert.equal(firstCandidatePilotCellText.includes("Direct + Contract"), false);

  await page.setViewportSize({ width: 1440, height: 900 });
  const visibleCandidateRows = page.locator("[data-pilot-candidate-row]:not([hidden])");
  const bothOfferCandidateRows = page.locator("[data-pilot-candidate-row]:not([hidden])[data-staffing-candidate-direct-availability='offered'][data-staffing-candidate-contract-availability='offered']");
  const selectedCandidateRow = (await bothOfferCandidateRows.count()) > 0
    ? bothOfferCandidateRows.first()
    : visibleCandidateRows.first();
  const selectedDirectAvailability = await selectedCandidateRow.getAttribute("data-staffing-candidate-direct-availability");
  const selectedContractAvailability = await selectedCandidateRow.getAttribute("data-staffing-candidate-contract-availability");
  const firstVisibleCandidateName = (await selectedCandidateRow.locator("strong").textContent())?.trim() ?? "";
  const firstCandidatePortrait = await selectedCandidateRow.locator("[data-staff-portrait-surface='hire-row']").getAttribute("src");
  assert.ok(firstCandidatePortrait);
  assert.equal(firstCandidatePortrait.startsWith("/assets/staff-portraits/"), true);

  await clickUi(selectedCandidateRow.locator("td").first());
  await page.waitForFunction((expectedName) => {
    const selectedName = document.querySelector("[data-pilot-candidate-row][aria-selected='true'] strong")?.textContent?.trim() ?? "";
    return selectedName === expectedName;
  }, firstVisibleCandidateName);
  await page.waitForFunction((expectedName) => {
    const overlay = document.querySelector("[data-staffing-hire-overlay]");
    const title = document.querySelector("[data-staffing-detail-title='hire']")?.textContent ?? "";
    return overlay instanceof HTMLElement && !overlay.hidden && title.includes(expectedName);
  }, firstVisibleCandidateName);

  const hireDetailText = (await page.locator("[data-staffing-detail-body='hire']").textContent()) ?? "";
  assert.equal(hireDetailText.includes("Pilot snapshot"), true);
  assert.equal(hireDetailText.includes("Certification hours"), true);
  assert.equal(hireDetailText.includes("Strengths and weaknesses"), true);
  const expectedDirectCards = selectedDirectAvailability === "offered" ? 1 : 0;
  const expectedContractCards = selectedContractAvailability === "offered" ? 1 : 0;
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-staffing-hire-offer-path='direct_hire']").count(), expectedDirectCards);
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-staffing-hire-offer-path='contract_hire']").count(), expectedContractCards);
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-staffing-strengths-weaknesses] li").count(), 3);
  assert.equal(await page.locator("[data-staffing-detail-body='hire'] [data-staffing-base-airport-input]").count(), expectedDirectCards + expectedContractCards);
  const baseAirportDefaults = await page.locator("[data-staffing-detail-body='hire'] [data-staffing-base-airport-input]").evaluateAll((inputs) =>
    inputs.map((input) => input instanceof HTMLInputElement ? input.value : ""),
  );
  assert.deepEqual(baseAirportDefaults, new Array(expectedDirectCards + expectedContractCards).fill("KDEN"));
  const hireDetailScroll = await page.locator("[data-staffing-detail-body='hire']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return { scrollHeight: 0, clientHeight: 0 };
    }
    return { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
  });
  assert.ok(hireDetailScroll.scrollHeight - hireDetailScroll.clientHeight <= 6);
  const hireOverlayGeometry = await page.locator("[data-staffing-hire-overlay]").evaluate((overlayElement) => {
    if (!(overlayElement instanceof HTMLElement)) {
      return null;
    }

    const backdrop = overlayElement.querySelector(".staffing-hire-overlay-backdrop");
    const card = overlayElement.querySelector(".staffing-hire-overlay-card");
    if (!(backdrop instanceof HTMLElement) || !(card instanceof HTMLElement)) {
      return null;
    }

    const backdropRect = backdrop.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const backdropStyle = window.getComputedStyle(backdrop);
    return {
      overlayPosition: window.getComputedStyle(overlayElement).position,
      overlayHidden: overlayElement.hidden,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      backdropWidth: backdropRect.width,
      backdropHeight: backdropRect.height,
      backdropBackgroundColor: backdropStyle.backgroundColor,
      cardWidth: cardRect.width,
      cardHeight: cardRect.height,
    };
  });
  assert.ok(hireOverlayGeometry);
  assert.equal(hireOverlayGeometry.overlayPosition, "fixed");
  assert.equal(hireOverlayGeometry.overlayHidden, false);
  assert.ok(hireOverlayGeometry.cardWidth < hireOverlayGeometry.viewportWidth);
  assert.ok(hireOverlayGeometry.cardHeight < hireOverlayGeometry.viewportHeight);
  assert.equal(await page.locator("[data-staffing-detail-panel='hire'] [data-staff-portrait-surface='hire-detail']").getAttribute("src"), firstCandidatePortrait);
  await clickUi(page.locator("[data-staffing-detail-close='hire']").first());
  await page.waitForFunction(() => {
    const overlay = document.querySelector("[data-staffing-hire-overlay]");
    return overlay instanceof HTMLElement && overlay.hidden;
  });

  await clickUi(page.locator("[data-staffing-workspace-tab='employees']"));
  await page.waitForFunction(() => {
    const hirePanel = document.querySelector("[data-staffing-workspace-panel='hire']");
    const employeePanel = document.querySelector("[data-staffing-workspace-panel='employees']");
    return hirePanel instanceof HTMLElement
      && employeePanel instanceof HTMLElement
      && hirePanel.hidden
      && !employeePanel.hidden;
  });
  await page.setViewportSize({ width: 1300, height: 520 });
  assert.equal(await page.locator("[data-staffing-pilot-row]").count(), 3);
  assert.equal((await page.locator("[data-staffing-roster]").textContent())?.toLowerCase().includes("reserved"), true);
  const reservedPilotRow = page.locator("[data-staffing-pilot-row]").filter({ hasText: uiRegressionRegistrations.lead }).first();
  const reservedPilotPortrait = await reservedPilotRow.locator("[data-staff-portrait-surface='employees-row']").getAttribute("src");
  assert.ok(reservedPilotPortrait);
  await clickUi(reservedPilotRow);
  await page.waitForFunction((registration) => {
    const detail = document.querySelector("[data-staffing-detail-body='employees']")?.textContent ?? "";
    return detail.includes(registration) && /reserved/i.test(detail);
  }, uiRegressionRegistrations.lead);
  assert.equal(await page.locator("[data-staffing-detail-body='employees'] [data-staff-portrait-surface='employees-detail']").getAttribute("src"), reservedPilotPortrait);
  await clickUi(page.locator("[data-staffing-pilot-row]").filter({ hasText: /ready/i }).first());
  await page.waitForFunction(() => {
    const detail = document.querySelector("[data-staffing-detail-body='employees']")?.textContent ?? "";
    return detail.includes("Start training");
  });
  await page.waitForFunction(() => {
    const detail = document.querySelector("[data-staffing-detail-body='employees']");
    return detail instanceof HTMLElement && detail.scrollHeight > detail.clientHeight + 20;
  });
  const detailScrollBefore = await page.locator("[data-staffing-detail-body='employees']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return 0;
    }
    element.scrollTop = 160;
    return element.scrollTop;
  });
  assert.ok(detailScrollBefore > 0);
  assert.equal(await page.locator("[data-pilot-training-start]").count(), 1);
  await page.locator("[data-pilot-training-target]").first().selectOption("MEPL");
  await clickUi(page.locator("[data-pilot-training-start]").first());
  await page.waitForFunction(() => {
    const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
    const detailText = document.querySelector("[data-staffing-detail-body='employees']")?.textContent ?? "";
    return /training/i.test(flashText) && /training/i.test(detailText);
  });
  const detailScrollAfter = await page.locator("[data-staffing-detail-body='employees']").evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return { scrollTop: 0, maxScrollTop: 0 };
    }
    return {
      scrollTop: element.scrollTop,
      maxScrollTop: Math.max(0, element.scrollHeight - element.clientHeight),
    };
  });
  assert.ok(detailScrollAfter.scrollTop > 40);
  assert.ok(detailScrollAfter.scrollTop >= Math.min(detailScrollBefore, detailScrollAfter.maxScrollTop) - 24);
  assert.equal(await page.locator("[data-shell-tab-panel]").evaluate((element) => {
    return element instanceof HTMLElement ? element.scrollTop : -1;
  }), 0);
} finally {
  await Promise.allSettled([
    browser?.close(),
    server?.stop(),
    backend?.close(),
  ]);
  await removeWorkspaceSave(saveId);
}
