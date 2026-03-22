# FlightLine Capability Dossier

## Status

- Status: active
- Workflow state: ready_for_nadia
- Current owner: Nadia Cross
- Current active slice: Slice 2 - proactive service visibility and due-soon planning support
- Next routing target: Nadia Cross
- Last updated: 2026-03-21

## Capability Brief

- Capability title: Aircraft Maintenance Recovery And Service Flow
- Player problem: Aircraft can enter `due soon`, `overdue`, or `AOG` maintenance states that block flying, but the player does not currently have a clear maintenance workflow to recover the aircraft and continue playing.
- Player outcome: The player can understand when maintenance is becoming a risk, start service from the Aircraft workspace, pay and wait through a visible maintenance task, and get the aircraft back into a truthful dispatchable state.
- Why this capability belongs now: Multiple live UI playthroughs dead-ended on maintenance with no visible recovery path, including [#55](https://github.com/clemens21/FlightLine/issues/55), [#56](https://github.com/clemens21/FlightLine/issues/56), and [#57](https://github.com/clemens21/FlightLine/issues/57). This is now a core vertical-slice blocker, not polish.
- Minimum useful scope: A player-facing maintenance recovery action for `due soon`, `overdue`, and `AOG` aircraft, plus enough proactive service visibility that the player can see and act on maintenance pressure before the company hits a no-fly dead-end.
- Explicit non-goals:
  - no provider marketplace
  - no heavy-check / overhaul depth
  - no maintenance staffing subsystem
  - no spare-parts economy
  - no drag-and-drop maintenance scheduling board
  - no deep cost rebalance beyond what the current recovery loop needs
- Current slice boundaries: Slice 1 resolves the current blocker family by exposing and completing the recovery loop. Slice 2 improves planning visibility and due-soon service support so the player can avoid the dead-end earlier.
- Related systems or user-facing surfaces:
  - Aircraft workspace
  - Dispatch readiness and staging truth
  - Clock / Calendar
  - time advance
  - maintenance task read/write state
  - company cash / ledger truth
- What the player should understand or feel: Maintenance is a real operating constraint, but not a mysterious trap. The player should be able to see when an aircraft needs service, understand what it will cost and how long it will take, and recover the fleet without leaving the management loop.
- Likely blockers or confusion states this capability should resolve:
  - aircraft becomes AOG with no visible action
  - due-soon aircraft can dead-end Dispatch without a service path
  - maintenance state and current commitment are visible, but the player cannot act on them
  - Calendar and Aircraft may show maintenance truth while Dispatch remains operationally blocked
- What should stay later:
  - richer maintenance severity choices
  - vendor differences and contract maintenance
  - proactive maintenance booking while aircraft are still fully healthy
  - maintenance queue optimization / broader planning UX
- Open questions that actually matter:
  - Should slice 1 allow direct service booking for `due soon` aircraft immediately, or only for `overdue` / `AOG` and clearly risky `due soon` states?
  - How much detail should the service CTA show in slice 1: just cost/duration, or also a stronger explanation of the maintenance state transition?

## Decomposition

- Proposed slices:
  - Slice 1 - maintenance recovery and return-to-service loop
  - Slice 2 - proactive service visibility and due-soon planning support
- Approved next slice:
  - Slice 1 - maintenance recovery and return-to-service loop
- Deferred slices:
  - any richer maintenance economy or provider differentiation after slice 2

## Validation And Tracking

- Validation bar for current approved slice:
  - `npm run build`
  - focused backend coverage for `ScheduleMaintenance`, maintenance-task completion, ledger truth, and aircraft status recovery
  - focused UI / UI-server coverage proving the Aircraft workspace exposes the service action for eligible aircraft and that the player sees cost/duration/ready-at truth
  - focused browser smoke proving an aircraft can be sent to service through the UI and later returns to a usable state after time advance
  - verify Dispatch truth stays consistent while an aircraft is in maintenance
- Related GitHub issues:
  - [#55](https://github.com/clemens21/FlightLine/issues/55)
  - [#56](https://github.com/clemens21/FlightLine/issues/56)
  - [#57](https://github.com/clemens21/FlightLine/issues/57)
- Notes from Mara, Nadia, or Owen:
  - Current promoted line already includes partial maintenance command/state scaffolding, so slice 1 should complete the player-facing loop instead of inventing a broad new subsystem.
  - Current worktree candidate implements both slice 1 recovery flow and slice 2 proactive visibility together because the same Aircraft and Dispatch truth paths were already open on this branch.

## Notes

- Keep this player-facing.
- This is the default capability source of truth.
- Standalone workstream files are exceptional, not the default.
