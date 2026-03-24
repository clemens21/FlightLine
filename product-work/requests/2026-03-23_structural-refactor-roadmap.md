# Structural Refactor Roadmap

## Purpose

This roadmap defines the recommended structural cleanup sequence for FlightLine's current oversized-file problem.

This is an engineering refactor roadmap, not a player-facing capability dossier.

## Main Goal

Reduce mixed-responsibility integration surfaces without changing how the game plays and without degrading runtime performance.

## Hard Guardrails

Every refactor stream in this roadmap should preserve all of the following unless explicitly reframed:

- no intended player-facing workflow change
- no save-schema or migration change
- no ledger or simulation behavior change
- no extra request hops between browser and server
- no broader polling behavior
- no unnecessary payload growth
- no measurable slowdown in shell load, tab switching, or dense-surface interaction

Required validation for any stream here:
- `npm run build`
- focused tests for the touched surface
- at least one cross-surface smoke test when the touched file is a known shared integration surface

## Recommended Stream Order

### Stream 1: Server route and render extraction

Primary target:
- `src/ui/server.ts`

Goal:
- keep the local UI server behavior the same while reducing the file's role as the default integration sink

Extraction targets:
- launcher and save-opening routes
- shell and tab API handlers
- staffing render helpers
- overview finance render helpers
- shared route helper and request parsing helpers

Stop condition:
- `server.ts` remains the composition root, but no longer owns broad inline rendering and request handling for every surface directly

Do not:
- change endpoint URLs
- change response formats
- change browser hydration contracts

### Stream 2: Shell page composition split

Primary target:
- `src/ui/save-shell-page.ts`

Goal:
- separate shell chrome and shared page primitives from surface-specific style and markup bundles

Extraction targets:
- shell chrome and help-center rendering
- shared summary and layout primitives
- per-surface style fragments for:
  - staffing
  - contracts
  - aircraft
  - dispatch

Stop condition:
- `save-shell-page.ts` remains the page assembler, but surface-specific styling and markup blocks no longer dominate one file

Do not:
- change shell layout semantics
- change data hooks used by browser tests unless explicitly updated and validated in the same stream

### Stream 3: Contracts workstation split

Primary target:
- `src/ui/public/contracts-tab-client.ts`

Goal:
- reduce one monolithic controller into smaller workstation modules without changing Contracts behavior

Extraction targets:
- board rendering and filters
- route-planning rendering and planner filters
- post-accept callout and urgency behavior
- map and selection helpers

Stop condition:
- contracts browser behavior remains the same, but board, planning, and handoff code are no longer interleaved throughout one file

### Stream 4: Aircraft model split

Primary target:
- `src/ui/aircraft-tab-model.ts`

Goal:
- separate expensive view shaping into focused model modules

Extraction targets:
- fleet workspace shaping
- market/deal shaping
- compare shaping
- shared sort and filter utilities

Stop condition:
- aircraft payload behavior is unchanged, but compare, market, and fleet shaping are independently readable

### Stream 5: Aircraft workstation split

Primary target:
- `src/ui/public/aircraft-tab-client.ts`

Goal:
- separate fleet, market, compare, and maintenance-recovery presentation logic

Extraction targets:
- fleet workspace rendering
- market workspace rendering
- compare overlay and compare tray behavior
- maintenance-recovery panel rendering

Stop condition:
- aircraft workstation behavior remains unchanged while feature-specific UI paths have distinct module ownership

### Stream 6: Dispatch workstation split

Primary target:
- `src/ui/public/dispatch-tab-client.ts`

Goal:
- keep Dispatch interactive richness while separating the major presentation areas

Extraction targets:
- selected aircraft and pilot rendering
- selected work and source-mode rendering
- readiness and validation rendering
- commit-impact rendering

Stop condition:
- Dispatch keeps the same player-facing flow, but readiness and commit consequences are not tangled with source-selection and aircraft summary rendering

### Stream 7: Large coherent backend helper extraction

Primary targets:
- `src/application/commands/advance-time.ts`
- optional later follow-up on `src/application/staffing/staffing-market-reconciler.ts`

Goal:
- preserve one-command ownership while reducing internal complexity through phase helpers

Extraction targets:
- contract resolution
- staffing activation/expiry
- training and travel completion
- maintenance completion
- recurring obligations
- scheduled-event processing

Stop condition:
- command ownership stays centralized, but phase logic is broken into readable internal modules

Do not:
- turn this into a broad simulation rewrite
- change event semantics or timing rules as part of extraction

## Execution Rules

1. Do not run several streams against the same shared offender file in parallel.
2. Pair each stream with a small structural budget, not a repo-wide cleanup wave.
3. If a stream starts drifting into behavior change, stop and reframe it as a capability or bug-fix stream instead of calling it "just refactor."
4. If a file is merely large but still coherent, prefer internal helper extraction over multi-file churn.

## Success Criteria

This roadmap succeeds when:
- the current worst offenders stop being the default landing surface for unrelated work
- feature streams collide less often in shared files
- smoke and browser behavior stay stable
- the game remains equally usable to the player
- shell and workstation interactions remain at least as responsive as before
