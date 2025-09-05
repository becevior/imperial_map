import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { GamesResponse } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const season = searchParams.get('season')
    const week = searchParams.get('week')
    const status = searchParams.get('status')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('games')
      .select('*')
      .order('kickoff_time', { ascending: false })
      .range(offset, offset + limit - 1)

    // Add filters
    if (season) {
      query = query.eq('season', parseInt(season))
    }
    if (week) {
      query = query.eq('week', parseInt(week))
    }
    if (status) {
      query = query.eq('status', status)
    }

    const { data: games, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch games data' },
        { status: 500 }
      )
    }

    // Transform to API format
    const response: GamesResponse = {
      games: (games || []).map(game => ({
        id: game.id,
        season: game.season,
        week: game.week,
        kickoffTime: game.kickoff_time,
        status: game.status,
        homeTeamId: game.home_team_id,
        awayTeamId: game.away_team_id,
        homeScore: game.home_score || undefined,
        awayScore: game.away_score || undefined,
        neutralSite: game.neutral_site || false,
        conferenceGame: game.conference_game || false,
        createdAt: game.created_at,
        updatedAt: game.updated_at
      }))
    }

    // Cache headers - shorter cache for games that might update
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    console.error('Games API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}