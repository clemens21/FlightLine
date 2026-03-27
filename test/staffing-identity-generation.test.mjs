import assert from "node:assert/strict";

import {
  activateStaffingPackage,
  createCompanySave,
  createTestHarness,
  refreshStaffingMarket,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import { STAFFING_COUNTRY_NAME_POOLS } from "../dist/application/staffing/staffing-country-name-pools.js";
import { createStaffingIdentityGenerator } from "../dist/application/staffing/staffing-identity-generator.js";

function collectCandidateGroups(staffingMarket) {
  const candidateGroups = new Map();

  for (const offer of staffingMarket.offers) {
    const candidateId = offer.candidateProfileId ?? offer.staffingOfferId;
    if (candidateGroups.has(candidateId)) {
      continue;
    }

    candidateGroups.set(candidateId, {
      candidateId,
      firstName: offer.firstName,
      lastName: offer.lastName,
      displayName: offer.displayName,
      homeCity: offer.homeCity,
      homeRegionCode: offer.homeRegionCode,
      homeCountryCode: offer.homeCountryCode,
    });
  }

  return [...candidateGroups.values()];
}

function assertMajorityCountry(rows, expectedCountryCode) {
  const matchingCount = rows.filter((row) => row.homeCountryCode === expectedCountryCode).length;
  assert.ok(
    matchingCount > rows.length / 2,
    `Expected a majority ${expectedCountryCode} identity mix, found ${matchingCount}/${rows.length}.`,
  );
}

async function sampleGeneratedIdentities(backend, saveId, count) {
  const companyContext = await backend.loadCompanyContext(saveId);
  assert.ok(companyContext, `Expected company context for ${saveId}.`);

  return backend.withExistingSaveDatabase(saveId, async (context) => {
    const generator = createStaffingIdentityGenerator({
      saveDatabase: context.saveDatabase,
      companyId: companyContext.companyId,
      homeBaseAirportId: companyContext.homeBaseAirportId,
      airportReference: backend.getAirportReference(),
      includeAvailableMarketOffers: false,
    });

    return Array.from({ length: count }, (_, index) =>
      generator.generateIdentity(`staffing-identity:${saveId}:${index}`, index));
  });
}

const representativeCountries = ["US", "FR", "IT", "DE", "GB", "MX", "BR", "IN", "AU", "CA"];

for (const countryCode of representativeCountries) {
  const pool = STAFFING_COUNTRY_NAME_POOLS[countryCode];
  assert.ok(pool, `Expected a committed staffing name pool for ${countryCode}.`);
  assert.ok(pool.firstNames.length >= 100, `Expected at least 100 first names for ${countryCode}.`);
  assert.ok(pool.lastNames.length >= 100, `Expected at least 100 last names for ${countryCode}.`);
}
assert.ok(
  Object.keys(STAFFING_COUNTRY_NAME_POOLS).length >= 12,
  "Expected broad multi-country staffing name pool coverage.",
);

const harness = await createTestHarness("flightline-staffing-identity");
const { backend } = harness;

try {
  const marketSaveId = uniqueSaveId("staffing_identity_market");
  const marketStartedAtUtc = await createCompanySave(backend, marketSaveId, {
    startedAtUtc: "2026-03-16T12:00:00.000Z",
    starterAirportId: "KDEN",
    startingCashAmount: 10_000_000,
  });
  await refreshStaffingMarket(backend, marketSaveId, marketStartedAtUtc, "bootstrap");

  const staffingMarket = await backend.loadActiveStaffingMarket(marketSaveId);
  assert.ok(staffingMarket);
  const candidateGroups = collectCandidateGroups(staffingMarket);
  assert.ok(candidateGroups.length >= 24);
  assert.ok(candidateGroups.length <= 64);
  assert.equal(candidateGroups.length, new Set(candidateGroups.map((group) => group.lastName)).size);
  assert.equal(candidateGroups.length, new Set(candidateGroups.map((group) => group.displayName)).size);
  assert.equal(candidateGroups.every((group) => typeof group.firstName === "string" && group.firstName.length > 0), true);
  assert.equal(candidateGroups.every((group) => typeof group.lastName === "string" && group.lastName.length > 0), true);
  assert.equal(candidateGroups.every((group) => typeof group.homeCity === "string" && group.homeCity.length > 0), true);
  assert.equal(candidateGroups.every((group) => typeof group.homeRegionCode === "string" && group.homeRegionCode.length > 0), true);
  assert.equal(candidateGroups.every((group) => typeof group.homeCountryCode === "string" && group.homeCountryCode.length > 0), true);
  assertMajorityCountry(candidateGroups, "US");

  const selectedOffer = staffingMarket.offers.find((offer) => offer.employmentModel === "direct_hire");
  assert.ok(selectedOffer);
  await activateStaffingPackage(backend, marketSaveId, marketStartedAtUtc, {
    laborCategory: selectedOffer.laborCategory,
    employmentModel: selectedOffer.employmentModel,
    qualificationGroup: selectedOffer.qualificationGroup,
    coverageUnits: selectedOffer.coverageUnits,
    fixedCostAmount: selectedOffer.fixedCostAmount,
    variableCostRate: selectedOffer.variableCostRate,
    startsAtUtc: selectedOffer.startsAtUtc,
    endsAtUtc: selectedOffer.endsAtUtc,
    sourceOfferId: selectedOffer.staffingOfferId,
  });

  const staffingState = await backend.loadStaffingState(marketSaveId);
  assert.ok(staffingState);
  const hiredPilot = staffingState.namedPilots.find((pilot) => pilot.sourceOfferId === selectedOffer.staffingOfferId);
  assert.ok(hiredPilot);
  assert.equal(hiredPilot.firstName, selectedOffer.firstName);
  assert.equal(hiredPilot.lastName, selectedOffer.lastName);
  assert.equal(hiredPilot.displayName, selectedOffer.displayName);
  assert.equal(hiredPilot.homeCity, selectedOffer.homeCity);
  assert.equal(hiredPilot.homeRegionCode, selectedOffer.homeRegionCode);
  assert.equal(hiredPilot.homeCountryCode, selectedOffer.homeCountryCode);

  const marketAfterHire = await backend.loadActiveStaffingMarket(marketSaveId);
  assert.ok(marketAfterHire);
  const remainingLastNames = new Set(collectCandidateGroups(marketAfterHire).map((group) => group.lastName));
  assert.equal(remainingLastNames.has(hiredPilot.lastName), false);

  const manualHireSaveId = uniqueSaveId("staffing_identity_manual_hire");
  const manualHireStartedAtUtc = await createCompanySave(backend, manualHireSaveId, {
    startedAtUtc: "2026-03-16T12:00:00.000Z",
    starterAirportId: "KDEN",
    startingCashAmount: 10_000_000,
  });
  await refreshStaffingMarket(backend, manualHireSaveId, manualHireStartedAtUtc, "bootstrap");
  const manualHireMarket = await backend.loadActiveStaffingMarket(manualHireSaveId);
  assert.ok(manualHireMarket);
  const manualMarketLastNames = new Set(collectCandidateGroups(manualHireMarket).map((group) => group.lastName));

  await activateStaffingPackage(backend, manualHireSaveId, manualHireStartedAtUtc, {
    laborCategory: "pilot",
    employmentModel: "direct_hire",
    qualificationGroup: "single_turboprop_utility",
    coverageUnits: 1,
    fixedCostAmount: 4_200,
  });

  const manualHireState = await backend.loadStaffingState(manualHireSaveId);
  assert.ok(manualHireState?.namedPilots[0]);
  const generatedPilot = manualHireState.namedPilots[0];
  assert.equal(manualMarketLastNames.has(generatedPilot.lastName), false);
  assert.equal(generatedPilot.displayName.startsWith("Pilot "), false);

  const sampledCountryBases = [
    { starterAirportId: "KDEN", expectedCountryCode: "US" },
    { starterAirportId: "LFBD", expectedCountryCode: "FR" },
    { starterAirportId: "LIBD", expectedCountryCode: "IT" },
  ];

  for (const sample of sampledCountryBases) {
    const saveId = uniqueSaveId(`staffing_identity_${sample.expectedCountryCode.toLowerCase()}`);
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      starterAirportId: sample.starterAirportId,
      startingCashAmount: 10_000_000,
    });
    const identities = await sampleGeneratedIdentities(backend, saveId, 500);
    assert.equal(identities.length, 500);
    assert.equal(identities.length, new Set(identities.map((identity) => identity.lastName)).size);
    assert.equal(identities.length, new Set(identities.map((identity) => identity.displayName)).size);
    assert.equal(
      identities.some((identity) => identity.displayName.startsWith("Pilot ")),
      false,
    );
    assertMajorityCountry(identities, sample.expectedCountryCode);
    assert.equal(
      identities.every((identity) =>
        typeof identity.homeCity === "string"
        && identity.homeCity.length > 0
        && typeof identity.homeRegionCode === "string"
        && identity.homeRegionCode.length > 0
        && typeof identity.homeCountryCode === "string"
        && identity.homeCountryCode.length > 0),
      true,
      `Expected complete hometown metadata for ${sample.expectedCountryCode} sample.`,
    );
  }
} finally {
  await harness.cleanup();
}
