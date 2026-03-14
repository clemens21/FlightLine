# Airport Bootstrap Findings

## Purpose

This document captures what the local FlightLine airport database actually contains after the first real build and enrichment pass.

The point is to anchor strategy in the implemented data model instead of treating airport support as an abstract plan.

## Current Database State

As of March 13, 2026, the local airport database contains:

- `87,921` airports
- `48,321` runway rows
- `30,216` airport frequency rows
- `249` country records
- `3,942` region records
- `27,765` airports currently marked `accessible_now` under the fixed-wing heuristic
- `3,114` legacy-only airports preserved because they do not appear in the current OurAirports snapshot

Other useful counts from the current build:

- `4,419` airports with `scheduled_service = 1`
- `4,658` airports with `home_link`
- `16,668` airports with `wikipedia_link`
- `21,000` airports with `keywords`
- `44,675` runways with populated `width_ft`
- `1,019` runways marked closed
- `12,304` runways marked lighted

## What Improved Versus The Legacy Bootstrap

The enriched database now has capabilities that the legacy JSON did not provide reliably:

- structured runway width
- explicit runway lighted and closed flags
- runway-end identifiers and end geometry
- airport frequency rows
- country and region lookup tables
- scheduled-service flags
- corrected current names for many airports with legacy encoding problems
- home links, Wikipedia links, and keyword metadata for many airports

## What Is Still Missing

The current airport database is much better, but it is still not complete.

Known gaps:

- timezone is now populated for all airports using offline lat/lon lookup
- the source merge is still mostly `ident`-based, so later identity resolution should get stronger
- FAA enrichment is still needed for stronger U.S. authority and validation
- some legacy airports still have only fallback data quality
- game-authored demand, market, and maintenance tags are still unpopulated

## Strategy Consequences

The airport strategy should now assume:

- current OurAirports data is the primary global base layer
- legacy AirportsAndRunways JSON is a fallback layer, not the authoritative base
- the game can ship with a broad global airport reference set while still exposing only a supported subset
- airline gameplay should not treat heliports, seaplane bases, balloonports, or closed airports as part of the normal fixed-wing contract pool until explicitly supported
- contract generation should only use airports that pass the current access rules unless a special archetype says otherwise

## Implementation Consequences

The next airport-data work should focus on:

- optional later validation of timezone quality against authoritative sources
- FAA U.S. enrichment and override rules
- stronger source-identity matching across codes and regions
- derived airport-pair data for contract generation
- game-authored airport demand and maintenance tags

## New Derived Fields

The local airport database now also carries two gameplay-facing derived fields:

- 	imezone: calculated from latitude/longitude for every airport
- irport_size: a simplified 1 to 5 scale used for gameplay and UI grouping while preserving the raw irport_type`r

Current irport_size scale:

- 1: specialty, closed, or too limited for standard airline play
- 2: local utility airport
- 3: regional airport
- 4: commercial airport
- 5: major commercial hub

