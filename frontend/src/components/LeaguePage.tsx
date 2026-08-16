import fs from 'fs/promises'
import path from 'path'

import DashboardContent from '@/components/DashboardContent'
import LeagueNav from '@/components/LeagueNav'
import Masthead from '@/components/Masthead'
import ThemePicker from '@/components/ThemePicker'
import { loadPreviousWeekScores } from '@/lib/scoreTicker'
import type { LeagueDefinition } from '@/lib/leagues'
import type { LeaderboardsPayload } from '@/types/leaderboards'

interface LeaguePageProps {
  league: LeagueDefinition
}

async function loadLeaderboards(
  league: LeagueDefinition
): Promise<LeaderboardsPayload | null> {
  const filePath =
    league.id === 'nfl'
      ? path.join(
          process.cwd(),
          'public',
          'data',
          'leagues',
          'nfl',
          'leaderboards',
          'latest.json'
        )
      : path.join(
          process.cwd(),
          'public',
          'data',
          'leaderboards',
          'latest.json'
        )
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'))
  } catch (error) {
    console.warn(`${league.id} leaderboards data unavailable:`, error)
    return null
  }
}

export default async function LeaguePage({ league }: LeaguePageProps) {
  const [leaderboards, previousWeekScores] = await Promise.all([
    loadLeaderboards(league),
    loadPreviousWeekScores(league.dataBasePath)
  ])

  const weekLabel =
    leaderboards?.weekLabel ??
    (typeof leaderboards?.weekIndex === 'number'
      ? `Week ${leaderboards.weekIndex}`
      : 'Preseason')
  const season = leaderboards?.season ?? previousWeekScores?.season ?? null

  return (
    <main className="im-page">
      <div className="im-container">
        <ThemePicker />
        <Masthead weekLabel={weekLabel} season={season} league={league} />
        <LeagueNav activeLeagueId={league.id} />
        <DashboardContent
          key={league.id}
          league={league}
          initialLeaderboards={leaderboards}
          ticker={previousWeekScores}
        />

        <div className="im-geo-extra">
          <div className="im-geo-construction">
            🚧 HISTORY PAGE UNDER CONSTRUCTION 🚧
          </div>
          <p className="im-geo-counter">
            You are visitor number <span className="digits">00137421</span> since
            Aug 2025
          </p>
          <p className="im-geo-webring">
            [ <span className="link">⟨ Prev</span> ·{' '}
            <span className="link">{league.shortName} Web Ring</span> ·{' '}
            <span className="link">Next ⟩</span> ] ·{' '}
            <span className="link">Sign my Guestbook!</span>
            <br />
            Best viewed in Netscape Navigator at 800×600
          </p>
        </div>
      </div>
    </main>
  )
}
