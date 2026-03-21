/*
 * Regression coverage for ui server smoke.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  dispatchOrThrow,
  pickFlyableOffer,
  refreshContractBoard,
  saveAndCommitSchedule,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import {
  allocatePort,
  createWorkspaceBackend,
  removeWorkspaceSave,
  startUiServer,
} from "./helpers/ui-testkit.mjs";

async function getHtml(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.ok, true, `Expected GET ${path} to succeed, received ${response.status}.`);
  return response.text();
}

async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.ok, true, `Expected GET ${path} to succeed, received ${response.status}.`);
  return response.json();
}

async function postFormJson(baseUrl, path, fields) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        body.append(key, String(item));
      }
      continue;
    }

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

const saveId = uniqueSaveId("ui_http");
const displayName = `UI HTTP ${saveId}`;
let server = null;
let constrainedAircraftId = "";
let draftAircraftId = "";
let flyableOfferId = "";

try {
  const backend = await createWorkspaceBackend();

  try {
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T13:00:00.000Z",
      displayName,
      startingCashAmount: 500_000_000,
    });

    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N208HT",
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N20CHT",
      aircraftModelId: "cessna_208b_grand_caravan_ex_cargo",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N20DHT",
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 3,
      fixedCostAmount: 12_000,
    });
    await refreshContractBoard(backend, saveId, startedAtUtc);

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    assert.equal(fleetState.aircraft.length, 3);

    const leadAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N208HT");
    const constrainedAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N20CHT");
    const draftAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N20DHT");
    assert.ok(leadAircraft);
    assert.ok(constrainedAircraft);
    assert.ok(draftAircraft);
    constrainedAircraftId = constrainedAircraft.aircraftId;
    draftAircraftId = draftAircraft.aircraftId;

    const board = await backend.loadActiveContractBoard(saveId);
    assert.ok(board);
    const flyableOffer = pickFlyableOffer(board, draftAircraft, backend.getAirportReference());
    assert.ok(flyableOffer);
    flyableOfferId = flyableOffer.contractOfferId;

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
  } finally {
    await backend.close();
  }

  const port = await allocatePort();
  server = await startUiServer(port);

  const openSaveHtml = await getHtml(server.baseUrl, `/open-save/${encodeURIComponent(saveId)}?tab=aircraft`);
  assert.match(openSaveHtml, /open-save-client\.js/);
  assert.match(openSaveHtml, /Opening save/);

  const shellHtml = await getHtml(server.baseUrl, `/save/${encodeURIComponent(saveId)}?tab=aircraft`);
  assert.match(shellHtml, /data-save-shell-app/);
  assert.match(shellHtml, /save-shell-client\.js/);
  assert.match(shellHtml, /data-settings-open-help/);
  assert.match(shellHtml, /data-help-center/);
  assert.match(shellHtml, /Help Home/);
  assert.match(shellHtml, /Do This Next/);
  assert.match(shellHtml, /Why Am I Blocked\?/);
  assert.match(shellHtml, /Key Concepts/);
  assert.match(shellHtml, /What should I do next\?/);
  assert.match(shellHtml, /How the FlightLine loop works/);
  assert.match(shellHtml, /Contracts/);
  assert.match(shellHtml, /Aircraft availability/);
  assert.match(shellHtml, /Staff in the current slice/);
  assert.match(shellHtml, /Dispatch and validation/);
  assert.match(shellHtml, /Time Advance and Calendar/);
  assert.match(shellHtml, /Cash flow basics/);
  assert.match(shellHtml, /I cannot dispatch this contract/);
  assert.match(shellHtml, /\.staffing-hire-overlay\s*\{/);

  const bootstrap = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/bootstrap?tab=aircraft`);
  assert.equal(bootstrap.saveId, saveId);
  assert.equal(bootstrap.initialTab, "aircraft");
  assert.equal(bootstrap.shell.title, displayName);
  assert.equal(bootstrap.shell.tabCounts.aircraft, "1/3");
  assert.equal(bootstrap.shell.tabCounts.staffing, "3");

  const staffingTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/tab/staffing`);
  assert.equal(staffingTab.tabId, "staffing");
  assert.equal(staffingTab.contentHtml.includes('data-staffing-default-view="employees"'), true);
  assert.equal(staffingTab.contentHtml.includes("Pilot Roster"), true);
  assert.equal(staffingTab.contentHtml.includes("data-staffing-roster"), true);
  assert.equal(staffingTab.contentHtml.includes('data-staffing-detail-panel="employees"'), true);
  assert.equal(staffingTab.contentHtml.includes('data-staffing-detail-body="employees"'), true);
  assert.equal(staffingTab.contentHtml.includes("data-staffing-hire-overlay"), true);
  assert.ok((staffingTab.contentHtml.match(/data-staffing-pilot-row=/g) ?? []).length >= 3);
  assert.ok((staffingTab.contentHtml.match(/data-pilot-candidate-row=/g) ?? []).length >= 8);
  assert.equal(staffingTab.contentHtml.includes("N208HT"), true);
  assert.equal(staffingTab.contentHtml.includes("<th>Lane</th>"), true);
  assert.equal(staffingTab.contentHtml.includes("<th>Total hours</th>"), true);
  assert.equal(staffingTab.contentHtml.includes("<th>Lane hours</th>"), true);
  assert.equal(staffingTab.contentHtml.includes("<th>Starting price</th>"), true);
  assert.equal(staffingTab.contentHtml.includes("Direct hire"), true);
  assert.equal(staffingTab.contentHtml.includes("Contract hire"), true);
  assert.equal(staffingTab.contentHtml.includes("Immediate hire"), false);
  assert.equal(staffingTab.contentHtml.includes("completed flight hour"), true);
  const hireDetailBodyMatch = staffingTab.contentHtml.match(/data-staffing-detail-body="hire"[^>]*>([\s\S]*?)<\/div><div hidden data-staffing-detail-bank="hire">/);
  assert.ok(hireDetailBodyMatch?.[1]);
  const hireDetailHtml = hireDetailBodyMatch[1];
  assert.equal(hireDetailHtml.includes("Identity brief"), true);
  assert.equal(hireDetailHtml.includes("Flight profile"), true);
  assert.equal(hireDetailHtml.includes("Direct versus contract"), true);
  assert.equal(hireDetailHtml.includes("Pricing summary"), true);
  assert.equal(hireDetailHtml.includes("Choose hire path"), true);
  assert.equal(hireDetailHtml.includes("Qualification lane"), true);
  assert.equal(hireDetailHtml.includes("Total career hours"), true);
  assert.equal(hireDetailHtml.includes("Operational reliability"), true);
  assert.equal(hireDetailHtml.includes("Both hire paths use visible lane complexity"), true);
  assert.equal(hireDetailHtml.includes("completed flight-leg billing"), true);
  assert.equal(hireDetailHtml.includes("Direct salary uses visible lane complexity"), false);
  assert.equal(hireDetailHtml.includes("Hiring brief"), false);
  assert.equal(hireDetailHtml.includes("Pilot candidate"), false);
  assert.equal(hireDetailHtml.includes("Coverage posture"), false);
  assert.equal(hireDetailHtml.includes("Hire type"), false);
  assert.equal(hireDetailHtml.includes("Open-ended named pilot hire."), false);
  assert.equal(hireDetailHtml.includes("Monthly fixed staffing cost for this named hire."), false);
  assert.equal(hireDetailHtml.includes("Type and availability are fixed by this staffing offer."), false);
  assert.equal(hireDetailHtml.includes("Cabin General Coverage"), false);
  assert.equal(hireDetailHtml.includes("data-support-coverage-start"), false);
  const trainingMatch = staffingTab.contentHtml.match(/data-pilot-training-start="([^"]+)"/);
  assert.ok(trainingMatch?.[1]);

  const startTrainingResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/actions/start-pilot-training`, {
    tab: "staffing",
    saveId,
    namedPilotId: trainingMatch[1],
    targetCertificationCode: "MEPL",
  });
  assert.equal(startTrainingResult.response.ok, true);
  assert.equal(startTrainingResult.payload.success, true);
  assert.equal(startTrainingResult.payload.tab.tabId, "staffing");
  assert.equal(startTrainingResult.payload.tab.contentHtml.includes("training"), true);

  const aircraftTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/tab/aircraft`);
  assert.equal(aircraftTab.tabId, "aircraft");
  assert.equal(aircraftTab.contentHtml.includes("data-aircraft-tab-host"), true);
  assert.ok(aircraftTab.aircraftPayload);
  assert.equal(aircraftTab.aircraftPayload.aircraft.length, 3);
  assert.ok(aircraftTab.aircraftPayload.marketWorkspace);
  assert.ok(aircraftTab.aircraftPayload.marketWorkspace.offers.length > 0);

  const constrainedEntry = aircraftTab.aircraftPayload.aircraft.find((aircraft) => aircraft.registration === "N20CHT");
  assert.ok(constrainedEntry);
  assert.equal(constrainedEntry.operationalState, "grounded");
  assert.equal(constrainedEntry.maintenanceState, "aog");
  assert.equal(constrainedEntry.riskBand, "critical");

  const purchasableOffer = aircraftTab.aircraftPayload.marketWorkspace.offers.find((offer) => offer.buyOption?.isAffordable);
  assert.ok(purchasableOffer);

  const acquireOfferResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/actions/acquire-aircraft-offer`, {
    tab: "aircraft",
    aircraftOfferId: purchasableOffer.aircraftOfferId,
    ownershipType: "owned",
    upfrontPaymentAmount: purchasableOffer.buyOption.upfrontPaymentAmount,
  });
  assert.equal(acquireOfferResult.response.ok, true);
  assert.equal(acquireOfferResult.payload.success, true);
  assert.equal(acquireOfferResult.payload.tab.tabId, "aircraft");
  assert.ok(acquireOfferResult.payload.tab.aircraftPayload);
  assert.equal(acquireOfferResult.payload.tab.aircraftPayload.aircraft.length, 4);
  assert.equal(
    acquireOfferResult.payload.tab.aircraftPayload.marketWorkspace.offers.length,
    aircraftTab.aircraftPayload.marketWorkspace.offers.length - 1,
  );
  assert.equal(
    acquireOfferResult.payload.tab.aircraftPayload.marketWorkspace.offers.some((offer) => offer.aircraftOfferId === purchasableOffer.aircraftOfferId),
    false,
  );

  const contractsTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/tab/contracts`);
  assert.equal(contractsTab.tabId, "contracts");
  assert.equal(contractsTab.contentHtml.includes("data-contracts-host"), true);
  assert.ok(contractsTab.contractsPayload);

  const contractsView = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/contracts/view`);
  assert.ok(contractsView.payload);
  assert.ok(contractsView.payload.offers.length > 0);
  const selectedOffer = contractsView.payload.offers.find((offer) => offer.contractOfferId === flyableOfferId);
  assert.ok(selectedOffer);

  const plannerAddResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/contracts/planner/add`, {
    sourceType: "candidate_offer",
    sourceId: selectedOffer.contractOfferId,
  });
  assert.equal(plannerAddResult.response.ok, true);
  assert.equal(plannerAddResult.payload.success, true);
  assert.ok(plannerAddResult.payload.payload.routePlan);
  assert.equal(plannerAddResult.payload.payload.routePlan.items.length, 1);

  const routePlanItem = plannerAddResult.payload.payload.routePlan.items[0];
  const secondOffer = contractsView.payload.offers.find((offer) => offer.contractOfferId !== selectedOffer.contractOfferId);
  assert.ok(secondOffer);
  const plannerAddSecondResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/contracts/planner/add`, {
    sourceType: "candidate_offer",
    sourceId: secondOffer.contractOfferId,
  });
  assert.equal(plannerAddSecondResult.response.ok, true);
  assert.equal(plannerAddSecondResult.payload.success, true);
  assert.ok(plannerAddSecondResult.payload.payload.routePlan);
  assert.equal(plannerAddSecondResult.payload.payload.routePlan.items.length, 2);

  const plannerAcceptResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/contracts/planner/accept`, {
    routePlanItemId: routePlanItem.routePlanItemId,
  });
  assert.equal(plannerAcceptResult.response.ok, true);
  assert.equal(plannerAcceptResult.payload.success, true);
  assert.ok(plannerAcceptResult.payload.payload.acceptedContracts.length >= 1);
  assert.equal(
    plannerAcceptResult.payload.payload.acceptedContracts.some((contract) => contract.routePlanItemId === routePlanItem.routePlanItemId),
    true,
  );

  const dispatchTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/tab/dispatch`);
  assert.equal(dispatchTab.tabId, "dispatch");
  assert.equal(dispatchTab.contentHtml.includes("data-dispatch-tab-host"), true);
  assert.ok(dispatchTab.dispatchPayload);
  assert.equal(
    dispatchTab.dispatchPayload.workInputs.routePlanItems.every((item, index) => item.sequenceNumber === index + 1),
    true,
  );
  assert.equal(
    dispatchTab.dispatchPayload.workInputs.routePlanItems.every((item) => typeof item.originAirport.code === "string" && typeof item.destinationAirport.code === "string"),
    true,
  );
  assert.equal(dispatchTab.dispatchPayload.aircraft.length, 4);
  assert.equal(dispatchTab.dispatchPayload.aircraft.some((aircraft) => aircraft.aircraftId === draftAircraftId && aircraft.schedule?.isDraft), true);
  assert.equal(dispatchTab.dispatchPayload.workInputs.routePlanItems.length >= 2, true);
  assert.equal(dispatchTab.dispatchPayload.workInputs.acceptedContracts.length >= 1, true);
  assert.equal(dispatchTab.dispatchPayload.workInputs.acceptedReadyCount >= 1, true);
  const committedDispatchAircraft = dispatchTab.dispatchPayload.aircraft.find((aircraft) => aircraft.registration === "N208HT");
  assert.ok(committedDispatchAircraft);
  assert.equal(committedDispatchAircraft.assignedPilots.length, 1);
  assert.equal(typeof committedDispatchAircraft.assignedPilots[0]?.displayName, "string");
  assert.equal(committedDispatchAircraft.pilotReadiness.assignedPilotCount, 1);
  assert.ok(committedDispatchAircraft.schedule);
  assert.equal(committedDispatchAircraft.pilotReadiness.readyNowCount, 1);
  assert.equal(committedDispatchAircraft.pilotReadiness.trainingNowCount, 1);
  const acceptedDispatchContractId = dispatchTab.dispatchPayload.workInputs.acceptedContracts[0]?.companyContractId;
  const {
    deriveDispatchCommitImpactSummary,
    deriveDispatchReadinessSummary,
  } = await import("../dist/ui/public/dispatch-tab-client.js");
  const readinessSummary = deriveDispatchReadinessSummary({
    ...committedDispatchAircraft,
    schedule: {
      ...committedDispatchAircraft.schedule,
      validation: {
        ...(committedDispatchAircraft.schedule.validation ?? {}),
        isCommittable: false,
        hardBlockerCount: 1,
        warningCount: 2,
        validationMessages: [
          {
            severity: "blocker",
            code: "contract.assigned_elsewhere",
            summary: "Contract already assigned elsewhere.",
            suggestedRecoveryAction: "Clear the overlapping assignment or choose a different aircraft.",
          },
          {
            severity: "warning",
            code: "contract.deadline",
            summary: "This route would miss the contract deadline.",
            suggestedRecoveryAction: "Shift the window or rearrange the route chain.",
          },
          {
            severity: "warning",
            code: "contract.earliest_start",
            summary: "This route starts before the contract window opens.",
            suggestedRecoveryAction: "Shift the window or rearrange the route chain.",
          },
        ],
      },
    },
  });
  const routeOperationalItem = readinessSummary.checklist.find((item) => item.id === "route-operational-fit");
  const timingContinuityItem = readinessSummary.checklist.find((item) => item.id === "timing-continuity");
  const commitmentConflictItem = readinessSummary.checklist.find((item) => item.id === "commitment-conflicts");
  assert.equal(routeOperationalItem?.detail, "Route and aircraft fit are clear.");
  assert.equal(routeOperationalItem?.state, "pass");
  assert.equal(timingContinuityItem?.detail, "This route would miss the contract deadline.");
  assert.equal(timingContinuityItem?.state, "watch");
  assert.equal(commitmentConflictItem?.detail, "Contract already assigned elsewhere.");
  assert.equal(commitmentConflictItem?.state, "blocked");
  const committedWithoutValidationSummary = deriveDispatchReadinessSummary({
    ...committedDispatchAircraft,
    schedule: {
      ...committedDispatchAircraft.schedule,
      validation: undefined,
    },
  });
  assert.equal(
    committedWithoutValidationSummary.recoveryAction,
    "This aircraft already has a committed schedule. Review the current timeline instead of staging a draft here.",
  );
  const draftDispatchAircraft = dispatchTab.dispatchPayload.aircraft.find((aircraft) => aircraft.aircraftId === draftAircraftId);
  assert.ok(draftDispatchAircraft?.schedule);
  assert.ok(draftDispatchAircraft.schedule.draftPilotAssignment);
  assert.equal(draftDispatchAircraft.schedule.draftPilotAssignment.recommendedPilotIds.length >= 1, true);
  assert.equal(
    draftDispatchAircraft.schedule.draftPilotAssignment.candidateOptions.some((option) =>
      option.recommended && option.selectable && typeof option.displayName === "string"),
    true,
  );
  assert.equal(
    draftDispatchAircraft.schedule.draftPilotAssignment.candidateOptions.some((option) => option.selectable === false && typeof option.reason === "string"),
    true,
  );
  assert.equal(
    draftDispatchAircraft.schedule.draftPilotAssignment.candidateOptions.some((option) =>
      option.selectable === false
      && typeof option.reason === "string"
      && /training|committed elsewhere/i.test(option.reason)),
    true,
  );
  const thinMarginDraft = {
    ...draftDispatchAircraft,
    schedule: {
      ...draftDispatchAircraft.schedule,
      isDraft: true,
      validation: {
        ...(draftDispatchAircraft.schedule.validation ?? {}),
        isCommittable: true,
        hardBlockerCount: 0,
        warningCount: 1,
        validationMessages: [
          {
            severity: "warning",
            code: "finance.thin_margin",
            summary: "Projected schedule profit is thin.",
          },
        ],
      },
    },
  };
  const thinMarginImpact = deriveDispatchCommitImpactSummary(thinMarginDraft);
  const thinMarginReadiness = deriveDispatchReadinessSummary(thinMarginDraft);
  assert.equal(thinMarginImpact.note.includes("Projected schedule profit is thin."), true);
  assert.equal(
    thinMarginReadiness.checklist.some((item) => item.detail.includes("Projected schedule profit is thin.")),
    false,
  );
  const negativeMarginDraft = {
    ...draftDispatchAircraft,
    schedule: {
      ...draftDispatchAircraft.schedule,
      isDraft: true,
      validation: {
        ...(draftDispatchAircraft.schedule.validation ?? {}),
        isCommittable: true,
        hardBlockerCount: 0,
        warningCount: 1,
        validationMessages: [
          {
            severity: "warning",
            code: "finance.negative_margin",
            summary: "Projected schedule profit is negative.",
          },
        ],
      },
    },
  };
  const negativeMarginImpact = deriveDispatchCommitImpactSummary(negativeMarginDraft);
  const negativeMarginReadiness = deriveDispatchReadinessSummary(negativeMarginDraft);
  assert.equal(negativeMarginImpact.note.includes("Projected schedule profit is negative."), true);
  assert.equal(
    negativeMarginReadiness.checklist.some((item) => item.detail.includes("Projected schedule profit is negative.")),
    false,
  );

  assert.ok(acceptedDispatchContractId);

  const bindRoutePlanFailureResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/actions/bind-route-plan`, {
    tab: "dispatch",
    saveId,
    aircraftId: constrainedAircraftId,
  });
  assert.equal(bindRoutePlanFailureResult.response.ok, false);
  assert.equal(bindRoutePlanFailureResult.payload.success, false);
  assert.match(bindRoutePlanFailureResult.payload.error ?? "", /dispatch ready/i);
  assert.equal(bindRoutePlanFailureResult.payload.tab.tabId, "dispatch");
  assert.ok(bindRoutePlanFailureResult.payload.tab.dispatchPayload);
  assert.equal(
    bindRoutePlanFailureResult.payload.tab.dispatchPayload.workInputs.routePlanItems.some((item) => item.linkedAircraftId === constrainedAircraftId),
    false,
  );
  assert.equal(
    bindRoutePlanFailureResult.payload.tab.dispatchPayload.aircraft.some((aircraft) => aircraft.aircraftId === constrainedAircraftId && aircraft.schedule),
    false,
  );
  assert.equal(bindRoutePlanFailureResult.payload.tab.dispatchPayload.workInputs.acceptedReadyCount >= 1, true);

  const bindRoutePlanResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/actions/bind-route-plan`, {
    tab: "dispatch",
    saveId,
    aircraftId: draftAircraftId,
  });
  assert.equal(bindRoutePlanResult.response.ok, true);
  assert.equal(bindRoutePlanResult.payload.success, true);
  assert.equal(bindRoutePlanResult.payload.tab.tabId, "dispatch");
  assert.ok(bindRoutePlanResult.payload.tab.dispatchPayload);
  assert.equal(
    bindRoutePlanResult.payload.tab.dispatchPayload.workInputs.routePlanItems.some((item) => !item.linkedAircraftId && item.plannerItemStatus === "accepted_ready"),
    true,
  );
  assert.equal(
    bindRoutePlanResult.payload.tab.dispatchPayload.aircraft.some((aircraft) => aircraft.aircraftId === draftAircraftId && aircraft.schedule?.isDraft),
    true,
  );
  const stagedDraftScheduleId = bindRoutePlanResult.payload.tab.dispatchPayload.aircraft.find((aircraft) => aircraft.aircraftId === draftAircraftId)?.schedule?.scheduleId;
  assert.ok(stagedDraftScheduleId);

  const discardDraftResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/actions/discard-schedule-draft`, {
    tab: "dispatch",
    saveId,
    scheduleId: stagedDraftScheduleId,
  });
  assert.equal(discardDraftResult.response.ok, true);
  assert.equal(discardDraftResult.payload.success, true);
  assert.equal(discardDraftResult.payload.tab.tabId, "dispatch");
  assert.ok(discardDraftResult.payload.tab.dispatchPayload);
  const draftAircraftAfterDiscard = discardDraftResult.payload.tab.dispatchPayload.aircraft.find((aircraft) => aircraft.aircraftId === draftAircraftId);
  assert.ok(draftAircraftAfterDiscard);
  assert.equal(draftAircraftAfterDiscard.schedule, undefined);
  assert.equal(
    discardDraftResult.payload.tab.dispatchPayload.aircraft.some((aircraft) => aircraft.registration === "N208HT" && aircraft.schedule?.isDraft === false),
    true,
  );

  const autoPlanFailureResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/actions/auto-plan-contract`, {
    tab: "dispatch",
    saveId,
    companyContractId: acceptedDispatchContractId,
    aircraftId: constrainedAircraftId,
  });
  assert.equal(autoPlanFailureResult.response.ok, false);
  assert.equal(autoPlanFailureResult.payload.success, false);
  assert.match(autoPlanFailureResult.payload.error ?? "", /not dispatchable/i);
  assert.equal(autoPlanFailureResult.payload.tab.tabId, "dispatch");
  assert.ok(autoPlanFailureResult.payload.tab.dispatchPayload);
  const constrainedAfterAutoPlanFailure = autoPlanFailureResult.payload.tab.dispatchPayload.aircraft.find((aircraft) => aircraft.aircraftId === constrainedAircraftId);
  assert.ok(constrainedAfterAutoPlanFailure?.schedule);
  assert.equal(constrainedAfterAutoPlanFailure.schedule.isDraft, true);
  assert.equal(constrainedAfterAutoPlanFailure.schedule.scheduleState, "blocked");
  assert.equal(constrainedAfterAutoPlanFailure.schedule.validation?.isCommittable, false);
  assert.equal(
    autoPlanFailureResult.payload.tab.dispatchPayload.workInputs.acceptedContracts.some((contract) => contract.companyContractId === acceptedDispatchContractId),
    true,
  );

  const blockedScheduleId = constrainedAfterAutoPlanFailure.schedule.scheduleId;
  const blockedCommitResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/actions/commit-schedule`, {
    tab: "dispatch",
    saveId,
    scheduleId: blockedScheduleId,
  });
  assert.equal(blockedCommitResult.response.ok, false);
  assert.equal(blockedCommitResult.payload.success, false);
  assert.match(blockedCommitResult.payload.error ?? "", /not dispatchable/i);
  assert.equal(blockedCommitResult.payload.tab.tabId, "dispatch");
  assert.ok(blockedCommitResult.payload.tab.dispatchPayload);
  const constrainedAfterBlockedCommit = blockedCommitResult.payload.tab.dispatchPayload.aircraft.find((aircraft) => aircraft.aircraftId === constrainedAircraftId);
  assert.ok(constrainedAfterBlockedCommit?.schedule);
  assert.equal(constrainedAfterBlockedCommit.schedule.scheduleId, blockedScheduleId);
  assert.equal(constrainedAfterBlockedCommit.schedule.isDraft, true);
  assert.equal(constrainedAfterBlockedCommit.schedule.scheduleState, "blocked");
  assert.equal(constrainedAfterBlockedCommit.schedule.validation?.isCommittable, false);

  const clockResult = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/clock`);
  assert.ok(clockResult.payload);
  assert.equal(clockResult.payload.days.length, 42);
  assert.equal(clockResult.payload.agenda.some((event) => event.title === "Payment Due"), true);
  assert.equal(clockResult.payload.agenda.some((event) => event.title === "Planned Departure"), true);

  const clockTickResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/clock/tick`, {
    tab: "aircraft",
    minutes: 60,
    selectedLocalDate: clockResult.payload.selectedLocalDate,
  });
  assert.equal(clockTickResult.response.ok, true);
  assert.equal(clockTickResult.payload.success, true);
  assert.ok(clockTickResult.payload.clock);
  assert.equal(clockTickResult.payload.clock.currentTimeUtc, "2026-03-16T14:00:00.000Z");

  const acquireResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/actions/acquire-aircraft`, {
    saveId,
    tab: "aircraft",
    aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
  });
  assert.equal(acquireResult.response.ok, true);
  assert.equal(acquireResult.payload.success, true);
  assert.ok(acquireResult.payload.tab);
  assert.equal(acquireResult.payload.tab.tabId, "aircraft");
  assert.ok(acquireResult.payload.tab.aircraftPayload);
  assert.equal(acquireResult.payload.tab.aircraftPayload.aircraft.length, 5);
  assert.equal(acquireResult.payload.tab.shell.tabCounts.aircraft, "3/5");
} finally {
  await Promise.allSettled([
    server?.stop(),
  ]);
  await removeWorkspaceSave(saveId);
}
