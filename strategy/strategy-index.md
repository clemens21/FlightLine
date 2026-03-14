# FlightLine Strategy Index

## Purpose

This folder is the strategic design space for FlightLine. It defines the product before implementation details harden.

Read order:

1. `mvp-foundation.md`
2. `technical-foundation.md`
3. `product-pillars.md`
4. `gameplay-loop-and-progression.md`
5. `economy-and-contracts.md`
6. `labor-and-staffing.md`
7. `aircraft-acquisition.md`
8. `fleet-and-maintenance.md`
9. `ui-information-architecture.md`
10. `user-flows.md`
11. `state-and-alert-model.md`
12. `screen-blueprints.md`
13. `sample-company-dataset.md`
14. `visual-direction-brief.md`

Wireframes:

- `../wireframes/index.md`
- `../wireframes/01-dashboard.md`
- `../wireframes/02-contracts.md`
- `../wireframes/03-dispatch.md`
- `../wireframes/04-fleet.md`
- `../wireframes/05-staffing.md`

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

## Open Design Questions

These are not blockers yet, but they need decisions later:

- How realistic should demand generation be versus a more gameified contract market?
- How much automation is available by default versus unlocked through progression?
- How large should the supported company fantasy be in the long term: charter operator, regional airline, global carrier, or all three?
- Should passenger and cargo gameplay be mostly parallel systems or meaningfully distinct businesses?
- How much airport and base ownership should exist in the first public version?

## Design Standard

Any later design proposal should answer four questions clearly:

- What player decision does this create?
- What information does the player need before committing?
- How does the system scale from one aircraft to many?
- What repetitive work can be reduced without flattening the strategy?

