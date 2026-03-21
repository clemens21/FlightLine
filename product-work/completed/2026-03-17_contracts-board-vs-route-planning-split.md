# Contracts Board vs Route Planning Split

Status: Completed capability with landed slices 1 through 3.
Workflow state: completed_capability
Current owner: Owen Hart
Current active slice: none
Next routing target: none
Last updated: 2026-03-20

## Purpose

This dossier defines the active product split between contract discovery and route planning inside the Contracts workspace.

It is the canonical source of truth for this capability.
Mara owns decomposition and active-slice framing inside this file.

## 1. Main Conclusion

Yes, the current Contracts tab is conflating two different jobs and should be split.

The right capability direction is:

- keep `Contract Board` focused on searching, evaluating, and accepting one contract
- move route planning into its own sub-tab under Contracts

The current combined surface is doing too much at once:

- browse market offers
- inspect selected contract context
- add offers to a planner
- add accepted contracts to a planner
- reorder plan items
- batch-accept planned offers
- keep planner state visible while browsing

That is the confusion.

The product call here is direct:

- route planning should stop being a rail attached to the board
- route planning may support contract acceptance, but only inside its own dedicated planning workflow
- the board and the planner should each own a different acceptance style:
  - board = fast single-contract acceptance
  - route planning = intentional chain-based acceptance

If the player wants one contract, the board should let them find it and accept it quickly.
If the player wants a chain, they should enter a dedicated planning mode.

## 2. Current Approved Direction

This capability will land in three slices:

### Slice 1 - Contracts workspace split and board cleanup

- add Contracts sub-tabs: `Contract Board` and `Route Planning`
- keep `Accepted / Active` and `Closed` as board lifecycle views in the first pass
- remove the planner rail, planner review controls, and all `Add to plan` actions from the board
- keep available-offer rows to `Accept now`, row selection, and selected-route inspection only
- keep board accept in-place and show a quick next-step CTA instead of auto-switching tabs
- let `Accepted / Active` use `Send to route plan`
- keep `Closed` review-only
- keep the board map to selected-contract context only
- move the saved route plan into its own `Route Planning` tab, reusing current route-plan state and planner review behavior
- preserve legacy route-plan candidate offers already present in saves

### Slice 2 - Planner-native candidate sourcing

- add a lightweight candidate list inside `Route Planning`
- source that list from existing available offers, not a second full market board
- default planner sourcing to `match current endpoint` when the chain already has one
- keep planner-side filters lighter than the board
- allow `Add to chain` only from planner candidates
- keep accepted work entering the planner from board-side `Send to route plan`

### Slice 3 - Route Planning explainability and chain review

- make `Planned candidate` versus `Accepted work` visually explicit across the planning surface
- add a route-planning summary area for endpoint, payout total, order, and obvious continuity issues
- move chain-level map/context into `Route Planning`
- keep planned-candidate acceptance strictly inside route-planning review
- preserve the existing Dispatch handoff model instead of redesigning Dispatch inputs

## 3. Completion Summary

All three slices are landed and the capability is complete.

- Slice 1 split the Contracts workspace and cleaned up the board.
- Slice 2 added planner-native candidate sourcing inside `Route Planning`.
- Slice 3 finished the route-planning summary, chain map, and explicit chain labeling.

The final completed state keeps the original product boundaries intact:

- the board remains the discovery and direct-accept surface
- route planning remains the chain-building and route-review surface
- Dispatch handoff behavior stays unchanged

## 4. Explicit Non-Goals

The first split should explicitly exclude:

- redesigning the entire contract economy
- rebuilding Dispatch inside Contracts
- multi-aircraft network planning
- automatic aircraft assignment inside the Contracts board
- planner-driven acceptance leaking back into the board workflow
- turning route planning into a global operations monitor
- heavy map tooling beyond what is needed to read route chains

This is a workflow separation pass, not a new meta-system.

## 5. Why The Current UI Is Confusing

The current implementation mixes discovery and planning in one workstation flow:

- the browser controller explicitly owns `planner actions` alongside board state and in-place acceptance in [contracts-tab-client.ts](/Z:/projects/FlightLine/src/ui/public/contracts-tab-client.ts#L3)
- the main Contracts layout places `Contract Board` beside a pinned `Route Planner` rail in [contracts-tab-client.ts](/Z:/projects/FlightLine/src/ui/public/contracts-tab-client.ts#L775)
- available offers currently expose both `Accept` and `Add to plan` in [contracts-tab-client.ts](/Z:/projects/FlightLine/src/ui/public/contracts-tab-client.ts#L1042)
- accepted contracts also expose `Add to plan` in [contracts-tab-client.ts](/Z:/projects/FlightLine/src/ui/public/contracts-tab-client.ts#L1004)
- the planner itself supports `Review & accept planned offers`, but today that flow is attached to the board instead of being its own clearly separate planning mode in [contracts-tab-client.ts](/Z:/projects/FlightLine/src/ui/public/contracts-tab-client.ts#L869)

That is not just visual clutter.
It creates a muddled product story about what Contracts is for.

## 6. Required Workspace Split

Contracts should gain two clear sub-tabs:

### `Contract Board`

This is the market-discovery job.

It should answer:

- what contracts are available?
- which one is worth taking?
- can I accept it right now?

Primary actions:

- filter
- sort
- inspect selected contract
- accept one contract

Supporting context:

- selected route map
- contract fit
- payout
- deadline

It should not show:

- planner queue
- planner reorder controls
- planner review and batch acceptance

### `Route Planning`

This is the chain-building and route-level acceptance job.

It should answer:

- which contracts should be chained together?
- in what order?
- which planned contracts should be accepted as part of this chain?
- does the route chain make sense before dispatch?

Primary actions across the full capability:

- browse or filter route-planning candidates
- add candidate offer to chain
- add accepted contract to chain
- remove accepted contract from chain
- reorder chain items
- clear chain
- review chain summary
- accept selected planned contracts
- hand off to Dispatch later

Slice 1 does not need to solve planner-native sourcing yet.
Slice 2 should add its own lightweight sourcing surface inside this tab.

## 7. Required Board Rules

The `Contract Board` should remain simple.

### Available offers

Available offers should allow:

- `Accept`
- row selection
- detail review

Available offers should not allow:

- `Add to plan`
- planner staging
- planner review

### Accepted / Active and Closed views

These remain as board lifecycle views in the first pass, but they should stop carrying route-planning weight.

Required first-pass rules:

- `Accepted / Active` should support inspection and a clear `Send to route plan` action for accepted work
- `Closed` should remain review-only

If those lifecycle views make the board feel too broad later, that is a separate cleanup.

## 8. Required Route Planning Rules

The `Route Planning` tab should be able to work with both candidate offers and accepted contracts.

### Input rule

Candidate offers may enter the planning chain, but only inside `Route Planning`.

That means:

- no candidate-offer staging on the board
- no hidden planner state attached to simple browsing
- no confusion between `planned candidate` and `accepted work`

First-pass constraint:

- slice 1 may preserve existing planned candidates already present in saves
- slice 2 is where new candidate-offer sourcing inside the planner begins

### Acceptance rule

Route planning may accept contracts, but only as an explicit chain-review step inside that tab.

That means:

- accepting planned candidates is allowed
- the planner should make selection and acceptance status explicit
- already accepted items and not-yet-accepted items must look different
- route planning acceptance should feel deliberate, not like a hidden duplicate of the board

### Planning rule

The planner should help the player build a route chain from a mix of accepted work and candidate offers.

It should surface:

- route order
- chain endpoint
- obvious continuity issues
- chain payout summary
- which items are already accepted
- which items still need acceptance
- contracts already assigned elsewhere

### Output rule

The planner should produce a cleaner handoff into Dispatch later.
It should not become a second general-purpose market board.

Dispatch boundary rule:

- this capability must reuse the existing route-plan handoff model into Dispatch
- it must not redesign Dispatch source selection or selected-work behavior

## 9. Explainability Rules

The player should always be able to answer:

- am I shopping for one contract or planning a route chain?
- can I accept this contract right now?
- is this planned item already accepted or still a candidate?
- what does adding this contract do to my route chain?

Required explainability rules:

### 1. Use honest labels

Prefer:

- `Contract Board`
- `Route Planning`
- `Accept now`
- `Send to route plan`
- `Accepted work`
- `Planned candidate`
- `Accept selected`

Avoid labels that blur the workflow, especially:

- `Add to plan` on market offers

### 2. Keep acceptance singular on the board

The board should communicate:

- browse
- inspect
- accept one contract quickly

That is enough.

### 3. Keep route planning chain-focused

The planner should communicate:

- chain candidates and accepted work as separate states
- route order
- chain viability
- deliberate acceptance from inside the chain
- later dispatch handoff

## 10. Validation And Tracking

Slice 1 validation bar:

- `npm run build`
- focused Contracts UI coverage for `Contract Board` versus `Route Planning`
- coverage proving available-offer rows no longer expose `Add to plan`
- coverage proving `Accepted / Active` exposes `Send to route plan`
- coverage proving `Closed` remains review-only
- coverage proving existing route-plan items still render in `Route Planning`
- smoke coverage that Contracts still loads, accept still works, and Dispatch still sees accepted/planned work through the current handoff

Slice 2 validation bar:

- route-planner/backend coverage for adding candidate offers from `Route Planning`
- Contracts UI coverage that planner candidate list respects endpoint-match default and never exposes direct accept
- UI-server or smoke coverage that the board stays planner-free while `Route Planning` can add candidates inside its own tab

Slice 3 validation bar:

- UI coverage that accepted work and planned candidates are visibly distinct in `Route Planning`
- route-planner coverage that review/accept still works with mixed accepted-contract and candidate-offer items
- Dispatch smoke coverage that route-plan handoff remains unchanged and selected planned routes still appear correctly in Dispatch

Final integrated validation:

- `npm run build`
- Contracts UI regressions
- route-planner regressions
- `ui-smoke` and `ui-server-smoke` covering Contracts -> Route Planning -> Dispatch

## 11. Mara Framing Gate

This brief is ready to hand to Mara only if future framing preserves these boundaries:

### Scope clarity

- the Contracts workspace is split into `Contract Board` and `Route Planning`
- the board remains the discovery and acceptance surface
- the route planner becomes a dedicated chain-building surface
- candidate offers can enter route planning only inside that tab
- route planning can accept planned candidates only inside that tab

### Product clarity

- the player can tell whether they are shopping or planning
- the board no longer carries planner controls
- the route planner is an intentional chain-acceptance screen, not a hidden duplicate attached to the board

### Safety clarity

- the UI does not imply a contract is planned before it is accepted
- accepted-work state and planned-candidate state remain visibly distinct
- later dispatch handoff is clearer because the route planner makes acceptance status explicit

### Deferral clarity

- no dispatch rewrite inside this pass
- no broader contract-economy redesign
- no network planning
- no adjacent named-crew or aircraft-assignment mechanics here

## 12. Deferred Backlog

These are reasonable later additions, but they should stay out of this first board split:

- bulk acceptance workflows beyond route-planning review
- deeper route-profit forecasting
- aircraft pre-selection inside route planning
- dispatch-style staffing or maintenance validation inside Contracts
- network-wide chaining across several aircraft

## 13. Resolved Product Decisions

- Slice 1 is only the workspace split and board cleanup.
- `Accepted / Active` and `Closed` stay on the board in the first pass.
- Board acceptance stays in place and uses a quick next-step CTA instead of an automatic tab switch.
- Route Planning will use a lightweight endpoint-aware candidate list in slice 2, not a cloned market board.
- The board keeps only selected-contract route map context after the split.

## 14. Open Questions That Actually Matter

### 1. How should the planner candidate list rank endpoint-matching offers once slice 2 begins?

This is now a slice-2 execution question, not a slice-1 blocker.

### 2. How much planner-side filtering is enough before the candidate list starts recreating the board?

The current preferred answer is: less than the board, and only enough to build chains reliably.

### 3. What is the right shape for the quick next-step CTA after board acceptance?

This should stay small and avoid interrupting board flow.
