'use client'

import Link from 'next/link'

import { trackEvent } from '@/lib/analytics'
import { LEAGUES, type LeagueDefinition } from '@/lib/leagues'

interface LeagueNavProps {
  activeLeagueId: LeagueDefinition['id']
}

export default function LeagueNav({ activeLeagueId }: LeagueNavProps) {
  return (
    <nav className="im-league-nav" aria-label="League">
      {LEAGUES.map((league) => (
        <Link
          key={league.id}
          href={league.route}
          className="im-league-link"
          aria-current={league.id === activeLeagueId ? 'page' : undefined}
          onClick={() => {
            if (league.id !== activeLeagueId) {
              trackEvent('league_selected', {
                league_id: league.id,
                previous_league_id: activeLeagueId,
                source: 'league_nav'
              })
            }
          }}
          prefetch
        >
          <span className="im-league-link__full">{league.name}</span>
          <span className="im-league-link__short" aria-hidden="true">
            {league.shortName}
          </span>
        </Link>
      ))}
    </nav>
  )
}
