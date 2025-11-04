'use client'

import { useMemo } from 'react'

import type { ScoreTickerItem } from '@/lib/scoreTicker'

interface RetroTickerMarqueeProps {
  games: ScoreTickerItem[]
  label: string
}

function formatGameLine(game: ScoreTickerItem): string {
  const away = `${game.awayTeam.toUpperCase()} ${game.awayScore}`
  const home = `${game.homeTeam.toUpperCase()} ${game.homeScore}`
  return `${away} @ ${home}`
}

export default function RetroTickerMarquee({ games, label }: RetroTickerMarqueeProps) {
  const lines = useMemo(() => games.map(formatGameLine), [games])

  if (lines.length === 0) {
    return null
  }

  const marqueeContent = lines.join(' | ')

  return (
    <div className="retro-marquee">
      <div className="retro-marquee__halo" aria-hidden="true" />
      <div className="retro-marquee__halo retro-marquee__halo--bottom" aria-hidden="true" />
      <div className="retro-marquee__badge">
        <span className="retro-marquee__badge-text">{label}</span>
      </div>
      <marquee
        behavior="scroll"
        direction="left"
        scrollAmount={6}
        className="retro-marquee__track"
      >
        {marqueeContent}
      </marquee>
      <style jsx>{`
        .retro-marquee {
          position: relative;
          border: 5px ridge #88ddff;
          border-radius: 6px;
          background:
            radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.35) 0, rgba(255, 255, 255, 0) 45%),
            radial-gradient(circle at 75% 30%, rgba(255, 200, 120, 0.25) 0, rgba(255, 200, 120, 0) 55%),
            repeating-linear-gradient(135deg, rgba(0, 255, 255, 0.1) 0, rgba(0, 255, 255, 0.1) 12px, rgba(0, 0, 60, 0.28) 12px, rgba(0, 0, 60, 0.28) 24px),
            linear-gradient(180deg, #051c2f 0%, #020813 65%, #04001a 100%);
          color: #dff9ff;
          font-family: 'Impact', 'Arial Black', 'Verdana', sans-serif;
          text-transform: uppercase;
          box-shadow: inset 0 0 20px rgba(0, 255, 255, 0.25), 0 0 25px rgba(0, 150, 255, 0.35);
          overflow: hidden;
        }

        .retro-marquee__badge {
          position: relative;
          background: linear-gradient(90deg, #fffd87 0%, #ffad0d 40%, #ffe772 60%, #fffd87 100%);
          color: #2a0a63;
          padding: 0.4rem 1.25rem;
          border-bottom: 4px solid rgba(0, 0, 0, 0.45);
          display: flex;
          justify-content: center;
          align-items: center;
          letter-spacing: 0.12em;
          text-shadow: 0 0 4px rgba(255, 255, 255, 0.65);
        }

        .retro-marquee__badge::before,
        .retro-marquee__badge::after {
          content: '*';
          color: #ff006e;
          margin: 0 0.65rem;
          animation: badge-glint 1.4s linear infinite;
        }

        .retro-marquee__badge-text {
          animation: badge-blink 0.85s steps(2, end) infinite;
        }

        .retro-marquee__track {
          display: block;
          padding: 0.75rem;
          font-size: 1rem;
          letter-spacing: 0.18em;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.35), rgba(12, 16, 35, 0.85));
          text-shadow: 2px 2px 0 #000c33, 0 0 8px #66fffb;
        }

        .retro-marquee__halo {
          position: absolute;
          left: -20%;
          right: -20%;
          height: 30px;
          background: radial-gradient(circle, rgba(0, 255, 255, 0.45) 0%, rgba(0, 255, 255, 0) 70%);
          top: -20px;
          transform: skewX(-12deg);
          animation: halo-pulse 2.2s ease-in-out infinite;
        }

        .retro-marquee__halo--bottom {
          top: auto;
          bottom: -24px;
          transform: skewX(12deg);
        }

        @keyframes badge-blink {
          0%,
          50% {
            opacity: 1;
          }
          51%,
          100% {
            opacity: 0.55;
          }
        }

        @keyframes badge-glint {
          0% {
            transform: scale(0.95);
            opacity: 0.6;
          }
          50% {
            transform: scale(1.1);
            opacity: 1;
          }
          100% {
            transform: scale(0.95);
            opacity: 0.6;
          }
        }

        @keyframes halo-pulse {
          0%,
          100% {
            opacity: 0.35;
          }
          50% {
            opacity: 0.75;
          }
        }

        @media (min-width: 768px) {
          .retro-marquee__track {
            font-size: 1.15rem;
          }
        }
      `}</style>
    </div>
  )
}
