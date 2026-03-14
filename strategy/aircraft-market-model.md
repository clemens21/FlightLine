# Aircraft Market Model

## Purpose

This document defines how FlightLine should generate the player-facing aircraft market from a curated model instead of a static catalog.

The market should create strategic decisions about capability, cash pressure, staffing burden, and progression timing.

## Design Standard

The visible market should always contain:

- one or more safe, sensible next steps
- at least one stretch option
- meaningful tradeoffs between ownership structures
- role diversity instead of a single dominant answer
- enough explanation that the player understands why a deal is attractive or risky

## Required Inputs

The aircraft market generator should consume:

- company phase
- reputation tier
- cash on hand
- debt load
- recent profitability trend
- current fleet roles and gaps
- current staffing and qualification coverage
- current airport footprint and access tier
- current contract board pressure
- refresh window seed

## Company Phases

The market should behave differently depending on company maturity.

### Startup

Typical state:

- one aircraft or no aircraft
- limited cash buffer
- outsourced staffing bias

Visible market goals:

- affordable entry aircraft
- flexible lease-heavy choices
- one stretch finance option

### Growth

Typical state:

- two to six aircraft
- some route identity emerging
- labor mix becoming meaningful

Visible market goals:

- fleet standardization choices
- role-expansion choices
- stronger finance terms
- selective used-aircraft bargains later

### Established

Typical state:

- larger fleet
- multiple regions or market lanes
- more predictable staffing model

Visible market goals:

- specialization choices
- efficiency upgrades
- higher-capability aspirational aircraft
- better direct-purchase and finance options

## Offer Pools

The generator should maintain separate offer pools by role, not just by price.

Recommended MVP role pools:

- utility passenger
- utility cargo
- rugged remote-field aircraft
- regional passenger
- regional cargo or combi
- aspirational step-up aircraft

## Refresh Cadence

Recommended cadence:

- scheduled full market refresh once per week
- one to two spot offers may appear between weekly refreshes
- emergency or special offers can be event-driven later

Accepted or reserved offers should not vanish unexpectedly during a player decision flow.

## Generation Flow

### Step 1: Detect Fleet Gaps

The market should first identify current company gaps such as:

- no reliable passenger aircraft
- no cargo-capable aircraft
- no remote-field-capable aircraft
- no step-up option for current reputation tier
- too much dependence on one airframe role

### Step 2: Build Target Offer Mix

Recommended visible mix for MVP:

- one safe near-fit offer
- one role-diversifying offer
- one stretch-growth offer
- one financially conservative offer
- one niche or situational offer

Small companies can see fewer offers, but they should still represent distinct choices.

### Step 3: Select Models From Pools

Model selection should be weighted by:

- role diversity targets
- company phase
- company footprint and airport access
- staffing feasibility
- repetition suppression from recent refreshes

### Step 4: Attach Deal Structures

Every selected model should be resolved into one or more deal structures:

- direct purchase
- financing
- operating lease

Different models should emphasize different structures based on progression and risk profile.

## Deal Structure Model

### Direct Purchase

Should emphasize:

- lower long-run cost
- highest upfront barrier
- strongest margin if utilized well

Recommended availability:

- always possible for lower-tier aircraft if the company has cash
- less common for stretch aircraft early

### Financing

Should emphasize:

- moderate deposit
- predictable recurring payment
- ownership upside

Recommended modifiers:

- better rates with higher reputation and cleaner balance sheet
- worse rates when the company is overleveraged

### Operating Lease

Should emphasize:

- low upfront cost
- lower commitment
- higher recurring expense

Recommended role:

- important in startup and experimentation phases
- still viable later for niche or temporary growth

## Offer Scoring Rules

Each offer should receive an internal attractiveness score, but the curation layer must avoid always surfacing only the mathematically best choice.

Key scoring inputs:

- role fit to current contract board and airport footprint
- staffing burden
- runway access profile
- utilization plausibility
- payment pressure
- standardization value versus diversification value
- progression value

## Curation Rules

The final visible market should obey these rules:

- no duplicate aircraft model shown in more than two structures at once unless the refresh is intentionally focused
- no single aircraft role should dominate the visible list
- at least one offer should be realistically purchasable now
- at least one offer should be aspirational but understandable
- at least one offer should create a genuine tradeoff against the player's current fleet strategy

## Player-Facing Metadata

Each offer should expose:

- mission role
- airport access summary
- expected operating cost band
- expected utilization target
- staffing and qualification impact
- best-fit contract archetypes
- projected weekly fixed burden
- why the offer fits the current company
- why the offer might be risky

## Market Anti-Exploit Rules

Prevent these outcomes:

- one universally best aircraft appearing constantly
- the market always surfacing a perfect aircraft exactly when the player can afford it
- lease being always correct early and always wrong later
- fleet standardization being either always optimal or never rewarded
- niche aircraft never appearing because they lose simple score comparisons

## Output Model

A generated aircraft offer should include:

- offer id
- aircraft model id
- role pool
- deal structure
- upfront payment
- recurring payment terms
- current location
- delivery or reposition requirement
- staffing impact summary
- access profile summary
- projected utilization target
- explanation metadata
- refresh window seed

## MVP Implementation Sequence

1. define aircraft role pools for the starter roster
2. define company phase rules
3. implement fleet-gap detector
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
