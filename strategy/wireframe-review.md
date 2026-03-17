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

Available, accepted/active, and closed work must feel visibly distinct.

The contracts experience breaks down if those states are mixed into one visually uniform table.

The current product direction also proved that contracts need a pinned route map and a route planner in the same workspace. Browsing, chaining, and batch acceptance belong together.

### Dispatch Should Be Single-Aircraft-First In MVP

The wireframes confirmed that multi-aircraft planning would add too much density too early.

MVP Dispatch should optimize for:

- one selected aircraft at a time
- visible validation
- visible profitability summary
- explicit maintenance and staffing tradeoffs

### Aircraft Works Better As One Workspace

The current product is cleaner when `Aircraft` stays one top-level destination with two internal jobs:

- `Fleet` for owned-aircraft comparison and operational posture
- `Market` for acquisition and deal commitment

That preserves context while still keeping browsing and acquisition distinct.

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

The current implementation direction reinforces one more rule: `Buy`, `Loan`, and `Lease` should start from the selected listing, then open a compact second-step term confirmation instead of forcing those details into the market table.

## Strategy Changes From The Wireframes

- Dashboard should emphasize one recommended next step, not multiple equal calls to action.
- Contracts should visually separate state groups before the player even opens a detail panel.
- Contracts should keep the route map pinned while the board scrolls.
- Route planning should be treated as a first-class staging flow, not a minor table action.
- Dispatch validation must remain permanently visible during planning.
- Staffing costs only matter if their operational consequences are visible nearby.
- Acquisition flows should be treated as transactional workspaces, not buried table actions.
- Shell-level controls such as Settings, Activity Log, and Clock/Calendar should stay out of the main nav.

## New UX Rules

- Every overview screen should point cleanly into a transaction flow.
- Every transaction flow should preview both cost and unlocked capability.
- Global shell behavior must stay stable across overview and transaction screens.
- Right-side detail panels are preferred until a task becomes complex enough to justify a dedicated workspace.
- Low-frequency shell actions should gather inside Settings instead of consuming permanent top-level space.

## What Still Needs Wireframing Later

The current set is enough for the core loop, but additional screens will matter later:

- Maintenance transaction flow
- Finance deep-dive views
- World or network planning view
- Aircraft Detail deep-dive view beyond the current Fleet selected-pane

## Next Strategy Areas To Define

The wireframes now make the next modeling needs clearer:

- contract generation logic
- aircraft market generation logic
- staffing market generation logic
- airport data ingestion and normalization
- calendar event projection and activity-notification tuning

Those systems will determine whether the wireframed surfaces stay full of interesting choices.

