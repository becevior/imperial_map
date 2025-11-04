'use client'

import { useEffect, useRef } from 'react'

export default function TecmoThrowBanner() {
  const ballGroupRef = useRef<SVGGElement | null>(null)

  useEffect(() => {
    const ballGroup = ballGroupRef.current
    if (!ballGroup) {
      return
    }

    const left = { x: 96, y: 66 }
    const right = { x: 672, y: 66 }
    const peakY = 28
    const duration = 1600
    let direction = 1
    let progress = 0
    let lastTimestamp = performance.now()
    let frameId: number

    const easeInOutQuad = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2)
    const lerp = (a: number, b: number, u: number) => a + (b - a) * u

    const positionAlongArc = (u: number) => {
      const start = direction === 1 ? left : right
      const end = direction === 1 ? right : left
      const x = lerp(start.x, end.x, u)
      const baseLine = lerp(start.y, end.y, u)
      const hump = 1 - 4 * Math.pow(u - 0.5, 2)
      const y = lerp(baseLine, peakY, hump)
      return { x, y }
    }

    const step = (timestamp: number) => {
      const delta = Math.min(64, timestamp - lastTimestamp)
      lastTimestamp = timestamp
      progress += delta / duration

      if (progress >= 1) {
        progress = 0
        direction *= -1
      }

      const eased = easeInOutQuad(progress)
      const { x, y } = positionAlongArc(eased)

      ballGroup.setAttribute('transform', `translate(${x}, ${y})`)

      frameId = window.requestAnimationFrame(step)
    }

    frameId = window.requestAnimationFrame((timestamp) => {
      lastTimestamp = timestamp
      step(timestamp)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [])

  return (
    <div
      className="tecmo-banner"
      role="img"
      aria-label="8-bit football banner: two players throw a ball back and forth"
    >
      <div className="tecmo-banner__bezel" aria-hidden="true" />
      <svg viewBox="0 0 728 120" preserveAspectRatio="none" aria-hidden="true">
        <text
          x="50%"
          y="68"
          textAnchor="middle"
          fontFamily="'Press Start 2P', 'Courier New', monospace"
          fontSize="28"
          fontWeight={900}
          fill="#ffffff"
          style={{ letterSpacing: '4px', paintOrder: 'stroke', stroke: '#000', strokeWidth: 2 }}
        >
          IMPERIAL MAPS
        </text>

        <g>
          <ellipse cx="60" cy="100" rx="22" ry="6" fill="#083b17" opacity="0.55" />
          <rect x="46" y="80" width="10" height="18" fill="#1d47ff" />
          <rect x="58" y="80" width="10" height="18" fill="#1d47ff" />
          <rect x="46" y="96" width="10" height="4" fill="#0e256e" />
          <rect x="58" y="96" width="10" height="4" fill="#0e256e" />
          <rect x="42" y="62" width="40" height="22" fill="#2b66ff" stroke="#0c1e7a" strokeWidth="2" />
          <rect x="58" y="68" width="8" height="10" fill="#fff" />
          <rect x="60" y="70" width="4" height="6" fill="#2b66ff" />
          <rect x="52" y="48" width="22" height="14" fill="#f8c090" stroke="#7a3b13" strokeWidth="2" />
          <rect x="50" y="44" width="26" height="8" fill="#0038ff" />
          <rect x="38" y="66" width="10" height="6" fill="#2b66ff" />
          <rect x="34" y="66" width="6" height="6" fill="#f8c090" />
          <g className="tecmo-banner__arm tecmo-banner__arm--left">
            <rect x="82" y="66" width="10" height="6" fill="#2b66ff" />
            <rect x="92" y="66" width="6" height="6" fill="#f8c090" />
          </g>
        </g>

        <g>
          <ellipse cx="668" cy="100" rx="22" ry="6" fill="#083b17" opacity="0.55" />
          <rect x="654" y="80" width="10" height="18" fill="#d11a1a" />
          <rect x="666" y="80" width="10" height="18" fill="#d11a1a" />
          <rect x="654" y="96" width="10" height="4" fill="#7a0a0a" />
          <rect x="666" y="96" width="10" height="4" fill="#7a0a0a" />
          <rect x="650" y="62" width="40" height="22" fill="#ff3030" stroke="#7a0a0a" strokeWidth="2" />
          <rect x="666" y="68" width="8" height="10" fill="#fff" />
          <rect x="668" y="70" width="4" height="6" fill="#ff3030" />
          <rect x="660" y="48" width="22" height="14" fill="#f8c090" stroke="#7a3b13" strokeWidth="2" />
          <rect x="658" y="44" width="26" height="8" fill="#cc0000" />
          <rect x="690" y="66" width="10" height="6" fill="#ff3030" />
          <rect x="700" y="66" width="6" height="6" fill="#f8c090" />
          <g className="tecmo-banner__arm tecmo-banner__arm--right">
            <rect x="644" y="66" width="10" height="6" fill="#ff3030" />
            <rect x="638" y="66" width="6" height="6" fill="#f8c090" />
          </g>
        </g>

        <g ref={ballGroupRef}>
          <g id="ballSprite">
            <ellipse cx="0" cy="0" rx="8" ry="5" fill="#6b2c00" stroke="#3a1600" strokeWidth="2" />
            <rect x="-2" y="-1" width="4" height="2" fill="#fff" />
            <rect x="-4" y="-1" width="1" height="2" fill="#fff" />
            <rect x="3" y="-1" width="1" height="2" fill="#fff" />
          </g>
        </g>
      </svg>

      <style jsx>{`
        .tecmo-banner {
          position: relative;
          width: 100%;
          aspect-ratio: 728 / 120;
          margin: 0 auto;
          border: 3px solid #ffffff;
          box-shadow: 0 0 0 2px #0000dd, 0 0 0 4px #ffffff;
          image-rendering: pixelated;
          overflow: hidden;
          background: #0b1020;
        }

        .tecmo-banner__bezel {
          position: absolute;
          inset: 0;
          background:
            repeating-linear-gradient(to right, rgba(255, 255, 255, 0.75) 0 2px, transparent 2px 58px),
            repeating-linear-gradient(to right, rgba(255, 255, 255, 0.35) 0 1px, transparent 1px 29px),
            repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 0 8px, rgba(0, 0, 0, 0.06) 8px 16px),
            linear-gradient(180deg, #0e6b2e, #0a4d22);
        }

        .tecmo-banner__bezel::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(to right, rgba(0, 0, 128, 0.55), rgba(0, 0, 128, 0.55)) left/64px 100% no-repeat,
            linear-gradient(to left, rgba(128, 0, 0, 0.55), rgba(128, 0, 0, 0.55)) right/64px 100% no-repeat;
        }

        .tecmo-banner__bezel::before {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(transparent 0 2px, #0e2147 2px 3px);
          opacity: 0.18;
          mix-blend-mode: overlay;
          pointer-events: none;
        }

        svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
        }

        .tecmo-banner__arm {
          transform-box: fill-box;
        }

        .tecmo-banner__arm--left {
          transform-origin: 46px 76px;
          animation: throw-left 3.2s steps(4, end) infinite;
        }

        .tecmo-banner__arm--right {
          transform-origin: 678px 76px;
          animation: throw-right 3.2s steps(4, end) infinite;
        }

        @keyframes throw-left {
          0%,
          10% {
            transform: rotate(10deg);
          }
          20% {
            transform: rotate(-30deg);
          }
          30%,
          100% {
            transform: rotate(10deg);
          }
        }

        @keyframes throw-right {
          0%,
          50%,
          60% {
            transform: rotate(-10deg);
          }
          70% {
            transform: rotate(35deg);
          }
          80%,
          100% {
            transform: rotate(-10deg);
          }
        }

        @keyframes wobble {
          0%,
          100% {
            transform: rotate(-12deg);
          }
          50% {
            transform: rotate(12deg);
          }
        }

        .tecmo-banner :global(#ballSprite) {
          transform-box: fill-box;
          transform-origin: center;
          animation: wobble 0.35s steps(2, end) infinite;
        }

        @media (max-width: 768px) {
          .tecmo-banner {
            aspect-ratio: 728 / 140;
          }
        }
      `}</style>
    </div>
  )
}
