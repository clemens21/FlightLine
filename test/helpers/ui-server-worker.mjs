/*
 * Starts the UI server inside a worker thread for environments where a normal child process cannot be spawned.
 * This keeps the UI tests portable across more restricted execution environments.
 */

import { workerData } from "node:worker_threads";

process.env.PORT = String(workerData.port);

const serverModuleUrl = new URL("../../dist/ui/server.js", import.meta.url);
serverModuleUrl.searchParams.set("ui_worker", String(workerData.port));

await import(serverModuleUrl.href);
