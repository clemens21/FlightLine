# Dispatch Assignment-First UI

## Purpose

This brief narrows the first useful Dispatch cleanup around the player jobs that matter most right now.

It is a derivative product brief built from the broader Dispatch revitalization work.
It is not implementation authorization on its own.

Related upstream artifacts:

- [2026-03-17_dispatch-workspace-revitalization.md](/Z:/projects/FlightLine/agent%20stuff/intake-briefs/completed/2026-03-17_dispatch-workspace-revitalization.md)
- [2026-03-17_dispatch-workspace-revitalization_framed-delivery.md](/Z:/projects/FlightLine/agent%20stuff/intake-briefs/completed/2026-03-17_dispatch-workspace-revitalization_framed-delivery.md)
- [2026-03-17_named-pilot-time-advance-minimum-support.md](/Z:/projects/FlightLine/agent%20stuff/intake-briefs/design-briefs/2026-03-17_named-pilot-time-advance-minimum-support.md)

## 1. Main Conclusion

Yes, Dispatch should be cleaned up, but the right first move is to make it assignment-first, not schedule-builder-first.

The current board is still asking the player to parse too many jobs at once:

- work intake
- aircraft selection
- staffing understanding
- timeline inspection
- leg inspection
- validation review
- time movement

That is too much for the current slice.

The first clear Dispatch pass should center only these two user jobs:

- assign an aircraft plus required staffing coverage to an accepted contract
- assign an aircraft plus required staffing coverage to a planned route

Everything else should become supporting context, not the headline workflow.

Important product boundary:

- in the current slice, `assign staff` should mean assign the required staffing coverage and qualification fit
- it should not mean manual named-person crew selection

If Dispatch pretends to assign individual staff before named pilots are actually live, it will create a fake UI layer and confuse the player.

## 2. Recommended Minimum Useful Scope

The first Dispatch cleanup should include only:

- one clear source switch between `Contracts` and `Planned Routes`
- one selected-work panel that explains the chosen contract or route
- one aircraft selection surface with clear fit and readiness signals
- one staffing coverage summary tied to the selected aircraft and work
- one assignment outcome panel with blockers, warnings, and next action
- one clear draft or commit action
- `Advance Time` moved to a secondary utility position

Preferred first-pass framing:

- Dispatch is where accepted work becomes assigned work
- Contracts remains where work is accepted and compared
- route planning remains where multi-stop ideas are assembled
- Dispatch should not force the player into full schedule inspection before assignment is understood

## 3. Explicit Non-Goals

The first assignment-first Dispatch pass should explicitly exclude:

- multi-aircraft network scheduling
- deep manual leg editing as the main workflow
- a full timeline editor
- selected-leg detail as the primary value of the screen
- manual named-pilot selection
- manual mechanic, attendant, or ops-staff assignment
- monitor-mode or live-ops tooling
- calendar-style planning inside Dispatch
- hidden staffing legality rules

The current cleanup should not try to solve every later Dispatch ambition at once.

## 4. Core Player Jobs

Dispatch should answer these questions in order:

### 1. What work am I assigning?

The player chooses either:

- one accepted contract
- one planned route

This choice should be explicit.
Do not mix both sources into one visually similar input pile without a clear source toggle.

### 2. Which aircraft should cover it?

The player should see:

- aircraft location
- aircraft readiness
- aircraft qualification fit
- maintenance pressure
- whether an existing draft will be replaced

### 3. Is staffing coverage good enough?

The player should see:

- required pilot qualification group
- current coverage status for that requirement
- whether staffing is `Covered`, `Tight`, or `Blocked`
- the practical reason when staffing blocks assignment

Until named pilots are live, this must remain capability-based and explainable.

### 4. What happens if I assign it?

Before commit, the player should see:

- draft created or replaced
- projected blockers and warnings
- whether the work is now staged legally
- the next recommended action: `Commit`, `Fix blocker`, or `Open detailed draft`

## 5. First-Pass Screen Structure

The first-pass Dispatch layout should read as a guided assignment workspace.

Recommended structure:

### Top mode switch

- `Contracts`
- `Planned Routes`

### Left column: Work to assign

Show a simple list of assignable items from the selected source.

For each item, show only:

- route
- payout
- due time
- current assignment state
- fit hint if one is obvious

Do not lead with planner jargon like `accepted_ready` or internal route-plan status labels.

### Center column: Assignment panel

Show:

- selected work summary
- aircraft choices
- clear assignment CTA

Each aircraft option should surface:

- location
- ready or unavailable state
- pilot qualification group
- staffing coverage result
- maintenance risk hint

### Right column: Outcome and validation

Show the consequences of the current selection:

- `Ready`
- `Blocked`
- `Watch`
- what is blocking it
- what the player can do next

This panel should explain assignment legality first.
The deeper leg queue and detailed timeline should stay secondary.

### Secondary detail drawer or lower section

If a draft already exists, the player may expand:

- lightweight timeline summary
- leg queue
- selected-leg detail

These are supporting inspection tools, not the opening view.

## 6. Required Player-Visible Assignment States

The assignment-first UI should use a small visible state set:

- `Unassigned`
- `Needs aircraft`
- `Needs staffing`
- `Ready to stage`
- `Draft staged`
- `Committed`
- `Blocked`

State rules:

- if staffing is the problem, say so directly
- if aircraft availability is the problem, say so directly
- if both are valid, the item should look clearly assignable
- if a draft exists, the UI should say whether the next action replaces that draft

## 7. Staffing And Aircraft Assignment Rules

Dispatch should remain honest about what is being assigned in this pass.

### Aircraft

Dispatch assigns:

- one selected aircraft for the chosen work

### Staff

Dispatch should show and validate:

- the required pilot qualification group
- whether the required pilot coverage exists
- whether coverage is already tight or blocked

Dispatch should not imply:

- named pilot pairing
- named-person scheduling
- individual mechanic or attendant assignment

One preferred wording rule:

- use `Pilot coverage` or `Crew coverage` in this pass, not `Assign staff member`

That language stays truthful to the current system.

## 8. Explainability Rules

The player should always be able to answer:

- what am I assigning?
- which aircraft is covering it?
- is staffing coverage good enough?
- what is blocking assignment?
- what happens if I confirm this choice?

Required explainability rules:

### 1. Use plain workflow labels

Prefer:

- `Contracts`
- `Planned Routes`
- `Assign Aircraft`
- `Pilot Coverage`
- `Ready to Commit`

Avoid surfacing raw internal labels or planner jargon.

### 2. Show one primary blocker reason

Examples:

- `No dispatch-ready aircraft at KSLC`
- `Pilot coverage blocked for twin turboprop commuter`
- `This assignment would replace the current draft on N208FL`

### 3. Keep time movement secondary

`Advance Time` should remain available, but it should not visually compete with assignment and validation.

### 4. Do not show fake staff control

If the player cannot choose named people yet, the UI should not present fake per-person assignment affordances.

## 9. Mara Framing Gate

This brief is ready to hand to Mara only if future framing preserves these boundaries:

### Scope clarity

- Dispatch is assignment-first in the first cleanup pass
- contract assignment and planned-route assignment are the two headline jobs
- deeper schedule inspection remains secondary
- staffing stays capability-based until named pilots are actually in scope

### Product clarity

- the screen reads like a guided assignment workflow
- source selection is clear
- aircraft choice is clear
- staffing coverage outcome is clear
- blockers and next action are clear

### Safety clarity

- Dispatch does not invent fake staff selection
- displayed staffing status matches backend legality
- the UI never claims an assignment is ready if commit would reject it

### Deferral clarity

- full schedule-builder depth is deferred
- named-pilot control is deferred
- network scheduling is deferred
- monitor-mode concerns are deferred

## 10. Deferred Backlog

These are reasonable later additions, but they should stay out of the first assignment-first pass:

- heavy leg reordering and manual sequence editing
- detailed selected-leg workflow as a default surface
- drag-and-drop timeline editing
- multi-aircraft optimization
- named-pilot assignment controls
- route-wide crew balancing
- live operations monitoring
- calendar-like planning tools

## 11. Open Questions That Actually Matter

### 1. Should Dispatch show `Contracts` and `Planned Routes` as tabs, segmented controls, or stacked sections?

The correct answer is whichever makes the two assignment jobs feel unmistakably separate without adding navigation weight.

### 2. Should the first-pass assignment action create a draft automatically or require an explicit review click first?

This matters because silent draft replacement could surprise the player.

### 3. How much of the existing timeline and leg-detail view should stay visible by default once the assignment workflow is simplified?

The preferred first-pass answer is: much less than today.

### 4. Should staffing wording say `Pilot coverage` or `Crew coverage` in the current pooled model?

The better first-pass answer is `Pilot coverage` when the requirement is pilot-specific, because it is more concrete.

### 5. When a route plan is assigned, should Dispatch present it first as one package or immediately explode it into leg detail?

The preferred first-pass answer is package first, detail second.
