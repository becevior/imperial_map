import fs from 'fs/promises'
import path from 'path'

import DashboardContent from '@/components/DashboardContent'
import Masthead from '@/components/Masthead'
import ThemePicker from '@/components/ThemePicker'
import type { LeaderboardsPayload } from '@/types/leaderboards'
import { loadPreviousWeekScores } from '@/lib/scoreTicker'

async function loadLeaderboards(): Promise<LeaderboardsPayload | null> {
  const filePath = path.join(
    process.cwd(),
    'public',
    'data',
    'leaderboards',
    'latest.json'
  )
  try {
    const fileContents = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(fileContents)
  } catch (error) {
    console.warn('Leaderboards data unavailable:', error)
    return null
  }
}

export default async function Home() {
  const leaderboards = await loadLeaderboards()
  const previousWeekScores = await loadPreviousWeekScores()

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

        <Masthead weekLabel={weekLabel} season={season} />

        <DashboardContent
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
            <span className="link">CFB Web Ring</span> ·{' '}
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
