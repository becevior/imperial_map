'use client'

import { Fragment, useCallback, useMemo, useRef, useState } from 'react'

import Map from '@/components/Map'
import ScoreTicker from '@/components/ScoreTicker'
import { trackEvent } from '@/lib/analytics'
import type { LeagueDefinition } from '@/lib/leagues'
import type { PreviousWeekScores } from '@/lib/scoreTicker'
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
    return shortNumberFormatter.format(value)
  }

  return numberFormatter.format(value)
}

function describeMetrics(
  metrics: LeaderboardMetrics,
  omit: keyof LeaderboardMetrics,
  territoryUnitLabel: string
): string {
  const pieces: string[] = []

  if (omit !== 'counties') {
    pieces.push(
      `${territoryUnitLabel}: ${numberFormatter.format(metrics.counties)}`
    )
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
  omit: keyof LeaderboardMetrics,
  territoryUnitLabel: string
) {
  const safeEntries = Array.isArray(entries) ? entries : []

  return (
    <div className="im-panel">
      <div className="im-panel__label">{title}</div>
      <div className="im-panel__body im-panel__body--scroll">
        {safeEntries.length === 0 ? (
          <p className="im-status">No data recorded for this selection.</p>
        ) : (
          <table className="im-table">
            <tbody>
              {safeEntries.map((entry, index) => (
                <tr key={entry.teamId} className={index === 0 ? 'is-leader' : undefined}>
                  <td className="rank">{index + 1}</td>
                  <td>
                    <span className="team">{entry.teamName}</span>
                    {entry.conference ? (
                      <span className="conf">{entry.conference}</span>
                    ) : null}
                    <span className="meta">
                      {describeMetrics(entry.metrics, omit, territoryUnitLabel)}
                    </span>
                  </td>
                  <td className="num">
                    {formatMetric(primaryMetric, entry.metrics[primaryMetric])}{' '}
                    <span className="unit">{primaryLabel}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function buildLeaderboardPath(
  dataBasePath: string,
  season: number,
  weekIndex: number
): string {
  const paddedWeek = String(weekIndex).padStart(2, '0')
  return `${dataBasePath}/leaderboards/${season}/week-${paddedWeek}.json`
}

interface DashboardContentProps {
  league: LeagueDefinition
  initialLeaderboards: LeaderboardsPayload | null
  ticker?: PreviousWeekScores | null
}

export default function DashboardContent({
  league,
  initialLeaderboards,
  ticker
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

  const lastLoadedKeyRef = useRef<string | null>(
    initialLeaderboards && typeof initialLeaderboards.weekIndex === 'number'
      ? `${league.id}-${initialLeaderboards.season}-${initialLeaderboards.weekIndex}-snapshot`
      : null
  )

  const handleWeekChange = useCallback(
    async ({ season, weekIndex, weekLabel, refreshVersion }: LeaderboardWeekInfo) => {
      const resolvedLabel =
        weekLabel ?? (typeof weekIndex === 'number' ? `Week ${weekIndex}` : 'Baseline')
      setActiveWeekLabel(resolvedLabel)

      if (typeof season !== 'number' || typeof weekIndex !== 'number') {
        setLeaderboards(null)
        setError('Select a completed week to view leaderboards.')
        return
      }

      const key = `${league.id}-${season}-${weekIndex}-${refreshVersion ?? 'snapshot'}`
      if (lastLoadedKeyRef.current === key && leaderboards) {
        setError(null)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const path = buildLeaderboardPath(league.dataBasePath, season, weekIndex)
        const response = await fetch(path, { cache: 'no-store' })

        if (!response.ok) {
          if (response.status === 404) {
            setLeaderboards(null)
            setError('Leaderboard data has not been generated for this week yet.')
            trackEvent('leaderboard_load_failed', {
              season,
              league_id: league.id,
              week_index: weekIndex,
              week_label: resolvedLabel,
              status: response.status,
              reason: 'not_found'
            })
            return
          }

          throw new Error(`Failed to fetch leaderboard: ${response.status}`)
        }

        const payload: LeaderboardsPayload = await response.json()
        setLeaderboards(payload)
        lastLoadedKeyRef.current = key
        trackEvent('leaderboard_loaded', {
          season,
          league_id: league.id,
          week_index: weekIndex,
          week_label: payload.weekLabel ?? resolvedLabel,
          territory_gained_count:
            payload.leaderboards?.territoryGained?.length ?? 0,
          territory_lost_count:
            payload.leaderboards?.territoryLost?.length ?? 0
        })
      } catch (fetchError) {
        console.error(fetchError)
        setLeaderboards(null)
        setError('Could not load leaderboard data for this week.')
        trackEvent('leaderboard_load_failed', {
          season,
          league_id: league.id,
          week_index: weekIndex,
          week_label: resolvedLabel,
          reason: 'fetch_error'
        })
      } finally {
        setLoading(false)
      }
    },
    [leaderboards, league]
  )

  const cards = useMemo(
    () => [
      {
        title: 'Most Territory Gained',
        data: leaderboards?.leaderboards?.territoryGained,
        metric: 'counties' as const,
        label: league.territoryUnitLabel,
        omit: 'counties' as const
      },
      {
        title: 'Most Territory Lost',
        data: leaderboards?.leaderboards?.territoryLost,
        metric: 'counties' as const,
        label: league.territoryUnitLabel,
        omit: 'counties' as const
      },
      {
        title: 'Most Territory Owned',
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
        label: league.territoryUnitLabel,
        omit: 'counties' as const
      }
    ],
    [leaderboards, league.territoryUnitLabel]
  )

  const hudLeader = leaderboards?.leaderboards?.countiesOwned?.[0]
  const hudPopulation = leaderboards?.leaderboards?.populationControlled?.[0]
  const topGain = leaderboards?.leaderboards?.territoryGained?.[0]

  return (
    <>
      {hudLeader || hudPopulation ? (
        <div className="im-hud">
          {hudLeader ? (
            <span className="im-hud__leader">
              Leader: {hudLeader.teamName}{' '}
              {numberFormatter.format(hudLeader.metrics.counties)}
            </span>
          ) : null}
          {hudPopulation ? (
            <span className="im-hud__hi">
              Hi score: {numberFormatter.format(hudPopulation.metrics.population)} pop
            </span>
          ) : null}
          <span className="im-hud__wk">{activeWeekLabel}</span>
        </div>
      ) : null}

      <div className="im-panel im-panel--map">
        <div className="im-panel__label">
          {league.name} territory map — continental situation
        </div>
        <div className="im-panel__body">
          <Map
            key={league.id}
            className="min-h-[600px]"
            leagueId={league.id}
            dataBasePath={league.dataBasePath}
            teamLabel={league.teamLabel}
            periodLabel={league.periodLabel}
            territoryUnitLabel={league.territoryUnitLabel}
            liveUpdates={league.liveUpdates}
            onWeekChange={handleWeekChange}
          />
        </div>
      </div>

      {ticker ? (
        <ScoreTicker
          games={ticker.games}
          label={`${ticker.label} - Season ${ticker.season}`}
        />
      ) : null}

      {topGain && topGain.metrics.counties > 0 ? (
        <p className="im-dispatch">
          {topGain.teamName.toUpperCase()} SEIZES{' '}
          {numberFormatter.format(topGain.metrics.counties)}{' '}
          {league.territoryUnitLabel.toUpperCase()}
        </p>
      ) : null}

      <section>
        <div className="im-section-head">
          <h2 className="im-section-title">
            {league.periodLabel.charAt(0).toUpperCase() + league.periodLabel.slice(1)}ly{' '}
            Leaderboards
          </h2>
          <p className="im-section-sub">
            {activeWeekLabel}
            {leaderboards?.season ? ` · Season ${leaderboards.season}` : ''}
          </p>
        </div>

        {loading && !leaderboards?.leaderboards ? (
          <div className="im-status">Loading leaderboard data…</div>
        ) : error ? (
          <div className="im-status">{error}</div>
        ) : leaderboards?.leaderboards ? (
          <div
            className={`im-grid-cards transition-opacity duration-300 ${
              loading ? 'opacity-60' : 'opacity-100'
            }`}
            aria-busy={loading}
          >
            {cards.map((card) => (
              <Fragment key={card.title}>
                {renderLeaderboard(
                  card.title,
                  card.data,
                  card.metric,
                  card.label,
                  card.omit,
                  league.territoryUnitLabel
                )}
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="im-status">
            Leaderboard data is not available for this selection yet.
          </div>
        )}
      </section>
    </>
  )
}
