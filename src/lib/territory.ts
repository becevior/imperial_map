// Territory assignment and transfer logic

import type { County, Team, Game, TransferEvent, Ownership } from '@/types'
import { calculateDistance, TEAM_STADIUM_LOCATIONS } from './data'

export interface TerritoryEngine {
  assignInitialTerritories(counties: County[], teams: Team[]): Promise<Ownership[]>
  applyGameResult(game: Game, currentOwnership: Ownership[]): Promise<TransferEvent[]>
  validateOwnership(ownership: Ownership[]): boolean
}

export class ImperialTerritoryEngine implements TerritoryEngine {
  
  async assignInitialTerritories(counties: County[], teams: Team[]): Promise<Ownership[]> {
    console.log(`Assigning ${counties.length} counties to ${teams.length} teams`)
    
    const assignments: Ownership[] = []
    const teamMap = new Map(teams.map(t => [t.id, t]))
    
    for (const county of counties) {
      let nearestTeam = ''
      let shortestDistance = Infinity
      
      // Find the nearest team stadium to this county's centroid
      for (const [teamId, stadium] of Object.entries(TEAM_STADIUM_LOCATIONS)) {
        if (!teamMap.has(teamId)) continue // Skip if team not in our dataset
        
        const distance = calculateDistance(
          county.centroid.lat, 
          county.centroid.lon,
          stadium.lat, 
          stadium.lon
        )
        
        if (distance < shortestDistance) {
          shortestDistance = distance
          nearestTeam = teamId
        }
      }
      
      if (nearestTeam) {
        assignments.push({
          fips: county.fips,
          ownerTeamId: nearestTeam,
          originalOwnerId: nearestTeam, // Set original owner
          version: 1,
          lastChangeAt: new Date().toISOString()
        })
      }
    }
    
    console.log(`Assigned ${assignments.length} territories`)
    return assignments
  }
  
  async applyGameResult(game: Game, currentOwnership: Ownership[]): Promise<TransferEvent[]> {
    // Only process final games
    if (game.status !== 'final') {
      return []
    }
    
    // Determine winner and loser
    const result = this.resolveGameWinner(game)
    if (!result) {
      return [] // No winner (tie, cancelled, etc.)
    }
    
    const { winner, loser } = result
    const transfers: TransferEvent[] = []
    const now = new Date().toISOString()
    
    // MVP Rule: Winner takes ALL counties owned by loser
    for (const ownership of currentOwnership) {
      if (ownership.ownerTeamId === loser) {
        transfers.push({
          id: 0, // Will be set by database
          fips: ownership.fips,
          fromTeamId: loser,
          toTeamId: winner,
          gameId: game.id,
          at: now,
          reason: `${winner} defeated ${loser} in game ${game.id} (MVP all-of-loser rule)`
        })
      }
    }
    
    console.log(`Game ${game.id}: ${winner} defeats ${loser}, transferring ${transfers.length} counties`)
    return transfers
  }
  
  private resolveGameWinner(game: Game): { winner: string, loser: string } | null {
    if (game.status !== 'final' || 
        game.homeScore === undefined || 
        game.awayScore === undefined ||
        game.homeScore === game.awayScore) {
      return null // No clear winner
    }
    
    const homeWins = game.homeScore > game.awayScore
    return {
      winner: homeWins ? game.homeTeamId : game.awayTeamId,
      loser: homeWins ? game.awayTeamId : game.homeTeamId
    }
  }
  
  validateOwnership(ownership: Ownership[]): boolean {
    // Check that every county has exactly one owner
    const fipsSet = new Set(ownership.map(o => o.fips))
    const uniqueFips = fipsSet.size === ownership.length
    
    if (!uniqueFips) {
      console.error('Duplicate FIPS codes in ownership data')
      return false
    }
    
    // Check version numbers are positive
    const validVersions = ownership.every(o => o.version > 0)
    if (!validVersions) {
      console.error('Invalid version numbers in ownership data')
      return false
    }
    
    return true
  }
}

// Utility functions for territory analysis
export function calculateTerritoryStats(ownership: Ownership[], counties: County[]): Record<string, any> {
  const stats: Record<string, any> = {}
  const countyMap = new Map(counties.map(c => [c.fips, c]))
  
  // Group by team
  const teamTerritories = ownership.reduce((acc, o) => {
    if (!acc[o.ownerTeamId]) acc[o.ownerTeamId] = []
    acc[o.ownerTeamId].push(o.fips)
    return acc
  }, {} as Record<string, string[]>)
  
  // Calculate stats for each team
  for (const [teamId, fipsList] of Object.entries(teamTerritories)) {
    let totalArea = 0
    let totalPopulation = 0
    
    for (const fips of fipsList) {
      const county = countyMap.get(fips)
      if (county) {
        totalArea += county.areaSqKm || 0
        totalPopulation += county.population || 0
      }
    }
    
    stats[teamId] = {
      counties: fipsList.length,
      totalArea: Math.round(totalArea),
      totalPopulation: totalPopulation,
      averageCountySize: Math.round(totalArea / fipsList.length)
    }
  }
  
  return stats
}

export function findContiguousTerritories(
  teamId: string, 
  ownership: Ownership[], 
  adjacency: Record<string, string[]>
): string[][] {
  // Find all connected components of counties owned by a team
  // This will be used for post-MVP contiguity-based transfers
  
  const teamCounties = new Set(
    ownership.filter(o => o.ownerTeamId === teamId).map(o => o.fips)
  )
  
  const visited = new Set<string>()
  const components: string[][] = []
  
  for (const fips of teamCounties) {
    if (visited.has(fips)) continue
    
    // BFS to find connected component
    const component: string[] = []
    const queue = [fips]
    
    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      
      visited.add(current)
      component.push(current)
      
      // Add unvisited adjacent counties owned by same team
      const neighbors = adjacency[current] || []
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor) && teamCounties.has(neighbor)) {
          queue.push(neighbor)
        }
      }
    }
    
    components.push(component)
  }
  
  return components
}