# FlightLine

FlightLine is an airline and aircraft management simulation project.

## Current Status

This repository is currently a strategy, implementation-design, backend, desktop UI, wireframing, and data foundation workspace.

What exists today:

- product strategy and system design docs in `strategy/`
- implementation-facing backend design docs in `implementation/`
- a TypeScript backend and native SQLite save runtime in `src/`
- persistent save-session reuse and migration-backed save slots in `src/`
- read-side company, contract-board, contract, fleet, staffing, schedule, and event-log query services in `src/`
- an incremental desktop operations UI with a launcher, save-loading screen, in-place tabs, and partial action updates in `src/ui/`
- an Electron desktop shell in `src/desktop/`
- screen wireframes in `wireframes/`
- a local airport reference database in `data/airports/`
- a local aircraft reference database in `data/aircraft/`
- a local save-slot folder in `data/saves/`
- Python scripts that build and enrich the airport database in `scripts/airports/`
- Python scripts that build the aircraft database in `scripts/aircraft/`
- a canonical game-state model for saves, commands, and simulation boundaries in `strategy/game-state-model.md`

What does not exist yet:

- polished production UI implementation
- full scheduled-event and recurring-obligation coverage
- feature-complete automated test coverage

This means the project is still in pre-production, but it now has a real backend, a working native-save path, an initial executable management loop, and a usable internal desktop operations UI instead of docs only.

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
  implementation/
  src/
  wireframes/
  data/
    airports/
    aircraft/
    saves/
  scripts/
    airports/
    aircraft/
  test/
```

Key folders:

- `strategy/`: product, systems, economy, staffing, airport, and generation design docs
- `implementation/`: backend aggregates, command model, schema blueprint, and doc-boundary review
- `src/`: TypeScript backend, save runtime, command handlers, query services, persistence utilities, the incremental local UI server, and the Electron desktop shell
- `wireframes/`: markdown wireframes for the first MVP management screens
- `data/airports/`: local SQLite airport snapshot, schema, and data notes
- `data/aircraft/`: local SQLite aircraft snapshot, schema, and data notes
- `data/saves/`: local save-slot SQLite files and notes
- `scripts/airports/`: airport database build, enrichment, and derived-field scripts
- `scripts/aircraft/`: aircraft database build scripts and curated seed data
- `test/`: backend and lifecycle smoke tests that exercise the current implementation slice

## Start Here

If you are new to the repo, read these first:

1. `strategy/mvp-foundation.md`
2. `strategy/technical-foundation.md`
3. `strategy/game-state-model.md`
4. `strategy/strategy-index.md`
5. `implementation/index.md`
6. `wireframes/index.md`

Useful design clusters:

- product and progression: `strategy/product-pillars.md`, `strategy/gameplay-loop-and-progression.md`
- staffing and aircraft acquisition: `strategy/labor-and-staffing.md`, `strategy/aircraft-acquisition.md`, `strategy/aircraft-data-model.md`, `strategy/aircraft-roster-and-balance.md`, `strategy/msfs-aircraft-alignment.md`
- world data and generation: `strategy/airport-data-strategy.md`, `strategy/content-generation-systems.md`, `strategy/contract-generation-model.md`, `strategy/contract-generator-v1.md`, `strategy/aircraft-market-model.md`, `strategy/staffing-market-model.md`
- simulation and execution: `strategy/technical-foundation.md`, `strategy/game-state-model.md`, `strategy/dispatch-validation-and-time-advance.md`, `strategy/state-and-alert-model.md`, `strategy/time-and-calendar.md`
- backend implementation design: `implementation/backend-domain-model.md`, `implementation/backend-command-model.md`, `implementation/save-schema-blueprint.md`, `implementation/calendar-event-model.md`
- pre-wireframe UX: `strategy/user-flows.md`, `strategy/screen-blueprints.md`

## Current Backend Slice

The first implementation slice now exists in `src/`.

What it does today:

- creates a save-slot SQLite file
- applies the initial save migration set
- records schema migrations inside the save DB
- reuses native SQLite save sessions instead of rewriting whole save files on every command
- implements `CreateSaveGame`
- implements `CreateCompany`
- implements `AcquireAircraft`
- implements `ActivateStaffingPackage`
- implements `SaveScheduleDraft`
- implements `CommitAircraftSchedule`
- implements `RefreshContractBoard`
- implements `AcceptContractOffer`
- implements `AdvanceTime`
- validates starter airports, aircraft acquisitions, draft schedules, and contract origins against the real airport and aircraft reference databases
- persists fleet, staffing packages, labor reservations, scheduled events, recurring obligations, event log, command log, offer windows, contract offers, accepted contracts, saved route plans, and ledger state
- executes scheduled departure, arrival, and contract-deadline events with aircraft-state, contract-state, and ledger effects
- exposes read models for active company state, company contracts, the active contract board, fleet state, staffing state, aircraft schedules, recent event log entries, and saved route-plan state

Current backend entry surface:

- `src/application/backend-service.ts`
- `src/application/commands/create-save-game.ts`
- `src/application/commands/create-company.ts`
- `src/application/commands/acquire-aircraft.ts`
- `src/application/commands/activate-staffing-package.ts`
- `src/application/commands/save-schedule-draft.ts`
- `src/application/commands/commit-aircraft-schedule.ts`
- `src/application/commands/refresh-contract-board.ts`
- `src/application/commands/accept-contract-offer.ts`
- `src/application/commands/advance-time.ts`
- `src/application/queries/company-state.ts`
- `src/application/queries/company-contracts.ts`
- `src/application/queries/contract-board.ts`
- `src/application/queries/event-log.ts`
- `src/application/queries/fleet-state.ts`
- `src/application/queries/schedule-state.ts`
- `src/application/queries/staffing-state.ts`
- `src/infrastructure/persistence/sqlite/sqlite-file-database.ts`
- `src/infrastructure/persistence/sqlite/migrations.ts`
- `src/infrastructure/reference/airport-reference.ts`
- `src/infrastructure/reference/aircraft-reference.ts`

Current test coverage is still intentionally narrow: backend smoke and route-planner coverage now prove save creation, company creation, aircraft acquisition, staffing activation, large-board contract generation, contract acceptance, planner persistence, planner upgrade from candidate to accepted, route-plan draft binding, schedule commit, time advance, duplicate rejection, and contracts-board lifecycle refresh behavior.

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

- `32` aircraft families and `44` aircraft models
- `88` cabin layout rows across the passenger-capable fleet
- world-roster coverage that includes both MSFS-overlap and non-MSFS aircraft
- weight, dimension, payload, fuel, runway, airport-size, gate, and ground-service fields
- current MSFS status split of `30` confirmed available, `1` confirmed unavailable, and `13` not yet verified

The current aircraft database is intended to support:

- aircraft market generation
- staffing qualification checks
- airport compatibility filtering
- contract fit logic
- fleet acquisition and progression systems
- future airframe-level maintenance and dispatch systems

See `data/aircraft/README.md` for details.

## Aircraft Data Pipeline

The current aircraft tooling lives in `scripts/aircraft/`.

Main scripts:

- `build_aircraft_db.py`: creates the SQLite aircraft database from the curated seed
- `starter_seed.py`: defines the current family roster, model specs, cabin layouts, and MSFS metadata

Important note:

- the committed SQLite snapshot is self-contained for project use
- MSFS metadata is tracked as a user-facing crosswalk on top of a broader aircraft catalog, not as the only gate on what planes can exist in FlightLine

## Local UI

An internal desktop operations UI now exists at:

- `src/ui/server.ts`

It currently supports:

- a simplified launcher for creating, opening, and deleting local save slots
- a dedicated save-opening shell with a staged loading screen and airplane progress bar
- bootstrap-first save loading so the shell opens before heavy tabs like contracts
- client-side in-save tabs that load in place instead of full-window navigation
- partial JSON action updates for company creation, aircraft acquisition, staffing activation, route-plan editing, route-plan dispatch binding, auto-planning, schedule commit, contract acceptance, and time advance
- a persistent contracts board with 200+ offers, client-side search/filtering, in-place acceptance, endpoint-aware chaining, a saved route planner, and a route map
- route-plan handoff in Dispatch plus auto-planning, committing, and reviewing schedules
- advancing time and reviewing recent operational events
- timing logs for bootstrap, tab loads, contract-board lifecycle, and in-save action endpoints
- fixed-window desktop behavior where scrolling stays inside panels instead of the full app window

Run it in the browser with:

- `npm run ui`
- then open `http://localhost:4321`

Run it as a desktop app with:

- `npm run desktop`

The Electron entrypoint lives at `src/desktop/main.ts`.

## Recommended Technical Direction

The current technical recommendation is:

- TypeScript for domain and UI code
- native SQLite for persistence and save slots
- Electron for the current desktop shell
- optional richer client framework later if the local operations UI outgrows the current TypeScript + server-rendered shell approach

Target architecture:

- deterministic domain engine
- application layer for use cases and transaction boundaries
- persistence layer for reference data and save state
- presentation layer for management screens

See `strategy/technical-foundation.md`, `strategy/game-state-model.md`, and `implementation/index.md` for the full rationale, state boundaries, and backend implementation shape.

## Immediate Next Step

The next implementation milestone should broaden the now-working execution loop and local UI:

- add broader event coverage for recurring obligations, maintenance tasks, and failure recovery
- add richer read models for execution history, alerts, and ledger views
- expand the local operations UI from the current internal tool into a fuller playable management surface

That milestone should turn the current internal operations UI into the first genuinely playable vertical slice before broader polish or deeper simulation expansion.

## Design Standard

New design work in this repository should answer four questions clearly:

- What player decision does this create?
- What information does the player need before committing?
- How does the system scale from one aircraft to many?
- What repetitive work can be reduced without flattening the strategy?

## Working Notes

- The airport and aircraft SQLite files are intentionally tracked in git as versioned reference snapshots.
- Save-slot SQLite files are intentionally local and ignored by git.
- SQLite sidecar files such as `*.sqlite-wal` and `*.sqlite-shm` are ignored.
- Raw source snapshots are treated as local workspace assets unless explicitly committed.
- The repo is currently optimized for strategic design, data preparation, and early backend implementation.

## Roadmap From Here

The current best next sequence is:

1. expose the first playable vertical slice in UI on top of the current backend slice
2. expand execution coverage for recurring obligations, maintenance, alerts, and recovery flows
3. expand balancing and secondary systems once the core loop runs end to end


