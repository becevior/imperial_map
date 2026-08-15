'use client'

import type { ScoreTickerItem } from '@/lib/scoreTicker'

interface ScoreTickerProps {
  games: ScoreTickerItem[]
  label: string
}

function formatGameLine(game: ScoreTickerItem): string {
  const away = `${game.awayTeam.toUpperCase()} ${game.awayScore}`
  const home = `${game.homeTeam.toUpperCase()} ${game.homeScore}`
  return `${away} @ ${home}`
}

export default function ScoreTicker({ games, label }: ScoreTickerProps) {
  if (games.length === 0) {
    return null
  }

  return (
    <div className="im-ticker">
      <div className="im-ticker__badge">{label}</div>
      <marquee behavior="scroll" direction="left" scrollamount={6} className="im-ticker__track">
        {games.map((game) => (
          <span key={game.id} className="im-ticker__item">
            {formatGameLine(game)}
          </span>
        ))}
      </marquee>
    </div>
  )
}
