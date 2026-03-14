from __future__ import annotations

import argparse
import re
import sqlite3
import unicodedata
from pathlib import Path

from build_airport_db import DEFAULT_DB_PATH

SPECIAL_TYPES = {'closed', 'heliport', 'seaplane_base', 'balloonport'}
TOURISM_TOKENS = {
    'beach', 'coast', 'harbor', 'harbour', 'island', 'lake', 'lakes', 'mountain', 'park',
    'resort', 'ski', 'springs', 'tourism', 'tourist', 'vacation', 'bay', 'falls', 'canyon',
}
BUSINESS_TOKENS = {
    'business', 'capital', 'central', 'city', 'commercial', 'corporate', 'downtown',
    'executive', 'financial', 'industrial', 'international', 'intl', 'metro', 'metropolitan',
}
CARGO_TOKENS = {
    'cargo', 'distribution', 'dock', 'freight', 'harbor', 'harbour', 'industrial', 'logistics',
    'port', 'shipping', 'terminal', 'warehouse',
}
REMOTE_TOKENS = {
    'camp', 'frontier', 'island', 'lodge', 'mine', 'mining', 'outpost', 'ranch', 'remote',
    'station', 'utility', 'village',
}
TOKEN_PATTERN = re.compile(r'[a-z0-9]+')
PASSENGER_ACCESS_BONUS = {
    'restricted': 0,
    'utility': 8,
    'regional_turboprop': 16,
    'regional_jet': 24,
    'narrowbody': 32,
    'seaplane': 0,
    'heliport': 0,
    'closed': 0,
    'balloonport': 0,
}
CARGO_ACCESS_BONUS = {
    'restricted': 0,
    'utility': 10,
    'regional_turboprop': 18,
    'regional_jet': 22,
    'narrowbody': 26,
    'seaplane': 0,
    'heliport': 0,
    'closed': 0,
    'balloonport': 0,
}
BUSINESS_ACCESS_BONUS = {
    'restricted': 0,
    'utility': 2,
    'regional_turboprop': 10,
    'regional_jet': 18,
    'narrowbody': 26,
    'seaplane': 0,
    'heliport': 0,
    'closed': 0,
    'balloonport': 0,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Populate derived airport generation tags in the FlightLine airport DB.')
    parser.add_argument('--db-path', type=Path, default=DEFAULT_DB_PATH, help='FlightLine SQLite airport DB.')
    return parser.parse_args()


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def normalize_text(text: str | None) -> str:
    if not text:
        return ''
    normalized = unicodedata.normalize('NFKD', text)
    ascii_only = normalized.encode('ascii', 'ignore').decode('ascii')
    return ascii_only.lower()


def tokenize(*values: str | None) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        tokens.update(TOKEN_PATTERN.findall(normalize_text(value)))
    return tokens


def token_hits(tokens: set[str], candidates: set[str]) -> int:
    return sum(1 for token in tokens if token in candidates)


def classify_market_region(
    iso_country: str | None,
    iso_region: str | None,
    country_counts: dict[str, int],
    region_counts: dict[str, int],
) -> str | None:
    if iso_country is None and iso_region is None:
        return None
    country_count = country_counts.get(iso_country or '', 0)
    region_count = region_counts.get(iso_region or '', 0)
    if iso_region and country_count >= 250 and region_count >= 15:
        return iso_region
    return iso_country or iso_region


def classify_maintenance_band(
    airport_type: str,
    airport_size: int,
    accessible_now: int,
    has_hard_surface: int,
) -> str:
    if airport_type in SPECIAL_TYPES:
        return 'none'
    if airport_size >= 5:
        return 'major'
    if airport_size == 4:
        return 'regional'
    if airport_size == 3 and has_hard_surface:
        return 'line'
    if airport_size == 3:
        return 'basic'
    if airport_size == 2 and accessible_now:
        return 'basic'
    return 'none'


def score_remote(
    airport_type: str,
    airport_size: int,
    scheduled_service: int,
    access_tier: str,
    longest_runway_ft: int,
    longest_hard_runway_ft: int,
    tokens: set[str],
) -> float:
    if airport_type in SPECIAL_TYPES:
        return 0.0
    score = 0.0
    if airport_size == 2:
        score += 35
    elif airport_size == 1:
        score += 18
    elif airport_size == 3:
        score += 12
    if not scheduled_service:
        score += 18
    if access_tier == 'utility':
        score += 18
    elif access_tier == 'restricted':
        score += 10
    if longest_hard_runway_ft <= 0:
        score += 12
    elif longest_hard_runway_ft < 3500:
        score += 8
    if 0 < longest_runway_ft < 4000:
        score += 10
    if airport_type == 'small_airport':
        score += 8
    score += min(token_hits(tokens, REMOTE_TOKENS) * 8, 16)
    if airport_size >= 4:
        score -= 20
    if access_tier in {'regional_jet', 'narrowbody'}:
        score -= 18
    if scheduled_service and airport_size >= 3:
        score -= 10
    return clamp(score)


def score_business(
    airport_type: str,
    airport_size: int,
    scheduled_service: int,
    access_tier: str,
    longest_hard_runway_ft: int,
    remote_score: float,
    tokens: set[str],
) -> float:
    if airport_type in SPECIAL_TYPES:
        return 0.0
    score = airport_size * 12
    score += scheduled_service * 18
    score += BUSINESS_ACCESS_BONUS.get(access_tier, 0)
    score += min(longest_hard_runway_ft / 1000, 15)
    if airport_type == 'large_airport':
        score += 10
    elif airport_type == 'medium_airport':
        score += 5
    score += min(token_hits(tokens, BUSINESS_TOKENS) * 7, 21)
    if remote_score >= 60:
        score -= 20
    if not scheduled_service and airport_size <= 2:
        score -= 10
    return clamp(score)


def score_tourism(
    airport_type: str,
    airport_size: int,
    scheduled_service: int,
    business_score: float,
    tokens: set[str],
) -> float:
    if airport_type in SPECIAL_TYPES:
        return 0.0
    score = airport_size * 8
    score += scheduled_service * 10
    score += min(token_hits(tokens, TOURISM_TOKENS) * 8, 32)
    if airport_size in {2, 3, 4}:
        score += 5
    if business_score >= 70:
        score -= 5
    if not scheduled_service and airport_size <= 2:
        score = min(score, 45)
    return clamp(score)


def score_passenger(
    airport_type: str,
    airport_size: int,
    scheduled_service: int,
    access_tier: str,
    longest_hard_runway_ft: int,
    has_lighted_runway: int,
    remote_score: float,
    tourism_score: float,
    business_score: float,
) -> float:
    if airport_type in SPECIAL_TYPES:
        return 0.0
    score = airport_size * 10
    score += scheduled_service * 16
    score += PASSENGER_ACCESS_BONUS.get(access_tier, 0)
    score += min(longest_hard_runway_ft / 1000, 18)
    score += has_lighted_runway * 4
    score += min(max(business_score - 40, 0) / 3, 12)
    score += min(max(tourism_score - 40, 0) / 3, 10)
    if remote_score >= 60:
        score -= 15
    if access_tier == 'utility' and longest_hard_runway_ft <= 0:
        score -= 10
    return clamp(score)


def score_cargo(
    airport_type: str,
    airport_size: int,
    scheduled_service: int,
    access_tier: str,
    longest_runway_ft: int,
    longest_hard_runway_ft: int,
    has_hard_surface: int,
    remote_score: float,
    tokens: set[str],
) -> float:
    if airport_type in SPECIAL_TYPES:
        return 0.0
    score = airport_size * 6
    score += min(longest_runway_ft / 400, 20)
    score += min(longest_hard_runway_ft / 400, 22)
    score += has_hard_surface * 10
    score += CARGO_ACCESS_BONUS.get(access_tier, 0)
    score += min(token_hits(tokens, CARGO_TOKENS) * 8, 24)
    if not scheduled_service and airport_size <= 3:
        score += 6
    if remote_score >= 55:
        score += 6
    return clamp(score)


def classify_demand_archetype(
    airport_type: str,
    airport_size: int,
    scheduled_service: int,
    passenger_score: float,
    cargo_score: float,
    remote_score: float,
    tourism_score: float,
    business_score: float,
) -> str:
    if airport_type in SPECIAL_TYPES:
        return 'mixed_secondary'
    if airport_size == 5 and scheduled_service and passenger_score >= 70:
        return 'major_hub'
    if remote_score >= 70 and airport_size <= 2:
        return 'remote_utility'
    if cargo_score >= passenger_score + 12 and cargo_score >= 55:
        return 'cargo_feeder'
    if tourism_score >= max(business_score, cargo_score) and tourism_score >= 60:
        return 'tourism_gateway'
    if business_score >= max(tourism_score, cargo_score) and business_score >= 60:
        return 'business_gateway'
    if airport_size in {3, 4} and passenger_score >= 50:
        return 'regional_connector'
    return 'mixed_secondary'


def compute_contract_generation_weight(
    accessible_now: int,
    airport_type: str,
    passenger_score: float,
    cargo_score: float,
    remote_score: float,
    demand_archetype: str,
    scheduled_service: int,
) -> float:
    weight = 0.2
    weight += passenger_score * 0.010
    weight += cargo_score * 0.008
    weight += remote_score * 0.006
    if demand_archetype == 'major_hub':
        weight += 0.40
    elif demand_archetype in {'business_gateway', 'tourism_gateway'}:
        weight += 0.25
    elif demand_archetype in {'regional_connector', 'cargo_feeder'}:
        weight += 0.18
    elif demand_archetype == 'remote_utility':
        weight += 0.10
    if scheduled_service:
        weight += 0.10
    if not accessible_now:
        weight *= 0.35
    if airport_type in SPECIAL_TYPES:
        weight *= 0.25
    return round(max(0.05, min(weight, 2.50)), 3)


def derive_tags(row: sqlite3.Row, country_counts: dict[str, int], region_counts: dict[str, int]) -> dict[str, object]:
    airport_type = row['airport_type'] or 'unknown'
    airport_size = int(row['airport_size'] or 1)
    scheduled_service = int(row['scheduled_service'] or 0)
    access_tier = row['access_tier'] or 'restricted'
    longest_runway_ft = int(row['longest_runway_ft'] or 0)
    longest_hard_runway_ft = int(row['longest_hard_runway_ft'] or 0)
    has_hard_surface = int(row['has_hard_surface'] or 0)
    has_lighted_runway = int(row['has_lighted_runway'] or 0)
    accessible_now = int(row['accessible_now'] or 0)
    tokens = tokenize(row['name'], row['keywords'], row['municipality'])

    remote_score = score_remote(
        airport_type,
        airport_size,
        scheduled_service,
        access_tier,
        longest_runway_ft,
        longest_hard_runway_ft,
        tokens,
    )
    business_score = score_business(
        airport_type,
        airport_size,
        scheduled_service,
        access_tier,
        longest_hard_runway_ft,
        remote_score,
        tokens,
    )
    tourism_score = score_tourism(
        airport_type,
        airport_size,
        scheduled_service,
        business_score,
        tokens,
    )
    passenger_score = score_passenger(
        airport_type,
        airport_size,
        scheduled_service,
        access_tier,
        longest_hard_runway_ft,
        has_lighted_runway,
        remote_score,
        tourism_score,
        business_score,
    )
    cargo_score = score_cargo(
        airport_type,
        airport_size,
        scheduled_service,
        access_tier,
        longest_runway_ft,
        longest_hard_runway_ft,
        has_hard_surface,
        remote_score,
        tokens,
    )
    demand_archetype = classify_demand_archetype(
        airport_type,
        airport_size,
        scheduled_service,
        passenger_score,
        cargo_score,
        remote_score,
        tourism_score,
        business_score,
    )
    maintenance_capability_band = classify_maintenance_band(
        airport_type,
        airport_size,
        accessible_now,
        has_hard_surface,
    )
    market_region = classify_market_region(
        row['iso_country'],
        row['iso_region'],
        country_counts,
        region_counts,
    )
    contract_generation_weight = compute_contract_generation_weight(
        accessible_now,
        airport_type,
        passenger_score,
        cargo_score,
        remote_score,
        demand_archetype,
        scheduled_service,
    )
    return {
        'airport_id': row['airport_id'],
        'passenger_score': round(passenger_score, 1),
        'cargo_score': round(cargo_score, 1),
        'remote_score': round(remote_score, 1),
        'tourism_score': round(tourism_score, 1),
        'business_score': round(business_score, 1),
        'demand_archetype': demand_archetype,
        'maintenance_capability_band': maintenance_capability_band,
        'market_region': market_region,
        'contract_generation_weight': contract_generation_weight,
    }


def populate_airport_profile(conn: sqlite3.Connection) -> list[dict[str, object]]:
    conn.row_factory = sqlite3.Row
    country_counts = {row['iso_country']: row['airport_count'] for row in conn.execute(
        "SELECT iso_country, COUNT(*) AS airport_count FROM airport WHERE iso_country IS NOT NULL GROUP BY iso_country"
    )}
    region_counts = {row['iso_region']: row['airport_count'] for row in conn.execute(
        "SELECT iso_region, COUNT(*) AS airport_count FROM airport WHERE iso_region IS NOT NULL GROUP BY iso_region"
    )}
    rows = conn.execute(
        '''
        SELECT
          a.id AS airport_id,
          a.name,
          a.airport_type,
          a.airport_size,
          a.scheduled_service,
          a.iso_country,
          a.iso_region,
          a.municipality,
          a.keywords,
          p.accessible_now,
          p.access_tier,
          p.longest_runway_ft,
          p.longest_hard_runway_ft,
          p.has_lighted_runway,
          p.has_hard_surface
        FROM airport a
        JOIN airport_profile p ON p.airport_id = a.id
        '''
    ).fetchall()
    derived_rows = [derive_tags(row, country_counts, region_counts) for row in rows]
    conn.executemany(
        '''
        UPDATE airport_profile
        SET passenger_score = ?,
            cargo_score = ?,
            remote_score = ?,
            tourism_score = ?,
            business_score = ?,
            demand_archetype = ?,
            maintenance_capability_band = ?,
            contract_generation_weight = ?,
            market_region = ?
        WHERE airport_id = ?
        ''',
        [
            (
                row['passenger_score'],
                row['cargo_score'],
                row['remote_score'],
                row['tourism_score'],
                row['business_score'],
                row['demand_archetype'],
                row['maintenance_capability_band'],
                row['contract_generation_weight'],
                row['market_region'],
                row['airport_id'],
            )
            for row in derived_rows
        ],
    )
    return derived_rows


def populate_airport_tag(conn: sqlite3.Connection, derived_rows: list[dict[str, object]]) -> None:
    conn.execute("DELETE FROM airport_tag WHERE tag_source = 'derived'")
    tag_rows: list[tuple[int, str, str, float]] = []
    for row in derived_rows:
        airport_id = int(row['airport_id'])
        tag_rows.append((airport_id, f"archetype:{row['demand_archetype']}", 'derived', 1.0))
        if float(row['passenger_score']) >= 60:
            tag_rows.append((airport_id, 'passenger', 'derived', float(row['passenger_score']) / 100.0))
        if float(row['cargo_score']) >= 60:
            tag_rows.append((airport_id, 'cargo', 'derived', float(row['cargo_score']) / 100.0))
        if float(row['remote_score']) >= 60:
            tag_rows.append((airport_id, 'remote', 'derived', float(row['remote_score']) / 100.0))
        if float(row['business_score']) >= 60:
            tag_rows.append((airport_id, 'business', 'derived', float(row['business_score']) / 100.0))
        if float(row['tourism_score']) >= 60:
            tag_rows.append((airport_id, 'tourism', 'derived', float(row['tourism_score']) / 100.0))
        if row['maintenance_capability_band'] in {'regional', 'major'}:
            tag_rows.append((airport_id, 'maintenance_capable', 'derived', 1.0))
    conn.executemany(
        'INSERT OR REPLACE INTO airport_tag (airport_id, tag, tag_source, weight) VALUES (?, ?, ?, ?)',
        tag_rows,
    )


def main() -> None:
    args = parse_args()
    db_path = args.db_path.resolve()
    if not db_path.exists():
        raise FileNotFoundError(f'FlightLine airport DB not found: {db_path}')

    with sqlite3.connect(db_path) as conn:
        derived_rows = populate_airport_profile(conn)
        populate_airport_tag(conn, derived_rows)
        conn.commit()
        print(f'updated_airport_profiles: {len(derived_rows)}')
        print('archetype_distribution')
        for row in conn.execute(
            'SELECT demand_archetype, COUNT(*) FROM airport_profile GROUP BY demand_archetype ORDER BY COUNT(*) DESC'
        ):
            print(row[0], row[1])
        print('top_market_regions')
        for row in conn.execute(
            'SELECT market_region, COUNT(*) FROM airport_profile WHERE market_region IS NOT NULL GROUP BY market_region ORDER BY COUNT(*) DESC LIMIT 15'
        ):
            print(row[0], row[1])
        print('tag_count', conn.execute("SELECT COUNT(*) FROM airport_tag WHERE tag_source = 'derived'").fetchone()[0])


if __name__ == '__main__':
    main()
