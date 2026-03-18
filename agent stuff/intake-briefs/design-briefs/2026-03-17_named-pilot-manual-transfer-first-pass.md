# Named Pilot Manual Transfer First Pass

## Main Conclusion

The next travel-adjacent slice should be a minimal player-ordered transfer or home-return action for ready pilots.

It should reuse the existing travel window model instead of opening a broader itinerary or relocation planner.

## Operating Mode

`Single-Agent Mode`

This is a bounded follow-on to the travel slice. It touches command handling, staffing UI, and legality truth, but it should not require new persistence shape.

## Objective

Let the player order a ready named pilot to reposition to home base or another current fleet airport before a schedule needs them there.

## In Scope

- add a manual named-pilot transfer command
- allow transfer destinations only to home base and current fleet airports
- show the transfer action from the Staff tab for ready active pilots
- reuse the existing `Traveling` state and travel completion rules
- let manual transfer affect draft preview and commit-time legality through the existing travel-aware selection model

## Explicit Non-Goals

- no general transfer planner
- no future transfer queue
- no travel costs, hotels, or disruptions
- no aircraft-linked multi-stop itinerary building
- no non-pilot transfer orders
- no manual assignment planner

## Explainability Rules

- a transfer starts immediately when ordered
- the player can see where the pilot is going and until when
- transfer destinations stay visibly bounded to home base and current fleet airports
- Dispatch must treat a manually traveling pilot the same way it treats a schedule-triggered traveling pilot

## Validation Bar

- ready pilots can start a manual transfer to an allowed destination
- invalid destinations are rejected cleanly
- a manually traveling pilot shows `Traveling` until arrival, then returns to `Ready`
- Staffing and Dispatch remain consistent because both read the same travel state

## Deferred Work

- free-form airport transfer orders
- transfer cost modeling
- automatic home-return policies
- richer base-management rules
- itinerary chaining across multiple future schedule commitments
