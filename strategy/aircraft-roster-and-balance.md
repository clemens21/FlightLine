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

- Cessna Caravan family
- PAC utility single family later if needed

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
- Dornier 228 family later if needed

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

- Beech 1900 family
- Jetstream 32 family later if needed

Primary role:

- thin regional passenger runs and mid-density feeder work

Why the lane matters:

- is the clean step from owner-operator flying into real scheduled-style regional operation
- introduces twin-engine staffing and maintenance complexity without jumping straight to larger regionals

Recommended gameplay band:

- `15` to `20` passengers
- light belly cargo only in MVP
- `220` to `300` ktas cruise
- `3,000` to `4,500` ft runway need

Expected weaknesses:

- less flexible than rugged utility twins
- not a dominant cargo answer
- may require tighter staffing coverage than utility lanes

### 5. Regional Turboprop Workhorse

Reference candidates:

- Saab 340 family
- ATR 42 family

Primary role:

- mid-game passenger backbone with stronger economics on dense regional lanes

Why the lane matters:

- gives the player a true scale-up aircraft
- rewards standardization and better staffing depth
- creates a clear midpoint between commuter aircraft and later larger expansion

Recommended gameplay band:

- `30` to `50` passengers
- `6,000` to `12,000` lbs cargo in cargo or combi variants
- `250` to `320` ktas cruise
- `3,500` to `5,500` ft runway need

Expected weaknesses:

- higher fixed burden
- more visible maintenance downtime cost
- poor fit for tiny or rough airports

### 6. Regional Cargo Or Combi Variant

Reference candidates:

- Saab 340 cargo variant
- ATR 42 freighter or combi style variant

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

- Citation CJ lane
- Learjet 45 lane

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

## Vertical Slice Lineup Recommendation

If FlightLine only implements `6` initial variants, the best starting mix is:

1. light utility single turboprop passenger or mixed variant
2. light utility single turboprop cargo variant
3. premium single turboprop
4. rugged STOL twin
5. entry commuter twin
6. regional turboprop passenger

The light business jet should be the first expansion variant after the slice if premium-charter gameplay is important early.

The regional cargo variant should be the next addition after that if cargo depth becomes the stronger priority.

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

1. light utility single family
2. premium single family
3. rugged STOL twin family
4. entry commuter twin family
5. regional turboprop family
6. light business jet family
7. cargo and combi variants for existing families

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
