import assert from "node:assert/strict";

import {
  buildSwarmSessionPlans,
  parsePlaytestSwarmArgs,
} from "../scripts/playtest-swarm.mjs";

const parsed = parsePlaytestSwarmArgs([
  "--horizon-days", "365",
  "--count", "6",
  "--campaign-id", "demo_campaign",
  "--home-airport", "kden",
  "--viewport-width", "1200",
  "--viewport-height", "780",
]);

assert.equal(parsed.subcommand, "launch");
assert.equal(parsed.horizonDays, 365);
assert.equal(parsed.count, 6);
assert.equal(parsed.campaignId, "demo_campaign");
assert.equal(parsed.homeAirport, "KDEN");
assert.equal(parsed.viewportWidth, 1200);
assert.equal(parsed.viewportHeight, 780);

const parsedLaunch = parsePlaytestSwarmArgs([
  "launch",
  "--horizon-days", "365",
  "--count", "6",
]);
assert.equal(parsedLaunch.subcommand, "launch");
assert.equal(parsedLaunch.horizonDays, 365);

const plans = buildSwarmSessionPlans({
  count: 6,
  horizonDays: 365,
  homeAirport: "KDEN",
  viewport: { width: 1200, height: 780 },
});

assert.equal(plans.length, 6);
assert.equal(new Set(plans.map((plan) => plan.sessionId)).size, 6);
assert.equal(new Set(plans.map((plan) => plan.strategyId)).size, 6);
assert.equal(plans.every((plan) => plan.requestedHorizonDays === 365), true);
assert.equal(plans.every((plan) => plan.homeAirport === "KDEN"), true);
assert.equal(plans.every((plan) => plan.viewport.width === 1200 && plan.viewport.height === 780), true);

const difficultyCounts = plans.reduce((accumulator, plan) => {
  accumulator[plan.difficulty] = (accumulator[plan.difficulty] ?? 0) + 1;
  return accumulator;
}, {});
assert.equal(difficultyCounts.easy, 2);
assert.equal(difficultyCounts.medium, 2);
assert.equal(difficultyCounts.hard, 2);
