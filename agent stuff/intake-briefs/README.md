# FlightLine Intake Briefs

## Purpose

This folder is the working home for on-disk intake artifacts read by Mara Sterling and other FlightLine agent sessions.

Use the subfolders to separate raw intake from framed execution handoffs and derivative design briefs.

## Folder Structure

- `incoming/`: default drop location for filled task intake briefs
- `framed/`: Mara-created framed-delivery handoffs and other execution-ready routing artifacts
- `design-briefs/`: derivative product or design briefs created from an intake
- `_templates/`: blank starters and similar scaffolding files

## Recommended Use

- Duplicate `_templates/_starter_task_intake_brief.md` when you want a blank starting file.
- Base each new intake on `../supporting/flightline_task_intake_brief.md`.
- If you want a model, use `../supporting/flightline_task_intake_brief_example.md`.
- Save completed new intake briefs in `incoming/`.
- Save Mara-authored execution handoffs in `framed/`.
- Save derivative product or design artifacts in `design-briefs/`.
- Keep each file focused on one task or one intended workstream.
- Mark unknowns directly instead of padding the file with guesswork.

## Naming Convention

Use a filename like:

`YYYY-MM-DD_short-task-title.md`

Example:

`2026-03-17_maintenance-reload-state-mismatch.md`

This keeps briefs sortable and easy to reference later.

## What Mara Should Expect To Find In `incoming/`

A good intake brief should usually contain:

- request title
- request type
- objective
- why it belongs now
- desired result
- evidence or symptoms
- suspected affected systems
- constraints
- no-touch areas
- red-flag areas
- urgency or sequencing pressure
- related workstreams
- open questions
- preferred bias

## Final Guidance

Keep the structure light.

If one of these subfolders starts accumulating stale material, add a light archive convention inside that lane instead of flattening everything back into one directory or adding deeper nesting everywhere.
