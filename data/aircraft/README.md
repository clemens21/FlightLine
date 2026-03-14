# FlightLine Aircraft Data

This folder stores the normalized aircraft reference dataset for FlightLine.

## Current Contents

Tracked assets in this folder:

- `flightline-aircraft.sqlite`: starter aircraft reference snapshot
- `schema/001_initial.sql`: SQLite schema for the aircraft catalog

Supporting build script:

- `scripts/aircraft/build_aircraft_db.py`
- `scripts/aircraft/starter_seed.py`

## Current Starter Snapshot

The current committed aircraft database contains:

- `15` aircraft families
- `19` aircraft models
- `16` models marked `confirmed_available` for MSFS 2024 users
- `1` model marked `confirmed_unavailable`
- `2` models marked `not_verified`

The starter roster is intentionally curated rather than exhaustive. It is meant to cover the early and midgame management lanes before the project grows into a larger catalog.

## MSFS Availability Semantics

Every aircraft model carries user-facing MSFS metadata so the game can tell the player whether a plane is actually available to them in the current MSFS ecosystem.

Current status values:

- `confirmed_available`: we have a current source-backed MSFS path for the user
- `confirmed_unavailable`: we have a current source showing the model is not available to the user in MSFS 2024
- `not_verified`: FlightLine has not yet confirmed a current MSFS 2024 path

The `aircraft_user_catalog` view turns those into user-facing labels and keeps the explanatory note with the row.

## Schema Shape

Current tables:

- `aircraft_family`
- `aircraft_model`
- `aircraft_tag`

Current views:

- `aircraft_user_catalog`
- `aircraft_family_catalog`

## Rebuild

Rebuild the local aircraft database with:

```powershell
cd Z:\projects\FlightLine
python scripts/aircraft/build_aircraft_db.py
```

The builder rewrites `data/aircraft/flightline-aircraft.sqlite` from the schema and the curated seed module.

## Data Philosophy

FlightLine should not try to ship every real-world sub-variant in MVP.

The current aircraft dataset is:

- curated
- family-based
- normalized to one unit system
- tuned for gameplay readability
- separated into authored facts and derived gameplay tags
- crosswalked to MSFS 2024 availability without becoming store-shaped

## Current Design References

The main design sources for this folder are:

- `strategy/aircraft-data-model.md`
- `strategy/aircraft-roster-and-balance.md`
- `strategy/msfs-aircraft-alignment.md`
- `strategy/aircraft-acquisition.md`
- `strategy/aircraft-market-model.md`

## Next Step

The next aircraft-data step is not more catalog authoring by default. It is using this starter dataset to drive:

- aircraft market generation
- staffing qualification checks
- airport access filtering
- first contract-fit logic
