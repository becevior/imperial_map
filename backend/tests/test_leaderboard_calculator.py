import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from lib.leaderboard_calculator import persist_leaderboard


def test_persist_leaderboard_preserves_timestamp_when_content_is_unchanged(monkeypatch):
    existing = {
        'season': 2026,
        'weekIndex': 1,
        'generatedAt': '2026-08-30T01:00:00+00:00',
        'leaderboards': {'territoryOwned': []},
    }
    stored = {
        'leaderboards/2026/week-01.json': existing,
        'leaderboards/index.json': {'seasons': []},
    }

    def load_json(path):
        if path not in stored:
            raise FileNotFoundError(path)
        return stored[path]

    monkeypatch.setattr('lib.leaderboard_calculator.db.load_json', load_json)
    monkeypatch.setattr(
        'lib.leaderboard_calculator.db.save_json',
        lambda path, value: stored.__setitem__(path, value),
    )

    payload = {
        **existing,
        'generatedAt': '2026-08-30T01:05:00+00:00',
    }
    result = persist_leaderboard(
        2026,
        {'weekIndex': 1, 'week': 1, 'seasonType': 'regular', 'label': 'Week 1'},
        payload,
    )

    assert result['generatedAt'] == existing['generatedAt']
    assert stored['leaderboards/2026/week-01.json']['generatedAt'] == existing['generatedAt']
