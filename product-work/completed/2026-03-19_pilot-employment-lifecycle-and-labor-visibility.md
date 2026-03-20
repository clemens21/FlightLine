# Pilot Employment Lifecycle And Labor Visibility

## Status

- Status:
  Completed capability with landed slices 1, 2, and 3.
- Workflow state:
  completed_capability
- Current owner:
  Technical Lead (Mara Sterling)
- Current active slice:
  none
- Next routing target:
  none
- Last updated:
  2026-03-19

## Capability Brief

- Capability title:
  Pilot employment lifecycle and labor visibility

- Player problem:
  The current pilot staffing model lets the player hire named pilots, but it still feels narrow and incomplete. The player cannot convert a contractor to a permanent employee, cannot dismiss pilots cleanly, sees only a tiny candidate pool, and has weak visibility into what pilot labor is actually costing, why one pilot costs more than another, or what a candidate's experience and visible strengths really look like.

- Player outcome:
  The player should be able to build and manage a named pilot workforce with clearer control over employment type, lifecycle decisions, labor cost visibility, and pilot profile visibility, without turning FlightLine into a full HR management sim.

- Why this capability belongs now:
  Staffing has already become a meaningful named-pilot system through hiring, training, travel, and roster management. The remaining gaps are now player-visible. Employment choice without lifecycle follow-through feels incomplete, and contract economics without a readable labor record risks losing explainability.

- Minimum useful scope:
  - choose `Direct hire` or `Contract hire` during pilot hiring
  - show a clear pre-confirmation comparison so the player can make an informed `Direct hire` versus `Contract hire` decision
  - keep the hiring market candidate-based rather than employment-path-based so the player evaluates one pilot, then compares hire paths inside that pilot's detail view
  - keep the hiring row scannable and limited to:
    - pilot identity
    - qualification lane plus short certification summary
    - total career hours
    - primary qualification-family hours
    - base
    - starting price signal
  - show why one pilot costs more than another using visible pricing drivers
  - show a short cost-driver summary before hire, with certification complexity and flight time as the main anchors
  - direct hire uses salary-style recurring pay
  - contract hire uses an upfront engagement fee plus billed flight-hour use
  - open a large selected-candidate overlay as the main decision surface for hiring, with this first-pass section order:
    - identity brief
    - flight profile
    - certifications
    - operational profile
    - direct-versus-contract comparison
    - pricing summary plus named drivers
    - coverage impact
    - primary hire action
  - show direct and contract hire as neutral side-by-side comparison cards when both are available for the same candidate
  - require the player to explicitly choose a hire path before confirmation; do not assume a default path in the first pass
  - use a full hire confirmation step that leads with the selected path and cost shape, then recaps only the key candidate and coverage information needed to commit
  - convert a contract pilot to direct hire
  - dismiss either type of pilot
  - show a larger pilot candidate pool than the current tiny market
  - show a visible pilot profile for candidates and rostered pilots:
    - certifications and qualification lane
    - total flight time
    - company flight time once hired
    - compact qualification-family experience breakdown
    - a small set of role-relevant pilot stats on a visible proficiency scale
  - recommended first-pass visible pilot stats:
    - operational reliability
    - stress tolerance
    - procedure discipline
    - training aptitude
  - recommended first-pass proficiency scale:
    - developing
    - solid
    - strong
    - exceptional
  - auto-generate candidate flight time in plausible ranges based on qualification lane and certification breadth, with the resulting hour bands staying visible and explainable to the player
  - increase a pilot's tracked flight time as completed company-operated flying resolves through execution
  - provide a pilot labor record the player can read:
    - hire or contract start
    - conversion
    - dismissal
    - contract end
    - billed flight hours for contract pilots
    - recurring salary or contractor charges

- Explicit non-goals:
  - no all-staff individual employment model
  - no mechanics, flight attendants, or ops-support employee lifecycle in this pass
  - no wage negotiation
  - no morale, retention, or performance-review simulation
  - no giant personality-stat sheet
  - no single hidden overall-rating number that replaces visible pilot facts
  - no broad company-wide timesheet system for every labor state
  - no reserve-duty, training-duty, or rest-hour payroll model
  - no detailed legal or labor-relations simulation

- Current slice boundaries:
  - keep this pilots-only
  - keep the first labor-record view tightly explainable
  - hiring must show the player the direct-hire versus contract-hire tradeoff before confirmation, not only after charges start appearing in the ledger
  - the hire market should stay candidate-based, not split into duplicate employment-path rows for the same pilot
  - the one extra row-level judgment cue should be primary qualification-family hours, not broad tier labels or dense stat summaries
  - pilot pricing should be grounded in visible factors such as certification complexity, flight time, employment model, and visible pilot stat bands; it should not rely on opaque hidden scoring or implied behind-the-scenes quality grades
  - certification complexity and flight time should do more work in pricing than softer profile traits
  - the full hiring workspace may carry rich candidate detail because it owns a full screen, but list-row scanning should stay tight and the deeper detail should live in a large selected-candidate overlay
  - direct versus contract comparison belongs in the selected-candidate overlay, not in every market row
  - the direct-versus-contract comparison should be neutral in tone; the first pass should not auto-recommend or auto-select one path
  - pricing explanation should use one short summary sentence plus 3-5 named visible drivers rather than a formula dump or a hidden overall rating
  - do not use broad market-value tier labels such as `budget`, `standard`, or `premium`; named drivers are more grounded and more explainable
  - the final hire confirmation step should be cost-first and recap-only; it should not repeat the full candidate profile
  - the visible stat set should stay small, pilot-relevant, and operationally meaningful
  - first-pass pilot stats should use broad visible proficiency bands rather than fake-precision decimals
  - `operational reliability` should be used instead of a raw `punctuality` stat so the player does not infer that all delay risk comes from the pilot alone
  - preferred first-pass interpretation of "timesheet":
    a pilot activity-and-cost ledger, not a generalized HR/payroll subsystem
  - first-pass contract usage billing should remain tied to completed flight-leg hours only
  - first-pass flight-time visibility should distinguish total career flight time from company-earned flight time
  - first-pass pilot profile should keep all three experience views:
    total career hours, company-earned hours, and a compact qualification-family experience breakdown
  - company-earned flight time should grow from completed company-operated legs, including reposition or ferry flying where the pilot actually flew
  - candidate-generated flight time should be plausible for the pilot's certifications and qualification band; obviously unrealistic rookie-versus-veteran combinations should be avoided
  - higher-complexity or broader-certification candidates should usually skew toward higher plausible hour bands than entry-level candidates
  - first-pass dismissal should be blocked while a pilot is committed to reserved, flying, or training work; otherwise it may resolve immediately with a clear effective-time message
  - conversion and dismissal should stay operationally truthful, including staffing coverage, dispatch legality, and finance impact

- Related systems or user-facing surfaces:
  - Staff > Hire
  - Staff > Employees
  - pilot candidate detail overlay
  - employee detail panel
  - staffing market generation
  - staffing state and named-pilot roster state
  - finance ledger and recurring obligations
  - time advance and contract-hour settlement

- What the player should understand or feel:
  - hiring a pilot is a real employment decision, not just buying abstract coverage
  - contract versus direct hire has visible tradeoffs
  - the player can compare those tradeoffs before they commit to one path
  - the hiring market is easy to scan first and rich to inspect second
  - better-qualified, more experienced, and stronger pilots cost more for visible reasons
  - certifications and total hours are the primary signals of pilot market value, not decorative stats
  - visible pilot stats and flight-time history help explain why one candidate is better suited than another
  - the player can tell why a pilot fits a qualification lane, not just that the pilot is generally "good"
  - the player can see what is different between `Direct hire` and `Contract hire` for the same candidate without feeling nudged toward a hidden preferred option
  - the player can see what labor is costing and why
  - the final hire step makes the financial commitment clear before they commit
  - pilot experience grows over time as that pilot flies company work, including non-revenue operational legs
  - roster changes like conversion or dismissal are understandable and do not feel hidden
  - the system still feels like airline operations management, not office administration

- Likely blockers or confusion states this capability should resolve:
  - "Why is this pilot costing me what they cost?"
  - "Why is this pilot more expensive than that one?"
  - "What makes this pilot good besides certifications?"
  - "Why can I hire contractors but not convert them?"
  - "Why can I not dismiss a pilot I no longer want?"
  - "Why are there only three candidates in the whole market?"
  - "What counts as contractor usage?"
  - "How much real flight experience does this pilot have?"
  - "Why did this pilot's company flight time go up?"
  - "How do labor changes affect staffing coverage and dispatch readiness?"

- What should stay later:
  - wage negotiation
  - contractor renewal flows
  - richer contractor offer structures
  - broader labor-market sophistication beyond pilots
  - deeper per-aircraft logbook detail
  - larger personality or trait modeling beyond the small operational stat set
  - deeper labor history analytics if the first-pass record is not enough

- Open questions that actually matter:
  - What is the right larger market size: enough to feel like a pool, but not so many that the market becomes a wall of duplicates?
  - Should contractor conversion preserve the same pilot identity and history, or effectively replace the contract package with a new direct-hire package while preserving the pilot record?
  - How much of the pilot labor record belongs at the individual pilot level versus a company-level labor summary surface?

## Decomposition

- Proposed slices:
  1. profile-backed hiring market and employment economics truth
  2. contractor conversion and dismissal controls
  3. pilot labor ledger visibility
- Completed slices:
  1. profile-backed hiring market and employment economics truth
     - status:
       cleared by Nadia and ready to land
     - landed scope:
       candidate-based market, larger candidate pool, visible pilot profiles and stat bands, selected-candidate overlay, direct-versus-contract comparison, direct salary truth, contract engagement-fee plus completed-flight-hour billing, paired-offer retirement, and duplicate-hire prevention
  2. contractor conversion and dismissal controls
     - status:
       cleared by Nadia and landed
     - landed scope:
       contract-to-direct conversion with named-pilot identity continuity, conversion blocking while reserved or flying, dismissal controls for eligible pilots, dismissal blocking while reserved, flying, training, or traveling, truthful staffing and finance transitions after conversion and dismissal, and Staff employee-detail action plus blocked-state messaging
  3. pilot labor ledger visibility
     - status:
       cleared by Nadia and landed
     - landed scope:
       pilot-scoped labor-history read model, staffing-tab-only labor-history hydration, employee-detail labor-record rendering, and truthful visibility for hire or contract start, conversion, dismissal, contract end, contract usage billing, and salary collection when those entries exist
  4. market-pool tuning and candidate-volume follow-up
     - status:
       satisfied for now; not needed as an active remaining slice
     - rationale:
       slice 1 already moved the market past the original thin-pool problem, with the current pilot market generating materially more than the original three-candidate state and tests holding that larger floor in place
- Approved next slice:
  - none; capability complete
- Deferred slices:
  - wage negotiation
  - contractor renewal
  - richer contract offer structures
  - non-pilot employment lifecycle

## Validation And Tracking

- Validation bar for current approved slice:
  - build passes
  - employee detail shows a readable labor-record section for rostered pilots
  - labor record includes the relevant first-pass events and charges when they exist:
    hire or contract start, conversion, dismissal, contract end, contract usage billing, and recurring salary collection
  - record entries come from existing ledger and event truth, not duplicated hand-built shadow state
  - contract usage entries show billed completed-flight hours and charge amount truthfully
  - salary or contractor charges stay attached to the correct pilot record through staffing package linkage
  - save/load preserves labor-record visibility
  - UI-server or browser coverage proves the record renders correctly for at least direct-hire, contract-hire, converted, and dismissed pilot cases
- Related GitHub issues:
  - #40 closed after revalidation; paired-offer retirement and duplicate-hire prevention fixed in slice 1
- Notes from Mara, Nadia, or Owen:
  - Mara recommendation: do not treat this whole capability as one Eli stream
  - preferred first-pass interpretation of "timesheet": pilot activity-and-cost ledger, not a generalized payroll simulator
  - visible pilot stats stay in the capability, but they should enter through the hiring-and-profile slice first rather than being split into a separate hidden-model stream
  - Nadia disposition for slice 1: ready to land
  - Mara review on slice 2 found a finance-truth blocker: converting a reserved contract pilot currently drops hourly billing for already committed contract work; tracked in #41 and routed back to Eli
  - Mara revalidation on 2026-03-19: reserved and flying contract-pilot conversion now block cleanly in both command and Staff UI flows; slice 2 routed to Nadia after focused build plus staffing-market and UI-server staffing validation
  - Nadia disposition for slice 2: ready to land after focused build, staffing-market, and UI-server staffing review; no findings
  - Owen landed slice 2 on 2026-03-19 as a bounded unit after build plus staffing-market and UI-server staffing validation
  - Zoe recommendation on 2026-03-19: treat the market-pool follow-up as satisfied for now unless later playtesting shows the landed pilot market still feels too thin or too repetitive
  - Mara revalidation on 2026-03-19: slice 3 labor-record query and employee-detail rendering passed build, staffing-market, UI-server staffing, and browser UI smoke validation before QA handoff
  - Nadia disposition for slice 3: ready to land after focused build, staffing-market, UI-server staffing, and browser UI smoke review; no findings
  - Owen landed slice 3 on 2026-03-19 as a bounded unit after build, staffing-market, UI-server staffing, and browser UI smoke validation, and closed the capability dossier as complete

## Notes

- The capability dossier is now the single active source of truth for this initiative.
