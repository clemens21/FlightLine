# FlightLine Task Intake Brief Example

## Purpose

This file shows one realistic example of a filled intake brief and one example of Mara Sterling's expected response.

Use it as a house pattern, not as a rigid script.

## Example Scenario

This example uses a red-flag bug because it shows when work should not skip framing.

Scenario:
After overnight time advance, an aircraft can finish maintenance in the event feed, save successfully, and still reload as unavailable on the fleet board until time advances again.

## Example Filled Intake Brief

- Request title: Maintenance completion state is inconsistent after save and reload
- Request type: `bug`
- Objective: Make aircraft maintenance completion, dispatch readiness, and UI state remain consistent across overnight time advance, save, and reload
- Why this belongs now: This breaks trust in the core management loop and makes the vertical slice look incoherent during normal fleet operations
- Desired result: After maintenance completes and the player saves and reloads, the aircraft should appear available everywhere it is expected to be available, with no duplicate or delayed completion behavior
- Current evidence, symptoms, or observations: In a QA playthrough, an aircraft completed overnight maintenance in the event feed, the save succeeded, and the next reload still showed the aircraft as unavailable on the fleet board until another hour advanced. The aircraft detail panel and event history did not agree with the fleet board
- Suspected affected systems, files, or user-facing surfaces: maintenance state handling, save and load state restoration, time advance processing, fleet board UI, aircraft detail UI, event application order
- Known constraints: Do not rewrite the entire maintenance system, do not break existing save compatibility if it can be avoided, and do not widen the task into general schedule simulation cleanup
- Explicit no-touch areas: route profitability, ticket pricing, crew scheduling, and unrelated UI polish
- Red-flag areas involved, if any: save and load behavior, event model, scheduling and time advance, UI versus state mismatch
- Deadline, urgency, or sequencing pressure: Should be resolved before the next vertical-slice playtest because it affects player trust in normal overnight operations
- Related active workstreams, branches, or sessions: none currently known
- Known open questions: Is the source of truth wrong after reload, or is the fleet board using stale derived state? Is the completion event being replayed twice, or is it not fully applied before persistence?
- Preferred bias: `confidence`
- Optional proposed owner or role: Start with Mara, likely hand to Eli with Nadia review

## Example Mara Response

- operating mode: `Framed Delivery`
- change budget: `cross-system change`
- primary owner: `Implementation Engineer`
- required supporting roles: `QA and Failure Analyst`; involve `Integration and Release Manager` only if save compatibility or landing order becomes a concern
- framed objective: Restore one coherent post-maintenance aircraft state across time advance, persistence, and UI surfaces so the player sees the same truth after reload that the simulation already believes
- current-slice reason for doing the work now: This is not optional polish. It undermines the explainability of the core operations loop in the current vertical slice
- in-scope work:
  - reproduce the mismatch in a controlled overnight maintenance scenario
  - identify the state authority for maintenance completion after time advance and reload
  - correct the persistence or restore path so the aircraft availability state is coherent after reload
  - ensure the fleet board and aircraft detail panel resolve from the same post-load truth
  - add targeted validation for the reproduction path
- explicit non-goals:
  - no full maintenance system redesign
  - no general event framework rewrite
  - no cleanup of unrelated availability rules
  - no UI polish unrelated to the mismatch
- affected systems or files:
  - maintenance completion state handling
  - save and load restoration for aircraft operational state
  - overnight time-advance event application
  - fleet board availability presentation
  - aircraft detail availability presentation
- assumptions and open questions:
  - assumption: the bug is caused by inconsistent state restoration or stale derived state, not by incorrect maintenance completion calculation itself
  - open question: whether the UI is reading stale cached state or whether the underlying aircraft availability is wrong after load
  - open question: whether the event application order creates a second inconsistent state after reload
- validation bar:
  - reproduce the issue before changing code
  - verify the same overnight scenario after the fix without requiring an extra time advance
  - verify fleet board, aircraft detail panel, and event history remain coherent after reload
  - run any targeted tests that cover persistence, time advance, or availability state if they exist
  - perform at least one manual regression check on an existing save if the persistence shape changes
- escalation triggers:
  - stop and return if the fix requires a save-schema change with broader compatibility impact
  - stop and return if the real issue appears to be a larger event-ordering defect affecting multiple operational systems
  - stop and return if more than one subsystem needs simultaneous overlapping edits with unclear ownership
- whether temporary builder authorization is needed: not now; keep this sequential unless the investigation proves there are two truly separable implementation streams
- deferred work or backlog capture:
  - later audit of other overnight state transitions for similar post-load inconsistencies
  - later review of whether availability UI should rely less on cached derived state

## Copy-Paste Example Prompt To Mara

```text
Read and follow Z:\projects\FlightLine\AGENTS.md.

You are Mara Sterling, Technical Lead.
Use Z:\projects\FlightLine\team-ops\supporting\flightline_task_intake_brief.md as the intake standard.

Task intake brief:
- Request title: Maintenance completion state is inconsistent after save and reload
- Request type: bug
- Objective: Make aircraft maintenance completion, dispatch readiness, and UI state remain consistent across overnight time advance, save, and reload
- Why this belongs now: This breaks trust in the core management loop and makes the vertical slice look incoherent during normal fleet operations
- Desired result: After maintenance completes and the player saves and reloads, the aircraft should appear available everywhere it is expected to be available, with no duplicate or delayed completion behavior
- Current evidence, symptoms, or observations: In a QA playthrough, an aircraft completed overnight maintenance in the event feed, the save succeeded, and the next reload still showed the aircraft as unavailable on the fleet board until another hour advanced. The aircraft detail panel and event history did not agree with the fleet board
- Suspected affected systems, files, or user-facing surfaces: maintenance state handling, save and load state restoration, time advance processing, fleet board UI, aircraft detail UI, event application order
- Known constraints: Do not rewrite the entire maintenance system, do not break existing save compatibility if it can be avoided, and do not widen the task into general schedule simulation cleanup
- Explicit no-touch areas: route profitability, ticket pricing, crew scheduling, and unrelated UI polish
- Red-flag areas involved, if any: save and load behavior, event model, scheduling and time advance, UI versus state mismatch
- Deadline, urgency, or sequencing pressure: Should be resolved before the next vertical-slice playtest because it affects player trust in normal overnight operations
- Related active workstreams, branches, or sessions: none currently known
- Known open questions: Is the source of truth wrong after reload, or is the fleet board using stale derived state? Is the completion event being replayed twice, or is it not fully applied before persistence?
- Preferred bias: confidence
- Optional proposed owner or role: Start with Mara, likely hand to Eli with Nadia review

Return:
- operating mode
- change budget
- primary owner
- required supporting roles
- framed objective
- in-scope work
- explicit non-goals
- affected systems or files
- assumptions and open questions
- validation bar
- escalation triggers
- whether temporary builder authorization is needed
- deferred work or backlog capture

End with the required closeout template from AGENTS.md.
```

## Final Guidance

This is a good intake example because it gives Mara enough information to route and frame the work without pretending the implementation is already solved.

It names the problem, the evidence, the risk class, the boundaries, and the validation pressure.
