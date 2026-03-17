# Dashboard Wireframe

## Screen Goal

Answer: `what matters right now, what should I do next, and is the company healthy enough to let time keep moving?`

## Primary User Flow

- review company state
- identify biggest blocker or opportunity
- jump directly into contracts, aircraft, staffing, or dispatch
- open the clock/calendar when time control matters

## Viewport

- desktop-first
- `1440 x 960`

## Layout Sketch

```text
+------------------------------------------------------------------------------------------------------------------+
| FlightLine | Dashboard | Contracts | Aircraft | Staffing | Dispatch | Clock | Settings | Cash $412k            |
| Alerts: [ATR due soon] [King Air crew tight] [2 opportunities]                                                   |
+------------------------------------------------------------------------------------------------------------------+
| Immediate Attention                         | Recommended Next Step                     | Cash And Pressure         |
|---------------------------------------------+-------------------------------------------+---------------------------|
| [Warning] FL-842 maintenance due in 5.4h    | [Opportunity] C-244 KGJT -> KSLC cargo    | Cash: $412,000            |
| [Warning] King Air pilot depth is tight     | Best fit: FL-842                          | Weekly trend: +$38,400    |
| [Info] no critical failures right now       | Decide now: fly before service or hold    | Pressure: Tight           |
| [Open issue] view all alerts                | [Open Dispatch] [Open Contracts]          | Obligations: $24.0k soon  |
+---------------------------------------------+-------------------------------------------+---------------------------+
| Timeline Highlights                         | Aircraft Posture                          | Contract Board Snapshot   |
|---------------------------------------------+-------------------------------------------+---------------------------|
| 10:05  FL-305 departs KAPA -> KASE          | Ready aircraft: 2                         | 227 live offers           |
| 11:12  FL-305 arrives KASE                  | Aircraft needing care: 1                  | 4 high-fit opportunities  |
| 14:30  ATR best dispatch window             | Leased or loaned burden visible           | 1 accepted-ready chain    |
| 18:00  cargo deadline                       | [Open Aircraft]                           | [Open Contracts]          |
+---------------------------------------------+-------------------------------------------+---------------------------+
| Staffing Pressure                           | Calendar Preview                          | Activity Snapshot         |
|---------------------------------------------+-------------------------------------------+---------------------------|
| King Air pilots: Tight                      | Today: 3 departures, 1 deadline           | Contract accepted         |
| Mechanics: Tight / outsourced               | Tomorrow: lease payment, mx due           | Aircraft acquired         |
| Ops support: Stable                         | [Open Clock / Calendar]                   | [Open activity log]       |
| [Open staffing]                             |                                           |                           |
+------------------------------------------------------------------------------------------------------------------+
```

## Information Hierarchy Notes

- The top row should create immediate focus on one warning and one opportunity.
- The dashboard should not try to replace Contracts or Dispatch; it should route decisively.
- Cash belongs high in the shell because time and expansion are financial decisions as much as operational ones.

## Key Interactions

- click alert chip -> open relevant screen already filtered
- click recommended next step -> jump directly into dispatch or contracts context
- click clock -> open calendar and sim-rate controls
- click aircraft, staffing, or maintenance cards -> open detailed screen with selected issue highlighted

## Wireframe Tensions

- The dashboard is at risk of becoming a mini-version of every other screen.
- Recommendation logic must stay explainable or the panel will feel arbitrary.
- The top shell needs enough presence to support time and settings without dominating the whole screen.
