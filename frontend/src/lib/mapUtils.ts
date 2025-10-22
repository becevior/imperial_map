// Client-side map rendering utilities only

import type { MapFeatureCollection } from '@/types'

/**
 * Load county GeoJSON data for map rendering
 */
export async function loadCountiesGeoJSON(): Promise<MapFeatureCollection> {
  const response = await fetch('/data/us-counties.geojson')

  if (!response.ok) {
    throw new Error(`Failed to load counties data: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Process GeoJSON features by adding ownership data for map styling
 */
export function processCountiesForMap(
  geojson: MapFeatureCollection,
  ownershipData?: Record<string, string>
): MapFeatureCollection {
  return {
    ...geojson,
    features: geojson.features.map((feature: any) => {
      const fipsCode = feature.id as string
      return {
        ...feature,
        properties: {
          ...feature.properties,
          fips: fipsCode,
          name: feature.properties.NAME || feature.properties.name,
          ownerTeamId: ownershipData?.[fipsCode],
          area: feature.properties.CENSUSAREA || feature.properties.areaSqKm || 0
        }
      }
    })
  }
}
