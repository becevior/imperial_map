// Data processing utilities for counties and territories

import type { County, MapFeatureCollection } from '@/types'

export async function loadCountiesGeoJSON(): Promise<MapFeatureCollection> {
  const response = await fetch('/data/us-counties.geojson')
  
  if (!response.ok) {
    throw new Error(`Failed to load counties data: ${response.statusText}`)
  }
  
  return response.json()
}

export function processCountiesForMap(
  geojson: MapFeatureCollection, 
  ownershipData?: Record<string, string>
): MapFeatureCollection {
  return {
    ...geojson,
    features: geojson.features.map(feature => {
      // FIPS code is in feature.id for the new dataset
      const fipsCode = feature.id as string
      return {
        ...feature,
        properties: {
          ...feature.properties,
          fips: fipsCode, // Add FIPS code to properties for easier access
          name: feature.properties.NAME || feature.properties.name,
          ownerTeamId: ownershipData?.[fipsCode],
          area: feature.properties.CENSUSAREA || feature.properties.areaSqKm || 0
        }
      }
    })
  }
}

export function calculateCountyCentroid(coordinates: number[][][]): { lat: number, lon: number } {
  // Simple centroid calculation for MultiPolygon
  let totalLat = 0
  let totalLon = 0
  let pointCount = 0

  coordinates.forEach(polygon => {
    polygon.forEach(ring => {
      ring.forEach(([lon, lat]) => {
        totalLat += lat
        totalLon += lon
        pointCount++
      })
    })
  })

  return {
    lat: totalLat / pointCount,
    lon: totalLon / pointCount
  }
}

export function simplifyGeometry(coordinates: number[][][], tolerance = 0.001): number[][][] {
  // Simple Douglas-Peucker-like simplification
  // In production, use a proper simplification library like Turf.js
  return coordinates.map(polygon => 
    polygon.map(ring => 
      ring.filter((_, index) => index % Math.ceil(1 / tolerance) === 0)
    )
  )
}

// Stadium locations for initial territory assignment
export const TEAM_STADIUM_LOCATIONS = {
  'alabama': { lat: 33.2080, lon: -87.5502 },
  'georgia': { lat: 33.9496, lon: -83.3737 },
  'michigan': { lat: 42.2661, lon: -83.7487 },
  'ohio-state': { lat: 40.0017, lon: -83.0197 },
  'texas': { lat: 30.2833, lon: -97.7333 },
  'oklahoma': { lat: 35.2058, lon: -97.4426 },
  'clemson': { lat: 34.6774, lon: -82.8364 },
  'notre-dame': { lat: 41.7001, lon: -86.2379 },
  'usc': { lat: 34.0141, lon: -118.2879 },
  'florida': { lat: 29.6499, lon: -82.3487 },
  'lsu': { lat: 30.4118, lon: -91.1871 },
  'wisconsin': { lat: 43.0642, lon: -89.4012 },
  'penn-state': { lat: 40.8123, lon: -77.8560 },
  'auburn': { lat: 32.6010, lon: -85.4904 },
  'oregon': { lat: 44.0582, lon: -123.0685 },
  'washington': { lat: 47.6508, lon: -122.3048 },
  'miami': { lat: 25.7617, lon: -80.1918 },
  'stanford': { lat: 37.4344, lon: -122.1598 },
  'nebraska': { lat: 40.8136, lon: -96.7026 },
  'tennessee': { lat: 35.9549, lon: -83.9255 }
} as const

export function calculateDistance(
  lat1: number, lon1: number, 
  lat2: number, lon2: number
): number {
  // Haversine formula for geodesic distance
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

export function assignInitialTerritories(counties: County[]): Record<string, string> {
  const assignments: Record<string, string> = {}
  
  counties.forEach(county => {
    let nearestTeam = ''
    let shortestDistance = Infinity
    
    Object.entries(TEAM_STADIUM_LOCATIONS).forEach(([teamId, stadium]) => {
      const distance = calculateDistance(
        county.centroid.lat, county.centroid.lon,
        stadium.lat, stadium.lon
      )
      
      if (distance < shortestDistance) {
        shortestDistance = distance
        nearestTeam = teamId
      }
    })
    
    assignments[county.fips] = nearestTeam
  })
  
  return assignments
}