import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from build_nfl import load_location_config, normalize_event, parse_args


TEAM_LOOKUP = {'1': 'home-team', '2': 'away-team'}


def event(home_score='24', away_score='17', completed=True):
    return {
        'id': '401000001',
        'date': '2025-09-07T17:00Z',
        'season': {'year': 2025, 'type': 2},
        'week': {'number': 1},
        'status': {'type': {'completed': completed}},
        'competitions': [{
            'neutralSite': False,
            'venue': {'fullName': 'Example Stadium'},
            'competitors': [
                {'homeAway': 'home', 'score': home_score, 'team': {'id': '1'}},
                {'homeAway': 'away', 'score': away_score, 'team': {'id': '2'}},
            ],
        }],
    }


def test_normalize_nfl_final():
    result = normalize_event(event(), TEAM_LOOKUP)
    assert result is not None
    assert result['winnerId'] == 'home-team'
    assert result['loserId'] == 'away-team'
    assert result['outcome'] == 'home-win'


def test_normalize_nfl_tie_has_no_winner():
    result = normalize_event(event('20', '20'), TEAM_LOOKUP)
    assert result is not None
    assert result['outcome'] == 'draw'
    assert result['winnerId'] is None
    assert result['loserId'] is None


def test_normalize_nfl_ignores_incomplete_game():
    assert normalize_event(event(completed=False), TEAM_LOOKUP) is None


def test_historical_membership_and_relocations_are_season_aware():
    config_path = ROOT_DIR / 'data' / 'nfl_teams.csv'
    teams_2000 = load_location_config(config_path, 2000)
    teams_2002 = load_location_config(config_path, 2002)
    teams_2025 = load_location_config(config_path, 2025)

    assert len(teams_2000) == 31
    assert '34' not in teams_2000
    assert teams_2000['13']['display_name'] == 'Oakland Raiders'
    assert teams_2000['14']['city'] == 'St. Louis'
    assert teams_2000['24']['abbreviation'] == 'SD'
    assert teams_2000['11']['division'] == 'AFC East'

    assert len(teams_2002) == 32
    assert teams_2002['34']['division'] == 'AFC South'
    assert teams_2025['13']['display_name'] == 'Las Vegas Raiders'
    assert teams_2025['14']['city'] == 'Woodland Hills'
    assert teams_2025['24']['abbreviation'] == 'LAC'


def test_range_arguments_default_end_to_latest_supported_season():
    args = parse_args(['--start-season', '2000'])
    assert args.start_season == 2000
    assert args.end_season == 2025

    single = parse_args(['--season', '2010'])
    assert single.start_season == 2010
    assert single.end_season == 2010
