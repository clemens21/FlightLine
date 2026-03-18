# Dispatch Workspace Revitalization Framed Delivery

- Operating mode: `Framed Delivery`
- Change budget: medium, single bounded stream
- Primary owner: Eli Mercer
- Required supporting roles:
  - Nadia Cross for validation and UI/state-integrity review
  - Owen Hart only if implementation pressure expands into command, event-model, or landing-order coordination
- Temporary builder authorization: authorized now for one bounded implementation stream only

## Handoff Contract

### 1. Objective

Replace the current admin-heavy Dispatch tab with a planning-first single-aircraft board that helps the player assemble, review, validate, and commit one aircraft schedule at a time.

### 2. Current-slice reason for doing the work now

Dispatch is currently one of the clearest UI/product mismatches in the repo. The strategy and wireframes already define Dispatch as a central planning surface, but the implemented tab is still split across `Advance Time`, `Route Plan Handoff`, `Accepted Work`, and `Schedules`, which reads as utilities rather than a real planning workflow.

### 3. In-scope work

- Build a selected-aircraft planning board in the Dispatch tab.
- Make route-plan handoff and accepted work visible as planning inputs, not separate parallel panels.
- Show a leg queue with lightweight timeline summary for the selected aircraft.
- Show selected-leg detail that updates with selection.
- Keep validation and warnings visible at all times for the currently selected aircraft plan.
- Add a bottom commitment summary bar for projected profit, staffing impact, maintenance pressure, and commit readiness.
- Demote `Advance Time` so it is no longer the headline Dispatch job.
- Reuse existing backend commands and read models where possible:
  - `SaveScheduleDraft`
  - `CommitAircraftSchedule`
  - route-plan binding and auto-plan entry points
  - existing schedule and contract queries

### 4. Explicit non-goals

- No multi-aircraft network scheduler.
- No dedicated `Monitor` mode in this first pass.
- No calendar replacement or heavy clock workflow inside Dispatch.
- No heavy drag-and-drop or Gantt-style timeline editor.
- No named-pilot or named-crew mechanics as part of this stream.
- No schema, migration, or event-model redesign unless Mara explicitly re-frames the work.
- No silent relocation of contract-planning responsibilities out of Contracts.

### 5. Affected systems or files

- `src/ui/server.ts`
- `src/ui/save-shell-page.ts`
- likely a new browser-side dispatch controller under `src/ui/public/`
- `src/application/queries/schedule-state.ts`
- `src/ui/route-plan-dispatch.ts`
- dispatch-related API action render paths in `src/ui/server.ts`
- dispatch UI or integration coverage in:
  - `test/ui-smoke.test.mjs`
  - `test/ui-server-smoke.test.mjs`
  - existing route-plan and backend dispatch tests where relevant

### 6. Assumptions and open questions

- Assumption: existing schedule, route-plan, and commit surfaces are sufficient for a first planning-first board without new persistence.
- Assumption: the first pass can stay server-driven for core markup, with lightweight client behavior only where selection or local planning interactions need it.
- Open question: should the work-input surface be a lane, side rail, or compact queue inside the same board?
- Open question: how much manual leg editing is realistic before new command surfaces are needed?
- Open question: how should the validation rail present backend truth if no committed draft exists yet?

### 7. Required validation

- `npm run build`
- browser-level Dispatch interaction coverage for:
  - selected-aircraft planning surface rendering
  - route-plan or accepted-work input visibility
  - selected-leg detail updates
  - commit affordance behavior
- regression coverage that existing route-plan binding still works
- regression coverage that schedule commit and advance-time flows still work
- explicit verification that displayed blockers or warnings do not invent client-only legality rules that diverge from backend validation

### 8. Stop conditions or escalation triggers

- The board cannot be built cleanly without new backend command or query shapes.
- The validation rail would require client-invented rules instead of backend-backed truth.
- The implementation starts drifting into monitor mode, calendar editing, or network planning.
- The work needs schema, migration, or event-order changes.
- The route-plan or contract handoff integrity becomes unclear or brittle.

### 9. Final disposition of deferred work

- Defer monitor-mode expansion.
- Defer heavy timeline editing and drag-and-drop.
- Defer named-pilot availability support.
- Defer network-wide scheduling.
- Defer any schema or event-model changes unless a later Mara framing explicitly opens that stream.
