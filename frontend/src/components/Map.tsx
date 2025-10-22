'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface Team {
  id: string
  name: string
  fullName: string
  city: string
  state: string
}

interface MapProps {
  className?: string
}

// Generate a color for each team based on its ID (deterministic)
function getTeamColor(teamId: string): string {
  // Simple hash function to generate consistent colors
  let hash = 0
  for (let i = 0; i < teamId.length; i++) {
    hash = teamId.charCodeAt(i) + ((hash << 5) - hash)
  }

  // Generate RGB values
  const r = (hash & 0xFF0000) >> 16
  const g = (hash & 0x00FF00) >> 8
  const b = hash & 0x0000FF

  // Ensure colors are vibrant (not too dark or light)
  const adjust = (val: number) => Math.max(50, Math.min(200, val))

  return `rgb(${adjust(r)}, ${adjust(g)}, ${adjust(b)})`
}

export default function Map({ className = '' }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const initMap = async () => {
      try {
        // Load data
        console.log('Loading teams and ownership data...')
        const [teamsRes, ownershipRes, geoJsonRes] = await Promise.all([
          fetch('/data/teams.json'),
          fetch('/data/ownership.json'),
          fetch('/data/us-counties.geojson')
        ])

        if (!teamsRes.ok || !ownershipRes.ok || !geoJsonRes.ok) {
          throw new Error('Failed to load data files')
        }

        const teams: Team[] = await teamsRes.json()
        const ownership: Record<string, string> = await ownershipRes.json()
        const geoJson = await geoJsonRes.json()

        console.log(`Loaded ${teams.length} teams, ${Object.keys(ownership).length} counties`)

        // Create team color map
        const teamColors: Record<string, string> = {}
        teams.forEach(team => {
          teamColors[team.id] = getTeamColor(team.id)
        })

        // Add ownership data to GeoJSON features
        geoJson.features.forEach((feature: any) => {
          const fips = feature.id
          const owner = ownership[fips]
          feature.properties = {
            ...feature.properties,
            owner: owner,
            ownerName: teams.find(t => t.id === owner)?.name || 'Unknown'
          }
        })

        // Initialize map
        map.current = new maplibregl.Map({
          container: mapContainer.current!,
          style: {
            version: 8,
            sources: {
              counties: {
                type: 'geojson',
                data: geoJson
              }
            },
            layers: [
              {
                id: 'background',
                type: 'background',
                paint: {
                  'background-color': '#1a1a1a'
                }
              },
              {
                id: 'counties-fill',
                type: 'fill',
                source: 'counties',
                paint: {
                  'fill-color': [
                    'case',
                    ['has', 'owner'],
                    ['get', 'owner'],
                    '#333333'
                  ],
                  'fill-opacity': 0.8
                }
              },
              {
                id: 'counties-border',
                type: 'line',
                source: 'counties',
                paint: {
                  'line-color': '#ffffff',
                  'line-width': 0.5,
                  'line-opacity': 0.3
                }
              }
            ]
          },
          center: [-98.5, 39.8],
          zoom: 4
        })

        // Apply team colors to map
        map.current.on('load', () => {
          // Build color expression for MapLibre
          const colorExpression: any = ['match', ['get', 'owner']]

          teams.forEach(team => {
            colorExpression.push(team.id, teamColors[team.id])
          })

          // Default color for unowned counties
          colorExpression.push('#333333')

          map.current!.setPaintProperty('counties-fill', 'fill-color', colorExpression)

          console.log('Map loaded with team colors')
          setLoading(false)
        })

        // Add navigation controls
        map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

        // Add hover effect
        map.current.on('mousemove', 'counties-fill', (e) => {
          if (e.features && e.features[0]) {
            map.current!.getCanvas().style.cursor = 'pointer'
          }
        })

        map.current.on('mouseleave', 'counties-fill', () => {
          map.current!.getCanvas().style.cursor = ''
        })

        // Add click handler to show county info
        map.current.on('click', 'counties-fill', (e) => {
          if (e.features && e.features[0]) {
            const props = e.features[0].properties
            new maplibregl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="padding: 8px;">
                  <strong>${props.NAME || 'Unknown'} County</strong><br/>
                  <span style="color: ${teamColors[props.owner] || '#999'}">
                    ${props.ownerName || 'No owner'}
                  </span>
                </div>
              `)
              .addTo(map.current!)
          }
        })

      } catch (err) {
        console.error('Map initialization error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load map')
        setLoading(false)
      }
    }

    initMap()

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  return (
    <div className={`relative ${className}`}>
      <div
        ref={mapContainer}
        className="w-full h-full rounded-lg overflow-hidden"
        style={{ minHeight: '600px' }}
      />

      {loading && (
        <div className="absolute top-4 left-4 bg-white bg-opacity-90 px-3 py-2 rounded-lg shadow-lg">
          <p className="text-sm text-gray-800">Loading map data...</p>
        </div>
      )}

      {error && (
        <div className="absolute top-4 left-4 bg-red-100 px-3 py-2 rounded-lg shadow-lg">
          <p className="text-sm text-red-800">Error: {error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="absolute top-4 left-4 bg-white bg-opacity-90 px-3 py-2 rounded-lg shadow-lg">
          <h3 className="text-sm font-semibold text-gray-800">College Football Imperial Map</h3>
          <p className="text-xs text-green-600">135 teams competing for 3,221 counties</p>
        </div>
      )}
    </div>
  )
}
