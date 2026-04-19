/*
 * Regression coverage for contracts-board-weighting.test.
 * This locks in the new biasing rule: fleet footprint and fleet envelope should tilt the board,
 * but they must not hard-lock the market into one continent or one volume type.
 */

import assert from "node:assert/strict";

import { ensureActiveContractBoard } from "../dist/ui/contracts-board-lifecycle.js";
import { createCompanySave, createTestHarness, refreshContractBoard, uniqueSaveId } from "./helpers/flightline-testkit.mjs";

function countAvailableOffers(board, predicate) {
  return board.offers.filter((offer) => offer.offerStatus === "available" && predicate(offer)).length;
}

function countOriginsOnContinent(board, airportReference, continentCode) {
  return countAvailableOffers(
    board,
    (offer) => airportReference.findAirport(offer.originAirportId)?.continent === continentCode,
  );
}

const harness = await createTestHarness("flightline-contracts-board-weighting");
const { backend, airportReference } = harness;

try {
  const hardSaveId = uniqueSaveId("contracts_board_weighting_hard");
  const hardStartedAtUtc = await createCompanySave(backend, hardSaveId, {
    difficultyProfile: "hard",
  });
  await refreshContractBoard(backend, hardSaveId, hardStartedAtUtc, "hard_baseline");
  const hardBoard = (await ensureActiveContractBoard(backend, hardSaveId, "scheduled")).contractBoard;
  assert.ok(hardBoard);

  const easySaveId = uniqueSaveId("contracts_board_weighting_easy");
  const easyStartedAtUtc = await createCompanySave(backend, easySaveId, {
    difficultyProfile: "easy",
  });
  await refreshContractBoard(backend, easySaveId, easyStartedAtUtc, "easy_baseline");
  const easyBoardBeforeMove = (await ensureActiveContractBoard(backend, easySaveId, "scheduled")).contractBoard;
  assert.ok(easyBoardBeforeMove);

  const hardCargoCount = countAvailableOffers(
    hardBoard,
    (offer) => offer.volumeType === "cargo",
  );
  const easyCargoCount = countAvailableOffers(
    easyBoardBeforeMove,
    (offer) => offer.volumeType === "cargo",
  );
  assert.ok(
    easyCargoCount > hardCargoCount,
    `Expected the easy starter cargo aircraft to bias total cargo supply upward (${easyCargoCount} vs ${hardCargoCount}).`,
  );
  assert.ok(
    countAvailableOffers(easyBoardBeforeMove, (offer) => offer.volumeType === "passenger") > 0,
    "Fleet weighting should not remove passenger visibility from the board.",
  );

  const relocatedAirport = airportReference.findAirport("SAME");
  assert.ok(relocatedAirport?.accessibleNow);
  assert.ok(relocatedAirport?.continent);
  const southAmericaCountBeforeMove = countOriginsOnContinent(
    easyBoardBeforeMove,
    airportReference,
    relocatedAirport.continent,
  );

  await backend.withExistingSaveDatabase(easySaveId, async (context) => {
    const companyRow = context.saveDatabase.getOne(
      "SELECT active_company_id AS companyId FROM save_game WHERE save_id = $save_id LIMIT 1",
      { $save_id: easySaveId },
    );
    assert.ok(companyRow?.companyId);

    context.saveDatabase.run(
      `UPDATE company_aircraft
       SET current_airport_id = $current_airport_id
       WHERE company_id = $company_id`,
      {
        $current_airport_id: relocatedAirport.airportKey,
        $company_id: companyRow.companyId,
      },
    );

    await context.saveDatabase.persist();
  });

  await refreshContractBoard(backend, easySaveId, easyStartedAtUtc, "fleet_relocated");
  const easyBoardAfterMove = (await ensureActiveContractBoard(backend, easySaveId, "scheduled")).contractBoard;
  assert.ok(easyBoardAfterMove);

  const southAmericaCountAfterMove = countOriginsOnContinent(
    easyBoardAfterMove,
    airportReference,
    relocatedAirport.continent,
  );
  assert.ok(
    southAmericaCountAfterMove > southAmericaCountBeforeMove,
    `Expected relocated fleet footprint to increase ${relocatedAirport.continent} origin supply (${southAmericaCountAfterMove} vs ${southAmericaCountBeforeMove}).`,
  );
  assert.ok(
    countAvailableOffers(easyBoardAfterMove, (offer) => offer.originAirportId === relocatedAirport.airportKey) > 0,
    `Expected board to surface live work from the relocated fleet airport ${relocatedAirport.airportKey}.`,
  );
} finally {
  await harness.cleanup();
}
