#!/usr/bin/env python3
"""Apply weekly FBS game results to update county ownership."""

import argparse
import json
from collections import defaultdict
from datetime import datetime
from typing import Dict, Iterable, List, Optional

from lib import db
from lib.game_engine import process_game_result


def load_games_timeline(season: int) -> List[Dict]:
    data_dir = db.get_data_dir()
    index_path = data_dir / 'games' / str(season) / 'index.json'

    if not index_path.exists():
        return []

    with index_path.open('r', encoding='utf-8') as handle:
        payload = json.load(handle)

    return payload.get('weeks', [])


def load_existing_transfers() -> List[Dict]:
    data_dir = db.get_data_dir()
    path = data_dir / 'transfers.json'
    if not path.exists():
        return []

    with path.open('r', encoding='utf-8') as handle:
        return json.load(handle)


def save_transfers(transfers: List[Dict]) -> None:
    db.save_json('transfers.json', transfers)


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Apply weekly game results to ownership data')
    parser.add_argument('--season', type=int, required=True, help='Season year to process (e.g. 2025)')
    parser.add_argument(
        '--max-week-index',
        type=int,
        default=None,
        help='Optional upper bound on the week index (chronological order)',
    )
    parser.add_argument('--dry-run', action='store_true', help='Compute changes without writing files')
    parser.add_argument('--verbose', action='store_true', help='Print per-game transfer details')
    return parser.parse_args(list(argv) if argv is not None else None)


def build_team_reverse_index(ownership: Dict[str, str]) -> Dict[str, set]:
    mapping: Dict[str, set] = defaultdict(set)
    for fips, team_id in ownership.items():
        mapping[team_id].add(fips)
    return mapping


def apply_transfers_for_week(
    season: int,
    week_entry: Dict,
    ownership: Dict[str, str],
    team_to_fips: Dict[str, set],
    dry_run: bool,
    verbose: bool,
) -> Dict:
    data_path = week_entry.get('path')
    if not data_path:
        return {'weekIndex': week_entry.get('weekIndex'), 'gamesProcessed': 0, 'countiesTransferred': 0}

    if data_path.startswith('/data/'):
        relative_path = data_path[len('/data/'):]
    else:
        relative_path = data_path.lstrip('/')
    try:
        games = db.load_json(relative_path)
    except FileNotFoundError:
        return {
            'weekIndex': week_entry.get('weekIndex'),
            'gamesProcessed': 0,
            'countiesTransferred': 0,
            'missing': True,
        }

    county_transfers = 0
    processed_games = 0
    transfer_records: List[Dict] = []

    for game in games:
        result = process_game_result(game, ownership, team_to_fips)
        if not result:
            continue

        processed_games += 1

        if result['transfer_count'] == 0:
            continue

        county_transfers += result['transfer_count']

        if verbose:
            print(
                f" - {week_entry.get('label')} :: {result['winner']} defeated {result['loser']} "
                f"({result['transfer_count']} counties)"
            )

        for transfer in result['transfers']:
            fips = transfer['fips']
            loser = transfer['from_team_id']
            winner = transfer['to_team_id']
            if ownership.get(fips) == winner:
                continue

            previous_owner = ownership.get(fips)
            if previous_owner:
                team_to_fips[previous_owner].discard(fips)

            ownership[fips] = winner
            team_to_fips.setdefault(winner, set()).add(fips)

        transfer_records.append(
            {
                'season': season,
                'weekIndex': week_entry.get('weekIndex'),
                'week': week_entry.get('week'),
                'seasonType': week_entry.get('seasonType'),
                'gameId': game.get('id'),
                'winnerId': result['winner'],
                'loserId': result['loser'],
                'transferCount': result['transfer_count'],
                'fips': [t['fips'] for t in result['transfers']],
                'completedAt': result['transfers'][0]['at'] if result['transfers'] else datetime.utcnow().isoformat(),
            }
        )

    return {
        'weekIndex': week_entry.get('weekIndex'),
        'gamesProcessed': processed_games,
        'countiesTransferred': county_transfers,
        'transfers': transfer_records,
    }


def save_weekly_ownership(season: int, week_index: int, ownership: Dict[str, str]) -> None:
    db.save_json(f'ownership/{season}/week-{week_index:02d}.json', ownership)


def update_ownership_index(season: int, weeks: List[Dict]) -> None:
    data_dir = db.get_data_dir()
    index_path = data_dir / 'ownership' / 'index.json'

    if index_path.exists():
        with index_path.open('r', encoding='utf-8') as handle:
            index_payload = json.load(handle)
    else:
        index_payload = {'seasons': []}

    seasons = index_payload.setdefault('seasons', [])
    seasons = [
        season_entry for season_entry in seasons if season_entry.get('season') != season
    ]

    seasons.append({'season': season, 'weeks': weeks})
    seasons.sort(key=lambda entry: entry.get('season'))
    index_payload['seasons'] = seasons

    db.save_json('ownership/index.json', index_payload)


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)

    ownership = db.load_ownership()
    team_to_fips = build_team_reverse_index(ownership)

    timeline = load_games_timeline(args.season)
    if args.max_week_index is not None:
        timeline = [
            entry
            for entry in timeline
            if entry.get('weekIndex', 0) <= args.max_week_index
        ]

    baseline_label = f'{args.season} Baseline (Preseason)'

    season_weeks: List[Dict] = [
        {
            'weekIndex': 0,
            'week': 0,
            'seasonType': 'baseline',
            'label': baseline_label,
            'path': f'/data/ownership/{args.season}/week-00.json',
        }
    ]

    if not args.dry_run:
        save_weekly_ownership(args.season, 0, ownership)

    existing_transfers = load_existing_transfers()
    new_transfers: List[Dict] = []

    weekly_summaries: List[Dict] = []

    for week_entry in timeline:
        summary = apply_transfers_for_week(
            args.season,
            week_entry,
            ownership,
            team_to_fips,
            args.dry_run,
            args.verbose,
        )
        weekly_summaries.append(summary)
        season_weeks.append(
            {
                'weekIndex': week_entry.get('weekIndex'),
                'week': week_entry.get('week'),
                'seasonType': week_entry.get('seasonType'),
                'label': week_entry.get('label'),
                'path': f"/data/ownership/{args.season}/week-{int(week_entry.get('weekIndex')):02d}.json",
            }
        )

        if not args.dry_run:
            save_weekly_ownership(
                args.season,
                int(week_entry.get('weekIndex')),
                ownership,
            )

        transfers = summary.get('transfers') or []
        new_transfers.extend(transfers)

    if not args.dry_run:
        update_ownership_index(args.season, season_weeks)
        if new_transfers:
            save_transfers(existing_transfers + new_transfers)

    total_games = sum(item.get('gamesProcessed', 0) for item in weekly_summaries)
    total_counties = sum(item.get('countiesTransferred', 0) for item in weekly_summaries)

    print(
        f"✅ Applied {total_games} games for season {args.season}; "
        f"total counties transferred: {total_counties}"
    )

    if args.dry_run:
        print('ℹ️  Dry run enabled; no files were written.')

    if not timeline:
        print('ℹ️  No games found for the provided season; baseline snapshot only.')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
