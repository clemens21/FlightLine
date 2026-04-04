# FlightLine Versioning

## Main Rule

FlightLine uses strict Semantic Versioning with prerelease tags while the project is still a pre-production vertical slice.

Format:

- `MAJOR.MINOR.PATCH`
- prerelease builds: `MAJOR.MINOR.PATCH-dev.N`
- optional milestone builds later:
  - `MAJOR.MINOR.PATCH-alpha.N`
  - `MAJOR.MINOR.PATCH-beta.N`
  - `MAJOR.MINOR.PATCH-rc.N`

## Current Release

The current released version is:

- `0.21.0`

This replaces the old placeholder `1.0.0`, which overstated release stability.

The repo adopted SemVer on the `0.1.0-dev.1` prerelease line, cut its first release at `0.1.0`, cut the first patch release at `0.1.1`, cut the first feature-slice minor release at `0.2.0`, then cut patch releases at `0.2.1`, `0.2.2`, `0.2.3`, `0.2.4`, and `0.2.5`.
The aircraft maintenance recovery and service-flow capability advanced the release to `0.3.0`.
The finance-versus-lease aircraft ownership alignment advanced the release to `0.4.0`.
The tracked-aircraft-image asset landing advances the release to `0.4.1`.
The operational decision clarity and risk visibility capability advances the release to `0.5.0`.
The development-strategy and structural-refactor roadmap policy landing advances the release to `0.5.1`.
The UI server route-and-render extraction refactor advances the release to `0.5.2`.
The staffing hire-market header-control refresh advances the release to `0.6.0`.
The staffing hire-table header style fix advances the release to `0.6.1`.
The staffing hire-table header prominence and divider polish advances the release to `0.6.2`.
The staffing hire-table popover reliability and bounds fix advances the release to `0.6.3`.
The staffing hire-table scroll-region fix advances the release to `0.6.4`.
The staffing hire-table header-control hit-target polish advances the release to `0.6.5`.
The aircraft market and contracts board header-control rollout advances the release to `0.7.0`.
The aircraft market and contracts board header visual unification advances the release to `0.7.1`.
The aircraft market and contracts board header typography and width alignment advances the release to `0.7.2`.
The staff hire header search-and-filter rework advances the release to `0.8.0`.
The staff hire contract-sort, certification-filter, and column-width stability follow-up advances the release to `0.8.1`.
The aircraft market column split and minimal header-control rework advances the release to `0.9.0`.
The aircraft market header visual alignment follow-up advances the release to `0.9.1`.
The aircraft market sorted-header state restoration advances the release to `0.9.2`.
The aircraft market clipping and overlay-bounds fix advances the release to `0.9.3`.
The aircraft market filtered clipping follow-up advances the release to `0.9.4`.
The aircraft market filtered single-row detail-pane viewport fix advances the release to `0.9.5`.
The aircraft market detail-pane top-line alignment follow-up advances the release to `0.9.6`.
The contracts available-board square-map, table-model, row-interaction, and test-save cleanup landing advances the release to `0.10.0`.
The UI browser smoke decomposition, targeted suite runner, and test-hardening follow-up advances the release to `0.10.1`.
The contracts-board minimal header-control parity and map-width follow-up advances the release to `0.10.2`.
The country-biased staffing identity, hometown metadata, migration, and larger staffing-market landing advances the release to `0.11.0`.
The staffing base-airport hire control and table-column removal landing advances the release to `0.12.0`.

The staffing pilot-market sticky-header follow-up advances the release to `0.12.1`.

The staffing workspace scroll-path correction advances the release to `0.12.2`.

The staffing pricing rebalance and header-parity follow-up advance the release to `0.12.3`.

The staffing pricing-spread retune plus aircraft/contracts/staff header follow-up advance the release to `0.12.4`.

The aircraft/contracts sticky-header and contracts-board scroll-region follow-up advance the release to `0.12.5`.

The external-browser Playwright fallback and in-process UI runner follow-up advance the release to `0.12.6`.

The headed UI watch scripts and fast contracts-browser suite follow-up advance the release to `0.12.7`.

The aircraft-market and staffing-market size expansion follow-up advances the release to `0.12.8`.

The lead-session-on-main branch-policy update advances the release to `0.12.9`.
The contract-board sorting fix, passenger payload-weight modeling, grouped same-leg multi-contract dispatch support, and doubled contract-board market advance the release to `0.13.0`.
The contracts-workspace toolbar relocation and selected-tab styling follow-up advance the release to `0.13.1`.
The desktop preferred-window sizing update advances the release to `0.13.2`.
The desktop preferred-window content-size correction advances the release to `0.13.3`.
The desktop preferred physical-pixel window-target update advances the release to `0.13.4`.
The save-difficulty startup profiles, starter grants, persisted difficulty state, and ongoing aircraft and staffing economy modifiers advance the release to `0.14.0`.
The staffing employees-pane profile fallback, compact detail redesign, and no-inner-scroll follow-up advance the release to `0.14.1`.
The contracts double-click accept fix and route-map height trim advance the release to `0.14.2`.
The dispatch operations-board redesign, denser aircraft and queue presentation, and right-rail readiness plus commit workflow advance the release to `0.15.0`.
The dispatch contract-first simplification, deterministic accepted-contract dispatch seed, and contract-through-commit selection fix advance the release to `0.16.0`.
The contracts board split departure-vs-destination search, split passenger-vs-cargo payload filters, larger available market, and save-open tab preloading advance the release to `0.17.0`.
The contracts board indexed filter-and-sort performance landing, broader passenger-origin mix refresh, route-search popover layout fix, and column-order update advance the release to `0.18.0`.
The contracts board hot-path debounce and planner-work skip follow-up advance the release to `0.18.1`.
The contracts board default available-order diversification follow-up advances the release to `0.18.2`.
The contracts board home-base cargo-mix rebalance and generation-context refresh follow-up advance the release to `0.18.3`.
The shared table-geometry and search-caret stability follow-up advances the release to `0.18.4`.
The denser Contracts route-planning layout that removes outer-page scrolling, makes accepted-contract selection its own scrollable table, and renders next-leg candidates as a Contracts-board-style table advances the release to `0.19.1`.
The focused Contracts browser-regression hardening that aligns planner-anchor selection and header-control clicks with the current route-planning workflow advances the release to `0.19.2`.
The Dispatch table-first workflow rebuild that restores accepted-contract and route-plan source modes, adds dense source and aircraft tables, and simplifies pilot plus dispatch review advances the release to `0.20.0`.
The shared browser render primitive extraction plus shared market-query offer-window scaffold advance the release to `0.20.1`.
The shared save-shell table-system style extraction for Contracts, Aircraft, and shared header chrome advances the release to `0.20.2`.
The longer contract deadline windows, urgency premium payout tuning, and Contracts Hours Left urgency styling advance the release to `0.21.0`.
The next active prerelease line should be chosen from the integrated delta of the next landing set, not assumed in advance.

## Bump Rules

Use `0.x` until the product is stable enough that breaking gameplay, state, and workflow changes are no longer routine.

Bump `MINOR` when work includes:

- a new player-facing capability slice
- a meaningful workflow change in Contracts, Aircraft, Staff, Dispatch, Time Advance, or shell navigation
- a save-schema or migration change
- a new system that changes how the vertical slice is played

Bump `PATCH` when work includes only:

- bug fixes
- validation hardening
- UI polish
- tuning or content cleanup
- test-only improvements
- tooling or documentation adjustments that do not materially change player behavior

Increment prerelease counters when making additional builds on the same target release:

- `0.2.0-dev.1`
- `0.2.0-dev.2`
- `0.2.0-dev.3`

## Cut Authority

Owen Hart, acting as Integration and Release Manager, owns the version cut decision unless the human explicitly overrides it.

That means:

- I decide whether a landing is a `MINOR` or `PATCH` cut based on the integrated delta, not on the intent claimed for one part of the work
- I classify mixed changes by the highest-impact change present
- I do not allow bug-fix framing to hide a new capability slice, migration, or workflow change

Practical rule:

- if any included change meets the `MINOR` criteria, the whole cut is `MINOR`
- a `PATCH` cut is allowed only when the full landed set is genuinely patch-level

Operational rule:

- every promotion candidate to local `main` or GitHub `main` must include an explicit version-classification check
- Owen should not treat version cutting as optional release polish after promotion
- if the landed delta requires a new release line or release version, `package.json` and this document should be updated in the same bounded landing set
- if the human wants to hold the version change back deliberately, that should be stated explicitly instead of silently skipped
- promotion closeout should state the exact resulting version so the human does not need to infer whether a cut happened

## Release-Cut Rules

Use these exact rules when cutting versions:

### Continue the current prerelease line

Stay on the current `-dev.N` line when:

- the work is still part of the same planned release slice
- the integrated delta does not cross into a new `MINOR` or `PATCH` target

Example:

- `0.1.0-dev.2` -> `0.1.0-dev.3`

### Cut a `PATCH` line

Cut a new `PATCH` line only when the full landed set contains no new capability slice and no migration.

Allowed `PATCH` content:

- bug fixes
- validation hardening
- UI polish
- tuning
- content cleanup
- tests
- tooling or docs with no material player-facing behavior change

Example:

- `0.1.0` -> `0.1.1-dev.1`

### Cut a `MINOR` line

Cut a new `MINOR` line when the landed set includes any of:

- a new player-facing capability
- a meaningful workflow change
- a save migration
- a new system or subsystem that changes how the slice is played

Example:

- `0.1.1` -> `0.2.0-dev.1`

## Cadence Expectations

Use the patch component freely.

- dozens of `PATCH` increments during `0.x` are healthy if the landings are small, coherent, and well validated
- do not batch unrelated patch-level fixes or polish into larger bundles just to keep the third version number low
- if a bounded landing reaches local `main` and still classifies as `PATCH`, cut the next patch version as part of that landing

Commit cadence and version cadence are different:

- commit frequently on active workstream branches so local dirt does not sprawl
- cut versions when bounded landings are promoted, not for every checkpoint commit

### Cut a `MAJOR` line

Do not cut `1.0.0` until the vertical slice is stable enough that breaking workflow and state changes are no longer normal.

Until then, stay in `0.x`.

## Practical Examples

- first tracked prerelease: `0.1.0-dev.1`
- additional prerelease on the same line: `0.1.0-dev.2`
- first release on that line: `0.1.0`
- bug-fix follow-up line: `0.1.1-dev.1`
- new feature slice: `0.2.0-dev.1`

## Save Compatibility

App version and save compatibility are different concerns.

Keep save-schema tracking separate from SemVer.
When migrations are added, treat that as a `MINOR` bump while the project remains in `0.x`.
