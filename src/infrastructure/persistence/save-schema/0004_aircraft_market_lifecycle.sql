ALTER TABLE aircraft_offer ADD COLUMN listed_at_utc TEXT;
ALTER TABLE aircraft_offer ADD COLUMN available_until_utc TEXT;
ALTER TABLE aircraft_offer ADD COLUMN closed_at_utc TEXT;
ALTER TABLE aircraft_offer ADD COLUMN close_reason TEXT;

UPDATE aircraft_offer
SET listed_at_utc = COALESCE(
      listed_at_utc,
      (SELECT generated_at_utc FROM offer_window WHERE offer_window.offer_window_id = aircraft_offer.offer_window_id)
    ),
    available_until_utc = COALESCE(
      available_until_utc,
      (SELECT expires_at_utc FROM offer_window WHERE offer_window.offer_window_id = aircraft_offer.offer_window_id)
    )
WHERE listed_at_utc IS NULL
   OR available_until_utc IS NULL;

UPDATE aircraft_offer
SET closed_at_utc = COALESCE(
      closed_at_utc,
      CASE
        WHEN offer_status = 'expired' THEN (SELECT expires_at_utc FROM offer_window WHERE offer_window.offer_window_id = aircraft_offer.offer_window_id)
        ELSE NULL
      END
    ),
    close_reason = COALESCE(
      close_reason,
      CASE
        WHEN offer_status = 'expired' THEN 'expired'
        WHEN offer_status = 'acquired' THEN 'acquired'
        ELSE NULL
      END
    )
WHERE offer_status <> 'available';

CREATE INDEX idx_aircraft_offer_window_lifecycle
  ON aircraft_offer(offer_window_id, offer_status, available_until_utc);

CREATE INDEX idx_aircraft_offer_company_lifecycle
  ON aircraft_offer(company_id, offer_status, available_until_utc);
