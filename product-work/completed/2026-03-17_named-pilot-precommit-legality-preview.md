# Named Pilot Pre-Commit Legality Preview

## Main Conclusion

The next named-pilot increment should make draft validation aware of named-pilot availability before commit.

Right now the system can still produce this bad experience:

- draft looks committable on pooled staffing
- commit fails because no specific named pilot is legally available

That is a UI-versus-state truth gap.
It should be closed before manual assignment, training, or travel enter scope.

## Operating Mode

`Single-Agent Mode`

This is still a bounded validation and explainability slice, not a new simulation layer.

## Objective

Make Dispatch and draft validation truthful about current named-pilot legality without exposing fake draft-time named assignments.

## In Scope

- extend draft validation to preview current named-pilot availability for required qualification groups
- surface blocker messages when a draft cannot be committed because no legal named pilot is currently available
- surface warning messages when a draft would consume the last ready named pilot reserve
- preserve commit-time revalidation and actual pilot assignment selection

## Explicit Non-Goals

- no manual named-pilot assignment
- no training windows
- no travel or relocation legality
- no new availability states
- no schema changes
- no promise that a draft stays legal if time advances later

## Explainability Rules

- drafts may show named-pilot legality pressure, but not specific reserved pilot names
- blocker and warning messages should read as current-state legality, not hidden simulation
- commit must still re-check legality because time may have advanced since the draft was saved

## Validation Bar

- a draft with insufficient currently available named pilots is blocked before commit
- a draft that uses the last ready named pilot shows a warning before commit
- existing commit-time selection and assignment behavior still works

## Deferred Work

- manual pilot choice
- future-time pilot forecasting
- training-driven qualification changes
- travel-driven legality
