/*
 * Electron main-process entry point for the desktop shell.
 * It creates the browser window, points it at the local UI experience, and owns desktop-only process wiring.
 * The startup path here is intentionally explicit because desktop boot is one of the easiest places to get "it hangs with no UI";
 * this file is also where desktop logging and UI-server lifecycle management live.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, dialog, screen } from "electron";

const desktopPort = Number.parseInt(process.env.FLIGHTLINE_UI_PORT ?? process.env.PORT ?? "4321", 10);
const desktopHost = "127.0.0.1";
const uiUrl = `http://${desktopHost}:${desktopPort}`;
const thisDirectory = dirname(fileURLToPath(import.meta.url));
const uiServerEntry = resolve(thisDirectory, "..", "ui", "server.js");
const desktopLogDirectoryPath = resolve(process.cwd(), "data", "logs");
const nodeExecutable = process.env.FLIGHTLINE_NODE_BINARY ?? "node";
const desktopLogFilePath = resolve(desktopLogDirectoryPath, "desktop-startup.log");

let mainWindow: BrowserWindow | null = null;
let uiServerProcess: ChildProcess | null = null;
let isQuitting = false;

const preferredPhysicalWindowWidth = 2560;
const preferredPhysicalWindowHeight = 1440;
const minimumSupportedWindowWidth = 1280;
const minimumSupportedWindowHeight = 720;

type WindowContentSize = {
  width: number;
  height: number;
  workAreaWidth: number;
  workAreaHeight: number;
  scaleFactor: number;
  targetPhysicalWidth: number;
  targetPhysicalHeight: number;
};

function formatDesktopError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

function writeDesktopLog(level: "info" | "error", message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [desktop:${level}] ${message}`;

  mkdirSync(desktopLogDirectoryPath, { recursive: true });
  appendFileSync(desktopLogFilePath, `${line}\n`, "utf8");

  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

function logDesktopInfo(message: string): void {
  writeDesktopLog("info", message);
}

function logDesktopError(message: string): void {
  writeDesktopLog("error", message);
}

function pipeChildLogs(prefix: string, stream: NodeJS.ReadableStream | null, level: "info" | "error"): void {
  if (!stream) {
    return;
  }

  stream.on("data", (chunk) => {
    const message = String(chunk);
    for (const line of message.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      if (level === "error") {
        logDesktopError(`${prefix} ${trimmed}`);
      } else {
        logDesktopInfo(`${prefix} ${trimmed}`);
      }
    }
  });
}

async function waitForUiServer(timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  logDesktopInfo(`Waiting for UI server at ${uiUrl} for up to ${timeoutMs}ms.`);

  while (Date.now() < deadline) {
    attempt += 1;

    try {
      const response = await fetch(uiUrl);
      if (response.ok) {
        logDesktopInfo(`UI server responded successfully on attempt ${attempt}.`);
        return;
      }

      if (attempt === 1 || attempt % 8 === 0) {
        logDesktopInfo(`UI server probe attempt ${attempt} returned status ${response.status}.`);
      }
    } catch (error) {
      if (attempt === 1 || attempt % 8 === 0) {
        logDesktopInfo(`UI server probe attempt ${attempt} is still waiting: ${formatDesktopError(error)}`);
      }
    }

    await delay(250);
  }

  throw new Error(`FlightLine UI server did not start within ${timeoutMs}ms.`);
}

function startUiServer(): void {
  if (uiServerProcess) {
    logDesktopInfo(`UI server is already running with pid ${uiServerProcess.pid ?? "unknown"}.`);
    return;
  }

  logDesktopInfo(`Starting UI server with ${nodeExecutable} ${uiServerEntry} on port ${desktopPort}.`);

  uiServerProcess = spawn(nodeExecutable, [uiServerEntry], {
    env: {
      ...process.env,
      PORT: String(desktopPort),
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  logDesktopInfo(`Spawned UI server child process with pid ${uiServerProcess.pid ?? "unknown"}.`);
  pipeChildLogs("[ui]", uiServerProcess.stdout, "info");
  pipeChildLogs("[ui:error]", uiServerProcess.stderr, "error");

  uiServerProcess.once("error", (error) => {
    logDesktopError(`UI server child process error: ${formatDesktopError(error)}`);
  });

  uiServerProcess.once("exit", (code, signal) => {
    const expected = isQuitting || signal === "SIGTERM" || code === 0;
    if (expected) {
      logDesktopInfo(`UI server child exited with code=${code ?? "null"} signal=${signal ?? "none"}.`);
    } else {
      logDesktopError(`UI server child exited unexpectedly with code=${code ?? "null"} signal=${signal ?? "none"}.`);
    }
    uiServerProcess = null;
  });
}

async function stopUiServer(): Promise<void> {
  if (!uiServerProcess) {
    logDesktopInfo("stopUiServer called with no active child process.");
    return;
  }

  const processToStop = uiServerProcess;
  uiServerProcess = null;

  if (processToStop.exitCode !== null || processToStop.killed) {
    logDesktopInfo(`UI server child already stopped with code=${processToStop.exitCode ?? "null"}.`);
    return;
  }

  logDesktopInfo(`Stopping UI server child pid ${processToStop.pid ?? "unknown"}.`);
  processToStop.kill("SIGTERM");

  await Promise.race([
    new Promise<void>((resolveExit) => {
      processToStop.once("exit", () => resolveExit());
    }),
    delay(3000).then(() => {
      if (processToStop.exitCode === null && !processToStop.killed) {
        logDesktopInfo(`UI server child pid ${processToStop.pid ?? "unknown"} did not exit after SIGTERM; sending SIGKILL.`);
        processToStop.kill("SIGKILL");
      }
    }),
  ]);
}

function resolveMainWindowContentSize(): WindowContentSize {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const scaleFactor = primaryDisplay.scaleFactor || 1;
  const workAreaPhysicalWidth = Math.round(workArea.width * scaleFactor);
  const workAreaPhysicalHeight = Math.round(workArea.height * scaleFactor);
  const canFitPreferredPhysicalWindow =
    workAreaPhysicalWidth >= preferredPhysicalWindowWidth && workAreaPhysicalHeight >= preferredPhysicalWindowHeight;
  const preferredLogicalWidth = Math.round(preferredPhysicalWindowWidth / scaleFactor);
  const preferredLogicalHeight = Math.round(preferredPhysicalWindowHeight / scaleFactor);
  const width = canFitPreferredPhysicalWindow
    ? preferredLogicalWidth
    : Math.min(Math.max(workArea.width, minimumSupportedWindowWidth), preferredLogicalWidth);
  const height = canFitPreferredPhysicalWindow
    ? preferredLogicalHeight
    : Math.min(Math.max(workArea.height, minimumSupportedWindowHeight), preferredLogicalHeight);

  return {
    width,
    height,
    workAreaWidth: workArea.width,
    workAreaHeight: workArea.height,
    scaleFactor,
    targetPhysicalWidth: canFitPreferredPhysicalWindow ? preferredPhysicalWindowWidth : Math.round(width * scaleFactor),
    targetPhysicalHeight: canFitPreferredPhysicalWindow ? preferredPhysicalWindowHeight : Math.round(height * scaleFactor),
  };
}

async function createMainWindow(): Promise<void> {
  const initialSize = resolveMainWindowContentSize();

  if (mainWindow) {
    mainWindow.setContentSize(initialSize.width, initialSize.height);
    logDesktopInfo(
      `Main window already exists; resized content to ${initialSize.width}x${initialSize.height} logical pixels targeting ${initialSize.targetPhysicalWidth}x${initialSize.targetPhysicalHeight} physical pixels from display work area ${initialSize.workAreaWidth}x${initialSize.workAreaHeight} at scale factor ${initialSize.scaleFactor}, then focusing existing window.`,
    );
    mainWindow.focus();
    return;
  }

  logDesktopInfo("Creating main Electron window.");

  logDesktopInfo(
    `Resolved main window content size ${initialSize.width}x${initialSize.height} logical pixels targeting ${initialSize.targetPhysicalWidth}x${initialSize.targetPhysicalHeight} physical pixels from display work area ${initialSize.workAreaWidth}x${initialSize.workAreaHeight} at scale factor ${initialSize.scaleFactor}.`,
  );

  mainWindow = new BrowserWindow({
    width: initialSize.width,
    height: initialSize.height,
    minWidth: minimumSupportedWindowWidth,
    minHeight: minimumSupportedWindowHeight,
    useContentSize: true,
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
    logDesktopInfo("Main window closed.");
    mainWindow = null;
  });

  mainWindow.once("ready-to-show", () => {
    logDesktopInfo("Main window emitted ready-to-show.");
    mainWindow?.show();
  });

  mainWindow.on("show", () => {
    logDesktopInfo("Main window shown.");
    if (!mainWindow) {
      return;
    }

    const [windowWidth, windowHeight] = mainWindow.getSize();
    const [contentWidth, contentHeight] = mainWindow.getContentSize();
    logDesktopInfo(
      `Main window actual outer size ${windowWidth}x${windowHeight}; content size ${contentWidth}x${contentHeight}.`,
    );
  });

  mainWindow.webContents.on("did-finish-load", () => {
    logDesktopInfo(`Main window finished loading ${uiUrl}.`);
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const prefix = `Renderer console level=${level} source=${sourceId || "unknown"} line=${line}: ${message}`;
    if (level >= 2) {
      logDesktopError(prefix);
      return;
    }

    logDesktopInfo(prefix);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    logDesktopError(`Main window failed to load url=${validatedUrl} code=${errorCode} description=${errorDescription} mainFrame=${isMainFrame}.`);
  });

  logDesktopInfo(`Loading UI URL ${uiUrl}.`);
  await mainWindow.loadURL(uiUrl);

  if (!mainWindow.isVisible()) {
    logDesktopInfo("Main window was still hidden after loadURL; forcing show().");
    mainWindow.show();
  }
}

app.on("window-all-closed", () => {
  logDesktopInfo("Electron event: window-all-closed.");
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  logDesktopInfo("Electron event: before-quit.");
});

app.on("activate", () => {
  logDesktopInfo("Electron event: activate.");
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});

app.on("browser-window-created", () => {
  logDesktopInfo("Electron event: browser-window-created.");
});

process.on("uncaughtException", (error) => {
  logDesktopError(`Uncaught exception: ${formatDesktopError(error)}`);
});

process.on("unhandledRejection", (error) => {
  logDesktopError(`Unhandled rejection: ${formatDesktopError(error)}`);
});

async function startDesktopBootstrap(): Promise<void> {
  logDesktopInfo("Electron app.whenReady() resolved.");
  app.setName("FlightLine");
  startUiServer();
  await waitForUiServer();
  await createMainWindow();
  logDesktopInfo("Desktop bootstrap completed.");
}

app.on("quit", () => {
  logDesktopInfo("Electron event: quit.");
  void stopUiServer();
});

process.on("SIGINT", () => {
  isQuitting = true;
  logDesktopInfo("Received SIGINT.");
  void stopUiServer().finally(() => app.quit());
});

process.on("SIGTERM", () => {
  isQuitting = true;
  logDesktopInfo("Received SIGTERM.");
  void stopUiServer().finally(() => app.quit());
});

logDesktopInfo(`Desktop bootstrap starting. cwd=${process.cwd()} execPath=${process.execPath} uiUrl=${uiUrl}`);
logDesktopInfo("Waiting for Electron app readiness without top-level await.");

void app.whenReady().then(() => startDesktopBootstrap()).catch(async (error) => {
  const formatted = formatDesktopError(error);
  logDesktopError(`Desktop bootstrap failed: ${formatted}`);

  try {
    await dialog.showMessageBox({
      type: "error",
      title: "FlightLine failed to start",
      message: "FlightLine failed to start.",
      detail: formatted,
    });
  } catch {
    // Best effort only.
  }

  app.exit(1);
});

