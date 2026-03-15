# State And Alert Model

## Purpose

This document standardizes the shared statuses and alert hierarchy used across the product.

Wireframes should not invent local meanings for state. The same aircraft, contract, or staffing condition should look and behave consistently across Dashboard, Fleet, Dispatch, Maintenance, and Finance.

These statuses should be treated as read-model outputs derived from the canonical entities defined in [game-state-model.md](/Z:/projects/FlightLine/strategy/game-state-model.md), not as a separate competing source of truth.

## Modeling Principle

Avoid overloading a single status field with multiple meanings.

Use separate dimensions where needed:

- operational state
- health or risk band
- staffing coverage state
- financial pressure state

This keeps the UI explainable and prevents contradictory labels.

## Aircraft State Model

### Operational State

Use one primary aircraft operational state at a time:

- `available`
- `scheduled`
- `repositioning`
- `in_flight`
- `turnaround`
- `maintenance`
- `grounded`

Definitions:

- `available`: ready for assignment now
- `scheduled`: committed to future work but not yet airborne
- `repositioning`: flying or preparing for a non-revenue leg
- `in_flight`: actively flying a revenue or contracted leg
- `turnaround`: temporarily unavailable while between legs
- `maintenance`: in planned or active service
- `grounded`: unavailable due to hard operational or maintenance block

### Condition Band

Condition is a separate risk layer:

- `excellent`
- `healthy`
- `watch`
- `critical`

Definitions:

- `excellent`: low operational risk
- `healthy`: normal expected operating state
- `watch`: elevated risk, maintenance should be planned soon
- `critical`: significant disruption risk, hard warnings should appear

### Staffing Coverage Flag

Aircraft staffing readiness should be visible separately:

- `covered`
- `tight`
- `uncovered`

Definitions:

- `covered`: sufficient qualified labor for planned operation
- `tight`: operation is possible, but redundancy is weak
- `uncovered`: aircraft cannot legally or practically operate as planned

## Contract State Model

Contracts should move through a simple, legible lifecycle:

- `available`
- `shortlisted`
- `accepted`
- `assigned`
- `active`
- `completed`
- `late_completed`
- `failed`
- `expired`
- `cancelled`

Definitions:

- `available`: visible offer not yet committed
- `shortlisted`: intentionally bookmarked by the player
- `accepted`: committed commercially, but not yet attached to a schedule
- `assigned`: attached to an aircraft schedule
- `active`: currently being executed
- `completed`: fulfilled on time
- `late_completed`: fulfilled, but with timing consequences
- `failed`: not fulfilled to contract standard
- `expired`: offer aged out before acceptance
- `cancelled`: removed intentionally by player or system event

## Staffing State Model

Staffing should be readable at both company and aircraft-family level.

Use these states for staffing categories and qualification pools:

- `surplus`
- `covered`
- `tight`
- `blocked`

Definitions:

- `surplus`: more capacity than current utilization needs
- `covered`: enough capacity for current planned operations
- `tight`: operations are possible, but growth or disruption will cause pain
- `blocked`: current or planned work cannot be supported

## Maintenance State Model

Maintenance is distinct from aircraft operational state because an aircraft can be serviceable while still nearing a threshold.

Maintenance tracking states:

- `not_due`
- `due_soon`
- `scheduled`
- `in_service`
- `overdue`
- `aog`

Definitions:

- `not_due`: no near-term maintenance concern
- `due_soon`: service planning should begin
- `scheduled`: maintenance has a reserved future slot
- `in_service`: maintenance is actively happening
- `overdue`: threshold passed, risk and warning severity increase
- `aog`: aircraft on ground because of an unscheduled failure or hard stop

## Financial Pressure States

Finance should also support lightweight summary states:

- `stable`
- `tight`
- `stressed`

Definitions:

- `stable`: the company can absorb normal variance
- `tight`: one bad decision or disruption is meaningful
- `stressed`: cash preservation and risk reduction should dominate

## Alert Hierarchy

Use four alert priorities only:

- `critical`
- `warning`
- `info`
- `opportunity`

This keeps the system understandable and prevents every issue from feeling urgent.

## Critical Alerts

Critical alerts should interrupt time advancement and demand attention.

Examples:

- aircraft grounded
- contract failure occurred
- no qualified staffing for an already-committed operation
- cash crisis or imminent payment failure
- maintenance AOG event

Expected behavior:

- appears in top shell immediately
- appears at top of Dashboard
- should have direct recovery actions

## Warning Alerts

Warnings signal meaningful risk, but do not necessarily stop operations.

Examples:

- maintenance due soon
- staffing coverage is tight
- high deadline risk on a committed contract
- unusually high idle cost
- aircraft condition in watch band

Expected behavior:

- visible in summaries and relevant screens
- grouped when similar
- should not overwhelm the player with duplicates

## Info Alerts

Info alerts explain state changes or completed events.

Examples:

- maintenance completed
- aircraft became available
- financing payment posted
- contract completed on time

Expected behavior:

- visible in event feed or summaries
- low visual intensity

## Opportunity Alerts

Opportunity alerts surface positive choices.

Examples:

- premium contract available for an idle aircraft
- financing or lease term improved
- staffing capacity now supports expansion
- aircraft became available in a useful location

Expected behavior:

- visible, but never styled as danger
- should help the player move forward, not distract them

## Alert Display Rules

- The same issue should not appear as separate unrelated alerts in multiple places.
- The shell should show only the highest-signal items.
- Dashboards can summarize groups of lower-level alerts.
- Detailed screens should explain the cause and offer resolution actions.

## Time Advancement Interruption Rules

Time should stop automatically for:

- `critical` alerts
- completed player-selected stop conditions
- moments where a previously valid schedule becomes impossible

Time should not stop automatically for:

- routine `info` alerts
- low-risk `opportunity` alerts
- most `warning` alerts unless the player opts in

## Color And Icon Semantics

Status meaning must not depend on color alone.

Each state or alert should combine:

- color
- label text
- icon or shape cue where useful

This is required for accessibility and theme consistency in both light and dark mode.

## Wireframe Requirement

Every wireframe should make clear:

- what the primary state of the object is
- what secondary risk band applies
- whether an alert is critical, warning, info, or opportunity

If the state model is ambiguous in a wireframe, the screen is not ready.
