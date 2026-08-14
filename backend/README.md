# Backend Scripts

Python scripts for managing territory data. **No database required** - all data stored as JSON files.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Scripts

### `setup.py` - Initialize Data

Generates initial data files including teams, ownership, and territory centroids:

```bash
python setup.py --season 2026
```

**What it does:**
1. Creates `frontend/public/data/teams.json` with all 138 FBS teams and their locations
2. Calculates centroid for each of 3,221 US counties
3. Assigns each county to nearest team based on distance
4. Saves initial ownership to `frontend/public/data/ownership.json`
5. Generates `territory-centroids.json` for efficient logo rendering
6. Creates `county-stats.json` with county metadata (population, area, etc.)
7. Seeds week 0 ownership, logos, and leaderboards for the selected season

**Run this once** to set up the map, or re-run to regenerate baseline data.

Season setup reads the matching file in `data/seasons/`, so historical seasons
use the teams and conferences that were active in that year. Historical setup
does not replace the root `teams.json`, `ownership.json`, or
`territory-centroids.json` files used for the current-season fallback.

### `build_history.py` - Rebuild CFP-Era History

Build season-specific baselines, ESPN results, territory snapshots, logos, and
leaderboards for a range of completed seasons:

```bash
python build_history.py --start-season 2014 --end-season 2025
```

The checked-in CFP-era membership files cover 2014 through 2026. To refresh
them from ESPN's season-specific FBS conference groups, run:

```bash
python sync_season_memberships.py --start-season 2014 --end-season 2026
```

### `ingest_games.py` - Fetch Game Results

Download completed FBS games from ESPN's public scoreboard and normalize them for later processing:

```bash
python ingest_games.py --season 2026 --season-type both --provider espn
```

**Options:**
- `--season YEAR` - Season year (e.g., 2026)
- `--season-type TYPE` - Season type: `regular`, `postseason`, or `both` (default: `both`)
- `--provider PROVIDER` - `espn` (default) or `cfbd`

**What it does:**
1. Fetches every ESPN FBS scoreboard week using the current 200-event page limit
2. Normalizes game data (standardizes team names, adds metadata)
3. Splits ESPN's single postseason bucket into chronological seven-day windows
4. Stores weekly summaries under `frontend/public/data/games/<season>/week-XX.json`
5. Creates/updates `games/<season>/index.json` with season timeline

**Environment:** ESPN requires no API key. The optional `cfbd` provider uses `CFBD_API_KEY`.

### `apply_transfers.py` - Apply Territory Seizures

Walk the normalized game results in chronological order and update county ownership:

```bash
python apply_transfers.py --season 2026
```

**Options:**
- `--season YEAR` - Season year to process (required)
- `--dry-run` - Preview changes without writing files

**What it does:**
1. Loads baseline ownership from `ownership/<season>/week-00.json`
2. Processes each week's games in chronological order
3. Applies territory transfer rules (winner takes loser's counties)
4. Outputs per-week snapshots to `frontend/public/data/ownership/<season>/week-XX.json`
5. **Calculates and saves territory centroids** for each week (`week-XX-centroids.json`)
6. Records all transfers to `transfers.json` for history tracking
7. Updates `ownership/<season>/index.json` for the frontend dropdown

**Important:** Territory centroids are recalculated each week to ensure team logos appear at the correct position after conquests. When a team conquers new territory, their logo moves to the new centroid of their combined territories.

**Use `--dry-run`** to preview changes without modifying files.

### `sync_teams.py` - Regenerate Team Metadata

Keeps `frontend/public/data/teams.json` in sync with the canonical CSV (`backend/data/team_locs.csv`). Run this after editing the CSV.

```bash
python sync_teams.py
```

This script only rewrites `teams.json`; downstream artifacts (logo colors, ownership snapshots, etc.) remain untouched until you explicitly regenerate them.

## Library Modules

### `lib/territory.py`
- `calculate_centroid()` - Get center point of county polygon
- `calculate_distance()` - Haversine distance between coordinates
- `assign_initial_ownership()` - Assign counties to nearest teams *(legacy helper)*

### `lib/game_engine.py`
- `process_game_result()` - Determine territory transfers
- `validate_ownership()` - Check data consistency

### `lib/centroid_calculator.py`
- `calculate_territory_centroids()` - Calculate team logo positions based on current ownership
- Used by `apply_transfers.py` to generate weekly centroid snapshots

### `lib/db.py`
- `load_json()` / `save_json()` - File I/O helpers
- `load_teams()` / `save_teams()` - Team data
- `load_ownership()` / `save_ownership()` - Territory state
- `append_transfer()` - Log transfer history

## Data Files

All files in `frontend/public/data/`:

```
frontend/public/data/
├── us-counties.geojson          # Source GeoJSON (3.1MB, committed)
├── sample-counties.geojson      # Sample data for testing
├── teams.json                   # Current-season teams + locations
├── teams-all.json               # Current and historical teams used by the UI
├── teams/                       # Season-specific teams and conference data
├── ownership.json               # Current-season baseline ownership
├── county-stats.json            # County metadata (population, area, etc.)
├── territory-centroids.json     # Pre-calculated centroids for all territories
├── ownership/
│   └── 2026/
│       ├── week-00.json               # Initial ownership (same as ownership.json)
│       ├── week-00-centroids.json     # Territory centroids for baseline
│       ├── week-01.json               # Snapshot after Week 1
│       ├── week-01-centroids.json     # Territory centroids after Week 1
│       └── week-XX*.json              # ... subsequent weeks + centroids
├── games/
│   └── 2026/
│       ├── index.json           # Season timeline metadata
│       └── week-XX.json         # Normalized game results per week
├── territory-centroids/         # (optional) Individual centroid files
└── transfers.json               # Complete transfer history log
```

> **Note:** Edit team details in `backend/data/team_locs.csv` only. After changes, run `python sync_teams.py` (or `python setup.py`) to regenerate `teams.json`. Avoid hand-editing the JSON file; it will be overwritten by the next regeneration.

## Workflow

### Initial Setup (One Time)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python setup.py --season 2026
```

### Weekly Update Process

```bash
# 1. Activate virtual environment
source venv/bin/activate

# 2. Fetch latest game results
python ingest_games.py --season 2026 --season-type both --provider espn

# 3. Apply territory transfers
python apply_transfers.py --season 2026

# 4. Review changes (optional)
git diff frontend/public/data/

# 5. Commit and deploy
cd ..
git add frontend/public/data/
git commit -m "Update territories for week X"
git push

# 6. Vercel auto-deploys updated map
```

## Environment Variables

Create `.env` file:

```
# Only needed when running ingest_games.py --provider cfbd
CFBD_API_KEY=your_api_key_here
```

Get API key from https://collegefootballdata.com
