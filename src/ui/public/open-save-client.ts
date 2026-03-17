/*
 * Browser controller for the transitional open-save screen that prefetches shell data before redirecting.
 * Its job is to make save opening feel immediate while warming the browser cache with the first shell payloads.
 */

import type { SaveBootstrapPayload, SavePageTab, SaveTabPayload } from "../save-shell-model.js";

interface OpenSaveConfig {
  saveId: string;
  initialTab: SavePageTab;
  destinationUrl: string;
}

interface PrefetchedOpenPayload {
  saveId: string;
  initialTab: SavePageTab;
  bootstrap: SaveBootstrapPayload;
  tab: SaveTabPayload;
  cachedAtUtc: string;
}

const requestTimeoutMs = 12000;

const appRoot = document.querySelector<HTMLElement>("[data-open-save-app]");

if (appRoot) {
  const configScript = appRoot.querySelector<HTMLScriptElement>("[data-open-save-config]");
  const config = configScript?.textContent
    ? (JSON.parse(configScript.textContent) as OpenSaveConfig)
    : null;

  if (config) {
    void mountOpenSave(appRoot, config);
  }
}

async function mountOpenSave(root: HTMLElement, config: OpenSaveConfig): Promise<void> {
  const titleNode = root.querySelector<HTMLElement>("[data-loader-title]");
  const fillNode = root.querySelector<HTMLElement>("[data-loader-fill]");
  const planeNode = root.querySelector<HTMLElement>("[data-loader-plane]");
  const stageNode = root.querySelector<HTMLElement>("[data-loader-stage]");
  const errorNode = root.querySelector<HTMLElement>("[data-loader-error]");
  const actionsNode = root.querySelector<HTMLElement>("[data-loader-actions]");
  const retryButton = root.querySelector<HTMLButtonElement>("[data-loader-retry]");

  if (!titleNode || !fillNode || !planeNode || !stageNode || !errorNode || !actionsNode || !retryButton) {
    return;
  }

  const titleElement: HTMLElement = titleNode;
  const fillElement: HTMLElement = fillNode;
  const planeElement: HTMLElement = planeNode;
  const stageElement: HTMLElement = stageNode;
  const errorElement: HTMLElement = errorNode;
  const actionsElement: HTMLElement = actionsNode;
  const retryElement: HTMLButtonElement = retryButton;

  titleElement.textContent = `Opening ${config.saveId}`;
  retryElement.addEventListener("click", () => {
    window.location.reload();
  });

  function setLoader(progress: number, stageText: string): void {
    fillElement.style.width = `${progress}%`;
    planeElement.style.left = `${progress}%`;
    stageElement.textContent = stageText;
    console.info("[open-save] stage", { progress, stageText, saveId: config.saveId, tabId: config.initialTab });
  }

  function showError(message: string): void {
    console.error("[open-save] failed", { saveId: config.saveId, tabId: config.initialTab, message });
    stageElement.textContent = "Save open failed";
    errorElement.textContent = message;
    errorElement.hidden = false;
    actionsElement.hidden = false;
  }

  try {
    setLoader(8, "Opening save");
    await sleep(280);

    const bootstrapPromise = fetchBootstrap(config.saveId, config.initialTab);
    setLoader(26, "Connecting to local database");
    const bootstrap = await waitForMinimum(bootstrapPromise, 420);

    setLoader(52, "Loading company state");
    await sleep(260);

    const tabPromise = fetchTab(config.saveId, config.initialTab);
    setLoader(76, "Loading operations snapshot");
    const tab = await waitForMinimum(tabPromise, 520);

    writePrefetchedPayload({
      saveId: config.saveId,
      initialTab: config.initialTab,
      bootstrap,
      tab,
      cachedAtUtc: new Date().toISOString(),
    });

    setLoader(92, `Opening ${labelForTab(config.initialTab)}`);
    await sleep(260);
    setLoader(100, "Arrival complete");
    await sleep(220);
    console.info("[open-save] redirecting to save shell", { saveId: config.saveId, destinationUrl: config.destinationUrl });
    window.location.replace(config.destinationUrl);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not open the save.");
  }
}

function buildPrefetchKey(saveId: string, tabId: SavePageTab): string {
  return `flightline-save-prefetch:${encodeURIComponent(saveId)}:${tabId}`;
}

function writePrefetchedPayload(payload: PrefetchedOpenPayload): void {
  try {
    localStorage.setItem(buildPrefetchKey(payload.saveId, payload.initialTab), JSON.stringify(payload));
    console.info("[open-save] prefetched payload stored", {
      saveId: payload.saveId,
      tabId: payload.initialTab,
      cacheKey: buildPrefetchKey(payload.saveId, payload.initialTab),
    });
  } catch (error) {
    console.error("[open-save] failed to store prefetched payload", error);
  }
}

async function fetchBootstrap(saveId: string, initialTab: SavePageTab): Promise<SaveBootstrapPayload> {
  const payload = await fetchJsonWithTimeout<SaveBootstrapPayload>(`/api/save/${encodeURIComponent(saveId)}/bootstrap?tab=${encodeURIComponent(initialTab)}`, requestTimeoutMs);

  if (!("shell" in payload)) {
    throw new Error("Could not open the save.");
  }

  return payload;
}

async function fetchTab(saveId: string, tabId: SavePageTab): Promise<SaveTabPayload> {
  const payload = await fetchJsonWithTimeout<SaveTabPayload>(`/api/save/${encodeURIComponent(saveId)}/tab/${tabId}`, requestTimeoutMs);

  if (!("contentHtml" in payload)) {
    throw new Error(`Could not load ${tabId}.`);
  }

  return payload;
}

async function fetchJsonWithTimeout<TPayload>(url: string, timeoutMs: number): Promise<TPayload> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.info("[open-save] fetching", { url, timeoutMs });
    const response = await fetch(url, { signal: controller.signal });
    const payload = (await response.json()) as TPayload & { error?: string };

    if (!response.ok) {
      throw new Error(typeof payload.error === "string" ? payload.error : `Request failed for ${url}.`);
    }

    console.info("[open-save] fetched", { url, status: response.status });
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Timed out while opening the save. Retry the load.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function labelForTab(tabId: SavePageTab): string {
  switch (tabId) {
    case "contracts":
      return "contracts";
    case "aircraft":
      return "fleet";
    case "staffing":
      return "staffing";
    case "dispatch":
      return "dispatch";
    case "activity":
      return "activity";
    case "dashboard":
    default:
      return "dashboard";
  }
}

async function waitForMinimum<T>(promise: Promise<T>, minimumMs: number): Promise<T> {
  const [result] = await Promise.all([promise, sleep(minimumMs)]);
  return result;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolveSleep) => {
    window.setTimeout(resolveSleep, durationMs);
  });
}
