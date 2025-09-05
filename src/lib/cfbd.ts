// CollegeFootballData API integration

import type { CfbdGame, CfbdTeam } from '@/types/api'
import type { Game, Team } from '@/types'

const CFBD_BASE_URL = 'https://api.collegefootballdata.com'

export class CfbdApiClient {
  private apiKey: string
  private baseUrl: string
  private rateLimitDelay: number

  constructor(apiKey: string, rateLimitRps: number = 10) {
    this.apiKey = apiKey
    this.baseUrl = CFBD_BASE_URL
    this.rateLimitDelay = 1000 / rateLimitRps // Convert RPS to delay in ms
  }

  private async makeRequest<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`)
    
    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value.toString())
      }
    })

    console.log(`CFBD API Request: ${url.toString()}`)

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json'
      }
    })

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay))

    if (!response.ok) {
      throw new Error(`CFBD API Error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async getGames(params: {
    year: number
    week?: number
    team?: string
    conference?: string
    division?: 'fbs' | 'fcs'
  }): Promise<CfbdGame[]> {
    return this.makeRequest('/games', {
      year: params.year,
      week: params.week,
      team: params.team,
      conference: params.conference,
      division: params.division || 'fbs'
    })
  }

  async getTeams(params: {
    conference?: string
    division?: 'fbs' | 'fcs'
  } = {}): Promise<CfbdTeam[]> {
    return this.makeRequest('/teams', {
      conference: params.conference,
      division: params.division || 'fbs'
    })
  }

  async getGamesByDateRange(
    startDate: string, 
    endDate: string, 
    division: 'fbs' | 'fcs' = 'fbs'
  ): Promise<CfbdGame[]> {
    // CFBD doesn't have direct date range API, so we'll fetch by year/week
    // This is a simplified implementation
    const startYear = new Date(startDate).getFullYear()
    const endYear = new Date(endDate).getFullYear()
    
    const allGames: CfbdGame[] = []
    
    for (let year = startYear; year <= endYear; year++) {
      try {
        const yearGames = await this.getGames({ year, division })
        
        // Filter by date range
        const filteredGames = yearGames.filter(game => {
          const gameDate = new Date(game.start_date)
          return gameDate >= new Date(startDate) && gameDate <= new Date(endDate)
        })
        
        allGames.push(...filteredGames)
      } catch (error) {
        console.error(`Failed to fetch games for year ${year}:`, error)
      }
    }
    
    return allGames
  }

  // Convert CFBD data to our internal format
  convertGame(cfbdGame: CfbdGame): Game {
    return {
      id: cfbdGame.id.toString(),
      season: cfbdGame.season,
      week: cfbdGame.week,
      kickoffTime: cfbdGame.start_date,
      status: cfbdGame.completed ? 'final' : 'scheduled',
      homeTeamId: this.normalizeTeamName(cfbdGame.home_team),
      awayTeamId: this.normalizeTeamName(cfbdGame.away_team),
      homeScore: cfbdGame.home_points,
      awayScore: cfbdGame.away_points,
      neutralSite: cfbdGame.neutral_site,
      conferenceGame: cfbdGame.conference_game
    }
  }

  convertTeam(cfbdTeam: CfbdTeam): Team {
    return {
      id: this.normalizeTeamName(cfbdTeam.school),
      name: cfbdTeam.school,
      shortName: cfbdTeam.abbreviation,
      mascot: cfbdTeam.mascot,
      conference: cfbdTeam.conference,
      colorPrimary: cfbdTeam.color ? `#${cfbdTeam.color}` : undefined,
      colorAlt: cfbdTeam.alt_color ? `#${cfbdTeam.alt_color}` : undefined,
      logoUrl: cfbdTeam.logos?.[0]
    }
  }

  private normalizeTeamName(teamName: string): string {
    // Convert team names to consistent IDs
    // This should match the team IDs in our database
    return teamName
      .toLowerCase()
      .replace(/university of /g, '')
      .replace(/state university/g, 'state')
      .replace(/ /g, '-')
      .replace(/[^a-z0-9-]/g, '')
  }
}

// Utility functions for game processing
export function filterFbsGames(games: Game[]): Game[] {
  // Filter for FBS vs FBS games only
  // In production, this would check against a list of FBS team IDs
  return games.filter(game => 
    game.homeTeamId && 
    game.awayTeamId && 
    !game.homeTeamId.includes('fcs') && 
    !game.awayTeamId.includes('fcs')
  )
}

export function groupGamesByStatus(games: Game[]): Record<string, Game[]> {
  return games.reduce((acc, game) => {
    if (!acc[game.status]) acc[game.status] = []
    acc[game.status].push(game)
    return acc
  }, {} as Record<string, Game[]>)
}

export function findUpdatedGames(
  newGames: Game[], 
  existingGames: Game[]
): { added: Game[], updated: Game[], unchanged: Game[] } {
  const existingMap = new Map(existingGames.map(g => [g.id, g]))
  const added: Game[] = []
  const updated: Game[] = []
  const unchanged: Game[] = []

  for (const newGame of newGames) {
    const existing = existingMap.get(newGame.id)
    
    if (!existing) {
      added.push(newGame)
    } else if (this.hasGameChanged(existing, newGame)) {
      updated.push(newGame)
    } else {
      unchanged.push(newGame)
    }
  }

  return { added, updated, unchanged }
}

function hasGameChanged(existing: Game, updated: Game): boolean {
  return (
    existing.status !== updated.status ||
    existing.homeScore !== updated.homeScore ||
    existing.awayScore !== updated.awayScore ||
    existing.kickoffTime !== updated.kickoffTime
  )
}

// Rate limiting helper
export class RateLimiter {
  private requests: number[] = []
  private maxRequests: number
  private windowMs: number

  constructor(maxRequests: number, windowMs: number = 60000) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  async checkLimit(): Promise<void> {
    const now = Date.now()
    
    // Remove requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs)
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests)
      const waitTime = this.windowMs - (now - oldestRequest)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
    
    this.requests.push(now)
  }
}