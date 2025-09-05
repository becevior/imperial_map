// Database schema types for strict typing

export interface DbTeam {
  id: string
  name: string
  short_name?: string
  mascot?: string
  conference?: string
  color_primary?: string
  color_alt?: string
  logo_url?: string
  created_at: string
}

export interface DbTerritory {
  fips_code: string
  state_code: string
  county_name: string
  centroid_lat: number
  centroid_lon: number
  area_sq_km?: number
  population?: number
  geometry: object // GeoJSON stored as JSONB
  created_at: string
}

export interface DbTerritoryOwnership {
  fips_code: string
  owner_team_id?: string
  original_owner_id?: string
  last_change_at?: string
  last_game_id?: string
  version: number
  updated_at: string
}

export interface DbGame {
  id: string
  season: number
  week: number
  kickoff_time: string
  home_team_id: string
  away_team_id: string
  home_score?: number
  away_score?: number
  status: string
  neutral_site: boolean
  conference_game: boolean
  created_at: string
  updated_at: string
}

export interface DbTerritoryHistory {
  id: number
  fips_code: string
  prev_owner_id?: string
  new_owner_id?: string
  game_id?: string
  reason?: string
  changed_at: string
}

export interface DbJobRun {
  job_name: string
  run_started: string
  run_finished?: string
  success?: boolean
  details?: object // JSONB
}