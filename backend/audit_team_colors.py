#!/usr/bin/env python3
"""
Audit team colors against ESPN API and fix mismatches.
"""

import csv
import re
import requests
import time
from typing import Dict, List, Tuple

def extract_team_id(logo_url: str) -> str:
    """Extract team ID from ESPN logo URL."""
    match = re.search(r'/(\d+)\.png', logo_url)
    if match:
        return match.group(1)
    return None

def get_espn_colors(team_id: str) -> Tuple[str, str]:
    """Fetch team colors from ESPN API."""
    url = f"http://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/{team_id}"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()

        # Extract colors from the team data
        team = data.get('team', {})
        color = team.get('color')
        alternate_color = team.get('alternateColor')

        # Add # prefix if not present
        primary = f"#{color}" if color and not color.startswith('#') else color
        secondary = f"#{alternate_color}" if alternate_color and not alternate_color.startswith('#') else alternate_color

        return primary, secondary
    except Exception as e:
        print(f"Error fetching colors for team {team_id}: {e}")
        return None, None

def normalize_color(color: str) -> str:
    """Normalize color hex code to uppercase."""
    if color:
        return color.upper()
    return None

def audit_team_colors(csv_path: str) -> List[Dict]:
    """Audit all team colors and identify mismatches."""
    mismatches = []

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    total_teams = len(rows)
    print(f"Auditing {total_teams} teams...\n")

    for idx, row in enumerate(rows, 1):
        school = row['School']
        logo_url = row['Logo_URL']
        current_primary = normalize_color(row['Primary_Color_Hex'])
        current_secondary = normalize_color(row['Secondary_Color_Hex'])

        # Extract team ID
        team_id = extract_team_id(logo_url)
        if not team_id:
            print(f"⚠️  {school}: Could not extract team ID from URL")
            continue

        print(f"[{idx}/{total_teams}] Checking {school} (ID: {team_id})...")

        # Fetch ESPN colors
        espn_primary, espn_secondary = get_espn_colors(team_id)

        if espn_primary is None:
            print(f"⚠️  {school}: Could not fetch ESPN colors")
            continue

        # Normalize ESPN colors
        espn_primary = normalize_color(espn_primary)
        espn_secondary = normalize_color(espn_secondary)

        # Check for mismatches
        primary_mismatch = current_primary != espn_primary
        secondary_mismatch = current_secondary != espn_secondary

        if primary_mismatch or secondary_mismatch:
            mismatch_info = {
                'school': school,
                'team_id': team_id,
                'logo_url': logo_url,
                'current_primary': current_primary,
                'espn_primary': espn_primary,
                'current_secondary': current_secondary,
                'espn_secondary': espn_secondary,
                'primary_mismatch': primary_mismatch,
                'secondary_mismatch': secondary_mismatch,
                'row_data': row
            }
            mismatches.append(mismatch_info)

            mismatch_types = []
            if primary_mismatch:
                mismatch_types.append(f"Primary: {current_primary} → {espn_primary}")
            if secondary_mismatch:
                mismatch_types.append(f"Secondary: {current_secondary} → {espn_secondary}")

            print(f"  ❌ MISMATCH: {', '.join(mismatch_types)}")
        else:
            print(f"  ✓ Colors match")

        # Rate limiting - be nice to ESPN's API
        time.sleep(0.5)

    return mismatches

def write_updated_csv(csv_path: str, mismatches: List[Dict]):
    """Write updated CSV with corrected colors."""
    # Read all rows
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = reader.fieldnames

    # Update rows with ESPN colors
    mismatch_map = {m['school']: m for m in mismatches}

    for row in rows:
        school = row['School']
        if school in mismatch_map:
            mismatch = mismatch_map[school]
            row['Primary_Color_Hex'] = mismatch['espn_primary']
            row['Secondary_Color_Hex'] = mismatch['espn_secondary']

    # Write updated CSV
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

def main():
    csv_path = 'data/team_locs.csv'

    print("=" * 70)
    print("TEAM COLOR AUDIT - ESPN API")
    print("=" * 70)
    print()

    # Run audit
    mismatches = audit_team_colors(csv_path)

    print()
    print("=" * 70)
    print("AUDIT SUMMARY")
    print("=" * 70)
    print(f"Total mismatches found: {len(mismatches)}")
    print()

    if mismatches:
        print("MISMATCHES DETAILS:")
        print("-" * 70)
        for m in mismatches:
            print(f"\n{m['school']} (ID: {m['team_id']})")
            if m['primary_mismatch']:
                print(f"  Primary:   {m['current_primary']} → {m['espn_primary']}")
            if m['secondary_mismatch']:
                print(f"  Secondary: {m['current_secondary']} → {m['espn_secondary']}")

        print()
        print("=" * 70)
        print("Applying fixes to team_locs.csv...")
        write_updated_csv(csv_path, mismatches)
        print(f"✓ Updated {len(mismatches)} teams in {csv_path}")
    else:
        print("✓ All team colors match ESPN API values!")

if __name__ == '__main__':
    main()
