# Aircraft Acquisition

## System Goal

Aircraft acquisition should feel like one of the most important strategic decisions in the game.

The player is not just choosing a plane. They are choosing:

- what jobs become possible
- what airports become reachable
- what labor qualifications are required
- how much financial pressure the company accepts
- how fragile or resilient future operations become

## Core Design Principle

Acquiring an aircraft should be a market decision, not a static catalog click.

The player should evaluate aircraft through three lenses at the same time:

- mission fit
- financial structure
- operational burden

This is what makes one acquisition smart and another reckless.

## MVP Recommendation

The MVP should support three acquisition paths:

- direct purchase
- financing
- operating lease

These should be presented as different deal structures around aircraft offers, not as disconnected systems.

## Acquisition Channels

### Direct Purchase

Best for:

- players with strong cash reserves
- aircraft they expect to use heavily for a long time
- companies that want lower long-run cost

Tradeoffs:

- highest upfront capital requirement
- best long-term margin if the aircraft is well utilized
- greatest exposure if the aircraft turns out to be a poor fit

### Financing

Best for:

- players who want ownership without full cash payment upfront
- steady operators with reliable revenue

Tradeoffs:

- moderate upfront payment
- recurring debt service
- ownership upside with financing risk

This is often the most strategically interesting middle ground.

### Operating Lease

Best for:

- early growth
- uncertain demand
- trying new aircraft roles without permanent commitment

Tradeoffs:

- lower capital barrier
- higher long-run cost than a well-used purchased aircraft
- easier to correct course if the strategy changes

## Later Expansion Options

These do not need to be in MVP, but they are useful long-term lanes:

- used aircraft condition variance
- short-term dry lease
- emergency wet lease for disruption recovery
- brokered specialty aircraft offers
- player-configured interiors or cargo conversions

## Aircraft Offer Structure

Every market offer should show enough information to make an informed decision.

Required information:

- aircraft type and role
- acquisition path options available
- upfront payment requirement
- recurring payment or financing burden
- range, payload, runway suitability, and speed
- expected operating cost band
- staffing impact and qualification needs
- current location and delivery or reposition requirement
- condition and hours if used-aircraft variation exists

The player should not need to open outside calculators to understand a deal.

## Recommended Market Model

Use a curated rotating market rather than a full freeform global aircraft marketplace in MVP.

Benefits:

- easier to balance
- clearer progression pacing
- more legible choice sets
- simpler onboarding for new players

The market can still feel alive through:

- periodic offer refreshes
- quality differences between offers
- reputation- or finance-gated terms
- regional delivery and availability differences later

## Delivery And Induction

Acquiring an aircraft should not always be instantaneous.

Potential MVP-friendly factors:

- aircraft appears in a specific airport location
- repositioning may be required before first revenue use
- lease and finance approval can be immediate in MVP but should still feel like a defined step

Later systems can add:

- delivery delay
- induction inspection
- refurbishment or paint time
- interior reconfiguration

## Evaluation Framework

Before acquiring an aircraft, the player should always be able to answer:

- what work will this aircraft do better than my current fleet?
- how often will it realistically fly?
- what staffing or qualification costs does it add?
- what airports does it unlock or lose?
- how quickly does it need to perform to justify its payment structure?

If the UI cannot answer those questions, the acquisition flow is not ready.

## Strategic Tradeoffs To Preserve

The acquisition system should keep these tensions alive:

- cheap aircraft versus reliable aircraft
- specialized aircraft versus flexible aircraft
- standardized fleet versus niche coverage
- fast growth versus balance-sheet safety
- buying for margin versus buying for optionality

## Interaction With Labor

Aircraft acquisition should always be connected to labor.

Examples:

- a new aircraft family may require additional pilot qualification coverage
- passenger fleet growth may require more flight attendants
- more aircraft increases maintenance throughput demand even before the aircraft fly much

This prevents aircraft growth from being artificially frictionless.

## Interaction With Reputation And Finance

The best acquisition terms should not be available instantly to every player.

Better companies should earn:

- lower financing rates
- better lease terms
- access to more capable aircraft classes
- reduced risk premiums on expansion

This helps company progression feel systemic.

## Anti-Patterns To Avoid

Avoid these acquisition traps in the design:

- one clearly dominant aircraft that invalidates variety
- acquisition cost being the only important stat
- leases being universally correct early and irrelevant later
- used aircraft being either obvious bait or obvious bargains every time
- instant fleet expansion with no staffing or operational consequence

## UI Implications

The game needs a dedicated acquisition surface, whether that is a Fleet Market screen or a strong acquisition workflow inside Fleet.

That surface should support:

- filtering by mission role
- side-by-side comparison
- buy versus finance versus lease comparison
- projected weekly cost and utilization targets
- staffing impact preview
- airport access preview

This is a major opportunity to make the genre feel more modern and more strategically readable.
