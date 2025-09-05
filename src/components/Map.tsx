'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { loadCountiesGeoJSON, processCountiesForMap } from '@/lib/data'
import type { Team } from '@/types'

interface MapProps {
  className?: string
  initialViewState?: {
    longitude: number
    latitude: number
    zoom: number
  }
}

export default function Map({ 
  className = '',
  initialViewState = {
    longitude: -96.0,     // Center of continental US
    latitude: 39.5,       // Slightly north to account for Alaska inset
    zoom: 3.2             // Zoom out to fit entire US
  }
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const initializationRef = useRef(false)
  const [hoveredCounty, setHoveredCounty] = useState<any>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  // Fetch teams data once
  useEffect(() => {
    let cancelled = false
    
    const loadTeams = async () => {
      try {
        console.log('Loading teams data...')
        const response = await fetch('/api/teams')
        if (!response.ok) throw new Error('Failed to load teams')
        const data = await response.json()
        if (!cancelled) {
          console.log('Teams loaded:', data.teams?.length || 0)
          setTeams(data.teams || [])
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading teams:', err)
          setError('Failed to load team data')
        }
      }
    }
    
    loadTeams()
    
    return () => {
      cancelled = true
    }
  }, [])

  // Initialize map once
  useEffect(() => {
    if (!mapContainer.current || map.current || initializationRef.current) return
    
    console.log('Initializing map...')
    initializationRef.current = true

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {},
          glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf", // Required for text rendering
          layers: [{
            id: 'ocean-background',
            type: 'background',
            paint: {
              'background-color': '#1a2332' // Dark ocean blue to match reference
            }
          }]
        },
        center: [initialViewState.longitude, initialViewState.latitude],
        zoom: initialViewState.zoom,
        maxZoom: 6,       // Prevent zooming too close
        minZoom: 2.5,     // Keep US in view
        maxBounds: [      // Constrain to North America
          [-180, 15],     // Southwest corner
          [-50, 75]       // Northeast corner  
        ],
        preserveDrawingBuffer: true,
        failIfMajorPerformanceCaveat: false
      })

      // Add navigation controls
      map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

      // Handle map events
      map.current.on('load', () => {
        console.log('Map loaded successfully')
        setMapReady(true)
        setError(null)
      })

      map.current.on('error', (e) => {
        console.error('Map error:', e)
        setError('Map failed to load')
      })

      map.current.on('webglcontextlost', () => {
        console.warn('WebGL context lost')
        setError('Map rendering issue - please refresh')
      })

    } catch (err) {
      console.error('Map initialization error:', err)
      setError('Failed to initialize map')
    }

    return () => {
      if (map.current) {
        console.log('Cleaning up map')
        map.current.remove()
        map.current = null
      }
      initializationRef.current = false
    }
  }, [initialViewState.longitude, initialViewState.latitude, initialViewState.zoom])

  // Load counties data when both map and teams are ready
  useEffect(() => {
    if (!mapReady || !teams.length || !map.current) return
    if (map.current.getSource('counties')) return // Already loaded
    
    console.log('Loading counties data...')
    setLoading(true)

    const loadMapData = async () => {
      try {
        // Load counties GeoJSON
        const countiesData = await loadCountiesGeoJSON()
        console.log('Counties loaded:', countiesData.features?.length || 0)
        
        // Enhanced mock ownership data covering more regions
        const mockOwnership: Record<string, string> = {
          // Alabama region
          '01001': 'alabama', '01003': 'alabama', '01005': 'alabama', '01007': 'alabama',
          '01009': 'alabama', '01011': 'alabama', '01013': 'alabama', '01015': 'alabama',
          
          // Auburn region
          '01017': 'auburn', '01019': 'auburn', '01021': 'auburn', '01023': 'auburn',
          '01025': 'auburn', '01027': 'auburn', '01029': 'auburn', '01031': 'auburn',
          
          // Texas region
          '48001': 'texas', '48003': 'texas', '48005': 'texas', '48007': 'texas',
          '48201': 'texas', '48203': 'texas', '48205': 'texas', '48207': 'texas',
          '48209': 'texas', '48211': 'texas', '48213': 'texas', '48215': 'texas',
          
          // California USC region
          '06037': 'usc', '06059': 'usc', '06065': 'usc', '06071': 'usc',
          '06073': 'usc', '06075': 'usc', '06077': 'usc', '06079': 'usc',
          
          // Notre Dame region (Indiana/Illinois)
          '17031': 'notre-dame', '17043': 'notre-dame', '17089': 'notre-dame',
          '18001': 'notre-dame', '18003': 'notre-dame', '18005': 'notre-dame',
          '18141': 'notre-dame', '18149': 'notre-dame', '18151': 'notre-dame',
          
          // Michigan region
          '26001': 'michigan', '26005': 'michigan', '26025': 'michigan', '26049': 'michigan',
          '26075': 'michigan', '26081': 'michigan', '26091': 'michigan', '26093': 'michigan',
          
          // Ohio State region
          '39001': 'ohio-state', '39003': 'ohio-state', '39017': 'ohio-state', '39023': 'ohio-state',
          '39041': 'ohio-state', '39045': 'ohio-state', '39049': 'ohio-state', '39097': 'ohio-state',
          
          // Georgia region
          '13001': 'georgia', '13013': 'georgia', '13015': 'georgia', '13021': 'georgia',
          '13057': 'georgia', '13063': 'georgia', '13067': 'georgia', '13089': 'georgia',
          
          // Florida region
          '12001': 'florida', '12003': 'florida', '12005': 'florida', '12009': 'florida',
          '12011': 'florida', '12019': 'florida', '12031': 'florida', '12086': 'florida'
        }
        
        const processedData = processCountiesForMap(countiesData, mockOwnership)
        
        if (!map.current) return

        // Add data source
        map.current.addSource('counties', {
          type: 'geojson',
          data: processedData
        })

        // Add fill layer
        map.current.addLayer({
          id: 'counties-fill',
          type: 'fill',
          source: 'counties',
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'ownerTeamId'], 'alabama'], '#9E1B32',
              ['==', ['get', 'ownerTeamId'], 'auburn'], '#0C385B', 
              ['==', ['get', 'ownerTeamId'], 'usc'], '#990000',
              ['==', ['get', 'ownerTeamId'], 'texas'], '#BF5700',
              ['==', ['get', 'ownerTeamId'], 'notre-dame'], '#0C2340',
              ['==', ['get', 'ownerTeamId'], 'michigan'], '#00274C',
              ['==', ['get', 'ownerTeamId'], 'ohio-state'], '#BB0000',
              ['==', ['get', 'ownerTeamId'], 'georgia'], '#BA0C2F',
              ['==', ['get', 'ownerTeamId'], 'florida'], '#0021A5',
              '#4A5568' // Neutral gray for unowned territories
            ],
            'fill-opacity': 0.9 // More opaque for better visibility
          }
        })

        // Add border layer with better styling
        map.current.addLayer({
          id: 'counties-border',
          type: 'line',
          source: 'counties',
          paint: {
            'line-color': '#ffffff',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2, 0.5,   // Thinner borders at low zoom
              6, 1.5    // Thicker borders when zoomed in
            ],
            'line-opacity': 0.8
          }
        })

        // Add team symbols/text layer for larger territories
        map.current.addLayer({
          id: 'team-symbols',
          type: 'symbol',
          source: 'counties',
          layout: {
            'text-field': [
              'case',
              ['==', ['get', 'ownerTeamId'], 'alabama'], 'ALA',
              ['==', ['get', 'ownerTeamId'], 'auburn'], 'AUB', 
              ['==', ['get', 'ownerTeamId'], 'usc'], 'USC',
              ['==', ['get', 'ownerTeamId'], 'texas'], 'TEX',
              ['==', ['get', 'ownerTeamId'], 'notre-dame'], 'ND',
              ['==', ['get', 'ownerTeamId'], 'michigan'], 'MICH',
              ['==', ['get', 'ownerTeamId'], 'ohio-state'], 'OSU',
              ['==', ['get', 'ownerTeamId'], 'georgia'], 'UGA',
              ['==', ['get', 'ownerTeamId'], 'florida'], 'UF',
              ''
            ],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3, 8,   // Smaller text at low zoom
              6, 14   // Larger text when zoomed in
            ],
            'text-anchor': 'center',
            'text-allow-overlap': false,
            'text-ignore-placement': false
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#000000',
            'text-halo-width': 1,
            'text-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3, 0.7,   // More transparent at low zoom
              6, 0.9    // More opaque when zoomed in
            ]
          },
          filter: ['>', ['get', 'area'], 50000] // Only show on larger counties
        })

        // Enhanced hover effects with tooltip
        map.current.on('mouseenter', 'counties-fill', (e) => {
          if (map.current && e.features && e.features[0]) {
            map.current.getCanvas().style.cursor = 'pointer'
            const feature = e.features[0]
            setHoveredCounty(feature.properties)
          }
        })

        map.current.on('mousemove', 'counties-fill', (e) => {
          setMousePosition({ x: e.point.x, y: e.point.y })
        })

        map.current.on('mouseleave', 'counties-fill', () => {
          if (map.current) {
            map.current.getCanvas().style.cursor = ''
            setHoveredCounty(null)
          }
        })

        console.log('Map data loaded successfully')
        setLoading(false)
        
      } catch (err) {
        console.error('Error loading map data:', err)
        setError('Failed to load map data')
        setLoading(false)
      }
    }

    loadMapData()
  }, [mapReady, teams])

  return (
    <div className={`relative ${className}`}>
      <div 
        ref={mapContainer} 
        className="w-full h-full rounded-lg overflow-hidden"
        style={{ minHeight: '400px' }}
      />
      
      {/* Alaska Inset */}
      <div className="absolute bottom-4 right-4 w-32 h-24 bg-gray-800 border-2 border-white rounded shadow-lg">
        <div className="w-full h-full bg-gradient-to-br from-blue-900 to-blue-800 rounded flex items-center justify-center">
          <div className="text-white text-xs font-semibold">Alaska</div>
        </div>
      </div>
      
      {/* Hawaii Inset */}
      <div className="absolute bottom-4 right-40 w-24 h-16 bg-gray-800 border-2 border-white rounded shadow-lg">
        <div className="w-full h-full bg-gradient-to-br from-blue-900 to-blue-800 rounded flex items-center justify-center">
          <div className="text-white text-xs font-semibold">Hawaii</div>
        </div>
      </div>

      {/* Hover Tooltip */}
      {hoveredCounty && (
        <div 
          className="absolute bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm pointer-events-none z-10"
          style={{
            left: mousePosition.x + 10,
            top: mousePosition.y - 10,
            transform: 'translate(0, -100%)'
          }}
        >
          <div className="font-semibold">{hoveredCounty.name}</div>
          {hoveredCounty.ownerTeamId && (
            <div className="text-xs text-gray-300">
              Controlled by: {
                teams.find(t => t.id === hoveredCounty.ownerTeamId)?.shortName || 
                hoveredCounty.ownerTeamId
              }
            </div>
          )}
          {hoveredCounty.population && (
            <div className="text-xs text-gray-300">
              Population: {hoveredCounty.population.toLocaleString()}
            </div>
          )}
        </div>
      )}
      
      {/* Status overlay */}
      <div className="absolute top-4 left-4 bg-white bg-opacity-90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg">
        <h3 className="text-sm font-semibold text-gray-800">College Football Imperial Map</h3>
        {loading && <p className="text-xs text-blue-600">Loading...</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {!loading && !error && mapReady && teams.length > 0 && (
          <p className="text-xs text-green-600">Map loaded ({teams.length} teams)</p>
        )}
      </div>

      {/* Simple legend */}
      {!loading && !error && teams.length > 0 && (
        <div className="absolute bottom-32 left-4 bg-white bg-opacity-90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg">
          <h4 className="text-sm font-semibold text-gray-800 mb-1">Teams</h4>
          <div className="space-y-1">
            {teams.slice(0, 5).map(team => (
              <div key={team.id} className="flex items-center text-xs">
                <div 
                  className="w-3 h-3 rounded mr-2"
                  style={{ backgroundColor: team.colorPrimary || '#666666' }}
                />
                <span>{team.shortName || team.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}