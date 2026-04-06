import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { syncDistSaveSchema } from "../test/helpers/dist-assets.mjs";
import { launchBrowser } from "../test/helpers/playwright-ui-testkit.mjs";
import { allocatePort, startUiServer } from "../test/helpers/ui-testkit.mjs";

export const playtestDifficultyOptions = ["easy", "medium", "hard"];
export const defaultPlaytestStrategy = "contract-throughput-first profitability";
export const defaultPlaytestViewport = {
  width: 1920,
  height: 1080,
};
export const defaultCheckpointIntervalMinutes = 10;

function sanitizeSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "entry";
}

function padOrdinal(value) {
  return String(value).padStart(3, "0");
}

function timeStampFragment(date = new Date()) {
  const iso = date.toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function prettyIso(value) {
  return new Date(value).toISOString();
}

async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
  return path;
}

async function writeJsonFile(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeMarkdownFile(path, value) {
  await writeFile(path, `${value.trimEnd()}\n`, "utf8");
}

function parseIntegerOption(name, value, { minimum = 1 } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`Expected ${name} to be an integer >= ${minimum}, received "${value ?? ""}".`);
  }
  return parsed;
}

function parseNumberOption(name, value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected ${name} to be numeric, received "${value ?? ""}".`);
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

export function chooseRandomPlaytestDifficulty(randomIndex = randomInt(playtestDifficultyOptions.length)) {
  if (!Number.isInteger(randomIndex) || randomIndex < 0 || randomIndex >= playtestDifficultyOptions.length) {
    throw new Error(`Random playtest difficulty index ${randomIndex} is out of range.`);
  }
  return playtestDifficultyOptions[randomIndex];
}

export function parsePlaytestWatchArgs(args = process.argv.slice(2)) {
  const [firstToken, ...restTokens] = args;
  const subcommand = firstToken && !firstToken.startsWith("--")
    ? firstToken
    : "watch";
  const options = parseCliOptions(subcommand === "watch" ? args : restTokens);

  return {
    subcommand,
    horizonDays: options["horizon-days"] === undefined
      ? null
      : parseIntegerOption("--horizon-days", options["horizon-days"]),
    artifactDir: options["artifact-dir"] ? resolve(String(options["artifact-dir"])) : null,
    artifactRootDir: options["artifact-root"] ? resolve(String(options["artifact-root"])) : resolve(process.cwd(), "artifacts", "playtests"),
    sessionId: options["session-id"] ? String(options["session-id"]).trim() : null,
    difficulty: options.difficulty ? String(options.difficulty).trim() : null,
    strategy: options.strategy ? String(options.strategy).trim() : defaultPlaytestStrategy,
    autoStopMs: options["auto-stop-ms"] === undefined
      ? null
      : parseIntegerOption("--auto-stop-ms", options["auto-stop-ms"]),
    checkpointIntervalMinutes: options["checkpoint-interval-minutes"] === undefined
      ? defaultCheckpointIntervalMinutes
      : parseIntegerOption("--checkpoint-interval-minutes", options["checkpoint-interval-minutes"]),
    saveId: options["save-id"] ? String(options["save-id"]).trim() : null,
    displayName: options["display-name"] ? String(options["display-name"]).trim() : null,
    cash: options.cash === undefined ? null : parseNumberOption("--cash", options.cash),
    progress: options.progress ? String(options.progress).trim() : null,
    fleet: options.fleet === undefined ? null : parseIntegerOption("--fleet", options.fleet, { minimum: 0 }),
    staff: options.staff === undefined ? null : parseIntegerOption("--staff", options.staff, { minimum: 0 }),
    work: options.work ? String(options.work).trim() : null,
    decisions: options.decisions ? String(options.decisions).trim() : null,
    bugs: options.bugs ? String(options.bugs).trim() : null,
    title: options.title ? String(options.title).trim() : null,
    severity: options.severity ? String(options.severity).trim() : null,
    area: options.area ? String(options.area).trim() : null,
    blocking: options.blocking === undefined ? null : parseBooleanOption(options.blocking),
    summary: options.summary ? String(options.summary).trim() : null,
    repro: options.repro ? String(options.repro).trim() : null,
    observedAtUtc: options["observed-at-utc"] ? prettyIso(options["observed-at-utc"]) : null,
    stopReason: options["stop-reason"] ? String(options["stop-reason"]).trim() : null,
    endingCash: options["ending-cash"] === undefined ? null : parseNumberOption("--ending-cash", options["ending-cash"]),
    workSummary: options["work-summary"] ? String(options["work-summary"]).trim() : null,
    issuesFiled: options["issues-filed"] ? String(options["issues-filed"]).trim() : null,
    nextMove: options["next-move"] ? String(options["next-move"]).trim() : null,
  };
}

function createSessionId(now = new Date()) {
  return `playtest_${timeStampFragment(now)}`;
}

async function loadJsonFile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function checkpointMarkdown(record) {
  return `# Playtest Checkpoint ${padOrdinal(record.checkpointIndex)}

- Real time: ${record.recordedAtUtc}
- Save: ${record.saveId ?? "not set"}
- Difficulty: ${record.difficulty}
- Progress: ${record.progress}
- Cash: ${record.cash}
- Fleet: ${record.fleet}
- Staff: ${record.staff}
- Active or scheduled work: ${record.work}
- Major decisions: ${record.decisions}
- Bugs since last checkpoint: ${record.bugs}
- Screenshot: ${record.screenshotFileName ?? "none"}
`;
}

function issueMarkdown(record) {
  return `# ${record.title}

- Recorded at: ${record.recordedAtUtc}
- Save: ${record.saveId ?? "not set"}
- Severity: ${record.severity}
- Label: bug
- Label: ${record.severityLabel}
- Label: ${record.area}
- Blocking: ${record.blocking ? "yes" : "no"}
- Required action: ${record.requiredAction}
- Summary: ${record.summary}

## Reproduction

${record.repro}
`;
}

function finalReportMarkdown(record) {
  return `# Playtest Final Report

- Recorded at: ${record.recordedAtUtc}
- Save: ${record.saveId ?? "not set"}
- Requested horizon: ${record.requestedHorizonDays} in-game day(s)
- Stop reason: ${record.stopReason}
- Difficulty: ${record.difficulty}
- Ending cash: ${record.endingCash}
- Fleet: ${record.fleet}
- Staff: ${record.staff}
- Work summary: ${record.workSummary}
- Issues filed: ${record.issuesFiled}
- Next move: ${record.nextMove}
`;
}

export async function createPlaytestArtifactRecorder({
  artifactRootDir = resolve(process.cwd(), "artifacts", "playtests"),
  sessionId = createSessionId(),
  requestedHorizonDays,
  chosenDifficulty,
  strategy = defaultPlaytestStrategy,
  resume = false,
} = {}) {
  assert.ok(Number.isInteger(requestedHorizonDays) && requestedHorizonDays > 0, "createPlaytestArtifactRecorder requires requestedHorizonDays > 0.");
  assert.ok(playtestDifficultyOptions.includes(chosenDifficulty), "createPlaytestArtifactRecorder requires a valid chosenDifficulty.");

  const artifactDirectory = await ensureDirectory(resolve(artifactRootDir, sessionId));
  const screenshotsDirectory = await ensureDirectory(join(artifactDirectory, "screenshots"));
  const checkpointsDirectory = await ensureDirectory(join(artifactDirectory, "checkpoints"));
  const issuesDirectory = await ensureDirectory(join(artifactDirectory, "issues"));
  const manifestPath = join(artifactDirectory, "session-manifest.json");
  const existingManifest = resume
    ? await loadJsonFile(manifestPath).catch(() => null)
    : null;

  let screenshotIndex = existingManifest
    ? (await readdir(screenshotsDirectory)).filter((name) => name.endsWith(".png")).length
    : 0;
  let checkpointIndex = existingManifest
    ? (await readdir(checkpointsDirectory)).filter((name) => name.endsWith(".json")).length
    : 0;
  let issueIndex = existingManifest
    ? (await readdir(issuesDirectory)).filter((name) => name.endsWith(".json")).length
    : 0;

  const manifest = existingManifest ?? {
    sessionId,
    artifactDirectory,
    createdAtUtc: new Date().toISOString(),
    requestedHorizonDays,
    chosenDifficulty,
    strategy,
    latestScreenshotRelativePath: null,
    runContext: {
      saveId: null,
      displayName: null,
    },
  };

  async function persistManifest() {
    await writeJsonFile(manifestPath, manifest);
  }

  async function updateRunContext({
    saveId = manifest.runContext.saveId,
    displayName = manifest.runContext.displayName,
  } = {}) {
    manifest.runContext = {
      saveId: saveId ?? null,
      displayName: displayName ?? null,
    };
    await persistManifest();
    return structuredClone(manifest.runContext);
  }

  async function captureScreenshot({
    label = "checkpoint",
    takeScreenshot,
  } = {}) {
    assert.equal(typeof takeScreenshot, "function", "captureScreenshot requires a takeScreenshot function.");
    screenshotIndex += 1;
    const fileName = `${padOrdinal(screenshotIndex)}-${sanitizeSlug(label)}.png`;
    const filePath = join(screenshotsDirectory, fileName);
    await takeScreenshot(filePath);
    manifest.latestScreenshotRelativePath = join("screenshots", fileName);
    await persistManifest();
    return {
      fileName,
      filePath,
      relativePath: manifest.latestScreenshotRelativePath,
    };
  }

  async function recordCheckpoint({
    saveId = manifest.runContext.saveId,
    displayName = manifest.runContext.displayName,
    difficulty = chosenDifficulty,
    progress,
    cash,
    fleet,
    staff,
    work,
    decisions,
    bugs,
    screenshotRelativePath = manifest.latestScreenshotRelativePath,
  } = {}) {
    assert.ok(progress, "recordCheckpoint requires progress.");
    assert.ok(Number.isFinite(cash), "recordCheckpoint requires cash.");
    assert.ok(Number.isInteger(fleet) && fleet >= 0, "recordCheckpoint requires fleet >= 0.");
    assert.ok(Number.isInteger(staff) && staff >= 0, "recordCheckpoint requires staff >= 0.");
    assert.ok(work, "recordCheckpoint requires work.");
    assert.ok(decisions, "recordCheckpoint requires decisions.");
    assert.ok(bugs, "recordCheckpoint requires bugs.");

    checkpointIndex += 1;
    const recordedAtUtc = new Date().toISOString();
    const baseName = `${padOrdinal(checkpointIndex)}-${sanitizeSlug(progress)}`;
    const record = {
      checkpointIndex,
      recordedAtUtc,
      saveId: saveId ?? null,
      displayName: displayName ?? null,
      difficulty,
      progress,
      cash,
      fleet,
      staff,
      work,
      decisions,
      bugs,
      screenshotRelativePath: screenshotRelativePath ?? null,
      screenshotFileName: screenshotRelativePath ? basename(screenshotRelativePath) : null,
    };

    await writeJsonFile(join(checkpointsDirectory, `${baseName}.json`), record);
    await writeMarkdownFile(join(checkpointsDirectory, `${baseName}.md`), checkpointMarkdown(record));
    return record;
  }

  async function recordIssue({
    saveId = manifest.runContext.saveId,
    title,
    severity,
    area,
    blocking,
    summary,
    repro,
    observedAtUtc = new Date().toISOString(),
    screenshotRelativePath = manifest.latestScreenshotRelativePath,
  } = {}) {
    assert.ok(title, "recordIssue requires title.");
    assert.ok(severity, "recordIssue requires severity.");
    assert.ok(area, "recordIssue requires area.");
    assert.equal(typeof blocking, "boolean", "recordIssue requires blocking boolean.");
    assert.ok(summary, "recordIssue requires summary.");
    assert.ok(repro, "recordIssue requires repro.");

    issueIndex += 1;
    const recordedAtUtc = new Date().toISOString();
    const baseName = `${padOrdinal(issueIndex)}-${sanitizeSlug(title)}`;
    const record = {
      issueIndex,
      recordedAtUtc,
      observedAtUtc,
      saveId: saveId ?? null,
      title,
      severity,
      area,
      blocking,
      requiredAction: blocking ? "stop_run" : "continue_run",
      summary,
      repro,
      screenshotRelativePath: screenshotRelativePath ?? null,
      screenshotFileName: screenshotRelativePath ? basename(screenshotRelativePath) : null,
      severityLabel: `severity:${severity}`,
      labels: ["bug", `severity:${severity}`, area],
    };

    await writeJsonFile(join(issuesDirectory, `${baseName}.json`), record);
    await writeMarkdownFile(join(issuesDirectory, `${baseName}.md`), issueMarkdown(record));
    return record;
  }

  async function writeFinalReport({
    saveId = manifest.runContext.saveId,
    requestedHorizonDays: reportHorizonDays = requestedHorizonDays,
    stopReason,
    difficulty = chosenDifficulty,
    endingCash,
    fleet,
    staff,
    workSummary,
    issuesFiled,
    nextMove,
  } = {}) {
    assert.ok(reportHorizonDays, "writeFinalReport requires requestedHorizonDays.");
    assert.ok(stopReason, "writeFinalReport requires stopReason.");
    assert.ok(Number.isFinite(endingCash), "writeFinalReport requires endingCash.");
    assert.ok(Number.isInteger(fleet) && fleet >= 0, "writeFinalReport requires fleet >= 0.");
    assert.ok(Number.isInteger(staff) && staff >= 0, "writeFinalReport requires staff >= 0.");
    assert.ok(workSummary, "writeFinalReport requires workSummary.");
    assert.ok(issuesFiled, "writeFinalReport requires issuesFiled.");
    assert.ok(nextMove, "writeFinalReport requires nextMove.");

    const record = {
      recordedAtUtc: new Date().toISOString(),
      saveId: saveId ?? null,
      requestedHorizonDays: reportHorizonDays,
      stopReason,
      difficulty,
      endingCash,
      fleet,
      staff,
      workSummary,
      issuesFiled,
      nextMove,
    };

    await writeJsonFile(join(artifactDirectory, "final-report.json"), record);
    await writeMarkdownFile(join(artifactDirectory, "final-report.md"), finalReportMarkdown(record));
    return record;
  }

  async function hasFinalReport() {
    return access(join(artifactDirectory, "final-report.json")).then(() => true).catch(() => false);
  }

  await persistManifest();

  return {
    sessionId,
    artifactDirectory,
    screenshotsDirectory,
    checkpointsDirectory,
    issuesDirectory,
    manifestPath,
    requestedHorizonDays,
    chosenDifficulty,
    strategy,
    updateRunContext,
    captureScreenshot,
    recordCheckpoint,
    recordIssue,
    writeFinalReport,
    hasFinalReport,
    async loadManifest() {
      return loadJsonFile(manifestPath);
    },
  };
}

export async function startWatchedPlaytestSession({
  horizonDays,
  artifactRootDir,
  sessionId,
  difficulty,
  strategy = defaultPlaytestStrategy,
  viewport = defaultPlaytestViewport,
} = {}) {
  const requestedHorizonDays = parseIntegerOption("horizonDays", horizonDays);
  const chosenDifficulty = difficulty ?? chooseRandomPlaytestDifficulty();
  const artifactRecorder = await createPlaytestArtifactRecorder({
    artifactRootDir,
    sessionId,
    requestedHorizonDays,
    chosenDifficulty,
    strategy,
  });

  await syncDistSaveSchema();
  const port = await allocatePort();
  const server = await startUiServer(port);
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport });

  await page.goto(server.baseUrl, { waitUntil: "domcontentloaded" });
  try {
    await artifactRecorder.captureScreenshot({
      label: "session-start",
      takeScreenshot: (filePath) => page.screenshot({ path: filePath, fullPage: true }),
    });
  } catch {
    // Do not block the playtest session on a startup screenshot failure.
  }

  let stopped = false;

  async function stop({ reason = "manual_stop" } = {}) {
    if (stopped) {
      return;
    }
    stopped = true;
    await Promise.allSettled([
      browser.close(),
      server.stop(),
    ]);
    if (!(await artifactRecorder.hasFinalReport())) {
      await artifactRecorder.writeFinalReport({
        stopReason: reason,
        endingCash: 0,
        fleet: 0,
        staff: 0,
        workSummary: "Session ended before the operator wrote a final report override.",
        issuesFiled: "See issue drafts in the artifacts directory if any were recorded.",
        nextMove: "No next move captured.",
      }).catch(() => {
        // Do not block shutdown if the operator already wrote a final report.
      });
    }
  }

  return {
    ...artifactRecorder,
    requestedHorizonDays,
    chosenDifficulty,
    strategy,
    baseUrl: server.baseUrl,
    browser,
    page,
    async captureLiveScreenshot(label = "checkpoint") {
      return artifactRecorder.captureScreenshot({
        label,
        takeScreenshot: (filePath) => page.screenshot({ path: filePath, fullPage: true }),
      });
    },
    async recordLiveCheckpoint(data = {}) {
      const screenshot = await artifactRecorder.captureScreenshot({
        label: data.label ?? `checkpoint-${data.progress ?? "progress"}`,
        takeScreenshot: (filePath) => page.screenshot({ path: filePath, fullPage: true }),
      });
      return artifactRecorder.recordCheckpoint({
        ...data,
        screenshotRelativePath: screenshot.relativePath,
      });
    },
    async recordLiveIssue(data = {}) {
      return artifactRecorder.recordIssue(data);
    },
    stop,
  };
}

async function runWatchCommand(options) {
  if (!options.horizonDays) {
    throw new Error("The watched playtest runner requires --horizon-days <days>.");
  }

  const session = await startWatchedPlaytestSession({
    horizonDays: options.horizonDays,
    artifactRootDir: options.artifactRootDir,
    sessionId: options.sessionId ?? undefined,
    difficulty: options.difficulty ?? undefined,
    strategy: options.strategy,
  });

  console.log("Playtest session started.");
  console.log(`Session id: ${session.sessionId}`);
  console.log(`Artifact directory: ${session.artifactDirectory}`);
  console.log(`Requested horizon: ${session.requestedHorizonDays} in-game day(s)`);
  console.log(`Chosen difficulty: ${session.chosenDifficulty}`);
  console.log(`Strategy: ${session.strategy}`);
  console.log(`Base URL: ${session.baseUrl}`);
  console.log(`Checkpoint cadence: every ${options.checkpointIntervalMinutes} real-life minute(s)`);
  console.log(`Use "node scripts/playtest-watch.mjs checkpoint --artifact-dir ${session.artifactDirectory} ..." to record summaries.`);

  const intervalMs = options.checkpointIntervalMinutes * 60 * 1000;
  const reminderHandle = setInterval(async () => {
    try {
      const screenshot = await session.captureLiveScreenshot(`interval-${Date.now()}`);
      console.log(`[playtest:${session.sessionId}] Checkpoint due. Reminder screenshot: ${screenshot.relativePath}`);
    } catch (error) {
      console.error(`[playtest:${session.sessionId}] Could not capture reminder screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, intervalMs);
  reminderHandle.unref();

  const stopSession = async (reason) => {
    clearInterval(reminderHandle);
    await session.stop({ reason });
  };

  if (options.autoStopMs) {
    await delay(options.autoStopMs);
    await stopSession("auto_stop");
    return;
  }

  await new Promise((resolveRun) => {
    const finish = async (signal) => {
      process.off("SIGINT", onSigInt);
      process.off("SIGTERM", onSigTerm);
      await stopSession(signal === "SIGINT" ? "manual_interrupt" : "terminated");
      resolveRun();
    };
    const onSigInt = () => {
      void finish("SIGINT");
    };
    const onSigTerm = () => {
      void finish("SIGTERM");
    };
    process.on("SIGINT", onSigInt);
    process.on("SIGTERM", onSigTerm);
  });
}

async function loadRecorderFromArtifactDirectory(artifactDir) {
  const manifestPath = join(artifactDir, "session-manifest.json");
  const manifest = await loadJsonFile(manifestPath);
  const recorder = await createPlaytestArtifactRecorder({
    artifactRootDir: dirname(artifactDir),
    sessionId: basename(artifactDir),
    requestedHorizonDays: manifest.requestedHorizonDays,
    chosenDifficulty: manifest.chosenDifficulty,
    strategy: manifest.strategy,
    resume: true,
  });
  await recorder.updateRunContext({
    saveId: manifest.runContext?.saveId ?? null,
    displayName: manifest.runContext?.displayName ?? null,
  });
  return {
    recorder,
    manifest,
  };
}

async function runCheckpointCommand(options) {
  if (!options.artifactDir) {
    throw new Error("checkpoint requires --artifact-dir <path>.");
  }

  const { recorder, manifest } = await loadRecorderFromArtifactDirectory(options.artifactDir);
  await recorder.updateRunContext({
    saveId: options.saveId ?? manifest.runContext?.saveId ?? null,
    displayName: options.displayName ?? manifest.runContext?.displayName ?? null,
  });
  await recorder.recordCheckpoint({
    saveId: options.saveId ?? manifest.runContext?.saveId ?? null,
    displayName: options.displayName ?? manifest.runContext?.displayName ?? null,
    difficulty: options.difficulty ?? manifest.chosenDifficulty,
    progress: options.progress,
    cash: options.cash,
    fleet: options.fleet,
    staff: options.staff,
    work: options.work,
    decisions: options.decisions,
    bugs: options.bugs,
    screenshotRelativePath: manifest.latestScreenshotRelativePath,
  });
}

async function runIssueCommand(options) {
  if (!options.artifactDir) {
    throw new Error("issue requires --artifact-dir <path>.");
  }

  const { recorder, manifest } = await loadRecorderFromArtifactDirectory(options.artifactDir);
  await recorder.updateRunContext({
    saveId: options.saveId ?? manifest.runContext?.saveId ?? null,
    displayName: options.displayName ?? manifest.runContext?.displayName ?? null,
  });
  await recorder.recordIssue({
    saveId: options.saveId ?? manifest.runContext?.saveId ?? null,
    title: options.title,
    severity: options.severity,
    area: options.area,
    blocking: options.blocking,
    summary: options.summary,
    repro: options.repro,
    observedAtUtc: options.observedAtUtc ?? new Date().toISOString(),
    screenshotRelativePath: manifest.latestScreenshotRelativePath,
  });
}

async function runFinalReportCommand(options) {
  if (!options.artifactDir) {
    throw new Error("final-report requires --artifact-dir <path>.");
  }

  const { recorder, manifest } = await loadRecorderFromArtifactDirectory(options.artifactDir);
  await recorder.updateRunContext({
    saveId: options.saveId ?? manifest.runContext?.saveId ?? null,
    displayName: options.displayName ?? manifest.runContext?.displayName ?? null,
  });
  await recorder.writeFinalReport({
    saveId: options.saveId ?? manifest.runContext?.saveId ?? null,
    requestedHorizonDays: manifest.requestedHorizonDays,
    stopReason: options.stopReason,
    difficulty: options.difficulty ?? manifest.chosenDifficulty,
    endingCash: options.endingCash,
    fleet: options.fleet,
    staff: options.staff,
    workSummary: options.workSummary,
    issuesFiled: options.issuesFiled,
    nextMove: options.nextMove,
  });
}

export async function runPlaytestCli(args = process.argv.slice(2)) {
  const options = parsePlaytestWatchArgs(args);

  switch (options.subcommand) {
    case "watch":
      await runWatchCommand(options);
      return;
    case "checkpoint":
      await runCheckpointCommand(options);
      return;
    case "issue":
      await runIssueCommand(options);
      return;
    case "final-report":
      await runFinalReportCommand(options);
      return;
    default:
      throw new Error(`Unknown playtest subcommand "${options.subcommand}".`);
  }
}

const directRunPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === resolve(directRunPath)) {
  runPlaytestCli().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
