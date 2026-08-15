'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from 'react'

import { registerEventProperties, trackEvent } from '@/lib/analytics'

export const THEMES = [
  { id: 'tecmo', label: 'Tecmo' },
  { id: 'teletext', label: 'Teletext' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'geocities', label: 'GeoCities' },
  { id: 'classic', label: 'Classic' }
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const THEME_STORAGE_KEY = 'imperial-map-theme'
export const RANDOM_THEME = 'random'
export const DEFAULT_THEME: ThemeId = 'tecmo'

function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

interface ThemeContextValue {
  theme: ThemeId
  /** True when no explicit skin is stored — each page load rolls a random one. */
  randomMode: boolean
  setTheme: (theme: ThemeId) => void
  setRandomTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  randomMode: false,
  setTheme: () => {},
  setRandomTheme: () => {}
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME)
  const [randomMode, setRandomMode] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect --
     One-time post-hydration sync: SSR must render the default theme, and the
     pre-paint script in layout.tsx has already applied the real one to <html>,
     so state can only be reconciled from the DOM after mount. */
  useEffect(() => {
    const current = document.documentElement.dataset.theme
    const landed = isThemeId(current) ? current : DEFAULT_THEME
    setThemeState(landed)

    let explicit = false
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
      explicit = isThemeId(stored)
    } catch {
      explicit = false
    }
    setRandomMode(!explicit)

    // Attach the active skin to every PostHog event so any metric can be
    // segmented by skin — including what random mode dealt this visit.
    registerEventProperties({
      skin: landed,
      skin_mode: explicit ? 'explicit' : 'random'
    })
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  const applyTheme = useCallback((next: ThemeId, stored: string) => {
    setThemeState(next)
    document.documentElement.dataset.theme = next
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, stored)
    } catch {
      // Private browsing or blocked storage — theme still applies for the session.
    }
    registerEventProperties({
      skin: next,
      skin_mode: stored === RANDOM_THEME ? 'random' : 'explicit'
    })
  }, [])

  const setTheme = useCallback(
    (next: ThemeId) => {
      setRandomMode(false)
      trackEvent('skin_selected', { skin: next, previous_skin: theme })
      applyTheme(next, next)
    },
    [applyTheme, theme]
  )

  const setRandomTheme = useCallback(() => {
    const others = THEMES.filter((option) => option.id !== theme)
    const next = others[Math.floor(Math.random() * others.length)].id
    setRandomMode(true)
    trackEvent('skin_randomized', { skin: next, previous_skin: theme })
    applyTheme(next, RANDOM_THEME)
  }, [applyTheme, theme])

  return (
    <ThemeContext.Provider value={{ theme, randomMode, setTheme, setRandomTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
