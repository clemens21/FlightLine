/*
 * Focused UI-server coverage for create-company startup cash handling.
 * The shell should present fixed startup capital and reject tampered cash inputs in-band.
 */

import assert from "node:assert/strict";

import { uniqueSaveId } from "./helpers/flightline-testkit.mjs";
import {
  allocatePort,
  createWorkspaceBackend,
  removeWorkspaceSave,
  startUiServer,
} from "./helpers/ui-testkit.mjs";

async function createBareSave(backend, saveId, startedAtUtc) {
  const result = await backend.dispatch({
    commandId: `cmd_${saveId}_save`,
    saveId,
    commandName: "CreateSaveGame",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      worldSeed: `seed_${saveId}`,
      difficultyProfile: "standard",
      startTimeUtc: startedAtUtc,
    },
  });

  assert.equal(result.success, true, result.hardBlockers?.[0] ?? `Expected CreateSaveGame to succeed for ${saveId}.`);
}

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

const highCashSaveId = uniqueSaveId("ui_company_cash_high");
const nanCashSaveId = uniqueSaveId("ui_company_cash_nan");
let server = null;

try {
  const backend = await createWorkspaceBackend();
  try {
    await createBareSave(backend, highCashSaveId, "2026-03-16T12:00:00.000Z");
    await createBareSave(backend, nanCashSaveId, "2026-03-16T12:05:00.000Z");
  } finally {
    await backend.close();
  }

  const port = await allocatePort();
  server = await startUiServer(port);

  const shellHtml = await getHtml(server.baseUrl, `/save/${encodeURIComponent(highCashSaveId)}?tab=dashboard`);
  assert.match(shellHtml, /save-shell-client\.js/i);

  const dashboardTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(highCashSaveId)}/tab/dashboard`);
  assert.equal(dashboardTab.tabId, "dashboard");
  assert.match(dashboardTab.contentHtml, /Starting Capital/i);
  assert.match(dashboardTab.contentHtml, /\$3,500,000/);
  assert.doesNotMatch(dashboardTab.contentHtml, /name="startingCashAmount"/i);

  const highCashResult = await postFormJson(
    server.baseUrl,
    `/api/save/${encodeURIComponent(highCashSaveId)}/actions/create-company`,
    {
      tab: "dashboard",
      saveId: highCashSaveId,
      displayName: "Tampered High Cash Air",
      starterAirportId: "KDEN",
      startingCashAmount: "175000000",
    },
  );
  assert.equal(highCashResult.response.ok, false);
  assert.equal(highCashResult.payload.success, false);
  assert.match(highCashResult.payload.error ?? "", /Starting cash is fixed at 3500000/i);

  const nanCashResult = await postFormJson(
    server.baseUrl,
    `/api/save/${encodeURIComponent(nanCashSaveId)}/actions/create-company`,
    {
      tab: "dashboard",
      saveId: nanCashSaveId,
      displayName: "Tampered NaN Cash Air",
      starterAirportId: "KDEN",
      startingCashAmount: "not_a_number",
    },
  );
  assert.equal(nanCashResult.response.ok, false);
  assert.equal(nanCashResult.payload.success, false);
  assert.match(nanCashResult.payload.error ?? "", /Starting cash must be a finite number/i);
} finally {
  await Promise.allSettled([
    server?.stop(),
  ]);
  await Promise.all([
    removeWorkspaceSave(highCashSaveId),
    removeWorkspaceSave(nanCashSaveId),
  ]);
}
