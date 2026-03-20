# Dispatch Assignment And Readiness Capability

## Relationship To Prior Brief

This brief supersedes [2026-03-17_dispatch-assignment-first-ui.md](/Z:/projects/FlightLine/product-work/capabilities/2026-03-17_dispatch-assignment-first-ui.md).

The older brief remains useful as a narrower intermediate step, but this capability brief is now the primary live design direction for future Dispatch framing.

## Main Conclusion

Dispatch should become a clear assignment-and-readiness workspace.

Its job is to help the player assign an aircraft and the required staffing coverage to an accepted contract or a chain of contracts, understand whether that setup is valid, and commit with confidence.

It should not feel like a crowded operations console.
It should feel like a guided operational decision:

- choose the work
- choose the aircraft
- confirm staffing coverage
- clear the readiness checks
- commit or revise

This capability should also evolve in two important ways:

- it should support named pilot assignment when named pilots are in scope
- it should update the calendar to reflect committed dispatches and their scheduled work truthfully

Live operations monitoring should be remembered as a related later capability, but it should stay separate from this one.

## Capability

`Dispatch Assignment And Readiness`

This capability enables the player to turn accepted work into a valid operational assignment without needing to decode scattered panels or hidden rules.

The capability should support:

- assigning one aircraft to one accepted contract
- assigning one aircraft to a planned chain of contracts
- confirming the required staffing coverage for that assignment
- assigning specific named pilots when the named-pilot layer is available
- understanding whether the setup is ready, risky, or blocked before commit
- understanding reposition burden and route continuity before commit
- seeing conflicts with other aircraft, pilot, or time commitments before commit
- understanding what will change when the dispatch is committed
- seeing likely recovery actions when the setup is blocked
- preserving a stable player mental model from one-contract dispatch to chain dispatch
- staying truthful to what Contracts, Staffing, Dispatch, and Calendar all say about the same assignment
- seeing geographic context for the selected work and staged dispatch
- reflecting committed dispatches and reserved operational time in the calendar
- letting the player leave and resume a draft setup without losing clarity
- letting the player revise or abandon a draft safely before commit
- moving from assignment into staged draft or committed dispatch cleanly

## Why It Matters Now

Dispatch is one of the clearest current-slice understanding gaps.

The current page exposes a lot of operational information, but the primary user decision is still hard to read. The player has to infer:

- what they are assigning
- whether the selected aircraft is a fit
- whether staffing is sufficient
- whether the draft is actually legal
- what to do next if it is not

That makes Dispatch feel both dense and incomplete at the same time.

This capability matters now because FlightLine's vertical slice depends on the player being able to move accepted work into execution clearly and confidently.

## What It Must Do

The capability must let the player:

- choose a dispatch source:
  - accepted contract
  - planned route or chain
- review one clear summary of the selected work
- choose an aircraft with understandable fit and readiness signals
- see whether the required pilot or crew coverage is sufficient
- assign specific named pilots when that staffing mode exists
- see whether maintenance or timing creates risk
- understand reposition needs and continuity implications for the selected assignment
- see whether the aircraft, named pilot, or planned time window conflicts with existing commitments
- understand whether the overall dispatch is `Ready`, `Watch`, or `Blocked`
- understand what commit will reserve, replace, or update
- understand the same assignment consistently across Dispatch, Staffing, Contracts, and Calendar
- understand how the committed dispatch will appear on the calendar
- see one likely recovery path when the dispatch is blocked
- leave and return to a staged dispatch without losing the setup story
- revise aircraft, named pilots, or chain contents before commit without hidden side effects
- see one clear next step:
  - `Stage draft`
  - `Commit`
  - `Fix blocker`

The capability must also make clear what "assign staff" means at different stages:

- in the current pooled mode, it means assigning the required staffing coverage and qualification fit
- in the named-pilot mode, it means assigning specific qualified pilots
- it does not mean named mechanics, named flight attendants, or named ops support in this capability

## Proposed Feature List

These are candidate features for Mara to refine, combine, defer, or reject:

- Dispatch source selector:
  - `Accepted Contracts`
  - `Planned Routes`
- Selected work summary panel
- Aircraft assignment panel with fit, location, and readiness hints
- Pilot coverage or crew coverage summary
- Named pilot assignment panel or crew-slot assignment surface when named pilots are in scope
- Dispatch readiness checklist
- Reposition and continuity summary
- Conflict summary for aircraft, pilots, and reserved windows
- Commit impact summary
- Recovery guidance surface for blocked dispatches
- Resume-safe draft summary
- Safe revision and abandon-draft affordances
- Calendar reflection or schedule-presence summary for committed dispatches
- Secondary route map context reusing the Contracts-style map language
- Primary action bar:
  - `Stage draft`
  - `Commit`
  - `Fix blocker`
- Collapsible assignment details area for draft timeline and leg inspection
- Secondary `Advance Time` utility placement that does not dominate the workspace

## Explicit Non-Goals

This capability should explicitly not become:

- a multi-aircraft network planner
- a full schedule editor as the first view
- a dense monitoring dashboard
- a calendar replacement
- a full all-role named-staff rostering workflow
- a place where the same validity message is repeated across multiple primary panels
- a UI that pretends more control exists than the simulation actually supports
- live operations monitoring merged into the core Dispatch workflow

## Quality Bar

This capability should meet these quality rules:

- the primary workflow is understandable in seconds
- each decision-critical fact has one primary home in the UI
- validation is visible without feeling noisy
- the player can tell the difference between `Ready`, `Watch`, and `Blocked`
- blockers always show a plain-English reason and a next step
- no hidden rules invalidate a dispatch that the UI presents as valid
- white space is used to separate decisions, not to pad empty panels
- deeper detail is available on demand, not forced into the first reading path
- reposition and continuity burden are understandable before commit
- conflicts are surfaced before the player commits, not discovered after
- commit consequences are visible before confirmation
- the one-contract flow and chain flow feel like the same product, not two different tools
- a player can resume an unfinished dispatch and recover context quickly
- revising or abandoning a draft before commit is safe and understandable
- Contracts, Staffing, Dispatch, and Calendar tell a consistent story about committed state
- map context supports orientation without becoming a duplicate planning surface
- committed dispatches appear in the calendar consistently with what Dispatch says was committed
- named pilot assignment, when present, matches actual dispatch legality and calendar commitments

## Information Design Rules

These rules should shape the capability before feature breakdown:

### 1. One primary home per fact

Do not repeat the same decision-critical information in multiple equal-weight panels.

Examples:

- dispatch validity should have one primary home
- aircraft suitability should have one primary home
- staffing coverage should have one primary home

Secondary detail may support these, but should not restate them as competing summaries.

Cross-surface rule:

- if Dispatch says a draft or commitment exists, adjacent surfaces should reflect the same truth
- if another surface shows a conflicting state, Dispatch trust breaks

### 2. Checklist-first validity model

Dispatch validity should read like a readiness checklist rather than a wall of messages.

The checklist should stay small and understandable.

Candidate checks:

- work selected
- aircraft selected
- aircraft can cover the route
- pilot or crew coverage available
- timing and continuity valid
- maintenance risk acceptable

Suggested visible states:

- `Pass`
- `Watch`
- `Blocked`

The checklist should also be able to carry checks such as:

- reposition required and acceptable
- no overlapping aircraft commitment
- no overlapping named-pilot commitment

### 3. Progressive disclosure

The player should not need to read timeline detail before understanding whether the assignment is viable.

That means:

- assignment first
- readiness second
- detailed draft inspection third

This hierarchy should remain recognizable for:

- one contract
- a route chain
- pooled pilot coverage
- named pilot assignment

### 4. Honest staffing language

Until named pilots are actually in scope, Dispatch should say:

- `Pilot coverage`
- `Crew coverage`
- `Qualification fit`

It should not say:

- `Assign pilot`
- `Assign staff member`

unless the player can actually choose individuals.

When named pilots are in scope, Dispatch may expose named pilot assignment directly, but:

- pilot identity should replace ambiguity, not add clutter
- named assignment should stay clearly subordinate to readiness and legality
- non-pilot named roles should remain out unless separately opened

### 5. Calendar as reflection surface

The calendar should reflect committed dispatches, reserved operational windows, and resulting scheduled work.

The calendar should help the player understand:

- what dispatches are committed
- when aircraft are occupied
- when named pilots are committed or resting, once named pilots exist
- how upcoming operational windows line up over time

The calendar should not become:

- the primary place where dispatch is built
- a second validation surface that disagrees with Dispatch
- a manual scheduling app inside this capability

### 6. Commit impact visibility

Before commit, Dispatch should make visible what the commit will do to system state.

The player should be able to understand:

- whether an existing draft will be replaced
- whether the aircraft becomes reserved or occupied
- whether named pilots become reserved or committed
- whether the calendar will gain new occupied windows
- whether downstream availability becomes tighter

This should be a concise consequence summary, not a second wall of validation text.

### 7. Conflict visibility and recovery

Dispatch should surface conflicts early and explain the most likely way forward.

The player should be able to understand:

- whether the selected aircraft is already tied to another draft or schedule
- whether the selected named pilot is already committed elsewhere
- whether the proposed dispatch window collides with other commitments
- what the most likely fix is

Recovery guidance should remain practical and plain:

- choose another aircraft
- choose another pilot
- reduce the chain
- change the timing
- return to planning and remove the weakest item

### 8. Resume and safe revision

Dispatch should support interruption and return without becoming confusing.

The player should be able to:

- leave a staged dispatch
- return later and understand what was selected
- see what is blocked, risky, or ready
- revise aircraft, named pilots, or chain contents before commit
- abandon the draft intentionally without hidden leftover state

Revision and abandonment should be safe:

- no silent reservations should survive when they should not
- no hidden downstream changes should happen before commit
- replacing a draft should be visible and understandable

### 9. Map as supporting context

Dispatch should be allowed to reuse the same visual map language as Contracts to give geographic context to the assignment being created.

The map should help the player understand:

- where the selected contract or chain sits geographically
- where the assigned aircraft is relative to that work
- how the staged dispatch route reads as a path, not just a list

The map should not become:

- the primary place where legality is explained
- a replacement for the readiness checklist
- a dense world-planning surface
- another panel that restates the same status messages already shown elsewhere

### 10. Adjacent capability boundaries

Dispatch should preserve clear ownership boundaries with nearby capabilities.

Preferred ownership:

- Contracts owns sourcing and acceptance context
- Dispatch owns assignment and readiness
- Staffing owns deeper labor context
- Calendar reflects committed operational truth

Dispatch may reference those surfaces, but should not quietly absorb their full jobs.

### 11. Live operations boundary

Live operations monitoring should be remembered explicitly as a later adjacent capability.

It may eventually include:

- in-flight status tracking
- active interruption visibility
- operational event monitoring
- execution follow-through after commit

That is not part of this capability's primary workflow.
This capability is about setting up dispatches clearly and validating them before commit.

## Proposed Capability Shape

At a high level, the capability should read like this:

- left: selected source work
- center: aircraft and staffing assignment
- right: readiness checklist and next action
- supporting contextual map adjacent to the selected work or details area
- calendar reflection kept secondary to assignment and readiness
- lower or expandable area: detailed draft view

This is a directional structure, not a locked layout.
The important point is hierarchy:

- assignment and readiness first
- detail second
- time utility secondary

## Open Questions That Matter

### 1. Should the readiness checklist be the primary validation surface, or should it sit above a secondary validation detail list?

The checklist should almost certainly be primary.
The open question is how much deeper detail sits under it.

### 2. Should the first assignment action create a draft automatically, or should the player explicitly choose `Stage draft`?

This affects clarity around draft replacement and perceived control.

### 3. How much draft detail should be visible by default for a chain of contracts?

Too little can make chain assignments feel opaque.
Too much recreates the current clutter problem.

### 4. When named pilots are in scope, should Dispatch require explicit pilot assignment for every dispatch, or allow assisted auto-fill with manual override?

This matters because named assignment can improve clarity, but it can also add friction if every simple dispatch becomes crew-pairing work.

### 5. How much calendar detail should appear inside Dispatch versus the shell calendar?

The calendar needs to reflect committed work, but Dispatch should not turn into a calendar editor.

### 6. Should `Accepted Contracts` and `Planned Routes` remain separate input modes, or should Dispatch eventually unify them under one intake list?

The safer current-slice answer is to keep them clearly separate first.

## Mara Use

Mara should treat this as a capability definition with candidate feature slices, not as approved implementation scope.

The core intent to preserve is:

- Dispatch must become easier to understand
- validation must become easier to trust
- information duplication must decrease
- the primary workflow must stay assignment-first
