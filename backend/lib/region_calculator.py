"""
Calculate territory-based logo ownership.
Each baseline territory has a fixed centroid position; only the team logo changes based on ownership.
"""
from typing import Dict, List
import json
from pathlib import Path


def calculate_territory_logos(
    baseline_ownership: Dict[str, str],
    current_ownership: Dict[str, str],
    teams: List[Dict],
    baseline_centroids: List[Dict]
) -> List[Dict]:
    """
    Calculate which team's logo should appear at each baseline territory centroid.

    Logic: For each baseline territory (from week 0), find which team currently owns
    the majority of that territory's counties. Display that team's logo at the
    territory's fixed centroid position.

    Args:
        baseline_ownership: Week 0 ownership (FIPS -> team_id) - defines territories
        current_ownership: Current week ownership (FIPS -> team_id)
        teams: List of team dicts with metadata
        baseline_centroids: Baseline territory centroids (from territory-centroids.json)

    Returns:
        List of logo markers with fixed centroid positions and current owner's logo
    """
    # Build reverse index: team_id -> baseline counties
    territory_counties: Dict[str, List[str]] = {}
    for fips, team_id in baseline_ownership.items():
        territory_counties.setdefault(team_id, []).append(fips)

    # Build team lookup for logos
    teams_by_id = {team['id']: team for team in teams}

    logos = []

    for centroid in baseline_centroids:
        baseline_team_id = centroid['teamId']
        baseline_counties = territory_counties.get(baseline_team_id, [])

        # Skip if this territory has no baseline counties
        if not baseline_counties:
            continue

        # Filter counties by region if applicable (mainland vs alaska)
        region_tag = centroid.get('region')
        if region_tag == 'alaska':
            # This is an Alaska territory - only count Alaska counties
            # We'd need state info, but for now use all counties for this team
            region_counties = baseline_counties
        elif region_tag == 'mainland':
            # This is mainland territory
            region_counties = baseline_counties
        else:
            region_counties = baseline_counties

        if not region_counties:
            continue

        # Count who owns this territory's counties now
        owner_counts: Dict[str, int] = {}
        for fips in region_counties:
            current_owner = current_ownership.get(fips)
            if current_owner:
                owner_counts[current_owner] = owner_counts.get(current_owner, 0) + 1

        # Skip if no one owns these counties (shouldn't happen)
        if not owner_counts:
            continue

        # The team that owns the most counties gets their logo shown
        controlling_team_id = max(owner_counts.items(), key=lambda x: x[1])[0]
        controlling_team = teams_by_id.get(controlling_team_id, {})

        logos.append({
            'territoryId': f"{baseline_team_id}-{region_tag or 'main'}",
            'baselineTeamId': baseline_team_id,
            'baselineTeamName': centroid.get('teamName'),
            'latitude': centroid['latitude'],
            'longitude': centroid['longitude'],
            'region': region_tag,
            'currentOwnerId': controlling_team_id,
            'currentOwnerName': controlling_team.get('school') or controlling_team.get('name'),
            'logoUrl': controlling_team.get('logoUrl'),
            'countiesOwned': owner_counts[controlling_team_id],
            'totalCounties': len(region_counties),
            'areaSqMi': centroid.get('areaSqMi', 0)
        })

    return logos


def calculate_region_ownership(
    regions: List[Dict],
    current_ownership: Dict[str, str],
    teams_by_id: Dict[str, Dict]
) -> Dict[str, Dict]:
    """
    Determine which team owns each region based on current ownership.

    A region is owned by whichever team controls the majority of its counties.

    Args:
        regions: List of region dicts with county lists
        current_ownership: Current ownership map (FIPS -> team_id)
        teams_by_id: Dict of team_id -> team dict (for logo URLs)

    Returns:
        Dict mapping region_id -> {currentOwnerId, logoUrl, countyCount, ownershipPct}
    """
    region_ownership = {}

    for region in regions:
        region_id = region['regionId']
        region_counties = region['counties']

        if not region_counties:
            continue

        # Count which team owns the most counties in this region
        owner_counts: Dict[str, int] = {}
        for fips in region_counties:
            owner = current_ownership.get(fips)
            if owner:
                owner_counts[owner] = owner_counts.get(owner, 0) + 1

        if not owner_counts:
            # No owner for this region
            continue

        # Region is owned by team with most counties
        current_owner = max(owner_counts.items(), key=lambda x: x[1])[0]
        owned_count = owner_counts[current_owner]
        total_count = len(region_counties)

        team = teams_by_id.get(current_owner, {})

        region_ownership[region_id] = {
            'currentOwnerId': current_owner,
            'logoUrl': team.get('logoUrl'),
            'countyCount': owned_count,
            'totalCounties': total_count,
            'ownershipPct': round(owned_count / total_count * 100, 1) if total_count > 0 else 0
        }

    return region_ownership
