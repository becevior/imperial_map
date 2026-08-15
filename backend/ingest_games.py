#!/usr/bin/env python3
"""Fetch completed FBS games from ESPN or CollegeFootballData."""

import argparse
import json
import os
import subprocess
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import requests
from dotenv import load_dotenv

from lib import db
from lib.teams import build_team_name_lookup, load_teams_for_season, resolve_team_id

CFBD_BASE_URL = 'https://api.collegefootballdata.com/games'
ESPN_SCOREBOARD_URL = (
    'https://site.api.espn.com/apis/site/v2/sports/football/'
    'college-football/scoreboard'
)
ESPN_FBS_GROUP = '80'
# ESPN currently falls back to its 25-event default when limit is greater than 200.
ESPN_PAGE_LIMIT = 200
ESPN_REGULAR_WEEKS = 15
DEFAULT_TIMEOUT = 20
MAX_RETRIES = 4


def _load_api_key() -> str:
    project_root = Path(__file__).resolve().parent.parent
    # Load default .env then override with .env.local if present
    load_dotenv(project_root / '.env')
    load_dotenv(project_root / '.env.local')
    load_dotenv(project_root / 'backend' / '.env')
    load_dotenv(project_root / 'backend' / '.env.local')
    return os.getenv('CFBD_API_KEY', '').strip()


def _get_session(api_key: str) -> requests.Session:
    session = requests.Session()
    headers = {
        'Accept': 'application/json',
        'User-Agent': 'imperial-map-ingest/1.0',
    }
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'
    session.headers.update(headers)
    return session


def _fetch_games(session: requests.Session, params: Dict) -> List[Dict]:
    """Fetch games with retries and basic backoff."""
    for attempt in range(1, MAX_RETRIES + 1):
        response = session.get(CFBD_BASE_URL, params=params, timeout=DEFAULT_TIMEOUT)

        if response.status_code == 429:
            wait = min(2 ** attempt, 15)
            time.sleep(wait)
            continue

        if response.status_code >= 500:
            wait = min(2 ** attempt, 10)
            time.sleep(wait)
            continue

        if not response.ok:
            raise RuntimeError(
                f"CFBD request failed: {response.status_code} {response.text}"
            )

        return response.json()

    raise RuntimeError('Exceeded maximum retries calling CFBD API')


def _fetch_espn_scoreboard(session: requests.Session, params: Dict) -> Dict:
    """Fetch one ESPN scoreboard page with the same retry policy as CFBD."""
    for attempt in range(1, MAX_RETRIES + 1):
        response = session.get(ESPN_SCOREBOARD_URL, params=params, timeout=DEFAULT_TIMEOUT)

        if response.status_code == 429 or response.status_code >= 500:
            time.sleep(min(2 ** attempt, 15))
            continue

        if response.status_code == 403:
            # Akamai intermittently rejects Python's TLS fingerprint even when the
            # same public endpoint is available. curl is present on macOS and the
            # GitHub Actions runner and provides a reliable transport fallback.
            return _fetch_espn_scoreboard_with_curl(params)

        if not response.ok:
            raise RuntimeError(
                f"ESPN request failed: {response.status_code} {response.text}"
            )

        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError('ESPN returned an unexpected scoreboard payload')
        return payload

    raise RuntimeError('Exceeded maximum retries calling ESPN')


def _fetch_espn_scoreboard_with_curl(params: Dict) -> Dict:
    command = [
        'curl',
        '--fail',
        '--silent',
        '--show-error',
        '--location',
        '--max-time',
        str(DEFAULT_TIMEOUT),
        '--get',
    ]
    for key, value in params.items():
        command.extend(['--data-urlencode', f'{key}={value}'])
    command.append(ESPN_SCOREBOARD_URL)

    try:
        result = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=DEFAULT_TIMEOUT + 5,
        )
        payload = json.loads(result.stdout)
    except FileNotFoundError as error:
        raise RuntimeError('ESPN fallback requires curl to be installed') from error
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        raise RuntimeError(f'ESPN curl fallback failed: {error}') from error

    if not isinstance(payload, dict):
        raise RuntimeError('ESPN returned an unexpected scoreboard payload')
    return payload


def fetch_espn_games_for_season(
    session: requests.Session,
    season: int,
    season_type: str,
    max_regular_week: Optional[int] = None,
) -> List[Dict]:
    """Fetch ESPN a week at a time so its event cap cannot truncate the slate."""
    if season_type == 'regular':
        last_week = max_regular_week or ESPN_REGULAR_WEEKS
        weeks = range(1, min(last_week, ESPN_REGULAR_WEEKS) + 1)
        season_type_id = 2
    else:
        # ESPN exposes the complete bowl slate under postseason week 1. The CFP
        # calendar entry (999) overlaps that slate, so fetching it would duplicate games.
        weeks = [1]
        season_type_id = 3

    events: Dict[str, Dict] = {}
    for week in weeks:
        payload = _fetch_espn_scoreboard(
            session,
            {
                'dates': season,
                'seasontype': season_type_id,
                'week': week,
                'groups': ESPN_FBS_GROUP,
                'limit': ESPN_PAGE_LIMIT,
            },
        )

        for event in payload.get('events') or []:
            event_season = event.get('season') or {}
            if int(event_season.get('year') or 0) != season:
                continue
            event_id = str(event.get('id') or '')
            if event_id:
                events[event_id] = event

    return list(events.values())


def fetch_games_for_season(
    session: requests.Session,
    season: int,
    season_type: str,
) -> List[Dict]:
    params = {
        'year': season,
        'seasonType': season_type,
        'division': 'fbs',
    }
    return _fetch_games(session, params)


def _normalize_game(
    raw: Dict,
    name_lookup: Dict[str, str],
) -> Optional[Dict]:
    """Return a normalized game dict or None if it should be skipped."""
    if not raw.get('completed', False):
        return None

    def _first_present(*keys):
        for key in keys:
            if key in raw and raw[key] is not None:
                return raw[key]
        return None

    home_team_name = _first_present('home_team', 'homeTeam')
    away_team_name = _first_present('away_team', 'awayTeam')

    home_id = resolve_team_id(home_team_name, name_lookup)
    away_id = resolve_team_id(away_team_name, name_lookup)

    if not home_id or not away_id:
        return None

    home_points = _first_present('home_points', 'homePoints')
    away_points = _first_present('away_points', 'awayPoints')

    if home_points is None or away_points is None or home_points == away_points:
        return None

    home_wins = home_points > away_points
    winner_id = home_id if home_wins else away_id
    loser_id = away_id if home_wins else home_id

    start_date = _first_present('start_date', 'startDate')
    if start_date:
        try:
            sort_key = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        except ValueError:
            sort_key = None
    else:
        sort_key = None

    return {
        'id': raw.get('id'),
        'season': raw.get('season'),
        'seasonType': _first_present('season_type', 'seasonType'),
        'week': raw.get('week'),
        'completed': True,
        'startDate': start_date,
        'neutralSite': _first_present('neutral_site', 'neutralSite') or False,
        'conferenceGame': _first_present('conference_game', 'conferenceGame') or False,
        'venue': raw.get('venue'),
        'homeTeamId': home_id,
        'awayTeamId': away_id,
        'homeScore': home_points,
        'awayScore': away_points,
        'winnerId': winner_id,
        'loserId': loser_id,
        'sortKey': sort_key.isoformat() if sort_key else None,
    }


def _resolve_espn_competitor(competitor: Dict, name_lookup: Dict[str, str]) -> Optional[str]:
    team = competitor.get('team') or {}
    for key in ('location', 'shortDisplayName', 'displayName', 'name'):
        team_id = resolve_team_id(team.get(key), name_lookup)
        if team_id:
            return team_id
    return None


def _normalize_espn_game(raw: Dict, name_lookup: Dict[str, str]) -> Optional[Dict]:
    status = (raw.get('status') or {}).get('type') or {}
    if not status.get('completed', False):
        return None

    competitions = raw.get('competitions') or []
    if not competitions:
        return None
    competition = competitions[0]
    competitors = competition.get('competitors') or []
    home = next((item for item in competitors if item.get('homeAway') == 'home'), None)
    away = next((item for item in competitors if item.get('homeAway') == 'away'), None)
    if not home or not away:
        return None

    home_id = _resolve_espn_competitor(home, name_lookup)
    away_id = _resolve_espn_competitor(away, name_lookup)
    if not home_id or not away_id:
        return None

    try:
        home_points = int(float(home.get('score')))
        away_points = int(float(away.get('score')))
    except (TypeError, ValueError):
        return None
    if home_points == away_points:
        return None

    home_wins = home_points > away_points
    start_date = raw.get('date')
    season = raw.get('season') or {}
    season_type_id = int(season.get('type') or 0)

    return {
        'id': raw.get('id'),
        'season': season.get('year'),
        'seasonType': 'postseason' if season_type_id == 3 else 'regular',
        'week': (raw.get('week') or {}).get('number'),
        'completed': True,
        'startDate': start_date,
        'neutralSite': bool(competition.get('neutralSite', False)),
        'conferenceGame': bool(competition.get('conferenceCompetition', False)),
        'venue': (competition.get('venue') or {}).get('fullName'),
        'homeTeamId': home_id,
        'awayTeamId': away_id,
        'homeScore': home_points,
        'awayScore': away_points,
        'winnerId': home_id if home_wins else away_id,
        'loserId': away_id if home_wins else home_id,
        'sortKey': start_date,
    }


def normalize_games(raw_games: Iterable[Dict], name_lookup: Dict[str, str]) -> List[Dict]:
    normalized: List[Dict] = []
    for raw in raw_games:
        game = (
            _normalize_espn_game(raw, name_lookup)
            if 'competitions' in raw
            else _normalize_game(raw, name_lookup)
        )
        if game:
            normalized.append(game)

    return normalized


def group_games_by_week(games: Iterable[Dict]) -> Dict[int, List[Dict]]:
    buckets: Dict[int, List[Dict]] = defaultdict(list)
    for game in games:
        week = int(game.get('week') or 0)
        buckets[week].append(game)

    for entries in buckets.values():
        entries.sort(key=lambda g: (g.get('sortKey') or '', g.get('id') or ''))

    return buckets


def _game_date(game: Dict) -> Optional[date]:
    start_date = game.get('startDate')
    if not isinstance(start_date, str) or not start_date:
        return None
    try:
        parsed = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        if parsed.tzinfo is not None:
            # Bowl and CFP games occur in December/January, when Eastern time is
            # consistently UTC-5. Use the U.S. broadcast date instead of UTC.
            parsed = parsed.astimezone(timezone(timedelta(hours=-5)))
        return parsed.date()
    except ValueError:
        return None


def partition_postseason_games(games: Iterable[Dict]) -> List[Dict]:
    """Split ESPN's single postseason bucket into seven-day calendar windows."""
    entries = [dict(game) for game in games]
    dated_entries = [(game, _game_date(game)) for game in entries]
    dates = [game_date for _, game_date in dated_entries if game_date is not None]
    if not dates:
        return entries

    first_date = min(dates)
    for game, game_date in dated_entries:
        if game_date is not None:
            game['week'] = ((game_date - first_date).days // 7) + 1
    return entries


def _format_postseason_label(week: int, games: List[Dict]) -> str:
    dates = sorted(game_date for game in games if (game_date := _game_date(game)))
    if not dates:
        return f'Postseason Week {week}'

    first_date = dates[0]
    last_date = dates[-1]
    first_label = f'{first_date.strftime("%b")} {first_date.day}'
    if first_date == last_date:
        date_range = first_label
    elif first_date.month == last_date.month:
        date_range = f'{first_label}–{last_date.day}'
    else:
        date_range = f'{first_label}–{last_date.strftime("%b")} {last_date.day}'
    return f'Postseason · {date_range}'


def build_timeline(
    season: int,
    regular_weeks: Dict[int, List[Dict]],
    postseason_weeks: Dict[int, List[Dict]],
) -> Tuple[List[Dict], Dict[int, Tuple[str, int]]]:
    """Return (timeline, reverse_lookup).

    reverse_lookup maps weekIndex -> (seasonType, original week number)
    """
    timeline: List[Dict] = []
    reverse_lookup: Dict[int, Tuple[str, int]] = {}

    index = 1

    for week in sorted(regular_weeks.keys()):
        label = f'Regular Week {week}'
        week_path = f'/data/games/{season}/week-{index:02d}.json'
        timeline.append(
            {
                'weekIndex': index,
                'seasonType': 'regular',
                'week': week,
                'label': label,
                'path': week_path,
            }
        )
        reverse_lookup[index] = ('regular', week)
        index += 1

    for week in sorted(postseason_weeks.keys()):
        label = _format_postseason_label(week, postseason_weeks[week])
        week_path = f'/data/games/{season}/week-{index:02d}.json'
        timeline.append(
            {
                'weekIndex': index,
                'seasonType': 'postseason',
                'week': week,
                'label': label,
                'path': week_path,
            }
        )
        reverse_lookup[index] = ('postseason', week)
        index += 1

    return timeline, reverse_lookup


def save_weekly_games(
    season: int,
    week_index: int,
    games: List[Dict],
) -> None:
    for game in games:
        game.pop('sortKey', None)

    db.save_json(f'games/{season}/week-{week_index:02d}.json', games)


def update_games_index(season: int, timeline: List[Dict]) -> None:
    payload = {
        'season': season,
        'weeks': timeline,
    }

    db.save_json(f'games/{season}/index.json', payload)


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Fetch completed FBS game results')
    parser.add_argument('--season', type=int, required=True, help='Season year (e.g. 2026)')
    parser.add_argument(
        '--provider',
        choices=['espn', 'cfbd'],
        default='espn',
        help='Score provider (default: espn; CFBD requires CFBD_API_KEY)',
    )
    parser.add_argument(
        '--season-type',
        choices=['regular', 'postseason', 'both'],
        default='both',
        help='Subset of season types to ingest',
    )
    parser.add_argument(
        '--max-regular-week',
        type=int,
        default=None,
        help='Optional limit for the number of regular-season weeks to ingest',
    )
    parser.add_argument('--verbose', action='store_true', help='Print extra logging')
    return parser.parse_args(argv)


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    api_key = _load_api_key()
    session = _get_session(api_key)

    name_lookup = build_team_name_lookup(load_teams_for_season(args.season))

    regular_games: List[Dict] = []
    postseason_games: List[Dict] = []

    if args.season_type in {'regular', 'both'}:
        if args.provider == 'espn':
            raw = fetch_espn_games_for_season(
                session,
                args.season,
                'regular',
                args.max_regular_week,
            )
        else:
            raw = fetch_games_for_season(session, args.season, 'regular')
        regular_games = normalize_games(raw, name_lookup)
        if args.max_regular_week is not None:
            regular_games = [
                g for g in regular_games if (g.get('week') or 0) <= args.max_regular_week
            ]

    if args.season_type in {'postseason', 'both'}:
        if args.provider == 'espn':
            raw = fetch_espn_games_for_season(session, args.season, 'postseason')
        else:
            raw = fetch_games_for_season(session, args.season, 'postseason')
        postseason_games = normalize_games(raw, name_lookup)

    regular_weeks = group_games_by_week(regular_games)
    postseason_games = partition_postseason_games(postseason_games)
    postseason_weeks = group_games_by_week(postseason_games)

    timeline, reverse_lookup = build_timeline(args.season, regular_weeks, postseason_weeks)

    for entry in timeline:
        week_index = entry['weekIndex']
        season_type, week = reverse_lookup[week_index]
        if season_type == 'regular':
            games = regular_weeks.get(week, [])
        else:
            games = postseason_weeks.get(week, [])

        save_weekly_games(args.season, week_index, games)

        if args.verbose:
            print(
                f"Saved {len(games)} games for {entry['label']} -> games/{args.season}/week-{week_index:02d}.json"
            )

    update_games_index(args.season, timeline)

    total_games = sum(len(group) for group in regular_weeks.values()) + sum(
        len(group) for group in postseason_weeks.values()
    )

    print(
        f"✅ Ingested {total_games} completed games from {args.provider.upper()} for {args.season} "
        f"({len(regular_weeks)} regular weeks, {len(postseason_weeks)} postseason weeks)"
    )

    if args.provider == 'cfbd' and not api_key:
        print('⚠️  CFBD_API_KEY not set; CFBD may reject or rate-limit requests.')

    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main(sys.argv[1:]))
    except RuntimeError as err:
        print(f'❌ {err}')
        raise SystemExit(1)
