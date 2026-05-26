# 05 — Engine Map

This document maps every analytical engine in the codebase: what it computes, what feeds it, what consumes its output, and its current status.

## Engine taxonomy

| Engine | Layer | Purpose | Key file |
| ------ | ----- | ------- | -------- |
| Canonical Goal Selector | server | Read FIRE goal + SWR from single source | `server/lib/canonicalGoal.ts` |
| Forecast Engine (deterministic) | server | Project ledger forward year-by-year | `server/lib/forecast/*` |
| Do-Nothing Forecast | server | Current-path forecast with no strategy overlay | `server/lib/forecast/doNothing.ts` (Phase B) |
| Monte Carlo (probabilistic) | server | P10/P50/P90 NW bands + P(FIRE) | `server/lib/monteCarlo/*` |
| Forecast Freshness | server | Compute stale flag from `ran_at` vs snapshot | `server/lib/forecastFreshness.ts` (Phase A) |
| True Portfolio Optimizer | server/client | Allocation optimization | `server/lib/optimizer/*` + `client/src/components/portfolio-lab/TruePortfolioOptimizer.tsx` |
| Goal Solver Pro | server | Reverse wealth engineering — strategy delta to hit FIRE | `server/lib/goalSolverPro/*` + `client/src/lib/goalSolverPro.ts` |
| Decision Engine | server | Rank discrete decisions (delay property, max super, etc.) | `server/lib/decisions/*` + `client/src/lib/decisionCandidates.ts` |
| Plan Execution / Funding | server | Resolve funding source per decision + cashflow bridge | `server/lib/funding/*` |
| Path-Based Wealth Simulation | server | Path simulation across strategies | `server/lib/pathSim/*` (Sprint 9) |
| Assumption Uncertainty | server | Uncertainty propagation through forecast | `server/lib/uncertainty/*` (Sprint 8) |
| Tax Rules | server | Australian tax regime calculations | `server/lib/tax/*` |
| Audit Trace | shared | Calculation tracing for Audit Mode | `shared/audit/*` |
| Reconciliation Invariant | client | Throws on Current NW vs ledger drift | `assertCurrentNwIsLedger` in `dashboardDataContract.ts` (Phase B) |

## Engine flow — Portfolio Lab end-to-end

```
sf_snapshot ───┐
mc_fire_settings ──► canonicalGoal ──► useCanonicalGoal()
sf_properties ─┤                                  │
sf_stocks ─────┤                                  ▼
sf_crypto ─────┴──► Forecast Engine ──► Forecast outputs ──┐
                                                            │
                    Monte Carlo ─────► mc_fire_results ────┤
                                          │                 │
                                          ▼                 │
                              forecastFreshness ────────────┤
                                                            │
                    True Portfolio Optimizer ───────────────┤
                              │                             │
                              ▼                             │
                    Path Simulation ─────────────────────────┤
                              │                             │
                              ▼                             │
                    Decision Candidates ────────────────────┤
                              │                             │
                              ▼                             ▼
                    Goal Solver Pro ────► selectFireGapSummary (goalSolverView.ts)
                                                            │
                                                            ▼
                                       TruePortfolioOptimizer + FireGapSummaryBlock + Charts
```

## Engine-by-engine

### Canonical Goal Selector — `server/lib/canonicalGoal.ts`

- **Inputs:** `mc_fire_settings` row for owner
- **Outputs:** `{ goalsSet, swrPct, targetFireAge, targetPassiveMonthly, goalSetTimestamp }`
- **Rule:** never falls back. If `goals_set=false` (or column missing), returns `goalsSet:false` with nulls. UI then renders "Goal not set" CTAs.
- **Client hook:** `client/src/lib/useCanonicalGoal.ts` → `GET /api/canonical-goal`
- **Phase A** (PR #88)

### Forecast Engine — `server/lib/forecast/*`

- **Inputs:** ledger snapshot + super assumptions + planned investments + property timeline
- **Outputs:** year-by-year deterministic projection of ledger components and aggregate NW
- **Notes:** Sprints 4–7 evolved this engine; current canonical entry point is the Sprint 7 True Portfolio Optimizer wrapper

### Do-Nothing Forecast — `server/lib/forecast/doNothing.ts` (Phase B)

- **Inputs:** ledger + years horizon
- **Outputs:** non-flat series projecting ledger at blended expected return with planned contributions only (no strategy overlay)
- **Why:** Pre-Phase B, the "Do Nothing" chart line was a flat constant equal to current NW. Now it's a real forecast. Replaces `PortfolioLabCharts.tsx:108` flat constant.

### Monte Carlo — `server/lib/monteCarlo/*`

- **Inputs:** ledger + assumptions + uncertainty distributions
- **Outputs:** P10/P50/P90 bands per year, probability-of-FIRE at target year, `nw_p50_at_target`
- **Persisted to:** `mc_fire_results`
- **Production state:** Last run 2026-05-01. Currently **25 days stale** vs 2026-05-19 snapshot.
- **Critical:** `nw_p50_at_target` is FUTURE-year P50. Never display as Current NW.

### Forecast Freshness — `server/lib/forecastFreshness.ts` (Phase A)

- **Inputs:** `ran_at` from `mc_fire_results`, `updated_at` from `sf_snapshot`
- **Outputs:** `{ mcRunDate, sourceSnapshotDate, isStale, staleReason }`
- **Rules:** stale if `ran_at < updated_at` OR `ran_at` > 14 days old
- **Client:** `GET /api/forecast-freshness` consumed by `ForecastFreshnessBanner` (Phase C)

### True Portfolio Optimizer (Sprint 7)

- **Inputs:** ledger + planned investments + risk targets
- **Outputs:** optimal allocation + projected path
- **Component:** `client/src/components/portfolio-lab/TruePortfolioOptimizer.tsx`
- **Known defect:** `:981` used to short-circuit on `EMPTY_GOAL_TARGETS` and bypass ledger NW. **Fixed in Phase B `48d739b`.**

### Goal Solver Pro (Sprint 10)

- **Inputs:** ledger + goal + forecast
- **Outputs:** strategy delta that closes the FIRE gap; feasibility flag
- **Server:** `server/lib/goalSolverPro/*`
- **Client:** `client/src/lib/goalSolverPro.ts`
- **Known defect:** `buildFeasibility @ goalSolverPro.ts:404-432` used to force ACHIEVABLE even with empty inputs. **Fixed in Phase B `48d739b`** — now returns `goal_not_set` when canonical goal not set.

### Decision Engine + Candidates

- **Inputs:** ledger + goal + forecast + scenario state
- **Outputs:** ranked decision list with probability impact, feasibility, funding source
- **File:** `client/src/lib/decisionCandidates.ts`
- **Known defect:** `:472,484` `delay-property` uses closed-form `investibleBase × 0.07` instead of real forecast. **Annotated as estimate** in Phase B; real-forecast replacement deferred.

### Path-Based Wealth Simulation (Sprint 9)

- **Inputs:** strategy candidates × Monte Carlo paths
- **Outputs:** robust score, best strategy, NW fan
- **Field of concern:** `pathSim.bestStrategy.netWorthBand.p50` — used to leak into `nwGap.actual` (smoking gun). **Fixed in Phase B.**

### Assumption Uncertainty Engine (Sprint 8)

- **Inputs:** assumption ranges (e.g., growth rate ± σ)
- **Outputs:** uncertainty bands propagated through forecasts
- **Used by:** Monte Carlo + Path Simulation

### Tax Rules Engine

- **Inputs:** income + super contribs + investment income
- **Outputs:** tax owed, after-tax cash, refund/super flow
- **Notes:** Australian rules; FY-aware; covered by `test:tax-rules-engine`

### Reconciliation Invariant — `assertCurrentNwIsLedger` (Phase B)

- **Inputs:** currentNw (as promoted), ledgerNw (from selectCanonicalNetWorth)
- **Behaviour:** throws on >$1 drift
- **Plus:** `useEffect` in `TruePortfolioOptimizer` logs `console.warn` (dev) / `console.error` (prod) + dev-only destructive toast on drift (Phase C)

## Engine status summary

| Engine | Production | Phase A/B/C fixes | Status |
| ------ | ---------- | ----------------- | ------ |
| Canonical Goal Selector | not deployed | Phase A | ✅ in PR #88 |
| Forecast Engine | deployed (Sprint 7) | unchanged | ✅ |
| Do-Nothing Forecast | flat (broken) | Phase B fix | ⚠ awaiting PR #88 deploy |
| Monte Carlo | deployed (Sprint 8) | freshness wired in Phase A | ⚠ 25 days stale |
| Forecast Freshness | not deployed | Phase A | ✅ in PR #88 |
| True Portfolio Optimizer | deployed (Sprint 7) | Phase B fix to TPO:981 | ⚠ awaiting PR #88 deploy |
| Goal Solver Pro | deployed (Sprint 10) | Phase B fixes | ⚠ awaiting PR #88 deploy |
| Decision Engine | deployed (Sprint 12) | Phase B annotations | ✅ functional, estimate flag added in PR #88 |
| Path Simulation | deployed (Sprint 9) | Phase B fallback removal | ⚠ awaiting PR #88 deploy |
| Uncertainty Engine | deployed (Sprint 8) | unchanged | ✅ |
| Tax Rules | deployed | unchanged | ✅ |
| Reconciliation Invariant | not deployed | Phase B/C | ✅ in PR #88 |
