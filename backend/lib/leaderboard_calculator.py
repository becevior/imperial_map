"""Utilities for computing and persisting leaderboard summaries."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

from lib import db

TeamMeta = Dict[str, Any]
CountyStats = Dict[str, Dict[str, Any]]
OwnershipMap = Dict[str, str]
TransferRecord = Dict[str, Any]

# Number of entries to surface for each leaderboard (None = include all)
TOP_ENTRIES: Optional[int] = None


def load_county_stats() -> CountyStats:
    """Load per-county statistics used for population/area aggregation."""
    return db.load_json('county-stats.json')


def _normalise_number(value: Optional[Any]) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _normalise_int(value: Optional[Any]) -> int:
    if value is None:
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _build_team_lookup(teams: Iterable[TeamMeta]) -> Dict[str, TeamMeta]:
    lookup: Dict[str, TeamMeta] = {}
    for team in teams:
        team_id = team.get('id')
        if not team_id:
            continue
        lookup[team_id] = team
    return lookup


def _display_name(team: Optional[TeamMeta], team_id: str) -> str:
    if team:
        return (
            team.get('shortName')
            or team.get('name')
            or team.get('fullName')
            or team_id.replace('-', ' ').title()
        )
    return team_id.replace('-', ' ').title()


def _collect_totals(
    ownership: OwnershipMap,
    county_stats: CountyStats,
) -> Dict[str, Dict[str, float]]:
    totals: Dict[str, Dict[str, float]] = defaultdict(lambda: {'counties': 0, 'population': 0, 'areaSqMi': 0.0})
    for fips, team_id in ownership.items():
        if team_id is None:
            continue
        county = county_stats.get(fips, {})
        population = _normalise_number(county.get('population'))
        area_sq_mi = _normalise_number(county.get('areaSqMi'))

        record = totals[team_id]
        record['counties'] += 1
        record['population'] += population
        record['areaSqMi'] += area_sq_mi
    return totals


def _collect_transfer_deltas(
    transfers: Iterable[TransferRecord],
    county_stats: CountyStats,
) -> Tuple[Dict[str, Dict[str, float]], Dict[str, Dict[str, float]]]:
    gained: Dict[str, Dict[str, float]] = defaultdict(lambda: {'counties': 0, 'population': 0, 'areaSqMi': 0.0})
    lost: Dict[str, Dict[str, float]] = defaultdict(lambda: {'counties': 0, 'population': 0, 'areaSqMi': 0.0})

    for transfer in transfers:
        fips_list = transfer.get('fips') or []
        winner_id = transfer.get('winnerId')
        loser_id = transfer.get('loserId')
        if not fips_list or not winner_id or not loser_id:
            continue

        for fips in fips_list:
            county = county_stats.get(fips, {})
            population = _normalise_number(county.get('population'))
            area_sq_mi = _normalise_number(county.get('areaSqMi'))

            gained_record = gained[winner_id]
            gained_record['counties'] += 1
            gained_record['population'] += population
            gained_record['areaSqMi'] += area_sq_mi

            lost_record = lost[loser_id]
            lost_record['counties'] += 1
            lost_record['population'] += population
            lost_record['areaSqMi'] += area_sq_mi

    return gained, lost


def _format_metrics(raw: Dict[str, float]) -> Dict[str, Any]:
    return {
        'counties': int(raw.get('counties', 0)),
        'population': int(round(raw.get('population', 0))),
        'areaSqMi': round(raw.get('areaSqMi', 0.0), 2),
    }


def _build_entries(
    team_totals: Dict[str, Dict[str, float]],
    team_lookup: Dict[str, TeamMeta],
) -> Dict[str, Dict[str, Any]]:
    entries: Dict[str, Dict[str, Any]] = {}
    for team_id, metrics in team_totals.items():
        team_meta = team_lookup.get(team_id)
        entries[team_id] = {
            'teamId': team_id,
            'teamName': _display_name(team_meta, team_id),
            'shortName': team_meta.get('shortName') if team_meta else None,
            'fullName': team_meta.get('fullName') if team_meta else None,
            'conference': team_meta.get('conference') if team_meta else None,
            'metrics': _format_metrics(metrics),
        }
    return entries


def _sorted_board(
    entries: Dict[str, Dict[str, Any]],
    metric: str,
    top_n: Optional[int] = TOP_ENTRIES,
) -> List[Dict[str, Any]]:
    sorted_entries = sorted(
        entries.values(),
        key=lambda item: (
            item['metrics'].get(metric, 0),
            item['metrics'].get('population', 0),
            item['metrics'].get('counties', 0),
        ),
        reverse=True,
    )
    filtered = [entry for entry in sorted_entries if entry['metrics'].get(metric, 0) > 0]
    if top_n is None:
        return filtered
    return filtered[:top_n]


def _sorted_board_from_raw(
    raw_metrics: Dict[str, Dict[str, float]],
    team_lookup: Dict[str, TeamMeta],
    metric: str,
    top_n: Optional[int] = TOP_ENTRIES,
) -> List[Dict[str, Any]]:
    entries = _build_entries(raw_metrics, team_lookup)
    sorted_entries = sorted(
        entries.values(),
        key=lambda item: (
            item['metrics'].get(metric, 0),
            item['metrics'].get('population', 0),
            item['metrics'].get('counties', 0),
        ),
        reverse=True,
    )
    filtered = [entry for entry in sorted_entries if entry['metrics'].get(metric, 0) > 0]
    if top_n is None:
        return filtered
    return filtered[:top_n]


def compute_leaderboard_payload(
    season: int,
    week_meta: Dict[str, Any],
    ownership: OwnershipMap,
    teams: Iterable[TeamMeta],
    county_stats: CountyStats,
    transfers: Iterable[TransferRecord],
) -> Dict[str, Any]:
    week_index = int(week_meta.get('weekIndex', 0))

    team_lookup = _build_team_lookup(teams)
    totals_raw = _collect_totals(ownership, county_stats)
    gained_raw, lost_raw = _collect_transfer_deltas(transfers, county_stats)

    total_entries = _build_entries(totals_raw, team_lookup)

    territory_owned_board = _sorted_board(total_entries, 'areaSqMi')
    population_board = _sorted_board(total_entries, 'population')
    counties_board = _sorted_board(total_entries, 'counties')
    territory_gained_board = _sorted_board_from_raw(gained_raw, team_lookup, 'counties')
    territory_lost_board = _sorted_board_from_raw(lost_raw, team_lookup, 'counties')

    payload = {
        'season': season,
        'weekIndex': week_index,
        'week': week_meta.get('week'),
        'seasonType': week_meta.get('seasonType'),
        'weekLabel': week_meta.get('label'),
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'leaderboards': {
            'territoryOwned': territory_owned_board,
            'populationControlled': population_board,
            'countiesOwned': counties_board,
            'territoryGained': territory_gained_board,
            'territoryLost': territory_lost_board,
        },
        'totals': {
            'trackedTeams': len(total_entries),
            'countyCount': len(ownership),
        },
    }

    return payload


def _relative_path(path: str) -> str:
    if path.startswith('/data/'):
        return path[len('/data/'):]
    return path.lstrip('/')


def _update_index(
    season: int,
    week_meta: Dict[str, Any],
    json_path: str,
) -> Dict[str, Any]:
    try:
        index_payload = db.load_json('leaderboards/index.json')
    except FileNotFoundError:
        index_payload = {'seasons': []}

    seasons = index_payload.setdefault('seasons', [])
    week_index = int(week_meta.get('weekIndex', 0))

    season_entry = next((entry for entry in seasons if entry.get('season') == season), None)
    if not season_entry:
        season_entry = {'season': season, 'weeks': []}
        seasons.append(season_entry)

    weeks = [week for week in season_entry.get('weeks', []) if int(week.get('weekIndex', -1)) != week_index]
    weeks.append(
        {
            'weekIndex': week_index,
            'week': week_meta.get('week'),
            'seasonType': week_meta.get('seasonType'),
            'label': week_meta.get('label'),
            'path': f'/data/{json_path}',
        }
    )
    weeks.sort(key=lambda item: int(item.get('weekIndex', 0)))
    season_entry['weeks'] = weeks

    seasons.sort(key=lambda item: int(item.get('season', season)))

    # Determine the latest week across all seasons
    latest_tuple: Optional[Tuple[int, int, Dict[str, Any]]] = None
    for entry in seasons:
        entry_season = int(entry.get('season', season))
        for week in entry.get('weeks', []):
            candidate = (entry_season, int(week.get('weekIndex', 0)), week)
            if latest_tuple is None or candidate[:2] > latest_tuple[:2]:
                latest_tuple = candidate

    if latest_tuple:
        latest_season, latest_week_index, latest_week = latest_tuple
        index_payload['latest'] = {
            'season': latest_season,
            'weekIndex': latest_week_index,
            'path': latest_week.get('path'),
            'label': latest_week.get('label'),
            'week': latest_week.get('week'),
            'seasonType': latest_week.get('seasonType'),
        }

    db.save_json('leaderboards/index.json', index_payload)

    return index_payload


def _sync_latest_cache(index_payload: Dict[str, Any], latest_payload: Dict[str, Any], season: int, week_index: int) -> None:
    latest_entry = index_payload.get('latest')
    if not latest_entry:
        return

    latest_season = int(latest_entry.get('season', season))
    latest_week_index = int(latest_entry.get('weekIndex', week_index))
    latest_path = latest_entry.get('path')
    if not latest_path:
        return

    if (latest_season, latest_week_index) == (season, week_index):
        db.save_json('leaderboards/latest.json', latest_payload)
        return

    relative_path = _relative_path(latest_path)
    try:
        cached_payload = db.load_json(relative_path)
    except FileNotFoundError:
        # If the referenced file is missing, fall back to the provided payload
        cached_payload = latest_payload
    db.save_json('leaderboards/latest.json', cached_payload)


def persist_leaderboard(
    season: int,
    week_meta: Dict[str, Any],
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    week_index = int(week_meta.get('weekIndex', 0))
    json_path = f'leaderboards/{season}/week-{week_index:02d}.json'

    db.save_json(json_path, payload)

    index_payload = _update_index(season, week_meta, json_path)
    _sync_latest_cache(index_payload, payload, season, week_index)
    return payload


def generate_leaderboard(
    season: int,
    week_meta: Dict[str, Any],
    ownership: OwnershipMap,
    teams: Iterable[TeamMeta],
    county_stats: CountyStats,
    transfers: Iterable[TransferRecord],
) -> Dict[str, Any]:
    payload = compute_leaderboard_payload(season, week_meta, ownership, teams, county_stats, transfers)
    return persist_leaderboard(season, week_meta, payload)


__all__ = [
    'compute_leaderboard_payload',
    'generate_leaderboard',
    'load_county_stats',
    'persist_leaderboard',
]
