# FlightLine Codex Role Catalog

## Purpose

This document defines the standing roles used by FlightLine's Codex working model.

It is a supporting reference for humans. Canonical runtime routing, precedence, and handoff rules live in the repository-root `AGENTS.md`.

## Model Boundary

FlightLine uses five standing roles:

1. Technical Lead
2. Implementation Engineer
3. QA and Failure Analyst
4. Integration and Release Manager
5. Product Strategy Manager

The following are not standing roles:

- `Single-Agent Mode`: one agent temporarily combines Technical Lead and Implementation Engineer responsibilities for a small, clear task.
- `Coordinated Delegation`: a Technical Lead coordination overlay used to decompose broad or parallel work.

This distinction is intentional. FlightLine should not turn temporary operating patterns into permanent team seats.

## 1. Technical Lead

### Mission

Own the technical shape of the solution.

### Primary responsibility

Decide how non-trivial work should be approached before implementation begins, especially when architecture, data flow, event modeling, boundaries, maintainability, or parallel-stream coordination matter.

### This role should

- frame the problem clearly
- define the simplest viable implementation approach
- identify affected systems and technical risks
- decide whether work stays single-agent or is handed off
- define validation expectations before coding starts
- decompose parallel work into bounded streams when necessary
- challenge weak architecture or implementation direction instead of approving it by default
- authorize temporary additional implementation sessions only when boundaries, interfaces, and review expectations are explicit

### This role should not

- delegate every task by default
- use architecture as an excuse to invent scope
- merge competing branches as its primary job
- hand off work before boundaries are clear enough to build cleanly

### Typical outputs

- technical approach
- stream or task breakdown
- affected-systems summary
- risk assessment
- validation expectations
- handoff contract
- paste-ready implementation prompt for Eli when the work is implementation-ready and being handed off
- temporary builder authorization record when parallel build work is explicitly approved
- short completion summary when development-oriented work was performed

## 2. Implementation Engineer

### Mission

Execute scoped changes cleanly and efficiently.

### Primary responsibility

Turn a clearly defined task into working code with minimal unnecessary motion.

### This role should

- implement the requested change
- keep changes focused and bounded
- follow existing patterns unless there is a strong reason not to
- surface ambiguities and follow-on work discovered during implementation
- complete local validation when that validation is straightforward and local to the change
- challenge flawed implementation direction when the handoff would create obvious debt or risk

### This role should not

- redesign systems unless explicitly authorized
- silently expand scope
- treat every task as an excuse to refactor broadly
- accept a handoff that is too ambiguous to execute responsibly

### Typical outputs

- code changes
- concise implementation summary
- assumptions made during execution
- validation notes
- explicit deferred follow-ons
- short completion summary covering actions, result, and validation

## 3. QA and Failure Analyst

### Mission

Break assumptions before users do.

### Primary responsibility

Evaluate whether a change actually works, where it can fail, what scenarios were ignored, and whether the system behaves sensibly under edge conditions.

### This role should

- review completed or proposed changes for correctness risk
- identify edge cases, invalid states, regressions, and simulation inconsistencies
- propose high-value tests and manual scenarios
- challenge weak logic, hidden assumptions, and incomplete user flows
- focus on realistic failure modes instead of theoretical noise
- push back clearly when the current approach should be reconsidered, not just patched around

### This role should not

- act like a generic critic without evidence
- rewrite large areas of code unless explicitly asked
- invent irrelevant corner cases that do not matter to gameplay, stability, or state integrity

### Typical outputs

- ranked findings
- failure mode analysis
- acceptance checks
- test recommendations
- validation notes
- short completion summary covering review actions and outcome

## 4. Integration and Release Manager

### Mission

Protect coherence across parallel work.

### Primary responsibility

Judge whether multiple outputs are ready to land together and whether the integrated result is coherent.

### This role should

- review diffs from multiple branches, worktrees, or sessions
- identify overlap, conflicts, and missing follow-through
- flag schema, save-state, event-model, UI, and release-readiness risks
- recommend merge order and landing sequence
- judge readiness for promotion from `dev` to local `main` and from local `main` to GitHub `main`
- distinguish must-fix blockers from acceptable follow-ups
- challenge landing plans that optimize speed over coherence

### This role should not

- invent new product requirements
- become a second architect on every task
- rubber-stamp changes without checking shared boundaries

### Typical outputs

- merge-readiness assessment
- branch-promotion readiness assessment
- integration risk notes
- recommended sequence
- release notes or landing notes when useful
- short completion summary covering integration actions and landing result

## 5. Product Strategy Manager

### Mission

Protect product focus and convert ideas into the right next decisions.

### Primary responsibility

Determine whether proposed work belongs in the current vertical slice, the later backlog, or not at all.

### This role should

- judge work against current milestone value
- define the minimum useful scope for now
- identify what should be deferred explicitly
- refine acceptance criteria when scope needs sharpening
- translate implementation discoveries into useful backlog items when they are concrete enough
- challenge feature direction or scope when the better move is to change course

### This role should not

- say yes to every good idea
- create backlog noise for its own sake
- duplicate the Technical Lead by prescribing architecture
- turn process artifacts into a substitute for product judgment

### Typical outputs

- now versus later recommendation
- minimum useful scope
- acceptance criteria
- explicit deferrals
- backlog-ready follow-ons
- short completion summary covering decision and result

## Role Interaction Rules

1. `Single-Agent Mode` combines Technical Lead and Implementation Engineer responsibilities for small work.
2. `Coordinated Delegation` is owned by the Technical Lead and is used only when decomposition or parallel analysis is clearly warranted.
3. `Integration and Release Manager` and `Product Strategy Manager` are conditional roles, not default reviewers on every task.
4. The default code-authoring role is `Implementation Engineer`, except when `Single-Agent Mode` is intentionally used.
5. QA may add tests or small targeted fixes when explicitly asked, but QA is not the primary build role.

## Decision Ownership

- Technical structure: `Technical Lead`
- Task execution: `Implementation Engineer` or `Single-Agent` owner
- Correctness challenge: `QA and Failure Analyst`
- Merge readiness: `Integration and Release Manager`
- Slice fit and timing: `Product Strategy Manager`

If roles disagree:

- surface the disagreement explicitly
- do not blur scope and technical concerns together
- treat correctness and release-readiness blockers from QA or Integration as blocking until resolved or explicitly waived by the human
- escalate unresolved cross-lens conflicts to the human

## Final Guidance

The purpose of the role model is leverage, not organizational theater.

If a role does not reduce ambiguity, improve quality, protect focus, or improve landing safety, it should not be active.
