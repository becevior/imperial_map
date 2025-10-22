#!/usr/bin/env python3
"""
Initialize data files from GeoJSON and team CSV
Generates teams.json and ownership.json for all 136 FBS teams
"""
import json
from pathlib import Path
from lib.territory import calculate_centroid, calculate_distance
from lib.teams import load_teams_from_csv, get_team_locations
from lib.db import save_teams, save_ownership


def main():
    print("🚀 Initializing data files for 136 FBS teams...\n")

    # Step 1: Load teams from CSV
    print("📋 Step 1: Loading teams from CSV...")
    teams = load_teams_from_csv()
    print(f"  ✓ Loaded {len(teams)} FBS teams")

    # Step 2: Save teams.json
    print("\n💾 Step 2: Creating teams.json...")
    create_teams_file(teams)

    # Step 3: Calculate ownership from GeoJSON
    print("\n🗺️  Step 3: Processing county GeoJSON data...")
    print("📍 Step 4: Assigning counties to nearest teams...")
    create_ownership_file(teams)

    print("\n✅ Initialization complete!")
    print("\nGenerated files:")
    print("  - frontend/public/data/teams.json")
    print("  - frontend/public/data/ownership.json")
    print(f"\nCoverage: {len(teams)} teams assigned to 3,221 US counties")
    print("\nNext: Run `cd frontend && npm run dev` to view the map")


def create_teams_file(teams):
    """Create teams.json from CSV data"""
    # Simplified team data for frontend (just what map needs)
    teams_output = [
        {
            'id': team['id'],
            'name': team['school'],
            'fullName': team['name'],
            'city': team['city'],
            'state': team['state']
        }
        for team in teams
    ]

    save_teams(teams_output)
    print(f"  ✓ Created teams.json with {len(teams_output)} teams")


def create_ownership_file(teams):
    """
    Generate ownership.json from county GeoJSON
    Assigns each county to nearest team based on campus location
    """
    geojson_path = Path(__file__).parent.parent / 'frontend' / 'public' / 'data' / 'us-counties.geojson'

    with open(geojson_path, 'r') as f:
        geojson = json.load(f)

    features = geojson.get('features', [])
    print(f"  📊 Processing {len(features)} counties...")

    # Get team locations
    team_locations = get_team_locations()

    # Calculate centroids and assign to nearest team
    ownership = {}
    team_stats = {}  # Track counties and area per team

    for i, feature in enumerate(features, 1):
        fips = feature.get('id')
        geometry = feature.get('geometry', {})
        properties = feature.get('properties', {})

        if not fips:
            continue

        try:
            # Calculate county centroid
            centroid_lat, centroid_lon = calculate_centroid(geometry['coordinates'])

            # Find nearest team
            nearest_team = None
            shortest_distance = float('inf')

            for team_id, location in team_locations.items():
                distance = calculate_distance(
                    centroid_lat, centroid_lon,
                    location['lat'], location['lon']
                )

                if distance < shortest_distance:
                    shortest_distance = distance
                    nearest_team = team_id

            if nearest_team:
                ownership[fips] = nearest_team

                # Track stats
                if nearest_team not in team_stats:
                    team_stats[nearest_team] = {'counties': 0, 'area': 0}

                team_stats[nearest_team]['counties'] += 1
                team_stats[nearest_team]['area'] += properties.get('CENSUSAREA', 0)

        except Exception as e:
            print(f"  ⚠️  Skipping {fips}: {e}")
            continue

        if i % 500 == 0:
            print(f"  ⏳ Processed {i} / {len(features)} counties...")

    save_ownership(ownership)

    print(f"\n  ✓ Assigned {len(ownership)} counties to {len(team_stats)} teams")
    print(f"\n  📊 Top 10 teams by land area (square miles):")

    for team_id, stats in sorted(team_stats.items(), key=lambda x: x[1]['area'], reverse=True)[:10]:
        # Find team name
        team = next((t for t in teams if t['id'] == team_id), None)
        team_name = team['school'] if team else team_id
        area_formatted = f"{stats['area']:,.0f}"
        print(f"     {team_name.ljust(25)} {area_formatted.rjust(10)} sq mi ({stats['counties']} counties)")

    print(f"\n  📊 Top 10 teams by county count:")

    for team_id, stats in sorted(team_stats.items(), key=lambda x: x[1]['counties'], reverse=True)[:10]:
        team = next((t for t in teams if t['id'] == team_id), None)
        team_name = team['school'] if team else team_id
        area_formatted = f"{stats['area']:,.0f}"
        print(f"     {team_name.ljust(25)} {str(stats['counties']).rjust(3)} counties ({area_formatted} sq mi)")

    total_area = sum(s['area'] for s in team_stats.values())
    print(f"\n  📈 Total US land area: {total_area:,.0f} square miles")
    print(f"  📈 Average per team: {total_area / len(team_stats):,.0f} square miles")


if __name__ == '__main__':
    main()
