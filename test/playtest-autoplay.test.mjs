import assert from "node:assert/strict";

import {
  buildPlaytestDisplayName,
  parsePlaytestAutoplayArgs,
  playtestAutoplayStrategyProfiles,
  resolveStrategyProfile,
} from "../scripts/playtest-autoplay.mjs";

const parsed = parsePlaytestAutoplayArgs([
  "--horizon-days", "365",
  "--strategy", "cargo_first",
  "--difficulty", "hard",
  "--session-label", "Campaign One",
  "--home-airport", "kcos",
  "--viewport-width", "1400",
  "--viewport-height", "900",
]);

assert.equal(parsed.horizonDays, 365);
assert.equal(parsed.strategyId, "cargo_first");
assert.equal(parsed.difficulty, "hard");
assert.equal(parsed.sessionLabel, "Campaign One");
assert.equal(parsed.homeAirport, "KCOS");
assert.equal(parsed.viewportWidth, 1400);
assert.equal(parsed.viewportHeight, 900);

const cargoProfile = resolveStrategyProfile("cargo_first");
assert.equal(cargoProfile.id, "cargo_first");

const fallbackProfile = resolveStrategyProfile("unknown-strategy");
assert.equal(fallbackProfile.id, playtestAutoplayStrategyProfiles[0].id);

const displayName = buildPlaytestDisplayName({
  sessionLabel: "Session 03",
  strategyProfile: cargoProfile,
  difficulty: "medium",
});
assert.equal(displayName, "Session 03 [medium]");
