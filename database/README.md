# Database Setup

This directory contains the database schema and migration scripts for the College Football Imperial Map project.

## Quick Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com)
2. **Copy your project credentials** to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your actual Supabase URL and keys
   ```
3. **Run the initial migration** in your Supabase SQL editor:
   ```sql
   -- Copy and paste the contents of migrations/001_initial_schema.sql
   ```
4. **Seed initial data**:
   ```sql
   -- Copy and paste the contents of seed/001_teams.sql
   ```

## Database Schema

### Core Tables
- `teams` - FBS team information with colors and logos
- `territories` - US county data with geometry
- `territory_ownership` - Current ownership mapping
- `games` - Game results from external API
- `territory_history` - Transfer event log
- `job_runs` - Background job tracking

### Key Features
- **Automatic timestamps** on ownership and game updates
- **Performance indexes** for common queries
- **Referential integrity** with foreign keys
- **Type safety** with proper constraints

## Migration Strategy

Each migration file is numbered and should be run in sequence:
1. `001_initial_schema.sql` - Core tables and indexes
2. `002_additional_features.sql` - (Future migrations)

## Development Notes

- Use `VARCHAR(5)` for FIPS codes (5-digit county codes)
- Store GeoJSON as `JSONB` for performance
- All timestamps use `TIMESTAMP WITH TIME ZONE`
- Territory transfers are logged in `territory_history` for audit trail