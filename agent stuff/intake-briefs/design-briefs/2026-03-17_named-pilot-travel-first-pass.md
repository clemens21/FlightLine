# Named Pilot Travel First Pass

## Main Conclusion

The first travel slice should be a real `Traveling` state that exists only where Dispatch and time advance need it.

It should not become a general transfer planner.

## Operating Mode

`Single-Agent Mode`

This remains a bounded dependency slice, but it touches save schema, time advance, dispatch legality, and UI/state truth.

## Objective

Make named-pilot location operationally real by adding Dispatch-owned travel windows for pilots who must reposition before a committed schedule can begin.

## In Scope

- add a `Traveling` named-pilot availability state
- let named-pilot legality preview and commit-time selection consider pilot location
- allow commit-time auto-travel only when the pilot can arrive before the assigned schedule window starts
- show travel destination and arrival time in Staffing and Dispatch
- let time advance complete travel automatically and update the pilot location
- resolve due pilot-state transitions before departure batches so travel and training can become legal inside the same advance run

## Explicit Non-Goals

- no free-form manual transfer planner
- no travel costs, hotels, or ticketing
- no multi-hop route generation
- no non-pilot travel
- no commuting simulation or home-base rules beyond current location truth
- no detailed crew pairing or layover systems

## Explainability Rules

- if a pilot is traveling, the player can see where they are going and until when
- Dispatch must not treat an off-airport pilot as ready for a schedule unless they can actually arrive in time
- if a schedule is blocked because no pilot can reach the first-leg origin, the blocker should say so directly
- travel should remain schedule-supporting, not its own planning game

## Validation Bar

- a ready pilot at the wrong airport can only cover a draft or commit if travel can finish before the required start time
- a committed pilot who must reposition shows `Traveling` until arrival, then becomes `Reserved` or `Ready` as appropriate
- time advance resolves completed travel before any later departure due at or after the travel completion time
- Staffing and Dispatch stay consistent about pilot location and travel state

## Deferred Work

- manual player-directed transfer orders
- travel costs and compensation
- home-return actions
- travel disruption and missed-connection logic
- richer location rules for training, rest, or hotels
