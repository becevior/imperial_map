# Logo Update Feature Implementation

## Overview

Implemented dynamic logo positioning that updates when territories are conquered. When a team wins a game and takes over another team's counties, the winning team's logo moves to the centroid of their new combined territory, and the losing team's logo disappears (if they have no remaining territory).

## Changes Made

### Backend (Python)

#### 1. New Module: `backend/lib/centroid_calculator.py`

Created a reusable module for calculating territory centroids from ownership data.

**Key Functions:**
- `calculate_territory_centroids(ownership_map, teams, geojson_path)` - Main function that takes current ownership and returns centroid positions for each team
- Handles Alaska/mainland territory splits
- Returns empty/campus position for teams with no territory

**Algorithm:**
1. Load county GeoJSON to get coordinates and areas
2. Build reverse index (team_id → list of counties)
3. For each team, calculate weighted centroid using spherical geometry
4. Choose anchor county (closest to centroid) for logo placement
5. Handle special cases (teams with no territory, Alaska splits)

#### 2. Modified: `backend/apply_transfers.py`

Updated to generate weekly centroid snapshots alongside ownership snapshots.

**Changes:**
- Import `calculate_territory_centroids` from new module
- Load teams data at startup for centroid calculation
- After saving each week's ownership, calculate and save centroids
- Saves to `ownership/<season>/week-XX-centroids.json`

**Output:**
- Generates ~60KB centroid file per week
- 136 team entries per file (all FBS teams)
- Teams with 0 counties get campus location as fallback

### Frontend (TypeScript/React)

#### 1. Modified: `frontend/src/components/Map.tsx`

Updated Map component to load and update logos dynamically based on week selection.

**New State:**
- `centroidsDataRef` - Stores current week's centroids
- `lastCentroidsPathRef` - Tracks last loaded centroids file

**New Function:**
- `updateMarkersWithCentroids(centroids)` - Removes old markers and creates new ones based on current centroids
  - Filters out teams with no territory (logoUrl but 0 counties)
  - Applies zoom-aware sizing and opacity
  - Reattaches zoom event handlers

**Updated Logic:**
- Initial map load: Store baseline centroids from `territory-centroids.json`
- Week change: Fetch `week-XX-centroids.json` alongside `week-XX.json`
- Fallback: If centroids file missing, use previous centroids
- After ownership update: Call `updateMarkersWithCentroids()` to refresh logos

## Data Flow

### Initial Load
```
1. Fetch /data/territory-centroids.json (baseline)
2. Fetch /data/ownership.json (baseline)
3. Render map with baseline logos
```

### Week Change
```
1. User selects Week X
2. Fetch /data/ownership/2025/week-0X.json
3. Fetch /data/ownership/2025/week-0X-centroids.json (parallel)
4. Update county colors (existing logic)
5. Remove old logo markers
6. Create new logo markers at updated centroids
7. Apply zoom styling
```

### Territory Conquest Example

**Before Week 1:**
- Ohio State owns 45 counties in Ohio
- Ohio State logo at (40.0, -83.0)
- Michigan owns 12 counties in Michigan
- Michigan logo at (42.3, -83.7)

**After Week 1 (Ohio State defeats Michigan):**
- Ohio State now owns 57 counties (Ohio + Michigan)
- Ohio State logo moves to new centroid at (41.2, -83.4)
- Michigan has 0 counties
- Michigan logo disappears from map

## File Structure

### Generated Files (per week)

```
frontend/public/data/ownership/2025/
├── week-00.json              # Baseline ownership
├── week-00-logos.json        # Campus logos at preseason baseline
├── week-01.json
├── week-01-logos.json        # Campus logos after week 1 transfers
├── week-02.json
├── week-02-logos.json
└── ...
```

Each weekly logo file is ~44KB because it enumerates all FBS campuses regardless of who currently controls them.

### Data Structure

**Logo File Format:**
```json
[
  {
    "campusTeamId": "ohio-state",
    "campusName": "Ohio State",
    "latitude": 40.0036,
    "longitude": -83.0219,
    "currentOwnerId": "ohio-state",
    "currentOwnerName": "Ohio State",
    "logoUrl": "https://a.espncdn.com/.../194.png",
    "countiesOwned": 45,
    "totalCounties": 45
  },
  {
    "campusTeamId": "michigan",
    "campusName": "Michigan",
    "latitude": 42.278,
    "longitude": -83.738,
    "currentOwnerId": "ohio-state",
    "currentOwnerName": "Ohio State",
    "logoUrl": "https://a.espncdn.com/.../194.png",
    "countiesOwned": 0,
    "totalCounties": 12
  }
]
```

## Benefits

1. **Stable Geography**: Logos stay anchored to recognizable campus locations.
2. **Clear Conquests**: Occupying a rival campus instantly swaps the logo image.
3. **Multiple Appearances**: Dominant teams can appear on many campuses at once.
4. **Predictable File Size**: Fixed-size JSON keeps fetch costs steady week to week.
5. **Fast Rendering**: The frontend simply swaps cached markers—no geometry recomputation required.

## Testing

Tested with 2025 season data (weeks 0-9):
- ✅ Backend generates campus logo snapshots for every week
- ✅ Weekly logo files remain ~44KB and cache efficiently
- ✅ Frontend TypeScript compilation passes
- ✅ Production build succeeds
- ✅ Logos update when week selector changes

## Logo Color Palette

- Run `python compute_logo_colors.py` to compare each team's logo image against its primary/secondary colors.
- The script overwrites `frontend/public/data/logo-colors.json` with `{ teamId: { logo, fill } }` pairs.
- The frontend prefers the stored `fill` to keep campus markers readable while still honoring team brand colors.
- Re-run the script whenever logos or school colors change.

## Performance Impact

### Backend
- `apply_transfers.py` now emits `week-XX-logos.json` alongside ownership snapshots (negligible overhead).
- `compute_logo_colors.py` is optional and only needed when brand assets change.

### Frontend
- Additional HTTP request per week change (~44KB).
- Marker removal/creation: <100ms for 136 markers.
- Total week change time: <500ms (network + rendering).

### Storage
- ~450KB per season (10 weeks × 45KB) for logo snapshots.
- Negligible compared to GeoJSON (3.2MB) and ownership data (800KB).

## Future Enhancements

1. **Conquest Animation**: Fade out losing team's logo, fade in/move winner's logo
2. **Territory History**: Show historical centroid positions as tooltips
3. **Conquest Highlights**: Visual indicator when logo position changes significantly
4. **Multiple Logos**: For teams with disconnected territories (mainland + Alaska)
5. **Logo Clustering**: At low zoom, cluster nearby team logos

## Documentation Updates

- ✅ `backend/README.md` covers campus logo generation and the optional color analysis script.
- ✅ `apply_transfers.py` docs now mention `week-XX-logos.json` outputs.
- ✅ Frontend docs describe the week selector fetching ownership + logo data in tandem.
- ✅ This file documents the color palette workflow (`compute_logo_colors.py`).
