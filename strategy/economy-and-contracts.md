# Economy And Contracts

## Economic Design Goals

The economy should create understandable pressure, not random noise.

A good economy for FlightLine does four things:

- rewards good aircraft-to-job matching
- makes time, positioning, and reliability economically meaningful
- allows more than one viable business strategy
- gives the player enough information to improve decisions over time

## Core Economic Inputs

Every contract and route opportunity should be shaped by a small set of visible drivers:

- distance
- urgency
- payload or passenger volume
- airport demand strength
- airport difficulty or access limits
- aircraft suitability
- regional competition abstraction
- company reputation

These inputs should be reflected in both payout and risk.

## Contract Types For MVP

### Passenger Charter

Best for:

- premium flexibility
- time-sensitive work
- aircraft with appropriate cabin capacity and speed

Distinctive gameplay:

- deadlines matter more
- reliability affects reputation strongly
- smaller high-value jobs can compete with larger low-margin work

### Cargo Haul

Best for:

- payload-focused aircraft
- remote or infrastructure-limited airports
- backhaul chains and reposition reduction

Distinctive gameplay:

- tighter margin analysis
- stronger aircraft suitability tradeoffs
- good fit for opportunistic route chaining

## Contract Lifecycle

1. Opportunity is generated.
2. Player evaluates margin, fit, deadline, and positioning.
3. Player accepts or ignores it.
4. Contract is assigned to an aircraft schedule.
5. Outcome resolves as completed, late, cancelled, or failed.
6. Revenue, penalties, reputation, and market effects update.

The player should always know which stage a contract is in.

## Opportunity Generation Principles

Contracts should not feel like random cards from nowhere.

They should come from:

- airport size and role
- regional economic character
- time-of-day or day-of-week patterns later
- seasonality later
- company reputation and current operating footprint

A remote mining airport should not generate the same work profile as a tourism-focused regional field.

## Airport Demand Profiles

Each airport should have one or more demand tendencies that shape opportunity generation.

Examples:

- business hub
- tourism gateway
- remote utility field
- cargo feeder
- island connector
- high-net-worth charter market

This does not need full real-world economic simulation. It needs enough structure to make airports feel distinct.

## Pricing Model

Payout should be understandable enough to inspect.

A useful first-pass formula is:

- base value from distance and contract class
- multiplier for urgency
- multiplier for airport difficulty or scarcity
- modifier for regional demand strength
- modifier for company reputation at offer quality stage

Do not hide the value drivers entirely. The player should see why one contract pays more than another.

## Cost Model

The player-facing estimated margin should include:

- fuel cost
- airport fees
- flight labor cost
- cabin labor cost where required
- maintenance labor or maintenance service allocation
- maintenance reserve accrual
- lease or financing accrual
- repositioning cost
- expected penalty exposure if the timing is tight

This estimate does not need to be perfect, but it should be directionally trustworthy.

## Labor Model

Labor should be part of the economy as both a cost and a capacity constraint.

Recommended MVP behavior:

- pilots, flight attendants, mechanics, and operations support are purchased through staffing models rather than deep employee simulation
- direct hires create higher fixed cost but better long-run margins
- contractors and service agreements reduce commitment but raise marginal operating cost
- qualification coverage matters when expanding into new aircraft or service tiers

This allows the economy to support distinct business models:

- lean outsourced operator
- balanced hybrid operator
- larger integrated operator

## Contract Quality Tiers

Reputation and company maturity should affect contract quality, not just quantity.

Lower-tier contracts:

- shorter distances
- lower payouts
- looser strategic upside
- more forgiving deadlines

Higher-tier contracts:

- better payouts
- tighter timing windows
- more complex chaining potential
- larger reputation consequences

This helps progression feel meaningful.

## Strategic Business Models The Economy Should Support

The MVP economy should allow at least three viable approaches:

- conservative local operator with stable margins
- high-tempo charter specialist chasing premium urgency
- cargo-focused optimizer exploiting aircraft fit and backhaul opportunities

If only one of these is consistently correct, the economy is too narrow.

## Anti-Exploit Rules

The economy should explicitly prevent easy degenerate strategies.

Watch for:

- one aircraft type dominating every contract class
- infinite profitable reposition loops
- contracts paying too much for very short low-risk legs
- reputation becoming irrelevant once cash is high
- maintenance costs being so low that condition does not matter
- labor being so abstract that staffing choices never change player behavior

## Market Feedback

The world does not need a fully simulated global economy for MVP, but it should react lightly to player behavior.

Good first-step reactions:

- repeatedly serving an area improves offer quality there
- repeated failures reduce premium opportunities temporarily
- underused airports continue to offer occasional niche work rather than becoming dead zones

## Tuning Priorities

When tuning the economy, prioritize these questions in order:

1. Can the player understand why a contract is attractive?
2. Are there multiple viable strategies?
3. Does aircraft fit matter more than raw payout?
4. Does growth unlock better opportunities without invalidating early aircraft immediately?
5. Can the player recover from mistakes without the economy turning trivial?

## MVP Analytics To Expose In UI

The contract board and dispatch flow should surface:

- estimated net profit
- profit per flight hour
- reposition distance and cost
- deadline risk
- aircraft fit score
- staffing or qualification blockers
- reputation impact

This is one of the biggest opportunities to outperform comparable management sims.
