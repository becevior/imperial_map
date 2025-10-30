import fs from 'fs/promises'
import path from 'path'

import DashboardContent from '@/components/DashboardContent'
import type { LeaderboardsPayload } from '@/types/leaderboards'

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

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-100 to-white">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            College Football Imperial Map
          </h1>
          <p className="text-lg text-gray-600">
            Interactive territory map showing college football imperial conquests
          </p>
        </header>

        <DashboardContent initialLeaderboards={leaderboards} />
      </div>
    </main>
  )
}
