# Fleet And Maintenance

## System Goal

Aircraft should feel like strategic assets with personalities, not just interchangeable capacity buckets.

The fleet and maintenance systems should create meaningful tradeoffs around:

- acquisition cost
- operating cost
- runway access
- range and payload flexibility
- reliability
- downtime planning

## Fleet Design Principles

- Every aircraft type should have a role.
- Older or cheaper aircraft should remain useful in some niches.
- Utilization should matter, but overuse should create maintenance pressure.
- The player should be able to understand why one airframe is becoming risky.
- Scaling the fleet should create portfolio decisions, not just more copies of the same best plane.

## Aircraft Roles To Support

The early roster should include aircraft archetypes with clear identities:

- light utility: cheap access, low payload, remote field flexibility
- fast charter: strong premium passenger value, lower bulk economics
- regional workhorse: balanced economics and versatility
- cargo specialist: stronger payload economics, less passenger flexibility
- rugged remote operator: lower speed, better access to challenging airports

This matters more than brand count. Distinct roles are more valuable than a long undifferentiated aircraft list.

## Airframe State

Each aircraft should track:

- current airport
- ownership type
- financial obligation
- condition
- airframe hours
- cycles
- recent utilization
- maintenance status
- engine maintenance status
- dispatch availability

The player should not need to guess whether an aircraft is safe, expensive, or overworked.

## Acquisition Model

MVP should support:

- direct purchase
- leasing
- financing

Later options may include:

- used market variation
- short-term rentals

Key tradeoff:

- purchase improves long-term economics but strains capital
- lease reduces upfront risk but increases recurring pressure
- financing is a combination of the 2 above, and allows for a lower upfront capital investment, while committing to payments over an agreed-upon period, with interest

## Fleet Strategy Tension

The game should create a real choice between:

- standardizing around a small number of aircraft types for easier operations
- diversifying the fleet to capture niche opportunities

Neither should dominate universally.

## Maintenance Model

Maintenance should be understandable and proactive.

Core concepts:

- condition declines with hours and cycles
- poor condition increases failure risk and cost exposure
- preventive maintenance restores reliability but consumes time and cash
- deferred maintenance can be profitable in the short term and dangerous in the long term

The player should be able to plan maintenance, not just react to sudden punishment.

## Reliability And Failure

MVP does not need a deep technical failure simulator. It does need operational consequences.

Low-condition outcomes may include:

- longer turnaround times
- higher chance of delays
- unscheduled downtime
- increased repair cost
- contract failure risk on tight schedules

The important part is that reliability pressure feeds back into schedule planning and reputation.

## Maintenance Gameplay Decisions

A healthy maintenance system should force these choices:

- squeeze one more day of revenue or ground for service now
- assign the worn aircraft to easier work or rest it entirely
- keep older aircraft in niche roles or replace them
- invest in redundancy so maintenance does not collapse the schedule

## Maintenance Visibility

The UI should expose maintenance through clear signals:

- condition trend
- hours and cycles since service
- projected safe operating window
- upcoming maintenance conflicts with assigned schedules
- expected downtime and cost

This is a major area where the product should feel more usable than competing sims.

## Bases And Facilities

For MVP, maintenance can be abstracted enough to avoid heavy infrastructure simulation.

Recommended MVP approach:

- all airports can handle basic line maintenance if needed
- some airports later become better heavy-maintenance locations
- deeper facility ownership should come after the baseline loop proves fun

## Fleet Growth Rules

A new aircraft should never be evaluated on sticker price alone.

The player should compare:

- acquisition cost
- expected weekly utilization
- likely contract fit
- airport access changes
- maintenance burden
- margin durability over time

The game should present these comparisons directly wherever possible.

## Late-Game Fleet Depth

As the game grows beyond MVP, the fleet layer can expand into:

- used aircraft market quality variation
- aircraft-specific quirks
- refurbishment decisions
- specialization packages or interior configurations
- more meaningful base and maintenance network planning

Those should be layered on only after the basic airframe lifecycle is already compelling.
