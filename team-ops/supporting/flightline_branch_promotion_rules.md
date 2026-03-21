# FlightLine Branch Promotion Rules

## Purpose

This document defines how FlightLine work should move from development branches to local `main`, and from local `main` to GitHub `main`.

This is a supporting operations document.
The repository-root `AGENTS.md` remains the runtime authority.

## Key Clarification

These rules treat promotion as an intentional movement of a selected commit set, not as blind approval of everything currently sitting on `dev`.

If `dev` contains unrelated experiments, partial work, or stale changes, do not promote the whole branch just because the branch name is `dev`.

Also keep the branch truths straight:
- `main` is the source of truth for promoted work
- GitHub-backed `codex/<workstream>` branches are the durable source of truth for active in-progress work
- local-only rescue or scratch branches are temporary exceptions, not the normal operating model

## Branch Meanings

- `codex/<workstream>`: the normal branch for active implementation work on one bounded stream
- `origin/codex/<workstream>`: the durable remote backup for that active bounded stream
- `dev`: the clean local integration branch for the next intended landing set
- local `main`: the local integration and pre-push branch that should contain only work intended to be eligible for remote promotion
- GitHub `main`: the remote `main` branch on GitHub

Default expectation:

- local `main` and GitHub `main` should normally stay aligned
- `dev` should normally match `main` when no bounded landing is actively being assembled
- new coding work should normally start on `codex/<workstream>` from the current shared tip
- non-trivial active work on `codex/<workstream>` should normally be pushed to GitHub early

## Core Promotion Rules

1. Do not do normal development directly on local `main`.
2. Do not push work to GitHub `main` directly from `dev`.
3. Promote only the intended commit set, not every commit that happens to exist on `dev`.
4. If unrelated work is mixed into `dev`, separate the desired changes before promotion.
5. Treat local `main` as a controlled integration checkpoint, not as a second development scratchpad.
6. Treat GitHub `main` as the stable shared branch and protect it accordingly.
7. Do not force-push local `main` or GitHub `main` as part of normal workflow.
8. Promotion blockers raised by QA or Integration remain blocking until resolved or explicitly waived by the human.
9. If tests, validation, docs, or migration notes are required, they should be completed or explicitly called out before promotion.
10. If the exact commit set cannot be described clearly, the work is not ready to promote.
11. Do not use `dev` as a long-lived mixed-work scratch branch.
12. If unfinished work accumulates on `dev`, preserve it on a `codex/<workstream>` branch before trying to align `dev` or promote it.
13. Local-only branches are for short-lived scratch or rescue use only.
14. If a local-only rescue branch holds work worth keeping, push it to GitHub or reframe it into a named `codex/<workstream>` branch quickly.

## Default Branch Workflow

Use this flow by default:

1. start from the current shared promoted tip
2. open a bounded `codex/<workstream>` branch for active coding
3. push that workstream branch to GitHub early if the work is meaningful or should not be lost
4. keep `dev` clean until a bounded landing set is ready to integrate
5. integrate only that bounded set into `dev`
6. verify `dev`
7. fast-forward local `main`
8. push local `main` to GitHub `main`

This keeps `dev` readable as an integration checkpoint instead of a second scratchpad.

## Dev To Local Main

Promote from `dev` to local `main` only when all of the following are true:

- Mara has framed the work well enough that the intended landing scope is clear
- the commit set to promote is explicitly identified
- the intended validation has been completed or the missing validation is explicitly called out
- Nadia's blocking findings, if any, are resolved or waived by the human
- Owen agrees the change is coherent enough to integrate locally
- docs are updated if current docs would otherwise become misleading
- local `main` is checked before promotion so you know exactly what delta is being introduced

Preferred promotion methods:

- fast-forward or merge only when `dev` contains only the intended ready work
- cherry-pick or otherwise isolate commits when `dev` contains mixed work
- if `dev` drifted because mixed work was parked there, move that mixed work back onto a `codex/<workstream>` branch before promotion
- if you needed a temporary `codex/wip-*` rescue branch, do not confuse that branch with ready integration state

Do not treat "merge dev into main" as the default safe move.

## Local Main To GitHub Main

Push from local `main` to GitHub `main` only when all of the following are true:

- the local `main` branch contains only the intended promotion set
- the delta between local `main` and GitHub `main` has been checked
- no unresolved QA or Integration blocker remains
- any required smoke validation on the integrated result has been completed
- the landing notes, risks, or follow-up items are clear enough to communicate
- the human has not asked for the push to be held back

The normal path should be:

1. integrate selected work into local `main`
2. verify local `main`
3. push local `main` to GitHub `main`

Do not bypass local `main` unless the human explicitly changes the workflow.

## Role Responsibilities

- Mara Sterling, Technical Lead:
  - defines the intended landing scope
  - challenges promotions that mix unrelated work
  - calls out when the technical shape is still too unstable to promote

- Eli Mercer, Implementation Engineer:
  - keeps implementation work scoped enough that promotion remains intelligible
  - identifies what was actually changed and what remains deferred

- Nadia Cross, QA and Failure Analyst:
  - identifies correctness blockers before promotion
  - pushes back when validation is too weak for the risk level

- Owen Hart, Integration and Release Manager:
  - owns promotion readiness from `dev` to local `main`
  - owns landing readiness from local `main` to GitHub `main`
  - checks overlap, sequence, and shared-state risk
  - recommends hold, promote, or reframe

- You:
  - remain the final authority on waiving blockers or deciding not to push

## Special Cases

If `dev` is carrying several unrelated tasks at once:

- do not promote the whole branch
- isolate the intended work first
- if isolation is messy, stop and clean up the branch structure before promotion
- the preferred cleanup move is to preserve unfinished work on one or more `codex/<workstream>` branches and return `dev` to a clean integration state

If a rescue branch such as `codex/wip-*` exists:

- treat it as a temporary preservation mechanism, not as the new normal branch lane
- either rename or replace it with a properly framed `codex/<workstream>` branch once the work is understood
- delete it after the preserved work has been safely reframed, landed, or intentionally abandoned

If a change touches save data, schema, migrations, event flow, or other red-flag areas:

- expect stronger QA pressure
- expect Owen to be involved before promotion to GitHub `main`
- do not use weak validation just to preserve momentum

## Final Guidance

The important control point is not the branch name.
The important control point is whether the exact change being promoted is bounded, reviewed, validated, and understandable.
