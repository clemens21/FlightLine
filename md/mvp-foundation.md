# FlightLine MVP Foundation

## Product Position

FlightLine is an airline and aircraft management simulation inspired by OnAir Airline Manager, but designed to reduce repetitive busywork and improve strategic clarity.

The baseline promise for MVP is:

- Run an airline company with a persistent fleet, staffing model, and cash balance.
- Acquire aircraft through purchase, finance, or lease.
- Acquire labor through direct hiring, contract pools, and service agreements.
- Accept transport work and turn it into profitable flight schedules.
- Simulate operating results over time, including revenue, costs, wear, labor constraints, and downtime.
- Expand from a small operator into a larger, more capable company.

MVP explicitly does not include Microsoft Flight Simulator integration.

## Design Goals

- Make planning legible. The player should understand why a route or job is good or bad before committing.
- Cut avoidable micromanagement. Repeating the same scheduling steps should be automatable.
- Preserve meaningful tradeoffs. Aircraft capability, maintenance, runway limits, range, operating cost, and staffing should matter.
- Support both active and passive play. The player can optimize manually or let company rules handle routine work.
- Keep the simulation explainable. Numbers should roll up into visible profitability, utilization, reliability, and staffing health.

## "Better Than OnAir" Direction

These are product-level goals that should influence feature design:

- Stronger decision support around route profitability, repositioning cost, and aircraft fit.
- Cleaner scheduling tools with fewer clicks and better visibility into conflicts.
- More transparent maintenance and reliability systems.
- Better automation for repetitive tasks without removing player agency.
- A clearer progression model than simple cash accumulation.
- A more legible relationship between fleet growth, labor capacity, and operational complexity.

## Core Loop

1. Start with limited capital and a small home base.
2. Acquire an aircraft through purchase, finance, or lease.
3. Acquire enough qualified labor to operate and maintain the fleet.
4. Evaluate available contracts or route opportunities.
5. Build a schedule that matches aircraft capability, airport constraints, labor coverage, and time windows.
6. Advance time and operate flights.
7. Earn revenue, pay operating costs, accumulate wear, and handle delays, staffing pressure, or maintenance.
8. Reinvest into fleet growth, staffing capability, new bases, or better aircraft.

## MVP Scope

### Included Systems

#### Company Management

- Create a company profile.
- Track cash, debt, reputation, and company level.
- Maintain a ledger of revenue and expense categories.

#### Airports and World Data

- Real airports with core operational data:
  - ICAO/IATA
  - location
  - runway length
  - runway surface
  - elevation
  - basic demand modifiers
- Regional map filtering for gameplay scope.

#### Aircraft

- Aircraft models with performance and operating characteristics:
  - cruise speed
  - payload
  - passenger capacity
  - fuel burn
  - range
  - required runway length
  - maintenance interval baseline
- Individual airframes with:
  - condition
  - hours
  - cycles
  - current location
  - ownership type
  - lease/payment terms

#### Labor And Operations

- Staffing model for pilots, flight attendants, mechanics, and operations support.
- Labor acquired through direct hire packages, contract pools, and service agreements.
- Qualification and staffing capacity constrain aircraft scheduling and maintenance throughput.
- Labor choices create meaningful fixed versus variable cost tradeoffs.

#### Jobs and Contracts

- AI-generated work opportunities.
- Initial contract types:
  - passenger charter
  - cargo haul
- Contract variables:
  - origin
  - destination
  - payload or passenger count
  - deadline
  - payout
  - penalties

#### Scheduling and Dispatch

- Assign jobs to aircraft.
- Queue multi-leg schedules.
- Validate range, runway, payload, timing, labor availability, and current aircraft position.
- Show estimated block time, fuel cost, margin, staffing impact, and repositioning impact before confirming.

#### Time Simulation

- Time can advance while flights execute in the background.
- Flights transition through planned, in-progress, completed, delayed, cancelled, or failed states.
- The simulation updates company finances and aircraft state from outcomes.

#### Maintenance and Reliability

- Aircraft condition degrades from flight time and cycles.
- Preventive maintenance can be scheduled.
- Poor condition increases failure risk and downtime.
- Maintenance consumes time and money and may require compatible airport facilities later.

#### Finance

- Revenue from completed contracts.
- Core costs:
  - fuel
  - lease and financing payments
  - flight labor
  - cabin labor where required
  - maintenance labor and service costs
  - airport fees
  - repositioning
- Daily cashflow reporting and profitability views.

#### Progression

- Reputation increases with reliable completion and decreases with failures.
- Higher reputation unlocks better contract quality and aircraft financing options.
- Better company maturity unlocks more effective staffing and expansion options.
- Expansion goals are visible through milestones, not just a cash total.

### Out of Scope for MVP

- Microsoft Flight Simulator integration
- Multiplayer/shared economy
- Real-time weather integration
- Named employee simulation and deep crew life systems
- Deep FBO/base construction systems
- Stock market or player-to-player aircraft trading
- Cabin service simulation
- Detailed ATC or flight operations beyond management-level abstraction

## Recommended MVP Vertical Slice

The first playable slice should prove the core loop with minimum complexity:

- 1 region
- 20 to 40 airports
- 4 to 6 aircraft models
- 1 starting company
- purchase, finance, and lease support
- basic staffing model for pilots and maintenance support
- charter and cargo contracts
- aircraft scheduling
- time progression
- revenue/cost resolution
- maintenance wear and basic downtime
- save/load

If this slice is fun, the rest of the game is an expansion problem rather than a design-risk problem.

## System Priorities

Priority 1:

- deterministic simulation engine
- aircraft/job/airport data model
- staffing and qualification model
- schedule validation
- time advancement
- financial resolution

Priority 2:

- maintenance gameplay
- reputation progression
- contract generation quality
- planning UI and optimization support

Priority 3:

- automation rules
- richer demand simulation
- base/FBO depth
- live integrations

## Risks to Avoid Early

- Building UI before the simulation model is coherent.
- Importing too much real-world aviation detail into the first version.
- Making job generation random without strong economic logic.
- Requiring constant babysitting for routine operations.
- Making labor invisible enough that scaling feels free.
- Coupling the MVP to MSFS before the management layer is independently fun.
