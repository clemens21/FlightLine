# Pilot Employment Lifecycle And Labor Visibility

## Status

Draft for user-plus-Mara review before workstream decomposition.

## Capability Brief

- Capability title:
  Pilot employment lifecycle and labor visibility

- Player problem:
  The current pilot staffing model lets the player hire named pilots, but it still feels narrow and incomplete. The player cannot convert a contractor to a permanent employee, cannot dismiss pilots cleanly, sees only a tiny candidate pool, and has weak visibility into what pilot labor is actually costing, why one pilot costs more than another, or what a candidate's experience and quality really look like.

- Player outcome:
  The player should be able to build and manage a named pilot workforce with clearer control over employment type, lifecycle decisions, labor cost visibility, and pilot quality visibility, without turning FlightLine into a full HR management sim.

- Why this capability belongs now:
  Staffing has already become a meaningful named-pilot system through hiring, training, travel, and roster management. The remaining gaps are now player-visible. Employment choice without lifecycle follow-through feels incomplete, and contract economics without a readable labor record risks losing explainability.

- Minimum useful scope:
  - choose `Direct hire` or `Contract hire` during pilot hiring
  - show a clear pre-confirmation comparison so the player can make an informed `Direct hire` versus `Contract hire` decision
  - show why one pilot costs more than another using visible pricing drivers
  - show a short cost-driver summary before hire, with certification complexity and flight time as the main anchors
  - direct hire uses salary-style recurring pay
  - contract hire uses an upfront engagement fee plus billed flight-hour use
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
  - auto-generate candidate flight time in plausible ranges based on qualification, certification breadth, and candidate quality
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
  - pilot pricing should be grounded in visible factors such as certification complexity, flight time, employment model, and standout pilot strengths; it should not rely on opaque hidden scoring
  - certification complexity and flight time should do more work in pricing than softer profile traits
  - the full hiring workspace may carry rich candidate detail because it owns a full screen, but list-row scanning should stay tight and the deeper detail should live in the selected-candidate view
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
  - better-qualified, more experienced, and stronger pilots cost more for visible reasons
  - certifications and total hours are the primary signals of pilot market value, not decorative stats
  - visible pilot stats and flight-time history help explain why one candidate is better suited than another
  - the player can see what labor is costing and why
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
  - Should the player see direct-hire and contract-hire side by side for the same candidate, or should different offers represent different employment paths?
  - What is the right larger market size: enough to feel like a pool, but not so many that the market becomes a wall of duplicates?
  - Should contractor conversion preserve the same pilot identity and history, or effectively replace the contract package with a new direct-hire package while preserving the pilot record?
  - Should pricing explanation be shown as a short "why this pilot costs this much" driver list, a compact market-value summary, or both?
  - Are four visible proficiency bands enough, or does Mara want a different first-pass rating vocabulary?
  - How much of the pilot labor record belongs at the individual pilot level versus a company-level labor summary surface?

## Decomposition

- Proposed slices:
  1. pilot profile, cost-driver visibility, and employment economics truth for direct versus contract hire
  2. contractor conversion and dismissal controls
  3. larger pilot market pool
  4. pilot labor ledger or timesheet visibility
- Approved next slice:
  none yet; capability review first
- Deferred slices:
  - wage negotiation
  - contractor renewal
  - richer contract offer structures
  - non-pilot employment lifecycle

## Validation And Tracking

- Validation bar for current approved slice:
  not set yet; waiting on capability review and slice approval
- Related GitHub issues:
  none linked yet
- Notes from Mara, Nadia, or Owen:
  - Mara recommendation: do not treat this as one Eli stream
  - preferred first-pass interpretation of "timesheet": pilot activity-and-cost ledger, not a generalized payroll simulator

## Notes

- The capability dossier is now the single active source of truth for this initiative.
