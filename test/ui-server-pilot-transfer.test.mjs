/*
 * Focused UI server coverage for the home-return shortcut.
 * This keeps the common off-base return flow isolated from the broader dispatch smoke.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  dispatchOrThrow,
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

async function getResponse(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.ok, true, `Expected GET ${path} to succeed, received ${response.status}.`);
  return response;
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

function extractFirstSurfaceSrc(html, surface) {
  const match = html.match(new RegExp(`<img[^>]*(?:src="([^"]+)"[^>]*data-staff-portrait-surface="${surface}"|data-staff-portrait-surface="${surface}"[^>]*src="([^"]+)")`, "i"));
  const src = match?.[1] ?? match?.[2];
  assert.ok(src, `Expected portrait surface ${surface} to be present.`);
  return src;
}

function extractRowPortrait(html, rowAttribute, surface) {
  const rowMatch = html.match(new RegExp(`<tr[^>]*${rowAttribute}="([^"]+)"[^>]*>([\\s\\S]*?)<\\/tr>`, "i"));
  assert.ok(rowMatch?.[1], `Expected row ${rowAttribute} to be present.`);
  const portraitMatch = rowMatch[2].match(new RegExp(`<img[^>]*(?:src="([^"]+)"[^>]*data-staff-portrait-surface="${surface}"|data-staff-portrait-surface="${surface}"[^>]*src="([^"]+)")`, "i"));
  const src = portraitMatch?.[1] ?? portraitMatch?.[2];
  assert.ok(src, `Expected row portrait ${surface} to be present for ${rowAttribute}.`);
  return {
    id: rowMatch[1],
    src,
  };
}

const zeroSaveId = uniqueSaveId("ui_staff_zero");
const saveId = uniqueSaveId("ui_http_transfer");
let server = null;

try {
  const backend = await createWorkspaceBackend();

  try {
    await createCompanySave(backend, zeroSaveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      displayName: `UI Staff Zero ${zeroSaveId}`,
      startingCashAmount: 3_500_000,
    });

    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T12:00:00.000Z",
      displayName: `UI HTTP Transfer ${saveId}`,
      startingCashAmount: 50_000_000,
    });

    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N208UT",
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 12_000,
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState);
    const aircraft = fleetState.aircraft.find((entry) => entry.registration === "N208UT");
    assert.ok(aircraft);

    await saveAndCommitSchedule(
      backend,
      saveId,
      startedAtUtc,
      aircraft.aircraftId,
      [
        {
          legType: "reposition",
          originAirportId: "KDEN",
          destinationAirportId: "KCOS",
          plannedDepartureUtc: "2026-03-16T13:00:00.000Z",
          plannedArrivalUtc: "2026-03-16T14:10:00.000Z",
        },
      ],
    );

    await dispatchOrThrow(backend, {
      commandId: `cmd_${saveId}_advance_ready`,
      saveId,
      commandName: "AdvanceTime",
      issuedAtUtc: startedAtUtc,
      actorType: "player",
      payload: {
        targetTimeUtc: "2026-03-17T00:30:00.000Z",
      },
    });
  } finally {
    await backend.close();
  }

  const port = await allocatePort();
  server = await startUiServer(port);

  const zeroStateTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(zeroSaveId)}/tab/staffing`);
  assert.equal(zeroStateTab.tabId, "staffing");
  assert.equal(zeroStateTab.contentHtml.includes('data-staffing-tab-host'), true);
  assert.equal(zeroStateTab.contentHtml.includes('data-staffing-default-view="hire"'), true);
  assert.equal(zeroStateTab.contentHtml.includes('data-staffing-workspace-tab="employees"'), true);
  assert.equal(zeroStateTab.contentHtml.includes('data-staffing-workspace-tab="hire"'), true);
  assert.equal(zeroStateTab.contentHtml.includes("Pilot Roster"), true);
  assert.equal(zeroStateTab.contentHtml.includes("data-staffing-roster-empty"), true);
  assert.equal(zeroStateTab.contentHtml.includes("Hire Staff"), true);
  assert.equal(zeroStateTab.contentHtml.includes("Hire an individual pilot candidate to create the first named roster entry."), true);
  assert.equal(zeroStateTab.contentHtml.includes("data-pilot-candidate-market"), true);
  assert.equal(zeroStateTab.contentHtml.includes('data-staffing-detail-panel="employees"'), true);
  assert.equal(zeroStateTab.contentHtml.includes('data-staffing-detail-panel="hire"'), true);
  assert.equal(zeroStateTab.contentHtml.includes("data-staffing-hire-overlay"), true);
  assert.equal(zeroStateTab.contentHtml.includes('data-staffing-detail-body="hire"'), true);
  assert.equal(zeroStateTab.contentHtml.includes('data-staffing-scroll-region="hire:list"'), true);
  assert.equal(zeroStateTab.contentHtml.includes('data-staffing-scroll-region="hire:detail"'), true);
  assert.equal(zeroStateTab.contentHtml.includes("<th>Pilot</th>"), true);
  assert.equal(zeroStateTab.contentHtml.includes("<th>Certifications</th>"), true);
  assert.equal(zeroStateTab.contentHtml.includes("<th>Base</th>"), true);
  assert.equal(zeroStateTab.contentHtml.includes("<th>Cost</th>"), true);
  assert.equal(zeroStateTab.contentHtml.includes("SEPL"), true);
  assert.equal(zeroStateTab.contentHtml.includes("<th>Fit</th>"), false);
  assert.equal(zeroStateTab.contentHtml.includes("Activate Staffing"), false);
  assert.equal(zeroStateTab.contentHtml.includes("available soon"), false);
  assert.equal(zeroStateTab.contentHtml.includes("Coverage Summary"), false);
  assert.equal(zeroStateTab.contentHtml.includes("Packages"), false);
  assert.equal(zeroStateTab.contentHtml.includes("Coverage posture"), true);
  assert.equal(zeroStateTab.contentHtml.includes("Support coverage"), true);
  const zeroCandidatePortrait = extractRowPortrait(zeroStateTab.contentHtml, "data-pilot-candidate-row", "hire-row");
  const zeroCandidateDetailPortrait = extractFirstSurfaceSrc(zeroStateTab.contentHtml, "hire-detail");
  assert.equal(zeroCandidatePortrait.src.startsWith("/assets/staff-portraits/"), true);
  assert.equal(zeroCandidatePortrait.src, zeroCandidateDetailPortrait);
  const zeroPortraitResponse = await getResponse(server.baseUrl, zeroCandidatePortrait.src);
  assert.equal(zeroPortraitResponse.headers.get("content-type"), "image/svg+xml; charset=utf-8");
  assert.equal((await zeroPortraitResponse.text()).includes("<svg"), true);
  const zeroCandidateMatch = zeroStateTab.contentHtml.match(/data-pilot-candidate-hire="([^"]+)"/);
  assert.ok(zeroCandidateMatch?.[1]);
  assert.equal(zeroCandidateMatch[1], zeroCandidatePortrait.id);
  assert.equal(zeroStateTab.contentHtml.indexOf("Pilot Roster") < zeroStateTab.contentHtml.indexOf("Hire Staff"), true);

  const zeroHireResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(zeroSaveId)}/actions/hire-pilot-candidate`, {
    tab: "staffing",
    saveId: zeroSaveId,
    staffingOfferId: zeroCandidateMatch[1],
  });
  assert.equal(zeroHireResult.response.ok, true);
  assert.equal(zeroHireResult.payload.success, true);
  assert.equal(zeroHireResult.payload.tab.tabId, "staffing");
  assert.equal(zeroHireResult.payload.tab.contentHtml.includes("data-staffing-pilot-row"), true);
  assert.equal(zeroHireResult.payload.tab.contentHtml.includes("No pilot roster yet."), false);
  const hiredEmployeePortrait = extractRowPortrait(zeroHireResult.payload.tab.contentHtml, "data-staffing-pilot-row", "employees-row");
  const hiredEmployeeDetailPortrait = extractFirstSurfaceSrc(zeroHireResult.payload.tab.contentHtml, "employees-detail");
  assert.equal(hiredEmployeePortrait.src, zeroCandidatePortrait.src);
  assert.equal(hiredEmployeeDetailPortrait, zeroCandidatePortrait.src);

  const staffingTab = await getJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/tab/staffing`);
  assert.equal(staffingTab.tabId, "staffing");
  assert.equal(staffingTab.contentHtml.includes('data-staffing-default-view="employees"'), true);
  assert.equal(staffingTab.contentHtml.includes("Pilot Roster"), true);
  assert.equal(staffingTab.contentHtml.includes("Hire Staff"), true);
  assert.equal(staffingTab.contentHtml.includes("data-staffing-hire-overlay"), true);
  assert.equal(staffingTab.contentHtml.includes('data-staffing-detail-body="employees"'), true);
  assert.equal(staffingTab.contentHtml.includes('data-staffing-scroll-region="employees:list"'), true);
  assert.equal(staffingTab.contentHtml.includes('data-staffing-scroll-region="employees:detail"'), true);
  assert.equal(staffingTab.contentHtml.includes('data-staff-portrait-surface="hire-row"'), true);
  assert.equal(staffingTab.contentHtml.includes('data-staff-portrait-surface="employees-row"'), true);
  assert.equal(staffingTab.contentHtml.includes('data-staff-portrait-surface="hire-detail"'), true);
  assert.equal(staffingTab.contentHtml.includes('data-staff-portrait-surface="employees-detail"'), true);
  const homeReturnMatch = staffingTab.contentHtml.match(/data-pilot-home-return-start="([^"]+)"/);
  assert.ok(homeReturnMatch?.[1]);
  assert.equal(staffingTab.contentHtml.includes("At KCOS"), true);
  assert.equal(staffingTab.contentHtml.includes('value="KDEN"'), true);
  assert.equal(staffingTab.contentHtml.includes("Return home"), true);

  const transferResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/actions/start-pilot-transfer`, {
    tab: "staffing",
    saveId,
    namedPilotId: homeReturnMatch[1],
    destinationAirportId: "KDEN",
  });
  assert.equal(transferResult.response.ok, true);
  assert.equal(transferResult.payload.success, true);
  assert.equal(transferResult.payload.tab.tabId, "staffing");
  assert.equal(transferResult.payload.tab.contentHtml.includes("Traveling to KDEN"), true);
} finally {
  await Promise.allSettled([
    server?.stop(),
  ]);
  await removeWorkspaceSave(zeroSaveId);
  await removeWorkspaceSave(saveId);
}
