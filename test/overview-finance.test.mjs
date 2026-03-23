import assert from "node:assert/strict";

import { addAcceptedContractToRoutePlan, loadRoutePlanState } from "../dist/ui/route-plan-state.js";
import { buildOverviewFinanceView } from "../dist/ui/overview-finance-model.js";
import { loadRecurringObligations } from "../dist/application/queries/recurring-obligations.js";
import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  createTestHarness,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";

const harness = await createTestHarness("flightline-overview-finance");
const { backend } = harness;

try {
  const saveId = uniqueSaveId("overview_finance");
  const startedAtUtc = await createCompanySave(backend, saveId, {
    startedAtUtc: "2026-03-16T13:00:00.000Z",
    startingCashAmount: 10_000_000,
  });

  await acquireAircraft(backend, saveId, startedAtUtc, {
    ownershipType: "financed",
    registration: "N208OF",
  });
  await activateStaffingPackage(backend, saveId, startedAtUtc, {
    laborCategory: "pilot",
    employmentModel: "direct_hire",
    qualificationGroup: "single_turboprop_utility",
    coverageUnits: 1,
    fixedCostAmount: 12_000,
  });

  const refreshResult = await backend.dispatch({
    commandId: `cmd_${saveId}_refresh_contracts`,
    saveId,
    commandName: "RefreshContractBoard",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      refreshReason: "finance_visibility_test",
    },
  });
  assert.equal(refreshResult.success, true);

  const board = await backend.loadActiveContractBoard(saveId);
  assert.ok(board);
  const offer = board.offers.find((entry) => entry.offerStatus === "available");
  assert.ok(offer);

  const acceptResult = await backend.dispatch({
    commandId: `cmd_${saveId}_accept_offer`,
    saveId,
    commandName: "AcceptContractOffer",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      contractOfferId: offer.contractOfferId,
    },
  });
  assert.equal(acceptResult.success, true);

  await backend.withExistingSaveDatabase(saveId, async (context) => {
    const companyContext = await backend.loadCompanyContext(saveId);
    const companyContracts = await backend.loadCompanyContracts(saveId);
    const fleetState = await backend.loadFleetState(saveId);
    const staffingState = await backend.loadStaffingState(saveId);
    assert.ok(companyContext);
    assert.ok(companyContracts);
    assert.ok(fleetState);
    assert.ok(staffingState);

    const acceptedContract = companyContracts.contracts.find((entry) => entry.contractState === "accepted");
    assert.ok(acceptedContract);
    const routePlanMutation = addAcceptedContractToRoutePlan(context.saveDatabase, saveId, acceptedContract.companyContractId);
    assert.equal(routePlanMutation.success, true);
    await context.saveDatabase.persist();

    const recurringObligations = loadRecurringObligations(context.saveDatabase, saveId);
    const routePlan = loadRoutePlanState(context.saveDatabase, saveId);
    const financeView = buildOverviewFinanceView({
      companyContext,
      companyContracts,
      fleetState,
      staffingState,
      recurringObligations,
      routePlan,
    });

    assert.equal(financeView.summaryCards.length, 3);
    assert.equal(financeView.summaryCards.some((card) => card.label === "Current cash"), true);
    assert.equal(financeView.summaryCards.some((card) => card.label === "Next hit"), true);
    assert.equal(financeView.summaryCards.some((card) => card.label === "Recurring total"), true);

    const laborCategory = financeView.categoryTotals.find((entry) => entry.category === "Labor");
    const financeCategory = financeView.categoryTotals.find((entry) => entry.category === "Finance");
    assert.ok(laborCategory);
    assert.ok(financeCategory);
    assert.ok((laborCategory.monthlyEquivalentAmount ?? 0) > 0);
    assert.ok((financeCategory.monthlyEquivalentAmount ?? 0) > 0);

    assert.equal(financeView.obligations.length >= 2, true);
    assert.equal(financeView.projection.defaultHorizonId, "4w");
    assert.equal(financeView.projection.points.length >= 9, true);
    assert.equal(
      financeView.projection.points.some((point) => point.upliftSourceCount >= 1 && point.upliftCashAmount > point.baseCashAmount),
      true,
    );
  });
} finally {
  await harness.cleanup();
}
