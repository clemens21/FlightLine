# Staffing Acquisition Wireframe

## Screen Goal

Answer: `what staffing package should I add right now, and what constraint or opportunity does it resolve?`

## Primary User Flow

- enter from Staffing, Dashboard, Contracts, or Acquisition
- review the specific coverage gap
- compare direct hire, contract, and service agreement options
- commit the staffing change with clear cost and unlock preview

## Viewport

- desktop-first
- `1440 x 960`

## Layout Sketch

```text
+------------------------------------------------------------------------------------------------------------------+
| FlightLine | Dashboard | Contracts | Dispatch | Fleet | Staffing | Wed Jun 17 08:20 MDT | -15m +1h +4h | $412k |
| Alerts: [ATR due soon] [King Air crew tight] [2 opportunities]                                                   |
+------------------------------------------------------------------------------------------------------------------+
| Staffing Need: King Air pilot depth is tight                                                                    |
| Current effect: blocks C-241 premium charter and weakens schedule resilience                                    |
+------------------------------------------------------------------------------------------------------------------+
| Coverage Gap Summary                                           | Selected Package                                  |
|----------------------------------------------------------------+---------------------------------------------------|
| Category: King Air pilots                                      | Contract pool: King Air qualified pilots          |
| Current state: Tight                                           | Coverage added: +1 active crew band               |
| Current capacity: enough for current assignment only           | Cost model: variable, per active day              |
| Required for blocked opportunity: +1 additional coverage       | Daily cost when active: $1,850                    |
|----------------------------------------------------------------+---------------------------------------------------|
| Options                                                        | What this unlocks                                 |
| 1. Direct hire package                                         | - removes blocker on C-241                        |
|    Higher fixed cost, better long-run economics                | - adds same-day charter flexibility               |
| 2. Contract pool                                               | - preserves cash while testing demand             |
|    Higher marginal cost, immediate flexibility                 |                                                   |
| 3. Service agreement / outsource support                       | What this risks                                   |
|    Not valid for this pilot need                               | - higher variable cost than direct hire           |
|----------------------------------------------------------------+---------------------------------------------------|
| Financial Preview                                              | Decision Footer                                   |
| Cash after setup: $412,000                                     | Fixed cost delta: +$0                             |
| New variable exposure: +$1,850 active day                      | Variable cost delta: +$1,850 / active day         |
| Weekly upside if C-241 becomes routine: strong                 | Time to activate: immediate                       |
|                                                                | [Add contract pool] [Compare hire]                |
+------------------------------------------------------------------------------------------------------------------+
```

## Information Hierarchy Notes

- This screen is a transaction-focused staffing flow, not the broader staffing overview screen.
- The player must see the before-and-after operational effect, not just labor cost.
- Invalid staffing models should still appear where useful so the player understands why they do not apply.

## Key Interactions

- the top context should change depending on entry point: blocked contract, new aircraft, maintenance expansion, or fleet growth
- choosing a package updates both cost preview and unlocked opportunities
- compare-hire mode should open a side-by-side package comparison, not a new full-page branch

## Wireframe Tensions

- This flow will fail if it becomes indistinguishable from the broader Staffing screen.
- The biggest UX challenge is showing labor as capability purchase, not headcount trivia.
- Some staffing categories will need more location specificity later, especially mechanics and service agreements.
