"""
Team data loading and management
"""
import csv
from pathlib import Path
from typing import List, Dict


def load_teams_from_csv() -> List[Dict]:
    """
    Load all FBS teams from team_locs.csv
    Returns list of team dicts with id, name, lat, lon
    """
    csv_path = Path(__file__).parent.parent / 'data' / 'team_locs.csv'

    teams = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Create team ID from school name (lowercase, hyphenated)
            team_id = row['School'].lower().replace(' ', '-').replace("'", '')

            teams.append({
                'id': team_id,
                'name': row['Team_Name'],
                'school': row['School'],
                'city': row['City'],
                'state': row['State'],
                'lat': float(row['Latitude']),
                'lon': float(row['Longitude'])
            })

    return teams


def get_team_locations() -> Dict[str, Dict[str, float]]:
    """
    Get team locations as dict mapping team_id -> {lat, lon}
    Used for territory assignment
    """
    teams = load_teams_from_csv()
    return {
        team['id']: {'lat': team['lat'], 'lon': team['lon']}
        for team in teams
    }
