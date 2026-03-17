# FlightLine Bug Tracking

## Purpose

GitHub Issues is the default durable tracker for FlightLine bugs, regressions, and QA findings.

Use issues to keep bugs out of chat history and out of the intake-brief folder.

Intake briefs are for framing non-trivial bug work.
They are not the bug database.

## Default Rule

- If a bug should survive the current conversation, open a GitHub issue.
- If the bug is non-trivial, cross-system, ambiguous, or red-flag, also create a Mara intake brief that links back to the issue.
- If the bug is tiny and will be fixed immediately, an issue is optional.
- If Nadia finds a bug during review and it will not be fixed immediately, open an issue for it.

## Source Of Truth Split

- GitHub Issue: durable record, triage, labels, status, links to evidence, final closeout
- Intake brief: Mara framing artifact when the bug needs decomposition, scope control, or stronger routing
- Chat: fast routing and execution only, not long-term storage

## Recommended Label Taxonomy

Use a small label set.
Do not build a large issue bureaucracy.

### Required labels

- `bug`
- one severity label:
  - `severity:blocker`
  - `severity:high`
  - `severity:medium`
  - `severity:low`
- one or more area labels:
  - `area:shell-ui`
  - `area:contracts`
  - `area:aircraft`
  - `area:staffing`
  - `area:dispatch`
  - `area:save-load`
  - `area:time-advance`
  - `area:finance`
  - `area:tests`
  - `area:docs`

### Optional workflow labels

- `source:nadia`: bug surfaced by Nadia Cross
- `needs-intake`: bug should be framed by Mara before implementation
- `regression`: behavior worked before and broke
- `risk:red-flag`: touches save/load, schema, event flow, finance integrity, scheduling or time advance, or UI versus state mismatch

## When To Use A Mara Intake Brief

Create or request an intake brief when the bug:

- is cross-system
- touches red-flag areas
- has unclear root cause
- might expand scope if fixed casually
- needs a current-slice decision, not just a code change

Do not create an intake brief just because the bug exists.
Create one when the bug needs framing.

## Minimal Workflow

1. Open a GitHub issue using the bug template.
2. Add the recommended labels.
3. If the bug is non-trivial, create a Mara intake brief and link the issue.
4. Mara decides whether the work stays in `Single-Agent Mode`, goes straight to Eli, or needs broader framing.
5. Eli or the assigned owner executes the fix.
6. Nadia verifies correctness when the risk justifies independent review.
7. Close the issue only after validation is complete or validation gaps are called out explicitly.

## Nadia Findings

For Nadia-found issues, use:

- `bug`
- a severity label
- one or more area labels
- `source:nadia`

Add `needs-intake` if Nadia's finding is important enough that Mara should frame it before implementation.

## Final Guidance

Keep the system light.

If a bug tracker convention starts feeling heavier than the work itself, reduce the labels before you reduce the evidence quality.
