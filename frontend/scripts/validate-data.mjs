import fs from 'node:fs'
import path from 'node:path'

const dataDirectory = path.join(process.cwd(), 'public', 'data')

function fail(message) {
  throw new Error(`Data validation failed: ${message}`)
}

function readJson(relativePath) {
  const fullPath = path.join(dataDirectory, relativePath)
  if (!fs.existsSync(fullPath)) {
    fail(`missing ${relativePath}`)
  }

  return JSON.parse(fs.readFileSync(fullPath, 'utf8'))
}

function assertOwnership(ownership, teamIds, label) {
  if (!ownership || typeof ownership !== 'object' || Array.isArray(ownership)) {
    fail(`${label} is not an ownership map`)
  }

  const unknownTeamIds = [...new Set(Object.values(ownership).filter((teamId) => !teamIds.has(teamId)))]
  if (unknownTeamIds.length > 0) {
    fail(`${label} references unknown team IDs: ${unknownTeamIds.join(', ')}`)
  }
}

const teams = readJson('teams.json')
if (!Array.isArray(teams) || teams.length === 0) {
  fail('teams.json must contain at least one team')
}

const teamIds = new Set(teams.map((team) => team?.id).filter(Boolean))
if (teamIds.size !== teams.length) {
  fail('teams.json contains missing or duplicate team IDs')
}

assertOwnership(readJson('ownership.json'), teamIds, 'ownership.json')

const ownershipIndex = readJson('ownership/index.json')
if (!Array.isArray(ownershipIndex?.seasons) || ownershipIndex.seasons.length === 0) {
  fail('ownership/index.json must contain at least one season')
}

let snapshotCount = 0
for (const season of ownershipIndex.seasons) {
  if (!Number.isInteger(season?.season) || !Array.isArray(season.weeks) || season.weeks.length === 0) {
    fail('each ownership season must have a numeric season and at least one week')
  }

  for (const week of season.weeks) {
    if (!Number.isInteger(week?.weekIndex) || typeof week.path !== 'string') {
      fail(`season ${season.season} contains an invalid week entry`)
    }

    const prefix = '/data/'
    if (!week.path.startsWith(prefix)) {
      fail(`season ${season.season} week ${week.weekIndex} has an invalid path`)
    }

    assertOwnership(
      readJson(week.path.slice(prefix.length)),
      teamIds,
      `season ${season.season} week ${week.weekIndex}`
    )
    snapshotCount += 1
  }
}

console.log(`Validated ${teams.length} teams and ${snapshotCount} ownership snapshots.`)
