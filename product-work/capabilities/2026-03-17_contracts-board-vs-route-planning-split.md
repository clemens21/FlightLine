# Contracts Board vs Route Planning Split

## Purpose

This brief defines the minimum useful product split between contract discovery and route planning inside the Contracts workspace.

It is a derivative design brief for future Mara framing.
It is not implementation authorization on its own.

## 1. Main Conclusion

Yes, the current Contracts tab is conflating two different jobs and should be split.

The right first move is:

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

## 2. Recommended Minimum Useful Scope

The first refresh should include only:

- a Contracts sub-tab split between `Contract Board` and `Route Planning`
- `Contract Board` focused on market search, single-contract review, and direct accept
- `Route Planning` focused on building a route chain and accepting selected planned contracts from inside that mode
- removal of planner controls from the main board surface
- removal of planner controls from available-offer rows on the board
- a dedicated candidate-sourcing surface inside `Route Planning`
- clear distinction inside the planner between candidate offers and already accepted contracts

Preferred first-pass behavior:

- available offers can be `Accept`ed from the board
- accepted contracts can be sent into route planning
- route planning can stage candidate offers into a chain, review that chain, and accept selected planned contracts from inside planning mode
- route planning can also sequence already accepted work

## 3. Explicit Non-Goals

The first split should explicitly exclude:

- redesigning the entire contract economy
- rebuilding Dispatch inside Contracts
- multi-aircraft network planning
- automatic aircraft assignment inside the Contracts board
- planner-driven acceptance leaking back into the board workflow
- turning route planning into a global operations monitor
- heavy map tooling beyond what is needed to read route chains

This is a workflow separation pass, not a new meta-system.

## 4. Why The Current UI Is Confusing

The current implementation mixes discovery and planning in one workstation flow:

- the browser controller explicitly owns `planner actions` alongside board state and in-place acceptance in [contracts-tab-client.ts](/Z:/projects/FlightLine/src/ui/public/contracts-tab-client.ts#L3)
- the main Contracts layout places `Contract Board` beside a pinned `Route Planner` rail in [contracts-tab-client.ts](/Z:/projects/FlightLine/src/ui/public/contracts-tab-client.ts#L775)
- available offers currently expose both `Accept` and `Add to plan` in [contracts-tab-client.ts](/Z:/projects/FlightLine/src/ui/public/contracts-tab-client.ts#L1042)
- accepted contracts also expose `Add to plan` in [contracts-tab-client.ts](/Z:/projects/FlightLine/src/ui/public/contracts-tab-client.ts#L1004)
- the planner itself supports `Review & accept planned offers`, but today that flow is attached to the board instead of being its own clearly separate planning mode in [contracts-tab-client.ts](/Z:/projects/FlightLine/src/ui/public/contracts-tab-client.ts#L869)

That is not just visual clutter.
It creates a muddled product story about what Contracts is for.

## 5. Required Workspace Split

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

Primary actions:

- browse or filter route-planning candidates
- add candidate offer to chain
- add accepted contract to chain
- remove accepted contract from chain
- reorder chain items
- clear chain
- review chain summary
- accept selected planned contracts
- hand off to Dispatch later

It should not rely on the `Contract Board` as its only way to source chain candidates.
If route planning is a real sub-tab, it needs its own sourcing surface inside that mode.

## 6. Required Board Rules

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

These may remain as board lifecycle views if useful, but they should stop carrying route-planning weight.

If retained:

- `Accepted / Active` should support inspection and a clear `Send to route plan` action for accepted work
- `Closed` should remain review-only

If those lifecycle views make the board feel too broad later, that is a separate cleanup.
Do not bundle that decision into this split unless Mara thinks it is necessary.

## 7. Required Route Planning Rules

The `Route Planning` tab should be able to work with both candidate offers and accepted contracts.

### Input rule

Candidate offers may enter the planning chain, but only inside `Route Planning`.

That means:

- no candidate-offer staging on the board
- no hidden planner state attached to simple browsing
- no confusion between `planned candidate` and `accepted work`

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

## 8. Explainability Rules

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

## 9. Mara Framing Gate

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

## 10. Deferred Backlog

These are reasonable later additions, but they should stay out of this first board split:

- bulk acceptance workflows
- deeper route-profit forecasting
- aircraft pre-selection inside route planning
- dispatch-style staffing or maintenance validation inside Contracts
- network-wide chaining across several aircraft

## 11. Open Questions That Actually Matter

### 1. Should the `Contract Board` keep `Accepted / Active` and `Closed` as secondary board views, or should it narrow harder to market-only later?

The first-pass answer can be conservative: keep them if they do not dilute the main board job.

### 2. What is the cleanest action label for moving accepted work into planning?

The label should make acceptance status obvious.
`Send to route plan` is clearer than `Add to plan`.

### 3. How should `Route Planning` source candidate offers without recreating the board inside that tab?

This matters because the planning tab needs enough sourcing to build a chain, but not a second full discovery workstation.

### 4. Should accepting a contract on the board offer an immediate next step into route planning?

This matters because the player may want to accept a contract and continue shopping, or accept it and chain it right away.

### 5. How much chain-level map context should remain on the board once the planner moves out?

The preferred first-pass answer is: less than today.
The board only needs enough map context to support the selected contract.
