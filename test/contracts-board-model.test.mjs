/*
 * Regression coverage for contracts-board-model.test.
 * This locks in the default available-board presentation order so the first visible slice feels mixed
 * instead of looking like one narrow passenger-only pocket of the market.
 */

import assert from "node:assert/strict";

import { createCompanySave, createTestHarness, refreshContractBoard, uniqueSaveId } from "./helpers/flightline-testkit.mjs";
import { applyContractsBoardViewState } from "../dist/ui/contracts-board-model.js";
import { loadContractsViewPayload } from "../dist/ui/contracts-view.js";

const harness = await createTestHarness("flightline-contracts-board-model");
const { backend, airportReference } = harness;

try {
  const saveId = uniqueSaveId("contracts_board_model");
  const startedAtUtc = await createCompanySave(backend, saveId);
  await refreshContractBoard(backend, saveId, startedAtUtc);

  const payload = await loadContractsViewPayload(backend, airportReference, saveId, "scheduled");
  assert.ok(payload);

  const boardState = applyContractsBoardViewState(payload, {
    filters: {
      departureSearchText: "",
      destinationSearchText: "",
      nearestAircraftSearchText: "",
      readyAircraft: false,
      noReadyAircraft: false,
      passengerPayloadMin: "",
      passengerPayloadMax: "",
      cargoPayloadMin: "",
      cargoPayloadMax: "",
      distanceMin: "",
      distanceMax: "",
      hoursRemainingMin: "",
      hoursRemainingMax: "",
      dueHoursMin: "",
      dueHoursMax: "",
      payoutMin: "",
      payoutMax: "",
    },
    appliedTextFilters: {
      departureSearchText: "",
      destinationSearchText: "",
      nearestAircraftSearchText: "",
    },
    boardTab: "available",
    boardScope: "all",
    sortField: null,
    sortDirection: "asc",
    selectedOfferId: null,
    selectedCompanyContractId: null,
  });

  const firstVisibleOffers = boardState.visibleOffers.slice(0, 16);
  assert.equal(firstVisibleOffers.length, 16);
  assert.ok(firstVisibleOffers.some((entry) => entry.route.volumeType === "passenger"));
  assert.ok(firstVisibleOffers.some((entry) => entry.route.volumeType === "cargo"));
  assert.ok(new Set(firstVisibleOffers.map((entry) => entry.route.origin.code)).size >= 8);

  const originCounts = new Map();
  for (const entry of firstVisibleOffers.slice(0, 12)) {
    originCounts.set(entry.route.origin.code, (originCounts.get(entry.route.origin.code) ?? 0) + 1);
  }
  assert.ok(Math.max(...originCounts.values()) <= 2);

  const firstEightVolumeTypes = firstVisibleOffers.slice(0, 8).map((entry) => entry.route.volumeType);
  assert.ok(firstEightVolumeTypes.includes("passenger"));
  assert.ok(firstEightVolumeTypes.includes("cargo"));
} finally {
  await harness.cleanup();
}
