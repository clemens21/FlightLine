# User Flows

## Purpose

This document defines the core player workflows that wireframes need to support.

It is not a feature list. It is a decision-flow map for the most important user actions in MVP.

## Canonical Wireframe Scenario

Use this scenario as the baseline content set when wireframing.

Company:

- name: Summit Air Logistics
- cash: $412,000
- debt and lease obligations: manageable but visible
- reputation: rising, but not premium-tier
- footprint: one home region with mixed passenger and cargo demand

Aircraft:

- `C208 Caravan`
  - owned
  - currently available
  - excellent airport access
  - low payload and moderate revenue potential
- `King Air 350`
  - loaned
  - currently assigned later today
  - strong premium charter fit
  - pilot qualification coverage is tight
- `ATR 42F`
  - leased
  - currently in maintenance watch status
  - strongest cargo earner
  - most expensive aircraft in recurring obligations

Staffing:

- pilot coverage is adequate overall, but only one spare for the King Air family
- cabin coverage is sufficient
- mechanics are mostly outsourced
- operations support is minimal but not yet breaking

Contracts:

- one premium charter contract with a tight deadline
- one medium-value cargo haul with a strong margin
- one low-risk regional contract with weaker payout
- one attractive contract that is currently blocked by staffing or aircraft fit

Problems in play:

- one aircraft due for maintenance soon
- one staffing qualification bottleneck
- one decision between aggressive growth and safer utilization

If a wireframe cannot express this scenario clearly, it is not ready.

## Flow Design Standard

Each flow should answer:

- what triggered the player to start this flow
- what decision they must make
- what information they need before committing
- what success looks like
- what blocked or failure states look like

## Flow 1: Acquire Aircraft

Trigger:

- the player wants to grow capacity, replace an underperforming aircraft, or enter a new mission role

Decision:

- which aircraft offer to take, and under what ownership structure

Required information:

- mission fit
- upfront cost
- recurring payment burden
- staffing impact
- airport access changes
- projected utilization target

Steps:

1. Open `Aircraft > Market`.
2. Filter by search, condition, or location radius.
3. Select one live listing and review the right-side detail pane.
4. Choose `Buy`, `Loan`, or `Lease`.
5. If needed, compare the term options in the compact confirmation step.
6. Review staffing, airport, and condition implications.
7. Confirm acquisition.

Success outcome:

- aircraft is added to the company in a pending, delivered, or immediately available state

Blocked states:

- insufficient cash or financing approval
- missing staffing or qualification capacity
- no suitable aircraft in the current offer set

## Flow 2: Acquire Staffing

Trigger:

- a schedule is blocked, a new aircraft was acquired, or overhead is out of balance with current operations

Decision:

- hire directly, use contract labor, or outsource service coverage

Required information:

- current staffing coverage by category
- qualification gaps
- fixed versus variable cost impact
- schedules or aircraft currently blocked by labor
- expected utilization of the added capacity

Steps:

1. Open Staffing view.
2. Review coverage summary and highlighted shortages.
3. Compare direct hire, contract, and service agreement options.
4. Review cost impact and coverage improvement.
5. Commit the staffing plan.

Success outcome:

- staffing coverage updates and blocked schedules become viable

Blocked states:

- cost exceeds current budget
- qualification lead time exists later
- vendor capacity is not available in the selected region

## Flow 3: Review And Accept Contracts

Trigger:

- the player needs revenue opportunities for idle or soon-available aircraft

Decision:

- which contracts are worth taking now, later, or ignoring entirely

Required information:

- estimated margin
- profit per flight hour
- aircraft fit
- deadline risk
- reposition requirement
- staffing blockers
- reputation impact

Steps:

1. Open Contracts Board.
2. Filter by airport, payload, payout, or fit.
3. Compare opportunities in board and route-map context.
4. Add promising work to the route planner.
5. Review and batch-accept planned offers or accept one directly.

Success outcome:

- contract moves into accepted or active state and, if planned, upgrades inside the route planner

Blocked states:

- no aircraft can realistically serve the contract
- deadline risk is too high
- contract appears profitable until reposition or labor cost is considered
- a planned offer has gone stale before acceptance

## Flow 4: Build And Validate Schedule

Trigger:

- the player has one or more accepted contracts and an available aircraft

Decision:

- what sequence of legs the aircraft should fly, and whether maintenance or repositioning should be included

Required information:

- aircraft current location and availability
- contract deadlines
- route timing
- runway and range validation
- staffing and qualification coverage
- projected margin of the full schedule
- maintenance risk

Steps:

1. Open Dispatch Board for an aircraft.
2. Optionally draft from the accepted-ready route plan.
3. Review generated or manual leg sequence.
4. Check validation messages inline.
5. Adjust timing, order, or supporting reposition legs.
6. Commit the schedule.

Success outcome:

- aircraft moves into scheduled state with visible future legs

Blocked states:

- route is invalid for aircraft performance
- no qualified crew is available
- schedule overlaps existing commitments
- maintenance risk crosses a hard threshold

## Flow 5: Advance Time

Trigger:

- schedules are ready and the player wants operations to progress

Decision:

- how far to advance time and whether to stop on specific event types

Required information:

- what flights are scheduled in the selected window
- what maintenance or staffing issues may emerge
- what alerts could interrupt advancement
- what milestones would be crossed by a selected-day morning jump

Steps:

1. Review next events in the shell clock/calendar or dashboard.
2. Choose `Pause`, `1x`, `4x`, `10x`, or `60x`, or select a day from the calendar.
3. If using the selected-day jump, review any milestone warning before committing.
4. Let time progress or jump to the selected morning.
5. Review interruption or summary output.
6. Return to dispatch, maintenance, staffing, or finance as needed.

Success outcome:

- the company advances cleanly through time and the player sees meaningful results

Blocked states:

- unresolved critical issue that should prevent advancement
- player-selected stop condition is reached immediately
- selected-day jump would pass a milestone the player does not want to skip without warning

## Flow 6: Resolve Maintenance Or Staffing Disruption

Trigger:

- an aircraft becomes high risk, grounded, delayed, or blocked by labor shortage

Decision:

- maintain now, outsource, reshuffle schedule, or absorb lost opportunity

Required information:

- cost of immediate action
- downtime estimate
- contracts affected
- replacement aircraft options
- staffing or mechanic coverage options

Steps:

1. Open the relevant alert.
2. Review affected aircraft, schedules, and contracts.
3. Compare response options.
4. Commit service, outsource support, or reassign work.

Success outcome:

- disruption is contained and downstream schedule impact is clear

Blocked states:

- no backup capacity exists
- budget cannot absorb the preferred fix
- contract deadlines make recovery impossible

## Flow 7: Review Performance And Reinvest

Trigger:

- end of day, end of week, or after a major operational shift

Decision:

- where to reinvest next: aircraft, staffing, maintenance margin, or simply hold cash

Required information:

- profit trend
- profit by aircraft
- idle cost
- labor cost mix
- lease and finance pressure
- reliability performance
- missed-opportunity indicators

Steps:

1. Open Dashboard or Finance.
2. Review operating outcomes.
3. Identify the largest constraint on growth.
4. Jump into Fleet, Staffing, or Contracts from the insight.
5. Make the next investment decision.

Success outcome:

- the player understands what is limiting growth and what should happen next

Blocked states:

- reports are too vague to identify a cause
- performance data exists but does not connect to player actions

## Pre-Wireframe Test

Before wireframing begins, each proposed screen should be mapped back to one or more flows above.

If a screen does not clearly support a flow, it is probably unnecessary for MVP.
