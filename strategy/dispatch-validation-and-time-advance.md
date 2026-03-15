# Dispatch Validation And Time Advance

## Purpose

This document defines the MVP rules for two tightly linked systems:

- dispatch validation when the player commits a schedule
- time advancement once committed schedules begin to execute

It is the bridge between [game-state-model.md](/Z:/projects/FlightLine/strategy/game-state-model.md), [contract-generator-v1.md](/Z:/projects/FlightLine/strategy/contract-generator-v1.md), and eventual backend implementation.

## Why This Is Step 3

Step 2 defines how work appears.

Step 3 defines whether that work can actually be flown, what state changes when it is committed, and what happens when the clock moves forward.

Without this layer, contracts remain attractive numbers instead of operational gameplay.

## Scope

This spec covers:

- single-aircraft schedule validation for MVP
- hard blockers versus soft warnings
- schedule commit behavior
- event-driven time advancement
- operational and contract state transitions
- stop conditions and interruption rules
- minimum economic and maintenance effects during execution

This spec does not cover:

- multi-aircraft network optimization
- deep failure simulation
- crew rostering as named individuals
- full passenger itinerary simulation
- route planning beyond committed aircraft schedules

## Core Commands

### 1. `SaveScheduleDraft`

Optional but useful.

This stores a draft schedule without allocating hard operational commitments yet.

### 2. `CommitAircraftSchedule`

This is the dispatch commit command.

It should:

- validate the proposed leg sequence
- reject on hard blockers
- preserve warnings
- reserve the aircraft timeline
- reserve required staffing capacity
- attach eligible contracts to the aircraft schedule
- create future operational events

### 3. `AdvanceTime`

This is the simulation progression command.

It should:

- move the `GameClock`
- process due events in deterministic order
- stop on critical interruptions or requested stop conditions
- emit durable execution results and finance entries

## Single-Aircraft-First Scheduling Rule

MVP dispatch should remain single-aircraft-first.

One schedule belongs to one aircraft.

That schedule is an ordered sequence of:

- `reposition` legs
- `contract_flight` legs
- `maintenance_ferry` legs where needed later
- `maintenance_block` service reservations
- `turnaround` or load-buffer blocks as derived or explicit support items

Network-wide planning should not be introduced here.

## Required Inputs For Validation

### Save-State Inputs

- selected `CompanyAircraft`
- active `AircraftSchedule` for that aircraft if one exists
- linked `CompanyContract` rows
- relevant `StaffingPackage` rows
- relevant `LaborAllocation` rows
- `MaintenanceProgramState`
- active `MaintenanceTask` rows
- `GameClock`
- `CompanyBase` and company footprint where needed

### Reference Inputs

- aircraft model capabilities from the aircraft database
- origin and destination airport facts from the airport database
- airport accessibility and runway profile
- timezone data for presentation only

### Generator Inputs Already Embedded In Contract

From the accepted contract or originating offer:

- likely role
- deadline
- volume payload
- payout and penalty model
- explanation metadata

## Validation Pipeline

Validation should run in a fixed order so results are explainable.

### 1. Aircraft State And Location Validation

Confirm:

- the aircraft exists and is company-controlled
- the aircraft is not grounded or AOG
- the first planned leg starts from the aircraft's current airport
- no already-committed schedule overlaps the proposed start

Hard blockers:

- aircraft in `grounded`
- aircraft in active `maintenance`
- first leg origin does not match actual aircraft location
- overlapping committed schedule window

### 2. Leg Continuity Validation

Confirm:

- each leg's destination matches the next leg's origin unless an explicit reposition exists
- schedule times are sequential
- turnaround and load buffers do not go negative

Hard blockers:

- broken airport continuity
- overlapping leg times
- negative turnaround window

### 3. Airport And Runway Access Validation

Confirm for every leg:

- both airports are currently usable for fixed-wing airline gameplay
- the assigned aircraft model can use the airport size and runway profile
- hard-surface requirements are satisfied where the aircraft needs them

Hard blockers:

- origin or destination inaccessible
- airport-size mismatch
- runway-length mismatch
- hard-surface mismatch for the aircraft model

### 4. Payload And Cabin Fit Validation

Confirm:

- passenger count fits the selected cabin layout and aircraft max passenger capability
- cargo weight fits max payload and practical cargo role assumptions
- combined assumptions do not imply nonsense for the aircraft role

Hard blockers:

- passenger count exceeds layout capacity
- cargo weight exceeds safe modeled capability
- contract type incompatible with current aircraft role

### 5. Range And Timing Validation

Confirm:

- leg distance is plausible for the aircraft model
- planned block time is realistic enough for the route
- contract deadline is still achievable after accounting for reposition and service blocks

Hard blockers:

- route exceeds modeled aircraft range envelope
- deadline impossible even if every leg runs on time

Warnings:

- schedule margin to deadline is small
- flight time assumption is tight for this route length

### 6. Staffing Validation

Confirm:

- the required qualification group exists for the aircraft and leg type
- enough staffing capacity is available in the proposed time windows
- no already-committed allocation conflicts with the new schedule

Hard blockers:

- missing qualification group
- uncovered staffing for a committed leg window
- maintenance staffing unavailable for a required service block

Warnings:

- coverage is only `tight`
- schedule uses the last spare coverage unit

### 7. Maintenance Validation

Confirm:

- the aircraft is not past a hard maintenance threshold
- the proposed schedule does not exceed allowed service margin
- required maintenance can still be completed within the planned window if inserted

Hard blockers:

- current `aog`
- current `overdue` threshold beyond allowed dispatch
- schedule pushes the aircraft beyond hard modeled service limits before a legal service point

Warnings:

- aircraft in `watch` or `due_soon`
- second or later leg materially compresses maintenance margin
- service should follow immediately after arrival

### 8. Contract State Validation

Confirm:

- every attached contract is still `accepted`
- the contract is not already assigned elsewhere
- timing still satisfies earliest start and latest completion rules

Hard blockers:

- contract already assigned or expired
- contract deadline cannot be met

Warnings:

- late risk is elevated because of thin timing margin

### 9. Financial And Risk Review

This should not usually block commit.

Compute:

- projected schedule revenue
- projected direct operating cost
- projected schedule profit
- projected maintenance pressure change
- projected staffing tightness after commit

Warnings:

- schedule profit is weak or negative
- maintenance risk jumps materially
- schedule uses the last resilient staffing buffer

## Hard Blockers Versus Warnings

### Hard Blockers

Hard blockers disable commit.

Typical blockers:

- route impossible
- aircraft unavailable
- staffing uncovered
- maintenance hard stop
- airport incompatibility
- contract deadline impossible

### Warnings

Warnings do not disable commit.

Typical warnings:

- due-soon maintenance
- tight staffing coverage
- thin contract timing margin
- low projected margin
- heavy reposition burden

The dispatch board should keep warnings visible at all times, as defined in [wireframes/03-dispatch.md](/Z:/projects/FlightLine/wireframes/03-dispatch.md).

## Validation Output Shape

`CommitAircraftSchedule` should return a validation summary object with at minimum:

- `is_committable`
- `hard_blocker_count`
- `warning_count`
- `projected_schedule_profit`
- `projected_schedule_revenue`
- `projected_schedule_cost`
- `projected_risk_band`
- `aircraft_operational_state_after_commit`
- `contract_ids_attached`
- `validation_messages[]`

Each validation message should include:

- severity
- code
- summary
- affected_leg_id if any
- suggested_recovery_action

## Schedule Commit Effects

When a schedule is committed successfully, the system should:

- create or replace the active `AircraftSchedule`
- persist ordered `FlightLeg` rows
- move the aircraft from `available` to `scheduled` if not already busy
- reserve `LaborAllocation` windows
- move attached contracts from `accepted` to `assigned`
- create any maintenance reservation rows included in the schedule
- enqueue future operational events for time advancement

Do not recognize revenue at commit time.

## Time Advancement Model

Time advancement should be event-driven.

The system should not simulate every minute unless needed for presentation.

### Inputs

`AdvanceTime` should accept:

- a target UTC timestamp or delta
- optional stop conditions
- the current save state

### Minimum Stop Conditions

Support these first:

- stop on `critical` alert
- stop when any committed leg completes
- stop when a selected aircraft becomes available
- stop when a contract completes or fails
- stop at explicit target time

## Event Types

The MVP event queue should support at least these event families:

- `offer_window_expired`
- `staffing_package_activated`
- `staffing_package_expired`
- `recurring_payment_due`
- `maintenance_start_due`
- `maintenance_complete_due`
- `flight_leg_departure_due`
- `flight_leg_arrival_due`
- `contract_deadline_check`

## Event Processing Order

When multiple events share the same timestamp, process them in this order:

1. maintenance completion
2. staffing activation or expiry
3. recurring payments
4. flight departure
5. flight arrival
6. maintenance start
7. contract deadline checks
8. offer expiration

This order reduces ambiguous edge cases around availability and deadlines.

## Time Advance Loop

Suggested loop:

1. Determine the next due event time and the requested stop time.
2. Move the clock to the earliest one.
3. Process all events due at that timestamp in priority order.
4. Recompute derived alerts and operational states.
5. If a critical interruption or selected stop condition is met, stop.
6. Otherwise continue until the target time is reached.

## State Transitions During Execution

### Aircraft State Transitions

Typical path:

- `available` -> `scheduled`
- `scheduled` -> `repositioning` or `in_flight`
- `in_flight` -> `turnaround`
- `turnaround` -> `scheduled`, `maintenance`, or `available`
- any state -> `grounded` if a hard operational stop occurs

### Contract State Transitions

Typical path:

- `accepted` -> `assigned`
- `assigned` -> `active` at relevant departure or execution start
- `active` -> `completed`, `late_completed`, or `failed`

### Maintenance State Transitions

Typical path:

- `not_due` -> `due_soon`
- `due_soon` -> `scheduled`
- `scheduled` -> `in_service`
- `in_service` -> `not_due`
- any state -> `aog` if a hard maintenance disruption occurs

## Leg Completion Effects

When a `contract_flight` leg arrives, the system should at minimum:

- mark the leg complete
- update aircraft location
- consume the reserved staffing allocation window
- apply direct operating cost entries
- update maintenance hours and condition inputs
- evaluate contract completion versus deadline
- recognize revenue if the contract completion condition was satisfied
- create resulting `LedgerEntry` rows
- emit `EventLogEntry` rows

When a `reposition` leg arrives, the system should:

- mark the leg complete
- update aircraft location
- apply reposition cost
- update maintenance and condition inputs
- emit event history

## Failure And Late Rules

### Late Completion

If the contract completes after deadline but still within the penalty model's allowed late band:

- set contract state to `late_completed`
- reduce payout according to the penalty model
- emit a warning or info event depending on severity

### Failed Contract

If the contract misses a hard completion rule:

- set contract state to `failed`
- apply failure penalty or zero revenue according to the contract model
- release downstream schedule legs only if they are no longer valid
- emit a `critical` alert if the failure causes operational fallout

### Pre-Departure Invalidations

If staffing, maintenance, or aircraft state becomes invalid before a planned departure:

- do not silently launch the leg
- set the schedule into a blocked condition
- emit a `critical` alert
- stop time advancement if stop conditions require it

## Economic Resolution Rules

MVP execution does not need perfect accounting, but it does need structured accounting.

At minimum, time advancement should be able to create `LedgerEntry` rows for:

- contract revenue
- reposition cost
- flight operating cost
- airport fees
- staffing variable cost where applicable
- maintenance cost when service starts or completes
- recurring lease or financing payment when due

Projected schedule profit from dispatch and realized profit after execution should both exist so the player can compare forecast versus outcome.

## Derived Alerts After Time Movement

After each event timestamp is processed, recompute alerts from canonical state.

Examples:

- contract failure
- aircraft grounded
- due-soon maintenance
- staffing coverage tight after a new allocation
- payment stress event

The alert priority rules remain those in [state-and-alert-model.md](/Z:/projects/FlightLine/strategy/state-and-alert-model.md).

## Minimum Persistence Effects

By the end of any successful `AdvanceTime` call, the save state should consistently reflect updates to:

- `GameClock`
- `AircraftSchedule`
- `FlightLeg`
- `CompanyAircraft`
- `CompanyContract`
- `LaborAllocation`
- `MaintenanceProgramState`
- `MaintenanceTask`
- `LedgerEntry`
- `EventLogEntry`

## Success Test

Step 3 is ready when the team can demonstrate this sequence without inventing new state:

1. accept a contract
2. assign it to one aircraft with at least one leg and any needed reposition
3. validate the schedule and surface blockers versus warnings
4. commit the schedule
5. advance time through departure and arrival
6. resolve revenue, costs, and state transitions
7. stop automatically if a critical issue occurs

If that loop cannot be described cleanly from the current docs, the simulation layer is not yet ready for backend implementation.

## Recommended Next Step

After this step, the right move is to define the backend domain and persistence shape directly from the now-stable docs:

- `game-state-model.md`
- `contract-generator-v1.md`
- `dispatch-validation-and-time-advance.md`

That next doc set should define actual backend-facing aggregates, save tables, and command boundaries for company, staffing, fleet, contracts, schedules, maintenance, and finance.
