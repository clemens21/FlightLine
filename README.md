# FlightLine

FlightLine is an airline and aircraft management simulation project.

## Current Status

This repository is currently a strategy, wireframing, and data foundation workspace.

What exists today:

- product strategy and system design docs in `strategy/`
- screen wireframes in `wireframes/`
- a local airport reference database in `data/airports/`
- a local aircraft reference database in `data/aircraft/`
- Python scripts that build and enrich the airport database in `scripts/airports/`
- Python scripts that build the aircraft database in `scripts/aircraft/`

What does not exist yet:

- application scaffold
- simulation engine implementation
- UI implementation
- save-game model
- test suite

This means the project is still in pre-production. The product shape is being defined before code architecture hardens.

## Product Direction

FlightLine should begin as a management sim where the player:

- creates and grows an airline company
- acquires aircraft through purchase, financing, or lease
- acquires operating capability through pilots, flight attendants, mechanics, and support staffing
- evaluates contracts and builds schedules
- advances time and resolves flight operations, costs, wear, and maintenance
- expands from a small operator into a more capable company

MVP explicitly excludes Microsoft Flight Simulator integration.

## Core Design Goals

- Make planning legible before commitment.
- Reduce repetitive busywork without flattening strategy.
- Preserve meaningful tradeoffs around aircraft fit, runway limits, labor, maintenance, and cash flow.
- Support both active optimization and more passive strategic play.
- Keep the simulation explainable enough that the player can learn from outcomes.

## Repository Map

```text
FlightLine/
  README.md
  strategy/
  wireframes/
  data/
    airports/
    aircraft/
  scripts/
    airports/
    aircraft/
```

Key folders:

- `strategy/`: product, systems, economy, staffing, airport, and generation design docs
- `wireframes/`: markdown wireframes for the first MVP management screens
- `data/airports/`: local SQLite airport snapshot, schema, and data notes
- `data/aircraft/`: local SQLite aircraft snapshot, schema, and data notes
- `scripts/airports/`: airport database build, enrichment, and derived-field scripts
- `scripts/aircraft/`: aircraft database build scripts and curated starter seed data

## Start Here

If you are new to the repo, read these first:

1. `strategy/mvp-foundation.md`
2. `strategy/technical-foundation.md`
3. `strategy/strategy-index.md`
4. `wireframes/index.md`

Useful design clusters:

- product and progression: `strategy/product-pillars.md`, `strategy/gameplay-loop-and-progression.md`
- staffing and aircraft acquisition: `strategy/labor-and-staffing.md`, `strategy/aircraft-acquisition.md`, `strategy/aircraft-data-model.md`, `strategy/aircraft-roster-and-balance.md`, `strategy/msfs-aircraft-alignment.md`
- world data and generation: `strategy/airport-data-strategy.md`, `strategy/content-generation-systems.md`, `strategy/contract-generation-model.md`, `strategy/aircraft-market-model.md`, `strategy/staffing-market-model.md`
- pre-wireframe UX: `strategy/user-flows.md`, `strategy/state-and-alert-model.md`, `strategy/screen-blueprints.md`

## Wireframes

Current wireframe set:

- dashboard
- contracts
- dispatch
- fleet
- staffing
- aircraft acquisition
- staffing acquisition

These are stored in `wireframes/` as markdown documents and are intended to feed later UI implementation and further strategy iteration.

## Airport Database

The repository includes a tracked SQLite airport reference snapshot at:

- `data/airports/flightline-airports.sqlite`

Current airport database characteristics:

- multi-source world snapshot with current OurAirports enrichment and legacy fallback coverage
- raw airport facts plus derived gameplay-facing fields
- timezone populated from latitude and longitude
- `airport_size` populated on a 1 to 5 scale
- first-pass generation fields populated, including passenger, cargo, remote, tourism, and business scoring, along with demand archetypes and market regions

The current database is intended to support:

- contract generation
- aircraft market generation
- staffing market generation
- airport filtering and access rules
- later route and demand simulation work

See `data/airports/README.md` for details.

## Airport Data Pipeline

The current airport tooling lives in `scripts/airports/`.

Main scripts:

- `build_airport_db.py`: creates the initial SQLite database from the legacy bootstrap source
- `enrich_from_ourairports.py`: overlays current OurAirports airport, runway, frequency, country, and region data
- `apply_derived_airport_fields.py`: derives timezone and `airport_size`
- `apply_airport_generation_tags.py`: derives gameplay-facing generation fields and airport tags

Important note:

- the committed SQLite snapshot is self-contained for project use
- a full rebuild from the original bootstrap path still depends on a local legacy JSON source outside this repository

## Aircraft Database

The repository includes a tracked SQLite aircraft reference snapshot at:

- `data/aircraft/flightline-aircraft.sqlite`

Current aircraft database characteristics:

- `15` curated aircraft families and `19` aircraft models
- clear user-facing MSFS 2024 status for every aircraft model
- current MSFS status split of `16` confirmed available, `1` confirmed unavailable, and `2` not yet verified
- normalized family, model, and tag tables with views for user catalog and family summaries
- a deliberately curated roster rather than a store-shaped mirror of every addon SKU

The current aircraft database is intended to support:

- aircraft market generation
- staffing qualification checks
- aircraft-to-airport compatibility rules
- contract fit logic
- later fleet acquisition, maintenance, and progression systems

See `data/aircraft/README.md` for details.

## Aircraft Data Pipeline

The current aircraft tooling lives in `scripts/aircraft/`.

Main scripts:

- `build_aircraft_db.py`: creates the SQLite aircraft database from the curated starter seed
- `starter_seed.py`: defines the current starter family and model roster with MSFS availability metadata

Important note:

- the committed SQLite snapshot is self-contained for project use
- MSFS metadata is tracked at the aircraft-model level so the player can see whether a plane is actually available to them in the current sim ecosystem

## Recommended Technical Direction

The current technical recommendation is:

- TypeScript for domain and UI code
- React for the management interface
- SQLite for persistence
- Tauri later for desktop packaging

Target architecture:

- deterministic domain engine
- application layer for use cases and transaction boundaries
- persistence layer for reference data and save state
- presentation layer for management screens

See `strategy/technical-foundation.md` for the full rationale.

## Immediate Next Step

The next implementation milestone should use the airport and aircraft reference layers to prove the first real game code slice:

- scaffold the TypeScript project
- define core domain types
- load airport and aircraft reference data
- generate a minimal aircraft market
- generate a minimal staffing model
- generate contracts
- assign one contract to one aircraft
- advance time to resolution
- persist and reload company state

That milestone should prove the architecture before broader UI polish or deeper simulation expansion.

## Design Standard

New design work in this repository should answer four questions clearly:

- What player decision does this create?
- What information does the player need before committing?
- How does the system scale from one aircraft to many?
- What repetitive work can be reduced without flattening the strategy?

## Working Notes

- The airport and aircraft SQLite files are intentionally tracked in git as versioned reference snapshots.
- SQLite sidecar files such as `*.sqlite-wal` and `*.sqlite-shm` are ignored.
- Raw source snapshots are treated as local workspace assets unless explicitly committed.
- The repo is currently optimized for strategic design and data preparation, not yet active game development.

## Roadmap From Here

The current best next sequence is:

1. turn airport-derived tags into concrete contract generation rules
2. use the aircraft and airport reference data to prototype aircraft market and contract generation behavior
3. define staffing capability packages and qualification rules
4. scaffold the application and domain layers
5. implement the first playable vertical slice
