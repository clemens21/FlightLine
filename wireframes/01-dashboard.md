# Dashboard Wireframe

## Screen Goal

Answer: `what matters right now, what should I do next, and is the company healthy enough to push time forward?`

## Primary User Flow

- review company state
- identify biggest blocker or opportunity
- jump directly into dispatch, staffing, maintenance, or contracts
- advance time when ready

## Viewport

- desktop-first
- `1440 x 960`

## Layout Sketch

```text
+------------------------------------------------------------------------------------------------------------------+
| FlightLine | Dashboard | Contracts | Dispatch | Fleet | Staffing | Wed Jun 17 08:20 MDT | -15m +1h +4h | $412k |
| Alerts: [ATR due soon] [King Air crew tight] [2 opportunities]                                                   |
+------------------------------------------------------------------------------------------------------------------+
| Immediate Attention                         | Recommended Next Step                     | Cash And Pressure         |
|---------------------------------------------+-------------------------------------------+---------------------------|
| [Warning] FL-842 maintenance due in 5.4h    | [Opportunity] C-244 KGJT -> KSLC cargo    | Cash: $412,000            |
| [Warning] King Air pilot depth is tight     | Best fit: FL-842                          | Weekly trend: +$38,400    |
| [Info] no critical failures right now       | Decide now: fly before service or hold    | Pressure: Tight           |
| [Open issue] view all alerts                | [Dispatch ATR] [Open Contracts]           | Obligations: $24.0k soon  |
+---------------------------------------------+-------------------------------------------+---------------------------+
| Fleet Status                                | Today's Operation Timeline                | Contract Market           |
|---------------------------------------------+-------------------------------------------+---------------------------|
| Available: 1                                | 10:05  FL-305 departs KAPA -> KASE        | 2 high-fit opportunities  |
| Scheduled: 1                                | 11:12  FL-305 arrives KASE                | 1 safe low-margin option  |
| Watch: 1                                    | 14:30  ATR best dispatch window           | 1 blocked premium charter |
| Grounded: 0                                 | 18:00  cargo deadline                     | [Open board]              |
+---------------------------------------------+-------------------------------------------+---------------------------+
| Staffing Pressure                           | Maintenance Watch                         | Finance Snapshot          |
|---------------------------------------------+-------------------------------------------+---------------------------|
| King Air pilots: Tight                      | FL-842 ATR 42F                            | Lease due: 4 days         |
| Mechanics: Tight / outsourced               | Condition: Watch                          | King Air finance: 6 days  |
| Ops support: Tight                          | Maintenance: Due soon                     | Labor fixed: $3.9k/day    |
| [Open staffing]                             | [Open maintenance]                        | [Open finance]            |
+------------------------------------------------------------------------------------------------------------------+
| Event Feed                                                                                                       |
| 08:05 Yesterday's charter posted +$13,200  | 09:10 ATR cargo decision window opens     | 12:00 watch reminder      |
+------------------------------------------------------------------------------------------------------------------+
```

## Information Hierarchy Notes

- The top row should create immediate focus on one warning and one opportunity.
- The dashboard should not try to replace Contracts or Dispatch; it should route decisively.
- Cash belongs high on the screen because time advancement is a financial decision as much as an operational one.

## Key Interactions

- click alert chip -> open relevant screen already filtered
- click recommended next step -> jump directly into dispatch or contracts context
- click time control -> open summary of expected events in selected window
- click fleet, staffing, or maintenance cards -> open detailed screen with selected issue highlighted

## Wireframe Tensions

- The dashboard is at risk of becoming a mini-version of every other screen.
- Recommendation logic must stay explainable or the panel will feel arbitrary.
- The top shell needs enough presence to support time and alerts without dominating the whole screen.
