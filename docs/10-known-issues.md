# 10 — Known Issues

Living list of every known defect / blocker / risk, with status.

## 🔴 Critical — in production today

These are visible to the end user RIGHT NOW. All have fixes in branch (PR #88) but **not yet deployed**.

| # | Issue | Where | Fix |
| - | ----- | ----- | --- |
| KI-1 | Current Net Worth tile shows $3,150,000 instead of $816,500 | Portfolio Lab hero | PR #88 Phase B `48d739b` |
| KI-2 | Effective SWR = 4% instead of user-set 7% | Goal calcs | PR #88 Phase A `3557741` |
| KI-3 | Do-Nothing chart is flat | Portfolio Lab chart | PR #88 Phase B `05e6d8d` |
| KI-4 | No freshness indicator for 25-day-stale MC | Portfolio Lab | PR #88 Phase A `6db5d84` + Phase C `3f85e06` |
| KI-5 | Strategy rankings render with no transient label | Portfolio Lab rankings | PR #88 Phase B `05e6d8d` + Phase C |
| KI-6 | Empty goal tiles show NaN / "$0" with no CTA | Goal area | PR #88 Phase C `6c097c7` |
| KI-7 | No source lineage on any promoted number | All primary UI | PR #88 Phase C `6c097c7` |

## 🔴 Critical — security

| # | Issue | Where | Fix |
| - | ----- | ----- | --- |
| KI-SEC1 | 23 public tables have RLS disabled | Supabase project `uoraduyyxhtzixcsaidg` | PR #89 (advisory only, NOT applied) |
| KI-SEC2 | Anon key has implicit full-table access | Server uses anon key directly | requires policy design first |

## 🟠 High

| # | Issue | Where | Status |
| - | ----- | ----- | ------ |
| KI-8 | `decisionCandidates.ts:472,484` `delay-property` uses closed-form `× 0.07` | Decisions page | Annotated as estimate in PR #88; real-forecast replacement deferred |
| KI-9 | Hardcoded `REQUIRED_PROB_BAR = 0.7` | `goalSolverView.ts:25` | Labelled as default in PR #88; canonical wiring deferred |
| KI-10 | Scenario results never persisted to `sf_scenario_results` | Optimizer flow | Option (b) labelled transient; option (a) deferred |
| KI-11 | Schema migration for `goals_set` / `goal_set_timestamp` not yet applied | `mc_fire_settings` | Apply via `supabase migration up` after PR #88 merge |
| KI-12 | `canonicalFire.ts` legacy paths still imported by some consumers | Multiple call sites | `@deprecated` markers added; cleanup deferred |

## 🟡 Medium

| # | Issue | Where | Status |
| - | ----- | ----- | ------ |
| KI-13 | PR #87 has 234px above-fold overflow on Sprint 13 Reality Check tab | `feat/sprint13-reality-check-v2` | Paused — fix before merging |
| KI-14 | README mentions SQLite; production is Supabase Postgres | `README.md` root | Needs correction in a future docs PR |
| KI-15 | Headless login is broken | Login flow | Cannot automate browser sessions; manual only |
| KI-16 | Long chain of stacked open PRs #11–#51 | GitHub | Mostly superseded by Sprints 7–12; close in cleanup pass |
| KI-17 | `freshness banner` Re-run Monte Carlo CTA has no `onRerun` handler | `ForecastFreshnessBanner` | Renders but click is no-op; wire to MC run mutation |
| KI-18 | Phase 0 reconciliation doc lists ledger as $856,500; actual computation yields $816,500 | `phase_0_production_reconciliation.md` | Updated post-fix; PR #88 spec text says $856,500 — superseded by `13-production-state.md` |

## 🟢 Low / cleanup

| # | Issue | Status |
| - | ----- | ------ |
| KI-19 | SourceTag `forecast` variant has no current binding (uses `mc` instead) | Phase C report — reserved for future use |
| KI-20 | Sprint 13 UX rebuild PR #87 is feature-paused | Per locked decision #9 — resume after PR #88 lands |
| KI-21 | Documentation Sprint hero doc says "Default Financial Snapshot $811,000 NW" — slightly different from current $816,500 | `README.md` | Out of date but not breaking |

## Verification status

| Datum | Source | Verified |
| ----- | ------ | -------- |
| Current Net Worth = $816,500 | Supabase `sf_snapshot` | ✅ Confirmed 2026-05-26 via SQL |
| MC P50 at target = $3,240,679 | Supabase `mc_fire_results` | ✅ Confirmed 2026-05-26 via SQL |
| MC ran 2026-05-01 | Supabase `mc_fire_results.ran_at` | ✅ Confirmed |
| Snapshot updated 2026-05-19 | Supabase `sf_snapshot.updated_at` | ✅ Confirmed |
| swr_pct=7 | Supabase `mc_fire_settings` | ✅ Confirmed |
| 23 RLS-disabled tables | Supabase advisor | ✅ Confirmed |
| Build green at typecheck 66 | PR #88 Phase C | ✅ Subagent report |
| 120 new unit tests | PR #88 | ✅ Subagent report |
| PR #87 head `94fd926` untouched | git log | ✅ Confirmed |

## Unverified (carry forward)

| Datum | Reason |
| ----- | ------ |
| Production reflects PR #88 fixes | PR #88 not deployed yet — production still shows $3.15M |
| Schema migration applies cleanly | Migration file written but never run against the live DB |
| `onRerun` wiring works | Not yet implemented |
| RLS policies preserve current app behaviour | Policies are template only; need Supabase branch test |
