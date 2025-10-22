import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const season = searchParams.get('season') || '2024'
    const week = searchParams.get('week') || '1'

    const filePath = path.join(
      process.cwd(),
      'public',
      'data',
      'games',
      `${season}-week-${week}.json`
    )

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ games: [] })
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
