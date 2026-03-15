PRAGMA foreign_keys = ON;

-- Monetary values are stored as integer minor units where possible.

CREATE TABLE save_game (
  save_id TEXT PRIMARY KEY,
  save_version INTEGER NOT NULL,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  world_seed TEXT NOT NULL,
  difficulty_profile TEXT NOT NULL,
  airport_snapshot_version TEXT NOT NULL,
  aircraft_snapshot_version TEXT NOT NULL,
  active_company_id TEXT
);

CREATE TABLE game_clock (
  save_id TEXT PRIMARY KEY REFERENCES save_game(save_id) ON DELETE CASCADE,
  current_time_utc TEXT NOT NULL,
  last_advanced_at_utc TEXT,
  last_advance_result_json TEXT
);

CREATE TABLE company (
  company_id TEXT PRIMARY KEY,
  save_id TEXT NOT NULL REFERENCES save_game(save_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  reputation_score INTEGER NOT NULL,
  company_phase TEXT NOT NULL,
  progression_tier INTEGER NOT NULL,
  created_at_utc TEXT NOT NULL
);

CREATE TABLE company_base (
  company_base_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  airport_id TEXT NOT NULL,
  base_role TEXT NOT NULL,
  activated_at_utc TEXT NOT NULL
);

CREATE TABLE company_financial_state (
  company_id TEXT PRIMARY KEY REFERENCES company(company_id) ON DELETE CASCADE,
  current_cash_amount INTEGER NOT NULL,
  financial_pressure_band TEXT NOT NULL,
  reserve_balance_amount INTEGER,
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE recurring_obligation (
  recurring_obligation_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  obligation_type TEXT NOT NULL,
  source_object_type TEXT NOT NULL,
  source_object_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  cadence TEXT NOT NULL,
  next_due_at_utc TEXT NOT NULL,
  end_at_utc TEXT,
  status TEXT NOT NULL
);

CREATE TABLE ledger_entry (
  ledger_entry_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  entry_time_utc TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency_code TEXT NOT NULL,
  source_object_type TEXT,
  source_object_id TEXT,
  description TEXT NOT NULL,
  metadata_json TEXT
);

CREATE TABLE company_aircraft (
  aircraft_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  aircraft_model_id TEXT NOT NULL,
  active_cabin_layout_id TEXT,
  registration TEXT NOT NULL,
  display_name TEXT NOT NULL,
  ownership_type TEXT NOT NULL,
  current_airport_id TEXT NOT NULL,
  delivery_state TEXT NOT NULL,
  airframe_hours_total REAL NOT NULL,
  airframe_cycles_total INTEGER NOT NULL,
  condition_value REAL NOT NULL,
  status_input TEXT NOT NULL,
  dispatch_available INTEGER NOT NULL,
  active_schedule_id TEXT,
  active_maintenance_task_id TEXT,
  acquired_at_utc TEXT NOT NULL
);

CREATE TABLE acquisition_agreement (
  acquisition_agreement_id TEXT PRIMARY KEY,
  aircraft_id TEXT NOT NULL UNIQUE REFERENCES company_aircraft(aircraft_id) ON DELETE CASCADE,
  agreement_type TEXT NOT NULL,
  origin_offer_id TEXT,
  start_at_utc TEXT NOT NULL,
  upfront_payment_amount INTEGER NOT NULL,
  recurring_payment_amount INTEGER,
  payment_cadence TEXT,
  term_months INTEGER,
  end_at_utc TEXT,
  rate_band_or_apr REAL,
  status TEXT NOT NULL
);

CREATE TABLE staffing_package (
  staffing_package_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  source_offer_id TEXT,
  labor_category TEXT NOT NULL,
  employment_model TEXT NOT NULL,
  qualification_group TEXT NOT NULL,
  coverage_units INTEGER NOT NULL,
  fixed_cost_amount INTEGER NOT NULL,
  variable_cost_rate INTEGER,
  service_region_code TEXT,
  starts_at_utc TEXT NOT NULL,
  ends_at_utc TEXT,
  status TEXT NOT NULL
);

CREATE TABLE labor_allocation (
  labor_allocation_id TEXT PRIMARY KEY,
  staffing_package_id TEXT NOT NULL REFERENCES staffing_package(staffing_package_id) ON DELETE CASCADE,
  aircraft_id TEXT,
  schedule_id TEXT,
  maintenance_task_id TEXT,
  qualification_group TEXT NOT NULL,
  units_reserved INTEGER NOT NULL,
  reserved_from_utc TEXT NOT NULL,
  reserved_to_utc TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE offer_window (
  offer_window_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  window_type TEXT NOT NULL,
  generated_at_utc TEXT NOT NULL,
  expires_at_utc TEXT NOT NULL,
  window_seed TEXT NOT NULL,
  generation_context_hash TEXT NOT NULL,
  refresh_reason TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE contract_offer (
  contract_offer_id TEXT PRIMARY KEY,
  offer_window_id TEXT NOT NULL REFERENCES offer_window(offer_window_id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  archetype TEXT NOT NULL,
  origin_airport_id TEXT NOT NULL,
  destination_airport_id TEXT NOT NULL,
  volume_type TEXT NOT NULL,
  passenger_count INTEGER,
  cargo_weight_lb INTEGER,
  earliest_start_utc TEXT NOT NULL,
  latest_completion_utc TEXT NOT NULL,
  payout_amount INTEGER NOT NULL,
  penalty_model_json TEXT NOT NULL,
  likely_role TEXT NOT NULL,
  difficulty_band TEXT NOT NULL,
  explanation_metadata_json TEXT NOT NULL,
  generated_seed TEXT NOT NULL,
  offer_status TEXT NOT NULL
);

CREATE TABLE company_contract (
  company_contract_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  origin_contract_offer_id TEXT,
  archetype TEXT NOT NULL,
  origin_airport_id TEXT NOT NULL,
  destination_airport_id TEXT NOT NULL,
  volume_type TEXT NOT NULL,
  passenger_count INTEGER,
  cargo_weight_lb INTEGER,
  accepted_payout_amount INTEGER NOT NULL,
  penalty_model_json TEXT NOT NULL,
  accepted_at_utc TEXT NOT NULL,
  earliest_start_utc TEXT,
  deadline_utc TEXT NOT NULL,
  contract_state TEXT NOT NULL,
  assigned_aircraft_id TEXT
);

CREATE TABLE aircraft_schedule (
  schedule_id TEXT PRIMARY KEY,
  aircraft_id TEXT NOT NULL REFERENCES company_aircraft(aircraft_id) ON DELETE CASCADE,
  schedule_kind TEXT NOT NULL,
  schedule_state TEXT NOT NULL,
  is_draft INTEGER NOT NULL,
  planned_start_utc TEXT NOT NULL,
  planned_end_utc TEXT NOT NULL,
  validation_snapshot_json TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE flight_leg (
  flight_leg_id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES aircraft_schedule(schedule_id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  leg_type TEXT NOT NULL,
  linked_company_contract_id TEXT,
  origin_airport_id TEXT NOT NULL,
  destination_airport_id TEXT NOT NULL,
  planned_departure_utc TEXT NOT NULL,
  planned_arrival_utc TEXT NOT NULL,
  actual_departure_utc TEXT,
  actual_arrival_utc TEXT,
  leg_state TEXT NOT NULL,
  assigned_qualification_group TEXT,
  payload_snapshot_json TEXT,
  UNIQUE(schedule_id, sequence_number)
);

CREATE TABLE maintenance_program_state (
  aircraft_id TEXT PRIMARY KEY REFERENCES company_aircraft(aircraft_id) ON DELETE CASCADE,
  condition_band_input TEXT NOT NULL,
  hours_since_inspection REAL NOT NULL,
  cycles_since_inspection INTEGER NOT NULL,
  hours_to_service REAL NOT NULL,
  last_inspection_at_utc TEXT,
  last_heavy_service_at_utc TEXT,
  maintenance_state_input TEXT NOT NULL,
  aog_flag INTEGER NOT NULL,
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE maintenance_task (
  maintenance_task_id TEXT PRIMARY KEY,
  aircraft_id TEXT NOT NULL REFERENCES company_aircraft(aircraft_id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL,
  provider_source TEXT NOT NULL,
  planned_start_utc TEXT NOT NULL,
  planned_end_utc TEXT NOT NULL,
  actual_start_utc TEXT,
  actual_end_utc TEXT,
  cost_estimate_amount INTEGER,
  actual_cost_amount INTEGER,
  task_state TEXT NOT NULL
);

CREATE TABLE scheduled_event (
  scheduled_event_id TEXT PRIMARY KEY,
  save_id TEXT NOT NULL REFERENCES save_game(save_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  scheduled_time_utc TEXT NOT NULL,
  status TEXT NOT NULL,
  aircraft_id TEXT,
  company_contract_id TEXT,
  maintenance_task_id TEXT,
  payload_json TEXT
);

CREATE TABLE event_log_entry (
  event_log_entry_id TEXT PRIMARY KEY,
  save_id TEXT NOT NULL REFERENCES save_game(save_id) ON DELETE CASCADE,
  company_id TEXT,
  event_time_utc TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_object_type TEXT,
  source_object_id TEXT,
  severity TEXT,
  message TEXT NOT NULL,
  metadata_json TEXT
);

CREATE TABLE command_log (
  command_id TEXT PRIMARY KEY,
  save_id TEXT NOT NULL REFERENCES save_game(save_id) ON DELETE CASCADE,
  command_name TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  issued_at_utc TEXT NOT NULL,
  completed_at_utc TEXT,
  status TEXT NOT NULL,
  payload_json TEXT
);

CREATE INDEX idx_company_base_company_airport ON company_base(company_id, airport_id);
CREATE INDEX idx_ledger_entry_company_time ON ledger_entry(company_id, entry_time_utc);
CREATE INDEX idx_recurring_obligation_company_due ON recurring_obligation(company_id, next_due_at_utc, status);
CREATE INDEX idx_staffing_package_company_qualification ON staffing_package(company_id, qualification_group, status);
CREATE INDEX idx_labor_allocation_qualification_window ON labor_allocation(qualification_group, reserved_from_utc, reserved_to_utc, status);
CREATE INDEX idx_offer_window_company_type ON offer_window(company_id, window_type, status);
CREATE INDEX idx_contract_offer_window_status ON contract_offer(offer_window_id, offer_status);
CREATE INDEX idx_company_contract_company_state ON company_contract(company_id, contract_state);
CREATE INDEX idx_company_contract_company_deadline ON company_contract(company_id, deadline_utc);
CREATE INDEX idx_aircraft_schedule_aircraft_state ON aircraft_schedule(aircraft_id, schedule_state, is_draft);
CREATE INDEX idx_flight_leg_departure_state ON flight_leg(planned_departure_utc, leg_state);
CREATE INDEX idx_maintenance_task_aircraft_state ON maintenance_task(aircraft_id, task_state);
CREATE INDEX idx_scheduled_event_save_time ON scheduled_event(save_id, scheduled_time_utc, status);
CREATE INDEX idx_event_log_entry_save_time ON event_log_entry(save_id, event_time_utc);
