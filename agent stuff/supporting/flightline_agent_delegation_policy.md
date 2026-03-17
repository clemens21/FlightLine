# FlightLine Agent Delegation Policy

## Purpose

This document defines when FlightLine should use one agent, when it should use a framed handoff, and when it should coordinate multiple bounded streams.

It is a supporting reference for humans and operating design. The concise runtime rules live in the repository-root `AGENTS.md`.

The goal is to get leverage from multiple Codex sessions without turning every task into process overhead.

## Default Rule

Default to one primary owner per task or per workstream.

Multi-agent coordination is justified only when it clearly improves one of these:
- quality
- confidence
- decomposition
- landing safety

If delegation does not create a clear advantage, do not use it.

## Operating Modes

## Mode 1: Single-Agent Mode

### Use this when

- the task is small or medium
- the scope is already clear
- one subsystem is primarily affected
- the change is straightforward to validate
- the overhead of handoff would be higher than the likely benefit

### Owner

One agent temporarily combines Technical Lead and Implementation Engineer responsibilities.

### Main risk

The owner may miss edge cases or underestimate the task.

### Mitigation

Escalate to another mode if the task grows, touches more systems than expected, or reveals meaningful risk.

## Mode 2: Framed Delivery

### Use this when

- the task is non-trivial but still coherent
- the implementation approach needs to be chosen before coding
- the work is mostly execution once framed
- independent QA may be useful but full multi-stream decomposition is unnecessary

### Standard pattern

1. `Technical Lead` frames the task and defines validation expectations.
2. `Implementation Engineer` executes the scoped change.
3. `QA and Failure Analyst` reviews when the risk justifies independent challenge.

### Why this mode exists

This is the default mode for important work that is still small enough to have one builder.

## Mode 3: Coordinated Multi-Stream

### Use this when

- the task is broad enough to benefit from decomposition
- multiple development streams can proceed in parallel without sharing the same files
- the lead needs bounded specialist review before making a recommendation
- landing the combined result carries real integration risk

### Standard pattern

1. `Technical Lead` defines the stream boundaries, interfaces, and validation bar.
2. One `Implementation Engineer` owns each build stream in a separate worktree.
3. `QA and Failure Analyst` reviews the risky streams or the combined result, depending on where the real risk sits.
4. `Integration and Release Manager` decides merge order and landing readiness when multiple streams must come together.
5. `Product Strategy Manager` is added only if scope, acceptance, or backlog shape needs explicit product judgment.

### Why this mode exists

The highest-value use of multi-agent work in FlightLine is usually bounded decomposition plus independent challenge, not several builders editing the same area.

## Planning Checkpoint

Before moving into implementation, stop and frame the work if one or more of these is true:

- the task is broad, ambiguous, or under-specified
- more than one subsystem is materially affected
- the task touches save/load, event flow, persistence, schema, or other shared state concerns
- the task has real product or scope tradeoffs
- parallel work is likely
- getting the task wrong would be expensive

At that checkpoint, produce:

1. the task as understood
2. the major uncertainties
3. the recommended mode
4. the main risks and tradeoffs
5. the required validation
6. the handoff contract if another role or stream will take over

## Change Budget Rule

Before implementation starts, classify the work as one of:

1. `small patch`
2. `scoped feature`
3. `cross-system change`

The chosen budget should influence routing, validation depth, and whether parallel work is justified.

If the work outgrows its declared budget, reframe it instead of quietly continuing.

## Escalation Triggers

Move beyond `Single-Agent Mode` when one or more of the following is true:

1. More than one subsystem is affected.
2. Save, schema, event-model, read-model, or UI coherence risk is real.
3. Independent adversarial review would materially improve confidence.
4. The task is ambiguous enough to benefit from framing or decomposition.
5. Confidence matters more than raw speed.
6. More than one active implementation stream is needed.

## Distinct Review Lenses

Do not assign multiple reviewers unless each one has a distinct job.

- `QA and Failure Analyst`: correctness, failure modes, missing validation, edge cases
- `Integration and Release Manager`: merge safety, missing cross-system follow-through, landing order, release confidence
- `Product Strategy Manager`: now versus later, minimum useful scope, acceptance criteria, backlog capture

If two reviewers are effectively performing the same review, remove one of them.

Every review request should state the unique review lens explicitly rather than assuming the reviewer will infer it.

## Decision Log Rule

For meaningful architecture, scope, integration, or landing decisions, capture a short decision note with:

1. decision made
2. reason
3. alternatives rejected
4. downstream impact

This can be brief, but it should be explicit enough that later sessions do not re-litigate the same decision blindly.

## Required Handoff Contract

Every non-trivial delegation should include:

1. objective
2. reason the work belongs now
3. in-scope items
4. explicit non-goals
5. affected systems or files
6. assumptions and open questions
7. validation required before completion
8. escalation triggers
9. what should be deferred rather than folded in silently

Sub-agents or downstream roles should not be asked to wander through ambiguity.

## Parallel Work Rules

1. Use separate worktrees for separate coding streams.
2. Keep one primary owner per stream.
3. Do not let two builders edit the same files or same subsystem at the same time.
4. Define and freeze shared interfaces, schemas, event contracts, and file ownership boundaries before streams branch.
5. If a frozen interface must change, stop and let the Technical Lead reframe the streams explicitly.
6. Reintegrate through explicit integration review when streams touch adjacent systems.

## Temporary Builder Authorization Rule

Additional implementation sessions beyond the standing Implementation Engineer should exist only when explicitly authorized by the Technical Lead.

That authorization should state:

1. objective
2. change budget
3. owned files or subsystems
4. frozen interfaces and contracts
5. explicit no-touch areas
6. validation required
7. required reviewer or landing path
8. expiry or stop condition

If the authorization is missing, the temporary builder session should not start.

## Anti-Patterns

1. Sub-agents for everything.
2. Decorative specialization.
3. Delegating unclear work without first framing it.
4. Reviewers without a distinct lens.
5. Multiple builders in the same area at the same time.
6. Using delegation to avoid making decisions.

## Final Decision Rule

If the task is small, clear, and contained, use `Single-Agent Mode`.

If the task is important but mostly execution once framed, use `Framed Delivery`.

If the task is broad, parallelizable, or integration-heavy, use `Coordinated Multi-Stream`.

Anything more complicated than that should need a strong reason.
