# MSFS Aircraft Alignment

## Purpose

This document defines how FlightLine should use Microsoft Flight Simulator aircraft availability as product metadata.

The goal is not to force the entire FlightLine roster to mirror the latest simulator ecosystem. The goal is to tell the player which aircraft they can also fly in the latest MSFS title while still allowing FlightLine to model a broader real-world airline catalog.

## Current Verified Platform State

As of March 14, 2026, the latest Microsoft Flight Simulator title is `Microsoft Flight Simulator 2024`.

Current source-backed MSFS paths relevant to FlightLine include:

- first-party aircraft listed on the official MSFS aircraft manuals page
- first-party aircraft confirmed in current official release notes
- official add-on packages such as the ATR Expert Series bundle
- third-party paid aircraft sold for MSFS 2024
- third-party freeware aircraft with official compatibility statements

## Design Rule

FlightLine should treat `MSFS overlap` as a user-facing crosswalk layer, not as the master rule for what aircraft may exist in the game.

That means two things can be true at the same time:

- FlightLine should maintain a strong source-backed MSFS overlap subset because many players will value it
- FlightLine should also include real-world aircraft that are strategically valuable to the management sim even when they are not currently confirmed in MSFS

## What MSFS Metadata Is For

The MSFS layer should help the game answer these questions clearly:

- can the player fly this aircraft in the current MSFS ecosystem?
- is the path first-party, official add-on, third-party paid, freeware, or currently not verified?
- which examples or products should the UI mention?
- when was that status last checked?

It should not decide whether the aircraft belongs in the broader FlightLine world roster.

## Current Status Model

Recommended current status values per aircraft model:

- `confirmed_available`
- `confirmed_unavailable`
- `not_verified`

Recommended current metadata fields:

- `msfs2024_available_for_user`
- `msfs2024_status`
- `msfs2024_included_tier`
- `msfs2024_distribution_channels`
- `msfs2024_example_products`
- `msfs2024_source_refs`
- `msfs2024_user_note`
- `msfs2024_last_verified_on`

## Product Implication

FlightLine should maintain two overlapping roster lenses.

### 1. Core World Roster

This is the full game catalog.

It should include:

- aircraft that matter for airline, cargo, commuter, charter, and progression gameplay
- aircraft that create meaningful mission lanes and operating tradeoffs
- aircraft that the game economy, airport model, and staffing systems need even if MSFS overlap is weak or absent

### 2. MSFS Overlap Subset

This is a filterable subset inside the world roster.

It should include aircraft with source-backed current MSFS availability paths and should be visible in the UI as:

- a filter
- a badge or note on aircraft detail
- a possible future integration affordance

## Data Modeling Implication

MSFS metadata should live on the aircraft model record and be queryable in the user catalog.

The aircraft catalog itself should remain broader than that overlap layer.

## Non-Goal

FlightLine should not attempt to mirror every single aircraft listing that exists across:

- the in-game Marketplace
- direct third-party stores
- freeware installers
- community mod repositories

That ecosystem is too unstable and too store-shaped to be the canonical game roster.

## Recommended Next Step

Use the broadened aircraft database to support:

- player-facing MSFS filters and badges
- aircraft market generation
- airport compatibility filtering
- route and contract fit logic
- future manual or automatic MSFS integration hooks

## Source Notes

Primary sources used for the current MSFS-alignment approach include official MSFS release notes, the official aircraft manuals page, official add-on product pages, and official vendor/freeware project pages for the confirmed-overlap aircraft in the current roster.
