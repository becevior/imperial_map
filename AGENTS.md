# Repository Guidelines

## Project Structure & Module Organization
- `src/app`: Next.js App Router entrypoints (`page.tsx`, `layout.tsx`, API routes in `app/api`).
- `src/components`: Client-facing React components (e.g., `Map.tsx`) with co-located styles when needed.
- `src/lib`: Data access, CFBD integration, and territory rules; `src/types` supplies shared TypeScript models.
- `aws/`: SAM-backed Lambda code and `template.yaml`; `database/`: SQL migrations and seed data.
- `.env.local` mirrors `.env.local.example`; keep secrets out of git. Static assets live in `public/`.

## Build, Test, and Development Commands
- `npm install` — set up dependencies after cloning or pulling major changes.
- `npm run dev` — launch the Next.js dev server at `http://localhost:3000` with hot reload.
- `npm run build` — create an optimized production build; run before deployments.
- `npm run start` — serve the production build locally for smoke testing.
- `npm run lint` / `npm run type-check` — enforce ESLint (`next/core-web-vitals`) and TypeScript health; both should be clean before opening a PR.

## Coding Style & Naming Conventions
- Use TypeScript throughout; add explicit types on exported functions and map utilities.
- Follow the 2-space indentation, trailing commas, and import order (external → `@/` → relative) already in the repo.
- PascalCase component files (`Map.tsx`), camelCase hooks prefixed with `use`, and kebab-case route segment folders.
- Favor Tailwind classes in JSX; extract shared styles only when reused.

## Testing Guidelines
- Automated tests are not wired yet; future suites should use `*.test.ts(x)` colocated with features or under `src/__tests__` and add an npm script.
- For now, document manual verification steps, keep `npm run lint` and `npm run type-check` green, and sanity-check map interactions in the browser.

## Commit & Pull Request Guidelines
- Write imperative commit subjects ≤72 characters (e.g., "Add team hover detail panel") and keep related changes grouped.
- Reference issues or tickets, call out Supabase/AWS/MapLibre impacts, and update `.env.local.example` whenever new variables appear.
- PRs should include a concise summary, UI screenshots when relevant, validation steps, and at least one domain owner review before merge.

## Configuration & Environment Tips
- Use `.env.local` for local secrets; never commit keys. Required variables include Supabase URL/key and `CFBD_API_KEY`.
- Supabase and AWS resources (`aws/template.yaml`) must stay aligned with migrations in `database/`; include both when schema or infra shifts.
