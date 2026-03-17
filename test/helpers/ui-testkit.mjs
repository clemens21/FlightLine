/*
 * Provides shared helpers for starting the UI server, allocating ports, and creating workspace-scoped backend instances in tests.
 * It is the infrastructure layer that both HTTP and Playwright tests build on.
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import net from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Worker } from "node:worker_threads";

import { FlightLineBackend } from "../../dist/index.js";

const workspaceRoot = process.cwd();
const saveDirectoryPath = resolve(workspaceRoot, "data", "saves");
const airportDatabasePath = resolve(workspaceRoot, "data", "airports", "flightline-airports.sqlite");
const aircraftDatabasePath = resolve(workspaceRoot, "data", "aircraft", "flightline-aircraft.sqlite");
const uiServerWorkerUrl = new URL("./ui-server-worker.mjs", import.meta.url);

export async function createWorkspaceBackend() {
  return FlightLineBackend.create({
    saveDirectoryPath,
    airportDatabasePath,
    aircraftDatabasePath,
  });
}

export async function allocatePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local port for UI tests."));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(port);
      });
    });
  });
}

async function waitForServer(baseUrl, readFailure) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const failure = readFailure();
    if (failure) {
      throw failure;
    }

    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server starts listening.
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for the UI server at ${baseUrl}.`);
}

async function startUiServerWithChild(port, baseUrl) {
  const child = spawn(process.execPath, ["dist/ui/server.js"], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    output += String(chunk);
  });

  await waitForServer(baseUrl, () => {
    if (child.exitCode === null) {
      return null;
    }

    return new Error(`UI server exited early.\n${output}`);
  });

  return {
    baseUrl,
    process: child,
    async stop() {
      if (child.exitCode !== null) {
        return;
      }

      child.kill();
      await Promise.race([
        once(child, "exit"),
        delay(5_000),
      ]);

      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await Promise.race([
          once(child, "exit"),
          delay(5_000),
        ]);
      }
    },
  };
}

async function startUiServerWithWorker(port, baseUrl) {
  const worker = new Worker(uiServerWorkerUrl, {
    type: "module",
    workerData: {
      port,
      workspaceRoot,
    },
  });

  let failure = null;
  worker.once("error", (error) => {
    failure = error instanceof Error ? error : new Error(String(error));
  });
  worker.once("exit", (code) => {
    if (code !== 0 && !failure) {
      failure = new Error(`UI server worker exited early with code ${code}.`);
    }
  });

  await waitForServer(baseUrl, () => failure);

  return {
    baseUrl,
    process: worker,
    async stop() {
      await worker.terminate();
    },
  };
}

export async function startUiServer(port) {
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    return await startUiServerWithChild(port, baseUrl);
  } catch (error) {
    if (!(error instanceof Error) || !/EPERM/.test(error.message)) {
      throw error;
    }

    return startUiServerWithWorker(port, baseUrl);
  }
}

export async function removeWorkspaceSave(saveId) {
  const basePath = join(saveDirectoryPath, `${saveId}.sqlite`);
  const targets = [
    basePath,
    `${basePath}-wal`,
    `${basePath}-shm`,
  ];
  const results = await Promise.allSettled(
    targets.map((targetPath) => rm(targetPath, { force: true })),
  );
  const failures = results.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return [];
    }

    const reason = result.reason instanceof Error
      ? result.reason.message
      : String(result.reason);
    return [new Error(`Could not remove ${targets[index]}: ${reason}`)];
  });

  if (failures.length > 0) {
    throw new AggregateError(failures, `Could not fully remove workspace save ${saveId}.`);
  }
}
