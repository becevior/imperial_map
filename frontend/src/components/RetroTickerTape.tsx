'use client'

import { useMemo } from 'react'

import type { ScoreTickerItem } from '@/lib/scoreTicker'

interface RetroTickerTapeProps {
  games: ScoreTickerItem[]
  label: string
}

function buildTickerText(game: ScoreTickerItem): string {
  const away = `${game.awayTeam.toUpperCase()} ${game.awayScore}`
  const home = `${game.homeTeam.toUpperCase()} ${game.homeScore}`
  return `${away} // ${home}`
}

export default function RetroTickerTape({ games, label }: RetroTickerTapeProps) {
  const textItems = useMemo(() => games.map(buildTickerText), [games])

  if (textItems.length === 0) {
    return null
  }

  const loopContent = [...textItems, ...textItems, ...textItems]

  return (
    <div className="retro-tape">
      <div className="retro-tape__header">
        <span className="retro-tape__lamp" aria-hidden="true" />
        <span className="retro-tape__label">{label}</span>
        <span className="retro-tape__lamp" aria-hidden="true" />
      </div>
      <div className="retro-tape__viewport">
        <div className="retro-tape__belt">
          {loopContent.map((item, index) => (
            <span className="retro-tape__item" key={`${item}-${index}`}>
              || {item}
            </span>
          ))}
        </div>
      </div>
      <style jsx>{`
        .retro-tape {
          position: relative;
          font-family: 'Lucida Console', 'Monaco', monospace;
          background:
            repeating-linear-gradient(90deg, rgba(0, 40, 60, 0.45) 0, rgba(0, 40, 60, 0.45) 14px, rgba(0, 0, 0, 0.7) 14px, rgba(0, 0, 0, 0.7) 28px),
            linear-gradient(180deg, #030d26 0%, #001335 55%, #08135a 100%);
          border: 8px double #5cf2ff;
          color: #9ffaff;
          box-shadow: inset 0 0 25px rgba(0, 255, 255, 0.3), 0 14px 24px rgba(0, 0, 0, 0.55);
          text-transform: uppercase;
        }

        .retro-tape__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.45rem 1rem;
          background: linear-gradient(90deg, #ff0076 0%, #ff6600 50%, #ffef47 100%);
          color: #0a012a;
          letter-spacing: 0.2em;
          font-size: 0.78rem;
          text-transform: uppercase;
          border-bottom: 3px solid rgba(0, 0, 0, 0.55);
          text-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
        }

        .retro-tape__lamp {
          display: inline-block;
          width: 0.6rem;
          height: 0.6rem;
          border-radius: 50%;
          background: radial-gradient(circle, #ffffff 0%, #ffe680 40%, #ff0076 100%);
          box-shadow: 0 0 10px rgba(255, 255, 0, 0.85);
          animation: lamp-flicker 1.2s steps(3, end) infinite;
        }

        .retro-tape__label {
          flex: 1;
          text-align: center;
          font-weight: 700;
          animation: label-glow 1.6s ease-in-out infinite;
        }

        .retro-tape__viewport {
          overflow: hidden;
          background:
            radial-gradient(circle at 10% 10%, rgba(255, 255, 255, 0.25) 0, rgba(255, 255, 255, 0) 45%),
            linear-gradient(180deg, rgba(0, 0, 0, 0.75), rgba(0, 20, 60, 0.95));
          border-top: 2px solid rgba(0, 255, 255, 0.35);
          border-bottom: 2px solid rgba(0, 255, 255, 0.35);
          padding: 0.45rem 0;
        }

        .retro-tape__belt {
          display: inline-flex;
          white-space: nowrap;
          animation: tape-scroll 32s linear infinite;
        }

        .retro-tape__item {
          display: inline-flex;
          align-items: center;
          padding: 0 1.75rem;
          color: #a6f8ff;
          font-size: 0.9rem;
          text-shadow: 2px 2px 0 #010a2a, 0 0 6px rgba(0, 255, 255, 0.65);
          letter-spacing: 0.18em;
        }

        @keyframes tape-scroll {
          from {
            transform: translateX(0);
          }

          to {
            transform: translateX(-66.666%);
          }
        }

        @keyframes lamp-flicker {
          0%,
          100% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
        }

        @keyframes label-glow {
          0%,
          100% {
            text-shadow: 0 0 4px rgba(255, 255, 255, 0.4);
          }
          50% {
            text-shadow: 0 0 12px rgba(255, 255, 255, 0.9);
          }
        }

        @media (min-width: 768px) {
          .retro-tape__item {
            font-size: 1.05rem;
          }
        }
      `}</style>
    </div>
  )
}
