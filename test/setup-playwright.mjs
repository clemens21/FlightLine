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
