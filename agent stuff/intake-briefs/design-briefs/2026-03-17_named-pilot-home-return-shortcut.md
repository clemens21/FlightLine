# Named Pilot Home Return Shortcut

## Main Conclusion

The next home-return step should stay explicit, not automatic.

FlightLine should add a first-class `Return home` action for ready off-base pilots instead of moving them automatically behind the player’s back.

## Operating Mode

`Single-Agent Mode`

This is a small UI and explainability increment on top of the manual transfer slice.

## Objective

Make the common home-return case obvious in Staffing without adding hidden pilot movement rules.

## In Scope

- add a dedicated `Return home` action for ready active pilots who are away from home base
- keep using the existing manual transfer command and travel state
- keep the broader transfer selector for other allowed destinations
- remove duplicate home-base choice from the generic transfer selector when the shortcut is shown

## Explicit Non-Goals

- no automatic home-return policy
- no scheduled or future home-return queue
- no travel-cost or duty-rule changes
- no new dispatch or time-advance logic

## Explainability Rules

- home return remains player-ordered
- the player should be able to tell that `Return home` is just a clearer transfer shortcut, not a different system
- off-base pilots should not move unless the player orders it

## Validation Bar

- ready off-base pilots show a `Return home` action
- the action starts the same `Traveling` state as manual transfer
- home-base duplication is removed from the general transfer selector when the shortcut is present

## Deferred Work

- automatic home-return policies
- company-wide transfer defaults
- travel-cost or duty modeling
