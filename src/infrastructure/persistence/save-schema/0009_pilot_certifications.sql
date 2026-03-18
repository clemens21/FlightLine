ALTER TABLE named_pilot
  ADD COLUMN certifications_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE named_pilot
  ADD COLUMN training_target_certification_code TEXT;

UPDATE named_pilot
SET certifications_json = CASE (
  SELECT qualification_group
  FROM staffing_package
  WHERE staffing_package_id = named_pilot.staffing_package_id
)
  WHEN 'single_turboprop_utility' THEN '["SEPL"]'
  WHEN 'single_turboprop_premium' THEN '["SEPL"]'
  WHEN 'twin_turboprop_utility' THEN '["SEPL","MEPL"]'
  WHEN 'twin_turboprop_commuter' THEN '["SEPL","MEPL"]'
  ELSE '[]'
END
WHERE certifications_json IS NULL OR certifications_json = '[]';

ALTER TABLE staffing_offer
  ADD COLUMN certifications_json TEXT NOT NULL DEFAULT '[]';

UPDATE staffing_offer
SET certifications_json = CASE qualification_group
  WHEN 'single_turboprop_utility' THEN '["SEPL"]'
  WHEN 'single_turboprop_premium' THEN '["SEPL"]'
  WHEN 'twin_turboprop_utility' THEN '["SEPL","MEPL"]'
  WHEN 'twin_turboprop_commuter' THEN '["SEPL","MEPL"]'
  ELSE '[]'
END
WHERE labor_category = 'pilot'
  AND (certifications_json IS NULL OR certifications_json = '[]');
