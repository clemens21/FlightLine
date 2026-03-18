# Named Pilot Assignment Visibility

## Main Conclusion

The next named-pilot increment should be assignment visibility and readiness explainability, not training, travel, or manual crew control.

The current backend can already:

- create named pilots from pilot staffing packages
- reserve named pilots at schedule commit
- move named pilots through `reserved`, `flying`, and `resting`

What the player still cannot answer cleanly is:

- who is covering this aircraft?
- how tight is this qualification group right now?
- did this committed plan consume the last ready reserve?

That is the right next slice.

## Operating Mode

`Single-Agent Mode`

This increment is still small enough to keep with one owner because it should stay inside read-model and UI explainability work.

## Objective

Expose assigned named pilots and pilot-readiness pressure in Dispatch and Staffing without adding new simulation rules.

## In Scope

- show assigned named pilots for committed schedules in Dispatch
- show current pilot-readiness posture for the selected aircraft qualification group
- surface simple reserve-pressure messaging such as whether no ready reserve remains
- improve Staffing roster context so assigned pilots reference player-facing aircraft labels instead of raw ids where possible
- keep draft messaging truthful by saying named pilots are selected on commit rather than pretending draft-specific named assignments already exist

## Explicit Non-Goals

- no training flows
- no travel or transfer timing
- no manual named-pilot assignment
- no captain or first-officer modeling
- no new availability states
- no schema changes
- no new dispatch legality rules

## Explainability Rules

- Dispatch may show specific pilot names only when the backend has already reserved them for a committed schedule
- Draft schedules may show readiness posture, but not fake named assignments
- Current reserve messaging must reflect present availability, not speculate about later training or travel systems
- Staffing and Dispatch must not disagree about whether a pilot is assigned, resting, or ready now

## Validation Bar

- Dispatch selected-aircraft view shows assigned named pilots for committed schedules
- Dispatch selected-aircraft view shows qualification-group readiness counts without inventing new legality
- Staffing roster context uses player-facing aircraft labels when a pilot is assigned
- existing named-pilot, dispatch, and shell regressions continue to pass

## Deferred Work

- training windows as a player workflow
- travel and relocation legality
- manual crew selection
- deeper crew pairing
- non-pilot named staffing
