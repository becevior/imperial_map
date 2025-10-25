# Logo Update Approaches - Attempted Solutions

## Problem Statement
When users change the season/week selector, county colors update correctly to reflect ownership changes, but team logos remain static at their baseline positions. We need logos to reflect current ownership - showing logos only for teams that currently control territory.

## The Core Misunderstanding
Initially thought we needed to **recompute and move logos** to new centroid positions based on current ownership. This was wrong.

**Actual Requirement**: Keep logos at their **fixed home territory positions** (from baseline `territory-centroids.json`), but **show/hide them** based on whether teams currently own ANY territory.

---

## Approach 1: Dynamic Centroid Computation ❌

### What We Tried
- Backend: Create `lib/centroids.py` to compute area-weighted centroids from any ownership map
- Backend: Modify `apply_transfers.py` to generate `territory-centroids/{season}/week-{XX}.json` for each weekly snapshot
- Frontend: Fetch centroids for each week and rebuild all markers with new positions

### Why It Failed
1. **Wrong mental model**: Assumed logos should move to the center of conquered territory
2. **Misunderstood baseline centroids**: They're fixed at home territories, not dynamically computed
3. **Over-engineered**: Generated 9+ new centroid files per season unnecessarily
4. **TypeScript issues**: Python 3.9 doesn't support `Dict | None` union syntax, had to use `Optional[Dict]`
5. **Map constructor conflicts**: TypeScript confused `Map<K,V>` (JavaScript) with `maplibregl.Map`, required `globalThis.Map` workarounds

### Code Artifacts
- `backend/lib/centroids.py` (deleted)
- `backend/apply_transfers.py` modifications (reverted)
- `frontend/public/data/territory-centroids/2025/week-*.json` files (deleted)

---

## Approach 2: Filter Baseline Centroids by Ownership ❌

### What We Tried
- Keep baseline `territory-centroids.json` as-is (all 136 team logos at home positions)
- Frontend: Store baseline centroids once in `baselineCentroidsRef`
- Frontend: Create `updateMarkersForOwnership()` to filter centroids by teams that appear in current ownership map
- Show markers for teams with territory, hide markers for teams without

### Why It Failed
**Fundamental misunderstanding of the data model**:
- `territory-centroids.json` contains logos **positioned at each team's home territory**
- When a team conquers new territory far from home, we still showed their logo at their **home location**
- This doesn't visualize ownership changes - it just shows which teams are "in the game"

**Example of the problem**:
- Georgia starts with territory in Georgia (Southeast US)
- Georgia conquers all of Oregon (Northwest US)
- With this approach, Georgia's logo would still only appear in Georgia (home territory)
- The Oregon territory would show Georgia's color but no logo
- **User expectation**: Should see Georgia's logo in Oregon too (or instead)

### Why This Seems Logical But Isn't
- Baseline centroids are **anchor points** for teams, not territory markers
- Each entry in `territory-centroids.json` represents "Team X's home base"
- Multi-region entries (Alaska/mainland) are for teams whose HOME spans multiple regions, not conquered territory
- **The centroids file is static by design** - it defines where teams "are from", not what they control

---

## What We Actually Need (To Be Determined)

The correct approach likely involves:

1. **Computing territory centroids dynamically** based on current ownership
   - For each team in the ownership map, compute the centroid of ALL counties they own
   - If a team owns non-contiguous territory (e.g., Georgia owns both Georgia and Oregon), compute separate centroids for each contiguous region
   - Place logos at these computed positions

2. **OR: Use a different visualization paradigm**
   - Show logos at home territories but add visual indicators (lines, halos, etc.) for conquered territory
   - Use different logo sizes based on total territory owned
   - Some other approach that doesn't require dynamic centroid computation

3. **Key technical challenges**:
   - Computing contiguous regions from ownership map (requires spatial analysis of county adjacency)
   - Handling the Alaska/mainland split problem for conquered territories (not just home territories)
   - Performance: computing this on every ownership change might be expensive
   - Smooth transitions: logos suddenly appearing/disappearing in new locations might be jarring

---

## Why Dynamic Centroids Are Hard

To compute centroids correctly for current ownership, we'd need:

1. **Ownership map**: `{ [fips: string]: teamId }` ✅ (we have this)
2. **County geospatial data**: lat/lon and area for each FIPS ✅ (in `county-stats.json`)
3. **Contiguous region detection**: Group counties into separate territories if they're not adjacent
   - ❌ We don't have county adjacency data
   - Would need to compute this from polygon boundaries or use a pre-computed adjacency list
   - Example: If Georgia owns counties in Georgia AND Oregon, need to detect these are separate regions

4. **Centroid computation per region**: For each contiguous region, compute area-weighted centroid
   - ✅ Math exists (already implemented in `setup.py`)
   - But requires output from step 3

### Without adjacency data:
- We could compute ONE centroid per team across ALL their territory
- But if a team owns Georgia + Oregon, the centroid would be somewhere in the middle of the US (nonsensical)
- This is why Approach 1 was wrong even if we'd implemented it correctly

---

## Key Learnings

1. **baseline territory-centroids.json is NOT dynamic** - it represents team home positions, not current ownership
2. **Multi-region entries are for home territories only** - e.g., Air Force having separate Alaska/mainland entries because their recruiting territory spans both, not because they conquered both
3. **Showing logos requires spatial analysis** - can't just filter a static list, need to compute where territories actually are
4. **County adjacency is the missing piece** - without it, we can't properly handle non-contiguous conquered territories

---

## Questions to Answer Before Next Attempt

1. **What should happen when a team conquers non-adjacent territory?**
   - Show multiple logos (one per contiguous region)?
   - Show one logo at the "center of mass" of all territory (even if nonsensical)?
   - Show logo only at the largest territory region?

2. **Do we have or can we generate county adjacency data?**
   - Could parse GeoJSON polygon boundaries to detect shared borders
   - Could use a pre-computed adjacency graph
   - Could fetch from an API

3. **Is the dynamic logo movement even desirable?**
   - Would it be better to keep logos static and use other visual cues?
   - Size, color intensity, labels, etc.?

4. **Performance constraints?**
   - How expensive is it to recompute centroids on every ownership change?
   - Should we pre-compute and cache?

---

## Status
Both approaches abandoned. Need to clarify product requirements and data model before attempting again.
