#!/usr/bin/env python3
"""
Initialize data files from GeoJSON and team CSV.
Generates teams, territory ownership, and county metadata files.
"""
import argparse
import csv
import json
from math import atan2, cos, radians, sin, sqrt, degrees
from pathlib import Path
from typing import Dict, Optional, Sequence
from lib.territory import calculate_centroid, calculate_distance
from lib.teams import (
    get_team_locations,
    load_all_teams,
    load_teams_for_season,
    load_teams_from_csv,
)
from lib.db import load_json, save_teams, save_ownership, save_json
from lib.leaderboard_calculator import generate_leaderboard
from lib.region_calculator import calculate_territory_logos

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
CURRENT_SEASON = 2026


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Initialize imperial map baseline data')
    parser.add_argument(
        '--season',
        type=int,
        default=None,
        help='Also seed a preseason snapshot for this season (e.g. 2026)',
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None):
    args = parse_args(argv)
    persist_current_files = args.season is None or args.season == CURRENT_SEASON

    # Step 1: Load teams from CSV
    print("📋 Step 1: Loading teams from CSV...")
    teams = (
        load_teams_for_season(args.season)
        if args.season is not None
        else load_teams_from_csv()
    )
    print(f"  ✓ Loaded {len(teams)} FBS teams")
    team_locations = get_team_locations(teams)

    # Step 2: Save teams.json
    print("\n💾 Step 2: Creating teams.json...")
    create_teams_file(
        teams,
        season=args.season,
        persist_root=persist_current_files,
    )
    if persist_current_files:
        create_teams_file(load_all_teams(), output_path='teams-all.json')

    # Step 3: Calculate ownership from GeoJSON
    print("\n🗺️  Step 3: Processing county GeoJSON data...")
    print("📍 Step 4: Assigning counties to nearest teams...")
    ownership, county_stats, territory_centroids = create_ownership_file(
        teams,
        team_locations,
        persist_root=persist_current_files,
    )

    # Step 5: Persist county metadata for frontend use
    print("\n📊 Step 5: Saving county metadata for hover details...")
    create_county_stats_file(county_stats)

    # Step 6: Persist territory centroid data for logo placement
    print("\n📌 Step 6: Saving territory centroids for map markers...")
    create_territory_centroids_file(
        territory_centroids,
        season=args.season,
        persist_root=persist_current_files,
    )

    if args.season is not None:
        print(f"\n🏈 Step 7: Seeding the {args.season} preseason snapshot...")
        initialize_season_snapshot(
            args.season,
            teams,
            ownership,
            county_stats,
            territory_centroids,
        )

    print("\n✅ Initialization complete!")
    print("\nGenerated files:")
    print("  - frontend/public/data/county-stats.json")
    if args.season is not None:
        print(f"  - frontend/public/data/teams/{args.season}.json")
        print(f"  - frontend/public/data/territory-centroids/{args.season}.json")
        print(f"  - frontend/public/data/ownership/{args.season}/week-00.json")
        print(f"  - frontend/public/data/leaderboards/{args.season}/week-00.json")
    if persist_current_files:
        print("  - frontend/public/data/teams.json")
        print("  - frontend/public/data/teams-all.json")
        print("  - frontend/public/data/ownership.json")
        print("  - frontend/public/data/territory-centroids.json")
    print(
        f"\nCoverage: {len(teams)} teams assigned to "
        f"{len(ownership):,} mapped US counties"
    )
    print("\nNext: Run `cd frontend && npm run dev` to view the map")


def initialize_season_snapshot(
    season: int,
    teams,
    ownership: Dict[str, str],
    county_stats: Dict[str, Dict],
    territory_centroids,
) -> None:
    """Create a new season's baseline without deleting historical snapshots."""
    baseline_entry = {
        'weekIndex': 0,
        'week': 0,
        'seasonType': 'baseline',
        'label': f'{season} Baseline (Preseason)',
        'path': f'/data/ownership/{season}/week-00.json',
    }

    save_json(f'ownership/{season}/week-00.json', ownership)
    logos = calculate_territory_logos(
        ownership,
        ownership,
        teams,
        territory_centroids,
    )
    save_json(f'ownership/{season}/week-00-logos.json', logos)

    try:
        ownership_index = load_json('ownership/index.json')
    except FileNotFoundError:
        ownership_index = {'seasons': []}

    seasons = [
        entry
        for entry in ownership_index.get('seasons', [])
        if int(entry.get('season', 0)) != season
    ]
    seasons.append({'season': season, 'teamCount': len(teams), 'weeks': [baseline_entry]})
    seasons.sort(key=lambda entry: int(entry.get('season', 0)))
    save_json('ownership/index.json', {'seasons': seasons})

    try:
        load_json(f'games/{season}/index.json')
    except FileNotFoundError:
        save_json(f'games/{season}/index.json', {'season': season, 'weeks': []})

    generate_leaderboard(
        season,
        baseline_entry,
        ownership,
        teams,
        county_stats,
        [],
    )
    print(f"  ✓ Seeded {season} baseline ownership, logos, and leaderboards")


def create_teams_file(
    teams,
    season: Optional[int] = None,
    persist_root: bool = False,
    output_path: Optional[str] = None,
):
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
            'logoUrl': team.get('logoUrl'),
        }

        if team.get('conference'):
            entry['conference'] = team['conference']

        teams_output.append(entry)

    if output_path:
        save_json(output_path, teams_output)
        print(f"  ✓ Created {output_path} with {len(teams_output)} teams")
        return teams_output

    if season is not None:
        save_json(f'teams/{season}.json', teams_output)
    if persist_root or season is None:
        save_teams(teams_output)
    destination = f'teams/{season}.json' if season is not None else 'teams.json'
    print(f"  ✓ Created {destination} with {len(teams_output)} teams")
    return teams_output


def create_ownership_file(teams, team_locations, persist_root: bool = True):
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
    territory_vectors: Dict[str, Dict[str, float]] = {}
    territory_counties: Dict[str, list] = {}
    missing_population = 0

    for i, feature in enumerate(features, 1):
        fips = feature.get('id')
        geometry = feature.get('geometry', {})
        properties = feature.get('properties', {})

        if not fips:
            continue

        state_raw = properties.get('STATE')
        state_code = str(state_raw).zfill(2) if state_raw is not None else ''

        if state_code == '72':  # Skip Puerto Rico counties
            continue

        if state_code == '02':  # Skip Alaska counties
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
                    team_stats[nearest_team] = {'counties': 0, 'area': 0.0}

                team_stats[nearest_team]['counties'] += 1
                team_stats[nearest_team]['area'] += area_sq_mi

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

                # Accumulate spherical vectors for territory centroid
                weight = area_sq_mi if area_sq_mi and area_sq_mi > 0 else 1.0
                lat_rad = radians(centroid_lat)
                lon_rad = radians(centroid_lon)

                vector = territory_vectors.setdefault(nearest_team, {
                    'x': 0.0,
                    'y': 0.0,
                    'z': 0.0,
                    'weight': 0.0
                })

                vector['x'] += weight * cos(lat_rad) * cos(lon_rad)
                vector['y'] += weight * cos(lat_rad) * sin(lon_rad)
                vector['z'] += weight * sin(lat_rad)
                vector['weight'] += weight

                territory_counties.setdefault(nearest_team, []).append({
                    'fips': fips,
                    'lat': centroid_lat,
                    'lon': centroid_lon,
                    'area': area_sq_mi,
                    'state': state_code
                })

        except Exception as e:
            print(f"  ⚠️  Skipping {fips}: {e}")
            continue

        if i % 500 == 0:
            print(f"  ⏳ Processed {i} / {len(features)} counties...")

    if persist_root:
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

    territory_centroids = build_territory_centroids(
        teams,
        team_stats,
        territory_vectors,
        territory_counties
    )

    return ownership, county_stats, territory_centroids


def build_territory_centroids(teams, team_stats, territory_vectors, territory_counties):
    """Compute territory centroid per team, handling Alaska/mainland splits."""

    def summarize_cluster(counties):
        if not counties:
            return None

        total_weight = 0.0
        total_area = 0.0
        sum_x = 0.0
        sum_y = 0.0
        sum_z = 0.0

        for county in counties:
            area = county.get('area') or 0.0
            weight = area if area > 0 else 1.0
            lat_rad = radians(county['lat'])
            lon_rad = radians(county['lon'])

            sum_x += weight * cos(lat_rad) * cos(lon_rad)
            sum_y += weight * cos(lat_rad) * sin(lon_rad)
            sum_z += weight * sin(lat_rad)
            total_weight += weight
            total_area += area

        if total_weight == 0:
            return None

        avg_x = sum_x / total_weight
        avg_y = sum_y / total_weight
        avg_z = sum_z / total_weight

        hyp = sqrt(avg_x * avg_x + avg_y * avg_y)
        centroid_lat = degrees(atan2(avg_z, hyp))
        centroid_lon = degrees(atan2(avg_y, avg_x))
        centroid_lon = ((centroid_lon + 180) % 360) - 180

        # Choose the county closest to the centroid as the anchor
        best = None
        for county in counties:
            distance = calculate_distance(
                centroid_lat,
                centroid_lon,
                county['lat'],
                county['lon']
            )

            if best is None or distance < best['distance']:
                best = {
                    'lat': county['lat'],
                    'lon': county['lon'],
                    'fips': county['fips'],
                    'distance': distance
                }

        return {
            'centroid_lat': centroid_lat,
            'centroid_lon': centroid_lon,
            'anchor_lat': best['lat'] if best else centroid_lat,
            'anchor_lon': best['lon'] if best else centroid_lon,
            'anchor_fips': best['fips'] if best else None,
            'area': total_area,
            'county_count': len(counties)
        }

    centroids = []

    for team in teams:
        team_id = team['id']
        stats = team_stats.get(team_id, {'counties': 0, 'area': 0.0})
        counties_for_team = territory_counties.get(team_id, [])

        alaska_counties = [c for c in counties_for_team if c.get('state') == '02']
        mainland_counties = [c for c in counties_for_team if c.get('state') != '02']

        alaska_summary = summarize_cluster(alaska_counties)
        mainland_summary = summarize_cluster(mainland_counties)

        def make_entry(summary, region_tag=None):
            return {
                'teamId': team_id,
                'teamName': team['school'],
                'shortName': team['shortName'],
                'latitude': summary['anchor_lat'],
                'longitude': summary['anchor_lon'],
                'centroidLatitude': summary['centroid_lat'],
                'centroidLongitude': summary['centroid_lon'],
                'areaSqMi': summary['area'] if summary['area'] else stats.get('area', 0.0),
                'countyCount': summary['county_count'] if summary['county_count'] else stats.get('counties', 0),
                'logoUrl': team.get('logoUrl'),
                'anchorFips': summary['anchor_fips'],
                'region': region_tag,
                'totalAreaSqMi': stats.get('area', 0.0),
            }

        if mainland_summary:
            centroids.append(make_entry(mainland_summary, region_tag='mainland'))
        elif alaska_summary:
            centroids.append(make_entry(alaska_summary, region_tag='alaska'))
        else:
            # No counties assigned; fall back to campus
            centroids.append({
                'teamId': team_id,
                'teamName': team['school'],
                'shortName': team['shortName'],
                'latitude': team['lat'],
                'longitude': team['lon'],
                'centroidLatitude': team['lat'],
                'centroidLongitude': team['lon'],
                'areaSqMi': stats.get('area', 0.0),
                'countyCount': stats.get('counties', 0),
                'logoUrl': team.get('logoUrl'),
                'anchorFips': None,
                'region': None,
                'totalAreaSqMi': stats.get('area', 0.0),
            })

        if mainland_summary and alaska_summary:
            centroids.append(make_entry(alaska_summary, region_tag='alaska'))

    centroids.sort(key=lambda entry: (entry['teamName'], entry.get('region') or ''))
    return centroids


def create_territory_centroids_file(
    territory_centroids,
    season: Optional[int] = None,
    persist_root: bool = True,
):
    """Persist territory centroids for frontend map markers."""
    if season is not None:
        save_json(f'territory-centroids/{season}.json', territory_centroids)
    if persist_root:
        save_json('territory-centroids.json', territory_centroids)
    active = sum(1 for entry in territory_centroids if entry.get('countyCount', 0) > 0)
    print(f"  ✓ Created territory-centroids.json with {active} active teams")


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
