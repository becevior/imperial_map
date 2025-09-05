# Data Sources for US Counties

## US Counties GeoJSON Data

For the production version, you'll need complete US counties data. Here are the recommended sources:

### 1. US Census Bureau (Recommended)
- **Source**: [US Census Cartographic Boundary Files](https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html)
- **Format**: Shapefile → Convert to GeoJSON
- **Resolution**: 500k (simplified for web) or 5m (high detail)
- **URL**: `https://www2.census.gov/geo/tiger/GENZ2022/shp/cb_2022_us_county_500k.zip`

### 2. Natural Earth (Alternative)
- **Source**: [Natural Earth Admin 2 Counties](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/)
- **Format**: Shapefile → Convert to GeoJSON
- **Resolution**: 1:50m scale
- **Pros**: Already simplified for web use

### 3. Ready-to-use GeoJSON
- **Source**: [US Atlas TopoJSON](https://github.com/topojson/us-atlas)
- **Command**: `npx us-atlas counties > counties.json`
- **Format**: Already in JSON format

## Processing Steps

1. **Download the data**:
   ```bash
   wget https://www2.census.gov/geo/tiger/GENZ2022/shp/cb_2022_us_county_500k.zip
   unzip cb_2022_us_county_500k.zip
   ```

2. **Convert to GeoJSON** (using ogr2ogr):
   ```bash
   ogr2ogr -f GeoJSON -t_srs EPSG:4326 counties.geojson cb_2022_us_county_500k.shp
   ```

3. **Simplify geometry** (optional, using mapshaper):
   ```bash
   npx mapshaper counties.geojson -simplify 0.1% -o counties-simplified.geojson
   ```

4. **Extract required fields**:
   - `GEOID` → `fips` (5-digit FIPS code)
   - `NAME` → `name` (County name)
   - `STATEFP` → `state` (2-digit state FIPS)

## FBS Team Stadium Locations

For initial territory assignment, you'll need accurate stadium coordinates for all ~130 FBS teams.

### Sources:
1. **CollegeFootballData API**: `/venues` endpoint
2. **Manual compilation**: Wikipedia + Google Maps coordinates
3. **Sports databases**: ESPN, CBS Sports facility data

### Format:
```typescript
export const TEAM_STADIUM_LOCATIONS = {
  'team-id': { lat: number, lon: number },
  // ... 130+ teams
}
```

## Data Processing Pipeline

1. **Load counties** → Simplify geometry → Calculate centroids
2. **Load team locations** → Calculate distances → Assign initial ownership
3. **Store in database** → Index for fast queries → Serve via API

## Performance Considerations

- **File size**: Target ~5-10MB after gzip compression
- **Simplification**: Remove unnecessary detail while preserving shape
- **Chunking**: Consider splitting by state for lazy loading
- **Caching**: Use CDN for static GeoJSON files