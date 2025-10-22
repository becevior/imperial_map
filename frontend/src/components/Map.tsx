'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { loadCountiesGeoJSON, processCountiesForMap } from '@/lib/mapUtils'
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
    longitude: -98.5,
    latitude: 39.8,
    zoom: 4
  }
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      },
      center: [initialViewState.longitude, initialViewState.latitude],
      zoom: initialViewState.zoom
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.current.on('load', () => {
      console.log('Map loaded')
      setMapReady(true)
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [initialViewState.longitude, initialViewState.latitude, initialViewState.zoom])

  return (
    <div className={`relative ${className}`}>
      <div
        ref={mapContainer}
        className="w-full h-full rounded-lg overflow-hidden"
        style={{ minHeight: '500px' }}
      />

      {mapReady && (
        <div className="absolute top-4 left-4 bg-white bg-opacity-90 px-3 py-2 rounded-lg shadow-lg">
          <h3 className="text-sm font-semibold text-gray-800">College Football Imperial Map</h3>
          <p className="text-xs text-green-600">Map ready - data layer coming soon</p>
        </div>
      )}
    </div>
  )
}
