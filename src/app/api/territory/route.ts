import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-static'
export const revalidate = 300 // Revalidate every 5 minutes

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'ownership.json')
    const ownership = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

    return NextResponse.json({ ownership }, {
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
