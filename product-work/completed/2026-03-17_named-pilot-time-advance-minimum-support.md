# Named Pilot Availability: Minimum Time-Advance Support

## Purpose

This brief defines the minimum time-advance and dispatch support FlightLine needs before named pilots can exist safely.

It is a design-boundary brief for future Mara framing.
It is not implementation authorization on its own.

Related upstream artifacts:

- [2026-03-17_dispatch-workspace-revitalization.md](/Z:/projects/FlightLine/product-work/completed/2026-03-17_dispatch-workspace-revitalization.md)

## 1. Main Conclusion

FlightLine does not need full crew-duty simulation before named pilots can work.

The first named-pilot pass only needs five player-visible availability states:

- `Ready`
- `Reserved`
- `Flying`
- `Resting`
- `Training`

That is the minimum useful set.

Everything else should stay out:

- `Traveling`
- `Standby`
- `Off duty`
- `Sick`
- `Leave`
- hotel or crew-room detail
- manual weekly roster planning

The product goal is simple:

- named pilots feel operationally real
- dispatch legality remains truthful
- time advance can explain blocked departures cleanly
- capability summaries remain readable at the qualification-family level

## 2. Recommended Minimum Useful Scope

The first named-pilot time-advance layer should include only:

- named pilots as the only individualized labor role
- qualification-family fit, not per-airframe certification sprawl
- dispatch-owned pilot reservation for committed schedules
- time-advanced transitions for `Flying`, `Resting`, and `Training`
- `Reserved` as a derived commitment state, not a deeper life-sim state
- hard blockers and warnings when a committed leg cannot legally use a pilot
- readiness rollups by qualification family and aircraft need
- clear "reason and fix" explanations wherever pilot state blocks operations

Preferred first-pass behavior:

- Dispatch auto-assigns named pilots by default
- manual pilot pairing or explicit per-leg crew building is deferred
- pilot location may exist as display context, but not as first-pass legality unless a real travel state is added later

This layer should not try to simulate human life.
It should only simulate the minimum timing logic needed to make named pilots operationally meaningful.

## 3. Explicit Non-Goals

The first named-pilot pass should explicitly exclude:

- manual weekly roster planning
- morale, personality, loyalty, or labor-relations systems
- hidden fatigue scores
- captain versus first-officer hierarchy logic
- detailed commuting, deadhead, hotel, or transfer travel simulation
- medical leave, vacation, sickness, or discipline events
- recurrent license-expiry systems
- pilot bidding, shift swaps, or roster preference tools
- named mechanics, named flight attendants, or named ops support
- a second full scheduling app inside the calendar

If a rule cannot be explained clearly in Dispatch or Staffing, it should not exist in this first pass.

## 4. Required Player-Visible States

### `Ready`

Meaning:

- this pilot can legally be reserved for qualifying work now

Design rule:

- `Ready` should be derived, not event-heavy
- if the UI says `Ready`, dispatch must be able to use that pilot legally

### `Reserved`

Meaning:

- this pilot is already committed to a future schedule window and should not be double-booked

Design rule:

- `Reserved` should be derived from committed assignment windows
- Dispatch creates it at commit time
- time advance clears it naturally as the reserved window is consumed or expires
- do not turn this into a richer roster-management state

### `Flying`

Meaning:

- this pilot is currently operating a leg and is unavailable for any other use

Design rule:

- entered on departure
- exited on arrival
- next state is either `Resting` or `Ready` based on the visible first-pass rest rule

### `Resting`

Meaning:

- this pilot is unavailable because they must complete a recovery window before flying again

Design rule:

- use one simple first-pass rest rule that the player can understand
- do not add hidden fatigue math or layered duty accounting
- the player should always see the next usable time

### `Training`

Meaning:

- this pilot is unavailable because they are in a training window

Design rule:

- training should use a visible start and completion time
- completion returns the pilot to `Ready`
- do not treat the first pass as a general-purpose training scheduler

## 5. Required Time-Advance Support

The first pass does not need a large new event taxonomy.

It does need one clear Dispatch-to-clock handoff plus these minimum time-based behaviors.

### Dispatch handoff: reservation creation at commit

Reservation creation is not itself a time-advance event.

It happens when a schedule is committed:

- Dispatch reserves the required named pilot or pilot set for the planned window
- those pilots show as `Reserved`
- other dispatch flows cannot use them in overlapping windows

Time advance must then honor, consume, and clear those reserved windows correctly.

### 1. Pre-departure legality check

At leg departure time:

- the system confirms the required named pilot coverage is still legal
- if legal, `Reserved` becomes `Flying`
- if not legal, the leg does not depart

This is the most important safety gate in the first pass.

### 2. Arrival transition

At leg arrival:

- the pilot leaves `Flying`
- the system evaluates the first-pass rest rule
- the pilot becomes either `Resting` or `Ready`

### 3. Rest completion

When the visible rest window ends:

- `Resting` becomes `Ready`

### 4. Training start and completion

When training is active:

- the pilot is unavailable for that visible training window
- `Training` ends automatically at a known time
- the pilot returns to `Ready`

### 5. Blocked pre-departure resolution

If a committed leg reaches departure time without legal named pilot coverage:

- the leg must not launch
- the aircraft schedule must enter a blocked condition
- the game must emit a critical player-facing explanation
- time advance must honor the configured stop-condition behavior

## 6. Required Dispatch Ownership

Dispatch should own the first real use of named pilot availability.

Dispatch must know:

- which qualification family the aircraft requires
- how many pilot slots the aircraft needs
- which named pilots are `Ready`
- which named pilots are `Reserved`
- which named pilots are `Resting` or `Training`
- when each unavailable pilot becomes usable again

Dispatch must show:

- which pilot or pilot set is covering the selected aircraft plan
- whether the schedule uses the last ready qualified reserve
- whether any leg will fail because a pilot will still be resting or training
- what the player can do next when pilot state blocks the plan

Dispatch should own first:

- reservation and legality checking
- blocker and warning messaging
- selected-aircraft pilot readiness summary
- "who is covering this aircraft?" context

Dispatch should defer:

- manual pair-building workflows
- advanced crew rotation planning
- route-wide crew balancing across multiple aircraft
- visual shift editing

## 7. Explainability Rules

Named pilot availability is only acceptable if the player can always answer:

- why is this pilot unavailable?
- until when?
- for which qualification family are they useful?
- what action would make this schedule legal?

Required explainability rules:

### 1. One visible blocker reason

Every unavailable pilot should show one clear primary reason:

- `Reserved for FL-204 until 14:20`
- `Resting until 22:00`
- `Training until Mar 19 09:00`

Do not surface hidden counters instead.

### 2. Show next usable time

If a pilot is not `Ready`, the next usable time should be visible directly.

### 3. Keep the legal rule simple

The player should not need to reverse-engineer fatigue math.

The first pass should use one visible duty or rest rule and name it consistently in Dispatch and Staffing.

### 4. Keep readiness summaries aggregated

Named pilot detail should still roll up into qualification-family summaries such as:

- `Single turboprop utility: 2 ready | 1 reserved | 0 training`
- `Twin turboprop commuter: 1 ready | tight`

This preserves the clarity of the current capability model.

### 5. No silent UI/state disagreement

If the UI says a pilot is `Ready`, Dispatch must be able to use that pilot legally.
If Dispatch cannot use them, the UI state is wrong.

## 8. Mara Framing Gate

This brief is ready to hand back to Mara only if future framing preserves these boundaries:

### Scope clarity

- only pilots are individualized
- only five player-visible states exist in the first pass
- only `Flying`, `Resting`, and `Training` require real time-advanced transitions
- `Reserved` stays primarily a Dispatch-owned commitment state
- location and home base may be informational, but do not create first-pass legality unless travel simulation is explicitly opened later

### Product clarity

- the player can see exactly why a named pilot is or is not usable
- pilot-level state rolls up into qualification-family readiness summaries
- Dispatch owns legality and commitment checks
- the shell clock and calendar remain supporting tools, not the main dispatch surface

### Safety clarity

- a committed leg cannot silently depart without legal pilot coverage
- a blocked departure produces a critical stop-worthy explanation
- no hidden rule can invalidate a pilot who appears `Ready`

### Deferral clarity

- manual roster planning is out
- richer travel and relocation timing is out
- non-pilot named labor is out
- advanced crew optimization is out

## 8A. Mara Handoff Notes

This brief should inform Mara's framing as a named-pilot dependency slice, not as a standalone staffing rewrite.

Affected systems and surfaces first:

- Dispatch legality, reservation, and blocked-leg handling
- Staffing availability display and pilot-state explainability
- time-advance stop behavior for blocked committed legs
- readiness summaries shown in Dispatch first, with lighter rollups in Aircraft and Contracts later

Required validation in future framing:

- a pilot shown as `Ready` is always legally dispatchable
- a committed leg with invalid pilot coverage does not depart silently
- blocked departure explanation and stop-condition behavior are player-visible and consistent
- qualification-family rollups match underlying pilot availability state

Escalation triggers Mara should treat as red flags:

- any proposal that introduces hidden fatigue math or opaque legality rules
- any proposal that makes pilot location or home base a first-pass legal blocker without opening travel simulation explicitly
- any proposal that requires manual roster planning or explicit pair-building to make the first pass usable
- any UI/state mismatch where Staffing says a pilot is usable and Dispatch rejects them

## 9. Deferred Backlog

These are reasonable later additions, but they should stay out of the first named-pilot time-advance pass:

- `Traveling` or `In transit` as a true time-advanced pilot state
- explicit relocation and transport timing
- manual `Rest now` controls
- standby or on-call state
- captain or first-officer distinctions
- reserve-pool planning tools
- recurrent certification expiry
- leave, sickness, and absenteeism
- hotel, crew-room, and layover detail
- roster preference or bidding systems
- offline progression concerns tied to named pilot schedules

## 10. Open Questions That Actually Matter

### 1. How simple should the first rest rule be?

This determines whether the system stays explainable.
The wrong answer is a hidden fatigue model.

### 2. Should the brief lock Dispatch auto-assignment as the first-pass default?

The recommended answer is yes.

This should only be reopened if later evidence shows auto-assignment makes pilot legality or availability harder to understand than explicit selection would.

### 3. For multi-pilot aircraft, does the first pass need explicit pilot pairing or only legal count-based assignment of named pilots?

This matters because pairing logic can expand scope quickly.

### 4. Should training start immediately when ordered, or can it be scheduled to begin later?

This matters because it changes how much planning complexity enters Staffing.

### 5. If home base and pilot location exist in the first named-pilot pass, can location stay informational at first?

The recommended first-pass answer is yes.
If location becomes legal gating immediately, it will likely force a `Traveling` state and adjacent scope.

### 6. Where should pilot readiness rollups appear first?

The preferred first-pass answer is:

- detailed pilot state in Staffing and Dispatch
- rolled-up readiness flags in Aircraft and Contracts
