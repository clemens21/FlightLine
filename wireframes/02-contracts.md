# Contracts Wireframe

## Screen Goal

Answer: `which work is worth taking, and which aircraft can profitably and safely do it?`

## Primary User Flow

- review available and accepted contracts
- compare fit, margin, and deadline risk
- inspect a selected opportunity in detail
- accept or plan the best work

## Viewport

- desktop-first
- `1440 x 960`

## Layout Sketch

```text
+------------------------------------------------------------------------------------------------------------------+
| FlightLine | Dashboard | Contracts | Dispatch | Fleet | Staffing | Wed Jun 17 08:20 MDT | -15m +1h +4h | $412k |
| Alerts: [ATR due soon] [King Air crew tight] [2 opportunities]                                                   |
+------------------------------------------------------------------------------------------------------------------+
| Filters: [All] [Cargo] [Passenger] [Today] [High Margin] [Aircraft: Any v] [Region: Rocky Mountain West v]     |
| Sort: [Best Fit v] [Compare 0]                                                                                   |
+------------------------------------------------------------------------------------------------------------------+
| Contract Table                                                                 | Selected Contract: C-244         |
|--------------------------------------------------------------------------------+----------------------------------|
| ID    Route            Type      Payout   Est Margin   Fit      Risk   State   | KGJT -> KSLC                    |
| C-244 KGJT -> KSLC     Cargo     15,400   High         ATR      Medium Available| Cargo haul, 3,700 lb            |
| C-241 KEGE -> KAPA     Passenger 22,500   High         King Air High   Available| Deadline: 20:30 today           |
| C-245 KCOS -> KGJT     Passenger  7,200   Medium       Caravan  Low    Available| Best aircraft: FL-842           |
| C-248 KRKS -> KSLC     Cargo      4,400   Low          Caravan  Low    Available| Reposition: low                 |
| C-203 KSLC -> KGJT     Cargo     18,200   High         ATR      Medium Accepted | Staffing: covered               |
| C-089 KGJT -> KCOS     Utility    5,100   Medium       Caravan  Low    Accepted | Warning: uses maintenance margin|
|--------------------------------------------------------------------------------+----------------------------------|
|                                                                                | Why it is attractive             |
|                                                                                | - strong ATR fit                 |
|                                                                                | - good profit per hour           |
|                                                                                | - pairs with accepted cargo work |
|                                                                                |                                  |
|                                                                                | Why it is risky                  |
|                                                                                | - ATR due soon for maintenance   |
|                                                                                | - downtime window gets tighter   |
|                                                                                |                                  |
|                                                                                | Fit by aircraft                  |
|                                                                                | FL-842 ATR 42F    Strong         |
|                                                                                | FL-201 Caravan    Poor           |
|                                                                                | FL-305 King Air   Invalid        |
|                                                                                |                                  |
|                                                                                | Actions                          |
|                                                                                | [Accept] [Shortlist] [Plan ATR]  |
+------------------------------------------------------------------------------------------------------------------+
| Compare Tray                                                                                                     |
| empty by default; expands when 2+ contracts are selected for side-by-side comparison                             |
+------------------------------------------------------------------------------------------------------------------+
```

## Information Hierarchy Notes

- The table is the primary surface; the detail panel explains the selected row.
- Fit and margin should be visible before opening the detail panel.
- Accepted work and available work should coexist, but visually separate enough to prevent confusion.

## Key Interactions

- row select updates right detail panel
- compare checkbox opens bottom compare tray
- clicking selected aircraft fit chip deep-links into dispatch with contract preloaded
- filters should be fast and non-modal

## Wireframe Tensions

- There is a real risk of turning the screen into a spreadsheet without decision support.
- The selected contract panel has to explain profit and risk in plain language, not just numbers.
- Accepted and available contract states need stronger visual separation than simple labels.
