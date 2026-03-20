/*
 * Focused UI-server coverage for aircraft-offer acquisition integrity.
 * Tampered financing posts must still land the listing's canonical market terms.
 */

import assert from "node:assert/strict";

import {
  createCompanySave,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import {
  allocatePort,
  createWorkspaceBackend,
  removeWorkspaceSave,
  startUiServer,
} from "./helpers/ui-testkit.mjs";

async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.ok, true, `Expected GET ${path} to succeed, received ${response.status}.`);
  return response.json();
}

async function postFormJson(baseUrl, path, fields) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, String(value));
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body,
  });

  const payload = await response.json();
  return {
    response,
    payload,
  };
}

const saveId = uniqueSaveId("ui_aircraft_offer_terms");
let server = null;

try {
  const backend = await createWorkspaceBackend();
  try {
    await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      displayName: `UI Aircraft Offer ${saveId}`,
      startingCashAmount: 50_000_000,
    });
  } finally {
    await backend.close();
  }

  const port = await allocatePort();
  server = await startUiServer(port);

  const aircraftTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/tab/aircraft`);
  assert.equal(aircraftTab.tabId, "aircraft");
  assert.ok(aircraftTab.aircraftPayload);
  const selectedOffer = aircraftTab.aircraftPayload.marketWorkspace.offers.find((offer) =>
    offer.financeTerms?.upfrontPaymentAmount
    && offer.financeTerms?.recurringPaymentAmount
    && offer.financeTerms?.termMonths,
  );
  assert.ok(selectedOffer, "Expected an aircraft market offer with finance terms.");

  const acquireResult = await postFormJson(
    server.baseUrl,
    `/api/save/${encodeURIComponent(saveId)}/actions/acquire-aircraft-offer`,
    {
      tab: "aircraft",
      aircraftOfferId: selectedOffer.aircraftOfferId,
      ownershipType: "financed",
      upfrontPaymentAmount: "0",
      recurringPaymentAmount: "1",
      paymentCadence: "monthly",
      termMonths: "1",
      rateBandOrApr: "0",
    },
  );
  assert.equal(acquireResult.response.ok, true);
  assert.equal(acquireResult.payload.success, true);

  const verifyBackend = await createWorkspaceBackend();
  try {
    const fleetState = await verifyBackend.loadFleetState(saveId);
    assert.ok(fleetState);
    const purchasedAircraft = fleetState.aircraft.find((entry) => entry.registration === selectedOffer.registration);
    assert.ok(purchasedAircraft);

    const persistedAgreement = await verifyBackend.withExistingSaveDatabase(saveId, (context) => context.saveDatabase.getOne(
      `SELECT
        upfront_payment_amount AS upfrontPaymentAmount,
        recurring_payment_amount AS recurringPaymentAmount,
        payment_cadence AS paymentCadence,
        term_months AS termMonths,
        rate_band_or_apr AS rateBandOrApr
       FROM acquisition_agreement
       WHERE aircraft_id = $aircraft_id
       LIMIT 1`,
      { $aircraft_id: purchasedAircraft.aircraftId },
    ));
    assert.ok(persistedAgreement);
    assert.equal(persistedAgreement.upfrontPaymentAmount, selectedOffer.financeTerms.upfrontPaymentAmount);
    assert.equal(persistedAgreement.recurringPaymentAmount, selectedOffer.financeTerms.recurringPaymentAmount);
    assert.equal(persistedAgreement.paymentCadence, selectedOffer.financeTerms.paymentCadence);
    assert.equal(persistedAgreement.termMonths, selectedOffer.financeTerms.termMonths);
    assert.equal(persistedAgreement.rateBandOrApr, selectedOffer.financeTerms.rateBandOrApr);
  } finally {
    await verifyBackend.close();
  }
} finally {
  await Promise.allSettled([
    server?.stop(),
  ]);
  await removeWorkspaceSave(saveId);
}
