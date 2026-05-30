# Sprint 30B — Step 4 — fireAcceleration Fix: Before vs After

**Status:** SHIPPED to `feat/sprint28-move-refactor`, preview only. Production unchanged. 2026-05-30.

## The fix

`client/src/lib/scenarioV2/decisionEngine/candidateGenerator.ts`:

* `buildScoreInputs(...)` now takes an extra `monthlyExpenses: number` argument.
* The caller passes `ctx.monthlyExpenses` (already derived at line ~1554 for every plan run).
* The `fireAcceleration` block computes a single `annualExpenses = Math.max(1, monthlyExpenses * 12)` and uses it on BOTH the candidate side and the base side.

Two wrong inputs were replaced with one correct input:

| | Before | After |
|---|---|---|
| candidate `annualExpenses` | `12 × (reconciledSurplus + dashboardSurplus)` ≈ $375k/yr | `ctx.monthlyExpenses × 12` |
| base `annualExpenses` | hard-coded `$80,000` | `ctx.monthlyExpenses × 12` (same number) |

No new math, no new engines, no new dependencies, no MC reruns.

## Gates

* TypeScript errors: **65 / 66 ceiling** (unchanged from Step 3).
* Tests: **57 / 57 green**, 2 known-failing skipped (unchanged from Step 3).
* Branch: `feat/sprint28-move-refactor`. Preview only. Production `main` (`514560c`) NOT touched.

## fireAcceleration axis — BEFORE vs AFTER

Demo profile, 200 sims, `low` risk tolerance → resolves to `fire_focused` profile + behavioural overlay (`surv=0.43 liq=0.32 riskAdj=0.13 fire=0.05 terminalNw=0.08`).

| Template (winner BEFORE → AFTER) | fireAccel raw BEFORE | fireAccel raw AFTER | norm BEFORE | norm AFTER | contribution BEFORE | contribution AFTER |
|---|---|---|---|---|---|---|
| lower-target-or-extend (`super_now` → **`etf_dca24_now`**) | −11.75y | **−0.01y** | 0.0000 | **0.4987** | 0.000 | **2.251** |
| offset-optimisation (`offset50_etf50`) | −11.69y | **+0.04y** | 0.0000 | **0.5041** | 0.000 | **2.276** |
| current-plan (`offset_now`) | −11.71y | **−0.01y** | 0.0000 | **0.4990** | 0.000 | **2.253** |
| debt-reduction (`offset_now`) | −11.71y | **−0.01y** | 0.0000 | **0.4990** | 0.000 | **2.253** |
| liquidity-preservation (`offset_now`) | −11.71y | **−0.01y** | 0.0000 | **0.4990** | 0.000 | **2.253** |
| hybrid-property-etf (`etf70_offset30_now`) | −11.74y | **−0.06y** | 0.0000 | **0.4936** | 0.000 | **2.229** |
| delay-ip (`offset_first_then_ip`) | −11.88y | **−0.35y** | 0.0000 | **0.4649** | 0.000 | **2.099** |

* Raw value range: **[−11.88, −11.69]** → **[−0.351, +0.041]** — axis now spans real coverage-ratio territory.
* Norm range: **[0.000, 0.000]** → **[0.4649, 0.5041]** — no longer pinned to floor.
* Contribution range: **[0.000, 0.000]** → **[2.099, 2.276]** — axis now contributes 2.1–2.3 points to every score.

## Full score breakdown — BEFORE vs AFTER

| Template | Score BEFORE | Score AFTER | Δ | Rank BEFORE | Rank AFTER | Winner BEFORE | Winner AFTER |
|---|---|---|---|---|---|---|---|
| lower-target-or-extend | 90.80 | **93.05** | **+2.25** | 1 | **1** | `super_now` | **`etf_dca24_now`** ⚠ |
| offset-optimisation | 90.63 | **92.91** | **+2.28** | 2 | **2** | `offset50_etf50` | `offset50_etf50` |
| current-plan | 90.55 | **92.80** | **+2.25** | 3-tied | **3-tied** | `offset_now` | `offset_now` |
| debt-reduction | 90.55 | **92.80** | **+2.25** | 3-tied | **3-tied** | `offset_now` | `offset_now` |
| liquidity-preservation | 90.55 | **92.80** | **+2.25** | 3-tied | **3-tied** | `offset_now` | `offset_now` |
| hybrid-property-etf | 90.26 | **92.49** | **+2.23** | 6 | **6** | `etf70_offset30_now` | `etf70_offset30_now` |
| delay-ip | 81.38 | **83.48** | **+2.10** | 7 | **7** | `offset_first_then_ip` | `offset_first_then_ip` |

### Score Δ summary
* Mean score increase across all 7 templates: **+2.23**
* All increases are explained 1:1 by the `fireAcceleration` contribution moving from `0.000` to the `2.099–2.276` range.
* Score spread (max − min) was 9.43 BEFORE, **9.57 AFTER** — the axis being live very slightly widens differentiation.

### Ranking Δ
**No ranking changes.** The relative order is preserved exactly because the fireAcceleration contribution is roughly uniform (~2.2 pts) on the demo profile (the candidates produce similar terminal NW so similar fire coverage). The axis is now alive and ready to drive ranking changes on profiles where candidates produce materially different terminal NW.

### Recommendation Δ
The recommended template — **`lower-target-or-extend`** — is unchanged (rank 1 before and after, score 90.80 → 93.05).

**Winner blueprint change inside `lower-target-or-extend`:**
* BEFORE: `super_now` (a $30k concessional contribution)
* AFTER: **`etf_dca24_now`** (a 24-month ETF DCA)

This is the intended consequence: when `fireAcceleration` actually contributes, the intent filter for `lower-target-or-extend` (`includesAny(id, ["etf_dca24", "offset50_etf50", "super_now"])`) now picks the candidate with the highest *real* score among that set rather than the one whose score was inflated by zero-fire-acceleration. Both `etf_dca24_now` and `super_now` pass the filter; previously they tied with fireAccel=0 each, and the tie was broken by survival + liquidity which super_now happened to edge. With fireAccel live, `etf_dca24_now`'s slightly better coverage moves it ahead.

This is exactly the kind of decision-quality improvement the audit was looking for: a small, defensible nudge driven by a previously-disabled axis coming back online.

## Other axes — BEFORE vs AFTER

All other axes are unchanged. Verified by spot-check:

| Axis | BEFORE range | AFTER range | Status |
|---|---|---|---|
| `survivalProbability` | 100% on every row | 100% on every row | unchanged (saturated on demo) |
| `liquidityFactor` | 73.2% .. 100% | 73.2% .. 100% | unchanged |
| `riskAdjustedReturn` | 0.0901 .. 0.0948 | 0.0901 .. 0.0948 | unchanged |
| `terminalNetWorth` | $11.27M .. $11.98M | $11.27M .. $11.98M | unchanged |
| `worstInvestmentLvr` | 0% .. 3% (weight=0) | 0% .. 3% (weight=0) | unchanged |

## Penalties

Zero on every row, before and after. No refinance or leverage penalty triggered on the demo profile.

## Files changed

```
client/src/lib/scenarioV2/decisionEngine/candidateGenerator.ts   # threaded monthlyExpenses, fixed fireAcceleration
sprint30b_step4_BEFORE_fix.txt                                    # NEW — frozen pre-fix probe output
sprint30b_step4_AFTER_fix.txt                                     # NEW — post-fix probe output
SPRINT30B_STEP4_FIX_BEFORE_AFTER.md                               # this report
```
