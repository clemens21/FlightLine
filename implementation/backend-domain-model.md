# Backend Domain Model

## Purpose

This document defines the backend write-model boundaries for FlightLine.

It is the implementation-facing follow-on to:

- [game-state-model.md](/Z:/projects/FlightLine/strategy/game-state-model.md)
- [contract-generator-v1.md](/Z:/projects/FlightLine/strategy/contract-generator-v1.md)
- [dispatch-validation-and-time-advance.md](/Z:/projects/FlightLine/strategy/dispatch-validation-and-time-advance.md)

The goal is to make backend implementation coherent before code is written.

## Design Goal

The backend domain model should answer four questions clearly:

- which object owns the truth for a given rule
- which data can be mutated together in one command
- which state is append-only history versus current canonical state
- which data belongs in reference databases versus save data

## Core Principles

### 1. Keep reference data outside the save model

The save backend should reference airport and aircraft rows by id.

It should not copy static source data like:

- runway facts
- aircraft cruise speed
- aircraft base payload
- airport timezones

### 2. Keep aggregates small enough to reason about

FlightLine is local-first and can use SQLite transactions across multiple aggregates, but the domain objects still need clear boundaries.

We do not want one giant `CompanyEverything` aggregate.

### 3. Application services coordinate cross-aggregate work

Important commands will touch multiple aggregates.

Examples:

- accepting a contract touches an offer window and creates a company contract
- committing a schedule touches fleet, staffing, contracts, schedules, and the event queue
- advancing time touches almost everything

That is acceptable.

The application layer should coordinate those changes inside one transaction.

### 4. Append-only history stays separate from current state

`LedgerEntry`, `EventLogEntry`, and execution history should be durable records.

They should not be overloaded as the source of current truth.

### 5. Derived UI state is not backend truth

The backend should not treat these as authoritative:

- alert cards
- dashboard counts
- aircraft readiness badges
- contract fit labels
- staffing coverage summaries

Those are read models derived from canonical backend state.

## Recommended Backend Modules

These are code-level module boundaries, not microservices.

Recommended modules:

- `save_runtime`
- `company`
- `finance`
- `fleet`
- `staffing`
- `offers`
- `contracts`
- `dispatch`
- `maintenance`
- `simulation`
- `events`

These modules can live inside one local app and one save database.

## Aggregate Catalog

## 1. Save Runtime Aggregate

### Root

- `SaveGame`

### Owns

- save metadata
- world seed
- difficulty profile
- reference snapshot versions
- active company id

### Does Not Own

- live contract board rows
- aircraft schedules
- company cash

### Why It Exists

This aggregate defines what save is being loaded and which reference snapshots it expects.

It changes rarely.

## 2. Company Aggregate

### Root

- `Company`

### Owns

- company identity
- reputation score
- progression tier or phase
- company policy flags later
- base footprint references

### Child Records

- `CompanyBase`
- `AirportRelationship` if used

### Does Not Own

- ledger history
- airframes
- accepted contracts
- staffing allocations

### Backend Rule

`Company` owns strategic identity and footprint, not every operational state change.

## 3. Finance Aggregate

### Root

- `CompanyFinancialState`

### Owns

- current cash
- financial pressure band input state
- reserve balances if separated later
- current liability summaries if needed

### Child Records

- `RecurringObligation`

### Append-Only Children

- `LedgerEntry`

### Does Not Own

- aircraft commercial terms in detail
- contract terms themselves

### Backend Rule

The finance aggregate owns the current money state.

`LedgerEntry` is the durable history of how it changed.

## 4. Fleet Aggregate

### Root

- `CompanyAircraft`

### Owns

- aircraft model reference id
- active cabin layout id
- current airport id
- aircraft live status inputs
- hours and cycles
- condition inputs
- delivery and disposal state later

### Child Records

- `AcquisitionAgreement`
- `MaintenanceProgramState`

### External Links

- active schedule id
- active maintenance task id

### Does Not Own

- schedule legs
- contract terms
- labor coverage summaries

### Backend Rule

Fleet owns the live airframe, not the work assigned to it.

## 5. Staffing Aggregate

### Root

- `StaffingPackage`

MVP staffing is pooled capability, so the backend should think in packages rather than named employees.

### Owns

- labor category
- employment model
- qualification group
- coverage units
- fixed and variable cost terms
- active date window
- home region or service region

### Child Records

- `LaborAllocation`

### Does Not Own

- aircraft schedules
- flight legs
- staffing warning badges

### Backend Rule

The staffing aggregate owns actual capacity and reservations.

Coverage labels such as `covered` or `tight` are derived.

## 6. Offer Window Aggregate

### Root

- `OfferWindow`

### Owns

- generation seed
- generation context hash
- creation and expiry timestamps
- refresh reason
- offer row membership

### Child Records

- `ContractOffer`
- `AircraftMarketOffer`
- `StaffingMarketOffer`

### Does Not Own

- accepted commercial commitments after acceptance
- acquired aircraft
- activated staffing packages

### Backend Rule

Offers remain inside the offer window until they are accepted, expired, or removed.

Accepted work must be copied into durable company-owned aggregates.

## 7. Contract Aggregate

### Root

- `CompanyContract`

### Owns

- accepted commercial terms
- contract state
- payout and penalty model
- deadline
- accepted volume and route
- origin offer id if any

### Does Not Own

- the flight leg sequence chosen to serve it
- aircraft assignment timing details

### Backend Rule

A contract owns the business commitment.

A schedule owns how the player plans to fulfill it.

## 8. Dispatch Aggregate

### Root

- `AircraftSchedule`

### Owns

- one aircraft's committed or draft plan
- schedule state
- validation snapshot
- ordered leg list
- planned timing

### Child Records

- `FlightLeg`
- optional `ScheduleValidationSnapshot` later

### Does Not Own

- aircraft technical state
- contract commercial truth
- staffing capacity truth

### Backend Rule

One committed active schedule per aircraft is the MVP invariant.

This aggregate is the operational plan for that aircraft only.

## 9. Maintenance Aggregate

### Roots

- `MaintenanceTask`
- `MaintenanceProgramState`

These are related but distinct.

### `MaintenanceProgramState` Owns

- service-threshold progress
- current maintenance due status inputs
- last service markers
- AOG input state

### `MaintenanceTask` Owns

- planned or active service work
- provider source
- planned and actual timing
- cost estimate and actual cost
- execution state

### Backend Rule

Program state answers "how worn is this airframe?"

Task state answers "what maintenance action is currently booked or happening?"

## 10. Simulation Aggregate

### Root

- `GameClock`

### Child Records

- `ScheduledEvent`

### Owns

- current UTC time
- stop-condition preferences
- event queue timestamps
- last advance result summary

### Does Not Own

- the resulting state transitions on aircraft or contracts

### Backend Rule

`GameClock` and the scheduled event queue decide when transitions happen.

Other aggregates own what those transitions mean.

## 11. Event History Aggregate

### Root

- none required as a mutable aggregate root

### Durable Records

- `EventLogEntry`
- `OperationalExecution` if stored as separate rows

### Backend Rule

Event history is append-only support data for replay, debugging, feeds, and reports.

It is not the primary current-state container.

## Ownership Of Truth

These are the important truth boundaries the backend must preserve.

### Company cash

Owned by:

- `CompanyFinancialState`

Explained by:

- `LedgerEntry`

### Aircraft current location and wear

Owned by:

- `CompanyAircraft`
- `MaintenanceProgramState`

### Whether a contract is commercially committed

Owned by:

- `CompanyContract`

### Whether a contract is still just an offer

Owned by:

- `OfferWindow` plus `ContractOffer`

### Whether staffing is actually reserved for a planned operation

Owned by:

- `StaffingPackage`
- `LaborAllocation`

### Whether a schedule is committed

Owned by:

- `AircraftSchedule`

### Whether maintenance is booked or active

Owned by:

- `MaintenanceTask`

### What time it is and what fires next

Owned by:

- `GameClock`
- `ScheduledEvent`

## Cross-Aggregate Transactions

Because FlightLine is local-first and SQLite-backed, the application layer should use one transaction for commands that must update multiple aggregates together.

Important examples:

### `AcceptContractOffer`

Touches:

- `OfferWindow`
- `CompanyContract`
- `EventLogEntry`

### `CommitAircraftSchedule`

Touches:

- `AircraftSchedule`
- `CompanyAircraft`
- `CompanyContract`
- `LaborAllocation`
- `MaintenanceTask` if scheduled
- `ScheduledEvent`
- `EventLogEntry`

### `AdvanceTime`

Touches:

- `GameClock`
- `ScheduledEvent`
- `AircraftSchedule`
- `FlightLeg`
- `CompanyAircraft`
- `CompanyContract`
- `LaborAllocation`
- `MaintenanceProgramState`
- `MaintenanceTask`
- `CompanyFinancialState`
- `LedgerEntry`
- `EventLogEntry`

The aggregates stay separate for clarity even when commands update several of them together.

## Recommended Code Shape

Recommended future folder shape inside `src/domain/`:

```text
src/domain/
  save_runtime/
  company/
  finance/
  fleet/
  staffing/
  offers/
  contracts/
  dispatch/
  maintenance/
  simulation/
  events/
```

Each module should expose:

- aggregate types
- invariants
- domain helpers or calculators
- repository interfaces later

## Backend Invariants

These are the minimum invariants the backend should enforce regardless of UI.

- one active company per save
- one committed active schedule per aircraft
- a contract cannot be assigned to multiple aircraft schedules at once
- labor allocations cannot exceed provided coverage units
- an aircraft cannot depart from an airport it is not at
- a maintenance hard stop prevents dispatch commit and departure
- offer rows cannot remain `available` after acceptance
- reference data is linked by id, not copied into save tables except where values are intentionally frozen commercially

## What Should Stay Out Of Aggregate State

Do not persist these as authoritative aggregate fields unless performance later forces a cache:

- dashboard summary cards
- recommendation panels
- alert group counts
- contract best-fit explanations beyond the frozen explanation payload on offers
- staffing coverage badges
- aircraft profitability rollups

These belong in read models or queries.

## Success Test

The backend domain model is ready when the team can answer these questions without hesitation:

- Which aggregate owns current aircraft location?
- Which aggregate owns commercial contract truth?
- Which aggregate owns labor reservations?
- Which module is allowed to create future scheduled events?
- Which state must move together in one transaction when a schedule is committed?

If those answers are fuzzy, implementation will drift.
