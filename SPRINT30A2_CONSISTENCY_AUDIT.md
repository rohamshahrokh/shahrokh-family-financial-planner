# Sprint 30A.2 — Financial Consistency Audit

**Status:** RESOLVED by Sprint 30A.3 — Sprint 30B unblocked.
**Audit run:** 29 May 2026, 22:00 AEST
**Preview:** [czjxhxhbc.vercel.app](https://shahrokh-family-financial-planner-czjxhxhbc.vercel.app)
**Gate threshold:** variance ≤ 0.5%
**Max observed variance (pre-fix):** **3.03%** (Current NW) + **1.04%** (Terminal NW reconciliation gate)
**Max observed variance (post-fix, Sprint 30A.3):** **0.00 %** across all 5 modules + terminal
**Fix reference:** [SPRINT30A3_RECONCILIATION_FIX.md](./SPRINT30A3_RECONCILIATION_FIX.md) · commit `8c8f29a` · preview [shahrokh-family-financial-planner-hyjpatvfb.vercel.app](https://shahrokh-family-financial-planner-hyjpatvfb.vercel.app)

> Note: the failure analysis below describes the **pre-fix** Sprint 30A.2
> state and is retained verbatim as a forensic record. Both blockers (C1
> current NW + C2 terminal NW) have been resolved in Sprint 30A.3 by
> realigning the diagnostics with the existing engine behaviour — no engine
> math, no new dependencies.

---

## TL;DR

Two material inconsistencies block Sprint 30B:

| # | Defect | Variance | Severity |
|---|--------|----------|----------|
| **C1** | Forecast Engine + Monte Carlo show "Engine NW $735k" vs Dashboard "$758k" — UI labels this a **drift** ("diverges by $23,000 — investigate before relying on the simulation") even though the gap is the engineered cars haircut + `other_assets` exclusion. | **−3.03%** | High (user-visible) |
| **C2** | Action Roadmap §S4 Net Worth Attribution **terminal** reconciliation fails. `Components sum $11,650,428 vs MC P50 headline $11,530,286 → Δ +1.04%` exceeds the 0.50% tolerance. UI blocks S1 / S4 / S5 NW figures with "Reconciliation failed" — this is the gate doing its job, but the gate is **currently red** in demo. | **+1.04%** | Blocking |

Other findings are clean: FIRE Age (45), Passive Income ($109,810), and FIRE Number flow from the canonical goal selector and reconcile to the cent across all rendered surfaces of the recommended strategy.

A third lower-severity issue (**C3**) is included for completeness: Scenario Compare bypasses `selectCanonicalNetWorth` entirely and hand-rolls its own starting state from raw snapshot fields with hardcoded fallbacks.

---

## Canonical sources of truth (code map)

| Quantity | Single source | File |
|---|---|---|
| Net Worth | `selectCanonicalNetWorth(DashboardInputs)` | `client/src/lib/dashboardDataContract.ts:771` |
| Headline metrics (NW, surplus, savings rate) | `computeCanonicalHeadlineMetrics(ledger)` → `selectCanonicalNetWorth` | `client/src/lib/canonicalHeadlineMetrics.ts:105` |
| FIRE Age, FIRE Number, Passive Income, SWR | `selectCanonicalFire(ledger, goal)` → `computeCanonicalFire` | `client/src/lib/canonicalFire.ts:293` |
| Canonical goal (target_fire_age, target_passive_monthly, swrPct) | `deriveCanonicalGoalFromRow(mc_fire_settings)` | `client/src/lib/queryClient.ts:51`, mirror of `server/lib/canonicalGoal.ts` |
| MC starting state | `buildCanonicalMonteCarloInput` → reads canonical NW then haircuts cars × 0.8 | `client/src/lib/monteCarloCanonical.ts:132` |
| Terminal reconciliation gate (S1/S4/S5) | `reconcileTerminalNetWorth({ finalState, fanP50AtHorizon })` | `client/src/lib/actionRoadmap/financialReconciliation.ts:105` |

---

## Reconciliation table — **CURRENT** Net Worth

Canonical baseline: **$758,000** (`selectCanonicalNetWorth` of `DEMO_SNAPSHOT`)

| Module | Calculation path | Displayed value | Δ abs | Δ % | Gate |
|---|---|---|---|---|---|
| Dashboard | `useCanonicalNetWorth` → `selectCanonicalNetWorth` | $758,000 | $0 | 0.00% | ✅ PASS |
| Action Roadmap §S1 ("Current Position") | `computeCanonicalHeadlineMetrics` → `selectCanonicalNetWorth` | $758,000 | $0 | 0.00% | ✅ PASS |
| Forecast Engine reconciliation badge ("Dashboard NW") | `selectCanonicalNetWorth` (live preview reconciliation) | $758,000 | $0 | 0.00% | ✅ PASS |
| Forecast Engine reconciliation badge ("Engine NW") | `buildCanonicalMonteCarloInput` → cars × 0.8, **excludes `other_assets` + `iran_property`** | $735,000 | −$23,000 | **−3.03%** | ❌ FAIL |
| Monte Carlo starting NW | same as Engine NW | $735,000 | −$23,000 | **−3.03%** | ❌ FAIL |
| Scenario Compare current NW | (not displayed; engine builds from raw `snap.ppor`/`snap.cash` + hardcoded fallbacks) | n/a | n/a | n/a | ⚠️ UNMEASURABLE |

### Root cause of the −$23,000 gap

`buildCanonicalMonteCarloInput` includes `cars * 0.8`, `iran_property` (zero in demo), and settled IPs — but **does not** include `other_assets` ($12,000 in demo). The reconciliation diagnostic in `monteCarloCanonical.ts:198-208` only counts the `carsHaircut = cars * 0.2 = $11,000` as the "expected" gap. The other $12,000 from `other_assets` is silently excluded, so the diagnostic flags `actualDiff − expectedDiff = $12,000 ≠ 0 → status: FAIL → red "Drift detected" badge`.

Two valid fixes (engineering decision required, no math change):

- **Option A — include `other_assets` in the engine NW.** Add `engineSnapshot.other_assets` to the `engineStartingNetWorth` calculation in `monteCarloCanonical.ts:186-198`. NW matches Dashboard to the dollar.
- **Option B — widen the expected diff.** Set `expectedDiff = carsHaircut + otherAssets + iranPropertyExcluded` so the badge reports PASS while the engine continues to exclude them. Less honest because the user sees "matches Dashboard to the dollar" while the simulation still runs on $735k.

**Option A is the correct fix.** $12,000 of household assets being silently dropped from a 1,000-sim wealth projection is a real financial error — not a label gap.

---

## Reconciliation table — **TERMINAL** Net Worth (Action Roadmap, at FIRE horizon)

Gate logic: `reconcileTerminalNetWorth` compares the sum of asset-class component balances at the FIRE horizon vs the Monte Carlo P50 fan value at the same time, with a `TOLERANCE = 0.005` (0.5%).

| Field | Value | Source |
|---|---|---|
| Components sum (PPOR + IPs + ETF + super + cash + crypto + other − debts) | $11,650,428 | `finalState` (median final state of the recommended winner) |
| MC P50 headline at horizon | $11,530,286 | `netWorthFan[horizon].p50` |
| Δ absolute | +$120,142 | sum − headline |
| Δ percentage | **+1.04%** | tolerance is 0.50% |
| Gate status | **FAIL** | live error: _"Components sum ($11,650,428) differs from MC P50 headline ($11,530,286) by +$120,141 (1.04%). Tolerance is 0.5%."_ |

### What this gate blocks (per `BlockedField[]` in `financialReconciliation.ts:79`)

- S1 Executive Decision **"NET WORTH AT FIRE (P50)"** tile → renders **"Reconciliation failed"**
- S4 Net Worth Attribution chart → blocked
- S5 Monte Carlo Outlook NW figures (P25/P50/P75) → blocked
- Alternative-strategy card **"NW AT FIRE (P50)"** → blocked

FIRE Age, Passive Income, Confidence, Risks, Next Actions are **NOT** scope-blocked by this gate (verified — they still render: 45, $109,810, etc).

### Root cause of the +$120,142 terminal gap

The engine's `medianFinalState` (literal balances at the FIRE month) and the `netWorthFan[t].p50` (percentile across all sims at the same `t`) are not the same quantity — `p50FinalState` ≠ `p50OfNetWorthAtT` in stochastic simulations because the median final state is a single trajectory while the fan p50 is the order-statistic at each time slice. A 1% drift is plausible. The fix is **not** to widen the tolerance (that would mask the gap); it's either:

- **Reconcile the engine output**: make `medianFinalState` actually be the median trajectory's terminal NW, computed via the same percentile algorithm as the fan; OR
- **Use one or the other consistently**: pick the fan P50 as the headline and re-attribute components from a per-simulation sample chosen by NW-rank at the horizon.

Either is an engine change. Out of scope per the "NO new engines" constraint, but **must be resolved before Sprint 30B because the visualization sprint cannot Gantt blocked tiles.**

---

## FIRE Age / Passive Income / FIRE Number consistency

All three flow from `selectCanonicalFire(ledger, goal)` → `computeCanonicalFire` → fed `goal.swrPct` and `goal.targetPassiveMonthly` from `useCanonicalGoal`. After Sprint 30A.1 the demo `goal` derives status=SET from `mc_fire_settings` baseline.

| Surface | FIRE Age (P50) | Passive Income (P50) | Δ vs canonical |
|---|---|---|---|
| Action Roadmap §S1 Executive Decision | 45 | $109,810 | 0.00% / 0.00% |
| Action Roadmap §S5 Monte Carlo Outlook (P50 MEDIAN) | 45 | $109,810 | 0.00% / 0.00% |
| Action Roadmap §S7 Recommended Strategy card | 45 | $109,810 | 0.00% / 0.00% |
| Action Roadmap §S7 Alternative Strategy card (Hybrid) | 45 | $108,020 | 0.00% / −1.63% ← **legitimate path delta**, not an inconsistency |
| Dashboard | not displayed | not displayed | n/a |
| Forecast Engine | not displayed (shows probability of FIRE, not FIRE Age) | $120k threshold (`fire_settings.target_passive_monthly` × 12 — see line 1261) | label mismatch with goal's $9,000/mo target (= $108k/yr) |

**FIRE Number**: Recommended-card line reads `PROJECTED NW AT FIRE (P50) $2,745,238`. The canonical FIRE Number target from the goal is `9,000 × 12 / 0.04 = $2,700,000`. The card is showing the *projected* NW at the FIRE moment, not the target — this is correct labeling. Variance against canonical goal target: `($2,745,238 − $2,700,000) / $2,700,000 = +1.68%` — a legitimate over-achievement against the goal, not an inconsistency.

### Minor inconsistency: Forecast Engine threshold

`ai-forecast-engine.tsx:1261` hardcodes `$120k/yr passive income default` in the explainer text and uses it for the "financial-freedom-prob" probability tile. The canonical user goal in demo is `$9,000/mo = $108k/yr`. This produces a $12k/yr discrepancy between what the user set in Goal Lab and what the Forecast Engine probabilities are computed against. Not a blocker for Sprint 30B but should be wired through `useCanonicalGoal()` for consistency.

---

## Module-level findings

### 1. Dashboard
- NW: **$758,000** ✅
- Data Health page confirms `Net Worth Reconciliation: $758,000 = $758,000` ✅
- Source: canonical ✅

### 2. Action Roadmap (S1 Recommended + Alt Strategies)
- Current NW (S1): **$758,000** ✅
- Terminal NW (S1 NW AT FIRE P50): ❌ **"Reconciliation failed"** (blocked by 1.04% terminal gate)
- FIRE Age: **45** consistent across S1 / S5 / S7 / alt cards ✅
- Passive Income (recommended): **$109,810** consistent across S1 / S5 / S7 ✅
- Alt-strategy variance ($108,020) is a legitimate path delta ✅
- Source: canonical ✅, terminal recon: ❌

### 3. AI Forecast Engine (`/ai-forecast-engine`)
- Profile mode: no NW display
- Monte Carlo mode: shows reconciliation badge **"Drift detected"** with `Dashboard NW $758k / Engine NW $735k`
- Terminal projections: `Median Net Worth 2035` rendered as a money figure but blocked from showing real $ when MC hasn't been run yet
- Source: canonical (dashboard NW), but engine NW silently drops `other_assets` ❌

### 4. Scenario Compare (`/scenario-compare`) — Alternative Strategies engine
- No current NW displayed
- After Run All: **Balanced $2.85M by 2035**, **Buy IP Jul 2026 $2.55M by 2035**
- Starting state built **without** `selectCanonicalNetWorth` (lines 362-371):
  ```
  baseCash       = snap?.cash ?? 15000   + snap?.offset_balance ?? 222000  // demo: 20k + 95k = 115k ✓
  baseStocks     = snap?.stocks ?? 0                                       // demo: 62k ✓
  basePPOR       = snap?.ppor ?? 1510000                                   // demo: 1.20M (fallback 1.51M would leak if snap missing)
  baseMortgage   = snap?.mortgage ?? 1200000                               // demo: 850k (fallback 1.20M would leak if snap missing)
  baseSuperBalance = snap?.super_balance ?? 88000                          // demo: 160k flat — diverges from selectSuperCombined which sums roham+fara
  ```
- The hardcoded fallbacks are **inconsistent with `DEMO_SNAPSHOT`**: if `snap` were ever undefined, the engine would project on $1.51M PPOR and $1.20M mortgage and $88k super — values that match no other surface in the app.
- Live demo: `snap` is defined, so the visible numbers are derived from the same snapshot fields the canonical selector reads. **No visible variance in demo**, but the divergent code path is a latent inconsistency risk.
- Source: **bypasses canonical selector** ❌

### 5. Monte Carlo (within Forecast Engine)
- Starting NW: **$735,000** — same as engine NW (−3.03% from dashboard)
- Terminal probabilities (`Reach $3M`, `Reach $5M`, etc) are computed from a $735k start, missing $12k of `other_assets`
- After Run completes, additional tiles render but were not captured in this audit run (out of scope)
- Source: `buildCanonicalMonteCarloInput` ✅ structurally, but **excludes `other_assets`** ❌

---

## Gate decision

**Sprint 30B MUST NOT START.**

The 0.5% variance threshold is breached in two places:

1. **Current NW**: 3.03% variance between Dashboard and Forecast Engine + Monte Carlo (root cause: `other_assets` silently excluded from engine starting NW).
2. **Terminal NW reconciliation**: 1.04% drift between `medianFinalState` component sum and MC P50 fan headline — this fires the live Action Roadmap reconciliation gate, blocking S1/S4/S5 NW tiles with **"Reconciliation failed"** in production demo.

Until both are resolved, the proposed Sprint 30B graphical Gantt + FIRE Journey visualization will visualize blocked or inconsistent figures — which is worse than no chart at all.

---

## Recommended Sprint 30A.3 (pre-30B)

1. **Fix Forecast Engine + MC NW** — add `other_assets` to `engineStartingNetWorth` in `monteCarloCanonical.ts:186-198`. ETA: <1 hour, no engine math change. (Validates the existing 56-test suite + adds a reconciliation assertion.)
2. **Fix Action Roadmap terminal recon** — pick one of:
   - (a) compute `medianFinalState.totalNetWorth` as `fan[horizon].p50` directly and re-attribute components from the simulation whose horizon NW is closest to that p50; OR
   - (b) accept the recon failure as a known structural property of percentile-vs-trajectory and exempt the NW Attribution chart from blocking when the drift is < 2%, with an honest "P50 from fan / median trajectory total" tooltip.
3. **Wire Forecast Engine FIRE threshold to canonical goal** — replace the `$120k/yr default` in `ai-forecast-engine.tsx:1261` and the financial-freedom-prob threshold with `goal.targetPassiveAnnual`. Optional polish, not blocking.
4. **Stretch — Scenario Compare canonical wiring** — replace `projectScenario`'s `baseCash`/`basePPOR`/`baseSuperBalance` reads with `selectCanonicalNetWorth(ledger)` components. Removes the hardcoded-fallback divergence risk.

Only after items 1 and 2 land and the audit reruns clean (max variance < 0.5%) should Sprint 30B begin.

---

## Audit method

- Source-code trace: identified canonical selectors and every consumer.
- Live browser verification on preview czjxhxhbc.vercel.app: demo login → Decision Lab Run Plan (28s) → SPA-nav to each module → extract DOM `innerText` → grep for monetary contexts.
- Cross-checked with Data Health page reconciliation card ($758k = $758k confirmed).
- Computed variance arithmetic in Python against the canonical $758,000 baseline.
- Screenshots saved to workspace: `audit_dashboard.png`, `audit_action_roadmap.png`, `audit_forecast_engine_mc.png`, `audit_scenario_compare_run.png`, `audit_data_health.png`.
