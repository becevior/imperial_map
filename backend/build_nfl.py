#!/usr/bin/env python3
"""Build a complete static NFL imperial-map season from ESPN results."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import requests

from lib import db
from lib.game_engine import process_game_result
from lib.leaderboard_calculator import compute_leaderboard_payload
from lib.region_calculator import calculate_territory_logos
from setup import create_ownership_file


LEAGUE_ID = 'nfl'
DEFAULT_SEASON = 2025
MIN_SEASON = 2000
TEAMS_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams'
SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
SUPPORTED_POSTSEASON_LABELS = {
    'Wild Card',
    'Divisional Round',
    'Conference Championship',
    'Super Bowl',
}

PRE_REALIGNMENT_DIVISIONS = {
    'AFC East': {'2', '11', '15', '17', '20'},
    'AFC Central': {'4', '5', '10', '23', '30', '33'},
    'AFC West': {'7', '12', '13', '24', '26'},
    'NFC East': {'6', '19', '21', '22', '28'},
    'NFC Central': {'3', '8', '9', '16', '27'},
    'NFC West': {'1', '14', '18', '25', '29'},
}

MODERN_DIVISIONS = {
    'AFC East': {'2', '15', '17', '20'},
    'AFC North': {'4', '5', '23', '33'},
    'AFC South': {'10', '11', '30', '34'},
    'AFC West': {'7', '12', '13', '24'},
    'NFC East': {'6', '19', '21', '28'},
    'NFC North': {'3', '8', '9', '16'},
    'NFC South': {'1', '18', '27', '29'},
    'NFC West': {'14', '22', '25', '26'},
}


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Build static NFL imperial-map artifacts')
    season_group = parser.add_mutually_exclusive_group()
    season_group.add_argument('--season', type=int)
    season_group.add_argument('--start-season', type=int)
    parser.add_argument('--end-season', type=int)
    parser.add_argument(
        '--teams-csv',
        type=Path,
        default=Path(__file__).resolve().parent / 'data' / 'nfl_teams.csv',
    )
    args = parser.parse_args(list(argv) if argv is not None else None)
    if args.season is not None and args.end_season is not None:
        parser.error('--end-season can only be used with --start-season')
    if args.start_season is None and args.end_season is not None:
        parser.error('--end-season requires --start-season')
    if args.season is not None:
        args.start_season = args.season
        args.end_season = args.season
    elif args.start_season is None:
        args.start_season = DEFAULT_SEASON
        args.end_season = DEFAULT_SEASON
    elif args.end_season is None:
        args.end_season = DEFAULT_SEASON
    if args.start_season < MIN_SEASON:
        parser.error(f'NFL history is supported from {MIN_SEASON} onward')
    if args.end_season < args.start_season:
        parser.error('--end-season must not be earlier than --start-season')
    return args


def _get_json(session: requests.Session, url: str, params: Dict) -> Dict:
    response = session.get(url, params=params, timeout=30)
    if response.ok:
        payload = response.json()
    else:
        command = ['curl', '--fail', '--silent', '--show-error', '--location', '--get']
        for key, value in params.items():
            command.extend(['--data-urlencode', f'{key}={value}'])
        command.append(url)
        try:
            completed = subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
            )
        except (FileNotFoundError, subprocess.CalledProcessError) as error:
            raise RuntimeError(
                f'NFL provider request failed: HTTP {response.status_code}'
            ) from error
        payload = json.loads(completed.stdout)
    if not isinstance(payload, dict):
        raise RuntimeError(f'Unexpected response from {url}')
    return payload


def _division_lookup(season: int) -> Dict[str, str]:
    groups = PRE_REALIGNMENT_DIVISIONS if season < 2002 else MODERN_DIVISIONS
    lookup: Dict[str, str] = {}
    for division, provider_ids in groups.items():
        for provider_id in provider_ids:
            if provider_id in lookup:
                raise ValueError(f'NFL provider ID {provider_id} appears in multiple divisions')
            lookup[provider_id] = division
    return lookup


def load_location_config(path: Path, season: int) -> Dict[str, Dict]:
    with path.open('r', encoding='utf-8') as handle:
        rows = list(csv.DictReader(handle))

    locations: Dict[str, Dict] = {}
    divisions = _division_lookup(season)
    for row in rows:
        provider_id = (row.get('provider_id') or '').strip()
        if not provider_id:
            continue
        active_from = int(row.get('active_from') or MIN_SEASON)
        active_to = int(row.get('active_to') or 9999)
        if not active_from <= season <= active_to:
            continue
        if provider_id in locations:
            raise ValueError(
                f'Duplicate active NFL provider ID in {path} for {season}: {provider_id}'
            )
        division = divisions.get(provider_id)
        if not division:
            raise ValueError(f'NFL provider ID {provider_id} has no division for {season}')
        locations[provider_id] = {
            **row,
            'lat': float(row['latitude']),
            'lon': float(row['longitude']),
            'division': division,
            'conference': division.split()[0],
        }

    expected = 31 if season < 2002 else 32
    if len(locations) != expected:
        raise ValueError(f'Expected {expected} NFL team locations for {season}, found {len(locations)}')
    return locations


def fetch_teams(
    session: requests.Session,
    locations: Dict[str, Dict],
    season: int,
) -> Tuple[List[Dict], Dict[str, str]]:
    payload = _get_json(session, TEAMS_URL, {'limit': 100})
    raw_teams = (
        payload.get('sports', [{}])[0]
        .get('leagues', [{}])[0]
        .get('teams', [])
    )

    teams: List[Dict] = []
    provider_to_team: Dict[str, str] = {}
    for wrapper in raw_teams:
        raw = wrapper.get('team') or {}
        provider_id = str(raw.get('id') or '')
        location = locations.get(provider_id)
        if not provider_id or not location:
            continue

        slug = location.get('slug') or raw.get('slug')
        display_name = location.get('display_name') or raw.get('displayName')
        if not slug or not display_name:
            raise ValueError(f'NFL team {provider_id} is missing identity metadata')

        abbreviation = location.get('abbreviation') or raw.get('abbreviation')

        logos = raw.get('logos') or []
        logo_url = next(
            (
                logo.get('href')
                for logo in logos
                if 'default' in (logo.get('rel') or []) and logo.get('href')
            ),
            None,
        )
        logo_url = location.get('logo_url') or logo_url
        nickname = location.get('nickname') or raw.get('name') or raw.get('nickname') or display_name
        market = location.get('market') or raw.get('location') or display_name.removesuffix(f' {nickname}')
        team = {
            'id': slug,
            'providerId': provider_id,
            'abbreviation': abbreviation,
            'school': display_name,
            'name': display_name,
            'shortName': abbreviation,
            'fullName': display_name,
            'nickname': nickname,
            'market': market,
            'city': location['city'],
            'state': location['state'],
            'lat': location['lat'],
            'lon': location['lon'],
            'latitude': location['lat'],
            'longitude': location['lon'],
            'conference': location['division'],
            'leagueConference': location['conference'],
            'division': location['division'],
            'primaryColor': f"#{raw.get('color') or '2d2d2d'}",
            'secondaryColor': f"#{raw.get('alternateColor') or 'ffffff'}",
            'logoUrl': logo_url,
        }
        teams.append(team)
        provider_to_team[provider_id] = slug

    if len(teams) != len(locations) or set(provider_to_team) != set(locations):
        missing = sorted(set(locations) - set(provider_to_team))
        raise ValueError(
            f'Expected {len(locations)} resolved NFL teams for {season}; '
            f'missing provider IDs: {missing}'
        )

    teams.sort(key=lambda team: team['fullName'])
    return teams, provider_to_team


def normalize_event(raw: Dict, provider_to_team: Dict[str, str]) -> Optional[Dict]:
    competition = (raw.get('competitions') or [{}])[0]
    status_type = (raw.get('status') or {}).get('type') or {}
    if not status_type.get('completed'):
        return None

    competitors = competition.get('competitors') or []
    home = next((item for item in competitors if item.get('homeAway') == 'home'), None)
    away = next((item for item in competitors if item.get('homeAway') == 'away'), None)
    if not home or not away:
        return None

    home_id = provider_to_team.get(str((home.get('team') or {}).get('id') or ''))
    away_id = provider_to_team.get(str((away.get('team') or {}).get('id') or ''))
    if not home_id or not away_id:
        return None

    try:
        home_score = int(home.get('score'))
        away_score = int(away.get('score'))
    except (TypeError, ValueError):
        return None

    tied = home_score == away_score
    winner_id = None if tied else (home_id if home_score > away_score else away_id)
    loser_id = None if tied else (away_id if home_score > away_score else home_id)
    season = raw.get('season') or {}
    week = raw.get('week') or {}

    return {
        'id': str(raw.get('id')),
        'season': int(season.get('year') or 0),
        'seasonType': 'postseason' if int(season.get('type') or 0) == 3 else 'regular',
        'week': int(week.get('number') or 0),
        'completed': True,
        'status': 'final',
        'startDate': raw.get('date'),
        'neutralSite': bool(competition.get('neutralSite', False)),
        'conferenceGame': False,
        'venue': (competition.get('venue') or {}).get('fullName'),
        'homeTeamId': home_id,
        'awayTeamId': away_id,
        'homeScore': home_score,
        'awayScore': away_score,
        'outcome': 'draw' if tied else ('home-win' if winner_id == home_id else 'away-win'),
        'winnerId': winner_id,
        'loserId': loser_id,
    }


def fetch_week(
    session: requests.Session,
    season: int,
    season_type: int,
    week: int,
    provider_to_team: Dict[str, str],
) -> List[Dict]:
    payload = _get_json(
        session,
        SCOREBOARD_URL,
        {
            'dates': season,
            'seasontype': season_type,
            'week': week,
            'limit': 100,
        },
    )
    games = [normalize_event(event, provider_to_team) for event in payload.get('events') or []]
    normalized = [game for game in games if game and game['season'] == season]
    normalized.sort(key=lambda game: (game.get('startDate') or '', game['id']))
    return normalized


def fetch_calendar(session: requests.Session, season: int) -> List[Dict]:
    payload = _get_json(
        session,
        SCOREBOARD_URL,
        {'dates': season, 'seasontype': 2, 'week': 1, 'limit': 100},
    )
    calendar = ((payload.get('leagues') or [{}])[0].get('calendar') or [])
    periods: List[Dict] = []
    for section in calendar:
        section_label = section.get('label')
        if section_label not in {'Regular Season', 'Postseason'}:
            continue
        season_type = 'regular' if section_label == 'Regular Season' else 'postseason'
        season_type_id = 2 if season_type == 'regular' else 3
        for entry in section.get('entries') or []:
            label = entry.get('label')
            try:
                source_week = int(entry.get('value'))
            except (TypeError, ValueError):
                continue
            if season_type == 'postseason' and label not in SUPPORTED_POSTSEASON_LABELS:
                continue
            periods.append({
                'week': source_week,
                'seasonType': season_type,
                'seasonTypeId': season_type_id,
                'label': label or f'Week {source_week}',
            })

    if not periods:
        raise ValueError(f'NFL {season} returned no supported calendar periods')
    return periods


def build_timeline(
    session: requests.Session,
    season: int,
    provider_to_team: Dict[str, str],
) -> List[Dict]:
    timeline: List[Dict] = []
    for period in fetch_calendar(session, season):
        games = fetch_week(
            session,
            season,
            period['seasonTypeId'],
            period['week'],
            provider_to_team,
        )
        if not games:
            raise ValueError(f"NFL {season} {period['label']} returned no completed games")
        timeline.append(
            {
                'weekIndex': len(timeline) + 1,
                'week': period['week'],
                'seasonType': period['seasonType'],
                'label': period['label'],
                'games': games,
            }
        )
    return timeline


def public_team(team: Dict) -> Dict:
    return {
        key: value
        for key, value in team.items()
        if key not in {'school', 'lat', 'lon'}
    }


def reverse_ownership(ownership: Dict[str, str]) -> Dict[str, set]:
    result: Dict[str, set] = defaultdict(set)
    for fips, team_id in ownership.items():
        result[team_id].add(fips)
    return result


def apply_week(games: List[Dict], ownership: Dict[str, str], team_to_fips: Dict[str, set]) -> List[Dict]:
    records: List[Dict] = []
    for game in games:
        result = process_game_result(game, ownership, team_to_fips)
        if not result or result['transfer_count'] == 0:
            continue

        for transfer in result['transfers']:
            fips = transfer['fips']
            previous_owner = ownership.get(fips)
            if previous_owner:
                team_to_fips[previous_owner].discard(fips)
            ownership[fips] = result['winner']
            team_to_fips[result['winner']].add(fips)

        records.append(
            {
                'gameId': game['id'],
                'winnerId': result['winner'],
                'loserId': result['loser'],
                'transferCount': result['transfer_count'],
                'fips': sorted(transfer['fips'] for transfer in result['transfers']),
                'completedAt': game.get('startDate'),
            }
        )
    return records


def _hash_paths(paths: Iterable[str]) -> str:
    digest = hashlib.sha256()
    for relative_path in sorted(paths):
        path = db.get_data_dir() / relative_path
        digest.update(relative_path.encode('utf-8'))
        digest.update(b'\0')
        digest.update(path.read_bytes())
        digest.update(b'\0')
    return digest.hexdigest()[:20]


def save_leaderboard(path: str, payload: Dict) -> Dict:
    """Keep generatedAt stable when a rebuild produces identical domain data."""
    try:
        existing = db.load_json(path)
    except FileNotFoundError:
        existing = None

    if existing:
        existing_domain = {key: value for key, value in existing.items() if key != 'generatedAt'}
        payload_domain = {key: value for key, value in payload.items() if key != 'generatedAt'}
        if existing_domain == payload_domain:
            payload = existing
    db.save_json(path, payload)
    return payload


def update_catalog() -> None:
    try:
        catalog = db.load_json('catalog.json')
    except FileNotFoundError:
        catalog = {'schemaVersion': 1, 'defaultLeagueId': 'cfb', 'leagues': []}

    required = {
        'cfb': {
            'id': 'cfb',
            'name': 'College Football',
            'shortName': 'CFB',
            'route': '/cfb',
            'status': 'available',
        },
        'nfl': {
            'id': 'nfl',
            'name': 'NFL',
            'shortName': 'NFL',
            'route': '/nfl',
            'status': 'available',
        },
    }
    existing = {
        entry.get('id'): entry
        for entry in catalog.get('leagues') or []
        if entry.get('id')
    }
    existing.update(required)
    catalog['schemaVersion'] = 1
    catalog['defaultLeagueId'] = catalog.get('defaultLeagueId') or 'cfb'
    catalog['leagues'] = sorted(
        existing.values(),
        key=lambda entry: (0 if entry.get('id') == 'cfb' else 1, entry.get('name', '')),
    )
    db.save_json('catalog.json', catalog)


def _load_or_default(path: str, default):
    try:
        return db.load_json(path)
    except FileNotFoundError:
        return default


def merge_teams(base: str, public_teams: List[Dict]) -> None:
    existing = _load_or_default(f'{base}/teams-all.json', [])
    by_id = {team['id']: team for team in existing if team.get('id')}
    by_id.update({team['id']: team for team in public_teams})
    db.save_json(
        f'{base}/teams-all.json',
        sorted(by_id.values(), key=lambda team: (team.get('fullName', ''), team['id'])),
    )


def merge_logo_colors(base: str, teams: List[Dict]) -> None:
    existing = _load_or_default(f'{base}/logo-colors.json', {'teams': {}})
    colors = existing.get('teams') if isinstance(existing, dict) else {}
    if not isinstance(colors, dict):
        colors = {}
    colors.update({
        team['id']: {'fill': team['primaryColor'], 'logo': None}
        for team in teams
    })
    db.save_json(f'{base}/logo-colors.json', {'teams': colors})


def merge_season_index(base: str, season_entry: Dict) -> None:
    existing = _load_or_default(f'{base}/ownership/index.json', {'seasons': []})
    seasons = {
        entry['season']: entry
        for entry in existing.get('seasons') or []
        if isinstance(entry, dict) and isinstance(entry.get('season'), int)
    }
    seasons[season_entry['season']] = season_entry
    db.save_json(
        f'{base}/ownership/index.json',
        {'seasons': [seasons[key] for key in sorted(seasons)]},
    )


def merge_transfers(base: str, season: int, transfers: List[Dict]) -> None:
    existing = _load_or_default(f'{base}/transfers.json', [])
    retained = [transfer for transfer in existing if transfer.get('season') != season]
    db.save_json(
        f'{base}/transfers.json',
        sorted(
            retained + transfers,
            key=lambda transfer: (
                transfer.get('season', 0),
                transfer.get('weekIndex', 0),
                transfer.get('completedAt') or '',
                transfer.get('gameId') or '',
            ),
        ),
    )


def build(season: int, teams_csv: Path) -> None:
    session = requests.Session()
    session.headers.update({'User-Agent': 'imperial-map-nfl-builder/1.0'})

    print(f'🏈 Building NFL {season}...')
    locations = load_location_config(teams_csv, season)
    teams, provider_to_team = fetch_teams(session, locations, season)
    public_teams = [public_team(team) for team in teams]

    team_locations = {
        team['id']: {'lat': team['lat'], 'lon': team['lon']}
        for team in teams
    }
    baseline, county_stats, centroids = create_ownership_file(
        teams,
        team_locations,
        persist_root=False,
    )
    missing_baseline = sorted(
        team['id'] for team in teams if team['id'] not in set(baseline.values())
    )
    if missing_baseline:
        raise ValueError(f'NFL teams without baseline territory: {missing_baseline}')

    timeline = build_timeline(session, season, provider_to_team)
    base = f'leagues/{LEAGUE_ID}'
    db.save_json(f'{base}/league.json', {
        'id': LEAGUE_ID,
        'name': 'NFL',
        'fullName': 'National Football League',
        'sport': 'football',
        'teamLabel': 'teams',
        'groupLabel': 'division',
        'periodLabel': 'week',
        'territoryUnitLabel': 'counties',
        'geographyId': 'us-counties-v1',
    })
    merge_teams(base, public_teams)
    db.save_json(f'{base}/teams/{season}.json', public_teams)
    merge_logo_colors(base, teams)

    ownership = dict(baseline)
    team_to_fips = reverse_ownership(ownership)
    all_transfers: List[Dict] = []
    index_weeks: List[Dict] = []
    game_index: List[Dict] = []

    baseline_meta = {
        'weekIndex': 0,
        'week': 0,
        'seasonType': 'baseline',
        'label': f'{season} Baseline (Preseason)',
        'path': f'/data/{base}/ownership/{season}/week-00.json',
    }
    db.save_json(f'{base}/ownership/{season}/week-00.json', ownership)
    db.save_json(
        f'{base}/ownership/{season}/week-00-logos.json',
        calculate_territory_logos(baseline, ownership, teams, centroids),
    )
    baseline_board = compute_leaderboard_payload(
        season,
        baseline_meta,
        ownership,
        public_teams,
        county_stats,
        [],
    )
    save_leaderboard(f'{base}/leaderboards/{season}/week-00.json', baseline_board)
    index_weeks.append(baseline_meta)

    for entry in timeline:
        week_index = entry['weekIndex']
        games_path = f'{base}/games/{season}/week-{week_index:02d}.json'
        ownership_path = f'{base}/ownership/{season}/week-{week_index:02d}.json'
        leaderboard_path = f'{base}/leaderboards/{season}/week-{week_index:02d}.json'
        db.save_json(games_path, entry['games'])

        transfers = apply_week(entry['games'], ownership, team_to_fips)
        for transfer in transfers:
            transfer.update({
                'season': season,
                'weekIndex': week_index,
                'week': entry['week'],
                'seasonType': entry['seasonType'],
            })
        all_transfers.extend(transfers)

        db.save_json(ownership_path, ownership)
        db.save_json(
            ownership_path.replace('.json', '-logos.json'),
            calculate_territory_logos(baseline, ownership, teams, centroids),
        )
        week_meta = {
            'weekIndex': week_index,
            'week': entry['week'],
            'seasonType': entry['seasonType'],
            'label': entry['label'],
            'path': f'/data/{ownership_path}',
        }
        leaderboard = compute_leaderboard_payload(
            season,
            week_meta,
            ownership,
            public_teams,
            county_stats,
            transfers,
        )
        save_leaderboard(leaderboard_path, leaderboard)
        index_weeks.append(week_meta)
        game_index.append({
            'weekIndex': week_index,
            'week': entry['week'],
            'seasonType': entry['seasonType'],
            'label': entry['label'],
            'path': f'/data/{games_path}',
        })

    merge_season_index(
        base,
        {'season': season, 'teamCount': len(teams), 'weeks': index_weeks},
    )
    db.save_json(f'{base}/games/{season}/index.json', {'season': season, 'weeks': game_index})
    merge_transfers(base, season, all_transfers)

    existing_live = _load_or_default(f'{base}/live.json', {})
    latest_published_season = existing_live.get('season', 0)
    if season >= latest_published_season:
        db.save_json(f'{base}/ownership.json', baseline)
        db.save_json(f'{base}/territory-centroids.json', centroids)

        latest = index_weeks[-1]
        latest_index = latest['weekIndex']
        latest_board_path = f'{base}/leaderboards/{season}/week-{latest_index:02d}.json'
        latest_game_path = f'{base}/games/{season}/week-{latest_index:02d}.json'
        latest_logos_path = latest['path'].removeprefix('/data/').replace('.json', '-logos.json')
        db.save_json(f'{base}/leaderboards/latest.json', db.load_json(latest_board_path))
        live_paths = [
            latest['path'].removeprefix('/data/'),
            latest_logos_path,
            latest_board_path,
            latest_game_path,
        ]
        final_games = db.load_json(latest_game_path)
        db.save_json(f'{base}/live.json', {
            'version': _hash_paths(live_paths),
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'season': season,
            'teamCount': len(teams),
            'weekIndex': latest_index,
            'week': latest['week'],
            'seasonType': latest['seasonType'],
            'label': latest['label'],
            'completedGameCount': len(final_games),
            'finalGameIds': [game['id'] for game in final_games],
            'ownershipPath': latest['path'],
            'logosPath': f'/data/{latest_logos_path}',
            'leaderboardPath': f'/data/{latest_board_path}',
        })
    update_catalog()

    total_games = sum(len(entry['games']) for entry in timeline)
    print(
        f'✅ NFL {season}: {len(teams)} teams, {total_games} games, '
        f'{len(timeline)} periods, {len(all_transfers)} conquests'
    )


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    for season in range(args.start_season, args.end_season + 1):
        build(season, args.teams_csv)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
