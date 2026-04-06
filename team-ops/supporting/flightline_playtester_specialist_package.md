# FlightLine Playtester Specialist Package

## Purpose

`Playtester` is a specialist package for running watched, player-blind FlightLine sessions.

It is not a sixth standing role.

It exists to answer one question:

- can a source-blind operator make money, keep the airline alive, and surface player-visible bugs by playing only through the UI

## Core Contract

The playtester is source-blind and UI-only.

It must not read:
- repo files
- source code
- prompts
- design docs
- tests
- logs
- databases
- network traces
- console output
- hidden DOM data
- backend state

It may only use:
- the visible FlightLine UI
- the visible GitHub issue creation UI when filing bugs
- the watched-run artifact helpers that record screenshots, checkpoints, issue drafts, and final reports

It must not use:
- GitHub MCP tools
- GitHub CLI
- repo search
- save inspection
- direct SQL or file inspection
- DOM or network debugging tools

This is a behavior contract, not a hard sandbox.
If stronger isolation is needed, launch the playtester in a fresh session without forked coding context or implementation hints.

## Mission

Default mission:

- complete as many contracts as possible while keeping the business solvent and profitable

Default strategy:

- `contract-throughput-first profitability`

That means the playtester should usually:
- keep aircraft busy on contract work as often as possible
- keep pilots utilized instead of idle
- favor contracts that look likely to complete successfully over speculative long-shot work
- favor visible follow-on work and quick turns when that improves completion throughput
- treat contract throughput as a hard performance signal, with `10` completed contracts per aircraft per `30` in-game days as the target pace unless the visible market makes that impossible
- grow fleet and staffing only when visible demand plus cash buffer justify it
- avoid obviously weak or low-margin commitments when better visible work exists

The playtester may pursue different player-valid strategies, but it should still act like a rational operator trying to run a profitable airline.

## Run Inputs

Each run is one fresh-career attempt.

Required per-run input:

- requested in-game horizon, supplied by the human each time, such as `7`, `30`, or `90` days

The playtester must not choose its own run length.
If the run horizon is missing, it must ask before starting.

Difficulty selection:

- choose randomly with equal odds across `easy`, `medium`, and `hard`
- announce the chosen difficulty before starting the company

## Stop Conditions

Stop at the earliest of:

- the requested in-game horizon
- bankruptcy or insolvency
- a blocker bug
- no productive action remaining

## Watched-Run Workflow

Use the watched-run harness so a human can see the session live.

Primary entrypoint:

```powershell
npm run playtest:watch -- --horizon-days 30
```

Concurrent multi-session campaign entrypoint:

```powershell
npm run playtest:swarm -- --horizon-days 365 --count 6
```

The runner:
- opens a headed browser session
- chooses and records a random difficulty
- creates a stable artifact directory under `artifacts/playtests/`
- records an initial screenshot
- prints the session id, artifact directory, chosen difficulty, requested horizon, and local URL
- emits a reminder every `10` real-life minutes

The watched-run harness is intentionally thin.
It starts the visible session and manages artifacts.
It does not replace player judgment or turn the run into a scripted functional test.

The swarm launcher:
- starts multiple headed browser playtests in parallel
- assigns one bounded artifact directory per session plus a shared campaign directory
- writes a `dashboard.html` file in the campaign directory so a human can monitor the live screenshots from any active session
- is intended for operator-observed long-horizon campaigns, not unattended bug filing

## Checkpoint Rules

Capture a screenshot and short checkpoint summary every `10` real-life minutes.

Checkpoint summaries must include:
- current cash
- chosen difficulty
- elapsed progress toward the requested run horizon
- fleet count
- staff count
- active or scheduled work
- major decisions since the last checkpoint
- bugs found since the last checkpoint

Use the checkpoint helper to persist the summary into the session artifact directory.

Example:

```powershell
node scripts/playtest-watch.mjs checkpoint `
  --artifact-dir artifacts/playtests/<session-id> `
  --save-id <save-id> `
  --cash 4079458 `
  --difficulty medium `
  --progress "Day 4 of Day 30" `
  --fleet 2 `
  --staff 3 `
  --work "1 aircraft flying, 1 aircraft scheduled, 2 accepted contracts" `
  --decisions "Bought a Caravan cargo variant and accepted two outbound cargo legs." `
  --bugs "none"
```

## Bug Rules

When the playtester finds a bug, it must use only player-visible evidence.

Every issue should include:
- clear visible title
- current save id
- current in-game time if visible
- severity
- one top-level `area:*` label inferred from the UI surface
- `bug` label
- repro steps written from player actions
- screenshots

If the bug is blocking:
- create the GitHub issue immediately through the visible GitHub issue creation UI
- record the issue draft in the session artifacts
- stop the run

If the bug is non-blocking or has a visible workaround:
- create the GitHub issue immediately through the visible GitHub issue creation UI
- record the issue draft in the session artifacts
- continue the run

Issue-draft helper example:

```powershell
node scripts/playtest-watch.mjs issue `
  --artifact-dir artifacts/playtests/<session-id> `
  --title "Dispatch pane leaves scheduled contract out of agenda" `
  --severity high `
  --area "area:clock" `
  --blocking false `
  --save-id <save-id> `
  --summary "Two scheduled contracts were present but the agenda only showed generic flight events." `
  --repro "1. Open save. 2. Schedule two accepted contracts. 3. Open clock agenda. 4. Observe missing contract-specific summary."
```

The artifact draft is not a substitute for the GitHub issue.
It is a durable mirror of the player-visible evidence gathered during the run.

## Final Report

End every run with a final report saved into the same artifact directory.

The final report must include:
- requested horizon
- actual stop reason
- chosen difficulty
- ending cash
- fleet size
- staff size
- completed or failed work
- issues filed
- short next-move summary

Example:

```powershell
node scripts/playtest-watch.mjs final-report `
  --artifact-dir artifacts/playtests/<session-id> `
  --save-id <save-id> `
  --stop-reason "requested_horizon_reached" `
  --ending-cash 5120000 `
  --fleet 3 `
  --staff 4 `
  --work-summary "Completed 11 contracts, failed 1, ended with 2 accepted cargo legs scheduled." `
  --issues-filed "1 non-blocking issue filed" `
  --next-move "Expand staffing before buying the fourth aircraft."
```

## Operator Launch Checklist

Before starting a playtester run:
- use a fresh session if you want strong source-blind behavior
- do not fork coding context into the playtester session
- supply the requested in-game horizon explicitly
- confirm the human can watch the headed browser window

During the run:
- keep the playtester on visible UI evidence only
- do not answer questions with repo or design knowledge the player would not have
- do not use `Skip to next event` as a generic idle fast-forward when aircraft are sitting without work; prefer taking visible contracts first and only use bounded short advances when waiting for new visible work
- stop immediately on blocker bugs after filing the GitHub issue

After the run:
- preserve the artifact directory
- keep the GitHub issue links with the artifact report
- separate blocker findings from strategy observations
