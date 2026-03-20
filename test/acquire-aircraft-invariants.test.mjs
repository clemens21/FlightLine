/*
 * Focused regression coverage for aircraft acquisition invariants.
 * Direct acquisition should use canonical terms/state, and market purchases should preserve listing truth.
 */

import assert from "node:assert/strict";

import {
  createCompanySave,
  createTestHarness,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";

const caravanModelId = "cessna_208b_grand_caravan_ex_passenger";
const caravanStandardLayoutId = "cessna_208b_grand_caravan_ex_passenger__utility_standard";
const caravanFlexLayoutId = "cessna_208b_grand_caravan_ex_passenger__utility_flex";

const harness = await createTestHarness("flightline-acquire-aircraft-invariants");
const { backend } = harness;

try {
  const expensiveSaveId = uniqueSaveId("aircraft_price_guard");
  const expensiveStartedAtUtc = await createCompanySave(backend, expensiveSaveId, {
    startedAtUtc: "2026-03-16T12:00:00.000Z",
  });
  const expensiveAcquireResult = await backend.dispatch({
    commandId: `cmd_${expensiveSaveId}_direct_747`,
    saveId: expensiveSaveId,
    commandName: "AcquireAircraft",
    issuedAtUtc: expensiveStartedAtUtc,
    actorType: "player",
    payload: {
      aircraftModelId: "boeing_747_8i",
      deliveryAirportId: "KDEN",
      ownershipType: "owned",
      registration: "N74FIX",
      upfrontPaymentAmount: 0,
    },
  });
  assert.equal(expensiveAcquireResult.success, false);
  assert.equal(
    expensiveAcquireResult.hardBlockers.some((entry) => /enough cash to cover the upfront aircraft payment/i.test(entry)),
    true,
  );
  const expensiveFleetState = await backend.loadFleetState(expensiveSaveId);
  assert.ok(expensiveFleetState);
  assert.equal(expensiveFleetState.totalAircraftCount, 0);

  const marketSaveId = uniqueSaveId("aircraft_market_truth");
  const marketStartedAtUtc = await createCompanySave(backend, marketSaveId, {
    startedAtUtc: "2026-03-16T12:05:00.000Z",
    startingCashAmount: 50_000_000,
  });
  const marketState = await backend.loadActiveAircraftMarket(marketSaveId);
  assert.ok(marketState);
  const selectedOffer = marketState.offers.find((offer) =>
    offer.aircraftModelId === caravanModelId
    && offer.activeCabinLayoutId
    && offer.financeTerms.upfrontPaymentAmount
    && offer.financeTerms.recurringPaymentAmount
    && offer.financeTerms.termMonths
    && offer.financeTerms.rateBandOrApr !== undefined,
  );
  assert.ok(selectedOffer, "Expected a Caravan market offer with finance terms.");
  const tamperedLayoutId = selectedOffer.activeCabinLayoutId === caravanStandardLayoutId
    ? caravanFlexLayoutId
    : caravanStandardLayoutId;

  const tamperedMarketAcquireResult = await backend.dispatch({
    commandId: `cmd_${marketSaveId}_acquire_offer_tampered`,
    saveId: marketSaveId,
    commandName: "AcquireAircraft",
    issuedAtUtc: marketStartedAtUtc,
    actorType: "player",
    payload: {
      aircraftModelId: selectedOffer.aircraftModelId,
      activeCabinLayoutId: tamperedLayoutId,
      deliveryAirportId: selectedOffer.currentAirportId,
      ownershipType: "financed",
      registration: selectedOffer.registration,
      displayName: selectedOffer.displayName,
      sourceOfferId: selectedOffer.aircraftOfferId,
      upfrontPaymentAmount: 0,
      recurringPaymentAmount: 1,
      paymentCadence: "monthly",
      termMonths: 1,
      rateBandOrApr: 0,
    },
  });
  assert.equal(
    tamperedMarketAcquireResult.success,
    true,
    tamperedMarketAcquireResult.hardBlockers?.[0] ?? "Expected market offer acquisition to succeed.",
  );

  const marketFleetState = await backend.loadFleetState(marketSaveId);
  assert.ok(marketFleetState);
  const purchasedAircraft = marketFleetState.aircraft.find((entry) => entry.registration === selectedOffer.registration);
  assert.ok(purchasedAircraft);
  assert.equal(purchasedAircraft.activeCabinLayoutId, selectedOffer.activeCabinLayoutId);

  const marketCompanyContext = await backend.loadCompanyContext(marketSaveId);
  assert.ok(marketCompanyContext);
  assert.equal(
    marketCompanyContext.currentCashAmount,
    50_000_000 - Number(selectedOffer.financeTerms.upfrontPaymentAmount ?? 0),
  );

  const persistedMarketAgreement = await backend.withExistingSaveDatabase(marketSaveId, (context) => context.saveDatabase.getOne(
    `SELECT
      upfront_payment_amount AS upfrontPaymentAmount,
      recurring_payment_amount AS recurringPaymentAmount,
      payment_cadence AS paymentCadence,
      term_months AS termMonths,
      rate_band_or_apr AS rateBandOrApr,
      acquisition_agreement_id AS acquisitionAgreementId
     FROM acquisition_agreement
     WHERE origin_offer_id = $origin_offer_id
     LIMIT 1`,
    { $origin_offer_id: selectedOffer.aircraftOfferId },
  ));
  assert.ok(persistedMarketAgreement);
  assert.equal(persistedMarketAgreement.upfrontPaymentAmount, selectedOffer.financeTerms.upfrontPaymentAmount);
  assert.equal(persistedMarketAgreement.recurringPaymentAmount, selectedOffer.financeTerms.recurringPaymentAmount);
  assert.equal(persistedMarketAgreement.paymentCadence, selectedOffer.financeTerms.paymentCadence);
  assert.equal(persistedMarketAgreement.termMonths, selectedOffer.financeTerms.termMonths);
  assert.equal(persistedMarketAgreement.rateBandOrApr, selectedOffer.financeTerms.rateBandOrApr);

  const persistedObligation = await backend.withExistingSaveDatabase(marketSaveId, (context) => context.saveDatabase.getOne(
    `SELECT amount AS amount
     FROM recurring_obligation
     WHERE source_object_type = 'acquisition_agreement'
       AND source_object_id = $source_object_id
       AND status = 'active'
     LIMIT 1`,
    { $source_object_id: persistedMarketAgreement.acquisitionAgreementId },
  ));
  assert.ok(persistedObligation);
  assert.equal(persistedObligation.amount, selectedOffer.financeTerms.recurringPaymentAmount);

  const seededStateSaveId = uniqueSaveId("aircraft_seeded_state");
  const seededStateStartedAtUtc = await createCompanySave(backend, seededStateSaveId, {
    startedAtUtc: "2026-03-16T12:10:00.000Z",
    startingCashAmount: 10_000_000,
  });
  const seededAcquireResult = await backend.dispatch({
    commandId: `cmd_${seededStateSaveId}_seeded_caravan`,
    saveId: seededStateSaveId,
    commandName: "AcquireAircraft",
    issuedAtUtc: seededStateStartedAtUtc,
    actorType: "player",
    payload: {
      aircraftModelId: caravanModelId,
      deliveryAirportId: "KDEN",
      ownershipType: "owned",
      registration: "N208IV",
      seededAirframeHoursTotal: -500,
      seededAirframeCyclesTotal: -30,
      seededHoursSinceInspection: -12,
      seededCyclesSinceInspection: -4,
      seededConditionValue: 0.01,
      seededConditionBandInput: "excellent",
      seededHoursToService: -25,
      seededMaintenanceStateInput: "current",
      seededAogFlag: false,
      seededStatusInput: "maintenance",
    },
  });
  assert.equal(seededAcquireResult.success, true, seededAcquireResult.hardBlockers?.[0] ?? "Expected direct Caravan acquisition to succeed.");

  const seededFleetState = await backend.loadFleetState(seededStateSaveId);
  assert.ok(seededFleetState);
  const seededAircraft = seededFleetState.aircraft.find((entry) => entry.registration === "N208IV");
  assert.ok(seededAircraft);
  assert.equal(seededAircraft.airframeHoursTotal, 0);
  assert.equal(seededAircraft.airframeCyclesTotal, 0);
  assert.equal(seededAircraft.conditionValue, 1);
  assert.equal(seededAircraft.conditionBandInput, "excellent");
  assert.equal(seededAircraft.hoursSinceInspection, 0);
  assert.equal(seededAircraft.cyclesSinceInspection, 0);
  assert.equal(seededAircraft.hoursToService, backend.getAircraftReference().findModel(caravanModelId)?.inspectionIntervalHours);
  assert.equal(seededAircraft.maintenanceStateInput, "current");
  assert.equal(seededAircraft.aogFlag, false);
  assert.equal(seededAircraft.statusInput, "idle");
  assert.equal(seededAircraft.dispatchAvailable, true);
} finally {
  await harness.cleanup();
}
