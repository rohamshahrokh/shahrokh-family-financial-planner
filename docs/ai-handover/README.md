# AI Handover Pack — Index

Concise reference pack for any new AI coding assistant (Claude Opus/Sonnet) continuing this project. Read `/CLAUDE.md` at repo root first, then follow the order below.

All docs are table-first, under 250 lines, with file-path citations. No marketing fluff. No speculation.

## Reading Order

| # | File | Purpose | When to read | Depends on |
|---|---|---|---|---|
| 1 | [FWL_PROJECT_CONTEXT.md](./FWL_PROJECT_CONTEXT.md) | What FWL is, target user, product goal, branch + deploy status | First — orientation | none |
| 2 | [FWL_PRODUCT_POSITIONING.md](./FWL_PRODUCT_POSITIONING.md) | Customer / non-customer, AU-first assumptions, commercial vision, subscription strategy, JTBD, competitors | Before any UI copy, marketing surface, AI insight prompt, or business-direction question | 1 |
| 3 | [FWL_ARCHITECTURE_MAP.md](./FWL_ARCHITECTURE_MAP.md) | Repo structure, client/server/api/shared folders, Supabase usage, Vercel setup, env vars, deployment process | Before opening any source file | 1 |
| 4 | [FWL_ENGINE_CONTRACTS.md](./FWL_ENGINE_CONTRACTS.md) | Per-metric source of truth — selectors, file paths, formulas, UI consumers, failure modes (NW, FIRE, risk, recommendation, roadmap, etc.) | Before touching any canonical selector or adding any new metric (contract-first rule D7) | 3 |
| 5 | [FWL_FEATURE_STATUS.md](./FWL_FEATURE_STATUS.md) | Status table for Today / Plan / Forecast / Move / Goal Lab / Decision Lab / Action Roadmap / Risk Radar / Property Engine / Timeline / Monte Carlo / Reports / Mobile UI / Auth / Billing / Legal | Before scoping any feature task | 3 |
| 6 | [FWL_DECISION_LOG.md](./FWL_DECISION_LOG.md) | Locked decisions (D1–D8): no advice positioning, AU-first, subscription, beta-first, target users, no mobile-before-web, contract-first, single source of truth | Before challenging any product or business decision | 1, 2 |
| 7 | [FWL_KNOWN_DEFECTS.md](./FWL_KNOWN_DEFECTS.md) | Defect register (ID, defect, root cause, status, files, fix; resolved vs unresolved). D-006 RLS and D-016 legal are Phase-2 blockers | Before debugging, and before any production-impacting change | 3, 5 |
| 8 | [FWL_CLAUDE_WORKING_RULES.md](./FWL_CLAUDE_WORKING_RULES.md) | Working rules: read docs first, never scan whole repo, identify exact files, contract-first, preserve tests, typecheck + preview before merge, never invent formulas, cite selectors, no duplicate state | Before opening any source file | 3, 4, 6 |
| 9 | [FWL_DATA_MODEL.md](./FWL_DATA_MODEL.md) | Source-of-truth hierarchy, Supabase schema, key tables (purpose/PK/FKs/owner/consumers/failure modes), relationships, duplication risks, asset aggregation, cash/PPOR/mortgage handling, Goal Lab / Forecast / Decision Lab / Roadmap inputs | Before any data-layer or selector change | 3, 4 |
| 10 | [FWL_METRICS_AND_KPIS.md](./FWL_METRICS_AND_KPIS.md) | North-star metric, activation funnel, engagement, retention, conversion, revenue (MRR/ARR/ARPU/LTV/CAC), churn, friends-and-family beta targets, success criteria at 100/1,000/10,000 paying, founder-dashboard requirements | Before any analytics, founder-dashboard, or commercial-success work | 1, 2, 6 |
| 11 | [FWL_NEXT_90_DAYS.md](./FWL_NEXT_90_DAYS.md) | Month 1 product stabilization / Month 2 friends-family beta / Month 3 feedback iteration / Month 4 launch readiness, with owners | Before suggesting any roadmap or sprint scope | 5, 6, 7, 10 |

## File Inventory

| File | Lines (cap 250) |
|---|---|
| FWL_PROJECT_CONTEXT.md | 45 |
| FWL_PRODUCT_POSITIONING.md | 197 |
| FWL_ARCHITECTURE_MAP.md | 98 |
| FWL_ENGINE_CONTRACTS.md | 151 |
| FWL_FEATURE_STATUS.md | 22 |
| FWL_DECISION_LOG.md | 12 |
| FWL_KNOWN_DEFECTS.md | 20 |
| FWL_CLAUDE_WORKING_RULES.md | 55 |
| FWL_DATA_MODEL.md | 244 |
| FWL_METRICS_AND_KPIS.md | 184 |
| FWL_NEXT_90_DAYS.md | 82 |
| Total | 1,110 |

## Dependency Graph

```
1 PROJECT_CONTEXT
  ├─→ 2 PRODUCT_POSITIONING
  │     └─→ 6 DECISION_LOG
  │           └─→ 8 CLAUDE_WORKING_RULES
  ├─→ 3 ARCHITECTURE_MAP
  │     ├─→ 4 ENGINE_CONTRACTS
  │     │     ├─→ 5 FEATURE_STATUS
  │     │     │     └─→ 11 NEXT_90_DAYS
  │     │     └─→ 9 DATA_MODEL
  │     └─→ 7 KNOWN_DEFECTS
  └─→ 10 METRICS_AND_KPIS (depends on 1, 2, 6)
```

## How To Use This Pack

| Task type | Required reading | Minimum |
|---|---|---|
| Orientation only | 1, 2 | 2 docs |
| UI copy / marketing surface / AI insight prompt | 1, 2, 6 | 3 docs |
| Bug fix in existing surface | 1, 3, 5, 7, 8 | 5 docs |
| Selector or canonical-engine change | 1, 3, 4, 6, 8, 9 | 6 docs |
| New metric or formula (contract-first) | 1, 3, 4, 6, 8, 9 — and update 4 BEFORE code | 6 docs + contract update |
| Roadmap, sprint, or scope question | 1, 5, 6, 7, 10, 11 | 6 docs |
| Founder dashboard / analytics work | 1, 2, 6, 10 | 4 docs |
| Production-impacting change | 3, 5, 7, 8, plus root `/CLAUDE.md` deployment section | 4 docs + root |

## Cross-Cutting Constraints

- **AU-only** at launch (D2 in `FWL_DECISION_LOG.md`).
- **Information, not advice** (D1).
- **Single source of truth** — one canonical selector per metric (D8).
- **Contract first** — no new financial math without a written formula + selector signature in `FWL_ENGINE_CONTRACTS.md` (D7).
- **No mobile app before web PMF** (D6).
- **No application-code changes in docs-only PRs** — anything under `client/`, `server/`, `api/`, `shared/`, `supabase/`, `vercel.json`.

## Related Root-Level Entry Points

| File | Purpose |
|---|---|
| [/CLAUDE.md](../../CLAUDE.md) | AI session entry point (read first) |
| [/README.md](../../README.md) | Human-facing project README |
| [/vercel.json](../../vercel.json) | Deployment config |
| [/shared/schema.ts](../../shared/schema.ts) | Drizzle dev shim (NOT production) |
| [/shared/propertyLifecycle.ts](../../shared/propertyLifecycle.ts) | Canonical property-lifecycle predicates |
| [/server/routes.ts](../../server/routes.ts) | Express dev routes (legacy) |
| [/api/ai-insights.ts](../../api/ai-insights.ts) | Serverless: AI insights (POST, 30s) |
| [/api/market-data.ts](../../api/market-data.ts) | Serverless: market data (25s) |

## Last Verified

| Field | Value |
|---|---|
| Baseline tag | `v0.1.0-docs-baseline` |
| Baseline commit | `a272b97` |
| Production smoke | 9/9 routes 200 OK (`/`, `/dashboard`, `/goal-lab`, `/forecast`, `/wealth-strategy`, `/timeline`, `/risk-radar`, `/reports`, `/api/market-data`) |
| Production URL | https://familywealthlab.net |
