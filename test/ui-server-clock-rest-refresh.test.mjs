/*
 * Regression coverage for clock-driven Staff tab refresh after a named pilot finishes rest.
 */

import assert from "node:assert/strict";

import {
  activateStaffingPackage,
  createCompanySave,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import {
  allocatePort,
  createWorkspaceBackend,
  removeWorkspaceSave,
  startUiServer,
} from "./helpers/ui-testkit.mjs";

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

const saveId = uniqueSaveId("ui_clock_rest_refresh");
let server = null;

try {
  const backend = await createWorkspaceBackend();
  try {
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T13:00:00.000Z",
      displayName: `UI Clock Rest Refresh ${saveId}`,
      startingCashAmount: 3_500_000,
    });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      employmentModel: "direct_hire",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 1,
      fixedCostAmount: 4_200,
    });

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      const companyContext = await backend.loadCompanyContext(saveId);
      assert.ok(companyContext);
      const pilotRow = context.saveDatabase.getOne(
        `SELECT named_pilot_id AS namedPilotId
         FROM named_pilot
         WHERE company_id = $company_id
         ORDER BY roster_slot_number ASC
         LIMIT 1`,
        { $company_id: companyContext.companyId },
      );
      assert.ok(pilotRow?.namedPilotId);
      context.saveDatabase.run(
        `UPDATE named_pilot
         SET resting_until_utc = $resting_until_utc,
             updated_at_utc = $updated_at_utc
         WHERE named_pilot_id = $named_pilot_id`,
        {
          $resting_until_utc: "2026-03-16T13:30:00.000Z",
          $updated_at_utc: startedAtUtc,
          $named_pilot_id: pilotRow.namedPilotId,
        },
      );
      await context.saveDatabase.persist();
    });
  } finally {
    await backend.close();
  }

  const port = await allocatePort();
  server = await startUiServer(port);

  const restRefreshClockResult = await postFormJson(server.baseUrl, `/api/save/${encodeURIComponent(saveId)}/clock/tick`, {
    tab: "staffing",
    minutes: 60,
    selectedLocalDate: "2026-03-16",
  });
  assert.equal(restRefreshClockResult.response.ok, true);
  assert.equal(restRefreshClockResult.payload.success, true);
  assert.equal(restRefreshClockResult.payload.clock.currentTimeUtc, "2026-03-16T14:00:00.000Z");
  assert.equal(restRefreshClockResult.payload.tab.tabId, "staffing");

  const restRefreshRow = extractFirstPilotRow(restRefreshClockResult.payload.tab.contentHtml);
  const restRefreshDetail = extractEmployeeDetail(restRefreshClockResult.payload.tab.contentHtml);
  assert.match(restRefreshRow.rowHtml, /ready/i);
  assert.doesNotMatch(restRefreshRow.rowHtml, /resting/i);
  assert.match(restRefreshDetail, /ready/i);
  assert.doesNotMatch(restRefreshDetail, /resting/i);
} finally {
  await Promise.allSettled([
    server?.stop(),
  ]);
  await removeWorkspaceSave(saveId);
}
