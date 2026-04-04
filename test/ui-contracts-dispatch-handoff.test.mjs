/*
 * Browser coverage for the contracts direct-dispatch handoff.
 */

import assert from "node:assert/strict";

import {
  acquireAircraft,
  activateStaffingPackage,
  createCompanySave,
  refreshContractBoard,
  uniqueSaveId,
} from "./helpers/flightline-testkit.mjs";
import {
  allocatePort,
  createWorkspaceBackend,
  removeWorkspaceSave,
  setContractsBoardBrowserTestMode,
  startUiServer,
} from "./helpers/ui-testkit.mjs";
import {
  clickUi,
  launchBrowser,
  waitForShellTitle,
} from "./helpers/playwright-ui-testkit.mjs";
import { loadContractsViewPayload } from "../dist/ui/contracts-view.js";

const saveId = uniqueSaveId("ui_contract_dispatch_handoff");
const displayName = `Contracts Dispatch Handoff ${saveId}`;

let server = null;
let browser = null;
const restoreContractsBoardBrowserTestMode = setContractsBoardBrowserTestMode();

try {
  const backend = await createWorkspaceBackend();
  try {
    const startedAtUtc = await createCompanySave(backend, saveId, {
      startedAtUtc: "2026-03-16T13:00:00.000Z",
      displayName,
      startingCashAmount: 500_000_000,
    });

    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N208HD",
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N20CHD",
      aircraftModelId: "cessna_208b_grand_caravan_ex_cargo",
    });
    await acquireAircraft(backend, saveId, startedAtUtc, {
      registration: "N20DHD",
      aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    });
    await activateStaffingPackage(backend, saveId, startedAtUtc, {
      laborCategory: "pilot",
      qualificationGroup: "single_turboprop_utility",
      coverageUnits: 3,
      fixedCostAmount: 12_000,
    });
    await refreshContractBoard(backend, saveId, startedAtUtc);

    const board = await backend.loadActiveContractBoard(saveId);
    assert.ok(board);
    const candidateOffer = board.offers.find((offer) => offer.offerStatus === "available");
    assert.ok(candidateOffer, "Expected at least one available contract offer.");

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      context.saveDatabase.run(
        `UPDATE contract_offer
         SET origin_airport_id = $origin_airport_id,
             destination_airport_id = $destination_airport_id,
             volume_type = $volume_type,
             passenger_count = $passenger_count,
             cargo_weight_lb = $cargo_weight_lb,
             earliest_start_utc = $earliest_start_utc,
             latest_completion_utc = $latest_completion_utc,
             payout_amount = $payout_amount
         WHERE contract_offer_id = $contract_offer_id`,
        {
          $origin_airport_id: "KDEN",
          $destination_airport_id: "KCOS",
          $volume_type: "passenger",
          $passenger_count: 6,
          $cargo_weight_lb: null,
          $earliest_start_utc: "2026-03-16T15:00:00.000Z",
          $latest_completion_utc: "2026-03-16T19:00:00.000Z",
          $payout_amount: 18_500,
          $contract_offer_id: candidateOffer.contractOfferId,
        },
      );
      await context.saveDatabase.persist();
    });

    const contractsPayload = await loadContractsViewPayload(
      backend,
      backend.getAirportReference(),
      saveId,
      "scheduled",
    );
    assert.ok(contractsPayload);
    const eligibleOffer = contractsPayload.offers.find(
      (offer) => offer.contractOfferId === candidateOffer.contractOfferId,
    );
    assert.ok(eligibleOffer);
    assert.equal(eligibleOffer.directDispatchEligible, true);

    const port = await allocatePort();
    server = await startUiServer(port);
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.goto(`${server.baseUrl}/save/${encodeURIComponent(saveId)}?tab=contracts`, {
      waitUntil: "domcontentloaded",
    });
    await waitForShellTitle(page, displayName);
    await page.waitForFunction(() => document.querySelectorAll(".contracts-board-table tbody tr").length > 0);

    await clickUi(page.locator(`[data-select-offer-row='${eligibleOffer.contractOfferId}']`).first());
    await page.waitForFunction((expectedOfferId) => {
      const pane = document.querySelector(`[data-accept-selected-pane="${expectedOfferId}"]`);
      return pane instanceof HTMLElement && pane.getAttribute("aria-busy") !== "true";
    }, eligibleOffer.contractOfferId);
    await clickUi(page.locator(`[data-accept-selected-pane='${eligibleOffer.contractOfferId}']`).first());
    await page.waitForFunction(() => document.querySelector(".contracts-next-step")?.textContent?.includes("Accept and dispatch"));
    assert.equal(await page.locator(".contracts-next-step [data-next-step-dispatch]").isEnabled(), true);

    const companyContracts = await backend.loadCompanyContracts(saveId);
    const acceptedCompanyContract = companyContracts?.contracts.find(
      (contract) => contract.originContractOfferId === eligibleOffer.contractOfferId,
    );
    assert.ok(acceptedCompanyContract, "Expected the accepted contract to resolve to a company contract id.");

    await clickUi(page.locator(".contracts-next-step [data-next-step-dispatch]"));
    await page.waitForFunction((expectedCompanyContractId) => {
      const url = new URL(window.location.href);
      return url.searchParams.get("tab") === "dispatch"
        && url.searchParams.get("dispatchSourceMode") === "accepted_contracts"
        && url.searchParams.get("dispatchSourceId") === expectedCompanyContractId;
    }, acceptedCompanyContract.companyContractId);

    await page.waitForFunction(
      (expectedCompanyContractId) => document.querySelector("[data-dispatch-source-item][aria-pressed='true']")?.getAttribute("data-dispatch-source-item") === expectedCompanyContractId,
      acceptedCompanyContract.companyContractId,
    );
    assert.equal(
      await page.locator("[data-dispatch-source-item][aria-pressed='true']").getAttribute("data-dispatch-source-item"),
      acceptedCompanyContract.companyContractId,
    );
  } finally {
    await backend.close();
  }
} finally {
  if (browser) {
    await browser.close();
  }
  if (server) {
    await server.stop();
  }
  await removeWorkspaceSave(saveId);
  restoreContractsBoardBrowserTestMode();
}
