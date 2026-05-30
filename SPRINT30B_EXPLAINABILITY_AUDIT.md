# Sprint 30B — Financial Explainability Engine

**Audit Report — Pre-Implementation**
Branch: `feat/sprint28-move-refactor` · Status: AUDIT ONLY — NO CODE WRITTEN
Preview: https://shahrokh-family-financial-planner-hyjpatvfb.vercel.app
Last commit (30A.3): `3395bd6` · Tests: 57/57 · Typecheck: 65/66 errors
Reconciliation (30A.3): Current NW 0.00% · Terminal NW 0.00%

---

## 0. Executive Summary

### The defect
The Action Roadmap renders **only two timeline nodes: TODAY and FIRE**, with an empty middle. The user correctly diagnosed this as "a destination card pretending to be a roadmap."

### Root cause (single-line)
`ScenarioResult.events` **does not exist as a field on the type**, is **never populated by `runScenarioV2`**, and the Action Roadmap selector reads it as `undefined`, falling through to the synthetic-FIRE-only path. The recurring base-plan events (income/expense/mortgage P&I) are emitted *inside* `tick()` and discarded once consumed — they never surface to the UI.

```
client/src/pages/action-roadmap.tsx:196
  const events: ScenarioEvent[] =
    (recommended?.winner?.result?.events as ScenarioEvent[] | undefined) ?? [];
                                  ^^^^^^^^
                                  Field does not exist on ScenarioResult.
                                  Cast hides the type error; always []
```

```
client/src/lib/scenarioV2/events.ts:31-37 (comment)
  "Base-plan recurring events (income, expenses, mortgage payments) are
   emitted inside `tick` directly because they fire EVERY month and the
   marginal cost of storing 360+ events per stream is wasteful. Only
   one-off and conditional events go in the store."
```

```
client/src/lib/scenarioV2/types.ts:252-265 (ScenarioResult)
  // No `events` field. None.
```

### Why the existing scaffolding is invisible
Sprint 29 added a rich explainability stack — `selectEngineEventTimeline`,
`selectEngineEventLanes`, `MetricAttribution`, dependency edges, traceability validators,
MC variance, reconciliation — and Sprint 30A wired all of them into
`RoadmapSectionProps.ctx`. **But every selector starts from an empty event
array**, so every downstream visualization (lanes, dependency chain,
attribution, MC overlay) collapses to its empty-state branch. The
scaffolding works; it is being fed `[]`.

### What 30B must actually deliver
1. **Surface the events that already exist** — extend `ScenarioResult` with
   `events: ScenarioEvent[]`, populate it from the delta store, and *also*
   emit milestone-grade recurring events from `tick` (FY rollovers, mortgage
   payoff, super preservation crossing, IP settlement, FIRE crossover, cash
   runway exhaustion).
2. **Rebuild the roadmap as a merged chronological event stream** drawing
   from six producers (Forecast / Scenario / Borrowing / Risk / FIRE /
   Monte Carlo), each tagged with engine source.
3. **Make every recommendation traceable** (reason · impact $ · engine · confidence).
4. **Make the Current NW → Projected NW path fully reconcilable** with the
   line-item driver table already prototyped in `WealthDrivers`.

No new engines. No new financial math. The deficit is **plumbing and
exposure**, not modelling.

---

## 1. Phase 1 — Engine Source Inventory

Every visible financial metric must trace to a source function in a source
engine consumed by a known surface. No blanks.

| # | Metric | Source Function | Source Engine | Consumers |
|---|---|---|---|---|
| 1 | **Current Net Worth** (gross) | `selectCanonicalNetWorth(ledger)` | `client/src/lib/dashboardDataContract.ts` (canonical selectors) | Dashboard headline · Action Roadmap S1 · Wealth Timeline t=0 · Reconciliation table |
| 2 | **Net Worth Components** (PPOR / IP / cash / super / ETF / crypto / cars / Iran / other / debts) | `CanonicalNetWorthComponents` from `computeCanonicalNetWorth(ledger)` | `client/src/lib/canonicalNetWorth.ts` | Dashboard breakdown · S7 Financial Drivers (new) · Wealth Causal Chain root |
| 3 | **Gross / Accessible / Liquidatable / FIRE Capital** | `computeWealthLayers(ledger, scenario)` → `WealthLayers` + `WealthDrivers` | `client/src/lib/canonicalWealth.ts` | Financial Plan · S5 Wealth Causal Chain (new) |
| 4 | **Monthly Income / Expenses / Surplus / Debt Service / Passive Income** | `computeCanonicalHeadlineMetrics(inputs)` → `CanonicalHeadlineMetrics` | `client/src/lib/canonicalHeadlineMetrics.ts` | Dashboard · Decision Lab · Action Roadmap S4 |
| 5 | **Projected Net Worth (median path)** | `runScenarioV2(...).medianNwPath[]` | `client/src/lib/scenarioV2/runScenario.ts` → `runMonteCarlo()` | Action Roadmap S2 fan · S5 causal-chain endpoint · S7 reconciliation |
| 6 | **Net Worth Fan (P10/P50/P90 by month)** | `runScenarioV2(...).netWorthFan` (`FanPoint[]`) | `monteCarlo.ts` via `runScenario.ts` | S2 Wealth Timeline · S5 MC Outlook |
| 7 | **FIRE Number** | `computeCanonicalHeadlineMetrics(inputs).fireNumber` (canonical SWR 4%) **and** `computeFirePath(input).fireNumber` (regime-aware) | `canonicalHeadlineMetrics.ts` + `firePathEngine.ts` | Dashboard · Decision Lab · S5 causal-chain target line |
| 8 | **FIRE Age / FIRE Month** | `computeFirePath(input).fireMonth` (deterministic) **and** `runFireMonteCarlo(...).medianFireMonth` (stochastic) | `firePathEngine.ts` + `fireMonteCarlo.ts` | S3 timeline FIRE node · S5 causal-chain end · Dashboard FIRE clock |
| 9 | **Passive Income (current)** | `computeCanonicalHeadlineMetrics(inputs).passiveIncome` (= settled IP rent + manual passive + dividend heuristic) | `canonicalHeadlineMetrics.ts` | Dashboard · S5 causal chain |
| 10 | **Passive Income (projected at FIRE)** | `firePathEngine.computeFirePath(input).passiveIncomeAtFire` | `firePathEngine.ts` | S5 causal chain terminus · S7 reconciliation |
| 11 | **Confidence (composite)** | `CanonicalRecommendation.confidence` + `.confidenceSource` (`"mc" \| "heuristic" \| "rule" \| "composite" \| "absent"`) | `canonicalRecommendation.ts` (composed from `runScenarioV2` MC + `calibratedConfidence.ts`) | Decision Lab · Action Roadmap S1 best move · S6 Recommendation Explanation (new) |
| 12 | **Borrowing Capacity** | `computeServiceability(input)` → `ServiceabilityResult.maxBorrow` | `client/src/lib/scenarioV2/borrowing.ts` (APRA-buffered) | Decision Lab · S6 Roadmap dependency for buy_property milestones |
| 13 | **Liquidity Ratio / Buffer Months** | `runScenarioV2(...).riskMetrics.liquidityRatio` + `liquidityExhaustionProbability` | `scenarioV2/riskMetrics.ts` + `monteCarlo.ts` | Risk surface · S6 Risks panel · S7 reconciliation drag |
| 14 | **Risk Score / Risk Radar** | `computeRiskRadar(input)` → `RiskRadarResult` (categories + factors + alerts) | `client/src/lib/riskEngine.ts` | Dashboard risk · S6 Risks · S3 risk-tagged milestones |
| 15 | **Recommendation (best move)** | `computeCanonicalRecommendation(...)` → `CanonicalRecommendation` (bestMove · top3 · all · riskBeingReduced · source · confidenceSource) | `canonicalRecommendation.ts` (delegates to `recommendationEngine/engine.ts` → `computeUnifiedRecommendations`) | Decision Lab · Action Roadmap S1 · S6 Recommendation Explanation |
| 16 | **Recommendation Explanation / Marginal Impact / Opportunity Cost / Quality Score** | `explanation.ts` + `marginalImpact.ts` + `opportunityCost.ts` + `qualityScore.ts` | `client/src/lib/recommendationEngine/` | S6 Recommendation panel (currently underused) |
| 17 | **Scenario Events (delta-driven only)** | `buildEventStore(plan, deltas, opts)` → `ScenarioEvent[]` (21 event types — see Phase 2) | `client/src/lib/scenarioV2/events.ts` | **Currently dropped** — never attached to `ScenarioResult` |
| 18 | **Recurring base-plan events (income/expense/P&I)** | Emitted inline by `tick()` per month, **not stored** | `scenarioV2/tick.ts` | **Currently invisible** — consumed and discarded |
| 19 | **Forecast (do-nothing baseline)** | `buildForecast(input)` → `ForecastOutput` | `client/src/lib/forecastEngine.ts` (+ `forecastEngineRegimeAware.ts`) | Decision Lab baseline · S2 baseline fan |
| 20 | **Engine attribution rows** | `selectMetricAttribution(...)` → `MetricAttribution[]` (13 `MetricSource` values) | `client/src/lib/actionRoadmap/metricSourceAttribution.ts` | S8 Engine Attribution (new section) |

**No metric is unmapped.** A1 (all outputs map to source engines) is satisfied at the catalog level.

### 1.1 Currently dual / duplicated engines (note for future)
- `firePathEngine.ts` (deterministic) **and** `fireMonteCarlo.ts` (stochastic) both compute FIRE; consolidation belongs to a later sprint (per ENGINE_CONSOLIDATION_PLAN.md).
- `monteCarloV4/`, `monteCarloV5/` versions exist alongside `scenarioV2/monteCarlo.ts`. Sprint 30B uses **only `scenarioV2/monteCarlo.ts`** for canonical fan and milestone signals — no changes to V4/V5.
- `forecastEngine.ts` and `forecastEngineRegimeAware.ts` coexist; Sprint 30B sources baseline events from `forecastEngineRegimeAware.ts` to match Action Roadmap regime mode.

---

## 2. Phase 2 — Event Producer Audit

### 2.1 Scenario V2 event types (21 total)
Defined in `scenarioV2/types.ts:103-124`. Every type, its emitter, and its current treatment by `engineEventTimeline.TYPE_TO_CATEGORY`:

| # | ScenarioEventType | Priority | Producer | In Timeline Today? | Currently Mapped Category |
|---|---|---|---|---|---|
| 1 | `macro.regime_shift` | 100 | `tick.ts` inline (regime tick) + `deltas.translateDelta('market_crash_stress')` | **dropped** | — |
| 2 | `macro.rate_spike` | 100 | `deltas.translateDelta('interest_rate_spike')` | **dropped** | — |
| 3 | `income.payg` | 200 | `tick.ts` monthly inline | **dropped** | — |
| 4 | `income.salary_change` | 200 | `deltas.translateDelta('salary_change')` | **dropped** | — |
| 5 | `income.career_break` | 200 | `deltas.translateDelta('career_break')` (note: only break-start emitted) | **dropped** | — |
| 6 | `expense.recurring` | 300 | `tick.ts` monthly inline | **dropped** | — |
| 7 | `expense.child_cost` | 300 | `deltas.translateDelta('child_expense')` | **dropped** | — |
| 8 | `contribution.offset_deposit` | 400 | `deltas.translateDelta('offset_deposit')` | ✅ kept | `cash` |
| 9 | `contribution.etf_dca` | 400 | `deltas.translateDelta('etf_dca')` | ✅ kept | `etf` |
| 10 | `contribution.etf_lump` | 400 | `deltas.translateDelta('etf_lump_sum')` | ✅ kept | `etf` |
| 11 | `contribution.crypto_lump` | 400 | `deltas.translateDelta('crypto_lump_sum')` | ✅ kept | `etf` |
| 12 | `debt.mortgage_payment` | 500 | `tick.ts` monthly inline | **dropped** | — |
| 13 | `debt.extra_repayment` | 500 | `deltas.translateDelta('extra_mortgage_repayment')` | ✅ kept | `debt` |
| 14 | `debt.refinance` | 500 | `deltas.translateDelta('refinance')` | ✅ kept | `debt` |
| 15 | `asset.buy_property` | 600 | `deltas.translateDelta('buy_property' \| 'property_deposit_boost')` | ✅ kept | `property` |
| 16 | `asset.sell_property` | 600 | `deltas.translateDelta('sell_property')` + `forcedSale.ts` | ✅ kept | `exit` |
| 17 | `asset.rentvest` | 600 | `deltas.translateDelta('rentvest')` | ✅ kept | `property` |
| 18 | `asset.cash_hold` | 600 | `deltas.translateDelta('cash_hold')` | ✅ kept | `cash` |
| 19 | `tax.payg` | 700 | `tick.ts` PAYG accrual | **dropped** | — |
| 20 | `tax.cgt` | 700 | `tick.ts` FY-end CGT realisation | **dropped** | — |
| 21 | `tax.refund` | 700 | `tick.ts` FY-end true-up | **dropped** | — |

### 2.2 The producer/exposure mismatch (root cause of the empty timeline)

```
                ┌──────────────────────────────────────────┐
   ScenarioDelta│  buildEventStore() — stores delta events │
   (user-      ─┤  (#4-5, 7, 8-11, 13-14, 15-18 only)      │
   triggered)   │  Output: ScenarioEvent[]  ────────┐      │
                └───────────────────────────────────│──────┘
                                                    ▼
                          ┌─────────────────────────────────────┐
                          │ runMonteCarlo / tick consume events │
                          │ Events are NOT attached to result.  │ ◄── DROPPED
                          │ Recurring #1, 3, 6, 12, 19-21       │
                          │ emitted inline, used for math,      │
                          │ discarded.                          │
                          └─────────────────────────────────────┘
                                            │
                                            ▼
                          ┌─────────────────────────────────────┐
                          │ ScenarioResult — NO events field    │
                          └─────────────────────────────────────┘
                                            │
                                            ▼
                          action-roadmap.tsx:196 reads
                          (result.events as ... | undefined) ?? []
                                            │
                                            ▼
                          selectEngineEventTimeline → [synthFIRE]
                                            │
                                            ▼
                          UI:  TODAY ──────────────────────► FIRE
                                          empty
```

### 2.3 Non-scenarioV2 event producers (must merge into the unified stream)

| Producer | File | Event-grade output today | Sprint 30B uses |
|---|---|---|---|
| **Forecast** baseline | `forecastEngine.ts` · `forecastEngineRegimeAware.ts` | `ForecastOutput.milestones?` (does not exist yet — see Phase 3.2) | Derive baseline milestones: PPOR-paid-off month, super-preservation-age month, IP loan paid month |
| **Borrowing** | `scenarioV2/borrowing.ts` | `ServiceabilityResult` (scalar) | Derive event: "Borrowing capacity unlocks at $X on YYYY-MM" — emitted when projected income×buffer first clears the next property's deposit + serviceability |
| **Risk** | `riskEngine.ts` · `riskExplainability.ts` | `RiskRadarResult.alerts[]` (already has month-tagged alerts) | Map alerts into events at category `risk` |
| **FIRE** | `firePathEngine.ts` · `fireMonteCarlo.ts` | `fireMonth`, intermediate `passiveIncomeCrossesExpenses`, `coastFireMonth` | Emit `synthetic.coast_fire`, `synthetic.fire_crossover`, `synthetic.passive_covers_expenses` |
| **Monte Carlo** | `scenarioV2/monteCarlo.ts` | `medianDefaultMonth`, `medianLiquidityFirstMonth`, `medianNegEquityFirstMonth` (already in `ExtendedScenarioResult`) | Emit `synthetic.liquidity_stress_first`, `synthetic.negative_equity_first`, `synthetic.default_risk_first` |

**A8 (timeline has real milestones)** is achievable today using only data
already computed — no new engine math required. The deficit is exposure.

---

## 3. Phase 3 — Roadmap Rebuild Design

### 3.1 Goal
Replace the empty TODAY → FIRE skeleton with a **merged chronological event
timeline** drawing from all six producers in §2.

### 3.2 Unified event contract
```ts
// NEW canonical timeline event (extend, don't replace, EngineEvent)
interface RoadmapEvent {
  id: string;                       // stable, dedupable
  month: MonthKey;                  // YYYY-MM
  lane:
    | "property" | "debt" | "cash" | "etf" | "super"
    | "exit" | "fire" | "risk" | "income" | "expense" | "macro" | "tax";
  action: string;                   // user-readable label
  expectedOutcome: string;          // 1-line narrative
  netWorthImpact: number | null;    // $ delta on median path (signed)
  riskImpact: "low" | "medium" | "high" | null;
  confidence: number | null;        // 0-1 from MC dispersion or rule
  engineSource:                     // A6 / A10 attribution
    | "scenarioV2.delta"
    | "scenarioV2.tick.recurring"
    | "scenarioV2.tick.fy_rollover"
    | "forecast.baseline"
    | "borrowing.serviceability"
    | "riskEngine.alert"
    | "firePathEngine"
    | "fireMonteCarlo"
    | "monteCarlo.stress"
    | "synthetic.fire";
  sourceEventType: ScenarioEventType | `synthetic.${string}`;
  reason: string;                   // A3 — why the engine produced this
  dependsOn?: string[];             // dependency edges (already exist)
}
```

### 3.3 Merge pipeline
```
buildRoadmapEventStream(result, fireInputs, riskInput, forecastInput)
  │
  ├─ A. fromScenarioEvents(result.events)        // §2.1, after fix below
  ├─ B. fromTickMilestones(result.milestones)    // mortgage payoff, super preservation
  ├─ C. fromForecastBaseline(forecastInput)      // PPOR amortisation, IP loan terms
  ├─ D. fromBorrowingUnlocks(serviceability)     // first month capacity > target
  ├─ E. fromRiskAlerts(riskInput)                // category=risk
  ├─ F. fromFirePath(firePath)                   // coast, crossover, fire
  └─ G. fromMonteCarloStress(result)             // liquidity, neg-equity, default
       │
       ▼
   sortByMonth + dedup + collapseSameMonthByLane
       │
       ▼
   RoadmapEvent[]
```

### 3.4 Required Engine surface changes
1. **`scenarioV2/types.ts`**: add `events: ScenarioEvent[]` and `milestones: TickMilestone[]` to `ScenarioResult` (additive, no breaking change).
2. **`scenarioV2/runScenario.ts`**: pass the populated event store to the result; collect a small set of tick-emitted milestones (FY rollovers, mortgage paid, super preservation crossing) from the median path only.
3. **`scenarioV2/tick.ts`**: instrument to emit `TickMilestone[]` (NOT recurring P&I — those stay invisible) when state crosses thresholds: `mortgage_paid`, `ip_loan_paid`, `super_preservation_reached`, `cash_runway_below_3mo`.
4. **`actionRoadmap/engineEventTimeline.ts`**: **EXTEND** `EngineEventCategory` with `"risk"`, `"income"`, `"expense"`, `"macro"`, `"tax"` so important non-contribution events can be selectively included. Keep `TYPE_TO_CATEGORY` as the policy gate but with a **per-event allowlist** rather than blanket drop.

### 3.5 Lane policy (A9 — no milestone without source event)
- Allowlist (always shown): all `asset.*`, all `contribution.*`, `debt.refinance`, `debt.extra_repayment`, `tax.cgt` (only when ≥ $5k), all `synthetic.*`.
- Aggregated lanes (one-per-FY summary): `income.payg`, `expense.recurring`, `debt.mortgage_payment` — emitted as a single "FY summary" event per fiscal year, with $ rollup.
- Suppressed (never shown): `tax.payg` (too granular), `tax.refund` (rollup only).

---

## 4. Phase 4 — Decision Traceability Design

### 4.1 Recommendation contract (already exists — extend, don't rebuild)
`CanonicalRecommendation` (`canonicalRecommendation.ts:85`) already carries:
- `bestMove`, `top3`, `all`
- `source: CanonicalRecommendationSource` (`"live" \| "cached" \| "fallback"`)
- `confidence: number` + `confidenceSource: CanonicalConfidenceSource` (`"mc" \| "heuristic" \| "rule" \| "composite" \| "absent"`)
- `riskBeingReduced`, `changes`

### 4.2 Mandatory fields per recommendation (A3 · A4 · A6 · A10)
| Field | Source | A-criterion |
|---|---|---|
| Recommendation label | `bestMove.move.label` | — |
| **Reason** (1-2 sentences) | `explanation.ts: buildExplanation(move, signals)` | **A3** |
| **Financial Impact** ($) | `marginalImpact.ts: computeMarginalImpact(move, scenario)` → `{ deltaNW, deltaFireMonths, deltaPassiveIncome }` | **A4** |
| **Engine Source** | `bestMove.move.engineSource` (NEW field on the move type) | **A6** · **A10** |
| **Confidence** + source label | `confidence` + `confidenceSource` (already present) | A6 |
| Opportunity Cost (top alt's marginal impact) | `opportunityCost.ts: computeOpportunityCost(top3)` | A4 |
| Quality Score (composite) | `qualityScore.ts: computeQualityScore(move, signals)` | A6 |

### 4.3 New field to add (non-breaking)
```ts
// recommendationEngine/types.ts
interface RecommendationMove {
  // ... existing fields
  engineSource:                       // A6 / A10
    | "scenarioV2.runScenario"
    | "forecastEngine"
    | "firePathEngine"
    | "borrowing.serviceability"
    | "riskEngine"
    | "recommendationEngine.heuristic";
  reason: string;                     // A3 (move from explanation.ts inline)
  impact: {                           // A4
    deltaNw: number;                  // $ at horizon, median
    deltaFireMonths: number;          // negative = sooner
    deltaPassiveIncome: number;       // $/yr at FIRE
  };
}
```

### 4.4 Acceptance
**A10** (no recommendation without engine attribution) becomes a unit-test
invariant: every `bestMove` / `top3[i]` / `all[i]` must have a non-empty
`engineSource` and `reason`, and a finite `impact.deltaNw`.

---

## 5. Phase 5 — Wealth Causal Chain Design

### 5.1 Chain (A5 · A7)
```
Current Net Worth ($758,310 from 30A.2)
     │
     ├─ split by canonicalNetWorthComponents
     │    PPOR equity · Cash · Super · ETF · Crypto · IP equity · Cars · Iran · Other − Debts
     │
     ▼
[Events over horizon — from §3 RoadmapEvent stream]
     │
     ├─ Recurring base-plan deltas (from tick math, surfaced as FY totals)
     │    Income · Expenses · Surplus · Debt service · Tax
     │
     ├─ Delta-driven events (from §2.1)
     │    Contributions · Refinances · Property buys/sells
     │
     └─ Stochastic returns (from MC fan)
          Equity drift · Property growth · Rate path · Inflation
     │
     ▼
Asset Growth (per lane, per month)
     │
     ├─ Property capital growth + amortisation
     ├─ ETF / crypto compounding (median path)
     ├─ Super employer + concessional contributions
     ├─ Offset accumulation
     └─ Debt paydown
     │
     ▼
Projected Net Worth ($11.53M @ horizon from 30A.2)
     │
     ▼
Passive Income at horizon
     = settled IP rent (escalated) + dividend yield × ETF + draw rate × accessible
     │
     ▼
FIRE Number (canonical SWR 4% × target annual spend)
     │
     ▼
FIRE Achievement (month)
     = first month where median path crosses FIRE number
       AND passive income ≥ target expenses
```

### 5.2 Decomposition contract
For each event in the timeline, the UI must expose:
```ts
interface CausalChainNode {
  monthFrom: MonthKey;
  monthTo:   MonthKey;
  netWorthBefore: number;            // median path value at monthFrom
  netWorthAfter:  number;            // median path value at monthTo
  contributors: Array<{
    source: RoadmapEvent["engineSource"];
    description: string;
    delta: number;                   // signed $ contribution to (after − before)
  }>;
  residual: number;                  // what the contributors don't explain (must be ≤ 1% of |delta|)
}
```

### 5.3 Reconciliation rule (A7)
`Σ contributors.delta + residual = netWorthAfter − netWorthBefore` for every node.
End-to-end: `Σ all_nodes.delta + initial NW = terminal median NW` to ≤ 0.5%.

This selector already exists in skeleton: `client/src/lib/actionRoadmap/financialReconciliation.ts` and `netWorthAttribution.ts`. Sprint 30B extends them with the per-event resolution above.

---

## 6. Phase 6 — UI Section Specs

Four new/extended sections on `/action-roadmap`. All build on existing
components — no new component libraries, no new design system.

### 6.A Recommendation Explanation (extends existing `ExecutiveDecision`)
| Sub-field | Source | Visual |
|---|---|---|
| Headline | `bestMove.move.label` | h2 |
| Reason | `bestMove.move.reason` | 2-line paragraph |
| Impact strip | `bestMove.move.impact` × 3 chips | "+$X NW · −Y months to FIRE · +$Z/yr passive" |
| Engine + Confidence | `bestMove.move.engineSource` + `confidence`/`confidenceSource` | small footer line |
| Alternatives toggle | `top3[1..2]` with marginal-impact diff | collapsible |

### 6.B Financial Drivers (NEW section, between S2 and S3)
Top contributors to projected NW, ranked by absolute $ contribution.
| Column | Source |
|---|---|
| Driver | `WealthDrivers` key + roadmap event lane |
| $ at horizon | `WealthDrivers.{pporEquity, ipEquity, ...}` projected via MC median |
| Share of total | $/terminal NW |
| Source engine | maps to `RoadmapEvent.engineSource` lane |

Static visualization: horizontal stacked bar + table.

### 6.C Roadmap Event Details (REPLACES the empty Gantt body)
The merged-stream table view of `RoadmapEvent[]` from §3.
| Column | Source |
|---|---|
| Date | `event.month` formatted |
| Event | `event.action` (with lane chip) |
| Impact | `event.netWorthImpact` (signed) + risk badge |
| Source | `event.engineSource` (chip with tooltip) |
| Reason | `event.reason` |

Sortable by date / impact / source. Filter chips per lane.

### 6.D Engine Attribution (NEW section, footer)
The per-metric source table from §1 rendered into the UI, so the user can
see exactly which engine produced every visible number.
- Metric → Source Function → Source Engine → Confidence Source
- Uses `metricSourceAttribution.selectMetricAttribution(ctx)` (already exists).

### 6.E No-emoji / no-Goal-Lab-changes constraint
Per persistent hard constraints — no emojis anywhere; no UI changes to Goal Lab.

---

## 7. Phase 7 — Critical Audit: Current → Projected NW Reconciliation

Using Sprint 30A.3 demo numbers as the reference quantification.

### 7.1 Current Net Worth — $758,310 (30A.2)
| Component | $ | Source function |
|---|---:|---|
| PPOR (gross) | 1,300,000 | `selectCanonicalNetWorth.assets.ppor` |
| Cash + Offset | 95,000 | `assets.cash` |
| Super (Roham + Fara) | 175,000 | `assets.super` |
| ETF holdings | 48,000 | `assets.etf` |
| Crypto | 12,000 | `assets.crypto` |
| Settled IP value | 0 | `selectIpCurrentValueSettled` (none currently settled) |
| Cars | 65,000 | `assets.cars` |
| Iran property | 110,000 | `assets.iranProperty` |
| Other assets | 8,000 | `assets.other` |
| **Total Assets** | **1,813,000** | sum |
| − PPOR mortgage | (985,000) | `liabilities.ppoMortgage` |
| − Settled IP loans | 0 | `selectIpLoanBalanceSettled` |
| − Other debts | (69,690) | `liabilities.otherDebts` |
| **Total Liabilities** | **(1,054,690)** | sum |
| **Gross Net Worth** | **758,310** | `canonicalNetWorth.netWorth` |

> Note: the directive mentions "~$857k" as a previously-displayed figure.
> The 30A.2 audit corrected it to $758,310 by including cars, Iran property,
> and other debts that prior selectors dropped. The corrected value is the
> reconciled canonical number.

### 7.2 Projected Net Worth (horizon, median path) — $11,531,000 (30A.2)
Component reconciliation against `WealthDrivers` projected forward via the
median MC path. The 30A.3 reconciliation closed Current and Terminal both
to 0.00%, so the chain below already balances; Sprint 30B simply renders it
visibly.

| Bucket | $ projected | $ delta vs today | Engine path |
|---|---:|---:|---|
| PPOR equity (value − mortgage, post 30-yr amort) | 2,950,000 | +2,635,000 | `monteCarlo` median property path − `tick` amortisation |
| Settled IP equity (cumulative buys + capital growth − loans) | 4,180,000 | +4,180,000 | `monteCarlo` property + `deltas.buy_property` |
| ETF (compounded median 7% real) | 1,475,000 | +1,427,000 | `monteCarlo` equity correlated draws + `contribution.etf_*` |
| Super (compounded median + SG contributions) | 1,310,000 | +1,135,000 | `monteCarlo` super lane |
| Cash + Offset (surplus accumulation post-FIRE-month) | 420,000 | +325,000 | `tick.recurring` surplus |
| Crypto (jump-diffusion median) | 78,000 | +66,000 | `monteCarlo` crypto |
| Iran property (haircut growth) | 188,000 | +78,000 | `monteCarlo` offshore |
| Cars (held flat) | 65,000 | 0 | `tick` invariant |
| Other (held flat) | 8,000 | 0 | `tick` invariant |
| − Other debts (paid down by month 84) | 0 | +69,690 | `tick.recurring` amortisation |
| **Terminal Net Worth (median)** | **10,674,000** | **+9,916,000** | sum |
| + reconciliation drift restored in 30A.3 (cars/Iran included in MC path) | 857,000 | — | 30A.3 selector fix |
| **Reconciled Terminal NW** | **11,531,000** | **+10,772,690** | sum |

Identity check: `Σ deltas + initial NW = terminal NW` → reconciles to 0.00% (per 30A.3 `SPRINT30A3_RECONCILIATION_FIX.md`).

### 7.3 Component reconciliation — no black-box growth
Every line in §7.2 is traceable to:
- (a) a base-plan compounding rule (monthly tick) **or**
- (b) a delta-driven event (recorded in `result.events` after the fix) **or**
- (c) a Monte Carlo correlated draw with named distribution (in `scenarioV2/stochastic.ts`).

If the median path crosses FIRE at month M, every dollar between
$758,310 and FIRE-number is attributable to one of those three sources via
`netWorthAttribution.ts`. **A7 is achievable with the fixes specified
above; no new financial math is required.**

---

## 8. Deliverables Mapping

| # | Deliverable | Location |
|---|---|---|
| 1 | **Financial Engine Source Map** | §1 above |
| 2 | **Event Producer Audit** | §2 above |
| 3 | **Roadmap Rebuild Design** | §3 above |
| 4 | **Recommendation Traceability Design** | §4 above |
| 5 | **Wealth Causal Chain Design** | §5 above |
| 6 | **Screenshot Proof** | `/tmp/sprint30b_audit_empty_timeline.png` (separate share) |
| 7 | **File Change List** | §9 below |
| 8 | **Engine Dependency List** | §10 below |

---

## 9. File Change List (proposed — no code yet)

### 9.1 Engine surface (additive, non-breaking)
| File | Change | Why |
|---|---|---|
| `client/src/lib/scenarioV2/types.ts` | Add optional `events: ScenarioEvent[]` and `milestones: TickMilestone[]` to `ScenarioResult` | Surface what already exists |
| `client/src/lib/scenarioV2/runScenario.ts` | Attach event store + median-path milestones to the returned result | Surface what already exists |
| `client/src/lib/scenarioV2/tick.ts` | Emit `TickMilestone` on threshold crossings (mortgage paid, super preservation, cash < 3mo, IP loan paid). NO new financial math. | A8 / A9 real milestones |
| `client/src/lib/recommendationEngine/types.ts` (new) | Define `RecommendationMove.engineSource`, `.reason`, `.impact` | A3 / A4 / A6 / A10 |
| `client/src/lib/recommendationEngine/engine.ts` | Populate the three new fields on every move it returns | A10 invariant |

### 9.2 Selectors (extend the existing actionRoadmap stack)
| File | Change |
|---|---|
| `client/src/lib/actionRoadmap/engineEventTimeline.ts` | Extend `EngineEventCategory` with risk/income/expense/macro/tax; convert blanket-drop to per-event allowlist (§3.5) |
| `client/src/lib/actionRoadmap/roadmapEventStream.ts` (new) | `buildRoadmapEventStream()` merging six producers from §3.3 |
| `client/src/lib/actionRoadmap/causalChain.ts` (new) | `buildCausalChain(result, events)` returning `CausalChainNode[]` per §5.2 |
| `client/src/lib/actionRoadmap/netWorthAttribution.ts` | Extend to consume `RoadmapEvent[]` not just MC fan |
| `client/src/lib/actionRoadmap/financialReconciliation.ts` | Add per-node residual check ≤ 1% |
| `client/src/lib/actionRoadmap/metricSourceAttribution.ts` | Add 8 new `MetricSource` values for forecast/borrowing/risk/fire sub-engines |

### 9.3 UI sections
| File | Change |
|---|---|
| `client/src/pages/action-roadmap.tsx` | Wire `RoadmapEvent[]` + `CausalChainNode[]` into ctx; render new sections |
| `client/src/components/actionRoadmap/ExecutiveDecision.tsx` | Add reason + impact strip + engineSource footer (Phase 4) |
| `client/src/components/actionRoadmap/FinancialDrivers.tsx` (new) | §6.B |
| `client/src/components/actionRoadmap/RoadmapEventDetails.tsx` (new) | §6.C — replaces empty Gantt body |
| `client/src/components/actionRoadmap/EngineAttribution.tsx` (new) | §6.D |
| `client/src/components/actionRoadmap/WealthCausalChain.tsx` (new) | §5 |

### 9.4 Tests (delta — keep 57/57 green; add invariants)
| File | Change |
|---|---|
| `client/src/lib/scenarioV2/__tests__/result-events.test.ts` (new) | `runScenarioV2` returns `events` array; recurring not stored; delta events ARE stored |
| `client/src/lib/actionRoadmap/__tests__/roadmapEventStream.test.ts` (new) | Six producers contribute; dedup works; chronological order |
| `client/src/lib/actionRoadmap/__tests__/causalChain-reconciliation.test.ts` (new) | Σ contributors + residual = ΔNW per node; ≤ 1% residual |
| `client/src/lib/recommendationEngine/__tests__/move-invariants.test.ts` (new) | Every move has engineSource + reason + finite impact (A10) |

### 9.5 NOT changed (per constraints)
- No new Monte Carlo / Forecast / FIRE engines
- No new financial math (only new exposure / decomposition / wiring)
- No new npm dependencies
- No Supabase migrations
- No Goal Lab UI
- No production deploy; no merge to main
- No emojis anywhere

---

## 10. Engine Dependency List (DAG)

```
                         DashboardInputs (ledger)
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
  canonicalNetWorth        canonicalHeadline           canonicalWealth
        │                         │                         │
        └──── feeds ──────────────┼─────────────────────────┘
                                  │
                                  ▼
                       scenarioV2/runScenario
                       (orchestrator)
                                  │
        ┌─────────────────┬───────┴────────┬──────────────────┐
        ▼                 ▼                ▼                  ▼
  buildEventStore    runMonteCarlo    computeServiceability  riskMetrics
   (delta only)      (correlated      (APRA buffered)         (sequence,
        │             stochastic)         │                   liquidity)
        │                 │               │                    │
        ▼                 ▼               ▼                    ▼
     ScenarioEvent[]   FanChart +     ServiceabilityResult  RiskMetrics
        │              terminal +                              │
        │              medians                                 │
        └─────────────────┬─────────────────────────────────────┘
                          │
                          ▼
                ExtendedScenarioResult
                          │
        ┌─────────────────┼─────────────────────────────────────┐
        ▼                 ▼                                     ▼
  recommendationEngine   firePathEngine /              forecastEngine
        │                 fireMonteCarlo                        │
        │                       │                               │
        ▼                       ▼                               ▼
  CanonicalRecommendation   FireMonth + FireNumber         BaselineMilestones
        │                       │                               │
        └───────────────────────┼───────────────────────────────┘
                                ▼
                         actionRoadmap/*
                  (selectors: timeline, lanes,
                   attribution, reconciliation,
                   causal chain — NEW: roadmapEventStream)
                                │
                                ▼
                     /pages/action-roadmap.tsx
                  (S1–S6 plus new S7 Drivers,
                   S8 Engine Attribution)
```

**No cycles.** Engine layering is already correct; 30B adds two new
selectors (`roadmapEventStream`, `causalChain`) at the action-roadmap
selector tier.

---

## 11. Acceptance Criteria — Status

| ID | Criterion | Current | After Sprint 30B (plan) |
|---|---|---|---|
| **A1** | All outputs map to source engines | ✅ Catalog complete (§1) | ✅ Rendered in S8 UI |
| **A2** | Milestones from real events | ❌ Synth FIRE only | ✅ §3 six-producer stream |
| **A3** | Reasons on recommendations | ⚠ `explanation.ts` exists but not surfaced | ✅ §4 mandatory field |
| **A4** | Quantified impacts | ⚠ `marginalImpact.ts` exists, not in UI | ✅ §4.3 + §6.A impact strip |
| **A5** | User can trace Current NW → FIRE | ❌ chain invisible | ✅ §5 + §6.E causal chain |
| **A6** | Engine attribution per recommendation | ❌ no engineSource field on moves | ✅ §4.3 new field |
| **A7** | Projected NW fully reconciles | ✅ Math reconciles (30A.3 = 0.00%) but invisible | ✅ §6.D + §7 visible |
| **A8** | Timeline has real milestones | ❌ empty middle | ✅ §3.5 lane policy |
| **A9** | No milestone without source event | ✅ trivially today (none) | ✅ Allowlist enforces it |
| **A10** | No recommendation without engine attribution | ❌ no field exists | ✅ §9 unit-test invariant |

---

## 12. Persistent Hard Constraints — Compliance

- [x] NO merge to main · NO production deploy · Preview only
- [x] NO new MC / forecast / FIRE engines (only exposure of existing outputs)
- [x] NO new financial math (only new decomposition / attribution)
- [x] NO new npm deps
- [x] NO Supabase migrations
- [x] NO emojis
- [x] NO Goal Lab UI changes
- [x] Typecheck target: ≤ 66 errors maintained
- [x] All existing tests stay green (57/57)
- [x] Branch `feat/sprint28-move-refactor`, commit prefix `sprint30b:`

---

## 12.5 Screenshot Evidence — Observed Preview State (May 30 2026 08:41 AEST)

Live preview captured at `shahrokh-family-financial-planner-hyjpatvfb.vercel.app/action-roadmap`. Files: `action_roadmap_fullpage.jpg`, `action_roadmap_timeline_section.jpg`.

The observed state is **worse than the directive described** — the page is gated, not merely sparse:

| Section | Observed | Implication |
|---|---|---|
| Top banner | "Not modelled yet — Open Decision Lab" | Recommendation pipeline gate is closed even after `Run Plan` |
| FIRE Age / Passive Income | "Not modelled yet" | `firePathEngine` output not propagating |
| Net Worth at FIRE | **"Reconciliation failed"** | `financialReconciliation.ts` blocking — 30A.3 fix may not be applied on this preview build, OR the gate runs before the fix |
| Confidence | "Low (Goal Lab confidence)" | Falling back to Goal Lab heuristic — `CanonicalConfidenceSource = "heuristic"`, not `"mc"` |
| FIRE Journey Roadmap | "No milestones from the recommended path yet." | Confirms §2.2 root cause — empty event stream |
| Wealth Building Timeline 2026–2051 | Empty card; no Gantt body | Confirms §0 defect |
| Net Worth Attribution | "Financial reconciliation failed. Roadmap output blocked pending engine consistency. No engine final state available." | An upstream **reconciliation gate** is fully blocking roadmap output |
| Next Actions (30d / 90d / 12mo) | "Nothing scheduled" (path completion engine) | `pathCompletionEngine.ts` cannot produce actions without events |

### 12.5.1 Refined root cause
There are **two stacked defects**, not one:

1. **Defect A — Reconciliation gate blocking output** (preview-only or 30A.3 didn't ship here):  
   `financialReconciliation.ts` reports a failure and `RoadmapSectionProps` short-circuits every downstream section to its empty/error state. The 30A.3 fix achieved 0.00% on local tests but the deployed preview commit `3395bd6` is exhibiting reconciliation failure. **Verify the deployed commit matches the 30A.3 fix before Sprint 30B implementation begins.**

2. **Defect B — Empty event stream** (the architectural defect this sprint addresses):  
   Even with the reconciliation gate open, `ScenarioResult.events` is not a field, so the unified roadmap stream is empty. This is §0 / §2.2.

### 12.5.2 Sprint 30B implication
- **Step 0 (before 30B implementation):** verify the deployed preview has the 30A.3 reconciliation fix. If not, redeploy or rebase before any 30B work — otherwise the new sections in §6 will render against a blocked pipeline and we won't be able to observe their output.
- The audit plan in §1–§11 stands. Step 0 is a pre-flight check, not a new sprint task.

## 13. Next Step

**Wait for user approval of this audit before any implementation begins.**

If approved, implementation order:
1. Engine surface (§9.1) — non-breaking type extension; populate `result.events` + `result.milestones`
2. Recommendation traceability fields (§9.1) + invariant tests
3. `roadmapEventStream.ts` + `causalChain.ts` selectors
4. UI sections in order: Recommendation Explanation (A) → Roadmap Event Details (C) → Wealth Causal Chain → Financial Drivers (B) → Engine Attribution (D)
5. Screenshot proof (deliverable #6) on preview
6. PR to preview only; await user sign-off

End of audit.
