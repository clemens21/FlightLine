import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow } from "electron";

const desktopPort = Number.parseInt(process.env.FLIGHTLINE_UI_PORT ?? process.env.PORT ?? "4321", 10);
const desktopHost = "127.0.0.1";
const uiUrl = `http://${desktopHost}:${desktopPort}`;
const thisDirectory = dirname(fileURLToPath(import.meta.url));
const uiServerEntry = resolve(thisDirectory, "..", "ui", "server.js");

let mainWindow: BrowserWindow | null = null;
let uiServerProcess: ChildProcess | null = null;
let isQuitting = false;

async function waitForUiServer(timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(uiUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await delay(250);
  }

  throw new Error(`FlightLine UI server did not start within ${timeoutMs}ms.`);
}

function pipeChildLogs(prefix: string, stream: NodeJS.ReadableStream | null): void {
  if (!stream) {
    return;
  }

  stream.on("data", (chunk) => {
    const message = String(chunk).trim();
    if (message) {
      console.log(`${prefix} ${message}`);
    }
  });
}

function startUiServer(): void {
  if (uiServerProcess) {
    return;
  }

  uiServerProcess = spawn(process.execPath, [uiServerEntry], {
    env: {
      ...process.env,
      PORT: String(desktopPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  pipeChildLogs("[ui]", uiServerProcess.stdout);
  pipeChildLogs("[ui:error]", uiServerProcess.stderr);

  uiServerProcess.once("exit", (code, signal) => {
    const expected = isQuitting || signal === "SIGTERM" || code === 0;
    if (!expected) {
      console.error(`FlightLine UI server exited unexpectedly (code=${code}, signal=${signal ?? "none"}).`);
    }
    uiServerProcess = null;
  });
}

async function stopUiServer(): Promise<void> {
  if (!uiServerProcess) {
    return;
  }

  const processToStop = uiServerProcess;
  uiServerProcess = null;

  if (processToStop.exitCode !== null || processToStop.killed) {
    return;
  }

  processToStop.kill("SIGTERM");

  await Promise.race([
    new Promise<void>((resolveExit) => {
      processToStop.once("exit", () => resolveExit());
    }),
    delay(3000).then(() => {
      if (processToStop.exitCode === null && !processToStop.killed) {
        processToStop.kill("SIGKILL");
      }
    }),
  ]);
}

async function createMainWindow(): Promise<void> {
  if (mainWindow) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1280,
    minHeight: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0f1720",
    title: "FlightLine",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  await mainWindow.loadURL(uiUrl);

  if (!mainWindow.isVisible()) {
    mainWindow?.show();
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});

await app.whenReady();
app.setName("FlightLine");
startUiServer();
await waitForUiServer();
await createMainWindow();

app.on("quit", () => {
  void stopUiServer();
});

process.on("SIGINT", () => {
  isQuitting = true;
  void stopUiServer().finally(() => app.quit());
});

process.on("SIGTERM", () => {
  isQuitting = true;
  void stopUiServer().finally(() => app.quit());
});
