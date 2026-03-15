# Save Schema Blueprint

## Purpose

This document defines the first backend persistence shape for FlightLine save data.

It is not a final SQL migration. It is the schema blueprint the implementation should follow when the save database is created.

## Persistence Layout

FlightLine should use three database layers:

1. airport reference SQLite
2. aircraft reference SQLite
3. one writeable save SQLite per save slot

Reference DBs remain read-only inputs. The save DB owns only player and simulation state.

## Why One Save DB Per Save

Recommended model:

- one SQLite file per save slot

Benefits:

- clean save isolation
- easy backup and restore
- easier migration testing
- less chance of cross-save contamination

## Save DB Rules

### 1. Reference by id

Save tables should keep ids like:

- `airport_id`
- `aircraft_model_id`
- `aircraft_layout_id`

They should not duplicate static reference data like runway facts or aircraft cruise speed.

### 2. Freeze commercial facts when they become commitments

These values should be copied into save state because they are part of the deal:

- accepted payout
- penalty model
- acquisition payment terms
- staffing package price terms

### 3. Keep canonical tables separate from optional read caches

Canonical tables are authoritative.

Read caches or materialized summaries should remain optional and rebuildable.

## Core Table Groups

## A. Save Runtime

### `schema_migration`

Suggested fields:

- `migration_id`
- `applied_at_utc`
- `app_version`

### `save_game`

Suggested fields:

- `save_id` PK
- `save_version`
- `created_at_utc`
- `updated_at_utc`
- `world_seed`
- `difficulty_profile`
- `airport_snapshot_version`
- `aircraft_snapshot_version`
- `active_company_id`

### `game_clock`

Suggested fields:

- `save_id` PK/FK
- `current_time_utc`
- `last_advanced_at_utc`
- `last_advance_result_json`

### `scheduled_event`

Suggested fields:

- `scheduled_event_id` PK
- `save_id` FK
- `event_type`
- `scheduled_time_utc`
- `status`
- `aircraft_id` nullable
- `company_contract_id` nullable
- `maintenance_task_id` nullable
- `payload_json`

Suggested index:

- `(save_id, scheduled_time_utc, status)`

## B. Company And Footprint

### `company`

Suggested fields:

- `company_id` PK
- `save_id` FK
- `display_name`
- `reputation_score`
- `company_phase`
- `progression_tier`
- `created_at_utc`

### `company_base`

Suggested fields:

- `company_base_id` PK
- `company_id` FK
- `airport_id`
- `base_role`
- `activated_at_utc`

### `airport_relationship`

Optional first-pass table.

Suggested fields:

- `airport_relationship_id` PK
- `company_id` FK
- `airport_id`
- `market_bias_score`
- `recent_success_score`
- `recent_failure_score`
- `updated_at_utc`

## C. Finance

### `company_financial_state`

Suggested fields:

- `company_id` PK/FK
- `current_cash_amount`
- `financial_pressure_band`
- `reserve_balance_amount` nullable
- `updated_at_utc`

### `recurring_obligation`

Suggested fields:

- `recurring_obligation_id` PK
- `company_id` FK
- `obligation_type`
- `source_object_type`
- `source_object_id`
- `amount`
- `cadence`
- `next_due_at_utc`
- `end_at_utc` nullable
- `status`

### `ledger_entry`

Suggested fields:

- `ledger_entry_id` PK
- `company_id` FK
- `entry_time_utc`
- `entry_type`
- `amount`
- `currency_code`
- `source_object_type`
- `source_object_id`
- `description`
- `metadata_json`

Suggested indexes:

- `(company_id, entry_time_utc)`
- `(company_id, entry_type)`

## D. Fleet

### `company_aircraft`

Suggested fields:

- `aircraft_id` PK
- `company_id` FK
- `aircraft_model_id`
- `active_cabin_layout_id` nullable
- `registration`
- `display_name`
- `ownership_type`
- `current_airport_id`
- `delivery_state`
- `airframe_hours_total`
- `airframe_cycles_total`
- `condition_value`
- `status_input`
- `dispatch_available`
- `active_schedule_id` nullable
- `active_maintenance_task_id` nullable
- `acquired_at_utc`

### `acquisition_agreement`

Suggested fields:

- `acquisition_agreement_id` PK
- `aircraft_id` FK unique
- `agreement_type`
- `origin_offer_id` nullable
- `start_at_utc`
- `upfront_payment_amount`
- `recurring_payment_amount` nullable
- `payment_cadence` nullable
- `term_months` nullable
- `end_at_utc` nullable
- `rate_band_or_apr` nullable
- `status`

## E. Staffing

### `staffing_package`

Suggested fields:

- `staffing_package_id` PK
- `company_id` FK
- `source_offer_id` nullable
- `labor_category`
- `employment_model`
- `qualification_group`
- `coverage_units`
- `fixed_cost_amount`
- `variable_cost_rate` nullable
- `service_region_code` nullable
- `starts_at_utc`
- `ends_at_utc` nullable
- `status`

### `labor_allocation`

Suggested fields:

- `labor_allocation_id` PK
- `staffing_package_id` FK
- `aircraft_id` nullable
- `schedule_id` nullable
- `maintenance_task_id` nullable
- `qualification_group`
- `units_reserved`
- `reserved_from_utc`
- `reserved_to_utc`
- `status`

## F. Offer Windows

### `offer_window`

Suggested fields:

- `offer_window_id` PK
- `company_id` FK
- `window_type`
- `generated_at_utc`
- `expires_at_utc`
- `window_seed`
- `generation_context_hash`
- `refresh_reason`
- `status`

### `contract_offer`

Suggested fields:

- `contract_offer_id` PK
- `offer_window_id` FK
- `company_id` FK
- `archetype`
- `origin_airport_id`
- `destination_airport_id`
- `volume_type`
- `passenger_count` nullable
- `cargo_weight_lb` nullable
- `earliest_start_utc`
- `latest_completion_utc`
- `payout_amount`
- `penalty_model_json`
- `likely_role`
- `difficulty_band`
- `explanation_metadata_json`
- `generated_seed`
- `offer_status`

### `aircraft_market_offer`

Suggested fields:

- `aircraft_market_offer_id` PK
- `offer_window_id` FK
- `company_id` FK
- `aircraft_model_id`
- `delivery_airport_id`
- `deal_structure`
- `upfront_payment_amount`
- `recurring_payment_amount` nullable
- `term_months` nullable
- `offer_status`
- `metadata_json`

### `staffing_market_offer`

Suggested fields:

- `staffing_market_offer_id` PK
- `offer_window_id` FK
- `company_id` FK
- `labor_category`
- `employment_model`
- `qualification_group`
- `coverage_units`
- `fixed_cost_amount`
- `variable_cost_rate` nullable
- `starts_at_utc` nullable
- `ends_at_utc` nullable
- `offer_status`
- `metadata_json`

## G. Contracts

### `company_contract`

Suggested fields:

- `company_contract_id` PK
- `company_id` FK
- `origin_contract_offer_id` nullable
- `archetype`
- `origin_airport_id`
- `destination_airport_id`
- `volume_type`
- `passenger_count` nullable
- `cargo_weight_lb` nullable
- `accepted_payout_amount`
- `penalty_model_json`
- `accepted_at_utc`
- `earliest_start_utc`
- `deadline_utc`
- `contract_state`
- `assigned_aircraft_id` nullable

## H. Dispatch

### `aircraft_schedule`

Suggested fields:

- `schedule_id` PK
- `aircraft_id` FK
- `schedule_kind`
- `schedule_state`
- `is_draft`
- `planned_start_utc`
- `planned_end_utc`
- `validation_snapshot_json` nullable
- `created_at_utc`
- `updated_at_utc`

### `flight_leg`

Suggested fields:

- `flight_leg_id` PK
- `schedule_id` FK
- `sequence_number`
- `leg_type`
- `linked_company_contract_id` nullable
- `origin_airport_id`
- `destination_airport_id`
- `planned_departure_utc`
- `planned_arrival_utc`
- `actual_departure_utc` nullable
- `actual_arrival_utc` nullable
- `leg_state`
- `assigned_qualification_group` nullable
- `payload_snapshot_json` nullable

### `operational_execution`

Optional but recommended first-pass history table.

Suggested fields:

- `operational_execution_id` PK
- `flight_leg_id` nullable
- `execution_type`
- `occurred_at_utc`
- `result_state`
- `metadata_json`

## I. Maintenance

### `maintenance_program_state`

Suggested fields:

- `aircraft_id` PK/FK
- `condition_band_input`
- `hours_since_inspection`
- `cycles_since_inspection`
- `hours_to_service`
- `last_inspection_at_utc` nullable
- `last_heavy_service_at_utc` nullable
- `maintenance_state_input`
- `aog_flag`
- `updated_at_utc`

### `maintenance_task`

Suggested fields:

- `maintenance_task_id` PK
- `aircraft_id` FK
- `maintenance_type`
- `provider_source`
- `planned_start_utc`
- `planned_end_utc`
- `actual_start_utc` nullable
- `actual_end_utc` nullable
- `cost_estimate_amount` nullable
- `actual_cost_amount` nullable
- `task_state`

## J. Event History

### `event_log_entry`

Suggested fields:

- `event_log_entry_id` PK
- `save_id` FK
- `company_id` nullable
- `event_time_utc`
- `event_type`
- `source_object_type` nullable
- `source_object_id` nullable
- `severity` nullable
- `message`
- `metadata_json`

### `command_log`

Optional but strongly recommended.

Suggested fields:

- `command_id` PK
- `save_id` FK
- `command_name`
- `actor_type`
- `issued_at_utc`
- `completed_at_utc`
- `status`
- `payload_json`

## Foreign Key Guidance

Use SQLite foreign keys seriously.

Important relationships:

- `company.save_id -> save_game.save_id`
- `company_base.company_id -> company.company_id`
- `company_aircraft.company_id -> company.company_id`
- `staffing_package.company_id -> company.company_id`
- `offer_window.company_id -> company.company_id`
- `company_contract.company_id -> company.company_id`
- `aircraft_schedule.aircraft_id -> company_aircraft.aircraft_id`
- `flight_leg.schedule_id -> aircraft_schedule.schedule_id`
- `maintenance_task.aircraft_id -> company_aircraft.aircraft_id`

Use nullable foreign keys only where delayed attachment is real.

## JSON Column Guidance

SQLite JSON text is acceptable for:

- `penalty_model_json`
- `explanation_metadata_json`
- `validation_snapshot_json`
- `payload_json`
- `metadata_json`

Do not hide core relational truth in JSON if it needs joins, uniqueness, or foreign keys.

## First Implementation Slice Tables

If we implement the smallest playable loop first, the minimum table set should be:

- `save_game`
- `game_clock`
- `scheduled_event`
- `company`
- `company_base`
- `company_financial_state`
- `ledger_entry`
- `company_aircraft`
- `acquisition_agreement`
- `staffing_package`
- `labor_allocation`
- `offer_window`
- `contract_offer`
- `company_contract`
- `aircraft_schedule`
- `flight_leg`
- `maintenance_program_state`
- `maintenance_task`
- `event_log_entry`

That is enough for the first meaningful vertical slice.

## Success Test

The save schema blueprint is ready when the team can answer these implementation questions cleanly:

- Which table stores the current aircraft location?
- Which table stores an accepted contract versus an offered contract?
- Which table proves labor is reserved for a leg window?
- Which table drives future simulation events?
- Which tables are authoritative versus query-only?

If those answers are still fuzzy, the schema is not ready.
