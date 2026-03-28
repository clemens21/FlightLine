/*
 * Runs browser-based UI suites after preparing the dist assets they depend on.
 * The runner now supports:
 * - thin shell smoke by default
 * - targeted surface groups
 * - bounded parallel execution for faster local feedback
 */

import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { syncDistSaveSchema } from "./helpers/dist-assets.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(process.cwd(), ".playwright-browsers");

const suiteCatalog = {
  clock: "test/ui-clock.test.mjs",
  shell_navigation: "test/ui-shell-navigation.test.mjs",
  smoke: "test/ui-smoke.test.mjs",
  contracts_workspace: "test/ui-contracts-workspace.test.mjs",
  contracts_dispatch: "test/ui-contracts-dispatch-handoff.test.mjs",
  dispatch: "test/ui-dispatch-workflow.test.mjs",
  staffing: "test/ui-staffing-hire.test.mjs",
  aircraft_market: "test/ui-aircraft-market.test.mjs",
  aircraft_compare: "test/ui-aircraft-compare.test.mjs",
  maintenance_recovery: "test/ui-maintenance-recovery.test.mjs",
};

const groupCatalog = {
  smoke: ["smoke"],
  shell: ["clock", "shell_navigation"],
  contracts: ["contracts_workspace", "contracts_dispatch"],
  dispatch: ["dispatch"],
  staffing: ["staffing"],
  aircraft: ["aircraft_market"],
  aircraft_extended: ["aircraft_market", "aircraft_compare", "maintenance_recovery"],
  core: [
    "clock",
    "shell_navigation",
    "smoke",
    "contracts_workspace",
    "contracts_dispatch",
    "dispatch",
    "staffing",
    "aircraft_market",
  ],
  all: Object.keys(suiteCatalog),
};

function unique(items) {
  return [...new Set(items)];
}

function resolveRequestedSuites(requestedArgs) {
  const tokens = requestedArgs.length > 0 ? requestedArgs : ["core"];
  const resolved = [];

  for (const token of tokens) {
    if (groupCatalog[token]) {
      resolved.push(...groupCatalog[token]);
      continue;
    }

    if (suiteCatalog[token]) {
      resolved.push(token);
      continue;
    }

    const suiteName = Object.entries(suiteCatalog).find(([, filePath]) => filePath === token)?.[0];
    if (suiteName) {
      resolved.push(suiteName);
      continue;
    }

    throw new Error(
      `Unknown UI suite or group "${token}". Known groups: ${Object.keys(groupCatalog).join(", ")}. Known suites: ${Object.keys(suiteCatalog).join(", ")}.`,
    );
  }

  return unique(resolved);
}

function pipeWithPrefix(stream, prefix, writer) {
  if (!stream) {
    return;
  }

  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += String(chunk);
    while (buffer.includes("\n")) {
      const newlineIndex = buffer.indexOf("\n");
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      writer(`[${prefix}] ${line}`);
    }
  });
  stream.on("end", () => {
    const line = buffer.replace(/\r$/, "");
    if (line.length > 0) {
      writer(`[${prefix}] ${line}`);
    }
  });
}

function runSuite(suiteName) {
  const filePath = suiteCatalog[suiteName];
  const absoluteFilePath = resolve(process.cwd(), filePath);
  const runInProcess = process.env.UI_TEST_RUN_IN_PROCESS === "1";

  async function runInProcessSuite() {
    try {
      console.log(`[${suiteName}] starting in-process`);
      await import(`${pathToFileURL(absoluteFilePath).href}?suite=${encodeURIComponent(suiteName)}&run=${Date.now()}`);
      console.log(`[${suiteName}] passed`);
      return {
        suiteName,
        exitCode: 0,
      };
    } catch (error) {
      console.error(`[${suiteName}] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      return {
        suiteName,
        exitCode: 1,
        error,
      };
    }
  }

  if (runInProcess) {
    return runInProcessSuite();
  }

  return new Promise((resolveSuite) => {
    let child;
    try {
      child = spawn(process.execPath, [absoluteFilePath], {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EPERM") {
        console.warn(`[${suiteName}] child-process spawn is blocked; falling back to in-process execution.`);
        runInProcessSuite().then(resolveSuite);
        return;
      }
      resolveSuite({
        suiteName,
        exitCode: 1,
        error,
      });
      return;
    }

    pipeWithPrefix(child.stdout, suiteName, console.log);
    pipeWithPrefix(child.stderr, suiteName, console.error);

    child.once("error", (error) => {
      resolveSuite({
        suiteName,
        exitCode: 1,
        error,
      });
    });
    child.once("exit", (code, signal) => {
      resolveSuite({
        suiteName,
        exitCode: signal ? 1 : (code ?? 1),
        signal,
      });
    });
  });
}

async function runSelectedSuites(selectedSuites) {
  const queue = [...selectedSuites];
  const results = [];
  const runInProcess = process.env.UI_TEST_RUN_IN_PROCESS === "1";
  const requestedConcurrency = Number.parseInt(process.env.UI_TEST_CONCURRENCY ?? "", 10);
  const concurrencyCap = Number.isFinite(requestedConcurrency) && requestedConcurrency > 0
    ? requestedConcurrency
    : Math.min(4, Math.max(1, availableParallelism() - 1));
  const concurrency = runInProcess
    ? 1
    : Math.max(1, Math.min(queue.length, concurrencyCap));

  console.log(`Running ${queue.length} UI browser suite(s) with concurrency ${concurrency}.`);
  console.log(`Suites: ${selectedSuites.join(", ")}`);

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const suiteName = queue.shift();
        if (!suiteName) {
          return;
        }
        const result = await runSuite(suiteName);
        results.push(result);
      }
    }),
  );

  const failures = results.filter((result) => result.exitCode !== 0);
  if (failures.length === 0) {
    console.log(`UI suites passed: ${selectedSuites.join(", ")}`);
    return;
  }

  const failureSummary = failures
    .map((result) => {
      const reason = result.error instanceof Error
        ? result.error.message
        : result.signal
          ? `signal ${result.signal}`
          : `exit ${result.exitCode}`;
      return `${result.suiteName} (${reason})`;
    })
    .join(", ");

  throw new Error(`UI suite failures: ${failureSummary}`);
}

try {
  await syncDistSaveSchema();
  const selectedSuites = resolveRequestedSuites(process.argv.slice(2));
  await runSelectedSuites(selectedSuites);
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
