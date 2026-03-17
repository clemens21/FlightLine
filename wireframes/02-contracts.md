# Contracts Wireframe

## Screen Goal

Answer: `which work is worth taking, and how should I chain it into a viable route plan?`

## Primary User Flow

- review available, accepted/active, and closed contracts
- compare fit, margin, and deadline risk
- inspect a selected opportunity in route-map context
- plan, batch-accept, or accept the best work

## Viewport

- desktop-first
- `1440 x 960`

## Layout Sketch

```text
+------------------------------------------------------------------------------------------------------------------+
| FlightLine | Dashboard | Contracts | Aircraft | Staffing | Dispatch | Clock | Settings | Cash $412k            |
| Alerts: [ATR due soon] [King Air crew tight] [2 opportunities]                                                   |
+------------------------------------------------------------------------------------------------------------------+
| View: [Available] [Accepted / Active] [Closed]                                                                   |
| Filters: [Search] [Departure] [Destination] [Payload] [Fit] [Payout] [Passengers] [Cargo lb] [Match endpoint] |
| Sort: [Best Fit v]                                                                                               |
+------------------------------------------------------------------------------------------------------------------+
| Contract Board                                                                 | Route Map + Planner              |
|--------------------------------------------------------------------------------+----------------------------------|
| Route                   Fit      Payload  Distance  Hours Left  Due    Payout  | [Pinned route map]              |
| KGJT -> KSLC            Strong   3,700 lb 209 nm    6h 20m      20:30  15,400  | Selected route overlays         |
| KEGE -> KAPA            Strong   8 pax    108 nm    9h 10m      23:20  22,500  |                                  |
| KCOS -> KGJT            Medium   7 pax    172 nm    4h 50m      18:00   7,200  | Route Planner                    |
| KRKS -> KSLC            Low      2,100 lb 165 nm    7h 00m      21:10   4,400  | 1. KGJT -> KSLC accepted         |
| ...                                                                            | 2. KSLC -> KGJT candidate        |
|--------------------------------------------------------------------------------+| 3. KGJT -> KCOS stale           |
|                                                                                |                                  |
|                                                                                | Actions                          |
|                                                                                | [Add to plan] [Accept]          |
|                                                                                | [Review planned offers]         |
+------------------------------------------------------------------------------------------------------------------+
| Table scroll remains inside the board. Map and planner stay pinned while browsing.                               |
+------------------------------------------------------------------------------------------------------------------+
```

## Information Hierarchy Notes

- The table is the primary surface; the route map and planner explain the selected row in context.
- Fit and margin should be visible before opening any deeper detail.
- Accepted work and available work should coexist, but visually separate enough to prevent confusion.
- The planner should support chained decisions without bloating the main board.

## Key Interactions

- row select updates the pinned route map and planner context
- add-to-plan stages work in the planner rail
- review planned offers batch-accepts in planner order
- clicking selected aircraft fit or draft action deep-links into dispatch with route-plan context
- filters should be fast and non-modal

## Wireframe Tensions

- There is a real risk of turning the screen into a spreadsheet without decision support.
- The planner rail has to feel like a staging area, not a second table.
- Accepted and available contract states need stronger visual separation than simple labels.
