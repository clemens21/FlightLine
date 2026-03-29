/*
 * Focused regression coverage for create-company and staffing activation input validation.
 * These tests keep raw command crashes from leaking past the validation layer.
 */

import assert from "node:assert/strict";

import {
  createCompanySave,
  createTestHarness,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import { startingCashAmountForDifficulty } from "../dist/domain/save-runtime/difficulty-profile.js";

const hardStartingCashAmount = startingCashAmountForDifficulty("hard");
const mediumStartingCashAmount = startingCashAmountForDifficulty("medium");
const easyStartingCashAmount = startingCashAmountForDifficulty("easy");

async function createBareSave(backend, saveId, startedAtUtc, difficultyProfile = "hard") {
  const result = await backend.dispatch({
    commandId: `cmd_${saveId}_save`,
    saveId,
    commandName: "CreateSaveGame",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      worldSeed: `seed_${saveId}`,
      difficultyProfile,
      startTimeUtc: startedAtUtc,
    },
  });

  assert.equal(result.success, true, result.hardBlockers?.[0] ?? `Expected CreateSaveGame to succeed for ${saveId}.`);
}

const harness = await createTestHarness("flightline-command-validation");
const { backend } = harness;

try {
  const highCashSaveId = uniqueSaveId("company_cash_high");
  const highCashStartedAtUtc = "2026-03-16T12:00:00.000Z";
  await createBareSave(backend, highCashSaveId, highCashStartedAtUtc);
  const highCashResult = await backend.dispatch({
    commandId: `cmd_${highCashSaveId}_company_high_cash`,
    saveId: highCashSaveId,
    commandName: "CreateCompany",
    issuedAtUtc: highCashStartedAtUtc,
    actorType: "player",
    payload: {
      displayName: "Too Rich Air",
      starterAirportId: "KDEN",
      startingCashAmount: 175_000_000,
    },
  });
  assert.equal(highCashResult.success, false);
  assert.equal(highCashResult.hardBlockers.some((entry) => /Starting cash is fixed at 3500000 for hard difficulty/i.test(entry)), true);
  assert.equal(await backend.loadCompanyContext(highCashSaveId), null);

  const nanCashSaveId = uniqueSaveId("company_cash_nan");
  const nanCashStartedAtUtc = "2026-03-16T12:05:00.000Z";
  await createBareSave(backend, nanCashSaveId, nanCashStartedAtUtc);
  const nanCashResult = await backend.dispatch({
    commandId: `cmd_${nanCashSaveId}_company_nan_cash`,
    saveId: nanCashSaveId,
    commandName: "CreateCompany",
    issuedAtUtc: nanCashStartedAtUtc,
    actorType: "player",
    payload: {
      displayName: "NaN Cash Air",
      starterAirportId: "KDEN",
      startingCashAmount: Number.NaN,
    },
  });
  assert.equal(nanCashResult.success, false);
  assert.equal(nanCashResult.hardBlockers.some((entry) => /Starting cash must be a finite number/i.test(entry)), true);
  assert.equal(await backend.loadCompanyContext(nanCashSaveId), null);

  const invalidPhaseSaveId = uniqueSaveId("company_phase_invalid");
  const invalidPhaseStartedAtUtc = "2026-03-16T12:10:00.000Z";
  await createBareSave(backend, invalidPhaseSaveId, invalidPhaseStartedAtUtc);
  const invalidPhaseResult = await backend.dispatch({
    commandId: `cmd_${invalidPhaseSaveId}_company_phase`,
    saveId: invalidPhaseSaveId,
    commandName: "CreateCompany",
    issuedAtUtc: invalidPhaseStartedAtUtc,
    actorType: "player",
    payload: {
      displayName: "Bogus Phase Air",
      starterAirportId: "KDEN",
      startingCashAmount: hardStartingCashAmount,
      companyPhase: "bogus_phase",
    },
  });
  assert.equal(invalidPhaseResult.success, false);
  assert.equal(invalidPhaseResult.hardBlockers.some((entry) => /Company phase is fixed at startup/i.test(entry)), true);
  assert.equal(await backend.loadCompanyContext(invalidPhaseSaveId), null);

  const nanTierSaveId = uniqueSaveId("company_tier_nan");
  const nanTierStartedAtUtc = "2026-03-16T12:15:00.000Z";
  await createBareSave(backend, nanTierSaveId, nanTierStartedAtUtc);
  const nanTierResult = await backend.dispatch({
    commandId: `cmd_${nanTierSaveId}_company_tier_nan`,
    saveId: nanTierSaveId,
    commandName: "CreateCompany",
    issuedAtUtc: nanTierStartedAtUtc,
    actorType: "player",
    payload: {
      displayName: "NaN Tier Air",
      starterAirportId: "KDEN",
      startingCashAmount: hardStartingCashAmount,
      progressionTier: Number.NaN,
    },
  });
  assert.equal(nanTierResult.success, false);
  assert.equal(nanTierResult.hardBlockers.some((entry) => /Progression tier must be a finite whole number/i.test(entry)), true);
  assert.equal(await backend.loadCompanyContext(nanTierSaveId), null);

  const invalidTierSaveId = uniqueSaveId("company_tier_high");
  const invalidTierStartedAtUtc = "2026-03-16T12:20:00.000Z";
  await createBareSave(backend, invalidTierSaveId, invalidTierStartedAtUtc);
  const invalidTierResult = await backend.dispatch({
    commandId: `cmd_${invalidTierSaveId}_company_tier_high`,
    saveId: invalidTierSaveId,
    commandName: "CreateCompany",
    issuedAtUtc: invalidTierStartedAtUtc,
    actorType: "player",
    payload: {
      displayName: "Tier Five Hundred Air",
      starterAirportId: "KDEN",
      startingCashAmount: hardStartingCashAmount,
      progressionTier: 500,
    },
  });
  assert.equal(invalidTierResult.success, false);
  assert.equal(
    invalidTierResult.hardBlockers.some((entry) => /Company progression tier is fixed at 1/i.test(entry)),
    true,
  );
  assert.equal(await backend.loadCompanyContext(invalidTierSaveId), null);

  const nanReputationSaveId = uniqueSaveId("company_rep_nan");
  const nanReputationStartedAtUtc = "2026-03-16T12:25:00.000Z";
  await createBareSave(backend, nanReputationSaveId, nanReputationStartedAtUtc);
  const nanReputationResult = await backend.dispatch({
    commandId: `cmd_${nanReputationSaveId}_company_rep_nan`,
    saveId: nanReputationSaveId,
    commandName: "CreateCompany",
    issuedAtUtc: nanReputationStartedAtUtc,
    actorType: "player",
    payload: {
      displayName: "NaN Reputation Air",
      starterAirportId: "KDEN",
      startingCashAmount: hardStartingCashAmount,
      startingReputationScore: Number.NaN,
    },
  });
  assert.equal(nanReputationResult.success, false);
  assert.equal(
    nanReputationResult.hardBlockers.some((entry) => /Starting reputation score must be a finite number/i.test(entry)),
    true,
  );
  assert.equal(await backend.loadCompanyContext(nanReputationSaveId), null);

  const validSaveId = uniqueSaveId("company_valid");
  const validStartedAtUtc = "2026-03-16T12:30:00.000Z";
  await createBareSave(backend, validSaveId, validStartedAtUtc);
  const validCompanyResult = await backend.dispatch({
    commandId: `cmd_${validSaveId}_company_valid`,
    saveId: validSaveId,
    commandName: "CreateCompany",
    issuedAtUtc: validStartedAtUtc,
    actorType: "player",
    payload: {
      displayName: "Canonical Startup Air",
      starterAirportId: "KDEN",
      startingCashAmount: hardStartingCashAmount,
    },
  });
  assert.equal(validCompanyResult.success, true, validCompanyResult.hardBlockers?.[0] ?? "Expected valid company creation.");
  const validCompanyContext = await backend.loadCompanyContext(validSaveId);
  assert.ok(validCompanyContext);
  assert.equal(validCompanyContext.currentCashAmount, hardStartingCashAmount);
  assert.equal(validCompanyContext.difficultyProfile, "hard");
  assert.equal(validCompanyContext.companyPhase, "startup");
  assert.equal(validCompanyContext.progressionTier, 1);
  assert.equal(validCompanyContext.reputationScore, 0);

  const mediumSaveId = uniqueSaveId("company_medium");
  const mediumStartedAtUtc = "2026-03-16T12:35:00.000Z";
  await createBareSave(backend, mediumSaveId, mediumStartedAtUtc, "medium");
  const mediumCompanyResult = await backend.dispatch({
    commandId: `cmd_${mediumSaveId}_company_medium`,
    saveId: mediumSaveId,
    commandName: "CreateCompany",
    issuedAtUtc: mediumStartedAtUtc,
    actorType: "player",
    payload: {
      displayName: "Medium Startup Air",
      starterAirportId: "KDEN",
      difficultyProfile: "medium",
      startingCashAmount: mediumStartingCashAmount,
    },
  });
  assert.equal(mediumCompanyResult.success, true, mediumCompanyResult.hardBlockers?.[0] ?? "Expected medium company creation.");
  const mediumCompanyContext = await backend.loadCompanyContext(mediumSaveId);
  assert.ok(mediumCompanyContext);
  assert.equal(mediumCompanyContext.currentCashAmount, mediumStartingCashAmount);
  assert.equal(mediumCompanyContext.difficultyProfile, "medium");
  assert.equal(mediumCompanyContext.activeAircraftCount, 0);
  assert.equal(mediumCompanyContext.activeStaffingPackageCount, 0);

  const easySaveId = uniqueSaveId("company_easy");
  const easyStartedAtUtc = "2026-03-16T12:40:00.000Z";
  await createBareSave(backend, easySaveId, easyStartedAtUtc, "easy");
  const easyCompanyResult = await backend.dispatch({
    commandId: `cmd_${easySaveId}_company_easy`,
    saveId: easySaveId,
    commandName: "CreateCompany",
    issuedAtUtc: easyStartedAtUtc,
    actorType: "player",
    payload: {
      displayName: "Easy Startup Air",
      starterAirportId: "KDEN",
      difficultyProfile: "easy",
      startingCashAmount: easyStartingCashAmount,
    },
  });
  assert.equal(easyCompanyResult.success, true, easyCompanyResult.hardBlockers?.[0] ?? "Expected easy company creation.");
  const easyCompanyContext = await backend.loadCompanyContext(easySaveId);
  assert.ok(easyCompanyContext);
  assert.equal(easyCompanyContext.currentCashAmount, easyStartingCashAmount);
  assert.equal(easyCompanyContext.difficultyProfile, "easy");
  assert.equal(easyCompanyContext.activeAircraftCount, 1);
  assert.equal(easyCompanyContext.activeStaffingPackageCount, 1);
  const easyFleetState = await backend.loadFleetState(easySaveId);
  assert.ok(easyFleetState);
  assert.equal(easyFleetState.aircraft.length, 1);
  const easyStaffingState = await backend.loadStaffingState(easySaveId);
  assert.ok(easyStaffingState);
  assert.equal(easyStaffingState.staffingPackages.length, 1);
  assert.equal(easyStaffingState.namedPilots.length, 1);

  const staffingSaveId = uniqueSaveId("staffing_cost_validation");
  const staffingStartedAtUtc = await createCompanySave(backend, staffingSaveId, {
    startedAtUtc: "2026-03-16T13:00:00.000Z",
  });

  const nanFixedCostResult = await backend.dispatch({
    commandId: `cmd_${staffingSaveId}_staffing_nan_fixed`,
    saveId: staffingSaveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: staffingStartedAtUtc,
    actorType: "player",
    payload: {
      laborCategory: "pilot",
      employmentModel: "direct_hire",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: Number.NaN,
    },
  });
  assert.equal(nanFixedCostResult.success, false);
  assert.equal(
    nanFixedCostResult.hardBlockers.some((entry) => /Staffing fixed cost amount must be a finite number/i.test(entry)),
    true,
  );

  const nanVariableRateResult = await backend.dispatch({
    commandId: `cmd_${staffingSaveId}_staffing_nan_variable`,
    saveId: staffingSaveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: staffingStartedAtUtc,
    actorType: "player",
    payload: {
      laborCategory: "pilot",
      employmentModel: "direct_hire",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 4_200,
      variableCostRate: Number.NaN,
    },
  });
  assert.equal(nanVariableRateResult.success, false);
  assert.equal(
    nanVariableRateResult.hardBlockers.some((entry) => /Staffing variable cost rate must be a finite number/i.test(entry)),
    true,
  );

  const invalidBaseAirportResult = await backend.dispatch({
    commandId: `cmd_${staffingSaveId}_staffing_invalid_base_airport`,
    saveId: staffingSaveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: staffingStartedAtUtc,
    actorType: "player",
    payload: {
      laborCategory: "pilot",
      employmentModel: "direct_hire",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 4_200,
      baseAirportId: "INVALID_AIRPORT",
    },
  });
  assert.equal(invalidBaseAirportResult.success, false);
  assert.equal(
    invalidBaseAirportResult.hardBlockers.some((entry) => /Base airport INVALID_AIRPORT was not found/i.test(entry)),
    true,
  );

  const staffingState = await backend.loadStaffingState(staffingSaveId);
  assert.ok(staffingState);
  assert.equal(staffingState.staffingPackages.length, 0);
  assert.equal(staffingState.namedPilots.length, 0);
  const companyContextAfterStaffingFailures = await backend.loadCompanyContext(staffingSaveId);
  assert.ok(companyContextAfterStaffingFailures);
  assert.equal(companyContextAfterStaffingFailures.currentCashAmount, hardStartingCashAmount);
} finally {
  await harness.cleanup();
}
