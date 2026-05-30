# Engine Consolidation Plan — Core Engines

**Status:** DRAFT for user review. No code changes proposed yet.
**Scope:** Monte Carlo · Portfolio Optimizer · Goal Solver · Scenario · Forecast · Decision.
**Out of scope (per user):** Intelligence layer (behavioural, adaptive, autonomousOS, futureWorlds, narrative, executionOS, recommendationEngine, lifePlanning).
**Baseline:** `npm install` ✅ · `npm run check` runs (66-error baseline per docs) · `npm run test:monte-carlo-canonical` 30/32 (2 cosmetic label asserts) · `npm run test:sprint-10` 833/846 (13 SSR-render asserts) — **engine logic is healthy**.

---

## 1 · Executive summary

| # | Family | Files / LoC | Canonical (KEEP) | Legacy / Dead (DEPRECATE) | Risk |
|---|---|---|---|---|---|
| 1 | **Monte Carlo** | 14 files / **8,385 LoC** | `monteCarloEngine` (V3 core) + `monteCarloCanonical` (mapper) + `monteCarloV4` (institutional overlay) + `monteCarloV5` (orchestrator) — **all four together form one stack** | `fireMonteCarlo` (legacy, 1,277 LoC) and `probabilisticWealthEngine` (1,097 LoC) are still imported by GoalSolverPro and pathSim, so they cannot be removed without surgery | High — V4/V5 are additively wrapped around V3; touching V3 changes every output |
| 2 | **Portfolio Optimizer** | 2 files / **3,551 LoC** | `truePortfolioOptimizer` (Sprint 7) | `portfolioLabOptimizer` (Sprint 6 Phase 5) — TPO wraps it, but only for goal-gap pass-through | Medium — TPO calls into PLO, so PLO is structurally a private dependency, not a duplicate |
| 3 | **Goal Solver** | 4 files / **4,114 LoC** | `goalSolver` (Sprint 5 base solver) + `goalSolverPro` (Sprint 10 orchestrator) + `goalSolverView` (UI view-model) | `goalClosureLab` (1,469 LoC) — only used by **2 components** (`GoalClosureLab.tsx`, `GclSixOutputGrid.tsx`) on one route `/goal-closure-lab` | Low — Goal Closure Lab is parallel UX with its own route, fully removable if user retires that page |
| 4 | **Scenario** | 33+ files / **24,135 LoC** | `scenarioV2/*` (entire dir — backbone of Decision Engine) + `scenarioTree/*` (used by FutureWorlds + FinancialOSCentre) | `whatIfEngine` (2,286 LoC) — only caller is `/what-if-scenarios` page, and that page is **NOT in the sidebar** | Low — `whatIfEngine` writes to a separate sandbox table (`sf_scenario_results`) and never touches main ledger |
| 5 | **Forecast** | 6 files / **2,529 LoC** | `forecastEngine` + `forecastStore` (Zustand store) + `doNothingForecast` (Phase B baseline) + `firePathEngine` | `forecastEngineRegimeAware` (392 LoC) and `firePathEngineRegimeAware` (392 LoC) — **ZERO real callers** (only string references in audit-trace metadata) | **None — pure dead code, safe to delete** |
| 6 | **Decision** | 5 files / **8,058 LoC** | `decisionCandidates` (Sprint 5 Phase 2, base candidate generator) + `decisionRanking` + `bestMoveEngineSprint5` + `scenarioV2/decisionEngine/candidateGenerator` (Layer-2 advanced generator) | `bestMoveEngine` (Sprint 3-era V1/V2, 997 LoC) — still imported by `BestMoveCard`, dashboard, `cfoEngine`, and recommendationEngine | Medium — `bestMoveEngine` is the older "Best Move Right Now" surface; Sprint 5's version is structurally different (orchestrator, not synchronous solver) |

**Headline:** the codebase has fewer true duplicates than the surface count suggests. Most "doubles" are **layered**, not redundant. Two clean wins are available immediately:
- **Forecast:** delete two `*RegimeAware.ts` files (784 LoC, zero callers).
- **Scenario:** retire `whatIfEngine.ts` (2,286 LoC) by deprecating the `/what-if-scenarios` page (already removed from sidebar).

---

## 2 · Monte Carlo family — detailed map

### Layering reality (not duplicates)

```
                  ┌──────────────────────────────────────┐
                  │ monteCarloCanonical.ts (312 LoC)     │ ← INPUT MAPPER
                  │ buildCanonicalMonteCarloInput()      │   Single entry point
                  └──────────────────┬───────────────────┘   that builds MCInput
                                     │                       from canonical NW
                                     ▼
                  ┌──────────────────────────────────────┐
                  │ monteCarloEngine.ts (627 LoC)        │ ← V3 CORE
                  │ runMonteCarlo(input)                 │   Asset-class MC engine
                  │ Returns: MonteCarloResult            │   Box-Muller, seeded RNG
                  └──────────────────┬───────────────────┘   Property/Stocks/Crypto/Cash/Super/Debt
                                     │
                  ┌──────────────────┴──────────────────┐
                  │ monteCarloV4/engineV4.ts (467 LoC)  │ ← INSTITUTIONAL OVERLAY
                  │ runMonteCarloV4() → calls V3 then    │   Regime + rates + property cycle
                  │ adds regime/rates/risk/events        │   Returns V3 result + `v4` block
                  └──────────────────┬───────────────────┘
                                     │
                  ┌──────────────────┴──────────────────┐
                  │ monteCarloV5/engineV5.ts (325 LoC)  │ ← ORCHESTRATOR
                  │ runMonteCarloV5() → calls V4 then    │   Adds narrative, household realism,
                  │ adds V5-only blocks                  │   property realism AU, FIRE V2,
                  │                                      │   transparency, preference weights
                  └──────────────────────────────────────┘
```

V5 imports V4 imports V3. All three return the **same `MonteCarloResult` shape** (fan_data, p10/p50/p90, prob_ff). V4 and V5 just append `result.v4` and `result.v5` blocks.

### Callers (verified by grep)

| File | What it calls |
|---|---|
| `pages/ai-forecast-engine.tsx` | V3 + V4 + V5 + canonical mapper — **runs all three side-by-side** for visual comparison |
| `pages/dashboard.tsx` | `buildCanonicalMonteCarloInput` + `runMonteCarloV4` (dashboard projection table) |
| `components/MonteCarloV4Panel.tsx` | V4 types + glossary |
| `components/MonteCarloV5Panel.tsx` | V5 types + labels |
| `components/MonteCarloDashboard.tsx` | `fireMonteCarlo` (NOT V3/V4/V5) — uses the **legacy FIRE-flavoured engine** |
| `scenarioV2/runScenario.ts` | local `scenarioV2/monteCarlo.ts` (a separate scenario-flavoured MC, not V3) |

### The two unconsolidated MC variants (the real problem)

| File | LoC | Role today | Callers |
|---|---|---|---|
| **`fireMonteCarlo.ts`** | 1,277 | "Professional FIRE MC simulation engine" — separate from V3. Has its own `FireMCSettings`, `FireMCResult`, fire-year histogram | `MonteCarloDashboard.tsx`, `pathSimulationEngine.ts`, `goalSolverPro.ts`, audit-trace metadata |
| **`probabilisticWealthEngine.ts`** | 1,097 | Sprint 8 uncertainty engine | `ProbabilisticWealthSection.tsx`, `TruePortfolioOptimizer.tsx`, `GoalSolverProTab.tsx`, `goalSolverPro.ts` |
| **`scenarioV2/monteCarlo.ts`** | (in 24k scenarioV2) | Scenario-local MC | only `scenarioV2/runScenario.ts` |

These three live alongside the V3/V4/V5 stack and are **not** wrappers of it. They are the actual fragmentation surface.

### Canonical ruling — Monte Carlo

- **KEEP:** `monteCarloEngine` (V3 core) · `monteCarloCanonical` (mapper) · `monteCarloV4` (overlay) · `monteCarloV5` (orchestrator). These four files are a single layered stack and must move together.
- **KEEP for now:** `fireMonteCarlo` and `probabilisticWealthEngine` — too deeply wired into Sprint 7/8/10 to remove without breaking the optimizer and Goal Solver Pro. Mark with `@deprecated` JSDoc and target consolidation in a future "MC unification" sprint.
- **KEEP:** `scenarioV2/monteCarlo` — it is a scenario-isolated MC, never crosses into ledger surfaces. Different concern.
- **NO DELETION** in this pass. Risk is too high without a dedicated MC unification sprint and a parity test.

### Deferred work (future sprint, NOT this consolidation)
1. Define one shared MC interface that V3 and `fireMonteCarlo` both implement.
2. Make `probabilisticWealthEngine` a pure post-processor of a `MonteCarloResult` (it already reads results from elsewhere — should not own its own simulation).
3. Add an MC parity test: same inputs → V3 fan_data and `fireMonteCarlo.runFireMonteCarlo` fan_data must reconcile within X%.

---

## 3 · Portfolio Optimizer family

```
TruePortfolioOptimizer (truePortfolioOptimizer.ts, 1,575 LoC)
        │
        ├── reads from canonicalHeadlineMetrics, canonicalFire, goalSolver
        ├── consumes decisionCandidates output
        │
        └── calls into ──► portfolioLabOptimizer.buildPortfolioLabOptimizer()
                                (portfolioLabOptimizer.ts, 1,976 LoC)
                                Pass-through orchestrator over canonical engines
```

### Callers
- **`TruePortfolioOptimizer.tsx`** — primary Portfolio Lab page. Imports BOTH `truePortfolioOptimizer` AND `buildPortfolioLabOptimizer` directly (no façade).
- **`PortfolioLab.tsx`** — older Portfolio Lab component (likely a wrapper). Imports `portfolioLabOptimizer` directly.
- **`decisionEngine/GoalSolverProTab.tsx`** — imports `buildTruePortfolioOptimizer`.

### Canonical ruling — Portfolio Optimizer
- **CANONICAL = `truePortfolioOptimizer` (Sprint 7).** This is the documented advisor-grade engine. Goal Solver Pro and the regression-guard tests pin against it.
- **`portfolioLabOptimizer` is a private dependency of `truePortfolioOptimizer`** (Sprint 6 Phase 5 orchestrator). It is reused by TPO so it cannot be deleted, but it should not be imported directly from UI components.

### Recommended moves
| Step | Action | Risk |
|---|---|---|
| 3.1 | Audit which component-level imports of `portfolioLabOptimizer` are genuinely needed vs. which should go through `truePortfolioOptimizer`. Currently 2 component-level imports: `PortfolioLab.tsx` and `TruePortfolioOptimizer.tsx`. | Low |
| 3.2 | Move `portfolioLabOptimizer` types/exports into the `truePortfolioOptimizer` public façade where possible. | Low |
| 3.3 | Re-classify `portfolioLabOptimizer` as `@internal` in JSDoc; keep file but mark it as a Sprint 7 dependency, not a peer engine. | Zero |
| 3.4 | **Do not delete.** | n/a |

---

## 4 · Goal Solver family

```
goalSolver.ts (578 LoC, Sprint 5 Phase 1)
   ├── solveGoalGap() — primitive single-target gap solver
   │
   ├──► used by: 14 callers (the core building block)
   │      ↓
   ├── goalSolverPro.ts (1,689 LoC, Sprint 10) — pure orchestration over TPO + Sprint 9 + ProbWealth + canonicalFire
   │     └──► used by: TruePortfolioOptimizer.tsx, GoalSolverProSection.tsx, decisionEngine/GoalSolverProTab.tsx
   │     └──► used by: goalSolverView.ts (UI view-model selector)
   │
   ├── goalClosureLab.ts (1,469 LoC, Sprint 6 Phase 4) — PARALLEL orchestrator, different UX
   │     └──► used by: GoalClosureLab.tsx, goal-closure/GclSixOutputGrid.tsx ONLY
   │     └──► fed by /goal-closure-lab page route
   │
   └── goalSolverView.ts (378 LoC) — UI view-model. Adds FireGapSummary, ranked blockers, top-3 actions
         └──► used by: 7+ UI components in portfolio-lab/, decision/
```

### Canonical ruling — Goal Solver
- **CANONICAL = `goalSolver` (primitive) + `goalSolverPro` (orchestrator) + `goalSolverView` (UI selector).**
- **LEGACY = `goalClosureLab`.** It is a parallel orchestrator with its own page (`/goal-closure-lab`) and its own UI components (`GoalClosureLab.tsx`, `GclSixOutputGrid.tsx`). It is NOT a duplicate of `goalSolverPro` — it is a different surface that shares the same primitives.

### Recommended moves
| Step | Action | Risk |
|---|---|---|
| 4.1 | Confirm with user: is `/goal-closure-lab` page still wanted, or has it been superseded by `/portfolio-lab` + `/decision-lab`? Sidebar audit will tell us. | None — clarifying question only |
| 4.2 | **If retired:** delete `goalClosureLab.ts`, `GoalClosureLab.tsx`, `goal-closure/*`, `pages/goal-closure-lab.tsx`, the App.tsx route. Net deletion ≈ 2,500 LoC. | Low — isolated to its own route |
| 4.3 | **If kept:** mark `goalClosureLab.ts` as a sibling surface (not a duplicate). Add a banner comment cross-referencing `goalSolverPro` for shared canonical bits. | None |

---

## 5 · Scenario family

```
ACTIVE backbone (24,135 LoC across scenarioV2/):
   scenarioV2/runScenario.ts — main entry, wraps Monte Carlo + risk + serviceability
   scenarioV2/decisionEngine/candidateGenerator.ts (2,363 LoC) — Layer-2 advanced generator
   scenarioV2/registry/ — Formula Registry (provides all financial math)
   scenarioV2/autonomous/ — Autonomous OS hooks (intelligence layer, OUT OF SCOPE)
   scenarioV2/intelligence/ — Decision intelligence (intelligence layer, OUT OF SCOPE)
   scenarioV2/monteCarlo.ts — scenario-local MC
   scenarioV2/persistence.ts — sf_scenario_results writer
   scenarioV2/quickDecisionPdf.ts — PDF generator
   scenarioV2/pdfReport.ts, narrative.ts, etc.

USED BY: /decision, /decision-lab, /scenario-compare, /scenario-compare-v2, AssumptionsPanel, FutureWorldsPanel, RecommendationLayer, NarrativeReport, StrategyCard, StrategyDeepDive, behaviouralPriorities, intelligence/* — ubiquitous

────────────────────────────────────────────────────────────────────────

scenarioTree/ (4 files: engine.ts, regimes.ts, types.ts, index.ts)
   USED BY: FinancialOSCentre.tsx, FutureWorldsPanel.tsx, futureWorlds/derive.ts
   Purpose: tree-of-life scenario branching (separate concern from scenarioV2)

────────────────────────────────────────────────────────────────────────

whatIfEngine.ts (2,286 LoC) — SANDBOX engine
   USED BY: /what-if-scenarios page ONLY (1 caller)
   Sidebar: NOT LINKED (was removed in Sprint 20 PR-H)
   Writes to: sf_scenarios, sf_scenario_results (sandbox-only tables)
   Hardcoded constants: SUPABASE_URL + anon key embedded in file (security)
```

### Canonical ruling — Scenario
- **CANONICAL = `scenarioV2/*` + `scenarioTree/*`.**
- **LEGACY = `whatIfEngine`.** Single page caller, **not in sidebar** (orphan from Sprint 20). 2,286 LoC. Sandboxed (separate tables, never crosses ledger).

### Recommended moves
| Step | Action | Risk |
|---|---|---|
| 5.1 | Confirm with user: retire `/what-if-scenarios` page? | None — clarifying |
| 5.2 | **If retired:** delete `whatIfEngine.ts`, `pages/what-if-scenarios.tsx`, App.tsx route. Net deletion ≈ 2,300 LoC + 3,511-LoC page file. | **Very low** — sandbox, no ledger impact, sidebar-orphaned |
| 5.3 | **If kept:** migrate `whatIfEngine` to consume `scenarioV2.runScenario` instead of duplicating MC + goal-solver math; remove hardcoded Supabase URL/anon key. | Medium |
| 5.4 | **Independent action:** the hardcoded Supabase anon key in `whatIfEngine.ts:28` is the SAME security leak flagged in `supabaseClient.ts:11`. Treat as part of RLS/security sprint. | n/a — handled separately |

---

## 6 · Forecast family

```
forecastStore.ts (458 LoC) — Zustand store + types (YearAssumptions, MonteCarloResult, etc.)
       │ ← everyone imports types from here
       ▼
forecastEngine.ts (217 LoC) — buildForecast(): deterministic year-by-year projection
       │
       ├──► consumed by: decisionCandidates, goalSolver, bestMoveEngineSprint5
       │
forecastEngineRegimeAware.ts (392 LoC) — "Parallel-Pathway Forecast Overlay"
       │
       └──► ZERO callers (only string mention in audit-trace metadata) — DEAD CODE

firePathEngine.ts (977 LoC) — computeFirePath(), buildFirePathInput()
       │
       ├──► consumed by: FIREPathCard.tsx, cfoEngine.ts, audit-trace
       │
firePathEngineRegimeAware.ts (392 LoC) — "Parallel-Pathway FIRE Overlay"
       │
       └──► ZERO callers (only string mention in audit-trace metadata) — DEAD CODE

doNothingForecast.ts (93 LoC, Phase B) — buildDoNothingForecast()
       └──► consumed by: TruePortfolioOptimizer.tsx, remediationPhaseB.test.ts
```

### Canonical ruling — Forecast
- **CANONICAL = `forecastEngine` + `forecastStore` + `firePathEngine` + `doNothingForecast`.**
- **DEAD CODE = `forecastEngineRegimeAware.ts` and `firePathEngineRegimeAware.ts`.** Confirmed zero functional callers by exhaustive grep. The only references are inside audit-trace metadata STRINGS (e.g. `'forecastEngineRegimeAware'` as a label), not imports.

### Recommended moves
| Step | Action | Risk |
|---|---|---|
| 6.1 | **DELETE** `forecastEngineRegimeAware.ts` (392 LoC) | **None** |
| 6.2 | **DELETE** `firePathEngineRegimeAware.ts` (392 LoC) | **None** |
| 6.3 | Update the 3 audit-trace metadata strings to drop the "Regime Aware" mention or relabel to the underlying engine | Zero |

This is the cleanest win in the entire plan: **784 LoC of dead code, zero risk, zero callers, removable in one PR.**

---

## 7 · Decision family

```
decisionCandidates.ts (891 LoC, Sprint 5 Phase 2) — base candidate generator
   ├── generateDecisionCandidates(), CandidateKind, DecisionCandidate
   └──► consumed by: decisionRanking, bestMoveEngineSprint5, cfoAdvisor, goalClosureLab,
        portfolioLabOptimizer, scenarioBuilderWorkspace, scenarioCompareWorkspace,
        truePortfolioOptimizer, Sprint5DecisionPanel
   ⚠ Known defect: lines 472,484 use closed-form `investibleBase × 0.07` for
     delay-property — flagged in audit A9, annotated as estimate in Phase B.

decisionRanking.ts — pure ranking utility over decisionCandidates output.
   └──► consumed by: goalClosureLab, portfolioLabOptimizer, etc.

bestMoveEngineSprint5.ts (815 LoC, Sprint 5 Phase 3) — "Best Next Action"
   ├── orchestrator over goalSolver + decisionCandidates + ranking + MC
   └──► consumed by: cfoAdvisor, decisionEngine/Sprint5DecisionPanel,
        goalClosureLab, portfolioLabOptimizer, scenarioCompareWorkspace,
        truePortfolioOptimizer

scenarioV2/decisionEngine/candidateGenerator.ts (2,363 LoC) — Layer-2 advanced generator
   ├── Generates 15-25 candidate paths from user question; runs scenarioV2 simulation
   └──► consumed by: NarrativeReport, QuestionFramework, RecommendationLayer,
        StrategyCard, StrategyDeepDive, ScoreVisualizations, autonomous/*, intelligence/*
   Different layer (works on user QUESTIONS, not ledger state)

bestMoveEngine.ts (997 LoC) — "Best Move Right Now V2" (Sprint 3-era)
   ├── computeBestMoveV2(), getBestMoveRecommendation()
   └──► consumed by: BestMoveCard.tsx, dashboard.tsx, cfoEngine.ts,
        recommendationEngine/{adapters,bestMoveBridge}, canonicalRecommendation.test
```

### Canonical ruling — Decision
- **CANONICAL = Sprint 5 stack** (`decisionCandidates` + `decisionRanking` + `bestMoveEngineSprint5`) for "what should I do next from current ledger" decisions.
- **CANONICAL = `scenarioV2/decisionEngine/candidateGenerator`** for "user-question-driven" advanced decision generation (Layer 2). Different surface, not a duplicate.
- **LEGACY = `bestMoveEngine` (V1/V2).** Sprint 3-era. Provides the dashboard "Best Move" inline card. The Sprint 5 successor has different output shape and a different ranking model.

### Recommended moves
| Step | Action | Risk |
|---|---|---|
| 7.1 | Confirm: does the dashboard still need the **inline** Best Move card from Sprint 3, or is that role now owned by Sprint 5's panel? | None — clarifying |
| 7.2 | **If superseded:** plan a migration — port `BestMoveCard.tsx`, dashboard inline, and `recommendationEngine/bestMoveBridge.ts` to consume `bestMoveEngineSprint5` outputs. Then delete `bestMoveEngine.ts`. ≈ 1,000 LoC net deletion. | Medium — touches dashboard surface |
| 7.3 | **If both surfaces still needed:** mark `bestMoveEngine` as `@deprecated`, document that it powers a different (synchronous, ledger-only) card. | None |
| 7.4 | **Independent fix:** the `decisionCandidates.ts:472,484` closed-form `× 0.07` for delay-property (audit A9) should be replaced with a real forecast call. Already annotated as estimate in PR #88 Phase B. | Tracked separately |

---

## 8 · Shared dependency map (consumed by all families)

| Shared file | Consumers | Role |
|---|---|---|
| `finance.ts` | Universal | Currency/loan/dca math primitives |
| `dashboardDataContract.ts` | All engines | Canonical NW/income/expenses selectors, `assertCurrentNwIsLedger` |
| `canonicalFire.ts` | Goal Solver, Optimizer, Decision, MC | FIRE target, SWR, asset-base resolution |
| `useCanonicalGoal.ts` | UI hook to canonical goal API | Reads `mc_fire_settings` |
| `canonicalHeadlineMetrics.ts` | Goal Solver, Optimizer, Decision | Current-state headline metrics |
| `canonicalCashflow.ts` | Goal Solver, Decision, BestMove | Monthly surplus, capacity |
| `canonicalDebtService.ts` | Goal Solver, Decision, BestMove | Debt service ratio, capacity |
| `forecastStore.ts` | All forecast/MC consumers | Type definitions + Zustand store |

**These shared modules are correctly canonical** — every engine consumes them rather than duplicating math. The architecture is fundamentally sound; the duplication is concentrated in the **orchestrator layer**, not the **primitive layer**.

---

## 9 · Supabase table touchpoints (data lineage)

| Engine | Tables read | Tables written |
|---|---|---|
| Monte Carlo (V3/V4/V5) | `sf_snapshot`, `sf_properties`, `sf_stocks`, `sf_crypto`, `mc_fire_settings` | `mc_fire_results` |
| Forecast | Same as MC | none (pure compute) |
| Optimizer (TPO + PLO) | All canonical reads | none |
| Goal Solver (all variants) | All canonical reads + `mc_fire_settings` | none |
| Decision (all variants) | All canonical reads + forecast + MC outputs | none |
| Scenario V2 | All canonical reads | `sf_scenario_results` (via `persistence.ts`) |
| **whatIfEngine (LEGACY)** | **Hand-rolled fetch w/ embedded anon key** to `sf_scenarios`, `sf_scenario_properties`, `sf_scenario_stocks`, `sf_scenario_crypto`, `sf_scenario_bills`, `sf_scenario_results` | Same |

**Key insight:** every engine except `whatIfEngine` flows through canonical selectors. `whatIfEngine` is the only one with hardcoded fetch + embedded credentials → another reason to retire it.

---

## 10 · Deprecation order (lowest risk → highest)

| Wave | Action | Files | LoC | Risk | Blocker |
|---|---|---|---|---|---|
| **1** | Delete `forecastEngineRegimeAware.ts` + `firePathEngineRegimeAware.ts`, scrub audit-trace strings | 2 | **−784** | **None** | None |
| **2** | Retire `/what-if-scenarios` page → delete `whatIfEngine.ts` + page + route | 3 + scenarios sandbox tests | **≈ −5,800** | Very low | **User confirmation needed** (page is sidebar-orphan but still routed) |
| **3** | Retire `/goal-closure-lab` page → delete `goalClosureLab.ts`, `GoalClosureLab.tsx`, `goal-closure/*`, `pages/goal-closure-lab.tsx`, route | 4+ | **≈ −2,500** | Low | **User confirmation needed** (still in sidebar?) |
| **4** | Re-classify `portfolioLabOptimizer` as `@internal`; route all UI imports through `truePortfolioOptimizer` façade | 2 component files | 0 (refactor) | Low | None |
| **5** | Audit `bestMoveEngine` vs `bestMoveEngineSprint5` overlap; either migrate dashboard `BestMoveCard` to Sprint 5 stack OR mark V2 `@deprecated` | 5 files | **≈ −1,000 if removed** | Medium | **User decision: which surface owns "Best Move"?** |
| **6** | (Deferred) MC unification: consolidate `fireMonteCarlo`, `probabilisticWealthEngine`, and `scenarioV2/monteCarlo` against the V3/V4/V5 stack via shared interface + parity test | many | ≈ −2,300 | **High** | Requires dedicated sprint + parity test before any deletion |

**Plausible net deletion if waves 1-5 land:** ≈ 10,000 LoC of engine code + supporting components/tests, with negligible production risk.

---

## 11 · Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Deleting a "dead" file breaks an audit-trace string lookup | Low | Low (Audit Mode label cosmetic) | Grep audit-trace strings before deletion; relabel |
| Retiring `/goal-closure-lab` breaks a bookmarked URL | Medium | Low | Add Wouter redirect to `/portfolio-lab` |
| `whatIfEngine` sandbox tables are read elsewhere | Low | Medium | grep `sf_scenarios` and `sf_scenario_results` before deletion |
| `bestMoveEngine` deletion breaks the dashboard inline card | Medium | High | Port to Sprint 5 stack FIRST, behind a feature flag, with screenshot comparison |
| `portfolioLabOptimizer` is depended on more than UI imports show | Medium | Medium | Run full `test:sprint-6` + `test:sprint-7` after refactor |
| Removing `fireMonteCarlo` breaks Goal Solver Pro audit traces | High | High | DO NOT remove in this consolidation. Deferred. |
| Typecheck baseline drift > 66 | Low | Medium | `npm run check` gate on every PR |

---

## 12 · Validation plan (per wave)

Each deprecation wave must pass before the next ships:

1. `npm run check` — typecheck must stay at ≤66 errors (per `docs/15-ai-handover-guide.md` baseline).
2. `npm run test:monte-carlo-canonical` — must stay at 30/32 (the 2 failures are cosmetic label strings, not engine logic).
3. `npm run test:sprint-7` — Portfolio Optimizer must stay green.
4. `npm run test:sprint-10` — Goal Solver Pro must stay at 833/846 (13 SSR failures are pre-existing test infrastructure issues, not engine bugs).
5. `npm run test:scenario-v2` — Scenario backbone must stay green.
6. `npm run build` — Vite production build must succeed.
7. Visual smoke test on `/dashboard`, `/portfolio-lab`, `/decision`, `/decision-lab` after each wave.

---

## 13 · Open questions for the user

Before any code lands, please confirm:

1. **Wave 1 — delete the two `*RegimeAware.ts` files (784 LoC, zero callers)?** This is the safest move in the entire plan.
2. **Wave 2 — retire `/what-if-scenarios` page** (already absent from sidebar after Sprint 20 PR-H)? If yes, OK to delete `whatIfEngine.ts` (2,286 LoC) and its page (3,511 LoC)?
3. **Wave 3 — retire `/goal-closure-lab`** in favour of `/portfolio-lab` + `/decision-lab`? Or keep it as a parallel surface?
4. **Wave 5 — "Best Move" surfaces:** does the dashboard inline `BestMoveCard` (powered by `bestMoveEngine` V2) and the Sprint 5 `decisionEngine/Sprint5DecisionPanel` need to coexist, or should they consolidate onto the Sprint 5 stack?
5. **Sequencing:** ship one wave per PR, or batch waves 1+4 (the zero-risk ones) together?

---

## 14 · What this plan does NOT do

- ❌ Touch the **intelligence layer** (behavioural, adaptive, autonomousOS, futureWorlds, narrative, executionOS, recommendationEngine, lifePlanning) — explicitly out of scope per user.
- ❌ Address the **embedded Supabase credentials** in `whatIfEngine.ts:28` and `supabaseClient.ts:11` — separate security workstream (PR #89 RLS advisory).
- ❌ Re-open **PR #88** scope (Phase A/B/C data remediation) — that PR is the prerequisite for production hygiene; this plan layers ON TOP of it.
- ❌ Modify **PR #87 branch** `feat/sprint13-reality-check-v2` — informally protected at HEAD `94fd926`.
- ❌ Make any **production deployments** or **migrations**.
- ❌ Propose any **code commits** until the open questions above are answered.

---

**End of plan.** Awaiting user sign-off on the five open questions in §13.
