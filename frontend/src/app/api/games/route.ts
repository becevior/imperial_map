import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

function parsePositiveInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const season = parsePositiveInteger(searchParams.get('season'))
    const week = parsePositiveInteger(searchParams.get('week'))

    if (season === null || week === null) {
      return NextResponse.json(
        { error: 'season and week must be non-negative integers' },
        { status: 400 }
      )
    }

    const filePath = path.join(
      process.cwd(),
      'public',
      'data',
      'games',
      String(season),
      `week-${String(week).padStart(2, '0')}.json`
    )

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Games not found' }, { status: 404 })
    }

    const games = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

    return NextResponse.json({ games }, {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      }
    })
  } catch (error) {
    console.error('Error loading games:', error)
    return NextResponse.json(
      { error: 'Failed to load games' },
      { status: 500 }
    )
  }
}
