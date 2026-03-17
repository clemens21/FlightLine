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
- compare buy versus loan versus lease options
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

## Wireframe Takeaways

The first-pass wireframes added a few constraints that should now be treated as architectural decisions:

- Dashboard is a routing screen, not a mini version of the app.
- Contracts need stronger visual separation between `available`, `accepted/active`, and `closed` work.
- Dispatch is single-aircraft-first in MVP.
- Aircraft should split `Fleet` and `Market` into separate jobs inside one workspace.
- Staffing Overview and Staffing Acquisition are different screens with different UX goals.
- Aircraft Acquisition must keep mission fit, payment structure, and staffing impact visible together.

## Recommended Navigation Model

Primary navigation for MVP:

- Dashboard
- Contracts
- Aircraft
- Staffing
- Dispatch

Persistent top-level shell should also include:

- save slot and company identity
- compact cash summary
- current game time
- settings access
- activity log access through settings

## Transactional Surface Rule

Not every important action deserves a top-level nav item.

These should exist as dedicated transactional surfaces reached from overview screens:

- Aircraft Market
- Staffing activation flow
- later, Maintenance Transaction Flow

That keeps navigation stable while still allowing serious task depth.

## Screen Architecture

### Dashboard

Purpose:

- answer "what needs my attention right now?"

Should show:

- one strong recommended next action
- cash and short-term pressure
- top alerts and blockers
- today or current-period timeline highlights
- quick routes into contracts, aircraft, staffing, and dispatch

Should not try to show:

- full contract comparison
- full dispatch planning
- full finance reporting

### Contracts Board

Purpose:

- browse and compare work opportunities with strong state clarity

Should show:

- visible separation between available, accepted/active, and closed work
- contract list with sorting and filters
- route map pinned beside the board
- route planner in the same side rail
- fit score for current fleet/company
- deadline pressure
- planner-guidance context for chaining work

### Dispatch Board

Purpose:

- plan and validate one aircraft schedule at a time

Should show:

- aircraft timeline
- current and future legs
- conflicts and validation errors
- reposition legs clearly separated from revenue legs
- estimated profit and risk for the schedule
- staffing and qualification checks inline
- route-plan handoff for accepted-ready contract chains

Design rule:

- network-scale scheduling is a later screen problem, not an MVP dispatch problem

### Aircraft Workspace

Purpose:

- manage owned aircraft and acquisition from one top-level workspace

Should show:

- internal `Fleet` and `Market` sub-tabs
- `Fleet` for owned-aircraft comparison and detail
- `Market` for acquisition browsing and deal confirmation

### Fleet View

Purpose:

- compare owned aircraft and decide where attention goes next

Should show:

- table of owned aircraft with location, ownership, condition, mission profile, and next milestone
- selected-aircraft brief on the right
- local versus network crew-readiness context
- maintenance and assignment context
- why-this-aircraft-matters summary

### Aircraft Market

Purpose:

- browse live aircraft listings and commit to one acquisition path

Should show:

- large rolling listing table
- selected listing pane
- location radius filtering
- condition and maintenance context
- `Buy`, `Loan`, and `Lease`
- compact second-step deal confirmation for loan and lease term choices

### Staffing Overview

Purpose:

- understand operating capacity and labor bottlenecks

Should show:

- pilot, cabin, mechanic, and support coverage
- qualification gaps by fleet role or aircraft family
- fixed versus variable labor cost mix
- which schedules or aircraft are blocked by staffing
- recommended next staffing actions

### Staffing Acquisition

Purpose:

- solve one staffing gap through a concrete hire, contract, or outsource decision

Should show:

- current gap and what it blocks
- direct hire, contract, and service options
- cost preview
- unlocked capability preview
- activation timing and limitations

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

## Shell Utilities

Two low-frequency surfaces should stay in the shell, not the main nav:

- `Clock / Calendar`
- `Settings`

### Clock / Calendar

The clock is a clickable top-right control that opens:

- simulation rate controls
- calendar grid
- selected-day agenda
- selected-day simulate action with milestone warnings

### Settings

Settings should hold:

- theme switching
- activity popup mode
- activity log access
- back-to-saves style shell actions

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
