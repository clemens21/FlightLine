# Aircraft Data Model

## Purpose

This document defines how FlightLine should represent aircraft as data.

The game should not treat "an airplane" as one flat object. We need a clean split between:

- aircraft family
- aircraft model or variant
- individual owned or leased airframe
- player-facing market offer

That split is what makes acquisition, staffing, maintenance, fleet standardization, and save-state logic stay coherent.

## Modeling Goals

The aircraft data model should:

- be concrete enough to drive simulation and UI without external calculators
- be simple enough to seed and rebalance quickly during MVP
- support passenger, cargo, and combi operations
- support both reference data and live per-airframe state
- keep sourced facts separate from derived gameplay interpretation

## Core Modeling Principle

FlightLine should model aircraft in layers.

### 1. Aircraft Family

A family is the operational grouping that matters for training, standardization, and maintenance.

Examples:

- Caravan family
- PC-12 family
- Twin Otter family
- ATR family
- Saab 340 family
- Citation family

Family-level data should answer questions like:

- which pilot qualification pool does this use?
- which mechanic capability does it require?
- does owning more of this family reduce friction through standardization?

### 2. Aircraft Model

A model is the actual flyable marketable variant used by the game.

Examples:

- passenger Caravan
- cargo Caravan
- passenger Saab 340
- cargo Saab 340
- premium light jet

This is the main reference-data layer the contract, acquisition, and dispatch systems should query.

### 3. Aircraft Airframe

An airframe is a specific owned or leased aircraft in a save file.

This is where live state lives:

- location
- hours
- cycles
- condition
- maintenance due state
- utilization
- ownership terms

### 4. Aircraft Offer

An offer is a market wrapper around a model.

It adds:

- location
- deal structure
- upfront payment
- periodic payment
- term length
- explanation metadata

The same aircraft model can appear in multiple offers with different structures.

## Canonical Entities

### AircraftFamily

Recommended responsibility:

- qualification grouping
- standardization grouping
- maintenance grouping
- variant relationship anchor

Recommended fields:

- `family_id`
- `display_name`
- `manufacturer`
- `qualification_group`
- `mechanic_group`
- `standardization_group`
- `family_role_tags`
- `notes`

### AircraftModel

This is the core reference object for MVP.

#### Identity Fields

- `model_id`
- `family_id`
- `display_name`
- `short_name`
- `manufacturer`
- `variant_kind`
- `in_service_role`
- `aircraft_category`
- `engine_type`
- `fuel_type`
- `pressurized`

#### Capacity Fields

- `max_passengers`
- `max_cargo_lb`
- `payload_class`
- `combi_capable`
- `cargo_door_class` later

#### Performance Fields

- `cruise_speed_ktas`
- `range_nm`
- `fuel_burn_gph`
- `typical_turnaround_min`
- `max_operating_altitude_ft` later if it affects weather or route logic

#### Airport Access Fields

- `minimum_runway_ft`
- `preferred_runway_ft`
- `hard_surface_required`
- `rough_field_capable`
- `short_field_bonus`
- `remote_ops_fit`

#### Operating Economics

- `market_value_usd`
- `target_lease_rate_monthly_usd`
- `target_finance_rate_band`
- `variable_operating_cost_per_hour_usd`
- `fixed_support_cost_per_day_usd`
- `maintenance_reserve_per_hour_usd`
- `insurance_risk_band` later

#### Staffing Fields

- `pilot_qualification_group`
- `pilots_required`
- `flight_attendants_required`
- `mechanic_skill_group`
- `ops_complexity_band`

#### Maintenance Fields

- `base_dispatch_reliability`
- `condition_decay_per_hour`
- `condition_decay_per_cycle`
- `inspection_interval_hours`
- `inspection_interval_cycles`
- `heavy_maintenance_band`
- `maintenance_downtime_hours`

#### Market And Progression Fields

- `market_role_pool`
- `progression_tier`
- `startup_eligible`
- `reputation_gate`
- `best_fit_contract_tags`
- `airport_access_profile`

## MSFS 2024 Availability Metadata

Because FlightLine now wants roster alignment with the latest Microsoft Flight Simulator ecosystem, aircraft reference data should also carry a simulator-availability crosswalk.

Recommended metadata fields:

- `msfs2024_availability_class`
- `msfs2024_included_tier`
- `msfs2024_distribution_channels`
- `msfs2024_example_products`
- `msfs2024_pc_supported`
- `msfs2024_xbox_supported`
- `msfs2024_notes`
- `msfs2024_last_verified_on`

Purpose:

- lets FlightLine prefer families players can also fly in MSFS 2024
- keeps the core aircraft identity separate from storefront packaging
- makes it possible to filter the roster by first-party, paid, freeware, or mixed availability
- supports future MSFS integration planning without coupling the game to one storefront

Important rule:

- one FlightLine aircraft model should not be created for every store listing
- multiple store listings should usually crosswalk to one FlightLine family or variant unless the gameplay-relevant configuration is genuinely different

## AircraftModel Design Rules

A model record should capture what the player needs to decide with, not every real-world spec that exists.

Good model data should answer:

- what work is this aircraft good at?
- what airports can it actually use in game terms?
- what staffing burden does it introduce?
- how expensive is it to keep moving?
- how fragile is its margin if utilization slips?

## Individual Airframe State

The live save-state object should be separate from the model.

Recommended `Aircraft` fields:

- `aircraft_id`
- `model_id`
- `registration`
- `display_name`
- `ownership_type`
- `current_airport_id`
- `home_base_airport_id` later
- `status`
- `dispatch_available`
- `condition`
- `airframe_hours_total`
- `airframe_cycles_total`
- `hours_since_inspection`
- `cycles_since_inspection`
- `hours_since_heavy_maintenance`
- `days_since_heavy_maintenance`
- `maintenance_status`
- `utilization_hours_7d`
- `utilization_hours_30d`
- `acquired_on`
- `purchase_price_usd` or `book_value_usd`
- `current_financial_obligation`

This object should never duplicate fixed model values such as cruise speed or passenger capacity.

## Market Offer Model

Recommended `AircraftOffer` fields:

- `offer_id`
- `model_id`
- `location_airport_id`
- `deal_structure`
- `asking_price_usd`
- `deposit_usd`
- `periodic_payment_usd`
- `payment_period`
- `term_months`
- `apr_or_rate_band`
- `delivery_delay_hours`
- `requires_reposition`
- `offer_quality_band`
- `explanation_metadata`
- `refresh_window_seed`

Later used-aircraft support can extend this with:

- `offer_condition`
- `prior_hours`
- `prior_cycles`
- `age_years`
- `inspection_state`

## Units And Normalization Rules

For MVP, use one canonical unit set across all aircraft data.

Recommended units:

- speed: `ktas`
- range: `nm`
- runway: `ft`
- payload: `lb`
- fuel burn: `gph`
- time: `minutes`, `hours`, or `days` depending on field
- money: integer or decimal USD in storage, UI-formatted later

Do not mix units by source file. Normalize on ingest.

## Variant Policy

MVP should use families and curated variants, not every real-world sub-model.

Recommended rule:

- one family can support passenger, cargo, and combi variants
- variants should reuse most family-level data
- only override fields that materially change gameplay

Examples of fields that often vary by variant:

- `max_passengers`
- `max_cargo_lb`
- `flight_attendants_required`
- `market_role_pool`
- `best_fit_contract_tags`
- `asking_price_usd`

Examples of fields that usually stay near family baseline:

- qualification group
- mechanic group
- runway envelope
- maintenance band

## Derived Fields Versus Authored Fields

Keep authored aircraft facts separate from derived gameplay summaries.

### Authored Fields

These should be defined directly in the reference data:

- passenger capacity
- cargo capacity
- cruise speed
- range
- runway needs
- staffing requirements
- maintenance intervals
- market value

### Derived Fields

These should be calculated during ingestion or balancing:

- airport access profile
- contract fit tags
- utilization target band
- fixed-cost pressure band
- remote-ops score
- profitability sensitivity band

## Qualification Strategy

Do not create one pilot qualification per exact model in MVP unless the roster becomes much larger.

Recommended qualification groups:

- `single_turboprop_utility`
- `single_turboprop_premium`
- `twin_turboprop_utility`
- `twin_turboprop_commuter`
- `regional_turboprop`
- `light_business_jet`

This gives real scaling friction without creating training micromanagement too early.

## Standardization Strategy

Fleet commonality should be visible in data.

Recommended standardization effects later:

- reduced pilot training expansion cost inside the same family
- reduced maintenance friction for repeated families
- better spare-aircraft substitution inside the same role lane
- cleaner staffing and dispatch planning for standardized fleets

This means `family_id` and `standardization_group` should not be optional clutter. They are real strategic inputs.

## MVP Non-Goals

Do not model these in the initial aircraft data layer:

- full weight-and-balance simulation
- detailed engine-by-engine maintenance programs
- per-seat service-class economics by cabin layout
- exhaustive manufacturer sub-variants with nearly identical performance
- deep avionics or certification trees

## Recommended Storage Shape

Recommended future reference tables or files:

- `aircraft_family`
- `aircraft_model`
- `aircraft_model_variant` later if needed
- `aircraft_offer_template` later

Recommended live save tables or objects:

- `aircraft`
- `aircraft_financial_obligation`
- `aircraft_maintenance_event`
- `aircraft_assignment`

## Immediate Implementation Target

Before app code starts, FlightLine should at least define:

1. a starter `AircraftFamily` roster
2. a starter `AircraftModel` roster
3. qualification groups for staffing
4. market role pools for acquisition
5. the per-airframe fields required for save-state and maintenance
6. MSFS 2024 availability metadata for every preferred MVP family and variant

## Success Test

The aircraft data model is ready when the team can take one aircraft record and cleanly answer:

- which contracts it should be best at
- which airports it can realistically serve
- what staffing it requires
- what it costs to keep busy
- how it should appear in the market
- how its live wear and ownership state should be saved




