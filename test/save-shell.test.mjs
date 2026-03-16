import assert from "node:assert/strict";

import {
  createCompanySave,
  createTestHarness,
  uniqueSaveId,
  acquireAircraft,
  activateStaffingPackage,
} from "./helpers/flightline-testkit.mjs";
import { buildBootstrapPayload, buildTabPayload, normalizeTab } from "../dist/ui/save-shell-fragments.js";

const renderers = {
  renderCreateCompany() {
    return "<div>create-company</div>";
  },
  renderOverview() {
    return "<div>overview</div>";
  },
  renderAircraft() {
    return "<div data-aircraft-tab-host></div>";
  },
  renderStaffing() {
    return "<div>staffing</div>";
  },
  renderDispatch() {
    return "<div>dispatch</div>";
  },
  renderActivity() {
    return "<div>activity</div>";
  },
  renderContractsHost() {
    return "<div data-contracts-host></div>";
  },
};

const harness = await createTestHarness("flightline-shell");
const { backend } = harness;

try {
  assert.equal(normalizeTab("aircraft"), "aircraft");
  assert.equal(normalizeTab("bogus"), "dashboard");
  assert.equal(normalizeTab(undefined), "dashboard");

  {
    const saveId = uniqueSaveId("shell_empty");
    const startedAtUtc = "2026-03-16T13:00:00.000Z";
    await backend.dispatch({
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

    const bootstrap = await buildBootstrapPayload(backend, saveId, "dashboard");
    assert.ok(bootstrap);
    assert.equal(bootstrap.shell.hasCompany, false);
    assert.equal(bootstrap.shell.title, `Save ${saveId}`);
    assert.equal(bootstrap.shell.tabCounts.dashboard, "setup");

    const aircraftTab = await buildTabPayload(backend, saveId, "aircraft", renderers);
    assert.ok(aircraftTab);
    assert.equal(aircraftTab.contentHtml, "<div>create-company</div>");
    assert.equal(aircraftTab.aircraftPayload ?? null, null);
  }

  {
    const saveId = uniqueSaveId("shell_live");
    const startedAtUtc = await createCompanySave(backend, saveId);
    await acquireAircraft(backend, saveId, startedAtUtc, { registration: "N208SH" });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 2,
      fixedCostAmount: 12_000,
    });

    const bootstrap = await buildBootstrapPayload(backend, saveId, "dashboard");
    assert.ok(bootstrap);
    assert.equal(bootstrap.shell.hasCompany, true);
    assert.equal(bootstrap.shell.saveId, saveId);
    assert.equal(bootstrap.shell.tabCounts.aircraft, "1/1");
    assert.equal(bootstrap.shell.tabCounts.staffing, "2");
    assert.equal(bootstrap.shell.metrics.some((metric) => metric.label === "Fleet" && metric.value === "1/1"), true);

    const aircraftTab = await buildTabPayload(backend, saveId, "aircraft", renderers);
    assert.ok(aircraftTab);
    assert.equal(aircraftTab.tabId, "aircraft");
    assert.equal(aircraftTab.contentHtml.includes("data-aircraft-tab-host"), true);
    assert.ok(aircraftTab.aircraftPayload);
    assert.equal(aircraftTab.aircraftPayload.aircraft.length, 1);
    assert.equal(aircraftTab.aircraftPayload.summaryCards.length, 4);

    const contractsTab = await buildTabPayload(backend, saveId, "contracts", renderers);
    assert.ok(contractsTab);
    assert.equal(contractsTab.tabId, "contracts");
    assert.ok(contractsTab.contractsPayload);
    assert.equal(contractsTab.contentHtml.includes("data-contracts-host"), true);

    const dispatchTab = await buildTabPayload(backend, saveId, "dispatch", renderers);
    assert.ok(dispatchTab);
    assert.equal(dispatchTab.tabId, "dispatch");
    assert.equal(dispatchTab.contentHtml, "<div>dispatch</div>");
    assert.equal(dispatchTab.aircraftPayload ?? null, null);
  }
} finally {
  await harness.cleanup();
}
