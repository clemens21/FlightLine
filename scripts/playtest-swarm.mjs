import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { openSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  defaultCampaignRoot,
  defaultHomeAirport,
  playtestAutoplayStrategyProfiles,
} from "./playtest-autoplay.mjs";

const defaultSwarmCount = 6;
const defaultSwarmViewport = {
  width: 1280,
  height: 800,
};

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

    const nextValue = args[index + 1];
    if (nextValue === undefined || nextValue.startsWith("--")) {
      options[key] = "true";
      continue;
    }

    options[key] = nextValue;
    index += 1;
  }
  return options;
}

function parseIntegerOption(name, value, minimum = 1) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`Expected ${name} to be an integer >= ${minimum}, received "${value ?? ""}".`);
  }
  return parsed;
}

function sanitizeSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "entry";
}

function nowIsoStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function padIndex(value) {
  return String(value).padStart(2, "0");
}

function shuffleInPlace(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    const nextValue = values[index];
    values[index] = values[swapIndex];
    values[swapIndex] = nextValue;
  }
  return values;
}

function buildDifficultyPlan(count) {
  const base = ["easy", "medium", "hard"];
  const planned = [];
  while (planned.length < count) {
    planned.push(...base);
  }
  return shuffleInPlace(planned.slice(0, count));
}

function buildStrategyPlan(count) {
  const baseProfiles = shuffleInPlace([...playtestAutoplayStrategyProfiles]);
  const planned = [];
  while (planned.length < count) {
    planned.push(...baseProfiles.map((profile) => profile.id));
  }
  return planned.slice(0, count);
}

function buildCampaignId() {
  return `playtest_swarm_${nowIsoStamp()}`;
}

export function parsePlaytestSwarmArgs(args = process.argv.slice(2)) {
  const [firstToken, ...restTokens] = args;
  const subcommand = firstToken && !firstToken.startsWith("--")
    ? firstToken
    : "launch";
  const optionTokens = firstToken && !firstToken.startsWith("--")
    ? restTokens
    : args;
  const options = parseCliOptions(optionTokens);

  return {
    subcommand,
    horizonDays: options["horizon-days"] === undefined ? null : parseIntegerOption("--horizon-days", options["horizon-days"], 1),
    count: options.count === undefined ? defaultSwarmCount : parseIntegerOption("--count", options.count, 1),
    artifactRootDir: options["artifact-root"] ? resolve(String(options["artifact-root"])) : defaultCampaignRoot,
    campaignId: options["campaign-id"] ? String(options["campaign-id"]).trim() : null,
    campaignDir: options["campaign-dir"] ? resolve(String(options["campaign-dir"])) : null,
    autoStopMs: options["auto-stop-ms"] === undefined ? null : parseIntegerOption("--auto-stop-ms", options["auto-stop-ms"], 1),
    checkpointIntervalMinutes: options["checkpoint-interval-minutes"] === undefined ? 10 : parseIntegerOption("--checkpoint-interval-minutes", options["checkpoint-interval-minutes"], 1),
    viewportWidth: options["viewport-width"] === undefined ? defaultSwarmViewport.width : parseIntegerOption("--viewport-width", options["viewport-width"], 640),
    viewportHeight: options["viewport-height"] === undefined ? defaultSwarmViewport.height : parseIntegerOption("--viewport-height", options["viewport-height"], 360),
    homeAirport: (options["home-airport"] ? String(options["home-airport"]) : defaultHomeAirport).trim().toUpperCase(),
  };
}

export function buildSwarmSessionPlans({
  count = defaultSwarmCount,
  horizonDays,
  homeAirport = defaultHomeAirport,
  viewport = defaultSwarmViewport,
} = {}) {
  assert.ok(Number.isInteger(count) && count > 0, "buildSwarmSessionPlans requires count > 0.");
  assert.ok(Number.isInteger(horizonDays) && horizonDays > 0, "buildSwarmSessionPlans requires horizonDays > 0.");
  const difficultyPlan = buildDifficultyPlan(count);
  const strategyPlan = buildStrategyPlan(count);

  return Array.from({ length: count }, (_, index) => {
    const strategyId = strategyPlan[index];
    const difficulty = difficultyPlan[index];
    const profile = playtestAutoplayStrategyProfiles.find((entry) => entry.id === strategyId) ?? playtestAutoplayStrategyProfiles[0];
    const ordinal = padIndex(index + 1);
    const sessionLabel = `${ordinal}-${profile.label}-${difficulty}`;
    return {
      ordinal: index + 1,
      sessionLabel,
      sessionId: `playtest_auto_${sanitizeSlug(sessionLabel)}_${nowIsoStamp()}`,
      strategyId,
      strategySentence: profile.sentence,
      difficulty,
      requestedHorizonDays: horizonDays,
      homeAirport,
      viewport,
    };
  });
}

async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
  return path;
}

async function writeJsonFile(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function renderSwarmDashboard({ campaignId, campaignDirectory, sessionPlans }) {
  const generatedAt = new Date().toISOString();
  const cards = sessionPlans.map((plan) => {
    const imagePath = `./${encodeURI(`${plan.sessionId}/live.png`)}`;
    const statusPath = `./${encodeURI(`${plan.sessionId}/live-status.json`)}`;
    const reportPath = `./${encodeURI(`${plan.sessionId}/final-report.md`)}`;
    const manifestPath = `./${encodeURI(`${plan.sessionId}/session-manifest.json`)}`;
    return `
      <article class="session-card" data-session-id="${plan.sessionId}">
        <header class="session-card__header">
          <div>
            <h2>${plan.sessionLabel}</h2>
            <p>${plan.difficulty} | ${plan.strategySentence}</p>
          </div>
          <div class="session-card__links">
            <a href="${statusPath}">status</a>
            <a href="${reportPath}">final report</a>
            <a href="${manifestPath}">manifest</a>
          </div>
        </header>
        <img class="session-card__image" data-src="${imagePath}" src="${imagePath}?t=${Date.now()}" alt="Live screenshot for ${plan.sessionLabel}">
        <footer class="session-card__footer">
          <span>Session ${plan.ordinal}</span>
          <span>Horizon ${plan.requestedHorizonDays} day(s)</span>
          <span>Home ${plan.homeAirport}</span>
        </footer>
      </article>
    `;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="20">
    <title>FlightLine Playtest Swarm ${campaignId}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08111b;
        --panel: #0f1b28;
        --border: rgba(116, 167, 199, 0.18);
        --accent: #66c6d6;
        --text: #e7edf4;
        --muted: #9cb2c4;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 20px;
        font-family: "Segoe UI", system-ui, sans-serif;
        background: radial-gradient(circle at top, rgba(20, 50, 80, 0.5), transparent 42%), var(--bg);
        color: var(--text);
      }
      header.page-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        margin-bottom: 20px;
      }
      header.page-header h1 {
        margin: 0;
        font-size: 28px;
      }
      header.page-header p {
        margin: 0;
        color: var(--muted);
      }
      .session-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
        gap: 16px;
      }
      .session-card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.25);
      }
      .session-card__header,
      .session-card__footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
      }
      .session-card__header h2 {
        margin: 0 0 4px;
        font-size: 18px;
      }
      .session-card__header p,
      .session-card__footer {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
      }
      .session-card__links {
        display: flex;
        gap: 10px;
      }
      .session-card__links a {
        color: var(--accent);
        text-decoration: none;
        font-size: 13px;
      }
      .session-card__image {
        display: block;
        width: 100%;
        aspect-ratio: 16 / 10;
        object-fit: cover;
        background: #061019;
      }
      .page-note {
        margin-top: 12px;
        color: var(--muted);
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <header class="page-header">
      <div>
        <h1>FlightLine Playtest Swarm</h1>
        <p>${campaignId} | ${campaignDirectory}</p>
      </div>
      <p>Generated ${generatedAt}</p>
    </header>
    <main class="session-grid">
      ${cards}
    </main>
    <p class="page-note">The page refreshes every 20 seconds. Each image also gets a fresh cache-busting timestamp when the page reloads.</p>
    <script>
      const timestamp = Date.now();
      for (const image of document.querySelectorAll(".session-card__image")) {
        const source = image.getAttribute("data-src");
        if (source) {
          image.src = source + "?t=" + timestamp;
        }
      }
    </script>
  </body>
</html>
`;
}

async function spawnAutoplaySession({
  repoRoot,
  campaignDirectory,
  sessionPlan,
  checkpointIntervalMinutes,
  autoStopMs,
}) {
  const sessionDirectory = await ensureDirectory(join(campaignDirectory, sessionPlan.sessionId));
  const stdoutPath = join(sessionDirectory, "stdout.log");
  const stderrPath = join(sessionDirectory, "stderr.log");
  const stdoutFd = openSync(stdoutPath, "a");
  const stderrFd = openSync(stderrPath, "a");
  const args = [
    resolve(repoRoot, "scripts", "playtest-autoplay.mjs"),
    "--horizon-days", String(sessionPlan.requestedHorizonDays),
    "--artifact-root", campaignDirectory,
    "--session-id", sessionPlan.sessionId,
    "--session-label", sessionPlan.sessionLabel,
    "--difficulty", sessionPlan.difficulty,
    "--strategy", sessionPlan.strategyId,
    "--home-airport", sessionPlan.homeAirport,
    "--checkpoint-interval-minutes", String(checkpointIntervalMinutes),
    "--viewport-width", String(sessionPlan.viewport.width),
    "--viewport-height", String(sessionPlan.viewport.height),
    "--log-prefix", "swarm",
  ];
  if (autoStopMs) {
    args.push("--auto-stop-ms", String(autoStopMs));
  }

  const child = spawn(process.execPath, args, {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", stdoutFd, stderrFd],
    windowsHide: true,
    env: {
      ...process.env,
      PLAYWRIGHT_HEADFUL: "1",
      PLAYWRIGHT_SLOW_MO: process.env.PLAYWRIGHT_SLOW_MO ?? "0",
    },
  });
  child.unref();
  return {
    pid: child.pid ?? null,
    stdoutPath,
    stderrPath,
  };
}

async function listCampaignSessionDirectories(campaignDirectory) {
  const entries = await readdir(campaignDirectory, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(campaignDirectory, entry.name));
}

async function readSessionStatus(sessionDirectory) {
  const statusPath = join(sessionDirectory, "live-status.json");
  const manifestPath = join(sessionDirectory, "session-manifest.json");
  const manifest = await readJsonFile(manifestPath).catch(() => null);
  const status = await readJsonFile(statusPath).catch(() => null);
  if (status) {
    return status;
  }
  if (manifest) {
    return {
      sessionId: manifest.sessionId,
      sessionLabel: basename(sessionDirectory),
      difficulty: manifest.chosenDifficulty,
      strategy: manifest.strategy,
      requestedHorizonDays: manifest.requestedHorizonDays,
      artifactDirectory: sessionDirectory,
      state: "starting",
      liveScreenshotPath: join(sessionDirectory, "live.png"),
      progress: `Day ? of Day ${manifest.requestedHorizonDays}`,
      lastAction: "Session launching.",
    };
  }
  return null;
}

async function writeCampaignFiles({ campaignDirectory, campaignId, sessionPlans }) {
  await writeJsonFile(join(campaignDirectory, "campaign-manifest.json"), {
    campaignId,
    campaignDirectory,
    generatedAtUtc: new Date().toISOString(),
    sessionPlans,
  });
  await writeFile(join(campaignDirectory, "dashboard.html"), renderSwarmDashboard({
    campaignId,
    campaignDirectory,
    sessionPlans,
  }), "utf8");
}

export async function launchPlaytestSwarm(options) {
  if (!options.horizonDays) {
    throw new Error("launch requires --horizon-days <days>.");
  }

  const campaignId = options.campaignId ?? buildCampaignId();
  const campaignDirectory = options.campaignDir ?? resolve(options.artifactRootDir, campaignId);
  await ensureDirectory(campaignDirectory);
  const sessionPlans = buildSwarmSessionPlans({
    count: options.count,
    horizonDays: options.horizonDays,
    homeAirport: options.homeAirport,
    viewport: {
      width: options.viewportWidth,
      height: options.viewportHeight,
    },
  });

  await writeCampaignFiles({
    campaignDirectory,
    campaignId,
    sessionPlans,
  });

  const repoRoot = process.cwd();
  const launchedSessions = [];
  for (const sessionPlan of sessionPlans) {
    const launchResult = await spawnAutoplaySession({
      repoRoot,
      campaignDirectory,
      sessionPlan,
      checkpointIntervalMinutes: options.checkpointIntervalMinutes,
      autoStopMs: options.autoStopMs,
    });
    launchedSessions.push({
      ...sessionPlan,
      ...launchResult,
      artifactDirectory: join(campaignDirectory, sessionPlan.sessionId),
    });
  }

  await writeJsonFile(join(campaignDirectory, "campaign-status.json"), {
    campaignId,
    campaignDirectory,
    launchedAtUtc: new Date().toISOString(),
    requestedHorizonDays: options.horizonDays,
    count: options.count,
    sessions: launchedSessions,
  });

  return {
    campaignId,
    campaignDirectory,
    dashboardPath: join(campaignDirectory, "dashboard.html"),
    sessions: launchedSessions,
  };
}

export async function readPlaytestSwarmStatus({ campaignDir, artifactRootDir = defaultCampaignRoot, campaignId = null } = {}) {
  const campaignDirectory = campaignDir ?? (campaignId ? resolve(artifactRootDir, campaignId) : null);
  if (!campaignDirectory) {
    throw new Error("status requires --campaign-dir <path> or --campaign-id <id>.");
  }
  const sessionDirectories = await listCampaignSessionDirectories(campaignDirectory);
  const statuses = (await Promise.all(sessionDirectories.map((directory) => readSessionStatus(directory))))
    .filter(Boolean);
  await writeJsonFile(join(campaignDirectory, "sessions.json"), {
    updatedAtUtc: new Date().toISOString(),
    sessions: statuses,
  });
  return {
    campaignDirectory,
    statuses,
    dashboardPath: join(campaignDirectory, "dashboard.html"),
  };
}

async function runLaunchCommand(options) {
  const result = await launchPlaytestSwarm(options);
  console.log(`Playtest swarm launched: ${result.campaignId}`);
  console.log(`Campaign directory: ${result.campaignDirectory}`);
  console.log(`Dashboard: ${result.dashboardPath}`);
  for (const session of result.sessions) {
    console.log(`- ${session.sessionLabel} | pid=${session.pid ?? "unknown"} | ${session.artifactDirectory}`);
  }
}

async function runStatusCommand(options) {
  const status = await readPlaytestSwarmStatus(options);
  console.log(`Campaign directory: ${status.campaignDirectory}`);
  console.log(`Dashboard: ${status.dashboardPath}`);
  for (const session of status.statuses) {
    console.log(`- ${session.sessionLabel ?? session.sessionId} | ${session.state ?? "unknown"} | ${session.progress ?? "no progress yet"} | cash=${session.cashAmount ?? "?"}`);
  }
}

export async function runPlaytestSwarmCli(args = process.argv.slice(2)) {
  const options = parsePlaytestSwarmArgs(args);
  switch (options.subcommand) {
    case "launch":
      await runLaunchCommand(options);
      return;
    case "status":
      await runStatusCommand(options);
      return;
    default:
      throw new Error(`Unknown playtest swarm subcommand "${options.subcommand}".`);
  }
}

const directRunPath = process.argv[1] ? resolve(process.argv[1]) : "";
const moduleRunPath = resolve(fileURLToPath(import.meta.url));
if (directRunPath === moduleRunPath) {
  runPlaytestSwarmCli().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
