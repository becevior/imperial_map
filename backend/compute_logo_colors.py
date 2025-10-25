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


LOGO_COLOR_SIMILARITY_THRESHOLD = 18
DEFAULT_FILL_COLOR = '#2d2d2d'


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


def _sanitize_hex(value: Optional[str]) -> Optional[str]:
    if not value:
        return None

    hex_value = value.strip()
    if not hex_value:
        return None

    if not hex_value.startswith('#'):
        hex_value = f'#{hex_value}'

    if len(hex_value) == 7 and all(c in '0123456789abcdefABCDEF' for c in hex_value[1:]):
        return hex_value.lower()

    if len(hex_value) == 4 and all(c in '0123456789abcdefABCDEF' for c in hex_value[1:]):
        r, g, b = hex_value[1:]
        return f'#{r}{r}{g}{g}{b}{b}'.lower()

    return None


def _hex_to_rgb(hex_value: str) -> Optional[Tuple[float, float, float]]:
    normalized = _sanitize_hex(hex_value)
    if not normalized:
        return None

    r = int(normalized[1:3], 16) / 255.0
    g = int(normalized[3:5], 16) / 255.0
    b = int(normalized[5:7], 16) / 255.0
    return r, g, b


def _rgb_to_lab(rgb: Tuple[float, float, float]) -> Tuple[float, float, float]:
    r, g, b = rgb

    def linearize(channel: float) -> float:
        if channel <= 0.04045:
            return channel / 12.92
        return ((channel + 0.055) / 1.055) ** 2.4

    lr = linearize(r)
    lg = linearize(g)
    lb = linearize(b)

    x = lr * 0.4124 + lg * 0.3576 + lb * 0.1805
    y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722
    z = lr * 0.0193 + lg * 0.1192 + lb * 0.9505

    ref_x = 0.95047
    ref_y = 1.0
    ref_z = 1.08883

    def transform(value: float) -> float:
        if value > 0.008856:
            return value ** (1 / 3)
        return (7.787 * value) + (16 / 116)

    fx = transform(x / ref_x)
    fy = transform(y / ref_y)
    fz = transform(z / ref_z)

    l = (116 * fy) - 16
    a = 500 * (fx - fy)
    b_val = 200 * (fy - fz)

    return l, a, b_val


def _delta_e(lab_a: Tuple[float, float, float], lab_b: Tuple[float, float, float]) -> float:
    return ((lab_a[0] - lab_b[0]) ** 2 + (lab_a[1] - lab_b[1]) ** 2 + (lab_a[2] - lab_b[2]) ** 2) ** 0.5


def _lighten_hex(hex_value: str, ratio: float = 0.35) -> str:
    rgb = _hex_to_rgb(hex_value)
    if not rgb:
        return hex_value

    def mix(component: float) -> int:
        return int(round(component * 255 + (255 - component * 255) * ratio))

    r = mix(rgb[0])
    g = mix(rgb[1])
    b = mix(rgb[2])
    return '#{0:02x}{1:02x}{2:02x}'.format(r, g, b)


def _fallback_color(team_id: str) -> str:
    hash_value = 0
    for ch in team_id:
        hash_value = ord(ch) + ((hash_value << 5) - hash_value)

    r = hash_value & 0xFF
    g = (hash_value >> 8) & 0xFF
    b = (hash_value >> 16) & 0xFF

    def adjust(component: int) -> int:
        return max(70, min(200, component))

    return '#{0:02x}{1:02x}{2:02x}'.format(adjust(r), adjust(g), adjust(b))


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

    logo_colors: Dict[str, str] = {}
    fills: Dict[str, str] = {}

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

        logo_hex = _rgb_to_hex(color)
        logo_colors[team_id] = logo_hex

        primary_hex = _sanitize_hex(team.get('primaryColor'))
        secondary_hex = _sanitize_hex(team.get('secondaryColor'))
        base_hex = primary_hex or _sanitize_hex(_fallback_color(team_id)) or DEFAULT_FILL_COLOR

        logo_lab = _rgb_to_lab(_hex_to_rgb(logo_hex)) if _hex_to_rgb(logo_hex) else None
        base_lab = _rgb_to_lab(_hex_to_rgb(base_hex)) if _hex_to_rgb(base_hex) else None

        fill_hex = base_hex

        if logo_lab and base_lab:
            difference = _delta_e(base_lab, logo_lab)
            if difference < LOGO_COLOR_SIMILARITY_THRESHOLD:
                fill_hex = secondary_hex or _lighten_hex(base_hex, 0.35)

        fills[team_id] = _sanitize_hex(fill_hex) or base_hex

        if args.verbose:
            delta_display = 'n/a'
            if logo_lab and base_lab:
                delta_display = f"{_delta_e(base_lab, logo_lab):.2f}"
            print(f'{team_id:<20} logo={logo_hex} fill={fills[team_id]} ΔE={delta_display}')

    metadata = {
        'generatedAt': datetime.utcnow().isoformat() + 'Z',
        'source': 'compute_logo_colors.py',
        'threshold': LOGO_COLOR_SIMILARITY_THRESHOLD,
        'teams': {
            team_id: {
                'logo': logo_colors.get(team_id),
                'fill': fills.get(team_id),
            }
            for team_id in sorted(logo_colors.keys())
        },
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open('w', encoding='utf-8') as handle:
        json.dump(metadata, handle, indent=2, sort_keys=True)
        handle.write('\n')

    print(f'✅ Stored dominant logo colors for {len(logo_colors)} teams -> {output_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
