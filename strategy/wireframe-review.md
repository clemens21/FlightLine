# Wireframe Review

## Purpose

This document captures what the first-pass wireframes taught us and what changed in the strategy as a result.

The goal is to turn wireframe observations into durable product decisions instead of leaving them as one-off comments inside individual wireframe files.

## Confirmed Product Decisions

### Dashboard Is A Routing Screen

The dashboard works best when it answers:

- what matters right now
- what should happen next
- whether time advancement is safe

It should not become a smaller version of Contracts, Dispatch, Fleet, and Finance all at once.

### Contracts Need Clear State Separation

Available, accepted, assigned, and active work must feel visibly distinct.

The contracts experience breaks down if those states are mixed into one visually uniform table.

### Dispatch Should Be Single-Aircraft-First In MVP

The wireframes confirmed that multi-aircraft planning would add too much density too early.

MVP Dispatch should optimize for:

- one selected aircraft at a time
- visible validation
- visible profitability summary
- explicit maintenance and staffing tradeoffs

### Fleet And Aircraft Detail Must Stay Distinct

Fleet should be for comparison and management across aircraft.
Aircraft Detail should be for a deep read on one airframe.

If that boundary blurs, the product gains complexity without adding clarity.

### Staffing Needs Two Different Screens

The wireframes surfaced a useful split:

- Staffing Overview: diagnosis, coverage, bottlenecks, cost mix
- Staffing Acquisition: transaction flow for solving a specific coverage problem

This same overview versus transaction split also applies to aircraft acquisition.

### Aircraft Acquisition Must Stay Strategic, Not Catalog-Like

The aircraft acquisition wireframe worked only when the player could see:

- mission fit
- payment structure comparison
- staffing impact
- utilization justification

Without that, the screen becomes a shop instead of a management decision surface.

## Strategy Changes From The Wireframes

- Dashboard should emphasize one recommended next step, not multiple equal calls to action.
- Contracts should visually separate state groups before the player even opens a detail panel.
- Dispatch validation must remain permanently visible during planning.
- Staffing costs only matter if their operational consequences are visible nearby.
- Acquisition flows should be treated as transactional workspaces, not buried table actions.

## New UX Rules

- Every overview screen should point cleanly into a transaction flow.
- Every transaction flow should preview both cost and unlocked capability.
- Global shell behavior must stay stable across overview and transaction screens.
- Right-side detail panels are preferred until a task becomes complex enough to justify a dedicated workspace.

## What Still Needs Wireframing Later

The current set is enough for the core loop, but additional screens will matter later:

- Maintenance transaction flow
- Finance deep-dive views
- World or network planning view
- Aircraft Detail deep-dive view

## Next Strategy Areas To Define

The wireframes now make the next modeling needs clearer:

- contract generation logic
- aircraft market generation logic
- staffing market generation logic
- airport data ingestion and normalization

Those systems will determine whether the wireframed surfaces stay full of interesting choices.

