"""
Territory assignment and geospatial utilities
"""
from typing import Dict, Tuple, List
from math import radians, sin, cos, sqrt, atan2

# Stadium locations for initial territory assignment
# TODO: Expand to all ~130 FBS teams
TEAM_STADIUM_LOCATIONS = {
    'alabama': {'lat': 33.2080, 'lon': -87.5502},
    'georgia': {'lat': 33.9496, 'lon': -83.3737},
    'michigan': {'lat': 42.2661, 'lon': -83.7487},
    'ohio-state': {'lat': 40.0017, 'lon': -83.0197},
    'texas': {'lat': 30.2833, 'lon': -97.7333},
    'oklahoma': {'lat': 35.2058, 'lon': -97.4426},
    'clemson': {'lat': 34.6774, 'lon': -82.8364},
    'notre-dame': {'lat': 41.7001, 'lon': -86.2379},
    'usc': {'lat': 34.0141, 'lon': -118.2879},
    'florida': {'lat': 29.6499, 'lon': -82.3487},
    'lsu': {'lat': 30.4118, 'lon': -91.1871},
    'wisconsin': {'lat': 43.0642, 'lon': -89.4012},
    'penn-state': {'lat': 40.8123, 'lon': -77.8560},
    'auburn': {'lat': 32.6010, 'lon': -85.4904},
    'oregon': {'lat': 44.0582, 'lon': -123.0685},
    'washington': {'lat': 47.6508, 'lon': -122.3048},
    'miami': {'lat': 25.7617, 'lon': -80.1918},
    'stanford': {'lat': 37.4344, 'lon': -122.1598},
    'nebraska': {'lat': 40.8136, 'lon': -96.7026},
    'tennessee': {'lat': 35.9549, 'lon': -83.9255}
}


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate geodesic distance between two points using Haversine formula
    Returns distance in kilometers
    """
    R = 6371  # Earth's radius in km

    lat1_rad, lon1_rad = radians(lat1), radians(lon1)
    lat2_rad, lon2_rad = radians(lat2), radians(lon2)

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = sin(dlat/2)**2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))

    return R * c


def calculate_centroid(coordinates) -> Tuple[float, float]:
    """
    Calculate centroid of a polygon or multipolygon
    Returns (lat, lon) tuple
    """
    total_lat = 0.0
    total_lon = 0.0
    point_count = 0

    # Handle both Polygon and MultiPolygon
    # Polygon: [[[lon, lat], ...]]
    # MultiPolygon: [[[[lon, lat], ...]], ...]

    def is_multipolygon(coords):
        return isinstance(coords[0][0][0], list)

    polygons = coordinates if is_multipolygon(coordinates) else [coordinates]

    for polygon in polygons:
        for ring in polygon:
            for lon, lat in ring:
                total_lat += lat
                total_lon += lon
                point_count += 1

    if point_count == 0:
        raise ValueError("No points found in geometry")

    return (total_lat / point_count, total_lon / point_count)


def assign_initial_ownership(
    counties: List[Dict[str, any]]
) -> Dict[str, str]:
    """
    Assign counties to nearest team based on stadium locations

    Args:
        counties: List of dicts with 'fips', 'centroid_lat', 'centroid_lon'

    Returns:
        Dict mapping FIPS code -> team_id
    """
    assignments = {}

    for county in counties:
        fips = county['fips']
        county_lat = county['centroid_lat']
        county_lon = county['centroid_lon']

        nearest_team = None
        shortest_distance = float('inf')

        for team_id, stadium in TEAM_STADIUM_LOCATIONS.items():
            distance = calculate_distance(
                county_lat, county_lon,
                stadium['lat'], stadium['lon']
            )

            if distance < shortest_distance:
                shortest_distance = distance
                nearest_team = team_id

        assignments[fips] = nearest_team

    return assignments
