import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-static'
export const revalidate = 3600 // Revalidate every hour

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'teams.json')
    const teams = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

    return NextResponse.json({ teams }, {
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      }
    })
  } catch (error) {
    console.error('Error loading teams:', error)
    return NextResponse.json(
      { error: 'Failed to load teams' },
      { status: 500 }
    )
  }
}
