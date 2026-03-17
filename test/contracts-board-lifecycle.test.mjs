/*
 * Regression coverage for contracts board lifecycle.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { FlightLineBackend } from "../dist/index.js";
import { ensureActiveContractBoard } from "../dist/ui/contracts-board-lifecycle.js";

function addHours(utcIsoString, hours) {
  return new Date(new Date(utcIsoString).getTime() + hours * 60 * 60 * 1000).toISOString();
}

const saveDirectoryPath = await mkdtemp(join(tmpdir(), "flightline-contracts-"));
const backend = await FlightLineBackend.create({
  saveDirectoryPath,
  airportDatabasePath: resolve(process.cwd(), "data", "airports", "flightline-airports.sqlite"),
  aircraftDatabasePath: resolve(process.cwd(), "data", "aircraft", "flightline-aircraft.sqlite"),
});

const saveId = `contracts_${Date.now()}`;
const startedAtUtc = new Date().toISOString();

try {
  const createSaveResult = await backend.dispatch({
    commandId: `cmd_${saveId}_save`,
    saveId,
    commandName: "CreateSaveGame",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      worldSeed: "contracts-test-seed",
      difficultyProfile: "standard",
      startTimeUtc: startedAtUtc,
    },
  });

  assert.equal(createSaveResult.success, true);

  const createCompanyResult = await backend.dispatch({
    commandId: `cmd_${saveId}_company`,
    saveId,
    commandName: "CreateCompany",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      displayName: "Contracts Test Air",
      starterAirportId: "KDEN",
      startingCashAmount: 3_500_000,
    },
  });

  assert.equal(createCompanyResult.success, true);

  const firstBoard = await ensureActiveContractBoard(backend, saveId, "scheduled");
  assert.ok(firstBoard.companyContext);
  assert.ok(firstBoard.contractBoard);
  assert.equal(firstBoard.refreshed, true);
  assert.ok(firstBoard.contractBoard.offers.length >= 400);

  const firstWindowId = firstBoard.contractBoard.offerWindowId;
  const uniqueOrigins = new Set(firstBoard.contractBoard.offers.map((offer) => offer.originAirportId));
  assert.ok(uniqueOrigins.size > 1);
  assert.ok(
    firstBoard.contractBoard.offers.some((offer) => uniqueOrigins.has(offer.destinationAirportId)),
    "Expected at least one chained route opportunity in the board.",
  );

  const firstAvailableOffer = firstBoard.contractBoard.offers.find((offer) => offer.offerStatus === "available");
  assert.ok(firstAvailableOffer);

  const acceptOfferResult = await backend.dispatch({
    commandId: `cmd_${saveId}_accept`,
    saveId,
    commandName: "AcceptContractOffer",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      contractOfferId: firstAvailableOffer.contractOfferId,
    },
  });

  assert.equal(acceptOfferResult.success, true);

  const sameWindowBoard = await ensureActiveContractBoard(backend, saveId, "scheduled");
  assert.ok(sameWindowBoard.contractBoard);
  assert.equal(sameWindowBoard.refreshed, false);
  assert.equal(sameWindowBoard.contractBoard.offerWindowId, firstWindowId);
  assert.equal(sameWindowBoard.contractBoard.offers.length, firstBoard.contractBoard.offers.length);
  assert.equal(
    sameWindowBoard.contractBoard.offers.find((offer) => offer.contractOfferId === firstAvailableOffer.contractOfferId)?.offerStatus,
    "accepted",
  );

  const companyContextBeforeAdvance = await backend.loadCompanyContext(saveId);
  assert.ok(companyContextBeforeAdvance);

  const advanceTimeResult = await backend.dispatch({
    commandId: `cmd_${saveId}_advance`,
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: addHours(companyContextBeforeAdvance.currentTimeUtc, 13),
      stopConditions: ["target_time"],
    },
  });

  assert.equal(advanceTimeResult.success, true);

  const refreshedBoard = await ensureActiveContractBoard(backend, saveId, "scheduled");
  assert.ok(refreshedBoard.contractBoard);
  assert.equal(refreshedBoard.refreshed, true);
  assert.notEqual(refreshedBoard.contractBoard.offerWindowId, firstWindowId);
  assert.ok(refreshedBoard.contractBoard.offers.every((offer) => offer.offerStatus !== "expired"));
} finally {
  await Promise.allSettled([
    backend.closeSaveSession(saveId),
    backend.close(),
  ]);
}
