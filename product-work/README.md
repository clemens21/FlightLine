# FlightLine Product Work

## Purpose

`product-work/` is now the live home for FlightLine product artifacts.

Use it for:

- capability dossiers
- raw product or feature requests
- exceptional standalone implementation workstreams when one canonical capability doc is not enough
- completed product-work artifacts worth keeping

Do not use this folder for agent-operating rules.
Those stay under `team-ops/supporting/`.

## Lane Structure

- `capabilities/`
  - player-facing capability dossiers
  - normally authored by you and Zoe
  - this is the default single source of truth for a capability
  - focused on what the player should be able to do, why it matters now, what belongs later, and how Mara is decomposing it

- `requests/`
  - raw requests waiting for Mara framing
  - use when the work is not yet shaped into a capability or implementation-ready stream

- `workstreams/`
  - exceptional Mara-authored bounded implementation streams
  - use only when a standalone execution artifact is genuinely needed
  - the capability dossier should still remain the canonical source of truth

- `completed/`
  - completed capability or workstream artifacts kept for reference

- `_templates/`
  - blank starters for product-work artifacts

## Default Workflow

Use this split by default:

1. You and Zoe define a capability.
2. Mara challenges it, narrows it, and records decomposition inside the same capability dossier.
3. Eli implements the bounded workstream.
4. Nadia and Owen join according to risk, review need, and landing complexity.

That means:

- `capability` is about player-facing intent and current-slice value
- `capability dossier` is also the default place to capture decomposition, active slice status, deferred work, and review notes
- `workstream` is an exceptional standalone execution artifact when a separate handoff file is genuinely necessary

Important rule:

- a capability brief is not implementation-ready by default
- Mara should reframe broad, unsafe, inconsistent, or mistimed capabilities before Eli receives anything
- by default, one capability should have one canonical capability dossier
- Mara should record feature decomposition, active slice status, and deferred slices in that same dossier instead of spawning a new file for every feature
- standalone workstream docs should be used only when the handoff complexity, risk, or parallelism justifies a separate artifact
- if a smaller workstream draft gets pushed up into a broader capability, retire the workstream draft until the capability is approved and decomposed into the dossier

## How To Use The Lanes

### Use `capabilities/` when:

- you and Zoe are defining a player-facing capability
- the key question is what the game should let the player do
- the work still needs Mara decomposition before implementation
- the capability may spawn several bounded workstreams over time

Capability dossier rule:

- keep the capability, its approved decomposition, its active slice, and its deferred follow-ons in the same file by default
- update the dossier instead of creating a new product-work file for every feature slice

### Use `requests/` when:

- the work is a raw ask
- the scope is still vague, mixed, or exploratory
- you want Mara to decide whether the request should become a capability, a bounded feature stream, or a direct implementation task
- the work does not obviously need capability-level product shaping yet

Important rule:

- `requests/` is the normal entry path for smaller asks between you and Mara
- Mara should only push a request up into `capabilities/` when the work genuinely needs player-facing product shaping, minimum useful scope design, or Zoe-level now-versus-later judgment

### Use `workstreams/` when:

- a standalone execution artifact is genuinely needed
- the owner, scope, non-goals, validation bar, and escalation triggers are explicit
- file or interface boundaries need to be frozen separately from the capability dossier
- parallel or especially risky work benefits from a separate handoff artifact

Do not use `workstreams/` by default just because a capability contains several feature slices.

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
- `2026-03-19_dispatch-readiness-workstream.md` for an exceptional standalone handoff

## Relationship To Other Repo Lanes

- `strategy/`
  - long-lived product direction and durable design thinking

- `product-work/`
  - active capability and delivery artifacts for current or upcoming work

- `team-ops/supporting/`
  - agent-operating rules, workflow rules, and role prompts

This separation is intentional.

All new product-work artifacts should be created under `product-work/`.
