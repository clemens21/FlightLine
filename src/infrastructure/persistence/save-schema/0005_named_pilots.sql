CREATE TABLE named_pilot (
  named_pilot_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  staffing_package_id TEXT NOT NULL REFERENCES staffing_package(staffing_package_id) ON DELETE CASCADE,
  roster_slot_number INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  home_airport_id TEXT,
  current_airport_id TEXT,
  resting_until_utc TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  UNIQUE(staffing_package_id, roster_slot_number)
);

CREATE TABLE named_pilot_assignment (
  named_pilot_assignment_id TEXT PRIMARY KEY,
  named_pilot_id TEXT NOT NULL REFERENCES named_pilot(named_pilot_id) ON DELETE CASCADE,
  aircraft_id TEXT NOT NULL REFERENCES company_aircraft(aircraft_id) ON DELETE CASCADE,
  schedule_id TEXT NOT NULL REFERENCES aircraft_schedule(schedule_id) ON DELETE CASCADE,
  qualification_group TEXT NOT NULL,
  assigned_from_utc TEXT NOT NULL,
  assigned_to_utc TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  UNIQUE(named_pilot_id, schedule_id)
);

CREATE INDEX idx_named_pilot_company_package ON named_pilot(company_id, staffing_package_id);
CREATE INDEX idx_named_pilot_assignment_schedule ON named_pilot_assignment(schedule_id, status, assigned_from_utc);
CREATE INDEX idx_named_pilot_assignment_pilot_window ON named_pilot_assignment(named_pilot_id, assigned_from_utc, assigned_to_utc, status);
