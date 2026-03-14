# Airport Derived Tags Plan

## Purpose

This document defines the game-authored airport fields that should be computed on top of the current airport database so contract, aircraft, and staffing generation can react to something richer than runway length alone.

The goal is not perfect real-world economics. The goal is consistent, explainable airport personality for gameplay.

## Implementation Status

The first pass of this plan is now implemented locally through:

- `scripts/airports/apply_airport_generation_tags.py`

Currently populated derived fields:

- `passenger_score`
- `cargo_score`
- `remote_score`
- `tourism_score`
- `business_score`
- `demand_archetype`
- `maintenance_capability_band`
- `market_region`
- `contract_generation_weight`

Currently populated secondary labels in `airport_tag`:

- `archetype:<value>`
- `passenger`
- `cargo`
- `remote`
- `business`
- `tourism`
- `maintenance_capable`

This document still matters because the current implementation is a first heuristic pass, not the final balancing model.

## Design Standard

Derived tags should follow these rules:

- start from fields already present in the local airport database
- stay explainable to designers and players
- be cheap to recompute offline
- support balance overrides later
- separate sourced aviation facts from game-authored interpretation

## Current Source Inputs Available

The current local database already gives us:

- raw `airport_type`
- derived `airport_size`
- `scheduled_service`
- `timezone`
- `iso_country`
- `iso_region`
- `municipality`
- runway counts and dimensions
- hard-surface support
- lighting and closure flags
- airport frequencies
- home link and Wikipedia link presence
- source keywords
- access tier and supported-aircraft heuristics

## Core Derived Fields To Populate Next

These fields should be populated first because they directly support content generation.

### Passenger Score

Purpose:

- measure how suitable the airport is for passenger contract generation

Suggested range:

- `0` to `100`

Suggested first-pass inputs:

- `airport_size`
- `scheduled_service`
- access tier
- longest hard runway
- airport type
- tourism score later
- business score later

### Cargo Score

Purpose:

- measure how suitable the airport is for cargo generation

Suggested range:

- `0` to `100`

Suggested first-pass inputs:

- longest runway
- longest hard runway
- hard-surface support
- airport size
- reduced passenger emphasis when scheduled service is absent or low

### Remote Score

Purpose:

- identify airports that should generate utility-style or harder-access work

Suggested range:

- `0` to `100`

Suggested first-pass inputs:

- smaller airport size
- limited hard-surface support
- low or no scheduled service
- utility-only access tier
- thin frequency coverage later if useful

### Tourism Score

Purpose:

- identify airports that should generate leisure-driven passenger demand

Suggested range:

- `0` to `100`

Suggested first-pass inputs:

- scheduled service
- airport size
- keywords and name token matching
- island or resort indicators later

### Business Score

Purpose:

- identify airports that should generate premium passenger and high-value scheduled demand

Suggested range:

- `0` to `100`

Suggested first-pass inputs:

- airport size
- scheduled service
- major commercial access tier
- strong region and municipality significance later

### Demand Archetype

Purpose:

- give the airport one primary gameplay identity for explanation and generation weighting

Recommended starting archetypes:

- `major_hub`
- `regional_connector`
- `business_gateway`
- `tourism_gateway`
- `cargo_feeder`
- `remote_utility`
- `mixed_secondary`

### Maintenance Capability Band

Purpose:

- estimate how much maintenance support the airport can plausibly host for gameplay

Recommended bands:

- `none`
- `basic`
- `line`
- `regional`
- `major`

### Market Region

Purpose:

- group airports into market buckets for board curation and progression

Recommended first pass:

- use `iso_region` directly for large countries and dense markets
- collapse to `iso_country` for smaller countries or sparse markets
- optionally keep a broader super-region later for long-haul balancing

## Derived Field Rules

### Airport Size

This field already exists and should stay as the coarse gameplay anchor.

Recommended meaning:

- `1`: specialty, closed, or highly restricted facility
- `2`: local utility airport
- `3`: regional airport
- `4`: commercial airport
- `5`: major commercial hub

### Immediate Heuristic Rules

These can be implemented without new external sources.

#### Passenger Score Heuristic

Suggested starting behavior:

- start from `airport_size * 15`
- add a scheduled-service bonus
- add a hard-runway bonus
- cap small utility airports even if they have one strong runway

#### Cargo Score Heuristic

Suggested starting behavior:

- start from hard-runway and total-runway availability
- add bonus for `airport_size` `3` to `5`
- add bonus for airports with stronger access tiers
- keep some cargo relevance at size `2` airports for feeder and remote work

#### Remote Score Heuristic

Suggested starting behavior:

- boost airports with `airport_size` `2`
- boost airports with low or no scheduled service
- boost airports with utility-only access
- reduce score sharply for `airport_size` `4` and `5`

#### Business Score Heuristic

Suggested starting behavior:

- boost scheduled-service airports
- boost `airport_size` `4` and `5`
- boost regional-jet and narrowbody access tiers

#### Tourism Score Heuristic

Suggested starting behavior:

- start conservatively
- use keyword or name token matching for obvious leisure indicators
- keep as a lighter modifier until better enrichment exists

## Demand Archetype Selection

Demand archetype should be chosen after scores are computed.

Suggested first-pass decision order:

- `major_hub` when `airport_size = 5` and scheduled service is present
- `business_gateway` when business score dominates passenger score but remote score is low
- `tourism_gateway` when tourism score clearly leads passenger behavior
- `cargo_feeder` when cargo score leads and passenger score trails
- `remote_utility` when remote score is high and airport size is small
- `regional_connector` when the airport is broadly balanced and mid-sized
- `mixed_secondary` as the fallback

## Maintenance Capability Band Rules

Suggested starting rules:

- `major` for `airport_size = 5`
- `regional` for `airport_size = 4`
- `line` for `airport_size = 3`
- `basic` for `airport_size = 2`
- `none` for restricted specialty airports

This is intentionally gamey and should later be refined with better airport-service data.

## Storage Plan

Populate these in `airport_profile` first:

- `passenger_score`
- `cargo_score`
- `remote_score`
- `tourism_score`
- `business_score`
- `demand_archetype`
- `maintenance_capability_band`
- `market_region`
- `contract_generation_weight`

Optional secondary labels can also be stored in `airport_tag` for future filtering.

Examples:

- `tag = tourism`
- `tag = business`
- `tag = cargo`
- `tag = remote`
- `tag = premium`
- `tag = maintenance_capable`

## Pipeline Order

Recommended offline build order:

1. load and enrich raw airport facts
2. compute access and runway summaries
3. compute `airport_size`
4. compute passenger, cargo, remote, tourism, and business scores
5. assign `demand_archetype`
6. assign `maintenance_capability_band`
7. assign `market_region`
8. apply manual overrides for balance or obvious bad fits

## Manual Override Policy

Do not try to solve every edge case with heuristics alone.

Allow a small override layer for:

- iconic airports with obvious gameplay identity
- airports where keyword matching is misleading
- progression-critical starter regions
- airports used in tutorials or sample scenarios

## Validation Queries

Once tags exist, validate these patterns:

- `airport_size = 5` should rarely end up with low passenger score
- very remote airports should not dominate premium passenger generation
- cargo feeder airports should not all collapse into major hubs only
- every supported region should surface a mix of archetypes, not one dominant label

## Immediate Implementation Target

The first useful derived-tags pass should implement only:

- passenger score
- cargo score
- remote score
- tourism score
- business score
- demand archetype
- maintenance capability band
- market region
- contract generation weight

Tourism score should remain a lighter heuristic until we have stronger enrichment or a small manual override layer.
