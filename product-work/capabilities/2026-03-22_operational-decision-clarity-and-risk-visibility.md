# Operational Decision Clarity And Risk Visibility

## Status

- Status:
  Active capability
- Workflow state:
  paused_at_stream_boundary
- Current owner:
  Technical Lead (Mara Sterling)
- Current active slice:
  Stream E - Dispatch readability follow-up
- Next routing target:
  Implementation Engineer (dispatch readability follow-up)
- Last updated:
  2026-03-23

## Capability Brief

- Capability title:
  Operational decision clarity and risk visibility

- Player problem:
  FlightLine's core management loop is playable, but several important decisions still make the player reconstruct too much on their own. Staffing, aircraft shopping, contract acceptance, route planning handoff, dispatch readiness, and near-term cash pressure all expose useful facts, but those facts are not yet organized consistently enough for confident operational decision-making. The result is tab-hopping, avoidable rereading, and a feeling that the game has both too much information and not enough clarity.

- Player outcome:
  The player should be able to make better operational decisions from clearer information. That means easier comparison, more trustworthy handoff cues, stronger visibility into near-term risk, and denser but better-organized decision surfaces rather than heavier recommendation systems or deeper simulation rules.

- Why this capability belongs now:
  The 2026-03-21 UI playthrough QoL review identified a coherent cluster of follow-up needs:
  clearer staffing decisions, stronger aircraft comparison, cleaner contract-to-planning handoff, more readable dispatch readiness, better cash-pressure visibility, better aircraft-position context on the contract board, and stronger warnings for accepted work that is becoming risky. These all serve the same current-slice goal: make the operational loop easier to read without adding adjacent systems.

- Minimum useful scope:
  - keep this as one umbrella QoL capability dossier rather than splitting it into several early follow-on capabilities
  - keep the capability fact-first with light framing rather than recommendation-heavy UI steering
  - broaden the named-pilot hire market so staffing decisions feel meaningful:
    - pilots only in this QoL pass
    - broad market
    - all candidates immediately hireable
    - market-driven generation
    - gradual churn over time
    - light variety bias so the market feels broad without becoming full of near-duplicates
    - mixed direct-hire and contract-hire availability by candidate
  - keep pilot-market browsing as one sortable table:
    - default sort by owned-fleet relevance
    - visible header controls should center on search, qualification fit, and sort
    - deeper controls behind `More`
    - no extra coverage-summary panel if the current facts already read clearly
  - add full multi-aircraft comparison as a first-class aircraft-market and fleet tool:
    - any mix of owned aircraft and market aircraft
    - up to 4 total
    - `Compare` available from rows and detail
    - compare auto-opens on the second aircraft
    - compare tray stays active until cleared
    - compare tray supports remove, set baseline, and open detail
    - optional baseline, with first-selected aircraft as the default reference until changed
    - row-level delta highlighting, not winner scoring
    - inline replace choice when a fifth aircraft is added
  - define the aircraft compare workspace as:
    - technical-decision-first overall
    - rich tray cards with model, source, and capability snapshot
    - desktop three-zone layout:
      - compare rail
      - compare content
      - economics sidecar
    - two-aircraft comparison should read comfortably side by side, while larger sets may use a scrollable compare grid
    - narrower widths collapse side surfaces into drawers
    - tray detail should open as a light side peek rather than breaking the compare set
    - compact overview strip summarizing spec deltas
    - `Specs / Maintenance / Economics` tabs
    - `Specs` starts with payload, range, runway, and support
    - `Maintenance` starts with condition and time-to-service
    - `Economics` starts with acquisition shape and recurring burden
    - owned aircraft show current carrying cost and no acquisition terms
  - tighten contract acceptance handoff clarity:
    - post-accept guidance stays inline on the board
    - callout emphasizes route, deadline, and neutral next actions
    - next actions remain:
      - `Keep browsing`
      - `Send to route plan`
      - `Accept and dispatch`
    - `Accept and dispatch` appears only when the contract is plausibly dispatchable through aircraft fit, reach, and no obvious blocker
    - accepted-work state remains readable through compact badges:
      - `In route plan`
      - `Ready for dispatch`
      - `Assigned elsewhere`
    - post-accept callout stays visible until context changes
  - add stronger contract-board location context:
    - row cue shows nearest relevant aircraft distance plus aircraft identity
    - relevant aircraft means nearest dispatchable-fit owned aircraft
    - selected-contract map shows aircraft marker plus reposition line
  - add a prominent finance section inside `Overview`:
    - shell cash card becomes a shortcut into it
    - summary strip shows current cash, next hit, and recurring total
    - lightweight graph with scrub and zoom
    - graph remembers the last view, with a reset back to near-term operations
    - grouped recurring categories plus itemized obligations
    - light detail peek only
    - recurring categories:
      - `Labor`
      - `Leases`
      - `Finance`
      - `Other`
  - define the finance graph as:
    - conservative main projection
    - softer accepted-work uplift layer
    - uplift confidence rises as work moves into route plan or dispatch
  - strengthen accepted-work urgency signaling:
    - three-band model remains in use
    - shell pulse is a count-only badge
    - clicking the badge opens `My Contracts` filtered to `at-risk + overdue`
    - risky rows use compact badges, show deadline plus planning and dispatch state, and expose one state-aware primary CTA
    - filtered risky work sorts overdue first, then nearest deadline
    - route planning reduces risk some, but does not clear it
  - keep the dispatch portion narrow:
    - readability and hierarchy only
    - expandable checklist rows
    - consequence summary centered on aircraft, pilot, and calendar impact
    - no broader Dispatch workflow rewrite
  - treat embedded header controls as a strong design rule for dense management surfaces in this capability:
    - `Contracts` should mostly replace the large filter block
    - `Contracts` pinned controls should be search, origin, destination, fit, and sort
    - `Aircraft` should use a full-header market model
    - `Aircraft` pinned controls should be search, role, ownership type, and sort
    - `Staffing` should use a broad pilot table with primary header controls
    - `Staffing` pinned controls should stay focused on search, qualification fit, and sort
    - on tighter widths, controls collapse to a drawer

- Explicit non-goals:
  - no new simulation depth just because a surface feels busy
  - no new economic model or treasury-management system
  - no new dispatch backend or scheduling model
  - no route-planning legality engine
  - no aircraft assignment or staffing assignment inside Contracts
  - no full finance workstation
  - no giant alert center or operations monitor
  - no full map subsystem or geospatial planning tool
  - no new missed-work penalty system
  - no reopening of completed staffing, Contracts, Dispatch, or finance capability artifacts

- Current slice boundaries:
  - this capability is about clearer information, comparison, handoff, and urgency, not stronger UI steering
  - dense views are acceptable where they improve player judgment, but their hierarchy must stay deliberate
  - staffing QoL work should stay pilots-only in this capability
  - the pilot market should stay market-driven rather than being explicitly tuned around current company shortages
  - the aircraft side should improve comparison and browsing quality, not underlying aircraft economics
  - the Contracts side should improve handoff, state readability, and location context, not reopen the workspace split
  - the finance section should stay prominent but bounded, not become a second accounting product
  - accepted-work urgency should remain an explainable visibility layer, not a new punishment system
  - dispatch follow-up should stay readability-only and should not reopen the completed assignment-and-readiness capability
  - embedded header controls are a strong design rule inside this capability because they improve scanning, even though they should not be forced onto every surface in FlightLine

- Related systems or user-facing surfaces:
  - Staff > Hire
  - pilot candidate detail overlay
  - Aircraft market
  - owned-aircraft fleet browsing
  - aircraft detail views
  - Contracts > Contract Board
  - Contracts > Route Planning
  - Contracts > My Contracts
  - contract acceptance follow-up surface
  - Overview
  - shell cash card
  - shell risk badge
  - Dispatch readiness and commit surfaces

- What the player should understand or feel:
  - "I can make staffing decisions from a real market instead of a thin list."
  - "I can compare aircraft the way a human manager would actually compare them."
  - "I know what happened when I accepted a contract and what my next step is."
  - "I can tell which aircraft is meaningfully close enough to matter for a contract."
  - "I can see upcoming recurring pressure before it surprises me."
  - "I can tell which accepted work is becoming urgent and what action makes sense next."
  - "The game is giving me better information, not trying to make the decision for me."

- Likely blockers or confusion states this capability should resolve:
  - "There are not enough meaningful pilot candidates to choose from."
  - "Why is this candidate here if they are not really hireable now?"
  - "I want to compare several aircraft without bouncing between detail views."
  - "I accepted a contract. What should I do next?"
  - "Which aircraft is actually close enough to make this contract make sense?"
  - "How much recurring pressure am I taking on?"
  - "Which accepted contracts are becoming risky right now?"
  - "Why does the UI make me reconstruct the same answer in several places?"

- What should stay later:
  - stronger company-need weighting in the staffing market
  - deeper aircraft market analytics
  - route profitability modeling
  - broader finance forecasting beyond known commitments and accepted-work confidence layers
  - richer contract-board geographic tooling
  - live operations monitoring
  - broader alert-routing systems beyond the highest-value warning cases

- Open questions that actually matter:
  - none currently; the capability is decision-complete at the product-definition level and ready for Mara framing

## Decomposition

- Proposed slices:
  1. contracts clarity: acceptance handoff, accepted-work badges, aircraft-position context, urgency surfacing, and shell risk badge behavior
  2. multi-aircraft comparison workspace
  3. overview finance section and shell cash shortcut
  4. broader pilot-market QoL and embedded hire-table controls
  5. dispatch readability follow-up
- Approved next slice:
  - Stream E - Dispatch readability follow-up
- Deferred slices:
  - deeper finance analysis tooling
  - stronger market-need weighting for pilot generation
  - broader alert-routing systems
  - deeper contract-board geography systems
  - live operations monitoring

## Validation And Tracking

- Validation bar for current approved slice:
  - capability dossier clearly covers staffing, aircraft comparison, contract handoff, cash visibility, accepted-work urgency, and dispatch readability as one coherent QoL job
  - staffing is no longer framed primarily as a summary-panel problem; the dossier treats market breadth and browse quality as the real first staffing issue
  - aircraft comparison is specified tightly enough that Mara does not need to invent tray behavior, layout, baseline rules, tab structure, or compare-set limits
  - contract handoff behavior is explicit enough that Mara does not need to guess where the accept callout lives or when direct dispatch is offered
  - finance visibility and risk signaling are explicit enough that Mara does not need to guess graph confidence, badge behavior, or risky-row action style
  - completed capability artifacts remain authoritative for their own underlying systems and are not rewritten by this dossier
- Related GitHub issues:
  - none currently tied to the active slice
- Notes from Mara, Nadia, or Owen:
  - Stream B landed cleanly into the umbrella capability branch at `4dc0f62` after Nadia cleared `codex/aircraft-comparison-workspace`.
  - Stream A landed cleanly into the umbrella capability branch at `0617eb7` after the direct-dispatch handoff fix for `#59` passed Nadia revalidation on `codex/contracts-clarity`.
  - Stream C landed cleanly into the umbrella capability branch at `dd84a06` after the focused finance graph persistence repro passed and no remaining Nadia findings were raised on `codex/overview-finance-visibility`.
  - Stream D landed cleanly into the umbrella capability branch at `6b8749a` after staffing market validation passed across build, focused staffing checks, server smoke, browser smoke, and a focused Nadia-style browser/server revalidation.
  - Later streams remain sequential to avoid shared shell/render overlap.

## Notes

- This capability intentionally absorbs the full 2026-03-21 QoL review as one cross-surface clarity dossier.
- It is intentionally broader than a normal single-surface capability, but it stays coherent because every included item improves how the player reads a decision, handoff, comparison, or near-term risk.
- Dense information is acceptable in this capability when it is organized better rather than expanded aimlessly.
- The player should be able to make their own informed decisions from better-presented facts rather than being pushed into stronger recommendation logic.
