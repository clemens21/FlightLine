/*
 * Locks the contract urgency curve so live available-offer payout changes stay smooth and bounded.
 */

import assert from "node:assert/strict";

import {
  resolveContractUrgencyPayoutMultiplier,
  resolveDynamicContractOfferPayoutAmount,
} from "../dist/domain/contracts/urgency.js";

const basePayoutAmount = 100_000;
const farFutureMultiplier = resolveContractUrgencyPayoutMultiplier(168);
const mediumFutureMultiplier = resolveContractUrgencyPayoutMultiplier(72);
const midWindowMultiplier = resolveContractUrgencyPayoutMultiplier(36);
const nearDeadlineMultiplier = resolveContractUrgencyPayoutMultiplier(12);
const expiryMultiplier = resolveContractUrgencyPayoutMultiplier(0);
const overdueMultiplier = resolveContractUrgencyPayoutMultiplier(-24);

assert.ok(farFutureMultiplier >= 0.88);
assert.ok(farFutureMultiplier < 1);
assert.ok(expiryMultiplier <= 1.35);
assert.ok(overdueMultiplier <= 1.35);
assert.ok(mediumFutureMultiplier > farFutureMultiplier);
assert.ok(midWindowMultiplier > mediumFutureMultiplier);
assert.ok(nearDeadlineMultiplier > midWindowMultiplier);
assert.ok(expiryMultiplier >= nearDeadlineMultiplier);

assert.equal(resolveDynamicContractOfferPayoutAmount(basePayoutAmount, 0), 135_000);
assert.ok(resolveDynamicContractOfferPayoutAmount(basePayoutAmount, 240) < basePayoutAmount);
assert.ok(resolveDynamicContractOfferPayoutAmount(basePayoutAmount, 36) < basePayoutAmount);
assert.ok(resolveDynamicContractOfferPayoutAmount(basePayoutAmount, 12) > basePayoutAmount);
