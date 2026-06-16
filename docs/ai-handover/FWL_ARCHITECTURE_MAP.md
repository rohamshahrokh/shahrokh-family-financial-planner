# FWL Architecture Map

## Top-level layout
```
/api               Vercel serverless functions (ai-insights, market-data)
/client            React + Vite SPA
/server            Express dev server (tsx) + storage adapter
/shared            Shared TS types (schema, propertyLifecycle, forecastFreshness)
/supabase          Migrations only (no functions)
/script            CLI test runners + build script
/docs              Knowledge base (15 numbered files + ai-handover/)
vercel.json        Build + routing config
drizzle.config.ts  Schema migrations config
```

## Frontend — `/client/src`
| Folder | Purpose |
|---|---|
| `pages/` | One file per route (40+ pages: dashboard, fire-path, decision-lab, action-roadmap, risk-radar, timeline, portfolio-lab, goal-lab, etc.) |
| `components/` | Reusable UI (cards, tables, charts, sidebar, modals) |
| `lib/` | Engines, selectors, canonical contracts (see below) |
| `hooks/` | Data-fetching + state hooks |
| `contexts/` | React contexts (audit mode, regime, etc.) |
| `__tests__/` | Component tests |

## Canonical engines — `/client/src/lib`
Single-source-of-truth layer. Every UI metric must read through these:
| File | Owns |
|---|---|
| `canonicalLedger.ts` | Snapshot → ledger normalization |
| `canonicalNetWorth.ts` | Net worth (assets − liabilities) |
| `canonicalFire.ts` | FIRE number, gap, progress |
| `canonicalFireDerivations.ts` | Required NW, required monthly investing, feasibility score, SWR |
| `canonicalCashflow.ts` | Monthly surplus, income/expense identity |
| `canonicalDebtService.ts` | Aggregate + per-loan debt service |
| `canonicalTax.ts` | AU tax (PAYG, CGT) |
| `canonicalPropertyEconomics.ts` | Per-property cashflow, equity, yield |
| `canonicalRiskSurface.ts` | 8-axis risk radar + stress rows + FIRE fragility |
| `canonicalHeadlineMetrics.ts` | The 9 visible headline numbers (every page reads this) |
| `canonicalRecommendation.ts` | Facade over recommendation engine (live/cached/fallback) |
| `dashboardDataContract.ts` | `DashboardInputs` shape + selector primitives |

## Engine families — `/client/src/lib`
| Folder/file | Purpose |
|---|---|
| `recommendationEngine/` | Unified best-move + rules + confidence + SWR band |
| `forecastEngine.ts`, `forecastEngineRegimeAware.ts` | Deterministic projection |
| `monteCarloEngine.ts`, `monteCarloV4/`, `monteCarloV5/` | Probabilistic projection (V5 current) |
| `firePathEngine.ts`, `firePathEngineRegimeAware.ts` | FIRE trajectory |
| `actionPlanEngine/` | Action recommendations |
| `actionRoadmap/` | Year-by-year roadmap, lanes, milestones, traceability |
| `bestMoveEngine.ts`, `bestMoveEngineSprint5.ts` | Legacy best-move (feeders into facade) |
| `cfoEngine.ts`, `cfoAdvisor.ts` | Weekly CFO narratives |
| `equityEngine.ts`, `cashEngine.ts` | Component primitives |
| `executionOS/`, `autonomousOS/`, `lifePlanning/`, `behaviouralEngine/` | Newer experiential layers |

## Backend / API
| Path | Purpose |
|---|---|
| `server/index.ts` | Express dev server (local only) |
| `server/routes.ts` | Dev API routes |
| `server/storage.ts` | Supabase + local storage adapter |
| `server/lib/canonicalGoal.ts` | Server-side canonical goal resolution |
| `api/ai-insights.ts` | Vercel function — OpenAI insights |
| `api/market-data.ts` | Vercel function — market price fetch |

## Supabase usage
- Database for snapshots, properties, goals, fire settings, action checklists, recommendation history.
- Auth via Supabase Auth.
- Migrations in `supabase/migrations/` (chronological filenames).
- No edge functions; all server logic in `/api` (Vercel) or `/server` (dev).
- Recent migrations: goals_set, action_checklist, income_classification columns.

## Vercel deployment setup
- `vercel.json`:
  - `buildCommand: npm run build:client`
  - `outputDirectory: dist/public`
  - SPA rewrite — all routes → `/index.html` except `/api/*`.
  - Function timeouts: ai-insights 30s, market-data 25s.
- Preview deploys auto-trigger on PR open/push.

## Environment variables required
| Variable | Scope | Purpose |
|---|---|---|
| `SUPABASE_URL` | server | Supabase project URL |
| `SUPABASE_ANON_KEY` | server | Supabase anon key |
| `VITE_SUPABASE_URL` | client | Same, exposed to client bundle |
| `VITE_SUPABASE_ANON_KEY` | client | Same, exposed to client bundle |
| `OPENAI_API_KEY` | serverless | `api/ai-insights.ts` |
| `NODE_ENV` | runtime | dev / prod |
| `PORT` | dev only | Express port |

## Current preview / prod deployment process
1. Push branch → Vercel preview auto-builds (`npm run build:client`).
2. PR review against `main`.
3. Merge to `main` → production deploy (current target Vercel project).
4. Supabase migrations run manually via `npm run db:push` (Drizzle) or Supabase dashboard.
5. No CI gate beyond Vercel build; tests are tsx scripts run locally via `npm run test:<name>`.
