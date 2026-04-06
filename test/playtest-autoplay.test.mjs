import assert from "node:assert/strict";

import {
  buildPlaytestDisplayName,
  computeContractsPerAircraftPer30Days,
  parsePlaytestAutoplayArgs,
  playtestAutoplayStrategyProfiles,
  resolveStrategyProfile,
  scoreDispatchableContract,
  shouldUseNextEventAdvance,
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
assert.match(cargoProfile.sentence, /contract completion/i);
assert.ok(cargoProfile.minClosedContractsBeforeExpansion >= 1);
assert.ok(cargoProfile.cashReserveAmount > 0);

const fallbackProfile = resolveStrategyProfile("unknown-strategy");
assert.equal(fallbackProfile.id, playtestAutoplayStrategyProfiles[0].id);
assert.match(fallbackProfile.sentence, /contract-throughput-first/i);
assert.equal(fallbackProfile.targetContractsPerAircraftPerMonth, 10);

const displayName = buildPlaytestDisplayName({
  sessionLabel: "Session 03",
  strategyProfile: cargoProfile,
  difficulty: "medium",
});
assert.equal(displayName, "Session 03 [medium]");

assert.equal(computeContractsPerAircraftPer30Days({
  closedContractCount: 20,
  fleetCount: 2,
  elapsedDays: 30,
}), 10);

assert.equal(shouldUseNextEventAdvance({
  acceptedOrActiveContractCount: 1,
  busyAircraftCount: 1,
}), true);
assert.equal(shouldUseNextEventAdvance({
  acceptedOrActiveContractCount: 0,
  busyAircraftCount: 0,
}), false);
assert.equal(shouldUseNextEventAdvance({
  acceptedOrActiveContractCount: 1,
  busyAircraftCount: 0,
}), false);

const shortHaulScore = scoreDispatchableContract({
  contract: {
    departure: "KDEN",
    destination: "KCOS",
    volumeType: "cargo",
    passengerCount: 0,
    cargoWeightLb: 1_800,
    payoutAmount: 16_000,
    distanceNm: 65,
    hoursRemaining: 28,
  },
  homeAirport: "KDEN",
  preferredVolumeType: "cargo",
  preferredAirport: "KDEN",
});

const longHaulScore = scoreDispatchableContract({
  contract: {
    departure: "KDEN",
    destination: "KJFK",
    volumeType: "cargo",
    passengerCount: 0,
    cargoWeightLb: 1_800,
    payoutAmount: 70_000,
    distanceNm: 1_400,
    hoursRemaining: 40,
  },
  homeAirport: "KDEN",
  preferredVolumeType: "cargo",
  preferredAirport: "KDEN",
});

assert.ok(shortHaulScore > longHaulScore, "shorter quick-turn work should outrank slower long-haul work for throughput-first playtesting");
