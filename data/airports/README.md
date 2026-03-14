# FlightLine Airport Database

This folder holds the local airport reference database and its build inputs.

Files:

- `flightline-airports.sqlite`: the local SQLite airport database used by FlightLine
- `schema/001_initial.sql`: the canonical schema for the airport database
- `incoming/`: workspace-local source files we want to preserve manually
- `snapshots/`: dated local source snapshots such as OurAirports downloads

Current source layers:

- legacy bootstrap: `Z:\projects\SimAvion\datum\AirportsAndRunways_mdb.json`
- current global overlay: `data/airports/snapshots/ourairports/2026-03-13/`

Rebuild workflow:

```powershell
python scripts/airports/build_airport_db.py --source-json "Z:\projects\SimAvion\datum\AirportsAndRunways_mdb.json"
python scripts/airports/enrich_from_ourairports.py --ourairports-dir "Z:\projects\FlightLine\data\airports\snapshots\ourairports\2026-03-13"
python scripts/airports/apply_derived_airport_fields.py --force-timezones
python scripts/airports/apply_airport_generation_tags.py
```

Or download a fresh OurAirports snapshot during enrichment:

```powershell
python scripts/airports/enrich_from_ourairports.py --download-ourairports
python scripts/airports/apply_derived_airport_fields.py --force-timezones
python scripts/airports/apply_airport_generation_tags.py
```

Current local database contents after enrichment and derived generation tagging:

- `87,921` airports
- `48,321` runway rows
- `30,216` frequency rows
- `249` country records
- `3,942` region records
- timezone populated for all airports
- `airport_size` populated for all airports on a `1` to `5` scale
- `87,921` populated `airport_profile` rows
- `154,401` derived `airport_tag` rows
- `787` distinct `market_region` values

Current derived generation fields in `airport_profile`:

- `passenger_score`
- `cargo_score`
- `remote_score`
- `tourism_score`
- `business_score`
- `demand_archetype`
- `maintenance_capability_band`
- `contract_generation_weight`
- `market_region`

Notes:

- The SQLite file is intentionally tracked as a versioned reference snapshot.
- The raw source snapshots remain local workspace assets unless we choose to commit them explicitly.
- The database preserves raw `airport_type` while also adding a game-facing `airport_size` field.
- `timezonefinder` is installed locally in `.vendor/python` for offline timezone derivation and is ignored by git.
