'use client'

import { ChangeEvent, Fragment, useCallback, useMemo, useRef, useState } from 'react'

import Map, { OwnershipIndexSeason, OwnershipIndexWeek } from '@/components/Map'
import type {
  LeaderboardEntry,
  LeaderboardMetrics,
  LeaderboardsPayload,
  LeaderboardWeekInfo
} from '@/types/leaderboards'

const numberFormatter = new Intl.NumberFormat('en-US')
const shortNumberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0
})

function formatMetric(metric: keyof LeaderboardMetrics, value: number): string {
  if (metric === 'areaSqMi') {
    return `${shortNumberFormatter.format(value)} sq mi`
  }

  return numberFormatter.format(value)
}

function describeMetrics(
  metrics: LeaderboardMetrics,
  omit: keyof LeaderboardMetrics
): string {
  const pieces: string[] = []

  if (omit !== 'counties') {
    pieces.push(`Counties: ${numberFormatter.format(metrics.counties)}`)
  }

  if (omit !== 'population') {
    pieces.push(`Population: ${numberFormatter.format(metrics.population)}`)
  }

  if (omit !== 'areaSqMi') {
    pieces.push(`Area: ${shortNumberFormatter.format(metrics.areaSqMi)} sq mi`)
  }

  return pieces.join(' · ')
}

function renderLeaderboard(
  title: string,
  entries: LeaderboardEntry[] | undefined,
  primaryMetric: keyof LeaderboardMetrics,
  primaryLabel: string,
  omit: keyof LeaderboardMetrics
) {
  const safeEntries = Array.isArray(entries) ? entries : []

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">{title}</h3>
      {safeEntries.length === 0 ? (
        <p className="text-sm text-gray-500">No data recorded for this selection.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto pr-1">
          <ol className="divide-y divide-gray-100">
            {safeEntries.map((entry, index) => (
              <li key={entry.teamId} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-4 text-sm sm:text-base">
                  <span className="font-medium text-gray-900">
                    {index + 1}. {entry.teamName}
                    {entry.conference ? (
                      <span className="ml-2 text-xs text-gray-400">{entry.conference}</span>
                    ) : null}
                  </span>
                  <span className="font-semibold text-gray-800">
                    {formatMetric(primaryMetric, entry.metrics[primaryMetric])}{' '}
                    <span className="text-xs text-gray-500">{primaryLabel}</span>
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {describeMetrics(entry.metrics, omit)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function buildLeaderboardPath(season: number, weekIndex: number): string {
  const paddedWeek = String(weekIndex).padStart(2, '0')
  return `/data/leaderboards/${season}/week-${paddedWeek}.json`
}

interface DashboardContentProps {
  initialLeaderboards: LeaderboardsPayload | null
}

export default function DashboardContent({
  initialLeaderboards
}: DashboardContentProps) {
  const [leaderboards, setLeaderboards] = useState<LeaderboardsPayload | null>(
    initialLeaderboards
  )
  const [activeWeekLabel, setActiveWeekLabel] = useState<string>(
    initialLeaderboards?.weekLabel ??
      (typeof initialLeaderboards?.weekIndex === 'number'
        ? `Week ${initialLeaderboards.weekIndex}`
        : 'Baseline')
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seasonOptions, setSeasonOptions] = useState<OwnershipIndexSeason[]>([])
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number | null>(null)

  const lastLoadedKeyRef = useRef<string | null>(
    initialLeaderboards && typeof initialLeaderboards.weekIndex === 'number'
      ? `${initialLeaderboards.season}-${initialLeaderboards.weekIndex}`
      : null
  )

  const handleSeasonOptionsLoaded = useCallback((options: OwnershipIndexSeason[]) => {
    setSeasonOptions(options)

    // Auto-select the first season and latest week if available
    if (options.length > 0 && selectedSeason === null) {
      const firstSeason = options[0]
      setSelectedSeason(firstSeason.season)

      if (firstSeason.weeks.length > 0) {
        const latestWeek = firstSeason.weeks[firstSeason.weeks.length - 1]
        setSelectedWeekIndex(latestWeek.weekIndex)
      }
    }
  }, [selectedSeason])

  const handleSeasonChange = useCallback((season: number | null) => {
    setSelectedSeason(season)

    if (season !== null) {
      const seasonData = seasonOptions.find(s => s.season === season)
      if (seasonData && seasonData.weeks.length > 0) {
        const latestWeek = seasonData.weeks[seasonData.weeks.length - 1]
        setSelectedWeekIndex(latestWeek.weekIndex)
      } else {
        setSelectedWeekIndex(null)
      }
    } else {
      setSelectedWeekIndex(null)
    }
  }, [seasonOptions])

  const handleWeekIndexChange = useCallback((weekIndex: number | null) => {
    setSelectedWeekIndex(weekIndex)
  }, [])

  const handleWeekChange = useCallback(
    async ({ season, weekIndex, weekLabel }: LeaderboardWeekInfo) => {
      const resolvedLabel =
        weekLabel ?? (typeof weekIndex === 'number' ? `Week ${weekIndex}` : 'Baseline')
      setActiveWeekLabel(resolvedLabel)

      if (typeof season !== 'number' || typeof weekIndex !== 'number') {
        setLeaderboards(null)
        setError('Select a completed week to view leaderboards.')
        return
      }

      const key = `${season}-${weekIndex}`
      if (lastLoadedKeyRef.current === key && leaderboards) {
        setError(null)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const path = buildLeaderboardPath(season, weekIndex)
        const response = await fetch(path, { cache: 'no-store' })

        if (!response.ok) {
          if (response.status === 404) {
            setLeaderboards(null)
            setError('Leaderboard data has not been generated for this week yet.')
            return
          }

          throw new Error(`Failed to fetch leaderboard: ${response.status}`)
        }

        const payload: LeaderboardsPayload = await response.json()
        setLeaderboards(payload)
        lastLoadedKeyRef.current = key
      } catch (fetchError) {
        console.error(fetchError)
        setLeaderboards(null)
        setError('Could not load leaderboard data for this week.')
      } finally {
        setLoading(false)
      }
    },
    [leaderboards]
  )

  const cards = useMemo(
    () => [
      {
        title: 'Most Territory Gained (Counties)',
        data: leaderboards?.leaderboards?.territoryGained,
        metric: 'counties' as const,
        label: 'counties',
        omit: 'counties' as const
      },
      {
        title: 'Most Territory Lost (Counties)',
        data: leaderboards?.leaderboards?.territoryLost,
        metric: 'counties' as const,
        label: 'counties',
        omit: 'counties' as const
      },
      {
        title: 'Most Territory Owned (Area)',
        data: leaderboards?.leaderboards?.territoryOwned,
        metric: 'areaSqMi' as const,
        label: 'sq mi',
        omit: 'areaSqMi' as const
      },
      {
        title: 'Most Population Controlled',
        data: leaderboards?.leaderboards?.populationControlled,
        metric: 'population' as const,
        label: 'people',
        omit: 'population' as const
      },
      {
        title: 'Most Counties Owned',
        data: leaderboards?.leaderboards?.countiesOwned,
        metric: 'counties' as const,
        label: 'counties',
        omit: 'counties' as const
      }
    ],
    [leaderboards]
  )

  const currentSeasonOption = seasonOptions.find(s => s.season === selectedSeason)
  const weekOptions = currentSeasonOption?.weeks ?? []
  const showSeasonSelect = seasonOptions.length > 1
  const showWeekSelect = weekOptions.length > 0

  return (
    <>
      <div className="bg-white rounded-lg shadow-lg p-6">
        <Map
          className="min-h-[600px]"
          onWeekChange={handleWeekChange}
          selectedSeason={selectedSeason}
          selectedWeekIndex={selectedWeekIndex}
          seasonOptions={seasonOptions}
          onSeasonChange={handleSeasonChange}
          onWeekIndexChange={handleWeekIndexChange}
          onSeasonOptionsLoaded={handleSeasonOptionsLoaded}
        />
      </div>

      {(showSeasonSelect || showWeekSelect) && (
        <div className="bg-white rounded-lg shadow-lg p-4 mt-6">
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-900">Select Week</h3>

            {showSeasonSelect && (
              <label className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-700">Season:</span>
                <select
                  className="border border-gray-300 rounded px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={selectedSeason !== null ? String(selectedSeason) : ''}
                  onChange={(e) => {
                    const val = e.target.value
                    handleSeasonChange(val ? Number(val) : null)
                  }}
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
              <label className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-700">Week:</span>
                <select
                  className="border border-gray-300 rounded px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={selectedWeekIndex !== null ? String(selectedWeekIndex) : ''}
                  onChange={(e) => {
                    const val = e.target.value
                    handleWeekIndexChange(val ? Number(val) : null)
                  }}
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
        </div>
      )}

      <section className="mt-10">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-4">
          <h2 className="text-2xl font-semibold text-gray-900">
            Weekly Leaderboards
          </h2>
          <p className="text-sm text-gray-500">
            {activeWeekLabel}
            {leaderboards?.season ? ` · Season ${leaderboards.season}` : ''}
          </p>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow-lg p-6 text-center text-sm text-gray-500">
            Loading leaderboard data…
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow-lg p-6 text-center text-sm text-gray-500">
            {error}
          </div>
        ) : leaderboards?.leaderboards ? (
          <div className="grid gap-6 md:grid-cols-2">
            {cards.map((card) => (
              <Fragment key={card.title}>
                {renderLeaderboard(
                  card.title,
                  card.data,
                  card.metric,
                  card.label,
                  card.omit
                )}
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg p-6 text-center text-sm text-gray-500">
            Leaderboard data is not available for this selection yet.
          </div>
        )}
      </section>
    </>
  )
}
