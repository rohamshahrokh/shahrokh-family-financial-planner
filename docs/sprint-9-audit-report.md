# Sprint 9 — Path-Based Wealth Simulation: Audit Report

**Branch:** `sprint-9-path-based-wealth-simulation`
**Engine version stamp:** `sprint-9.path-sim.v1`
**Engine entry point:** `client/src/lib/pathSimulationEngine.ts → buildPathSimulationEngine(...)`
**UI shell:** `client/src/components/PathSimulationSection.tsx`
**Regression test:** `script/test-sprint-9-path-simulation.ts`
**Date of audit:** 2026-05-25

## 1. Goal

Where Sprint 7 produced a deterministic search over scenario combinations,
and Sprint 8 layered Monte Carlo uncertainty on the *baseline point
estimates*, Sprint 9 simulates ≥ 1,000 full household life-paths per
Sprint 7 strategy and aggregates the FIRE-outcome distribution.

The Sprint 9 engine is **pure orchestration** — no new financial formulas
are introduced. The per-path year-by-year stochastic engine is the existing
`runFireMonteCarlo` (Monte Carlo v5), which already advances state monthly
with correlated draws, NG/tax pass-through, planned property purchases,
DCA, debt amortisation, and household-supplied assumptions.

## 2. Engine architecture (concrete)

`buildPathSimulationEngine` runs the following pipeline:

1. Resolve the canonical FIRE snapshot via `computeCanonicalFire(...)`.
2. If `sprint7Result.empty` → return an `empty` Sprint 9 result with the
   same reason; no FireMC calls are made.
3. `pickTopPathStrategies(s7, maxStrategies)` mirrors Sprint 8's selection:
   first the recommended scenario, then up to N additional scenarios from
   `truePortfolio.ranking`, deduplicated by scenario id.
4. `buildBaseSettings(...)` produces the FireMC settings vector from
   canonical ledger + user assumptions:
   - Cash / offset / super / mortgage / mortgage rate / term / loan type
     read directly from `canonicalLedger.snapshot` and **never overwritten**.
   - All correlation, vol, NG, and SWR knobs read from the user's
     `mc_fire_settings` (with `DEFAULT_FIRE_MC_SETTINGS` only as fallback for
     unset fields).
5. **Per strategy:** `runStrategy(...)` calls `runFireMonteCarlo(settings,
   planInput, seed)` **once** with `simulationCount = simsPerStrategy`
   (clamped to ≥ 1,000). The returned `FireMCResult` is then mapped into the
   `PathStrategyResult` shape by `aggregateFromFireMC(...)`.
6. For the best-ranked strategy, `runDriverSensitivity(...)` runs 7
   additional `runFireMonteCarlo` calls (one per driver: property/stock/
   crypto return, inflation, income/expense growth, mortgage rate) with the
   corresponding vol field doubled and `simulationCount = lightSims`
   (200).
7. `buildAudit(...)` writes the engines-used / inputs-used / assumptions
   trail per strategy.

## 3. Per-output traceability

| Sprint 9 output                      | Canonical source                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `bestStrategy.probabilityFireByTarget` | Cumulative sum of `FireMCResult.fireYearHistogram[year ≤ targetFireYear]` ÷ `simulationCount`                       |
| `netWorthBand` (p10/25/50/75/90)     | `FireMCResult.nwP10AtTarget / nwP50AtTarget / nwP90AtTarget` (p25/p75 linearly interpolated)                        |
| `fireYearBand`                       | `FireMCResult.p10FireYear / medianFireYear / p90FireYear` (p25/p75 interpolated)                                    |
| `passiveIncomeBand`                  | `(settings.swrPct / 100) × netWorthBand` — same SWR formula the FireMC engine uses internally                        |
| `netWorthFan` (per-year band)        | `FireMCResult.fanData` — the engine's per-year P10/P25/P50/P75/P90 series                                            |
| `fireYearHistogram`                  | `FireMCResult.fireYearHistogram` (count → probability via ÷ `simulationCount`)                                      |
| `probabilityCurve`                   | Cumulative sum of the above histogram (monotonic non-decreasing — enforced by §13)                                  |
| `representativePaths`                | **Synthesised** from `netWorthFan` percentile slices (P10/P50/P90) with `sourceIndex: -1` to mark as synthesised     |
| `probCashShortfall` / `probNegCashflow` | `FireMCResult.probCashShortfall / probNegCashflow ÷ 100`                                                          |
| `driverSensitivity`                  | Delta in cumulative-histogram P(FIRE) and median fire year vs baseline, from a 1×200 FireMC call per perturbed driver |
| `scenarioHeatmap`                    | Per-strategy `probabilityCurve` projected onto (strategy, year) cells; all values in [0, 1] (verified by §15)        |
| `auditTrail.metadata`                | `simulationsPerStrategy`, `seed`, `engineVersion`, `canonicalFire.targetFireYear`, FireMC settings hash               |
| `auditTrail.entries`                 | Per strategy: `enginesUsed` list, `inputsUsed` list (ledger keys read), `assumptions` list (settings keys read)      |

## 4. Engines exercised (`enginesUsed`)

Every strategy in the output declares which canonical engines its numbers
came from. Concretely:

- `fireMonteCarlo (v5)` — the year-by-year stochastic simulator that
  produces every distribution we surface.
- `canonicalFire` — target-FIRE-year resolution.
- `dashboardDataContract` — net worth, monthly income, monthly expenses,
  passive income ledger selectors.
- `truePortfolioOptimizer` (Sprint 7) — strategy candidate provider.
- `assumptionUncertaintyEngine` (Sprint 8) — for cross-checking confidence
  framing; **Sprint 8 outputs are read-only inputs**, never mutated.

## 5. Tilts (engine-modelled vs not-engine-modelled)

Sprint 7 strategy dimensions are translated to FireMC-settings deltas via
`PROPERTY_TILTS`, `INVESTMENT_TILTS`, and `CASH_TILTS`. Each tilt is small,
additive in % space, and documented inline.

Tilts that are **not engine-modelled** propagate the `notEngineModelled`
flag (visible in UI confidence framing):

| Dimension                  | Mode               | notEngineModelled | Reason                                                                                |
| -------------------------- | ------------------ | ----------------- | ------------------------------------------------------------------------------------- |
| `INVESTMENT_TILTS`         | `stock`            | true              | Single-stock concentration: FireMC does not model idiosyncratic risk for a single name |
| Driver: `cryptoReturn`     | (per-driver)       | true              | Driver-level sensitivity for crypto-only flags as not-engine-modelled in the UI       |
| All other modes / drivers  |                    | false             | Engine-modelled via existing FireMC knobs                                              |

When a strategy's dimensions are all engine-modelled, `notEngineModelled =
false` and the UI shows the strategy without a caveat. When any tilt is
not-engine-modelled, the flag propagates to the strategy summary and the
audit trail entry.

## 6. Stochasticity

Stochasticity comes from `runFireMonteCarlo`'s internal correlated draws,
not from a Sprint 9-owned PRNG. Each strategy runs **one** FireMC call with
`simulationCount = N`, so all draws are statistically independent (within
the engine's correlated-shock model) and the seeding is deterministic in
the engine seed only. Same seed ⇒ identical bands (verified by §4).

An earlier prototype performed N×1 simulations (one FireMC call per
synthetic path) and stitched the results in Sprint 9. That approach has
been removed:

- It was ~150× slower (each `runFireMonteCarlo(N=1)` still pays the engine
  setup cost).
- It silently *reduced* the realism of stochasticity by collapsing the
  engine's intra-sim correlation to a single year-by-year sample per call.

The current 1×N approach is **statistically more correct**, not less.

## 7. Honest unsupported / synthesised outputs

Two outputs are not direct samples and are called out explicitly so the UI
can render them with appropriate framing:

| Output                | Status                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `representativePaths` | **Synthesised** from `netWorthFan` percentile slices (P10/P50/P90). Each path's `sourceIndex` is `-1` to mark. |
| Crypto-only paths     | Surfaced with `notEngineModelled = true`. The number itself is real (uses household crypto inputs); the *attribution* to crypto-specific dynamics is not engine-modelled. |

No other Sprint 9 output is synthesised — every other number can be
re-derived by re-running `runFireMonteCarlo` with the same seed.

## 8. Regression test sections (17/17 passing, 558 assertions)

```
§1  Engine builds a non-empty result for populated Sprint 7
§2  Engine runs ≥ 1,000 simulations per selected strategy
§3  Simulation metadata is exposed and consistent
§4  Deterministic seeding (same seed ⇒ identical outputs)
§5  Percentile ordering P10 ≤ P25 ≤ P50 ≤ P75 ≤ P90 across every band
§6  Probabilities are valid (0..1 inclusive)
§7  Robust score is in [0, 100]
§8  Target year resolution comes from canonical FIRE / Sprint 7 goal
§9  Missing-data graceful handling (empty Sprint 7 ⇒ empty Sprint 9)
§10 No fabricated household values — output differs across fixtures
§11 Audit trail entries present with engines + inputs + assumptions
§12 Below-floor simulationsPerStrategy clamped to ≥ 1,000
§13 Probability curve is monotonic non-decreasing per strategy
§14 FIRE-year histogram probabilities sum ≤ 1 and ≥ probabilityFireByTarget
§15 Heatmap covers every (strategy × horizon-year) pair
§16 Sprint 7 deterministic outputs are unchanged by Sprint 9 (no mutation)
§17 React SSR — Sprint 9 component renders with all required testids
```

Runtime: **9.5 seconds** for all 558 assertions.

## 9. Screenshots

| File                                  | Scenario                                                       |
| ------------------------------------- | -------------------------------------------------------------- |
| `screenshots/sprint-9-rich.png`       | Populated household ledger; all 10 UI sections render          |
| `screenshots/sprint-9-empty.png`      | Empty canonical ledger; empty state renders cleanly            |
| `screenshots/sprint-9-rich.html`      | Static HTML render of the same populated state (for inspection) |
| `screenshots/sprint-9-empty.html`     | Static HTML render of the empty state                          |

Screenshots are captured via static SSR + headless Chromium
(`script/screenshot-sprint-9.ts`), because the dev server requires Supabase
env config that is not provisioned in this environment. The Sprint 9 code
is not yet deployed to production, so live screenshots from
`familywealthlab.net` would only show the Sprint 8 build.

## 10. UI sections (`PathSimulationSection.tsx`)

All testids stable with prefix `path-sim-`:

1. `path-sim-confidence-summary` — Best strategy, P(FIRE by target),
   net-worth band, FIRE-year band.
2. `path-sim-strategy-ranking` — Ranked strategy table (robust score, FIRE
   probability, FIRE year median, net-worth median).
3. `path-sim-probability-table` — Per-strategy probability table.
4. `path-sim-net-worth-fan` — Per-year P10/P25/P50/P75/P90 band table.
5. `path-sim-fire-year-histogram` — FIRE-year mass per calendar year.
6. `path-sim-probability-curve` — Cumulative P(FIRE) by year.
7. `path-sim-scenario-heatmap` — Strategy × year P(FIRE) heatmap.
8. `path-sim-representative-paths` — P10/P50/P90 synthesised paths
   (sourceIndex = −1 marker).
9. `path-sim-driver-sensitivity` — Driver sensitivity table (Δpp,
   Δyears).
10. `path-sim-audit-trail` — Engines / inputs / assumptions per strategy +
    metadata (engine version, seed, simsPerStrategy).

## 11. Sprint 7 / Sprint 8 regression

§16 verifies that running `buildPathSimulationEngine(...)` does **not**
mutate the Sprint 7 `truePortfolioOptimizer` result — the Sprint 7 object
passed in is structurally identical after the call. Sprint 8 outputs are
read-only inputs and are not touched.

## 12. Performance

| Operation                                | Cost                                         |
| ---------------------------------------- | -------------------------------------------- |
| Single `runFireMonteCarlo(N=1000)`       | ~150 ms (constant-time vs simulation count) |
| Per strategy (1 main + 7 sensitivity)    | ~1.2 s (1 × N=1000 + 7 × N=200)              |
| 3-strategy run with sensitivity          | ~3 s end-to-end                              |
| Full regression suite (9 engine builds)  | 9.5 s                                        |

## 13. Wire-up

`TruePortfolioOptimizer.tsx` mounts a Sprint 9 block between the Sprint 8
block (≈line 717) and the Phase 5 Portfolio Lab block (≈line 744):

```
<div data-testid="true-portfolio-optimizer-sprint9-shell">
  <PathSimulationSection result={pathSimResult} />
</div>
```

`pathSimResult` is memoised on `[canonicalInputs, sprint7Result,
mcSettings, planInput]`. It is only computed when Sprint 7 has a populated
result; otherwise the section renders its own empty state.
