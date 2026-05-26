# 03 — System Architecture

## High-level diagram

```
                                  ┌─────────────────────────────────┐
                                  │   Vercel (familywealthlab.net) │
                                  └────────────────┬────────────────┘
                                                   │
            ┌──────────────────────────────────────┴───────────────────────────────┐
            │                                                                       │
   ┌────────▼────────┐                                                      ┌───────▼───────┐
   │   client/       │   ─── HTTP/JSON ──────► /api/* routes ──────►        │   server/     │
   │   (Vite SPA)    │                                                      │   (Express 5) │
   │                 │                                                      │               │
   │  React 18       │                                                      │  Route layer  │
   │  TypeScript     │                                                      │  Engine layer │
   │  Tailwind       │                                                      │  Lib layer    │
   │  shadcn/ui      │                                                      │               │
   │  Zustand store  │                                                      └───────┬───────┘
   │  TanStack Query │                                                              │
   │  Recharts       │                                                              │  @supabase/supabase-js
   │  Wouter (routes)│                                                              │  + Drizzle ORM
   │                 │                                                              │
   └─────────────────┘                                                              │
                                                                          ┌─────────▼─────────┐
                                                                          │  Supabase Postgres│
                                                                          │  uoraduyyxhtzix…  │
                                                                          │  Region: ap-se-2  │
                                                                          │                   │
                                                                          │  Tables (sf_*,    │
                                                                          │  mc_*) — see      │
                                                                          │  04-data-model.md │
                                                                          └───────────────────┘
```

## Top-level directory layout

```
shahrokh-family-financial-planner/
├── api/                 # Vercel serverless API entry (compiled Express)
├── attached_assets/     # Static assets bundled into the client
├── audit/               # Audit-mode test fixtures + helpers
├── client/              # Vite SPA
│   ├── src/
│   │   ├── components/  # Feature components (Portfolio Lab, Dashboard, etc.)
│   │   ├── lib/         # Client-side hooks, selectors, formatters
│   │   ├── state/       # Zustand stores + view-model selectors
│   │   └── pages/       # Page-level route components
├── docs/                # This documentation package + legacy guides
├── screenshots/         # Smoke-test + audit screenshots
├── script/              # Build scripts (Vite + tsx)
├── server/              # Express backend
│   ├── lib/             # canonicalGoal, forecast, monteCarlo, etc.
│   ├── routes/          # /api/* route handlers
│   └── index.ts         # Server entry
├── shared/              # Code shared between client and server (types, zod schemas)
├── sql/                 # SQL files (migrations, ad-hoc queries)
├── package.json
└── README.md            # (legacy — says SQLite; actually uses Supabase Postgres)
```

## Layered architecture (client)

| Layer | Path | Responsibility |
| ----- | ---- | -------------- |
| Pages | `client/src/pages/` | URL → screen wiring |
| Feature components | `client/src/components/portfolio-lab/`, `dashboard/`, etc. | Specific UI for each module |
| State (Zustand stores) | `client/src/state/` | Reactive client state + cross-page selectors |
| View-model selectors | `client/src/state/*View.ts`, e.g. `goalSolverView.ts` | Translate raw engine output into UI-ready shapes |
| Lib (hooks + utils) | `client/src/lib/` | `useCanonicalGoal`, `forecastFreshness`, `uiEmptyField`, `decisionCandidates`, etc. |
| Data contract | `client/src/state/dashboardDataContract.ts` | The canonical UI contract (`selectCanonicalNetWorth` lives here) |

## Layered architecture (server)

| Layer | Path | Responsibility |
| ----- | ---- | -------------- |
| Route handlers | `server/routes/` | Validate input (Zod), call engine, return JSON |
| Engines (lib) | `server/lib/` | Pure functions for forecast, Monte Carlo, optimizer, Goal Solver Pro, canonical goal |
| DB access | `server/db.ts` + `server/lib/supabase*.ts` | Supabase client + Drizzle queries |
| Schemas | `shared/schema.ts` | Drizzle table definitions + Zod validation |

## Request lifecycle

```
Browser  →  /api/canonical-goal               (GET)
            ↓
         server/routes/canonicalGoal.ts        (validate, authorize)
            ↓
         server/lib/canonicalGoal.ts           (select from sf_snapshot, mc_fire_settings)
            ↓
         @supabase/supabase-js                 (HTTPS to Supabase)
            ↓
         Postgres                              (returns row)
            ↑
         JSON response                         ← server/routes/canonicalGoal.ts
            ↑
         useCanonicalGoal() hook               ← client/src/lib/useCanonicalGoal.ts
            ↑
         FireGapSummaryBlock component         ← client/src/components/portfolio-lab/
```

## Authentication

- App-level auth via the Express server: username/password posted to `/api/login`, session cookie set.
- The login is a **shared single account** (`Roham` / `YaraJana2025`) — there is no multi-user / multi-tenant logic. Production data is always `owner_id = 'shahrokh-family-main'`.
- Supabase auth is **not** used in production today — the server uses the anon key directly. See `10-known-issues.md` for RLS implications.

## Deployment

- Builds: `npm run build` runs `vite build` (client → `dist/public/`) then `tsx script/build.ts` (server → `dist/index.cjs`).
- Vercel serves the client statically and routes `/api/*` to the bundled Express handler.
- Supabase project is provisioned manually; schema lives in `shared/schema.ts` and `sql/`.
- See `12-deployment-guide.md` for full deployment + rollback steps.

## Cross-cutting features

- **Audit Mode** — a global toggle (sidebar) that surfaces calculation traces on every metric. Tests under `test:audit-mode` and `test:global-tooltip-system`.
- **Advanced Disclosure** — `<AdvancedDisclosure>` component that hides legacy or expert-only UI by default. Used for "demote, don't delete".
- **Source lineage** — `SourceTag` component (Phase C `6c097c7`) tags every promoted value with one of: Current Ledger / FIRE Settings / Forecast Engine / Monte Carlo Run / Scenario Result.
- **Reconciliation invariant** — `assertCurrentNwIsLedger(currentNw, ledgerNw)` (Phase B `48d739b`) throws on >$1 drift between displayed and ledger NW.

## External services

| Service | Purpose | How accessed |
| ------- | ------- | ------------ |
| Supabase | Database | `@supabase/supabase-js` from server only |
| Vercel | Deployment + hosting | `npx -y vercel --token "$VERCEL_TOKEN" --scope rohamshahrokhs-projects` |
| GitHub | Source control + PRs | `gh` CLI; repo: `rohamshahrokh/shahrokh-family-financial-planner` |
