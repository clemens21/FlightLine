# FlightLine Strategy Index

## Purpose

This folder is the strategic design space for FlightLine. It defines the product before implementation details harden.

Read order:

1. `mvp-foundation.md`
2. `technical-foundation.md`
3. `game-state-model.md`
4. `product-pillars.md`
5. `gameplay-loop-and-progression.md`
6. `economy-and-contracts.md`
7. `labor-and-staffing.md`
8. `aircraft-acquisition.md`
9. `aircraft-data-model.md`
10. `aircraft-roster-and-balance.md`
11. `msfs-aircraft-alignment.md`
12. `fleet-and-maintenance.md`
13. `ui-information-architecture.md`
14. `user-flows.md`
15. `state-and-alert-model.md`
16. `screen-blueprints.md`
17. `sample-company-dataset.md`
18. `visual-direction-brief.md`
19. `wireframe-review.md`
20. `content-generation-systems.md`
21. `airport-data-strategy.md`
22. `airport-bootstrap-findings.md`
23. `contract-generation-model.md`
24. `contract-generator-v1.md`
25. `dispatch-validation-and-time-advance.md`
26. `aircraft-market-model.md`
27. `staffing-market-model.md`
28. `airport-derived-tags-plan.md`
29. `time-and-calendar.md`

Wireframes:

- `../wireframes/index.md`
- `../wireframes/01-dashboard.md`
- `../wireframes/02-contracts.md`
- `../wireframes/03-dispatch.md`
- `../wireframes/04-fleet.md`
- `../wireframes/05-staffing.md`
- `../wireframes/06-aircraft-acquisition.md`
- `../wireframes/07-staffing-acquisition.md`

## Current Product Thesis

FlightLine should begin as an OnAir-style airline management sim, then differentiate through clearer decision support, less repetitive scheduling labor, more transparent operations, and a stronger sense of company progression.

## Current Scope Guardrails

- Stay in management simulation, not direct flight simulation.
- Preserve real aviation constraints where they produce interesting decisions.
- Remove or automate repetitive work where it does not create skill expression.
- Keep the simulation explainable enough that players can learn and improve.
- Favor systems that support both active optimizers and more passive strategic players.

## Immediate Strategic Priorities

- Define the target player and the product pillars.
- Make the early-to-mid game progression satisfying.
- Build an economy that produces understandable tradeoffs instead of random grind.
- Make labor, aircraft condition, utilization, and maintenance matter.
- Design a modern UI that handles dense operational data in both light and dark mode.
- Define the pre-wireframe UX layer so flows, statuses, and screen purpose are stable before visual design work starts.
- Use the first-pass wireframes to identify where the current strategy docs are still too vague.
- Define the generation systems and airport-data pipeline that will keep the simulation full of plausible choices.
- Keep the airport strategy aligned with the actual multi-source local database, not just the original design assumptions.
- Lock the aircraft reference model before turning the starter roster into real game data.
- Keep the preferred aircraft roster aligned with MSFS 2024 families players can actually fly.
- Use the canonical game-state model as the baseline for save data, commands, and simulation boundaries before implementation starts.
- Turn the stable state, contract, and dispatch specs into backend aggregates, command boundaries, and persistence tables before building UI-heavy implementation slices.

## Open Design Questions

These are not blockers yet, but they need decisions later:

- How realistic should demand generation be versus a more gameified contract market?
- How much automation is available by default versus unlocked through progression?
- How large should the supported company fantasy be in the long term: charter operator, regional airline, global carrier, or all three?
- Should passenger and cargo gameplay be mostly parallel systems or meaningfully distinct businesses?
- How much airport and base ownership should exist in the first public version?

Implementation docs live separately in [implementation/index.md](/Z:/projects/FlightLine/implementation/index.md).

## Design Standard

Any later design proposal should answer four questions clearly:

- What player decision does this create?
- What information does the player need before committing?
- How does the system scale from one aircraft to many?
- What repetitive work can be reduced without flattening the strategy?

