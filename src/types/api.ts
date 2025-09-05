// API-specific types for external integrations

// CollegeFootballData API types
export interface CfbdGame {
  id: number
  season: number
  week: number
  start_date: string
  completed: boolean
  neutral_site: boolean
  conference_game: boolean
  home_team: string
  away_team: string
  home_points?: number
  away_points?: number
}

export interface CfbdTeam {
  id: number
  school: string
  mascot?: string
  abbreviation?: string
  alt_name1?: string
  alt_name2?: string
  alt_name3?: string
  conference?: string
  color?: string
  alt_color?: string
  logos?: string[]
}

// Internal API request/response types
export interface ApiError {
  error: string
  message: string
  statusCode: number
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}

// Admin API types
export interface IngestRequest {
  season?: number
  week?: number
  forceRecompute?: boolean
}

export interface RecomputeRequest {
  fromDate?: string
  toDate?: string
  dryRun?: boolean
}

export interface IngestResponse {
  gamesProcessed: number
  transfersApplied: number
  errors: string[]
  duration: number
}

// Map data types
export interface MapFeature {
  type: 'Feature'
  properties: {
    fips: string
    name: string
    state: string
    ownerTeamId?: string
    population?: number
    areaSqKm?: number
  }
  geometry: GeoJSON.MultiPolygon
}

export interface MapFeatureCollection {
  type: 'FeatureCollection'
  features: MapFeature[]
}