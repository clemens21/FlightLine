/*
 * Focused regression coverage for contracts-tab-client badge truth.
 * Closed contracts must show their actual contract outcome instead of a generic closed route-plan state.
 */

import assert from "node:assert/strict";

import { resolveCompanyContractBadgeState } from "../dist/ui/public/contracts-tab-client.js";

const completedContract = {
  companyContractId: "company_contract_test",
  contractState: "completed",
  archetype: "regional_passenger_shuttle",
  volumeType: "passengers",
  passengerCount: 8,
  cargoWeightLb: undefined,
  payoutAmount: 15_000,
  cancellationPenaltyAmount: 3_000,
  earliestStartUtc: "2026-03-16T12:00:00.000Z",
  deadlineUtc: "2026-03-16T17:00:00.000Z",
  assignedAircraftId: "aircraft_test",
  origin: {
    airportId: "KDEN",
    code: "KDEN",
    name: "Denver International",
    municipality: "Denver",
    countryCode: "US",
    timezone: "America/Denver",
    latitudeDeg: 39.8561,
    longitudeDeg: -104.6737,
  },
  destination: {
    airportId: "KCOS",
    code: "KCOS",
    name: "Colorado Springs",
    municipality: "Colorado Springs",
    countryCode: "US",
    timezone: "America/Denver",
    latitudeDeg: 38.8058,
    longitudeDeg: -104.7008,
  },
  routePlanItemId: "route_plan_item_test",
  routePlanItemStatus: "closed",
};

assert.equal(resolveCompanyContractBadgeState(completedContract, "closed"), "completed");
assert.equal(resolveCompanyContractBadgeState(completedContract, "active"), "closed");
assert.equal(
  resolveCompanyContractBadgeState({
    ...completedContract,
    contractState: "accepted",
    routePlanItemStatus: "scheduled",
  }, "active"),
  "scheduled",
);
