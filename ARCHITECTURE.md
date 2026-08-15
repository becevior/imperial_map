# Architecture

## Why This Is File-Based

The application is intentionally a low-operations publishing pipeline, not an
interactive database product. The authoritative inputs are the team roster CSV,
county GeoJSON, and CFBD results. Python converts those inputs into versioned JSON
snapshots that Vercel serves directly to the browser.

This keeps the operating model small:

- No database, migrations, credentials, backups, or always-on service.
- Every published state is reviewable in Git and reproducible from source inputs.
- The map remains fast because the browser reads CDN-hosted static files.
- GitHub Actions is the only scheduled compute layer.

## Live Game-Day Refresh

The game-day path remains file based. In season, GitHub Actions checks only
ESPN's active week every five minutes during the Saturday window. If the
normalized completed games are unchanged, the job exits without rebuilding,
committing, or deploying. Scheduled triggers remain commented out during the
off-season; manual dispatch stays available for rehearsals and corrections.

When a new final or score correction appears, the pipeline deterministically
replays the season, publishes the updated snapshots, and writes `data/live.json`.
Visible browser tabs poll that small manifest once per minute and only download
the current ownership and logo snapshots when its content version changes. Tabs
pause polling while hidden and refresh on focus. Historical selections are never
automatically moved to the live week.

## Data Boundaries

| Data | Source of truth | Generated output |
| --- | --- | --- |
| Team metadata | `backend/data/team_locs.csv` | `frontend/public/data/teams.json` |
| County geography | `frontend/public/data/us-counties.geojson` | Baseline ownership and county metadata |
| Game results | CFBD API | `frontend/public/data/games/<season>/` |
| Territory history | Transfer engine | `frontend/public/data/ownership/<season>/` |
| Rankings | Leaderboard calculator | `frontend/public/data/leaderboards/<season>/` |

`ownership.json` is the preseason baseline. The indexed weekly snapshots are the
canonical historical and current state; consumers should use `ownership/index.json`
or `GET /api/territory` rather than assuming the baseline is current.

## Operational Guardrails

- `npm run validate-data` verifies snapshot paths and team references before a
  deploy or automated commit.
- CI runs frontend install, validation, type check, lint, build, and backend tests.
- The update workflow has a time limit and serializes runs.
- Scheduled runs use ESPN and require no score-provider key. Manual dispatch
  performs a full-season correction pass.

## When To Add Infrastructure

Keep the current model while updates are single-writer, Git commits remain a useful
audit trail, and the static data fits comfortably in the deployment repository. The
first scaling step should be object storage plus a scheduled serverless job if
repository data volume or deployment time becomes the constraint. Introduce a
database only for requirements that need concurrent writes, user-specific state,
queries over a large history, or transactional administration.
