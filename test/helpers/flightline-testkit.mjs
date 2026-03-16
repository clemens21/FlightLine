import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { FlightLineBackend } from "../../dist/index.js";

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
      await Promise.allSettled([
        backend.close(),
        rm(saveDirectoryPath, { recursive: true, force: true }),
      ]);
    },
  };
}

export function uniqueSaveId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    startingCashAmount = 3_500_000,
  } = {},
) {
  await dispatchOrThrow(backend, {
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

  await dispatchOrThrow(backend, {
    commandId: `cmd_${saveId}_company`,
    saveId,
    commandName: "CreateCompany",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      displayName,
      starterAirportId,
      startingCashAmount,
    },
  });

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
  const candidateOffers = board.offers.filter((offer) => {
    const windowHours = (new Date(offer.latestCompletionUtc).getTime() - new Date(offer.earliestStartUtc).getTime()) / 3_600_000;
    const fitsPassengers = offer.passengerCount === undefined || offer.passengerCount <= effectivePassengerCapacity(aircraft);
    const fitsCargo = offer.cargoWeightLb === undefined || offer.cargoWeightLb <= effectiveCargoCapacityLb(aircraft);
    const origin = airportReference.findAirport(offer.originAirportId);
    const destination = airportReference.findAirport(offer.destinationAirportId);
    const distanceNm = origin && destination ? haversineDistanceNm(origin, destination) : Number.POSITIVE_INFINITY;
    return windowHours >= 8 && fitsPassengers && fitsCargo && distanceNm <= aircraft.rangeNm * 0.92;
  });

  return candidateOffers.find((offer) => offer.originAirportId === homeAirportId)
    ?? candidateOffers.find((offer) => {
      const fitBucket = typeof offer.explanationMetadata?.fit_bucket === "string" ? offer.explanationMetadata.fit_bucket : undefined;
      return fitBucket === "flyable_now";
    })
    ?? candidateOffers[0]
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
