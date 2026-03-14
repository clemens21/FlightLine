# Content Generation Systems

## Purpose

This document defines how FlightLine should generate the live content that keeps the management loop interesting:

- contracts
- aircraft market offers
- staffing market offers

The goal is not pure randomness. The goal is explainable, constrained, replayable variety.

## Shared Generation Principles

Every generated system should follow these rules:

- generation must respect world constraints before it creates player-facing choices
- results must be explainable in UI terms, not just numerically correct
- the player should see variety, but not chaos
- generation should reinforce multiple viable business models
- the system should scale from one-aircraft play to multi-aircraft operations without becoming noise

## Generation Layers

Use the same three-layer model across systems:

1. world inputs
2. candidate generation
3. player-facing curation

World inputs are the stable facts and simulated conditions.
Candidate generation creates a larger pool of possible items.
Player-facing curation decides what this company actually sees now.

## Contract Generation

### Design Goal

Contracts should feel like opportunities emerging from the world, not random cards thrown at the player.

### World Inputs

Contract generation should consume:

- airport demand profiles
- airport size and accessibility
- distance bands between airports
- cargo versus passenger suitability
- urgency bands
- current regional contract saturation
- company footprint and reputation
- aircraft roles realistically available in the player's company or visible market
- time-of-day or day-of-week patterning later

### Contract Archetypes

MVP contract generation should use a small set of archetypes:

- premium passenger charter
- regional passenger run
- medium cargo haul
- remote utility cargo
- urgent reposition-sensitive job

These archetypes are more important than raw contract count.

### Generation Flow

1. Create demand seeds per airport based on airport profile and region.
2. Pair airports using compatible demand and distance bands.
3. Select an archetype that fits the airport pair.
4. Generate payload or passenger count within plausible bounds.
5. Calculate payout, deadline, and penalty structure.
6. Reject impossible or low-interest candidates.
7. Curate the visible contract board based on player company state.

### Pricing Inputs

Contract payout should be derived from:

- base distance value
- service class or urgency multiplier
- airport difficulty or scarcity multiplier
- payload or passenger volume
- reputation-adjusted quality tier
- deadline tightness

### Anti-Noise Rules

Reject or suppress contracts that are:

- impossible for nearly all aircraft in the visible game state
- repetitive clones with no meaningful distinction
- too short and too profitable for trivial loops
- so marginal that they teach nothing except clutter

### Player-Facing Explainability

Every contract should expose enough explanation to answer:

- why it pays this much
- which aircraft fit it best
- what makes it risky
- what makes it attractive

That means the generation system must emit explanation metadata, not just raw numbers.

### Refresh Model

Recommended MVP cadence:

- core contract board refreshes on a regular time rhythm
- urgent or premium opportunities can appear intra-day
- accepted and assigned work are not regenerated, only available work is

### Scaling Rule

As the company grows, generation should shift in quality and complexity, not just quantity.

Growth should surface:

- better-paying work
- tighter and more interesting deadlines
- opportunities that justify higher-capability aircraft
- more complex chaining potential

## Aircraft Market Generation

### Design Goal

The aircraft market should feel curated and strategic, not like an infinite catalog.

### World Inputs

Aircraft offer generation should consume:

- player reputation and financial health
- current fleet composition and gaps
- company phase
- regional operating style
- aircraft role diversity targets
- market refresh cadence

### Offer Pools

Maintain separate pools for:

- utility aircraft
- premium passenger aircraft
- regional cargo aircraft
- rugged or remote-field aircraft
- aspirational step-up aircraft

### Offer Generation Flow

1. Select a target mix of aircraft roles for the current market cycle.
2. Pull model candidates from those pools.
3. Apply offer-specific deal structures: buy, finance, lease.
4. Add market-specific context such as location, availability, or risk.
5. Curate the visible market to a small, meaningful set.

### Deal Structures

Each visible offer should resolve into at least one of:

- direct purchase
- financing
- operating lease

The same aircraft model can appear under different structures in different cycles.

### Offer Metadata

Every offer should include:

- mission role
- airport access profile
- staffing impact
- expected operating cost band
- projected utilization target
- explanation of why it fits or does not fit the current company

### Refresh Model

Recommended MVP cadence:

- core market refresh weekly
- occasional spot offers appear between refreshes
- reputation and financial stability gradually improve offer quality

### Anti-Exploit Rules

- do not let one dominant aircraft appear constantly
- do not let the market always present the objectively best next aircraft
- keep role diversity in the visible set
- use financial gating and staffing impact to preserve tradeoffs

## Staffing Market Generation

### Design Goal

Staffing should be acquired as capability packages, not as random people.

### World Inputs

Staffing offer generation should consume:

- company staffing gaps
- qualification demand by aircraft family
- region or base location
- current operational tempo
- direct hire versus contract preference later
- labor tightness by category

### Offer Categories

Generate offers separately for:

- pilot qualification packages
- contract pilot pools
- flight attendant pools
- mechanic service agreements
- operations support tiers

### Offer Generation Flow

1. Detect current and near-term staffing bottlenecks.
2. Generate relevant direct hire, contract, and service options.
3. Attach activation timing, cost structure, and coverage effects.
4. Curate the visible set to a small number of real choices.

### Offer Metadata

Each staffing option should specify:

- what qualification or coverage it adds
- fixed versus variable cost effect
- activation timing
- scope of use
- what blocked operation or growth step it unlocks

### Refresh Model

Recommended MVP cadence:

- baseline staffing options always exist
- premium or highly flexible staffing offers rotate
- some staffing shortages should persist long enough to create real pressure

### Anti-Noise Rules

- do not present staffing options unrelated to current or near-term needs
- do not force the player to browse long lists of irrelevant labor packages
- do not generate options that differ only trivially in cost without strategic effect

## Cross-System Interaction Rules

These generators must not operate independently.

Key interactions:

- contract quality should react to company reputation and footprint
- aircraft offers should consider current staffing and fleet gaps
- staffing offers should react to aircraft acquisitions and blocked contracts
- airport accessibility should limit all three systems

## Determinism And Seeds

Use seeded generation windows rather than pure real-time randomness.

This gives us:

- reproducibility for testing
- explainable refresh behavior
- easier balancing
- better save and replay consistency

## Recommended MVP Implementation Order

1. airport profile and distance graph
2. contract archetype generator
3. contract curation layer
4. aircraft offer generator
5. staffing offer generator
6. cross-system balancing and explanation metadata

## Success Test

The generation layer is working if the player can consistently answer:

- why did this opportunity appear now?
- why is this offer better or worse for my company?
- what new capability would this purchase or hire actually unlock?
