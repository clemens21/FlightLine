import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
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

try {
  const backend = await createWorkspaceBackend();

  try {
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T13:00:00.000Z",
      displayName,
      startingCashAmount: 9_500_000,
    });

    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N208HT",
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N20CHT",
      aircraftModelId: "cessna_208b_grand_caravan_ex_cargo",
    });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 2,
      fixedCostAmount: 12_000,
    });
    await refreshContractBoard(backend, saveId, startedAtUtc);

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    assert.equal(fleetState.aircraft.length, 2);

    const leadAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N208HT");
    const constrainedAircraft = fleetState.aircraft.find((aircraft) => aircraft.registration === "N20CHT");
    assert.ok(leadAircraft);
    assert.ok(constrainedAircraft);

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
      ],
    );

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

  const bootstrap = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/bootstrap?tab=aircraft`);
  assert.equal(bootstrap.saveId, saveId);
  assert.equal(bootstrap.initialTab, "aircraft");
  assert.equal(bootstrap.shell.title, displayName);
  assert.equal(bootstrap.shell.tabCounts.aircraft, "0/2");

  const aircraftTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/tab/aircraft`);
  assert.equal(aircraftTab.tabId, "aircraft");
  assert.equal(aircraftTab.contentHtml.includes("data-aircraft-tab-host"), true);
  assert.ok(aircraftTab.aircraftPayload);
  assert.equal(aircraftTab.aircraftPayload.aircraft.length, 2);

  const constrainedEntry = aircraftTab.aircraftPayload.aircraft.find((aircraft) => aircraft.registration === "N20CHT");
  assert.ok(constrainedEntry);
  assert.equal(constrainedEntry.operationalState, "grounded");
  assert.equal(constrainedEntry.maintenanceState, "aog");
  assert.equal(constrainedEntry.riskBand, "critical");

  const contractsTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/tab/contracts`);
  assert.equal(contractsTab.tabId, "contracts");
  assert.equal(contractsTab.contentHtml.includes("data-contracts-host"), true);
  assert.ok(contractsTab.contractsPayload);

  const contractsView = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/contracts/view`);
  assert.ok(contractsView.payload);
  assert.ok(contractsView.payload.offers.length > 0);
  const selectedOffer = contractsView.payload.offers.find((offer) => offer.offerStatus === "available");
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
  assert.equal(acquireResult.payload.tab.aircraftPayload.aircraft.length, 3);
  assert.equal(acquireResult.payload.tab.shell.tabCounts.aircraft, "1/3");
} finally {
  await Promise.allSettled([
    server?.stop(),
  ]);
  await removeWorkspaceSave(saveId);
}


