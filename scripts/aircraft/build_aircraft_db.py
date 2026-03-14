from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from starter_seed import CABIN_LAYOUTS, FAMILIES, MODELS  # noqa: E402

DEFAULT_DB_PATH = ROOT / 'data' / 'aircraft' / 'flightline-aircraft.sqlite'
DEFAULT_SCHEMA_PATH = ROOT / 'data' / 'aircraft' / 'schema' / '001_initial.sql'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Build the FlightLine aircraft reference database.')
    parser.add_argument('--db-path', type=Path, default=DEFAULT_DB_PATH, help='SQLite DB output path.')
    parser.add_argument('--schema-path', type=Path, default=DEFAULT_SCHEMA_PATH, help='Schema SQL path.')
    return parser.parse_args()


def pipe_join(value: object) -> str:
    if value is None:
        return ''
    if isinstance(value, list):
        return '|'.join(str(item) for item in value)
    return str(value)


def as_int(value: object) -> int:
    if isinstance(value, bool):
        return int(value)
    return int(value)


def reset_db(db_path: Path) -> None:
    if db_path.exists():
        db_path.unlink()


def apply_schema(conn: sqlite3.Connection, schema_path: Path) -> None:
    conn.executescript(schema_path.read_text(encoding='utf-8'))


def insert_families(conn: sqlite3.Connection) -> None:
    rows = [
        (
            family['family_id'],
            family['display_name'],
            family['manufacturer'],
            family['qualification_group'],
            family['mechanic_group'],
            family['standardization_group'],
            pipe_join(family.get('family_role_tags', [])),
            family.get('notes', ''),
        )
        for family in FAMILIES
    ]
    conn.executemany(
        '''
        INSERT INTO aircraft_family (
            family_id,
            display_name,
            manufacturer,
            qualification_group,
            mechanic_group,
            standardization_group,
            family_role_tags,
            notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''',
        rows,
    )


def insert_models(conn: sqlite3.Connection) -> None:
    rows = []
    tag_rows: list[tuple[str, str, float]] = []
    for model in MODELS:
        rows.append(
            (
                model['model_id'],
                model['family_id'],
                model['display_name'],
                model['short_name'],
                model['variant_kind'],
                model['in_service_role'],
                model['aircraft_category'],
                model['engine_type'],
                as_int(model['engine_count']),
                model['fuel_type'],
                as_int(model['pressurized']),
                as_int(model['max_passengers']),
                as_int(model['max_cargo_lb']),
                as_int(model['max_takeoff_weight_lb']),
                as_int(model['operating_empty_weight_lb']),
                as_int(model['max_payload_lb']),
                as_int(model['cargo_volume_cuft']),
                as_int(model['max_usable_fuel_gal']),
                as_int(model['wingspan_ft']),
                as_int(model['aircraft_length_ft']),
                as_int(model['tail_height_ft']),
                model['icao_reference_code'],
                model['approach_category'],
                as_int(model['service_ceiling_ft']),
                as_int(model['takeoff_distance_ft']),
                as_int(model['landing_distance_ft']),
                model['payload_class'],
                as_int(model['combi_capable']),
                as_int(model['cruise_speed_ktas']),
                as_int(model['range_nm']),
                float(model['fuel_burn_gph']),
                as_int(model['typical_turnaround_min']),
                as_int(model['minimum_runway_ft']),
                as_int(model['preferred_runway_ft']),
                as_int(model['hard_surface_required']),
                as_int(model['rough_field_capable']),
                as_int(model['minimum_airport_size']),
                as_int(model['preferred_airport_size']),
                model['gate_requirement'],
                model['required_ground_service_level'],
                model['cargo_loading_type'],
                as_int(model['market_value_usd']),
                as_int(model['target_lease_rate_monthly_usd']),
                as_int(model['variable_operating_cost_per_hour_usd']),
                as_int(model['fixed_support_cost_per_day_usd']),
                as_int(model['maintenance_reserve_per_hour_usd']),
                model['pilot_qualification_group'],
                as_int(model['pilots_required']),
                as_int(model['flight_attendants_required']),
                model['mechanic_skill_group'],
                float(model['base_dispatch_reliability']),
                float(model['condition_decay_per_hour']),
                float(model['condition_decay_per_cycle']),
                as_int(model['inspection_interval_hours']),
                as_int(model['inspection_interval_cycles']),
                model['heavy_maintenance_band'],
                as_int(model['maintenance_downtime_hours']),
                model['market_role_pool'],
                as_int(model['progression_tier']),
                as_int(model['startup_eligible']),
                as_int(model['reputation_gate']),
                pipe_join(model.get('best_fit_contract_tags', [])),
                model['airport_access_profile'],
                as_int(model['msfs2024_available_for_user']),
                model['msfs2024_status'],
                model.get('msfs2024_included_tier', ''),
                pipe_join(model.get('msfs2024_distribution_channels', [])),
                pipe_join(model.get('msfs2024_example_products', [])),
                pipe_join(model.get('msfs2024_source_refs', [])),
                model.get('msfs2024_user_note', ''),
                model.get('msfs2024_last_verified_on', ''),
                model.get('data_confidence', 'starter_design_band'),
                model.get('notes', ''),
            )
        )
        for tag in model.get('best_fit_contract_tags', []):
            tag_rows.append((model['model_id'], str(tag), 1.0))
        tag_rows.append((model['model_id'], f"role:{model['market_role_pool']}", 1.0))
        tag_rows.append((model['model_id'], f"msfs_status:{model['msfs2024_status']}", 1.0))
        tag_rows.append((model['model_id'], f"airport_size_min:{model['minimum_airport_size']}", 1.0))
        tag_rows.append((model['model_id'], f"gate:{model['gate_requirement']}", 1.0))
        if model['msfs2024_available_for_user']:
            tag_rows.append((model['model_id'], 'msfs_available', 1.0))
        else:
            tag_rows.append((model['model_id'], 'msfs_unavailable_to_user', 1.0))
    conn.executemany(
        '''
        INSERT INTO aircraft_model (
            model_id,
            family_id,
            display_name,
            short_name,
            variant_kind,
            in_service_role,
            aircraft_category,
            engine_type,
            engine_count,
            fuel_type,
            pressurized,
            max_passengers,
            max_cargo_lb,
            max_takeoff_weight_lb,
            operating_empty_weight_lb,
            max_payload_lb,
            cargo_volume_cuft,
            max_usable_fuel_gal,
            wingspan_ft,
            aircraft_length_ft,
            tail_height_ft,
            icao_reference_code,
            approach_category,
            service_ceiling_ft,
            takeoff_distance_ft,
            landing_distance_ft,
            payload_class,
            combi_capable,
            cruise_speed_ktas,
            range_nm,
            fuel_burn_gph,
            typical_turnaround_min,
            minimum_runway_ft,
            preferred_runway_ft,
            hard_surface_required,
            rough_field_capable,
            minimum_airport_size,
            preferred_airport_size,
            gate_requirement,
            required_ground_service_level,
            cargo_loading_type,
            market_value_usd,
            target_lease_rate_monthly_usd,
            variable_operating_cost_per_hour_usd,
            fixed_support_cost_per_day_usd,
            maintenance_reserve_per_hour_usd,
            pilot_qualification_group,
            pilots_required,
            flight_attendants_required,
            mechanic_skill_group,
            base_dispatch_reliability,
            condition_decay_per_hour,
            condition_decay_per_cycle,
            inspection_interval_hours,
            inspection_interval_cycles,
            heavy_maintenance_band,
            maintenance_downtime_hours,
            market_role_pool,
            progression_tier,
            startup_eligible,
            reputation_gate,
            best_fit_contract_tags,
            airport_access_profile,
            msfs2024_available_for_user,
            msfs2024_status,
            msfs2024_included_tier,
            msfs2024_distribution_channels,
            msfs2024_example_products,
            msfs2024_source_refs,
            msfs2024_user_note,
            msfs2024_last_verified_on,
            data_confidence,
            notes
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ''',
        rows,
    )
    conn.executemany('INSERT OR REPLACE INTO aircraft_tag (model_id, tag, weight) VALUES (?, ?, ?)', tag_rows)


def insert_cabin_layouts(conn: sqlite3.Connection) -> None:
    rows = [
        (
            layout['layout_id'],
            layout['model_id'],
            layout['display_name'],
            layout['config_type'],
            as_int(layout.get('is_default', False)),
            as_int(layout['total_seats']),
            as_int(layout.get('first_class_seats', 0)),
            as_int(layout.get('business_class_seats', 0)),
            as_int(layout.get('premium_economy_seats', 0)),
            as_int(layout.get('economy_seats', 0)),
            as_int(layout.get('cargo_capacity_lb', 0)),
            layout.get('notes', ''),
        )
        for layout in CABIN_LAYOUTS
    ]
    conn.executemany(
        '''
        INSERT INTO aircraft_cabin_layout (
            layout_id,
            model_id,
            display_name,
            config_type,
            is_default,
            total_seats,
            first_class_seats,
            business_class_seats,
            premium_economy_seats,
            economy_seats,
            cargo_capacity_lb,
            notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''',
        rows,
    )


def print_summary(conn: sqlite3.Connection) -> None:
    print(f"family_count: {conn.execute('SELECT COUNT(*) FROM aircraft_family').fetchone()[0]}")
    print(f"model_count: {conn.execute('SELECT COUNT(*) FROM aircraft_model').fetchone()[0]}")
    print(f"layout_count: {conn.execute('SELECT COUNT(*) FROM aircraft_cabin_layout').fetchone()[0]}")
    for status in ('confirmed_available', 'confirmed_unavailable', 'not_verified'):
        count = conn.execute('SELECT COUNT(*) FROM aircraft_model WHERE msfs2024_status = ?', (status,)).fetchone()[0]
        print(f"{status}: {count}")
    print('sample_user_catalog')
    for row in conn.execute(
        '''
        SELECT display_name, minimum_airport_size, preferred_airport_size, max_passengers, msfs2024_user_label
        FROM aircraft_user_catalog
        ORDER BY progression_tier, display_name
        LIMIT 12
        '''
    ):
        print(' | '.join(str(value) for value in row))


def main() -> None:
    args = parse_args()
    db_path = args.db_path.resolve()
    schema_path = args.schema_path.resolve()
    if not schema_path.exists():
        raise FileNotFoundError(f'Missing required schema file: {schema_path}')

    db_path.parent.mkdir(parents=True, exist_ok=True)
    reset_db(db_path)
    with sqlite3.connect(db_path) as conn:
        apply_schema(conn, schema_path)
        insert_families(conn)
        insert_models(conn)
        insert_cabin_layouts(conn)
        conn.commit()
        print_summary(conn)


if __name__ == '__main__':
    main()
