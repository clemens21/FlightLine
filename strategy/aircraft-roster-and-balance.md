# Aircraft Roster And Balance

## Purpose

This document defines the recommended MVP aircraft roster shape and the role lanes that should anchor balancing.

The goal is not to collect a huge catalog early. The goal is to create a small roster where every aircraft family opens a distinct strategic lane.

## Roster Design Standard

The MVP roster should satisfy these rules:

- every included aircraft family should unlock a meaningful mission identity
- no model should exist only as a tiny statistical upgrade over another
- the early game should have at least one affordable cargo path and one affordable passenger path
- the roster should support both standardization and diversification strategies
- the market should contain safe options, niche options, and stretch options

## MSFS 2024 Alignment Constraint

As of March 14, 2026, the latest target simulator is `Microsoft Flight Simulator 2024`.

That means the preferred FlightLine MVP roster should be drawn from aircraft families that have a confirmed MSFS 2024 availability path through at least one of:

- first-party included aircraft
- official paid Marketplace aircraft
- third-party paid direct download
- third-party freeware

We should not try to mirror every store SKU. We should normalize those products into FlightLine families and variants.

See `strategy/msfs-aircraft-alignment.md` for the source-backed alignment rule.

## Recommended Roster Size

Two different roster sizes matter.

### First Playable Slice

Use `4` to `6` marketable variants.

This is enough to prove:

- acquisition tradeoffs
- staffing qualification friction
- runway-access differences
- passenger versus cargo business models
- maintenance and utilization pressure

### Broader MVP

Use `6` to `8` aircraft families and roughly `8` to `12` marketable variants.

That is enough variety for real strategic choice without turning data entry into a project by itself.

## Role Lanes

### 1. Light Utility Single Turboprop

Reference candidates:

- Cessna 208 Caravan family
- Pilatus PC-6 Porter family

Primary role:

- cheap startup aircraft for light cargo, thin passenger work, and short regional flying

Why the lane matters:

- creates the most flexible early-game ownership path
- supports lean outsourced operators
- keeps small-airport and low-demand gameplay viable

Recommended gameplay band:

- `8` to `14` passengers
- `2,500` to `4,000` lbs cargo
- `150` to `190` ktas cruise
- `2,000` to `3,500` ft runway need

Expected weaknesses:

- low speed
- low revenue ceiling per leg
- limited premium passenger value

### 2. Premium Single Turboprop

Reference candidates:

- Pilatus PC-12 family
- Daher TBM family

Primary role:

- premium charter and high-value short-to-medium passenger work with lower staffing burden than a jet

Why the lane matters:

- creates a high-margin small-company path
- supports premium passenger contracts before the player can justify a jet
- offers a very different choice from the Caravan-style utility lane

Recommended gameplay band:

- `6` to `10` passengers
- `1,500` to `2,500` lbs cargo equivalent
- `240` to `300` ktas cruise
- `2,500` to `4,000` ft runway need

Expected weaknesses:

- higher capital cost than utility singles
- weaker bulk cargo economics
- less forgiving if underutilized

### 3. Rugged STOL Twin Turboprop

Reference candidates:

- DHC-6 Twin Otter family
- later third-party rugged twins only if MSFS 2024 availability is confirmed in the dataset

Primary role:

- remote utility cargo and constrained-airport passenger service

Why the lane matters:

- makes high-remote-score airports strategically relevant
- creates real runway-access differentiation
- prevents the world from collapsing into only smooth regional-airport play

Recommended gameplay band:

- `12` to `19` passengers
- `3,000` to `5,000` lbs cargo
- `150` to `200` ktas cruise
- `1,500` to `2,800` ft runway need

Expected weaknesses:

- slower than commuter twins
- maintenance and reliability can be harsher if overused
- not the best answer for mainstream regional lanes

### 4. Entry Commuter Twin Turboprop

Reference candidates:

- Saab 340B family
- later commuter twins only if MSFS 2024 availability is confirmed in the dataset

Primary role:

- thin regional passenger runs and mid-density feeder work

Why the lane matters:

- is the clean step from owner-operator flying into real scheduled-style regional operation
- introduces twin-engine staffing and maintenance complexity without jumping straight to larger regionals

Recommended gameplay band:

- `28` to `36` passengers
- light belly cargo only in MVP
- `220` to `300` ktas cruise
- `3,500` to `5,000` ft runway need

Expected weaknesses:

- less flexible than rugged utility twins
- not a dominant cargo answer
- may require tighter staffing coverage than utility lanes

### 5. Regional Turboprop Workhorse

Reference candidates:

- ATR 42 / 72 family
- BAe 146 family later if the lane shifts toward regional jet expansion

Primary role:

- mid-game passenger backbone with stronger economics on dense regional lanes

Why the lane matters:

- gives the player a true scale-up aircraft
- rewards standardization and better staffing depth
- creates a clear midpoint between commuter aircraft and later larger expansion

Recommended gameplay band:

- `42` to `72` passengers
- `7,000` to `14,000` lbs cargo in cargo or combi variants
- `250` to `320` ktas cruise
- `4,000` to `6,000` ft runway need

Expected weaknesses:

- higher fixed burden
- more visible maintenance downtime cost
- poor fit for tiny or rough airports

### 6. Regional Cargo Or Combi Variant

Reference candidates:

- ATR 42 freighter or combi style variant
- BAe 146 QC/QT or other paid-addon cargo variants later

Primary role:

- stronger cargo specialization for feeders and scheduled freight-style contracts

Why the lane matters:

- keeps cargo from feeling like just passenger leftovers
- creates a meaningful choice between flexible passenger capacity and dedicated freight economics

Recommended gameplay band:

- low or zero passenger count
- `7,000` to `14,000` lbs cargo
- similar speed and runway profile to the matching passenger regional family

Expected weaknesses:

- less flexible when the contract board leans passenger-heavy
- higher penalty when underutilized

### 7. Light Business Jet

Reference candidates:

- Citation CJ family
- Citation Longitude family
- Pilatus PC-24 family

Primary role:

- urgent premium passenger work and time-sensitive special jobs

Why the lane matters:

- gives the player a true speed-driven strategy
- makes urgent and premium contracts feel structurally different
- creates a stretch acquisition that is not just more seats

Recommended gameplay band:

- `6` to `9` passengers
- very limited cargo relevance
- `350` to `450` ktas cruise
- `3,500` to `5,000` ft runway need

Expected weaknesses:

- high acquisition cost
- margin can collapse if premium demand is weak
- poor fit for remote or bulk cargo work

## Confirmed MSFS 2024 Overlap Families

The current best source-backed FlightLine overlap families are:

- `Cessna 208 Caravan EX`
- `Pilatus PC-6 Porter`
- `Pilatus PC-12 NGX`
- `DHC-6 Twin Otter`
- `Saab 340B`
- `ATR 42 / 72`
- `Citation CJ4 / Longitude`
- `Pilatus PC-24`
- `BAe 146`
- `F28`
- `A320neo / A32NX`
- `737 MAX 8 / 737 NG`
- `A330 family / A339X`
- `A350`

For MVP, the preferred starter lineup should come from this set rather than from families with only assumed or unverified MSFS 2024 availability.

## Vertical Slice Lineup Recommendation

If FlightLine only implements `6` initial variants, the best source-backed starting mix is:

1. `Cessna 208 Caravan` passenger or mixed variant
2. `Cessna 208 Caravan` cargo variant
3. `Pilatus PC-12 NGX`
4. `DHC-6 Twin Otter`
5. `Saab 340B`
6. `ATR 42` passenger or combi variant

The `Citation CJ4` or `Pilatus PC-24` premium-speed lane should be the first expansion variant after the slice if premium-charter gameplay is important early.

The `BAe 146` or `F28` regional jet lane should be the next addition after that if airline progression depth and paid-addon overlap become the stronger priority.

## Family And Variant Strategy

Do not let the roster explode through trivial sub-variants.

Recommended MVP rule:

- model families are the main roster units
- each family gets at most `1` to `3` gameplay-distinct variants
- variants should exist only when they materially change mission fit or cost structure

Good MVP variants:

- passenger
- cargo
- combi
- premium executive later for select lanes

Bad MVP variants:

- multiple brochure-year refreshes with negligible gameplay difference
- minor horsepower deltas that do not change access, staffing, or economics

## Qualification Groups By Lane

Recommended pilot-qualification mapping:

- light utility single turboprop -> `single_turboprop_utility`
- premium single turboprop -> `single_turboprop_premium`
- rugged STOL twin -> `twin_turboprop_utility`
- entry commuter twin -> `twin_turboprop_commuter`
- regional turboprop passenger and cargo -> `regional_turboprop`
- light business jet -> `light_business_jet`

This creates real expansion friction while still allowing manageable staffing packages.

## Balance Anchors

The roster should preserve these tradeoff axes.

### Speed Versus Access

- the fastest aircraft should not be the best at constrained airports
- the best short-field aircraft should not dominate mainstream regional lanes

### Capacity Versus Margin Stability

- larger aircraft should offer better upside on dense lanes
- smaller aircraft should be more forgiving when the board is thin or irregular

### Flexibility Versus Specialization

- flexible aircraft should survive bad board draws better
- specialized aircraft should outperform clearly in their intended lanes

### Growth Versus Staffing Burden

- step-up aircraft should increase staffing and maintenance complexity
- fleet growth should never feel free just because the player can afford the note

## Market Role Pools

Recommended mapping into acquisition-market pools:

- utility passenger
- utility cargo
- rugged remote-field
- commuter passenger
- regional passenger
- regional cargo or combi
- premium charter
- aspirational stretch

A single family can appear in more than one pool if the variant actually behaves differently.

## Economy Expectations By Lane

The roster should create different business identities.

Expected business outcomes:

- light utility single: lowest barrier, flexible, margin modest but resilient
- premium single: smaller volumes, high-value charter, strong margin when demand fits
- rugged STOL twin: remote access advantage, higher friction, niche but valuable
- commuter twin: early scalable passenger network play
- regional turboprop: mid-game backbone with better dense-lane economics
- regional cargo variant: more volatile board dependence but stronger freight upside
- light business jet: highest premium upside, weakest general-purpose utility

## Data Collection Order

When the team turns this document into actual reference data, capture aircraft in this order:

1. Caravan family
2. PC-12 family
3. Twin Otter family
4. Saab 340B family
5. ATR family
6. Citation or PC-24 family
7. cargo and combi variants for existing families
8. 146 or F28 family

That sequence supports the earliest gameplay decisions first.

## Recommended Next Deliverable

The next aircraft-data deliverable after this document should be a real starter dataset with:

- `6` to `8` aircraft families
- `8` to `12` marketable variants
- normalized field values matching `strategy/aircraft-data-model.md`
- qualification-group assignments
- market role pool assignments
- first-pass acquisition price and operating-cost bands

## Success Test

The roster is healthy when the player can look at the visible market and reasonably choose between:

- a flexible safe option
- a niche access option
- a scale-up passenger option
- a premium-speed option
- a cargo-specialized option

without any one of them feeling universally correct.




