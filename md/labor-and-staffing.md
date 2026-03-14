# Labor And Staffing

## System Goal

Labor should be a strategic operating resource, not a hidden expense line and not a full employee life simulator.

The player should feel that people matter because they create:

- operating capacity
- qualification constraints
- recurring cost pressure
- reliability differences
- scaling decisions

## Design Principle

FlightLine should treat labor as purchased capability.

That means the user is not buying "a pilot" the same way they buy a commodity. They are committing to labor capacity through one or more staffing models:

- direct employment
- contracted labor pools
- airport or third-party service agreements

This keeps labor meaningful without turning the game into HR software.

## MVP Recommendation

For MVP, labor should be modeled as pooled staffing rather than named individuals.

The player manages labor across four categories:

- pilots
- flight attendants
- mechanics
- operations support

Operations support can cover dispatch, scheduling support, station handling, and other back-office functions that matter economically but do not justify deep individual simulation in the first version.

## Labor Categories

### Pilots

Pilots should be the most visible labor constraint.

Core gameplay role:

- aircraft cannot fly without qualified pilots
- larger or more complex aircraft require more expensive pilot coverage
- pilot shortages should limit how many aircraft can be scheduled simultaneously

Recommended MVP abstraction:

- pilots are hired into qualification pools by aircraft family or class
- each aircraft type has a required pilot staffing ratio
- labor cost has both fixed and variable elements

Cost structure:

- monthly salary or retainer for employed crews
- higher per-flight or per-hour cost for contractors
- training or qualification cost when expanding into new aircraft families later

### Flight Attendants

Flight attendants matter for passenger operations, but should not dominate the sim.

Core gameplay role:

- certain passenger aircraft or service levels require cabin crew coverage
- better staffing can support premium passenger contracts later

Recommended MVP abstraction:

- attendants exist as a pooled passenger-service labor capacity
- cargo-only operations do not carry this cost
- higher-end passenger work can require stronger cabin staffing bands later

### Mechanics

Mechanics should connect directly to aircraft uptime.

Core gameplay role:

- they determine how quickly maintenance can be completed
- they influence whether maintenance is outsourced or handled in-house later
- they create a major early-game make-or-buy decision

Recommended MVP abstraction:

- basic line maintenance can be purchased through airport service contracts
- in-house mechanics become valuable as the fleet grows
- heavy maintenance remains abstracted or outsourced early on

### Operations Support

Operations support keeps the company from scaling unrealistically for free.

Core gameplay role:

- supports company growth beyond a tiny owner-operator phase
- acts as a scaling overhead for larger fleets
- can later tie into automation efficiency and schedule resilience

Recommended MVP abstraction:

- represented as company overhead packages or support staffing tiers
- increases with fleet size and operational complexity

## How The Player Purchases Labor

The player should acquire labor through a staffing market, not through one-off roleplay hiring.

Recommended labor acquisition channels:

- direct hire packages: lower long-run cost, higher fixed commitment
- contract pools: lower commitment, higher marginal cost
- service agreements: buy maintenance or station support from airports or vendors

The key purchase decision is not just headcount. It is choosing the right balance of:

- cost stability
- schedule flexibility
- qualification coverage
- reliability

## Staffing Models

### 1. Direct Employment

Best for:

- stable aircraft utilization
- standardized fleets
- players with enough cash to absorb fixed costs

Pros:

- lower marginal operating cost
- stronger long-term economics
- better scaling for a mature company

Cons:

- payroll pressure during low utilization
- expansion mistakes are more expensive

### 2. Contract Labor

Best for:

- early companies
- seasonal or uncertain demand
- niche or irregular operations

Pros:

- low upfront commitment
- flexible capacity
- easier recovery from strategic mistakes

Cons:

- higher operating cost
- lower margin at scale
- can be availability-constrained later

### 3. Service Agreements

Best for:

- maintenance support
- airport-specific operational coverage
- companies that want to stay asset-light

Pros:

- avoids building internal capability too early
- useful for geographically scattered operations

Cons:

- less control
- potentially slower turnaround
- vendor pricing can punish poor planning

## Qualification Model

Labor should matter through qualifications, not just raw quantity.

Suggested MVP approach:

- pilots are qualified by aircraft family, class, or role band
- mechanics are qualified broadly enough for the starting aircraft roster
- flight attendants are tied to passenger-service operations rather than exact airframe models

This creates strategic tension without requiring a certification simulator.

## Labor As A Capacity Constraint

Labor should cap operations in visible ways.

Examples:

- the player may own three aircraft but only have enough qualified pilot coverage to schedule two at full tempo
- passenger growth may require additional cabin staffing before premium jobs are viable
- maintenance throughput may bottleneck because outsourced mechanic capacity is limited

The game should present these constraints clearly before the player commits to schedules or acquisitions.

## Labor Economics

Labor should combine fixed and variable costs.

Good labor cost behavior for MVP:

- employed staff create steady overhead even when underused
- contractors increase cost per flight but reduce fixed risk
- service agreements add location- or vendor-based cost premiums

This allows different business models to work:

- lean outsourced operator
- balanced hybrid operator
- larger integrated operator

## Progression Path

A strong long-term structure is:

- early game: outsource heavily
- mid game: hybrid model with direct pilots and outsourced maintenance in many locations
- later game: in-house staffing becomes an efficiency and control advantage

Growth should make labor strategy more important, not less.

## Failure States And Pressure

Labor shortages should create operational friction, not instant unwinnable punishment.

Examples:

- schedule blocked because no qualified crew is available
- maintenance turnaround is delayed because mechanic capacity is overloaded
- profitability falls because the company is overstaffed relative to utilization

The player should always see the reason and the fix.

## UI Implications

The player needs a dedicated staffing view or staffing panels that answer:

- what labor capacity do I currently have?
- which qualifications are missing?
- what is my labor cost mix?
- what aircraft or schedules are blocked by staffing?
- should I hire, contract, or outsource more support?

## Explicit Non-Goal

MVP should not simulate named individual careers, personal morale, roster micromanagement, or full union rules unless those systems later prove they add strategic depth.

Named staff can be layered in later for flavor, bonuses, or narrative events if the core labor economy is already working.
