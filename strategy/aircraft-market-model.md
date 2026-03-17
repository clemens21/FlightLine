# Aircraft Market Model

## Purpose

This document defines how FlightLine should generate the player-facing aircraft market from a curated model instead of a static catalog.

The market should create strategic decisions about capability, cash pressure, staffing burden, and progression timing.

## Design Standard

The visible market should always contain:

- a large enough rotating inventory to feel like a live global market
- one or more sensible near-fit options
- multiple stretch or out-of-phase aircraft that still help the player think ahead
- meaningful tradeoffs between `Buy`, `Loan`, and `Lease`
- enough explanation that the player understands why a listing is attractive or risky

## Required Inputs

The aircraft market generator should consume:

- reputation tier
- cash on hand
- debt load
- recent profitability trend
- current fleet roles and gaps
- current staffing and qualification coverage
- current airport footprint and access tier
- current contract board pressure
- live market seed and listing lifecycle state

## Visibility Rules

The market should not gate listings behind company phase.

Rules:

- every aircraft model in the reference DB is eligible to appear
- the market is rotating, not exhaustive, so not every model is guaranteed visible at once
- company phase may influence fit notes, weighting, and recommendation quality
- company phase must not hard-hide aircraft from the player

This preserves the feeling of a real world market instead of a curated starter shop.

## Market Size

The market should feel broad and active, not phase-scaled.

Recommended first-pass behavior:

- keep a large fixed live inventory rather than a small curated board
- target enough listings that the player can browse multiple aircraft classes at all times
- let acquisition fit, affordability, and staffing be the limiting factors, not market visibility

## Offer Pools

The generator should maintain separate offer pools by role, not just by price.

Recommended MVP role pools:

- utility passenger
- utility cargo
- rugged remote-field aircraft
- regional passenger
- regional cargo or combi
- aspirational step-up aircraft

## Listing Lifecycle

The player should not manually refresh the aircraft market.

Instead:

- each listing gets a hidden time-to-sell
- listings expire individually
- replacements appear quietly as simulated time advances
- unaffected listings remain stable

This makes the market feel like other buyers and sellers are active in the world.

### Hidden Availability

The player should never see the actual timer, but the generator should model relative realism:

- common workhorse aircraft should rotate faster
- large, niche, rough, or high-complexity aircraft should sit longer
- new aircraft usually sit longer than common used listings
- the initial world seed should backdate listings so they already feel partway through their market life

### Churn Driver

Aircraft market churn should be driven by simulated time, not a button.

Rules:

- while the sim clock is paused, the market pauses
- while the sim clock runs, listings can expire and be replaced
- explicit `AdvanceTime` should use the same reconciliation path as the live clock
- opening `Aircraft > Market` should also run a safety reconcile pass

## Generation Flow

### Step 1: Keep the market broad

The market should always contain:

- a wide mix of aircraft classes
- mostly used listings
- a smaller share of new aircraft
- more than one plausible next step
- several aircraft that are currently unrealistic but strategically informative

### Step 2: Shape but do not over-curate

Selection should still be weighted by:

- current fleet gaps
- company footprint and airport access
- staffing feasibility
- repetition suppression from recently expired listings
- role diversity

But these are weighting inputs, not hard gates.

### Step 3: Attach listing state

Every selected model should be turned into a specific airframe listing with:

- a real airport
- a seeded condition/wear state
- a registration
- a hidden time-to-sell
- `Buy`, `Loan`, and `Lease` options on the same listing

## Deal Structure Model

### Direct Purchase

Should emphasize:

- lower long-run cost
- highest upfront barrier
- strongest margin if utilized well

Recommended availability:

- always possible for lower-tier aircraft if the company has cash
- less common for stretch aircraft early

### Loan

Should emphasize:

- moderate deposit
- predictable recurring payment
- ownership upside

Recommended modifiers:

- better rates with higher reputation and cleaner balance sheet
- worse rates when the company is overleveraged

### Lease

Should emphasize:

- low upfront cost
- lower commitment
- higher recurring expense

Recommended role:

- important in startup and experimentation phases
- still viable later for niche or temporary growth

## Pricing And Condition

Condition and maintenance state should matter visibly.

Expected first-pass bands:

- `new`
- `excellent`
- `fair`
- `rough`

These should influence:

- asking price
- loan and lease terms
- hours/cycles and service state
- player perception of risk

## Curation Rules

The live market should still obey these rules:

- do not let one aircraft family dominate the visible list
- keep most listings away from the player's home base so the world feels bigger than the company footprint
- preserve both reachable and aspirational options
- avoid regenerating the whole market at once
- acquiring one aircraft must not reshuffle everything else

## Player-Facing Metadata

Each offer should expose:

- mission role
- listed airport
- condition band and service posture
- airport access summary
- staffing and qualification impact
- why the offer fits the current company
- why the offer might be risky
- `Buy`, `Loan`, and `Lease` terms only in the selected-listing pane

## Market Anti-Exploit Rules

Prevent these outcomes:

- one universally best aircraft appearing constantly
- the market always surfacing a perfect aircraft exactly when the player can afford it
- lease being always correct early and always wrong later
- fleet standardization being either always optimal or never rewarded
- niche aircraft never appearing because they lose simple score comparisons
- market visibility being mistaken for progression itself

## Output Model

A generated aircraft offer should include:

- offer id
- aircraft model id
- role pool
- current location
- listing lifecycle timestamps
- condition and maintenance seed
- `Buy`, `Loan`, and `Lease` term snapshots
- staffing impact summary
- access profile summary
- explanation metadata
- market seed

## MVP Implementation Sequence

1. define listing lifecycle rules and hidden time-to-sell
2. implement large rolling live inventory
3. seed partially aged listings on company creation
4. attach `Buy`, `Loan`, and `Lease` options to each specific listing
5. reconcile from the sim clock instead of a manual refresh flow
4. implement offer-mix composer
5. implement deal-structure pricing rules
6. add curation and repetition suppression
7. add explanation metadata and projected weekly burden

## Success Test

The market is working when the player can compare two offers and clearly explain:

- which one protects cash better
- which one scales better long term
- which contracts each one unlocks
- which staffing burden each one introduces
