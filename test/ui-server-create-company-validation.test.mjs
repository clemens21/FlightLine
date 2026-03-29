/*
 * Focused UI-server coverage for create-company startup cash handling.
 * The shell should present fixed startup capital and reject tampered cash inputs in-band.
 */

import assert from "node:assert/strict";

import { startingCashAmountForDifficulty } from "../dist/domain/save-runtime/difficulty-profile.js";
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
      difficultyProfile: "hard",
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
const easyMismatchSaveId = uniqueSaveId("ui_company_cash_easy_mismatch");
const easyCreateSaveId = uniqueSaveId("ui_company_easy");
const invalidDifficultySaveId = uniqueSaveId("ui_company_invalid_difficulty");
const malformedCashSaveId = uniqueSaveId("ui_company_malformed_cash");
let server = null;

try {
  const backend = await createWorkspaceBackend();
  try {
    await createBareSave(backend, highCashSaveId, "2026-03-16T12:00:00.000Z");
    await createBareSave(backend, easyMismatchSaveId, "2026-03-16T12:05:00.000Z");
    await createBareSave(backend, easyCreateSaveId, "2026-03-16T12:10:00.000Z");
    await createBareSave(backend, invalidDifficultySaveId, "2026-03-16T12:15:00.000Z");
    await createBareSave(backend, malformedCashSaveId, "2026-03-16T12:20:00.000Z");
  } finally {
    await backend.close();
  }

  const port = await allocatePort();
  server = await startUiServer(port);

  const shellHtml = await getHtml(server.baseUrl, `/save/${encodeURIComponent(highCashSaveId)}?tab=dashboard`);
  assert.match(shellHtml, /save-shell-client\.js/i);

  const dashboardTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(highCashSaveId)}/tab/dashboard`);
  assert.equal(dashboardTab.tabId, "dashboard");
  assert.match(dashboardTab.contentHtml, /Choose your startup profile/i);
  assert.match(dashboardTab.contentHtml, /name="difficultyProfile"/i);
  assert.match(dashboardTab.contentHtml, /Easy/i);
  assert.match(dashboardTab.contentHtml, /Medium/i);
  assert.match(dashboardTab.contentHtml, /Hard/i);
  assert.doesNotMatch(dashboardTab.contentHtml, /name="startingCashAmount"/i);

  const highCashResult = await postFormJson(
    server.baseUrl,
    `/api/save/${encodeURIComponent(highCashSaveId)}/actions/create-company`,
    {
      tab: "dashboard",
      saveId: highCashSaveId,
      displayName: "Tampered High Cash Air",
      starterAirportId: "KDEN",
      difficultyProfile: "hard",
      startingCashAmount: "175000000",
    },
  );
  assert.equal(highCashResult.response.ok, false);
  assert.equal(highCashResult.payload.success, false);
  assert.match(highCashResult.payload.error ?? "", /Starting cash is fixed at 3500000 for hard difficulty/i);

  const easyMismatchResult = await postFormJson(
    server.baseUrl,
    `/api/save/${encodeURIComponent(easyMismatchSaveId)}/actions/create-company`,
    {
      tab: "dashboard",
      saveId: easyMismatchSaveId,
      displayName: "Tampered Easy Cash Air",
      starterAirportId: "KDEN",
      difficultyProfile: "easy",
      startingCashAmount: "3500000",
    },
  );
  assert.equal(easyMismatchResult.response.ok, false);
  assert.equal(easyMismatchResult.payload.success, false);
  assert.match(easyMismatchResult.payload.error ?? "", /Starting cash is fixed at 4500000 for easy difficulty/i);

  const easyCreateResult = await postFormJson(
    server.baseUrl,
    `/api/save/${encodeURIComponent(easyCreateSaveId)}/actions/create-company`,
    {
      tab: "dashboard",
      saveId: easyCreateSaveId,
      displayName: "Easy Startup Air",
      starterAirportId: "KDEN",
      difficultyProfile: "easy",
      startingCashAmount: String(startingCashAmountForDifficulty("easy")),
    },
  );
  assert.equal(easyCreateResult.response.ok, true);
  assert.equal(easyCreateResult.payload.success, true);

  const invalidDifficultyResult = await postFormJson(
    server.baseUrl,
    `/api/save/${encodeURIComponent(invalidDifficultySaveId)}/actions/create-company`,
    {
      tab: "dashboard",
      saveId: invalidDifficultySaveId,
      displayName: "Unknown Difficulty Air",
      starterAirportId: "KDEN",
      difficultyProfile: "nightmare",
      startingCashAmount: String(startingCashAmountForDifficulty("hard")),
    },
  );
  assert.equal(invalidDifficultyResult.response.ok, false);
  assert.equal(invalidDifficultyResult.payload.success, false);
  assert.match(invalidDifficultyResult.payload.error ?? "", /Difficulty profile nightmare is not supported/i);

  const malformedCashResult = await postFormJson(
    server.baseUrl,
    `/api/save/${encodeURIComponent(malformedCashSaveId)}/actions/create-company`,
    {
      tab: "dashboard",
      saveId: malformedCashSaveId,
      displayName: "Malformed Cash Air",
      starterAirportId: "KDEN",
      difficultyProfile: "hard",
      startingCashAmount: "not-a-number",
    },
  );
  assert.equal(malformedCashResult.response.ok, false);
  assert.equal(malformedCashResult.payload.success, false);
  assert.match(malformedCashResult.payload.error ?? "", /Starting cash must be a finite number/i);
} finally {
  await Promise.allSettled([
    server?.stop(),
  ]);
  await Promise.all([
    removeWorkspaceSave(highCashSaveId),
    removeWorkspaceSave(easyMismatchSaveId),
    removeWorkspaceSave(easyCreateSaveId),
    removeWorkspaceSave(invalidDifficultySaveId),
    removeWorkspaceSave(malformedCashSaveId),
  ]);
}
