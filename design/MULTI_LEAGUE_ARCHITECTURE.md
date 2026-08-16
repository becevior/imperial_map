# Multi-League Architecture

Status: NFL vertical slice implemented; broader architecture remains proposed
Scope: add NFL, MLS, and later major North American leagues without regressing the
existing college-football map.

UI companion: [`MULTI_LEAGUE_UI.md`](./MULTI_LEAGUE_UI.md) starts with the proposed
league-tab experience and works backward to the frontend and artifact contracts.

## Executive decision

Keep the current architecture's strongest idea: a deterministic build pipeline emits
static, versioned JSON that the Next.js client reads from the CDN. Do not add a database
or a permanently running backend for the first multi-league release.

The architectural change is to make `league`, `timeline`, `geography`, and `rules`
explicit dimensions. Today those dimensions exist, but they are implicit and fixed to
FBS football, chronological weeks, U.S. counties, and winner-takes-all.

The target system is:

```text
provider payloads       league adapter       normalized contests
      NFL ESPN    ─┐
      CFB ESPN    ─┼──> adapter contract ──> timeline builder
      MLS source  ─┘                              │
                                                  v
geography package ──> baseline allocator ──> rules engine
                                                  │
                                                  v
                                      immutable static artifacts
                                                  │
                                                  v
                                      shared Next.js experience
```

NFL should be the first additional league. It fits the existing weekly, U.S.-county
model closely and will prove the abstraction with low product ambiguity. MLS should be
second because it forces the architecture to handle draws, flexible calendar periods,
Canadian teams, and competition scope deliberately.

## What exists today

The current system has five useful layers:

1. Team and season membership data in `backend/data/team_locs.csv` and
   `backend/data/seasons/<year>.json`.
2. Provider-specific ingestion in `backend/ingest_games.py`.
3. A small, mostly generic transfer engine in `backend/lib/game_engine.py`.
4. Geography, logo, and leaderboard calculators built around U.S. counties.
5. A Next.js/MapLibre client that discovers seasons and weeks from static indexes.

The transfer invariant is already reusable: for a completed contest with a winner and
loser, every territory unit owned by the loser moves to the winner. The reverse index in
`apply_transfers.py` is efficient and does not care which sport produced the result.

The coupling is concentrated elsewhere:

- Provider URLs, FBS group IDs, regular/postseason handling, and 15-week assumptions
  are embedded in `ingest_games.py`.
- Membership synchronization knows ESPN's FBS conference groups.
- Paths are keyed only by season, so `2026` cannot safely hold multiple leagues.
- UI labels and types assume `Season`, `Week`, `conference`, and `counties`.
- The map directly fetches root CFB files such as `teams-all.json`, `ownership.json`,
  `ownership/index.json`, and `live.json`.
- The page and score ticker independently find the globally latest season instead of
  the latest season for a selected league.
- Geography code assumes county FIPS, county population/area, the Hawaii inset, and a
  specific U.S. GeoJSON file.
- Team identity is based on un-namespaced slugs and manual college aliases.

These are refactoring seams, not reasons to replace the system.

## Target domain model

### League definition

Each supported league has a checked-in definition. Configuration holds stable product
choices; executable adapter code handles provider behavior.

```json
{
  "id": "nfl",
  "name": "NFL",
  "sport": "football",
  "geographyId": "us-counties-v1",
  "provider": "espn",
  "providerLeague": "nfl",
  "membershipAdapter": "nfl",
  "timelineAdapter": "football-week",
  "transferPolicy": "winner-takes-all",
  "drawPolicy": "no-transfer",
  "groupLabel": "Division",
  "periodLabel": "Week",
  "defaultSeason": 2026,
  "enabledStages": ["regular", "postseason"]
}
```

Suggested home: `backend/config/leagues/<league-id>.json`.

Do not put secrets, request implementation, or complex rule code in this JSON. A league
registry validates the definition and resolves named adapters and policies.

### Team

Keep `Team` as the public name to minimize churn, but make its meaning franchise/club/
program neutral:

```text
id                 stable within a league
providerIds        provider -> external ID
name               common display name
fullName           full display name
shortName          scoreboard label
group              generic conference/division grouping
subgroup            optional nested grouping
homeLocation       lat/lon used for baseline allocation
venue              optional venue metadata; not identity
colors, logoUrl     presentation metadata
activeFrom/To       optional historical membership bounds
```

IDs are scoped by their league path. In logs and cross-league code, use a composite key
such as `nfl:buffalo-bills`; never assume a slug is globally unique. Provider IDs should
be the primary resolver during ingestion. Name aliases remain a guarded fallback.

### Normalized contest

Every provider adapter must emit the same record before rules are applied:

```json
{
  "id": "espn:401000001",
  "leagueId": "mls",
  "season": 2026,
  "stage": "regular",
  "sourcePeriod": 12,
  "startTime": "2026-05-10T19:30:00Z",
  "status": "final",
  "homeTeamId": "seattle-sounders",
  "awayTeamId": "portland-timbers",
  "homeScore": 1,
  "awayScore": 1,
  "outcome": "draw",
  "winnerId": null,
  "loserId": null,
  "decision": "regulation",
  "neutralSite": false
}
```

Required outcomes are `home-win`, `away-win`, `draw`, `no-contest`, and `canceled`.
`decision` may be `regulation`, `overtime`, `shootout`, or `forfeit`. The adapter, not
the transfer engine, resolves sport-specific scoring and playoff shootouts.

Validation rejects a final decisive contest without both a winner and loser, a draw
with either field set, unknown team references, duplicate provider IDs, and contests
outside configured stages.

### Timeline period

Replace `weekIndex` as the core concept with a monotonically increasing `periodIndex`.
A period is the snapshot cadence chosen for the product; it need not equal a provider's
week number.

```json
{
  "periodIndex": 8,
  "sourcePeriod": 7,
  "stage": "regular",
  "label": "Regular Week 7",
  "startsAt": "2026-10-20T07:00:00Z",
  "endsAt": "2026-10-27T06:59:59Z",
  "contestsPath": ".../period-008.json",
  "ownershipPath": ".../period-008.json",
  "markersPath": ".../period-008-markers.json",
  "leaderboardPath": ".../period-008.json"
}
```

The ordered index gives late and corrected games a deterministic home. Rebuilding a
season always starts at its baseline and replays final contests by `(startTime, id)`, so
the result is idempotent. `weekIndex` can remain as a v1 compatibility alias while CFB
is migrated.

Recommended period strategies:

| League family | Product period | Reason |
|---|---|---|
| CFB and NFL | official week | Matches audience expectations and current UI |
| MLS/NWSL | dated calendar week | Schedules and make-up matches do not form universal rounds |
| NBA/NHL/MLB/WNBA | calendar week initially | Daily snapshots create excessive files and noisy territory churn |
| Playoffs | league round when clean, otherwise dated window | Stable labels without encoding every format in the client |

Contest order within a period still matters. A team losing and winning in the same
period can finish with a different territory depending on game order.

### Geography package

Make geography a versioned input rather than a global assumption:

```text
geographyId
geoJsonPath
unitIdProperty
unitLabelSingular / unitLabelPlural
statsPath
excludedUnitIds or inclusion policy
display transform/insets
initial allocation strategy
```

`us-counties-v1` wraps the current county GeoJSON, county stats, Alaska exclusion, and
Hawaii display transform. Ownership becomes `territoryUnitId -> teamId` internally;
FIPS remains the unit ID for this geography.

This seam is required before MLS even if MLS initially ships on U.S. counties. It lets
us later add `us-canada-regions-v1` without forking the transfer engine or map.

### Rules policy

The core rules interface is intentionally small:

```python
def resolve_transfer(contest, state) -> TransferDecision:
    # returns winner, loser, transferred unit IDs, or a no-op reason
```

The initial policies are:

- `winner-takes-all`: reuse the current rule for a decisive final.
- `no-transfer` for draws, cancellations, and no-contests.
- `shootout-winner-takes-all`: represented as the same decisive normalized outcome;
  no special map code is needed.

Future leagues may add a series-level or aggregate-score policy, but that should not be
built until a product decision requires it. In particular, MLB can technically use the
per-game rule, though rapid series rematches may make a series policy more enjoyable.

## Static artifact contract

Namespace every generated artifact by league. A league catalog is the only global
entry point:

```text
public/data/
├── catalog.json
├── geographies/
│   └── us-counties-v1/
│       ├── units.geojson
│       └── stats.json
└── leagues/
    ├── cfb/
    │   ├── league.json
    │   ├── teams-all.json
    │   ├── live.json
    │   └── seasons/2026/
    │       ├── index.json
    │       ├── teams.json
    │       ├── contests/period-001.json
    │       ├── ownership/period-000.json
    │       ├── ownership/period-000-markers.json
    │       └── leaderboards/period-000.json
    ├── nfl/
    └── mls/
```

Example catalog:

```json
{
  "schemaVersion": 2,
  "defaultLeagueId": "cfb",
  "leagues": [
    {
      "id": "cfb",
      "name": "College Football",
      "sport": "football",
      "configPath": "/data/leagues/cfb/league.json",
      "indexPath": "/data/leagues/cfb/seasons/index.json",
      "livePath": "/data/leagues/cfb/live.json"
    }
  ]
}
```

Indexes should contain the exact paths clients need. The client must stop constructing
leaderboard, marker, or ownership paths from season and period numbers.

Keep full ownership snapshots in v2 initially. They are simple, cacheable, and make any
period directly addressable. Revisit compact deltas only after measuring repository,
deploy, and browser costs. The present dataset is about 55 MB for thirteen CFB seasons;
namespacing prevents additional leagues from increasing a user's initial fetch, even
though repository size will grow.

## Backend boundaries

Refactor toward these modules:

```text
backend/
├── config/leagues/*.json
├── imperial_map/
│   ├── catalog.py
│   ├── models.py
│   ├── pipeline.py
│   ├── providers/
│   │   ├── base.py
│   │   └── espn.py
│   ├── leagues/
│   │   ├── cfb.py
│   │   ├── nfl.py
│   │   └── mls.py
│   ├── timelines/
│   ├── rules/
│   ├── geography/
│   └── artifacts.py
└── tests/
```

The provider layer owns HTTP, retries, pagination, raw response parsing, and provider
IDs. The league adapter owns membership, enabled competitions/stages, outcome quirks,
and timeline selection. Geography owns unit shapes, statistics, baseline assignment,
and marker anchors. Rules owns only state transitions. Artifact writers own schema and
paths.

A single CLI should orchestrate the same steps for every league:

```bash
python -m imperial_map build baseline --league nfl --season 2026
python -m imperial_map ingest --league nfl --season 2026 --active-only
python -m imperial_map replay --league nfl --season 2026
python -m imperial_map publish --league nfl --season 2026
python -m imperial_map validate --league nfl --season 2026
```

Existing scripts can remain as thin CFB-compatible wrappers during migration.

## Frontend boundaries

Use a league route such as `/league/[leagueId]`; `/` redirects or resolves to the
catalog default. The URL must also carry season and period selection when explicitly
chosen so views are linkable.

Split the current large map component into:

- `LeagueProvider`: catalog, league definition, selected season/period, live polling.
- `useLeagueArtifacts`: fetches paths supplied by indexes and isolates cache/version
  handling.
- `TerritoryMap`: renders any geography package and an ownership map.
- `TerritoryControls`: league, season, and period selection.
- `TerritoryDetails`: generic unit hover/history using configured labels.
- League-aware masthead/banner and score ticker presentation.

The map rendering, ownership fades, logo markers, theme system, timelapse controls,
county history behavior, and leaderboard table can be reused. User-facing nouns become
configuration or neutral code: `group` instead of `conference`, `period` instead of
`week`, and `territory unit` instead of `county`. The UI still renders friendly league
terms such as Conference, Division, Week, Matchweek, County, or Region.

Every analytics event related to the map must include `league_id`, `season`, and
`period_index`; otherwise multi-league usage cannot be separated.

The existing football-player masthead is a sport-specific presentation. It can be used
by CFB and NFL, but MLS needs a soccer variant or a neutral Imperial Map masthead. That
is a presentation plug-in, not a reason to fork the page.

## League-specific plan

### NFL: first vertical slice

What is reusable:

- U.S. county geography and nearest-home-location baseline allocation.
- Official weekly periods, regular season, and postseason timeline pattern.
- Winner-takes-all engine, including the current no-op behavior for a tied final.
- Map, markers, leaderboards, timelapse, live manifest, and score ticker.
- The football masthead and all current themes.

What changes:

- A 32-franchise, season-aware membership source and stable provider IDs.
- Stadium/home-market coordinates rather than campus coordinates.
- AFC/NFC and divisions represented through generic group/subgroup metadata.
- NFL provider configuration and postseason labels.
- League-namespaced static paths and selector/deep link.

Important rule: a regular-season tie transfers nothing. A decisive overtime game is a
normal win. International or neutral-site games do not affect baseline geography,
because allocation uses the franchise's home location.

This is the acceptance test for whether the abstractions are real: adding NFL should
require a league definition, membership data, and adapter tests, not copies of the
pipeline or React page.

### MLS: second vertical slice

What is reusable:

- Normalized contest contract, replay engine, snapshot writer, static hosting, map
  rendering, timeline controls, live polling, and most leaderboards.
- Nearest-club baseline allocation if the chosen geography contains the club location.

What changes:

- Draws must normalize explicitly and produce no transfer.
- A playoff match decided in extra time or a shootout must normalize to a decisive
  winner even if regulation scores were level.
- Use calendar-week periods rather than assuming every club shares a numbered week.
- Eastern/Western group labels and expansion-aware season membership.
- Decide which competitions count. Recommended MVP: MLS regular season and MLS Cup
  playoffs only. Exclude Leagues Cup, U.S. Open Cup, Canadian Championship, and
  continental competitions until cross-competition membership/rules are intentional.
- Canadian clubs force an explicit geography decision.

Geography options:

1. **U.S.-only MVP:** reuse `us-counties-v1`; Canadian clubs are eligible and can be
   allocated nearby U.S. territory based on their home coordinates. This is cheap but
   gives Canadian clubs no home-country land and should be labeled clearly.
2. **North American MLS map:** add a U.S.+Canada geography with comparable regional
   units and statistics. This is the better product, but sourcing, simplifying, and
   visually balancing two countries is a separate workstream.
3. **U.S. clubs only:** simplest technically but distorts league competition and is not
   recommended.

Recommendation: build geography abstraction before MLS, launch an explicitly labeled
U.S.-territory beta if speed matters, and treat U.S.+Canada as the full MLS release.

### Other major leagues

| League | Reuse level | New pressure |
|---|---|---|
| NBA/WNBA | high | daily games; use calendar-week snapshots |
| NHL | high after MLS | Canadian geography; overtime/shootout outcomes |
| MLB | medium-high | very high game count and repeated series; consider series policy |
| NWSL | high after MLS | draws and calendar-week timeline |

The architecture should not hard-code league counts, expansion assumptions, playoff
formats, or a fixed number of periods. Those belong to season membership and generated
timeline data.

## Migration plan

### Phase 0: lock current behavior

- Add golden tests for a complete small CFB season: normalized contests, baseline,
  each ownership snapshot, transfers, leaderboards, and live manifest.
- Add schema validation for existing generated files.
- Record current artifact sizes and frontend requests as performance baselines.

### Phase 1: introduce v2 contracts without a new league

- Add league definitions, normalized models, rules interface, geography package, and
  namespaced artifact writers.
- Emit CFB v1 and v2 artifacts from the same run, or add a temporary compatibility
  catalog that points CFB at v1 paths.
- Change the frontend to discover every path from catalog/index data.
- Add league ID to URLs, cache keys, live polling, and analytics.

Exit criterion: CFB looks and behaves identically through the new boundaries.

### Phase 2: NFL end to end

- Add membership/team data and provider adapter.
- Generate one recent completed season plus the active season.
- Add NFL labels and division metadata.
- Validate ties, postseason ordering, corrected scores, idempotent rebuilds, and live
  period refreshes.

Exit criterion: switching leagues never displays CFB teams, colors, live data, scores,
or cached ownership in the NFL view, and vice versa.

### Phase 3: MLS and geography choice

- Implement draw and shootout fixtures first.
- Add MLS membership and calendar-week timeline adapter.
- Ship either the clearly scoped U.S.-territory beta or the U.S.+Canada geography.
- Add soccer masthead/ticker presentation and competition-scope copy.

### Phase 4: scale only when measurements require it

- Consider per-league deploy artifacts or object storage if repository/deploy size is
  material.
- Consider snapshot checkpoints plus deltas if full weekly snapshots dominate storage.
- Consider a generated history-by-unit index if loading every prior snapshot makes the
  territory history interaction slow.
- A database/API becomes justified only if the product needs user-specific state,
  queries that cannot be precomputed, or update latency below the static publish cycle.

## Validation and operational requirements

Every league build must verify:

- All ownership values and contest participants reference members of that league and
  season.
- Every included geography unit has exactly one owner at baseline and after replay.
- Final decisive contests have exactly one winner and loser; draws transfer nothing.
- A contest ID is processed once, with stable ordering across reruns.
- Rebuilding from baseline produces byte-equivalent domain data, excluding generated
  timestamps.
- Index paths exist and remain inside the selected league namespace.
- Live manifests reference one league and one season only.
- A late result correction rebuilds all affected later periods.
- No frontend request for one league resolves to another league's artifacts.

Operationally, update jobs should lock per `(leagueId, season)`, publish leaf artifacts
before indexes, and publish `live.json` last. This preserves the current atomic-manifest
idea while allowing different leagues to update independently.

## Product decisions still required

These decisions do not block the NFL work, but they must be answered before MLS is
called complete:

1. Does MLS launch as U.S. territory or wait for a U.S.+Canada geography?
2. Do non-league competitions affect territory, or only the named league's regular
   season and playoffs?
3. For high-frequency leagues, is territory resolved per game, per series, or another
   aggregate? The default recommendation is per game with weekly snapshots.
4. Is the product one Imperial Map with a league selector, or separately branded URLs
   sharing an engine? The recommended architecture supports both; the initial UX should
   be one app with deep-linkable league routes.

## Definition of done for multi-league support

Multi-league support is complete when CFB and NFL run through one pipeline and one page,
with no league-specific conditionals in the transfer engine or map renderer; adding MLS
requires only a league adapter, season membership, configuration, geography choice, and
sport presentation. Static artifacts remain independently cacheable, historical views
remain deterministic, and a user can deep-link to a league/season/period without any
data from another league leaking into the view.
