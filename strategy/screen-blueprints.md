# Screen Blueprints

## Purpose

This document translates strategy and flows into wireframe-ready screen definitions.

Each blueprint defines:

- the decision made on the screen
- the minimum information hierarchy
- the primary actions
- the blocked or empty states that must be represented

## Blueprint Standard

Every major screen should answer three questions fast:

- what matters right now
- what decision can I make here
- what action should I take next

## Wireframe-Driven Rules

The first-pass wireframes clarified a few product-wide rules:

- Dashboard is a routing surface, not a mini-app.
- Contracts must separate `available`, `accepted`, and `assigned` states clearly.
- Dispatch is single-aircraft-first in MVP.
- Overview screens and acquisition screens are different jobs and should stay separate.
- A transaction flow should always preview both cost and newly unlocked capability.

## 1. Dashboard

Primary decision:

- what deserves attention first

Top information hierarchy:

1. critical alerts and immediate blockers
2. one recommended next step
3. cash position and short-term pressure
4. today's key timeline events
5. supporting fleet, staffing, and market summaries

Primary actions:

- jump to blocked aircraft
- jump to recommended contract
- jump to staffing shortage
- jump to maintenance issue
- advance time

Required states:

- healthy company
- issue-heavy company
- low-cash company
- no immediate work available

Design rule:

- do not place full contract or dispatch interfaces here; the dashboard should route decisively

## 2. Contracts Board

Primary decision:

- which work to accept, ignore, or plan next

Top information hierarchy:

1. clear state grouping or tabs for `available`, `accepted`, and `assigned`
2. contract table with fast filtering and sorting
3. estimated net profit and fit visibility in-row
4. selected contract explanation panel
5. compare tray for shortlist decisions

Primary actions:

- accept contract
- shortlist contract
- open detailed comparison
- pre-plan dispatch with selected aircraft

Required states:

- good contract market
- thin contract market
- all attractive contracts blocked by capacity
- no matching work for selected aircraft

## 3. Fleet View

Primary decision:

- which aircraft should be used, serviced, replaced, or expanded around

Top information hierarchy:

1. fleet table or comparison view
2. operational state and location
3. condition and maintenance state
4. utilization and financial performance
5. next recommended action per aircraft

Primary actions:

- open aircraft detail
- dispatch aircraft
- schedule maintenance
- open aircraft acquisition flow

Required states:

- balanced fleet
- idle fleet
- overworked fleet
- under-capacity fleet

Design rule:

- Fleet is for cross-aircraft comparison; Aircraft Detail is for one-airframe understanding

## 4. Aircraft Detail

Primary decision:

- what this specific airframe should do next

Top information hierarchy:

1. current operational state
2. assignment queue and next event
3. condition and maintenance timeline
4. recent financial performance
5. staffing requirement and coverage

Primary actions:

- assign contract
- reposition
- schedule maintenance
- review replacement or comparison

Required states:

- ready aircraft
- aircraft on watch
- aircraft in service
- aircraft blocked by staffing or qualification

## 5. Staffing Overview

Primary decision:

- where labor is constraining growth or resilience

Top information hierarchy:

1. coverage by category and qualification pool
2. blocked or fragile operations
3. fixed versus variable labor cost mix
4. qualification gaps by aircraft family or service type
5. recommended staffing actions

Primary actions:

- open staffing acquisition flow
- review blocked contract or aircraft context
- compare categories by risk or cost mix

Required states:

- healthy staffing coverage
- tight staffing coverage
- blocked operations from labor shortage
- overstaffed cost drag

Design rule:

- this screen diagnoses problems; it does not carry the full transaction flow itself

## 6. Dispatch Board

Primary decision:

- what schedule to commit for one selected aircraft

Top information hierarchy:

1. aircraft timeline and future commitments
2. selected legs and sequence
3. always-visible validation and blockers
4. projected schedule profitability
5. maintenance and staffing impact

Primary actions:

- add leg
- reorder leg
- insert reposition
- add maintenance block
- commit schedule

Required states:

- clean valid schedule
- schedule with soft warnings
- schedule with hard blockers
- no work assigned

Design rule:

- MVP dispatch remains single-aircraft-first; do not optimize for network-wide planning yet

## 7. Maintenance View

Primary decision:

- what maintenance to perform now versus later

Top information hierarchy:

1. aircraft by maintenance urgency
2. projected downtime
3. cost estimate
4. mechanic or vendor capacity
5. contract impact if aircraft is removed from service

Primary actions:

- schedule maintenance
- outsource service
- defer maintenance where allowed
- reassign affected work

Required states:

- no immediate concern
- due soon workload
- overloaded maintenance queue
- AOG disruption

## 8. Finance View

Primary decision:

- what financial constraint is limiting growth

Top information hierarchy:

1. cash position and near-term obligations
2. revenue versus cost breakdown
3. profit by aircraft
4. labor, lease, and maintenance burden
5. idle cost and missed-opportunity indicators

Primary actions:

- jump to underperforming aircraft
- jump to staffing structure
- jump to acquisition planning
- jump to contract sourcing

Required states:

- profitable growth
- cash-tight but viable
- debt or lease pressure
- operationally busy but unprofitable

## 9. World View

Primary decision:

- where to focus operations geographically

Top information hierarchy:

1. airport network map
2. current aircraft positions
3. demand or contract clusters
4. route reach from selected aircraft
5. airport suitability for expansion

Primary actions:

- select airport
- filter by aircraft reach
- jump to contracts in region
- jump to fleet positioned nearby

Required states:

- concentrated local network
- expanding regional network
- idle aircraft in poor locations
- attractive underserved area

## 10. Aircraft Acquisition Surface

Primary decision:

- which aircraft offer and payment structure to commit to

Top information hierarchy:

1. aircraft offers table or compare set
2. role and mission fit
3. buy versus finance versus lease comparison
4. staffing and qualification impact
5. utilization and payment justification

Primary actions:

- compare selected offers
- commit purchase
- commit financing
- commit lease

Required states:

- no suitable offers
- good growth offer
- risky but high-upside offer
- blocked by financing or staffing

## 11. Staffing Acquisition Surface

Primary decision:

- which staffing package resolves the current labor gap most effectively

Top information hierarchy:

1. current staffing need and what it blocks
2. direct hire versus contract versus service options
3. cost preview
4. unlocked opportunity preview
5. activation timing and qualification fit

Primary actions:

- add direct hire package
- add contract pool
- add service agreement
- compare packages side by side

Required states:

- clear best option
- tradeoff-heavy choice
- invalid staffing model for current need
- too-expensive but informative option

## Global Shell Requirements

The top-level shell must always expose:

- company identity
- current time
- top alerts
- quick time controls
- current cash
- quick path to the highest-priority issue

## Cross-Screen Behavior

- Tables should support fast sorting and filtering.
- Detail drawers should preserve list context where possible.
- Alerts should deep-link into the appropriate recovery workflow.
- Time controls should remain visible from most screens.
- Overview screens should open transaction screens with context preserved.

## Wireframe Readiness Checklist

A screen is ready for wireframing when:

- the primary decision is clear
- the top five information priorities are known
- the main actions are explicit
- blocked and empty states are defined
- the screen maps to one or more documented user flows
