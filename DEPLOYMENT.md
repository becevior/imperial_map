# Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repository                        │
│  ┌─────────────────┐         ┌──────────────────┐          │
│  │  Backend Scripts │────────▶│  Data Files      │          │
│  │  (Python)        │ Generate│  (JSON)          │          │
│  └─────────────────┘         └──────────────────┘          │
│         │                              │                     │
│         │ Automated via               │                     │
│         │ GitHub Actions              │                     │
│         ▼                              ▼                     │
│  ┌──────────────────────────────────────────────┐          │
│  │    frontend/public/data/                     │          │
│  │    ├── teams.json                            │          │
│  │    ├── ownership/                            │          │
│  │    ├── games/                                │          │
│  │    └── leaderboards/                         │          │
│  └──────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Git Push
                           ▼
                  ┌─────────────────┐
                  │     Vercel      │
                  │  Auto-deploys   │
                  │  on push to     │
                  │  main branch    │
                  └─────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   Production    │
                  │   Website       │
                  └─────────────────┘
```

## Automated Updates (Production)

### GitHub Actions Workflow

**File:** `.github/workflows/update-territories.yml`

**Schedule:**
- **Saturdays:** Runs every hour (handles game day activity)
- **Sunday-Friday:** Runs daily, with hourly updates through Sunday morning UTC
- The workflow serializes runs so overlapping game-day jobs cannot write
  competing snapshots.

**What it does:**
1. Fetches latest game results from ESPN's public scoreboard
2. Applies territory transfers based on game outcomes
3. Computes weekly leaderboards
4. Commits and pushes changes to `frontend/public/data/`
5. Vercel auto-deploys the updated map

**Manual trigger:**
```bash
# Via GitHub UI
Go to: Actions → Update Territories → Run workflow
```

### Required Secrets

No score-provider secret is required for the default ESPN ingestion path.

## Manual Updates (Development)

### Quick Update Script

```bash
cd backend
./update_weekly.sh 2026
```

This script:
1. Activates Python virtual environment
2. Runs data pipeline (ingest → apply → compute)
3. Shows git changes summary
4. Prompts you to commit/push

### Step-by-Step Manual Process

```bash
# 1. Activate environment
cd backend
source venv/bin/activate

# 2. Fetch game results
python ingest_games.py --season 2026 --season-type both --provider espn

# 3. Apply territory transfers
python apply_transfers.py --season 2026

# 4. Compute leaderboards
python compute_leaderboards.py --season 2026

# 5. Review changes
cd ..
git diff frontend/public/data/

# 6. Commit and push
git add frontend/public/data/
git commit -m "Update week X territories"
git push
```

## Data Pipeline Scripts

### Core Update Pipeline

| Script | Purpose | Frequency |
|--------|---------|-----------|
| `ingest_games.py` | Fetch game results from ESPN | Automated (hourly Sat, daily weekdays) |
| `apply_transfers.py` | Apply territory transfers based on games | Automated (hourly Sat, daily weekdays) |
| `compute_leaderboards.py` | Generate weekly rankings | Automated (hourly Sat, daily weekdays) |

### Maintenance Scripts

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `audit_team_colors.py` | Sync team colors with ESPN API | When colors look wrong |
| `sync_teams.py` | Regenerate teams.json from CSV | After editing team_locs.csv |
| `compute_logo_colors.py` | Recalculate optimal logo colors | After color changes |
| `setup.py` | Full data regeneration | Initial setup or major reset |

## Deployment Checklist

### Initial Setup

- [ ] Fork/clone repository
- [ ] Set up Python environment: `cd backend && python3 -m venv venv && pip install -r requirements.txt`
- [ ] Run season setup: `python setup.py --season 2026`
- [ ] Compute logo colors: `python compute_logo_colors.py`
- [ ] Deploy to Vercel:
  - Connect GitHub repository
  - Set root directory to `frontend/`
  - Deploy

### Season Start

- [ ] Update `SEASON` in `.github/workflows/update-territories.yml`
- [ ] Run `python setup.py` to reset baseline
- [ ] Verify team roster in `backend/data/team_locs.csv`
- [ ] Run `python audit_team_colors.py` to sync latest colors
- [ ] Run `python compute_logo_colors.py` to optimize fills

### Weekly (Automated)

✅ GitHub Actions handles automatically:
- Fetching game results
- Applying territory transfers
- Computing leaderboards
- Committing and pushing changes
- Triggering Vercel deployment

### Color/Team Updates (As Needed)

```bash
# Update team colors
cd backend
source venv/bin/activate
python audit_team_colors.py
python sync_teams.py
python compute_logo_colors.py

# Commit changes
cd ..
git add backend/data/team_locs.csv frontend/public/data/teams.json frontend/public/data/logo-colors.json
git commit -m "Update team colors"
git push
```

## Monitoring

### Check Workflow Status

1. Go to GitHub → Actions tab
2. Look for "Update Territories" workflow runs
3. Green checkmark ✓ = successful update
4. Red X ✗ = failed (check logs)

### Common Issues

**No changes detected:**
- Normal if no games have been played
- Check if games were actually played that week

**ESPN request failed:**
- Confirm `curl` is installed; the ingester uses it as a transport fallback when ESPN rejects Python TLS clients

**Workflow failed:**
1. Check workflow logs in GitHub Actions
2. Look for Python errors
3. Run manually to debug: `./update_weekly.sh 2026`

## Cost Breakdown

| Service | Cost | Notes |
|---------|------|-------|
| Vercel | $0 | Free tier (static site) |
| GitHub Actions | $0 | 2,000 minutes/month free |
| ESPN scoreboard | $0 | Public, no key required |
| **Total** | **$0/month** | 🎉 |

## Environment Variables

No environment variable is required for ESPN. `CFBD_API_KEY` is only used with
the optional `--provider cfbd` compatibility path.

## Vercel Configuration

### Automatic Setup (Recommended)

1. Connect GitHub repository to Vercel
2. Set build settings:
   - **Root Directory:** `frontend/`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`
3. Deploy

Vercel will auto-deploy on every push to `main`.

### Manual Configuration (Optional)

Create `vercel.json` at root:
```json
{
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/.next",
  "framework": "nextjs"
}
```

## Rollback Procedure

If a deployment has issues:

```bash
# Revert to previous commit
git revert HEAD
git push

# Or reset to specific commit
git reset --hard <commit-hash>
git push --force
```

Vercel will auto-deploy the reverted state.

## Debugging

### Test pipeline locally

```bash
cd backend
source venv/bin/activate

# Dry run to preview changes
python apply_transfers.py --season 2026 --dry-run

# Check specific week
python ingest_games.py --season 2026 --season-type regular --provider espn
```

### Verify data files

```bash
# Check latest ownership
cat frontend/public/data/ownership/index.json | jq

# Check leaderboards
ls -la frontend/public/data/leaderboards/2026/

# Validate JSON
jq empty frontend/public/data/teams.json
```

## Support

- **Documentation:** See `backend/README.md` for script details
- **Issues:** https://github.com/becevior/imperial_map/issues
- **ESPN ingestion details:** See `backend/README.md`
