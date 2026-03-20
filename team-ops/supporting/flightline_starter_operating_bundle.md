# FlightLine Starter Operating Bundle

## Purpose

This document defines the recommended everyday prompt set for FlightLine.

It is a supporting reference for humans choosing which prompts to keep close at hand.

It is designed for a solo builder using multiple Codex sessions, including periods where several development efforts may be active at the same time.

## Recommendation

Use these four prompts most often:

1. `Single-Agent Mode`
2. `Technical Lead`
3. `Implementation Engineer`
4. `QA and Failure Analyst`

Keep these two prompts in reserve:

5. `Integration and Release Manager`
6. `Product Strategy Manager`

This is enough structure to support small tasks, framed implementation, adversarial review, and parallel work without creating a fake org chart.

## Why This Bundle

### Single-Agent Mode

Use for small, clear, contained work where role separation would slow the task down.

### Technical Lead

Use to frame ambiguous, risky, cross-system, or parallel work before coding starts.

### Implementation Engineer

Use as the default scoped code-authoring role once the task is framed.

### QA and Failure Analyst

Use whenever independent challenge meaningfully improves confidence.

### Integration and Release Manager

Keep in reserve for multi-stream landing, merge-order decisions, and release-readiness checks.

### Product Strategy Manager

Keep in reserve for scope-now-versus-later calls, backlog shaping, and acceptance-criteria sharpening.

## Default Operating Rhythm

### Small contained work

Use `Single-Agent Mode`.

### Clear build work

Use `Implementation Engineer` directly.

Add `QA and Failure Analyst` if the change has meaningful regression, state, or player-facing risk.

### Ambiguous or cross-system work

Use `Technical Lead` first.

Then hand off to `Implementation Engineer` once the task is framed well enough to execute cleanly.

### Several active workstreams

Use `Technical Lead` to define boundaries, interfaces, and validation expectations first.

Then run one `Implementation Engineer` per workstream in separate worktrees.

Bring in `QA and Failure Analyst` where the risk justifies it, and add `Integration and Release Manager` before landing shared or adjacent work.

### Scope and timing questions

Bring in `Product Strategy Manager` only when the decision is really about current-slice fit, minimum useful scope, or backlog capture.

## Anti-Patterns

1. Do not treat every task as a Technical Lead task.
2. Do not skip `Single-Agent Mode` for simple work.
3. Do not create parallel builders in the same subsystem.
4. Do not add reserve prompts just because they exist.
5. Do not use QA only at the very end.

## Final Recommendation

For FlightLine's current stage, the everyday working set is:

- `Single-Agent Mode`
- `Technical Lead`
- `Implementation Engineer`
- `QA and Failure Analyst`

That set gives you speed, execution discipline, and a workable path to several concurrent streams without needing every role on every task.
