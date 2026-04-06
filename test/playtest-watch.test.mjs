import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  chooseRandomPlaytestDifficulty,
  createPlaytestArtifactRecorder,
  defaultPlaytestStrategy,
  parsePlaytestWatchArgs,
} from "../scripts/playtest-watch.mjs";

const artifactRootDir = await mkdtemp(join(tmpdir(), "flightline-playtest-watch-"));

assert.equal(chooseRandomPlaytestDifficulty(0), "easy");
assert.equal(chooseRandomPlaytestDifficulty(1), "medium");
assert.equal(chooseRandomPlaytestDifficulty(2), "hard");
assert.throws(() => chooseRandomPlaytestDifficulty(3));
assert.equal(defaultPlaytestStrategy, "contract-throughput-first profitability");

const watchArgs = parsePlaytestWatchArgs(["--horizon-days", "30", "--strategy", "fleet-first"]);
assert.equal(watchArgs.subcommand, "watch");
assert.equal(watchArgs.horizonDays, 30);
assert.equal(watchArgs.strategy, "fleet-first");

const checkpointArgs = parsePlaytestWatchArgs([
  "checkpoint",
  "--artifact-dir",
  "artifacts/playtests/demo",
  "--cash",
  "4200000",
  "--difficulty",
  "medium",
  "--progress",
  "Day 3 of Day 30",
  "--fleet",
  "2",
  "--staff",
  "3",
  "--work",
  "1 aircraft flying",
  "--decisions",
  "Accepted a return cargo leg.",
  "--bugs",
  "none",
]);
assert.equal(checkpointArgs.subcommand, "checkpoint");
assert.equal(checkpointArgs.artifactDir, resolve("artifacts/playtests/demo"));
assert.equal(checkpointArgs.cash, 4_200_000);

const recorder = await createPlaytestArtifactRecorder({
  artifactRootDir,
  sessionId: "playtest_test_session",
  requestedHorizonDays: 7,
  chosenDifficulty: "medium",
});

await recorder.updateRunContext({
  saveId: "save_playtest_demo",
  displayName: "Playtest Demo",
});

const screenshot = await recorder.captureScreenshot({
  label: "session-start",
  takeScreenshot: async (filePath) => {
    await writeFile(filePath, "fake-image", "utf8");
  },
});
assert.ok(screenshot.relativePath.endsWith(".png"));

const checkpoint = await recorder.recordCheckpoint({
  progress: "Day 2 of Day 7",
  cash: 4_079_458,
  fleet: 1,
  staff: 1,
  work: "1 accepted contract scheduled",
  decisions: "Accepted one cargo contract and staged a departure.",
  bugs: "none",
});
assert.equal(checkpoint.screenshotRelativePath, screenshot.relativePath);

const nonBlockingIssue = await recorder.recordIssue({
  title: "Clock panel clips the agenda footer",
  severity: "medium",
  area: "area:clock",
  blocking: false,
  summary: "The agenda footer overlaps the final event card at 1280x720.",
  repro: "1. Open the clock panel. 2. Resize to 1280x720. 3. Observe overlap.",
});
assert.equal(nonBlockingIssue.requiredAction, "continue_run");

const blockingIssue = await recorder.recordIssue({
  title: "Dispatch accept path hard locks after route commit",
  severity: "critical",
  area: "area:dispatch",
  blocking: true,
  summary: "Committed work can no longer be dispatched from the visible UI.",
  repro: "1. Commit a route. 2. Return to Dispatch. 3. Observe no visible dispatch path.",
});
assert.equal(blockingIssue.requiredAction, "stop_run");

const finalReport = await recorder.writeFinalReport({
  stopReason: "requested_horizon_reached",
  endingCash: 4_512_000,
  fleet: 2,
  staff: 3,
  workSummary: "Completed 4 contracts and ended with 1 accepted route queued.",
  issuesFiled: "Filed 2 issues.",
  nextMove: "Hire one more pilot before expanding to a third aircraft.",
});
assert.equal(finalReport.requestedHorizonDays, 7);

const manifest = JSON.parse(await readFile(recorder.manifestPath, "utf8"));
assert.equal(manifest.requestedHorizonDays, 7);
assert.equal(manifest.chosenDifficulty, "medium");
assert.equal(manifest.runContext.saveId, "save_playtest_demo");
assert.equal(manifest.latestScreenshotRelativePath, screenshot.relativePath);

const checkpointMarkdown = await readFile(join(recorder.checkpointsDirectory, "001-day-2-of-day-7.md"), "utf8");
assert.match(checkpointMarkdown, /Day 2 of Day 7/);
assert.match(checkpointMarkdown, /1 accepted contract scheduled/);

const issueMarkdown = await readFile(join(recorder.issuesDirectory, "002-dispatch-accept-path-hard-locks-after-route-commit.md"), "utf8");
assert.match(issueMarkdown, /Required action: stop_run/);
assert.match(issueMarkdown, /area:dispatch/);

const reportMarkdown = await readFile(join(recorder.artifactDirectory, "final-report.md"), "utf8");
assert.match(reportMarkdown, /requested_horizon_reached/);
assert.match(reportMarkdown, /Hire one more pilot before expanding/);

const playtesterDoc = await readFile(resolve("team-ops/supporting/flightline_playtester_specialist_package.md"), "utf8");
assert.match(playtesterDoc, /source-blind and UI-only/i);
assert.match(playtesterDoc, /requested in-game horizon/i);
assert.match(playtesterDoc, /equal odds across `easy`, `medium`, and `hard`/i);
assert.match(playtesterDoc, /complete as many contracts as possible/i);

const promptPack = await readFile(resolve("team-ops/supporting/flightline_role_prompt_pack.md"), "utf8");
assert.match(promptPack, /Playtester Specialist Prompt/);
assert.match(promptPack, /use only the visible FlightLine UI/i);
assert.match(promptPack, /completing as many contracts as possible/i);

const agentsDoc = await readFile(resolve("AGENTS.md"), "utf8");
assert.match(agentsDoc, /Playtester.*specialist package/i);
