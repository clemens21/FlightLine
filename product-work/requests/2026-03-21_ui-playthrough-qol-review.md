# UI Playthrough QoL Review

## Main Conclusion

The year-long UI playthrough reaching March 2027 points to a small set of high-value QoL follow-ups, not a broad strategy rewrite.

The best next additions are the ones that reduce tab-hopping, make tradeoffs easier to read, and keep the player confident about what happens next. In practice, that means improving decision surfaces around staffing, aircraft buying, contract planning, and dispatch readiness.

## Scope

This note is separate from confirmed bugs.

Issues found in the playthrough, including `#45` and `#46`, should stay in bug tracking and not be folded into this QoL list.

Recent work already moved in the right direction:

- staffing hire UX
- aircraft market overlay
- contracts and route-planning split
- dispatch improvements

This review captures the remaining player-facing QoL additions that look worth considering next.

## Prioritized QoL Candidates

1. **Add clearer staffing decision summaries**
   - Highest-value follow-up.
   - The playthrough suggests staffing choices still need a more legible answer to "what is missing, what it costs, and what it unlocks."
   - A compact summary at the point of hire would cut busywork and make coverage tradeoffs easier to understand.

2. **Improve the aircraft market comparison surface**
   - A stronger comparison overlay would help the player judge age, cost, readiness, and fit without bouncing between screens.
   - This is a good QoL target because it improves explainability without changing the underlying economics.

3. **Tighten the contract-to-route-planning handoff**
   - The split is directionally good, but the player still benefits from a clearer bridge between "selected contract" and "ready to plan."
   - A short handoff summary or decision digest would reduce context loss and keep planning focused.

4. **Make dispatch readiness read more like a pre-commit checklist**
   - Dispatch improvements should continue emphasizing blockers, consequences, and expected outcome before commit.
   - This fits the vertical slice well because it increases clarity without adding more system depth.

5. **Make cash pressure and recurring obligations harder to miss**
   - The playthrough reached a stressed cash state, but the player would benefit from stronger forward-looking visibility into lease and staffing obligations before the next collection hit.
   - This is a good QoL addition because it helps the player understand timing risk without changing the underlying economy.

6. **Improve contract-board affordances around current aircraft position**
   - The board would be easier to work if it more clearly surfaced opportunities that match where the current fleet already is.
   - That reduces scanning busywork and helps the player form a route or ferry decision faster.

7. **Warn harder when accepted work is approaching or passing risk thresholds**
   - The UI should make at-risk accepted work feel urgent before it becomes missed or stale.
   - This should stay focused on clearer signaling rather than adding new penalty systems.

## Highest-Value After The Playthrough

If only two QoL items should be framed next, they are:

- staffing decision summaries
- contract-to-route-planning handoff clarity

Those two showed the clearest value against the vertical-slice goals of clarity, explainability, low busywork, and meaningful tradeoffs.

## Additional Playthrough Signals

Nadia's closed playthrough pass also surfaced these recurring friction points:

- stronger dashboard visibility for cash and upcoming recurring obligations
- clearer separation between active route planning and archived or completed planner history
- better contract-board affordances for work from current aircraft locations
- stronger UI signaling for overdue or at-risk accepted work before deadlines pass

## Explicit Non-Goals

- do not turn this into bug triage
- do not widen into a strategy rewrite
- do not add new simulation depth just because a surface feels busy
- do not replace the existing playthrough findings archive
