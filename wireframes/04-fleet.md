# Fleet Wireframe

## Screen Goal

Answer: `which aircraft is helping, which aircraft is risky, and where should fleet attention go next?`

## Primary User Flow

- scan fleet health and utilization
- inspect a selected aircraft
- dispatch, service, or compare aircraft
- open acquisition when growth is justified

## Viewport

- desktop-first
- `1440 x 960`

## Layout Sketch

```text
+------------------------------------------------------------------------------------------------------------------+
| FlightLine | Dashboard | Contracts | Dispatch | Fleet | Staffing | Wed Jun 17 08:20 MDT | -15m +1h +4h | $412k |
| Alerts: [ATR due soon] [King Air crew tight] [2 opportunities]                                                   |
+------------------------------------------------------------------------------------------------------------------+
| Fleet Summary                                                                                                     |
| Aircraft: 3   Available: 2   Scheduled: 1   Watch: 1   Avg utilization: 69%   Best 7d earner: FL-842          |
+------------------------------------------------------------------------------------------------------------------+
| Fleet Table                                                                     | Selected Aircraft: FL-842       |
|---------------------------------------------------------------------------------+--------------------------------|
| Tail   Type          Location State     Cond.   Staff   7d Profit  Next Event   | ATR 42F - Wasatch Freight      |
| FL-201 C208 Caravan  KGJT     Available Healthy Covered   6,900    idle now     | State: Available               |
| FL-305 King Air 350  KAPA     Scheduled Healthy Tight    14,100    dep 10:05    | Condition: Watch               |
| FL-842 ATR 42F       KSLC     Available Watch   Covered  21,700    mx due soon   | Maintenance: Due soon          |
|---------------------------------------------------------------------------------+--------------------------------|
|                                                                                 | Why it matters                 |
|                                                                                 | - strongest cargo aircraft     |
|                                                                                 | - highest recurring cost       |
|                                                                                 | - most urgent maintenance need |
|                                                                                 |                                |
|                                                                                 | Quick actions                  |
|                                                                                 | [Dispatch] [Schedule mx]       |
|                                                                                 | [Compare aircraft]             |
+------------------------------------------------------------------------------------------------------------------+
| Lower Utility Strip                                                                                               |
| [Open acquisition market]   [Compare buy vs lease candidates]   [Filter by watch state]                         |
+------------------------------------------------------------------------------------------------------------------+
```

## Information Hierarchy Notes

- The table is the core interaction surface.
- The selected aircraft panel should answer "why should I care about this row?" immediately.
- The acquisition entry point belongs on Fleet because expansion is a fleet decision, not a detached shop screen.

## Key Interactions

- selecting a row updates right detail panel without losing table context
- clicking state, condition, or staffing chips filters the table
- acquisition button opens compare-ready market flow

## Wireframe Tensions

- Fleet and Aircraft Detail are close neighbors; they need a sharper boundary in the design docs.
- The screen may need a more explicit compare mode if acquisition decisions are frequent here.
- Financial and operational metrics compete for attention in each row and will need visual discipline.
