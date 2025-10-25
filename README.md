# College Football Imperial Map

A live "imperial territory" map where college football teams compete for US counties. Territory transfers follow a simple rule: **winner takes all**.

## Quick Start

### 1. Generate Initial Data

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python setup.py
# Optional: calculate logo color contrast fills
python compute_logo_colors.py
```

This creates `frontend/public/data/teams.json` and `frontend/public/data/ownership.json`. The optional logo color pass stores curated primary/secondary fill choices in `frontend/public/data/logo-colors.json` so the map renders with high-contrast colors.

### 2. Run the Map

```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:3000

## Architecture

**Simple file-based system - no database required!**

```
┌─────────────────┐
│  Browser        │
│  (MapLibre GL)  │
└────────┬────────┘
         │ Fetch JSON
         ▼
┌─────────────────┐
│  Next.js        │
│  (API Routes)   │
└────────┬────────┘
         │ Read files
         ▼
┌────────────────────────┐
│  frontend/public/data/ │
│  ├── teams.json        │ ◄── Python generates
│  ├── ownership.json    │ ◄── Python updates
│  ├── games/            │ ◄── Optional weekly summaries
│  └── logo-colors.json  │ ◄── Optional logo color analysis
└────────────────────────┘
```

## Project Structure

```
imperial-map/
├── backend/                    # Python scripts (run locally)
│   ├── lib/
│   │   ├── territory.py       # Geospatial calculations
│   │   ├── game_engine.py     # Transfer logic
│   │   └── db.py              # JSON file I/O
│   ├── requirements.txt
│   ├── setup.py               # ⭐ Initialize data files
│   └── README.md
│
├── frontend/                   # Next.js app
│   ├── src/
│   │   ├── app/               # Pages + API routes
│   │   ├── components/        # React components
│   │   ├── lib/               # Client utilities
│   │   └── types/             # TypeScript types
│   ├── public/
│   │   └── data/              # Data files
│   │       ├── us-counties.geojson
│   │       ├── teams.json           # Generated
│   │       ├── ownership.json       # Generated
│   │       ├── ownership/           # Weekly snapshots (optional)
│   │       ├── games/               # CFBD results (optional)
│   │       └── logo-colors.json     # Logo contrast palette (optional)
│   ├── package.json           # Frontend dependencies
│   ├── tsconfig.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   └── ...config files
│
└── Root documentation
    ├── README.md
    ├── GETTING_STARTED.md
    └── .env.local.example
```

## How It Works

1. **Initial Setup**: Python calculates which team is nearest to each county
2. **Game Results**: Python updates ownership when teams play
3. **Color Tuning**: Optional logo analysis picks readable fills derived from team brand colors
4. **Deployment**: Commit updated JSON → Vercel auto-deploys
5. **Frontend**: Map fetches JSON and renders territories

## Features

- **Week-by-week county ownership history** – click any county to see who owned it each week up to the current selection.
- **Campus logo takeovers** – weekly ownership snapshots include campus logos that swap to the conquering team.
- **Automatic color-contrast selection** – optional `compute_logo_colors.py` run balances primary and secondary colors so logos stay legible atop their territories.

## Development

```bash
# Backend
cd backend
python setup.py      # Initialize data
python compute_logo_colors.py  # Optional: refresh logo fill colors

# Frontend
cd frontend
npm run dev          # Start dev server
npm run build        # Build for production
npm run type-check   # Check TypeScript
```

## Deployment

### Option 1: Deploy from `frontend/` directory

In Vercel dashboard:
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `.next`

### Option 2: Deploy from root with custom config

Create `vercel.json`:
```json
{
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/.next"
}
```

Push to GitHub → Vercel automatically deploys

## Cost

**$0/month** - Just static JSON files on Vercel free tier

## Tech Stack

- **Frontend**: Next.js 14, MapLibre GL JS, TypeScript, Tailwind CSS
- **Backend**: Python 3, Shapely (geospatial)
- **Data**: JSON files (no database!)
- **Deploy**: Vercel

## See Also

- `GETTING_STARTED.md` - Detailed setup guide
- `backend/README.md` - Python scripts documentation
