# Imperial Map — Style Guide (v1)

Companion to `design/directions.html` (open it in a browser to see all four directions
rendered with real data).

**Status: all four directions shipped as user-selectable skins, plus a fifth
"Classic" skin preserving the site's original 2025 look** (white cards, rounded
corners, default-Tailwind styling, neon marquee ticker). The skin system lives in
`frontend/src/app/globals.css` — semantic `.im-*` component classes switched by
`[data-theme]` on `<html>` (`tecmo | teletext | ledger | geocities | classic`), with
`ThemeContext.tsx` / `ThemePicker.tsx` handling selection and localStorage persistence.
When adding UI, style it once per theme using the semantic classes; never introduce
theme-agnostic default styling (see rules below).

This guide fully specifies the flagship skin — **"Tecmo Saturday"** — and keeps token
notes for the other three at the end.

The rule that governs everything: **this site is a broadcast of a video game, not a web
app.** Every component should look like it belongs on a CRT in 1991 — either as part of
an NES sports cartridge (chrome, menus, HUD) or as broadcast text graphics (tickers,
tables). If a component would look at home in a shadcn dashboard, it's wrong.

---

## 1. Direction: Tecmo Saturday

The banner already established it: NES-era sports game. We commit. The map is the
playfield. Leaderboards are the post-game stats screen. The week selector is a menu.
Territory changes are announced like a game event ("!! CONQUEST !!").

Dense data screens (standings tables, county history) borrow from the sibling direction
"Saturday Teletext" — same CRT world, amber-phosphor mono tables — so data stays legible
without breaking character.

## 2. Color tokens

Derived from the existing banner plus the NES hardware palette. Team territories on the
map keep their real brand colors (that data already exists in `logo-colors.json`); these
tokens are the *chrome* around them.

| Token | Hex | Use |
|---|---|---|
| `--night` | `#0B1020` | Page background (the existing banner bg) |
| `--screen` | `#060A18` | Panel/screen interiors (slightly darker than page) |
| `--turf` | `#0E6B2E` → `#0A4D22` | Field-green bands: masthead, section headers |
| `--chalk` | `#F8F8F8` | Primary text, panel bezels, yard lines |
| `--gold` | `#FCC400` | Scores, numbers, emphasis — anything that "counts" |
| `--p1-blue` | `#2B66FF` | Interactive chrome: buttons, focus, outer bezels |
| `--p2-red` | `#F83800` | Alerts, conquest events, losses (NES red) |
| `--sky` | `#7EC8FF` | Secondary/metadata text on dark |
| `--shadow` | `#000000` | Hard shadows only |

Rules:
- Numbers are always `--gold`. A score, a county count, a population — gold. This is the
  single most recognizable habit of NES sports games.
- `--p2-red` is reserved for events (conquests, losses, errors). Never decorative.
- No color at less than full saturation. No pastel, no `rgba()` tints for text.

## 3. Typography

Three faces, strict roles. All from Google Fonts.

| Role | Face | Rules |
|---|---|---|
| Display | **Press Start 2P** | Panel labels, masthead, buttons. ALL CAPS. 9–26px only. Never body text — it's illegible below 9px and oppressive in paragraphs. |
| UI / body | **Silkscreen** | Nav, HUD lines, short labels, leaderboard team names. Letter-spacing `.06em`+. |
| Data | **VT323** | Tables, the ticker, anything dense or numeric. Runs ~2× smaller optically, so set it 19–22px. This is the "teletext screen" voice. |

No sans-serif system font appears anywhere users can see. Type is never anti-aliased
away from its pixel grid: avoid font sizes that blur these faces (Press Start 2P at
multiples of 8 or 16 where possible).

## 4. Chrome: borders, shadows, radius

- **Radius: 0.** Everywhere. No exceptions. Rounded corners are the fastest way back to
  the generic look.
- **Panels are "screens":** `border: 4px solid var(--chalk); box-shadow: 0 0 0 4px
  var(--p1-blue), 8px 8px 0 rgba(0,0,0,.6);` with a chalk label bar on top
  (Press Start 2P, 9px, dark-on-light).
- **Shadows never blur.** Hard offsets only (`8px 8px 0`). Blur = 2010s web.
- **Buttons:** blue fill, 3px chalk border, `4px 4px 0 #000` shadow; on `:active` the
  button translates by the shadow offset and the shadow disappears (it "presses in").
- **Scanlines:** one fixed overlay on `body::after` (`repeating-linear-gradient`,
  2px transparent / 1px dark, ~0.35 opacity). Never per-component — one CRT, one screen.

## 5. Motion

Motion is sprite motion. Three rules:

1. **`steps()` easing only.** Nothing tweens smoothly; things tick. Blink cursors use
   `steps(2)`, sprite cycles `steps(4)`. The existing banner already does this correctly.
2. **One ambient animation per screenful** (the banner throw, the ticker scroll, one
   blinking cursor). Everything else animates only on interaction or data change.
3. **Territory-change moment:** when the user steps between weeks, flipped counties
   flash 2 frames chalk→team-color (steps(2), ~300ms) like a captured piece. This is the
   signature interaction — the one place we spend real effort.

`prefers-reduced-motion: reduce` kills all of it; the ticker becomes a static row.

## 6. Component recipes

- **Masthead** — keep `TecmoThrowBanner` as-is; retire the gray page behind it. It sits
  on `--night` directly, no white card, no rounded container.
- **HUD bar** — black strip under the masthead: `LEADER: INDIANA 1813` /
  `HI SCORE: 205,189,094 POP` / `WK 17/17`. Silkscreen 12px. This replaces the
  "Weekly Leaderboards · Week 17" heading-and-caption pattern.
- **Map** — inside a screen panel labeled `FIELD VIEW — 3143 COUNTIES`. MapLibre canvas
  keeps its real colors; give the container `image-rendering: pixelated` fog only via
  the scanline overlay, not a filter on the canvas (keep the map readable).
- **Leaderboards** — one screen panel, `POST GAME STATS` label, VT323 rows, gold
  numbers, blinking `►` cursor on the #1 row. Kill the five white cards; use tabs
  (Press Start 2P, 9px) to switch between the five metrics instead of a 2×2 card grid.
- **Week selector** — `◀ SELECT WEEK: POSTSEASON 1 ▶` pixel buttons; the season/week
  `<select>`s get the button treatment (chalk border, blue fill, no native chrome).
- **Ticker** — replace the neon `<marquee>` with the gold-on-black VT323 strip
  (double gold rule top/bottom). It's the BottomLine, not a Vegas sign. (Keep
  `<marquee>` as the engine if you like the bit — style it; the tag is the joke.)
- **Conquest dispatch** — data-driven event line under the ticker, `--p2-red`,
  Press Start 2P 10px: `!! CONQUEST !! INDIANA SEIZES 214 COUNTIES`.
- **Loading / errors** — in-world: `LOADING WEEK DATA…` with a blinking `▮`;
  `NO DATA FOR THIS WEEK — PRESS ◀` instead of the gray "not available" card.

## 7. Quality floor (non-negotiable)

- Contrast: gold/chalk/sky on `--night` all clear AA at the sizes used; VT323 below
  19px is off-limits.
- Focus: `outline: 3px solid var(--gold); outline-offset: 2px` on everything focusable.
- Responsive to 360px: panels stack, ticker stays one line, map keeps 16:10 min-height.
- The map's information (who owns what) is never encoded in chrome color tokens —
  team colors come from data.

## 8. Implementation notes

- **Keep Next.js + MapLibre.** The sameness problem is component defaults, not React.
  Vanilla JS would cost the map/data plumbing and buy nothing visual.
- **Retire the default-Tailwind layer.** `bg-white rounded-lg shadow-lg`, gray
  gradients, `divide-gray-100` — all replaced by the recipes above. Tailwind can stay
  for layout (flex/grid/spacing), but every visible surface uses these tokens, defined
  as CSS custom properties in `globals.css`.
- Fonts via `next/font` (Press Start 2P, Silkscreen, VT323) to avoid FOUT flashing the
  system font — a pixel font flashing to Helvetica breaks the whole illusion.

---

## Alternates (tokens kept for reference)

**02 · Saturday Teletext** — pure black `#000`, amber `#FFB000`, green `#33FF33`, cyan
`#00FFFF`, service blue `#2222FF`; VT323 only; fastext color-key nav; pages numbered
P100/P200/P300. *Already partially absorbed into the recommendation as the data voice.*

**03 · The Conquest Ledger** — field paper `#D8CDAA`, ink `#241F17`, olive `#4A4A2F`,
grease-pencil `#9E2B25`, map blue `#2D4A66`; Big Shoulders Stencil + Special Elite;
wire-dispatch announcements, CAPTURED stamps, manila file-tab week selector. The
strongest *thematic* fit for "imperial" — pick this if you'd rather the site feel like a
war room than an arcade. Incompatible with the Tecmo banner; it would be replaced by a
stenciled masthead.

**04 · Gridiron GeoCities** — starfield navy `#000066`, silver `#C0C0C0`, yellow, red,
LED green; system Times/Verdana/Courier; hit counter, web ring, under-construction bar.
Funniest, most "old web"; hardest to keep from undermining the data. Works best as a
seasoning (guestbook page, 404, footer) on top of another direction rather than the
whole site.
