#!/usr/bin/env python3
"""Compute and persist leaderboard summaries for a given season/week."""

import argparse
from typing import Any, Dict, Iterable, List, Optional

from lib import db
from lib.leaderboard_calculator import (
    compute_leaderboard_payload,
    generate_leaderboard,
    load_county_stats,
    persist_leaderboard,
)


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Generate leaderboard summaries from ownership snapshots')
    parser.add_argument('--season', type=int, required=True, help='Season year (e.g. 2025)')
    parser.add_argument(
        '--week-index',
        type=int,
        default=None,
        help='Specific chronological week index to compute. Defaults to the latest available.',
    )
    parser.add_argument('--dry-run', action='store_true', help='Compute stats without writing files')
    return parser.parse_args(list(argv) if argv is not None else None)


def load_week_metadata(season: int, week_index: Optional[int]) -> Dict[str, Any]:
    index_payload = db.load_json('ownership/index.json')
    seasons: List[Dict[str, Any]] = index_payload.get('seasons') or []

    season_entry = next((entry for entry in seasons if int(entry.get('season', 0)) == season), None)
    if not season_entry:
        raise ValueError(f'No ownership snapshots found for season {season}')

    weeks = season_entry.get('weeks') or []
    if not weeks:
        raise ValueError(f'Season {season} does not have any week entries')

    if week_index is not None:
        week_entry = next((week for week in weeks if int(week.get('weekIndex', -1)) == week_index), None)
        if not week_entry:
            raise ValueError(f'Week index {week_index} not found for season {season}')
        return week_entry

    # Default to the latest week by chronological index
    week_entry = max(weeks, key=lambda week: int(week.get('weekIndex', 0)))
    return week_entry


def load_transfers_for_week(season: int, week_index: int) -> List[Dict[str, Any]]:
    try:
        transfers: List[Dict[str, Any]] = db.load_json('transfers.json')
    except FileNotFoundError:
        return []

    return [
        transfer
        for transfer in transfers
        if int(transfer.get('season', 0)) == season and int(transfer.get('weekIndex', -1)) == week_index
    ]


def resolve_ownership_snapshot(week_entry: Dict[str, Any]) -> Dict[str, str]:
    path = week_entry.get('path')
    if not path:
        raise ValueError('Week entry is missing a path to the ownership snapshot')

    relative = path[6:] if path.startswith('/data/') else path.lstrip('/')
    return db.load_json(relative)


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)

    week_entry = load_week_metadata(args.season, args.week_index)
    ownership = resolve_ownership_snapshot(week_entry)
    teams = db.load_teams()
    county_stats = load_county_stats()
    transfers = load_transfers_for_week(args.season, int(week_entry.get('weekIndex', 0)))

    payload = compute_leaderboard_payload(
        args.season,
        week_entry,
        ownership,
        teams,
        county_stats,
        transfers,
    )

    if args.dry_run:
        print(
            f"Computed leaderboards for season {args.season} week {week_entry.get('weekIndex')} "
            f"({week_entry.get('label')})."
        )
    else:
        persist_leaderboard(args.season, week_entry, payload)
        print(
            f"Saved leaderboards to leaderboards/{args.season}/week-"
            f"{int(week_entry.get('weekIndex', 0)):02d}.json"
        )

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
