# FlightLine Aircraft Data

This folder is reserved for normalized aircraft reference data.

The project is not storing the aircraft dataset here yet, but this is the intended home for it once the first starter roster is authored.

## Planned Contents

Recommended future files or tables:

- `aircraft_family`
- `aircraft_model`
- `aircraft_model_variant` later if needed
- `aircraft_offer_template` later if market templating becomes useful

## Data Philosophy

FlightLine should not try to ship every real-world sub-variant in MVP.

The initial aircraft dataset should be:

- curated
- family-based
- normalized to one unit system
- tuned for gameplay readability
- separated into authored facts and derived gameplay tags

## Current Design References

The current design source for this folder is:

- `strategy/aircraft-data-model.md`
- `strategy/aircraft-roster-and-balance.md`
- `strategy/aircraft-acquisition.md`
- `strategy/aircraft-market-model.md`

## Immediate Next Step

Populate the first starter dataset with:

- `6` to `8` aircraft families
- `8` to `12` marketable variants
- qualification groups
- market role pools
- acquisition price bands
- operating-cost and maintenance bands
