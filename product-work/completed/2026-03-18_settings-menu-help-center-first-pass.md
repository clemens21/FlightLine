# Settings-Menu Help Center First Pass

## Main Conclusion

FlightLine should ship a small in-game `Help Center` opened from the settings menu, not a large manual.

The first pass should be a hybrid help system built around three jobs:

- explain the current vertical-slice loop in plain language
- help a confused player diagnose why they are blocked
- tell a stuck player what to do next

This should stay tightly user-facing.
It should not become a developer wiki, a hidden systems codex, or a wall of articles.

The correct first-pass product shape is:

- one `Help` entry in the settings menu
- a dedicated help overlay or sheet opened from that entry
- a compact library of short task guides, blocker guides, and concept primers
- a strong `What should I do next?` landing path for recovery

## Recommended Help-Doc Structure

The help system should be hybrid, but it should lean task-first.

Recommended top-level structure:

1. `Help Home`
- short search field or quick-find input
- `What should I do next?` entry
- `Common blockers` shortcuts
- `Core workflow` shortcuts
- `Current tab` shortcut when opened from a workspace later

2. `Do This Next`
- short task guides for the main loop
- built for players who understand the game only partially and need a next action

3. `Why Am I Blocked?`
- short troubleshooting entries for common confusion states
- written around visible symptoms, not internal system names

4. `Key Concepts`
- short primers for FlightLine terms that the player keeps seeing
- these should support task guides, not replace them

This structure is intentionally small.
If a player is confused, they should not need to decide between ten documentation categories.

## First-Pass Help Topics

These are the most important first-pass topics for the vertical slice.

### Core Workflow

- `What should I do next?`
- `How the FlightLine loop works`
- `How to go from available work to a flown contract`

### Contracts

- `How Contracts work`
- `How to read Available, Accepted, and Closed contracts`
- `How to choose a contract your company can actually handle`

### Aircraft

- `Why an aircraft can or cannot take work`
- `Location, availability, and maintenance in plain language`

### Staff

- `What Staff means in the current slice`
- `How staffing coverage blocks or unlocks operations`

### Dispatch

- `How Dispatch works`
- `What Dispatch validation is telling you`
- `Why a dispatch is blocked`

### Time And Calendar

- `How Time Advance works`
- `What the calendar is for`
- `Why the clock paused or stopped`

### Cash Flow

- `Where money comes from`
- `Why cash dropped`
- `How contracts, staffing, aircraft, and time create cash pressure`

### Stuck-State Troubleshooting

- `I accepted work and do not know what to do next`
- `I cannot dispatch this contract`
- `I do not have enough staffing coverage`
- `My aircraft is unavailable`
- `I advanced time and something stopped`
- `I am losing money and do not know why`

## Suggested Article Or Entry Format

Each help entry should be short and predictable.

Recommended format:

1. `What this is`
- one or two sentences in plain language

2. `Why you might be stuck`
- two to four common player-facing reasons

3. `What to do next`
- a short ordered action list

4. `Where to go`
- direct links or references to the relevant game surfaces

5. `Related topics`
- one to three nearby entries only

Recommended length:

- target: 150 to 350 words
- soft ceiling: about 450 words

If an entry needs much more than that, it is probably trying to explain too much at once and should be split.

## Settings-Menu Access Recommendation

Settings should own the entry point, but not the entire reading experience.

Recommended first pass:

- add a `Help` or `Help Center` action to the settings popover
- opening it should launch a larger in-shell overlay, drawer, or modal sheet
- the player should keep their current save context and return to the same tab when they close help

Do not try to read articles inside the tiny settings popover itself.
That would be cramped and low-value.

The settings menu should only act as the doorway.
The actual help surface should have enough room for:

- a short search or quick-find field
- category shortcuts
- article body
- related-topic links

## Writing Principles For Player-Facing Help

- write for a player, not for a systems designer
- explain what the player sees and what they should do next
- use the same names the UI uses:
  - `Contracts`
  - `Aircraft`
  - `Staff`
  - `Dispatch`
  - `Time Advance`
  - `Calendar`
  - `Cash`
- define a concept once, then stay consistent
- avoid internal terminology like schema, command names, canonical state, or model ids
- prefer examples of player situations over abstract system explanations
- explain blockers in plain language
- keep each entry actionable
- stop before the article becomes a manual

Help content should preserve explainability, but it does not need to reveal every simulation rule or every edge-case formula.

## Explicit Non-Goals

The first pass should explicitly not become:

- a giant manual covering every system detail
- a developer knowledge base
- a lore codex
- a full onboarding tutorial system
- a voice, video, or cinematic tutorial feature
- a second activity log
- a second dispatch planner
- a search-heavy encyclopedia of every term and edge case
- a place that documents hidden mechanics the UI itself does not explain

## Acceptance Criteria For Ready To Hand Back To Mara

This help-doc approach is ready for Mara framing when:

- the help system is clearly defined as a small settings-launched `Help Center`
- the first-pass structure is task-first, not manual-first
- the initial topic set covers the current vertical-slice loop and the most common stuck states
- each entry format is short, repeatable, and action-oriented
- `What should I do next?` is treated as a first-class recovery path
- the approach uses the same player-facing language as the game UI
- settings-menu help is clearly separated from a larger in-shell reading surface
- explicit non-goals prevent this from expanding into a large codex or tutorial program
- current-slice help is clearly separated from later richer help systems

## Open Questions That Actually Matter

- Should the first pass include a lightweight search field, or is category-first navigation enough for now?
- Should help open to a neutral home view every time, or should it bias toward the currently open tab when launched from inside a workspace?
- Should blocker-heavy surfaces such as Dispatch, Staffing, and Time Advance link directly into specific help entries in v1, or is settings-only entry enough for the first pass?
- Should the `What should I do next?` entry stay static in the first pass, or should it reflect a few basic save-state signals later?
- Should activity-log entries or major blocked states include a `Learn more` link later, or should that stay out until the base help library proves useful?

## Current Slice Versus Later

### Current Slice

- settings-launched `Help Center`
- short hybrid library:
  - task guides
  - troubleshooting guides
  - concept primers
- strong stuck-player recovery path
- small topic set focused on Contracts, Aircraft, Staff, Dispatch, Time Advance, Calendar, and Cash

### Later

- deeper contextual linking from blocked states
- smarter state-aware `What should I do next?`
- richer search
- broader help coverage as new systems become real
- more advanced examples once the vertical slice expands
