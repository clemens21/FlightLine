# Aircraft Acquisition Wireframe

## Screen Goal

Answer: `which aircraft offer should I take, under what ownership structure, and what new capability or burden does it create?`

## Primary User Flow

- browse the current aircraft market
- filter by search, condition, or location radius
- inspect one selected listing
- choose buy, loan, or lease terms
- confirm the deal with full staffing and utilization context

## Viewport

- desktop-first
- `1440 x 960`

## Layout Sketch

```text
+------------------------------------------------------------------------------------------------------------------+
| FlightLine | Dashboard | Contracts | Aircraft | Staffing | Dispatch | Clock | Settings | Cash $412k            |
| Alerts: [ATR due soon] [King Air crew tight] [2 opportunities]                                                   |
+------------------------------------------------------------------------------------------------------------------+
| Market Filters: [Search] [Condition] [Location radius]                                                           |
| Sort: [Best strategic fit v]                                                                                    |
+------------------------------------------------------------------------------------------------------------------+
| Market Table                                                                    | Selected Offer: Saab 340A(F)   |
|---------------------------------------------------------------------------------+--------------------------------|
| Type         Airport   Condition  Best path  Upfront   Monthly cost  Fit        | [small aircraft image]         |
| Saab 340A(F) KABQ      Fair       Loan       148,000   12,100        Strong     | Saab 340A(F)                  |
| PC-12        KASE      Excellent  Buy        385,000    2,900        Medium     | KABQ | Albuquerque            |
| Citation CJ2 KSDL      Excellent  Lease       61,000   15,800        Medium     | Unlocks stronger cargo growth |
| Twin Otter   PAKT      Rough      Lease       44,000    8,900        Medium     |                                |
|---------------------------------------------------------------------------------+--------------------------------|
|                                                                                 | [Buy] [Loan] [Lease]           |
|                                                                                 |                                |
|                                                                                 | Purchase terms / Loan terms    |
|                                                                                 | / Lease terms                  |
|                                                                                 | compact term options           |
|                                                                                 | confirm selected structure     |
|                                                                                 |                                |
|                                                                                 | Strategic effect               |
|                                                                                 | - improves cargo depth         |
|                                                                                 | - reduces ATR overdependence   |
|                                                                                 | - adds new staffing burden     |
|                                                                                 |                                |
|                                                                                 | Staffing impact                |
|                                                                                 | - new pilot qualification req  |
|                                                                                 | - mechanics remain outsourced  |
|                                                                                 | - no cabin crew impact         |
|                                                                                 |                                |
|                                                                                 | Actions                        |
|                                                                                 | [Confirm deal]                 |
+------------------------------------------------------------------------------------------------------------------+
```

## Information Hierarchy Notes

- The market table is the scan surface; the right panel explains whether the selected offer is actually smart.
- Payment structure comparison must be visible without leaving the screen.
- Staffing impact belongs near the commitment action so acquisition never feels disconnected from labor.
- Buy, loan, and lease detail should stay out of the table and inside the selected pane.

## Key Interactions

- table row select updates the offer detail panel
- changing buy, loan, or lease should update cash and payment previews instantly
- blocked or risky deal structures should explain why, not just disable the button
- completing a deal should keep the player on Market unless they deliberately move to Fleet

## Wireframe Tensions

- This screen can become an accounting screen if utilization and mission fit are not emphasized enough.
- The selected pane has to stay compact enough that the list remains easy to scan.
- The screen needs a strong distinction between `interesting` and `actually justified for this company right now`.
