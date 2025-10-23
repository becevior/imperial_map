"""
Game processing and territory transfer logic
"""
from typing import Dict, Iterable, List, Optional
from datetime import datetime


def process_game_result(
    game: Dict,
    current_ownership: Dict[str, str],
    team_counties: Optional[Dict[str, Iterable[str]]] = None,
) -> Optional[Dict]:
    """
    Process a completed game and determine territory transfers

    MVP Rule: Winner takes ALL counties owned by loser

    Args:
        game: Game dict (snake_case or camelCase keys are supported)
        current_ownership: Mapping of FIPS -> owning team ID
        team_counties: Optional reverse index team ID -> iterable of FIPS

    Returns:
        Dict with winner, loser, transfer_count, transfers list
        Or None if game cannot be processed
    """
    status = (game.get('status') or '').lower()
    completed = bool(game.get('completed'))

    if status and status not in {'final', 'completed'} and not completed:
        return None

    winner = (
        game.get('winner_id')
        or game.get('winnerId')
        or game.get('winner')
    )
    loser = (
        game.get('loser_id')
        or game.get('loserId')
        or game.get('loser')
    )

    if not winner or not loser:
        # Attempt to derive winner/loser from scores if provided
        home_score = game.get('home_score') or game.get('homeScore')
        away_score = game.get('away_score') or game.get('awayScore')
        home_team = game.get('home_team_id') or game.get('homeTeamId')
        away_team = game.get('away_team_id') or game.get('awayTeamId')

        if (
            home_score is None
            or away_score is None
            or home_team is None
            or away_team is None
            or home_score == away_score
        ):
            return None

        home_wins = home_score > away_score
        winner = home_team if home_wins else away_team
        loser = away_team if home_wins else home_team

    if winner == loser:
        return None

    now = datetime.utcnow().isoformat()

    if team_counties is not None:
        loser_counties = list(team_counties.get(loser, []))
    else:
        loser_counties = [
            fips for fips, owner in current_ownership.items() if owner == loser
        ]

    transfers = [
        {
            'fips': fips,
            'from_team_id': loser,
            'to_team_id': winner,
            'game_id': game.get('id'),
            'at': now,
            'reason': f"{winner} defeated {loser} (all-of-loser rule)",
        }
        for fips in loser_counties
    ]

    return {
        'winner': winner,
        'loser': loser,
        'transfer_count': len(transfers),
        'transfers': transfers,
    }


def validate_ownership(ownership: List[Dict]) -> bool:
    """
    Validate that ownership data is consistent

    Checks:
    - Every county has exactly one owner
    - Version numbers are positive
    """
    # Check for duplicate FIPS codes
    fips_codes = [o['fips'] for o in ownership]
    unique_fips = set(fips_codes)

    if len(unique_fips) != len(fips_codes):
        print("❌ Duplicate FIPS codes in ownership data")
        return False

    # Check version numbers
    for o in ownership:
        if o.get('version', 0) <= 0:
            print(f"❌ Invalid version for FIPS {o['fips']}: {o.get('version')}")
            return False

    return True
