import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { FlightLineBackend } from "../dist/index.js";
import { applyAircraftTabViewState, buildAircraftTabPayload } from "../dist/ui/aircraft-tab-model.js";
import { buildTabPayload } from "../dist/ui/save-shell-fragments.js";

const saveDirectoryPath = await mkdtemp(join(tmpdir(), "flightline-aircraft-tab-"));
const airportDatabasePath = resolve(process.cwd(), "data", "airports", "flightline-airports.sqlite");
const aircraftDatabasePath = resolve(process.cwd(), "data", "aircraft", "flightline-aircraft.sqlite");
const backend = await FlightLineBackend.create({
  saveDirectoryPath,
  airportDatabasePath,
  aircraftDatabasePath,
});
const airportReference = backend.getAirportReference();

async function createCompanySave(saveId, startedAtUtc = "2026-03-16T12:00:00.000Z") {
  const createSaveResult = await backend.dispatch({
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
  assert.equal(createSaveResult.success, true);

  const createCompanyResult = await backend.dispatch({
    commandId: `cmd_${saveId}_company`,
    saveId,
    commandName: "CreateCompany",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      displayName: `Aircraft Test ${saveId}`,
      starterAirportId: "KDEN",
      startingCashAmount: 3_500_000,
    },
  });
  assert.equal(createCompanyResult.success, true);

  return startedAtUtc;
}

async function acquireAircraft(saveId, startedAtUtc, registration, aircraftModelId = "cessna_208b_grand_caravan_ex_passenger") {
  const result = await backend.dispatch({
    commandId: `cmd_${saveId}_${registration}`,
    saveId,
    commandName: "AcquireAircraft",
    issuedAtUtc: startedAtUtc,
    actorType: "player",
    payload: {
      aircraftModelId,
      deliveryAirportId: "KDEN",
      ownershipType: "owned",
      registration,
    },
  });
  assert.equal(result.success, true);
}

function makeFleetAircraft(overrides = {}) {
  return {
    aircraftId: "aircraft_base",
    aircraftModelId: "cessna_208b_grand_caravan_ex_passenger",
    modelDisplayName: "Cessna Caravan Passenger",
    registration: "N100FL",
    displayName: "FlightLine 100",
    ownershipType: "owned",
    currentAirportId: "KDEN",
    deliveryState: "delivered",
    airframeHoursTotal: 1200,
    airframeCyclesTotal: 820,
    conditionValue: 0.92,
    conditionBandInput: "excellent",
    hoursSinceInspection: 120,
    cyclesSinceInspection: 24,
    hoursToService: 42,
    maintenanceStateInput: "current",
    aogFlag: false,
    statusInput: "available",
    dispatchAvailable: true,
    activeScheduleId: undefined,
    activeMaintenanceTaskId: undefined,
    acquiredAtUtc: "2026-01-08T00:00:00.000Z",
    activeCabinLayoutId: undefined,
    activeCabinLayoutDisplayName: "Utility cabin",
    activeCabinSeats: 9,
    activeCabinCargoCapacityLb: 3300,
    acquisitionAgreementId: undefined,
    recurringPaymentAmount: undefined,
    paymentCadence: undefined,
    agreementEndAtUtc: undefined,
    minimumAirportSize: 2,
    minimumRunwayFt: 3200,
    rangeNm: 920,
    maxPassengers: 9,
    maxCargoLb: 3300,
    pilotQualificationGroup: "single_turboprop_utility",
    pilotsRequired: 1,
    flightAttendantsRequired: 0,
    mechanicSkillGroup: "single_turboprop",
    msfs2024Status: "confirmed_available",
    ...overrides,
  };
}

function makeSchedule(overrides = {}) {
  return {
    scheduleId: "schedule_base",
    aircraftId: "aircraft_base",
    scheduleKind: "operational",
    scheduleState: "committed",
    isDraft: false,
    plannedStartUtc: "2026-03-16T14:00:00.000Z",
    plannedEndUtc: "2026-03-16T17:00:00.000Z",
    validationSnapshot: undefined,
    createdAtUtc: "2026-03-16T12:00:00.000Z",
    updatedAtUtc: "2026-03-16T12:05:00.000Z",
    legs: [
      {
        flightLegId: "leg_base",
        sequenceNumber: 1,
        legType: "contract_flight",
        linkedCompanyContractId: undefined,
        originAirportId: "KDEN",
        destinationAirportId: "KCOS",
        plannedDepartureUtc: "2026-03-16T14:00:00.000Z",
        plannedArrivalUtc: "2026-03-16T15:20:00.000Z",
        actualDepartureUtc: undefined,
        actualArrivalUtc: undefined,
        legState: "planned",
        assignedQualificationGroup: "single_turboprop_premium",
        payloadSnapshot: undefined,
      },
    ],
    laborAllocations: [
      {
        laborAllocationId: "alloc_base",
        staffingPackageId: "pkg_premium_pilot",
        qualificationGroup: "single_turboprop_premium",
        unitsReserved: 1,
        reservedFromUtc: "2026-03-16T13:30:00.000Z",
        reservedToUtc: "2026-03-16T15:30:00.000Z",
        status: "reserved",
      },
    ],
    ...overrides,
  };
}

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

try {
  {
    const saveId = `aircraft_maintenance_${Date.now()}`;
    const startedAtUtc = await createCompanySave(saveId);
    await acquireAircraft(saveId, startedAtUtc, "N208AT");

    const initialFleetState = await backend.loadFleetState(saveId);
    assert.ok(initialFleetState?.aircraft[0]);
    const aircraftId = initialFleetState.aircraft[0].aircraftId;

    await backend.withExistingSaveDatabase(saveId, async (context) => {
      context.saveDatabase.run(
        `UPDATE maintenance_program_state
         SET condition_band_input = $condition_band_input,
             hours_since_inspection = $hours_since_inspection,
             cycles_since_inspection = $cycles_since_inspection,
             hours_to_service = $hours_to_service,
             maintenance_state_input = $maintenance_state_input,
             aog_flag = $aog_flag
         WHERE aircraft_id = $aircraft_id`,
        {
          $condition_band_input: "poor",
          $hours_since_inspection: 187.5,
          $cycles_since_inspection: 33,
          $hours_to_service: -4.25,
          $maintenance_state_input: "overdue",
          $aog_flag: 1,
          $aircraft_id: aircraftId,
        },
      );
      await context.saveDatabase.persist();
    });

    const fleetState = await backend.loadFleetState(saveId);
    assert.ok(fleetState?.aircraft[0]);
    assert.equal(fleetState.aircraft[0].conditionBandInput, "poor");
    assert.equal(fleetState.aircraft[0].hoursSinceInspection, 187.5);
    assert.equal(fleetState.aircraft[0].cyclesSinceInspection, 33);
    assert.equal(fleetState.aircraft[0].hoursToService, -4.25);
    assert.equal(fleetState.aircraft[0].maintenanceStateInput, "overdue");
    assert.equal(fleetState.aircraft[0].aogFlag, true);
  }

  {
    const currentTimeUtc = "2026-03-16T12:00:00.000Z";
    const scheduledSchedule = makeSchedule({
      scheduleId: "schedule_scheduled",
      aircraftId: "aircraft_scheduled",
      legs: [
        {
          flightLegId: "leg_scheduled",
          sequenceNumber: 1,
          legType: "contract_flight",
          linkedCompanyContractId: undefined,
          originAirportId: "KDEN",
          destinationAirportId: "KCOS",
          plannedDepartureUtc: "2026-03-16T14:00:00.000Z",
          plannedArrivalUtc: "2026-03-16T15:20:00.000Z",
          actualDepartureUtc: undefined,
          actualArrivalUtc: undefined,
          legState: "planned",
          assignedQualificationGroup: "single_turboprop_premium",
          payloadSnapshot: undefined,
        },
      ],
    });

    const fleetState = {
      saveId: "synthetic_aircraft_tab",
      companyId: "company_synthetic",
      aircraft: [
        makeFleetAircraft({
          aircraftId: "aircraft_available",
          registration: "N100FL",
          displayName: "Available 100",
        }),
        makeFleetAircraft({
          aircraftId: "aircraft_scheduled",
          registration: "N200FL",
          displayName: "Scheduled 200",
          pilotQualificationGroup: "single_turboprop_premium",
          activeScheduleId: "schedule_scheduled",
          dispatchAvailable: false,
          statusInput: "scheduled",
          maintenanceStateInput: "due_soon",
          hoursToService: 6,
          rangeNm: 1250,
          maxPassengers: 10,
          maxCargoLb: 2800,
        }),
        makeFleetAircraft({
          aircraftId: "aircraft_maintenance",
          registration: "N300FL",
          displayName: "Maintenance 300",
          pilotQualificationGroup: "twin_turboprop_utility",
          dispatchAvailable: false,
          statusInput: "maintenance",
          conditionBandInput: "good",
          conditionValue: 0.72,
          minimumAirportSize: 3,
          minimumRunwayFt: 4200,
          maxPassengers: 19,
          maxCargoLb: 4200,
          rangeNm: 780,
        }),
        makeFleetAircraft({
          aircraftId: "aircraft_overdue",
          registration: "N400FL",
          displayName: "Overdue 400",
          dispatchAvailable: false,
          conditionBandInput: "fair",
          conditionValue: 0.58,
          maintenanceStateInput: "overdue",
          hoursToService: -3.5,
        }),
        makeFleetAircraft({
          aircraftId: "aircraft_aog",
          registration: "N500FL",
          displayName: "AOG 500",
          dispatchAvailable: false,
          conditionBandInput: "poor",
          conditionValue: 0.33,
          maintenanceStateInput: "aog",
          aogFlag: true,
          statusInput: "grounded",
          hoursToService: -18,
        }),
      ],
      totalAircraftCount: 5,
      dispatchAvailableCount: 1,
      ownedCount: 5,
      financedCount: 0,
      leasedCount: 0,
    };

    const staffingState = {
      saveId: "synthetic_aircraft_tab",
      companyId: "company_synthetic",
      staffingPackages: [],
      coverageSummaries: [
        {
          laborCategory: "pilot",
          qualificationGroup: "single_turboprop_utility",
          activeCoverageUnits: 2,
          pendingCoverageUnits: 0,
          activePackageCount: 1,
          pendingPackageCount: 0,
        },
        {
          laborCategory: "pilot",
          qualificationGroup: "single_turboprop_premium",
          activeCoverageUnits: 1,
          pendingCoverageUnits: 0,
          activePackageCount: 1,
          pendingPackageCount: 0,
        },
      ],
      totalActiveCoverageUnits: 3,
      totalPendingCoverageUnits: 0,
      totalMonthlyFixedCostAmount: 18_000,
    };

    const maintenanceTasks = [
      {
        maintenanceTaskId: "task_maintenance_active",
        aircraftId: "aircraft_maintenance",
        registration: "N300FL",
        maintenanceType: "inspection_a",
        plannedStartUtc: "2026-03-16T11:00:00.000Z",
        plannedEndUtc: "2026-03-16T16:30:00.000Z",
        taskState: "in_progress",
      },
    ];

    const payload = buildAircraftTabPayload({
      companyContext: {
        currentTimeUtc,
      },
      companyContracts: null,
      fleetState,
      staffingState,
      schedules: [scheduledSchedule],
      maintenanceTasks,
      airportReference,
    });

    const byId = new Map(payload.aircraft.map((aircraft) => [aircraft.aircraftId, aircraft]));

    assert.equal(byId.get("aircraft_available")?.operationalState, "available");
    assert.equal(byId.get("aircraft_available")?.riskBand, "healthy");
    assert.equal(byId.get("aircraft_available")?.staffingFlag, "covered");

    assert.equal(byId.get("aircraft_scheduled")?.operationalState, "scheduled");
    assert.equal(byId.get("aircraft_scheduled")?.maintenanceState, "due_soon");
    assert.equal(byId.get("aircraft_scheduled")?.riskBand, "watch");
    assert.equal(byId.get("aircraft_scheduled")?.staffingFlag, "tight");
    assert.equal(byId.get("aircraft_scheduled")?.nextEvent.label, "Departure next");
    assert.match(byId.get("aircraft_scheduled")?.nextEvent.detail ?? "", /KDEN -> KCOS/);

    assert.equal(byId.get("aircraft_maintenance")?.operationalState, "maintenance");
    assert.equal(byId.get("aircraft_maintenance")?.maintenanceState, "in_service");
    assert.equal(byId.get("aircraft_maintenance")?.staffingFlag, "uncovered");

    assert.equal(byId.get("aircraft_overdue")?.maintenanceState, "overdue");
    assert.equal(byId.get("aircraft_overdue")?.riskBand, "critical");

    assert.equal(byId.get("aircraft_aog")?.operationalState, "grounded");
    assert.equal(byId.get("aircraft_aog")?.maintenanceState, "aog");
    assert.equal(byId.get("aircraft_aog")?.riskBand, "critical");

    const filteredView = applyAircraftTabViewState(payload, {
      filters: {
        risk: "healthy",
      },
      sort: {
        key: "tail",
        direction: "asc",
      },
      selectedAircraftId: "aircraft_aog",
    });

    assert.equal(filteredView.visibleAircraft.every((aircraft) => aircraft.riskBand === "healthy"), true);
    assert.equal(filteredView.selectedAircraftId, "aircraft_available");
  }

  {
    const saveId = `aircraft_payload_${Date.now()}`;
    await createCompanySave(saveId);

    const aircraftPayload = await buildTabPayload(backend, saveId, "aircraft", renderers);
    assert.ok(aircraftPayload);
    assert.equal(aircraftPayload.tabId, "aircraft");
    assert.ok(aircraftPayload.aircraftPayload);
    assert.equal(Array.isArray(aircraftPayload.aircraftPayload.aircraft), true);

    const dashboardPayload = await buildTabPayload(backend, saveId, "dashboard", renderers);
    assert.ok(dashboardPayload);
    assert.equal(dashboardPayload.tabId, "dashboard");
    assert.equal(dashboardPayload.aircraftPayload ?? null, null);
    assert.equal(dashboardPayload.contractsPayload, null);
  }
} finally {
  await backend.close();
  await rm(saveDirectoryPath, { recursive: true, force: true });
}
