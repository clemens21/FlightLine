# Calendar Event Model

## Purpose

Define the implementation-facing model for real-time clock control and the generic calendar event projection that feeds the UI.

This doc assumes the player-facing behavior in [Time And Calendar](/Z:/projects/FlightLine/strategy/time-and-calendar.md).

## Core Principle

The calendar is a projection, not a new source of truth.

Authoritative timing already lives in simulation state such as:

- `game_clock`
- `scheduled_event`
- `company_contract`
- `aircraft_schedule`
- `flight_leg`
- `maintenance_task`
- `recurring_obligation`

The implementation job is to:

- drive the clock in real time while a save is open
- project upcoming dates into a generic calendar event list
- expose those events to the UI efficiently

## Recommended Runtime Split

### 1. Authoritative Save State

This remains SQLite-backed and deterministic.

Examples:

- current sim time
- contract deadlines
- planned departures and arrivals
- scheduled maintenance
- recurring payments

### 2. Save Session Time Controller

This is a live runtime object tied to the open save session.

Suggested responsibilities:

- current rate mode: `paused`, `1x`, `4x`, `12x`
- wall-clock anchor time
- sim-time anchor time
- timer lifecycle while the save shell is open
- auto-pause behavior on critical outcomes
- dispatching bounded `AdvanceTime` calls

This controller should be runtime state, not canonical save state.

### 3. Calendar Projection

This is a read-side model built from authoritative tables.

Suggested responsibilities:

- normalize multiple source types into one event shape
- support day, week, month, and agenda views
- resolve labels, severity, and navigation targets
- stay cheap to rebuild when the save changes

## Clock Control Model

Suggested runtime type:

```ts
interface TimeControlState {
  saveId: string;
  mode: "paused" | "1x" | "4x" | "12x";
  wallClockAnchorMs: number;
  simTimeAnchorUtc: string;
  autoPauseOnCritical: boolean;
  lastTickProcessedAtMs: number;
}
```

This object should exist per open save session.

## Recommended Clock Driver

Use a small wall-clock tick loop while the save shell is open.

Suggested behavior:

- when mode is `paused`, do nothing
- when mode is active, wake on a short interval such as `1000ms`
- compute wall-clock delta since last tick
- convert that delta into simulated elapsed time based on the active rate
- dispatch `AdvanceTime` in bounded chunks

Example:

- `1x`: `1s wall = 1s sim`
- `4x`: `1s wall = 4s sim`
- `12x`: `1s wall = 12s sim`

The chunking rule matters more than the visible rate label.

## Why Bounded Chunks Matter

Do not let one timer tick jump a huge span at once.

Bounded stepping gives safer handling for:

- critical interruptions
- deterministic event ordering
- UI updates
- cancellation or pause responsiveness

Recommended first-pass bounds:

- process at most `5` simulated minutes per internal step at `1x`
- allow larger effective accumulation at higher rates, but still break it into deterministic `AdvanceTime` calls
- stop immediately if a command returns a blocker or critical interruption

## Auto-Pause Flow

When an `AdvanceTime` result indicates a critical interruption:

1. set mode to `paused`
2. publish updated shell summary
3. surface a flash or alert
4. leave the clock popover and calendar consistent with the new time

The clock controller should not try to outsmart simulation outcomes.

## Calendar Event Shape

Suggested generic UI shape:

```ts
interface CalendarEventView {
  calendarEventId: string;
  sourceType:
    | "company_contract"
    | "flight_leg"
    | "maintenance_task"
    | "recurring_obligation"
    | "staffing_package"
    | "system";
  sourceId: string;
  eventType:
    | "contract_deadline"
    | "planned_departure"
    | "planned_arrival"
    | "maintenance_start"
    | "maintenance_complete"
    | "payment_due"
    | "staffing_start"
    | "staffing_end"
    | "system_alert";
  category: "contracts" | "dispatch" | "maintenance" | "finance" | "staffing" | "system";
  severity: "critical" | "warning" | "normal" | "opportunity";
  startsAtUtc: string;
  endsAtUtc?: string;
  airportId?: string;
  title: string;
  subtitle?: string;
  detail?: string;
  relatedTab?: "contracts" | "dispatch" | "aircraft" | "staffing" | "activity";
  status: "upcoming" | "in_progress" | "completed" | "missed" | "cancelled";
}
```

This is a projection type, not a persisted canonical row.

## Event Source Mapping

### Company Contract

Create calendar events for:

- deadline due

Optional later:

- earliest-start window

### Flight Leg

Create calendar events for:

- planned departure
- planned arrival

### Maintenance Task

Create calendar events for:

- maintenance start
- maintenance completion

### Recurring Obligation

Create calendar events for:

- payment due

### Staffing Package

Create calendar events for:

- package starts
- package expires

### System

Optional later:

- market refreshes
- company milestone reminders
- tutorial or advisory nudges

## Projection Strategy

Recommended first pass: derive calendar events on read, not with a separate authoritative table.

Why:

- fewer migrations
- lower risk while the event list is still evolving
- simpler alignment with the current save model

Suggested read helper:

```ts
loadCalendarEvents(saveDatabase, saveId, rangeStartUtc, rangeEndUtc): CalendarEventView[]
```

That helper should:

- query only the relevant time range
- normalize source rows into one event list
- sort by `startsAtUtc`
- attach category, severity, and navigation metadata

If performance later demands it, we can add a cached projection table.

## Calendar Range Queries

The UI will need at least two read modes:

1. focused range for the current calendar month
2. compact agenda range such as `now -> now + 7 days`

Suggested endpoint shape:

- `GET /api/save/:saveId/clock`
- `GET /api/save/:saveId/calendar?start=...&end=...`

The clock endpoint can return:

- current sim time
- current rate mode
- paused/running state
- next critical event summary

The calendar endpoint can return:

- selected range metadata
- normalized `CalendarEventView[]`
- grouped day buckets if useful for UI rendering
- day-level affordances such as whether `Sim to 6:00 AM` is valid for a given local date

## Calendar Day Shortcut

The calendar should support a day-click shortcut that advances to `6:00 AM` on the selected local day.

Recommended behavior:

- the UI sends the selected local date, not a guessed UTC timestamp
- the server resolves `6:00 AM` in the same company-local timezone used by the clock display
- the resolved UTC target becomes the authoritative `AdvanceTime` target
- if the resolved target is less than or equal to the current sim time, reject the command as invalid for that day
- if a critical interruption occurs before the target is reached, stop early and surface the interruption normally

## UI Command Endpoints

Suggested write endpoints:

- `POST /api/save/:saveId/clock/pause`
- `POST /api/save/:saveId/clock/set-rate`
- `POST /api/save/:saveId/clock/advance-to-calendar-anchor`

Payload for `set-rate`:

```json
{ "mode": "1x" }
```

Payload for `advance-to-calendar-anchor`:

```json
{ "localDate": "2026-03-18", "localTime": "06:00" }
```

The first calendar shortcut should always call this endpoint with `06:00` for the clicked day.

Optional later:

- `POST /api/save/:saveId/clock/advance-to-next-event`
- `POST /api/save/:saveId/clock/advance-to-next-departure`

## Save Schema Recommendation

Do not add a dedicated `calendar_event` table in v1.

Keep using existing authoritative tables.

Schema impact should stay minimal.

Possible optional additions later:

- `game_clock.last_auto_tick_result_json`
- save-specific time-control preferences
- last-selected calendar viewport settings

Those are preferences or diagnostics, not simulation truth.

## Integration With Existing Backend

The current backend already has most of the pieces needed:

- `AdvanceTime`
- `game_clock`
- `scheduled_event`
- contract, schedule, maintenance, and event-log reads

The next implementation layer should add:

1. save-session time controller
2. calendar projection read model
3. clock/calendar UI endpoints
4. shell clock popover UI

## Failure Handling

If the real-time controller encounters an `AdvanceTime` failure:

- pause immediately
- log timing and failure detail
- surface a UI error or alert
- do not silently keep ticking

If the calendar projection cannot load:

- the clock control should still work
- show an empty or degraded agenda state, not a broken shell

## Recommended Build Order

1. `loadCalendarEvents` read model over existing save tables
2. clock read endpoint
3. clock pause / set-rate endpoints
4. `advance-to-calendar-anchor` endpoint for `Sim to 6:00 AM`
5. save-session time controller
6. UI clock popover with agenda list
7. month grid once the agenda is stable

This keeps the risky runtime work and the visual surface separable.

## Testing Priorities

### Time Controller

- `1x` advances sim time in step with wall time while open
- `Pause` stops progression
- switching rates changes effective advancement speed correctly
- critical interruptions auto-pause when configured

### Calendar Projection

- contract deadlines appear in the correct day bucket
- departures and arrivals project from `flight_leg`
- maintenance and payments appear in the correct order
- cancelled or completed items reflect appropriate status

### Integration

- clock state updates shell UI without full reload
- calendar refreshes after accepted contracts, schedule commits, and time advancement
- open save sessions remain deterministic even under repeated rate changes

## Recommendation Summary

Implementation should treat the calendar as a generic read projection and the live clock as a save-session runtime controller.

That gives FlightLine:

- real-time feel while the save is open
- simple pause and fast-forward controls
- a clean informational calendar
- room for future milestones without reworking the model

