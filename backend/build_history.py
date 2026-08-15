#!/usr/bin/env python3
"""Build season baselines, game results, ownership, and leaderboards in bulk."""

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Optional

BACKEND_DIR = Path(__file__).resolve().parent


def _run(*args: str) -> None:
    subprocess.run(
        [sys.executable, *args],
        cwd=BACKEND_DIR,
        check=True,
    )


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Build historical imperial map seasons')
    parser.add_argument('--start-season', type=int, default=2014)
    parser.add_argument('--end-season', type=int, default=2025)
    parser.add_argument('--provider', choices=['espn', 'cfbd'], default='espn')
    return parser.parse_args(list(argv) if argv is not None else None)


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    for season in range(args.start_season, args.end_season + 1):
        print(f'\n{"=" * 64}\nBuilding {season}\n{"=" * 64}', flush=True)
        _run('setup.py', '--season', str(season))
        _run(
            'ingest_games.py',
            '--season',
            str(season),
            '--season-type',
            'both',
            '--provider',
            args.provider,
        )
        _run('apply_transfers.py', '--season', str(season))

    print(
        f'\n✓ Built historical seasons {args.start_season}-{args.end_season}',
        flush=True,
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
