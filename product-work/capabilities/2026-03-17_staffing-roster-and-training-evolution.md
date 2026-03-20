# FlightLine Task Intake Brief

## Status

This remains a live umbrella capability brief.

Several narrower named-pilot workstreams have already landed, but the broader later capability described here is not fully complete and should not be treated as done.

## Task Intake Brief

- Request title: Pilot roster and training evolution with capability preservation
- Request type: `feature`
- Objective:
  Evolve the Staffing workspace from pooled capability only into a pilots-only named roster layer that creates clearer operating decisions around pilot hiring, qualification, proficiency, availability, and training, while preserving FlightLine's capability-based labor strategy as the baseline abstraction and avoiding full HR-sim scope.
- Why this belongs now:
  This belongs in the future-feature intake inbox now because there is clear player-fantasy demand for more human-feeling staffing, but the current staffing strategy explicitly rejects named individuals for MVP.
  The work needs a scoped product framing before anyone treats "make staff individual" as implementation-ready, and that framing should now be narrowed to pilots only instead of broad labor individualization.
- Desired result:
  A future staffing workstream should aim for:
  - a Staffing workspace with separate `Hiring` and `Manage Pilots` jobs
  - named pilots as the only individualized labor layer in the first pass
  - visible qualification families tied to aircraft role groups instead of per-aircraft certification sprawl
  - visible proficiency bands the player can understand at a glance
  - training, transfer, home base, and availability states that create real operating tradeoffs
  - continued capability summaries so dispatch readiness, labor cost, and qualification coverage remain explainable at a system level
  - continued pooled abstraction for flight attendants, mechanics, and operations support in the first individualized pass
- Current evidence, symptoms, or observations:
  - Current strategy docs intentionally define staffing as purchased capability rather than named people:
    - `strategy/labor-and-staffing.md` says labor should be treated as purchased capability
    - `strategy/labor-and-staffing.md` recommends pooled staffing rather than named individuals for MVP
    - `strategy/labor-and-staffing.md` lists named individual careers, roster micromanagement, and similar depth as explicit non-goals
    - `strategy/dispatch-validation-and-time-advance.md` lists crew rostering as named individuals outside the current dispatch scope
    - `strategy/game-state-model.md` defines `StaffingPackage` as the canonical unit of purchased labor capability
  - The implemented staffing page is still package-based:
    - `src/ui/server.ts` renders staffing as preset activation buttons, coverage summaries, and package tables
    - `src/application/queries/staffing-state.ts` only exposes staffing packages and coverage summaries, not people
    - `src/domain/staffing/types.ts` models staffing packages and labor allocations, not named employees
  - The current wireframes and staffing strategy already support a split between overview and acquisition flows:
    - `wireframes/05-staffing.md`
    - `wireframes/07-staffing-acquisition.md`
    - `strategy/staffing-market-model.md`
  - External official references suggest that named employees can add value, but also show the micromanagement risk if every role becomes individualized at once:
    - [OnAir employees](https://www.onair.company/your-employees/6-0-your-employees/) shows named pilots, mechanics, and attendants plus airport-based hiring
    - [OnAir hiring](https://www.onair.company/your-employees/6-2-hiring/) and [training](https://www.onair.company/your-employees/6-3-training/) show the value of location-based recruiting and qualification training
    - [AirlineSim hiring staff](https://handbook.airlinesim.aero/en/docs/beginners-guide/hiring-staff/) and [management tab docs](https://handbook.airlinesim.aero/en/docs/user-interface/management-tab/) reinforce that pilots and schedules need reserve depth, but not every labor category needs equal manual depth
  - Product inference:
    fully individualized pilots, mechanics, flight attendants, and support staff all at once is overbuilt for the current slice; a pilots-only roster layer on top of preserved capability summaries is the better future direction
- Suspected affected systems, files, or user-facing surfaces:
  - Staffing tab and future pilot hiring or pilot management flow
  - Dispatch staffing validation and pilot allocation rules
  - Aircraft pilot readiness summaries
  - staffing query and domain model:
    - `src/application/queries/staffing-state.ts`
    - `src/domain/staffing/types.ts`
  - related UI and strategy docs:
    - `wireframes/05-staffing.md`
    - `wireframes/07-staffing-acquisition.md`
    - `strategy/labor-and-staffing.md`
    - `strategy/staffing-market-model.md`
    - `strategy/game-state-model.md`
    - `strategy/dispatch-validation-and-time-advance.md`
- Known constraints:
  - Protect the vertical slice: staffing should improve operating decisions, not become an HR management game.
  - Preserve explainability: the player must understand why a pilot is blocked, useful, unavailable, or worth training.
  - Preserve the capability model: aggregate coverage, qualification coverage, and labor cost still need a readable system-level view even if pilots become named.
  - Reuse current qualification-family thinking where possible rather than introducing per-airframe certification clutter.
  - Avoid requiring manual shift-editor gameplay in the first individualized staffing pass.
  - Keep pooled labor packages viable where they still serve the product better than named staff.
- Explicit no-touch areas:
  - no named mechanic layer in the first pass
  - no named flight-attendant layer in the first pass
  - no named operations-support layer in the first pass
  - no morale, personality, or interpersonal simulation in the first pass
  - no union or labor-relations simulation
  - no manual weekly roster planner in the first pass
  - no detailed commuting or travel-booking simulation for transfers
- Red-flag areas involved, if any:
  - staffing persistence and save-model evolution
  - dispatch validation and time-advance interactions with named pilot availability
  - labor allocation consistency when a pilot can be training, traveling, resting, or assigned
  - UI versus state mismatch if the roster says a pilot is available but dispatch cannot legally use them
  - keeping aggregate capability summaries coherent once some labor is named and some remains pooled
- Deadline, urgency, or sequencing pressure:
  No hard deadline known.
  Sequencing guidance:
  - this should come after or alongside a more mature Dispatch workspace, not before
  - named pilots should come before any discussion of named mechanics or other labor categories
  - flight attendants, mechanics, and ops support should remain abstract in the first individualized pass
- Related active workstreams, branches, or sessions:
  Unknown from this session.
  No implementation stream was opened for staffing changes here.
- Known open questions:
  - How should direct hire, contract pool, and service-agreement models coexist with named pilots while preserving clear capability summaries?
  - Which proficiency dimensions actually improve pilot decisions rather than adding noise?
  - Should hiring candidates be generated as a rotating local airport pilot market, or be tied to staffing offers first?
  - How much of pilot availability should be driven by auto-generated duty or rest rules versus explicit player planning later?
  - Should training be limited to qualification unlocks and small proficiency gains, or also affect wage growth and retention later?
  - How should named pilot availability and qualification roll back up into the aggregate readiness signals already used by Dispatch and Aircraft?
- Preferred bias: `balanced`
- Optional proposed owner or role:
  Mara Sterling first for framing.
  Expected supporting roles later:
  - Zoe Bennett for slice-fit and deferral discipline
  - Nadia Cross for dispatch/state-integrity risk

## Notes

- Preferred product direction:
  named pilots only, on top of preserved capability-based staffing
- Recommended minimum useful future scope:
  - named pilots only
  - `Hiring` and `Manage Pilots` tabs
  - qualification-family archetypes
  - visible proficiency bands
  - qualification and proficiency training
  - availability states in the first pass
  - home base and current location as informational context first
  - transfer timing only in a later pass if travel simulation is explicitly opened
  - preserved capability summary layer for coverage, cost, and readiness
- Recommended explicit deferrals:
  - named flight attendants
  - named mechanics
  - named operations support
  - morale and personality systems
  - manual shift planning
  - transfer-travel legality in the first pass
