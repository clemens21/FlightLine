/*
 * Runs the browser-based UI suites after preparing the dist assets they depend on.
 * Keeping UI tests behind a dedicated runner makes it easier to separate browser failures from unit and HTTP failures.
 */

import { resolve } from "node:path";
import { syncDistSaveSchema } from "./helpers/dist-assets.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(process.cwd(), ".playwright-browsers");

try {
  await syncDistSaveSchema();
  await import("./ui-clock.test.mjs");
  await import("./ui-shell-navigation.test.mjs");
  await import("./ui-smoke.test.mjs");
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
