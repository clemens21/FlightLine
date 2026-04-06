import assert from "node:assert/strict";

import {
  buildPlaytestDisplayName,
  computeContractsPerAircraftPer30Days,
  isContractCompatibleWithAircraft,
  isAutoplayOperableAircraftOffer,
  isAutoplayIdleAircraft,
  parsePlaytestAutoplayArgs,
  playtestAutoplayStrategyProfiles,
  resolveStrategyProfile,
  scoreAircraftOfferForAutoplay,
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

assert.equal(isAutoplayIdleAircraft({
  statusLabel: "available",
  scheduleLabel: "Committed",
}), true);

assert.equal(isAutoplayIdleAircraft({
  statusLabel: "available",
  scheduleLabel: "Draft staged",
}), false);

assert.equal(isAutoplayIdleAircraft({
  statusLabel: "reserved",
  scheduleLabel: "Committed",
}), false);

assert.equal(isAutoplayOperableAircraftOffer("Cessna 208 B Grand Caravan EX Passenger | Short-field utility | KDEN"), true);
assert.equal(isAutoplayOperableAircraftOffer("Saab 340B | Regional commuter | KDEN"), false);
assert.equal(isAutoplayOperableAircraftOffer("DHC-6 Twin Otter 300 | Regional passenger | KDEN"), false);

assert.equal(isContractCompatibleWithAircraft({
  contract: {
    departure: "KDEN",
    destination: "KOMA",
    volumeType: "passenger",
    passengerCount: 7,
    cargoWeightLb: 0,
    payoutAmount: 18_250,
    distanceNm: 850,
    hoursRemaining: 36,
  },
  aircraftProfile: {
    passengerCapacity: 10,
    cargoCapacityLb: 1_600,
    rangeNm: 900,
    volumePreference: "passenger",
  },
  preferredVolumeType: "passenger",
  distanceBias: 1,
}), false, "autoplay should respect the same 90% modeled range envelope that dispatch validation uses");

assert.equal(isContractCompatibleWithAircraft({
  contract: {
    departure: "KHDN",
    destination: "KCLE",
    volumeType: "cargo",
    passengerCount: 0,
    cargoWeightLb: 1_777,
    payoutAmount: 17_505,
    distanceNm: 1_074,
    hoursRemaining: 42,
  },
  aircraftProfile: {
    passengerCapacity: 0,
    cargoCapacityLb: 3_300,
    rangeNm: 1_070,
    volumePreference: "cargo",
  },
  preferredVolumeType: "cargo",
  distanceBias: 1,
}), false, "contracts beyond true aircraft range should be rejected");

assert.equal(isContractCompatibleWithAircraft({
  contract: {
    departure: "KHDN",
    destination: "KALS",
    volumeType: "cargo",
    passengerCount: 0,
    cargoWeightLb: 2_944,
    payoutAmount: 4_267,
    distanceNm: 120,
    hoursRemaining: 30,
  },
  aircraftProfile: {
    passengerCapacity: 0,
    cargoCapacityLb: 3_300,
    rangeNm: 1_070,
    volumePreference: "cargo",
  },
  preferredVolumeType: "cargo",
  distanceBias: 1,
}), true, "compatible local cargo work should be allowed");

assert.equal(isContractCompatibleWithAircraft({
  contract: {
    departure: "KHDN",
    destination: "KSEA",
    volumeType: "passenger",
    passengerCount: 7,
    cargoWeightLb: 0,
    payoutAmount: 37_866,
    distanceNm: 900,
    hoursRemaining: 28,
  },
  aircraftProfile: {
    passengerCapacity: 0,
    cargoCapacityLb: 3_300,
    rangeNm: 1_070,
    volumePreference: "cargo",
  },
  preferredVolumeType: "any",
  distanceBias: 1,
}), false, "cargo aircraft should not treat zero passenger capacity as unlimited passenger seating");

assert.equal(isContractCompatibleWithAircraft({
  contract: {
    departure: "KDEN",
    destination: "KCEZ",
    volumeType: "cargo",
    passengerCount: 0,
    cargoWeightLb: 1_512,
    payoutAmount: 3_548,
    distanceNm: 280,
    hoursRemaining: 24,
  },
  aircraftProfile: {
    passengerCapacity: 10,
    cargoCapacityLb: 1_600,
    rangeNm: 900,
    volumePreference: "passenger",
  },
  preferredVolumeType: "any",
  distanceBias: 1,
}), true, "passenger-configured utility aircraft should still accept cargo that fits their real cargo capacity");

const passengerProfile = resolveStrategyProfile("passenger_first");
const passengerAircraftScore = scoreAircraftOfferForAutoplay({
  aircraftOffer: {
    passengerCapacity: 9,
    cargoCapacityLb: 0,
    rangeNm: 900,
    askingPrice: 2_123_808,
    matchesHome: true,
    volumePreference: "passenger",
  },
  strategyProfile: passengerProfile,
});
const cargoAircraftScore = scoreAircraftOfferForAutoplay({
  aircraftOffer: {
    passengerCapacity: 0,
    cargoCapacityLb: 3_300,
    rangeNm: 900,
    askingPrice: 1_523_527,
    matchesHome: true,
    volumePreference: "cargo",
  },
  strategyProfile: passengerProfile,
});
assert.ok(passengerAircraftScore > cargoAircraftScore, "passenger-first playtests should favor passenger-capable starter aircraft over cheaper cargo-only dead ends");

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
