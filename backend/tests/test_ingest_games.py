import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from ingest_games import (
    ESPN_PAGE_LIMIT,
    build_timeline,
    group_games_by_week,
    normalize_games,
    partition_postseason_games,
)
from lib.teams import build_team_name_lookup


def test_espn_completed_game_is_normalized():
    raw = {
        'id': '401000001',
        'date': '2026-08-29T16:00Z',
        'season': {'year': 2026, 'type': 2},
        'week': {'number': 1},
        'status': {'type': {'completed': True}},
        'competitions': [
            {
                'neutralSite': False,
                'conferenceCompetition': True,
                'venue': {'fullName': 'Hornet Stadium'},
                'competitors': [
                    {
                        'homeAway': 'home',
                        'score': '31',
                        'team': {'location': 'Sacramento State'},
                    },
                    {
                        'homeAway': 'away',
                        'score': '24',
                        'team': {'location': 'UMass'},
                    },
                ],
            }
        ],
    }

    games = normalize_games([raw], build_team_name_lookup())

    assert games == [
        {
            'id': '401000001',
            'season': 2026,
            'seasonType': 'regular',
            'week': 1,
            'completed': True,
            'startDate': '2026-08-29T16:00Z',
            'neutralSite': False,
            'conferenceGame': True,
            'venue': 'Hornet Stadium',
            'homeTeamId': 'sacramento-state',
            'awayTeamId': 'umass',
            'homeScore': 31,
            'awayScore': 24,
            'winnerId': 'sacramento-state',
            'loserId': 'umass',
            'sortKey': '2026-08-29T16:00Z',
        }
    ]


def test_espn_scheduled_game_is_not_treated_as_final():
    raw = {
        'id': '401000002',
        'season': {'year': 2026, 'type': 2},
        'week': {'number': 1},
        'status': {'type': {'completed': False}},
        'competitions': [],
    }

    assert normalize_games([raw], build_team_name_lookup()) == []
    assert ESPN_PAGE_LIMIT == 200


def test_postseason_games_are_partitioned_into_dated_windows():
    games = [
        {'id': '1', 'startDate': '2014-12-20T16:00Z', 'week': 1},
        {'id': '2', 'startDate': '2014-12-26T20:00Z', 'week': 1},
        {'id': '3', 'startDate': '2014-12-27T20:00Z', 'week': 1},
        {'id': '4', 'startDate': '2015-01-13T01:30Z', 'week': 1},
    ]

    partitioned = partition_postseason_games(games)
    assert [game['week'] for game in partitioned] == [1, 1, 2, 4]

    timeline, _ = build_timeline(2014, {}, group_games_by_week(partitioned))
    assert [entry['label'] for entry in timeline] == [
        'Postseason · Dec 20–26',
        'Postseason · Dec 27',
        'Postseason · Jan 12',
    ]
