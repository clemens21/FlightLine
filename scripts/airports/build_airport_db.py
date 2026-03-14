from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = ROOT / "data" / "airports" / "flightline-airports.sqlite"
DEFAULT_SCHEMA_PATH = ROOT / "data" / "airports" / "schema" / "001_initial.sql"
SOURCE_KEY = "legacy_airports_and_runways_mdb"

HARD_SURFACE_TOKENS = ("asphalt", "concrete", "pem", "treated")
SOFT_SURFACE_TOKENS = ("turf", "grass", "dirt", "sand")
LOOSE_SURFACE_TOKENS = ("gravel",)
WATER_SURFACE_TOKENS = ("water",)
RUNWAY_IDENT_PATTERN = re.compile(r"([0-9]{1,2}[LCR]?|[NEWS])/([0-9]{1,2}[LCR]?|[NEWS])")
ICAO_PATTERN = re.compile(r"[A-Z]{4}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the local FlightLine airport database.")
    parser.add_argument(
        "--source-json",
        required=True,
        type=Path,
        help="Path to the legacy airport JSON source.",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=DEFAULT_DB_PATH,
        help="Destination SQLite database path.",
    )
    parser.add_argument(
        "--schema-path",
        type=Path,
        default=DEFAULT_SCHEMA_PATH,
        help="Schema SQL file to apply before import.",
    )
    return parser.parse_args()


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def parse_int(value: Any) -> int | None:
    text = clean_text(value)
    if text is None:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def parse_float(value: Any) -> float | None:
    text = clean_text(value)
    if text is None:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_coordinates(raw_value: Any) -> tuple[float, float]:
    text = clean_text(raw_value)
    if text is None or "," not in text:
        raise ValueError(f"Invalid coordinate pair: {raw_value!r}")
    longitude_text, latitude_text = [part.strip() for part in text.split(",", 1)]
    longitude = float(longitude_text)
    latitude = float(latitude_text)
    return latitude, longitude


def infer_icao_code(*candidates: Any) -> str | None:
    for candidate in candidates:
        text = clean_text(candidate)
        if text is None:
            continue
        token = text.upper()
        if token != "ZZZZ" and ICAO_PATTERN.fullmatch(token):
            return token
    return None


def normalize_surface(raw_value: Any) -> str:
    text = (clean_text(raw_value) or "").lower()
    if not text:
        return "unknown"
    if any(token in text for token in HARD_SURFACE_TOKENS):
        return "hard"
    if any(token in text for token in WATER_SURFACE_TOKENS):
        return "water"
    if any(token in text for token in LOOSE_SURFACE_TOKENS):
        return "loose"
    if any(token in text for token in SOFT_SURFACE_TOKENS):
        return "soft"
    return "other"


def parse_runway_idents(runway_name: str | None) -> tuple[str | None, str | None]:
    text = clean_text(runway_name)
    if text is None:
        return None, None
    match = RUNWAY_IDENT_PATTERN.search(text)
    if not match:
        return None, None
    return match.group(1), match.group(2)


def compute_source_version(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()[:16]


def load_airports(source_json_path: Path) -> list[dict[str, Any]]:
    with source_json_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    airports = payload.get("airports")
    if not isinstance(airports, list):
        raise ValueError("Expected top-level 'airports' list in legacy JSON.")
    return airports


def register_source_snapshot(conn: sqlite3.Connection, source_json_path: Path) -> int:
    version_label = compute_source_version(source_json_path)
    acquired_at_utc = str(source_json_path.stat().st_mtime_ns)
    conn.execute(
        """
        INSERT INTO source_snapshot (
          source_key,
          source_name,
          source_type,
          version_label,
          raw_path,
          acquired_at_utc,
          imported_at_utc,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT (source_key, version_label) DO UPDATE SET
          raw_path = excluded.raw_path,
          acquired_at_utc = excluded.acquired_at_utc,
          imported_at_utc = CURRENT_TIMESTAMP,
          notes = excluded.notes
        """,
        (
            SOURCE_KEY,
            source_json_path.name,
            "legacy_scrape",
            version_label,
            str(source_json_path),
            acquired_at_utc,
            "Imported from the legacy AirportsAndRunways_mdb JSON dump.",
        ),
    )
    row = conn.execute(
        "SELECT id FROM source_snapshot WHERE source_key = ? AND version_label = ?",
        (SOURCE_KEY, version_label),
    ).fetchone()
    if row is None:
        raise RuntimeError("Failed to register source snapshot.")
    return int(row[0])


def derive_profile(airport_type: str | None, runways: list[dict[str, Any]]) -> dict[str, Any]:
    longest_runway_ft = 0
    longest_hard_runway_ft = 0
    has_lighted_runway = 0
    has_hard_surface = 0

    for runway in runways:
        length_ft = parse_int(runway.get("length")) or 0
        surface_category = normalize_surface(runway.get("surface"))
        if length_ft > longest_runway_ft:
            longest_runway_ft = length_ft
        if surface_category == "hard" and length_ft > longest_hard_runway_ft:
            longest_hard_runway_ft = length_ft
        if surface_category == "hard":
            has_hard_surface = 1
        if clean_text(runway.get("lights")) not in (None, "", "n"):
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

    supports_small_utility = int(
        normalized_type in {"small_airport", "medium_airport", "large_airport"} and longest_runway_ft >= 1500
    )
    supports_regional_turboprop = int(
        normalized_type in {"small_airport", "medium_airport", "large_airport"} and longest_hard_runway_ft >= 3200
    )
    supports_regional_jet = int(
        normalized_type in {"small_airport", "medium_airport", "large_airport"} and longest_hard_runway_ft >= 5000
    )
    supports_narrowbody = int(
        normalized_type in {"small_airport", "medium_airport", "large_airport"} and longest_hard_runway_ft >= 6500
    )

    accessible_now = 0
    visibility_status = "hidden"
    access_tier = "restricted"

    if normalized_type in {"small_airport", "medium_airport", "large_airport"} and supports_small_utility:
        accessible_now = 1
        visibility_status = "supported"

    if supports_narrowbody:
        access_tier = "narrowbody"
    elif supports_regional_jet:
        access_tier = "regional_jet"
    elif supports_regional_turboprop:
        access_tier = "regional_turboprop"
    elif supports_small_utility:
        access_tier = "utility"
    elif normalized_type == "seaplane_base":
        access_tier = "seaplane"

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


def airport_key_for(record: dict[str, Any]) -> str:
    for field_name in ("ident", "gps_code", "local_code", "iata_code"):
        token = clean_text(record.get(field_name))
        if token is not None:
            return token
    raise ValueError(f"Airport record is missing all identifier candidates: {record!r}")


def upsert_airport(
    conn: sqlite3.Connection,
    airport_record: dict[str, Any],
    source_snapshot_id: int,
) -> None:
    airport_key = airport_key_for(airport_record)
    ident_code = clean_text(airport_record.get("ident")) or airport_key
    latitude_deg, longitude_deg = parse_coordinates(airport_record.get("coordinates"))
    icao_code = infer_icao_code(airport_record.get("ident"), airport_record.get("gps_code"))
    runways_map = airport_record.get("runways") or {}
    runways = []
    if isinstance(runways_map, dict):
        for runway_name, runway_values in runways_map.items():
            if isinstance(runway_values, dict):
                runways.append({"runway_name": runway_name, **runway_values})

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
          data_confidence,
          updated_at_utc
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (airport_key) DO UPDATE SET
          ident_code = excluded.ident_code,
          icao_code = excluded.icao_code,
          iata_code = excluded.iata_code,
          gps_code = excluded.gps_code,
          local_code = excluded.local_code,
          name = excluded.name,
          airport_type = excluded.airport_type,
          continent = excluded.continent,
          latitude_deg = excluded.latitude_deg,
          longitude_deg = excluded.longitude_deg,
          elevation_ft = excluded.elevation_ft,
          iso_country = excluded.iso_country,
          iso_region = excluded.iso_region,
          municipality = excluded.municipality,
          timezone = excluded.timezone,
          scheduled_service = excluded.scheduled_service,
          data_confidence = excluded.data_confidence,
          updated_at_utc = CURRENT_TIMESTAMP
        """,
        (
            airport_key,
            ident_code,
            icao_code,
            clean_text(airport_record.get("iata_code")),
            clean_text(airport_record.get("gps_code")),
            clean_text(airport_record.get("local_code")),
            clean_text(airport_record.get("name")) or airport_key,
            clean_text(airport_record.get("type")) or "unknown",
            clean_text(airport_record.get("continent")),
            latitude_deg,
            longitude_deg,
            parse_int(airport_record.get("elevation_ft")),
            clean_text(airport_record.get("iso_country")),
            clean_text(airport_record.get("iso_region")),
            clean_text(airport_record.get("municipality")),
            None,
            0,
            "legacy_scrape",
        ),
    )

    airport_row = conn.execute(
        "SELECT id FROM airport WHERE airport_key = ?",
        (airport_key,),
    ).fetchone()
    if airport_row is None:
        raise RuntimeError(f"Failed to upsert airport {airport_key}.")
    airport_id = int(airport_row[0])

    profile = derive_profile(clean_text(airport_record.get("type")), runways)
    conn.execute(
        """
        INSERT INTO airport_profile (
          airport_id,
          in_database,
          accessible_now,
          visibility_status,
          size_tier,
          infrastructure_tier,
          access_tier,
          longest_runway_ft,
          longest_hard_runway_ft,
          has_lighted_runway,
          has_hard_surface,
          supports_small_utility,
          supports_regional_turboprop,
          supports_regional_jet,
          supports_narrowbody
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

    conn.execute("DELETE FROM airport_runway WHERE airport_id = ?", (airport_id,))
    for runway in runways:
        runway_ident_a, runway_ident_b = parse_runway_idents(runway.get("runway_name"))
        lighting_code = clean_text(runway.get("lights"))
        conn.execute(
            """
            INSERT INTO airport_runway (
              airport_id,
              runway_name,
              runway_ident_a,
              runway_ident_b,
              length_ft,
              width_ft,
              surface_raw,
              surface_category,
              lighting_code,
              has_lighting,
              is_closed,
              latitude_deg,
              longitude_deg,
              elevation_ft,
              heading_deg,
              landing_system
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                airport_id,
                clean_text(runway.get("runway_name")) or "Unnamed runway",
                runway_ident_a,
                runway_ident_b,
                parse_int(runway.get("length")),
                parse_int(runway.get("width")),
                clean_text(runway.get("surface")),
                normalize_surface(runway.get("surface")),
                lighting_code,
                int(lighting_code not in (None, "", "n")),
                0,
                parse_float(runway.get("latitude")),
                parse_float(runway.get("longitude")),
                parse_int(runway.get("elevation")),
                parse_float(runway.get("heading")),
                clean_text(runway.get("landing")),
            ),
        )

    conn.execute(
        "DELETE FROM airport_source_record WHERE airport_id = ? AND source_snapshot_id = ?",
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
        (
            airport_id,
            source_snapshot_id,
            airport_key,
            "Legacy airport import record.",
        ),
    )


def apply_schema(conn: sqlite3.Connection, schema_path: Path) -> None:
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.executescript(schema_path.read_text(encoding="utf-8"))


def main() -> None:
    args = parse_args()
    source_json_path = args.source_json.resolve()
    db_path = args.db_path.resolve()
    schema_path = args.schema_path.resolve()

    if not source_json_path.exists():
        raise FileNotFoundError(f"Source JSON not found: {source_json_path}")
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema SQL not found: {schema_path}")

    db_path.parent.mkdir(parents=True, exist_ok=True)
    airports = load_airports(source_json_path)

    with sqlite3.connect(db_path) as conn:
        apply_schema(conn, schema_path)
        source_snapshot_id = register_source_snapshot(conn, source_json_path)
        for airport_record in airports:
            upsert_airport(conn, airport_record, source_snapshot_id)

        airport_count = conn.execute("SELECT COUNT(*) FROM airport").fetchone()[0]
        runway_count = conn.execute("SELECT COUNT(*) FROM airport_runway").fetchone()[0]
        supported_count = conn.execute(
            "SELECT COUNT(*) FROM airport_profile WHERE accessible_now = 1"
        ).fetchone()[0]

    print(f"Built airport database at: {db_path}")
    print(f"Imported airports: {airport_count}")
    print(f"Imported runways: {runway_count}")
    print(f"Accessible now: {supported_count}")


if __name__ == "__main__":
    main()
