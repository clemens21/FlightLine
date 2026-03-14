# Aircraft Acquisition Wireframe

## Screen Goal

Answer: `which aircraft offer should I take, under what payment structure, and what new capability or burden does it create?`

## Primary User Flow

- browse the current aircraft market
- filter by mission role, budget, or acquisition type
- compare shortlisted offers
- choose buy, finance, or lease terms
- confirm the deal with full staffing and utilization context

## Viewport

- desktop-first
- `1440 x 960`

## Layout Sketch

```text
+------------------------------------------------------------------------------------------------------------------+
| FlightLine | Dashboard | Contracts | Dispatch | Fleet | Staffing | Wed Jun 17 08:20 MDT | -15m +1h +4h | $412k |
| Alerts: [ATR due soon] [King Air crew tight] [2 opportunities]                                                   |
+------------------------------------------------------------------------------------------------------------------+
| Acquisition Filters: [All roles] [Cargo] [Passenger] [Utility] [Buy] [Finance] [Lease] [Budget <= $500k]      |
| Sort: [Best strategic fit v]                                                                                    |
+------------------------------------------------------------------------------------------------------------------+
| Market Table                                                                    | Selected Offer: Saab 340A(F)   |
|---------------------------------------------------------------------------------+--------------------------------|
| Type         Role        Access     Best path  Upfront   Weekly cost  Fit       | Role: regional cargo          |
| Saab 340A(F) Cargo       medium     Finance    148,000   12,100       Strong    | Unlocks stronger cargo growth |
| PC-12        Utility     strong     Buy        385,000    2,900       Medium    | Better than Caravan, flexible |
| Citation CJ2 Premium pax limited    Lease       61,000   15,800       Medium    | Strong charter, high risk     |
| Twin Otter   Rugged util excellent  Lease       44,000    8,900       Medium    | Remote field specialist       |
|---------------------------------------------------------------------------------+--------------------------------|
|                                                                                 | Deal structure comparison      |
|                                                                                 | Buy:      upfront too high     |
|                                                                                 | Finance:  strong match         |
|                                                                                 | Lease:    viable, weaker long  |
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
|                                                                                 | [Compare] [Finance this]       |
|                                                                                 | [Lease instead]                |
+------------------------------------------------------------------------------------------------------------------+
| Bottom Compare / Commitment Bar                                                                                  |
| Cash after financing down payment: $264,000   New weekly obligations: +$12,100   Risk: Medium   [Commit Deal] |
+------------------------------------------------------------------------------------------------------------------+
```

## Information Hierarchy Notes

- The market table is the scan surface; the right panel explains whether the selected offer is actually smart.
- Payment structure comparison must be visible without leaving the screen.
- Staffing impact belongs near the commitment action so acquisition never feels disconnected from labor.

## Key Interactions

- table row select updates the offer detail panel
- compare mode should allow 2 to 3 aircraft side by side
- changing buy, finance, or lease should update cash and weekly obligation previews instantly
- blocked or risky deal structures should explain why, not just disable the button

## Wireframe Tensions

- This screen can become an accounting screen if utilization and mission fit are not emphasized enough.
- Compare mode will matter a lot because acquisition is a high-stakes decision.
- The screen needs a strong distinction between `interesting` and `actually justified for this company right now`.
