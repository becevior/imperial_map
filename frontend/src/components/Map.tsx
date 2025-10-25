'use client'

import { ChangeEvent, useEffect, useRef, useState } from 'react'
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

interface OwnershipIndexWeek {
  weekIndex: number
  week?: number | null
  seasonType?: string | null
  label?: string
  path?: string
}

interface OwnershipIndexSeason {
  season: number
  weeks: OwnershipIndexWeek[]
}

interface OwnershipIndexPayload {
  seasons: OwnershipIndexSeason[]
}

export default function Map({ className = '' }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [teamCount, setTeamCount] = useState<number | null>(null)
  const [countyCount, setCountyCount] = useState<number | null>(null)
  const [seasonOptions, setSeasonOptions] = useState<OwnershipIndexSeason[]>([])
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number | null>(null)
  const [currentWeekLabel, setCurrentWeekLabel] = useState<string>('Baseline')
  const [ownershipLoading, setOwnershipLoading] = useState(false)
  const [ownershipError, setOwnershipError] = useState<string | null>(null)

  const baseGeoJsonRef = useRef<any | null>(null)
  const decorateGeoJsonRef = useRef<((ownership: OwnershipMap) => any) | null>(null)
  const currentOwnershipRef = useRef<OwnershipMap>({})
  const pendingGeoJsonRef = useRef<any | null>(null)
  const lastOwnershipPathRef = useRef<string | null>(null)
  const baselineOwnershipRef = useRef<OwnershipMap>({})
  const centroidsDataRef = useRef<TerritoryCentroid[]>([])
  const lastCentroidsPathRef = useRef<string | null>(null)

  const applyOwnershipToMap = (ownershipMap: OwnershipMap, label?: string) => {
    const decorator = decorateGeoJsonRef.current

    if (!decorator) {
      return
    }

    const decorated = decorator(ownershipMap)
    if (!decorated) {
      return
    }

    currentOwnershipRef.current = ownershipMap
    if (label) {
      setCurrentWeekLabel(label)
    }
    setCountyCount(Object.keys(ownershipMap).length)

    const mapInstance = mapRef.current
    if (mapInstance) {
      const source = mapInstance.getSource('counties') as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(decorated)
      } else {
        pendingGeoJsonRef.current = decorated
      }
    } else {
      pendingGeoJsonRef.current = decorated
    }
  }

  const updateMarkersWithCentroids = (centroids: TerritoryCentroid[]) => {
    const mapInstance = mapRef.current
    if (!mapInstance) {
      return
    }

    // Remove existing markers
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    // Filter valid centroids
    const validCentroids = centroids.filter(
      (centroid) =>
        centroid &&
        typeof centroid.latitude === 'number' &&
        typeof centroid.longitude === 'number' &&
        centroid.logoUrl
    )

    const markerData = validCentroids.map((centroid) => ({
      centroid,
      element: document.createElement('div'),
      marker: null as maplibregl.Marker | null
    }))

    const applyMarkerStyles: () => void = () => {
      if (!mapInstance) {
        return
      }

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

    applyMarkerStyles()

    // Update zoom handler
    if ((mapInstance as any).__logoZoomHandler) {
      mapInstance.off('zoom', (mapInstance as any).__logoZoomHandler)
    }

    const handleZoom = () => {
      applyMarkerStyles()
    }

    mapInstance.on('zoom', handleZoom)
    ;(mapInstance as any).__logoZoomHandler = handleZoom
  }

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const initMap = async () => {
      try {
        const [
          teamsRes,
          ownershipRes,
          geoJsonRes,
          countyStatsRes,
          territoryCentroidsRes,
          ownershipIndexRes
        ] = await Promise.all([
          fetch('/data/teams.json'),
          fetch('/data/ownership.json'),
          fetch('/data/us-counties.geojson'),
          fetch('/data/county-stats.json'),
          fetch('/data/territory-centroids.json'),
          fetch('/data/ownership/index.json')
        ])

        if (!teamsRes.ok || !ownershipRes.ok || !geoJsonRes.ok) {
          throw new Error('Failed to load required map datasets')
        }

        const teams: Team[] = await teamsRes.json()
        const baselineOwnership: OwnershipMap = await ownershipRes.json()
        baselineOwnershipRef.current = baselineOwnership
        const rawGeoJson = await geoJsonRes.json()
        const countyStatsMap: CountyStats = countyStatsRes.ok
          ? await countyStatsRes.json()
          : {}
        const territoryCentroids: TerritoryCentroid[] = territoryCentroidsRes.ok
          ? await territoryCentroidsRes.json()
          : []

        let ownershipIndex: OwnershipIndexPayload | null = null
        if (ownershipIndexRes.ok) {
          try {
            ownershipIndex = await ownershipIndexRes.json()
          } catch (indexErr) {
            console.warn('Failed to parse ownership index', indexErr)
          }
        }

        const teamsById = teams.reduce<Record<string, Team>>((acc, team) => {
          acc[team.id] = team
          return acc
        }, {})

        const teamColors = teams.reduce<Record<string, string>>((acc, team) => {
          acc[team.id] = team.primaryColor ?? fallbackColor(team.id)
          return acc
        }, {})

        const baseCollection =
          rawGeoJson && typeof rawGeoJson === 'object'
            ? rawGeoJson
            : { type: 'FeatureCollection', features: [] }

        const filteredFeatures = Array.isArray(baseCollection?.features)
          ? baseCollection.features
              .filter((feature: any) => {
                const stateCode = String(feature?.properties?.STATE ?? '').padStart(
                  2,
                  '0'
                )
                return stateCode !== '72'
              })
              .map((feature: any) => ({
                ...feature,
                properties: { ...(feature?.properties ?? {}) }
              }))
          : []

        const baseGeoJson = {
          ...baseCollection,
          features: filteredFeatures
        }

        baseGeoJsonRef.current = baseGeoJson

        decorateGeoJsonRef.current = (ownershipMap: OwnershipMap) => {
          if (!baseGeoJsonRef.current) {
            return null
          }

          const decoratedFeatures = baseGeoJsonRef.current.features.map(
            (feature: any) => {
              const fips = String(
                feature?.id ?? feature?.properties?.GEO_ID ?? ''
              )
              const stats = countyStatsMap[fips] ?? {}
              const ownerId = ownershipMap[fips]
              const owner = ownerId ? teamsById[ownerId] : undefined
              const baseProps = feature?.properties ?? {}

              return {
                ...feature,
                properties: {
                  ...baseProps,
                  fips,
                  countyName:
                    stats.name ?? baseProps.NAME ?? baseProps.countyName ?? 'Unknown',
                  countyState: stats.state ?? baseProps.countyState ?? null,
                  owner: ownerId,
                  ownerName: owner?.name ?? 'Unknown',
                  ownerFullName: owner?.fullName ?? owner?.name ?? 'Unknown',
                  ownerColor: ownerId
                    ? teamColors[ownerId]
                    : DEFAULT_FILL_COLOR,
                  population: stats.population ?? baseProps.population ?? null,
                  areaSqMi: stats.areaSqMi ?? baseProps.CENSUSAREA ?? baseProps.areaSqMi ?? null
                }
              }
            }
          )

          return {
            ...baseGeoJsonRef.current,
            features: decoratedFeatures
          }
        }

        const seasonEntries = Array.isArray(ownershipIndex?.seasons)
          ? ownershipIndex!.seasons.filter((entry) =>
              typeof entry?.season === 'number'
            )
          : []

        const normalizedSeasonOptions = seasonEntries.map((season) => ({
          season: season.season,
          weeks: Array.isArray(season.weeks)
            ? season.weeks
                .filter((week) => typeof week?.weekIndex === 'number')
                .map((week) => ({
                  ...week,
                  path:
                    week.path ||
                    `/data/ownership/${season.season}/week-${String(
                      week.weekIndex ?? ''
                    ).padStart(2, '0')}.json`
                }))
            : []
        }))

        let initialOwnershipMap: OwnershipMap = baselineOwnership
        let initialLabel = 'Baseline'
        let initialSeason: number | null = null
        let initialWeekIndex: number | null = null
        let initialPath: string | null = null

        if (normalizedSeasonOptions.length > 0) {
          const latestSeason =
            normalizedSeasonOptions[normalizedSeasonOptions.length - 1]
          const latestWeek =
            latestSeason.weeks.length > 0
              ? latestSeason.weeks[latestSeason.weeks.length - 1]
              : null

          if (latestWeek?.path) {
            try {
              const latestRes = await fetch(latestWeek.path)
              if (latestRes.ok) {
                initialOwnershipMap = await latestRes.json()
                initialLabel = latestWeek.label ?? `Week ${latestWeek.weekIndex}`
                initialPath = latestWeek.path
                initialSeason = latestSeason.season
                initialWeekIndex = latestWeek.weekIndex ?? null
              } else {
                console.warn('Failed to fetch latest ownership snapshot', latestWeek.path)
              }
            } catch (latestErr) {
              console.warn('Error fetching latest ownership snapshot', latestErr)
            }
          }

          if (!initialPath && latestSeason.weeks.length > 0) {
            const fallbackWeek = latestSeason.weeks[latestSeason.weeks.length - 1]
            initialLabel = fallbackWeek.label ?? `Week ${fallbackWeek.weekIndex}`
            initialSeason = latestSeason.season
            initialWeekIndex = fallbackWeek.weekIndex ?? null
          }
        }

        setSeasonOptions(normalizedSeasonOptions)
        setSelectedSeason(initialSeason)
        setSelectedWeekIndex(initialWeekIndex)
        setCurrentWeekLabel(initialLabel)

        // Store baseline centroids
        centroidsDataRef.current = territoryCentroids

        setTeamCount(teams.length)

        applyOwnershipToMap(initialOwnershipMap, initialLabel)
        lastOwnershipPathRef.current = initialPath

        const initialGeoJson =
          decorateGeoJsonRef.current?.(initialOwnershipMap) ?? baseGeoJson

        mapRef.current = new maplibregl.Map({
          container: mapContainer.current!,
          style: {
            version: 8,
            sources: {
              counties: {
                type: 'geojson',
                data: initialGeoJson
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

          const mapInstance = mapRef.current
          if (!mapInstance) {
            setLoading(false)
            return
          }

          const pendingData = pendingGeoJsonRef.current
          if (pendingData) {
            const source = mapInstance.getSource('counties') as maplibregl.GeoJSONSource
            if (source) {
              source.setData(pendingData)
              pendingGeoJsonRef.current = null
            }
          }

          // Use the updateMarkersWithCentroids function for initial markers
          updateMarkersWithCentroids(centroidsDataRef.current)
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

  useEffect(() => {
    if (!seasonOptions.length || selectedSeason === null || selectedWeekIndex === null) {
      return
    }

    const season = seasonOptions.find((entry) => entry.season === selectedSeason)
    if (!season) {
      return
    }

    const week = season.weeks.find((entry) => entry.weekIndex === selectedWeekIndex)
    if (!week || !week.path) {
      return
    }

    if (lastOwnershipPathRef.current === week.path) {
      setCurrentWeekLabel(week.label ?? `Week ${week.weekIndex}`)
      setOwnershipError(null)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const loadOwnership = async () => {
      setOwnershipLoading(true)
      setOwnershipError(null)

      try {
        // week.path is guaranteed to exist from the check above, but TypeScript doesn't know
        const ownershipPath = week.path!

        // Construct logos path from ownership path
        // e.g., /data/ownership/2025/week-01.json -> /data/ownership/2025/week-01-logos.json
        const logosPath = ownershipPath.replace('.json', '-logos.json')

        // Load both ownership and logos in parallel
        const [ownershipResponse, logosResponse] = await Promise.all([
          fetch(ownershipPath, { signal: controller.signal }),
          fetch(logosPath, { signal: controller.signal })
        ])

        if (!ownershipResponse.ok) {
          throw new Error(`Failed to load ownership snapshot: ${ownershipPath}`)
        }

        const ownershipData: OwnershipMap = await ownershipResponse.json()

        // Logos are optional - fallback to existing if not available
        let logosData: TerritoryCentroid[] = centroidsDataRef.current
        if (logosResponse.ok) {
          try {
            logosData = await logosResponse.json()
            centroidsDataRef.current = logosData
            lastCentroidsPathRef.current = logosPath
          } catch (logosErr) {
            console.warn('Failed to parse logos, using previous:', logosErr)
          }
        } else {
          console.warn(`Logos not found at ${logosPath}, using baseline`)
        }

        if (cancelled) {
          return
        }

        applyOwnershipToMap(ownershipData, week.label ?? `Week ${week.weekIndex}`)
        lastOwnershipPathRef.current = ownershipPath

        // Update markers with new logos
        updateMarkersWithCentroids(logosData)

        setOwnershipError(null)
      } catch (ownershipErr) {
        if (cancelled) {
          return
        }

        console.error('Ownership fetch error:', ownershipErr)
        setOwnershipError('Ownership snapshot unavailable for the selected week.')
      } finally {
        if (!cancelled) {
          setOwnershipLoading(false)
        }
      }
    }

    loadOwnership()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [seasonOptions, selectedSeason, selectedWeekIndex])

  const currentSeasonOption = seasonOptions.find(
    (entry) => entry.season === selectedSeason
  )
  const weekOptions = currentSeasonOption?.weeks ?? []
  const showSeasonSelect = seasonOptions.length > 1
  const showWeekSelect = weekOptions.length > 0

  const handleSeasonChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const rawValue = event.target.value
    const value = Number(rawValue)

    if (!rawValue || Number.isNaN(value)) {
      setSelectedSeason(null)
      setSelectedWeekIndex(null)
      setOwnershipError(null)
      lastOwnershipPathRef.current = null
      applyOwnershipToMap(baselineOwnershipRef.current, 'Baseline')
      return
    }

    setSelectedSeason(value)
    setOwnershipError(null)

    const season = seasonOptions.find((entry) => entry.season === value)
    if (season && season.weeks.length > 0) {
      const latestWeek = season.weeks[season.weeks.length - 1]
      setSelectedWeekIndex(latestWeek.weekIndex ?? null)
    } else {
      setSelectedWeekIndex(null)
      lastOwnershipPathRef.current = null
      applyOwnershipToMap(baselineOwnershipRef.current, 'Baseline')
      setCurrentWeekLabel('Baseline')
    }
  }

  const handleWeekChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const rawValue = event.target.value
    const value = Number(rawValue)

    if (Number.isNaN(value)) {
      return
    }

    setOwnershipError(null)
    setSelectedWeekIndex(value)
  }

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
          <p className="text-[11px] text-gray-500 mt-1">{currentWeekLabel}</p>
          <p className="text-[11px] text-gray-500 mt-1">
            Colors reflect the owning team’s primary hue
          </p>

          {(showSeasonSelect || showWeekSelect) && (
            <div className="mt-2 flex flex-col gap-1 text-xs text-gray-700">
              {showSeasonSelect && (
                <label className="flex items-center gap-2">
                  <span className="font-medium text-gray-600">Season</span>
                  <select
                    className="border border-gray-300 rounded px-2 py-1 bg-white"
                    value={selectedSeason !== null ? String(selectedSeason) : ''}
                    onChange={handleSeasonChange}
                    disabled={ownershipLoading}
                  >
                    {seasonOptions.map((season) => (
                      <option key={season.season} value={String(season.season)}>
                        {season.season}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {showWeekSelect && (
                <label className="flex items-center gap-2">
                  <span className="font-medium text-gray-600">Week</span>
                  <select
                    className="border border-gray-300 rounded px-2 py-1 bg-white"
                    value={selectedWeekIndex !== null ? String(selectedWeekIndex) : ''}
                    onChange={handleWeekChange}
                    disabled={ownershipLoading}
                  >
                    {weekOptions.map((week) => (
                      <option
                        key={`${week.weekIndex}-${week.seasonType ?? 'unknown'}`}
                        value={String(week.weekIndex)}
                      >
                        {week.label ?? `Week ${week.weekIndex}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {ownershipLoading && (
            <p className="text-[11px] text-gray-500 mt-1">Updating ownership…</p>
          )}

          {ownershipError && (
            <p className="text-[11px] text-red-600 mt-1">{ownershipError}</p>
          )}
        </div>
      )}
    </div>
  )
}
