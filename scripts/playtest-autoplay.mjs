import { randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  chooseRandomPlaytestDifficulty,
  defaultCheckpointIntervalMinutes,
  defaultPlaytestViewport,
  startWatchedPlaytestSession,
} from "./playtest-watch.mjs";
import {
  clickUi,
  waitForOpenSaveProgress,
  waitForShellTitle,
} from "../test/helpers/playwright-ui-testkit.mjs";

export const defaultHomeAirport = "KDEN";
export const defaultCampaignRoot = resolve(process.cwd(), "artifacts", "playtests");
export const playtestAutoplayStrategyProfiles = [
  {
    id: "balanced_growth",
    label: "balanced-growth",
    sentence: "contract-throughput-first profitability with cautious balanced expansion",
    preferredVolumeType: "any",
    preferredKeywords: ["caravan", "cessna 208"],
    preferredAirport: defaultHomeAirport,
    fleetCashThresholds: [5_500_000, 8_500_000],
    fleetCap: 3,
    distanceBias: 1.0,
    minClosedContractsBeforeExpansion: 4,
    cashReserveAmount: 1_500_000,
  },
  {
    id: "cargo_first",
    label: "cargo-first",
    sentence: "cargo-first contract completion with tight cost control",
    preferredVolumeType: "cargo",
    preferredKeywords: ["cargo", "freighter", "caravan", "cessna 208"],
    preferredAirport: defaultHomeAirport,
    fleetCashThresholds: [5_000_000, 7_500_000],
    fleetCap: 3,
    distanceBias: 0.85,
    minClosedContractsBeforeExpansion: 4,
    cashReserveAmount: 1_250_000,
  },
  {
    id: "passenger_first",
    label: "passenger-first",
    sentence: "passenger-heavy short-haul contract completion with conservative fleet expansion",
    preferredVolumeType: "passenger",
    preferredKeywords: ["passenger", "commuter", "caravan", "cessna 208"],
    preferredAirport: defaultHomeAirport,
    fleetCashThresholds: [5_250_000, 8_000_000],
    fleetCap: 3,
    distanceBias: 0.8,
    minClosedContractsBeforeExpansion: 4,
    cashReserveAmount: 1_250_000,
  },
  {
    id: "aggressive_growth",
    label: "aggressive-growth",
    sentence: "contract-throughput-first growth that expands quickly only after proving repeatable completions",
    preferredVolumeType: "any",
    preferredKeywords: ["caravan", "cessna 208"],
    preferredAirport: defaultHomeAirport,
    fleetCashThresholds: [4_750_000, 6_750_000, 9_250_000],
    fleetCap: 4,
    distanceBias: 1.0,
    minClosedContractsBeforeExpansion: 3,
    cashReserveAmount: 1_000_000,
  },
  {
    id: "conservative_cargo",
    label: "conservative-cargo",
    sentence: "conservative cargo contract completion with spare cash preserved for downside protection",
    preferredVolumeType: "cargo",
    preferredKeywords: ["cargo", "freighter", "caravan", "cessna 208"],
    preferredAirport: defaultHomeAirport,
    fleetCashThresholds: [6_250_000],
    fleetCap: 2,
    distanceBias: 0.75,
    minClosedContractsBeforeExpansion: 5,
    cashReserveAmount: 2_000_000,
  },
  {
    id: "shorthaul_balanced",
    label: "shorthaul-balanced",
    sentence: "short-haul balanced contract completion that favors quick turns and tighter loops",
    preferredVolumeType: "any",
    preferredKeywords: ["caravan", "cessna 208"],
    preferredAirport: defaultHomeAirport,
    fleetCashThresholds: [5_250_000, 7_250_000],
    fleetCap: 3,
    distanceBias: 0.65,
    minClosedContractsBeforeExpansion: 4,
    cashReserveAmount: 1_250_000,
  },
];

const shellTabHostSelectors = {
  contracts: "[data-contracts-host]",
  aircraft: "[data-aircraft-tab-host]",
  staffing: "[data-staffing-tab-host]",
  dispatch: "[data-dispatch-tab-host]",
};

function sanitizeSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "entry";
}

function parseCliOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unknown positional argument "${token}".`);
    }

    const [rawKey, inlineValue] = token.split("=", 2);
    const key = rawKey.slice(2);
    if (!key) {
      throw new Error(`Invalid argument "${token}".`);
    }

    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const nextToken = args[index + 1];
    if (nextToken === undefined || nextToken.startsWith("--")) {
      options[key] = "true";
      continue;
    }

    options[key] = nextToken;
    index += 1;
  }
  return options;
}

function parseIntegerOption(name, value, minimum = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`Expected ${name} to be an integer >= ${minimum}, received "${value ?? ""}".`);
  }
  return parsed;
}

function parseBooleanOption(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }
  throw new Error(`Expected a boolean value, received "${value ?? ""}".`);
}

export function parsePlaytestAutoplayArgs(args = process.argv.slice(2)) {
  const options = parseCliOptions(args);
  return {
    horizonDays: parseIntegerOption("--horizon-days", options["horizon-days"], 1),
    artifactRootDir: options["artifact-root"] ? resolve(String(options["artifact-root"])) : defaultCampaignRoot,
    sessionId: options["session-id"] ? String(options["session-id"]).trim() : null,
    difficulty: options.difficulty ? String(options.difficulty).trim() : null,
    strategyId: options.strategy ? String(options.strategy).trim() : null,
    homeAirport: (options["home-airport"] ? String(options["home-airport"]) : defaultHomeAirport).trim().toUpperCase(),
    displayName: options["display-name"] ? String(options["display-name"]).trim() : null,
    saveName: options["save-name"] ? String(options["save-name"]).trim() : null,
    sessionLabel: options["session-label"] ? String(options["session-label"]).trim() : null,
    autoStopMs: options["auto-stop-ms"] === undefined ? null : parseIntegerOption("--auto-stop-ms", options["auto-stop-ms"], 1),
    checkpointIntervalMinutes: options["checkpoint-interval-minutes"] === undefined
      ? defaultCheckpointIntervalMinutes
      : parseIntegerOption("--checkpoint-interval-minutes", options["checkpoint-interval-minutes"], 1),
    dryRun: options["dry-run"] === undefined ? false : parseBooleanOption(options["dry-run"]),
    logPrefix: options["log-prefix"] ? String(options["log-prefix"]).trim() : "playtest",
    viewportWidth: options["viewport-width"] === undefined ? defaultPlaytestViewport.width : parseIntegerOption("--viewport-width", options["viewport-width"], 640),
    viewportHeight: options["viewport-height"] === undefined ? defaultPlaytestViewport.height : parseIntegerOption("--viewport-height", options["viewport-height"], 360),
  };
}

export function resolveStrategyProfile(strategyId) {
  if (!strategyId) {
    return playtestAutoplayStrategyProfiles[0];
  }

  const normalized = String(strategyId).trim().toLowerCase();
  return playtestAutoplayStrategyProfiles.find((profile) => profile.id === normalized || profile.label === normalized)
    ?? playtestAutoplayStrategyProfiles[0];
}

export function buildPlaytestDisplayName({
  sessionLabel,
  strategyProfile,
  difficulty,
}) {
  const label = sessionLabel ? sessionLabel.trim() : `Playtest ${strategyProfile.label}`;
  return `${label} [${difficulty}]`;
}

function nowIsoStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function parseMoneyValue(text) {
  const match = String(text ?? "").match(/\$([\d,]+)/);
  return match ? Number.parseInt(match[1].replaceAll(",", ""), 10) : 0;
}

function parseDateLabel(text) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  const explicitMatch = normalized.match(/\b([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\b/);
  const parts = normalized.split("|").map((value) => value.trim()).filter(Boolean);
  const dateLabel = explicitMatch?.[1] ?? parts.at(-1) ?? normalized;
  const parsed = Date.parse(`${dateLabel} 12:00:00`);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function parseContractRowText(text) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const departureMatch = normalized.match(/Departure:\s*([A-Z0-9]{3,4})/i);
  const destinationMatch = normalized.match(/Destination:\s*([A-Z0-9]{3,4})/i);
  const passengerMatch = normalized.match(/([\d,]+)\s*pax/i);
  const cargoMatch = normalized.match(/([\d,]+)\s*lb\s*cargo/i);
  const payoutMatch = normalized.match(/\$([\d,]+)/);
  const distanceMatch = normalized.match(/([\d,]+)\s*nm/i);
  const hoursMatch = normalized.match(/(\d+)\s*h\b/i);

  return {
    departure: departureMatch?.[1]?.toUpperCase() ?? "",
    destination: destinationMatch?.[1]?.toUpperCase() ?? "",
    volumeType: passengerMatch ? "passenger" : cargoMatch ? "cargo" : "unknown",
    passengerCount: passengerMatch ? Number.parseInt(passengerMatch[1].replaceAll(",", ""), 10) : 0,
    cargoWeightLb: cargoMatch ? Number.parseInt(cargoMatch[1].replaceAll(",", ""), 10) : 0,
    payoutAmount: payoutMatch ? Number.parseInt(payoutMatch[1].replaceAll(",", ""), 10) : 0,
    distanceNm: distanceMatch ? Number.parseInt(distanceMatch[1].replaceAll(",", ""), 10) : 0,
    hoursRemaining: hoursMatch ? Number.parseInt(hoursMatch[1], 10) : Number.POSITIVE_INFINITY,
    text: normalized,
  };
}

function parseAircraftCapacityText(text) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  const passengersMatch = normalized.match(/([\d,]+)\s*pax/i);
  const cargoMatch = normalized.match(/([\d,]+)\s*lb/i);
  const rangeMatch = normalized.match(/([\d,]+)\s*nm/i);
  return {
    passengerCapacity: passengersMatch ? Number.parseInt(passengersMatch[1].replaceAll(",", ""), 10) : 0,
    cargoCapacityLb: cargoMatch ? Number.parseInt(cargoMatch[1].replaceAll(",", ""), 10) : 0,
    rangeNm: rangeMatch ? Number.parseInt(rangeMatch[1].replaceAll(",", ""), 10) : 0,
  };
}

function deriveAircraftVolumePreference(text) {
  const normalized = String(text ?? "").toLowerCase();
  if (normalized.includes("cargo") || normalized.includes("freighter")) {
    return "cargo";
  }
  if (normalized.includes("passenger") || normalized.includes("commuter") || normalized.includes("airliner")) {
    return "passenger";
  }
  return "any";
}

function parseTrailingCount(text) {
  const matches = String(text ?? "").match(/\d+/g) ?? [];
  if (matches.length === 0) {
    return 0;
  }
  return Number.parseInt(matches.at(-1) ?? "0", 10);
}

function estimateContractCycleHours(contract) {
  const cruiseHours = Math.max(1, contract.distanceNm / 180);
  return cruiseHours + 1.5;
}

function scoreDispatchableContract({
  contract,
  homeAirport,
  preferredVolumeType,
  preferredAirport,
}) {
  const estimatedCycleHours = estimateContractCycleHours(contract);
  const slackHours = Number.isFinite(contract.hoursRemaining)
    ? Math.max(-24, contract.hoursRemaining - estimatedCycleHours)
    : 48;
  const payoutPerCycleHour = contract.payoutAmount / Math.max(1, estimatedCycleHours);
  const shorthaulBias = Math.max(0, 1_400 - contract.distanceNm) * 40;
  const slackBias = Math.min(72, Math.max(0, slackHours)) * 2_500;
  const urgencyPenalty = slackHours < 8 ? (8 - slackHours) * 30_000 : 0;
  const volumeBias = preferredVolumeType !== "any" && contract.volumeType === preferredVolumeType ? 45_000 : 0;
  const homeReturnBias = contract.destination === homeAirport ? 55_000 : 0;
  const preferredAirportBias = contract.destination === preferredAirport ? 25_000 : 0;
  return (
    contract.payoutAmount
    + (payoutPerCycleHour * 900)
    + shorthaulBias
    + slackBias
    + volumeBias
    + homeReturnBias
    + preferredAirportBias
    - urgencyPenalty
  );
}

function desiredFleetSize(strategyProfile, cashAmount) {
  const unlockedFleet = 1 + strategyProfile.fleetCashThresholds.filter((threshold) => cashAmount >= threshold).length;
  return Math.max(1, Math.min(strategyProfile.fleetCap, unlockedFleet));
}

function summarizeWorkload(contractCount, aircraftCount) {
  return `${contractCount} accepted/active contract${contractCount === 1 ? "" : "s"} | ${aircraftCount} aircraft in fleet`;
}

function progressLabel(startDate, currentDate, horizonDays) {
  const elapsedDays = Math.max(0, Math.floor((currentDate.getTime() - startDate.getTime()) / 86_400_000));
  const cappedDay = Math.min(horizonDays, elapsedDays + 1);
  return `Day ${cappedDay} of Day ${horizonDays}`;
}

function isRunGoingWell({
  startingCashAmount,
  endingCashAmount,
  fleetCount,
  staffCount,
  closedContractCount,
}) {
  return endingCashAmount >= startingCashAmount * 1.05
    && closedContractCount >= 8
    && fleetCount >= 1
    && staffCount >= fleetCount;
}

async function writeJsonFile(path, value) {
  await mkdir(dirname(path), { recursive: true }).catch(() => {});
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeTextFile(path, value) {
  await mkdir(dirname(path), { recursive: true }).catch(() => {});
  await writeFile(path, `${String(value).trimEnd()}\n`, "utf8");
}

async function isVisibleHost(page, selector) {
  if (!selector) {
    return false;
  }
  return page.evaluate((expectedSelector) => {
    const host = document.querySelector(expectedSelector);
    return host instanceof HTMLElement
      && !host.hidden
      && host.getBoundingClientRect().width > 0
      && host.getBoundingClientRect().height > 0;
  }, selector).catch(() => false);
}

export class FlightLineAutoplayBot {
  constructor(options) {
    this.options = options;
    this.strategyProfile = resolveStrategyProfile(options.strategyId);
    this.chosenDifficulty = options.difficulty ?? chooseRandomPlaytestDifficulty(randomInt(3));
    this.sessionLabel = options.sessionLabel ?? `${this.strategyProfile.label}-${this.chosenDifficulty}`;
    this.sessionId = options.sessionId ?? `playtest_auto_${sanitizeSlug(this.sessionLabel)}_${nowIsoStamp()}`;
    this.saveId = options.saveName ?? this.sessionId.replace(/^playtest_auto_/, "save_");
    this.displayName = options.displayName ?? buildPlaytestDisplayName({
      sessionLabel: this.sessionLabel,
      strategyProfile: this.strategyProfile,
      difficulty: this.chosenDifficulty,
    });
    this.homeAirport = options.homeAirport;
    this.session = null;
    this.page = null;
    this.artifactRecorder = null;
    this.startDate = null;
    this.startingCashAmount = 0;
    this.lastCheckpointAtMs = Date.now();
    this.lastStatusAtMs = 0;
    this.lastLiveScreenshotAtMs = 0;
    this.stopReason = null;
    this.lastAction = "Session initialized";
    this.cachedAircraftProfiles = new Map();
    this.statusFilePath = null;
    this.liveScreenshotPath = null;
    this.logFilePath = null;
    this.artifactDirectory = null;
    this.baseUrl = null;
  }

  log(message, detail = undefined) {
    const prefix = `[${this.options.logPrefix}:${this.sessionId}]`;
    if (detail === undefined) {
      console.log(`${prefix} ${message}`);
      return;
    }
    console.log(`${prefix} ${message}`, detail);
  }

  async start() {
    this.session = await startWatchedPlaytestSession({
      horizonDays: this.options.horizonDays,
      artifactRootDir: this.options.artifactRootDir,
      sessionId: this.sessionId,
      difficulty: this.chosenDifficulty,
      strategy: this.strategyProfile.sentence,
      viewport: {
        width: this.options.viewportWidth,
        height: this.options.viewportHeight,
      },
    });
    this.page = this.session.page;
    this.artifactRecorder = this.session;
    this.artifactDirectory = this.session.artifactDirectory;
    this.baseUrl = this.session.baseUrl;
    this.statusFilePath = join(this.session.artifactDirectory, "live-status.json");
    this.liveScreenshotPath = join(this.session.artifactDirectory, "live.png");
    this.logFilePath = join(this.session.artifactDirectory, "session.log");
    await this.writeStatus("starting");
  }

  async stop(reason) {
    if (this.stopReason && this.session === null) {
      return;
    }
    if (!this.stopReason) {
      this.stopReason = reason;
    }
    await this.writeStatus("stopping");
    if (this.session) {
      const liveSession = this.session;
      this.session = null;
      await liveSession.stop({ reason });
    }
  }

  async writeStatus(state, extras = {}) {
    const summary = await this.readVisibleSummary().catch(() => null);
    const currentDate = summary?.currentDate ?? this.startDate;
    const progress = this.startDate && currentDate
      ? progressLabel(this.startDate, currentDate, this.options.horizonDays)
      : `Day ? of Day ${this.options.horizonDays}`;
    const payload = {
      sessionId: this.sessionId,
      sessionLabel: this.sessionLabel,
      saveId: this.saveId,
      displayName: this.displayName,
      difficulty: this.chosenDifficulty,
      strategy: this.strategyProfile.sentence,
      homeAirport: this.homeAirport,
      requestedHorizonDays: this.options.horizonDays,
      progress,
      state,
      stopReason: this.stopReason,
      currentLocalTimeLabel: summary?.currentTimeLabel ?? null,
      currentLocalDateLabel: summary?.currentDateLabel ?? null,
      cashAmount: summary?.cashAmount ?? null,
      fleetCount: summary?.fleetCount ?? null,
      staffCount: summary?.staffCount ?? null,
      activeWorkSummary: summary ? summarizeWorkload(summary.acceptedOrActiveContractCount, summary.fleetCount) : null,
      lastAction: this.lastAction,
      baseUrl: this.baseUrl,
      saveUrl: this.baseUrl ? `${this.baseUrl}/save/${encodeURIComponent(this.saveId)}?tab=contracts` : null,
      artifactDirectory: this.artifactDirectory,
      liveScreenshotPath: this.liveScreenshotPath,
      updatedAtUtc: new Date().toISOString(),
      ...extras,
    };
    await writeJsonFile(this.statusFilePath, payload);
    await writeTextFile(this.logFilePath, JSON.stringify(payload));
  }

  async captureLiveScreenshot(label) {
    if (!this.page || !this.session) {
      return;
    }
    await this.page.screenshot({ path: this.liveScreenshotPath, fullPage: true });
    await this.session.captureLiveScreenshot(label);
    this.lastLiveScreenshotAtMs = Date.now();
  }

  async maybeRecordCheckpoint() {
    const now = Date.now();
    const intervalMs = this.options.checkpointIntervalMinutes * 60_000;
    if (!this.startDate || now - this.lastCheckpointAtMs < intervalMs || !this.session) {
      return;
    }

    const summary = await this.readVisibleSummary();
    await this.captureLiveScreenshot(`checkpoint-${now}`);
    await this.session.recordCheckpoint({
      saveId: this.saveId,
      displayName: this.displayName,
      difficulty: this.chosenDifficulty,
      progress: progressLabel(this.startDate, summary.currentDate, this.options.horizonDays),
      cash: summary.cashAmount,
      fleet: summary.fleetCount,
      staff: summary.staffCount,
      work: summarizeWorkload(summary.acceptedOrActiveContractCount, summary.fleetCount),
      decisions: this.lastAction,
      bugs: "none",
    });
    this.lastCheckpointAtMs = now;
  }

  async maybeRefreshArtifacts(force = false) {
    const now = Date.now();
    if (force || now - this.lastStatusAtMs >= 15_000) {
      await this.writeStatus(this.stopReason ? "stopped" : "running");
      this.lastStatusAtMs = now;
    }
    if (force || now - this.lastLiveScreenshotAtMs >= 20_000) {
      await this.captureLiveScreenshot(`live-${now}`);
    }
  }

  async readVisibleSummary() {
    const shell = this.page
      ? await this.page.evaluate(() => {
        const title = document.querySelector("[data-shell-title]")?.textContent?.trim() ?? "";
        const cashText = document.querySelector("[data-shell-cash-card] strong")?.textContent?.trim() ?? "";
        const clockText = document.querySelector("[data-clock-label]")?.textContent?.trim() ?? "";
        return {
          title,
          cashText,
          clockText,
        };
      })
      : { title: this.displayName, cashText: "$0", clockText: "" };

    const clockParts = shell.clockText.split("|").map((value) => value.trim()).filter(Boolean);
    const currentDateLabel = clockParts.find((value) => /\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/.test(value))
      ?? clockParts.at(-1)
      ?? "";
    const currentTimeLabel = clockParts[0] ?? "";
    const cashAmount = parseMoneyValue(shell.cashText);
    const currentDate = parseDateLabel(currentDateLabel || shell.clockText);
    const fleetCount = this.page ? await this.readFleetCount() : 0;
    const staffCount = this.page ? await this.readStaffCount() : 0;
    const acceptedOrActiveContractCount = this.page ? await this.readAcceptedOrActiveContractCount() : 0;
    return {
      title: shell.title,
      cashAmount,
      currentDate,
      currentDateLabel,
      currentTimeLabel,
      fleetCount,
      staffCount,
      acceptedOrActiveContractCount,
    };
  }

  async ensureCreateCompanyFlow() {
    await this.page.goto(this.session.baseUrl, { waitUntil: "domcontentloaded" });
    await this.page.locator("input[name='saveName']").fill(this.saveId);
    await clickUi(this.page.getByRole("button", { name: "Create save" }));
    await waitForOpenSaveProgress(this.page).catch(() => null);
    await this.page.waitForFunction(() => document.querySelector("input[name='displayName']") instanceof HTMLInputElement, { timeout: 60_000 });
    await this.page.locator("input[name='displayName']").fill(this.displayName);
    await this.page.locator("input[name='starterAirportId']").fill(this.homeAirport);
    await this.page.locator(`input[name='difficultyProfile'][value='${this.chosenDifficulty}']`).check();
    await clickUi(this.page.getByRole("button", { name: "Create company" }));
    await waitForShellTitle(this.page, this.displayName);
    await this.session.updateRunContext({
      saveId: this.saveId,
      displayName: this.displayName,
    });
    this.startingCashAmount = await this.readCashAmount();
    let initialSummary = await this.readVisibleSummary();
    for (let attempt = 0; attempt < 12 && !initialSummary.currentDate; attempt += 1) {
      await delay(250);
      initialSummary = await this.readVisibleSummary();
    }
    this.startDate = initialSummary.currentDate;
    this.lastAction = `Created company at ${this.homeAirport} on ${this.chosenDifficulty}.`;
    this.log("Company created.", {
      saveId: this.saveId,
      displayName: this.displayName,
      difficulty: this.chosenDifficulty,
      strategy: this.strategyProfile.sentence,
    });
    await this.maybeRefreshArtifacts(true);
  }

  async openTab(tabId) {
    const expectedHostSelector = shellTabHostSelectors[tabId] ?? null;
    if (await isVisibleHost(this.page, expectedHostSelector)) {
      return;
    }

    const tabButton = this.page.locator(`[data-shell-tab='${tabId}']`).first();
    await clickUi(tabButton);

    if (expectedHostSelector) {
      try {
        await this.page.waitForFunction((selector) => {
          const host = document.querySelector(selector);
          return host instanceof HTMLElement
            && !host.hidden
            && host.getBoundingClientRect().width > 0
            && host.getBoundingClientRect().height > 0;
        }, expectedHostSelector, { timeout: 8_000 });
        return;
      } catch {
        const recoveryTabId = tabId === "contracts" ? "dispatch" : "contracts";
        await clickUi(this.page.locator(`[data-shell-tab='${recoveryTabId}']`).first());
        await this.page.waitForTimeout(200);
        await clickUi(tabButton);
        await this.page.waitForFunction((selector) => {
          const host = document.querySelector(selector);
          return host instanceof HTMLElement
            && !host.hidden
            && host.getBoundingClientRect().width > 0
            && host.getBoundingClientRect().height > 0;
        }, expectedHostSelector, { timeout: 60_000 });
        return;
      }
    }

    await this.page.waitForFunction((expectedTab) => {
      const button = document.querySelector(`[data-shell-tab="${expectedTab}"]`);
      return button instanceof HTMLElement && button.classList.contains("current");
    }, tabId, { timeout: 60_000 });
  }

  async readCashAmount() {
    const text = await this.page.locator("[data-shell-cash-card] strong").textContent().catch(() => "$0");
    return parseMoneyValue(text);
  }

  async readFleetCount() {
    await this.openTab("aircraft");
    await this.page.waitForFunction(() => document.querySelector("[data-aircraft-tab-host]") instanceof HTMLElement);
    const fleetWorkspace = this.page.locator("[data-aircraft-workspace='fleet']").first();
    if (await fleetWorkspace.count()) {
      await clickUi(fleetWorkspace);
      await this.page.waitForFunction(() => document.querySelector("[data-aircraft-workspace='fleet']")?.getAttribute("aria-selected") === "true");
    }
    return await this.page.locator("[data-aircraft-select]").count();
  }

  async readStaffCount() {
    await this.openTab("staffing");
    await this.page.waitForFunction(() => document.querySelector("[data-staffing-tab-host]") instanceof HTMLElement);
    await clickUi(this.page.locator("[data-staffing-workspace-tab='employees']").first());
    await this.page.waitForFunction(() => {
      const panel = document.querySelector("[data-staffing-workspace-panel='employees']");
      return panel instanceof HTMLElement && !panel.hidden;
    });
    return await this.page.locator("[data-staffing-pilot-row]").count();
  }

  async ensureContractsBoardView(boardTab = "available") {
    await this.openTab("contracts");
    await this.page.waitForFunction(() => document.querySelector("[data-contracts-host]") instanceof HTMLElement);
    await clickUi(this.page.locator("[data-workspace-tab='board']").first());
    await clickUi(this.page.locator(`[data-board-tab='${boardTab}']`).first());
    await this.page.waitForFunction((expectedTab) => {
      return document.querySelector(`[data-board-tab="${expectedTab}"]`)?.getAttribute("aria-selected") === "true";
    }, boardTab);
  }

  async applyContractDepartureFilter(departureCode) {
    await this.ensureContractsBoardView("available");
    let popover = this.page.locator("[data-contracts-board-popover='routeSearch']").first();
    if ((await popover.count()) === 0) {
      await clickUi(this.page.locator("button[aria-label='Route search']").first());
      await this.page.waitForFunction(() => {
        const routePopover = document.querySelector("[data-contracts-board-popover='routeSearch']");
        return routePopover instanceof HTMLElement
          && routePopover.querySelector("input[name='departureSearchText']") instanceof HTMLInputElement
          && routePopover.querySelector("input[name='destinationSearchText']") instanceof HTMLInputElement;
      }, { timeout: 60_000 });
      popover = this.page.locator("[data-contracts-board-popover='routeSearch']").first();
    }

    const departureInput = popover.locator("input[name='departureSearchText']").first();
    const destinationInput = popover.locator("input[name='destinationSearchText']").first();
    await departureInput.fill(departureCode);
    await destinationInput.fill("");
    await this.page.waitForFunction((expectedDeparture) => {
      const input = document.querySelector("[data-contracts-board-popover='routeSearch'] input[name='departureSearchText']");
      return input instanceof HTMLInputElement && input.value.trim().toUpperCase() === expectedDeparture;
    }, String(departureCode ?? "").trim().toUpperCase(), { timeout: 60_000 });
    await delay(260);
  }

  async readAcceptedOrActiveContractCount() {
    await this.openTab("contracts");
    await this.page.waitForFunction(() => document.querySelector("[data-contracts-host]") instanceof HTMLElement);
    const activeTabText = await this.page.locator("[data-board-tab='active']").first().textContent().catch(() => "");
    return parseTrailingCount(activeTabText);
  }

  async readClosedContractCount() {
    await this.openTab("contracts");
    await this.page.waitForFunction(() => document.querySelector("[data-contracts-host]") instanceof HTMLElement);
    const closedTabText = await this.page.locator("[data-board-tab='closed']").first().textContent().catch(() => "");
    return parseTrailingCount(closedTabText);
  }

  async openDispatchAndReadAircraft() {
    await this.openTab("dispatch");
    await this.page.waitForFunction(() => document.querySelector("[data-dispatch-tab-host]") instanceof HTMLElement);
    return await this.page.evaluate(() => {
      return [...document.querySelectorAll("[data-dispatch-aircraft-row]")].map((row) => {
        const cells = row.querySelectorAll("td");
        const text = (row.textContent ?? "").replace(/\s+/g, " ").trim();
        return {
          aircraftId: row.getAttribute("data-dispatch-aircraft-row") ?? "",
          registration: cells[0]?.querySelector("strong")?.textContent?.trim() ?? "",
          currentAirport: cells[1]?.querySelector("strong")?.textContent?.trim() ?? "",
          scheduleText: cells[2]?.textContent?.replace(/\s+/g, " ").trim() ?? "",
          pilotCoverageText: cells[3]?.textContent?.replace(/\s+/g, " ").trim() ?? "",
          statusText: cells[4]?.textContent?.replace(/\s+/g, " ").trim() ?? "",
          selected: row.getAttribute("aria-pressed") === "true",
          rowText: text,
        };
      });
    });
  }

  async readAircraftProfile(registration) {
    if (this.cachedAircraftProfiles.has(registration)) {
      return this.cachedAircraftProfiles.get(registration);
    }

    await this.openTab("aircraft");
    await this.page.waitForFunction(() => document.querySelector("[data-aircraft-tab-host]") instanceof HTMLElement);
    await clickUi(this.page.locator("[data-aircraft-workspace='fleet']").first());
    const row = this.page.locator(".aircraft-row").filter({ hasText: registration }).first();
    if (await row.count() === 0) {
      return null;
    }
    await clickUi(row.locator("[data-aircraft-select]").first());
    await this.page.waitForFunction((expectedRegistration) => {
      const detail = document.querySelector(".aircraft-detail-panel")?.textContent ?? "";
      return detail.includes(expectedRegistration);
    }, registration);

    const detailText = (await this.page.locator(".aircraft-detail-panel").textContent()) ?? "";
    const profile = {
      registration,
      ...parseAircraftCapacityText(detailText),
      volumePreference: deriveAircraftVolumePreference(detailText),
      detailText,
    };
    this.cachedAircraftProfiles.set(registration, profile);
    return profile;
  }

  async tryAcquireAircraft() {
    const cashAmount = await this.readCashAmount();
    await this.openTab("aircraft");
    await this.page.waitForFunction(() => document.querySelector("[data-aircraft-tab-host]") instanceof HTMLElement);
    await clickUi(this.page.locator("[data-aircraft-workspace='market']").first());
    await this.page.waitForFunction(() => document.querySelector("[data-aircraft-workspace='market']")?.getAttribute("aria-selected") === "true");

    const rows = await this.page.evaluate(() => {
      return [...document.querySelectorAll("[data-market-select]")].map((row) => ({
        offerId: row.getAttribute("data-market-select") ?? "",
        text: (row.textContent ?? "").replace(/\s+/g, " ").trim(),
      }));
    });

    const candidates = rows
      .map((row) => {
        const metrics = parseAircraftCapacityText(row.text);
        return {
          ...row,
          ...metrics,
          askingPrice: parseMoneyValue(row.text),
          matchesHome: row.text.includes(defaultHomeAirport),
          volumePreference: deriveAircraftVolumePreference(row.text),
        };
      })
      .filter((row) => row.offerId && row.askingPrice > 0 && row.askingPrice <= cashAmount);

    const preferred = candidates
      .filter((row) => this.strategyProfile.preferredKeywords.some((keyword) => row.text.toLowerCase().includes(keyword)))
      .sort((left, right) => {
        const homeBias = Number(right.matchesHome) - Number(left.matchesHome);
        if (homeBias !== 0) {
          return homeBias;
        }
        return left.askingPrice - right.askingPrice;
      })[0];
    const fallback = candidates.sort((left, right) => left.askingPrice - right.askingPrice)[0];
    const chosen = preferred ?? fallback;
    if (!chosen) {
      return false;
    }

    await clickUi(this.page.locator(`[data-market-select='${chosen.offerId}']`).first());
    await this.page.waitForFunction(() => !(document.querySelector("[data-aircraft-market-overlay]")?.hasAttribute("hidden") ?? true));
    const ownershipPreference = ["owned", "financed", "leased"];
    let acquired = false;
    for (const ownershipType of ownershipPreference) {
      const button = this.page.locator(`[data-market-review='${ownershipType}']`).first();
      if ((await button.count()) === 0) {
        continue;
      }
      await clickUi(button);
      const confirmButton = this.page.getByRole("button", { name: "Confirm purchase" });
      if ((await confirmButton.count()) === 0) {
        continue;
      }
      await clickUi(confirmButton);
      try {
        await this.page.waitForFunction(() => {
          const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
          return /Acquired/i.test(flashText);
        }, { timeout: 60_000 });
        acquired = true;
        break;
      } catch {
        await delay(250);
      }
    }

    if (!acquired) {
      return false;
    }

    this.lastAction = `Acquired ${chosen.volumePreference} aircraft for ${chosen.askingPrice.toLocaleString("en-US")} at visible market terms.`;
    this.log("Aircraft acquired.", chosen);
    await this.maybeRefreshArtifacts(true);
    return true;
  }

  async tryHirePilot() {
    await this.openTab("staffing");
    await this.page.waitForFunction(() => document.querySelector("[data-staffing-tab-host]") instanceof HTMLElement);
    await clickUi(this.page.locator("[data-staffing-workspace-tab='hire']").first());
    await this.page.waitForFunction(() => {
      const panel = document.querySelector("[data-staffing-workspace-panel='hire']");
      return panel instanceof HTMLElement && !panel.hidden;
    });

    const rows = this.page.locator("[data-pilot-candidate-row]");
    const rowCount = await rows.count();
    for (let index = 0; index < rowCount; index += 1) {
      const row = rows.nth(index);
      const rowText = ((await row.textContent()) ?? "").replace(/\s+/g, " ").trim();
      if (!/SEPL/i.test(rowText)) {
        continue;
      }

      await clickUi(row.locator("td").first());
      await this.page.waitForFunction(() => {
        const overlay = document.querySelector("[data-staffing-hire-overlay]");
        return overlay instanceof HTMLElement && !overlay.hidden;
      });

      const directButtons = this.page.locator("[data-staffing-detail-body='hire'] [data-staffing-hire-offer-path='direct_hire'] [data-pilot-candidate-hire]");
      const contractButtons = this.page.locator("[data-staffing-detail-body='hire'] [data-staffing-hire-offer-path='contract_hire'] [data-pilot-candidate-hire]");
      const hireButton = (await directButtons.count()) > 0 ? directButtons.first() : contractButtons.first();
      if ((await hireButton.count()) === 0) {
        await clickUi(this.page.locator("[data-staffing-detail-close='hire']").first());
        continue;
      }

      await clickUi(hireButton);
      await this.page.waitForFunction(() => {
        const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
        return /hire|contract/i.test(flashText);
      }, { timeout: 60_000 });
      this.lastAction = "Hired a visible SEPL pilot from the staffing market.";
      this.log("Pilot hired.", { rowText });
      await this.maybeRefreshArtifacts(true);
      return true;
    }

    return false;
  }

  async listVisibleContracts(departureCode = "") {
    if (departureCode) {
      await this.applyContractDepartureFilter(departureCode);
    } else {
      await this.ensureContractsBoardView("available");
    }
    return await this.page.evaluate(() => {
      return [...document.querySelectorAll("[data-select-offer-row]")].map((row) => ({
        offerId: row.getAttribute("data-select-offer-row") ?? "",
        text: (row.textContent ?? "").replace(/\s+/g, " ").trim(),
      }));
    });
  }

  chooseContractForAircraft(aircraft, aircraftProfile, visibleContracts) {
    const preferredVolumeType = aircraftProfile?.volumePreference && aircraftProfile.volumePreference !== "any"
      ? aircraftProfile.volumePreference
      : this.strategyProfile.preferredVolumeType;
    const rangeLimit = Math.max(0, Math.floor((aircraftProfile?.rangeNm ?? 0) * this.strategyProfile.distanceBias));
    const passengerLimit = aircraftProfile?.passengerCapacity ?? 0;
    const cargoLimit = aircraftProfile?.cargoCapacityLb ?? 0;

    const scored = visibleContracts
      .map((row) => {
        const parsed = parseContractRowText(row.text);
        if (!parsed || !row.offerId) {
          return null;
        }
        if (parsed.departure !== aircraft.currentAirport) {
          return null;
        }
        if (preferredVolumeType !== "any" && parsed.volumeType !== preferredVolumeType) {
          return null;
        }
        if (rangeLimit > 0 && parsed.distanceNm > rangeLimit) {
          return null;
        }
        if (parsed.volumeType === "passenger" && passengerLimit > 0 && parsed.passengerCount > passengerLimit) {
          return null;
        }
        if (parsed.volumeType === "cargo" && cargoLimit > 0 && parsed.cargoWeightLb > cargoLimit) {
          return null;
        }
        const notEnoughTime = Number.isFinite(parsed.hoursRemaining)
          && parsed.hoursRemaining < Math.max(4, Math.ceil(parsed.distanceNm / 160) + 2);
        if (notEnoughTime) {
          return null;
        }
        const score = scoreDispatchableContract({
          contract: parsed,
          homeAirport: this.homeAirport,
          preferredVolumeType,
          preferredAirport: this.strategyProfile.preferredAirport,
        });
        return {
          ...row,
          parsed,
          score,
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score);

    return scored[0] ?? null;
  }

  async tryDispatchForAircraft(aircraft) {
    const aircraftProfile = await this.readAircraftProfile(aircraft.registration);
    if (!aircraftProfile) {
      return false;
    }

    const visibleContracts = await this.listVisibleContracts(aircraft.currentAirport);
    const candidate = this.chooseContractForAircraft(aircraft, aircraftProfile, visibleContracts);
    if (!candidate) {
      return false;
    }

    await clickUi(this.page.locator(`[data-select-offer-row='${candidate.offerId}']`).first());
    await this.page.waitForFunction((offerId) => {
      const pane = document.querySelector(`[data-accept-selected-pane="${offerId}"]`);
      return pane instanceof HTMLElement;
    }, candidate.offerId);

    const paneText = ((await this.page.locator(`[data-accept-selected-pane='${candidate.offerId}']`).textContent()) ?? "").replace(/\s+/g, " ").trim();
    if (/No ready aircraft/i.test(paneText)) {
      return false;
    }

    await clickUi(this.page.locator(`[data-accept-selected-pane='${candidate.offerId}']`).first());
    await this.page.waitForFunction(() => {
      const callout = document.querySelector(".contracts-next-step");
      return callout instanceof HTMLElement || document.querySelector("[data-board-tab='active']")?.getAttribute("aria-selected") === "true";
    }, { timeout: 60_000 });

    const dispatchButton = this.page.locator(".contracts-next-step [data-next-step-dispatch]").first();
    if ((await dispatchButton.count()) === 0 || !(await dispatchButton.isEnabled().catch(() => false))) {
      this.lastAction = `Accepted ${candidate.parsed.departure} -> ${candidate.parsed.destination}, but it was not immediately dispatchable.`;
      await this.maybeRefreshArtifacts(true);
      return false;
    }

    await clickUi(dispatchButton);
    await this.page.waitForFunction((expectedRegistration) => {
      return Boolean(document.querySelector("[data-dispatch-tab-host]"))
        && [...document.querySelectorAll("[data-dispatch-aircraft-row]")].some((row) => (row.textContent ?? "").includes(expectedRegistration));
    }, aircraft.registration, { timeout: 60_000 });
    await clickUi(this.page.locator("[data-dispatch-aircraft-row]").filter({ hasText: aircraft.registration }).first());
    await clickUi(this.page.locator("[data-dispatch-auto-plan-contract]").first());

    await delay(350);
    const commitButton = this.page.locator("[data-dispatch-commit-button]").first();
    const commitLabel = ((await commitButton.textContent().catch(() => "")) ?? "").trim();
    const canCommit = await commitButton.isEnabled().catch(() => false);
    if (!canCommit || !/Dispatch contract/i.test(commitLabel)) {
      this.lastAction = `Tried to draft ${candidate.parsed.departure} -> ${candidate.parsed.destination} on ${aircraft.registration}, but the visible dispatch review blocked it.`;
      await this.maybeRefreshArtifacts(true);
      return false;
    }

    await clickUi(commitButton);
    await this.page.waitForFunction(() => {
      const flashText = document.querySelector("[data-shell-flash]")?.textContent ?? "";
      return /Committed schedule/i.test(flashText);
    }, { timeout: 60_000 });

    this.lastAction = `Accepted and dispatched ${candidate.parsed.departure} -> ${candidate.parsed.destination} on ${aircraft.registration} for ${candidate.parsed.payoutAmount.toLocaleString("en-US")}.`;
    this.log("Contract dispatched.", {
      registration: aircraft.registration,
      contract: candidate.parsed,
    });
    await this.maybeRefreshArtifacts(true);
    return true;
  }

  async dispatchIdleAircraft() {
    const aircraft = await this.openDispatchAndReadAircraft();
    const idleAircraft = aircraft
      .filter((entry) => /available/i.test(entry.statusText) && !/committed/i.test(entry.scheduleText))
      .sort((left, right) => {
        const homeBias = Number(right.currentAirport === this.homeAirport) - Number(left.currentAirport === this.homeAirport);
        if (homeBias !== 0) {
          return homeBias;
        }
        return left.registration.localeCompare(right.registration);
      });
    for (const entry of idleAircraft) {
      const dispatched = await this.tryDispatchForAircraft(entry);
      if (dispatched) {
        return true;
      }
    }
    return false;
  }

  async skipToNextEvent() {
    const summary = this.page.locator("[data-clock-menu] summary").first();
    await clickUi(summary);
    await this.page.waitForFunction(() => {
      const menu = document.querySelector("[data-clock-menu]");
      return menu instanceof HTMLDetailsElement && menu.open;
    });
    const button = this.page.locator("[data-clock-next-event]").first();
    if ((await button.count()) === 0 || !(await button.isEnabled().catch(() => false))) {
      await clickUi(summary);
      return false;
    }
    await clickUi(button);
    await delay(500);
    await this.page.waitForFunction(() => {
      const button = document.querySelector("[data-clock-next-event]");
      return !(button instanceof HTMLButtonElement) || !/Skipping/i.test(button.textContent ?? "");
    }, { timeout: 60_000 });
    this.lastAction = "Skipped directly to the next visible calendar event.";
    await this.maybeRefreshArtifacts(true);
    return true;
  }

  async ensureReadyOperation() {
    const fleetCount = await this.readFleetCount();
    const staffCount = await this.readStaffCount();
    if (fleetCount === 0) {
      return await this.tryAcquireAircraft();
    }
    if (staffCount < fleetCount) {
      return await this.tryHirePilot();
    }
    return false;
  }

  async maybeExpandOperation() {
    const cashAmount = await this.readCashAmount();
    const fleetCount = await this.readFleetCount();
    const staffCount = await this.readStaffCount();
    const acceptedOrActiveContractCount = await this.readAcceptedOrActiveContractCount();
    const closedContractCount = await this.readClosedContractCount();
    const targetFleet = desiredFleetSize(this.strategyProfile, cashAmount);
    if (cashAmount <= this.strategyProfile.cashReserveAmount) {
      return false;
    }
    if (acceptedOrActiveContractCount > 0) {
      return false;
    }
    if (closedContractCount < this.strategyProfile.minClosedContractsBeforeExpansion) {
      return false;
    }
    if (fleetCount < targetFleet) {
      const acquired = await this.tryAcquireAircraft();
      if (acquired) {
        return true;
      }
    }
    if (staffCount < Math.max(targetFleet, fleetCount)) {
      return await this.tryHirePilot();
    }
    return false;
  }

  async evaluateStopCondition() {
    const summary = await this.readVisibleSummary();
    if (summary.currentDate && this.startDate) {
      const elapsedDays = Math.floor((summary.currentDate.getTime() - this.startDate.getTime()) / 86_400_000);
      if (elapsedDays >= this.options.horizonDays) {
        return "requested_horizon_reached";
      }
    }
    if (summary.cashAmount < 0 && summary.fleetCount === 0) {
      return "bankruptcy";
    }
    return null;
  }

  async run() {
    await this.start();
    if (this.options.dryRun) {
      await this.writeStatus("dry_run");
      await this.stop("dry_run");
      return;
    }

    try {
      await this.ensureCreateCompanyFlow();
      const hardStopAt = this.options.autoStopMs ? Date.now() + this.options.autoStopMs : null;

      while (!this.stopReason) {
        if (hardStopAt && Date.now() >= hardStopAt) {
          this.stopReason = "auto_stop";
          break;
        }

        await this.maybeRecordCheckpoint();
        await this.maybeRefreshArtifacts();

        const stopReason = await this.evaluateStopCondition();
        if (stopReason) {
          this.stopReason = stopReason;
          break;
        }

        if (await this.ensureReadyOperation()) {
          continue;
        }

        if (await this.dispatchIdleAircraft()) {
          continue;
        }

        if (await this.maybeExpandOperation()) {
          continue;
        }

        if (await this.skipToNextEvent()) {
          continue;
        }

        this.stopReason = "no_productive_action_remaining";
      }
    } catch (error) {
      this.stopReason = "blocker_bug";
      this.lastAction = error instanceof Error ? error.message : String(error);
      await this.writeStatus("failed", {
        error: this.lastAction,
      });
      throw error;
    } finally {
      const summary = await this.readVisibleSummary().catch(() => ({
        cashAmount: this.startingCashAmount,
        fleetCount: 0,
        staffCount: 0,
        acceptedOrActiveContractCount: 0,
        currentDate: this.startDate,
      }));
      const closedContractCount = await this.readClosedContractCount().catch(() => 0);
      const extensionRecommendation = isRunGoingWell({
        startingCashAmount: this.startingCashAmount,
        endingCashAmount: summary.cashAmount,
        fleetCount: summary.fleetCount,
        staffCount: summary.staffCount,
        closedContractCount,
      });
      await this.session?.writeFinalReport({
        saveId: this.saveId,
        stopReason: this.stopReason ?? "manual_stop",
        difficulty: this.chosenDifficulty,
        endingCash: summary.cashAmount,
        fleet: summary.fleetCount,
        staff: summary.staffCount,
        workSummary: `${closedContractCount} closed contract${closedContractCount === 1 ? "" : "s"} | ${summarizeWorkload(summary.acceptedOrActiveContractCount, summary.fleetCount)}`,
        issuesFiled: this.stopReason === "blocker_bug" ? "Issue draft needed from visible blocker." : "No issue drafts recorded.",
        nextMove: extensionRecommendation
          ? "Run is going well after the requested horizon; consider extending it."
          : "Review profitability and bottlenecks before extending.",
      }).catch(() => {
        // Ignore duplicate final-report writes during shutdown.
      });
      await this.writeStatus("finished", {
        stopReason: this.stopReason ?? "manual_stop",
        extensionRecommendation,
      });
      await this.stop(this.stopReason ?? "manual_stop");
    }
  }
}

export async function runPlaytestAutoplayCli(args = process.argv.slice(2)) {
  const options = parsePlaytestAutoplayArgs(args);
  const bot = new FlightLineAutoplayBot(options);
  await bot.run();
  return {
    sessionId: bot.sessionId,
    saveId: bot.saveId,
    displayName: bot.displayName,
    artifactDirectory: bot.artifactDirectory,
    baseUrl: bot.baseUrl,
    difficulty: bot.chosenDifficulty,
    strategy: bot.strategyProfile.sentence,
    stopReason: bot.stopReason,
  };
}

const directRunPath = resolve(process.argv[1] ?? "");
const moduleRunPath = resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (directRunPath === moduleRunPath) {
  runPlaytestAutoplayCli().then((result) => {
    console.log("Playtest autoplay finished.", result);
  }).catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
