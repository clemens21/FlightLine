# FlightLine Codex Automation Setup Sheet

## How To Use This Document

This document is meant to be copied into the Codex app when creating recurring automations.

It is a supporting reference for recurring review setup, not the main runtime instruction file.

Each automation includes:
- a suggested name
- cadence
- suggested daily run time
- run mode
- a copy-paste prompt
- the reason it exists

## Automation Ground Rules

1. Prefer review over autonomous implementation.
2. Keep the first wave read-only.
3. Use a separate worktree for any write-capable automation.
4. Define the comparison window explicitly.
5. Deduplicate against already-open findings or backlog items when possible.
6. Keep recurring outputs small enough to review quickly.
7. For this setup, every automation should run once per day in your local time zone.

### Scheduling rule

In the Codex app, configure each automation as a weekly schedule with all seven days selected at the listed local time.

That gives you a once-daily automation that matches current app scheduling constraints.

### Comparison window rule

Unless a better checkpoint already exists, review:
- uncommitted local changes
- plus the most recent meaningful batch of commits

If the automation has no prior checkpoint, use a small recent window rather than the whole repository.

## 1. Recent Change Bug Sweep

### Primary owner

Nadia Cross, QA and Failure Analyst

### Suggested name

Recent Change Bug Sweep

### Cadence

Once daily

### Suggested daily run time

6:00 PM local time

### Run mode

Read-only at first

### Why this exists

This catches likely bugs, regressions, and brittle logic in recent changes before they compound.

### Prompt

Review the defined recent-change comparison window for this project and identify likely bugs, regressions, edge cases, and unsafe assumptions.

Focus on:
- broken game logic
- state integrity risks
- scheduling and time-advance inconsistencies
- save/load hazards
- UI behavior that may misrepresent actual simulation state

Do not rewrite large areas of code.
Do not repeat findings that are already clearly open unless the risk increased materially.

Return:
1. the top 5 findings ranked by severity
2. the files involved
3. a short explanation of each issue
4. whether each finding should be fixed now, watched, or turned into a ticket
5. minimal fix suggestions only when the fix is obvious

## 2. Test Gap Review

### Primary owner

Nadia Cross, QA and Failure Analyst

### Suggested name

Test Gap Review

### Cadence

Once daily

### Suggested daily run time

8:00 AM local time

### Run mode

Read-only

### Why this exists

This keeps testing pressure on the project and highlights where recent changes are under-validated.

### Prompt

Review the defined recent-change comparison window and identify missing or weak test coverage.

Focus on:
- changed logic without corresponding tests
- edge cases that are currently untested
- important gameplay flows that only have happy-path validation
- state transition logic that could fail silently
- save/load or event-model behavior that deserves explicit verification

Return:
1. the top missing tests
2. why each one matters
3. whether each gap should be handled as an automated test, manual scenario, or exploratory review
4. a recommended priority ranking

## 3. Documentation Drift Check

### Primary owner

Mara Sterling, Technical Lead

### Suggested name

Documentation Drift Check

### Cadence

Once daily

### Suggested daily run time

9:00 AM local time

### Run mode

Read-only at first, then worktree-only if you later want auto-proposed edits

### Why this exists

This detects where docs, readmes, or strategy notes no longer reflect the actual state of FlightLine.

### Prompt

Review the current implementation and compare it against the main README, strategy documents, and other key project documentation touched by the recent-change comparison window.

Identify places where documentation appears stale, misleading, incomplete, or inconsistent with the current project state.

Focus on:
- implementation status claims
- feature availability
- vertical-slice priorities
- architecture descriptions
- setup or workflow instructions that may no longer be accurate

Return:
1. the top documentation mismatches
2. which files should change
3. recommended wording updates
4. whether each issue is urgent, medium, or low priority

If write access is enabled, propose minimal documentation edits only. Do not rewrite voice or structure unless necessary.

## 4. Release Readiness Scan

### Primary owner

Owen Hart, Integration and Release Manager

### Suggested name

Release Readiness Scan

### Cadence

Once daily

### Suggested daily run time

10:00 AM local time

### Run mode

Read-only

### Why this exists

This gives you a recurring sanity check on whether the current build is reliable enough for milestone reviews or demos.

### Prompt

Evaluate current release readiness for FlightLine's present vertical-slice milestone using the recent comparison window plus the current build surface.

Focus on:
- known stability risks
- incomplete flows
- major UX confusion points
- missing validation around critical paths
- systems that appear integrated in code but not truly reliable in play

Return:
1. red risks that block confidence
2. yellow risks that should be watched closely
3. green areas that appear ready
4. the top 3 actions that would most improve near-term confidence

Do not suggest broad future features. Stay focused on current milestone readiness.

## 5. Vertical Slice Scope Guard

### Primary owner

Zoe Bennett, Product Strategy Manager

### Suggested name

Vertical Slice Scope Guard

### Cadence

Once daily

### Suggested daily run time

11:00 AM local time

### Run mode

Read-only

### Why this exists

This protects the project from drifting into interesting but mistimed work.

### Prompt

Review recent changes, active work, and current documentation for signs that FlightLine is drifting away from its current vertical-slice goals.

Focus on:
- features that add breadth without improving the core loop
- premature architecture for future scale
- polish work happening before core reliability is proven
- systems that are valuable eventually but mistimed now
- backlog items that should be deferred more explicitly

Return:
1. the top examples of scope drift
2. why each one is a problem now
3. what should be deferred or reframed
4. what work appears best aligned with the current milestone

## 6. Backlog Capture From Recent Work

### Primary owner

Zoe Bennett, Product Strategy Manager

### Suggested name

Backlog Capture From Recent Work

### Cadence

Once daily

### Suggested daily run time

12:00 PM local time

### Run mode

Read-only at first, optionally worktree-only later if you want it updating a backlog file

### Why this exists

This preserves useful discoveries from implementation and review without letting them derail the current task.

### Prompt

Review recent changes, comments, TODOs, and obvious follow-on discoveries.

Create a concise backlog capture focused on work that should happen later, not now.

For each candidate item, include:
- title
- why it matters
- why it is not current-slice work
- dependency notes
- rough priority
- suggested acceptance criteria if obvious

Do not promote every idea into a ticket.
Do not repeat backlog items that are already captured clearly elsewhere.

## Recommended Operating Stance

- keep the first wave read-only
- only allow file edits in a worktree
- do not let automations autonomously implement features
- use automations to surface risk, drift, gaps, and follow-on work
- do not assign a standing daily automation to Eli Mercer by default; implementation should remain request-driven

## Suggested Daily Setup

If you want the full daily automation set, schedule these once per day:

### 8:00 AM

Test Gap Review

### 9:00 AM

Documentation Drift Check

### 10:00 AM

Release Readiness Scan

### 11:00 AM

Vertical Slice Scope Guard

### 12:00 PM

Backlog Capture From Recent Work

### 6:00 PM

Recent Change Bug Sweep

That gives you one pass per day for each automation while keeping the outputs staggered and reviewable.
