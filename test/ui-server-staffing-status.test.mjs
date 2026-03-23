/*
 * Focused UI-server coverage for pending and expired named-pilot roster truth.
 * This keeps the staffing status presentation isolated from the broader browser smoke suite.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  refreshStaffingMarket,
  saveAndCommitSchedule,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import {
  allocatePort,
  createWorkspaceBackend,
  removeWorkspaceSave,
  startUiServer,
} from "./helpers/ui-testkit.mjs";

async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.ok, true, `Expected GET ${path} to succeed, received ${response.status}.`);
  return response.json();
}

async function postFormJson(baseUrl, path, fields) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, String(value));
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body,
  });

  return {
    response,
    payload: await response.json(),
  };
}

function extractFirstPilotRow(html) {
  const match = html.match(/<tr[^>]*data-staffing-pilot-row="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/i);
  assert.ok(match?.[1], "Expected a staffing pilot row.");
  return {
    pilotId: match[1],
    rowHtml: match[2],
  };
}

function extractEmployeeDetail(html) {
  const match = html.match(/data-staffing-detail-body="employees"[\s\S]*?>([\s\S]*?)<\/div><div hidden data-staffing-detail-bank="employees">/i);
  assert.ok(match?.[1], "Expected employee detail body.");
  return match[1];
}

const pendingSaveId = uniqueSaveId("ui_staff_pending");
const activeSaveId = uniqueSaveId("ui_staff_active");
const expiredSaveId = uniqueSaveId("ui_staff_expired");
const contractSaveId = uniqueSaveId("ui_staff_contract_actions");
const reservedSaveId = uniqueSaveId("ui_staff_reserved_block");
const trainingSaveId = uniqueSaveId("ui_staff_training_block");
const contractReservedSaveId = uniqueSaveId("ui_staff_contract_reserved_convert_block");
const contractFlyingSaveId = uniqueSaveId("ui_staff_contract_flying_convert_block");
const laborRecordSaveId = uniqueSaveId("ui_staff_labor_record");
let server = null;

try {
  const backend = await createWorkspaceBackend();
  try {
    const pendingStartedAtUtc = await createCompanySave(backend, pendingSaveId, {
      startedAtUtc: "2026-03-16T13:00:00.000Z",
      displayName: `UI Staff Pending ${pendingSaveId}`,
      startingCashAmount: 3_500_000,
    });
    const pendingActivationResult = await activateStaffingPackage(backend, pendingSaveId, pendingStartedAtUtc, {
      laborCategory: "pilot",
      employmentModel: "direct_hire",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 4_200,
      startsAtUtc: "2026-03-17T13:00:00.000Z",
    });
    assert.equal(pendingActivationResult.success, true);

    const activeStartedAtUtc = await createCompanySave(backend, activeSaveId, {
      startedAtUtc: "2026-03-16T14:00:00.000Z",
      displayName: `UI Staff Active ${activeSaveId}`,
      startingCashAmount: 3_500_000,
    });
    const activeActivationResult = await activateStaffingPackage(backend, activeSaveId, activeStartedAtUtc, {
      laborCategory: "pilot",
      employmentModel: "direct_hire",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 4_200,
      startsAtUtc: "2026-03-17T14:00:00.000Z",
      endsAtUtc: "2026-03-18T14:00:00.000Z",
    });
    assert.equal(activeActivationResult.success, true);
    const activeAdvanceResult = await backend.dispatch({
      commandId: `cmd_${activeSaveId}_advance_active_staffing`,
      saveId: activeSaveId,
      commandName: "AdvanceTime",
      issuedAtUtc: activeStartedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: "2026-03-17T15:00:00.000Z",
        stopConditions: ["target_time"],
      },
    });
    assert.equal(activeAdvanceResult.success, true);

    const expiredStartedAtUtc = await createCompanySave(backend, expiredSaveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      displayName: `UI Staff Expired ${expiredSaveId}`,
      startingCashAmount: 10_000_000,
    });
    const refreshResult = await refreshStaffingMarket(backend, expiredSaveId, expiredStartedAtUtc, "bootstrap");
    assert.equal(refreshResult.success, true);
    const staffingMarket = await backend.loadActiveStaffingMarket(expiredSaveId);
    assert.ok(staffingMarket);
    const contractOffer = staffingMarket.offers.find((offer) => offer.employmentModel === "contract_hire");
    assert.ok(contractOffer);

    const hireResult = await backend.dispatch({
      commandId: `cmd_${expiredSaveId}_hire_contract_candidate`,
      saveId: expiredSaveId,
      commandName: "ActivateStaffingPackage",
      issuedAtUtc: expiredStartedAtUtc,
      actorType: "player",
      payload: {
        laborCategory: contractOffer.laborCategory,
        employmentModel: contractOffer.employmentModel,
        qualificationGroup: contractOffer.qualificationGroup,
        coverageUnits: contractOffer.coverageUnits,
        fixedCostAmount: contractOffer.fixedCostAmount,
        variableCostRate: contractOffer.variableCostRate,
        startsAtUtc: contractOffer.startsAtUtc,
        endsAtUtc: contractOffer.endsAtUtc,
        sourceOfferId: contractOffer.staffingOfferId,
      },
    });
    assert.equal(hireResult.success, true);

    const contractEndUtc = contractOffer.endsAtUtc;
    assert.ok(contractEndUtc);
    const postExpiryTargetUtc = new Date(new Date(contractEndUtc).getTime() + 3_600_000).toISOString();
    const expiryAdvanceResult = await backend.dispatch({
      commandId: `cmd_${expiredSaveId}_advance_expired_staffing`,
      saveId: expiredSaveId,
      commandName: "AdvanceTime",
      issuedAtUtc: expiredStartedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: postExpiryTargetUtc,
        stopConditions: ["target_time"],
      },
    });
    assert.equal(expiryAdvanceResult.success, true);

    const contractStartedAtUtc = await createCompanySave(backend, contractSaveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      displayName: `UI Staff Contract ${contractSaveId}`,
      startingCashAmount: 10_000_000,
    });
    const contractRefreshResult = await refreshStaffingMarket(backend, contractSaveId, contractStartedAtUtc, "bootstrap");
    assert.equal(contractRefreshResult.success, true);
    const contractMarket = await backend.loadActiveStaffingMarket(contractSaveId);
    assert.ok(contractMarket);
    const contractActionOffer = contractMarket.offers.find((offer) => offer.employmentModel === "contract_hire");
    assert.ok(contractActionOffer);
    const contractHireResult = await backend.dispatch({
      commandId: `cmd_${contractSaveId}_hire_contract_pilot`,
      saveId: contractSaveId,
      commandName: "ActivateStaffingPackage",
      issuedAtUtc: contractStartedAtUtc,
      actorType: "player",
      payload: {
        laborCategory: contractActionOffer.laborCategory,
        employmentModel: contractActionOffer.employmentModel,
        qualificationGroup: contractActionOffer.qualificationGroup,
        coverageUnits: contractActionOffer.coverageUnits,
        fixedCostAmount: contractActionOffer.fixedCostAmount,
        variableCostRate: contractActionOffer.variableCostRate,
        startsAtUtc: contractActionOffer.startsAtUtc,
        endsAtUtc: contractActionOffer.endsAtUtc,
        sourceOfferId: contractActionOffer.staffingOfferId,
      },
    });
    assert.equal(contractHireResult.success, true);

    const reservedStartedAtUtc = await createCompanySave(backend, reservedSaveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      displayName: `UI Staff Reserved ${reservedSaveId}`,
      startingCashAmount: 6_000_000,
    });
    await acquireAircraft(backend, reservedSaveId, reservedStartedAtUtc, {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      registration: "N208RS",
    });
    await activateStaffingPackage(backend, reservedSaveId, reservedStartedAtUtc, {
      laborCategory: "pilot",
      employmentModel: "direct_hire",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 4_200,
    });
    const reservedFleetState = await backend.loadFleetState(reservedSaveId);
    const reservedAircraft = reservedFleetState?.aircraft.find((entry) => entry.registration === "N208RS");
    assert.ok(reservedAircraft);
    await saveAndCommitSchedule(backend, reservedSaveId, reservedStartedAtUtc, reservedAircraft.aircraftId, [
      {
        legType: "reposition",
        originAirportId: "KDEN",
        destinationAirportId: "KCOS",
        plannedDepartureUtc: "2026-03-16T16:00:00.000Z",
        plannedArrivalUtc: "2026-03-16T17:10:00.000Z",
      },
    ]);

    const trainingStartedAtUtc = await createCompanySave(backend, trainingSaveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      displayName: `UI Staff Training ${trainingSaveId}`,
      startingCashAmount: 6_000_000,
    });
    await activateStaffingPackage(backend, trainingSaveId, trainingStartedAtUtc, {
      laborCategory: "pilot",
      employmentModel: "direct_hire",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 4_200,
    });
    const trainingStaffingState = await backend.loadStaffingState(trainingSaveId);
    assert.ok(trainingStaffingState?.namedPilots[0]);
    const trainingPilot = trainingStaffingState.namedPilots[0];
    const trainingStartResult = await backend.dispatch({
      commandId: `cmd_${trainingSaveId}_start_training`,
      saveId: trainingSaveId,
      commandName: "StartNamedPilotTraining",
      issuedAtUtc: trainingStartedAtUtc,
      actorType: "player",
      payload: {
        namedPilotId: trainingPilot.namedPilotId,
      },
    });
    assert.equal(trainingStartResult.success, true);

    const contractReservedStartedAtUtc = await createCompanySave(backend, contractReservedSaveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      displayName: `UI Staff Contract Reserved ${contractReservedSaveId}`,
      startingCashAmount: 10_000_000,
    });
    await acquireAircraft(backend, contractReservedSaveId, contractReservedStartedAtUtc, {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      registration: "N208CR",
    });
    const contractReservedRefreshResult = await refreshStaffingMarket(backend, contractReservedSaveId, contractReservedStartedAtUtc, "bootstrap");
    assert.equal(contractReservedRefreshResult.success, true);
    const contractReservedMarket = await backend.loadActiveStaffingMarket(contractReservedSaveId);
    assert.ok(contractReservedMarket);
    const contractReservedOffer = contractReservedMarket.offers.find((offer) => offer.employmentModel === "contract_hire");
    assert.ok(contractReservedOffer);
    const contractReservedHireResult = await backend.dispatch({
      commandId: `cmd_${contractReservedSaveId}_hire_contract_reserved`,
      saveId: contractReservedSaveId,
      commandName: "ActivateStaffingPackage",
      issuedAtUtc: contractReservedStartedAtUtc,
      actorType: "player",
      payload: {
        laborCategory: contractReservedOffer.laborCategory,
        employmentModel: contractReservedOffer.employmentModel,
        qualificationGroup: contractReservedOffer.qualificationGroup,
        coverageUnits: contractReservedOffer.coverageUnits,
        fixedCostAmount: contractReservedOffer.fixedCostAmount,
        variableCostRate: contractReservedOffer.variableCostRate,
        startsAtUtc: contractReservedOffer.startsAtUtc,
        endsAtUtc: contractReservedOffer.endsAtUtc,
        sourceOfferId: contractReservedOffer.staffingOfferId,
      },
    });
    assert.equal(contractReservedHireResult.success, true);
    const contractReservedFleetState = await backend.loadFleetState(contractReservedSaveId);
    const contractReservedAircraft = contractReservedFleetState?.aircraft.find((entry) => entry.registration === "N208CR");
    assert.ok(contractReservedAircraft);
    await saveAndCommitSchedule(backend, contractReservedSaveId, contractReservedStartedAtUtc, contractReservedAircraft.aircraftId, [
      {
        legType: "reposition",
        originAirportId: "KDEN",
        destinationAirportId: "KCOS",
        plannedDepartureUtc: "2026-03-16T16:00:00.000Z",
        plannedArrivalUtc: "2026-03-16T17:10:00.000Z",
        assignedQualificationGroup: contractReservedOffer.qualificationGroup,
      },
    ]);

    const contractFlyingStartedAtUtc = await createCompanySave(backend, contractFlyingSaveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      displayName: `UI Staff Contract Flying ${contractFlyingSaveId}`,
      startingCashAmount: 10_000_000,
    });
    await acquireAircraft(backend, contractFlyingSaveId, contractFlyingStartedAtUtc, {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      registration: "N208CF",
    });
    const contractFlyingRefreshResult = await refreshStaffingMarket(backend, contractFlyingSaveId, contractFlyingStartedAtUtc, "bootstrap");
    assert.equal(contractFlyingRefreshResult.success, true);
    const contractFlyingMarket = await backend.loadActiveStaffingMarket(contractFlyingSaveId);
    assert.ok(contractFlyingMarket);
    const contractFlyingOffer = contractFlyingMarket.offers.find((offer) => offer.employmentModel === "contract_hire");
    assert.ok(contractFlyingOffer);
    const contractFlyingHireResult = await backend.dispatch({
      commandId: `cmd_${contractFlyingSaveId}_hire_contract_flying`,
      saveId: contractFlyingSaveId,
      commandName: "ActivateStaffingPackage",
      issuedAtUtc: contractFlyingStartedAtUtc,
      actorType: "player",
      payload: {
        laborCategory: contractFlyingOffer.laborCategory,
        employmentModel: contractFlyingOffer.employmentModel,
        qualificationGroup: contractFlyingOffer.qualificationGroup,
        coverageUnits: contractFlyingOffer.coverageUnits,
        fixedCostAmount: contractFlyingOffer.fixedCostAmount,
        variableCostRate: contractFlyingOffer.variableCostRate,
        startsAtUtc: contractFlyingOffer.startsAtUtc,
        endsAtUtc: contractFlyingOffer.endsAtUtc,
        sourceOfferId: contractFlyingOffer.staffingOfferId,
      },
    });
    assert.equal(contractFlyingHireResult.success, true);
    const contractFlyingFleetState = await backend.loadFleetState(contractFlyingSaveId);
    const contractFlyingAircraft = contractFlyingFleetState?.aircraft.find((entry) => entry.registration === "N208CF");
    assert.ok(contractFlyingAircraft);
    await saveAndCommitSchedule(backend, contractFlyingSaveId, contractFlyingStartedAtUtc, contractFlyingAircraft.aircraftId, [
      {
        legType: "reposition",
        originAirportId: "KDEN",
        destinationAirportId: "KCOS",
        plannedDepartureUtc: "2026-03-16T16:00:00.000Z",
        plannedArrivalUtc: "2026-03-16T17:10:00.000Z",
        assignedQualificationGroup: contractFlyingOffer.qualificationGroup,
      },
    ]);
    const contractFlyingAdvanceResult = await backend.dispatch({
      commandId: `cmd_${contractFlyingSaveId}_advance_flying`,
      saveId: contractFlyingSaveId,
      commandName: "AdvanceTime",
      issuedAtUtc: contractFlyingStartedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: "2026-03-16T16:20:00.000Z",
        stopConditions: ["target_time"],
      },
    });
    assert.equal(contractFlyingAdvanceResult.success, true);

    const laborRecordStartedAtUtc = await createCompanySave(backend, laborRecordSaveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      displayName: `UI Staff Labor ${laborRecordSaveId}`,
      startingCashAmount: 10_000_000,
    });
    await acquireAircraft(backend, laborRecordSaveId, laborRecordStartedAtUtc, {
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
      registration: "N208LR",
    });
    const laborRecordRefreshResult = await refreshStaffingMarket(backend, laborRecordSaveId, laborRecordStartedAtUtc, "bootstrap");
    assert.equal(laborRecordRefreshResult.success, true);
    const laborRecordMarket = await backend.loadActiveStaffingMarket(laborRecordSaveId);
    assert.ok(laborRecordMarket);
    const laborRecordOffer = laborRecordMarket.offers.find((offer) => offer.employmentModel === "contract_hire");
    assert.ok(laborRecordOffer);
    const laborRecordHireResult = await backend.dispatch({
      commandId: `cmd_${laborRecordSaveId}_hire_contract_labor_record`,
      saveId: laborRecordSaveId,
      commandName: "ActivateStaffingPackage",
      issuedAtUtc: laborRecordStartedAtUtc,
      actorType: "player",
      payload: {
        laborCategory: laborRecordOffer.laborCategory,
        employmentModel: laborRecordOffer.employmentModel,
        qualificationGroup: laborRecordOffer.qualificationGroup,
        coverageUnits: laborRecordOffer.coverageUnits,
        fixedCostAmount: laborRecordOffer.fixedCostAmount,
        variableCostRate: laborRecordOffer.variableCostRate,
        startsAtUtc: laborRecordOffer.startsAtUtc,
        endsAtUtc: laborRecordOffer.endsAtUtc,
        sourceOfferId: laborRecordOffer.staffingOfferId,
      },
    });
    assert.equal(laborRecordHireResult.success, true);
    const laborRecordStaffingState = await backend.loadStaffingState(laborRecordSaveId);
    assert.ok(laborRecordStaffingState?.namedPilots[0]);
    const laborRecordPilot = laborRecordStaffingState.namedPilots[0];
    const laborRecordFleetState = await backend.loadFleetState(laborRecordSaveId);
    const laborRecordAircraft = laborRecordFleetState?.aircraft.find((entry) => entry.registration === "N208LR");
    assert.ok(laborRecordAircraft);
    await saveAndCommitSchedule(backend, laborRecordSaveId, laborRecordStartedAtUtc, laborRecordAircraft.aircraftId, [
      {
        legType: "reposition",
        originAirportId: "KDEN",
        destinationAirportId: "KCOS",
        plannedDepartureUtc: "2026-03-16T15:00:00.000Z",
        plannedArrivalUtc: "2026-03-16T16:10:00.000Z",
        assignedQualificationGroup: laborRecordOffer.qualificationGroup,
      },
    ]);
    const laborRecordUsageAdvance = await backend.dispatch({
      commandId: `cmd_${laborRecordSaveId}_advance_usage`,
      saveId: laborRecordSaveId,
      commandName: "AdvanceTime",
      issuedAtUtc: laborRecordStartedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: "2026-03-16T17:10:00.000Z",
        stopConditions: ["target_time"],
      },
    });
    assert.equal(laborRecordUsageAdvance.success, true);
    const laborRecordReadyAdvance = await backend.dispatch({
      commandId: `cmd_${laborRecordSaveId}_advance_ready`,
      saveId: laborRecordSaveId,
      commandName: "AdvanceTime",
      issuedAtUtc: "2026-03-16T17:10:00.000Z",
      actorType: "player",
      payload: {
        targetTimeUtc: "2026-03-17T04:00:00.000Z",
        stopConditions: ["target_time"],
      },
    });
    assert.equal(laborRecordReadyAdvance.success, true);
    const laborRecordConvertResult = await backend.dispatch({
      commandId: `cmd_${laborRecordSaveId}_convert_contract_pilot`,
      saveId: laborRecordSaveId,
      commandName: "ConvertNamedPilotToDirectHire",
      issuedAtUtc: "2026-03-17T04:00:00.000Z",
      actorType: "player",
      payload: {
        namedPilotId: laborRecordPilot.namedPilotId,
      },
    });
    assert.equal(laborRecordConvertResult.success, true);
    const laborRecordSalaryAdvance = await backend.dispatch({
      commandId: `cmd_${laborRecordSaveId}_advance_salary`,
      saveId: laborRecordSaveId,
      commandName: "AdvanceTime",
      issuedAtUtc: "2026-03-17T04:00:00.000Z",
      actorType: "player",
      payload: {
        targetTimeUtc: "2026-04-17T05:00:00.000Z",
        stopConditions: ["target_time"],
      },
    });
    assert.equal(laborRecordSalaryAdvance.success, true);
    const laborRecordDismissResult = await backend.dispatch({
      commandId: `cmd_${laborRecordSaveId}_dismiss_labor_pilot`,
      saveId: laborRecordSaveId,
      commandName: "DismissNamedPilot",
      issuedAtUtc: "2026-04-17T05:00:00.000Z",
      actorType: "player",
      payload: {
        namedPilotId: laborRecordPilot.namedPilotId,
      },
    });
    assert.equal(laborRecordDismissResult.success, true);
  } finally {
    await backend.close();
  }

  const port = await allocatePort();
  server = await startUiServer(port);

  const pendingStaffingTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(pendingSaveId)}/tab/staffing`);
  assert.equal(pendingStaffingTab.tabId, "staffing");
  const pendingRow = extractFirstPilotRow(pendingStaffingTab.contentHtml);
  const pendingDetail = extractEmployeeDetail(pendingStaffingTab.contentHtml);
  assert.match(pendingRow.rowHtml, /pending/i);
  assert.doesNotMatch(pendingRow.rowHtml, />\s*ready\s*</i);
  assert.match(pendingDetail, /pending/i);
  assert.doesNotMatch(pendingDetail, />\s*ready\s*</i);
  assert.match(pendingDetail, /Not active yet|Starts/i);

  const activeStaffingTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(activeSaveId)}/tab/staffing`);
  assert.equal(activeStaffingTab.tabId, "staffing");
  const activeRow = extractFirstPilotRow(activeStaffingTab.contentHtml);
  const activeDetail = extractEmployeeDetail(activeStaffingTab.contentHtml);
  assert.match(activeRow.rowHtml, /ready/i);
  assert.doesNotMatch(activeRow.rowHtml, /pending/i);
  assert.match(activeDetail, /ready/i);
  assert.doesNotMatch(activeDetail, /Not active yet/i);

  const expiredStaffingTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(expiredSaveId)}/tab/staffing`);
  assert.equal(expiredStaffingTab.tabId, "staffing");
  const expiredRow = extractFirstPilotRow(expiredStaffingTab.contentHtml);
  const expiredDetail = extractEmployeeDetail(expiredStaffingTab.contentHtml);
  assert.match(expiredRow.rowHtml, /expired/i);
  assert.doesNotMatch(expiredRow.rowHtml, />\s*ready\s*</i);
  assert.match(expiredDetail, /expired/i);
  assert.doesNotMatch(expiredDetail, />\s*ready\s*</i);
  assert.match(expiredDetail, /No longer in active coverage|Contract ends/i);

  const contractStaffingTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(contractSaveId)}/tab/staffing`);
  assert.equal(contractStaffingTab.tabId, "staffing");
  assert.match(contractStaffingTab.contentHtml, /data-staffing-hire-search/);
  assert.match(contractStaffingTab.contentHtml, /data-staffing-hire-fit/);
  assert.match(contractStaffingTab.contentHtml, /data-staffing-hire-sort/);
  assert.match(contractStaffingTab.contentHtml, /data-staffing-hire-more-toggle/);
  assert.match(contractStaffingTab.contentHtml, /data-staffing-hire-path-filter/);
  assert.equal(contractStaffingTab.contentHtml.includes('data-staffing-candidate-path="both"'), true);
  assert.equal(contractStaffingTab.contentHtml.includes('data-staffing-candidate-path="direct"'), true);
  assert.equal(contractStaffingTab.contentHtml.includes('data-staffing-candidate-path="contract"'), true);
  const contractRow = extractFirstPilotRow(contractStaffingTab.contentHtml);
  const contractDetail = extractEmployeeDetail(contractStaffingTab.contentHtml);
  assert.match(contractRow.rowHtml, /contract hire/i);
  assert.match(contractDetail, /Convert to direct hire/i);
  assert.match(contractDetail, /Dismiss pilot/i);
  const contractPilotId = contractRow.pilotId;

  const convertResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(contractSaveId)}/actions/convert-pilot-to-direct-hire`, {
    tab: "staffing",
    saveId: contractSaveId,
    namedPilotId: contractPilotId,
  });
  assert.equal(convertResult.response.ok, true);
  assert.equal(convertResult.payload.success, true);
  assert.match(convertResult.payload.message ?? "", /Converted .* direct hire/i);
  assert.equal(convertResult.payload.tab.tabId, "staffing");
  const convertedDetail = extractEmployeeDetail(convertResult.payload.tab.contentHtml);
  assert.match(convertedDetail, /direct hire/i);
  assert.doesNotMatch(convertedDetail, /Convert to direct hire/i);

  const dismissConvertedResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(contractSaveId)}/actions/dismiss-pilot`, {
    tab: "staffing",
    saveId: contractSaveId,
    namedPilotId: contractPilotId,
  });
  assert.equal(dismissConvertedResult.response.ok, true);
  assert.equal(dismissConvertedResult.payload.success, true);
  assert.match(dismissConvertedResult.payload.message ?? "", /Dismissed .* active pilot coverage/i);
  const dismissedDetail = extractEmployeeDetail(dismissConvertedResult.payload.tab.contentHtml);
  assert.match(dismissedDetail, /cancelled/i);
  assert.doesNotMatch(dismissedDetail, /Dismiss pilot/i);

  const reservedStaffingTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(reservedSaveId)}/tab/staffing`);
  assert.equal(reservedStaffingTab.tabId, "staffing");
  const reservedDetail = extractEmployeeDetail(reservedStaffingTab.contentHtml);
  assert.match(reservedDetail, /reserved/i);
  assert.doesNotMatch(reservedDetail, /data-pilot-dismiss=/i);
  assert.match(reservedDetail, /Dismissal is unavailable while this pilot is reserved for scheduled work/i);

  const trainingStaffingTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(trainingSaveId)}/tab/staffing`);
  assert.equal(trainingStaffingTab.tabId, "staffing");
  const trainingDetail = extractEmployeeDetail(trainingStaffingTab.contentHtml);
  assert.match(trainingDetail, /training/i);
  assert.doesNotMatch(trainingDetail, /data-pilot-dismiss=/i);
  assert.match(trainingDetail, /Dismissal is unavailable while this pilot is in training/i);

  const contractReservedStaffingTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(contractReservedSaveId)}/tab/staffing`);
  assert.equal(contractReservedStaffingTab.tabId, "staffing");
  const contractReservedDetail = extractEmployeeDetail(contractReservedStaffingTab.contentHtml);
  assert.match(contractReservedDetail, /reserved/i);
  assert.doesNotMatch(contractReservedDetail, /data-pilot-convert-direct=/i);
  assert.match(contractReservedDetail, /Conversion is unavailable while this pilot is reserved for committed contract work/i);

  const contractFlyingStaffingTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(contractFlyingSaveId)}/tab/staffing`);
  assert.equal(contractFlyingStaffingTab.tabId, "staffing");
  const contractFlyingDetail = extractEmployeeDetail(contractFlyingStaffingTab.contentHtml);
  assert.match(contractFlyingDetail, /flying/i);
  assert.doesNotMatch(contractFlyingDetail, /data-pilot-convert-direct=/i);
  assert.match(contractFlyingDetail, /Conversion is unavailable while this pilot is flying committed contract work/i);

  const laborRecordStaffingTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(laborRecordSaveId)}/tab/staffing`);
  assert.equal(laborRecordStaffingTab.tabId, "staffing");
  const laborRecordDetail = extractEmployeeDetail(laborRecordStaffingTab.contentHtml);
  assert.match(laborRecordDetail, /Labor record/i);
  assert.match(laborRecordDetail, /Contract engagement fee/i);
  assert.match(laborRecordDetail, /Contract flight hours billed/i);
  assert.match(laborRecordDetail, /Converted to direct hire/i);
  assert.match(laborRecordDetail, /Salary collected/i);
  assert.match(laborRecordDetail, /Dismissed from active coverage/i);
} finally {
  await Promise.allSettled([
    server?.stop(),
  ]);
  await removeWorkspaceSave(pendingSaveId);
  await removeWorkspaceSave(activeSaveId);
  await removeWorkspaceSave(expiredSaveId);
  await removeWorkspaceSave(contractSaveId);
  await removeWorkspaceSave(reservedSaveId);
  await removeWorkspaceSave(trainingSaveId);
  await removeWorkspaceSave(contractReservedSaveId);
  await removeWorkspaceSave(contractFlyingSaveId);
  await removeWorkspaceSave(laborRecordSaveId);
}
