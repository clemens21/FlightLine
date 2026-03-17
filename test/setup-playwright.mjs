/*
 * Installs the Playwright browser dependencies expected by the UI suites.
 * This script is separate so browser installation can be done once instead of during every test run.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const env = {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH: resolve(process.cwd(), ".playwright-browsers"),
};

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(command, ["playwright", "install", "chromium"], {
  stdio: "inherit",
  env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
