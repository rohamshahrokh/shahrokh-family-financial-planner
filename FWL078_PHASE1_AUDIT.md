# FWL-078 — Action Roadmap Engine Audit (Phase 1)

**Date:** 2026-05-30 · **Branch:** `main` @ `4d31859` · **Mode:** Audit-only, NO code changes.

---

## 1. Current Architecture

### 1.1 Single source of truth

```
Goal Lab orchestrator
  └─ GoalLabPlanOutput { rankedScenarios[], picks.recommended, profile }
       └─ readLatestGoalLabPlan()   (cache, IDBKeyVal-backed)
            └─ /pages/action-roadmap.tsx
                 └─ ctx: RoadmapSectionProps
                      ├─ ExecutiveDecision           (Summary tab)
                      ├─ RecommendationExplainabilityPanel
                      ├─ FireJourneyRoadmap          (Roadmap tab)
                      ├─ YearByYearRoadmap           (Timeline tab — year cards)
                      ├─ WealthTimelineGantt         (Timeline tab — Gantt)
                      ├─ NetWorthAttribution
                      ├─ MonteCarloOutlook
                      ├─ RisksFailurePoints          (Risks tab)
                      ├─ AlternativeStrategies       (Alternatives tab)
                      └─ NextActionsPanel            (Actions tab)
```

Every tab consumes the SAME `plan.picks.recommended` (a `GoalLabRankedScenario`) and its `winner: RankedCandidate`. No tab fetches its own scenario, no tab re-runs the engine. The page reads the canonical ledger via tanstack-query but only to surface "Current position" and dates — never for milestone derivation.

### 1.2 Tab → selector → engine field table

| Tab | UI component | Selector | Engine field read | Verdict |
|---|---|---|---|---|
| Summary | `ExecutiveDecision` | `buildRecommendationExplanation` | `plan.picks.recommended`, `rankedScenarios[]`, `metrics.simulationCount` | ✓ canonical |
| Roadmap | `FireJourneyRoadmap` | `buildActionRoadmap` | `winner.events: ScenarioDelta[]` (sorted by activationMonth) | ✓ engine-driven |
| Timeline (year cards) | `YearByYearRoadmap` | `selectYearByYearRoadmap` | `winner.events` grouped by year | ✓ engine-driven |
| Timeline (Gantt) | `WealthTimelineGantt` | `selectEngineEventLanes` | `winner.result.events` firehose | ✓ engine-driven |
| Risks | `RisksFailurePoints` | `selectFailureAnalysis` | `winner.result.{defaultProbability, liquidityStressProbability, …}` + `softWarnings[]` | ✓ engine-driven |
| Alternatives | `AlternativeStrategies` | `buildAlternativeRationale` | `recommended` + `alternate` ranked scenarios + their MC fans | ✓ engine-driven |
| Actions | `NextActionsPanel` | `buildNextActions` | derives from the SAME `winner.events` (via `buildActionRoadmap` first), then expands each milestone label into 1–3 prep tasks via a small lookup table | ✓ engine-derived (with deterministic prep-task expansion) |

**All 6 tabs read from the same canonical scenario.** No tab is disconnected. No tab uses placeholder/static data. The honesty guardrails ("Not modelled yet", null-instead-of-0, single-path purity filter) are intact across every selector.

---

## 2. Broken Wiring — What's Actually Wrong

The wiring is correct. **The bug is upstream, in the engine output itself.** Specifically: for household `shahrokh-family-main`, the recommended scenario is the `buy-ip-now` template — but its `winner` candidate is `defer_etf_super_50` (two $25,000 ETF/super lump sums in 2026-05), NOT the `ip_now` blueprint that the template's `intentFilter` is supposed to enforce.

### 2.1 Evidence

**From production smoke (sprint31d-production-smoke.ts):**
- Final recommendation: `buy-ip-now`, score 70.60
- Winning candidate inside that template: `defer_etf_super_50`
- `winner.events`: [`2026-05 etf_lump_sum $25k → etf`, `2026-05 etf_lump_sum $25k → super`]

**From `scenarioTemplates.ts:218`:**
```ts
{ id: "buy-ip-now", …, intentFilter: (id) => id === "ip_now" }
```

**From `orchestrator.ts:294-302`:**
```ts
let winner: RankedCandidate | null = engineTop;
let winnerSelectedByIntentFilter = false;
if (t.intentFilter && out.ranked.length > 0) {
  const faithful = out.ranked.find((c) => t.intentFilter!(c.id));
  if (faithful) {
    winner = faithful;
    winnerSelectedByIntentFilter = true;
  }
}
// ← if no `ip_now` candidate was generated, winner stays as engineTop (= defer_etf_super_50)
```

**From `candidateGenerator.ts:868`:** `ip_now` IS in `blueprintsForBuyProperty()`, so the issue is not blueprint registration. The `ip_now` candidate is either (a) being dropped by an upstream affordability/safety gate before ranking, or (b) being scored but somehow not appearing in `out.ranked`.

### 2.2 Why this causes every user-reported symptom

| User-reported symptom | Direct cause |
|---|---|
| "Roadmap shows only Today + 2035 FIRE target — no milestones" | `winner.events` contains only two events, BOTH dated 2026-05. Today is 2026-05-30, so `activationMonth < todayKey` is true → both events flagged `status: completed`. `actionRoadmapBuilder` `hasEngineMilestones` excludes completed. UI renders empty journey. |
| "Timeline shows two duplicated $25k ETF lump-sum cards" | These are real engine events — but they are the WINNING candidate of buy-ip-now, which should never have selected an ETF variant. The card duplication is not a UI bug; it's two distinct deltas (target=etf, target=super) with the same $25k amount and label. |
| "Actions shows Nothing Scheduled" | `nextActionsBuilder` skips milestones with `status === "completed"`. All milestones are in the past → all buckets empty. |
| "Roadmap doesn't explain HOW to execute Buy IP Now" | The roadmap is FAITHFULLY rendering what the engine selected — which is not an IP purchase, despite the template label. The user sees "Buy investment property now" headline because the template ID is buy-ip-now, but the winner deltas are ETF/super, so there is no IP-purchase narrative to render. |
| "Output below commercial standard" | Symptom of the above — the page wires the right data but the data is wrong at the source. |

### 2.3 Secondary defects (selectors are honest but UX bare)

Even if 2.1 is fixed, three real UX gaps remain:

1. **`actionRoadmapBuilder` does not emit "current state" milestones.** Roadmap starts at "Today" then jumps to the next engine event. For a household with no future events (e.g., a defer-only winner), the journey is empty between Today and the FIRE marker. Commercial planners show interim wealth checkpoints (e.g., "Year 3: NW $1.5M, on track").
2. **`nextActionsBuilder` template lookup is incomplete.** Missing matchers for `equity_release`, `multi_ip_ladder`, `refi_rate_save`, `property_deposit_boost`, `rentvest`, `early_retire`. When the engine emits any of these, `actionsFor()` falls back to `"Review milestone: <label>"` — usable but not commercial-grade.
3. **No "how to execute" cards.** The roadmap shows WHAT and WHEN but not HOW. Each milestone needs an expandable execution checklist (broker contact, document list, sequencing dependencies) that ties back to the action-templates lookup.

---

## 3. Implementation Plan

Phased so we can stop after each phase and re-audit. Phase A is the actual bug fix. Phases B and C are quality/commercial-standard work.

### Phase A — Fix the engine winner (`ip_now` not reaching ranked[])

**Goal:** Make `buy-ip-now` template's winner an actual `ip_now` candidate (or, if no `ip_now` candidate is physically possible, exclude the template from the ranked list via its `gate`).

**Steps (read-only diagnostic first, no code change):**
A1. Write `script/sprint-fwl078-buy-ip-now-probe.ts` (read-only) that re-runs `generateQuickDecisionCandidates` for the buy-ip-now template against canonical inputs and prints, for each blueprint: `{ id, generated: bool, droppedBy: string | null, score: number | null, rank: number | null }`. This isolates whether `ip_now` is being dropped by a pre-rank gate or being scored low. **One probe run; no code change.**
A2. Based on A1's output:
   - If `ip_now` is dropped by an affordability gate that should not fire (e.g., misreads offset balance / borrowing capacity), fix the gate in `candidateGenerator.ts`.
   - If `ip_now` IS in `out.ranked` but the intent filter is skipping it (regex mismatch / id mismatch), fix `orchestrator.ts:297` to use exact-equal already (it does — `find((c) => t.intentFilter!(c.id))`). In that case the bug is in `mk()`-emitted ids vs scoreCandidate-emitted ids — verify candidate id stability.
   - If `ip_now` is physically impossible for this household (borrowing capacity = 0, no deposit available), tighten `buy-ip-now.gate` so the template doesn't appear in `templates` at all. This is the *honest* fix: don't show a template the household can't execute.
A3. Add a CI assertion that `winnerSelectedByIntentFilter === true` for every recommended scenario in the production smoke, OR the template's `gate` correctly excluded it. Prevents this from regressing silently.

**Acceptance:** Production smoke shows winner = `ip_now` for shahrokh-family-main (or `buy-ip-now` is gated out and a different template is recommended), `winner.events` contains a real `buy_property` delta with non-zero amount.

### Phase B — Fix the "empty journey" UX

**Goal:** Even when `winner.events` is small or distant, the Roadmap tab must show a coherent journey.

B1. Extend `actionRoadmapBuilder` to emit deterministic "wealth checkpoint" milestones derived from `winner.result.netWorthFan`: year-3, year-5, year-10, and the first year where median NW ≥ 50% of FIRE target. Status = `"checkpoint"`. Source = `derived.wealthFan`. Honesty rule: only emit when the fan has data for that year.
B2. Update `FireJourneyRoadmap.tsx` to render checkpoint pins distinctly (smaller, dotted line) so users can tell engine events from interpolated checkpoints.
B3. Add unit tests in `__tests__/actionRoadmapBuilder.test.ts` covering: zero engine events + valid fan → checkpoint-only journey; engine events + fan → mixed journey; empty fan → unchanged behaviour.

**Acceptance:** Even a defer-only template renders 4–6 milestones between Today and FIRE.

### Phase C — Fix the "doesn't explain HOW" UX

**Goal:** Each milestone surfaces a per-template execution checklist.

C1. Expand `ACTION_TEMPLATES` in `nextActionsBuilder.ts` to cover every `deltaType` in `labelForDelta()` (currently missing: equity-release, multi-IP ladder, refi rate-save, property deposit boost, rentvest, early-retire). Each entry: 2–4 verb-led prep actions.
C2. Add an `executionChecklist` field to `RoadmapMilestone` (built in the same pass as `labelForDelta`/`effectForDelta`) so the FireJourneyRoadmap card can render an expandable "How to execute" section directly, not just via the Actions tab.
C3. Add a "Dependencies" array to multi-step composite blueprints (`multi_ip_ladder`, `equity_release_ip`) so the UI can show sequencing (e.g., "Refinance must complete before IP2 deposit").

**Acceptance:** Every milestone in a typical Australian household plan has a non-fallback action checklist.

### Phase D — Verification (always last)

D1. Production smoke re-run, confirm: winner is intent-filter-faithful, `winner.events` is non-trivial, Roadmap has milestones, Actions has items, Timeline has non-duplicate cards.
D2. Capture preview screenshots: `sprint-fwl078_roadmap_desktop`, `_mobile`, `_actions_mobile`, `_timeline_mobile`.
D3. Write `FWL078_VERIFICATION.md` documenting before/after for each user-reported symptom.

---

## 4. Credit Estimate

Per-step rough estimate (each "step" ≈ one focused work session with read/edit/test):

| Phase | Steps | Comment |
|---|---|---|
| A | A1 probe (1 run), A2 fix (1–3 edits in candidateGenerator or scenarioTemplates), A3 CI assertion | Small, isolated. Probable single-file change after probe. |
| B | B1 builder change, B2 component update, B3 tests | Medium. New milestone status enum value, fan-reading helper, unit tests. |
| C | C1 templates table, C2 milestone field, C3 dependencies | Medium-large. Touches the milestone contract — affects Roadmap card, Actions panel, types file. |
| D | smoke + screenshots + writeup | Small. |

**Rough budget:** Phase A alone is the smallest viable fix and the one that directly addresses every user-reported symptom. **I recommend approving Phase A only first**, re-auditing the result, then deciding whether B and C are necessary. If the engine actually picks an `ip_now` winner with realistic `buy_property` / `property_deposit_boost` / `refinance` deltas, the user-perceived "empty roadmap" and "nothing scheduled" symptoms should resolve without B or C.

A conservative ceiling for Phase A: comparable to Sprint 31E (one investigative probe + one targeted fix + one test). Phases B + C combined are roughly Sprint-31A-sized.

---

## 5. Recommendation

1. **Approve Phase A only.** Run the read-only probe (A1) first, share its output, then choose between fixing the gate, fixing the candidate id, or tightening the template gate.
2. **Do not start B/C until A is verified in production.** Phase B/C address real gaps, but they may be partially masked by Phase A succeeding. Re-audit before committing more credits.
3. **No engine math, no new dependencies, no Goal Lab UI changes.** All changes stay in `candidateGenerator.ts`, `scenarioTemplates.ts`, `actionRoadmapBuilder.ts`, `nextActionsBuilder.ts`, and the `RoadmapMilestone` type.

**Awaiting approval before any code change.**
