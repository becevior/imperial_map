import fs from 'fs/promises'
import path from 'path'

type RawTeam = {
  id: string
  name: string
  shortName?: string
}

type RawGame = {
  id: number | string
  season: number
  week: number
  completed?: boolean
  homeTeamId: string
  awayTeamId: string
  homeScore?: number
  awayScore?: number
  startDate?: string
}

type WeekIndexEntry = {
  weekIndex: number
  label?: string
  path: string
}

export type ScoreTickerItem = {
  id: string
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  startDate?: string
}

export type PreviousWeekScores = {
  season: number
  weekNumber: number
  label: string
  games: ScoreTickerItem[]
}

async function loadTeams(): Promise<Map<string, RawTeam>> {
  const teamsPath = path.join(process.cwd(), 'public', 'data', 'teams.json')
  const contents = await fs.readFile(teamsPath, 'utf-8')
  const teams = JSON.parse(contents) as RawTeam[]
  return new Map(teams.map((team) => [team.id, team]))
}

async function findLatestWeek(): Promise<{ season: number; entry: WeekIndexEntry } | null> {
  const baseDir = path.join(process.cwd(), 'public', 'data', 'games')
  const seasonDirs = await fs.readdir(baseDir, { withFileTypes: true })
  const seasons = seasonDirs
    .filter((dirEnt) => dirEnt.isDirectory() && /^\d{4}$/.test(dirEnt.name))
    .map((dirEnt) => Number.parseInt(dirEnt.name, 10))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)

  for (const season of seasons) {
    const indexPath = path.join(baseDir, String(season), 'index.json')

    try {
      const raw = await fs.readFile(indexPath, 'utf-8')
      const parsed = JSON.parse(raw) as { weeks?: WeekIndexEntry[] }
      const weeks = Array.isArray(parsed.weeks) ? parsed.weeks : []
      const sortedWeeks = weeks
        .filter((week): week is WeekIndexEntry =>
          typeof week === 'object' && week !== null && typeof week.weekIndex === 'number'
        )
        .sort((a, b) => b.weekIndex - a.weekIndex)

      for (const entry of sortedWeeks) {
        const weekPath = entry.path?.replace(/^\//, '')
        if (!weekPath) continue

        const resolvedPath = path.join(process.cwd(), 'public', weekPath)
        try {
          await fs.access(resolvedPath)
          return { season, entry }
        } catch {
          // File missing, try next
        }
      }
    } catch {
      // Index missing or unreadable, fall through to next season
    }
  }

  return null
}

export async function loadPreviousWeekScores(): Promise<PreviousWeekScores | null> {
  try {
    const latest = await findLatestWeek()
    if (!latest) {
      return null
    }

    const { season, entry } = latest
    const filePath = path.join(process.cwd(), 'public', entry.path.replace(/^\//, ''))
    const rawGames = JSON.parse(await fs.readFile(filePath, 'utf-8')) as RawGame[]

    const teamMap = await loadTeams()

    const formatted: ScoreTickerItem[] = rawGames
      .filter((game) => game && game.completed !== false)
      .map((game) => {
        const homeTeam = teamMap.get(game.homeTeamId)
        const awayTeam = teamMap.get(game.awayTeamId)

        const homeScore = typeof game.homeScore === 'number' ? game.homeScore : 0
        const awayScore = typeof game.awayScore === 'number' ? game.awayScore : 0

        return {
          id: String(game.id),
          homeTeam: homeTeam?.shortName || homeTeam?.name || game.homeTeamId,
          awayTeam: awayTeam?.shortName || awayTeam?.name || game.awayTeamId,
          homeScore,
          awayScore,
          startDate: game.startDate,
        }
      })
      .filter((item) => !(Number.isNaN(item.homeScore) || Number.isNaN(item.awayScore)))

    return {
      season,
      weekNumber: entry.weekIndex,
      label: entry.label || `Week ${entry.weekIndex}`,
      games: formatted,
    }
  } catch (error) {
    console.warn('Could not load previous week scores:', error)
    return null
  }
}
