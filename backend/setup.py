#!/usr/bin/env python3
"""
Initialize data files from GeoJSON
Generates teams.json and ownership.json
"""
import json
from pathlib import Path
from lib.territory import calculate_centroid, assign_initial_ownership, TEAM_STADIUM_LOCATIONS
from lib.db import save_teams, save_ownership


def main():
    print("🚀 Initializing data files...\n")

    # Step 1: Generate teams.json from stadium locations
    print("📋 Step 1: Creating teams.json...")
    create_teams_file()

    # Step 2: Calculate ownership from GeoJSON
    print("\n🗺️  Step 2: Processing county data...")
    print("📍 Step 3: Assigning initial ownership...")
    create_ownership_file()

    print("\n✅ Initialization complete!")
    print("\nGenerated files:")
    print("  - frontend/public/data/teams.json")
    print("  - frontend/public/data/ownership.json")
    print("\nNext: Run `cd frontend && npm run dev` to view the map")


def create_teams_file():
    """Create teams.json from TEAM_STADIUM_LOCATIONS"""
    teams = [
        {
            'id': 'alabama',
            'name': 'Alabama',
            'conference': 'SEC',
            'color': '#9E1B32'
        },
        {
            'id': 'georgia',
            'name': 'Georgia',
            'conference': 'SEC',
            'color': '#BA0C2F'
        },
        {
            'id': 'michigan',
            'name': 'Michigan',
            'conference': 'Big Ten',
            'color': '#00274C'
        },
        {
            'id': 'ohio-state',
            'name': 'Ohio State',
            'conference': 'Big Ten',
            'color': '#BB0000'
        },
        {
            'id': 'texas',
            'name': 'Texas',
            'conference': 'SEC',
            'color': '#BF5700'
        },
        {
            'id': 'oklahoma',
            'name': 'Oklahoma',
            'conference': 'SEC',
            'color': '#841617'
        },
        {
            'id': 'clemson',
            'name': 'Clemson',
            'conference': 'ACC',
            'color': '#F66733'
        },
        {
            'id': 'notre-dame',
            'name': 'Notre Dame',
            'conference': 'Independent',
            'color': '#0C2340'
        },
        {
            'id': 'usc',
            'name': 'USC',
            'conference': 'Big Ten',
            'color': '#990000'
        },
        {
            'id': 'florida',
            'name': 'Florida',
            'conference': 'SEC',
            'color': '#0021A5'
        },
        {
            'id': 'lsu',
            'name': 'LSU',
            'conference': 'SEC',
            'color': '#461D7C'
        },
        {
            'id': 'wisconsin',
            'name': 'Wisconsin',
            'conference': 'Big Ten',
            'color': '#C5050C'
        },
        {
            'id': 'penn-state',
            'name': 'Penn State',
            'conference': 'Big Ten',
            'color': '#041E42'
        },
        {
            'id': 'auburn',
            'name': 'Auburn',
            'conference': 'SEC',
            'color': '#0C385B'
        },
        {
            'id': 'oregon',
            'name': 'Oregon',
            'conference': 'Big Ten',
            'color': '#154733'
        },
        {
            'id': 'washington',
            'name': 'Washington',
            'conference': 'Big Ten',
            'color': '#4B2E83'
        },
        {
            'id': 'miami',
            'name': 'Miami',
            'conference': 'ACC',
            'color': '#F47321'
        },
        {
            'id': 'stanford',
            'name': 'Stanford',
            'conference': 'ACC',
            'color': '#8C1515'
        },
        {
            'id': 'nebraska',
            'name': 'Nebraska',
            'conference': 'Big Ten',
            'color': '#E41C38'
        },
        {
            'id': 'tennessee',
            'name': 'Tennessee',
            'conference': 'SEC',
            'color': '#FF8200'
        }
    ]

    save_teams(teams)
    print(f"  ✓ Created teams.json with {len(teams)} teams")


def create_ownership_file():
    """Generate ownership.json from county GeoJSON"""
    geojson_path = Path(__file__).parent.parent / 'frontend' / 'public' / 'data' / 'us-counties.geojson'

    with open(geojson_path, 'r') as f:
        geojson = json.load(f)

    features = geojson.get('features', [])
    print(f"  📊 Processing {len(features)} counties...")

    # Calculate centroids
    counties = []
    for i, feature in enumerate(features, 1):
        fips = feature.get('id')
        geometry = feature.get('geometry', {})

        if not fips:
            continue

        try:
            centroid_lat, centroid_lon = calculate_centroid(geometry['coordinates'])
        except Exception as e:
            print(f"  ⚠️  Skipping {fips}: {e}")
            continue

        counties.append({
            'fips': fips,
            'centroid_lat': centroid_lat,
            'centroid_lon': centroid_lon
        })

        if i % 500 == 0:
            print(f"  ⏳ Processed {i} / {len(features)}...")

    # Assign ownership
    print(f"  🎯 Assigning {len(counties)} counties to nearest teams...")
    ownership = assign_initial_ownership(counties)

    # Show distribution
    distribution = {}
    for team_id in ownership.values():
        distribution[team_id] = distribution.get(team_id, 0) + 1

    save_ownership(ownership)

    print(f"  ✓ Created ownership.json")
    print(f"\n  📊 Territory distribution:")
    for team_id, count in sorted(distribution.items(), key=lambda x: x[1], reverse=True):
        print(f"     {team_id.ljust(15)} {count} counties")


if __name__ == '__main__':
    main()
