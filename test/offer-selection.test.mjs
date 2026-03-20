/*
 * Regression coverage for offer selection.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";

import {
  effectiveCargoCapacityLb,
  effectivePassengerCapacity,
  pickFlyableOffer,
} from "./helpers/flightline-testkit.mjs";

function makeAirportReference() {
  const airports = new Map([
    ["KDEN", { airportKey: "KDEN", latitudeDeg: 39.8561, longitudeDeg: -104.6737 }],
    ["KCOS", { airportKey: "KCOS", latitudeDeg: 38.8058, longitudeDeg: -104.7008 }],
    ["KSPS", { airportKey: "KSPS", latitudeDeg: 33.9888, longitudeDeg: -98.4919 }],
  ]);

  return {
    findAirport(airportId) {
      return airports.get(airportId) ?? null;
    },
  };
}

{
  const aircraft = {
    maxPassengers: 10,
    maxCargoLb: 1600,
    activeCabinSeats: 9,
    activeCabinCargoCapacityLb: 1267,
  };

  assert.equal(effectivePassengerCapacity(aircraft), 9);
  assert.equal(effectiveCargoCapacityLb(aircraft), 1267);
}

{
  const aircraft = {
    currentAirportId: "KDEN",
    maxPassengers: 10,
    maxCargoLb: 1600,
    activeCabinSeats: 10,
    activeCabinCargoCapacityLb: 1267,
    rangeNm: 900,
  };

  const board = {
    offers: [
      {
        contractOfferId: "offer_too_heavy",
        originAirportId: "KDEN",
        destinationAirportId: "KCOS",
        earliestStartUtc: "2026-03-16T13:00:00.000Z",
        latestCompletionUtc: "2026-03-16T22:00:00.000Z",
        passengerCount: undefined,
        cargoWeightLb: 1329,
        explanationMetadata: { fit_bucket: "flyable_now" },
      },
      {
        contractOfferId: "offer_valid_cargo",
        originAirportId: "KDEN",
        destinationAirportId: "KCOS",
        earliestStartUtc: "2026-03-16T13:00:00.000Z",
        latestCompletionUtc: "2026-03-16T22:00:00.000Z",
        passengerCount: undefined,
        cargoWeightLb: 1200,
        explanationMetadata: { fit_bucket: "flyable_now" },
      },
    ],
  };

  const selectedOffer = pickFlyableOffer(board, aircraft, makeAirportReference());
  assert.ok(selectedOffer);
  assert.equal(selectedOffer.contractOfferId, "offer_valid_cargo");
}

{
  const aircraft = {
    currentAirportId: "KDEN",
    maxPassengers: 10,
    maxCargoLb: 1600,
    activeCabinSeats: 8,
    activeCabinCargoCapacityLb: 1267,
    rangeNm: 900,
  };

  const board = {
    offers: [
      {
        contractOfferId: "offer_too_many_pax",
        originAirportId: "KDEN",
        destinationAirportId: "KCOS",
        earliestStartUtc: "2026-03-16T13:00:00.000Z",
        latestCompletionUtc: "2026-03-16T22:00:00.000Z",
        passengerCount: 9,
        cargoWeightLb: undefined,
        explanationMetadata: { fit_bucket: "flyable_now" },
      },
      {
        contractOfferId: "offer_valid_pax",
        originAirportId: "KDEN",
        destinationAirportId: "KCOS",
        earliestStartUtc: "2026-03-16T13:00:00.000Z",
        latestCompletionUtc: "2026-03-16T22:00:00.000Z",
        passengerCount: 8,
        cargoWeightLb: undefined,
        explanationMetadata: { fit_bucket: "flyable_now" },
      },
    ],
  };

  const selectedOffer = pickFlyableOffer(board, aircraft, makeAirportReference());
  assert.ok(selectedOffer);
  assert.equal(selectedOffer.contractOfferId, "offer_valid_pax");
}

{
  const aircraft = {
    currentAirportId: "KDEN",
    maxPassengers: 10,
    maxCargoLb: 1600,
    activeCabinSeats: 10,
    activeCabinCargoCapacityLb: 1267,
    rangeNm: 900,
  };

  const board = {
    offers: [
      {
        contractOfferId: "offer_home_but_stretch",
        originAirportId: "KDEN",
        destinationAirportId: "KSPS",
        earliestStartUtc: "2026-03-16T13:00:00.000Z",
        latestCompletionUtc: "2026-03-16T22:00:00.000Z",
        passengerCount: 8,
        cargoWeightLb: undefined,
        explanationMetadata: { fit_bucket: "stretch_growth" },
      },
      {
        contractOfferId: "offer_remote_flyable",
        originAirportId: "KCOS",
        destinationAirportId: "KSPS",
        earliestStartUtc: "2026-03-16T13:00:00.000Z",
        latestCompletionUtc: "2026-03-16T22:00:00.000Z",
        passengerCount: 8,
        cargoWeightLb: undefined,
        explanationMetadata: { fit_bucket: "flyable_now" },
      },
    ],
  };

  const selectedOffer = pickFlyableOffer(board, aircraft, makeAirportReference());
  assert.ok(selectedOffer);
  assert.equal(selectedOffer.contractOfferId, "offer_remote_flyable");
}
