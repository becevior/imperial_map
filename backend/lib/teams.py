"""
Team data loading and management utilities.
"""
import csv
import json
import unicodedata
from hashlib import md5
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set

DATA_DIR = Path(__file__).parent.parent / 'data'
HISTORICAL_TEAMS_PATH = DATA_DIR / 'historical_team_locs.csv'
SEASONS_DIR = DATA_DIR / 'seasons'


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


def _load_teams_csv(csv_path: Path) -> List[Dict]:
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
            logo_url = (row.get('Logo_URL') or row.get('LogoUrl') or row.get('Logo'))
            primary_color = primary_color if primary_color else None
            secondary_color = secondary_color if secondary_color else None
            if primary_color and not primary_color.startswith('#'):
                primary_color = f'#{primary_color}'
            if secondary_color and not secondary_color.startswith('#'):
                secondary_color = f'#{secondary_color}'
            if isinstance(logo_url, str):
                logo_url = logo_url.strip() or None
            else:
                logo_url = None

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
                'logoUrl': logo_url,
            }

            if conference:
                team_data['conference'] = conference.strip()

            teams.append(team_data)

    return teams


def load_teams_from_csv() -> List[Dict]:
    """Load the current FBS teams from team_locs.csv."""
    return _load_teams_csv(DATA_DIR / 'team_locs.csv')


def load_all_teams() -> List[Dict]:
    """Load current teams plus programs needed by historical seasons."""
    teams = load_teams_from_csv()
    if HISTORICAL_TEAMS_PATH.exists():
        teams.extend(_load_teams_csv(HISTORICAL_TEAMS_PATH))

    ids = [team['id'] for team in teams]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate team IDs found across team location files')
    return teams


def load_teams_for_season(season: int) -> List[Dict]:
    """Load only the FBS programs and conference labels active in a season."""
    config_path = SEASONS_DIR / f'{season}.json'
    if not config_path.exists():
        raise FileNotFoundError(
            f'No season membership config found for {season}: {config_path}'
        )

    with config_path.open('r', encoding='utf-8') as handle:
        config = json.load(handle)

    memberships = config.get('teams') or []
    membership_by_id = {
        entry['id']: entry.get('conference')
        for entry in memberships
        if entry.get('id')
    }
    all_teams = {team['id']: team for team in load_all_teams()}
    missing = sorted(set(membership_by_id) - set(all_teams))
    if missing:
        raise ValueError(f'Season {season} references unknown teams: {missing}')

    teams: List[Dict] = []
    for team_id, conference in membership_by_id.items():
        team = dict(all_teams[team_id])
        if conference:
            team['conference'] = conference
        else:
            team.pop('conference', None)
        teams.append(team)
    return teams


def get_team_locations(teams: Optional[List[Dict]] = None) -> Dict[str, Dict[str, float]]:
    """Return team locations in a convenient lookup dict."""
    if teams is None:
        teams = load_teams_from_csv()

    return {
        team['id']: {'lat': team['lat'], 'lon': team['lon']}
        for team in teams
    }


def _normalize_team_key(raw: str) -> str:
    """Normalize a team name into a consistent lookup key."""
    if not raw:
        return ''

    cleaned = raw.replace('&', 'and')
    cleaned = cleaned.replace('@', 'at')
    cleaned = cleaned.strip()
    cleaned = cleaned.replace("'", '')
    cleaned = cleaned.replace('\u2019', '')
    cleaned = cleaned.replace('\u2018', '')
    cleaned = unicodedata.normalize('NFKD', cleaned)
    cleaned = ''.join(ch for ch in cleaned if not unicodedata.combining(ch))
    # Handle NCAA naming quirks
    cleaned = cleaned.replace('St.', 'State')
    cleaned = cleaned.replace('Mt.', 'Mount')

    return _slugify(cleaned)


def _team_name_candidates(team: Dict) -> Set[str]:
    """Return a set of possible names used to identify the team."""
    candidates: Set[str] = set()

    for key in ('school', 'fullName', 'shortName', 'nickname'):
        value = team.get(key)
        if isinstance(value, str) and value.strip():
            candidates.add(value.strip())

    # Include a few additional variations that commonly appear in APIs
    if team.get('school') and team.get('state'):
        candidates.add(f"{team['school']} ({team['state']})")

    return candidates


def build_team_name_lookup(teams: Optional[List[Dict]] = None) -> Dict[str, str]:
    """Build a lookup table mapping normalized names to internal team IDs."""
    teams = teams or load_teams_from_csv()
    lookup: Dict[str, str] = {}

    for team in teams:
        team_id = team['id']
        for candidate in _team_name_candidates(team):
            key = _normalize_team_key(candidate)
            if not key:
                continue

            # Prefer the first mapping we encounter to avoid accidental overrides
            lookup.setdefault(key, team_id)

    # Common aliases that differ from CSV naming
    manual_overrides = {
        'utsa-roadrunners': 'utsa',
        'utsa': 'utsa',
        'texas-san-antonio': 'utsa',
        'smu-mustangs': 'smu',
        'tcu-horned-frogs': 'tcu',
        'ole-miss-rebels': 'ole-miss',
        'pitt-panthers': 'pittsburgh',
        'louisiana-lafayette': 'louisiana',
        'louisiana-ragin-cajuns': 'louisiana',
        'southern-cal': 'usc',
        'usc-trojans': 'usc',
        'utsa-texas-san-antonio': 'utsa',
        'miami-fl': 'miami',
        'miami-florida': 'miami',
        'miami-fl-hurricanes': 'miami',
        'uab-blazers': 'uab',
        'uab': 'uab',
        'app-state': 'appalachian-state',
        'florida-international': 'fiu',
        'ul-monroe': 'ulm',
        'cal': 'california',
        'massachusetts': 'umass',
        'uconn': 'connecticut',
    }

    for key, team_id in manual_overrides.items():
        lookup.setdefault(key, team_id)

    return lookup


def resolve_team_id(name: str, lookup: Optional[Dict[str, str]] = None) -> Optional[str]:
    """Resolve an arbitrary team name to the internal slug identifier."""
    if not name:
        return None

    key = _normalize_team_key(name)
    if not key:
        return None

    lookup = lookup or build_team_name_lookup()
    return lookup.get(key)


__all__ = [
    'build_team_name_lookup',
    'get_team_locations',
    'load_all_teams',
    'load_teams_from_csv',
    'load_teams_for_season',
    'resolve_team_id',
]
