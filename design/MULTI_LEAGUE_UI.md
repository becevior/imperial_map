# Multi-League UI Specification

Status: NFL vertical slice implemented; MLS remains proposed
Companion to: [`MULTI_LEAGUE_ARCHITECTURE.md`](./MULTI_LEAGUE_ARCHITECTURE.md)

## Recommendation

Use direct league tabs as the primary navigation. They should look and feel like tabs,
but be implemented as normal links to league routes rather than an in-memory ARIA
tablist.

The initial order is:

```text
COLLEGE FOOTBALL    NFL    MLS
```

Tabs belong immediately below the league-aware masthead and above the HUD and map. A
league switch changes the entire experience: masthead copy, live status, teams, map
ownership, period controls, ticker, dispatch, and leaderboards. Season and period remain
secondary controls inside the map bar.

This is preferable to a league dropdown because:

- Three choices fit comfortably and stay discoverable.
- The user can compare what is available without opening a control.
- The active league is always visible.
- The visual treatment fits every existing theme.
- A league switch is a navigation event, not a filter applied to one component.

If the app grows beyond four or five enabled leagues, keep the most-used leagues as
tabs and add a `MORE` menu. Do not introduce sport-level navigation until multiple
leagues within the same sport make it useful.

## Screen anatomy

### Desktop

```text
┌───────────────────────────────────────────────────────────────┐
│                                              [THEME CONTROLS] │
├───────────────────────────────────────────────────────────────┤
│                    LEAGUE-AWARE MASTHEAD                       │
│              NFL IMPERIAL MAP · SEASON 2026                    │
├───────────────────┬───────────────┬───────────────────────────┤
│ COLLEGE FOOTBALL  │  NFL (ACTIVE) │  MLS                      │
├───────────────────┴───────────────┴───────────────────────────┤
│ LEADER: ...             HI SCORE: ...             WEEK 8      │
├───────────────────────────────────────────────────────────────┤
│ TERRITORY MAP                                               │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Week 8 · 32 teams · 3,143 counties  [2026] [Week 8] [▶] │ │
│ ├───────────────────────────────────────────────────────────┤ │
│ │                                                           │ │
│ │                         MAP                               │ │
│ │                                                           │ │
│ └───────────────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────────┤
│ SCORES / CONQUEST DISPATCH                                    │
├───────────────────────────────────────────────────────────────┤
│ PERIOD LEADERBOARDS                                           │
└───────────────────────────────────────────────────────────────┘
```

### Mobile

```text
┌──────────────────────────────┐
│ MASTHEAD                     │
├──────────┬──────────┬────────┤
│ CFB      │ NFL      │ MLS    │
├──────────┴──────────┴────────┤
│ HUD                          │
├──────────────────────────────┤
│ WEEK 8                       │
│ 32 teams · 3,143 counties    │
│ [‹] [2026] [›]               │
│ [‹] [Week 8] [›] [Play]      │
├──────────────────────────────┤
│ MAP                          │
└──────────────────────────────┘
```

Use short `CFB`, `NFL`, and `MLS` labels on narrow screens. Provide the full league name
as accessible text. With three leagues, each tab can take one-third of the width; do not
make the primary switcher horizontally scroll for the initial release.

## Navigation semantics and URLs

The tabs are a `<nav aria-label="League">` containing links. The current link uses
`aria-current="page"`. Do not use `role="tab"`: each selection has a distinct URL and
represents page navigation, not a client-only panel swap.

Recommended routes:

```text
/cfb
/nfl
/mls
/cfb?season=2024&period=10
/nfl?season=2025&period=18
```

The route slug is more legible than `/?league=nfl` and provides a hard boundary for
server loading, error handling, analytics, and future metadata. `/` resolves to or
redirects to the catalog's default league (`/cfb` initially). Existing root links may
continue rendering CFB during migration.

URL state is authoritative:

- An explicit season and period always wins over remembered state.
- A bare league route opens that league's latest published period.
- While browsing, remember the last explicit URL visited for each league in the current
  session. A tab may link back to that URL so switching away and back restores context.
- Browser back/forward must traverse league, season, and period changes naturally.
- Copying the URL must reproduce the same selection on another device.

## Switching behavior

When a user chooses another league:

1. Stop any running timelapse.
2. Close the open territory popup; its owner is no longer valid in the new league.
3. Update the route and active tab immediately.
4. Replace league-dependent content with an in-theme loading state. Never show the old
   league's map, HUD, ticker, or leaderboard below the newly active tab.
5. Load the league bootstrap data and its selected/latest snapshot.
6. Render the whole selected league as one coherent state.
7. If loading fails, keep the chosen tab active and show a retry action in the content
   area. Do not silently fall back to CFB.

Preserve the user's visual theme across leagues. Preserve the map camera when both
leagues use the same `geographyId`; reset to configured bounds when geography changes.
Camera preservation can follow the initial release if it complicates the MapLibre
lifecycle.

Prefetch the small league definition and season index for other visible tabs after the
current page is interactive. Do not prefetch every league's teams, ownership snapshots,
or leaderboards.

## What changes with the active league

| Surface | CFB example | NFL example | MLS example |
|---|---|---|---|
| Masthead eyebrow | College Football | National Football League | Major League Soccer |
| Period text | Regular Week 8 | Week 8 | Week of May 4 |
| Group metadata | Conference | Division | Conference |
| Team noun | Programs | Teams | Clubs |
| Map unit | Counties | Counties | Counties or regions |
| Scores | Football score | Football score | Soccer score / draw |
| Banner art | Football | Football | Soccer or neutral conquest art |
| Competition scope | FBS season + postseason | Regular season + playoffs | MLS season + MLS Cup playoffs |

The page title should be league-aware, but the product identity stays stable. A useful
copy hierarchy is:

```text
IMPERIAL MAP                 product
NFL                          active league
SEASON 2026 · WEEK 8         current selection
```

Avoid baking `CFB`, `football`, `Saturday`, `conference`, or `week` into shared
components. League configuration supplies the visible words while shared code uses
`league`, `group`, `period`, and `territory unit`.

Specific current copy that must become league-aware includes:

- Masthead references to CFB, College Football, programs, and Saturday.
- `Field view — continental situation`.
- `Weekly Leaderboards`.
- `COUNTIES` in dispatch and metric descriptions when geography changes.
- Score ticker labels and its search for the latest global season.
- The map bar's `Season` and `Week` control labels.

## Tabs in the five themes

Build one semantic component (`.im-league-nav` and `.im-league-link`) and style it in
each skin alongside the existing `.im-*` system.

| Theme | Treatment | Active state |
|---|---|---|
| Tecmo | cartridge/menu buttons in one rail | blue fill, chalk border, gold marker |
| Teletext | fastext navigation row | bright text plus current-page block |
| Ledger | manila file tabs | raised paper tab with red top rule |
| GeoCities | compact beveled button bar | inset button and `YOU ARE HERE` treatment |
| Classic | conventional bordered tabs | dark text, white surface, strong bottom rule |

The active state must not rely on color alone. Use border/position/icon treatment and
`aria-current`. Focus styling must remain at least as strong as the active styling.

Do not put official league logos in the tabs for the first release. Text is clearer at
small sizes, works across all themes, avoids asset/licensing inconsistency, and keeps
the control from competing with team logos on the map.

## League availability

Only show a normal tab when its minimum usable artifact set has been published. The
catalog controls ordering and availability.

```json
{
  "id": "nfl",
  "name": "NFL",
  "shortName": "NFL",
  "route": "/nfl",
  "status": "available"
}
```

Supported statuses:

- `available`: normal navigation.
- `preview`: navigable, visibly labeled beta/preview, with at least one complete season.
- `hidden`: omitted from the public switcher.

Avoid disabled `COMING SOON` tabs. They consume primary navigation without completing
an action. Announce future leagues elsewhere, then add the tab when there is a usable
destination.

An unknown league route returns a themed not-found state with links to available
leagues. A known league with no published season returns an explicit unavailable state;
it must not borrow another league's latest data.

## State ownership in the frontend

The current page independently finds latest leaderboards and ticker data, while the map
loads its own global indexes. Multi-league UI needs one selected-league bootstrap so the
shell cannot assemble mismatched data.

```ts
interface LeagueBootstrap {
  league: LeaguePresentation
  geography: GeographyDefinition
  seasons: SeasonIndexEntry[]
  selection: {
    season: number
    periodIndex: number
  }
  activePeriod: TimelinePeriod
  teamsPath: string
  ownershipPath: string
  markersPath: string
  leaderboardPath: string
  scoresPath?: string
  liveManifestPath: string
}
```

The league route resolves this bootstrap on the server and passes one coherent value to
the masthead, dashboard, map, ticker, and leaderboard components. Child components
must consume provided paths rather than reconstructing paths or scanning for a global
latest season.

Recommended component outline:

```text
app/[leagueId]/page.tsx
└── LeaguePage
    ├── ThemePicker
    ├── Masthead(league, selection)
    ├── LeagueNav(catalog, activeLeagueId)
    └── LeagueDashboard(bootstrap)
        ├── Hud
        ├── TerritoryPanel
        │   ├── TerritoryControls
        │   └── TerritoryMap
        ├── ScoreTicker
        ├── ConquestDispatch
        └── Leaderboards
```

`LeaguePage` should be keyed by `leagueId` so league-scoped client state cannot leak
through a route transition. Caches use at least
`(leagueId, season, periodIndex, artifactVersion)`.

## Working backward to artifact requirements

The tab experience requires only one global file: the league catalog. Once a league is
selected, every request must be under that league namespace.

```text
/data/catalog.json
/data/leagues/cfb/...
/data/leagues/nfl/...
/data/leagues/mls/...
```

The UI needs these catalog fields:

```text
id, name, shortName, route, status, order
configPath, seasonIndexPath, liveManifestPath
```

The selected league definition supplies:

```text
sport, geographyId, mastheadVariant
teamLabel, groupLabel, periodLabel
territoryUnitSingular, territoryUnitPlural
competitionScopeLabel, defaultMapBounds
```

The selected season index supplies exact artifact paths per period. This lets the UI
render NFL or MLS without knowing how either league organizes a season. It also removes
the current hard-coded leaderboard and marker path construction.

## Analytics

Track league navigation separately from period filtering:

```text
league_selected
  league_id
  previous_league_id
  destination_season
  destination_period_index
  source = league_nav
```

Every existing map, period, ticker, and leaderboard event gains `league_id`. Track
`league_load_failed` with the failed artifact class, but never send full provider URLs
or exception payloads.

Useful initial questions are:

- What percentage of visitors switch leagues?
- Which tab drives first interaction?
- Do users return to a previous league/period in one session?
- Does MLS geography explanation cause abandonment or engagement?

## UI-first implementation sequence

### 1. Add the shell with CFB only

- Create the catalog with one available CFB entry.
- Add `LeagueNav` and the `/cfb` route.
- Make all current page copy receive a league presentation object.
- Keep current CFB artifacts behind a temporary compatibility bootstrap.

This makes the UI and URL real without waiting for backend generalization.

### 2. Prove route and state isolation

- Add an internal fixture league with tiny generated artifacts.
- Test tab navigation, loading, errors, back/forward, deep links, and stale-data
  prevention.
- Move map, leaderboard, ticker, and live caches under league-aware keys.

The fixture can remain test-only; do not expose a dead public tab.

### 3. Add NFL as the second public tab

- Publish NFL artifacts and mark it available in the catalog.
- Add NFL masthead copy, grouping labels, and period labels.
- Reuse the existing football art unless a distinct NFL presentation is desired.

No switcher code should change when NFL becomes available; publishing the catalog entry
is what exposes it.

### 4. Add MLS as preview, then available

- Publish the chosen U.S. or U.S.+Canada geography and MLS artifacts.
- Add draw-aware score presentation and soccer/neutral masthead art.
- Mark the entry `preview` while geography or historical coverage is intentionally
  limited, then `available` when the stated scope is complete.

## Acceptance criteria

- CFB, NFL, and MLS are reachable by visible top-level links on desktop and mobile.
- The active league is identifiable visually, by screen reader, and from the URL.
- A league switch changes all league-dependent surfaces together with no stale flash.
- Theme persists across league switches.
- Season and period selections are deep-linkable and browser navigation works.
- Returning to a league restores its session selection when the tab link carries that
  remembered URL; a copied bare league URL still resolves to latest.
- A failed or empty league never displays another league's data.
- Keyboard focus follows normal link behavior and remains visible in every theme.
- Tabs fit at 360 px without truncating NFL or MLS; CFB uses its short label.
- Adding a published fourth league requires a catalog entry and presentation data, not
  changes to `LeagueNav`.
- All league-specific analytics include `league_id`.

## Deliberate non-goals for the first release

- A combined all-league map.
- Cross-league territory transfers.
- A league comparison dashboard.
- User-configurable ordering or favorite leagues.
- A two-level sport-then-league navigator.
- Loading multiple leagues' full datasets in one page.

The tabs should make the product feel like one arcade cabinet with several cartridges:
the cabinet, controls, and rules are familiar, while each league loads its own season,
teams, presentation, and territory state.
