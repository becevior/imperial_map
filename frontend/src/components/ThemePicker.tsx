'use client'

import { THEMES, useTheme } from '@/components/ThemeContext'

export default function ThemePicker() {
  const { theme, randomMode, setTheme, setRandomTheme } = useTheme()

  return (
    <div className="im-picker" role="group" aria-label="Choose site skin">
      <span className="im-picker__label">Skin:</span>
      {THEMES.map((option) => (
        <button
          key={option.id}
          type="button"
          className="im-picker__btn"
          aria-pressed={theme === option.id}
          onClick={() => setTheme(option.id)}
        >
          {option.label}
        </button>
      ))}
      <button
        type="button"
        className="im-picker__btn im-picker__btn--random"
        aria-pressed={randomMode}
        onClick={setRandomTheme}
        title="Roll a random skin — and keep surprising me on every visit"
      >
        Random
      </button>
    </div>
  )
}
