/*
 * Focused regression coverage for save difficulty persistence and ongoing economy effects.
 * This keeps easy and medium from becoming create-company-only labels without real buy/hire impact.
 */

import assert from "node:assert/strict";

import {
  createCompanySave,
  createTestHarness,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";

async function updateSaveDifficulty(backend, saveId, difficultyProfile, updatedAtUtc) {
  await backend.withExistingSaveDatabase(saveId, async (context) => {
    context.saveDatabase.run(
      `UPDATE save_game
       SET difficulty_profile = $difficulty_profile,
           updated_at_utc = $updated_at_utc
       WHERE save_id = $save_id`,
      {
        $difficulty_profile: difficultyProfile,
        $updated_at_utc: updatedAtUtc,
        $save_id: saveId,
      },
    );

    await context.saveDatabase.persist();
  });
}

async function loadStaffingPackageFixedCostAmount(backend, saveId, qualificationGroup) {
  return backend.withExistingSaveDatabase(saveId, async (context) => {
    const row = context.saveDatabase.getOne(
      `SELECT fixed_cost_amount AS fixedCostAmount
       FROM staffing_package
       WHERE qualification_group = $qualification_group
       ORDER BY starts_at_utc DESC, staffing_package_id DESC
       LIMIT 1`,
      { $qualification_group: qualificationGroup },
    );

    return row?.fixedCostAmount ?? null;
  });
}

const harness = await createTestHarness("flightline-difficulty-economy");
const { backend } = harness;

try {
  const acquisitionModelId = "cessna_208b_grand_caravan_ex_passenger";
  const acquisitionModel = backend.getAircraftReference().findModel(acquisitionModelId);
  assert.ok(acquisitionModel);

  const hardSaveId = uniqueSaveId("difficulty_hard");
  const hardStartedAtUtc = await createCompanySave(backend, hardSaveId, {
    startedAtUtc: "2026-03-16T12:00:00.000Z",
    difficultyProfile: "hard",
    startingCashAmount: 50_000_000,
  });
  const mediumSaveId = uniqueSaveId("difficulty_medium");
  const mediumStartedAtUtc = await createCompanySave(backend, mediumSaveId, {
    startedAtUtc: "2026-03-16T12:05:00.000Z",
    difficultyProfile: "medium",
    startingCashAmount: 50_000_000,
  });
  const easySaveId = uniqueSaveId("difficulty_easy");
  const easyStartedAtUtc = await createCompanySave(backend, easySaveId, {
    startedAtUtc: "2026-03-16T12:10:00.000Z",
    difficultyProfile: "easy",
    startingCashAmount: 50_000_000,
  });

  for (const [saveId, issuedAtUtc, registration] of [
    [hardSaveId, hardStartedAtUtc, "N208HD"],
    [mediumSaveId, mediumStartedAtUtc, "N208MD"],
    [easySaveId, easyStartedAtUtc, "N208EZ"],
  ]) {
    const result = await backend.dispatch({
      commandId: `cmd_${saveId}_acquire_difficulty`,
      saveId,
      commandName: "AcquireAircraft",
      issuedAtUtc,
      actorType: "player",
      payload: {
        aircraftModelId: acquisitionModelId,
        deliveryAirportId: "KDEN",
        ownershipType: "owned",
        registration,
      },
    });
    assert.equal(result.success, true, result.hardBlockers?.[0] ?? `Expected direct acquisition to succeed for ${saveId}.`);
  }

  const hardCompanyContext = await backend.loadCompanyContext(hardSaveId);
  const mediumCompanyContext = await backend.loadCompanyContext(mediumSaveId);
  const easyCompanyContext = await backend.loadCompanyContext(easySaveId);
  assert.ok(hardCompanyContext);
  assert.ok(mediumCompanyContext);
  assert.ok(easyCompanyContext);

  const hardAircraftSpend = 50_000_000 - hardCompanyContext.currentCashAmount;
  const mediumAircraftSpend = 50_000_000 - mediumCompanyContext.currentCashAmount;
  const easyAircraftSpend = 50_000_000 - easyCompanyContext.currentCashAmount;

  assert.equal(hardAircraftSpend, Math.round(acquisitionModel.marketValueUsd));
  assert.equal(mediumAircraftSpend, Math.round(acquisitionModel.marketValueUsd * 0.95));
  assert.equal(easyAircraftSpend, Math.round(acquisitionModel.marketValueUsd * 0.9));
  assert.ok(hardAircraftSpend > mediumAircraftSpend);
  assert.ok(mediumAircraftSpend > easyAircraftSpend);

  for (const [saveId, issuedAtUtc] of [
    [hardSaveId, hardStartedAtUtc],
    [mediumSaveId, mediumStartedAtUtc],
    [easySaveId, easyStartedAtUtc],
  ]) {
    const result = await backend.dispatch({
      commandId: `cmd_${saveId}_direct_hire_difficulty`,
      saveId,
      commandName: "ActivateStaffingPackage",
      issuedAtUtc,
      actorType: "player",
      payload: {
        laborCategory: "pilot",
        employmentModel: "direct_hire",
        qualificationGroup: "regional_turboprop",
        coverageUnits: 1,
        fixedCostAmount: 20_000,
        baseAirportId: "KDEN",
      },
    });
    assert.equal(result.success, true, result.hardBlockers?.[0] ?? `Expected staffing activation to succeed for ${saveId}.`);
  }

  const hardDirectSalary = await loadStaffingPackageFixedCostAmount(backend, hardSaveId, "regional_turboprop");
  const mediumDirectSalary = await loadStaffingPackageFixedCostAmount(backend, mediumSaveId, "regional_turboprop");
  const easyDirectSalary = await loadStaffingPackageFixedCostAmount(backend, easySaveId, "regional_turboprop");

  assert.equal(hardDirectSalary, 20_000);
  assert.equal(mediumDirectSalary, 19_000);
  assert.equal(easyDirectSalary, 18_000);

  const marketSaveId = uniqueSaveId("difficulty_market_compare");
  const marketStartedAtUtc = await createCompanySave(backend, marketSaveId, {
    startedAtUtc: "2026-03-16T12:15:00.000Z",
    difficultyProfile: "hard",
    startingCashAmount: 10_000_000,
  });

  const hardRefreshResult = await backend.dispatch({
    commandId: `cmd_${marketSaveId}_staffing_hard_refresh`,
    saveId: marketSaveId,
    commandName: "RefreshStaffingMarket",
    issuedAtUtc: marketStartedAtUtc,
    actorType: "player",
    payload: {
      refreshReason: "manual",
    },
  });
  assert.equal(hardRefreshResult.success, true, hardRefreshResult.hardBlockers?.[0] ?? "Expected hard staffing market refresh.");
  const hardMarket = await backend.loadActiveStaffingMarket(marketSaveId);
  assert.ok(hardMarket);

  const hardDirectOffer = [...hardMarket.offers]
    .filter((offer) => offer.employmentModel === "direct_hire")
    .sort((left, right) => right.fixedCostAmount - left.fixedCostAmount)[0];
  const hardContractOffer = [...hardMarket.offers]
    .filter((offer) => offer.employmentModel === "contract_hire")
    .sort((left, right) =>
      ((right.variableCostRate ?? 0) + right.fixedCostAmount) - ((left.variableCostRate ?? 0) + left.fixedCostAmount))[0];
  assert.ok(hardDirectOffer);
  assert.ok(hardContractOffer);

  await updateSaveDifficulty(backend, marketSaveId, "medium", marketStartedAtUtc);
  const mediumRefreshResult = await backend.dispatch({
    commandId: `cmd_${marketSaveId}_staffing_medium_refresh`,
    saveId: marketSaveId,
    commandName: "RefreshStaffingMarket",
    issuedAtUtc: marketStartedAtUtc,
    actorType: "player",
    payload: {
      refreshReason: "manual",
    },
  });
  assert.equal(mediumRefreshResult.success, true, mediumRefreshResult.hardBlockers?.[0] ?? "Expected medium staffing market refresh.");
  const mediumMarket = await backend.loadActiveStaffingMarket(marketSaveId);
  assert.ok(mediumMarket);

  await updateSaveDifficulty(backend, marketSaveId, "easy", marketStartedAtUtc);
  const easyRefreshResult = await backend.dispatch({
    commandId: `cmd_${marketSaveId}_staffing_easy_refresh`,
    saveId: marketSaveId,
    commandName: "RefreshStaffingMarket",
    issuedAtUtc: marketStartedAtUtc,
    actorType: "player",
    payload: {
      refreshReason: "manual",
    },
  });
  assert.equal(easyRefreshResult.success, true, easyRefreshResult.hardBlockers?.[0] ?? "Expected easy staffing market refresh.");
  const easyMarket = await backend.loadActiveStaffingMarket(marketSaveId);
  assert.ok(easyMarket);

  const mediumDirectOffer = mediumMarket.offers.find((offer) =>
    offer.employmentModel === "direct_hire"
    && offer.candidateProfileId === hardDirectOffer.candidateProfileId
    && offer.generatedSeed === hardDirectOffer.generatedSeed
  );
  const easyDirectOffer = easyMarket.offers.find((offer) =>
    offer.employmentModel === "direct_hire"
    && offer.candidateProfileId === hardDirectOffer.candidateProfileId
    && offer.generatedSeed === hardDirectOffer.generatedSeed
  );
  const mediumContractOffer = mediumMarket.offers.find((offer) =>
    offer.employmentModel === "contract_hire"
    && offer.candidateProfileId === hardContractOffer.candidateProfileId
    && offer.generatedSeed === hardContractOffer.generatedSeed
  );
  const easyContractOffer = easyMarket.offers.find((offer) =>
    offer.employmentModel === "contract_hire"
    && offer.candidateProfileId === hardContractOffer.candidateProfileId
    && offer.generatedSeed === hardContractOffer.generatedSeed
  );

  assert.ok(mediumDirectOffer);
  assert.ok(easyDirectOffer);
  assert.ok(mediumContractOffer);
  assert.ok(easyContractOffer);

  assert.ok(hardDirectOffer.fixedCostAmount > mediumDirectOffer.fixedCostAmount);
  assert.ok(mediumDirectOffer.fixedCostAmount > easyDirectOffer.fixedCostAmount);
  assert.ok(hardContractOffer.fixedCostAmount > mediumContractOffer.fixedCostAmount);
  assert.ok(mediumContractOffer.fixedCostAmount > easyContractOffer.fixedCostAmount);
  assert.ok((hardContractOffer.variableCostRate ?? 0) > (mediumContractOffer.variableCostRate ?? 0));
  assert.ok((mediumContractOffer.variableCostRate ?? 0) > (easyContractOffer.variableCostRate ?? 0));
} finally {
  await harness.cleanup();
}
