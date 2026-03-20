# Named Pilot Training First Pass

## Main Conclusion

The first pilot-training slice should be a real unavailable state with a visible start and end time.

It should not try to deliver qualification progression, travel, or a full training planner yet.

## Operating Mode

`Single-Agent Mode`

This is still a bounded dependency slice, but it touches save schema, time advance, validation, and staffing UI, so it needs a stronger validation bar.

## Objective

Add immediate-start pilot training as a player-triggered staffing action that makes a named pilot unavailable until a visible completion time.

## In Scope

- add a `Training` named-pilot availability state
- allow the player to start one fixed recurrent-training window from the Staff tab
- show training start and completion time in Staffing and Dispatch readiness posture
- make training block dispatch legality and named-pilot selection while active
- let time advance clear training automatically once the completion time passes

## Explicit Non-Goals

- no qualification changes
- no training queue or calendar planner
- no travel to a training location
- no player scheduling for future training start
- no training cancellation
- no non-pilot training

## Explainability Rules

- training starts immediately when ordered
- the player can always see why the pilot is unavailable and until when
- Dispatch must not present a training pilot as ready or reservable
- if training causes a draft or commit blocker, the blocker should say so directly

## Validation Bar

- ordering training changes a ready pilot to `Training`
- trained pilots are excluded from named-pilot legality preview and commit-time selection
- time advance returns the pilot to `Ready` after the training window ends
- Staffing and Dispatch stay consistent about training state

## Deferred Work

- qualification upgrades
- proficiency systems
- future-start training orders
- training travel and home-base effects
- travel as a legal state
