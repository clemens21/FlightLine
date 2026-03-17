# Runtime Promotion Checklist

## Status

Promotion completed on 2026-03-17.

The repository-root `AGENTS.md` is now the live runtime file.

Keep this document only as a historical record of the promotion criteria and watch items.

## Purpose

This checklist was for the moment when the staged `agent stuff/AGENTS.md` file was ready to become the real repo-root `AGENTS.md`.

The goal is to make promotion a controlled packaging step, not another design phase.

## Promotion Criteria

Promote only when all of the following are true:

1. `AGENTS.md` is stable enough to stand on its own without requiring a human to open supporting docs first.
2. The role model, routing rules, and handoff contract are no longer changing every session.
3. The file is short and clear enough that automatic runtime application will help more than it will distract.
4. The team model reflects actual practice instead of aspirational process.
5. The supporting docs are clearly supplementary rather than competing instruction sources.

## What Must Be True Of `AGENTS.md`

Before promotion, confirm that `AGENTS.md`:

1. contains the core product context
2. contains the real operating rules that should apply on every task
3. defines routing and ownership clearly
4. defines done criteria and blocker handling clearly
5. does not rely on support docs for essential runtime behavior
6. does not include drafting notes that would be noisy once applied automatically

## What To Review Before Promotion

1. Remove or tighten any staging-only language that would not make sense at repo root.
2. Check that references to supporting docs still make sense from the root location.
3. Confirm that support docs do not introduce rules missing from `AGENTS.md`.
4. Confirm that the runtime file is opinionated enough to guide behavior but not so long that it becomes ignored.
5. Confirm that any reserve roles remain clearly conditional.

## Recommended Promotion Steps

1. Freeze further structural edits for one pass.
2. Re-read `AGENTS.md` as if it were the only file Codex would see automatically.
3. Re-run a contradiction check across the support docs.
4. Copy `agent stuff/AGENTS.md` to the repository root as `AGENTS.md`.
5. Keep the staged package intact during the first real-use period so updates can still be developed safely.
6. After the runtime file proves stable, decide whether the staged copy should remain the drafting source or be retired.

## Post-Promotion Watch Items

After promotion, watch for these failure modes:

1. agents overusing the full role model on simple tasks
2. supporting docs drifting away from the root `AGENTS.md`
3. prompt-pack language becoming more authoritative than the runtime file
4. integration or QA blockers being ignored in practice
5. the root file becoming too large or too procedural over time

## Final Guidance

Promotion should happen when the rules are stable enough to enforce automatically.

Until then, keep improving the staged package instead of rushing the root file.
