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
```

This creates `public/data/teams.json` and `public/data/ownership.json`.

### 2. Run the Map

```bash
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
┌─────────────────────┐
│  public/data/       │
│  ├── teams.json     │ ◄── Python generates
│  └── ownership.json │ ◄── Python updates
└─────────────────────┘
```

## Project Structure

```
.
├── backend/              # Python scripts (run locally)
│   ├── lib/
│   │   ├── territory.py # Geospatial calculations
│   │   ├── game_engine.py # Transfer logic
│   │   └── db.py        # JSON file I/O
│   └── setup.py         # Generate initial data
│
├── src/                  # Next.js frontend
│   ├── app/             # Pages + API routes
│   ├── components/      # React components
│   ├── lib/             # Client utilities
│   └── types/           # TypeScript types
│
├── public/data/         # Data files
│   ├── us-counties.geojson
│   ├── teams.json       # Generated
│   └── ownership.json   # Generated
│
└── Root config files (Next.js requires these here)
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.ts
    └── next.config.mjs
```

## How It Works

1. **Initial Setup**: Python calculates which team is nearest to each county
2. **Game Results**: Python updates ownership when teams play
3. **Deployment**: Commit updated JSON → Vercel auto-deploys
4. **Frontend**: Map fetches JSON and renders territories

## Development

```bash
# Frontend
npm run dev          # Start dev server
npm run build        # Build for production
npm run type-check   # Check TypeScript

# Backend
cd backend
python setup.py      # Initialize data
```

## Deployment

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
