'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface Team {
  id: string
  name: string
  shortName?: string
  fullName: string
  nickname?: string | null
  city: string
  state: string
  latitude?: number
  longitude?: number
  primaryColor?: string | null
  secondaryColor?: string | null
}

interface MapProps {
  className?: string
}

const DEFAULT_FILL_COLOR = '#2d2d2d'
const populationFormatter = new Intl.NumberFormat('en-US')
const areaFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0
})

function fallbackColor(teamId: string): string {
  let hash = 0
  for (let i = 0; i < teamId.length; i++) {
    hash = teamId.charCodeAt(i) + ((hash << 5) - hash)
  }

  const r = hash & 0xff
  const g = (hash >> 8) & 0xff
  const b = (hash >> 16) & 0xff

  const adjust = (value: number) => Math.max(70, Math.min(200, value))

  return `#${adjust(r).toString(16).padStart(2, '0')}${adjust(g)
    .toString(16)
    .padStart(2, '0')}${adjust(b).toString(16).padStart(2, '0')}`
}

const parseNumericProperty = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim()
    if (!cleaned) {
      return null
    }

    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

interface CountyStatsEntry {
  name?: string
  state?: string | null
  population?: number | null
  areaSqMi?: number | null
  centroid?: { lat: number; lon: number }
}

type CountyStats = Record<string, CountyStatsEntry>

type OwnershipMap = Record<string, string>

interface TerritoryCentroid {
  teamId: string
  teamName: string
  shortName?: string
  latitude: number
  longitude: number
  areaSqMi?: number
  countyCount?: number
  logoUrl?: string | null
  centroidLatitude?: number
  centroidLongitude?: number
  anchorFips?: string | null
  region?: string | null
  totalAreaSqMi?: number
}

export default function Map({ className = '' }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [teamCount, setTeamCount] = useState<number | null>(null)
  const [countyCount, setCountyCount] = useState<number | null>(null)

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const initMap = async () => {
      try {
        const [
          teamsRes,
          ownershipRes,
          geoJsonRes,
          countyStatsRes,
          territoryCentroidsRes
        ] = await Promise.all([
          fetch('/data/teams.json'),
          fetch('/data/ownership.json'),
          fetch('/data/us-counties.geojson'),
          fetch('/data/county-stats.json'),
          fetch('/data/territory-centroids.json')
        ])

        if (!teamsRes.ok || !ownershipRes.ok || !geoJsonRes.ok) {
          throw new Error('Failed to load required map datasets')
        }

        const teams: Team[] = await teamsRes.json()
        const ownership: OwnershipMap = await ownershipRes.json()
        const geoJson = await geoJsonRes.json()
        const countyStatsMap: CountyStats = countyStatsRes.ok
          ? await countyStatsRes.json()
          : {}
        const territoryCentroids: TerritoryCentroid[] = territoryCentroidsRes.ok
          ? await territoryCentroidsRes.json()
          : []

        if (Array.isArray(geoJson?.features)) {
          geoJson.features = geoJson.features.filter((feature: any) => {
            const stateCode = String(feature?.properties?.STATE ?? '').padStart(
              2,
              '0'
            )
            return stateCode !== '72'
          })
        }

        const teamsById = teams.reduce<Record<string, Team>>((acc, team) => {
          acc[team.id] = team
          return acc
        }, {})

        const teamColors = teams.reduce<Record<string, string>>((acc, team) => {
          acc[team.id] = team.primaryColor ?? fallbackColor(team.id)
          return acc
        }, {})

        geoJson.features.forEach((feature: any) => {
          const fips = String(feature.id)
          const ownerId = ownership[fips]
          const stats = countyStatsMap[fips] ?? {}
          const owner = teamsById[ownerId]

          const areaSqMi =
            stats.areaSqMi ?? feature.properties?.CENSUSAREA ?? null
          const population = stats.population ?? null
          const countyName =
            stats.name ?? feature.properties?.NAME ?? 'Unknown'
          const countyState = stats.state ?? null

          feature.properties = {
            ...feature.properties,
            fips,
            countyName,
            countyState,
            owner: ownerId,
            ownerName: owner?.name ?? 'Unknown',
            ownerFullName: owner?.fullName ?? owner?.name ?? 'Unknown',
            ownerColor: ownerId ? teamColors[ownerId] : DEFAULT_FILL_COLOR,
            population,
            areaSqMi
          }
        })

        const markerSourceData = territoryCentroids.filter(
          (centroid) =>
            centroid &&
            typeof centroid.latitude === 'number' &&
            typeof centroid.longitude === 'number' &&
            centroid.logoUrl
        )

        mapRef.current = new maplibregl.Map({
          container: mapContainer.current,
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
                  'fill-color': DEFAULT_FILL_COLOR,
                  'fill-opacity': 0.82
                }
              },
              {
                id: 'counties-border',
                type: 'line',
                source: 'counties',
                paint: {
                  'line-color': '#ffffff',
                  'line-width': 0.5,
                  'line-opacity': 0.25
                }
              }
            ]
          },
          center: [-98.5, 39.8],
          zoom: 4
        })

        mapRef.current.on('load', () => {
          const colorExpression: any[] = ['match', ['get', 'owner']]

          teams.forEach((team) => {
            colorExpression.push(team.id, teamColors[team.id])
          })

          colorExpression.push(DEFAULT_FILL_COLOR)

          mapRef.current!.setPaintProperty(
            'counties-fill',
            'fill-color',
            colorExpression
          )

          setTeamCount(teams.length)
          setCountyCount(Object.keys(ownership).length)

          const mapInstance = mapRef.current
          if (!mapInstance) {
            setLoading(false)
            return
          }

          const markerData = markerSourceData.map((centroid) => ({
            centroid,
            element: document.createElement('div'),
            marker: null as maplibregl.Marker | null
          }))

          const applyMarkerStyles = () => {
            const zoom = mapInstance.getZoom()

            markerData.forEach(({ centroid, element }) => {
              const area = Math.max(
                centroid.areaSqMi ?? centroid.totalAreaSqMi ?? 0,
                1
              )
              const baseSize = Math.max(22, Math.min(62, Math.pow(area, 0.25) * 4.8))

              const zoomScale = Math.min(1.2, Math.max(0.8, (zoom - 3.8) / 2.2 + 0.9))
              const size = baseSize * zoomScale
              const opacity = Math.min(1, Math.max(0.45, (zoom - 3.6) / 0.6))

              element.style.width = `${size}px`
              element.style.height = `${size}px`
              element.style.opacity = `${opacity}`
            })
          }

          markerData.forEach((entry) => {
            const { centroid, element } = entry

            element.className = 'territory-logo-marker'
            element.style.backgroundImage = `url('${centroid.logoUrl}')`
            element.style.backgroundSize = 'contain'
            element.style.backgroundRepeat = 'no-repeat'
            element.style.backgroundPosition = 'center'
            element.style.backgroundColor = 'transparent'
            element.style.borderRadius = '0'
            element.style.border = 'none'
            element.style.boxShadow = 'none'
            element.style.pointerEvents = 'none'
            element.style.filter = 'drop-shadow(0 1px 4px rgba(15, 23, 42, 0.45))'
            element.title = centroid.teamName || centroid.teamId

            const marker = new maplibregl.Marker({ element, anchor: 'center' })
              .setLngLat([centroid.longitude, centroid.latitude])
              .addTo(mapInstance)

            entry.marker = marker
            markersRef.current.push(marker)
          })

          const handleZoom = () => applyMarkerStyles()
          mapInstance.on('zoom', handleZoom)
          applyMarkerStyles()

          // Store cleanup to detach zoom handler later
          (mapInstance as any).__logoZoomHandler = handleZoom
          setLoading(false)
        })

        mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right')

        mapRef.current.on('mousemove', 'counties-fill', (event) => {
          if (event.features && event.features[0]) {
            mapRef.current!.getCanvas().style.cursor = 'pointer'
          }
        })

        mapRef.current.on('mouseleave', 'counties-fill', () => {
          mapRef.current!.getCanvas().style.cursor = ''
        })

        mapRef.current.on('click', 'counties-fill', (event) => {
          if (!event.features || !event.features[0]) {
            return
          }

          const props = event.features[0].properties as Record<string, any>
          const countyPieces: Array<string | undefined | null> = [
            props.countyName,
            props.countyState
          ]
          const countyLabel = countyPieces.filter(Boolean).join(', ')

          const populationNumber = parseNumericProperty(props.population)
          const populationValue =
            populationNumber != null
              ? populationFormatter.format(populationNumber)
              : 'Unavailable'

          const areaNumber = parseNumericProperty(props.areaSqMi)
          const areaValue =
            areaNumber != null
              ? `${areaFormatter.format(areaNumber)} sq mi`
              : 'Unavailable'

          const ownerName = props.ownerFullName || props.ownerName || 'Unclaimed'
          const ownerColor = props.ownerColor || DEFAULT_FILL_COLOR

          const wrapper = document.createElement('div')
          wrapper.style.padding = '10px'
          wrapper.style.minWidth = '220px'
          wrapper.style.color = '#1f2937'

          const title = document.createElement('strong')
          title.textContent = countyLabel || 'Unknown County'
          title.style.display = 'block'
          title.style.marginBottom = '4px'
          title.style.color = '#111827'
          wrapper.appendChild(title)

          const ownerSpan = document.createElement('span')
          ownerSpan.textContent = ownerName
          ownerSpan.style.color = ownerColor
          ownerSpan.style.fontWeight = '600'
          ownerSpan.style.display = 'block'
          wrapper.appendChild(ownerSpan)

          const details = document.createElement('div')
          details.style.marginTop = '6px'
          details.style.fontSize = '12px'
          details.style.lineHeight = '1.4'
          details.style.color = '#374151'

          const populationLine = document.createElement('div')
          populationLine.textContent = `Population: ${populationValue}`
          details.appendChild(populationLine)

          const areaLine = document.createElement('div')
          areaLine.textContent = `Area: ${areaValue}`
          details.appendChild(areaLine)

          wrapper.appendChild(details)

          new maplibregl.Popup()
            .setLngLat(event.lngLat)
            .setDOMContent(wrapper)
            .addTo(mapRef.current!)
        })
      } catch (err) {
        console.error('Map initialization error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load map data')
        setLoading(false)
      }
    }

    initMap()

    return () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []

      const mapInstance = mapRef.current
      if (mapInstance) {
        if ((mapInstance as any).__logoZoomHandler) {
          mapInstance.off('zoom', (mapInstance as any).__logoZoomHandler)
          delete (mapInstance as any).__logoZoomHandler
        }
        mapInstance.remove()
      }
      mapRef.current = null
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
        <div className="absolute top-4 left-4 bg-white/90 px-3 py-2 rounded-lg shadow">
          <p className="text-sm text-gray-800">Loading map data…</p>
        </div>
      )}

      {error && (
        <div className="absolute top-4 left-4 bg-red-100 px-3 py-2 rounded-lg shadow">
          <p className="text-sm text-red-800">Error: {error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="absolute top-4 left-4 bg-white/90 px-3 py-2 rounded-lg shadow">
          <h3 className="text-sm font-semibold text-gray-800">
            College Football Imperial Map
          </h3>
          <p className="text-xs text-gray-600">
            {teamCount ?? '–'} teams · {countyCount ?? '–'} counties
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            Colors reflect the owning team’s primary hue
          </p>
        </div>
      )}
    </div>
  )
}
