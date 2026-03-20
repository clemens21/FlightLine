# FlightLine Capability Notify Workflow

## Purpose

This workflow makes capability dossiers predictable enough for notify-style automation and low-friction human routing.

The automation goal is not to self-start implementation.
The automation goal is to tell the human what the next handoff should be and provide the next prompt when possible.

In a live session, if the human explicitly authorizes automatic handoff, Mara may directly route the next step to Eli, Nadia, or Owen instead of stopping at prompt-drafting.
That rule does not extend to unattended recurring automation.

## Required Capability Status Block

Active capability dossiers should keep this status block near the top of the file:

- `Status:`
- `Workflow state:`
- `Current owner:`
- `Current active slice:`
- `Next routing target:`
- `Last updated:`

Keep the values short and operational.

## Workflow States

Use these states by default:

- `draft`
  - capability is still being shaped
  - normal owner: you, Zoe, or Mara

- `ready_for_eli`
  - the next slice is approved and ready for implementation
  - normal owner: Eli

- `eli_in_progress`
  - Eli is actively implementing the current slice
  - normal owner: Eli

- `ready_for_mara_review`
  - Eli finished a pass and Mara should review before QA routing
  - normal owner: Mara

- `needs_eli_fix`
  - Mara or Nadia found a bounded issue and the slice should go back to Eli
  - normal owner: Eli

- `ready_for_nadia`
  - Mara has cleared the slice for QA review
  - normal owner: Nadia

- `ready_for_mara_post_qa_review`
  - Nadia finished and Mara should classify the result
  - normal owner: Mara

- `ready_for_owen`
  - Mara has cleared the slice for integration and landing
  - normal owner: Owen

- `landed_slice`
  - the current slice is integrated
  - normal owner: Mara for next-slice activation or capability closeout

- `completed_capability`
  - the capability has no active slices left and can move to `product-work/completed/`
  - normal owner: Mara

## Default State Transitions

Use this path by default:

1. Mara approves a slice and sets `ready_for_eli`.
2. Eli starts work and sets `eli_in_progress`.
3. Eli finishes and sets `ready_for_mara_review`.
4. Mara reviews and sets either:
   - `needs_eli_fix`
   - `ready_for_nadia`
5. Nadia reviews and sets either:
   - `needs_eli_fix`
   - `ready_for_mara_post_qa_review`
6. Mara classifies Nadia's result and sets either:
   - `needs_eli_fix`
   - `ready_for_owen`
7. Owen lands the slice and sets `landed_slice`.
8. Mara either:
   - activates the next slice and sets `ready_for_eli`
   - or closes the dossier as `completed_capability`

## Notify Automation Contract

A notify automation should:

- scan `product-work/capabilities/`
- read the status block from active dossiers
- identify the next routing action
- provide the next paste-ready prompt when the next step is Eli, Nadia, or Owen
- flag dossiers that are missing required status fields
- avoid self-starting implementation

The automation should not decide product scope.
It should route based on the dossier's current workflow state.

## Human Rules

- Do not skip state updates if you want the notify workflow to stay useful.
- Keep the capability dossier as the single source of truth.
- Do not open a second active artifact just to track handoff state.
- If the real next step is ambiguous, update the dossier first before relying on automation.
