# Sprint 30B — Step 4 — Decision Engine Score Attribution Audit

**Status:** AUDIT COMPLETE (one real defect found, one apparent defect debunked) · 2026-05-30 · branch `feat/sprint28-move-refactor` · production NOT touched.

## 0. What was suspected

Step 3's probe output appeared to show:

* `fireAcceleration contribution = 0.000` for every strategy.
* `survivalProbability` showing `value=—`.
* `probabilityP50` showing `—`.

The user asked us to trace every axis end-to-end and confirm each is actually wired to live engine outputs.

## 1. Probe artefact vs real defect — what the Step 3 probe was actually showing

The Step 3 probe rendered `value=—` for **every** axis. That was a probe bug, not an engine bug: line 175 of `script/sprint30b-step3-differentiation-probe.ts` read `(ax as any).value`, but the `ScoreBreakdownEntry` type uses `rawValue`. Fixing the probe surfaces the real values. The Step 4 probe (`script/sprint30b-step4-score-attribution-probe.ts`) dumps `rawValue / normalisedValue / weight / contribution` plus the engine inputs that produced each `rawValue`.

So:

* `survivalProbability` is **not** missing — every winner sits at 100% survivability on the demo profile (0 defaults, 0 forced sales out of 200 sims). Weight 0.43, contribution 42.6 on every row. The probe simply wasn't printing the field.
* `probabilityP50` is a derived label on top of `survivalProbability`. Same story — surfaced on the winner via `winner.result`, the Step 3 probe just wasn't reading it.
* `fireAcceleration = 0` **IS** a real defect — and it is consistent across every template and every candidate. Diagnosed below.

## 2. Source map — where every axis comes from

| Axis | Source engine | Source selector |
|---|---|---|
| `survivalProbability` | MonteCarloEngine | `candidateGenerator.ts:1352` — `survivalProbability({ totalPaths=simCount, defaultedPaths=defaultProb×N, forcedSalePaths=liqStressProb×N })` |
| `liquidityFactor` | Risk-band aggregator (derived from MC) | `candidateGenerator.ts:1359` — `min(bands.liquidityRatioMin / bands.liquidityFloor, 1)` |
| `riskAdjustedReturn` | MC NW fan + `downside()` | `candidateGenerator.ts:1374` — `riskAdjustedReturn({ cagr=(P50/initial)^(1/y)−1, downside=downside(P10,P50), sequenceRisk=sequenceDispersion.cv })` |
| `fireAcceleration` | `fireCoverage()` formula (synthesised from MC NW fan) | `candidateGenerator.ts:1381..1397` — `(candidateFire − baseFire) × 5` |
| `terminalNetWorth` | MC NW fan (final P50) | `candidateGenerator.ts:1404` — `result.netWorthFan[last].p50` |
| `worstInvestmentLvr` | Risk-band aggregator | `candidateGenerator.ts:1406` — `bands.worstLvr` (weight=0 by design, surfaces via `leveragePenalty`) |

All six axes are sourced from live engine outputs. None are hard-coded.

## 3. Full attribution table (demo profile, 200 sims, balanced→fire_focused profile + behavioural overlay)

Profile resolves to `fire_focused` on the low-risk demo, then the behavioural overlay nudges weights to `surv=0.43 liq=0.32 riskAdj=0.13 fire=0.05 terminalNw=0.08`. The slight delta vs the registry's `conservative` (`0.40/0.30/0.15/0.05/0.10`) comes from `applyPrioritiesToWeights` (`client/src/lib/scenarioV2/registry/behaviouralPriorities.ts`). Convex sum verified = 1.01 (within engine tolerance because the renormaliser permits ±0.01 drift before erroring; this is benign).

| Template / Winner | survival | liquidity | riskAdj | **fire** | terminalNw | worstLvr | Score |
|---|---|---|---|---|---|---|---|
| `lower-target-or-extend` / `super_now` | 100% → 1.000 × 0.43 = **42.62** | 100% → 1.000 × 0.32 = **31.83** | 0.0948 → 0.948 × 0.13 = **12.46** | −11.75y → 0.000 × 0.05 = **0.00** | $11.75M → 0.494 × 0.08 = **3.90** | 0% → 1.000 × 0.00 = **0.00** | **90.80** |
| `offset-optimisation` / `offset50_etf50` | 100% / **42.62** | 100% / **31.83** | 0.0915 → 0.915 × 0.13 = **12.21** | −11.69y / **0.00** | $11.98M / **3.98** | 0% / 0.00 | **90.63** |
| `current-plan` / `offset_now` | 100% / **42.62** | 100% / **31.83** | 0.0911 → 0.911 × 0.13 = **12.16** | −11.71y / **0.00** | $11.89M / **3.94** | 0% / 0.00 | **90.55** |
| `debt-reduction` / `offset_now` | identical to current-plan | | | | | | **90.55** |
| `liquidity-preservation` / `offset_now` | identical to current-plan | | | | | | **90.55** |
| `hybrid-property-etf` / `etf70_offset30_now` | 100% / **42.62** | 100% / **31.83** | 0.090 → 0.900 × 0.13 = **11.85** | −11.74y / **0.00** | $11.79M / **3.92** | 3.0% / 0.00 | **90.26** |
| `delay-ip` / `offset_first_then_ip` | 100% / **42.62** | 73.2% → 0.732 × 0.32 = **23.28** | 0.0911 → 0.911 × 0.13 = **11.84** | −11.88y / **0.00** | $11.27M / **3.74** | 0% / 0.00 | **81.38** |

Penalties: zero on every row (`refinancePressure=none`, `worstLvr ≤ 80%`).

## 4. Axis activity audit

| Axis | Range across winners | Norm range | Status |
|---|---|---|---|
| `survivalProbability` | 100% on every row | 1.000 | **ACTIVE.** Not differentiating today because the demo profile produces zero defaults / forced sales at 200 sims; would differentiate immediately on any leveraged or stressed profile. |
| `liquidityFactor` | 73.2% .. 100% | 0.732 .. 1.000 | **ACTIVE & DIFFERENTIATING** — the 9-point score gap on `delay-ip` is essentially this axis. |
| `riskAdjustedReturn` | 0.0901 .. 0.0948 | 0.901 .. 0.948 | **ACTIVE & DIFFERENTIATING** (contribution 11.8 .. 12.5). |
| **`fireAcceleration`** | **−11.88y .. −11.69y** | **0.000 on every row** | **DEFECT — pinned to zero by normaliser bounds.** See §5. |
| `terminalNetWorth` | $11.27M .. $11.98M | 0.473 .. 0.503 | **ACTIVE & DIFFERENTIATING** (contribution 3.74 .. 3.98). |
| `worstInvestmentLvr` | 0% .. 3% | 1.000 | **WEIGHT=0 (intentional, surfaces via `leveragePenalty`).** |

Five of six axes are wired correctly and contributing. One axis is wired but its formula misuses an input field, causing the normaliser to clamp every output to zero.

## 5. The real defect — `fireAcceleration` is structurally pinned to zero

### Numerical proof

For every template's winner, `rawValue` of `fireAcceleration` sits between **−11.88y and −11.69y**. The normaliser is

```
clamp01((years + 5) / 10)
```

so anything below −5 clamps to 0. Every value we observed is well below −5, so the normaliser will *always* return 0 and the axis can never contribute anything regardless of how the candidate performs.

### Why `years` is always ≈ −12 on the demo profile

The formula at `candidateGenerator.ts:1380..1397`:

```ts
const candidateFire = fireCoverage({
  investedLiquid: finalP50 * 0.50,           // half terminal NW
  propertyEquity: finalP50 * 0.30,           // 30% terminal NW
  netRentalIncome: 0,
  swr: 0.04,
  annualExpenses: result.dashboardMonthlySurplus > 0
    ? 12 * Math.max(1, (result.reconciledMonthlySurplus + result.dashboardMonthlySurplus))
    : 80_000,
});
const baseFire = fireCoverage({
  investedLiquid: (baseResult.netWorthFan[last]?.p50 ?? initial) * 0.50,
  propertyEquity: (baseResult.netWorthFan[last]?.p50 ?? initial) * 0.30,
  netRentalIncome: 0,
  swr: 0.04,
  annualExpenses: 80_000,                    // hard-coded
});
const fireAccel = (candidateFire − baseFire) × 5;
```

Two bugs in one block:

1. **Wrong input for `candidate` expenses.** The candidate branch uses `12 × (reconciledMonthlySurplus + dashboardMonthlySurplus)`. That's two months of surplus, not annual expenses. On the demo profile that resolves to `12 × ($15,633 + $15,633) = $375,192/yr` — almost 5× the real expense floor.
2. **Hard-coded `$80,000` for `base` expenses.** Independent of the user's ledger.

Result: candidate is compared to a base with ~$80k expenses while the candidate side computes coverage against $375k pseudo-expenses, so `candidateFire − baseFire` is structurally a large negative on every candidate. Every candidate looks ~12 years worse than base ⇒ normaliser clamps to 0 ⇒ axis contributes nothing.

### Why this didn't surface earlier

The orchestrator's intent filter (Step 3 fix) picks blueprints on the *other* axes (survival, liquidity, riskAdj). `fireAcceleration` was already silently zero before Step 3 — Step 3 just made the breakdown *visible* enough for the user to notice. Step 3's differentiation correctness is independent of this defect, but the panel was implying `fireAcceleration` was actively contributing when in fact it was always 0.

### Recommended fix (small, no new math)

The right input is `ctx.monthlyExpenses` (already derived at `candidateGenerator.ts:1554` and stored on the candidate context). The fix is to thread it into `buildScoreInputs` and use the same expense figure for both `candidate` and `base`:

```ts
const annualExpenses = Math.max(1, ctx.monthlyExpenses * 12);
const candidateFire = fireCoverage({ ..., annualExpenses });
const baseFire      = fireCoverage({ ..., annualExpenses });
```

This makes the axis genuinely measure *coverage-ratio improvement* on a like-for-like basis. Norms will move off zero and `fireAcceleration` will start contributing differentially across candidates (some accel, some decel, on a smooth range).

### Why I am not committing the fix in this turn

Two reasons:

1. **`buildScoreInputs` does not currently receive `ctx`** — it gets `result`, `bands`, `baseResult`, `horizonMonths`. Threading `ctx.monthlyExpenses` through requires either (a) adding `monthlyExpenses: number` to its signature and updating both call sites in `candidateGenerator.ts` (lines 1924 area and 2103), or (b) adding `monthlyExpenses` to `ExtendedScenarioResult` so it rides on `result`. Both are surgical but they cross multiple files and rerun a lot of MC math — I want explicit user approval before touching the scoring path on production-deployed code.
2. **You haven't asked for the fix yet** — the request was to audit and identify. I am surfacing the diagnosis and the recommended patch shape. Confirm and I'll ship it on `feat/sprint28-move-refactor`, re-run the probe to verify `fireAcceleration` is no longer pinned at zero, retypecheck/retest, and propose a follow-up merge to production.

## 6. Other findings worth flagging

* **Weight overlay (`applyPrioritiesToWeights`) is opaque to the user.** The Recommendation Explainability panel shows weights like `0.43/0.32/0.13/0.05/0.08` that don't match any of the six registry profiles. Those are the post-overlay weights. If you want, we can surface the overlay multipliers in the explanation panel for full traceability.
* **`worstInvestmentLvr` weight=0 is intentional** — the axis surfaces entirely via `leveragePenalty`. The probe flags this correctly as "WEIGHT=0 — intentional (penalty-only axis)". No defect.
* **`survivalProbability` is currently saturated at 100%** because the demo profile is liquidity-tight but cashflow-strong (zero default risk in 200 sims). On any leveraged or stressed profile this axis will immediately spread. This isn't a defect; it's the axis behaving correctly on a low-risk demo.
* **MC banner observation from the smoke test** ("Monte Carlo risk outputs are uniformly zero — verify variance assumptions") is a separate banner in the Risks section of the Action Roadmap that pre-dates this sprint. It's flagging that `defaultProbability=0` and `liquidityStressProbability=0` on the demo profile — which is correct given the probe data — but the banner copy is alarmist for a healthy profile. Worth tightening the banner trigger threshold; not part of this audit's scope.

## 7. Files touched in this audit

```
script/sprint30b-step4-score-attribution-probe.ts   # NEW — full attribution probe
sprint30b_step4_score_attribution.txt               # NEW — probe output (full table)
SPRINT30B_STEP4_SCORE_ATTRIBUTION_AUDIT.md          # this report
```

No production code is modified by this audit. The defect fix is queued for the next turn once approved.
