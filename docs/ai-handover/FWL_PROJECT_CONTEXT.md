# FWL Project Context

## What it is
- Family Wealth Lab (FWL) — AI-powered wealth planning OS for Australian FIRE-focused households.
- Web app (React + Vite client, Express/serverless API, Supabase backend).
- Single-tenant per household; deterministic financial engines + Monte Carlo.

## Target user
- Primary: Australian households pursuing FIRE.
- Secondary: high-income professionals, wealth builders, property investors.
- Geo scope: AU only at launch (AU tax, AU property, AUD currency).

## Product goal
- One canonical source of truth for net worth, FIRE trajectory, risk, and recommended next move.
- Replace founder employment income in 5–10 years via subscription.
- AUD $29/month subscription. No tier split at launch.

## Commercial direction
| Phase | Window | Users | Gate |
|---|---|---|---|
| Alpha | 0–6 mo | founders only | quality gate |
| Closed Beta | 6–12 mo | 20–50 invited | conversion to paid |
| Commercial Launch | 12–18 mo | 100 paying | break-even ≈ 29 users |
| PMF | 18–36 mo | 1,000 paying | retention proof |
| Scale | 3–5 yr | 5,000 | first contractor |
| Expansion | 5+ yr | 10,000+ | income replacement |

## Current branch status
- Default branch: `main` @ commit `764f81f` (PR #114 — roadmap label fix for property-purchase deltas).
- 30+ open PRs (mostly stacked feature/audit branches). See `FWL_FEATURE_STATUS.md` and `docs/14-open-pr-status.md`.
- Active sprint branches: `sprint20/pr-f1-canonical-fire-model`, `sprint20/pr-f2-recommendation-engine`, `sprint20/pr-h-sidebar-ia-flatten`.

## Current deployment status
- Hosting: Vercel (config: `vercel.json`).
- Build: `npm run build:client` → `dist/public`.
- Serverless functions: `api/ai-insights.ts` (30s), `api/market-data.ts` (25s).
- Routing: SPA rewrite — all non-`/api/*` paths → `/index.html`.
- No production-public URL is documented in this repo; preview deploys via Vercel per PR.
- Backend data: Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY` + `VITE_*` mirrors).
- Migrations applied through `2026-05-30` (sprint31e income classification).

## Repo
- GitHub: `rohamshahrokh/shahrokh-family-financial-planner` (default branch `main`).
- Founders: Roham (tech/product), Ali (co-founder).
- AI-assisted dev; no full-time devs.
