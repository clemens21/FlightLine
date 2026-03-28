/*
 * Regression coverage for aircraft market lifecycle behavior.
 * This locks in time-driven churn so purchases do not immediately refill the visible market.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { FlightLineBackend } from "../dist/index.js";
import { uniqueSaveId } from "./helpers/flightline-testkit.mjs";

const startupStartingCashAmount = 3_500_000;

function deriveFinancialPressureBand(currentCashAmount) {
  if (currentCashAmount < 250_000) {
    return "stressed";
  }

  if (currentCashAmount < 1_000_000) {
    return "tight";
  }

  return "stable";
}

function addDays(utcIsoString, days) {
  return new Date(new Date(utcIsoString).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

const saveDirectoryPath = await mkdtemp(join(tmpdir(), "flightline-aircraft-market-"));
const backend = await FlightLineBackend.create({
  saveDirectoryPath,
  airportDatabasePath: resolve(process.cwd(), "data", "airports", "flightline-airports.sqlite"),
  aircraftDatabasePath: resolve(process.cwd(), "data", "aircraft", "flightline-aircraft.sqlite"),
});

const saveId = uniqueSaveId("aircraft_market_lifecycle");
const startedAtUtc = "2026-03-16T12:00:00.000Z";

try {
  const createSaveResult = await backend.dispatch({
    commandId: `cmd_${saveId}_save`,
    saveId,
    commandName: "CreateSaveGame",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      worldSeed: `seed_${saveId}`,
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
      displayName: "Aircraft Market Lifecycle",
      starterAirportId: "KDEN",
      startingCashAmount: startupStartingCashAmount,
    },
  });
  assert.equal(createCompanyResult.success, true);

  await backend.withExistingSaveDatabase(saveId, async (context) => {
    const companyRow = context.saveDatabase.getOne(
      "SELECT active_company_id AS companyId FROM save_game WHERE save_id = $save_id LIMIT 1",
      { $save_id: saveId },
    );
    assert.ok(companyRow?.companyId);

    context.saveDatabase.run(
      `UPDATE company_financial_state
       SET current_cash_amount = $current_cash_amount,
           financial_pressure_band = $financial_pressure_band,
           updated_at_utc = $updated_at_utc
       WHERE company_id = $company_id`,
      {
        $current_cash_amount: 50_000_000,
        $financial_pressure_band: deriveFinancialPressureBand(50_000_000),
        $updated_at_utc: startedAtUtc,
        $company_id: companyRow.companyId,
      },
    );

    context.saveDatabase.run(
      `UPDATE ledger_entry
       SET amount = $amount
       WHERE company_id = $company_id
         AND entry_type = 'initial_capital'
         AND source_object_type = 'company'
         AND source_object_id = $company_id`,
      {
        $amount: 50_000_000,
        $company_id: companyRow.companyId,
      },
    );

    await context.saveDatabase.persist();
  });

  const initialMarket = await backend.loadActiveAircraftMarket(saveId);
  assert.ok(initialMarket);
  assert.ok(initialMarket.offers.length > 0);
  assert.ok(initialMarket.offers.length >= 150);

  const purchasedOffer = initialMarket.offers[0];
  assert.ok(purchasedOffer);

  const acquireResult = await backend.dispatch({
    commandId: `cmd_${saveId}_acquire_offer`,
    saveId,
    commandName: "AcquireAircraft",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      aircraftModelId: purchasedOffer.aircraftModelId,
      activeCabinLayoutId: purchasedOffer.activeCabinLayoutId,
      deliveryAirportId: purchasedOffer.currentAirportId,
      ownershipType: "owned",
      registration: purchasedOffer.registration,
      displayName: purchasedOffer.displayName,
      sourceOfferId: purchasedOffer.aircraftOfferId,
    },
  });
  assert.equal(acquireResult.success, true);

  const marketAfterAcquire = await backend.loadActiveAircraftMarket(saveId);
  assert.ok(marketAfterAcquire);
  assert.equal(marketAfterAcquire.offers.length, initialMarket.offers.length - 1);
  assert.equal(
    marketAfterAcquire.offers.some((offer) => offer.aircraftOfferId === purchasedOffer.aircraftOfferId),
    false,
  );

  const sameTimeReconcileResult = await backend.reconcileAircraftMarket(saveId, "scheduled");
  assert.ok(sameTimeReconcileResult);
  assert.equal(sameTimeReconcileResult.success, true);
  assert.equal(sameTimeReconcileResult.changed, false);

  const marketAfterSameTimeReconcile = await backend.loadActiveAircraftMarket(saveId);
  assert.ok(marketAfterSameTimeReconcile);
  assert.equal(marketAfterSameTimeReconcile.offers.length, initialMarket.offers.length - 1);

  const idsBeforeAdvance = new Set(marketAfterSameTimeReconcile.offers.map((offer) => offer.aircraftOfferId));
  const advanceResult = await backend.dispatch({
    commandId: `cmd_${saveId}_advance_market`,
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: addDays(startedAtUtc, 7),
      stopConditions: ["target_time"],
    },
  });
  assert.equal(advanceResult.success, true);
  assert.equal(advanceResult.metadata?.aircraftMarketChanged, true);

  const marketAfterAdvance = await backend.loadActiveAircraftMarket(saveId);
  assert.ok(marketAfterAdvance);
  assert.ok(marketAfterAdvance.offers.length > 0);

  const idsAfterAdvance = new Set(marketAfterAdvance.offers.map((offer) => offer.aircraftOfferId));
  const introducedIds = [...idsAfterAdvance].filter((offerId) => !idsBeforeAdvance.has(offerId));
  const removedIds = [...idsBeforeAdvance].filter((offerId) => !idsAfterAdvance.has(offerId));

  assert.ok(introducedIds.length > 0);
  assert.ok(removedIds.length > 0);
}
finally {
  await backend.close();
  await rm(saveDirectoryPath, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
