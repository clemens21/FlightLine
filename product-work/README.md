# FlightLine Product Work

## Purpose

`product-work/` is now the live home for FlightLine product artifacts.

Use it for:

- capability briefs
- raw product or feature requests
- Mara-framed implementation workstreams
- completed product-work artifacts worth keeping

Do not use this folder for agent-operating rules.
Those stay under `agent stuff/supporting/`.

## Lane Structure

- `capabilities/`
  - player-facing capability briefs
  - normally authored by you and Zoe
  - focused on what the player should be able to do, why it matters now, and what belongs later

- `requests/`
  - raw requests waiting for Mara framing
  - use when the work is not yet shaped into a capability or implementation-ready stream

- `workstreams/`
  - Mara-authored bounded implementation streams
  - this is the normal handoff lane for Eli-ready work

- `completed/`
  - completed capability or workstream artifacts kept for reference

- `_templates/`
  - blank starters for product-work artifacts

## Default Workflow

Use this split by default:

1. You and Zoe define a capability.
2. Mara challenges it, narrows it, and turns it into one or more bounded workstreams.
3. Eli implements the bounded workstream.
4. Nadia and Owen join according to risk, review need, and landing complexity.

That means:

- `capability` is about player-facing intent and current-slice value
- `workstream` is about bounded implementation shape, validation, and landing safety

Important rule:

- a capability brief is not implementation-ready by default
- Mara should reframe broad, unsafe, inconsistent, or mistimed capabilities before Eli receives anything

## How To Use The Lanes

### Use `capabilities/` when:

- you and Zoe are defining a player-facing capability
- the key question is what the game should let the player do
- the work still needs Mara decomposition before implementation
- the capability may spawn several bounded workstreams over time

### Use `requests/` when:

- the work is a raw ask
- the scope is still vague, mixed, or exploratory
- you want Mara to decide whether the request should become a capability, a bounded feature stream, or a direct implementation task

### Use `workstreams/` when:

- Mara has already framed the work
- the owner, scope, non-goals, validation bar, and escalation triggers are explicit

### Use `completed/` when:

- the capability or workstream is genuinely done enough to leave the active lanes
- the artifact is still useful for reference

Do not move work into `completed/` just because implementation started.
Do not move a broad capability into `completed/` just because one of its workstreams landed.

## Naming Convention

Use:

`YYYY-MM-DD_short-title.md`

Examples:

- `2026-03-19_staff-help-center-capability.md`
- `2026-03-19_dispatch-readiness-workstream.md`

## Relationship To Other Repo Lanes

- `strategy/`
  - long-lived product direction and durable design thinking

- `product-work/`
  - active capability and delivery artifacts for current or upcoming work

- `agent stuff/supporting/`
  - agent-operating rules, workflow rules, and role prompts

This separation is intentional.

## Compatibility Note

The old `agent stuff/intake-briefs/` location is now a compatibility pointer only.

New product-work artifacts should be created under `product-work/`, not under `agent stuff/`.
