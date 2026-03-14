PRAGMA foreign_keys = ON;

CREATE TABLE aircraft_family (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    manufacturer TEXT NOT NULL,
    qualification_group TEXT NOT NULL,
    mechanic_group TEXT NOT NULL,
    standardization_group TEXT NOT NULL,
    family_role_tags TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE aircraft_model (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id TEXT NOT NULL UNIQUE,
    family_id TEXT NOT NULL REFERENCES aircraft_family(family_id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    variant_kind TEXT NOT NULL,
    in_service_role TEXT NOT NULL,
    aircraft_category TEXT NOT NULL,
    engine_type TEXT NOT NULL,
    fuel_type TEXT NOT NULL,
    pressurized INTEGER NOT NULL DEFAULT 0 CHECK (pressurized IN (0, 1)),
    max_passengers INTEGER NOT NULL DEFAULT 0,
    max_cargo_lb INTEGER NOT NULL DEFAULT 0,
    payload_class TEXT NOT NULL DEFAULT '',
    combi_capable INTEGER NOT NULL DEFAULT 0 CHECK (combi_capable IN (0, 1)),
    cruise_speed_ktas INTEGER NOT NULL,
    range_nm INTEGER NOT NULL,
    fuel_burn_gph REAL NOT NULL,
    typical_turnaround_min INTEGER NOT NULL,
    minimum_runway_ft INTEGER NOT NULL,
    preferred_runway_ft INTEGER NOT NULL,
    hard_surface_required INTEGER NOT NULL DEFAULT 0 CHECK (hard_surface_required IN (0, 1)),
    rough_field_capable INTEGER NOT NULL DEFAULT 0 CHECK (rough_field_capable IN (0, 1)),
    market_value_usd INTEGER NOT NULL,
    target_lease_rate_monthly_usd INTEGER NOT NULL,
    variable_operating_cost_per_hour_usd INTEGER NOT NULL,
    fixed_support_cost_per_day_usd INTEGER NOT NULL,
    maintenance_reserve_per_hour_usd INTEGER NOT NULL,
    pilot_qualification_group TEXT NOT NULL,
    pilots_required INTEGER NOT NULL,
    flight_attendants_required INTEGER NOT NULL,
    mechanic_skill_group TEXT NOT NULL,
    base_dispatch_reliability REAL NOT NULL,
    condition_decay_per_hour REAL NOT NULL,
    condition_decay_per_cycle REAL NOT NULL,
    inspection_interval_hours INTEGER NOT NULL,
    inspection_interval_cycles INTEGER NOT NULL,
    heavy_maintenance_band TEXT NOT NULL,
    maintenance_downtime_hours INTEGER NOT NULL,
    market_role_pool TEXT NOT NULL,
    progression_tier INTEGER NOT NULL,
    startup_eligible INTEGER NOT NULL DEFAULT 0 CHECK (startup_eligible IN (0, 1)),
    reputation_gate INTEGER NOT NULL DEFAULT 0,
    best_fit_contract_tags TEXT NOT NULL DEFAULT '',
    airport_access_profile TEXT NOT NULL,
    msfs2024_available_for_user INTEGER NOT NULL DEFAULT 0 CHECK (msfs2024_available_for_user IN (0, 1)),
    msfs2024_status TEXT NOT NULL CHECK (msfs2024_status IN ('confirmed_available', 'confirmed_unavailable', 'not_verified')),
    msfs2024_included_tier TEXT NOT NULL DEFAULT '',
    msfs2024_distribution_channels TEXT NOT NULL DEFAULT '',
    msfs2024_example_products TEXT NOT NULL DEFAULT '',
    msfs2024_source_refs TEXT NOT NULL DEFAULT '',
    msfs2024_user_note TEXT NOT NULL DEFAULT '',
    msfs2024_last_verified_on TEXT NOT NULL DEFAULT '',
    data_confidence TEXT NOT NULL DEFAULT 'starter_design_band',
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE aircraft_tag (
    model_id TEXT NOT NULL REFERENCES aircraft_model(model_id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    PRIMARY KEY (model_id, tag)
);

CREATE INDEX idx_aircraft_model_family_id ON aircraft_model(family_id);
CREATE INDEX idx_aircraft_model_market_role_pool ON aircraft_model(market_role_pool);
CREATE INDEX idx_aircraft_model_msfs_available ON aircraft_model(msfs2024_available_for_user);
CREATE INDEX idx_aircraft_model_msfs_status ON aircraft_model(msfs2024_status);
CREATE INDEX idx_aircraft_model_progression_tier ON aircraft_model(progression_tier);
CREATE INDEX idx_aircraft_tag_tag ON aircraft_tag(tag);

CREATE VIEW aircraft_user_catalog AS
SELECT
    model_id,
    display_name,
    family_id,
    in_service_role,
    aircraft_category,
    market_role_pool,
    progression_tier,
    msfs2024_available_for_user,
    CASE
        WHEN msfs2024_status = 'confirmed_available' THEN 'Available in MSFS 2024'
        WHEN msfs2024_status = 'confirmed_unavailable' THEN 'Not available in MSFS 2024'
        ELSE 'Not verified for MSFS 2024'
    END AS msfs2024_user_label,
    msfs2024_status,
    msfs2024_included_tier,
    msfs2024_distribution_channels,
    msfs2024_example_products,
    msfs2024_user_note,
    msfs2024_last_verified_on
FROM aircraft_model;

CREATE VIEW aircraft_family_catalog AS
SELECT
    f.family_id,
    f.display_name,
    f.manufacturer,
    f.qualification_group,
    f.standardization_group,
    COUNT(m.id) AS model_count,
    MAX(m.msfs2024_available_for_user) AS any_msfs2024_available_for_user,
    SUM(CASE WHEN m.msfs2024_status = 'confirmed_available' THEN 1 ELSE 0 END) AS msfs2024_available_model_count,
    SUM(CASE WHEN m.msfs2024_status = 'confirmed_unavailable' THEN 1 ELSE 0 END) AS msfs2024_unavailable_model_count,
    SUM(CASE WHEN m.msfs2024_status = 'not_verified' THEN 1 ELSE 0 END) AS msfs2024_not_verified_model_count
FROM aircraft_family f
LEFT JOIN aircraft_model m ON m.family_id = f.family_id
GROUP BY
    f.family_id,
    f.display_name,
    f.manufacturer,
    f.qualification_group,
    f.standardization_group;
