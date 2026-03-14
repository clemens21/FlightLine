from __future__ import annotations

import argparse
import csv
import hashlib
import sqlite3
from collections import defaultdict
from datetime import date
from pathlib import Path
from urllib.request import urlopen

from build_airport_db import DEFAULT_DB_PATH, ROOT, clean_text, normalize_surface, parse_float, parse_int


OURAIRPORTS_BASE_URL = "https://davidmegginson.github.io/ourairports-data/"
OURAIRPORTS_FILES = (
    "airports.csv",
    "runways.csv",
    "airport-frequencies.csv",
    "countries.csv",
    "regions.csv",
)
OURAIRPORTS_SOURCE_KEY = "ourairports_csv"
DEFAULT_SNAPSHOT_ROOT = ROOT / "data" / "airports" / "snapshots" / "ourairports"
PRIMARY_FIXED_WING_TYPES = {"small_airport", "medium_airport", "large_airport"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Enrich the FlightLine airport DB from OurAirports.")
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH, help="FlightLine SQLite airport DB.")
    parser.add_argument("--ourairports-dir", type=Path, help="Existing local OurAirports snapshot directory.")
    parser.add_argument(
        "--download-ourairports",
        action="store_true",
        help="Download a fresh OurAirports snapshot before enriching.",
    )
    parser.add_argument(
        "--ourairports-date",
        default=date.today().isoformat(),
        help="Date label to use when downloading a local OurAirports snapshot.",
    )
    return parser.parse_args()


def parse_bool_flag(value: object) -> int:
    text = (clean_text(value) or "").lower()
    return int(text in {"1", "true", "t", "yes", "y"})


def midpoint(*values: float | None) -> float | None:
    numbers = [value for value in values if value is not None]
    if not numbers:
        return None
    return sum(numbers) / len(numbers)


def download_snapshot(snapshot_root: Path, snapshot_date: str) -> Path:
    snapshot_dir = snapshot_root / snapshot_date
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    for filename in OURAIRPORTS_FILES:
        data = urlopen(OURAIRPORTS_BASE_URL + filename).read()
        (snapshot_dir / filename).write_bytes(data)
    return snapshot_dir


def compute_dir_version(path: Path) -> str:
    digest = hashlib.sha256()
    for child in sorted(candidate for candidate in path.rglob("*") if candidate.is_file()):
        digest.update(str(child.relative_to(path)).encode("utf-8"))
        digest.update(child.read_bytes())
    return digest.hexdigest()[:16]


def latest_mtime_ns(path: Path) -> int:
    mtimes = [child.stat().st_mtime_ns for child in path.rglob("*") if child.is_file()]
    return max(mtimes) if mtimes else path.stat().st_mtime_ns


def register_source_snapshot(conn: sqlite3.Connection, snapshot_dir: Path) -> int:
    version_label = compute_dir_version(snapshot_dir)
    conn.execute(
        """
        INSERT INTO source_snapshot (
          source_key,
          source_name,
          source_type,
          version_label,
          source_url,
          raw_path,
          license_name,
          license_url,
          acquired_at_utc,
          imported_at_utc,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT (source_key, version_label) DO UPDATE SET
          raw_path = excluded.raw_path,
          acquired_at_utc = excluded.acquired_at_utc,
          imported_at_utc = CURRENT_TIMESTAMP,
          notes = excluded.notes
        """,
        (
            OURAIRPORTS_SOURCE_KEY,
            snapshot_dir.name,
            "ourairports_snapshot",
            version_label,
            OURAIRPORTS_BASE_URL,
            str(snapshot_dir),
            "Public Domain",
            "https://ourairports.com/data/",
            str(latest_mtime_ns(snapshot_dir)),
            "Current OurAirports overlay for airport, runway, frequency, country, and region enrichment.",
        ),
    )
    row = conn.execute(
        "SELECT id FROM source_snapshot WHERE source_key = ? AND version_label = ?",
        (OURAIRPORTS_SOURCE_KEY, version_label),
    ).fetchone()
    if row is None:
        raise RuntimeError("Failed to register OurAirports snapshot.")
    return int(row[0])


def load_airport_id_cache(conn: sqlite3.Connection) -> dict[str, int]:
    return {row[0]: row[1] for row in conn.execute("SELECT airport_key, id FROM airport")}


def upsert_airport(conn: sqlite3.Connection, cache: dict[str, int], row: dict[str, str]) -> int:
    airport_key = clean_text(row.get("ident"))
    if airport_key is None:
        raise ValueError("OurAirports row is missing ident.")
    conn.execute(
        """
        INSERT INTO airport (
          airport_key,
          ident_code,
          icao_code,
          iata_code,
          gps_code,
          local_code,
          name,
          airport_type,
          continent,
          latitude_deg,
          longitude_deg,
          elevation_ft,
          iso_country,
          iso_region,
          municipality,
          timezone,
          scheduled_service,
          home_link,
          wikipedia_link,
          keywords,
          data_confidence,
          updated_at_utc
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (airport_key) DO UPDATE SET
          ident_code = excluded.ident_code,
          icao_code = COALESCE(excluded.icao_code, airport.icao_code),
          iata_code = COALESCE(excluded.iata_code, airport.iata_code),
          gps_code = COALESCE(excluded.gps_code, airport.gps_code),
          local_code = COALESCE(excluded.local_code, airport.local_code),
          name = excluded.name,
          airport_type = excluded.airport_type,
          continent = COALESCE(excluded.continent, airport.continent),
          latitude_deg = excluded.latitude_deg,
          longitude_deg = excluded.longitude_deg,
          elevation_ft = COALESCE(excluded.elevation_ft, airport.elevation_ft),
          iso_country = COALESCE(excluded.iso_country, airport.iso_country),
          iso_region = COALESCE(excluded.iso_region, airport.iso_region),
          municipality = COALESCE(excluded.municipality, airport.municipality),
          scheduled_service = excluded.scheduled_service,
          home_link = COALESCE(excluded.home_link, airport.home_link),
          wikipedia_link = COALESCE(excluded.wikipedia_link, airport.wikipedia_link),
          keywords = COALESCE(excluded.keywords, airport.keywords),
          data_confidence = excluded.data_confidence,
          updated_at_utc = CURRENT_TIMESTAMP
        """,
        (
            airport_key,
            airport_key,
            clean_text(row.get("icao_code")),
            clean_text(row.get("iata_code")),
            clean_text(row.get("gps_code")),
            clean_text(row.get("local_code")),
            clean_text(row.get("name")) or airport_key,
            clean_text(row.get("type")) or "unknown",
            clean_text(row.get("continent")),
            parse_float(row.get("latitude_deg")),
            parse_float(row.get("longitude_deg")),
            parse_int(row.get("elevation_ft")),
            clean_text(row.get("iso_country")),
            clean_text(row.get("iso_region")),
            clean_text(row.get("municipality")),
            None,
            parse_bool_flag(row.get("scheduled_service")),
            clean_text(row.get("home_link")),
            clean_text(row.get("wikipedia_link")),
            clean_text(row.get("keywords")),
            "ourairports_current",
        ),
    )
    airport_id = cache.get(airport_key)
    if airport_id is None:
        airport_id = int(conn.execute("SELECT id FROM airport WHERE airport_key = ?", (airport_key,)).fetchone()[0])
        cache[airport_key] = airport_id
    return airport_id


def insert_airport_source_record(conn: sqlite3.Connection, airport_id: int, source_snapshot_id: int, airport_key: str) -> None:
    conn.execute(
        "DELETE FROM airport_source_record WHERE airport_id = ? AND source_snapshot_id = ? AND entity_type = 'airport'",
        (airport_id, source_snapshot_id),
    )
    conn.execute(
        """
        INSERT INTO airport_source_record (
          airport_id,
          source_snapshot_id,
          entity_type,
          source_record_key,
          is_primary,
          notes
        )
        VALUES (?, ?, 'airport', ?, 1, ?)
        """,
        (airport_id, source_snapshot_id, airport_key, "Current OurAirports airport record."),
    )


def import_country_reference(conn: sqlite3.Connection, snapshot_dir: Path) -> None:
    with (snapshot_dir / "countries.csv").open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            conn.execute(
                """
                INSERT INTO country_reference (code, source_country_id, name, continent, wikipedia_link, keywords)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (code) DO UPDATE SET
                  source_country_id = excluded.source_country_id,
                  name = excluded.name,
                  continent = excluded.continent,
                  wikipedia_link = excluded.wikipedia_link,
                  keywords = excluded.keywords
                """,
                (
                    clean_text(row.get("code")),
                    clean_text(row.get("id")),
                    clean_text(row.get("name")) or clean_text(row.get("code")),
                    clean_text(row.get("continent")),
                    clean_text(row.get("wikipedia_link")),
                    clean_text(row.get("keywords")),
                ),
            )


def import_region_reference(conn: sqlite3.Connection, snapshot_dir: Path) -> None:
    with (snapshot_dir / "regions.csv").open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            conn.execute(
                """
                INSERT INTO region_reference (code, source_region_id, local_code, name, continent, iso_country, wikipedia_link, keywords)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (code) DO UPDATE SET
                  source_region_id = excluded.source_region_id,
                  local_code = excluded.local_code,
                  name = excluded.name,
                  continent = excluded.continent,
                  iso_country = excluded.iso_country,
                  wikipedia_link = excluded.wikipedia_link,
                  keywords = excluded.keywords
                """,
                (
                    clean_text(row.get("code")),
                    clean_text(row.get("id")),
                    clean_text(row.get("local_code")),
                    clean_text(row.get("name")) or clean_text(row.get("code")),
                    clean_text(row.get("continent")),
                    clean_text(row.get("iso_country")),
                    clean_text(row.get("wikipedia_link")),
                    clean_text(row.get("keywords")),
                ),
            )


def build_runway_row(row: dict[str, str]) -> dict[str, object]:
    le_latitude_deg = parse_float(row.get("le_latitude_deg"))
    le_longitude_deg = parse_float(row.get("le_longitude_deg"))
    he_latitude_deg = parse_float(row.get("he_latitude_deg"))
    he_longitude_deg = parse_float(row.get("he_longitude_deg"))
    runway_ident_a = clean_text(row.get("le_ident"))
    runway_ident_b = clean_text(row.get("he_ident"))
    runway_name = "/".join(value for value in (runway_ident_a, runway_ident_b) if value) or f"Runway {row.get('id')}"
    return {
        "source_runway_id": clean_text(row.get("id")),
        "source_airport_ident": clean_text(row.get("airport_ident")),
        "runway_name": runway_name,
        "runway_ident_a": runway_ident_a,
        "runway_ident_b": runway_ident_b,
        "length_ft": parse_int(row.get("length_ft")),
        "width_ft": parse_int(row.get("width_ft")),
        "surface_raw": clean_text(row.get("surface")),
        "surface_category": normalize_surface(row.get("surface")),
        "lighting_code": clean_text(row.get("lighted")),
        "has_lighting": parse_bool_flag(row.get("lighted")),
        "is_closed": parse_bool_flag(row.get("closed")),
        "latitude_deg": midpoint(le_latitude_deg, he_latitude_deg),
        "longitude_deg": midpoint(le_longitude_deg, he_longitude_deg),
        "elevation_ft": parse_int(row.get("le_elevation_ft")) or parse_int(row.get("he_elevation_ft")),
        "heading_deg": parse_float(row.get("le_heading_degT")) or parse_float(row.get("he_heading_degT")),
        "landing_system": None,
        "le_latitude_deg": le_latitude_deg,
        "le_longitude_deg": le_longitude_deg,
        "le_elevation_ft": parse_int(row.get("le_elevation_ft")),
        "le_heading_degT": parse_float(row.get("le_heading_degT")),
        "le_displaced_threshold_ft": parse_int(row.get("le_displaced_threshold_ft")),
        "he_latitude_deg": he_latitude_deg,
        "he_longitude_deg": he_longitude_deg,
        "he_elevation_ft": parse_int(row.get("he_elevation_ft")),
        "he_heading_degT": parse_float(row.get("he_heading_degT")),
        "he_displaced_threshold_ft": parse_int(row.get("he_displaced_threshold_ft")),
    }


def load_grouped_runways(snapshot_dir: Path) -> dict[str, list[dict[str, object]]]:
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    with (snapshot_dir / "runways.csv").open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            airport_ident = clean_text(row.get("airport_ident"))
            if airport_ident is not None:
                grouped[airport_ident].append(build_runway_row(row))
    return grouped


def load_grouped_frequencies(snapshot_dir: Path) -> dict[str, list[dict[str, object]]]:
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    with (snapshot_dir / "airport-frequencies.csv").open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            airport_ident = clean_text(row.get("airport_ident"))
            if airport_ident is not None:
                grouped[airport_ident].append(
                    {
                        "source_frequency_id": clean_text(row.get("id")),
                        "airport_ident": airport_ident,
                        "frequency_type": clean_text(row.get("type")) or "UNKNOWN",
                        "description": clean_text(row.get("description")),
                        "frequency_mhz": parse_float(row.get("frequency_mhz")),
                    }
                )
    return grouped


def replace_runways_for_airport(conn: sqlite3.Connection, airport_id: int, runways: list[dict[str, object]]) -> None:
    if not runways:
        return
    conn.execute("DELETE FROM airport_runway WHERE airport_id = ?", (airport_id,))
    for runway in runways:
        conn.execute(
            """
            INSERT INTO airport_runway (
              airport_id, source_runway_id, source_airport_ident, runway_name, runway_ident_a, runway_ident_b,
              length_ft, width_ft, surface_raw, surface_category, lighting_code, has_lighting, is_closed,
              latitude_deg, longitude_deg, elevation_ft, heading_deg, landing_system,
              le_latitude_deg, le_longitude_deg, le_elevation_ft, le_heading_degT, le_displaced_threshold_ft,
              he_latitude_deg, he_longitude_deg, he_elevation_ft, he_heading_degT, he_displaced_threshold_ft
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                airport_id,
                runway.get("source_runway_id"),
                runway.get("source_airport_ident"),
                runway.get("runway_name"),
                runway.get("runway_ident_a"),
                runway.get("runway_ident_b"),
                runway.get("length_ft"),
                runway.get("width_ft"),
                runway.get("surface_raw"),
                runway.get("surface_category"),
                runway.get("lighting_code"),
                runway.get("has_lighting"),
                runway.get("is_closed"),
                runway.get("latitude_deg"),
                runway.get("longitude_deg"),
                runway.get("elevation_ft"),
                runway.get("heading_deg"),
                runway.get("landing_system"),
                runway.get("le_latitude_deg"),
                runway.get("le_longitude_deg"),
                runway.get("le_elevation_ft"),
                runway.get("le_heading_degT"),
                runway.get("le_displaced_threshold_ft"),
                runway.get("he_latitude_deg"),
                runway.get("he_longitude_deg"),
                runway.get("he_elevation_ft"),
                runway.get("he_heading_degT"),
                runway.get("he_displaced_threshold_ft"),
            ),
        )


def replace_frequencies_for_airport(conn: sqlite3.Connection, airport_id: int, frequencies: list[dict[str, object]]) -> None:
    if not frequencies:
        return
    conn.execute("DELETE FROM airport_frequency WHERE airport_id = ?", (airport_id,))
    for frequency in frequencies:
        conn.execute(
            """
            INSERT INTO airport_frequency (
              airport_id, source_frequency_id, airport_ident, frequency_type, description, frequency_mhz, callsign
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                airport_id,
                frequency.get("source_frequency_id"),
                frequency.get("airport_ident"),
                frequency.get("frequency_type"),
                frequency.get("description"),
                frequency.get("frequency_mhz"),
                None,
            ),
        )


def derive_profile(airport_type: str | None, runways: list[dict[str, object]]) -> dict[str, object]:
    longest_runway_ft = 0
    longest_hard_runway_ft = 0
    has_lighted_runway = 0
    has_hard_surface = 0
    for runway in runways:
        if parse_bool_flag(runway.get("is_closed")):
            continue
        length_ft = parse_int(runway.get("length_ft")) or 0
        surface_category = clean_text(runway.get("surface_category")) or normalize_surface(runway.get("surface_raw"))
        if length_ft > longest_runway_ft:
            longest_runway_ft = length_ft
        if surface_category == "hard" and length_ft > longest_hard_runway_ft:
            longest_hard_runway_ft = length_ft
        if surface_category == "hard":
            has_hard_surface = 1
        if parse_bool_flag(runway.get("has_lighting")):
            has_lighted_runway = 1

    normalized_type = airport_type or "unknown"
    size_tier = "specialty"
    if normalized_type == "large_airport":
        size_tier = "large"
    elif normalized_type == "medium_airport":
        size_tier = "medium"
    elif normalized_type == "small_airport":
        size_tier = "small"

    if normalized_type == "seaplane_base":
        infrastructure_tier = "seaplane"
    elif normalized_type == "large_airport" or longest_hard_runway_ft >= 8000:
        infrastructure_tier = "major"
    elif normalized_type == "medium_airport" or longest_hard_runway_ft >= 5000:
        infrastructure_tier = "regional"
    elif longest_hard_runway_ft >= 3000 or has_lighted_runway:
        infrastructure_tier = "developed"
    else:
        infrastructure_tier = "basic"

    supports_small_utility = int(normalized_type in PRIMARY_FIXED_WING_TYPES and longest_runway_ft >= 1500)
    supports_regional_turboprop = int(normalized_type in PRIMARY_FIXED_WING_TYPES and longest_hard_runway_ft >= 3200)
    supports_regional_jet = int(normalized_type in PRIMARY_FIXED_WING_TYPES and longest_hard_runway_ft >= 5000)
    supports_narrowbody = int(normalized_type in PRIMARY_FIXED_WING_TYPES and longest_hard_runway_ft >= 6500)

    accessible_now = 0
    visibility_status = "hidden"
    access_tier = "restricted"
    if normalized_type == "closed":
        visibility_status = "excluded"
        access_tier = "closed"
    elif normalized_type == "seaplane_base":
        access_tier = "seaplane"
    elif normalized_type == "heliport":
        access_tier = "heliport"
    elif normalized_type == "balloonport":
        access_tier = "balloonport"
    else:
        if supports_narrowbody:
            access_tier = "narrowbody"
        elif supports_regional_jet:
            access_tier = "regional_jet"
        elif supports_regional_turboprop:
            access_tier = "regional_turboprop"
        elif supports_small_utility:
            access_tier = "utility"
        if normalized_type in PRIMARY_FIXED_WING_TYPES and supports_small_utility:
            accessible_now = 1
            visibility_status = "supported"

    return {
        "in_database": 1,
        "accessible_now": accessible_now,
        "visibility_status": visibility_status,
        "size_tier": size_tier,
        "infrastructure_tier": infrastructure_tier,
        "access_tier": access_tier,
        "longest_runway_ft": longest_runway_ft or None,
        "longest_hard_runway_ft": longest_hard_runway_ft or None,
        "has_lighted_runway": has_lighted_runway,
        "has_hard_surface": has_hard_surface,
        "supports_small_utility": supports_small_utility,
        "supports_regional_turboprop": supports_regional_turboprop,
        "supports_regional_jet": supports_regional_jet,
        "supports_narrowbody": supports_narrowbody,
    }


def recompute_profiles(conn: sqlite3.Connection) -> None:
    runways_by_airport: dict[int, list[dict[str, object]]] = defaultdict(list)
    for row in conn.execute("SELECT airport_id, length_ft, surface_raw, surface_category, has_lighting, is_closed FROM airport_runway"):
        runways_by_airport[int(row[0])].append(
            {
                "length_ft": row[1],
                "surface_raw": row[2],
                "surface_category": row[3],
                "has_lighting": row[4],
                "is_closed": row[5],
            }
        )
    for airport_id, airport_type in conn.execute("SELECT id, airport_type FROM airport"):
        profile = derive_profile(airport_type, runways_by_airport.get(int(airport_id), []))
        conn.execute(
            """
            INSERT INTO airport_profile (
              airport_id, in_database, accessible_now, visibility_status, size_tier, infrastructure_tier,
              access_tier, longest_runway_ft, longest_hard_runway_ft, has_lighted_runway, has_hard_surface,
              supports_small_utility, supports_regional_turboprop, supports_regional_jet, supports_narrowbody
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (airport_id) DO UPDATE SET
              in_database = excluded.in_database,
              accessible_now = excluded.accessible_now,
              visibility_status = excluded.visibility_status,
              size_tier = excluded.size_tier,
              infrastructure_tier = excluded.infrastructure_tier,
              access_tier = excluded.access_tier,
              longest_runway_ft = excluded.longest_runway_ft,
              longest_hard_runway_ft = excluded.longest_hard_runway_ft,
              has_lighted_runway = excluded.has_lighted_runway,
              has_hard_surface = excluded.has_hard_surface,
              supports_small_utility = excluded.supports_small_utility,
              supports_regional_turboprop = excluded.supports_regional_turboprop,
              supports_regional_jet = excluded.supports_regional_jet,
              supports_narrowbody = excluded.supports_narrowbody
            """,
            (
                airport_id,
                profile["in_database"],
                profile["accessible_now"],
                profile["visibility_status"],
                profile["size_tier"],
                profile["infrastructure_tier"],
                profile["access_tier"],
                profile["longest_runway_ft"],
                profile["longest_hard_runway_ft"],
                profile["has_lighted_runway"],
                profile["has_hard_surface"],
                profile["supports_small_utility"],
                profile["supports_regional_turboprop"],
                profile["supports_regional_jet"],
                profile["supports_narrowbody"],
            ),
        )


def main() -> None:
    args = parse_args()
    db_path = args.db_path.resolve()
    if not db_path.exists():
        raise FileNotFoundError(f"FlightLine airport DB not found: {db_path}")
    if args.download_ourairports:
        snapshot_dir = download_snapshot(DEFAULT_SNAPSHOT_ROOT, args.ourairports_date)
    elif args.ourairports_dir:
        snapshot_dir = args.ourairports_dir.resolve()
    else:
        raise ValueError("Provide --ourairports-dir or --download-ourairports.")
    if not snapshot_dir.exists():
        raise FileNotFoundError(f"OurAirports snapshot not found: {snapshot_dir}")

    with sqlite3.connect(db_path) as conn:
        source_snapshot_id = register_source_snapshot(conn, snapshot_dir)
        import_country_reference(conn, snapshot_dir)
        import_region_reference(conn, snapshot_dir)
        runways_by_ident = load_grouped_runways(snapshot_dir)
        frequencies_by_ident = load_grouped_frequencies(snapshot_dir)
        airport_id_cache = load_airport_id_cache(conn)
        with (snapshot_dir / "airports.csv").open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                airport_id = upsert_airport(conn, airport_id_cache, row)
                airport_key = clean_text(row.get("ident"))
                if airport_key is None:
                    continue
                insert_airport_source_record(conn, airport_id, source_snapshot_id, airport_key)
                if airport_key in runways_by_ident:
                    replace_runways_for_airport(conn, airport_id, runways_by_ident[airport_key])
                if airport_key in frequencies_by_ident:
                    replace_frequencies_for_airport(conn, airport_id, frequencies_by_ident[airport_key])
        recompute_profiles(conn)
        summary = {
            "airport_count": conn.execute("SELECT COUNT(*) FROM airport").fetchone()[0],
            "runway_count": conn.execute("SELECT COUNT(*) FROM airport_runway").fetchone()[0],
            "frequency_count": conn.execute("SELECT COUNT(*) FROM airport_frequency").fetchone()[0],
            "country_count": conn.execute("SELECT COUNT(*) FROM country_reference").fetchone()[0],
            "region_count": conn.execute("SELECT COUNT(*) FROM region_reference").fetchone()[0],
            "supported_count": conn.execute("SELECT COUNT(*) FROM airport_profile WHERE accessible_now = 1").fetchone()[0],
        }
    print(f"Enriched airport database: {db_path}")
    print(f"OurAirports snapshot: {snapshot_dir}")
    for key, value in summary.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
