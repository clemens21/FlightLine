# Doc Boundary Review

## Review Goal

Confirm whether the current markdown files in `strategy/` still belong there or should move into `implementation/`.

## Decision Rule

A document belongs in `strategy/` if it primarily defines:

- product scope
- player-facing system behavior
- simulation rules
- world or economy rules
- UI/UX intent
- balancing direction

A document belongs in `implementation/` if it primarily defines:

- backend code structure
- aggregate ownership
- command handlers
- persistence schema
- repository or migration design

## Review Result

No current markdown files in `strategy/` need to move.

## Keep In `strategy/`

### Product, scope, and progression

- `mvp-foundation.md`
- `product-pillars.md`
- `gameplay-loop-and-progression.md`
- `economy-and-contracts.md`

### Labor, fleet, aircraft, and market design

- `labor-and-staffing.md`
- `aircraft-acquisition.md`
- `aircraft-data-model.md`
- `aircraft-roster-and-balance.md`
- `aircraft-market-model.md`
- `staffing-market-model.md`
- `fleet-and-maintenance.md`
- `msfs-aircraft-alignment.md`

### Airport and generation design

- `airport-data-strategy.md`
- `airport-bootstrap-findings.md`
- `airport-derived-tags-plan.md`
- `content-generation-systems.md`
- `contract-generation-model.md`

### UX and interface design

- `ui-information-architecture.md`
- `user-flows.md`
- `state-and-alert-model.md`
- `screen-blueprints.md`
- `sample-company-dataset.md`
- `visual-direction-brief.md`
- `wireframe-review.md`

### Strategy-layer simulation rules

These are implementation-facing, but they still define simulation behavior rather than backend code shape, so they remain in `strategy/`.

- `technical-foundation.md`
- `game-state-model.md`
- `contract-generator-v1.md`
- `dispatch-validation-and-time-advance.md`
- `strategy-index.md`

## Belongs In `implementation/`

These are the right kinds of documents for the implementation layer:

- backend aggregate boundaries
- backend command boundaries
- save-schema and migration blueprints
- repository and transaction design
- module/folder structure for code

## Conclusion

The current folder split is correct:

- `strategy/` = what FlightLine is and how it should behave
- `implementation/` = how FlightLine should be built on the backend
