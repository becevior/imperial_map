import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from lib.live_manifest import build_live_manifest


def test_live_manifest_points_at_latest_snapshot(monkeypatch, tmp_path):
    values = {
        'ownership/index.json': {
            'seasons': [
                {
                    'season': 2026,
                    'teamCount': 138,
                    'weeks': [
                        {
                            'weekIndex': 0,
                            'week': 0,
                            'seasonType': 'baseline',
                            'label': '2026 Baseline',
                            'path': '/data/ownership/2026/week-00.json',
                        },
                        {
                            'weekIndex': 1,
                            'week': 1,
                            'seasonType': 'regular',
                            'label': 'Regular Week 1',
                            'path': '/data/ownership/2026/week-01.json',
                        },
                    ],
                }
            ]
        },
        'games/2026/index.json': {
            'weeks': [
                {
                    'weekIndex': 1,
                    'path': '/data/games/2026/week-01.json',
                }
            ]
        },
        'games/2026/week-01.json': [
            {'id': '20', 'completed': True},
            {'id': '10', 'completed': True},
        ],
    }

    def load_json(path):
        if path not in values:
            raise FileNotFoundError(path)
        return values[path]

    for relative_path in [
        'ownership/2026/week-01.json',
        'ownership/2026/week-01-logos.json',
        'leaderboards/2026/week-01.json',
        'games/2026/week-01.json',
    ]:
        file_path = tmp_path / relative_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(json.dumps(values.get(relative_path, {'ok': True})))

    monkeypatch.setattr('lib.live_manifest.db.load_json', load_json)
    monkeypatch.setattr('lib.live_manifest.db.get_data_dir', lambda: tmp_path)

    generated_at = datetime(2026, 8, 30, 1, 2, tzinfo=timezone.utc)
    manifest = build_live_manifest(2026, generated_at)

    assert manifest['season'] == 2026
    assert manifest['weekIndex'] == 1
    assert manifest['completedGameCount'] == 2
    assert manifest['finalGameIds'] == ['10', '20']
    assert manifest['ownershipPath'] == '/data/ownership/2026/week-01.json'
    assert manifest['generatedAt'] == '2026-08-30T01:02:00+00:00'
    assert len(manifest['version']) == 20
