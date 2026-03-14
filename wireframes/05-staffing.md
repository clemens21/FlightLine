# Staffing Wireframe

## Screen Goal

Answer: `where is labor constraining growth, and what staffing move fixes the problem with the best cost structure?`

## Primary User Flow

- review staffing coverage and qualification gaps
- understand which operations are blocked or fragile
- compare hire, contract, and outsource options
- commit the staffing change with clear cost impact

## Viewport

- desktop-first
- `1440 x 960`

## Layout Sketch

```text
+------------------------------------------------------------------------------------------------------------------+
| FlightLine | Dashboard | Contracts | Dispatch | Fleet | Staffing | Wed Jun 17 08:20 MDT | -15m +1h +4h | $412k |
| Alerts: [ATR due soon] [King Air crew tight] [2 opportunities]                                                   |
+------------------------------------------------------------------------------------------------------------------+
| Staffing Summary                                                                                                  |
| Pilot coverage: Tight   Cabin: Covered   Mechanics: Tight   Ops support: Tight   Fixed labor: $3.9k/day        |
+------------------------------------------------------------------------------------------------------------------+
| Qualification Coverage Matrix                                  | Selected Staffing Option                            |
|----------------------------------------------------------------+----------------------------------------------------|
| Category              Model            State    Impact         | King Air pilot contract pool                        |
| Caravan pilots        Direct hire      Covered  stable         | Cost: +$1,850 / day when active                     |
| King Air pilots       Direct hire      Tight    blocks growth  | Effect: removes current premium charter blocker     |
| ATR pilots            Contract pool    Covered  flexible       | Timing: immediate                                   |
| Flight attendants     Contract pool    Covered  stable         | Best use: support short-term charter growth         |
| Mechanics             Service agrmnt   Tight    mx risk        | [Add contract] [Direct hire later]                  |
| Ops support           Internal package Tight    scaling risk   |                                                    |
|----------------------------------------------------------------+----------------------------------------------------|
| Blocked Or Fragile Operations                                  | Cost Mix                                            |
| - C-241 premium charter blocked by King Air pilot depth        | Fixed labor: $3.9k/day                              |
| - ATR downtime risk rises if maintenance expands               | Variable labor: moderate                            |
| - 4th aircraft expansion would overload ops support            | Outsourced services: significant but flexible       |
+----------------------------------------------------------------+----------------------------------------------------+
| Staffing Market Actions                                                                                        |
| [Add direct hire package] [Add contract pool] [Add service agreement] [Do nothing]                            |
+------------------------------------------------------------------------------------------------------------------+
```

## Information Hierarchy Notes

- The qualification matrix is the primary operating surface.
- The selected option panel must show cost and business effect at the same time.
- The blocked-operations section is what turns labor from an abstract cost into an obvious strategic system.

## Key Interactions

- selecting a staffing row filters the available staffing options
- clicking a blocked contract opens Contracts or Dispatch with context preserved
- actions should preview both new cost and newly unlocked opportunities

## Wireframe Tensions

- Staffing can become too abstract if the blocked-operations panel is weak.
- The screen needs enough structure to explain labor without turning into HR software.
- Mechanics and operations support may need more concrete location context later.
