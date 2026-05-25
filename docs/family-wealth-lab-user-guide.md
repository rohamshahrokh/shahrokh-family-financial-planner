# Family Wealth Lab — User Guide

**Audience:** Roham, as the operator of his own Family Wealth Lab instance. You already know the household — this guide assumes you do not need a primer on what FIRE is, what an offset account does, or what NG means.

**What this guide is:** a practical handbook for reading the platform end-to-end. Every metric description is tied to a specific engine field so you can trust the number. Where the model has known limitations, they are called out by name.

**What this guide is not:** marketing, an onboarding tutorial, or a code reference. The engine reference lives in `docs/family-wealth-lab-technical-guide.md` and is cross-linked from each section.

---

## 1. Overview — How the Modules Compose

Family Wealth Lab is built as a layered system. Each later sprint reuses everything below it and never re-implements financial math.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Sprint 10  Goal Solver Pro / "Decision Engine"   (decisions)           │
│            ── reads Sprint 7/8/9 outputs ──                            │
├────────────────────────────────────────────────────────────────────────┤
│ Sprint 9   Path Simulation Engine                (path-based)          │
│            ── runs FireMC 1000× per Sprint 7 strategy ──               │
├────────────────────────────────────────────────────────────────────────┤
│ Sprint 8   Probabilistic Wealth Engine           (assumption-uncert.)  │
│            ── perturbs Sprint 7 baselines ──                           │
├────────────────────────────────────────────────────────────────────────┤
│ Sprint 7   True Portfolio Optimizer              (strategy search)     │
│            ── enumerates ≥1,000 scenarios ──                           │
├────────────────────────────────────────────────────────────────────────┤
│ Sprint 6   Scenario Lab + Portfolio Lab          (scenario authoring)  │
├────────────────────────────────────────────────────────────────────────┤
│ FireMC v5 (Monte Carlo) ── Box-Muller, Cholesky 4×4, 1k–10k sims       │
│ ForecastEngine + FirePathEngine ── deterministic forecasts             │
│ RiskEngine + PropertyBuyEngine ── point-in-time analysis               │
│ canonicalLedger / canonicalFire / dashboardDataContract ── ground data │
└────────────────────────────────────────────────────────────────────────┘
```

The platform's hard rule: **no engine introduces a new financial formula except at the canonical layer.** Sprint 7 picks strategies; Sprint 8 stresses them under assumption noise; Sprint 9 runs full path simulations; Sprint 10 turns those outputs into a decision. All four read the same canonical ledger.

---

## 2. How to Read the Platform End-to-End

Read the platform in this order. Each step answers a sharper question than the last.

| Step | Page | Question it answers |
|---|---|---|
| 1 | Dashboard | What is the household today? |
| 2 | Wealth Strategy / FIRE Path | If nothing changes, when does the household hit FIRE? |
| 3 | Portfolio Lab → Sprint 7 sections | Of ≥1,000 strategies, which 5 win on each objective? |
| 4 | Portfolio Lab → Sprint 8 section | Which strategy is robust under uncertain assumptions? |
| 5 | Portfolio Lab → Sprint 9 section | What does the full distribution look like over 1,000 simulated paths per strategy? |
| 6 | Portfolio Lab → Sprint 10 Goal Solver Pro | Given a target, what *exactly* must change? |

Sprint 9 sits between Sprint 8 and Sprint 10 in the UI. Don't skip ahead to Sprint 10 — its numbers are pointers into Sprint 9 outputs, so a Sprint 9 anomaly will land on Sprint 10's `bestPath` panel.

---

## 3. Per-Module Sections

Each section follows the user's A–H structure: **A. Purpose / B. Inputs / C. Outputs / D. Calculation flow / E. Data source path / F. Dependencies / G. Known limitations / H. Example interpretation**, plus a list of related files.

> **Naming map (read before continuing):**
> - "Decision Engine" in the user's vocabulary = **Sprint 10 Goal Solver Pro** (`goalSolverPro.ts`). The older `decisionCandidates` / `decisionRanking` / `decisionEngineLabels` files are Sprint 5/6 building blocks consumed by Sprint 7.
> - "Forecast Engine" = `forecastEngine.ts` (the deterministic forecast used by Dashboard, Wealth Strategy, Reports, Timeline) **and** `firePathEngine.ts` (the FIRE-specific four-strategy optimizer used by the FIRE Path page). Both are documented separately below.
> - "Monte Carlo Engine" — three live engines: `fireMonteCarlo.ts` (FIRE-focused, used internally by Sprint 9), `monteCarloV4`, and `monteCarloV5` (used on the AI Forecast Engine page and Dashboard).
> - "Exit Strategy modules" — no dedicated engine. Exit-timing analysis lives inside `whatIfEngine.ts` as `ExitTimingResult`, surfaced on the What-If Scenarios page.
> - "Property modelling modules" — `propertyBuyEngine.ts`, `canonicalPropertyEconomics.ts`, `propertyTimelineBuilder.ts`, plus property realism inside `monteCarloV5/propertyRealismAU.ts`.
> - "Stock / Crypto modelling modules" — no dedicated growth engine. Growth is modelled through (a) `finance.ts` helpers (`projectInvestment`, `calcCAGR`) on the Stocks/Crypto pages, and (b) FireMC return/vol parameters inside Sprint 7/8/9/10 strategy simulations.

---

### 3.1 Dashboard

**A. Purpose.** Single-page snapshot of the household's current financial state. The dashboard is the reconciliation point for every KPI rendered elsewhere in the app — every other page that surfaces a headline value (Reports, Wealth Strategy, Risk Radar, FIRE Path) must agree with the dashboard's number to within $1.

**B. Inputs.** Read from `dashboardDataContract`'s `KPI_DATA_CONTRACT` — the declarative list of every Supabase column the dashboard touches. The contract is enforced by `script/test-dashboard-contract.ts`.

**C. Outputs.** The KPI cards: Monthly Surplus, Total Investments, Net Worth (canonical), Cash Today, Passive Income, FIRE Number, FIRE Progress, Risk Score, Best Move, Plan Feasibility, Plan Execution Status, Funding Resolution.

**D. Calculation flow.** Selectors only. No engine math on the page itself. The key selectors are:

- `selectCanonicalNetWorth(ledger)` — single source of truth for NW (see Formula §6.2 of the technical guide).
- `selectMonthlySurplus(ledger)` — debt-aware (see §6.3 of the technical guide). Two modes gated by `selectExpensesIncludesDebt`.
- `computeCanonicalFire(ledger, opts)` — produces `fireNumber`, `progressFraction`, `passiveCoverage`, `gap`.
- `runMonteCarloV4(input, config)` — drives the dashboard's MC fan chart.

**E. Data source path.** Supabase → `dashboardDataContract` selectors → `canonicalLedger` aggregate → dashboard cards. The complete column-by-column binding is in `KPI_DATA_CONTRACT` (see `dashboardDataContract.ts` line 64 onward, paired with `docs/DASHBOARD_DATA_CONTRACT.md`).

**F. Dependencies on Sprint 7/8/9/10 engines.** None directly. The dashboard pre-dates Sprint 7 and intentionally does not embed strategy-search output. Strategy outputs are surfaced on `/portfolio-lab`.

**G. Known limitations.**

- The fan chart on the dashboard uses **MC v4** (`monteCarloV4/engineV4.ts`), not FireMC v5 (Sprint 9). They use different correlation models and different return defaults — the dashboard fan and the Sprint 9 fan will not agree.
- `selectMonthlySurplus` has bitten the project before — the "expensesIncludesDebt" gate is auto-detected based on whether expense rows look like debt categories. If you have unusual category names, set the `expenses_includes_debt` snapshot column explicitly.
- Pre-existing TypeScript errors in `dashboard.tsx` and `cfoEngine.ts` are out of scope for Sprint 7+ work.

**H. Example interpretation.** When the dashboard shows "Monthly Surplus $X" and Wealth Strategy shows the same number to the dollar, the canonical ledger is consistent. If they diverge by more than $1, one of the pages is bypassing the canonical selector — that is a regression. The `reconcileCanonicalLedger` helper (`canonicalLedger.ts:134`) is the cross-page check.

**Related files:** `client/src/pages/dashboard.tsx`, `client/src/lib/dashboardDataContract.ts`, `client/src/lib/canonicalLedger.ts`, `client/src/lib/canonicalFire.ts`, `docs/DASHBOARD_DATA_CONTRACT.md`.

---

### 3.2 Forecast Engine

> Two engines wear this name; both are documented below.

#### 3.2.a `forecastEngine.ts` — Central Deterministic Forecast

**A. Purpose.** Build a unified deterministic forecast that combines snapshot, properties (with settlement dates), stocks, crypto, planned transactions, recurring bills, budgets, and assumptions. Used by Timeline, Wealth Strategy, Dashboard, and Reports.

**B. Inputs.** A `ForecastInput` payload (`forecastEngine.ts:28-57`): snapshot, properties, stocks, cryptos, transactions, bills, expenses, DCA schedules, planned orders, flat assumptions, optional `yearlyAssumptions[]` (per-year overrides), AU NG fields (`ngRefundMode`, `ngAnnualBenefit`, `annualSalaryIncome`).

**C. Outputs.** `ForecastOutput`: `{ monthly: CashFlowMonth[], annual: CashFlowYear[], netWorth: YearlyProjection[], cashEngine: CashEngineOutput }` (`forecastEngine.ts:59-65`).

**D. Calculation flow.**

1. Resolve effective assumptions for each year. If `yearlyAssumptions` is supplied, per-year values override the flat assumption set; otherwise flat values apply (`forecastEngine.ts:70-88`).
2. Apply per-property funding source (`applyFundingToProperties`) so Equity Release behaviour is consistent — Equity Release increases loan balance, doesn't consume cash.
3. Build monthly cashflow via `buildCashFlowSeries(...)`.
4. Aggregate to annual.
5. Project net worth via `projectNetWorth(...)` — accepts the `yearlyAssumptions` array directly.
6. Run `runCashEngine(...)` for the full ledger / liquidity / per-year cash flows.

**E. Data source path.** Snapshot + properties + stocks + crypto + plans → `ForecastInput` → `buildForecast` → output consumed by Wealth Strategy chart, Timeline projections, Reports.

**F. Dependencies on Sprint 7+.** None — this engine pre-dates Sprint 7. Sprint 7+ engines use FireMC instead (which has the full correlation model). `forecastEngine` is the *deterministic* path.

**G. Known limitations.**

- Modes (`forecastEngine.ts:7-13`): `'profile' | 'year-by-year' | 'monte-carlo'`. In monte-carlo mode, if a last MC run is unavailable, it falls back to profile.
- The monthly engine doesn't yet support per-month assumptions. The first active year's values are used as the monthly base (`forecastEngine.ts:113-117`).
- Net worth projection horizon is fixed at 10 years (`forecastEngine.ts:152`). Use Sprint 9's `netWorthFan` for longer horizons.

**H. Example interpretation.** On the Wealth Strategy page, the projection chart's "deterministic" curve is the `forecastEngine` output. If you switch the chart to "Monte Carlo", that switches to the MC v4 fan — they are *not* the same engine. Differences between them are expected.

**Related files:** `client/src/lib/forecastEngine.ts`, `client/src/lib/cashEngine.ts`, `client/src/lib/finance.ts`, `client/src/lib/propertyFundingAdapter.ts`, `client/src/pages/timeline.tsx`, `client/src/pages/wealth-strategy.tsx`.

#### 3.2.b `firePathEngine.ts` — FIRE Fastest Path Optimizer

**A. Purpose.** Compare 4 named strategies to reach FIRE: A) Property Focused, B) ETF / Stock Focused, C) Mixed, D) Aggressive. Surfaces the fastest path per strategy and the assumptions used.

**B. Inputs.** `FIRESettings` (mirrors `sf_fire_settings`, `firePathEngine.ts:35-86`): household ages, target FIRE age, target monthly passive, SWR, include flags (super, PPOR equity, IP equity, crypto, stocks), mortgage parameters, investment returns (etf/crypto/stocks/cash), super (SGC pct + salary sacrifice per person), macro (income/expense growth, inflation, tax).

**C. Outputs.** Per-strategy FIRE projection with monthly compound steps, target hit year, accessible vs total investable progression.

**D. Calculation flow.**

- Monthly compound loop, max 40 years (`firePathEngine.ts:14-15`).
- Income grows at user-set rate (or year-by-year override).
- Super: SGC % per person + salary sacrifice, grown at per-person super return.
- Mortgage amortised on remaining term + rate.
- Property equity appreciates at user-set CAGR.
- FIRE triggered when accessible investable ≥ target capital.
- Super excluded from accessible until preservation age (default 60) unless `include_super_in_fire` is true.

**E. Data source path.** `sf_fire_settings` row + `sf_fire_scenario_config` row → `firePathEngine` → FIRE Path page UI.

**F. Dependencies on Sprint 7+.** None. `firePathEngine` is the older single-strategy optimizer; Sprint 7's `truePortfolioOptimizer` is the multi-strategy successor. Both still ship.

**G. Known limitations.**

- "Zero hardcoded constants" — all assumptions data-driven (`firePathEngine.ts:3-4`). Labelled hardcoded fallbacks are used only when the Supabase row is empty.
- Deterministic only — no MC bands. For uncertainty quantification use Sprint 8 or Sprint 9.

**H. Example interpretation.** When the FIRE Path page shows "Aggressive: FIRE in 2041", that is a deterministic compounding result given the assumption set. If Sprint 9's `bestStrategy.fireYearBand.p10` is 2041 and `p50` is 2046, then the FIRE Path page's "aggressive" result roughly aligns with Sprint 9's optimistic tail — *not* its median.

**Related files:** `client/src/lib/firePathEngine.ts`, `client/src/lib/firePathEngineRegimeAware.ts`, `client/src/pages/fire-path.tsx`, `client/src/components/FIREPathCard.tsx`, `client/src/components/UnifiedFirePanel.tsx`.

---

### 3.3 Portfolio Lab (Sprint 7)

**A. Purpose.** Enumerate the strategy space and pick the best scenario for each of five categories: FIRE speed, risk-adjusted, cashflow, probability, hybrid. Identify the Pareto frontier across (FIRE speed × probability of success × risk × projected net worth).

**B. Inputs.** `TruePortfolioOptimizerInputs`: canonical ledger, optional goal-solver inputs, optional risk outputs, optional MC outputs, `OptimizerConstraints` (maxRisk, maxDebt, maxMonthlyContribution, maxPropertyCount, minLiquidityMonths, targetFireYear), optional `scenarioCapacity`.

**C. Outputs.** `TruePortfolioOptimizerResult`:

- `goalReverseEngineering` — required NW / required passive income / required asset base / required monthly contribution.
- `scenarios[]` — ≥ 1,000 enumerated scenarios across `(property × investment × cash × propertyYear × riskTolerance × targetFireYear)`.
- `recommendations[]` — 5 categories (fire-speed, risk-adjusted, cashflow, probability, hybrid).
- `gapSolver` — when target not met, the binding blocker + quantified shortfall.
- `frontier` — efficient frontier with `pareto: true` flags.
- `searchMetrics` — generated / valid / evaluated / frontierSize / failureCounts / capped.
- `auditTrail` — per-section engine + input + assumption + confidence/risk/MC sources.

**D. Calculation flow.**

1. Goal Reverse Engineering — pass-throughs from `canonicalFire` + `goalSolver`. Never invented.
2. Scenario Generator — enumerate ≥ 1,000 valid combinations; capacity cap = 12,000 default, hard ceiling 100,000.
3. Scenario Evaluator — score against existing engine outputs. Undifferentiated dimensions stay labelled `notEngineModelled: true`.
4. Constraint Filtering — drop scenarios that fail user constraints.
5. Recommendation selection — argmin/argmax per category from the same evaluated pool; tie-broken deterministically.
6. Gap Solver — walk evaluated pool for the first scenario hitting target; identify binding constraint when none.
7. Efficient Frontier — Pareto-optimal scenarios across (FIRE speed × P(success) × risk × NW).
8. Audit Trail — engines / inputs / assumptions / confidence source / risk source / MC source / "how was this calculated" per section.

**E. Data source path.** Sprint 7 reads canonical ledger, canonical FIRE, headline metrics, decision candidates (`decisionCandidates`), ranking (`decisionRanking`), best-move engine, CFO advisor, risk engine, and the forecast store's MC output.

**F. Dependencies.** This *is* Sprint 7. Consumed by Sprint 8, Sprint 9, Sprint 10.

**G. Known limitations.**

- `INVESTMENT_TILTS.stock` carries `notEngineModelled: true` (`pathSimulationEngine.ts:149`) — single-stock concentration risk is not modelled distinctly from generic stock return. Recommendations with `investment === "stock"` propagate the flag.
- Constraint set is fixed: max risk / max debt / max contribution / max property count / min liquidity / target FIRE year. Other constraints (e.g. "max IP loan-to-value") would require engine work.
- The frontier is a Pareto set across 4 axes — not all 4 axes are equally weighted. Read the `recommendations[]` per category for category-specific bests.

**H. Example interpretation.** Sprint 7 says "recommendation[fire-speed] = scenario X". Sprint 9 may rank scenario Y first by robust score. They disagree intentionally: Sprint 7 is deterministic point-estimate optimization, Sprint 9 is distribution-based ranking. The intended decision flow is to read Sprint 9's `bestStrategy` (or Sprint 10's `bestPath`), not Sprint 7's `recommendations` in isolation.

**Related files:** `client/src/lib/truePortfolioOptimizer.ts`, `client/src/lib/portfolioLabOptimizer.ts`, `client/src/lib/decisionCandidates.ts`, `client/src/lib/decisionRanking.ts`, `client/src/components/TruePortfolioOptimizer.tsx`, `client/src/pages/portfolio-lab.tsx`.

---

### 3.4 Scenario Lab (Sprint 6) — Compare + Builder

**A. Purpose.** Author hand-crafted scenarios (Scenario Builder) and compare them side-by-side (Scenario Compare). Predates Sprint 7's automated search and is still useful for "what if I do exactly X" hypotheticals.

**B. Inputs.** `ScenarioCompareWorkspaceInputs`. Scenario deltas — property add/remove/adjust, stock plan, crypto plan, assumption overrides, planned orders. The full `ScenarioId` enum is at `scenarioCompareWorkspace.ts:69`.

**C. Outputs.** `ScenarioCompareWorkspaceResult` — per-scenario `ScenarioRow` with `ScenarioMetric` cells (net worth, FIRE year, monthly surplus, etc.).

**D. Calculation flow.** Run each scenario through `runScenarioForecast` (in `whatIfEngine.ts:359`), produce a `WiScenarioResult`, project metrics into the workspace shape.

**E. Data source path.** Scenario rows in `sf_wi_scenarios` Supabase table → `loadScenarios` (`whatIfEngine.ts:1053`) → workspace.

**F. Dependencies.** Pre-Sprint-7. Reads canonical ledger and assumption rows.

**G. Known limitations.**

- Deterministic. No probability distribution. For uncertainty, route to Portfolio Lab.
- Scenario authoring is manual — Sprint 7 enumerates the space automatically.

**H. Example interpretation.** Scenario Lab is the right place to test bespoke moves ("buy IP in QLD in 2027 with $200k deposit and sell in 2034 after CGT discount kicks in"). Sprint 7's enumerator may not generate the exact (state, deposit, exit-year) combination — it only covers the dimensions in §3.3.

**Related files:** `client/src/lib/scenarioCompareWorkspace.ts`, `client/src/lib/scenarioBuilderWorkspace.ts`, `client/src/lib/whatIfEngine.ts`, `client/src/components/ScenarioCompareWorkspace.tsx`, `client/src/components/ScenarioBuilderWorkspace.tsx`, `client/src/pages/scenario-compare-workspace.tsx`, `client/src/pages/what-if-scenarios.tsx`.

---

### 3.5 Decision Engine (= Sprint 10 Goal Solver Pro)

> "Decision Engine" in your vocabulary is Sprint 10's Goal Solver Pro (`goalSolverPro.ts`). The `decisionCandidates` / `decisionRanking` / `decisionEngineLabels` files are Sprint 5/6 building blocks, not the user-facing Decision Engine.

**A. Purpose.** Transform Family Wealth Lab from a simulator into a decision engine. You supply targets ("FIRE by 2045", "$3.5M net worth", "≤2 properties"); Goal Solver Pro answers: *"What exactly must I do to reach this target?"*

**B. Inputs.** `GoalSolverProInputs` (`goalSolverPro.ts:249-259`):

- `canonicalLedger` — household snapshot.
- `canonicalFire` — FIRE number, NW, target annual income.
- `sprint7Result` — strategy candidates.
- `sprint8Result?` — robust ranking (cross-validation only).
- `sprint9Result` — probability distributions per strategy.
- `planInput?`, `mcSettings?` — for Action Plan synthesis.
- `targets` — `GoalSolverProTargets` (11 optional target fields).
- `seed?` — default 10.

**C. Outputs.** `GoalSolverProResult`:

- `feasibility` — status (ACHIEVABLE/STRETCH/UNLIKELY/IMPOSSIBLE) + probability of success + median FIRE year + best/worst case.
- `gap.entries[]` — per-target shortfall (11 possible fields).
- `requiredInputs` — `requiredMonthlyDCA`, `requiredAdditionalCapital`, `requiredAdditionalProperties`, `requiredSavingsRate`, `requiredFireNumber` + source strategy id.
- `constraints.checks[]` — per-constraint pass/fail.
- `blockers[]` — eliminating constraints with affected strategy ids.
- `bestPath` — the Best Hybrid path (Sprint 9 strategy pointer).
- `alternativePaths[]` — 8 optimization objectives.
- `actionPlan[]` — year-by-year timeline.
- `auditTrail[]` — 8-field audit entries per section.

**D. Calculation flow** (`goalSolverPro.ts`):

1. Empty-state detection.
2. Constraint Solver — filter Sprint 7 candidates by `(propertyCount, monthlyContribution, risk, liquidity, debt, retirementYear)`.
3. Feasibility — thresholds at 0.70/0.40/0.10 on Sprint 9 `bestStrategy.probabilityFireByTarget`.
4. Gap Analysis — per-target shortfall against Sprint 9 bands.
5. Reverse Engineering — pick the first Sprint 7 strategy whose Sprint 9 distributions satisfy the targets.
6. Optimization Search — 8 ratio/selector objectives over the constraint-passing pool. `bestPath = max(robustScore × probabilityFireByTarget)`.
7. Action Plan — year-by-year from `dimensions.propertyYear` + `requiredMonthlyContribution` + `netWorthFan[year].p50`.
8. Audit Trail — 8-field record per section.

**E. Data source path.** Sprint 9 outputs + Sprint 7 outputs + canonical ledger + canonical FIRE → Sprint 10 → `GoalSolverProSection.tsx`.

**F. Dependencies.** Sprint 7 (candidates), Sprint 8 (cross-check confidence), Sprint 9 (distributions), `canonicalFire` (NW + FIRE number), `canonicalLedger` (debt, income, investable aggregate).

**G. Known limitations.**

- `gap[portfolioValue].actual` is **point-in-time**, not projected (Q3 fix — see `docs/sprint10-audit-report.md:186-235`). Sprint 9 doesn't expose an investable-only band, so today's canonical investable-assets value is surfaced instead of a projection. The audit string names every source field.
- `requiredAdditionalProperties` is `max(0, target − scenarioPropertyCount)`. The Sprint 7 dimensions only cover `none | buy-investment-property | delay-purchase` — buying 2+ IPs is not a Sprint 7 dimension yet.
- `Action Plan` emits a milestone every ~5 years from `netWorthFan`. The cadence is hardcoded at `goalSolverPro.ts:1254`.
- Sprint 10 owns no PRNG. Seed is recorded for audit but no Sprint 10 output depends on it directly — only Sprint 9 does.

**H. Example interpretation.** When Sprint 10 shows `feasibility.status = STRETCH` with `gap.netWorth.shortfall = $420,000`:

- "STRETCH" means Sprint 9 estimates a 40–69% probability of hitting your target. (Threshold ladder in §6.7 of the technical guide.)
- "$420k shortfall" means the Sprint 9 P50 net worth at your target year is $420k below your target NW.
- The right next move is to look at `bestPath.requiredMonthlyContribution` — if it's significantly higher than your current surplus, the bottleneck is contribution, not strategy. If it's already within range, the bottleneck is time horizon (push out the target FIRE year) or risk tolerance (the strategy is on the low-risk end of the search).

**Related files:** `client/src/lib/goalSolverPro.ts`, `client/src/components/GoalSolverProSection.tsx`, `docs/sprint10-audit-report.md`, `docs/sprint10-production-readiness.md`, `script/test-sprint10-goal-solver-pro.ts`.

---

### 3.6 Goal Solver Pro (= same as §3.5)

Goal Solver Pro is the user-facing name; "Decision Engine" is the conceptual name. They refer to the same code: `goalSolverPro.ts`. See §3.5.

---

### 3.7 Path Simulation (Sprint 9)

**A. Purpose.** Where Sprint 7 produced deterministic search and Sprint 8 layered uncertainty on point estimates, Sprint 9 simulates ≥ 1,000 full household life-paths per Sprint 7 strategy and aggregates the FIRE-outcome distribution.

**B. Inputs.** `PathSimulationInputs` (`pathSimulationEngine.ts:361-376`):

- `sprint7Result` — strategy candidates.
- `canonicalLedger` — starting balances.
- `fireMcSettings?` — `mc_fire_settings` row; `DEFAULT_FIRE_MC_SETTINGS` as fallback.
- `planInput?` — property/DCA/planned orders for FireMC.
- `seed?` — default 9.
- `simulationsPerStrategy?` — clamped ≥ 1,000.
- `maxStrategies?` — default 5.

**C. Outputs.** `PathSimulationResult` — per-strategy `PathStrategyResult` with:

- `probabilityFireByTarget`, `probabilityFireBeforeTarget`, `probabilityMissFire`, `probabilityCashShortfall`, `probabilityNegativeCashflow`.
- `netWorthFan[year]` (P10/P25/P50/P75/P90 per year).
- `probabilityCurve[]` (cumulative).
- `fireYearHistogram[]` (PMF per calendar year).
- `fireYearBand`, `netWorthBand`, `passiveIncomeBand` (P10/P25/P50/P75/P90 at horizon).
- `representativePaths[]` (P10/P50/P90 synthesised — see G).
- `driverSensitivity[]` (7 drivers).
- `robustScore` (0–100).

Plus `ranking`, `bestStrategy`, `scenarioHeatmap`, `driverSensitivityRanking`, `auditTrail` with `metadata` (engineVersion, sims, seed, runtimeMs).

**D. Calculation flow.**

1. `computeCanonicalFire(...)` for target year.
2. If `sprint7Result.empty` → return empty result, no FireMC calls.
3. `pickTopPathStrategies(...)` — recommended scenario + up to N from ranking.
4. `buildBaseSettings(...)` — FireMC settings from canonical ledger + `mc_fire_settings`. **Starting balances are NEVER overwritten.**
5. Per strategy: one `runFireMonteCarlo(settings, planInput, seed)` with `simulationCount = simsPerStrategy` (≥ 1,000).
6. For the best-ranked strategy, `runDriverSensitivity(...)` runs 7 additional FireMC calls (one per driver: property/stock/crypto return, inflation, income/expense growth, mortgage rate) with the corresponding vol field doubled and `simulationCount = 200`.
7. `buildAudit(...)` writes the engines / inputs / assumptions trail per strategy.

**E. Data source path.** Sprint 7 strategy candidates × FireMC stochastic engine × canonical ledger starting balances → Sprint 9 result → `PathSimulationSection.tsx` (10 testid-prefixed sections).

**F. Dependencies.** `fireMonteCarlo (v5)`, `canonicalFire`, `dashboardDataContract`, `truePortfolioOptimizer (Sprint 7)`. `probabilisticWealthEngine (Sprint 8)` is a **read-only cross-check**, never mutated.

**G. Known limitations.**

- **`representativePaths` is synthesised, not sampled.** Each path's `sourceIndex = -1` flags this. The paths are envelope slices (P10/P50/P90) of `netWorthFan`, not real per-path samples. The engine never has access to individual paths because each strategy is one `runFireMonteCarlo(N=1000)` call rather than N×1 calls (which would be ~150× slower and statistically less correct — see `docs/sprint-9-audit-report.md:106-121`).
- `INVESTMENT_TILTS.stock` carries `notEngineModelled: true` — single-stock concentration is not modelled.
- Driver-level `cryptoReturn` is flagged `notEngineModelled` in the driver sensitivity table.
- All other Sprint 9 outputs are real samples (or re-derivable via the same seed).

**H. Example interpretation.** When Sprint 9 shows `bestStrategy.probabilityFireByTarget = 0.62` and `netWorthBand.p50 = $3.4M`:

- 62% of 1,000 simulated life-paths hit FIRE by your target year for the recommended strategy.
- $3.4M is the median final net worth across those paths.
- The "Driver Sensitivity" row for `propertyReturn` tells you how P(FIRE) moves when property volatility doubles. A large delta means your plan is sensitive to property returns; a small delta means it's robust.
- The "Representative Paths" panel shows what P10/P50/P90 *look like* over the years — but do not click through expecting "Run 137 detail". Those are envelopes, not samples.

**Related files:** `client/src/lib/pathSimulationEngine.ts`, `client/src/components/PathSimulationSection.tsx`, `docs/sprint-9-audit-report.md`, `docs/sprint-9-production-readiness.md`, `script/test-sprint-9-path-simulation.ts`.

---

### 3.8 Monte Carlo Engine

Three live MC engines:

#### 3.8.a `fireMonteCarlo.ts` (FireMC v5)

- **Purpose:** FIRE-focused Monte Carlo. Used internally by Sprint 9; also exposed elsewhere.
- **Default seed:** `0x46_57_4c_4d` ("FWLM").
- **Default sims:** 5,000. Clamped to [100, 10000].
- **Correlation:** 4-factor Cholesky (stocks, crypto, inflation, property).
- **Time step:** monthly. Endpoint: age 65 minimum.
- **Random events:** job loss, market crash, rate jump, recession, bull market, windfall, large expense.
- **Presets:** conservative / base / growth / aggressive / property_heavy / stock_heavy / custom.

#### 3.8.b `monteCarloV4` — Dashboard fan + AI Forecast Engine

- Lower-level deterministic-seeded MC used by the Dashboard's fan chart and by the AI Forecast Engine page (`/ai-forecast-engine`).

#### 3.8.c `monteCarloV5` — Enriched dashboard MC

- Wraps V4 non-destructively and adds: regime overlays, household realism (life-cycle), property realism AU, portfolio intelligence, FIRE V2 enrichment, narrative blocks, transparency report, validations, rerank by preference vector.

**Limitations of each.** The three engines do not produce identical fans even on the same household. They use different return models, different correlation structures, and different time steps. Cross-engine drift on the same household is *expected* and is not a bug.

**Example interpretation.** When the Dashboard's MC fan disagrees with Sprint 9's fan, it is because (a) the Dashboard uses MC v4, (b) Sprint 9 uses FireMC, and (c) they use different assumption defaults. To make them agree, you would have to align settings explicitly — that is not done by default.

**Related files:** `client/src/lib/fireMonteCarlo.ts`, `client/src/lib/monteCarloV4/engineV4.ts`, `client/src/lib/monteCarloV5/engineV5.ts`, `docs/MONTE_CARLO_V4.md`, `docs/MONTE_CARLO_V5.md`, `client/src/pages/ai-forecast-engine.tsx`, `client/src/components/MonteCarloV4Panel.tsx`, `client/src/components/MonteCarloV5Panel.tsx`.

---

### 3.9 Wealth Strategy Traces

**A. Purpose.** Provide *calculation traces* (the audit-mode "show formula" tooltips) for the 5 KPIs on the Wealth Strategy Hub: Cash Buffer, Savings Rate, Debt-to-Assets, Freedom Progress, Net Position.

**B. Inputs.** `WealthStrategyTraceArgs` (`wealthStrategyTraces.ts:22-31`): `cash`, `monthlyExpenses`, `monthlyIncome`, `monthlySurplus`, `totalAssets`, `totalDebt`, `investableAssets`, `fireTarget`.

**C. Outputs.** Five `CalculationTrace` records keyed by the IDs in `WEALTH_STRATEGY_TRACE_IDS`:

- `wealth-strategy:cash-buffer` — `Cash / Monthly Expenses` (months).
- `wealth-strategy:savings-rate`.
- `wealth-strategy:debt-to-assets`.
- `wealth-strategy:freedom-progress`.
- `wealth-strategy:net-position`.

**D. Calculation flow.** No engine math. Inputs are pinned from the page's existing scope and substituted into the formula strings (`wealthStrategyTraces.ts:5-8`).

**E. Data source path.** Page-level scope → `WealthStrategyTraceArgs` → `buildWealthStrategyTraces` → registered with `auditRegistry`.

**F. Dependencies.** None directly — pure formatting.

**G. Known limitations.** Trace strings are illustrative; the *page* must already be using the same selectors for the trace to be honest. If the page bypasses canonical selectors, the trace will print one number while the page renders another.

**H. Example interpretation.** When you open the "Cash Buffer" tooltip and see "$220,000 / $14,540 = 15.1 months", you can read that as "15 months of expenses covered by liquid cash". The healthy target (≥ 3 months) is from the Risk engine's `cash_buffer` benchmark.

**Related files:** `client/src/lib/auditMode/engineTraces/wealthStrategyTraces.ts`, `client/src/lib/auditMode/calculationTrace.ts`, `client/src/lib/auditMode/auditRegistry.ts`, `client/src/pages/wealth-strategy.tsx`.

---

### 3.10 Risk Analysis (Risk Radar)

**A. Purpose.** Score the household's financial risk across 4 dimensions using real data only.

**B. Inputs.** `RiskEngineInput` (`riskEngine.ts:66+`): snapshot fields — income, expenses, assets, debts, mortgage rate, cash accounts, bills.

**C. Outputs.** `RiskRadarResult`:

- `overall_score` (0–100), `overall_level` (`green`/`amber`/`red`), `overall_label`.
- 4 `categories`: Debt Risk, Cashflow Risk, Investment Risk, Income Risk. Each has weighted factors.
- `top_risks` — worst 3 factors by score.
- `top_mitigations` — top 3 action strings.
- `alerts` — critical + high severity only.
- `radar_data` — chart series.
- `fragility_index = 100 − overall_score`.
- `data_coverage` — `full | partial | minimal`.

**D. Calculation flow.** Each dimension has multiple factors (LVR, debt ratio, IR exposure for Debt Risk; buffer months, surplus ratio, bill concentration for Cashflow Risk; etc.). Each factor is scored 0–100 (100 = safest). Category score is weighted average.

**E. Data source path.** Snapshot → `buildRiskInput(snapshot)` → `computeRiskRadar(input)` → Risk Radar page + Portfolio Lab risk constraints + Sprint 7 evaluator (inverted as "risk score").

**F. Dependencies.** Risk Radar feeds Sprint 7 (`OptimizerConstraints.maxRiskScore` — risk score is inverted: `100 - overall_score`).

**G. Known limitations.**

- All numeric. Doesn't model concentration in single assets the way a portfolio risk tool would (single-stock concentration is flagged `notEngineModelled` at the Sprint 7/9 level, not the Risk engine level).
- Thresholds (green ≥70, amber 40–69, red <40) are global, not household-specific.

**H. Example interpretation.** When Risk Radar shows "Overall 58 / Amber" with `fragility_index = 42`, that means the weighted score across all 4 dimensions sits in the middle band. The `top_risks` array names the 3 worst factors — fix those first.

**Related files:** `client/src/lib/riskEngine.ts`, `client/src/components/RiskRadarCard.tsx`, `client/src/components/CanonicalRiskSurface.tsx`, `client/src/components/UnifiedRiskPanel.tsx`, `client/src/pages/risk-radar.tsx`.

---

### 3.11 FIRE Engine (canonicalFire)

**A. Purpose.** Single source of truth for FIRE / passive income across every page.

**B. Inputs.** `CanonicalFireInputs` (`canonicalFire.ts:33-45`): optional `swrPct` (default 4, clamped [2,8]); optional `targetMonthlyIncome`.

**C. Outputs.** `CanonicalFire` (`canonicalFire.ts:47-76`): `swrPct`, `targetAnnualIncome`, `targetMonthlyIncome`, `fireNumber`, `netWorthNow`, `progressFraction`, `annualPassiveIncome`, `monthlyPassiveIncome`, `monthlyExpenses`, `passiveCoverage`, `gap`, `source` (`"user_target" | "monthly_expenses_fallback" | "empty"`).

**D. Calculation flow.** Formulas in §6.1 of the technical guide:

- `fireNumber = targetAnnualIncome / (swrPct/100)`
- `progressFraction = clamp(NW / fireNumber, 0, 1)`
- `passiveCoverage = (annualPassive/12) / monthlyExpenses`
- `gap = max(0, fireNumber − NW)`

**E. Data source path.** Ledger → `selectPassiveIncome / selectMonthlyExpensesLedger / selectCanonicalNetWorth` → `computeCanonicalFire` → every page that needs FIRE figures.

**F. Dependencies.** Consumed by Dashboard, Reports, FIRE Path, Scenario Compare, Sprint 7/8/9/10.

**G. Known limitations.**

- Target precedence is fixed: `opts.targetMonthlyIncome` > `snapshot.fire_target_monthly_income` > `monthlyExpenses` > empty (`canonicalFire.ts:101-118`).
- SWR clamped to [2, 8]. Anything outside that is reset to 4%.
- `progressFraction` capped at 1 — it cannot show "over-FIRE'd".

**H. Example interpretation.** When `source === "monthly_expenses_fallback"`, the FIRE number is derived from current spending, not your explicit target. To set an explicit target, edit `sf_snapshot.fire_target_monthly_income` (or the Settings → FIRE page).

**Related files:** `client/src/lib/canonicalFire.ts`, `client/src/components/UnifiedFirePanel.tsx`, `client/src/components/FIREPathCard.tsx`.

---

### 3.12 Exit Strategy

> No dedicated `exitStrategyEngine.ts`. Exit-timing analysis lives inside `whatIfEngine.ts` as `ExitTimingResult`.

**A. Purpose.** For each year in a horizon, evaluate the trade-off of holding vs selling a property (or other major asset), surfacing the year of optimal trade-off.

**B. Inputs.** Scenario + base forecast + asset selection (`ExitAssetSelection`, `whatIfEngine.ts:1205`) + reinvestment allocation (`ReinvestmentAllocation`, line 1216).

**C. Outputs.** `ExitTimingResult` (`whatIfEngine.ts:1785-1796`):

- `rows[]` — per-year `{ year, monthlyIncome, isOptimalTradeoff, ... }`.
- `holdMonthlyIncome` (line 1790) — from the base forecast (`forecastResult.projectedPassiveIncome`, line 1903).

**D. Calculation flow.** For each year, compute monthly income if you sell that year. Flag the year that maximises the trade-off (`isOptimalTradeoff = true`) (`whatIfEngine.ts:1895`). The narrative reads the row with `isOptimalTradeoff = true` and reports gain over hold.

**E. Data source path.** Scenario data + base forecast → `ExitTimingResult` → What-If Scenarios page narrative (`whatIfEngine.ts:2144-2147`).

**F. Dependencies.** `forecastEngine` (for `projectedPassiveIncome`), `canonicalPropertyEconomics` (for IRR / after-tax cashflows), CGT logic (50% discount > 12 months).

**G. Known limitations.**

- Exit timing is **per-scenario**, not per-strategy. Sprint 7's `dimensions.property` is `none | buy-investment-property | delay-purchase` — there is no `sell-investment-property` dimension. To model an exit, use What-If Scenarios.
- The Sprint 10 Action Plan does not include exit-year milestones.

**H. Example interpretation.** On What-If Scenarios, "Optimal exit: year 2034, gain $X/mo over hold" reads as: in year 2034, if you sell and reinvest per `ReinvestmentAllocation`, your monthly passive income is `$X/mo` higher than continuing to hold. The CGT 50% discount is folded into the after-tax cashflow at the sale year.

**Related files:** `client/src/lib/whatIfEngine.ts`, `client/src/lib/canonicalPropertyEconomics.ts`, `client/src/pages/what-if-scenarios.tsx`, `client/src/pages/cgt-simulator.tsx`.

---

### 3.13 Property Modelling

**A. Purpose.** Three sub-engines: (a) buy-vs-wait decision (`propertyBuyEngine.ts`); (b) after-tax cashflow and IRR (`canonicalPropertyEconomics.ts`); (c) timeline building (`propertyTimelineBuilder.ts`); plus V5 enrichment (`monteCarloV5/propertyRealismAU.ts`).

**B. Inputs.** For `propertyBuyEngine`: price, state, deposit %, mortgage rate, growth assumption, holding cost assumptions, marginal tax rate. For `canonicalPropertyEconomics`: `PropertyEconomicsInputs` — purchase economics + amortisation + tax inputs.

**C. Outputs.**

- `propertyBuyEngine` per-scenario: NW after N years, equity created, total cash invested, annual cashflow impact (net of rent, interest, NG benefit, outgoings), IRR (Newton-Raphson NPV solver), risk summary, opportunity cost of waiting, offset vs deposit tradeoff.
- `canonicalPropertyEconomics`: `buildPropertyAfterTaxCashflows(...)`, `computePropertyIRR(...)`.

**D. Calculation flow.**

- Stamp duty: per-state piecewise functions (`propertyBuyEngine.ts:48-100`) covering QLD, NSW, VIC, SA, WA, TAS, NT, ACT.
- Negative gearing: `rental_loss × marginal_income_tax_rate` (`propertyBuyEngine.ts:23`), `auMarginalRate` from `finance.ts`.
- Depreciation: div 43 building allowance + div 40 fixtures (simplified).
- CGT: 50% discount for holdings > 12 months.
- Land tax: **excluded** (varies too much by state — caller notified in output).

**E. Data source path.** UI form inputs on `property-buy-analysis.tsx` → `propertyBuyEngine` (pure — no Supabase reads in this file, `propertyBuyEngine.ts:19-21`) → result.

**F. Dependencies.**

- Sprint 7's `dimensions.property` references property choices, but Sprint 7 does not call `propertyBuyEngine` directly. Sprint 7 uses simpler heuristics; for detailed analysis, route to `/property-buy-analysis`.
- `canonicalPropertyEconomics` is consumed by `whatIfEngine`, scenario builders, and the lifecycle audit.

**G. Known limitations.**

- Land tax not modelled.
- Stamp duty tables are state-specific 2025-26 schedules — refresh annually.
- Single-property focus. Multi-property strategies need Sprint 7 enumeration.

**H. Example interpretation.** Property Buy Analysis showing "Buy Now IRR 7.4%, Wait 12 IRR 6.1%, opportunity cost of waiting $42k" reads as: deferring by 12 months loses about 1.3pp annualised return and ~$42k in opportunity cost given the assumed growth + holding cost path.

**Related files:** `client/src/lib/propertyBuyEngine.ts`, `client/src/lib/canonicalPropertyEconomics.ts`, `client/src/lib/propertyTimelineBuilder.ts`, `client/src/lib/monteCarloV5/propertyRealismAU.ts`, `client/src/components/PropertyBuyWidget.tsx`, `client/src/components/PropertyLifecycleAnalysis.tsx`, `client/src/components/PropertyLifecycleAudit.tsx`, `client/src/components/PropertyPerformanceTimeline.tsx`, `client/src/pages/property-buy-analysis.tsx`, `client/src/pages/property.tsx`.

---

### 3.14 Stock / Crypto Modelling

> No dedicated stock-growth or crypto-growth engine file. Growth is modelled in two places.

**A. Purpose.** Project individual stock / crypto holdings over time on the Stocks and Crypto pages, and incorporate stock/crypto returns into FireMC and Sprint 7/9 simulations.

**B. Inputs.**

- Per-asset: ticker, purchase price, units, transactions (`StockTransaction`, `CryptoTransaction`), DCA schedules (`StockDCASchedule`, `CryptoDCASchedule`), planned orders.
- Live prices via `marketData.ts` (`fetchAllStockPrices`, `fetchAllCryptoPrices`).
- For MC modelling: FireMC settings — `meanStockReturn`, `volStocks`, `meanCryptoReturn`, `volCrypto`, `rhoStocksCrypto`, plus event params `stockCorrectionProb`, `stockCorrectionSize`, `cryptoCrashProb`, `cryptoCrashSize`, `cryptoBullProb`, `cryptoBullUpside`.

**C. Outputs.**

- Per-asset CAGR, projected value series, total return.
- In MC: stock/crypto contribution to net-worth fan, P(FIRE), and drawdowns.

**D. Calculation flow.**

- Stocks/Crypto pages: `projectInvestment(...)` and `calcCAGR(...)` from `finance.ts`. Live prices via `marketData.ts`.
- FireMC: correlated normals (Cholesky 4×4) drive monthly returns; stock corrections / crypto crashes / crypto bulls fire stochastically based on probability parameters.

**E. Data source path.**

- Live: `marketData.ts` (`fetchAllStockPrices`, `fetchAllCryptoPrices`) → portfolio components.
- MC: FireMC settings → `runFireMonteCarlo` → Sprint 9.

**F. Dependencies.** None on Sprint 7+ directly. Sprint 9 picks up stock/crypto assumptions through FireMC settings.

**G. Known limitations.**

- **`INVESTMENT_TILTS.stock` is `notEngineModelled: true`** (`pathSimulationEngine.ts:149`) — single-stock concentration is treated identically to a diversified ETF position. A strategy tilted "stock" in Sprint 7 will propagate this flag.
- **Crypto driver-sensitivity is `notEngineModelled`** in Sprint 8 and Sprint 9 — the number itself uses household crypto inputs, but the *attribution* to crypto-specific dynamics is engine-undifferentiated.
- No per-stock fundamental analysis (no DCF, no P/E targets, no earnings model).

**H. Example interpretation.** A "Stock heavy" Sprint 7 strategy with `meanStockReturn = 13%` and `volStocks = 19%` (the `stock_heavy` preset, `fireMonteCarlo.ts:444-449`) will produce a wider Sprint 9 fan than the same-return-different-vol "Aggressive" preset. The wider fan is correct — higher volatility means more dispersion in 1,000 simulated paths.

**Related files:** `client/src/lib/finance.ts`, `client/src/lib/marketData.ts`, `client/src/lib/fireMonteCarlo.ts` (lines 125-180 for stock/crypto knobs), `client/src/lib/monteCarloV5/portfolioIntelligence.ts`, `client/src/lib/monteCarloV5/correlatedShocks.ts`, `client/src/pages/stocks.tsx`, `client/src/pages/crypto.tsx`, `client/src/components/PortfolioLiveReturn.tsx`.

---

## 4. Common Interpretation Mistakes (by module)

### Dashboard

- **"Dashboard MC fan = Sprint 9 fan."** No. Dashboard uses MC v4; Sprint 9 uses FireMC. They use different correlation and different defaults.
- **"Monthly Surplus is income − expenses."** Only in mode A. In mode B (ledger has no debt rows) it subtracts debt service explicitly. The page auto-detects which mode applies.

### Forecast Engine

- **"Year-by-year mode produces a monthly forecast that varies per month."** It does not. The monthly engine uses the first active year's values as the monthly base. Per-year overrides apply at the annual level.
- **"Net worth projection is unlimited horizon."** It is fixed at 10 years (`forecastEngine.ts:152`). For longer horizons use Sprint 9.

### Portfolio Lab (Sprint 7)

- **"Recommendations[0] is the best strategy."** Only for the `fire-speed` category. The five categories are independent and tie-broken deterministically. The robust pick is Sprint 9's `bestStrategy` or Sprint 10's `bestPath`.
- **"Pareto frontier = top 5 strategies."** No. The frontier is the *non-dominated* set across 4 axes (FIRE speed × P(success) × risk × NW). It is not a ranking — points on the frontier each win on a different trade-off.

### Scenario Lab (Sprint 6)

- **"Scenario Lab uses Sprint 7."** No — Sprint 6 predates Sprint 7. Scenario Lab is for hand-crafted comparisons. Sprint 7 is automated search.

### Decision Engine / Sprint 10 Goal Solver Pro

- **`targetPortfolioValue` is net worth.** No (post-Q3 fix). It is the **canonical investable-assets aggregate** with PPOR equity excluded. See §3.5(G), §6.4 of the technical guide.
- **`requiredAdditionalProperties` covers buying 3+ IPs.** No. The Sprint 7 `dimensions.property` only covers `none | buy-investment-property | delay-purchase`. Beyond 1 additional IP, you need scenario authoring.
- **"Status STRETCH means it'll happen."** No. STRETCH means P(success) is 40–69%. ACHIEVABLE is the band ≥ 70%.
- **"`bestPath` is one of the 8 alternative paths."** Yes — specifically the **Best Hybrid** result (`argmax robustScore × P(FIRE)`). It is repeated as `bestPath` for emphasis.
- **"`actionPlan` invents future contributions."** No. Every entry is `sourceStrategyId` + `inputField` traceable. The DCA line is `sprint7.scenarios[best].metrics.requiredMonthlyContribution.value` unchanged.

### Path Simulation (Sprint 9)

- **`representativePaths` are real simulation runs.** No — they are synthesised from `netWorthFan` percentile slices, marked `sourceIndex = -1`. The engine never has access to individual paths.
- **"Run again to see a different fan."** It is deterministic. Same seed ⇒ identical fan. If you want a different fan, change the seed.
- **`probabilityCurve` is monotonic.** Yes — regression test §13 enforces this. If you see a downward step, that's a bug, not a feature.

### Monte Carlo Engine

- **"V4 and V5 fans agree."** V5 wraps V4 non-destructively, so the V4 fan inside `result.median/p10/p90/fan_data` is identical. The V5 enrichments live under `result.v5` and do not modify the V4 fan.
- **"FireMC and MC v4 produce the same numbers."** No. Different correlation models, different defaults, different time steps.

### Wealth Strategy Traces

- **"Trace formula is engine math."** No — traces substitute the page's existing values into formula strings. If the page's value is wrong, the trace's number will be wrong too.

### Risk Analysis

- **"Higher overall score = riskier."** No. Higher score = safer (100 = safest). `fragility_index = 100 − overall_score` is the "riskier" direction.

### FIRE Engine

- **"FIRE Number depends on which page I'm on."** No — `computeCanonicalFire` is the single source. If two pages disagree, that's a reconciliation bug.
- **"`source = monthly_expenses_fallback` means I haven't set a target."** Correct interpretation. Set `sf_snapshot.fire_target_monthly_income` to switch to explicit target.

### Exit Strategy

- **"Sprint 10 plans my property exit year."** No. Sprint 10 does not include exit-year actions. Use What-If Scenarios for exit timing.

### Property Modelling

- **"IRR includes land tax."** No — land tax is explicitly excluded (varies by state). Add it manually if material to your decision.
- **"Stamp duty figures are accurate forever."** They are AU 2025-26 schedules. Refresh annually.

### Stock / Crypto Modelling

- **"Single-stock concentration is modelled."** No — flagged `notEngineModelled`. The Sprint 9 strategy will return a number, but the engine does not differentiate single-stock risk from ETF risk.
- **"Crypto returns are projected with full crypto-specific dynamics."** No — at the driver-sensitivity level, crypto is flagged `notEngineModelled`. The number uses household crypto inputs but the *attribution* to crypto-specific risk is not engine-differentiated.

---

## 5. FAQ / Decision Tree

### "I see X — should I worry?"

**Sprint 10 says STRETCH and `gap.netWorth.shortfall = $420k`.**
→ Read `bestPath.requiredMonthlyContribution`. If it's well above your current surplus, the bottleneck is contribution. If it's near your surplus, the bottleneck is time horizon or risk tolerance.

**Sprint 9 `bestStrategy.probabilityFireByTarget = 0.32` but Sprint 8 `bestStrategy.robustScore = 78`.**
→ Sprint 8 measures robust ranking under assumption uncertainty; Sprint 9 measures P(FIRE) over path simulations. The two are answering different questions. The composite (Best Hybrid) optimization is the right tie-breaker — see Sprint 10's `bestPath`.

**A Sprint 10 blocker says "Zero feasible strategies".**
→ Every Sprint 7 candidate violates at least one constraint. Relax the binding constraint (the `blockers[*].reason` names it).

**My dashboard NW differs from my Reports NW by $200.**
→ One of the pages is bypassing `selectCanonicalNetWorth`. Run `reconcileCanonicalLedger` to localise the drift. Per Sprint 4A audit, drift > $1 fails the canonical check.

### "How do I increase P(FIRE)?"

In ranked impact (per Sprint 9 driver sensitivity):

1. **Increase `requiredMonthlyDCA`** — Sprint 10 names the exact required figure under `requiredInputs`.
2. **Push out target FIRE year** — Sprint 10's `feasibility.medianFireYear` shows what's achievable.
3. **Reduce risk constraints** — if `OptimizerConstraints.maxRiskScore` is binding, Sprint 7 may be filtering out high-return strategies.
4. **Add property** — if `dimensions.property === "buy-investment-property"` is among the alternatives, switching to that strategy may shift the fan up.

The driver sensitivity table on Sprint 9 ranks which assumption movement most changes P(FIRE) — read it before changing inputs.

### "Why is robust score divergent from raw P(FIRE)?"

Robust score is a blend (Sprint 8) — deterministic Sprint 7 score combined with stochastic confidence. A high-P(FIRE) strategy with high tail risk may have lower robust score than a medium-P(FIRE) strategy with tighter bands. The Sprint 10 Best Hybrid objective explicitly multiplies robust × P(FIRE) to surface strategies that win on both.

### "When should I trust the Forecast Engine vs Sprint 9?"

- **Forecast Engine** (`forecastEngine`): deterministic, monthly granularity, 10-year horizon. Best for "if assumptions hold exactly, what does the next 10 years look like".
- **Sprint 9**: probabilistic, annual aggregation, horizon to age 65+. Best for "given the stochastic distribution of returns, what's the *range* of outcomes".
- **FIRE Path Engine** (`firePathEngine`): deterministic, 4 named strategies, max 40 years. Best for "given strategy X, when do I FIRE if assumptions hold".

For decisions, Sprint 9 + Sprint 10. For day-to-day planning, Dashboard + Forecast Engine.

### "Can I trust the `actionPlan` dates?"

Yes — every date is traceable. Property year reads from `sprint7.scenarios[best].dimensions.propertyYear`; DCA "from now" is dated to the current calendar year; milestone years are taken directly from `sprint9.netWorthFan[*].year`. Nothing is invented.

---

## 6. Glossary

Every UI-visible metric label with its definition and source engine field.

### Canonical figures

| Label | Definition | Source |
|---|---|---|
| Net Worth (canonical) | Assets − Liabilities, including super, settled IPs, cars, Iran property, other assets | `selectCanonicalNetWorth` (`dashboardDataContract.ts:771-810`) |
| Monthly Surplus | Income − Expenses (− debt service if debt not already in expenses) | `selectMonthlySurplus` (`dashboardDataContract.ts:641-648`) |
| Cash Today | Cash + savings + emergency + other + offset (offset/other dedup) | `selectCashToday` (`dashboardDataContract.ts:650-661`) |
| Passive Income (annual) | Settled IP rent + manual passive + dividend heuristics | `selectPassiveIncome` |
| Monthly Debt Service | PPOR mortgage + settled IP loans + other debt minimums | `selectMonthlyDebtService` |
| Total Investments | Stocks + crypto + settled IP current value | `KPI_DATA_CONTRACT.total_investments` (`dashboardDataContract.ts:96+`) |

### FIRE

| Label | Definition | Source |
|---|---|---|
| FIRE Number | `targetAnnualIncome / (swrPct/100)` | `canonicalFire.fireNumber` |
| FIRE Progress | `clamp(NW / fireNumber, 0, 1)` | `canonicalFire.progressFraction` |
| Passive Coverage | `(annualPassive/12) / monthlyExpenses` | `canonicalFire.passiveCoverage` |
| Gap to FIRE | `max(0, fireNumber − NW)` | `canonicalFire.gap` |
| SWR | Safe withdrawal rate %, clamped [2, 8], default 4 | `canonicalFire.swrPct` |
| Target Source | `user_target` / `monthly_expenses_fallback` / `empty` | `canonicalFire.source` |

### Sprint 7 (Portfolio Lab)

| Label | Definition | Source |
|---|---|---|
| Recommendation | Best scenario per category from same evaluated pool | `truePortfolioOptimizer.recommendations[*]` |
| Pareto Frontier | Non-dominated set across (FIRE speed × P × risk × NW) | `truePortfolioOptimizer.frontier.points[*]` (`pareto: true`) |
| Required Monthly Contribution | Pass-through from `goalSolver` per scenario | `scenarios[*].metrics.requiredMonthlyContribution` |
| Required Asset Base | Pass-through from `goalSolver` | `scenarios[*].metrics.requiredAssetBase` |
| Risk Score (Sprint 7) | Inverted `riskEngine.overall_score` (100 − score) | `scenarios[*].metrics.riskScore` |
| Liquidity Position | Months of runway | `scenarios[*].metrics.liquidityPosition` |
| notEngineModelled | At least one dimension has no engine equivalent | `scenarios[*].notEngineModelled` |

### Sprint 8 (Probabilistic Wealth)

| Label | Definition | Source |
|---|---|---|
| Probability FIRE Success | Integer %, sims hitting FIRE | `strategies[*].probabilityFireSuccess` |
| Probability Liquidity Stress | Sims where months < threshold | `strategies[*].probabilityLiquidityStress` |
| Probability Negative Cashflow | Sims with any negative-cashflow year | `strategies[*].probabilityNegativeCashflow` |
| Probability Forced Sale | Sims hitting debt > assets | `strategies[*].probabilityForcedSale` |
| Net Worth Band (P10/P50/P90) | Confidence band at horizon | `strategies[*].netWorthBand` |
| Robust Score | Blend of deterministic + MC confidence | `strategies[*].robustScore` |
| Assumption Set Version | Stamp on the assumption ranges used | `assumptionSet.version` (default `"sprint8-v1.0"`) |

### Sprint 9 (Path Simulation)

| Label | Definition | Source |
|---|---|---|
| P(FIRE by target) | Cumulative histogram up to target year ÷ sims | `bestStrategy.probabilityFireByTarget` |
| P(FIRE before target) | Strictly before target | `probabilityFireBeforeTarget` |
| P(Miss FIRE) | Never hit within horizon | `probabilityMissFire` |
| P(Cash Shortfall) | Any path with cash shortfall at any point | `probabilityCashShortfall` |
| P(Negative Cashflow) | Any path with negative cashflow in any year | `probabilityNegativeCashflow` |
| Net Worth Fan | Per-year P10/P25/P50/P75/P90 | `netWorthFan[year]` |
| Probability Curve | Cumulative P(FIRE) per calendar year, monotonic non-decreasing | `probabilityCurve` |
| FIRE Year Histogram | Probability mass per calendar year | `fireYearHistogram` |
| FIRE Year Band | P10/P25/P50/P75/P90 of FIRE year | `fireYearBand` |
| Representative Paths | **Synthesised** P10/P50/P90 envelopes (`sourceIndex = -1`) | `representativePaths` |
| Driver Sensitivity | Δpp / Δyears when driver's σ doubled | `driverSensitivity[*]` |
| Robust Score | Composite 0–100 | `bestStrategy.robustScore` |
| Engine Version | `"sprint-9.path-sim.v1"` | `auditTrail.metadata.engineVersion` |

### Sprint 10 (Goal Solver Pro)

| Label | Definition | Source |
|---|---|---|
| Feasibility Status | ACHIEVABLE (P≥0.70) / STRETCH (≥0.40) / UNLIKELY (≥0.10) / IMPOSSIBLE | `feasibility.status` |
| Probability of Success | Sprint 9 `bestStrategy.probabilityFireByTarget` | `feasibility.probabilityOfSuccess` |
| Median FIRE Year | Sprint 9 `bestStrategy.fireYearBand.p50` | `feasibility.medianFireYear` |
| Best Case FIRE Year | Sprint 9 P10 | `feasibility.bestCaseFireYear` |
| Worst Case FIRE Year | Sprint 9 P90 | `feasibility.worstCaseFireYear` |
| Gap Shortfall | `max(0, target − actual)` (or invert for less-is-better) | `gap.entries[*].shortfall` |
| Gap: Portfolio Value | **Canonical investable-assets aggregate** (PPOR excluded) | `gap[portfolioValue]` |
| Required Monthly DCA | From source strategy's `requiredMonthlyContribution` | `requiredInputs.requiredMonthlyDCA` |
| Required Additional Capital | `max(0, requiredAssetBase − NW)` | `requiredInputs.requiredAdditionalCapital` |
| Required Additional Properties | `max(0, target − currentProps)` | `requiredInputs.requiredAdditionalProperties` |
| Required Savings Rate | `requiredMonthlyDCA / (roham + fara monthly income)`, clamped [0,1] | `requiredInputs.requiredSavingsRate` |
| Best Path | argmax (robustScore × P(FIRE)) over passing candidates | `bestPath` |
| Alternative Paths | 8 optimization objectives | `alternativePaths[*]` |
| Action Plan Entries | Property year + DCA + 5-year NW checkpoints + FIRE year | `actionPlan[*]` |
| Engine Version | `"sprint-10.goal-solver.v1"` | `engineVersion` |
| Seed | Default 10 | `seed` |

### Risk Engine

| Label | Definition | Source |
|---|---|---|
| Overall Score | 0–100, 100 = safest | `RiskRadarResult.overall_score` |
| Level | green ≥70, amber 40–69, red <40 | `overall_level` |
| Fragility Index | `100 − overall_score` | `fragility_index` |
| Data Coverage | `full | partial | minimal` | `data_coverage` |
| Top Risks | Worst 3 factors by score | `top_risks` |
| Top Mitigations | Top 3 action strings | `top_mitigations` |

### Wealth Strategy Traces

| Trace ID | Formula |
|---|---|
| `wealth-strategy:cash-buffer` | `Cash / Monthly Expenses` (months) |
| `wealth-strategy:savings-rate` | Surplus / income |
| `wealth-strategy:debt-to-assets` | Total Debt / Total Assets |
| `wealth-strategy:freedom-progress` | Investable / FIRE target |
| `wealth-strategy:net-position` | Total Assets − Total Debt |

### Exit Strategy

| Label | Definition | Source |
|---|---|---|
| Hold Monthly Income | Base forecast `projectedPassiveIncome` | `ExitTimingResult.holdMonthlyIncome` |
| Optimal Tradeoff Year | The row where `isOptimalTradeoff === true` | `ExitTimingResult.rows[*]` |

---

## Appendix — Cross-References

- Technical guide: `docs/family-wealth-lab-technical-guide.md` — file:line citations for every formula and every engine.
- Sprint 9 audit: `docs/sprint-9-audit-report.md` — per-output traceability.
- Sprint 10 audit: `docs/sprint10-audit-report.md` — Q3 fix detail + 22 regression sections.
- Dashboard contract: `docs/DASHBOARD_DATA_CONTRACT.md` — declarative KPI bindings.
- Monte Carlo: `docs/MONTE_CARLO_V4.md`, `docs/MONTE_CARLO_V5.md`.
- V3 Decision page spec: `docs/unified_decision_engine_spec.md`.
