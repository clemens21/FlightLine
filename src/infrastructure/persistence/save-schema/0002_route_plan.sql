CREATE TABLE route_plan (
  route_plan_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL UNIQUE REFERENCES company(company_id) ON DELETE CASCADE,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE route_plan_item (
  route_plan_item_id TEXT PRIMARY KEY,
  route_plan_id TEXT NOT NULL REFERENCES route_plan(route_plan_id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  planner_item_status TEXT NOT NULL,
  origin_airport_id TEXT NOT NULL,
  destination_airport_id TEXT NOT NULL,
  volume_type TEXT NOT NULL,
  passenger_count INTEGER,
  cargo_weight_lb INTEGER,
  payout_amount INTEGER NOT NULL,
  earliest_start_utc TEXT,
  deadline_utc TEXT NOT NULL,
  linked_aircraft_id TEXT,
  linked_schedule_id TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  UNIQUE(route_plan_id, sequence_number)
);

CREATE INDEX idx_route_plan_company ON route_plan(company_id);
CREATE INDEX idx_route_plan_item_route_sequence ON route_plan_item(route_plan_id, sequence_number);
CREATE INDEX idx_route_plan_item_route_status ON route_plan_item(route_plan_id, planner_item_status);
