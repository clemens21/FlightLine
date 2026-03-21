# FlightLine Team Operations

## Purpose

This document defines how the standing FlightLine team should operate day to day.

Use it to decide:
- which agent gets work first
- when work should be reframed before coding
- how handoffs should move
- how reviews and landing decisions happen
- how to run several active efforts without role confusion

The repository-root `AGENTS.md` remains the runtime authority. This file is the practical operating layer for humans running the team.

Use `flightline_branch_promotion_rules.md` for the specific rules that govern `dev` to local `main` promotion and local `main` to GitHub `main` promotion.
Use `flightline_bug_tracking.md` for the default durable bug-tracking approach.

## Team Roster

- You: final authority on product priority, waivers, and unresolved disputes
- Mara Sterling: Technical Lead
- Eli Mercer: Implementation Engineer
- Nadia Cross: QA and Failure Analyst
- Owen Hart: Integration and Release Manager
- Zoe Bennett: Product Strategy Manager

## Core Operating Assumption

The standing team is singular by default: one active session per standing role.

That means:
- Mara is the normal technical dispatcher
- Eli is the normal build owner
- Nadia is the normal independent challenge role
- Owen is the normal landing and merge-readiness role
- Zoe is the normal scope and timing role

This team can support several active efforts at once, but true coding throughput is constrained by having one standing Implementation Engineer.

If you need real simultaneous build work, do not fake it. Either:
- sequence the implementation work
- or let Mara explicitly authorize temporary additional implementation sessions with frozen boundaries

## Default Branch Lanes

Use this branch model by default:

- `main`:
  - the promoted line and the source of truth for promoted work
  - local `main` and GitHub `main` should normally stay aligned
- `codex/dev`:
  - the clean integration branch for the next bounded landing set
  - should usually match `main` when no landing set is actively being assembled
- `codex/<workstream>`:
  - the normal home for active implementation work
  - one bounded workstream branch per active implementation stream
  - should normally be pushed to GitHub early so active work is not trapped on one machine
- capability implementation should normally happen on a dedicated `codex/<capability-name>` or `codex/<workstream>` branch, not directly on `codex/dev`
- non-trivial capability work should usually get its own clean worktree as well, especially if `codex/dev` is dirty or carrying unrelated integration work
- local-only scratch or rescue branches:
  - allowed only as short-lived exceptions
  - not the durable home for meaningful active work

Important rule:

- do not leave mixed unfinished work parked on `codex/dev`
- do not leave meaningful active work local-only longer than necessary
- do not use `codex/dev` as the default execution branch for a capability just because it already exists
- if work on `codex/dev` stops being one coherent landing candidate, preserve it on a `codex/<workstream>` branch and return `codex/dev` to a clean integration state
- if a temporary `codex/wip-*` or `codex/unframed-*` branch is created to rescue mixed work, convert that work into a real workstream branch or delete the rescue branch after resolution
- do not let large uncommitted local dirt linger on an active branch; use bounded checkpoint commits as the default hygiene move
- when a new branch or worktree is created, Mara or Owen should tell the human the branch name, purpose, and expected landing path immediately
- when a branch is promoted, aligned, or deleted, Mara or Owen should tell the human what changed so branch truth never has to be inferred

## Default Intake Artifact

Use `flightline_task_intake_brief.md` as the standard intake format for new non-trivial development work routed to Mara.

The intake brief is the normal front door for framing, routing, and deciding whether work stays sequential or justifies temporary extra builder capacity.

If you are storing product-work artifacts on disk, use:
- `product-work/requests/` for raw requests waiting on Mara framing
- `product-work/capabilities/` for user-plus-Zoe capability dossiers and their in-place Mara decomposition
- `product-work/workstreams/` only for exceptional standalone implementation streams
- `product-work/completed/` for completed product-work artifacts

## Capability To Feature Workflow

Use this split by default:

1. You and Zoe define capabilities.
2. Mara turns approved capabilities into bounded features and records that decomposition in the same capability dossier by default.
3. Eli implements the bounded stream.
4. Nadia and Owen join when risk, review need, or landing complexity justifies it.

What each step means:

- `capability`:
  - player-facing intent
  - what the player should be able to do
  - why it matters now
  - minimum useful scope
  - explicit deferrals
  - ongoing canonical record of decomposition, active slice, and deferred follow-ons
  - normal on-disk home: `product-work/capabilities/`

- `feature` or `workstream`:
  - bounded implementation slice
  - affected systems
  - validation bar
  - stop conditions
  - landing sequence when needed
  - normal on-disk home: inside the capability dossier by default
  - standalone on-disk home: `product-work/workstreams/` only when a separate artifact is justified

Important rule:

- Mara should not treat a capability brief as implementation-ready by default
- smaller asks should normally stay in the `request` path instead of being inflated into capabilities
- Mara should only push work up into a capability brief when it genuinely needs player-facing product shaping, minimum useful scope design, or Zoe-level now-versus-later judgment
- if a request is reclassified upward into a broader capability, Mara should not leave a parallel active workstream draft live beside it before capability review is complete
- by default, one active capability should have one canonical product-work document
- Mara should append decomposition, active-slice status, and deferred slices into that same capability dossier instead of creating a new file for each slice
- standalone workstream files are for exceptional execution complexity, not normal feature breakdown
- if the capability is too broad, mistimed, inconsistent, or technically unsafe, Mara should reframe it before Eli receives anything
- if the capability is already narrow and coherent, Mara may reduce it directly to one implementation-ready feature stream
- active capability dossiers should keep a short status block with workflow state, current owner, current active slice, next routing target, and last updated so notify automation can route the next handoff cleanly

## Default Bug Tracker

GitHub Issues is the default durable tracker for bugs, regressions, and Nadia findings.

Use issues when:
- the bug should survive the current conversation
- the bug needs triage, labels, priority, or later follow-up
- Nadia found the issue during review and it will not be fixed immediately

Use a Mara intake brief in addition to the issue when:
- the bug is non-trivial
- the bug is cross-system or red-flag
- the bug needs framing before Eli should execute

Do not use the intake-brief folder as the persistent bug database.

## Default Command Chain

### Start with Mara when:

- the task is ambiguous
- the task is cross-system
- the task touches red-flag areas
- the task may need architectural change
- you are not sure who should own it
- you want decomposition into workstreams

### Start with Eli when:

- the task is already clearly framed
- the work is bounded and mainly execution
- the affected area is known
- the expected validation is straightforward

### Start with Nadia when:

- you want a review of a diff, branch, or completed task
- you suspect hidden failure modes
- you want stronger validation pressure before landing

### Start with Owen when:

- multiple streams or branches need to land together
- merge order matters
- release readiness or landing safety is the main concern

### Start with Zoe when:

- the key question is now versus later
- the proposal may be valuable but mistimed
- acceptance criteria or minimum useful scope are unclear
- backlog capture needs product judgment

## Standard Workflow

### 1. Intake

For most development work, start with Mara unless the task is already clearly framed.

Use `flightline_task_intake_brief.md` for that intake whenever the task is non-trivial.

Mara should decide:
- operating mode
- change budget
- owner
- validation bar
- whether Zoe or Nadia should be involved before implementation
- whether the task should move into `Coordinated Delegation` instead of staying single-agent
- the next paste-ready role prompts when delegation is the right mode

### 2. Frame

If the task is non-trivial, Mara should produce:
- objective
- reason it belongs now
- in-scope work
- explicit non-goals
- affected systems or files
- assumptions and open questions
- required validation
- escalation triggers
- deferred work

If Mara recommends delegated follow-on work, she should also provide the next paste-ready role prompts by default instead of waiting to be asked.

### 3. Execute

Eli owns scoped implementation unless the task stays in `Single-Agent Mode`.

Eli should:
- challenge weak implementation direction before building
- keep scope bounded
- surface ambiguity immediately
- checkpoint bounded progress with coherent commits often enough that local dirt does not sprawl across unrelated context switches
- push active non-trivial workstream branches to GitHub early enough that the work is durably backed up
- stop and escalate when the current stream now needs re-framing, broader role support, or further decomposition instead of opening new sub-streams independently
- use the closeout template when done

### 4. Challenge

Nadia should review work whenever the change is:
- cross-system
- player-visible and important
- state-sensitive
- likely to hide failure modes
- important enough that confidence matters more than speed

Nadia's review should classify findings as:
- block now
- fix soon
- track later

### 5. Land

Owen should be involved when:
- more than one stream must land
- several sessions touched adjacent areas
- landing sequence matters
- release readiness is being evaluated

Owen should decide:
- ready to land or not
- ready for `dev` to local `main` promotion or not
- ready for local `main` to GitHub `main` promotion or not
- required release classification under `VERSIONING.md`
- the exact version before and after promotion when a cut is required
- whether the landing should be released now as the next `PATCH` instead of being held for an unnecessary larger bundle
- blockers
- merge order
- missing cross-system follow-through

### 6. Scope and Timing

Zoe should be brought in when the real question is not implementation, but whether the work belongs now.

Zoe should sharpen:
- current-slice fit
- minimum useful scope
- explicit deferrals
- concrete backlog capture

## Dispatch Rules

### Small clear task

Route:
1. Mara or direct to Eli
2. Eli implements
3. Nadia optional if risk stays low

### Important but coherent task

Route:
1. Mara frames
2. Eli implements
3. Nadia reviews
4. Owen only if landing risk justifies it

If the task is ambiguous, cross-system, or red-flag enough that one role should not carry it by inertia, Mara should switch this route to explicit delegation and provide the next role prompts automatically.
If the human explicitly authorizes automatic handoff in the active session, Mara may directly hand the next step to Eli, Nadia, or Owen instead of only drafting the prompt first.

### Scope question

Route:
1. Zoe judges now versus later
2. Mara frames only if the work belongs now
3. Eli implements if approved

### Parallel or multi-stream effort

Route:
1. Mara defines streams, interfaces, owners, and validation
2. Eli executes one stream at a time unless temporary builders are explicitly authorized
3. Nadia reviews risky streams or the integrated result
4. Owen decides landing order
5. Zoe captures deferred scope

## Temporary Builder Rule

With one standing Eli session, FlightLine should assume only one primary coding stream at a time.

Mara has explicit authority to authorize temporary additional implementation sessions.

She may do so only when:
- the interfaces are frozen
- the file ownership boundaries are clear
- the streams do not overlap
- the increased throughput is worth the integration cost

If those conditions are not true, do not split the build work.

Every temporary builder session should be created with a written authorization record using `temporary_builder_authorization_template.md`.

That authorization should define:
- objective
- change budget
- owned files or subsystem
- frozen interfaces and contracts
- explicit no-touch areas
- validation required
- reviewer and landing path
- expiry or stop condition

Temporary builders are still Implementation Engineers.
They are not new standing roles.

## Automation Routing

For capability-development notify automation, use the workflow states defined in `flightline_capability_notify_workflow.md`.

That automation should not self-start implementation.
It should notify the human of the next routing action and provide the next prompt when the dossier state is clear.
Direct agent handoff is for live sessions where the human has explicitly authorized it, not for unattended recurring automation.

When daily automation outputs arrive, route them like this:

- `Recent Change Bug Sweep` -> Nadia Cross first, copy Mara Sterling
- `Test Gap Review` -> Nadia Cross first, copy Mara Sterling
- `Documentation Drift Check` -> Mara Sterling first, involve Zoe Bennett if the mismatch is product or milestone related
- `Release Readiness Scan` -> Owen Hart first, copy Nadia Cross and Mara Sterling
- `Vertical Slice Scope Guard` -> Zoe Bennett first, copy Mara Sterling
- `Backlog Capture From Recent Work` -> Zoe Bennett first, copy Mara Sterling

Automations should create review signal, not self-start implementation.

Eli Mercer should not own a standing daily automation by default.
Implementation should remain demand-driven rather than recurring-noise driven.

## Blocker Handling

Escalate to you directly when:
- Mara and Zoe disagree on whether work belongs now
- Nadia or Owen raise a blocker and you want to waive it
- the task depends on a product call only you can make
- the assumptions are too uncertain for responsible execution

Do not ask the team to vote.
Ask the owning role for a recommendation and then decide.

## Closeout Requirement

All development-oriented sessions should end with this exact closeout template:

- `Actions`
- `Result`
- `Validation`
- `Open Risks`
- `Handoff or Blockers`

This is required even when the answer is short.

## Recommended Day-To-Day Usage

### Default path

1. Send new technical work to Mara using `flightline_task_intake_brief.md`.
2. Let Mara either keep it small or frame it for Eli.
3. Send risky completed work to Nadia.
4. Send multi-stream or release-sensitive work to Owen.
5. Send scope and backlog disputes to Zoe.

### When you want speed

Use `Single-Agent Mode` for truly small work, but do not use speed as an excuse to skip challenge on risky changes.

### When you want confidence

Prefer Mara -> Eli -> Nadia, and add Owen if landing risk is real.

### When you are promoting branches

Use `flightline_branch_promotion_rules.md`.

The short version is:
1. do not treat `dev` as automatically promotable
2. keep real active work on GitHub-backed `codex/<workstream>` branches
3. let Mara define the intended landing scope
4. let Nadia block risky weakly-validated work
5. let Owen decide promotion readiness and cut the required release version when the landed delta calls for it
6. push GitHub `main` only from a reviewed local `main`

## Final Guidance

This team should feel like a sharp small studio team, not a decorative org chart.

If the workflow starts creating ceremony without better decisions, reduce the number of active roles in that task.

If the workflow starts hiding weak ideas behind politeness, challenge harder.
