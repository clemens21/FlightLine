/*
 * Provides reusable backend test helpers for save creation, fleet setup, staffing setup, board refreshes, and schedule commits.
 * Most tests use this kit to keep scenario setup compact and consistent.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { FlightLineBackend } from "../../dist/index.js";
import { startingCashAmountForDifficulty } from "../../dist/domain/save-runtime/difficulty-profile.js";
import { buildGeneratedSaveId } from "../../dist/ui/save-slot-files.js";

const startupStartingCashAmount = startingCashAmountForDifficulty("hard");
let saveIdSequence = 0;

function deriveFinancialPressureBand(currentCashAmount) {
  if (currentCashAmount < 250_000) {
    return "stressed";
  }

  if (currentCashAmount < 1_000_000) {
    return "tight";
  }

  return "stable";
}

export async function createTestHarness(prefix) {
  const saveDirectoryPath = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const airportDatabasePath = resolve(process.cwd(), "data", "airports", "flightline-airports.sqlite");
  const aircraftDatabasePath = resolve(process.cwd(), "data", "aircraft", "flightline-aircraft.sqlite");
  const backend = await FlightLineBackend.create({
    saveDirectoryPath,
    airportDatabasePath,
    aircraftDatabasePath,
  });

  return {
    saveDirectoryPath,
    airportDatabasePath,
    aircraftDatabasePath,
    backend,
    airportReference: backend.getAirportReference(),
    async cleanup() {
      await backend.close();
      await rm(saveDirectoryPath, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    },
  };
}

export function uniqueSaveId(prefix) {
  saveIdSequence += 1;
  return buildGeneratedSaveId(prefix, { suffix: String(saveIdSequence).padStart(3, "0") });
}

export async function dispatchOrThrow(backend, command) {
  const result = await backend.dispatch(command);
  assert.equal(
    result.success,
    true,
    result.hardBlockers?.[0] ?? `${command.commandName} failed for save ${command.saveId}.`,
  );
  return result;
}

export async function createCompanySave(
  backend,
  saveId,
  {
    startedAtUtc = "2026-03-16T13:00:00.000Z",
    displayName = `Test Carrier ${saveId}`,
    starterAirportId = "KDEN",
    difficultyProfile = "hard",
    startingCashAmount = startingCashAmountForDifficulty(difficultyProfile),
  } = {},
) {
  const canonicalStartingCashAmount = startingCashAmountForDifficulty(difficultyProfile);
  await dispatchOrThrow(backend, {
    commandId: `cmd_${saveId}_save`,
    saveId,
    commandName: "CreateSaveGame",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      worldSeed: `seed_${saveId}`,
      difficultyProfile,
      startTimeUtc: startedAtUtc,
    },
  });

  await dispatchOrThrow(backend, {
    commandId: `cmd_${saveId}_company`,
    saveId,
    commandName: "CreateCompany",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      displayName,
      starterAirportId,
      difficultyProfile,
      startingCashAmount: canonicalStartingCashAmount,
    },
  });

  if (startingCashAmount !== canonicalStartingCashAmount) {
    await backend.withExistingSaveDatabase(saveId, async (context) => {
      const companyRow = context.saveDatabase.getOne(
        "SELECT active_company_id AS companyId FROM save_game WHERE save_id = $save_id LIMIT 1",
        { $save_id: saveId },
      );

      assert.ok(companyRow?.companyId, `Expected save ${saveId} to have an active company after CreateCompany.`);

      context.saveDatabase.run(
        `UPDATE company_financial_state
         SET current_cash_amount = $current_cash_amount,
             financial_pressure_band = $financial_pressure_band,
             updated_at_utc = $updated_at_utc
         WHERE company_id = $company_id`,
        {
          $current_cash_amount: startingCashAmount,
          $financial_pressure_band: deriveFinancialPressureBand(startingCashAmount),
          $updated_at_utc: startedAtUtc,
          $company_id: companyRow.companyId,
        },
      );

      context.saveDatabase.run(
        `UPDATE ledger_entry
         SET amount = $amount
         WHERE company_id = $company_id
           AND entry_type = 'initial_capital'
           AND source_object_type = 'company'
           AND source_object_id = $company_id`,
        {
          $amount: startingCashAmount,
          $company_id: companyRow.companyId,
        },
      );

      await context.saveDatabase.persist();
    });
  }

  return startedAtUtc;
}

export async function acquireAircraft(
  backend,
  saveId,
  startedAtUtc,
  {
    aircraftModelId = "cessna_208b_grand_caravan_ex_passenger",
    deliveryAirportId = "KDEN",
    ownershipType = "owned",
    registration = "N208TS",
  } = {},
) {
  return dispatchOrThrow(backend, {
    commandId: `cmd_${saveId}_aircraft_${registration}`,
    saveId,
    commandName: "AcquireAircraft",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      aircraftModelId,
      deliveryAirportId,
      ownershipType,
      registration,
    },
  });
}

export async function activateStaffingPackage(
  backend,
  saveId,
  startedAtUtc,
  {
    laborCategory,
    employmentModel = "direct_hire",
    qualificationGroup,
    coverageUnits,
    fixedCostAmount,
    variableCostRate,
    baseAirportId,
    serviceRegionCode,
    startsAtUtc,
    endsAtUtc,
    sourceOfferId,
  },
) {
  return dispatchOrThrow(backend, {
    commandId: `cmd_${saveId}_${laborCategory}_${qualificationGroup}`,
    saveId,
    commandName: "ActivateStaffingPackage",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      laborCategory,
      employmentModel,
      qualificationGroup,
      coverageUnits,
      fixedCostAmount,
      variableCostRate,
      baseAirportId,
      serviceRegionCode,
      startsAtUtc,
      endsAtUtc,
      sourceOfferId,
    },
  });
}

export async function refreshContractBoard(backend, saveId, startedAtUtc, refreshReason = "bootstrap") {
  return dispatchOrThrow(backend, {
    commandId: `cmd_${saveId}_refresh_${refreshReason}`,
    saveId,
    commandName: "RefreshContractBoard",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      refreshReason,
    },
  });
}

export async function refreshStaffingMarket(backend, saveId, startedAtUtc, refreshReason = "bootstrap") {
  return dispatchOrThrow(backend, {
    commandId: `cmd_${saveId}_staffing_refresh_${refreshReason}`,
    saveId,
    commandName: "RefreshStaffingMarket",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      refreshReason,
    },
  });
}

export function haversineDistanceNm(origin, destination) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusNm = 3440.065;
  const deltaLatitude = toRadians(destination.latitudeDeg - origin.latitudeDeg);
  const deltaLongitude = toRadians(destination.longitudeDeg - origin.longitudeDeg);
  const latitudeOne = toRadians(origin.latitudeDeg);
  const latitudeTwo = toRadians(destination.latitudeDeg);
  const a =
    Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

export function estimateFlightMinutes(airportReference, originAirportId, destinationAirportId, cruiseSpeedKtas = 180) {
  const origin = airportReference.findAirport(originAirportId);
  const destination = airportReference.findAirport(destinationAirportId);

  if (!origin || !destination) {
    throw new Error(`Could not resolve route ${originAirportId} to ${destinationAirportId}.`);
  }

  return Math.ceil((haversineDistanceNm(origin, destination) / Math.max(cruiseSpeedKtas, 100)) * 60 + 30);
}

export function effectivePassengerCapacity(aircraft) {
  return aircraft.activeCabinSeats ?? aircraft.maxPassengers;
}

export function effectiveCargoCapacityLb(aircraft) {
  return Math.min(aircraft.activeCabinCargoCapacityLb ?? aircraft.maxCargoLb, aircraft.maxCargoLb);
}

export function pickFlyableOffer(board, aircraft, airportReference, homeAirportId = "KDEN") {
  const candidateOffers = board.offers
    .map((offer) => {
      const origin = airportReference.findAirport(offer.originAirportId);
      const destination = airportReference.findAirport(offer.destinationAirportId);
      const distanceNm = origin && destination ? haversineDistanceNm(origin, destination) : Number.POSITIVE_INFINITY;
      return { offer, distanceNm };
    })
    .filter(({ offer, distanceNm }) => {
    const windowHours = (new Date(offer.latestCompletionUtc).getTime() - new Date(offer.earliestStartUtc).getTime()) / 3_600_000;
    const fitsPassengers = offer.passengerCount === undefined || offer.passengerCount <= effectivePassengerCapacity(aircraft);
    const fitsCargo = offer.cargoWeightLb === undefined || offer.cargoWeightLb <= effectiveCargoCapacityLb(aircraft);
    return windowHours >= 8 && fitsPassengers && fitsCargo && distanceNm <= aircraft.rangeNm * 0.9;
    })
    .sort((left, right) => {
      const leftHomeOrigin = left.offer.originAirportId === homeAirportId ? 0 : 1;
      const rightHomeOrigin = right.offer.originAirportId === homeAirportId ? 0 : 1;
      if (leftHomeOrigin !== rightHomeOrigin) {
        return leftHomeOrigin - rightHomeOrigin;
      }

      if (left.distanceNm !== right.distanceNm) {
        return left.distanceNm - right.distanceNm;
      }

      return left.offer.contractOfferId.localeCompare(right.offer.contractOfferId);
    });

  const flyableNowOffers = candidateOffers.filter(({ offer }) => {
    const fitBucket = typeof offer.explanationMetadata?.fit_bucket === "string" ? offer.explanationMetadata.fit_bucket : undefined;
    return fitBucket === "flyable_now";
  });

  return flyableNowOffers[0]?.offer
    ?? candidateOffers[0]?.offer
    ?? null;
}

export async function saveAndCommitSchedule(
  backend,
  saveId,
  startedAtUtc,
  aircraftId,
  legs,
  scheduleKind = "operational",
) {
  const draftResult = await dispatchOrThrow(backend, {
    commandId: `cmd_${saveId}_draft_${aircraftId}`,
    saveId,
    commandName: "SaveScheduleDraft",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      aircraftId,
      scheduleKind,
      legs,
    },
  });

  const scheduleId = String(draftResult.metadata?.scheduleId ?? "");
  assert.ok(scheduleId, "Expected a draft schedule id.");

  await dispatchOrThrow(backend, {
    commandId: `cmd_${saveId}_commit_${aircraftId}`,
    saveId,
    commandName: "CommitAircraftSchedule",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      scheduleId,
    },
  });

  return scheduleId;
}
