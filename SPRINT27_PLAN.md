# Sprint 27 — Action Roadmap & FIRE Path Completion Engine — Plan

> Status: **Mental-model phase complete.** No code yet. This file is the
> architecture summary the brief requires before any major change.

## Guardrails (verbatim from brief)
- Preview only · NO production deploy · NO auto-promote
- NO new parallel engine · NO duplicate calculations · NO new forecast or FIRE engine
- NO Supabase schema changes · NO migrations · NO new DB tables
- NO hardcoded outcomes · NO fake probabilities
- All outputs must trace back to: Forecast Engine, Decision Engine, Canonical Ledger, Goal Profile

## Big insight from reading the codebase

**Almost everything the brief asks for is ALREADY computed by `runScenarioV2`
inside `generateQuickDecisionCandidates`** — which `runGoalLabPlan` already
runs. Every `GoalLabRankedScenario` carries `winner.result` (an
`ExtendedScenarioResult`) and the full `QuickDecisionOutput` carries
`executionPlan: ExecutionPlanPhase[]` and `conditionalRecommendations`.

This sprint is therefore an **orchestration + presentation** layer over the
existing engine output, not a new engine. The only original math we add is
deterministic threshold checks on already-computed numbers (e.g., "first
month NW p50 crosses fireNumber").

## What lives where (existing surface)

| Sprint 27 need                  | Source field on existing engine output                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Step 1 — Execution Roadmap      | `QuickDecisionOutput.executionPlan[]` (= the `winner.events` already bucketed into phases by `buildExecutionPlan`) |
| Step 1 — Milestone events       | `RankedCandidate.events: ScenarioDelta[]` (already activation-month sorted)                              |
| Step 2 — Expected FIRE age      | First month in `result.netWorthFan[].p50` that reaches `canonicalFire.fireNumber` (deterministic scan)   |
| Step 2 — Expected Net Worth     | `result.netWorthFan[H].p50` at target horizon                                                            |
| Step 2 — Expected Passive Income| `expectedNetWorth × swrPct/100 ÷ 12`                                                                     |
| Step 2 — Goal Achievement %     | `min(1, expectedNetWorth / fireNumber)`                                                                  |
| Step 2 — Years early/late       | Diff between expected FIRE age and `goal.targetFireAge`                                                  |
| Step 3 — Risk axes              | `result.liquidityExhaustionProbability`, `defaultProbability`, `serviceability.nsr`, `softWarnings[]`, `negativeEquityProbability`, `recovery` |
| Step 4 — Top accelerators       | Cross-template rank deltas: comparing `picks.fastest` and `alternates[]` vs `picks.recommended` on `medianNwPath` |
| Step 5 — Alternative paths      | `rankedScenarios[]` already produced by orchestrator                                                     |
| Step 6 — Narrative              | `comparativeNarrative` + `rationale[]` already on every `RankedCandidate`                                |

The new modules in this sprint are **thin selectors over these fields**.

## New file list

```
client/src/lib/actionRoadmap/
├─ actionRoadmapBuilder.ts      # selector → RoadmapMilestone[] from RankedCandidate
├─ pathCompletionEngine.ts      # selector → PathCompletion from result.netWorthFan + canonicalFire
├─ roadmapTemplates.ts          # display-only template metadata (PROPERTY_PATH, ETF_PATH, etc.)
├─ roadmapRiskAnalyzer.ts       # classifier → 5 risk axes Low/Med/High from result probabilities
├─ roadmapNarrative.ts          # plain-English from existing comparativeNarrative + rationale[]
├─ types.ts                     # ActionRoadmap, RoadmapMilestone, PathCompletion, RoadmapRisk
└─ __tests__/...                # 4–6 unit suites (honesty + reuse guarantees)
```

UI: a new `<ActionRoadmapPanel>` component inside `goal-lab.tsx`, mounted
under the existing right-rail panels (Current Position, Confidence). Reuses
the same `readLatestGoalLabPlan()` cache — no new orchestration on render.

## Engine flow (matches the brief diagram)

```
Goal Profile  ──┐
                ├──► runGoalLabPlan  ──► GoalLabPlanOutput  (EXISTING — unchanged)
Ledger        ──┘                          │
                                           ├─► picks.recommended  ──► actionRoadmapBuilder ─► RoadmapMilestone[]
                                           ├─► result.netWorthFan ──► pathCompletionEngine ─► PathCompletion
                                           ├─► result.*Probability+softWarnings ──► roadmapRiskAnalyzer ─► RoadmapRisk
                                           ├─► alternates[] + rankedScenarios ──► top accelerators
                                           └─► comparativeNarrative ──► roadmapNarrative ─► plain English
```

## Honesty rules (verbatim from brief, enforced module-wide)
- If `result.netWorthFan` is empty OR `picks.recommended` is null → status =
  `"NOT_MODELLED"` and ALL numeric fields are `null`. UI renders "Not modelled
  yet" — never 0% or 0 years.
- If `winner.probabilityP50` is null → completion narrative may NOT cite a
  probability number.
- Top accelerators: only ranked when both the recommended AND the alternate
  have non-null `medianNwPath`.

## Test plan
- `actionRoadmapBuilder.test.ts` — builds correct phases from `winner.events`,
  preserves activation-month order, attaches plain-English summaries.
- `pathCompletionEngine.test.ts` — first crossing detection, ahead/behind/null
  branches, honesty (no number when fan empty).
- `roadmapRiskAnalyzer.test.ts` — band thresholds per risk axis, never invents
  signals (null inputs → null axes).
- `roadmapNarrative.test.ts` — never produces a sentence with a fabricated
  probability or year.

## What this sprint does NOT do
- Does NOT re-run any engine on render.
- Does NOT call Supabase.
- Does NOT change MOVE landing (Sprint 26 P3/P4 are already live).
- Does NOT modify Portfolio Lab / Goal Closure Lab.
- Does NOT change `/decision-lab` (that's the source of `runGoalLabPlan`).

## Verification plan
1. Typecheck ≤66 errors.
2. All new unit tests pass.
3. Push branch → wait for Vercel preview Ready.
4. Browser verification (demo profile + Run plan on /decision-lab) capturing
   four screenshots: (a) full Action Roadmap panel, (b) Path Completion
   section, (c) Risk Analysis section, (d) Top Accelerators + Alternative
   Paths.
5. Deliver preview URL + screenshots. **No merge.**
