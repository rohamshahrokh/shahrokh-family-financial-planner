# 09 — Audit Backlog

A consolidated list of every audit / forensic finding still open or partially addressed. Each entry has: severity, finding, current status, and the file/commit where it is addressed.

## Severity legend
- 🔴 **CRITICAL** — incorrect numbers shown to user
- 🟠 **HIGH** — wrong behaviour but not user-visible incorrect output
- 🟡 **MEDIUM** — degraded UX or maintainability risk
- 🟢 **LOW** — cleanup / nice-to-have

---

## 🔴 A1 — Current NW shows $3.15M instead of $816,500
- **Where:** Portfolio Lab hero tile
- **Cause:** `selectFireGapSummary` falls back from `nwGap?.actual` to `best?.netWorthP50` (= MC P50 at target year 2036)
- **Files:** `client/src/state/goalSolverView.ts:44-48`; `client/src/components/portfolio-lab/TruePortfolioOptimizer.tsx:981` (EMPTY_GOAL_TARGETS short-circuit)
- **Fix:** PR #88 Phase B commit `48d739b` — fallback removed; `assertCurrentNwIsLedger` invariant added
- **Status:** ✅ Fixed in branch. **Awaiting PR #88 merge + deploy.**

## 🔴 A2 — Effective SWR = 4% despite user-set 7%
- **Where:** Portfolio Lab passive-income calculations
- **Cause:** `canonicalFire.ts:78` hardcoded `?? 4` overrides user value
- **Fix:** PR #88 Phase A commits `3557741` + `3f55192` — `useCanonicalGoal()` is single source; legacy sources marked `@deprecated`
- **Status:** ✅ Fixed in branch. **Awaiting PR #88 merge + deploy.**

## 🔴 A3 — Do-nothing chart is a flat constant
- **Where:** `PortfolioLabCharts.tsx:108`
- **Cause:** baseline series hardcoded to current NW for all years
- **Fix:** PR #88 Phase B commit `05e6d8d` — new `buildDoNothingForecast` returns real series
- **Status:** ✅ Fixed in branch. **Awaiting PR #88 merge + deploy.**

## 🔴 A4 — Five conflicting SWR sources in code
- **Sources:** `mc_fire_settings.swr_pct` (canonical), `sf_app_settings.settings.assumptions.safe_withdrawal_rate` (4%), `sf_scenarios.swr` (3.5%), `canonicalFire.ts:78` (4% hardcoded), UI-derived (effective 4%)
- **Fix:** PR #88 Phase A — `useCanonicalGoal()` is canonical; others marked `@deprecated`
- **Status:** ✅ Marked deprecated. Full removal deferred to future sprint.

## 🔴 A5 — Rankings render even though `sf_scenario_results` is empty
- **Where:** PathSim + ProbabilisticWealth ranking sections
- **Cause:** UI reads from in-memory engine output without checking persistence
- **Fix:** PR #88 Phase B commit `05e6d8d` + Phase C `6c097c7` — labelled "Transient — not saved" pill
- **Status:** ✅ Labelled in branch. **Persistence option (a) — server write to `sf_scenario_results` — deferred.**

## 🔴 A6 — Empty/NaN values in primary UI
- **Where:** Goal-not-set state shows NaN FIRE year, empty target date, $0 contribs without context
- **Cause:** `buildFeasibility @ goalSolverPro.ts:404-432` forces ACHIEVABLE; `uiEmptyField.ts:36-39` treats "0"/"$0"/"0%" as empty
- **Fix:** PR #88 Phase B `48d739b` + Phase C `6c097c7`
- **Status:** ✅ Fixed in branch. **Awaiting PR #88 merge + deploy.**

## 🟠 A7 — Forecast freshness has no metadata anywhere
- **Cause:** No comparison between `mc_fire_results.ran_at` and `sf_snapshot.updated_at`
- **Fix:** PR #88 Phase A commit `6db5d84` — `forecastFreshness.ts` + `/api/forecast-freshness` + Phase C `ForecastFreshnessBanner`
- **Status:** ✅ Fixed in branch.

## 🟠 A8 — No source lineage on promoted numbers
- **Cause:** UI shows numbers without indicating where they came from
- **Fix:** PR #88 Phase C `6c097c7` — `SourceTag` component applied to every promoted value
- **Status:** ✅ Fixed in branch.

## 🟠 A9 — `delay-property` decision uses closed-form `× 0.07`
- **Where:** `client/src/lib/decisionCandidates.ts:472, 484`
- **Cause:** Sprint 10 placeholder math; should call real forecast
- **Fix (partial):** PR #88 annotates as estimate
- **Status:** ⚠️ Annotation only. **Real-forecast replacement deferred.**

## 🟠 A10 — Hardcoded `REQUIRED_PROB_BAR = 0.7`
- **Where:** `client/src/state/goalSolverView.ts:25`
- **Cause:** Not user-configurable
- **Fix (partial):** PR #88 labels source as "default"; canonical override deferred
- **Status:** ⚠️ Labelled. **Full canonical wiring deferred.**

## 🟠 A11 — `canonicalFire.ts` still imports legacy paths
- **Cause:** Although deprecated, scattered consumers still call these
- **Fix:** PR #88 Phase A added `@deprecated` JSDoc markers
- **Status:** ⚠️ Marked but not yet removed.

## 🔴 SEC1 — 23 public tables have RLS DISABLED
- **Tables:** `sf_snapshot`, `sf_users`, `sf_properties`, `sf_stocks`, `sf_crypto`, `sf_income`, `sf_app_settings`, `sf_expenses`, `sf_timeline`, `sf_stock_transactions`, `sf_crypto_transactions`, `sf_recurring_bills`, `sf_monthly_budgets`, `sf_telegram_settings`, `sf_stock_dca`, `sf_crypto_dca`, `sf_planned_investments`, `sf_cfo_reports`, `sf_cfo_settings`, `sf_bill_occurrences`, `sf_bill_notification_log`, `sf_daily_digest_log`, `sf_snapshot_change_log`
- **Risk:** Anyone holding the project's anon key can read/modify every row
- **Fix:** PR #89 — SQL prepared, NOT applied; needs policy design + Supabase branch test
- **Status:** ⚠️ Advisory only. **No fix deployed.**

## 🟡 UX1 — PR #87 has 234px above-fold overflow
- **Where:** Sprint 13 Reality Check UI
- **Status:** PR #87 paused pending data remediation; will need overflow fix before merge.

## 🟡 UX2 — README mentions SQLite but production uses Supabase Postgres
- **Where:** `README.md`
- **Fix:** Out of scope for PR #88. **Should be corrected in a future docs PR.**

## 🟡 DEPLOY1 — Headless login is broken
- **Where:** Login flow can't be automated via headless browser
- **Status:** Manual browser testing only. No fix scheduled.

## 🟢 CLEAN1 — Long chain of stacked open PRs (#11 – #51)
- **Status:** Mostly superseded by Sprints 7–12. Should be closed in a cleanup pass.

## Audit findings → PR mapping

| Finding | PR #88 phase | Status |
| ------- | ------------ | ------ |
| A1 — Current NW $3.15M | B (commit 48d739b) | ✅ Fixed in branch |
| A2 — SWR 4% | A (commit 3557741) | ✅ Fixed in branch |
| A3 — Flat do-nothing | B (commit 05e6d8d) | ✅ Fixed in branch |
| A4 — 5 SWR sources | A (commit 3f55192) | ✅ Deprecated in branch |
| A5 — Empty `sf_scenario_results` | B + C | ✅ Labelled transient |
| A6 — Empty/NaN | B + C | ✅ Fixed in branch |
| A7 — No freshness | A + C | ✅ Fixed in branch |
| A8 — No lineage | C | ✅ Fixed in branch |
| A9 — `delay-property × 0.07` | (annotation only) | ⚠️ Deferred |
| A10 — `REQUIRED_PROB_BAR` | (label only) | ⚠️ Deferred |
| A11 — `canonicalFire.ts` legacy paths | A | ⚠️ Marked |
| SEC1 — RLS disabled | PR #89 (advisory) | ⚠️ Not deployed |
| UX1 — PR #87 overflow | PR #87 | ⚠️ Paused |
