/*
 * Provides reusable Playwright helpers for launching the browser, stabilizing clicks, and waiting on shell transitions.
 * The browser suites lean on these helpers to stay resilient against UI timing and pointer-interception quirks.
 */

import { access } from "node:fs/promises";

import { chromium } from "playwright";

export async function clickUi(locator) {
  await locator.waitFor({ state: "visible" });

  try {
    await locator.click({ timeout: 10_000 });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/intercepts pointer events|Timeout/.test(message)) {
      throw error;
    }
  }

  await locator.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "center" });
    if (element instanceof HTMLElement) {
      element.click();
      return;
    }

    element.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
    }));
  });
}

export async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const executableCandidates = [
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ];

    for (const executablePath of executableCandidates) {
      try {
        await access(executablePath);
        return await chromium.launch({ headless: true, executablePath });
      } catch {
        // Try the next installed browser candidate.
      }
    }

    if (error instanceof Error) {
      throw new Error(`${error.message}\nRun "npm run test:ui:setup" to install the Chromium browser used by the UI smoke tests.`);
    }

    throw error;
  }
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function openSaveUrlPattern(saveId) {
  return new RegExp(`/open-save/${escapeRegExp(saveId)}`);
}

export function saveUrlPattern(saveId) {
  return new RegExp(`/save/${escapeRegExp(saveId)}`);
}

export async function waitForOpenSaveProgress(page) {
  await page.waitForSelector("[data-open-save-app]");
  await page.waitForFunction(() => {
    const stage = document.querySelector("[data-loader-stage]")?.textContent?.trim() ?? "";
    const width = Number.parseFloat(document.querySelector("[data-loader-fill]")?.style.width ?? "0");
    return stage.length > 0 && width > 0;
  });
}

export async function waitForShellTitle(page, expectedTitle) {
  await page.waitForFunction((title) => document.querySelector("[data-shell-title]")?.textContent === title, expectedTitle);
}

export async function readTheme(page) {
  return await page.evaluate(() => document.body.dataset.theme ?? "");
}

export async function waitForTheme(page, expectedTheme) {
  await page.waitForFunction((theme) => document.body.dataset.theme === theme, expectedTheme);
}
