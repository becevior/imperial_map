import TecmoThrowBanner from '@/components/TecmoThrowBanner'

interface MastheadProps {
  weekLabel: string
  season: number | null
}

/**
 * Renders every skin's masthead; CSS shows only the active one via
 * [data-theme] rules so theme switching never causes a hydration mismatch.
 */
export default function Masthead({ weekLabel, season }: MastheadProps) {
  const seasonText = season ? `Season ${season}` : ''

  return (
    <header>
      <div className="im-mast im-mast--tecmo">
        <TecmoThrowBanner />
        <p className="im-mast-tecmo__kick">
          {seasonText ? `${seasonText} · ` : ''}
          {weekLabel} <span className="im-blink">▮</span>
        </p>
      </div>

      <div className="im-mast im-mast--teletext">
        <div className="im-mast-ttx__head">
          <span>
            <b className="im-mast-ttx__pageno">P100</b> CFB IMPERIAL
          </span>
          <span>
            {seasonText} {weekLabel}
          </span>
        </div>
        <div className="im-mast-ttx__title">IMPERIAL MAP</div>
        <div className="im-mast-ttx__sub">
          Territorial control — winner takes all
        </div>
        <div className="im-mast-ttx__rule" aria-hidden="true" />
      </div>

      <div className="im-mast im-mast--ledger">
        <p className="im-mast-ldg__over">College Football Territorial Command</p>
        <h1 className="im-mast-ldg__title">The Conquest Ledger</h1>
        <p className="im-mast-ldg__under">
          136 programs · 3,143 counties · winner takes all
        </p>
        <span className="im-mast-ldg__stamp">{weekLabel}</span>
      </div>

      <div className="im-mast im-mast--geocities">
        <div className="im-mast-geo__box">
          <h1 className="im-mast-geo__title">
            <span className="im-mast-geo__ball" aria-hidden="true">
              🏈
            </span>{' '}
            College Football IMPERIAL MAP{' '}
            <span className="im-mast-geo__ball" aria-hidden="true">
              🏈
            </span>
          </h1>
          <p className="im-mast-geo__tag">
            <span className="im-mast-geo__new">NEW!</span>
            Updated every Saturday nite — winner takes ALL the counties!!
          </p>
        </div>
      </div>
    </header>
  )
}
