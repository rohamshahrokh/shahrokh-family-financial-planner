# Sprint 28 — MOVE Architecture Refactor

> **Status**: preview only. NO merge. NO production. Single source of truth for
> every metric is the existing engine; this sprint moves UI between pages and
> adds explainability — it does NOT add new financial math.

---

## 1. The three-layer MOVE architecture

```
            ┌─────────────────────────────────────────────────────┐
            │  Layer 1 — GOAL LAB          "Understand me"        │
            │                                                     │
            │  • FIRE Goal                                        │
            │  • Monthly Fuel                                     │
            │  • Capital Structure                                │
            │  • Wealth Engine                                    │
            │  • Risk Capacity                                    │
            │  • Biggest Constraint                               │
            │  • Current Position                                 │
            │  • Confidence                                       │
            │                                                     │
            │  Run Plan ────────────────────────────────►         │
            │  After-run output: one Recommended Strategy card.   │
            │  No milestones. No accelerators. No risk axes.      │
            └────────────────────────┬────────────────────────────┘
                                     │ writes plan to
                                     ▼ localStorage cache
            ┌─────────────────────────────────────────────────────┐
            │  Layer 2 — DECISION LAB     "Compare strategies"    │
            │                                                     │
            │  • Recommended Path                                 │
            │  • Alternative Paths                                │
            │  • Why A beats B                                    │
            │                                                     │
            │  Open Action Roadmap ────────────────────────►      │
            └────────────────────────┬────────────────────────────┘
                                     │
                                     ▼ same cached plan
            ┌─────────────────────────────────────────────────────┐
            │  Layer 3 — ACTION ROADMAP   "Tell me what to do"    │
            │                                                     │
            │  S1 Executive Summary                               │
            │  S2 Visual FIRE Journey                             │
            │  S3 Monte Carlo P25/P50/P75 projection              │
            │  S4 Path Completion                                 │
            │  S5 Top Accelerators                                │
            │  S6 Risk Dashboard                                  │
            │  S7 Alternative Paths                               │
            │  S8 Explainability layer                            │
            └─────────────────────────────────────────────────────┘
```

## 2. Wiring (data flow)

```
  GoalProfile (canonical)
        │
        ▼
  runGoalLabPlan()                      ◄── lib/goalLab/orchestrator.ts
        │
        │ uses:
        │   • candidateGenerator (scenarioV2/decisionEngine)
        │   • runScenarioV2 (scenarioV2/runScenario)
        │   • monteCarlo (scenarioV2/monteCarlo)        ── 300 sims default
        │
        ▼
  GoalLabPlanOutput
        ├── picks.recommended     ► used by ALL THREE layers
        ├── picks.safest          ► Decision Lab + Action Roadmap S7
        ├── picks.fastest         ► Decision Lab + Action Roadmap S7
        ├── picks.bestCashflow    ► Decision Lab + Action Roadmap S7
        ├── picks.bestHybrid      ► Decision Lab + Action Roadmap S7
        ├── rankedScenarios       ► Action Roadmap S5 (accelerators)
        └── metrics.simulationCount ► Action Roadmap S8 (explainability)
        │
        ▼ persisted to localStorage by writeLatestGoalLabPlan()
        │
        ▼ read by readLatestGoalLabPlan() in all consumers
        │
  ┌─────┴─────┬─────────────────┐
  ▼           ▼                 ▼
Goal Lab    Decision Lab    Action Roadmap
(summary)   (compare)       (execute)
```

## 3. Per-metric source of truth

Every visible number in the Action Roadmap MUST cite one of these engine
sources. The explainability chip (`S8`) renders the citation in audit mode.

| Display label                  | Source field                                                          | Engine module                                            | Notes |
|--------------------------------|-----------------------------------------------------------------------|----------------------------------------------------------|-------|
| Recommended path name          | `plan.picks.recommended.templateLabel`                                | goalLab/orchestrator                                     | Display label only |
| Expected FIRE age (P50)        | First-crossing scan of `netWorthFan[*].p50 ≥ fireNumber`              | actionRoadmap/pathCompletionEngine                       | Existing Batch 1 selector |
| Expected FIRE age (P25/P75)    | First-crossing scan of `netWorthFan[*].p25` / `p75 ≥ fireNumber`      | actionRoadmap/pathCompletionEngine (extended this sprint) | New helper — same scan, three percentiles |
| Median net worth at horizon    | `netWorthFan[H].p50`                                                  | scenarioV2 Monte Carlo                                   | H = last fan index |
| Net worth P25 / P75            | `netWorthFan[H].p25` / `p75`                                          | scenarioV2 Monte Carlo                                   | Direct read |
| Expected passive income (P50)  | `netWorthFan[H].p50 × swrPct / 100`                                   | derived in pathCompletionEngine                          | swrPct from CanonicalFire |
| Expected passive income (P25/P75) | `netWorthFan[H].p25 × swr/100` and `p75 × swr/100`                 | derived this sprint                                      | Same SWR, percentile band |
| Path completion status         | `pathCompletionEngine.classify()`                                     | actionRoadmap/pathCompletionEngine                       | ON_TRACK / ON_TARGET_LATE / GAP_REMAINING / NOT_MODELLED |
| Goal coverage %                | `min(1, expectedNetWorth / fireNumber)`                               | actionRoadmap/pathCompletionEngine                       | Already exposed |
| Gap remaining $                | `max(0, fireNumber − expectedNetWorth)`                               | actionRoadmap/pathCompletionEngine                       | Already exposed |
| Years remaining                | `expectedFireAge − currentAge`                                        | derived in component                                     | Simple subtraction |
| Confidence (high / med / low)  | `computeGoalLabConfidence(plan).overall`                              | goalLab/goalLabConfidence                                | Existing |
| Monte Carlo sim count          | `plan.metrics.simulationCount`                                        | goalLab/orchestrator                                     | Default 300 |
| Milestones (S2)                | `actionRoadmapBuilder.buildActionRoadmap(...)`                        | actionRoadmap/actionRoadmapBuilder                       | Existing Batch 1 |
| Risk axes (S6)                 | `analyzeRoadmapRisk(scenario)`                                        | actionRoadmap/roadmapRiskAnalyzer                        | Existing Batch 1 |
| Top accelerators (S5)          | `buildAcceleratorRanking(picks, rankedScenarios)`                     | actionRoadmap/roadmapAccelerators                        | Existing Batch 2 |
| Alternative paths (S7)         | `plan.picks.{safest, fastest, bestCashflow, bestHybrid}`              | goalLab/orchestrator                                     | Same source as Decision Lab |
| Why-this-path / why-not-that   | `winner.rationale[]` + `raw.comparativeNarrative.{whyWon, secondPlaceAndWhy, whatCouldInvalidate}` | scenarioV2/narrative + decisionEngine | Engine output, untouched |

## 4. New module added this sprint

Only ONE new selector module is added — it does not duplicate engine math; it
extends `pathCompletionEngine` with multi-percentile scanning:

* `client/src/lib/actionRoadmap/montecarloProjection.ts`

  Exports `computeMontecarloProjection(scenario, fire, currentAge)` returning:

  ```ts
  {
    fireAge:        { p25: number | null; p50: number | null; p75: number | null };
    netWorth:       { p25: number; p50: number; p75: number } | null;
    passiveIncome:  { p25: number; p50: number; p75: number } | null;
    audit: {
      simulationCount: number | null;
      fanMonths: number;
      swrPctUsed: number | null;
    };
  }
  ```

  No new Monte Carlo loop. Pure scan over the already-computed `netWorthFan`.

## 5. Explainability layer (S8)

A new helper `metricSourceAttribution.ts` returns, for any metric id, a
human-readable provenance object:

```ts
type MetricSource = {
  engine:        "monteCarlo" | "pathCompletion" | "riskAnalyzer" | "accelerators" | "narrative" | "goalProfile";
  percentile:    "P25" | "P50" | "P75" | "deterministic" | null;
  simulationCount: number | null;
  path:          "recommended" | "alternate" | null;
  formula:       string;   // e.g. "netWorthFan[H].p50 × swrPct / 100"
};
```

The Action Roadmap header has an audit toggle; when ON, every major metric
shows a small chip with this provenance. When OFF, the metric renders cleanly
(value only).

## 6. Removed duplicated calculations

| What was duplicated                                                        | Where it lived                                                                     | Sprint 28 action |
|----------------------------------------------------------------------------|------------------------------------------------------------------------------------|------------------|
| ActionRoadmapPanel rendered alongside goal-questions in Goal Lab           | `goal-lab.tsx` right rail (Sprint 27 Batch 2 mount)                                | **Removed** from Goal Lab; lives ONLY in `/action-roadmap` |
| Milestones / accelerators rendered in Goal Lab right rail                  | Inside `ActionRoadmapPanel`, which was mounted in Goal Lab                         | **Removed** from Goal Lab |
| Path-completion read-out duplicated in Goal Lab's CurrentPositionPanel    | `CurrentPositionPanel` showed FIRE target year + FIRE gap; ActionRoadmapPanel showed path-completion of the same fireNumber | Goal Lab keeps **Current Position** (today snapshot) only. Future projection moves to Action Roadmap. |
| "Recommended Strategy" rendered in both Goal Lab and Decision Lab          | Decision Lab's hero card + Goal Lab's confidence panel both surfaced winner name   | Goal Lab now shows the **single Recommended Strategy card** after Run Plan with "Open Action Roadmap" CTA; Decision Lab shows it as the comparison anchor |
| Goal Closure Lab's overlapping "decision-making workspace"                 | `/goal-closure-lab` page                                                           | **Redirected** to `/action-roadmap` (per user's Sprint 28 direction) |

## 7. Critical-validation guard

Rule: if `picks.recommended.templateId === "buy-ip-now"` (Property Path) AND an
accelerator suggests an ETF DCA action, the accelerator MUST be rendered as a
**"Supporting Action"** chip, never as the headline.

Implementation: `roadmapAccelerators.ts` already tags `engineTemplateId` per
accelerator. The S5 component compares `accelerator.engineTemplateId` against
`plan.picks.recommended.templateId`; mismatched templates render with a
muted "Supporting Action" sub-label. Same-template accelerators render as
primary "Accelerator" cards.

## 8. Sprint constraints (verbatim)

* Preview only. No production deployment.
* No new financial engine. No new FIRE engine. No parallel forecast.
* No Supabase schema changes. No migrations. No new DB tables.
* No fabricated probability/success rates. Missing data → "Not modelled yet".
* All outputs trace back to: Forecast Engine, Decision Engine, Canonical
  Ledger, Goal Profile.

## 9. Route plan

| Route                  | Before                          | After                                               |
|------------------------|---------------------------------|-----------------------------------------------------|
| `/goal-lab`            | 7 question cards + ActionRoadmapPanel in right rail | 6 question cards + Current Position + Confidence + Recommended Strategy card (after Run Plan); right rail tightened |
| `/decision-lab`        | Mixed compare + execution detail | Pure compare — Recommended vs Alternatives + why-A-beats-B + "Open Action Roadmap" CTA |
| `/goal-closure-lab`    | Goal Closure Lab page           | Redirect → `/action-roadmap`                        |
| `/action-roadmap`      | (didn't exist)                  | New flagship Action Roadmap page (S1–S8)            |
| `/action-plan`         | Legacy "Action Centre"          | Untouched (out of scope); MOVE nav no longer points to it |
| `MOVE nav: Action Roadmap entry` | → `/action-plan`     | → `/action-roadmap`                                 |

## 10. Acceptance checklist

* [ ] Goal Lab right rail has NO roadmap content
* [ ] Goal Lab after-Run-Plan shows ONE card (name + 3 bullets + CTA)
* [ ] Decision Lab shows ONLY compare + CTA, no execution detail
* [ ] `/goal-closure-lab` redirects to `/action-roadmap`
* [ ] `/action-roadmap` renders all 8 sections on desktop AND mobile
* [ ] Visual FIRE Journey timeline renders without ANY new dependency
* [ ] Every major metric on Action Roadmap shows source attribution when audit toggle is ON
* [ ] Cross-template accelerators carry "Supporting Action" badge
* [ ] No fake probability anywhere. No "0%" / "0 years" placeholders. Missing → "Not modelled yet"
* [ ] Typecheck error count ≤ 66 (no new errors introduced)
* [ ] All existing actionRoadmap tests still pass
* [ ] At least 2 new selectors have unit tests: `montecarloProjection`, `metricSourceAttribution`
