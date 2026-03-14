from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VENDOR_PATH = ROOT / '.vendor' / 'python'
if VENDOR_PATH.exists():
    sys.path.insert(0, str(VENDOR_PATH))

from build_airport_db import DEFAULT_DB_PATH  # noqa: E402

try:
    from timezonefinder import TimezoneFinder  # type: ignore  # noqa: E402
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        'timezonefinder is not available. Install it locally with: '
        'python -m pip install --target .vendor/python timezonefinder==6.5.9'
    ) from exc

SPECIAL_TYPES = {'closed', 'heliport', 'seaplane_base', 'balloonport'}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Apply derived airport fields to the FlightLine airport database.')
    parser.add_argument('--db-path', type=Path, default=DEFAULT_DB_PATH, help='FlightLine SQLite airport DB.')
    parser.add_argument('--skip-timezones', action='store_true', help='Skip timezone calculation.')
    parser.add_argument('--skip-airport-size', action='store_true', help='Skip airport size calculation.')
    parser.add_argument('--force-timezones', action='store_true', help='Recompute timezone even if one is already set.')
    return parser.parse_args()


def ensure_columns(conn: sqlite3.Connection) -> None:
    existing_columns = {row[1] for row in conn.execute('PRAGMA table_info(airport)')}
    if 'airport_size' not in existing_columns:
        conn.execute('ALTER TABLE airport ADD COLUMN airport_size INTEGER CHECK (airport_size BETWEEN 1 AND 5)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_airport_size ON airport (airport_size)')


def classify_airport_size(
    source_airport_type: str | None,
    scheduled_service: int,
    access_tier: str | None,
    longest_runway_ft: int | None,
    longest_hard_runway_ft: int | None,
) -> int:
    airport_type = (source_airport_type or 'unknown').lower()
    access = (access_tier or 'restricted').lower()
    longest = longest_runway_ft or 0
    hard = longest_hard_runway_ft or 0
    has_service = int(scheduled_service or 0) == 1

    if airport_type in SPECIAL_TYPES:
        return 1
    if longest < 1500:
        return 1
    if has_service and hard >= 8500:
        return 5
    if airport_type == 'large_airport' and hard >= 7000:
        return 5
    if access == 'narrowbody' or airport_type == 'large_airport' or (has_service and hard >= 6000):
        return 4
    if access in {'regional_jet', 'regional_turboprop'} or airport_type == 'medium_airport' or has_service:
        return 3
    if access == 'utility':
        return 2
    return 1


def update_airport_sizes(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        '''
        SELECT a.id, a.airport_type, a.scheduled_service, p.access_tier, p.longest_runway_ft, p.longest_hard_runway_ft
        FROM airport a
        JOIN airport_profile p ON p.airport_id = a.id
        '''
    ).fetchall()
    updates = [
        (
            classify_airport_size(airport_type, scheduled_service, access_tier, longest_runway_ft, longest_hard_runway_ft),
            airport_id,
        )
        for airport_id, airport_type, scheduled_service, access_tier, longest_runway_ft, longest_hard_runway_ft in rows
    ]
    conn.executemany('UPDATE airport SET airport_size = ? WHERE id = ?', updates)
    print(f'updated_airport_sizes: {len(updates)}')


def lookup_timezone(tf: TimezoneFinder, latitude_deg: float, longitude_deg: float) -> str | None:
    timezone_name = tf.timezone_at(lng=longitude_deg, lat=latitude_deg)
    if timezone_name is not None:
        return timezone_name
    timezone_name = tf.timezone_at_land(lng=longitude_deg, lat=latitude_deg)
    if timezone_name is not None:
        return timezone_name
    return tf.certain_timezone_at(lng=longitude_deg, lat=latitude_deg)


def update_timezones(conn: sqlite3.Connection, force: bool) -> None:
    clause = '' if force else 'WHERE timezone IS NULL OR timezone = ""'
    rows = conn.execute(f'SELECT id, latitude_deg, longitude_deg FROM airport {clause}').fetchall()
    tf = TimezoneFinder(in_memory=True)
    updates: list[tuple[str | None, int]] = []
    for index, (airport_id, latitude_deg, longitude_deg) in enumerate(rows, start=1):
        timezone_name = lookup_timezone(tf, latitude_deg, longitude_deg)
        updates.append((timezone_name, airport_id))
        if index % 5000 == 0:
            conn.executemany('UPDATE airport SET timezone = ? WHERE id = ?', updates)
            conn.commit()
            print(f'updated_timezones: {index}/{len(rows)}')
            updates.clear()
    if updates:
        conn.executemany('UPDATE airport SET timezone = ? WHERE id = ?', updates)
    print(f'updated_timezones: {len(rows)}')


def main() -> None:
    args = parse_args()
    db_path = args.db_path.resolve()
    if not db_path.exists():
        raise FileNotFoundError(f'FlightLine airport DB not found: {db_path}')

    with sqlite3.connect(db_path) as conn:
        ensure_columns(conn)
        if not args.skip_airport_size:
            update_airport_sizes(conn)
        if not args.skip_timezones:
            update_timezones(conn, args.force_timezones)
        conn.commit()
        airport_size_count = conn.execute('SELECT COUNT(*) FROM airport WHERE airport_size IS NOT NULL').fetchone()[0]
        timezone_count = conn.execute('SELECT COUNT(*) FROM airport WHERE timezone IS NOT NULL AND timezone <> ""').fetchone()[0]
        print(f'airport_size_count: {airport_size_count}')
        print(f'timezone_count: {timezone_count}')


if __name__ == '__main__':
    main()
