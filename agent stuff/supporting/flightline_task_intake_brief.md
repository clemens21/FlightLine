# FlightLine Task Intake Brief

## Purpose

Use this brief when handing new development work to Mara Sterling.

This is the standard front door for non-trivial FlightLine work when the artifact is a request waiting for Mara framing.

If the task is already small, clear, contained, and easy to validate, it may go directly to Eli or stay in `Single-Agent Mode`.
If that is not clearly true, start here.

## How To Use It

- Fill in what you know.
- Mark unknowns directly instead of faking precision.
- Use one brief per task or per intended workstream.
- If the work starts as a broader product capability from you and Zoe, Mara should convert that capability into bounded feature or workstream framing before Eli receives implementation work.
- For bugs that should be tracked durably, open or reference a GitHub issue first. The issue is the source of truth; this brief is for Mara framing when needed.
- Include concrete evidence when possible.
- Do not pre-decide the implementation unless the design choice itself is what needs review.
- Store raw request briefs in `product-work/requests/` if you want a persistent on-disk inbox.
- Store capability briefs from you and Zoe in `product-work/capabilities/`.
- See `flightline_task_intake_brief_example.md` for one realistic filled example.

## Intake Brief Template

- Request title:
- Request type: `bug`, `feature`, `refactor`, `investigation`, `review`, or `automation follow-up`
- Objective:
- Why this belongs now:
- Desired result:
- Current evidence, symptoms, or observations:
- Suspected affected systems, files, or user-facing surfaces:
- Known constraints:
- Explicit no-touch areas:
- Red-flag areas involved, if any:
- Deadline, urgency, or sequencing pressure:
- Related active workstreams, branches, or sessions:
- Known open questions:
- Preferred bias: `speed`, `confidence`, or `balanced`
- Optional proposed owner or role:

## Mara's Required Response

Mara should convert the intake into a decision-ready framing response.

If the intake is really a capability brief rather than a ready feature request, Mara should first reduce it into one or more bounded feature streams instead of handing the capability straight to Eli.

That response should include:

- operating mode
- change budget
- primary owner
- required supporting roles
- framed objective
- current-slice reason for doing the work now
- in-scope work
- explicit non-goals
- affected systems or files
- assumptions and open questions
- validation bar
- escalation triggers
- whether temporary builder authorization is unnecessary, possible later, or authorized now
- deferred work or backlog capture
- if coordinated delegation is recommended, the paste-ready next role prompts for the immediate downstream roles by default

If the work is implementation-ready and the primary owner is Eli, Mara should also provide a paste-ready Eli prompt by default unless the human explicitly asks her not to.
That prompt should reference `AGENTS.md` and any bounded handoff artifact instead of re-copying the full repo operating rules.
By default, Mara should also include an escalation clause telling Eli to stop and surface the blocker if the stream now needs re-framing, more role support, or further decomposition instead of widening scope himself.

If the intake is too vague for responsible routing, Mara should say what is missing and stop there.
She should not pretend unclear work is implementation-ready.

## Copy-Paste Intake Prompt

Use this when giving new work to Mara:

```text
Read and follow Z:\projects\FlightLine\AGENTS.md.

You are Mara Sterling, Technical Lead.
Use Z:\projects\FlightLine\agent stuff\supporting\flightline_task_intake_brief.md as the intake standard.

Task intake brief:
- Request title: [fill in]
- Request type: [fill in]
- Objective: [fill in]
- Why this belongs now: [fill in]
- Desired result: [fill in]
- Current evidence, symptoms, or observations: [fill in]
- Suspected affected systems, files, or user-facing surfaces: [fill in]
- Known constraints: [fill in]
- Explicit no-touch areas: [fill in]
- Red-flag areas involved, if any: [fill in]
- Deadline, urgency, or sequencing pressure: [fill in]
- Related active workstreams, branches, or sessions: [fill in]
- Known open questions: [fill in]
- Preferred bias: [fill in]
- Optional proposed owner or role: [fill in]

Return:
- operating mode
- change budget
- primary owner
- required supporting roles
- framed objective
- in-scope work
- explicit non-goals
- affected systems or files
- assumptions and open questions
- validation bar
- escalation triggers
- whether temporary builder authorization is needed
- deferred work or backlog capture
- if coordinated delegation is recommended, the paste-ready next role prompts
- if implementation-ready for Eli, a paste-ready Eli prompt

End with the required closeout template from AGENTS.md.
```

## Final Guidance

This brief exists to improve routing quality, not to create intake ceremony for trivial work.

If the brief takes longer to write than the task takes to complete, the task probably should not have come through Mara in the first place.
