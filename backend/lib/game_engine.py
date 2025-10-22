"""
Game processing and territory transfer logic
"""
from typing import Dict, List, Optional
from datetime import datetime


def process_game_result(
    game: Dict,
    current_ownership: List[Dict]
) -> Optional[Dict]:
    """
    Process a completed game and determine territory transfers

    MVP Rule: Winner takes ALL counties owned by loser

    Args:
        game: Game dict with id, status, home_team_id, away_team_id, scores
        current_ownership: List of ownership dicts with fips, owner_team_id

    Returns:
        Dict with winner, loser, transfer_count, transfers list
        Or None if game cannot be processed
    """
    # Only process final games
    if game.get('status') != 'final':
        return None

    home_score = game.get('home_score')
    away_score = game.get('away_score')

    # No clear winner
    if home_score is None or away_score is None or home_score == away_score:
        return None

    home_wins = home_score > away_score
    winner = game['home_team_id'] if home_wins else game['away_team_id']
    loser = game['away_team_id'] if home_wins else game['home_team_id']

    # Find all territories owned by loser
    transfers = []
    now = datetime.utcnow().isoformat()

    for ownership in current_ownership:
        if ownership['owner_team_id'] == loser:
            transfers.append({
                'fips': ownership['fips'],
                'from_team_id': loser,
                'to_team_id': winner,
                'game_id': game['id'],
                'at': now,
                'reason': f"{winner} defeated {loser} (all-of-loser rule)"
            })

    return {
        'winner': winner,
        'loser': loser,
        'transfer_count': len(transfers),
        'transfers': transfers
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
