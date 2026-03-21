# Dispatch Assignment And Readiness Capability

- `Status:` active
- `Workflow state:` ready_to_land
- `Current owner:` Owen Hart
- `Current active slice:` Slice 5 - supporting map context and chain-detail refinement
- `Next routing target:` Owen Hart
- `Last updated:` 2026-03-20

## Relationship To Prior Brief

This brief absorbs and replaces the narrower assignment-first guidance from [2026-03-17_dispatch-assignment-first-ui.md](/Z:/projects/FlightLine/product-work/completed/2026-03-17_dispatch-assignment-first-ui.md).

The older brief now remains only as an archived historical precursor.
This capability brief is the sole canonical live Dispatch capability direction for future framing.

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
- keep `Accepted Contracts` and `Planned Routes` visibly separate in the intake step rather than mixing them into one ambiguous work list
- review one clear summary of the selected work
- treat a planned route or chain as one package first, with leg detail secondary
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

For route chains:

- show the chain as one package summary first
- keep leg-level detail secondary and expandable

### 4. Honest staffing language

Until named pilots are actually in scope, Dispatch should say:

- `Pilot coverage`
- `Crew coverage`
- `Qualification fit`

Preferred wording rule:

- use `Pilot coverage` when the requirement is specifically pilot coverage
- use `Crew coverage` only when the broader pooled term is actually truthful

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

## Mara Use

Mara should treat this as a capability definition with candidate feature slices, not as approved implementation scope.

The core intent to preserve is:

- Dispatch must become easier to understand
- validation must become easier to trust
- information duplication must decrease
- the primary workflow must stay assignment-first

## Current Implementation Reality

The current Dispatch workspace has already improved in useful ways:

- separate route-plan and accepted-work intake sections exist
- aircraft selection is visible and persistent
- named-pilot readiness and committed named-pilot visibility are already surfaced
- backend validation already drives a dedicated validation rail
- commit readiness is already summarized in a bottom action bar

But it still misses the capability's main product shape:

- source selection still reads like two stacked input sections instead of one clear `what am I assigning?` step
- accepted work is still actioned row by row through auto-plan buttons rather than through one selected-work surface
- route-plan handoff still reads as a backend operation instead of a player-facing assignment choice
- the selected work itself does not have one primary summary home
- readiness still feels attached to the selected aircraft draft, not clearly to the assignment decision as a whole

## Decomposition

### Slice 1 - Dispatch source selection and selected work summary

Make Dispatch clearly answer the first decision:

- what source am I dispatching from
- what exact work package is currently selected
- what happens if I stage that work onto the selected aircraft

This slice should:

- separate `Accepted Contracts` and `Planned Routes` as explicit source modes
- make the source list selectable instead of action-per-row first
- add one selected-work summary as the primary home for source truth
- keep the current aircraft strip and current validation-backed draft flow underneath
- preserve the existing backend draft commands where possible instead of reopening schedule generation logic

### Slice 2 - Readiness checklist and commit impact summary

Once source selection is clear, make readiness read like one trusted checklist:

- checklist-first validity model
- plain-English blocker recovery
- commit impact summary with one primary home
- reduced duplication between validation rail and commit bar

### Slice 3 - Draft control and calendar reflection clarity

After source and readiness are trustworthy:

- make current draft state easier to resume and revise
- make replace behavior and intentional discard behavior explicit
- reflect committed dispatch truth in Dispatch by pointing clearly at the existing calendar truth instead of embedding a second calendar surface

### Slice 4 - Named-pilot assignment and manual override

Once source, readiness, and draft control are trustworthy:

- let the player see who can actually cover the selected draft
- keep assisted pilot selection as the default recommendation path
- allow manual override before commit instead of hiding named-pilot choice inside commit-time auto-selection

### Slice 5 - Supporting map context and chain-detail refinement

After named-pilot assignment is stable:

- add supporting geographic context if the selected-work summary still lacks orientation
- tighten chain-detail reading so package-first flow stays clear without hiding leg-level consequence

## Approved Next Slice

`Slice 5 - Supporting map context and chain-detail refinement`

Main conclusion:

Dispatch now makes source selection, readiness, draft control, and named-pilot assignment trustworthy.
The remaining gap is orientation.
The final slice should add lightweight route context and clearer chain detail so multi-stop work can be understood at a glance, without opening a full map subsystem.

Reason for doing it now:

- slices 1 through 4 resolved the core decision and commit-truth gaps first
- the remaining Dispatch friction is player-facing readability rather than backend truth
- current selected-work and timeline panels still make route-chain context harder to scan than it should be
- a compact schematic route-context layer is enough for the vertical slice; a full geospatial map is not

In scope:

- keep this work inside Dispatch only
- add a compact supporting route-context surface for selected work
- use a lightweight schematic route view or route ribbon instead of a full interactive map
- show origin, destination, intermediate stops, and selected row or selected leg context clearly
- tighten planned-route chain detail so each row exposes status, window, payload, and payout in one scan
- keep package-wide context and selected-row context visible without duplicative or conflicting copy
- improve accepted-contract detail only where needed so the single-contract path stays consistent with the new route context
- preserve the current source selection, readiness checklist, draft control, and pilot-assignment flow

Explicit non-goals:

- no full geospatial map workspace
- no map tiles, external map provider, or pan/zoom map interaction
- no calendar embedding
- no live operations monitoring
- no new dispatch legality engine
- no route-planning redesign outside Dispatch consumption

Affected systems or files:

- `src\ui\dispatch-tab-model.ts`
- `src\ui\public\dispatch-tab-client.ts`
- `src\ui\server.ts` only if shared browser assets or shell wiring must move
- focused Dispatch UI-server and browser coverage that proves route-context and chain-detail truth

Validation bar:

- `npm run build`
- focused UI or UI-server coverage proving:
  - selected work shows clearer package-level route context
  - planned-route chain detail is readable row-by-row
  - selected row and package context stay distinct
  - accepted-contract flow remains clear and intact
- preserve current Dispatch source selection, readiness, draft control, and named-pilot override coverage
- preserve:
  - `node test\\backend-smoke.test.mjs`
  - `node test\\ui-server-smoke.test.mjs`
  - `node test\\ui-smoke.test.mjs`

Stop conditions or escalation triggers:

- if the slice starts needing a real map engine or external mapping dependency
- if route-context rendering needs backend geo shape that the current payload does not expose cleanly
- if chain-detail refinement starts forcing a broader route-planning redesign
- if accepted-contract and planned-route detail want materially different workspace patterns instead of one bounded refinement

## Validation And Tracking

- Slice 1 landed on `codex/dev` in commits `2781d90` and `bb7ecef`.
- Slice 2 landed on `codex/dev` in commit `d599517`.
- Slice 3 landed on `codex/dispatch-capability` in commit `04ff029`.
- Slice 4 landed on `codex/dispatch-capability` in commit `47ddcbd`.
- Slice 5 is now active and is the final planned slice for this capability.
- This capability should stay in one dossier unless execution complexity later justifies an exceptional standalone workstream.
