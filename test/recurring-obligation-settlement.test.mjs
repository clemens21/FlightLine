import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  createTestHarness,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import { loadClockPanelPayload } from "../dist/ui/clock-calendar.js";

async function loadRecurringState(backend, saveId) {
  return backend.withExistingSaveDatabase(saveId, async (context) => {
    const companyRow = context.saveDatabase.getOne(
      `SELECT active_company_id AS companyId
       FROM save_game
       WHERE save_id = $save_id
       LIMIT 1`,
      { $save_id: saveId },
    );
    assert.ok(companyRow?.companyId, `Expected save ${saveId} to have an active company.`);

    const obligations = context.saveDatabase.all(
      `SELECT
         recurring_obligation_id AS recurringObligationId,
         obligation_type AS obligationType,
         source_object_type AS sourceObjectType,
         source_object_id AS sourceObjectId,
         amount AS amount,
         cadence AS cadence,
         next_due_at_utc AS nextDueAtUtc,
         end_at_utc AS endAtUtc,
         status AS status
       FROM recurring_obligation
       WHERE company_id = $company_id
       ORDER BY recurring_obligation_id ASC`,
      { $company_id: companyRow.companyId },
    );

    const ledgerEntries = context.saveDatabase.all(
      `SELECT
         ledger_entry_id AS ledgerEntryId,
         entry_time_utc AS entryTimeUtc,
         entry_type AS entryType,
         amount AS amount,
         source_object_type AS sourceObjectType,
         source_object_id AS sourceObjectId
       FROM ledger_entry
       WHERE company_id = $company_id
       ORDER BY entry_time_utc ASC, ledger_entry_id ASC`,
      { $company_id: companyRow.companyId },
    );

    return {
      obligations,
      ledgerEntries,
    };
  });
}

const harness = await createTestHarness("flightline-recurring-obligations");
const { backend } = harness;

try {
  const saveId = uniqueSaveId("recurring_obligations");
  const startedAtUtc = await createCompanySave(backend, saveId, {
    startedAtUtc: "2026-03-16T13:00:00.000Z",
    startingCashAmount: 10_000_000,
  });

  await acquireAircraft(backend, saveId, startedAtUtc, {
    ownershipType: "financed",
    registration: "N208RO",
  });
  await activateStaffingPackage(backend, saveId, startedAtUtc, {
    laborCategory: "pilot",
    employmentModel: "direct_hire",
    qualificationGroup: "single_turboprop_utility",
    coverageUnits: 1,
    fixedCostAmount: 12_000,
    endsAtUtc: "2026-04-16T13:00:00.000Z",
  });

  const companyContextBeforeAdvance = await backend.loadCompanyContext(saveId);
  assert.ok(companyContextBeforeAdvance);

  const recurringStateBeforeAdvance = await loadRecurringState(backend, saveId);
  assert.equal(recurringStateBeforeAdvance.obligations.length, 2);
  const financeObligation = recurringStateBeforeAdvance.obligations.find((entry) => entry.obligationType === "finance");
  const staffingObligation = recurringStateBeforeAdvance.obligations.find((entry) => entry.obligationType === "staffing");
  assert.ok(financeObligation);
  assert.ok(staffingObligation);
  assert.equal(financeObligation.status, "active");
  assert.equal(staffingObligation.status, "active");
  assert.equal(financeObligation.nextDueAtUtc, "2026-04-16T13:00:00.000Z");
  assert.equal(staffingObligation.nextDueAtUtc, "2026-04-16T13:00:00.000Z");

  const preAdvanceClockPayload = await loadClockPanelPayload(backend, saveId, "2026-04-16");
  assert.ok(preAdvanceClockPayload);
  assert.equal(
    preAdvanceClockPayload.agenda.filter((event) => event.title === "Payment Due").length,
    2,
  );

  const advanceResult = await backend.dispatch({
    commandId: `cmd_${saveId}_advance_recurring_due`,
    saveId,
    commandName: "AdvanceTime",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      targetTimeUtc: "2026-04-17T13:00:00.000Z",
      stopConditions: ["target_time"],
    },
  });
  assert.equal(
    advanceResult.success,
    true,
    advanceResult.hardBlockers?.[0] ?? "Expected recurring obligations to settle during time advance.",
  );

  const companyContextAfterAdvance = await backend.loadCompanyContext(saveId);
  assert.ok(companyContextAfterAdvance);
  assert.equal(
    companyContextAfterAdvance.currentCashAmount,
    companyContextBeforeAdvance.currentCashAmount - financeObligation.amount - staffingObligation.amount,
  );

  const recurringStateAfterAdvance = await loadRecurringState(backend, saveId);
  const financeObligationAfterAdvance = recurringStateAfterAdvance.obligations.find(
    (entry) => entry.recurringObligationId === financeObligation.recurringObligationId,
  );
  const staffingObligationAfterAdvance = recurringStateAfterAdvance.obligations.find(
    (entry) => entry.recurringObligationId === staffingObligation.recurringObligationId,
  );
  assert.ok(financeObligationAfterAdvance);
  assert.ok(staffingObligationAfterAdvance);
  assert.equal(financeObligationAfterAdvance.status, "active");
  assert.equal(financeObligationAfterAdvance.nextDueAtUtc, "2026-05-16T13:00:00.000Z");
  assert.equal(staffingObligationAfterAdvance.status, "completed");
  assert.equal(staffingObligationAfterAdvance.nextDueAtUtc, "2026-04-16T13:00:00.000Z");

  const collectedLedgerEntries = recurringStateAfterAdvance.ledgerEntries.filter(
    (entry) =>
      entry.entryTimeUtc === "2026-04-16T13:00:00.000Z"
      && (
        entry.sourceObjectId === financeObligation.sourceObjectId
        || entry.sourceObjectId === staffingObligation.sourceObjectId
      ),
  );
  assert.equal(collectedLedgerEntries.length, 2);
  assert.equal(collectedLedgerEntries.some((entry) => entry.entryType === "finance_payment"), true);
  assert.equal(collectedLedgerEntries.some((entry) => entry.entryType === "staffing_payment"), true);
  assert.equal(collectedLedgerEntries.some((entry) => entry.amount === financeObligation.amount * -1), true);
  assert.equal(collectedLedgerEntries.some((entry) => entry.amount === staffingObligation.amount * -1), true);

  const staffingStateAfterAdvance = await backend.loadStaffingState(saveId);
  assert.ok(staffingStateAfterAdvance);
  assert.equal(staffingStateAfterAdvance.totalActiveCoverageUnits, 0);
  assert.equal(staffingStateAfterAdvance.totalMonthlyFixedCostAmount, 0);
  assert.equal(
    staffingStateAfterAdvance.staffingPackages.some((entry) =>
      entry.staffingPackageId === staffingObligation.sourceObjectId
      && entry.status === "expired"),
    true,
  );

  const eventLogAfterAdvance = await backend.loadRecentEventLog(saveId, 12);
  assert.ok(eventLogAfterAdvance);
  assert.equal(
    eventLogAfterAdvance.entries.filter((entry) => entry.eventType === "recurring_obligation_collected").length >= 2,
    true,
  );
  assert.equal(
    eventLogAfterAdvance.entries.some((entry) => entry.sourceObjectId === financeObligation.recurringObligationId),
    true,
  );
  assert.equal(
    eventLogAfterAdvance.entries.some((entry) => entry.sourceObjectId === staffingObligation.recurringObligationId),
    true,
  );

  const postAdvanceClockPayload = await loadClockPanelPayload(backend, saveId, "2026-04-16");
  assert.ok(postAdvanceClockPayload);
  assert.equal(
    postAdvanceClockPayload.agenda.filter((event) => event.title === "Payment Due").length,
    0,
  );

  const nextCycleClockPayload = await loadClockPanelPayload(backend, saveId, "2026-05-16");
  assert.ok(nextCycleClockPayload);
  assert.equal(
    nextCycleClockPayload.agenda.filter((event) => event.title === "Payment Due").length,
    1,
  );
} finally {
  await harness.cleanup();
}
