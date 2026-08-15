#!/usr/bin/env python3
"""Sync season-specific FBS membership and conferences from ESPN's core API."""

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import requests

from lib.teams import build_team_name_lookup, load_all_teams, resolve_team_id

CORE_BASE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football'
SITE_TEAMS_URL = (
    'https://site.api.espn.com/apis/site/v2/sports/football/'
    'college-football/teams'
)
OUTPUT_DIR = Path(__file__).resolve().parent / 'data' / 'seasons'

CONFERENCE_GROUPS = {
    151: 'AAC',
    1: 'ACC',
    4: 'Big 12',
    5: 'Big Ten',
    12: 'CUSA',
    18: 'Independent',
    15: 'MAC',
    17: 'Mountain West',
    9: 'Pac-12',
    8: 'SEC',
    37: 'Sun Belt',
}

EXPECTED_TEAM_COUNTS = {
    2014: 128,
    2015: 128,
    2016: 128,
    2017: 130,
    2018: 130,
    2019: 130,
    2020: 130,
    2021: 130,
    2022: 131,
    2023: 133,
    2024: 134,
    2025: 136,
    2026: 138,
}


def _fetch_json(session: requests.Session, url: str, params: Optional[Dict] = None) -> Dict:
    response = session.get(url, params=params, timeout=30)
    if not response.ok:
        raise RuntimeError(f'ESPN request failed: {response.status_code} {response.text}')
    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError('ESPN returned an unexpected payload')
    return payload


def load_espn_team_directory(session: requests.Session) -> Dict[str, Dict]:
    teams: Dict[str, Dict] = {}
    for page in range(1, 5):
        payload = _fetch_json(
            session,
            SITE_TEAMS_URL,
            {'limit': 200, 'page': page},
        )
        league = ((payload.get('sports') or [{}])[0].get('leagues') or [{}])[0]
        for wrapper in league.get('teams') or []:
            team = wrapper.get('team') or {}
            if team.get('id'):
                teams[str(team['id'])] = team
    return teams


def _resolve_espn_team(team: Dict, lookup: Dict[str, str]) -> Optional[str]:
    for key in ('location', 'shortDisplayName', 'displayName', 'nickname', 'name'):
        team_id = resolve_team_id(team.get(key), lookup)
        if team_id:
            return team_id
    return None


def fetch_memberships(
    session: requests.Session,
    season: int,
    espn_teams: Dict[str, Dict],
    lookup: Dict[str, str],
) -> List[Dict]:
    memberships: Dict[str, Dict] = {}
    unresolved: Dict[str, Dict] = {}

    for group_id, conference in CONFERENCE_GROUPS.items():
        url = (
            f'{CORE_BASE}/seasons/{season}/types/2/groups/'
            f'{group_id}/teams'
        )
        payload = _fetch_json(session, url, {'limit': 100})
        for item in payload.get('items') or []:
            match = re.search(r'/teams/(\d+)', item.get('$ref') or '')
            if not match:
                continue
            espn_id = match.group(1)
            team = espn_teams.get(espn_id) or {}
            team_id = _resolve_espn_team(team, lookup)
            if not team_id:
                unresolved[espn_id] = team
                continue

            # UAB remained a CUSA institution but did not sponsor football in 2015-16.
            if team_id == 'uab' and season in {2015, 2016}:
                continue

            memberships[team_id] = {
                'id': team_id,
                'conference': conference,
                'espnId': int(espn_id),
            }

    if unresolved:
        labels = {
            espn_id: team.get('displayName') or team.get('location') or 'unknown'
            for espn_id, team in unresolved.items()
        }
        raise ValueError(f'Could not resolve ESPN teams for {season}: {labels}')

    result = sorted(memberships.values(), key=lambda entry: entry['id'])
    expected = EXPECTED_TEAM_COUNTS.get(season)
    if expected is not None and len(result) != expected:
        raise ValueError(
            f'{season} resolved {len(result)} FBS teams; expected {expected}'
        )
    return result


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Sync historical FBS memberships')
    parser.add_argument('--start-season', type=int, default=2014)
    parser.add_argument('--end-season', type=int, default=2026)
    return parser.parse_args(list(argv) if argv is not None else None)


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    session = requests.Session()
    session.headers.update({'Accept': 'application/json'})
    all_teams = load_all_teams()
    lookup = build_team_name_lookup(all_teams)
    espn_teams = load_espn_team_directory(session)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for season in range(args.start_season, args.end_season + 1):
        teams = fetch_memberships(session, season, espn_teams, lookup)
        payload = {
            'season': season,
            'teamCount': len(teams),
            'source': 'ESPN season-specific FBS conference groups',
            'sourceUrl': f'{CORE_BASE}/seasons/{season}/types/2/groups/80',
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'teams': teams,
        }
        output_path = OUTPUT_DIR / f'{season}.json'
        with output_path.open('w', encoding='utf-8') as handle:
            json.dump(payload, handle, indent=2)
            handle.write('\n')
        print(f'✓ {season}: {len(teams)} FBS teams')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
