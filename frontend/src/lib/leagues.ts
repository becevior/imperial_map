export interface LeagueDefinition {
  id: 'cfb' | 'nfl'
  name: string
  fullName: string
  shortName: string
  route: string
  dataBasePath: string
  teamLabel: string
  periodLabel: string
  territoryUnitLabel: string
  updateMessage: string
  liveUpdates: boolean
  teamCount: number
  territoryCount: number
}

export const LEAGUES: LeagueDefinition[] = [
  {
    id: 'cfb',
    name: 'College Football',
    fullName: 'College Football',
    shortName: 'CFB',
    route: '/cfb',
    dataBasePath: '/data',
    teamLabel: 'programs',
    periodLabel: 'week',
    territoryUnitLabel: 'counties',
    updateMessage: 'Updated every Saturday nite',
    liveUpdates: true,
    teamCount: 138,
    territoryCount: 3114
  },
  {
    id: 'nfl',
    name: 'NFL',
    fullName: 'National Football League',
    shortName: 'NFL',
    route: '/nfl',
    dataBasePath: '/data/leagues/nfl',
    teamLabel: 'teams',
    periodLabel: 'week',
    territoryUnitLabel: 'counties',
    updateMessage: 'Complete 2000–2025 archive',
    liveUpdates: false,
    teamCount: 32,
    territoryCount: 3114
  }
]

export function getLeague(id: LeagueDefinition['id']): LeagueDefinition {
  const league = LEAGUES.find((entry) => entry.id === id)
  if (!league) {
    throw new Error(`Unknown league: ${id}`)
  }
  return league
}
