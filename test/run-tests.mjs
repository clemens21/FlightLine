/*
 * Runs the non-browser automated suite in a fixed import order.
 * The explicit order makes setup predictable and narrows the search space when a later import fails.
 */

import { syncDistSaveSchema } from "./helpers/dist-assets.mjs";

await syncDistSaveSchema();

await import("./backend-smoke.test.mjs");
await import("./command-validation.test.mjs");
await import("./difficulty-economy.test.mjs");
await import("./utc-timestamp-ingress.test.mjs");
await import("./save-slot-files.test.mjs");
await import("./contracts-board-lifecycle.test.mjs");
await import("./route-planner.test.mjs");

await import("./aircraft-tab.test.mjs");
await import("./aircraft-market-lifecycle.test.mjs");
await import("./acquire-aircraft-invariants.test.mjs");

await import("./save-shell.test.mjs");
await import("./named-pilot-travel.test.mjs");
await import("./recurring-obligation-settlement.test.mjs");
await import("./staffing-market.test.mjs");
await import("./staff-portrait-cache.test.mjs");
await import("./pilot-certifications.test.mjs");

await import("./contracts-view.test.mjs");
await import("./contracts-board-model.test.mjs");
await import("./contracts-fit-bucket-truth.test.mjs");
await import("./contracts-dispatch-lifecycle.test.mjs");
await import("./contracts-tab-client.test.mjs");

await import("./clock-calendar.test.mjs");

await import("./route-plan-ops.test.mjs");

await import("./offer-selection.test.mjs");

await import("./ui-server-staffing-status.test.mjs");
await import("./ui-server-create-company-validation.test.mjs");
await import("./ui-server-aircraft-offer-integrity.test.mjs");
await import("./ui-server-pilot-transfer.test.mjs");
await import("./ui-server-smoke.test.mjs");
