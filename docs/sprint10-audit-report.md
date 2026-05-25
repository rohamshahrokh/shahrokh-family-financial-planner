# Sprint 10 — Goal Solver Pro / Reverse Wealth Engineering — Audit Report

## Overview

Sprint 10 transforms Family Wealth Lab from a simulator into a **decision engine**.
The user supplies targets ("FIRE by 2045", "$3.5M net worth", "≤2 properties", etc.)
and Goal Solver Pro answers: **"What exactly must I do to reach this target?"**

Sprint 10 is **pure orchestration** layered on top of canonical engines:

* **Sprint 7** (`truePortfolioOptimizer.ts`) — supplies candidate strategies and
  their `requiredMonthlyContribution`, `requiredAssetBase`, `riskScore`,
  `liquidityPosition` metrics.
* **Sprint 8** (`probabilisticWealthEngine.ts`) — surfaces robust strategy
  ranking under assumption uncertainty (used as cross-validation).
* **Sprint 9** (`pathSimulationEngine.ts`) — supplies the probability
  distributions: `probabilityFireByTarget`, `netWorthBand`, `passiveIncomeBand`,
  `fireYearBand`, `netWorthFan`, `robustScore`.
* **`canonicalFire`** — supplies `fireNumber`, `netWorthNow`, `targetAnnualIncome`.
* **`canonicalLedger`** — supplies current household debt, income.

**Zero new financial formulas.** Every output is either:

1. A direct pass-through (`bestPath.probabilityFireByTarget` ←
   `sprint9.strategies[i].probabilityFireByTarget`), or
2. A **ratio / selector** over existing engine outputs
   (e.g. `bestDebtAdjusted` = `max(netWorthP50 / householdDebt)`),
3. A **filter** over existing engine outputs
   (e.g. constraint-passing strategies = `scenarios.filter(s ⇒ s.metrics
   satisfy targets)`).

## Architecture

Engine version: `sprint-10.goal-solver.v1`, default seed `10`.

Pipeline (in order):

1. **Empty-state detection** — if both Sprint 9 is empty AND no targets are
   supplied, return an empty result with `emptyReason`.
2. **Constraint Solver** — iterate Sprint 7 ranked scenarios; reject any that
   violate a user constraint. Track per-constraint elimination counts and per
   strategy violations to build a blocker list.
3. **Feasibility** — read `sprint9.bestStrategy.probabilityFireByTarget`,
   threshold at 0.70 / 0.40 / 0.10 to classify status; force `IMPOSSIBLE`
   when any hard constraint left zero candidates.
4. **Gap Analysis** — for each target, compute `shortfall = max(0, target −
   actual)` (or `actual − target` for less-is-better fields like debt or FIRE
   year). Actuals are read directly from Sprint 9's bands.
5. **Reverse Engineering** — scan Sprint 7 scenarios in ranked order, pick the
   first whose Sprint 9 distributions satisfy the targets. Expose its
   `requiredMonthlyContribution`, `requiredAssetBase`, property count —
   directly from the strategy's existing metrics.
6. **Optimization Search** — 8 ratio/selector objectives over the passing-
   constraints candidate pool: fastest FIRE, highest probability, lowest risk,
   best hybrid, highest net worth, best passive income, best debt-adjusted,
   best liquidity-adjusted.
7. **Action Plan** — synthesise a year-by-year timeline by READING the chosen
   strategy's `dimensions.propertyYear`, `metrics.requiredMonthlyContribution`
   and Sprint 9's `netWorthFan[year].p50` checkpoints. Every entry tracks its
   `sourceStrategyId` and `inputField`.
8. **Audit Trail** — every section emits an audit entry carrying all eight
   provenance fields: `enginesUsed`, `inputsUsed`, `assumptionsUsed`,
   `probabilitySource`, `pathSource`, `constraintSource`, `confidenceSource`,
   `howCalculated`.

## Per-Output Traceability

| Sprint 10 output | Source canonical engine field |
|---|---|
| `feasibility.probabilityOfSuccess` | `sprint9.bestStrategy.probabilityFireByTarget` |
| `feasibility.medianFireYear` | `sprint9.bestStrategy.fireYearBand.p50` |
| `feasibility.bestCaseFireYear` | `sprint9.bestStrategy.fireYearBand.p10` |
| `feasibility.worstCaseFireYear` | `sprint9.bestStrategy.fireYearBand.p90` |
| `gap[netWorth].actual` | `sprint9.bestStrategy.netWorthFan[year].p50` (or `netWorthBand.p50` at horizon) |
| `gap[passiveIncomeAnnual].actual` | `sprint9.bestStrategy.passiveIncomeBand.p50` |
| `gap[passiveIncomeMonthly].actual` | `sprint9.bestStrategy.passiveIncomeBand.p50 / 12` |
| `gap[fireYear].actual` | `sprint9.bestStrategy.fireYearBand.p50` |
| `gap[propertyCount].actual` | `sprint7.scenarios[best].dimensions.property` (1 if "buy", else 0) |
| `gap[debt].actual` | `canonicalLedger.snapshot.{mortgage,other_debts}` (sum) |
| `gap[monthlyContribution].actual` | `sprint7.scenarios[best].metrics.requiredMonthlyContribution.value` |
| `gap[risk].actual` | `sprint7.scenarios[best].metrics.riskScore.value` |
| `gap[liquidity].actual` | `sprint7.scenarios[best].metrics.liquidityPosition.value` |
| `requiredInputs.requiredMonthlyDCA` | `sprint7.scenarios[source].metrics.requiredMonthlyContribution.value` |
| `requiredInputs.requiredAdditionalCapital` | `max(0, sprint7.scenarios[source].metrics.requiredAssetBase.value − canonicalFire.netWorthNow)` |
| `requiredInputs.requiredAdditionalProperties` | `max(0, target − sprint7.scenarios[source].dimensions.property)` |
| `requiredInputs.requiredSavingsRate` | `requiredMonthlyDCA / (roham_monthly_income + fara_monthly_income)` |
| `requiredInputs.requiredFireNumber` | `canonicalFire.fireNumber` |
| `bestPath.*` | All fields pulled directly from `sprint9.strategies[id=bestPath.strategyId]` |
| `alternativePaths[*].path.*` | Same — pointers into `sprint9.strategies[*]` |
| `actionPlan[*]` | `sprint7.scenarios[best].dimensions.propertyYear`, `sprint7.scenarios[best].metrics.requiredMonthlyContribution`, `sprint9.bestStrategy.netWorthFan[*]` |
| `blockers[*]` | `sprint7.scenarios[*]` filtered by user constraints + `canonicalLedger.snapshot.debt` |

## Constraint Solver Logic

For every user constraint, every Sprint 7 scenario is checked. The constraint
violation reasons are tracked separately:

| Constraint | Field checked | Eliminating condition |
|---|---|---|
| Max Property Count | `dimensions.property` | property count > target |
| Max Monthly Contribution | `metrics.requiredMonthlyContribution.value` | DCA > target |
| Max Risk | `metrics.riskScore.value` | risk > target |
| Min Liquidity | `metrics.liquidityPosition.value` | liquidity < target |
| Max Debt | `canonicalLedger.snapshot.{mortgage,other_debts}` | current debt > ceiling |
| Retirement Year | `sprint9.strategies[id].fireYearBand.p50` | median FIRE year > target |

If every scenario fails (zero candidates pass), Sprint 10 emits the dedicated
`"Zero feasible strategies"` blocker and forces `feasibility.status =
"IMPOSSIBLE"`.

## Optimization Search Formulas

All formulas are **ratios or selectors** over existing engine outputs. None
introduce a new forecast.

| Objective | Selector |
|---|---|
| Fastest FIRE | `argmin medianFireYear` |
| Highest Probability | `argmax probabilityFireByTarget` |
| Lowest Risk | `argmin (probCashShortfall + probNegCashflow)` |
| Best Hybrid | `argmax (robustScore × probabilityFireByTarget)` |
| Highest Net Worth | `argmax netWorthBand.p50` |
| Best Passive Income | `argmax passiveIncomeBand.p50` |
| Best Debt-Adjusted | `argmax (netWorthBand.p50 / householdDebt)` |
| Best Liquidity-Adjusted | `argmax (netWorthBand.p50 / liquidityPosition)` |

## Test Results

`script/test-sprint10-goal-solver-pro.ts` — 20 sections, 830 assertions, 100% pass.

| Section | Description |
|---|---|
| §1  | Lenient targets — feasibility classification |
| §2  | Stretch targets — gap shortfalls populated |
| §3  | Impossible target — IMPOSSIBLE + blockers |
| §4  | Constraint rejection (max debt) — blocker present |
| §5  | All probability values ∈ [0,1] |
| §6  | Gap shortfalls non-negative |
| §7  | Required-DCA / capital / properties reference a real Sprint 7 strategy |
| §8  | Action-plan entries carry `enginesUsed` + ≥1 `inputsUsed` |
| §9  | Best path matches a strategy in `sprint7.scenarios` (no synthesised strategies) |
| §10 | Sprint 9 pointer reuse — `bestPath.*` equals the Sprint 9 strategy's values (no drift) |
| §11 | Audit completeness — every entry has all 8 audit fields populated |
| §12 | Determinism — same inputs ⇒ identical outputs (seed=10) |
| §13 | Empty targets ⇒ ACHIEVABLE + gap empty |
| §14 | Empty Sprint 9 ⇒ empty result with reason, no crash |
| §15 | Sprint 7 not mutated by Goal Solver |
| §16 | Sprint 8 not mutated by Goal Solver |
| §17 | Sprint 9 not mutated by Goal Solver |
| §18 | React SSR — all required `goal-solver-*` testids present |
| §19 | Optimization search returns coherent (and distinct where possible) objectives |
| §20 | `howCalculated` strings non-empty + reference an engine name |

## Screenshot Inventory

* `screenshots/sprint10-rich.png` — populated state with all user targets set
* `screenshots/sprint10-empty.png` — empty-target placeholder
* `screenshots/sprint10-rich.html` — SSR HTML used to generate the rich PNG
* `screenshots/sprint10-empty.html` — SSR HTML used to generate the empty PNG

## Honest Framing — What Is and Is Not Synthesised

* **Pure pass-through:** every probability, percentile, robust score, FIRE
  year, net worth band, and passive income band rendered by Sprint 10 is a
  pointer into a Sprint 7 or Sprint 9 field. No averaging, no smoothing, no
  reweighting.
* **Ratios over existing outputs:** the 8 optimization objectives are simple
  selectors. They surface trade-offs that already exist inside the candidate
  set; they do not generate new candidates.
* **Action plan derivation:** the year-by-year timeline pulls the property
  purchase year directly from `sprint7.scenarios[*].dimensions.propertyYear`
  and milestone net-worth values directly from
  `sprint9.bestStrategy.netWorthFan[*].p50`. The "set monthly contribution
  to $X" line is an immediate-action item dated this year — the dollar value
  is `sprint7.scenarios[best].metrics.requiredMonthlyContribution.value`,
  unchanged.
* **Required Savings Rate** is the **ratio** `requiredMonthlyDCA / household
  monthly income`. This is a derived ratio, not a new forecast; both
  components are direct reads.
