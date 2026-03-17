# FlightLine Task Intake Brief

## Task Intake Brief

- Request title: Contracts board curation and decision-support pass
- Request type: `feature`
- Objective:
  Bring the contracts page closer to FlightLine's intended vertical-slice role by curating the board to a small decision-useful set of offers and adding contract-specific decision support that explains fit, risk, and route-planning viability.
- Why this belongs now:
  Backlog capture belongs now because the current contracts page already shows a concrete vertical-slice mismatch, the research is complete enough to avoid rediscovery later, and the next contracts-focused workstream will need a bounded feature brief instead of reopening the whole question from scratch.
  This brief is for future routing, not automatic immediate implementation.
- Desired result:
  A future contracts UX/economy pass should produce:
  - a curated visible board size aligned with documented targets instead of a broad-market dump
  - a selected-contract briefing surface that explains why the offer is attractive, risky, blocked, or awkward
  - aircraft and planner viability summaries that help the player decide what to accept now versus stage for later
  - explicit deferral of recurring routes, additional contract classes, and broader market systems until the core board is readable and trustworthy
- Current evidence, symptoms, or observations:
  - A live local render of the contracts tab showed `572` open offers in a fresh save: `artifacts/contracts-page-review.png`
  - Local strategy targets are much smaller:
    - `strategy/contract-generation-model.md` says the visible board should contain `12` to `18` contracts
    - `strategy/contract-generator-v1.md` says the first playable board should show `14` visible offers with a deliberate fit-bucket mix
  - The current contracts UI exposes route, fit/state, payload, distance, hours left, due date, payout, route map, and planner actions, but does not surface the decision-support metrics already called for in `strategy/economy-and-contracts.md`:
    - estimated net profit
    - profit per flight hour
    - reposition distance and cost
    - deadline risk
    - aircraft fit score
    - staffing or qualification blockers
    - reputation impact
  - The generator already creates structured explanation metadata in `src/application/contracts/contract-board-generator.ts`, including:
    - `fit_summary`
    - `risk_summary`
    - `price_driver_summary`
    - `airport_access_summary`
    - `reposition_summary`
    - `why_now_summary`
    - local timing text
  - The contract-board query layer loads explanation metadata and penalty data, but the contracts view model and browser payload do not expose that richer explanation model to the contracts tab.
  - External market research indicates that games which support broader job markets also ship heavier support tooling:
    - [Air Hauler 2](https://www.justflight.com/product/air-hauler-2) emphasizes detailed map views and multi-leg job handling
    - [OnAir](https://www.onair.company/regular-routes/) supports recurring routes and broader job-management tools
    - [FSCharter](https://help.fscharter.net/article/charter-jobs) pairs a contract marketplace with more guided operational tooling
  - Product inference:
    FlightLine is currently paying part of the complexity cost of a large marketplace without offering the support tooling those broader systems rely on. That is mistimed for the current slice.
- Suspected affected systems, files, or user-facing surfaces:
  - user-facing contracts tab
  - route planner rail and planner review flow
  - contracts payload assembly in `src/ui/contracts-view.ts`
  - contracts browser model in `src/ui/contracts-view-model.ts`
  - contracts browser client in `src/ui/public/contracts-tab-client.ts`
  - contract board generation and curation in `src/application/contracts/contract-board-generator.ts`
  - contract board query model in `src/application/queries/contract-board.ts`
  - contracts wireframe and strategy docs:
    - `wireframes/02-contracts.md`
    - `strategy/economy-and-contracts.md`
    - `strategy/contract-generation-model.md`
    - `strategy/contract-generator-v1.md`
  - regression coverage likely touched in:
    - `test/contracts-view.test.mjs`
    - `test/ui-smoke.test.mjs`
    - `test/ui-shell-navigation.test.mjs`
- Known constraints:
  - Protect the current vertical slice: this should improve decision clarity and playable route chaining, not broaden the simulation sideways.
  - Do not solve this by simply adding more filters on top of an oversized market board.
  - Preserve explainability: player-facing guidance must stay directionally trustworthy if it shows estimated economics or risk.
  - Keep accepted-contract state, planner state, and offer-window behavior coherent across save/load and refresh.
  - Prefer using already-generated explanation metadata where possible before inventing deeper new systems.
- Explicit no-touch areas:
  - no new recurring-routes system in this workstream
  - no new contract archetypes or broader world-market expansion in this workstream
  - no dispatch-execution or time-advance redesign in this workstream
  - no aircraft-market or staffing-tab feature expansion unrelated to contracts decision support
  - avoid save-schema changes unless Mara determines they are truly necessary and worth the risk
- Red-flag areas involved, if any:
  - offer-window generation and board composition
  - planner state coherence
  - UI versus underlying state mismatch if shown profitability or timing guidance diverges from later execution behavior
  - possible persistence/snapshot risk if new contract-view data becomes persisted rather than derived
- Deadline, urgency, or sequencing pressure:
  No hard deadline known.
  Sequencing guidance:
  - if this workstream is started later, board curation should be the first sub-problem
  - selected-offer briefing and viability summaries should follow
  - recurring routes and broader market tooling should stay deferred until the curated board is working
- Related active workstreams, branches, or sessions:
  Unknown from this session.
  No implementation branch or active contracts-feature stream was opened here.
- Known open questions:
  - Should the future workstream be a single contracts-quality pass or split into `board curation` and `decision support` phases?
  - Is the documented `12` to `18` / `14 visible offers` target still the intended board size for the current company phase, or should there be a small progression-scaled range?
  - Which economics can be shown now without misleading the player: estimated profit, profit per flight hour, reposition cost, penalty exposure, or reputation impact?
  - Should the selected-contract briefing panel be the primary detail surface on desktop only for the first pass?
  - How much of the existing explanation metadata should be shown directly versus summarized into a smaller player-facing model?
  - Should planner viability remain advisory until dispatch validation becomes deeper?
- Preferred bias: `balanced`
- Optional proposed owner or role:
  Mara Sterling first for framing.
  Expected supporting lenses later: Zoe Bennett for slice fit, Nadia Cross for correctness/regression risk around planner and state integrity.

## Notes

- Recommended future minimum useful scope:
  - cap and intentionally curate visible board size
  - add a selected-contract briefing panel
  - add aircraft-fit and planner-viability summaries
- Recommended explicit deferrals:
  - recurring routes
  - favorite-airport generation tools
  - larger persistent market systems
  - more contract classes added mainly for variety
