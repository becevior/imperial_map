import { NextResponse } from 'next/server'
import type { TeamsResponse } from '@/types'

// Mock teams data for development (until Supabase is configured)
const MOCK_TEAMS = [
  {
    id: 'alabama',
    name: 'University of Alabama',
    shortName: 'Alabama',
    mascot: 'Crimson Tide',
    conference: 'SEC',
    colorPrimary: '#9E1B32',
    colorAlt: '#FFFFFF'
  },
  {
    id: 'auburn',
    name: 'Auburn University',
    shortName: 'Auburn',
    mascot: 'Tigers',
    conference: 'SEC',
    colorPrimary: '#0C385B',
    colorAlt: '#DD550C'
  },
  {
    id: 'usc',
    name: 'University of Southern California',
    shortName: 'USC',
    mascot: 'Trojans',
    conference: 'Big Ten',
    colorPrimary: '#990000',
    colorAlt: '#FFCC00'
  },
  {
    id: 'texas',
    name: 'University of Texas',
    shortName: 'Texas',
    mascot: 'Longhorns',
    conference: 'SEC',
    colorPrimary: '#BF5700',
    colorAlt: '#FFFFFF'
  },
  {
    id: 'notre-dame',
    name: 'University of Notre Dame',
    shortName: 'Notre Dame',
    mascot: 'Fighting Irish',
    conference: 'Independent',
    colorPrimary: '#0C2340',
    colorAlt: '#AE9142'
  }
]

export async function GET() {
  try {
    // Check if Supabase is configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      // Use mock data for development
      console.log('Using mock teams data (Supabase not configured)')
      
      const response: TeamsResponse = {
        teams: MOCK_TEAMS
      }

      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          'Content-Type': 'application/json'
        }
      })
    }

    // Use Supabase to fetch real teams data
    const { supabase } = await import('@/lib/supabase')
    const { data: teams, error } = await supabase
      .from('teams')
      .select('id, name, short_name, mascot, conference, color_primary, color_alt, logo_url')
      .order('name')

    if (error) {
      console.error('Supabase error:', error)
      // Fallback to mock data on error
      const response: TeamsResponse = {
        teams: MOCK_TEAMS
      }
      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          'Content-Type': 'application/json',
          'X-Data-Source': 'mock-fallback'
        }
      })
    }

    console.log(`Loading teams from Supabase: ${teams?.length || 0} teams found`)

    // Transform Supabase data to match our API format
    const transformedTeams = teams?.map(team => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name || team.name,
      mascot: team.mascot,
      conference: team.conference,
      colorPrimary: team.color_primary,
      colorAlt: team.color_alt,
      logoUrl: team.logo_url
    })) || []

    const response: TeamsResponse = {
      teams: transformedTeams
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'Content-Type': 'application/json',
        'X-Data-Source': 'supabase'
      }
    })

  } catch (error) {
    console.error('Teams API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}