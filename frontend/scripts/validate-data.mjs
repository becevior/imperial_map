import fs from 'node:fs'
import path from 'node:path'

const dataDirectory = path.resolve(process.cwd(), 'public', 'data')

function fail(message) {
  throw new Error(`Data validation failed: ${message}`)
}

function readJson(relativePath) {
  const fullPath = path.resolve(dataDirectory, relativePath)
  const resolvedRelativePath = path.relative(dataDirectory, fullPath)
  if (resolvedRelativePath.startsWith('..') || path.isAbsolute(resolvedRelativePath)) {
    fail(`path escapes the data directory: ${relativePath}`)
  }

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

function readTeamIds(relativePath) {
  const teams = readJson(relativePath)
  if (!Array.isArray(teams) || teams.length === 0) {
    fail(`${relativePath} must contain at least one team`)
  }

  const teamIds = new Set(teams.map((team) => team?.id).filter(Boolean))
  if (teamIds.size !== teams.length) {
    fail(`${relativePath} contains missing or duplicate team IDs`)
  }

  return { teams, teamIds }
}

const { teams, teamIds } = readTeamIds('teams.json')

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

  const { teamIds: seasonTeamIds } = readTeamIds(`teams/${season.season}.json`)

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
      seasonTeamIds,
      `season ${season.season} week ${week.weekIndex}`
    )
    snapshotCount += 1
  }
}

const liveManifest = readJson('live.json')
if (
  typeof liveManifest?.version !== 'string' ||
  !Number.isInteger(liveManifest?.season) ||
  !Number.isInteger(liveManifest?.weekIndex) ||
  typeof liveManifest?.generatedAt !== 'string' ||
  !Array.isArray(liveManifest?.finalGameIds)
) {
  fail('live.json is malformed')
}

const liveSeason = ownershipIndex.seasons.find(
  (season) => season.season === liveManifest.season
)
const liveWeek = liveSeason?.weeks.find(
  (week) => week.weekIndex === liveManifest.weekIndex
)
if (!liveWeek || liveWeek.path !== liveManifest.ownershipPath) {
  fail('live.json does not reference the indexed live ownership snapshot')
}

for (const key of ['ownershipPath', 'logosPath', 'leaderboardPath']) {
  const dataPath = liveManifest[key]
  if (typeof dataPath !== 'string' || !dataPath.startsWith('/data/')) {
    fail(`live.json has an invalid ${key}`)
  }
  readJson(dataPath.slice('/data/'.length))
}

console.log(`Validated ${teams.length} teams and ${snapshotCount} ownership snapshots.`)
