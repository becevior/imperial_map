#!/usr/bin/env python3
"""Generate dominant logo colors to improve map contrast."""

import argparse
import json
import sys
from collections import Counter
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple

import requests
from PIL import Image


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Compute dominant logo colors for each team')
    parser.add_argument(
        '--teams-json',
        type=Path,
        default=None,
        help='Path to teams.json (defaults to frontend/public/data/teams.json)',
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=None,
        help='Path to write logo-colors.json (defaults to frontend/public/data/logo-colors.json)',
    )
    parser.add_argument('--verbose', action='store_true', help='Print extra logging')
    return parser.parse_args()


def _project_paths() -> Tuple[Path, Path, Path]:
    root = Path(__file__).resolve().parent.parent
    teams_path = root / 'frontend' / 'public' / 'data' / 'teams.json'
    output_path = root / 'frontend' / 'public' / 'data' / 'logo-colors.json'
    return root, teams_path, output_path


def _load_teams(path: Path) -> Iterable[Dict]:
    if not path.exists():
        raise FileNotFoundError(f'Cannot locate teams dataset at {path}')

    with path.open('r', encoding='utf-8') as handle:
        payload = json.load(handle)

    if not isinstance(payload, list):
        raise ValueError('Expected teams.json to contain a list of teams')

    return payload


def _quantize_component(value: int, step: int = 16) -> int:
    """Reduce component precision to avoid overfitting to noise."""
    return max(0, min(255, (value // step) * step))


def _dominant_color(image: Image.Image) -> Optional[Tuple[int, int, int]]:
    image = image.convert('RGBA')
    image = image.resize((160, 160))
    pixels = [
        (r, g, b)
        for r, g, b, a in image.getdata()
        if a >= 64  # skip fully transparent pixels
    ]

    if not pixels:
        return None

    filtered = [
        (r, g, b)
        for r, g, b in pixels
        if not (r > 245 and g > 245 and b > 245)  # ignore near-white backgrounds
    ]

    samples = filtered if filtered else pixels

    counts = Counter((_quantize_component(r), _quantize_component(g), _quantize_component(b)) for r, g, b in samples)
    if not counts:
        return None

    (r, g, b), _ = counts.most_common(1)[0]
    return r, g, b


def _rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
    return '#%02x%02x%02x' % rgb


def _fetch_image(session: requests.Session, url: str) -> Optional[Image.Image]:
    try:
        response = session.get(url, timeout=15)
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f'⚠️  Failed to download {url}: {exc}', file=sys.stderr)
        return None

    try:
        return Image.open(BytesIO(response.content))
    except Exception as exc:  # PIL specific exceptions inherit from Exception
        print(f'⚠️  Unable to decode image from {url}: {exc}', file=sys.stderr)
        return None


def main() -> int:
    args = _parse_args()
    project_root, default_teams, default_output = _project_paths()

    teams_path = args.teams_json or default_teams
    output_path = args.output or default_output

    teams = _load_teams(teams_path)

    session = requests.Session()
    session.headers.update({'User-Agent': 'imperial-map-logo-colors/1.0'})

    results: Dict[str, str] = {}

    for team in teams:
        team_id = team.get('id')
        logo_url = team.get('logoUrl')

        if not team_id or not logo_url:
            continue

        image = _fetch_image(session, logo_url)
        if image is None:
            continue

        color = _dominant_color(image)
        if color is None:
            continue

        results[team_id] = _rgb_to_hex(color)

        if args.verbose:
            print(f'{team_id:<20} -> {results[team_id]}')

    metadata = {
        'generatedAt': datetime.utcnow().isoformat() + 'Z',
        'source': 'compute_logo_colors.py',
        'teams': results,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open('w', encoding='utf-8') as handle:
        json.dump(metadata, handle, indent=2, sort_keys=True)
        handle.write('\n')

    print(f'✅ Stored dominant logo colors for {len(results)} teams -> {output_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
