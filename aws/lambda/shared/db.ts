// Database utilities for Lambda functions
import { Pool, PoolClient } from 'pg'
import type { DbConfig } from './types'

let pool: Pool | null = null

export function createDbPool(config: DbConfig): Pool {
  if (pool) return pool

  pool = new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections || 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: config.ssl !== false ? { rejectUnauthorized: false } : false
  })

  return pool
}

export async function withTransaction<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function acquireJobLock(
  pool: Pool, 
  jobName: string, 
  timeoutSeconds: number = 300
): Promise<string | null> {
  const runId = `${jobName}-${Date.now()}`
  
  try {
    const result = await pool.query(`
      INSERT INTO job_runs (job_name, run_started, details)
      SELECT $1, NOW(), $3
      WHERE NOT EXISTS (
        SELECT 1 FROM job_runs 
        WHERE job_name = $1 
        AND run_finished IS NULL 
        AND run_started > NOW() - INTERVAL '${timeoutSeconds} seconds'
      )
      RETURNING run_started
    `, [jobName, runId, JSON.stringify({ runId, timeout: timeoutSeconds })])
    
    if (result.rows.length > 0) {
      console.log(`Acquired job lock for ${jobName}, runId: ${runId}`)
      return runId
    }
    
    console.log(`Job lock busy for ${jobName}`)
    return null
  } catch (error) {
    console.error('Failed to acquire job lock:', error)
    return null
  }
}

export async function releaseJobLock(
  pool: Pool,
  jobName: string,
  runId: string,
  success: boolean,
  details?: any
): Promise<void> {
  try {
    await pool.query(`
      UPDATE job_runs 
      SET run_finished = NOW(), success = $1, details = $2
      WHERE job_name = $3 AND details->>'runId' = $4
    `, [success, JSON.stringify({ ...details, runId }), jobName, runId])
    
    console.log(`Released job lock for ${jobName}, runId: ${runId}, success: ${success}`)
  } catch (error) {
    console.error('Failed to release job lock:', error)
  }
}

// Utility queries
export const queries = {
  getTeams: 'SELECT * FROM teams ORDER BY name',
  
  getGames: `
    SELECT * FROM games 
    WHERE updated_at >= $1 
    ORDER BY updated_at DESC
  `,
  
  upsertGame: `
    INSERT INTO games (
      id, season, week, kickoff_time, home_team_id, away_team_id,
      home_score, away_score, status, neutral_site, conference_game
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (id) DO UPDATE SET
      home_score = EXCLUDED.home_score,
      away_score = EXCLUDED.away_score,
      status = EXCLUDED.status,
      updated_at = NOW()
    RETURNING *
  `,
  
  getFinalizedGames: `
    SELECT * FROM games 
    WHERE status = 'final' 
    AND id NOT IN (
      SELECT DISTINCT game_id FROM territory_history 
      WHERE game_id IS NOT NULL
    )
  `,
  
  getCurrentOwnership: 'SELECT * FROM territory_ownership',
  
  transferTerritory: `
    UPDATE territory_ownership 
    SET owner_team_id = $1, last_change_at = NOW(), 
        last_game_id = $2, version = version + 1
    WHERE owner_team_id = $3
  `,
  
  logTransfer: `
    INSERT INTO territory_history 
    (fips_code, prev_owner_id, new_owner_id, game_id, reason)
    VALUES ($1, $2, $3, $4, $5)
  `
}