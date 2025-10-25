# Campus Logo Implementation

## Overview

Implemented campus-based logo rendering where team logos appear at fixed campus locations (from `team_locs.csv`). When a team conquers another team's territory, the conquering team's logo **replaces** the conquered team's logo at that campus location.

## Key Concept

- **Logo positions are fixed** at team campus locations (lat/lng from CSV)
- **Logos are replaceable** - when ownership changes, logos swap at the same position
- **Teams can have multiple logos** - one at each campus they control

## How It Works

### Example: Ohio State beats Michigan

**Week 0 (Baseline):**
- Ohio State campus (Columbus): **Ohio State logo**
- Michigan campus (Ann Arbor): **Michigan logo**

**Week 1 (After Ohio State wins):**
- Ohio State campus (Columbus): **Ohio State logo** *(unchanged position)*
- Michigan campus (Ann Arbor): **Ohio State logo** *(same position, different logo!)*

The Michigan campus location stays at (42.27, -83.73), but the logo changes from Michigan to Ohio State.

## Implementation Details

### Backend

#### 1. New Module: `backend/lib/region_calculator.py`

**Function:** `calculate_campus_logos(baseline_ownership, current_ownership, teams)`

**Logic:**
1. For each team's campus, get their baseline counties (from week 0)
2. Count who currently owns the majority of those baseline counties
3. Display that team's logo at the campus location

**Example:**
- Akron campus has 12 baseline counties
- Week 0: Akron owns all 12 → Akron logo
- Week 1: Wyoming owns all 12 → Wyoming logo at Akron campus

#### 2. Modified: `backend/apply_transfers.py`

**Changes:**
- Import `calculate_campus_logos` from region_calculator
- Store baseline ownership separately (never changes)
- After each week's games, calculate which logos appear at each campus
- Save to `ownership/<season>/week-XX-logos.json`

**Files Generated:**
- `week-00-logos.json` - Baseline (all teams show their own logo)
- `week-01-logos.json` - After week 1 games (some logos replaced)
- `week-XX-logos.json` - Subsequent weeks

### Frontend

#### Modified: `frontend/src/components/Map.tsx`

**Changes:**
- Fetch `week-XX-logos.json` instead of `week-XX-centroids.json`
- Logo data structure matches campus positions with current owner
- Markers stay at campus positions, only logo images swap

**Data Flow:**
1. User selects Week X
2. Fetch `/data/ownership/2025/week-0X-logos.json`
3. Remove old markers
4. Create new markers at same campus positions with updated logos
5. Teams that conquered multiple campuses appear multiple times

## Data Structure

### Logo File Format (`week-XX-logos.json`)

```json
[
  {
    "campusTeamId": "akron",
    "campusName": "Akron",
    "latitude": 41.0732,
    "longitude": -81.5179,
    "currentOwnerId": "wyoming",
    "currentOwnerName": "Wyoming",
    "logoUrl": "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/2751.png",
    "countiesOwned": 12,
    "totalCounties": 12
  },
  {
    "campusTeamId": "alabama",
    "campusName": "Alabama",
    "latitude": 33.2098,
    "longitude": -87.5692,
    "currentOwnerId": "florida-state",
    "currentOwnerName": "Florida State",
    "logoUrl": "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/52.png",
    "countiesOwned": 10,
    "totalCounties": 10
  }
]
```

**Fields:**
- `campusTeamId` - The team whose campus this is (never changes)
- `latitude/longitude` - Campus position from CSV (never changes)
- `currentOwnerId` - Team that currently controls this campus
- `logoUrl` - Current owner's logo to display
- `countiesOwned/totalCounties` - How many of the campus's baseline counties are owned

## File Structure

```
frontend/public/data/ownership/2025/
├── week-00.json              # Ownership data
├── week-00-logos.json        # Campus logos (44KB) - all teams own their own campus
├── week-01.json
├── week-01-logos.json        # (44KB) - some campuses conquered
├── week-02.json
├── week-02-logos.json        # (44KB)
└── ...
```

## Testing Results

Verified with 2025 season data:

**Week 0 → Week 1 Changes:**
- ✅ Akron campus: Akron logo → Wyoming logo
- ✅ Alabama campus: Alabama logo → Florida State logo
- ✅ Michigan campus: Unchanged (Michigan still owns it)
- ✅ Campus positions: Fixed (lat/lng never changes)

**Statistics:**
- 135 campuses total
- File size: ~44KB per week (consistent)
- Backend processing: ~25 seconds for full season (10 weeks)

## Benefits

1. **Fixed Positions**: Logos always at recognizable campus locations
2. **Clear Conquests**: Users see which campuses have been conquered
3. **Multiple Appearances**: Dominant teams can appear at many campuses
4. **Simple Logic**: Based on team_locs.csv - no complex centroid calculation
5. **Accurate Representation**: Shows actual territorial control

## Comparison to Previous Approach

### Old Approach (Territory Centroids)
- Logo position = centroid of team's current territory
- Logos **move** when territory is conquered
- Complex spherical geometry calculations
- File size decreases as teams are eliminated

### New Approach (Campus Logos)
- Logo position = fixed campus location from CSV
- Logos **swap** when territory is conquered
- Simple majority ownership calculation
- Consistent file size (~44KB per week)

## Example Scenarios

### Scenario 1: Total Conquest
- Ohio State beats Michigan (week 1)
- Michigan owns 3 baseline counties
- Ohio State now owns all 3
- **Result:** Ohio State logo at Michigan campus

### Scenario 2: Partial Control
- Team A's campus has 10 baseline counties
- Team B owns 6, Team C owns 4
- **Result:** Team B logo (majority owner)

### Scenario 3: Dominant Team
- Ohio State conquers Michigan, Penn State, and Purdue
- **Result:** Ohio State logo appears at 4 campuses:
  - Ohio State campus (home)
  - Michigan campus
  - Penn State campus
  - Purdue campus

## Future Enhancements

1. **Contested Campus Indicator**: Visual cue when ownership is split (e.g., 6/10 counties)
2. **Logo Animations**: Fade/swap effect when logos change
3. **Conquest History**: Tooltip showing campus conquest history
4. **Size Based on Control**: Logo size based on % of counties owned
5. **Ghost Logo**: Faded original team logo behind conquering team's logo

## Documentation Updated

- ✅ Updated `backend/README.md` - Added region_calculator module
- ✅ Updated `apply_transfers.py` docs - Logo generation process
- ✅ Created `CAMPUS_LOGO_IMPLEMENTATION.md` - This file
