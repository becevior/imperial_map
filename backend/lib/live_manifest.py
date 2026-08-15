"""Build the small manifest browsers poll for live territory updates."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

from lib import db


def _relative_data_path(data_path: str) -> str:
    return data_path[len('/data/'):] if data_path.startswith('/data/') else data_path.lstrip('/')


def _hash_files(data_dir: Path, paths: Iterable[str]) -> str:
    digest = hashlib.sha256()
    for data_path in sorted(set(paths)):
        relative_path = _relative_data_path(data_path)
        file_path = data_dir / relative_path
        if not file_path.exists():
            continue
        digest.update(relative_path.encode('utf-8'))
        digest.update(b'\0')
        digest.update(file_path.read_bytes())
        digest.update(b'\0')
    return digest.hexdigest()[:20]


def build_live_manifest(
    season: int,
    generated_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    ownership_index = db.load_json('ownership/index.json')
    season_entry = next(
        (
            entry
            for entry in ownership_index.get('seasons') or []
            if int(entry.get('season', 0)) == season
        ),
        None,
    )
    if not season_entry:
        raise ValueError(f'No ownership snapshots found for season {season}')

    weeks = season_entry.get('weeks') or []
    if not weeks:
        raise ValueError(f'Season {season} has no ownership snapshots')
    latest_week = max(weeks, key=lambda entry: int(entry.get('weekIndex', 0)))
    week_index = int(latest_week.get('weekIndex', 0))
    ownership_path = latest_week.get('path')
    if not ownership_path:
        raise ValueError('Latest ownership snapshot is missing its path')

    logos_path = ownership_path.replace('.json', '-logos.json')
    leaderboard_path = f'/data/leaderboards/{season}/week-{week_index:02d}.json'

    try:
        games_index = db.load_json(f'games/{season}/index.json')
    except FileNotFoundError:
        games_index = {'weeks': []}
    game_week = next(
        (
            entry
            for entry in games_index.get('weeks') or []
            if int(entry.get('weekIndex', -1)) == week_index
        ),
        None,
    )
    games_path = game_week.get('path') if game_week else None
    games = db.load_json(_relative_data_path(games_path)) if games_path else []
    final_game_ids = sorted(
        str(game.get('id'))
        for game in games
        if game.get('completed') and game.get('id') is not None
    )

    version_paths = [ownership_path, logos_path, leaderboard_path]
    if games_path:
        version_paths.append(games_path)

    timestamp = generated_at or datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)

    return {
        'version': _hash_files(db.get_data_dir(), version_paths),
        'generatedAt': timestamp.astimezone(timezone.utc).isoformat(),
        'season': season,
        'teamCount': season_entry.get('teamCount'),
        'weekIndex': week_index,
        'week': latest_week.get('week'),
        'seasonType': latest_week.get('seasonType'),
        'label': latest_week.get('label'),
        'completedGameCount': len(final_game_ids),
        'finalGameIds': final_game_ids,
        'ownershipPath': ownership_path,
        'logosPath': logos_path,
        'leaderboardPath': leaderboard_path,
    }


def publish_live_manifest(season: int) -> Dict[str, Any]:
    manifest = build_live_manifest(season)
    db.save_json('live.json', manifest)
    return manifest


__all__ = ['build_live_manifest', 'publish_live_manifest']
