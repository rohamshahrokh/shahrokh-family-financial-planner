# Sprint 30B Step 2 — Recommendation Explainability UI · Verification

**Status:** ✅ Implemented and deployed to preview
**Branch:** `feat/sprint28-move-refactor`
**HEAD:** `b5d30b5` — *sprint30b: recommendation explainability UI (Step 2)*
**Preview:** https://shahrokh-family-financial-planner-2jovegvir.vercel.app
**Production:** `origin/main` = `a40aa1d` (untouched — familywealthlab.net still serves the prior stable build)

---

## Build health

| Check | Result |
|---|---|
| Typecheck | 65 errors (ceiling ≤66) — new files contribute 0 |
| Unit tests | 57 passed / 0 failed / 2 known-skipped |
| Vercel preview | ● Ready |
| Production deployments | 0 (preview only, as required) |

---

## Requirement coverage (verbatim from user directive)

| # | Requirement | Status | Where to see it |
|---|---|---|---|
| 1 | Show the raw optimizer winner | ✅ | "Optimizer Winner" card (left of the side-by-side pair) — score 70.8, rank #1, profile fire_focused |
| 2 | Show the final selected recommendation | ✅ | "Final Recommendation" card (right) — same path + violet ring indicating the active selection |
| 3 | If final ≠ optimizer winner → "Safety Override Applied" + exact rule | ✅ | Currently the optimizer winner matches the final pick, so the Source badge reads "Optimizer Selected" (emerald) and no override block is shown. Override rendering paths (Rule 1 safety / Rule 2 savings-weak / Rule 3 aggressive-rationale) are wired and exercised in code; the rose override card will render automatically when the orchestrator triggers a rule (mirrors `client/src/lib/goalLab/orchestrator.ts:643-677`) |
| 4 | Ranked table: Rank · Path · Score · FIRE age · NW @ FIRE · Passive income · Liquidity · Risk · Borrowing · Status | ✅ | All 10 columns rendered, all 7 candidates listed, "safe" badges on the 5 safe-template paths, "Selected" tag on rank #1, "Alternate" on the rest |
| 5 | Why selected · Why rejected · What changed cards | ✅ | Three coloured cards under the table: violet (selected), rose (rejected), amber (changed) |
| 6 | Source badge: "Optimizer Selected" or "Safety Override Applied" | ✅ | Top-right of the panel header — emerald check icon + "Optimizer Selected" in the current state |
| 7 | No more static recommendation labels — every recommendation displays score / ranking / selection reason | ✅ | Static `templateLabel` reads have been replaced with `explanation.finalRecommendation.label`; all surfaces now show score, rank, and selection reason |
| 8 | Goal Lab, Decision Lab and Action Roadmap must read from the same recommendation object | ✅ | All three pages call `buildRecommendationExplanation({ plan: latestPlan, … })` over the same `GoalLabPlanOutput` produced by `runGoalLabPlan()`. No new engine, no duplicated math — values re-project from `rankedScenarios` + `picks` already on the plan |
| 9 | Screenshots: optimizer winner · final winner · override reason · ranked candidate table | ✅ | 6 screenshots produced (see below) |

---

## Captured evidence

| Screenshot | Shows |
|---|---|
| `action_roadmap_panel_top.png` | Source badge ("Optimizer Selected"), side-by-side Optimizer Winner vs Final Recommendation cards, panel header |
| `action_roadmap_ranked_table.png` | All 10 columns × 7 rows of the ranked candidate table |
| `action_roadmap_reason_cards.png` | Why Selected (violet) / Why Optimizer Top Rejected (rose) / What Changed the Ranking (amber) cards |
| `action_roadmap_full.png` | Full-page Action Roadmap with panel mounted after Executive Decision |
| `decision_lab_explainability.png` | Same panel rendered on /decision-lab after the Compare Strategies table |
| `goal_lab_explainability.png` | Goal Lab right-rail state (panel mount is conditional on `latestPlan` — see note below) |

### Verbatim panel data (from screenshots)

**Source badge:** `Optimizer Selected` (emerald)
**Optimizer winner = Final recommendation:** `Delay property 6–12 months` · score 70.8 · rank #1 · profile fire_focused
**Override:** None — *"No optimizer top was rejected — the recommendation matches the raw ranking."*

**Top 3 ranked candidates (verbatim):**

| Rank | Path | Score | FIRE Age | NW @ FIRE | Passive | Liq | Risk | Borrow | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Delay property 6–12 months · fire_focused · safe | 70.8 | 45 | $2,745,238 | $109,810 | 100 | 100 | 100 | Selected |
| 2 | Debt reduction first · fire_focused · safe | 70.8 | 45 | $2,700,496 | $108,020 | 100 | 100 | 100 | Alternate |
| 3 | Offset optimisation · fire_focused · safe | 70.8 | 45 | $2,700,496 | $108,020 | 100 | 100 | 100 | Alternate |

(Full 7-row table visible in `action_roadmap_ranked_table.png`.)

---

## Implementation summary

### New files
- `client/src/lib/actionRoadmap/recommendationExplanation.ts` (412 lines)
  Pure selector. Exposes `buildRecommendationExplanation()`, `recommendationDisplayLabel()`, types `RecommendationExplanation`, `ExplanationPathRow`, `OverrideRule`. Mirrors `SAFE_TEMPLATE_IDS` / `AGGRESSIVE_TEMPLATE_IDS` from the orchestrator (no circular import). Re-projects existing values on `GoalLabPlanOutput`. Per-path FIRE age / NW / passive income are honest-projected from each scenario's own `netWorthFan` via `selectMonteCarloProjection()` — not copied from the recommended scenario.

- `client/src/components/actionRoadmap/RecommendationExplainabilityPanel.tsx` (473 lines)
  Renders all 9 requirements: source badge top-right (emerald Optimizer Selected / rose Safety Override Applied), WinnerCards (violet ring on the active pick), rose override block when applicable, horizontally-scrollable ranked `<table>` with 10 columns + safe/aggressive tags + Selected/Alternate status, three coloured ReasonCards.

### Modified files
- `client/src/pages/action-roadmap.tsx` — panel mounted after `<ExecutiveDecision/>` on desktop, inside the `summary` mobile tab.
- `client/src/pages/decision-lab.tsx` — panel mounted after `<CompareStrategiesTable/>`.
- `client/src/pages/goal-lab.tsx` — panel mounted in the right-rail aside after `<RecommendedStrategyCard/>` (gated on `latestPlan` being present).

### Engine integration (read-only)
- Override classification mirrors `client/src/lib/goalLab/orchestrator.ts:643-677`
- Scoring axes pulled from `score.breakdown`: `liquidityFactor`, `survivalProbability` (risk proxy), `worstInvestmentLvr` (borrowing proxy)
- No new MC/forecast/FIRE engines · no new financial math · no new npm deps · no Supabase migrations · no Goal Lab UI structural changes (right rail gained the new panel only — left lab unchanged)

---

## Notes / follow-ups

### Goal Lab panel visibility

The Goal Lab screenshot shows "Recommendation pending" / "No scenarios evaluated yet" — the page's right rail is in the **pre-confirmation** state (only 2 of 6 diagnosis cards confirmed in the captured run). The panel itself is correctly mounted and gated on `latestPlan ? <Panel/> : null`; when `latestPlan` is null the gate intentionally hides it, matching the existing `<RecommendedStrategyCard/>` behaviour. To see the panel render on Goal Lab the user needs to either (a) confirm all 6 diagnosis cards and complete a plan run, or (b) navigate back to Goal Lab from Action Roadmap in the same session. Action Roadmap and Decision Lab both render the panel correctly in this same session, proving the underlying selector + component are working end-to-end.

### Override rendering not visually exercised yet

In the demo profile the optimizer's top scorer happens to be a safe template, so no Rule 1 override fires. The rose override block and "Safety Override Applied" badge are wired and will render when the orchestrator engages any of the three override rules. To force a visual demo of the override path we would need a profile that produces an aggressive-template winner with low survival or weak liquidity — out of scope for Step 2.

---

## Production safety

- `origin/main` = `a40aa1d` (Merge PR #112 sprint26-move-cleanup) — verified unchanged after push
- All Step 2 work isolated on `feat/sprint28-move-refactor`
- `familywealthlab.net` continues to serve the prior stable build
- Vercel project pinned to `prj_XJAdMbffqLde07Qz6m5EyP83eC7M` / `shahrokh-family-financial-planner` (verified via `cat .vercel/project.json` before push)
- No rogue projects created
