// Main ingest Lambda handler - fetches games and applies territory transfers
import type { LambdaEvent, LambdaResponse, IngestResult } from '../shared/types'
import { createDbPool, withTransaction, acquireJobLock, releaseJobLock, queries } from '../shared/db'
import { CfbdApiClient, filterFbsGames, findUpdatedGames } from '../../../src/lib/cfbd'
import { ImperialTerritoryEngine } from '../../../src/lib/territory'

const DB_URL = process.env.DATABASE_URL!
const CFBD_API_KEY = process.env.CFBD_API_KEY!
const RATE_LIMIT_RPS = parseInt(process.env.RATE_LIMIT_RPS || '10')

export async function handler(event: LambdaEvent): Promise<LambdaResponse> {
  const startTime = Date.now()
  const jobName = 'hourly-ingest'
  
  console.log('Ingest job started', { event, timestamp: new Date().toISOString() })
  
  // Input validation
  if (!DB_URL || !CFBD_API_KEY) {
    return errorResponse('Missing required environment variables', 500)
  }

  const pool = createDbPool({ connectionString: DB_URL })
  let runId: string | null = null
  let result: IngestResult = {
    gamesProcessed: 0,
    transfersApplied: 0,
    errors: [],
    duration: 0,
    jobId: ''
  }

  try {
    // Acquire job lock to prevent concurrent runs
    runId = await acquireJobLock(pool, jobName, 600) // 10 minute timeout
    if (!runId) {
      return errorResponse('Another ingest job is already running', 429)
    }
    
    result.jobId = runId

    // Initialize CFBD client and territory engine
    const cfbdClient = new CfbdApiClient(CFBD_API_KEY, RATE_LIMIT_RPS)
    const territoryEngine = new ImperialTerritoryEngine()

    await withTransaction(pool, async (client) => {
      // Step 1: Fetch recent games from CFBD
      console.log('Fetching games from CFBD...')
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000) // Last 48 hours
      const currentSeason = new Date().getFullYear()
      
      const cfbdGames = await cfbdClient.getGames({ 
        year: currentSeason,
        division: 'fbs'
      })
      
      const games = cfbdGames.map(g => cfbdClient.convertGame(g))
      const fbsGames = filterFbsGames(games)
      
      console.log(`Found ${fbsGames.length} FBS games`)

      // Step 2: Get existing games from database
      const existingGamesResult = await client.query(queries.getGames, [since.toISOString()])
      const existingGames = existingGamesResult.rows

      // Step 3: Find updated games
      const { added, updated } = findUpdatedGames(fbsGames, existingGames)
      const gamesToProcess = [...added, ...updated]
      
      console.log(`Processing ${gamesToProcess.length} games (${added.length} new, ${updated.length} updated)`)

      // Step 4: Upsert games
      for (const game of gamesToProcess) {
        try {
          await client.query(queries.upsertGame, [
            game.id, game.season, game.week, game.kickoffTime,
            game.homeTeamId, game.awayTeamId, game.homeScore, game.awayScore,
            game.status, game.neutralSite, game.conferenceGame
          ])
          result.gamesProcessed++
        } catch (error) {
          console.error(`Failed to upsert game ${game.id}:`, error)
          result.errors.push(`Game ${game.id}: ${error}`)
        }
      }

      // Step 5: Apply territory transfers for finalized games
      console.log('Checking for territory transfers...')
      const finalizedGamesResult = await client.query(queries.getFinalizedGames)
      const finalizedGames = finalizedGamesResult.rows

      if (finalizedGames.length > 0) {
        console.log(`Found ${finalizedGames.length} games ready for territory transfer`)
        
        // Get current ownership state
        const ownershipResult = await client.query(queries.getCurrentOwnership)
        const currentOwnership = ownershipResult.rows.map(row => ({
          fips: row.fips_code,
          ownerTeamId: row.owner_team_id,
          originalOwnerId: row.original_owner_id,
          version: row.version
        }))

        // Process each finalized game
        for (const gameRow of finalizedGames) {
          try {
            const game = {
              id: gameRow.id,
              status: gameRow.status,
              homeTeamId: gameRow.home_team_id,
              awayTeamId: gameRow.away_team_id,
              homeScore: gameRow.home_score,
              awayScore: gameRow.away_score,
              season: gameRow.season,
              week: gameRow.week,
              kickoffTime: gameRow.kickoff_time,
              neutralSite: gameRow.neutral_site,
              conferenceGame: gameRow.conference_game
            }

            const transfers = await territoryEngine.applyGameResult(game, currentOwnership)
            
            for (const transfer of transfers) {
              // Apply territory transfer
              await client.query(queries.transferTerritory, [
                transfer.toTeamId, transfer.gameId, transfer.fromTeamId
              ])
              
              // Log the transfer
              await client.query(queries.logTransfer, [
                transfer.fips, transfer.fromTeamId, transfer.toTeamId, 
                transfer.gameId, transfer.reason
              ])
              
              result.transfersApplied++
            }

            console.log(`Game ${game.id}: Applied ${transfers.length} transfers`)
            
          } catch (error) {
            console.error(`Failed to process game ${gameRow.id}:`, error)
            result.errors.push(`Transfer for game ${gameRow.id}: ${error}`)
          }
        }
      }
    })

    result.duration = Date.now() - startTime
    
    console.log('Ingest job completed successfully', result)
    
    return successResponse(result)

  } catch (error) {
    console.error('Ingest job failed:', error)
    result.errors.push(`Job failed: ${error}`)
    result.duration = Date.now() - startTime
    
    return errorResponse(`Ingest job failed: ${error}`, 500)
    
  } finally {
    // Always release the job lock
    if (runId) {
      await releaseJobLock(pool, jobName, runId, result.errors.length === 0, result)
    }
    
    // Close database connections
    try {
      await pool.end()
    } catch (error) {
      console.error('Error closing database pool:', error)
    }
  }
}

function successResponse(data: any): LambdaResponse {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ success: true, data })
  }
}

function errorResponse(message: string, statusCode: number = 500): LambdaResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      success: false, 
      error: message,
      timestamp: new Date().toISOString()
    })
  }
}