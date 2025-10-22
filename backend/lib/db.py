"""
File-based data storage utilities
No database needed - all data stored as JSON files
"""
import json
from pathlib import Path
from typing import List, Dict, Any


def get_data_dir() -> Path:
    """Get the public data directory"""
    return Path(__file__).parent.parent.parent / 'public' / 'data'


def load_json(filename: str) -> Any:
    """Load JSON file from data directory"""
    path = get_data_dir() / filename
    with open(path, 'r') as f:
        return json.load(f)


def save_json(filename: str, data: Any, indent: int = 2) -> None:
    """Save data as JSON file in data directory"""
    path = get_data_dir() / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=indent)


def load_teams() -> List[Dict]:
    """Load teams data"""
    return load_json('teams.json')


def save_teams(teams: List[Dict]) -> None:
    """Save teams data"""
    save_json('teams.json', teams)


def load_ownership() -> Dict[str, str]:
    """Load current territory ownership (FIPS -> team_id)"""
    return load_json('ownership.json')


def save_ownership(ownership: Dict[str, str]) -> None:
    """Save territory ownership"""
    save_json('ownership.json', ownership)


def load_games(season: int, week: int) -> List[Dict]:
    """Load games for a specific week"""
    try:
        return load_json(f'games/{season}-week-{week}.json')
    except FileNotFoundError:
        return []


def save_games(season: int, week: int, games: List[Dict]) -> None:
    """Save games for a specific week"""
    save_json(f'games/{season}-week-{week}.json', games)


def append_transfer(transfer: Dict) -> None:
    """Append a territory transfer to history"""
    try:
        history = load_json('transfers.json')
    except FileNotFoundError:
        history = []

    history.append(transfer)
    save_json('transfers.json', history)
