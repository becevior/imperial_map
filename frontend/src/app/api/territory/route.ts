import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

interface OwnershipWeek {
  weekIndex: number
  label?: string
  path?: string
}

interface OwnershipSeason {
  season: number
  weeks: OwnershipWeek[]
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function resolveDataPath(dataDirectory: string, dataPath: string): string | null {
  const filePath = path.resolve(dataDirectory, dataPath.slice('/data/'.length))
  const relativePath = path.relative(dataDirectory, filePath)

  return relativePath.startsWith('..') || path.isAbsolute(relativePath) ? null : filePath
}

export async function GET(request: Request) {
  try {
    const dataDirectory = path.join(process.cwd(), 'public', 'data')
    const indexPath = path.join(dataDirectory, 'ownership', 'index.json')
    const ownershipIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    const seasons: OwnershipSeason[] = Array.isArray(ownershipIndex.seasons)
      ? ownershipIndex.seasons
      : []
    const { searchParams } = new URL(request.url)
    const requestedSeason = parsePositiveInteger(searchParams.get('season'))
    const requestedWeek = parsePositiveInteger(searchParams.get('week'))

    if ((searchParams.has('season') && requestedSeason === null) ||
        (searchParams.has('week') && requestedWeek === null)) {
      return NextResponse.json(
        { error: 'season and week must be non-negative integers' },
        { status: 400 }
      )
    }

    const season = requestedSeason === null
      ? [...seasons].sort((a, b) => b.season - a.season)[0]
      : seasons.find((entry) => entry.season === requestedSeason)

    if (!season || !Array.isArray(season.weeks)) {
      return NextResponse.json({ error: 'Season not found' }, { status: 404 })
    }

    const week = requestedWeek === null
      ? [...season.weeks].sort((a, b) => b.weekIndex - a.weekIndex)[0]
      : season.weeks.find((entry) => entry.weekIndex === requestedWeek)

    if (!week?.path || !week.path.startsWith('/data/')) {
      return NextResponse.json({ error: 'Week not found' }, { status: 404 })
    }

    const filePath = resolveDataPath(dataDirectory, week.path)
    if (!filePath) {
      return NextResponse.json({ error: 'Week path is invalid' }, { status: 500 })
    }

    const ownership = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

    return NextResponse.json({
      season: season.season,
      weekIndex: week.weekIndex,
      label: week.label,
      ownership
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      }
    })
  } catch (error) {
    console.error('Error loading ownership:', error)
    return NextResponse.json(
      { error: 'Failed to load territory ownership' },
      { status: 500 }
    )
  }
}
