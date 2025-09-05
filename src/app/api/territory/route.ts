import { NextResponse } from 'next/server'
import type { TerritoryResponse } from '@/types'

// Mock territory ownership data for development
const MOCK_TERRITORIES = [
  { fips: '01001', ownerTeamId: 'alabama', version: 1 },    // Autauga County, AL
  { fips: '01003', ownerTeamId: 'auburn', version: 1 },     // Baldwin County, AL
  { fips: '06037', ownerTeamId: 'usc', version: 1 },       // Los Angeles County, CA
  { fips: '48201', ownerTeamId: 'texas', version: 1 },     // Harris County, TX
  { fips: '17031', ownerTeamId: 'notre-dame', version: 1 }  // Cook County, IL
]

export async function GET() {
  try {
    // Check if Supabase is configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      // Use mock data for development
      console.log('Using mock territory data (Supabase not configured)')
      
      const datasetVersion = Date.now() // Simple versioning for development
      
      const response: TerritoryResponse = {
        datasetVersion,
        territories: MOCK_TERRITORIES
      }

      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
          'ETag': `"${datasetVersion}"`,
          'Content-Type': 'application/json'
        }
      })
    }

    // TODO: When Supabase is configured, use real database query
    // const { supabase } = await import('@/lib/supabase')
    // const { data: ownership, error } = await supabase
    //   .from('territory_ownership')
    //   .select('fips_code, owner_team_id, version, updated_at')
    //   .order('updated_at', { ascending: false })

    // For now, still return mock data even if Supabase is configured
    const datasetVersion = Date.now()
    
    const response: TerritoryResponse = {
      datasetVersion,
      territories: MOCK_TERRITORIES
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        'ETag': `"${datasetVersion}"`,
        'Content-Type': 'application/json',
        'X-Data-Source': 'mock'
      }
    })

  } catch (error) {
    console.error('Territory API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Handle conditional requests
export async function HEAD(request: Request) {
  const response = await GET()
  const headers = new Headers(response.headers)
  return new NextResponse(null, {
    status: response.status,
    headers
  })
}