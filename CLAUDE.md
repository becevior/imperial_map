# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a College Football Imperial Territory Map application - a web app that renders a live "imperial territory" map for college football where ~130 FBS teams compete for ~3,100 US counties. Territory transfers follow a deterministic rules engine driven by completed game results.

## Architecture

The project follows a serverless MVP architecture:

### Frontend
- **Next.js 14** (App Router) deployed on **Vercel**
- **MapLibre GL JS** for WebGL vector rendering
- **React 18** with TypeScript
- **SWR** for data fetching and caching

### Backend
- **AWS Lambda + API Gateway + EventBridge** for serverless backend
- **Supabase Postgres** as the primary database
- **Hourly polling** via EventBridge cron for game updates (no real-time in MVP)
- Optional **S3** for snapshots and static assets

### Key Components
- **Rules Engine**: Implements territory transfer logic (MVP uses "all-of-loser" rule)
- **Game Ingestion**: Hourly Lambda job fetches from CollegeFootballData API
- **Territory Management**: Tracks county ownership and transfer history
- **Map Rendering**: MapLibre displays ~3,100 US counties with team colors

## Data Models

### Core Entities
- **Teams**: FBS teams with colors, logos, conference info
- **Territories**: US counties with FIPS codes, centroids, and simplified GeoJSON geometry  
- **Territory Ownership**: Current owner mapping (fast lookups)
- **Games**: Game results from external provider
- **Territory History**: Append-only transfer log
- **Job Runs**: Background job tracking and locking

### Key Database Tables
- `teams` - Team metadata and styling
- `territories` - County data with simplified geometry
- `territory_ownership` - Current ownership state
- `games` - Game results and status
- `territory_history` - Transfer event log
- `job_runs` - Job execution tracking

## Development Workflow

Since this is a design-only repository with no implementation yet, the typical workflow would be:

1. **Setup Phase**: Initialize Next.js project, set up Supabase schema, create AWS Lambda functions
2. **Development**: Build frontend components, implement rules engine, create API endpoints
3. **Testing**: Unit tests for rules engine, integration tests for API, map performance testing
4. **Deployment**: Frontend to Vercel, backend to AWS Lambda via SAM/CDK

## Key Implementation Details

### Territory Transfer Rules (MVP)
- Winner takes ALL counties owned by the loser (simplified from contiguity-based transfers)
- Only FBS vs FBS games count
- Transfers are idempotent and deterministic
- Post-MVP will add contiguity rules using county adjacency graph

### API Endpoints
- `GET /api/territory` - Returns county ownership mapping
- `GET /api/teams` - Team metadata for map styling
- `GET /api/games` - Game results and status
- `POST /admin/ingest` - Manual game ingestion
- `POST /admin/recompute` - Recompute territory transfers

### Caching Strategy
- Database: `territory_ownership` as hot read path
- API: 5-minute fresh, 1-hour stale-while-revalidate
- Frontend: ISR for static pages, SWR for dynamic data
- Artifacts: Daily snapshots via S3/CloudFront

## Environment Variables

### Required
- `CFBD_API_KEY` - CollegeFootballData API key
- `DATABASE_URL` - Supabase Postgres connection
- `RATE_LIMIT_RPS` - API rate limiting

### Optional  
- `SNAPSHOT_BUCKET` - S3 bucket for daily snapshots
- `ADMIN_TOKEN` - Admin endpoint authentication

## Performance Considerations

- GeoJSON simplification for ~3,100 counties (~5-10MB after compression)
- MapLibre feature-state for hover effects
- Batched database updates for territory transfers
- Proper indexing on ownership and history tables
- Throttled API polling with backoff

## Cost Target

MVP targets ~$20-30/month:
- Vercel: $0-20 (depending on usage)
- AWS Lambda/API Gateway: $1-5 (low traffic)
- Supabase Pro: $25 (recommended for reliability)
- S3: <$1

## Post-MVP Features

- Real-time updates via SSE/WebSocket
- Contiguity-based territory transfers
- Historical visualization and time-travel
- Conference-specific rules
- Advanced map features (clustering, animations)

## Key Technical Decisions

- **Serverless-first**: AWS Lambda scales to zero for cost efficiency
- **Postgres over NoSQL**: Complex relational data with ACID requirements
- **Vector tiles over raster**: Better performance and styling flexibility
- **Hourly polling over real-time**: Simpler MVP, can upgrade later
- **All-of-loser rule**: Deterministic and simple to implement