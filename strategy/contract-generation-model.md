# Contract Generation Model

## Purpose

This document turns the high-level contract system into a concrete generation model that can be implemented against the current FlightLine airport database.

The contract system should create plausible work from the world, then curate it into a readable board for the player.

For the implementation-facing MVP generator spec, see [contract-generator-v1.md](/Z:/projects/FlightLine/strategy/contract-generator-v1.md).

## Design Standard

A good contract generator should satisfy five rules:

- every visible contract should originate from an explainable airport and aircraft-fit context
- the visible board should contain multiple viable decisions, not one obvious answer
- the generator should prefer interesting pairings over raw quantity
- the board should react to company state without feeling scripted
- the system should scale from one-aircraft play to fleet operations without becoming noise

## Required Inputs

### Airport Inputs

The generator should consume these airport fields directly:

- `airport.airport_type`
- `airport.airport_size`
- `airport.scheduled_service`
- `airport.timezone`
- `airport.iso_country`
- `airport.iso_region`
- `airport_profile.accessible_now`
- `airport_profile.access_tier`
- `airport_profile.longest_runway_ft`
- `airport_profile.longest_hard_runway_ft`
- `airport_profile.has_hard_surface`
- `airport_profile.passenger_score` later
- `airport_profile.cargo_score` later
- `airport_profile.remote_score` later
- `airport_profile.business_score` later
- `airport_profile.tourism_score` later
- `airport_profile.demand_archetype` later
- `airport_profile.market_region` later

### Company Inputs

The generator should consume these company-side signals:

- current airport footprint
- current base or focus airports
- reputation tier
- cash pressure and debt pressure
- visible fleet roles
- aircraft capability actually owned now
- aircraft capability realistically acquirable now
- staffing coverage and qualification coverage
- recent completion and failure history by region

### Clock Inputs

The generator should also consume:

- current game day and time
- current generation window seed
- local time at origin airport
- current contract saturation in a region

## Airport Eligibility Rules

The first filter should stay strict.

Standard airline contracts should only be generated when all of these are true:

- `airport_profile.accessible_now = 1`
- `airport.airport_type` is not `heliport`
- `airport.airport_type` is not `seaplane_base`
- `airport.airport_type` is not `balloonport`
- `airport.airport_type` is not `closed`

Additional contract-type rules should then narrow the set further.

Examples:

- `airport_size = 2` should produce mostly utility cargo and short regional work
- `airport_size = 5` should produce premium passenger and higher-volume cargo opportunities
- airports without hard-surface support should never generate contracts that imply regional-jet or narrowbody service

## Contract Archetypes

MVP should use a small stable set of archetypes.

### 1. Premium Passenger Charter

Purpose:

- high-yield passenger movement with stronger deadline pressure

Typical airport pattern:

- `airport_size` `3` to `5`
- scheduled-service or strong business/tourism airports

Distance profile:

- short to medium

Typical aircraft fit:

- business aircraft
- premium small passenger aircraft
- fast regional aircraft in later progression

### 2. Regional Passenger Run

Purpose:

- bread-and-butter passenger work for early and mid game

Typical airport pattern:

- `airport_size` `2` to `4`
- strong same-region or neighboring-region pairings

Distance profile:

- short to medium

Typical aircraft fit:

- utility passenger aircraft
- commuter aircraft
- entry regional aircraft

### 3. Cargo Feeder Haul

Purpose:

- repeatable freight work between regional and commercial airports

Typical airport pattern:

- `airport_size` `2` to `4`
- cargo-leaning or infrastructure-capable airports

Distance profile:

- short to medium

Typical aircraft fit:

- utility cargo aircraft
- regional cargo turboprops

### 4. Remote Utility Cargo

Purpose:

- lower-volume, higher-friction work serving constrained airports

Typical airport pattern:

- origin or destination with high remote score
- shorter runway or non-ideal infrastructure

Distance profile:

- short to medium

Typical aircraft fit:

- rugged utility aircraft
- short-field cargo aircraft

### 5. Urgent Special Job

Purpose:

- premium opportunity that justifies speed, positioning pain, or tighter scheduling

Typical airport pattern:

- any eligible airport class, but weighted toward higher-value business regions and shortage situations

Distance profile:

- any, but usually paired with tighter deadline multipliers

Typical aircraft fit:

- fast aircraft, already-positioned aircraft, or flexible leased capability

## Generation Flow

### Step 1: Seed Origin Airports

Create weighted origin seeds from eligible airports.

Suggested first-pass weighting inputs:

- `airport_size`
- `scheduled_service`
- current region visibility to the player
- demand archetype later
- company footprint bonus
- underused-region floor so the world does not collapse into only major hubs

### Step 2: Select Archetype For Origin

Do not choose archetype uniformly.

Recommended tendencies:

- premium passenger favors `airport_size` `4` and `5`
- regional passenger favors `airport_size` `2` to `4`
- cargo feeder favors high cargo score and hard-surface support
- remote utility favors high remote score and utility-capable airports
- urgent special jobs favor high-value regions, tight supply, and company reputation

### Step 3: Build Destination Candidates

Destination candidates should be filtered by:

- compatible airport eligibility
- compatible archetype rules
- plausible distance band
- viable runway/access envelope for at least one supported aircraft role
- reasonable timezone relationship for local-departure windows later

### Step 4: Score Airport Pair

Every candidate pair should receive a pair score.

Recommended scoring inputs:

- archetype fit
- distance-band fit
- same-region or connected-market fit
- aircraft-role coverage visible in current company state
- payout attractiveness potential
- novelty bonus relative to current board
- chainability with company footprint

### Step 5: Size The Job

Payload or passenger count should be generated only after the pair is chosen.

Recommended MVP bands:

- premium passenger charter: `4` to `16` passengers
- regional passenger run: `8` to `48` passengers
- cargo feeder haul: `1,000` to `12,000` lbs
- remote utility cargo: `500` to `6,000` lbs
- urgent special job: band based on chosen passenger or cargo sub-type

These are tuning bands, not final balance.

## Distance Bands

Distance should be archetype-aware.

Suggested starting bands:

- premium passenger charter: `150` to `1,200` nm
- regional passenger run: `80` to `700` nm
- cargo feeder haul: `100` to `1,000` nm
- remote utility cargo: `50` to `500` nm
- urgent special job: `50` to `1,500` nm with stronger deadline multipliers

## Pricing Model

Contract payout should be built from understandable components.

Recommended structure:

`payout = distance_base * distance_nm * volume_factor * archetype_multiplier * urgency_multiplier * airport_difficulty_multiplier * market_quality_multiplier * reputation_quality_multiplier`

Suggested interpretation:

- `distance_base`: the base economic value of moving something one nautical mile
- `volume_factor`: passengers or cargo size
- `archetype_multiplier`: premium charter pays differently than feeder cargo
- `urgency_multiplier`: tighter completion window increases payout
- `airport_difficulty_multiplier`: constrained or scarce endpoints raise value
- `market_quality_multiplier`: stronger regions or higher-demand airport pairs pay more
- `reputation_quality_multiplier`: better companies see better-paying versions of the same underlying work

## Deadline Model

Deadlines should be tight enough to matter, but rarely arbitrary.

Recommended approach:

- compute baseline flight time from distance band and likely-fit aircraft role
- add load/unload and ground buffer
- multiply by archetype urgency band
- translate to local origin and local destination presentation using airport timezone

Suggested deadline styles:

- regional passenger: forgiving
- cargo feeder: moderate
- remote utility: moderate but with higher disruption tolerance
- premium passenger: tighter
- urgent special job: tightest

## Rejection Rules

Reject candidates that create clutter or obvious nonsense.

Examples:

- impossible for all currently visible aircraft roles
- deadline impossible even for best-fit likely aircraft
- duplicate origin/destination/archetype clones with only tiny payout differences
- payouts that dominate all peers in the same class without a visible downside
- very short contracts with trivial operating burden and excessive return

## Board Curation Rules

The visible board should be intentionally composed.

Recommended MVP board composition:

- `12` to `18` visible contracts
- at least `3` clearly flyable now
- at least `2` contracts that reward repositioning or better planning
- at least `2` contracts that hint at next-step fleet expansion
- at least `1` contract that is attractive but currently blocked by aircraft or staffing limits
- no more than `2` near-clones of the same origin-destination-archetype lane

## Player-Facing Explanation Metadata

Every generated contract should carry explanation metadata for UI.

Minimum fields:

- primary reason this contract exists now
- best-fit aircraft role
- runway/access warning summary
- local departure and deadline windows
- price drivers
- risk drivers
- why this contract is attractive for the current company
- why this contract may be blocked or awkward for the current company

## Output Model

The generator should emit at least:

- contract id
- archetype
- origin airport id
- destination airport id
- passenger count or cargo weight
- earliest start window
- latest completion deadline
- payout
- penalty model
- best-fit aircraft role
- generated difficulty or risk band
- explanation metadata payload
- generation window seed

## MVP Implementation Sequence

1. build airport eligibility query
2. build airport-pair distance cache
3. implement archetype-specific distance bands
4. implement pair scoring and rejection rules
5. implement payout and deadline formulas
6. implement board curation layer
7. add explanation metadata
8. add company-reputation and region-history tuning

## Success Test

The contract system is ready when a player can look at three contracts and correctly explain:

- why each one exists
- which aircraft is best for each one
- which one is safest
- which one is best margin per hour
- which one is a stretch opportunity for growth
