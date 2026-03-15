# Contract Generator V1

## Purpose

This document turns the broader contract strategy into an implementation-facing MVP generator spec.

It should be read after [game-state-model.md](/Z:/projects/FlightLine/strategy/game-state-model.md) and [contract-generation-model.md](/Z:/projects/FlightLine/strategy/contract-generation-model.md).

The goal is not to create final balance. The goal is to define a concrete, deterministic contract board generator that can be built against the current airport and aircraft data.

## Scope

This spec covers:

- the contract-board refresh command
- the offer-window lifecycle
- the candidate generation pipeline
- the MVP pricing and deadline formulas
- the persistence shape of generated contract offers
- the board composition targets FlightLine should use in the first playable slice

This spec does not cover:

- dispatch validation of an accepted contract
- full flight economics resolution after execution
- passenger booking simulation
- long-term market memory beyond light company-region biasing

Those belong to step 3 and later systems.

## Generator Owner

The contract generator should be an application-level use case backed by deterministic domain rules.

Suggested command name:

- `RefreshContractBoard`

Suggested output root:

- one `OfferWindow`
- many `ContractOffer` rows attached to that window

The generator should never write directly to accepted contracts or schedules.

## Required Inputs

### Save-State Inputs

From the canonical save layer:

- `SaveGame`
- `Company`
- `GameClock`
- active `CompanyBase` rows
- active `CompanyAircraft` rows
- active `StaffingPackage` rows
- active `LaborAllocation` rows if already scheduled
- existing `OfferWindow` and `ContractOffer` rows
- existing `CompanyContract` rows in `accepted`, `assigned`, or `active` state
- recent `EventLogEntry` and `LedgerEntry` summaries for lightweight company tuning

### Reference Inputs

From the airport database:

- airport identity, type, size, region, timezone
- airport accessibility profile
- runway availability and hard-surface facts
- airport generation tags such as passenger, cargo, business, tourism, and remote scores
- market region and demand archetype

From the aircraft database:

- aircraft role families
- runway and airport-size compatibility
- rough capacity envelopes by role

### Static Balance Inputs

MVP should use small static tables for:

- archetype configuration
- role economic assumptions
- board composition targets
- urgency multipliers
- reputation quality multipliers
- contract volume bands

## Core Modeling Rule

The contract board should be generated from the company's current capability envelope, not from the entire world in a vacuum.

That means every offer should land in one of four company-relative buckets:

- `flyable_now`
- `flyable_with_reposition`
- `stretch_growth`
- `blocked_now`

This bucket should be persisted on the offer as explanation metadata, not shown as the authoritative contract state.

## Offer Window Lifecycle

### Refresh Cadence

Recommended MVP cadence:

- main board refresh every `12` in-game hours
- urgent special jobs can be injected every `4` in-game hours if the company has reputation and active capacity
- accepted or shortlisted offers remain attached to their originating window until consumed or expired

### Refresh Rules

Create a new contract offer window when any of these are true:

- no active contract board exists
- the current board expired
- the player manually refreshes and pays any designed refresh cost later
- a scripted urgent-injection refresh is due

Do not regenerate the board on every screen open.

### Persistence Fields

The `OfferWindow` for contracts should include at minimum:

- `offer_window_id`
- `company_id`
- `window_type = contract_board`
- `generated_at_utc`
- `expires_at_utc`
- `window_seed`
- `generation_context_hash`
- `refresh_reason`

The `generation_context_hash` should reflect the high-signal company state used by the generator.

Examples:

- current company bases
- active aircraft role mix
- staffing coverage snapshot
- reputation tier
- financial pressure band

## Pre-Generation Snapshots

Before candidate generation begins, build three compact summaries.

### 1. Company Capability Profile

This is a derived snapshot used only by the generator.

Minimum fields:

- home and focus airports
- current company phase
- reputation tier
- financial pressure band
- owned aircraft role counts
- currently flyable aircraft role counts
- staffing coverage by qualification group
- current market footprint by region
- number of accepted but unscheduled contracts
- number of active contracts by archetype

### 2. Contract Saturation Profile

This prevents one region or archetype from dominating the board.

Minimum fields:

- visible offers by archetype
- visible offers by market region
- accepted contracts by market region
- accepted contracts by origin airport

### 3. Airport Pair Support View

The generator should not compute every airport pair from scratch forever.

Recommended helper source:

- a persisted airport-pair cache later
- or an on-demand filtered query for MVP if the candidate pool is small enough

Minimum pair fields:

- `origin_airport_id`
- `destination_airport_id`
- `distance_nm`
- `same_country`
- `same_region`
- `market_region_pair`
- `timezone_delta_hours`
- `origin_airport_size`
- `destination_airport_size`
- `min_supported_airport_size`

## Board Composition Targets

The generator should intentionally compose the board instead of taking the top `N` scored candidates.

### Small Company Target

Use this as the default for the first playable slice:

- `14` visible offers
- `4` `flyable_now`
- `3` `flyable_with_reposition`
- `4` `stretch_growth`
- `3` `blocked_now`

### Archetype Mix Target

Starting target mix:

- `3` to `4` premium passenger charter
- `3` to `4` regional passenger run
- `3` to `4` cargo feeder haul
- `2` to `3` remote utility cargo
- `1` urgent special job

This should be soft-targeted, not rigidly enforced.

## Candidate Pipeline

### Step 1: Select Archetype Quotas

Build target counts for the refresh window using:

- company phase
- aircraft role mix
- regional footprint
- current accepted-work mix
- airport accessibility around company bases

Example:

- cargo-heavy fleet should bias slightly toward cargo feeder and remote utility
- premium passenger capability should bias toward charter appearance
- no cabin-capable fleet should not completely suppress passenger work, but should shift more of it into `stretch_growth` or `blocked_now`

### Step 2: Seed Origin Airports

Origins should be weighted from airports that satisfy all of:

- `accessible_now = 1`
- supported airport type for fixed-wing airline gameplay
- airport size consistent with the archetype being generated
- within the company footprint bias or underused-world floor

Origin weighting inputs:

- company base bonus
- same market-region bonus
- demand archetype fit
- passenger or cargo score depending on archetype
- scheduled-service boost for passenger archetypes
- remote-score boost for utility archetypes
- anti-repetition penalty if the same origin is already heavily represented

### Step 3: Build Destination Candidate Set

For each seeded origin and archetype, build destinations by filtering on:

- destination eligibility
- archetype distance band
- runway and airport-size plausibility
- pair novelty
- regional plausibility

Initial rejection rules:

- identical origin and destination
- inaccessible airports
- unsupported airport types
- no compatible likely aircraft role at all
- destination overload already present on the board

### Step 4: Choose A Likely Aircraft Role

Before generating price or deadline, the system should choose a likely best-fit role.

This is not a specific aircraft tail.

It should be a normalized role such as:

- `single_engine_utility_cargo`
- `single_engine_utility_passenger`
- `twin_turboprop_executive`
- `commuter_passenger_turboprop`
- `regional_cargo_turboprop`
- `light_business_jet`
- `regional_jet`

The selected role drives:

- likely cruise speed
- likely direct operating cost band
- runway expectations
- reasonable volume sizing
- deadline feasibility

### Step 5: Size The Job

Generate contract volume only after the pair and likely role are known.

#### Passenger Sizing Bands

- premium passenger charter: `4` to `12` pax normally, up to `16` for stronger commuter-capable routes
- regional passenger run: `8` to `36` pax for MVP
- urgent passenger special: `2` to `10` pax with premium urgency weighting

#### Cargo Sizing Bands

- cargo feeder haul: `1,200` to `10,000` lb
- remote utility cargo: `500` to `4,500` lb
- urgent cargo special: `300` to `3,500` lb

Volume should be clamped so the likely role remains plausible.

### Step 6: Estimate Economic Floor

Before final payout, estimate a rough cost floor using the likely role.

Suggested MVP rough cost model:

`estimated_cost = fixed_leg_cost + (distance_nm * role_cost_per_nm) + load_handling_cost + airport_fee_estimate + labor_estimate`

Where:

- `fixed_leg_cost` captures startup and handling friction
- `role_cost_per_nm` captures fuel and role-level operating cost
- `load_handling_cost` scales with payload or passenger quantity
- `airport_fee_estimate` scales with airport size and archetype
- `labor_estimate` captures the labor burden implied by the archetype

This does not need to be perfect. It needs to be stable enough that payout floors are explainable.

### Step 7: Compute Payout

Use a two-part payout rule.

#### Raw Opportunity Formula

`raw_payout = base_rate * distance_nm * volume_factor * archetype_multiplier * urgency_multiplier * airport_difficulty_multiplier * market_quality_multiplier * reputation_quality_multiplier`

#### Margin Floor Rule

`min_payout = estimated_cost * target_margin_multiplier`

#### Final Payout

`final_payout = round_to_market_unit(max(raw_payout, min_payout) * local_variation)`

Recommended starting target margins:

- premium passenger charter: `1.35` to `1.65`
- regional passenger run: `1.18` to `1.35`
- cargo feeder haul: `1.20` to `1.40`
- remote utility cargo: `1.25` to `1.50`
- urgent special job: `1.35` to `1.75`

### Step 8: Compute Deadline Window

Use the likely role to create a feasible but archetype-appropriate completion window.

#### Baseline Flight Estimate

`baseline_hours = distance_nm / likely_role_cruise_speed`

#### Operational Buffer

Add:

- pre-departure buffer
- load or boarding buffer
- post-arrival handling buffer
- archetype urgency modifier

#### Deadline Formula

`deadline_hours = (baseline_hours + operational_buffer_hours) * urgency_window_multiplier`

Suggested urgency-window multipliers:

- premium passenger charter: `1.35` to `1.80`
- regional passenger run: `2.00` to `3.25`
- cargo feeder haul: `1.75` to `2.75`
- remote utility cargo: `1.90` to `3.10`
- urgent special job: `1.15` to `1.45`

### Step 9: Score Company Relevance

Each candidate should receive a board-relevance score using:

- likely profitability
- company fit bucket
- company footprint fit
- novelty
- role diversity contribution
- deadline readability
- reposition friction
- growth signal value

This score is for board curation only.

### Step 10: Apply Rejection Rules

Reject candidates that are:

- impossible for all known role profiles
- below a minimum payout floor for their complexity
- absurdly profitable versus peers without visible downside
- near-duplicate clones already represented on the same board
- deadlined so tightly that even the likely role almost never works
- too trivial to be instructional for the player

## Company-Fit Bucket Rules

These buckets should be derived after the candidate is fully formed.

### `flyable_now`

All of these should be true:

- at least one current aircraft role can plausibly serve the job
- current staffing can cover the likely qualification group
- no extraordinary reposition pain exceeds the deadline window

### `flyable_with_reposition`

These should be true:

- at least one current aircraft role can plausibly serve the job
- current staffing can cover it
- the likely aircraft is not positioned well now, but still feasible

### `stretch_growth`

Typical reasons:

- current fleet has a near-fit but not strong-fit aircraft
- the job is feasible only if the player acquires a better aircraft soon
- the player has airport access but not ideal labor depth or mission role

### `blocked_now`

Typical reasons:

- staffing qualification missing
- runway or airport-size mismatch for current fleet
- payload or passenger volume above current capability
- deadline infeasible for current fleet even with reposition

## Explanation Metadata Payload

Each `ContractOffer` should include a structured explanation payload.

Minimum fields:

- `fit_bucket`
- `best_fit_role`
- `fit_summary`
- `risk_summary`
- `price_driver_summary`
- `airport_access_summary`
- `reposition_summary`
- `why_now_summary`
- `blocked_reason_code` if blocked
- `stretch_reason_code` if stretch
- `local_departure_window_text`
- `local_deadline_text`

This payload is important because it lets the UI explain the generator instead of only showing numbers.

## Persistence Shape

The generated contract offer persisted under `OfferWindow` should include at minimum:

- `contract_offer_id`
- `offer_window_id`
- `company_id`
- `archetype`
- `origin_airport_id`
- `destination_airport_id`
- `volume_type`
- `passenger_count` or `cargo_weight_lb`
- `earliest_start_utc`
- `latest_completion_utc`
- `payout_amount`
- `penalty_model`
- `likely_role`
- `difficulty_band`
- `explanation_metadata_json`
- `generated_seed`
- `offer_status`

Status lifecycle before acceptance:

- `available`
- `shortlisted`
- `expired`
- `accepted`

Once accepted, the durable commercial state should move to `CompanyContract` as defined in [game-state-model.md](/Z:/projects/FlightLine/strategy/game-state-model.md).

## Determinism Rules

The generator should be deterministic for the same:

- world seed
- offer-window seed
- company capability snapshot
- game-clock refresh bucket
- static balance tables

This is required for:

- save and load consistency
- balancing
- debugging
- tests

## MVP Static Tables

The first implementation should explicitly maintain these small balance tables:

- `contract_archetype_profile`
- `role_economic_profile`
- `role_capacity_profile`
- `board_composition_profile`
- `reputation_quality_profile`
- `urgency_profile`

These can begin as JSON, TypeScript constants, or SQLite tables later.

## First Playable Slice Behavior

The first playable contract board should prove these outcomes:

- the player sees a small mix of obvious, stretch, and blocked work
- the player can explain why each offer exists
- the player can identify at least one safe option and one higher-upside option
- the board persists across save and load
- a newly accepted contract can be converted into a `CompanyContract` without generator ambiguity

## Hand-Off To Step 3

Step 3 is now specified in [dispatch-validation-and-time-advance.md](/Z:/projects/FlightLine/strategy/dispatch-validation-and-time-advance.md).

Step 3 should validate these exact fields:

- likely role versus actual assigned aircraft
- deadline feasibility versus actual schedule timing
- staffing coverage versus actual labor allocation
- origin and destination accessibility versus actual dispatch rules
- payout and penalty model versus actual execution result

If step 3 needs a field that this generator does not emit, the contract-offer shape is incomplete.
