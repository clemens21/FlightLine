ALTER TABLE named_pilot
  ADD COLUMN first_name TEXT;

ALTER TABLE named_pilot
  ADD COLUMN last_name TEXT;

ALTER TABLE named_pilot
  ADD COLUMN home_city TEXT;

ALTER TABLE named_pilot
  ADD COLUMN home_region_code TEXT;

ALTER TABLE named_pilot
  ADD COLUMN home_country_code TEXT;

UPDATE named_pilot
SET
  first_name = COALESCE(first_name, CASE
    WHEN INSTR(display_name, ' ') > 0 THEN TRIM(SUBSTR(display_name, 1, INSTR(display_name, ' ') - 1))
    ELSE TRIM(display_name)
  END),
  last_name = COALESCE(last_name, CASE
    WHEN INSTR(display_name, ' ') > 0 THEN TRIM(SUBSTR(display_name, INSTR(display_name, ' ') + 1))
    ELSE TRIM(display_name)
  END)
WHERE COALESCE(display_name, '') <> '';

ALTER TABLE staffing_offer
  ADD COLUMN first_name TEXT;

ALTER TABLE staffing_offer
  ADD COLUMN last_name TEXT;

ALTER TABLE staffing_offer
  ADD COLUMN home_city TEXT;

ALTER TABLE staffing_offer
  ADD COLUMN home_region_code TEXT;

ALTER TABLE staffing_offer
  ADD COLUMN home_country_code TEXT;

UPDATE staffing_offer
SET
  first_name = COALESCE(first_name, CASE
    WHEN INSTR(display_name, ' ') > 0 THEN TRIM(SUBSTR(display_name, 1, INSTR(display_name, ' ') - 1))
    ELSE TRIM(display_name)
  END),
  last_name = COALESCE(last_name, CASE
    WHEN INSTR(display_name, ' ') > 0 THEN TRIM(SUBSTR(display_name, INSTR(display_name, ' ') + 1))
    ELSE TRIM(display_name)
  END)
WHERE COALESCE(display_name, '') <> '';
