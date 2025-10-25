#!/usr/bin/env python3
"""
Generate campus regions file from team locations.

This creates permanent campus markers based on team lat/longs from CSV.
Campus positions never change; only the team logo at each campus changes.

Run this once after setup.py to create campus-regions.json
"""
from lib.db import load_ownership, load_teams, save_json
from lib.region_calculator import generate_campus_regions


def main():
    print("🏫 Generating campus regions from team locations...\n")

    # Load baseline data
    print("📋 Loading baseline ownership and teams...")
    baseline_ownership = load_ownership()
    teams = load_teams()

    print(f"  ✓ Loaded {len(baseline_ownership)} counties")
    print(f"  ✓ Loaded {len(teams)} teams")

    # Generate campus regions
    print("\n📍 Creating campus regions at team locations...")
    regions = generate_campus_regions(baseline_ownership, teams)

    # Save regions file
    save_json('campus-regions.json', regions)

    print(f"\n✅ Generated {len(regions)} campus regions")
    print("\nGenerated file:")
    print("  - frontend/public/data/campus-regions.json")

    # Show some stats
    teams_with_territory = sum(1 for r in regions if r.get('baselineCountyCount', 0) > 0)
    teams_without = len(regions) - teams_with_territory

    print("\n📊 Region breakdown:")
    print(f"  - Teams with baseline territory: {teams_with_territory}")
    print(f"  - Teams without baseline territory: {teams_without}")

    # Show largest regions
    print("\n📊 Top 10 teams by baseline county count:")
    sorted_regions = sorted(regions, key=lambda r: r.get('baselineCountyCount', 0), reverse=True)[:10]
    for region in sorted_regions:
        team_name = region['teamName']
        counties = region.get('baselineCountyCount', 0)
        print(f"  - {team_name.ljust(25)} {counties:>3} counties")

    print("\n✅ Done! Campus regions are ready for weekly ownership calculations.")


if __name__ == '__main__':
    main()
