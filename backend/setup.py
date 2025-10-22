#!/usr/bin/env python3
"""
Initialize data files from GeoJSON and team CSV.
Generates teams, territory ownership, and county metadata files.
"""
import csv
import json
from pathlib import Path
from typing import Dict
from lib.territory import calculate_centroid, calculate_distance
from lib.teams import load_teams_from_csv, get_team_locations
from lib.db import save_teams, save_ownership, save_json

# Mapping from state FIPS codes to USPS abbreviations (includes territories)
STATE_FIPS_TO_ABBR: Dict[str, str] = {
    '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO',
    '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI',
    '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
    '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN',
    '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
    '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
    '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
    '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA',
    '54': 'WV', '55': 'WI', '56': 'WY', '60': 'AS', '66': 'GU', '69': 'MP',
    '72': 'PR', '78': 'VI'
}


def main():
    print("🚀 Initializing data files for 136 FBS teams...\n")

    # Step 1: Load teams from CSV
    print("📋 Step 1: Loading teams from CSV...")
    teams = load_teams_from_csv()
    print(f"  ✓ Loaded {len(teams)} FBS teams")
    team_locations = get_team_locations(teams)

    # Step 2: Save teams.json
    print("\n💾 Step 2: Creating teams.json...")
    create_teams_file(teams)

    # Step 3: Calculate ownership from GeoJSON
    print("\n🗺️  Step 3: Processing county GeoJSON data...")
    print("📍 Step 4: Assigning counties to nearest teams...")
    county_stats = create_ownership_file(teams, team_locations)

    # Step 5: Persist county metadata for frontend use
    print("\n📊 Step 5: Saving county metadata for hover details...")
    create_county_stats_file(county_stats)

    print("\n✅ Initialization complete!")
    print("\nGenerated files:")
    print("  - frontend/public/data/teams.json")
    print("  - frontend/public/data/ownership.json")
    print("  - frontend/public/data/county-stats.json")
    print(f"\nCoverage: {len(teams)} teams assigned to 3,221 US counties")
    print("\nNext: Run `cd frontend && npm run dev` to view the map")


def create_teams_file(teams):
    """Create teams.json from CSV data."""
    teams_output = []

    for team in teams:
        nickname = None
        if team['fullName'].startswith(team['school']):
            nickname = team['fullName'][len(team['school']):].strip()
            nickname = nickname.lstrip('-').strip()
            nickname = nickname if nickname else None

        entry = {
            'id': team['id'],
            'name': team['school'],
            'shortName': team['shortName'],
            'fullName': team['fullName'],
            'nickname': nickname,
            'city': team['city'],
            'state': team['state'],
            'latitude': team['lat'],
            'longitude': team['lon'],
            'primaryColor': team['primaryColor'],
            'secondaryColor': team['secondaryColor'],
        }

        if team.get('conference'):
            entry['conference'] = team['conference']

        teams_output.append(entry)

    save_teams(teams_output)
    print(f"  ✓ Created teams.json with {len(teams_output)} teams")


def create_ownership_file(teams, team_locations):
    """
    Generate ownership.json from county GeoJSON
    Assigns each county to nearest team based on campus location
    """
    geojson_path = Path(__file__).parent.parent / 'frontend' / 'public' / 'data' / 'us-counties.geojson'

    with open(geojson_path, 'r') as f:
        geojson = json.load(f)

    features = geojson.get('features', [])
    print(f"  📊 Processing {len(features)} counties...")
    population_lookup = load_county_population()
    if not population_lookup:
        print("  ℹ️  No county population data found; population values will be empty.")

    # Calculate centroids and assign to nearest team
    ownership = {}
    team_stats = {}  # Track counties and area per team
    county_stats: Dict[str, Dict] = {}
    missing_population = 0

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

                area_sq_mi = properties.get('CENSUSAREA', 0)

                # Track stats
                if nearest_team not in team_stats:
                    team_stats[nearest_team] = {'counties': 0, 'area': 0}

                team_stats[nearest_team]['counties'] += 1
                team_stats[nearest_team]['area'] += area_sq_mi

                state_raw = properties.get('STATE')
                state_code = str(state_raw).zfill(2) if state_raw is not None else ''
                population_value = population_lookup.get(fips)
                if population_lookup and population_value is None:
                    missing_population += 1

                county_stats[fips] = {
                    'name': properties.get('NAME'),
                    'state': STATE_FIPS_TO_ABBR.get(state_code, state_code) if state_code else None,
                    'population': population_value,
                    'areaSqMi': area_sq_mi,
                    'centroid': {
                        'lat': centroid_lat,
                        'lon': centroid_lon
                    }
                }

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

    if population_lookup:
        print(f"  ℹ️  Missing population data for {missing_population} counties")

    return county_stats


def load_county_population() -> Dict[str, int]:
    """Load county population data from CSV if available."""
    csv_path = Path(__file__).parent / 'data' / 'county_population.csv'

    if not csv_path.exists():
        return {}

    population: Dict[str, int] = {}

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_fips = (row.get('FIPS') or row.get('fips') or '').strip()
            raw_population = row.get('Population') or row.get('population')

            if not raw_fips or raw_population is None:
                continue

            try:
                population[raw_fips.zfill(5)] = int(float(raw_population))
            except ValueError:
                continue

    return population


def create_county_stats_file(county_stats):
    """Persist derived county statistics to county-stats.json."""
    save_json('county-stats.json', county_stats)
    missing_population = sum(1 for data in county_stats.values() if data.get('population') is None)
    print(f"  ✓ Created county-stats.json with {len(county_stats)} counties")
    if missing_population:
        print(f"  ℹ️  Population unavailable for {missing_population} counties")


if __name__ == '__main__':
    main()
