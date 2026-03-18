ALTER TABLE named_pilot
  ADD COLUMN travel_origin_airport_id TEXT;

ALTER TABLE named_pilot
  ADD COLUMN travel_destination_airport_id TEXT;

ALTER TABLE named_pilot
  ADD COLUMN travel_started_at_utc TEXT;

ALTER TABLE named_pilot
  ADD COLUMN travel_until_utc TEXT;
