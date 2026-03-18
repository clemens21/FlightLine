CREATE TABLE staffing_offer (
  staffing_offer_id TEXT PRIMARY KEY,
  offer_window_id TEXT NOT NULL REFERENCES offer_window(offer_window_id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  labor_category TEXT NOT NULL,
  employment_model TEXT NOT NULL,
  qualification_group TEXT NOT NULL,
  coverage_units INTEGER NOT NULL,
  fixed_cost_amount INTEGER NOT NULL,
  variable_cost_rate INTEGER,
  starts_at_utc TEXT,
  ends_at_utc TEXT,
  display_name TEXT,
  current_airport_id TEXT,
  explanation_metadata_json TEXT NOT NULL,
  generated_seed TEXT NOT NULL,
  offer_status TEXT NOT NULL,
  listed_at_utc TEXT,
  available_until_utc TEXT,
  closed_at_utc TEXT,
  close_reason TEXT
);

CREATE INDEX idx_staffing_offer_window_status
  ON staffing_offer(offer_window_id, offer_status, starts_at_utc);

CREATE INDEX idx_staffing_offer_company_status
  ON staffing_offer(company_id, offer_status, starts_at_utc);
