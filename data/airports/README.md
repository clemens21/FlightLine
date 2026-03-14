# FlightLine Airport Database

This folder holds the local airport database and its build inputs.

Files:

- `flightline-airports.sqlite`: local SQLite database used by FlightLine
- `schema/001_initial.sql`: canonical schema for the airport database
- `incoming/`: place future raw source files here if we want them inside the repo workspace
- `snapshots/`: optional dated source snapshots that we want to retain locally

Current bootstrap source:

- `Z:\projects\SimAvion\datum\AirportsAndRunways_mdb.json`

Build command:

```powershell
python scripts/airports/build_airport_db.py --source-json "Z:\projects\SimAvion\datum\AirportsAndRunways_mdb.json"
```

Notes:

- The SQLite file is intentionally local and ignored by git.
- The legacy JSON is treated as a source snapshot, not as the final schema.
- We can add newer source layers later without throwing away this first database.
