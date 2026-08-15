'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from 'react'

export const THEMES = [
  { id: 'tecmo', label: 'Tecmo' },
  { id: 'teletext', label: 'Teletext' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'geocities', label: 'GeoCities' },
  { id: 'classic', label: 'Classic' }
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const THEME_STORAGE_KEY = 'imperial-map-theme'
export const DEFAULT_THEME: ThemeId = 'tecmo'

function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

interface ThemeContextValue {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {}
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME)

  useEffect(() => {
    // The pre-paint script in layout.tsx has already applied the stored theme
    // to <html>; sync React state to it after hydration.
    const current = document.documentElement.dataset.theme
    if (isThemeId(current)) {
      setThemeState(current)
    }
  }, [])

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next)
    document.documentElement.dataset.theme = next
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Private browsing or blocked storage — theme still applies for the session.
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
