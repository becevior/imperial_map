#!/usr/bin/env python3
"""Regenerate frontend/public/data/teams.json from backend/data/team_locs.csv.

Run this after editing the CSV so that all downstream artifacts stay in sync.
"""

from pathlib import Path
from typing import List, Dict

from lib.teams import load_teams_from_csv
from setup import create_teams_file


def regenerate_teams_file() -> int:
    teams: List[Dict] = load_teams_from_csv()
    create_teams_file(teams)
    print(
        "✓ Regenerated frontend/public/data/teams.json from backend/data/team_locs.csv"
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(regenerate_teams_file())
