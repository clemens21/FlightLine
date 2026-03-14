# Airport Data Strategy

## Purpose

This document defines how FlightLine should build and maintain its airport database for all airports that can be made accessible in the game.

This covers:

- what data the game actually needs
- what sources should provide it
- what licensing or commercial constraints matter
- how to normalize it into one game-ready airport model

## Core Principle

Not every field should be sourced, and not every source should be treated equally.

We should split airport data into three categories:

- source-of-truth aviation facts
- derived simulation fields
- game-authored fields

## What The Game Needs Per Airport

### Required MVP Fields

- stable airport identifier
- ICAO, IATA, GPS, and local codes where available
- airport name
- raw airport type
- latitude and longitude
- elevation
- country and region
- municipality or served city
- scheduled service flag where available
- runway records:
  - length
  - width
  - surface
  - lighted flag
  - closed flag
  - runway end identifiers
- communication frequencies later if used in UI

### Strongly Recommended Derived Fields

These should be computed during normalization, not typed by hand:

- longest runway length
- longest hard-surface runway length
- airport accessibility by aircraft class
- rough airport size tier
- rough infrastructure tier
- candidate passenger suitability score
- candidate cargo suitability score
- remote or hub classification inputs
- timezone

### Game-Authored Fields

These should be created by FlightLine logic, not treated as raw source data:

- demand archetype
- tourism, business, cargo, remote utility tags
- maintenance capability band
- contract generation weighting
- market or region grouping for progression

## Accessibility Rule

The raw database may contain more airports than the game exposes at first.

Recommended split:

- `in_database`: airport exists in the normalized data set
- `accessible_now`: airport is valid for at least one supported aircraft class and game mode
- `hidden_or_excluded`: airport exists, but is filtered out by product or gameplay rules

This prevents us from deleting useful world data just because MVP support is narrower.

## Recommended Source Stack

### 1. Global Base Layer: OurAirports

Recommended use:

- primary global open base for airports, runways, frequencies, countries, and regions

Why:

- official download page states the CSV data dump is updated nightly
- data is released to the Public Domain
- airport, runway, frequency, country, and region files are available
- field documentation is published publicly

Best use in FlightLine:

- global base ingestion layer
- default source for non-US airports unless a stronger country-specific source is added later

### 2. U.S. Enrichment Layer: FAA Aeronautical Data / NASR

Recommended use:

- authoritative U.S. enrichment source for airport, frequency, identifier, and related aeronautical records

Why:

- FAA publishes aeronautical data through its Aeronautical Data portal
- the 28-day NASR subscription includes CSV downloads
- the page explicitly lists Airports and Other Landing Facilities, frequencies, identifiers, and other aeronautical data in CSV form

Best use in FlightLine:

- authoritative U.S. overrides and enrichment for airport records
- stronger U.S. runway, communications, and identifier confidence than community-only data

### 3. Commercial Or Restricted Reference Layer: ICAO API Data Service

Recommended use:

- optional authority source for ICAO code validation and identifier enrichment if needed later

Why:

- ICAO exposes airport code data through its API service
- the service provides only 100 free trial calls after registration
- the page says full data-set download inquiries require contacting ICAO

Implication:

- useful as a validation or commercial-enrichment option later
- not a good default bulk-ingestion backbone for MVP

### 4. Do Not Use As Primary Commercial Source: openAIP

openAIP can be useful for research, but it should not be our primary airport-data source for a commercial product without legal review.

Why:

- openAIP states its data is licensed under CC BY-NC 4.0
- that non-commercial restriction creates product risk for a commercial game

## Source Recommendations By Role

- global baseline: OurAirports
- U.S. authority and enrichment: FAA NASR / FAA Aeronautical Data
- optional code validation later: ICAO API
- avoid as commercial backbone: openAIP without legal review

## Normalization Pipeline

### Step 1: Raw Snapshot Ingest

Store source snapshots as raw inputs by source and date.

This gives us:

- reproducibility
- auditability
- safer source upgrades

### Step 2: Identifier Normalization

Create a canonical airport identity model that can hold:

- ICAO
- IATA
- GPS code
- local code
- source-specific internal ids

Do not assume one code is always present or unique globally.

### Step 3: Runway Aggregation

For each airport, compute normalized runway summaries:

- longest runway
- longest paved runway
- longest usable runway by supported aircraft class later
- lighting availability
- water-only or heli-only access flags

### Step 4: Source Priority Rules

Recommended priority when multiple sources disagree:

- use FAA for U.S. factual aeronautical fields where coverage exists
- use OurAirports as default global fallback
- preserve source provenance per field if possible

### Step 5: Derived Gameplay Fields

Compute gameplay-supporting fields from source facts:

- size tier
- infrastructure tier
- accessibility tier
- likely business archetype inputs
- likely cargo archetype inputs
- remote-access or tourism indicators

### Step 6: Product Filters

Mark airports according to current game support:

- supported now
- present but hidden
- excluded by rule

## Suggested Canonical Airport Model

A normalized game airport record should have these groups:

- identity
- geography
- administrative region
- runway summary
- communication summary
- access summary
- simulation tags
- source provenance

## Quality Rules

Reject or flag airports that have:

- no usable coordinates
- obviously invalid runway dimensions
- duplicate identifiers without clear disambiguation
- missing raw airport type
- incompatible runway data versus raw airport type

## Update Cadence

Recommended cadence:

- OurAirports base refresh on a scheduled cadence, not every launch
- FAA U.S. enrichment refresh on its publication cycle
- rebuild normalized airport database offline, then ship or patch game-ready snapshots

## Recommendation For MVP

Use this stack:

- ingest OurAirports globally
- enrich U.S. airports from FAA NASR where useful
- compute game-specific accessibility and demand tags ourselves
- avoid commercial dependency on ICAO or openAIP for MVP

## Source Notes

Current source facts verified from official or primary pages:

- OurAirports: nightly CSV dump, public domain, airports/runways/frequencies/countries/regions
- FAA: Aeronautical Data portal and 28-day NASR subscription with CSV airport and related data
- ICAO API: 100 free trial calls, full data-set access requires direct inquiry
- openAIP: CC BY-NC 4.0 license

## Open Technical Question

The next practical design choice is whether the game ships with:

- one curated airport snapshot covering the whole world
- or a global database with region packs exposed progressively

Either works, but the normalization pipeline should support both.

## Implemented Bootstrap State

The current local FlightLine airport database is now a multi-source reference snapshot, not a single-source prototype.

Current state from the local database build on March 14, 2026:

- `87,921` airports
- `48,321` runway rows
- `30,216` frequency rows
- `249` country records
- `3,942` region records
- `27,765` airports marked `accessible_now` under the current fixed-wing heuristic
- `3,114` legacy-only airports preserved as fallback because they do not appear in the current OurAirports snapshot

What the current build now contains that the legacy bootstrap did not:

- runway width for most structured runway rows
- explicit runway lighted and closed flags
- runway-end identifiers and end geometry
- airport frequency rows
- country and region lookup tables
- scheduled-service flags
- home links, Wikipedia links, and keyword metadata
- corrected current naming for many airports that had legacy encoding issues

What still remains incomplete:

- timezone is now derived locally from latitude/longitude for all airports in the current database build
- source merge is still keyed mostly by `ident`, so later multi-source deduping will need a stronger identity strategy
- FAA enrichment is still needed for stronger U.S. authority
- manual balance overrides do not exist yet for iconic or progression-critical airports
- airport-pair cache and route-level derived data are still not populated

## Strategy Change

FlightLine should now treat:

- the current OurAirports snapshot as the primary global base layer
- the legacy AirportsAndRunways JSON as a fallback layer for airports missing from the current base
- later FAA import as an authority and override layer, not as the first source we depend on

## New Derived Gameplay Field: Airport Size

In addition to the raw source airport classification, FlightLine now carries a simplified gameplay-facing `airport_size` field on a 1 to 5 scale.

Recommended meaning:

- 1: specialty, closed, or highly restricted facility
- 2: local utility airport
- 3: regional airport
- 4: commercial airport
- 5: major commercial hub

This field should be used for UI grouping, early demand heuristics, and broad progression logic. The raw `airport_type` should still be preserved for source fidelity and special-case rules.

## New Implemented Derived Gameplay Layer

The local airport database now also carries a first-pass generation layer in `airport_profile` and `airport_tag`.

Currently populated fields:

- `passenger_score`
- `cargo_score`
- `remote_score`
- `tourism_score`
- `business_score`
- `demand_archetype`
- `maintenance_capability_band`
- `contract_generation_weight`
- `market_region`

Current results from the March 14, 2026 build:

- `87,921` populated `airport_profile` rows
- `154,401` derived `airport_tag` rows
- `787` distinct `market_region` values

Current `demand_archetype` distribution:

- `57,471` `mixed_secondary`
- `19,608` `remote_utility`
- `4,965` `cargo_feeder`
- `2,376` `regional_connector`
- `1,868` `business_gateway`
- `1,633` `major_hub`

Current `maintenance_capability_band` distribution:

- `60,156` `none`
- `17,237` `basic`
- `6,447` `line`
- `2,427` `regional`
- `1,654` `major`

This first pass is intentionally heuristic. It is strong enough to drive contract, aircraft-market, and staffing-market generation, but it should still be treated as a designer-tunable layer rather than real-world truth.
