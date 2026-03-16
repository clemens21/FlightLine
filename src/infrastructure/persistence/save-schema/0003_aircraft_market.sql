CREATE TABLE aircraft_offer (
  aircraft_offer_id TEXT PRIMARY KEY,
  offer_window_id TEXT NOT NULL REFERENCES offer_window(offer_window_id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  aircraft_model_id TEXT NOT NULL,
  active_cabin_layout_id TEXT,
  listing_type TEXT NOT NULL,
  current_airport_id TEXT NOT NULL,
  registration TEXT NOT NULL,
  display_name TEXT NOT NULL,
  condition_value REAL NOT NULL,
  condition_band_input TEXT NOT NULL,
  status_input TEXT NOT NULL,
  airframe_hours_total REAL NOT NULL,
  airframe_cycles_total INTEGER NOT NULL,
  hours_since_inspection REAL NOT NULL,
  cycles_since_inspection INTEGER NOT NULL,
  hours_to_service REAL NOT NULL,
  maintenance_state_input TEXT NOT NULL,
  aog_flag INTEGER NOT NULL,
  asking_purchase_price_amount INTEGER NOT NULL,
  finance_terms_json TEXT NOT NULL,
  lease_terms_json TEXT NOT NULL,
  explanation_metadata_json TEXT NOT NULL,
  generated_seed TEXT NOT NULL,
  offer_status TEXT NOT NULL
);

CREATE INDEX idx_aircraft_offer_window_status ON aircraft_offer(offer_window_id, offer_status);
CREATE INDEX idx_aircraft_offer_company_status ON aircraft_offer(company_id, offer_status);
