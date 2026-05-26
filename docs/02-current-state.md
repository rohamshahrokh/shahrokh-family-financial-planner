# 02 — Current State

**Snapshot date:** 2026-05-26

## Production status

| Aspect | Value |
| ------ | ----- |
| Production URL | https://familywealthlab.net |
| Login | username `Roham` / password `YaraJana2025` (headless login currently broken — manual browser only) |
| Deployment platform | Vercel — project `shahrokh-family-financial-planner` (scope `rohamshahrokhs-projects`) |
| Database | Supabase project `uoraduyyxhtzixcsaidg` (ap-southeast-2, Postgres 17, ACTIVE_HEALTHY) |
| Current `main` HEAD | `b1bc4fc` (Sprint 12 — Decision-Making System, PR #85) |
| Last merge | PR #85 on 2026-05-25 22:29 UTC |
| Open PRs | 5 (see `14-open-pr-status.md`) |

## What is currently working in production

- ✅ User login + session
- ✅ Dashboard / executive overview
- ✅ Canonical ledger CRUD via Settings
- ✅ Properties / Stocks / Crypto pages
- ✅ Sprint 6–10 engines (forecast, optimizer, Monte Carlo, Goal Solver Pro)
- ✅ Sprint 11 UX recovery improvements
- ✅ Sprint 12 Decision-Making System
- ✅ Audit Mode toggle + calculation trace

## What is currently broken in production (pending PR #88 deploy)

These defects are *fixed in branch* (PR #88, draft) but **not yet deployed**:

1. **Current Net Worth tile displays $3,150,000** — should display $816,500 (ledger). Cause: forecast P50 at target year leaks into the "current" field via `selectFireGapSummary` fallback. Fix: Phase B `48d739b`.
2. **SWR effectively used = 4%** despite user setting 7%. Cause: `canonicalFire.ts:78` hardcoded fallback wins. Fix: Phase A `3557741` + Phase B canonical goal layer.
3. **Do-nothing chart is a flat line** equal to current NW. Fix: Phase B `05e6d8d` returns a real ledger-projected series.
4. **No freshness indicator** for stale Monte Carlo. Fix: Phase A `6db5d84` + Phase C `3f85e06`.
5. **Strategy rankings render with no transient label** even though `sf_scenario_results` is empty. Fix: Phase B `05e6d8d` + Phase C `6c097c7`.
6. **Empty goal tiles show NaN / "$0" / no CTA.** Fix: Phase C `6c097c7`.
7. **No source lineage on any promoted number.** Fix: Phase C `6c097c7`.

## Open security advisory

23 public tables have **RLS disabled** — anyone with the anon key can read or modify every row. PR #89 prepares the SQL but is advisory-only (auto-enabling RLS without policies would take the app offline). See `10-known-issues.md`.

## Open architectural decisions

1. **Schema migration not yet applied** — `mc_fire_settings.goals_set` and `goal_set_timestamp` columns are scripted in PR #88 but not yet run. Apply after PR #88 merge.
2. **Scenario persistence (option a vs b)** — PR #88 chose (b): label as transient. Wiring server-side persistence to `sf_scenario_results` is deferred.
3. **`delay-property` real forecast** — `decisionCandidates.ts:472,484` uses closed-form `investibleBase × 0.07`. Annotated as estimate. Real-forecast replacement deferred.
4. **PR #87 (Sprint 13 UX rebuild)** — paused. No UX rebuild until PR #88 is merged and production reconciliation passes.

## Recent merges (last 7 days)

| PR | Title | Merged |
| -- | ----- | ------ |
| #85 | Sprint 12 — Decision-Making System (P0) | 2026-05-25 |
| #84 | Sprint 11 — UX Recovery (P0) | 2026-05-25 |
| #83 | Docs: UX Recovery Sprint — Audit, Redesign, Wireframes & Plan | 2026-05-25 |
| #82 | Docs: Family Wealth Lab User & Technical Guides | 2026-05-25 |
| #81 | Sprint 10 — Goal Solver Pro / Reverse Wealth Engineering | 2026-05-25 |
| #80 | Sprint 9 — Path-Based Wealth Simulation Engine | 2026-05-25 |
| #79 | Sprint 8 — Assumption Uncertainty Engine | 2026-05-25 |
| #78 | Sprint 7 — True Portfolio Optimizer | 2026-05-25 |

## Baselines to preserve

- **Typecheck baseline: 66 errors.** Every PR must end at ≤66. PR #88 ends at exactly 66.
- **Test suites:** Sprint 10 (846 assertions), Sprint 12 (47 assertions). All must remain green on every PR.
- **PR #87 head:** `94fd926` — must not be modified by any other branch.
