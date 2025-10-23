import copy
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from lib.game_engine import process_game_result


def test_process_game_result_transfers_all_loser_counties():
    ownership = {
        '01001': 'winner-team',
        '01003': 'loser-team',
        '01005': 'loser-team',
    }
    team_to_fips = {
        'winner-team': {'01001'},
        'loser-team': {'01003', '01005'},
    }

    game = {
        'id': 123,
        'winnerId': 'winner-team',
        'loserId': 'loser-team',
        'season': 2025,
        'week': 1,
        'completed': True,
    }

    result = process_game_result(game, copy.deepcopy(ownership), team_to_fips)
    assert result is not None
    assert result['winner'] == 'winner-team'
    assert result['loser'] == 'loser-team'
    assert result['transfer_count'] == 2
    transferred_fips = {transfer['fips'] for transfer in result['transfers']}
    assert transferred_fips == {'01003', '01005'}


def test_process_game_result_returns_none_for_tie():
    ownership = {'01001': 'alpha', '01003': 'beta'}

    game = {
        'id': 456,
        'status': 'final',
        'home_team_id': 'alpha',
        'away_team_id': 'beta',
        'home_score': 21,
        'away_score': 21,
    }

    result = process_game_result(game, ownership)
    assert result is None
