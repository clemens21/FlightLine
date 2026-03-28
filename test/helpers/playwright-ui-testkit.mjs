/*
 * Provides reusable Playwright helpers for launching the browser, stabilizing clicks, and waiting on shell transitions.
 * The browser suites lean on these helpers to stay resilient against UI timing and pointer-interception quirks.
 */

import { access } from "node:fs/promises";

import { chromium } from "playwright";

export async function clickUi(locator) {
  await locator.waitFor({ state: "visible" });

  const isSvgClickTarget = await locator.evaluate((element) => {
    return element instanceof SVGElement;
  }).catch(() => false);

  if (isSvgClickTarget) {
    await locator.evaluate((element) => {
      const clickTarget = element.closest("button, [role='button'], label") ?? element;
      clickTarget.scrollIntoView({ block: "center", inline: "center" });
      if (clickTarget instanceof HTMLElement) {
        clickTarget.click();
        return;
      }

      clickTarget.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
      }));
    });
    return;
  }

  try {
    await locator.click({ timeout: 2_000 });
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
  const headful = /^(1|true|yes)$/i.test(process.env.PLAYWRIGHT_HEADFUL?.trim() ?? "");
  const parsedSlowMo = Number.parseInt(process.env.PLAYWRIGHT_SLOW_MO ?? "", 10);
  const slowMo = Number.isFinite(parsedSlowMo) && parsedSlowMo > 0 ? parsedSlowMo : undefined;
  const launchOptions = {
    headless: !headful,
    slowMo,
  };
  const cdpUrl = process.env.PLAYWRIGHT_CDP_URL?.trim();
  if (cdpUrl) {
    const browser = await chromium.connectOverCDP(cdpUrl);
    const createdPages = [];

    return {
      async newPage(options = {}) {
        const context = browser.contexts()[0] ?? await browser.newContext();
        if (!context) {
          throw new Error(`Connected to external browser at ${cdpUrl}, but no default browser context is available.`);
        }

        const page = await context.newPage();
        if (options.viewport) {
          await page.setViewportSize(options.viewport);
        }
        createdPages.push(page);
        return page;
      },
      async close() {
        for (const page of createdPages.splice(0)) {
          try {
            if (!page.isClosed()) {
              await page.close();
            }
          } catch {
            // Ignore page-close cleanup errors during shared external-browser runs.
          }
        }

        try {
          await browser.close();
        } catch {
          // In CDP mode, disconnect/close behavior depends on the external browser owner.
        }
      },
    };
  }

  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    const executableCandidates = [
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ];

    for (const executablePath of executableCandidates) {
      try {
        await access(executablePath);
        return await chromium.launch({ ...launchOptions, executablePath });
      } catch {
        // Try the next installed browser candidate.
      }
    }

    if (error instanceof Error) {
      throw new Error(`${error.message}\nRun "npm run test:ui:setup" to install the Chromium browser used by the UI smoke tests, or run the external-browser wrapper script to attach over CDP.`);
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
