# FlightLine Task Intake Brief

## Task Intake Brief

- Request title: Dispatch workspace revitalization
- Request type: `feature`
- Objective:
  Turn the Dispatch tab from a utility-heavy admin page into a planning-first single-aircraft board that helps the player build, validate, and commit one aircraft schedule at a time with confidence.
- Why this belongs now:
  Future backlog capture belongs now because Dispatch is currently one of the clearest product-surface mismatches in the repo: the strategy and wireframes describe Dispatch as a central planning surface, but the implemented page is still dominated by time control, route-plan handoff, and static tables.
  This should be framed before piecemeal UI tweaks turn into accidental design drift.
- Desired result:
  A future Dispatch workstream should produce:
  - a selected-aircraft planning surface
  - a unified work-input lane for accepted work and route-plan handoff
  - a schedule builder centered on leg queue and timeline summary for one aircraft
  - selected-leg detail that updates as the player sequences work
  - always-visible blockers and warnings
  - clear projected profit, maintenance pressure, and staffing impact at the schedule level
  - a bottom commitment bar that summarizes commit readiness for the whole aircraft plan
  - stronger integration between Contracts, route planning, and dispatch execution as planning inputs, not parallel mini-apps
- Current evidence, symptoms, or observations:
  - A live local render of the current Dispatch tab shows the page is mostly empty utility space: `artifacts/dispatch-page-review.png`
  - In that live render, `Advance Time` dominates the top-left panel while the rest of the page is mostly sparse operational tables or empty states
  - The current implementation in `src/ui/server.ts` renders Dispatch as:
    - `Advance Time`
    - `Route Plan Handoff`
    - `Accepted Work`
    - `Schedules`
    with no aircraft-first schedule-building workspace, no persistent validation rail, and no selected-leg detail surface
  - This conflicts with existing local product docs:
    - `wireframes/03-dispatch.md` expects a schedule builder, validation and decision-support panel, selected-leg detail, and bottom commitment bar
    - `strategy/screen-blueprints.md` says Dispatch should prioritize aircraft timeline, selected legs, always-visible validation, projected profitability, and maintenance/staffing impact
    - `strategy/dispatch-validation-and-time-advance.md` already defines a validation model with hard blockers, warnings, projected schedule profit, risk band, staffing tightness, and maintenance pressure
  - Current product architecture also says the clock/calendar belongs in the shell, not as the main job of Dispatch:
    - `strategy/ui-information-architecture.md` lists `Clock / Calendar` as a shell utility
    - `strategy/time-and-calendar.md` says the calendar should not replace Dispatch
  - Backend support already exists or is partially defined for core operations:
    - schedule validation rules in `src/application/dispatch/schedule-validation.ts`
    - command and execution work around schedules and time advancement in the backend command layer
    - route-plan binding and auto-plan hooks exist in the UI flow
  - External official references suggest the same pattern:
    - [AirlineSim scheduling flights](https://handbook.airlinesim.aero/en/docs/beginners-guide/scheduling-flights/) centers flight planning around aircraft schedules and sequence feasibility
    - [AirlineSim operations tab](https://handbook.airlinesim.aero/en/docs/user-interface/operations-tab/) separates aircraft/fleet operations from broader management and includes an operations control timeline
    - [FSCharter charter jobs](https://help.fscharter.net/article/charter-jobs) treats a dispatch plan as the operational blueprint for one or more legs, including routing, job grouping, status flow, and connections
    - [FSCharter creating a charter job](https://help.fscharter.net/article/creating-a-charter-job) reinforces the value of route construction, multi-leg grouping, and releasing a plan only after it is configured
  - Product inference:
    FlightLine's dispatch simulation backbone is further along than its dispatch surface. The next improvement should make the player see and trust that simulation through a planning-first single-aircraft board, not through a combined planning-and-monitoring surface or a second calendar app.
- Suspected affected systems, files, or user-facing surfaces:
  - Dispatch tab UI in `src/ui/server.ts`
  - dispatch validation logic in `src/application/dispatch/schedule-validation.ts`
  - schedule and time-advance command surfaces
  - route-plan handoff and auto-plan entry points:
    - `src/ui/route-plan-dispatch.ts`
    - relevant dispatch actions in `src/ui/server.ts`
  - related strategy and wireframe docs:
    - `wireframes/03-dispatch.md`
    - `strategy/dispatch-validation-and-time-advance.md`
    - `strategy/time-and-calendar.md`
    - `strategy/ui-information-architecture.md`
    - `strategy/screen-blueprints.md`
- Known constraints:
  - Keep Dispatch single-aircraft-first.
  - Keep Dispatch planning-first in the first pass.
  - Do not turn Dispatch into multi-aircraft network planning in this workstream.
  - Keep validation explainable and always visible.
  - Preserve the separation between Dispatch and the shell clock/calendar utility.
  - Use route-plan handoff as an input to Dispatch, not as a replacement for Dispatch.
  - Prefer a queue-and-detail planning board before any rich drag-and-drop timeline editor.
- Explicit no-touch areas:
  - no multi-aircraft network scheduler in this workstream
  - no separate full-screen calendar replacement inside Dispatch
  - no dedicated `Monitor` mode in the first pass
  - no deep named-crew rostering as part of this Dispatch pass
  - no heavy world-map planning layer unless Mara explicitly decides it is needed
  - no silent rewrite of contract planning to move everything out of Contracts
  - no heavy drag-and-drop or Gantt-style schedule editor in the first pass
- Red-flag areas involved, if any:
  - schedule validation and commit behavior
  - time advancement and stop conditions
  - UI versus backend validation mismatch
  - contract assignment state and planner-to-dispatch handoff integrity
  - maintenance and staffing warnings if surfaced inconsistently
- Deadline, urgency, or sequencing pressure:
  No hard deadline known.
  Sequencing guidance:
  - this should be treated as a high-value current-slice quality pass when Dispatch becomes active priority
  - moving `Advance Time` out of the main Dispatch emphasis should happen early
  - a planning-first board should come before any monitor-mode expansion
  - a richer planning workspace should come before any network-scale scheduling ambitions
- Related active workstreams, branches, or sessions:
  Unknown from this session.
  No dispatch implementation branch was opened here.
- Known open questions:
  - Should the work-input surface be an inbox lane, a side rail, or a compact queue inside the same board?
  - How much manual leg editing should exist before the route-plan handoff and auto-plan tools are refined further?
  - How should projected schedule profit be presented so it is useful but clearly distinct from realized outcome?
  - What is the minimum timeline representation needed to make sequencing readable without committing to a heavy editor?
  - Should maintenance blocks remain inserted through simple actions in the first pass rather than draggable schedule items?
- Preferred bias: `balanced`
- Optional proposed owner or role:
  Mara Sterling first for framing.
  Expected supporting roles later:
  - Zoe Bennett for scope and current-slice fit
  - Nadia Cross for validation and state-integrity scrutiny
  - Owen Hart later if dispatch changes must land in lockstep with contracts, route planning, and clock behavior

## Notes

- Preferred product direction:
  Dispatch should become a planning-first operational board for one selected aircraft.
- Strong recommendation:
  `Advance Time` should stop being the headline feature of the Dispatch tab and return to a secondary or shell-level utility role, consistent with existing product docs.
- Recommended minimum useful future scope:
  - aircraft selector with operational summary
  - unified work-input lane for accepted work and route-plan handoff
  - leg queue with lightweight timeline summary
  - selected-leg detail panel
  - always-visible validation rail
  - projected schedule profit, staffing impact, and maintenance pressure summary
  - bottom commitment bar
- Recommended explicit deferrals:
  - network-wide multi-aircraft planning
  - monitor-mode expansion beyond planning needs
  - calendar-like editing inside Dispatch
  - heavy drag-and-drop timeline editing
  - deep crew-management mechanics
