/*
 * Focused UI-server coverage for pending and expired named-pilot roster truth.
 * This keeps the staffing status presentation isolated from the broader browser smoke suite.
 */

import assert from "node:assert/strict";

import {
  activateStaffingPackage,
  createCompanySave,
  refreshStaffingMarket,
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
} finally {
  await Promise.allSettled([
    server?.stop(),
  ]);
  await removeWorkspaceSave(pendingSaveId);
  await removeWorkspaceSave(activeSaveId);
  await removeWorkspaceSave(expiredSaveId);
}
