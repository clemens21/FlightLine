PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR REPLACE INTO meta (key, value) VALUES
  ('schema_name', 'flightline_airports'),
  ('schema_version', '001'),
  ('schema_applied_utc', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS source_snapshot (
  id INTEGER PRIMARY KEY,
  source_key TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  version_label TEXT,
  source_url TEXT,
  raw_path TEXT,
  license_name TEXT,
  license_url TEXT,
  acquired_at_utc TEXT,
  imported_at_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_snapshot_key_version
  ON source_snapshot (source_key, version_label);

CREATE TABLE IF NOT EXISTS country_reference (
  code TEXT PRIMARY KEY,
  source_country_id TEXT,
  name TEXT NOT NULL,
  continent TEXT,
  wikipedia_link TEXT,
  keywords TEXT
);

CREATE TABLE IF NOT EXISTS region_reference (
  code TEXT PRIMARY KEY,
  source_region_id TEXT,
  local_code TEXT,
  name TEXT NOT NULL,
  continent TEXT,
  iso_country TEXT,
  wikipedia_link TEXT,
  keywords TEXT
);

CREATE INDEX IF NOT EXISTS idx_region_reference_country
  ON region_reference (iso_country);

CREATE TABLE IF NOT EXISTS airport (
  id INTEGER PRIMARY KEY,
  airport_key TEXT NOT NULL UNIQUE,
  ident_code TEXT NOT NULL,
  icao_code TEXT,
  iata_code TEXT,
  gps_code TEXT,
  local_code TEXT,
  name TEXT NOT NULL,
  airport_type TEXT NOT NULL,
  continent TEXT,
  latitude_deg REAL NOT NULL,
  longitude_deg REAL NOT NULL,
  elevation_ft INTEGER,
  iso_country TEXT,
  iso_region TEXT,
  municipality TEXT,
  timezone TEXT,
  scheduled_service INTEGER NOT NULL DEFAULT 0 CHECK (scheduled_service IN (0, 1)),
  home_link TEXT,
  wikipedia_link TEXT,
  keywords TEXT,
  data_confidence TEXT NOT NULL DEFAULT 'unreviewed',
  created_at_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_airport_ident_code ON airport (ident_code);
CREATE INDEX IF NOT EXISTS idx_airport_icao_code ON airport (icao_code);
CREATE INDEX IF NOT EXISTS idx_airport_iata_code ON airport (iata_code);
CREATE INDEX IF NOT EXISTS idx_airport_gps_code ON airport (gps_code);
CREATE INDEX IF NOT EXISTS idx_airport_local_code ON airport (local_code);
CREATE INDEX IF NOT EXISTS idx_airport_country_region ON airport (iso_country, iso_region);
CREATE INDEX IF NOT EXISTS idx_airport_type ON airport (airport_type);`r`nCREATE INDEX IF NOT EXISTS idx_airport_size ON airport (airport_size);

CREATE TABLE IF NOT EXISTS airport_profile (
  airport_id INTEGER PRIMARY KEY REFERENCES airport (id) ON DELETE CASCADE,
  in_database INTEGER NOT NULL DEFAULT 1 CHECK (in_database IN (0, 1)),
  accessible_now INTEGER NOT NULL DEFAULT 0 CHECK (accessible_now IN (0, 1)),
  visibility_status TEXT NOT NULL DEFAULT 'hidden'
    CHECK (visibility_status IN ('supported', 'hidden', 'excluded')),
  size_tier TEXT,
  infrastructure_tier TEXT,
  access_tier TEXT,
  longest_runway_ft INTEGER,
  longest_hard_runway_ft INTEGER,
  has_lighted_runway INTEGER NOT NULL DEFAULT 0 CHECK (has_lighted_runway IN (0, 1)),
  has_hard_surface INTEGER NOT NULL DEFAULT 0 CHECK (has_hard_surface IN (0, 1)),
  supports_small_utility INTEGER NOT NULL DEFAULT 0 CHECK (supports_small_utility IN (0, 1)),
  supports_regional_turboprop INTEGER NOT NULL DEFAULT 0 CHECK (supports_regional_turboprop IN (0, 1)),
  supports_regional_jet INTEGER NOT NULL DEFAULT 0 CHECK (supports_regional_jet IN (0, 1)),
  supports_narrowbody INTEGER NOT NULL DEFAULT 0 CHECK (supports_narrowbody IN (0, 1)),
  passenger_score REAL,
  cargo_score REAL,
  remote_score REAL,
  tourism_score REAL,
  business_score REAL,
  demand_archetype TEXT,
  maintenance_capability_band TEXT,
  contract_generation_weight REAL NOT NULL DEFAULT 1.0,
  market_region TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS airport_runway (
  id INTEGER PRIMARY KEY,
  airport_id INTEGER NOT NULL REFERENCES airport (id) ON DELETE CASCADE,
  source_runway_id TEXT,
  source_airport_ident TEXT,
  runway_name TEXT NOT NULL,
  runway_ident_a TEXT,
  runway_ident_b TEXT,
  length_ft INTEGER,
  width_ft INTEGER,
  surface_raw TEXT,
  surface_category TEXT,
  lighting_code TEXT,
  has_lighting INTEGER NOT NULL DEFAULT 0 CHECK (has_lighting IN (0, 1)),
  is_closed INTEGER NOT NULL DEFAULT 0 CHECK (is_closed IN (0, 1)),
  latitude_deg REAL,
  longitude_deg REAL,
  elevation_ft INTEGER,
  heading_deg REAL,
  landing_system TEXT,
  le_latitude_deg REAL,
  le_longitude_deg REAL,
  le_elevation_ft INTEGER,
  le_heading_degT REAL,
  le_displaced_threshold_ft INTEGER,
  he_latitude_deg REAL,
  he_longitude_deg REAL,
  he_elevation_ft INTEGER,
  he_heading_degT REAL,
  he_displaced_threshold_ft INTEGER
);

CREATE INDEX IF NOT EXISTS idx_airport_runway_airport_id
  ON airport_runway (airport_id);

CREATE TABLE IF NOT EXISTS airport_frequency (
  id INTEGER PRIMARY KEY,
  airport_id INTEGER NOT NULL REFERENCES airport (id) ON DELETE CASCADE,
  source_frequency_id TEXT,
  airport_ident TEXT,
  frequency_type TEXT NOT NULL,
  description TEXT,
  frequency_mhz REAL,
  callsign TEXT
);

CREATE INDEX IF NOT EXISTS idx_airport_frequency_airport_id
  ON airport_frequency (airport_id);

CREATE TABLE IF NOT EXISTS airport_tag (
  airport_id INTEGER NOT NULL REFERENCES airport (id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  tag_source TEXT NOT NULL DEFAULT 'manual',
  weight REAL,
  PRIMARY KEY (airport_id, tag)
);

CREATE TABLE IF NOT EXISTS airport_source_record (
  id INTEGER PRIMARY KEY,
  airport_id INTEGER REFERENCES airport (id) ON DELETE CASCADE,
  source_snapshot_id INTEGER NOT NULL REFERENCES source_snapshot (id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('airport', 'runway', 'frequency', 'legacy_payload')),
  source_record_key TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_airport_source_record_airport_id
  ON airport_source_record (airport_id);

CREATE INDEX IF NOT EXISTS idx_airport_source_record_snapshot_id
  ON airport_source_record (source_snapshot_id);

CREATE TABLE IF NOT EXISTS legacy_airport_payload (
  id INTEGER PRIMARY KEY,
  source_snapshot_id INTEGER NOT NULL REFERENCES source_snapshot (id) ON DELETE CASCADE,
  external_key TEXT,
  payload_json TEXT NOT NULL,
  normalized_airport_id INTEGER REFERENCES airport (id) ON DELETE SET NULL,
  import_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (import_status IN ('pending', 'mapped', 'skipped', 'rejected')),
  notes TEXT,
  created_at_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

