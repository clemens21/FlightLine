# FlightLine Aircraft Data

This folder stores the normalized aircraft reference dataset for FlightLine.

## Current Contents

Tracked assets in this folder:

- `flightline-aircraft.sqlite`: canonical aircraft reference snapshot for the game
- `schema/001_initial.sql`: SQLite schema for aircraft families, models, layouts, and tags

Supporting build files:

- `scripts/aircraft/build_aircraft_db.py`
- `scripts/aircraft/starter_seed.py`

## Current Snapshot

The current committed aircraft database contains:

- `32` aircraft families
- `44` aircraft models
- `88` cabin layout rows
- `30` models marked `confirmed_available` for MSFS 2024 users
- `1` model marked `confirmed_unavailable`
- `13` models marked `not_verified`

This is now a real world-facing starter catalog, not just an MSFS-overlap shortlist.

## What The Database Now Covers

Per aircraft model, the database now carries:

- family and variant identity
- passenger and cargo capacity
- weight data such as MTOW, OEW, and max payload
- cargo volume and fuel capacity
- range, speed, and runway needs
- physical dimensions and reference-code style airport fit signals
- airport-size, gate, and ground-service compatibility
- staffing, maintenance, and operating-cost bands
- MSFS 2024 availability metadata

Per passenger-capable model, the database also carries cabin layout options with:

- total seats
- first/business/premium-economy/economy split
- cargo capacity under that layout

## MSFS Availability Semantics

Every aircraft model carries user-facing MSFS metadata so the game can tell the player whether a plane is actually available to them in the current MSFS ecosystem.

Current status values:

- `confirmed_available`: we have a current source-backed MSFS path for the user
- `confirmed_unavailable`: we have a current source showing the model is not available to the user in MSFS 2024
- `not_verified`: FlightLine has not yet confirmed a current MSFS 2024 path

Important rule:

- MSFS status is metadata on top of the FlightLine catalog
- it is not the rule that determines whether an aircraft may exist in the game world

## Schema Shape

Current tables:

- `aircraft_family`
- `aircraft_model`
- `aircraft_cabin_layout`
- `aircraft_tag`

Current views:

- `aircraft_user_catalog`
- `aircraft_layout_catalog`
- `aircraft_family_catalog`

## Rebuild

Rebuild the local aircraft database with:

```powershell
cd Z:\projects\FlightLine
python scripts/aircraft/build_aircraft_db.py
```

The builder rewrites `data/aircraft/flightline-aircraft.sqlite` from the schema and the curated seed module.

## Data Philosophy

FlightLine should not try to mirror every aircraft SKU from every simulator storefront.

The current aircraft dataset is:

- curated
- family-based
- broad enough to include non-MSFS aircraft
- normalized to one unit system
- tuned for gameplay readability
- rich enough to drive airport access, staffing, market, and contract logic
- crosswalked to MSFS 2024 availability without becoming store-shaped

## Current Design References

The main design sources for this folder are:

- `strategy/aircraft-data-model.md`
- `strategy/aircraft-roster-and-balance.md`
- `strategy/msfs-aircraft-alignment.md`
- `strategy/aircraft-acquisition.md`
- `strategy/aircraft-market-model.md`

## Next Step

The next aircraft-data step is using this reference layer to drive:

- aircraft market generation
- airport compatibility filtering
- staffing qualification checks
- contract-fit logic
- future airframe-level maintenance and acquisition systems
