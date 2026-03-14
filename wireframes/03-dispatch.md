# Dispatch Wireframe

## Screen Goal

Answer: `what should this aircraft do next, is the schedule valid, and is it worth the maintenance and staffing risk?`

## Primary User Flow

- choose aircraft
- build a schedule
- validate conflicts and blockers
- commit or revise the plan

## Viewport

- desktop-first
- `1440 x 960`

## Layout Sketch

```text
+------------------------------------------------------------------------------------------------------------------+
| FlightLine | Dashboard | Contracts | Dispatch | Fleet | Staffing | Wed Jun 17 08:20 MDT | -15m +1h +4h | $412k |
| Alerts: [ATR due soon] [King Air crew tight] [2 opportunities]                                                   |
+------------------------------------------------------------------------------------------------------------------+
| Aircraft: [FL-842 ATR 42F - Wasatch Freight v]  State: Available  Condition: Watch  Maintenance: Due soon       |
| Location: KSLC  Staffing: Covered  Ownership: Lease                                                         |
+------------------------------------------------------------------------------------------------------------------+
| Schedule Builder                                        | Validation And Decision Support                        |
|---------------------------------------------------------+--------------------------------------------------------|
| Timeline                                                 | Validation                                             |
| 08:20 now                                                | [Pass] aircraft available at KSLC                      |
| 09:00 load C-203 KSLC -> KGJT                           | [Pass] route valid for payload                         |
| 11:10 arrive KGJT                                       | [Warn] maintenance due in 5.4 flight hours             |
| 12:00 turnaround / optional load C-244 KGJT -> KSLC     | [Warn] second leg compresses service margin            |
| 14:30 depart C-244 KGJT -> KSLC                         | [Pass] staffing covered                                |
| 16:35 arrive KSLC                                       | [Warn] service should follow immediately               |
| 17:00 maintenance slot                                  | [Pass] deadline still achievable                       |
|---------------------------------------------------------+--------------------------------------------------------|
| Leg Queue                                                | Selected Leg                                           |
| 1. C-203 KSLC -> KGJT cargo                             | C-244 KGJT -> KSLC                                     |
| 2. C-244 KGJT -> KSLC cargo                             | Payout: $15,400                                        |
| 3. Maintenance block                                     | Est margin: High                                       |
| [Add leg] [Insert reposition] [Add maintenance]         | Risk: Medium because of maintenance timing             |
|                                                         | [Open contract]                                        |
+---------------------------------------------------------+--------------------------------------------------------+
| Bottom Commitment Bar                                                                                             |
| Projected schedule profit: $28,900   Staffing impact: none new   Risk state: Warning   [Save draft] [Commit]   |
+------------------------------------------------------------------------------------------------------------------+
```

## Information Hierarchy Notes

- Timeline is the primary planning surface.
- Validation must remain visible at all times; it cannot hide behind a separate modal.
- The bottom commitment bar needs to summarize the whole schedule, not just the selected leg.

## Key Interactions

- drag or reorder legs in queue
- selecting a leg updates right detail panel
- warnings should link to maintenance or staffing context
- commit button should remain disabled only for hard blockers, not warnings

## Wireframe Tensions

- Dispatch can become too dense very quickly if multi-aircraft planning is attempted too early.
- Revenue legs and maintenance blocks need very different visual treatment.
- Schedule profitability and operational risk must be readable together without either one disappearing.
