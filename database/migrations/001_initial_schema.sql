-- College Football Imperial Map - Initial Schema
-- Based on the technical design document

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Teams (FBS + optional FCS)
CREATE TABLE teams (
  id            VARCHAR(50) PRIMARY KEY,
  name          TEXT NOT NULL,
  short_name    TEXT,
  mascot        TEXT,
  conference    TEXT,
  color_primary TEXT,
  color_alt     TEXT,
  logo_url      TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- US Counties (simplified for rendering)
CREATE TABLE territories (
  fips_code     VARCHAR(5) PRIMARY KEY,
  state_code    VARCHAR(2) NOT NULL,
  county_name   TEXT NOT NULL,
  centroid_lat  DECIMAL(10,8) NOT NULL,
  centroid_lon  DECIMAL(11,8) NOT NULL,
  area_sq_km    DECIMAL(12,4),
  population    INTEGER,
  geometry      JSONB,              -- Simplified MultiPolygon GeoJSON
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Current territory owner (fast lookups)
CREATE TABLE territory_ownership (
  fips_code        VARCHAR(5) PRIMARY KEY REFERENCES territories(fips_code),
  owner_team_id    VARCHAR(50) REFERENCES teams(id),
  original_owner_id VARCHAR(50) REFERENCES teams(id),
  last_change_at   TIMESTAMP WITH TIME ZONE,
  last_game_id     TEXT,
  version          INTEGER DEFAULT 1,
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game facts (ingested from provider)
CREATE TABLE games (
  id             TEXT PRIMARY KEY,
  season         INTEGER NOT NULL,
  week           INTEGER NOT NULL,
  kickoff_time   TIMESTAMP WITH TIME ZONE,
  home_team_id   VARCHAR(50) REFERENCES teams(id),
  away_team_id   VARCHAR(50) REFERENCES teams(id),
  home_score     INTEGER,
  away_score     INTEGER,
  status         TEXT NOT NULL,            -- scheduled, in_progress, final
  neutral_site   BOOLEAN DEFAULT FALSE,
  conference_game BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transfer history (append-only)
CREATE TABLE territory_history (
  id            BIGSERIAL PRIMARY KEY,
  fips_code     VARCHAR(5) REFERENCES territories(fips_code),
  prev_owner_id VARCHAR(50) REFERENCES teams(id),
  new_owner_id  VARCHAR(50) REFERENCES teams(id),
  game_id       TEXT REFERENCES games(id),
  reason        TEXT,           -- rule id/msg
  changed_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job bookkeeping to guarantee idempotency/locking
CREATE TABLE job_runs (
  job_name      TEXT NOT NULL,
  run_started   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  run_finished  TIMESTAMP WITH TIME ZONE,
  success       BOOLEAN,
  details       JSONB,
  PRIMARY KEY (job_name, run_started)
);

-- Create indexes for performance
CREATE INDEX ON territory_ownership(owner_team_id);
CREATE INDEX ON territory_ownership(updated_at);
CREATE INDEX ON territory_history(fips_code, changed_at DESC);
CREATE INDEX ON territory_history(new_owner_id);
CREATE INDEX ON games(status, updated_at);
CREATE INDEX ON games(season, week);
CREATE INDEX ON job_runs(job_name, run_started DESC);

-- Add constraints
ALTER TABLE games ADD CONSTRAINT valid_status CHECK (status IN ('scheduled', 'in_progress', 'final'));
ALTER TABLE territory_ownership ADD CONSTRAINT positive_version CHECK (version > 0);

-- Functions for common operations
CREATE OR REPLACE FUNCTION update_territory_ownership_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_territory_ownership_timestamp
  BEFORE UPDATE ON territory_ownership
  FOR EACH ROW EXECUTE FUNCTION update_territory_ownership_timestamp();

CREATE OR REPLACE FUNCTION update_games_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_games_timestamp
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_games_timestamp();