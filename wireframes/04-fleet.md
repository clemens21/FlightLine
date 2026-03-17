# Aircraft Workspace Wireframe

## Screen Goal

Answer: `am I managing current fleet posture or evaluating a new aircraft listing?`

## Primary User Flow

- choose between `Fleet` and `Market`
- scan owned-aircraft posture or browse live listings
- inspect a selected aircraft or listing
- dispatch, service, acquire, or compare next steps

## Viewport

- desktop-first
- `1440 x 960`

## Layout Sketch

```text
+------------------------------------------------------------------------------------------------------------------+
| FlightLine | Dashboard | Contracts | Aircraft | Staffing | Dispatch | Clock | Settings | Cash $412k            |
| Alerts: [ATR due soon] [King Air crew tight] [2 opportunities]                                                   |
+------------------------------------------------------------------------------------------------------------------+
| Aircraft Workspace: [Fleet] [Market]                                                                             |
+------------------------------------------------------------------------------------------------------------------+
| Fleet Table or Market List                                                      | Selected Aircraft / Listing     |
|---------------------------------------------------------------------------------+--------------------------------|
| Tail   Type          Location Ownership Cond.   Hours to svc  Next milestone     | [small aircraft image]          |
| FL-201 C208 Caravan  KGJT     Owned     Excellent 42h         idle now           | ATR 42F - Wasatch Freight       |
| FL-305 King Air 350  KAPA     Loaned    Excellent 31h         dep 10:05          | Operational status              |
| FL-842 ATR 42F       KSLC     Leased    Fair      6h          service soon       | Crew readiness                  |
|---------------------------------------------------------------------------------+| Next milestone                 |
|                                                                                 | Active assignment              |
|                                                                                 | Mission profile                |
|                                                                                 | Ownership plan                 |
|                                                                                 | Airframe condition             |
|                                                                                 | Why it matters                 |
|                                                                                 | Quick actions                  |
+------------------------------------------------------------------------------------------------------------------+
| In Market mode, the left side becomes the live listing table and the right side shows Buy / Loan / Lease terms. |
+------------------------------------------------------------------------------------------------------------------+
```

## Information Hierarchy Notes

- The active workspace list is the core interaction surface.
- The selected pane should answer "why should I care about this row?" immediately.
- Acquisition should stay inside the same top-level workspace instead of feeling like a detached shop screen.

## Key Interactions

- selecting a row updates the right detail panel without losing table context
- switching `Fleet` and `Market` keeps shell context stable
- acquisition actions open term selection without leaving the selected listing pane

## Wireframe Tensions

- Fleet and Market are close neighbors; they need a sharper boundary in the design docs.
- The selected pane has to stay compact enough that the list remains the primary browsing surface.
- Financial and operational metrics compete for attention in each row and will need visual discipline.
