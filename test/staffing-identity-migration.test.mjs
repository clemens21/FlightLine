import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { FlightLineBackend } from "../dist/index.js";
import { SqliteFileDatabase } from "../dist/infrastructure/persistence/sqlite/sqlite-file-database.js";

const legacyMigrationFiles = [
  "0001_initial.sql",
  "0002_route_plan.sql",
  "0003_aircraft_market.sql",
  "0004_aircraft_market_lifecycle.sql",
  "0005_named_pilots.sql",
  "0006_named_pilot_training.sql",
  "0007_named_pilot_travel.sql",
  "0008_staffing_market.sql",
  "0009_pilot_certifications.sql",
];

const saveDirectoryPath = await mkdtemp(join(tmpdir(), "flightline-legacy-staffing-"));
const saveId = "legacy_staffing_identity";
const saveFilePath = join(saveDirectoryPath, `${saveId}.sqlite`);
const schemaDirectoryPath = resolve(process.cwd(), "dist", "infrastructure", "persistence", "save-schema");
const airportDatabasePath = resolve(process.cwd(), "data", "airports", "flightline-airports.sqlite");
const aircraftDatabasePath = resolve(process.cwd(), "data", "aircraft", "flightline-aircraft.sqlite");
let backend = null;

try {
  const database = await SqliteFileDatabase.open(saveFilePath);
  try {
    database.run(`CREATE TABLE schema_migration (
      migration_id TEXT PRIMARY KEY,
      applied_at_utc TEXT NOT NULL,
      app_version TEXT NOT NULL
    )`);

    for (const migrationFile of legacyMigrationFiles) {
      const migrationSql = await readFile(join(schemaDirectoryPath, migrationFile), "utf8");
      database.exec(migrationSql);
      database.run(
        `INSERT INTO schema_migration (
          migration_id,
          applied_at_utc,
          app_version
        ) VALUES (
          $migration_id,
          $applied_at_utc,
          $app_version
        )`,
        {
          $migration_id: migrationFile.replace(/\.sql$/u, ""),
          $applied_at_utc: "2026-03-16T12:00:00.000Z",
          $app_version: "legacy-test",
        },
      );
    }

    database.run(
      `INSERT INTO save_game (
        save_id,
        save_version,
        created_at_utc,
        updated_at_utc,
        world_seed,
        difficulty_profile,
        airport_snapshot_version,
        aircraft_snapshot_version,
        active_company_id
      ) VALUES (
        $save_id,
        1,
        $created_at_utc,
        $updated_at_utc,
        'legacy-seed',
        'standard',
        'legacy-airports',
        'legacy-aircraft',
        'company_legacy'
      )`,
      {
        $save_id: saveId,
        $created_at_utc: "2026-03-16T12:00:00.000Z",
        $updated_at_utc: "2026-03-16T12:00:00.000Z",
      },
    );
    database.run(
      `INSERT INTO game_clock (
        save_id,
        current_time_utc,
        last_advanced_at_utc,
        last_advance_result_json
      ) VALUES (
        $save_id,
        '2026-03-16T12:00:00.000Z',
        NULL,
        NULL
      )`,
      { $save_id: saveId },
    );
    database.run(
      `INSERT INTO company (
        company_id,
        save_id,
        display_name,
        reputation_score,
        company_phase,
        progression_tier,
        created_at_utc
      ) VALUES (
        'company_legacy',
        $save_id,
        'Legacy Staffing Co',
        50,
        'startup',
        1,
        '2026-03-16T12:00:00.000Z'
      )`,
      { $save_id: saveId },
    );
    database.run(
      `INSERT INTO company_base (
        company_base_id,
        company_id,
        airport_id,
        base_role,
        activated_at_utc
      ) VALUES (
        'base_legacy',
        'company_legacy',
        'KDEN',
        'home_base',
        '2026-03-16T12:00:00.000Z'
      )`,
    );
    database.run(
      `INSERT INTO company_financial_state (
        company_id,
        current_cash_amount,
        financial_pressure_band,
        reserve_balance_amount,
        updated_at_utc
      ) VALUES (
        'company_legacy',
        3500000,
        'stable',
        NULL,
        '2026-03-16T12:00:00.000Z'
      )`,
    );
    database.run(
      `INSERT INTO offer_window (
        offer_window_id,
        company_id,
        window_type,
        generated_at_utc,
        expires_at_utc,
        window_seed,
        generation_context_hash,
        refresh_reason,
        status
      ) VALUES (
        'window_legacy',
        'company_legacy',
        'staffing_market',
        '2026-03-16T12:00:00.000Z',
        '2026-03-17T12:00:00.000Z',
        'legacy-window',
        '{}',
        'bootstrap',
        'active'
      )`,
    );
    database.run(
      `INSERT INTO staffing_offer (
        staffing_offer_id,
        offer_window_id,
        company_id,
        labor_category,
        employment_model,
        qualification_group,
        coverage_units,
        fixed_cost_amount,
        variable_cost_rate,
        starts_at_utc,
        ends_at_utc,
        display_name,
        current_airport_id,
        explanation_metadata_json,
        generated_seed,
        offer_status,
        listed_at_utc,
        available_until_utc,
        closed_at_utc,
        close_reason,
        certifications_json
      ) VALUES (
        'offer_legacy',
        'window_legacy',
        'company_legacy',
        'pilot',
        'direct_hire',
        'single_turboprop_utility',
        1,
        4200,
        NULL,
        '2026-03-16T12:00:00.000Z',
        NULL,
        'Legacy Candidate',
        'KDEN',
        '{}',
        'legacy-offer-seed',
        'available',
        '2026-03-16T12:00:00.000Z',
        '2026-03-17T12:00:00.000Z',
        NULL,
        NULL,
        '[\"SEPL\"]'
      )`,
    );
    database.run(
      `INSERT INTO staffing_package (
        staffing_package_id,
        company_id,
        source_offer_id,
        labor_category,
        employment_model,
        qualification_group,
        coverage_units,
        fixed_cost_amount,
        variable_cost_rate,
        service_region_code,
        starts_at_utc,
        ends_at_utc,
        status
      ) VALUES (
        'staff_legacy',
        'company_legacy',
        'offer_legacy',
        'pilot',
        'direct_hire',
        'single_turboprop_utility',
        1,
        4200,
        NULL,
        NULL,
        '2026-03-16T12:00:00.000Z',
        NULL,
        'active'
      )`,
    );
    database.run(
      `INSERT INTO named_pilot (
        named_pilot_id,
        company_id,
        staffing_package_id,
        roster_slot_number,
        display_name,
        home_airport_id,
        current_airport_id,
        resting_until_utc,
        created_at_utc,
        updated_at_utc,
        training_program_kind,
        training_started_at_utc,
        training_until_utc,
        travel_origin_airport_id,
        travel_destination_airport_id,
        travel_started_at_utc,
        travel_until_utc,
        certifications_json,
        training_target_certification_code
      ) VALUES (
        'pilot_legacy',
        'company_legacy',
        'staff_legacy',
        1,
        'Legacy Pilot',
        'KDEN',
        'KDEN',
        NULL,
        '2026-03-16T12:00:00.000Z',
        '2026-03-16T12:00:00.000Z',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        '[\"SEPL\"]',
        NULL
      )`,
    );
    await database.persist();
  } finally {
    await database.close();
  }

  backend = await FlightLineBackend.create({
    saveDirectoryPath,
    airportDatabasePath,
    aircraftDatabasePath,
  });

  const companyContext = await backend.loadCompanyContext(saveId);
  assert.ok(companyContext);

  const staffingMarket = await backend.loadActiveStaffingMarket(saveId);
  assert.ok(staffingMarket);
  const legacyOffer = staffingMarket.offers.find((offer) => offer.staffingOfferId === "offer_legacy");
  assert.ok(legacyOffer);
  assert.equal(legacyOffer.firstName, "Legacy");
  assert.equal(legacyOffer.lastName, "Candidate");
  assert.equal(legacyOffer.displayName, "Legacy Candidate");

  const staffingState = await backend.loadStaffingState(saveId);
  assert.ok(staffingState);
  const legacyPilot = staffingState.namedPilots.find((pilot) => pilot.namedPilotId === "pilot_legacy");
  assert.ok(legacyPilot);
  assert.equal(legacyPilot.firstName, "Legacy");
  assert.equal(legacyPilot.lastName, "Pilot");
  assert.equal(legacyPilot.displayName, "Legacy Pilot");
  assert.equal(legacyPilot.homeCity, undefined);
  assert.equal(legacyPilot.homeRegionCode, undefined);
  assert.equal(legacyPilot.homeCountryCode, undefined);

  const migratedColumns = await backend.withExistingSaveDatabase(saveId, async (context) => ({
    offer: context.saveDatabase.getOne(
      `SELECT first_name AS firstName, last_name AS lastName
       FROM staffing_offer
       WHERE staffing_offer_id = 'offer_legacy'`,
    ),
    pilot: context.saveDatabase.getOne(
      `SELECT first_name AS firstName, last_name AS lastName
       FROM named_pilot
       WHERE named_pilot_id = 'pilot_legacy'`,
    ),
  }));
  assert.equal(migratedColumns?.offer?.firstName, "Legacy");
  assert.equal(migratedColumns?.offer?.lastName, "Candidate");
  assert.equal(migratedColumns?.pilot?.firstName, "Legacy");
  assert.equal(migratedColumns?.pilot?.lastName, "Pilot");
} finally {
  await Promise.allSettled([
    backend?.close(),
  ]);
  await rm(saveDirectoryPath, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
