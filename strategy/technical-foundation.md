# FlightLine Technical Foundation

## Recommendation

Build MVP as a local-first management sim with a deterministic domain engine and a separate UI layer.

Recommended stack:

- TypeScript for both simulation and UI
- React for management screens
- SQLite for persistence
- Tauri for desktop packaging once the browser build is stable

This is the fastest path to a playable management game with strong UI, low deployment friction, and a clean upgrade path if online services are added later.

## Why This Stack

- The game is data-heavy and UI-heavy, not graphics-heavy.
- A web-style UI is a better fit than a 3D engine for airline management screens.
- TypeScript lets the simulation rules, validation logic, and UI models share types.
- SQLite is ideal for local saves, seeded world data, and event history.
- Tauri keeps the app lightweight while still allowing a native desktop product later.

## Architecture

Split the project into four logical layers:

### 1. Domain Engine

Pure simulation logic with no UI dependencies.

Responsibilities:

- entity definitions
- schedule validation
- contract generation
- aircraft acquisition and financing rules
- staffing qualification and capacity rules
- time advancement
- maintenance and wear calculations
- financial calculations
- progression rules

This layer should be deterministic and testable.

### 2. Application Layer

Coordinates use cases around the domain.

Responsibilities:

- create company
- acquire aircraft
- acquire staffing
- accept contract
- assign aircraft
- advance time
- schedule maintenance
- save/load state

This is where command handlers and transaction boundaries live.

### 3. Persistence Layer

Stores game state and reference data.

Responsibilities:

- airport data
- aircraft model data
- current save state
- event history
- snapshots/autosave

### 4. Presentation Layer

React app for all player interaction.

Initial screens:

- company dashboard
- contract board
- fleet view
- staffing view
- aircraft detail
- scheduler/dispatch board
- finance report
- maintenance queue

## Data Model

The canonical save boundaries and entity responsibilities for MVP are defined in [game-state-model.md](/Z:/projects/FlightLine/strategy/game-state-model.md). This document stays at the architecture level; that one should be treated as the implementation-facing source of truth for state.

Core entities for MVP:

- `Company`
- `CompanyLedgerEntry`
- `Airport`
- `AircraftModel`
- `Aircraft`
- `AircraftOffer`
- `StaffingPlan`
- `LaborContract`
- `QualificationCoverage`
- `Contract`
- `FlightAssignment`
- `FlightLeg`
- `MaintenanceTask`
- `GameClock`
- `SaveGame`

Key relationships:

- a company owns or leases many aircraft
- an aircraft references one aircraft model
- a company carries staffing plans and labor contracts that determine available operating capacity
- a contract can create one or more flight assignments
- a flight assignment belongs to one aircraft
- a maintenance task belongs to one aircraft

## Suggested Simulation Approach

Use event-driven state transitions instead of continuous per-second simulation.

Examples:

- when a schedule is confirmed, generate planned flight events
- when time advances past departure, mark leg in progress
- when time advances past arrival, resolve payout, costs, labor usage, and wear
- when maintenance starts or ends, update aircraft availability
- when staffing changes are committed, update qualification coverage and capacity limits

This keeps the system efficient and easy to save, replay, and test.

## Economic Model for MVP

Keep the first model simple but structured.

Each completed flight should calculate:

- contract revenue
- fuel cost
- airport fees
- flight labor cost
- cabin labor cost where required
- maintenance reserve accrual
- maintenance labor or service allocation
- lease/finance accrual
- repositioning cost if no revenue leg is attached

Expose these numbers to the player before and after execution.

## Save Strategy

Use a hybrid persistence model:

- static reference tables for airports and aircraft models
- normalized save-state tables for active game entities
- append-only event log for audit/debugging

Autosave at the end of every successful command that changes the company state.

## Testing Strategy

Priority tests:

- schedule validation rules
- staffing qualification and capacity rules
- profitability calculations
- time advancement across overlapping assignments
- maintenance availability rules
- contract deadline resolution
- aircraft acquisition payment obligations

The domain engine should have high automated test coverage before investing in polished UI.

## First Implementation Slice

The first coding milestone should not try to build the full game. It should prove the architecture.

Milestone 1:

- initialize project structure
- define core types
- seed small airport and aircraft datasets
- implement company creation
- implement a minimal aircraft market
- implement a minimal staffing model
- generate basic contracts
- assign one contract to one aircraft
- advance time until resolution
- persist and reload game state
- display results in a minimal dashboard

If that works cleanly, the rest of the MVP can be layered on with less rework.

## Proposed Folder Shape

```text
FlightLine/
  strategy/
  wireframes/
  src/
    domain/
    application/
    infrastructure/
    ui/
  data/
    airports/
    aircraft/
  tests/
```

## Immediate Next Step

Use the implementation docs in [implementation/index.md](/Z:/projects/FlightLine/implementation/index.md) to scaffold the backend domain and persistence layers.

The first backend slice should cover:

- company and finance state
- aircraft and acquisition agreements
- staffing packages and labor allocation
- contract offer windows and accepted contracts
- aircraft schedules and flight legs
- maintenance state and tasks
- game clock and event history

That gives us the backbone needed for the first playable management loop.


