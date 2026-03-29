/*
 * Seeds a dense browser-regression save used by the focused UI suites.
 * The scenario intentionally includes:
 * - one committed aircraft timeline
 * - one grounded AOG aircraft
 * - one draft schedule
 * - accepted contracts already added to route plan
 * so surface-specific browser tests can start from a realistic mid-loop state.
 */

import assert from "node:assert/strict";

import { addAcceptedContractToRoutePlan } from "../../dist/ui/route-plan-state.js";
import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  dispatchOrThrow,
  saveAndCommitSchedule,
} from "./flightline-testkit.mjs";

export const uiRegressionRegistrations = {
  lead: "N208UI",
  constrained: "N20CUI",
  draft: "N20DUI",
};

export async function seedUiRegressionSave(backend, {
  saveId,
  displayName,
  startedAtUtc = "2026-03-16T13:00:00.000Z",
  startingCashAmount = 500_000_000,
} = {}) {
  assert.ok(saveId, "seedUiRegressionSave requires a saveId.");
  assert.ok(displayName, "seedUiRegressionSave requires a displayName.");

  const { lead, constrained, draft } = uiRegressionRegistrations;

  await createCompanySave(backend, saveId, {
    startedAtUtc,
    displayName,
    startingCashAmount,
  });

  await acquireAircraft(backend, saveId, startedAtUtc, {
    registration: lead,
    aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
  });
  await acquireAircraft(backend, saveId, startedAtUtc, {
    registration: constrained,
    aircraftModelId: "cessna_208b_grand_caravan_ex_cargo",
  });
  await acquireAircraft(backend, saveId, startedAtUtc, {
    registration: draft,
    aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
  });
  await activateStaffingPackage(backend, saveId, startedAtUtc, {
    laborCategory: "pilot",
    qualificationGroup: "single_turboprop_utility",
    coverageUnits: 3,
    fixedCostAmount: 12_000,
  });

  const refreshBoardResult = await backend.dispatch({
    commandId: `cmd_${saveId}_refresh`,
    saveId,
    commandName: "RefreshContractBoard",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      refreshReason: "bootstrap",
    },
  });
  assert.equal(refreshBoardResult.success, true);

  const fleetState = await backend.loadFleetState(saveId);
  assert.ok(fleetState);
  assert.equal(fleetState.aircraft.length, 3);

  const leadAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === lead);
  const constrainedAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === constrained);
  const draftAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === draft);
  assert.ok(leadAircraft);
  assert.ok(constrainedAircraft);
  assert.ok(draftAircraft);

  const board = await backend.loadActiveContractBoard(saveId);
  assert.ok(board);
  const seededOffers = board.offers.filter((offer) => offer.offerStatus === "available").slice(0, 2);
  assert.equal(seededOffers.length, 2);

  const seededAcceptedContractIds = [];
  for (const [index, offer] of seededOffers.entries()) {
    const accepted = await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_seed_accept_${index}`,
      saveId,
      commandName: "AcceptContractOffer",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        contractOfferId: offer.contractOfferId,
      },
    });
    seededAcceptedContractIds.push(String(accepted.metadata?.companyContractId ?? ""));
  }

  await backend.withExistingSaveDatabase(saveId, async (context) => {
    const companyContext = await backend.loadCompanyContext(saveId);
    assert.ok(companyContext);
    const guaranteedDispatchContractId = `company_contract_${saveId}_dispatchable`;

    context.saveDatabase.run(
      `INSERT INTO company_contract (
        company_contract_id,
        company_id,
        origin_contract_offer_id,
        archetype,
        origin_airport_id,
        destination_airport_id,
        volume_type,
        passenger_count,
        cargo_weight_lb,
        accepted_payout_amount,
        penalty_model_json,
        accepted_at_utc,
        earliest_start_utc,
        deadline_utc,
        contract_state,
        assigned_aircraft_id
      ) VALUES (
        $company_contract_id,
        $company_id,
        NULL,
        $archetype,
        $origin_airport_id,
        $destination_airport_id,
        $volume_type,
        $passenger_count,
        NULL,
        $accepted_payout_amount,
        $penalty_model_json,
        $accepted_at_utc,
        $earliest_start_utc,
        $deadline_utc,
        'accepted',
        NULL
      )`,
      {
        $company_contract_id: guaranteedDispatchContractId,
        $company_id: companyContext.companyId,
        $archetype: "regional_passenger",
        $origin_airport_id: "KDEN",
        $destination_airport_id: "KCOS",
        $volume_type: "passenger",
        $passenger_count: 6,
        $accepted_payout_amount: 18_500,
        $penalty_model_json: JSON.stringify({
          lateCompletionPenaltyPercent: 22,
          cancellationPenaltyPercent: 14,
        }),
        $accepted_at_utc: startedAtUtc,
        $earliest_start_utc: "2026-03-16T15:15:00.000Z",
        $deadline_utc: "2026-03-16T20:00:00.000Z",
      },
    );

    seededAcceptedContractIds.unshift(guaranteedDispatchContractId);

    for (const companyContractId of seededAcceptedContractIds) {
      const mutation = addAcceptedContractToRoutePlan(context.saveDatabase, saveId, companyContractId);
      assert.equal(mutation.success, true);
    }
    await context.saveDatabase.persist();
  });

  await saveAndCommitSchedule(
    backend,
    saveId,
    startedAtUtc,
    leadAircraft.aircraftId,
    [
      {
        legType: "reposition",
        originAirportId: "KDEN",
        destinationAirportId: "KCOS",
        plannedDepartureUtc: "2026-03-16T15:00:00.000Z",
        plannedArrivalUtc: "2026-03-16T16:10:00.000Z",
      },
      {
        legType: "reposition",
        originAirportId: "KCOS",
        destinationAirportId: "KDEN",
        plannedDepartureUtc: "2026-03-16T17:00:00.000Z",
        plannedArrivalUtc: "2026-03-16T18:10:00.000Z",
      },
    ],
  );

  const draftResult = await dispatchOrThrow(backend, {
    commandId: `cmd_${saveId}_draft_${draftAircraft.aircraftId}`,
    saveId,
    commandName: "SaveScheduleDraft",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      aircraftId: draftAircraft.aircraftId,
      scheduleKind: "operational",
      legs: [
        {
          legType: "reposition",
          originAirportId: "KDEN",
          destinationAirportId: "KCOS",
          plannedDepartureUtc: "2026-03-16T15:30:00.000Z",
          plannedArrivalUtc: "2026-03-16T16:40:00.000Z",
        },
        {
          legType: "reposition",
          originAirportId: "KCOS",
          destinationAirportId: "KDEN",
          plannedDepartureUtc: "2026-03-16T17:25:00.000Z",
          plannedArrivalUtc: "2026-03-16T18:35:00.000Z",
        },
      ],
    },
  });
  assert.equal(draftResult.hardBlockers.length, 0);

  await backend.withExistingSaveDatabase(saveId, async (context) => {
    const companyContext = await backend.loadCompanyContext(saveId);
    assert.ok(companyContext);

    context.saveDatabase.run(
      `UPDATE company_aircraft
       SET status_input = $status_input,
           dispatch_available = $dispatch_available
       WHERE aircraft_id = $aircraft_id`,
      {
        $status_input: "grounded",
        $dispatch_available: 0,
        $aircraft_id: constrainedAircraft.aircraftId,
      },
    );

    context.saveDatabase.run(
      `UPDATE maintenance_program_state
       SET condition_band_input = $condition_band_input,
           hours_since_inspection = $hours_since_inspection,
           cycles_since_inspection = $cycles_since_inspection,
           hours_to_service = $hours_to_service,
           maintenance_state_input = $maintenance_state_input,
           aog_flag = $aog_flag
       WHERE aircraft_id = $aircraft_id`,
      {
        $condition_band_input: "poor",
        $hours_since_inspection: 210,
        $cycles_since_inspection: 38,
        $hours_to_service: -6.5,
        $maintenance_state_input: "aog",
        $aog_flag: 1,
        $aircraft_id: constrainedAircraft.aircraftId,
      },
    );

    context.saveDatabase.run(
      `INSERT INTO maintenance_task (
        maintenance_task_id,
        aircraft_id,
        maintenance_type,
        provider_source,
        planned_start_utc,
        planned_end_utc,
        actual_start_utc,
        actual_end_utc,
        cost_estimate_amount,
        actual_cost_amount,
        task_state
      ) VALUES (
        $maintenance_task_id,
        $aircraft_id,
        $maintenance_type,
        $provider_source,
        $planned_start_utc,
        $planned_end_utc,
        NULL,
        NULL,
        $cost_estimate_amount,
        NULL,
        $task_state
      )`,
      {
        $maintenance_task_id: `task_${saveId}`,
        $aircraft_id: constrainedAircraft.aircraftId,
        $maintenance_type: "inspection_a",
        $provider_source: "scheduled_shop",
        $planned_start_utc: "2026-03-16T17:00:00.000Z",
        $planned_end_utc: "2026-03-16T19:00:00.000Z",
        $cost_estimate_amount: 3500,
        $task_state: "planned",
      },
    );

    context.saveDatabase.run(
      `UPDATE recurring_obligation
       SET next_due_at_utc = $next_due_at_utc
       WHERE company_id = $company_id
         AND status = 'active'`,
      {
        $next_due_at_utc: "2026-03-16T20:00:00.000Z",
        $company_id: companyContext.companyId,
      },
    );

    await context.saveDatabase.persist();
  });

  return {
    saveId,
    displayName,
    startedAtUtc,
    aircraft: {
      leadAircraftId: leadAircraft.aircraftId,
      constrainedAircraftId: constrainedAircraft.aircraftId,
      draftAircraftId: draftAircraft.aircraftId,
    },
    acceptedCompanyContractIds: seededAcceptedContractIds,
  };
}
