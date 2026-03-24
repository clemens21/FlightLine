# FlightLine Development Strategy

## Purpose

This document records the preferred architectural and refactor strategy for FlightLine.

It is a supporting strategy reference.
The repository-root `AGENTS.md` remains the runtime authority.

## Primary Recommendation

FlightLine should use an evolutionary modular monolith strategy.

That is the best fit for the current product because FlightLine is:
- one tightly owned codebase
- one integrated simulation loop
- one save/runtime truth
- one player-facing application where time, finance, staffing, dispatch, maintenance, and UI state must remain coherent together

The goal is not maximum component replaceability.
The goal is a maintainable, legible, high-integrity management sim.

## Core Strategy Stack

Use this stack together:

1. `Modular monolith`
- keep one runtime and one persistence boundary for the core game
- avoid microservices and plugin-first design in the main game loop

2. `Bounded context ownership`
- default core contexts:
  - fleet
  - contracts
  - dispatch
  - staffing
  - finance
  - maintenance
  - save/runtime
- each capability should be clear about which context owns truth and which contexts are consumers

3. `CQRS-lite`
- commands mutate state
- queries and view models shape read surfaces for the UI
- do not push product truth into browser controllers just because the UI is interactive

4. `Capability slicing`
- ship by bounded player-facing capability streams
- avoid broad architectural rewrites as a precondition for normal feature delivery

5. `Selective ports and adapters`
- use stronger seam isolation only where volatility is real:
  - persistence
  - external content ingestion
  - asset lookup
  - future modding or tooling seams if they become real product priorities

## What Not To Optimize For

Do not optimize FlightLine primarily around:
- defense-style MOSA replaceability inside the core runtime
- hypothetical future distribution of subsystems across services
- broad plugin abstraction before modding is a real product goal
- abstraction layers created only because a file feels large

## Structural Refactor Guardrails

Structural cleanup should improve maintainability without harming the current vertical slice.

Use these rules:

1. Preserve player-facing behavior by default.
- refactors should not intentionally change workflows, text, UI affordances, or simulation outcomes unless the stream explicitly includes that change

2. Preserve runtime performance by default.
- do not add new request hops, polling loops, expensive render passes, or broader payload shaping just to make internals feel cleaner

3. Preserve save and state integrity.
- do not couple structural cleanup to save-schema, migration, event-flow, or ledger changes unless that risk is explicitly framed and validated

4. Prefer extraction over abstraction.
- move coherent chunks into modules first
- add new interfaces only when a real boundary exists

5. Refactor in bounded phases.
- every structural stream should have a narrow target file or seam, a stop condition, and a validation bar

## Oversized File Policy

File size is not the only signal, but it is a useful warning threshold.

Use these guide rails:
- around `800` lines: watchlist
- around `1200` lines: justify why it is still one coherent responsibility
- mixed-responsibility files should be split even below those thresholds

Key smell indicators:
- one file owns routing plus rendering plus view shaping
- one file mixes several product surfaces
- one file is the default integration surface for unrelated capabilities
- parallel streams frequently collide in the same file

## Current File Triage

### Split soon

- `src/ui/server.ts`
  - problem: routing, action handlers, server-render helpers, and multi-surface composition all accumulate here
- `src/ui/save-shell-page.ts`
  - problem: one giant shell-and-CSS bundle for multiple surfaces

### Split on next touch

- `src/ui/public/contracts-tab-client.ts`
- `src/ui/aircraft-tab-model.ts`
- `src/ui/public/dispatch-tab-client.ts`
- `src/ui/public/aircraft-tab-client.ts`

### Large but coherent for now

- `src/application/commands/advance-time.ts`
- `src/application/staffing/staffing-market-reconciler.ts`
- `src/ui/route-plan-state.ts`

These should be refactored by internal phase helpers or extracted submodules later, but they are not the first structural priority.

## Refactor Roadmap

The detailed roadmap currently lives at:
- `product-work/requests/2026-03-23_structural-refactor-roadmap.md`

Use it as the execution guide for bounded refactor streams.

## Final Guidance

The target state is not a "perfect" architecture.

The target state is:
- coherent seams
- smaller integration surfaces
- safer capability delivery
- no regression in usability
- no regression in runtime performance
