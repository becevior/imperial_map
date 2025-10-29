export interface LeaderboardMetrics {
  counties: number
  population: number
  areaSqMi: number
}

export interface LeaderboardEntry {
  teamId: string
  teamName: string
  shortName?: string | null
  fullName?: string | null
  conference?: string | null
  metrics: LeaderboardMetrics
}

export interface LeaderboardsPayload {
  season: number
  weekIndex: number
  week?: number | null
  weekLabel?: string | null
  seasonType?: string | null
  leaderboards: {
    territoryOwned?: LeaderboardEntry[]
    populationControlled?: LeaderboardEntry[]
    countiesOwned?: LeaderboardEntry[]
    territoryGained?: LeaderboardEntry[]
    territoryLost?: LeaderboardEntry[]
  }
  totals?: {
    trackedTeams?: number
    countyCount?: number
  }
}

export interface LeaderboardWeekInfo {
  season: number | null
  weekIndex: number | null
  weekLabel?: string | null
  seasonType?: string | null
}
