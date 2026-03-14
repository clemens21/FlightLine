# Visual Direction Brief

## Purpose

This document turns the current UI strategy into a tighter visual brief for wireframing and later UI design.

It is intentionally opinionated. The goal is to prevent generic airline-management UI and to ensure light and dark mode are designed deliberately from the start.

## Design Thesis

FlightLine should look like premium modern operations software built for airline managers, not a toy tycoon game, not a retro spreadsheet, and not a fake glass cockpit.

The interface should feel:

- confident
- exact
- calm under pressure
- information-rich
- distinctly modern

## Style Lane

Working style lane:

- `premium operations desktop`

This means:

- dense tables and timelines are welcome
- hierarchy is sharp and controlled
- surfaces are layered, not flat
- color is used purposefully, not constantly
- motion supports orientation instead of decoration

## Borrow From Genre References

The airline-management references you found are useful for structure.

Patterns worth borrowing:

- strong shell with persistent company state
- dense fleet and contract tables
- route and dispatch timelines
- geography as supporting context rather than permanent clutter
- compare drawers or side panels for decisions

## Improve On Genre References

The genre often gets structure right but visual craft wrong.

FlightLine should improve by delivering:

- cleaner typography hierarchy
- stronger whitespace discipline
- more legible status systems
- fewer visually noisy gradients and gimmicks
- equal quality in light and dark mode
- charts and tables that look intentional rather than default-library output

## Avoid Entirely

- purple-heavy generic SaaS palettes
- military or avionics cosplay
- neon cyber aesthetics
- faux-metal or glossy dashboard chrome
- oversized toy-like cards replacing operational density
- flat monochrome enterprise screens with no hierarchy

## Layout Grammar

The product should consistently use these layout primitives:

- persistent top shell for time, cash, and alerts
- left-side filtering or navigation where needed
- main canvas for tables, timelines, or maps
- right-side detail or compare drawer for decision support
- sticky bottom action bars only when commitment is required

## Density Rules

- Top-level screens should be information-dense, but each section must have a single obvious headline metric.
- Rows, chips, and panels should compress well without becoming cramped.
- Avoid giant empty gutters on desktop.
- Use spacing to separate decision groups, not to make the app feel artificially luxurious.

## Typography Direction

Recommended font roles for early design exploration:

- headings: `Space Grotesk` or a similarly geometric but controlled display face
- UI/body: `IBM Plex Sans` or a similarly technical, highly legible sans
- numeric/identifier accents: `JetBrains Mono` or a similar compact mono

The exact family can change later. The important characteristics are:

- strong numeric legibility
- clear distinction between headline and dense data text
- enough personality to avoid generic enterprise UI

## Color Strategy

Use one primary brand accent and one secondary operational accent.

Recommended lane:

- primary accent: deep aviation blue
- secondary accent: amber-orange for action and emphasis

Semantic colors should remain conventional and readable:

- success: green
- warning: amber
- danger: red
- info: blue

## Light Mode Direction

Light mode should feel:

- bright
- crisp
- professional
- slightly warm rather than sterile white

Suggested starting characteristics:

- soft mineral or ivory background
- white or near-white raised surfaces
- slate text
- blue action accents
- amber used sparingly for urgency and suggested action

## Dark Mode Direction

Dark mode should feel:

- rich
- controlled
- high-contrast without glowing
- editorial rather than gamer-themed

Suggested starting characteristics:

- charcoal or deep blue-black background
- slightly elevated navy-charcoal panels
- pale neutral text
- restrained accent saturation
- careful chart tuning to avoid muddy blends

## Component Direction

### Summary Cards

- Use only for top-level KPIs and high-value summaries.
- Avoid turning every data point into a card.
- Cards should feel crisp and compact, not oversized.

### Tables

- Tables are a primary interaction pattern, not a fallback.
- Rows need strong hover, selection, and status behavior.
- Dense tables should remain comfortable in both themes.

### Status Chips

- Short labels
- low visual noise
- color plus text meaning
- should work in large counts without becoming confetti

### Timelines

- Dispatch timelines should feel precise and operational.
- Revenue legs and reposition legs must be clearly differentiated.
- Time blocks need readable conflict and warning states.

### Charts

- Finance charts should support explanation, not decoration.
- Prefer a few high-quality chart types over many mediocre ones.
- Use labels and subtitles so charts remain interpretable in both themes.

### Maps

- Map should support geographic reasoning, not become a permanent wallpaper.
- Use muted basemaps and clear overlays.
- Aircraft, demand, and route overlays should be legible at a glance.

## Motion Direction

Use motion sparingly and deliberately.

Good uses:

- drawer open and close transitions
- timeline updates during time advancement
- subtle highlight on changed metrics
- theme transitions if they remain fast and clean

Avoid:

- constant pulsing alerts
- floating card gimmicks
- decorative motion on dense operational screens

## Light And Dark Mode Rule

Neither theme is the fallback version.

Every important surface should be designed twice:

- dashboard summary behavior
- table readability
- status chip contrast
- chart palette legibility
- map overlay clarity

## Wireframe Interpretation Rules

When moving from wireframe to visual design:

- preserve the documented information hierarchy
- do not replace dense comparison views with card galleries
- keep action placement stable across screens
- make alert priority legible without shouting constantly
- ensure the shell always feels present and useful

## Success Test

The visual system is on the right track if the product feels like:

- a modern airline operations command surface
- something a player could stare at for long sessions without fatigue
- distinctly premium without becoming flashy
- equally desirable in light and dark mode
