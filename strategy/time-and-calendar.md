# Time And Calendar

## Purpose

Define how FlightLine should present time to the player and how upcoming operational milestones should be surfaced in a clean calendar view.

This is a player-facing design doc, not a backend schema doc.

## Design Goals

- Make the simulation feel alive without forcing constant manual time advancement.
- Keep time control visible, simple, and reversible.
- Surface upcoming deadlines and departures in one place.
- Treat the calendar as an informational operations tool, not a second planning app.
- Leave room for more event types later without redesigning the UI.

## Recommended Time Model

FlightLine should support a live simulation clock while a save is open.

Recommended first-pass behavior:

- the sim clock is minute-based; seconds are not important to the player
- `1x` is real time at the minute level
- the player can switch to `Pause`, `1x`, `4x`, `10x`, or `60x` from the clock control
- critical interruptions can auto-pause the simulation if the system is configured to do so
- when the save is closed, simulation time should stop in v1

That last point is an intentional recommendation. It keeps the first implementation fair, debuggable, and local-first. Offline progression can be added later as a separate design decision.

## Why Real Time Works Here

A management sim benefits from a sense of ongoing movement.

Real-time progression while the save is open helps because:

- accepted work feels urgent
- the player can watch the network evolve
- fast-forward becomes meaningful instead of mandatory
- the clock becomes a core part of the operating fantasy

At the same time, FlightLine should not assume the player always wants pressure. `Pause` must be first-class.

## Clock Control

The clock should become a clickable top-bar control rather than a passive label.

When closed, it should show:

- current company-local date and time
- current time-rate badge such as `Pause`, `1x`, `4x`, `10x`, or `60x`
- a subtle alert indicator if something time-critical is coming up

When opened, it should show a compact popover or sheet with three sections:

1. Current Time
- local display time for the home base or current selected reference airport
- UTC as a secondary reference
- current simulation rate

2. Time Controls
- `Pause`
- `1x`
- `4x`
- `10x`
- `60x`
- optional later: `Advance to next event`

3. Calendar And Agenda
- simple calendar grid
- short agenda list for the selected day or upcoming range
- event markers grouped by type or severity
- day-click popup actions for the selected morning

## Time-Control Behavior

### Pause

`Pause` should freeze automatic time movement but still let the player browse and plan.

### 1x

`1x` should be the default operating mode.

This is the baseline "live operations" mode.

### 4x, 10x, And 60x

These modes should accelerate the same simulation, not switch to a different abstraction.

Rules:

- event ordering must remain deterministic
- deadlines, departures, and arrivals still resolve against the same canonical clock
- critical blockers can stop or auto-pause acceleration
- the player should always be able to drop back to `Pause` or `1x`

## Auto-Pause Recommendations

The system should be able to auto-pause on important events.

Recommended first-pass auto-pause triggers:

- contract failure
- aircraft blocked before departure
- maintenance AOG or grounding
- no labor coverage for a committed leg
- player-selected `stop at next event` later

Not every event needs to interrupt the player. Routine arrivals and non-critical state changes should continue silently unless the player chose a stop mode.

## Calendar Role

The calendar should be informational and navigational.

It should answer:

- what is due soon
- what is departing soon
- what is arriving soon
- what important company milestone is next

It should not try to replace Dispatch, Contracts, or Fleet.

## Calendar Presentation

Recommended first pass:

- a compact month grid at the top of the popover or clock sheet
- small event indicators on each day cell
- a focused agenda list below for the selected day
- an alternate quick list such as `Next 7 Days` or `Upcoming` if space is tight
- clicking a day should put that day in focus and expose time shortcuts for that day

The calendar should feel sleek and low-noise.

It should not look like enterprise scheduling software.

## Calendar Day Actions

The calendar should support a small set of direct time shortcuts tied to the selected day.

Recommended first pass:

- clicking a day selects it, updates the agenda, and opens a small popup
- the popup should contain the morning simulate action for that selected day
- the action should stay hidden or disabled when the selected morning is already in the past
- if the jump would pass important milestones, the popup should warn the player before they commit

The implementation can still use a `6:00 AM` anchor internally, but the player does not need to see that internal language everywhere in the UI.

This should feel like a lightweight operations shortcut, not a freeform time editor.

The anchor time should resolve in the company-local timezone used by the clock display, then convert back to canonical simulation time internally.

## Event Types To Support First

The calendar should start with these event families:

- contract deadlines
- planned departures
- planned arrivals
- maintenance start
- maintenance completion
- staffing start or expiry
- recurring payments such as lease, loan, or staffing due dates later

Later event families can include:

- aircraft deliveries
- base openings
- reputation milestones
- insurance renewals
- audits or scenario-specific events

## Event Priority And Visual Tone

Not all events should look equally loud.

Suggested calendar tones:

- `critical`: failures, blocked operations, hard deadlines today
- `warning`: due soon, maintenance due soon, labor expiry soon
- `normal`: planned departures, arrivals, recurring payments
- `opportunity`: aircraft delivery, contract window refreshes later

The calendar should use the same alert language as the broader product.

## Relationship To Contracts And Dispatch

The contracts tab remains the market and planning surface.

The calendar's job is different:

- show when accepted work is due
- show when planned legs are meant to depart or arrive
- reveal timing conflicts and clustering
- let the player navigate to the relevant part of the app

That means the calendar should eventually support jump actions such as:

- open contract in `Contracts`
- open aircraft schedule in `Dispatch`
- open maintenance task in `Aircraft`

## Relationship To The Existing Simulation Model

The calendar should not invent new canonical timing rules.

It should be a presentation of already-authoritative facts coming from:

- `GameClock`
- `ScheduledEvent`
- `CompanyContract`
- `AircraftSchedule`
- `MaintenanceTask`
- `RecurringObligation`
- later milestone sources

## UI Constraints

The clock and calendar surface should:

- open quickly
- never feel like a full-screen workflow by default
- support both light and dark mode cleanly
- stay readable at a glance
- remain useful even when the player has only one aircraft
- scale to many future event types without becoming a wall of text

## Recommended V1 Scope

V1 should include:

- clickable clock control in the shell
- `Pause`, `1x`, `4x`, `10x`, `60x`
- live time progression while a save is open
- a simple calendar grid with markers
- agenda list with due, departure, arrival, and maintenance items
- selected-day popup with the morning simulate action when valid
- warning state when simulating would pass milestones
- click-through navigation hooks later if not built immediately

V1 should not include:

- drag-and-drop planning on the calendar
- editable calendar events
- offline progression while the save is closed
- multi-calendar complexity
- full Gantt or ops-board replacement behavior

## Open Questions

These are still decision points, not blockers for first implementation:

- should time continue while the app is unfocused but still open?
- should the player be able to choose which airport timezone the clock shows?
- should fast-forward offer `next event` and `next departure` shortcuts in v1 or later?
- should auto-pause preferences be global settings or save-specific settings?
- how much of the calendar should be visible directly in the top-bar popover versus a larger dedicated overlay?

## Recommendation Summary

The best first implementation is:

- real-time simulation while the save is open
- first-class `Pause` and fast-forward controls inside the clock button
- a simple informational calendar plus agenda in the same surface
- a generic event model underneath so future milestones can join without redesign
