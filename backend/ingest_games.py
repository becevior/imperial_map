#!/usr/bin/env python3
"""Fetch completed FBS games from CollegeFootballData and normalize results."""

import argparse
import os
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import requests
from dotenv import load_dotenv

from lib import db
from lib.teams import build_team_name_lookup, resolve_team_id

CFBD_BASE_URL = 'https://api.collegefootballdata.com/games'
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


def normalize_games(raw_games: Iterable[Dict], name_lookup: Dict[str, str]) -> List[Dict]:
    normalized: List[Dict] = []
    for raw in raw_games:
        game = _normalize_game(raw, name_lookup)
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
        label = f'Postseason Week {week}'
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
    parser = argparse.ArgumentParser(description='Fetch FBS game results from CFBD')
    parser.add_argument('--season', type=int, required=True, help='Season year (e.g. 2025)')
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

    name_lookup = build_team_name_lookup()

    regular_games: List[Dict] = []
    postseason_games: List[Dict] = []

    if args.season_type in {'regular', 'both'}:
        raw = fetch_games_for_season(session, args.season, 'regular')
        regular_games = normalize_games(raw, name_lookup)
        if args.max_regular_week is not None:
            regular_games = [
                g for g in regular_games if (g.get('week') or 0) <= args.max_regular_week
            ]

    if args.season_type in {'postseason', 'both'}:
        raw = fetch_games_for_season(session, args.season, 'postseason')
        postseason_games = normalize_games(raw, name_lookup)

    regular_weeks = group_games_by_week(regular_games)
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
        f"✅ Ingested {total_games} completed games for {args.season} "
        f"({len(regular_weeks)} regular weeks, {len(postseason_weeks)} postseason weeks)"
    )

    if not api_key:
        print('⚠️  CFBD_API_KEY not set; requests were unauthenticated (lower rate limits apply).')

    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main(sys.argv[1:]))
    except RuntimeError as err:
        print(f'❌ {err}')
        raise SystemExit(1)
