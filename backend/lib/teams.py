"""
Team data loading and management utilities.
"""
import csv
from hashlib import md5
from pathlib import Path
from typing import Dict, List, Optional

DATA_DIR = Path(__file__).parent.parent / 'data'


def _slugify(value: str) -> str:
    """Create a normalized team identifier from the school name."""
    normalized = ''.join(ch.lower() if ch.isalnum() else '-' for ch in value)
    # Collapse duplicate hyphens and strip leading/trailing hyphens
    while '--' in normalized:
        normalized = normalized.replace('--', '-')
    return normalized.strip('-')


def _fallback_color(team_id: str) -> str:
    """Generate a deterministic fallback hex color for teams without overrides."""
    digest = md5(team_id.encode('utf-8')).hexdigest()
    r = int(digest[0:2], 16)
    g = int(digest[2:4], 16)
    b = int(digest[4:6], 16)

    def adjust(component: int) -> int:
        return max(70, min(200, component))

    return f"#{adjust(r):02x}{adjust(g):02x}{adjust(b):02x}"


def load_teams_from_csv() -> List[Dict]:
    """Load all FBS teams from team_locs.csv."""
    csv_path = DATA_DIR / 'team_locs.csv'

    teams: List[Dict] = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            school = row['School'].strip()
            team_id = _slugify(school)
            conference = row.get('Conference')
            full_name = row['Team_Name'].strip()
            short_name = row.get('ShortName', '').strip() or school
            primary_color = (row.get('Primary_Color_Hex') or row.get('PrimaryColorHex') or '').strip()
            secondary_color = (row.get('Secondary_Color_Hex') or row.get('SecondaryColorHex') or '').strip()
            primary_color = primary_color if primary_color else None
            secondary_color = secondary_color if secondary_color else None
            if primary_color and not primary_color.startswith('#'):
                primary_color = f'#{primary_color}'
            if secondary_color and not secondary_color.startswith('#'):
                secondary_color = f'#{secondary_color}'

            team_data = {
                'id': team_id,
                'school': school,
                'fullName': full_name,
                'shortName': short_name,
                'city': row['City'].strip(),
                'state': row['State'].strip(),
                'lat': float(row['Latitude']),
                'lon': float(row['Longitude']),
                'primaryColor': primary_color or _fallback_color(team_id),
                'secondaryColor': secondary_color,
            }

            if conference:
                team_data['conference'] = conference.strip()

            teams.append(team_data)

    return teams


def get_team_locations(teams: Optional[List[Dict]] = None) -> Dict[str, Dict[str, float]]:
    """Return team locations in a convenient lookup dict."""
    if teams is None:
        teams = load_teams_from_csv()

    return {
        team['id']: {'lat': team['lat'], 'lon': team['lon']}
        for team in teams
    }
