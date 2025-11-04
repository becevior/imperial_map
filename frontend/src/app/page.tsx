import fs from 'fs/promises'
import path from 'path'

import DashboardContent from '@/components/DashboardContent'
import TecmoThrowBanner from '@/components/TecmoThrowBanner'
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-100 to-white">
      <div className="container mx-auto px-4 py-8">
        {previousWeekScores ? (
          <section className="mb-8">
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
              <TecmoThrowBanner />
            </div>
          </section>
        ) : null}

        <DashboardContent initialLeaderboards={leaderboards} ticker={previousWeekScores} />
      </div>
    </main>
  )
}
