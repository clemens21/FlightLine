# UI Information Architecture

## UX Goal

The UI should make FlightLine feel like a modern operations product designed for fast, confident decision-making.

It should be:

- data-dense but calm
- modern, not generic
- equally strong in light and dark mode
- optimized for repeated daily use
- readable on laptops and large desktop monitors

## Core UX Principles

### 1. Important Numbers First

At any moment, the player should be able to identify:

- cash position
- aircraft availability
- staffing coverage
- active problems
- best next opportunities
- company performance trend

### 2. Comparison Before Commitment

Most workflows should support side-by-side comparison before the player confirms a decision.

Examples:

- compare contracts for the same aircraft
- compare aircraft for the same contract
- compare buy versus finance versus lease options
- compare hire versus contract versus outsource staffing options
- compare dispatch now versus maintain now

### 3. Dense Information Without Noise

The game should embrace operational density, but hierarchy must be sharp.

Use:

- strong typography contrast
- restrained color accents
- grouped related metrics
- progressive disclosure for details
- clear empty, warning, and blocked states

### 4. One Surface, Multiple Lenses

The player should be able to move between map, table, timeline, and detail views without losing context.

### 5. Light And Dark Are First-Class Themes

Do not design one theme and invert it later.

Both themes need:

- tuned contrast values
- intentional elevation layers
- chart palettes that remain readable
- warning and success colors that preserve meaning
- surfaces that feel native to the same design system

## Recommended Navigation Model

Primary navigation for MVP:

- Dashboard
- Contracts
- Fleet
- Staffing
- Dispatch
- Maintenance
- Finance
- World

Persistent top-level shell should also include:

- current company summary
- current game time
- active alerts
- quick time controls
- global search or quick-jump later

## Screen Architecture

### Dashboard

Purpose:

- answer "what needs my attention right now?"

Should show:

- cash and trend
- today or current-period profit summary
- aircraft status summary
- staffing shortfalls or qualification gaps
- urgent contracts or deadlines
- maintenance due soon
- dispatch bottlenecks
- recommended next actions

### Contracts Board

Purpose:

- browse and filter work opportunities

Should show:

- contract list with sorting and filters
- map preview
- estimated margin
- fit score for selected aircraft or fleet
- deadline pressure
- staffing blockers if any
- accept and plan actions

### Fleet View

Purpose:

- understand fleet composition and health

Should show:

- aircraft cards or rows with role, status, condition, and location
- utilization metrics
- financial burden by aircraft
- maintenance outlook
- quick links to dispatch, service, or acquisition actions

### Staffing View

Purpose:

- understand operating capacity and labor cost structure

Should show:

- pilot, cabin, mechanic, and support coverage
- qualification gaps by fleet role or aircraft family
- fixed versus variable labor cost mix
- direct hire, contract, and service agreement options
- which schedules or aircraft are blocked by staffing

### Aircraft Detail

Purpose:

- inspect a single airframe deeply

Should show:

- current status and location
- assignment queue
- financial performance history
- condition and maintenance trend
- hours, cycles, and service history
- staffing requirements for operation
- recommended next actions

### Dispatch Board

Purpose:

- plan and validate schedules

Should show:

- aircraft timeline
- current and future legs
- conflicts and validation errors
- reposition legs clearly separated from revenue legs
- estimated profit and risk for the schedule
- staffing and qualification checks inline

### Maintenance View

Purpose:

- plan downtime before it becomes a problem

Should show:

- aircraft needing attention now
- aircraft trending toward service limits
- downtime forecast
- service cost estimate
- maintenance queue and capacity assumptions
- mechanic or vendor capacity where relevant

### Finance View

Purpose:

- explain where money is made and lost

Should show:

- revenue and expense breakdowns
- profit by aircraft
- profit by contract type
- labor cost split by category and model
- idle cost visibility
- lease and finance burden
- maintenance spend trend

### World View

Purpose:

- visualize network footprint and opportunity geography

Should show:

- airport map
- current aircraft positions
- demand or contract density overlays later
- route reach previews for selected aircraft

## Preferred Layout Language

Use a hybrid of:

- high-value summary cards for top-level state
- dense tabular views for comparison
- timeline panels for scheduling
- contextual drawers or side panels for detail
- maps only where geography improves the decision

Avoid making every screen card-only. Operational games need tables and timelines.

## Genre Reference Direction

Your note about finding good references by searching for "airline management UI" is useful and directionally correct.

That genre search tends to surface the right structural patterns for this game:

- network or world maps as supporting context
- dense fleet tables with status chips and key metrics
- dispatch timelines or route boards
- finance dashboards with a few prominent KPIs and a lot of secondary drill-down
- side panels and compare drawers for decision-making

The design goal should not be to imitate those references literally. It should be to borrow the proven information architecture patterns while modernizing the visual system.

That means:

- keep the operational density
- improve hierarchy and readability
- avoid dated enterprise styling
- design light and dark mode deliberately from the start
- create a stronger sense of premium product craft than most genre references have

## Visual Direction

The visual language should feel like premium modern operations software rather than consumer travel booking or fake aviation skeuomorphism.

Recommended characteristics:

- clean geometric structure
- generous spacing around major sections, tighter spacing inside data groups
- expressive but restrained typography
- subtle depth and layered surfaces
- charts that look editorial and intentional, not default library output

Avoid:

- neon cyber aesthetics
- military cockpit mimicry
- glossy fake dashboards
- generic SaaS templates with aviation labels pasted on

## Theme Strategy

Define a design token system early.

Key token groups:

- background surfaces
- elevated surfaces
- primary text
- secondary text
- borders and dividers
- accent colors
- success, warning, danger, info states
- chart series
- map overlays

Light mode should feel bright, crisp, and professional.
Dark mode should feel rich and legible, not muddy.

## Motion And Feedback

Motion should help orientation, not decorate the UI.

Good uses:

- panel transitions when drilling into aircraft or contracts
- subtle timeline updates during time advancement
- attention-guiding highlights when a state changes
- smooth theme transitions if performance allows

Avoid constant motion in dense data views.

## Accessibility Requirements

- keyboard-friendly navigation for frequent workflows
- readable contrast in both themes
- color is never the only status indicator
- scalable typography for dense screens
- chart and alert states with text labels

## UI Research Intake

As visual references come in, evaluate them against five questions:

- Does this style support dense operational data?
- Does it remain usable in both light and dark mode?
- Does it help the player compare options quickly?
- Does it feel modern without becoming trend-chasing?
- Can it scale from one-aircraft play to large-fleet management?

## MVP UI Priority

The MVP UI only needs to excel at three things:

- showing what matters now
- comparing options clearly
- committing schedules with confidence

Everything else should support those three jobs.
