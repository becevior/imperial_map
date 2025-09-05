// Core data types based on the design document

export type Team = {
  id: string
  name: string
  shortName?: string
  mascot?: string
  conference?: string
  colorPrimary?: string
  colorAlt?: string
  logoUrl?: string
  createdAt?: string
}

export type County = {
  fips: string
  state: string
  name: string
  centroid: { lat: number; lon: number }
  areaSqKm?: number
  population?: number
  geometry: GeoJSON.MultiPolygon
  createdAt?: string
}

export type Game = {
  id: string
  season: number
  week: number
  kickoffTime: string
  status: 'scheduled' | 'in_progress' | 'final'
  homeTeamId: string
  awayTeamId: string
  homeScore?: number
  awayScore?: number
  neutralSite?: boolean
  conferenceGame?: boolean
  createdAt?: string
  updatedAt?: string
}

export type Ownership = {
  fips: string
  ownerTeamId: string
  originalOwnerId?: string
  lastGameId?: string
  lastChangeAt?: string
  version: number
  updatedAt?: string
}

export type TransferEvent = {
  id: number
  fips: string
  fromTeamId: string
  toTeamId: string
  gameId: string
  at: string
  reason: string
}

// API response types
export type TerritoryResponse = {
  datasetVersion: number
  territories: Array<{
    fips: string
    ownerTeamId: string
    version: number
  }>
}

export type TeamsResponse = {
  teams: Team[]
}

export type GamesResponse = {
  games: Game[]
}

// Map-related types
export type MapBounds = {
  north: number
  south: number
  east: number
  west: number
}

export type MapViewState = {
  latitude: number
  longitude: number
  zoom: number
  bearing?: number
  pitch?: number
}

// Job tracking types
export type JobRun = {
  jobName: string
  runStarted: string
  runFinished?: string
  success?: boolean
  details?: Record<string, unknown>
}

// Configuration types
export type Config = {
  cfbdApiKey: string
  databaseUrl: string
  rateLimitRps?: number
  snapshotBucket?: string
  adminToken?: string
}