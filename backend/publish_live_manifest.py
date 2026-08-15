#!/usr/bin/env python3
"""Publish the manifest used by visible browser tabs to discover new finals."""

import argparse
from typing import Iterable, Optional

from lib.live_manifest import publish_live_manifest


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Publish the live territory manifest')
    parser.add_argument('--season', type=int, required=True, help='Season year (e.g. 2026)')
    return parser.parse_args(list(argv) if argv is not None else None)


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    manifest = publish_live_manifest(args.season)
    print(
        f"✅ Published live manifest {manifest['version']} for "
        f"season {manifest['season']} week {manifest['weekIndex']}"
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
