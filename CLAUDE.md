# CLAUDE.md — Entry Point for AI Coding Assistants

Single entry point for any new Claude (Opus/Sonnet) session on this repository. Read this file first. Then follow the explicit reading order below before touching any code.

## Project Summary

| Field | Value |
|---|---|
| Project | Family Wealth Lab (FWL) |
| Repository (legacy name) | `shahrokh-family-financial-planner` |
| Production URL | https://familywealthlab.net |
| Geo | Australia only (AU tax, AU property, AUD) |
| Stack | React + Vite client · Express/serverless API · Supabase Postgres · Vercel hosting |
| Founders | Roham Shahrokh (tech/product) · Ali (co-founder). AI-assisted dev, no full-time devs. |
| Baseline tag | `v0.1.0-docs-baseline` (commit `a272b97`) |

## Product Mission

Give Australian FIRE-focused households one canonical, always-fresh answer to: *"Are we on track to FIRE, and what is the single best move this year?"* — with the math, the risk, and the year-by-year plan visible.

Information / planning platform. **NOT** personal financial advice. **NOT** AFSL-licensed.

## Current Status

| Item | Status |
|---|---|
| Default branch | `main` |
| Production | Live at `familywealthlab.net`, 9/9 smoke routes 200 OK |
| Sprint 31D | Merged into main (risk calibration fix verified) |
| Sprint FWL078/FWL079 | Merged (DSR rate-unit fix · roadmap label fix) |
| Sprint 31E | On its own branch (`fix/sprint31e-income-save`), not merged |
| Phase | Phase 1 (alpha) — closing on Phase 2 (closed beta) |
| Beta blockers | D-006 Supabase RLS disabled · D-016 no legal/T&Cs |

## Architecture Overview

- **Client:** `client/` (React + Vite, Tailwind, shadcn/ui, Zustand, React Query, Recharts)
- **API:** `api/ai-insights.ts` (30s), `api/market-data.ts` (25s) (Vercel serverless)
- **Server (dev):** `server/routes.ts`, `server/storage.ts` (Express; legacy local dev path)
- **Shared:** `shared/schema.ts` (drizzle dev shim — NOT production), `shared/propertyLifecycle.ts`
- **Data:** Supabase Postgres (`sf_*` and `mc_*` tables) is the source of truth
- **Canonical selectors:** `client/src/lib/canonical*.ts` — every UI metric must trace to one
- **Dashboard contract:** `client/src/lib/dashboardDataContract.ts` — single assembly point
- **Vercel config:** `vercel.json` (buildCommand `npm run build:client`, outputDir `dist/public`)

Full map: `docs/ai-handover/FWL_ARCHITECTURE_MAP.md` and `docs/ai-handover/FWL_DATA_MODEL.md`.

## Development Rules

| # | Rule | Source |
|---|---|---|
| R1 | Read `docs/ai-handover/` first; never scan the whole repo | `FWL_CLAUDE_WORKING_RULES.md` |
| R2 | Identify exact files before editing; surgical changes only | `FWL_CLAUDE_WORKING_RULES.md` |
| R3 | Contract-first: new formulas land in `FWL_ENGINE_CONTRACTS.md` before any code change | `FWL_DECISION_LOG.md` D7 |
| R4 | Single source of truth: every UI metric reads through a canonical selector. No duplicate math in components. | `FWL_DECISION_LOG.md` D8 |
| R5 | Preserve tests. Add a regression test for every fix (see `fwl078DsrRateUnit.test.ts`, `fwl079RoadmapLabels.test.ts`) | repo convention |
| R6 | Typecheck + tests + Vercel preview before merge | repo convention |
| R7 | Never invent formulas. Cite the selector path in every UI metric. | `FWL_CLAUDE_WORKING_RULES.md` |
| R8 | Transparent fallbacks. Any imputed value (e.g. mortgage rate fallback) must report `*Source` flags. | Sprint 31D contract |
| R9 | Information not advice — UI copy and AI insight prompts use general-information framing | `FWL_DECISION_LOG.md` D1 |
| R10 | No mobile-app work before web PMF | `FWL_DECISION_LOG.md` D6 |
| R11 | Docs-only PRs MUST NOT touch any source under `client/`, `server/`, `api/`, `shared/`, `supabase/`, or `vercel.json` | repo convention |

## Commercial Direction

| Field | Value |
|---|---|
| Pricing | AUD $29/month single tier, no free tier at launch (`FWL_DECISION_LOG.md` D3) |
| Target | AU FIRE-focused households, $500K–$3M net worth (`FWL_PRODUCT_POSITIONING.md`) |
| Phase 2 (closed beta) | 20–50 invited households |
| Phase 3 (launch) | 100 paying — break-even |
| Phase 4 (PMF) | 1,000 paying |
| North star metric | Paying Active Households (PAH) (`FWL_METRICS_AND_KPIS.md`) |
| Activation | Account + onboarding + first forecast + first roadmap view + Goal Lab `goals_set=true` |
| Off-roadmap | Stock-picking, robo-advice, B2B/CRM, multi-currency, US/UK tax, native mobile app |

## Repository Structure

```
/
├── CLAUDE.md                    # this file
├── README.md                    # human-facing project README
├── api/                         # Vercel serverless functions
├── client/                      # React + Vite app
│   └── src/lib/canonical*.ts    # canonical selectors (single source of truth)
├── server/                      # Express dev server (legacy)
├── shared/                      # cross-runtime types (schema.ts, propertyLifecycle.ts)
├── supabase/migrations/         # Supabase Postgres migrations
├── script/                      # one-off probes, verification scripts
├── docs/
│   └── ai-handover/             # AI handover pack — START HERE
│       ├── README.md            # index
│       ├── FWL_PROJECT_CONTEXT.md
│       ├── FWL_PRODUCT_POSITIONING.md
│       ├── FWL_ARCHITECTURE_MAP.md
│       ├── FWL_ENGINE_CONTRACTS.md
│       ├── FWL_FEATURE_STATUS.md
│       ├── FWL_DECISION_LOG.md
│       ├── FWL_KNOWN_DEFECTS.md
│       ├── FWL_CLAUDE_WORKING_RULES.md
│       ├── FWL_DATA_MODEL.md
│       ├── FWL_METRICS_AND_KPIS.md
│       └── FWL_NEXT_90_DAYS.md
└── vercel.json
```

## AI Handover Documents

11 files at `docs/ai-handover/`. Every doc is table-first, under 250 lines, with file-path citations. Full index with purpose / when-to-read / dependencies: `docs/ai-handover/README.md`.

## Reading Order

Read in this exact order before touching any code:

1. `docs/ai-handover/FWL_PROJECT_CONTEXT.md`
2. `docs/ai-handover/FWL_PRODUCT_POSITIONING.md`
3. `docs/ai-handover/FWL_ARCHITECTURE_MAP.md`
4. `docs/ai-handover/FWL_ENGINE_CONTRACTS.md`
5. `docs/ai-handover/FWL_FEATURE_STATUS.md`
6. `docs/ai-handover/FWL_DECISION_LOG.md`
7. `docs/ai-handover/FWL_KNOWN_DEFECTS.md`
8. `docs/ai-handover/FWL_CLAUDE_WORKING_RULES.md`
9. `docs/ai-handover/FWL_DATA_MODEL.md`
10. `docs/ai-handover/FWL_METRICS_AND_KPIS.md`
11. `docs/ai-handover/FWL_NEXT_90_DAYS.md`

After completing the reading order, consult `FWL_FEATURE_STATUS.md` and `FWL_KNOWN_DEFECTS.md` to scope any task before opening files in `client/` or `server/`.

## Current Priorities

| # | Priority | Owner | Reference |
|---|---|---|---|
| P1 | Land D-006 RLS — blocker for Phase 2 beta | Roham + AI | `FWL_KNOWN_DEFECTS.md` |
| P2 | Land D-016 legal/T&Cs — blocker for Phase 2 beta | Roham + Ali | `FWL_KNOWN_DEFECTS.md` |
| P3 | Friends-and-family beta Month 1 (10 households) | Roham + Ali | `FWL_METRICS_AND_KPIS.md` §8, `FWL_NEXT_90_DAYS.md` |
| P4 | Wire founder dashboard minimum metrics (north star + activation funnel + D7/D30 + beta count + reliability) | AI | `FWL_METRICS_AND_KPIS.md` §10 |
| P5 | Billing integration (Stripe) ready in staging by Beta Month 3 | Roham | `FWL_PRODUCT_POSITIONING.md` |

Do **not** start new feature development without an explicit user instruction.

## Known Constraints

| Constraint | Status |
|---|---|
| AU-only at launch (no multi-currency, no overseas tax) | Locked (D2) |
| No personal financial advice positioning | Locked (D1) |
| No mobile app before web PMF | Locked (D6) |
| Supabase RLS currently disabled | D-006 — must fix before beta |
| No legal/T&Cs in product yet | D-016 — must fix before beta |
| No CI/CD workflows in `.github/workflows/` yet | Manual verification via Vercel preview + scripts |
| Vercel token scope cannot see project deployments via CLI | Probe `familywealthlab.net` directly for smoke tests |
| SQLite (`shared/schema.ts`) is dev shim only, NOT production | Production data = Supabase only |
| Some `sf_snapshot` rows lack `mortgage_rate`/`mortgage_term_years` | Fallback to `mc_fire_settings.mean_mortgage_rate` + 30y default; report via `rateSource`/`termSource` flags |

## Deployment Information

| Field | Value |
|---|---|
| Production URL | https://familywealthlab.net |
| Host | Vercel |
| Build command | `npm run build:client` |
| Output dir | `dist/public` |
| Serverless functions | `api/ai-insights.ts` (30s) · `api/market-data.ts` (25s) |
| SPA routing | All non-`/api/*` paths → `/index.html` (`vercel.json`) |
| Required env vars | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, `NODE_ENV`, `PORT` |
| Smoke routes | `/`, `/dashboard`, `/goal-lab`, `/forecast`, `/wealth-strategy`, `/timeline`, `/risk-radar`, `/reports`, `/api/market-data` |
| Smoke command | `curl -s -o /dev/null -w "%{http_code}\n" https://familywealthlab.net<route>` (expect 200 on each) |
| Last verified | Smoke 9/9 OK on `main` @ `a272b97` (tag `v0.1.0-docs-baseline`) |

If any smoke route fails, **stop** and read `docs/ai-handover/FWL_KNOWN_DEFECTS.md` before changing anything.
