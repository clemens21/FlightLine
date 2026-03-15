# Backend Command Model

## Purpose

This document defines the first backend command layer for FlightLine.

It answers:

- which commands exist first
- what each command is allowed to change
- which aggregates each command coordinates
- what invariants must be enforced before commit
- what durable history each command should emit

It should be read with [Backend Domain Model](/Z:/projects/FlightLine/implementation/backend-domain-model.md) and [Save Schema Blueprint](/Z:/projects/FlightLine/implementation/save-schema-blueprint.md).

## Command Rules

### 1. One command equals one transaction

Every successful command should complete inside one SQLite transaction.

If validation fails, nothing should partially persist.

### 2. Commands mutate canonical state, not UI summaries

Commands should write aggregate-owned tables and append history rows.

They should not directly maintain dashboard summaries, alert groups, or recommendation cards.

### 3. Validation happens before writes

Command flow should be:

1. load current canonical state
2. validate invariants
3. calculate resulting writes
4. persist writes
5. append ledger and event history
6. commit

### 4. Command history should be explicit

Each command should carry:

- `command_id`
- `save_id`
- `command_name`
- `issued_at_utc`
- `actor_type`

Recommended later:

- `expected_save_version`
- `trace_id`

## Command Families

## 1. Save Bootstrap

### `CreateSaveGame`

Purpose:

- create a save shell and world configuration

Touches:

- `SaveGame`
- `GameClock`

Emits:

- `EventLogEntry: save_created`

### `CreateCompany`

Purpose:

- create the first company inside a save

Touches:

- `Company`
- `CompanyFinancialState`
- `CompanyBase`

Must validate:

- one active company per save
- valid starter airport

Emits:

- `EventLogEntry: company_created`

## 2. Acquisition

### `AcquireAircraft`

Purpose:

- add an aircraft to the fleet from a market offer or direct acquisition path

Touches:

- `CompanyAircraft`
- `AcquisitionAgreement`
- `CompanyFinancialState`
- `RecurringObligation` when needed
- source `AircraftMarketOffer` if offer-based

Must validate:

- offer still available if offer-based
- cash or financing rule passes
- delivery airport is valid

Emits:

- `EventLogEntry: aircraft_acquired`
- `LedgerEntry` for upfront cash movement

### `ActivateStaffingPackage`

Purpose:

- add labor capability to the company

Touches:

- `StaffingPackage`
- `CompanyFinancialState` when upfront cost exists
- source `StaffingMarketOffer` if offer-based

Must validate:

- package or offer still available
- qualification group is supported
- activation timing is valid

Emits:

- `EventLogEntry: staffing_package_activated`
- `LedgerEntry` if money moves now

## 3. Offer Windows

### `RefreshContractBoard`

Purpose:

- create a new contract offer window and contract offers

Touches:

- `OfferWindow`
- `ContractOffer`

Must validate:

- company exists
- refresh cadence or manual refresh rule is satisfied
- generator inputs are available

Emits:

- `EventLogEntry: contract_board_refreshed`

### `RefreshAircraftMarket`

Purpose:

- create aircraft market offers later

Touches:

- `OfferWindow`
- `AircraftMarketOffer`

### `RefreshStaffingMarket`

Purpose:

- create staffing market offers later

Touches:

- `OfferWindow`
- `StaffingMarketOffer`

### `ExpireOfferWindow`

Purpose:

- mark an expired window and its child offers as expired

Touches:

- `OfferWindow`
- child offer rows

Usually actor type:

- `system`

## 4. Contracts

### `AcceptContractOffer`

Purpose:

- convert an offer into a durable `CompanyContract`

Touches:

- `OfferWindow`
- `ContractOffer`
- `CompanyContract`

Must validate:

- offer exists and is still available
- offer has not expired
- contract is not already accepted from the same offer

Emits:

- `EventLogEntry: contract_accepted`

### `ShortlistContractOffer`

Purpose:

- mark an offer for later review

Touches:

- `ContractOffer`

Emits:

- `EventLogEntry: contract_shortlisted`

### `CancelCompanyContract`

Purpose:

- cancel accepted work where rules allow

Touches:

- `CompanyContract`
- `CompanyFinancialState` if penalty applies
- `AircraftSchedule` if linked work becomes invalid

Emits:

- `EventLogEntry: contract_cancelled`
- `LedgerEntry` if money moves

## 5. Dispatch And Maintenance

### `SaveScheduleDraft`

Purpose:

- persist a non-committed aircraft plan

Touches:

- `AircraftSchedule`
- `FlightLeg`

Emits:

- `EventLogEntry: schedule_draft_saved`

### `CommitAircraftSchedule`

Purpose:

- commit one aircraft schedule and reserve the needed resources

Touches:

- `AircraftSchedule`
- `FlightLeg`
- `CompanyAircraft`
- `CompanyContract`
- `LaborAllocation`
- `MaintenanceTask` if scheduled
- `ScheduledEvent`

Must validate:

- all hard blockers from [Dispatch Validation And Time Advance](/Z:/projects/FlightLine/strategy/dispatch-validation-and-time-advance.md) are clear
- one active committed schedule per aircraft remains true
- a contract is not assigned twice
- staffing reservations do not exceed capacity

Emits:

- `EventLogEntry: schedule_committed`

### `ScheduleMaintenance`

Purpose:

- book maintenance outside or inside dispatch

Touches:

- `MaintenanceTask`
- `CompanyAircraft`
- `LaborAllocation` if mechanics are reserved
- `ScheduledEvent`

Must validate:

- maintenance timing does not overlap another active task
- provider or mechanic coverage exists if modeled

Emits:

- `EventLogEntry: maintenance_scheduled`

## 6. Simulation

### `AdvanceTime`

Purpose:

- move the clock and process due events

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

Must validate:

- target time is after current time
- stop conditions are valid
- event queue can be processed deterministically

Emits:

- many system events and ledger rows depending on what fires

### Internal Event Handlers During `AdvanceTime`

These can be private handlers, but they should stay explicit:

- `ProcessRecurringPaymentDue`
- `ProcessFlightLegDeparture`
- `ProcessFlightLegArrival`
- `ProcessMaintenanceStart`
- `ProcessMaintenanceComplete`
- `ProcessContractDeadlineCheck`
- `ProcessOfferWindowExpiry`

That keeps `AdvanceTime` from becoming one unreadable monolith.

## Command-To-Aggregate Map

| Command | Aggregates touched |
| --- | --- |
| `CreateSaveGame` | `SaveGame`, `GameClock` |
| `CreateCompany` | `Company`, `CompanyFinancialState`, `CompanyBase` |
| `AcquireAircraft` | `CompanyAircraft`, `AcquisitionAgreement`, `CompanyFinancialState`, `RecurringObligation` |
| `ActivateStaffingPackage` | `StaffingPackage`, `CompanyFinancialState` |
| `RefreshContractBoard` | `OfferWindow`, `ContractOffer` |
| `AcceptContractOffer` | `OfferWindow`, `CompanyContract` |
| `CommitAircraftSchedule` | `AircraftSchedule`, `CompanyAircraft`, `CompanyContract`, `LaborAllocation`, `ScheduledEvent` |
| `ScheduleMaintenance` | `MaintenanceTask`, `CompanyAircraft`, `ScheduledEvent` |
| `AdvanceTime` | `GameClock`, `ScheduledEvent`, `AircraftSchedule`, `CompanyAircraft`, `CompanyContract`, `MaintenanceTask`, `CompanyFinancialState` |

## Command Result Shape

Every command should return a structured result with at minimum:

- `success`
- `command_id`
- `changed_aggregate_ids`
- `validation_messages`
- `emitted_event_ids`
- `emitted_ledger_entry_ids`

For commands that can fail validation, include:

- `hard_blockers`
- `warnings`

## First Implementation Order

1. `CreateSaveGame`
2. `CreateCompany`
3. `AcquireAircraft`
4. `ActivateStaffingPackage`
5. `RefreshContractBoard`
6. `AcceptContractOffer`
7. `CommitAircraftSchedule`
8. `AdvanceTime`
9. `ScheduleMaintenance`

That is the minimum command chain for a playable management loop.

## Success Test

The command model is ready when every MVP player action maps to a named command with:

- clear inputs
- clear aggregate writes
- clear validation rules
- clear emitted history

If the backend still depends on vague "update some state" language, the command model is not ready.
