"""
Calculate territory centroids from ownership data.
Used to position team logos at the center of their controlled territory.
"""
import json
from math import atan2, cos, radians, sin, sqrt, degrees
from pathlib import Path
from typing import Dict, List, Optional
from lib.territory import calculate_distance


def calculate_territory_centroids(
    ownership_map: Dict[str, str],
    teams: List[Dict],
    geojson_path: Optional[Path] = None
) -> List[Dict]:
    """
    Calculate centroids for each team's territory based on current ownership.

    Args:
        ownership_map: Dict mapping FIPS codes to team IDs
        teams: List of team dicts with id, school, shortName, logoUrl, etc.
        geojson_path: Optional path to us-counties.geojson (defaults to frontend/public/data/)

    Returns:
        List of territory centroid dicts with teamId, latitude, longitude, logoUrl, etc.
    """
    if geojson_path is None:
        geojson_path = Path(__file__).parent.parent.parent / 'frontend' / 'public' / 'data' / 'us-counties.geojson'

    # Load GeoJSON to get county coordinates and areas
    with open(geojson_path, 'r') as f:
        geojson = json.load(f)

    features = geojson.get('features', [])

    # Build reverse index: team_id -> list of counties
    territory_counties: Dict[str, List[Dict]] = {}
    team_stats: Dict[str, Dict] = {}

    for feature in features:
        fips = feature.get('id')
        if not fips:
            continue

        # Skip Puerto Rico
        state_raw = feature.get('properties', {}).get('STATE')
        state_code = str(state_raw).zfill(2) if state_raw is not None else ''
        if state_code == '72':
            continue

        team_id = ownership_map.get(fips)
        if not team_id:
            continue

        geometry = feature.get('geometry', {})
        properties = feature.get('properties', {})

        try:
            # Calculate county centroid
            centroid_lat, centroid_lon = _calculate_centroid_from_geometry(geometry['coordinates'])
            area_sq_mi = properties.get('CENSUSAREA', 0)

            # Track stats
            if team_id not in team_stats:
                team_stats[team_id] = {'counties': 0, 'area': 0.0}

            team_stats[team_id]['counties'] += 1
            team_stats[team_id]['area'] += area_sq_mi

            # Store county info
            territory_counties.setdefault(team_id, []).append({
                'fips': fips,
                'lat': centroid_lat,
                'lon': centroid_lon,
                'area': area_sq_mi,
                'state': state_code
            })
        except Exception as e:
            # Skip invalid geometries
            continue

    # Build centroids for each team
    centroids = _build_territory_centroids(teams, team_stats, territory_counties)

    return centroids


def _calculate_centroid_from_geometry(coordinates):
    """
    Calculate centroid from GeoJSON geometry coordinates.
    Handles Polygon and MultiPolygon geometries.
    """
    from lib.territory import calculate_centroid
    return calculate_centroid(coordinates)


def _build_territory_centroids(teams, team_stats, territory_counties):
    """
    Compute territory centroid per team, handling Alaska/mainland splits.
    Adapted from setup.py's build_territory_centroids function.
    """

    def summarize_cluster(counties):
        """Calculate weighted centroid for a cluster of counties."""
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

        # Split into Alaska and mainland territories
        alaska_counties = [c for c in counties_for_team if c.get('state') == '02']
        mainland_counties = [c for c in counties_for_team if c.get('state') != '02']

        alaska_summary = summarize_cluster(alaska_counties)
        mainland_summary = summarize_cluster(mainland_counties)

        def make_entry(summary, region_tag=None):
            """Create a centroid entry from summary data."""
            return {
                'teamId': team_id,
                'teamName': team.get('school') or team.get('name'),
                'shortName': team.get('shortName'),
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

        # Add mainland territory (priority)
        if mainland_summary:
            centroids.append(make_entry(mainland_summary, region_tag='mainland'))
        elif alaska_summary:
            centroids.append(make_entry(alaska_summary, region_tag='alaska'))
        else:
            # No counties assigned; fall back to campus location
            centroids.append({
                'teamId': team_id,
                'teamName': team.get('school') or team.get('name'),
                'shortName': team.get('shortName'),
                'latitude': team.get('latitude') or team.get('lat'),
                'longitude': team.get('longitude') or team.get('lon'),
                'centroidLatitude': team.get('latitude') or team.get('lat'),
                'centroidLongitude': team.get('longitude') or team.get('lon'),
                'areaSqMi': stats.get('area', 0.0),
                'countyCount': stats.get('counties', 0),
                'logoUrl': team.get('logoUrl'),
                'anchorFips': None,
                'region': None,
                'totalAreaSqMi': stats.get('area', 0.0),
            })

        # If team has both mainland and Alaska territories, add separate Alaska entry
        if mainland_summary and alaska_summary:
            centroids.append(make_entry(alaska_summary, region_tag='alaska'))

    # Sort by team name and region
    centroids.sort(key=lambda entry: (entry['teamName'], entry.get('region') or ''))

    return centroids
