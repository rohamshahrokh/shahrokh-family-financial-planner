# Sprint 29 — Action Roadmap Stabilization + Financial Consistency + Pro Timeline

**Status**: binding contract. The build subagent must follow this verbatim.

> "This sprint is NOT a UI beautification sprint." — Roham

Priority order (P0 → P9). **Do NOT start P5/P9 (Gantt / mobile) until P0/P1/P2/P3 acceptance tests are green.**

---

## Hard constraints (carried)

- No new MC / forecast / FIRE engines. **No new financial math.** Engine surfacing only.
- No new npm dependencies.
- No Supabase migrations / schema changes.
- No emojis in UI or commits.
- Typecheck stays ≤ 66 errors (current baseline 65).
- All existing 237 tests stay green. New tests added.
- No merge to main. No production. Preview only.
- No edits to Portfolio Lab or `/action-plan` (legacy, out of scope).

---

## §1 — Layer responsibilities (unchanged from Sprint 28B)

- Goal Lab = Diagnose
- Decision Lab = Compare
- Action Roadmap = Execute

The 8-section structure shipped in Sprint 28B is preserved. Sprint 29 fixes correctness, not structure.

---

## §2 — Decisions captured this sprint

| Decision | Resolution |
|---|---|
| Reconciliation gate scope | **Strict**: blocks S1 headline NW tile + S4 attribution chart + S5 Monte Carlo NW figures. Tolerance = 0.5%. |
| Mobile structure | **Tabs on mobile** (6 tabs: Summary / Roadmap / Timeline / Risks / Alternatives / Actions) + **full single-page view on desktop**. |

---

## §3 — P0: Financial Reconciliation Layer

### §3.1 New module

`client/src/lib/actionRoadmap/financialReconciliation.ts`

```ts
export type ReconciliationStatus = "PASS" | "FAIL" | "INSUFFICIENT_DATA";

export interface ReconciliationBreakdown {
  ppor:                number;  // sum of PPOR equity (marketValue - loanBalance) across PPOR properties
  investmentProperty:  number;  // sum of IP equity across non-PPOR properties
  etf:                 number;  // medianFinalState.etfBalance
  super:               number;  // superRoham + superFara
  cash:                number;  // medianFinalState.cash
  crypto:              number;  // medianFinalState.cryptoBalance
  otherAssets:         number;  // cars + iranProperty + otherAssets
  otherDebts:          number;  // medianFinalState.otherDebts (subtracted)
}

export interface ReconciliationResult {
  status: ReconciliationStatus;
  componentsSum: number;        // = ppor + ip + etf + super + cash + crypto + otherAssets - otherDebts
  headlineNW:    number;        // = fanP50AtHorizon (MC P50 terminal NW)
  deltaAbs:      number;        // = componentsSum - headlineNW
  deltaPct:      number;        // = deltaAbs / max(headlineNW, 1)
  tolerancePct:  number;        // 0.005 (0.5%)
  breakdown:     ReconciliationBreakdown;
  /** Plain-English audit message; mandatory when status === "FAIL". */
  message:       string | null;
}

export function reconcileTerminalNetWorth(input: {
  finalState: PortfolioState | null;
  fanP50AtHorizon: number | null;
}): ReconciliationResult;
```

### §3.2 Component classification rule (engine-faithful)

A property is PPOR iff `property.inLedger === true` (this is how `runScenarioV2` distinguishes the snapshot's residence from acquired investment properties — see runScenario.ts:147). All other properties are investment.

### §3.3 INSUFFICIENT_DATA cases

- `finalState === null` → status INSUFFICIENT_DATA, every breakdown component null, message `"No engine final state available."`
- `fanP50AtHorizon === null` → status INSUFFICIENT_DATA, message `"No MC P50 terminal value available."`
- Either above triggers the same UI blocking behavior as FAIL.

### §3.4 Gate behavior (S1 + S4 + S5)

When `status !== "PASS"`:

**S1 Executive Decision (`ExecutiveDecision.tsx`)** — the NW-at-FIRE tile renders `"Reconciliation failed"` (not the dollar amount). All other tiles (FIRE age, passive income, confidence) render normally. SourceChip carries `source: "reconciliationFailed"`.

**S4 Net Worth Attribution (`NetWorthAttribution.tsx`)** — renders an error card (NOT the chart):

```
"Financial reconciliation failed.
 Roadmap output blocked pending engine consistency."
```

with audit-mode panel showing full breakdown table, computed delta, raw component values, source field per row. `data-testid="ar-s4-reconciliation-error"`.

**S5 Monte Carlo Outlook (`MonteCarloOutlook.tsx`)** — Net Worth at FIRE column (all three percentiles) renders `"Reconciliation failed"`. FIRE age and Passive income columns render normally (they are not the contested quantity).

### §3.5 Tests

`client/src/lib/actionRoadmap/__tests__/financialReconciliation.test.ts`:

- pass case (componentsSum within 0.5% of headline)
- fail case (5% drift)
- INSUFFICIENT_DATA cases (null finalState; null fan)
- PPOR vs IP classification (single PPOR property; multi-IP portfolio)
- otherDebts subtraction
- breakdown completeness (every component present)

Minimum 8 tests.

---

## §4 — P1: Monte Carlo Variance Diagnostic

### §4.1 New module

`client/src/lib/actionRoadmap/mcVarianceDiagnostic.ts`

```ts
export interface DistributionStats {
  mean:     number | null;
  median:   number | null;
  std:      number | null;
  p5:       number | null;
  p25:      number | null;
  p50:      number | null;
  p75:      number | null;
  p95:      number | null;
  /** Coefficient of variation = std / |mean|. Null when mean is 0. */
  cv:       number | null;
  sampleN:  number;
}

export interface MCVarianceDiagnostic {
  terminalNetWorth: DistributionStats;
  fireAge:          DistributionStats;  // distribution across sims; sourced from per-sim NW crossing
  passiveIncome:    DistributionStats;  // = NW at fire × swrPct / 12 per sim
  warnings: Array<"mc-variance-suspiciously-low" | "mc-fire-age-spread-low" | "mc-passive-spread-low">;
  thresholds: {
    netWorthCv:   0.05;   // 5% CV minimum
    fireAgeStd:   0.5;    // 0.5 years std minimum
    passiveCv:    0.05;
  };
  source: "scenarioV2.monteCarlo.diagnostic";
}

export function computeMCVarianceDiagnostic(input: {
  terminalNwSamples: number[];   // ExtendedScenarioResult.terminalNwSamples
  fireNumber: number | null;
  swrPct: number | null;
  /** Per-sim NW path (medianNwPath alone is insufficient — need per-sim).
   *  Sourced from a new additive surface (see §4.3). */
  perSimNwPaths?: number[][];
  startAge: number | null;
}): MCVarianceDiagnostic;
```

### §4.2 Warning logic

- `terminalNetWorth.cv < 0.05` → `"mc-variance-suspiciously-low"`
- `fireAge.std < 0.5` (across sims) → `"mc-fire-age-spread-low"`
- `passiveIncome.cv < 0.05` → `"mc-passive-spread-low"`

### §4.3 Engine surface needs

`ExtendedScenarioResult` already exposes `terminalNwSamples: number[]` — sufficient for `terminalNetWorth` and `passiveIncome` stats (passive = terminalNw × swrPct / 12 per sim).

For per-sim FIRE age: the engine's `mc.terminalNw` array gives us terminal values but not the per-sim **path**. **For Sprint 29, scope the FIRE-age distribution to: derived from `terminalNwSamples` and the fan's P25/P50/P75 first-crossing months only.** This is honest — we report what the engine actually exposes. A full per-sim FIRE-age distribution requires deeper engine surfacing and is out of scope.

In `MCVarianceDiagnostic.fireAge`, when per-sim paths are not available, populate p25/p50/p75 from the fan crossing logic (same as `selectMonteCarloProjection`), set p5/p95/mean/std to null, set `sampleN = 3`, and emit `warnings.push("mc-fire-age-spread-low")` only when p25 == p50 == p75.

### §4.4 S5 UI

`MonteCarloOutlook.tsx` adds:
- An "audit panel" (only visible in audit mode) showing the full `DistributionStats` table for each variable.
- A non-intrusive warning chip on each affected card when a warning fires:
  - `"Variance suspiciously low — percentile bands may not be informative"`
  - Color: amber. SourceChip references `scenarioV2.monteCarlo.diagnostic`.

### §4.5 Deliverable

`SPRINT29_MC_VARIANCE_REPORT.md` — generated post-build from a live demo run. Contains the diagnostic JSON + interpretation.

### §4.6 Tests

`mcVarianceDiagnostic.test.ts`:
- All-equal sample → cv=0, warning fires
- Bimodal distribution → high std, no warning
- Empty samples → all stats null, sampleN=0
- Single sample → std=0, cv=0, warning fires
- Real-shape sample (10 numbers across a realistic NW range) → stats sane

Minimum 6 tests.

---

## §5 — P2: Roadmap Single-Path Purity

### §5.1 Invariant

> The roadmap belongs to ONE winning strategy. Every milestone must carry `sourceTemplateId === recommended.templateId`. Cross-contamination is forbidden.

### §5.2 Builder patch

In `client/src/lib/actionRoadmap/actionRoadmapBuilder.ts`:

1. Inspect every code path that adds a milestone. Confirm `sourceTemplateId` is set to the recommended template at construction.
2. Add a final filter step: `milestones = milestones.filter(m => m.sourceTemplateId === recommended.templateId)`.
3. If any milestone is filtered out, push a `warnings.push("Filtered cross-template milestone: ...")` to the result. The roadmap output type already carries `warnings: string[]`.

### §5.3 Invariant test

`actionRoadmapBuilder.test.ts` adds:

```ts
test("milestones never cross template boundaries", () => {
  const roadmap = buildActionRoadmap(rec, { targetFireAge: 55 }, 35);
  expect(roadmap.milestones.every(m =>
    m.sourceTemplateId === rec.templateId
  )).toBe(true);
});
```

Plus a regression test that injects a multi-template `picks` shape and asserts the roadmap rejects the cross-template entries.

### §5.4 Deliverable

`SPRINT29_ROADMAP_WIRING_REPORT.md` — listing the recommended template id, every milestone with its sourceTemplateId, and confirming the invariant.

---

## §6 — P3: Milestone 4-Delta + Zero-Filter

### §6.1 Type expansion

`client/src/lib/actionRoadmap/fireJourneyMilestones.ts`:

```ts
export interface FireJourneyMilestone {
  // existing fields preserved
  id: string;
  month: string;
  label: string;
  status: RoadmapMilestone["status"];
  sourceTemplateId: string;
  progressImpact: { before: number; after: number } | null;
  // NEW: 4-delta fields
  netWorthDelta:       number | null;   // $ change at milestone month vs prior milestone (P50 fan)
  fireProgressDelta:   number | null;   // pct points (already implied by progressImpact)
  passiveIncomeDelta:  number | null;   // $ change in implied passive income
  riskDelta:           "lower" | "higher" | "flat" | null;  // derived from analyzeRoadmapRisk before/after
}
```

### §6.2 Zero-delta filter

In `enrichFireJourneyMilestones`:

```ts
const hasMeasurableImpact = (
  (m.netWorthDelta != null && Math.abs(m.netWorthDelta) > 1) ||
  (m.fireProgressDelta != null && Math.abs(m.fireProgressDelta) > 0.001) ||
  (m.passiveIncomeDelta != null && Math.abs(m.passiveIncomeDelta) > 1) ||
  (m.riskDelta != null && m.riskDelta !== "flat")
);
return enriched.filter(m => m.status === "fire" || hasMeasurableImpact);
```

(FIRE marker is always kept regardless.)

### §6.3 UI — `FireJourneyRoadmap.tsx`

Each milestone card surfaces all 4 deltas in a compact 2×2 grid:

```
NW Δ: +$120k        FIRE Δ: 27% → 39%
PI Δ: +$420/mo      Risk Δ: lower
```

When a delta is null → render `"—"` (muted). When all four are null → milestone is already filtered out, so this case shouldn't fire.

### §6.4 Tests

Add to `fireJourneyMilestones.test.ts`:
- All-zero milestone is dropped
- FIRE marker preserved even with zero deltas
- 4-delta computation correctness (synthetic before/after states)

Minimum 4 new tests on top of existing 14 (target: 18).

---

## §7 — P4: Engine-Event Timeline

### §7.1 Engine surface (additive, read-only)

`client/src/lib/scenarioV2/runScenario.ts`:

1. Add `events?: ScenarioEvent[]` to `ExtendedScenarioResult` (optional for safety vs persisted shapes).
2. In the return object, add `events: events` (the already-computed sorted array at line 175).

This is the **same pattern as Sprint 28B's `medianFinalState`**: zero new math, zero new engine logic.

### §7.2 Timeline selector

`client/src/lib/actionRoadmap/engineEventTimeline.ts`:

```ts
export type EngineEventCategory =
  | "property" | "debt" | "cash" | "etf" | "super" | "exit" | "fire";

export interface EngineEvent {
  id: string;
  month: string;            // YYYY-MM
  category: EngineEventCategory;
  action: string;           // human-readable label
  expectedOutcome: string;  // derived from event type + payload
  netWorthImpact: number | null;
  riskImpact: "low" | "medium" | "high" | null;
  source: "scenarioV2.events";
  sourceEventType: ScenarioEventType;
}

export function selectEngineEventTimeline(input: {
  events: ScenarioEvent[] | undefined;
  fireMonth: string | null;
}): EngineEvent[];
```

### §7.3 Event-type → category mapping (verbatim)

```
contribution.offset_deposit  → cash
contribution.etf_dca         → etf
contribution.etf_lump        → etf
contribution.crypto_lump     → etf       (crypto rolled into the ETF lane for brevity)
debt.extra_repayment         → debt
debt.refinance               → debt
asset.buy_property           → property
asset.sell_property          → exit
asset.rentvest               → property
asset.cash_hold              → cash
income.*                     → DROPPED (not a roadmap milestone)
expense.*                    → DROPPED
macro.*                      → DROPPED
tax.*                        → DROPPED
debt.mortgage_payment        → DROPPED (recurring, not a milestone)
```

A synthetic FIRE event is appended when `fireMonth != null`: `category: "fire", action: "FIRE Reached"`.

### §7.4 Deduplication

Events occurring in the same month with the same category and same action are deduped (keep first).

### §7.5 Tests

`engineEventTimeline.test.ts`:
- Empty/undefined input → []
- All event types mapped correctly (one test per category)
- DROPPED categories not surfaced
- FIRE marker appended
- Same-month duplicates collapsed

Minimum 8 tests.

---

## §8 — P5: Professional Gantt

### §8.1 Component

`client/src/components/actionRoadmap/WealthTimelineGantt.tsx` is **replaced** (not extended). New file structure:

- Desktop (≥ sm): SVG horizontal Gantt
  - X-axis: year ticks from `startYear` to `fireYear + 1`
  - Y-axis: one row per category (in order: Property / Debt / Cash / ETF / Super / Exit / FIRE)
  - Each event = a rounded-rect bar centered at its month, width proportional to event "duration" (1 month default; multi-month events span their range)
  - Color by category (existing Tailwind palette: property=violet, debt=rose, cash=amber, etf=blue, super=teal, exit=fuchsia, fire=emerald)
  - Bar shows event action label inline when width allows; otherwise on hover/click
  - Click → opens a popover (Radix `<HoverCard>` already in repo) with full details: action, date, expected outcome, NW impact, risk impact, source

- Mobile (< sm): the existing vertical lane stack from Sprint 28B is preserved as the fallback. No regression.

### §8.2 Data source

The new Gantt reads from `roadmapContext.engineEvents: EngineEvent[]` (added to `RoadmapSectionProps`). The Sprint 28B `lanes` selector continues to power the mobile fallback.

### §8.3 No new deps

SVG generated inline. No chart library. (Same constraint as Sprint 28B.)

### §8.4 Tests

Snapshot/render assertions live in component tests if any; logic-level testing is covered by `engineEventTimeline.test.ts`.

---

## §9 — P6: Net Worth Contribution rewrite

### §9.1 New rendering (when reconciliation passes)

`client/src/components/actionRoadmap/NetWorthAttribution.tsx`:

Top row — three KPI tiles:
- Current NW (from `currentNetWorth`)
- Projected NW (from `attribution.componentsSum` after reconciliation passes)
- Delta ($ and %)

Middle — single stacked horizontal bar showing component shares (PPOR / IP / ETF / Super / Cash / Other).

Bottom — per-row table:
- Category | Contribution $ | Contribution % | Growth $ (= projected − current allocation)

Final callout: "Largest growth contributor: ETF (+$280k)".

### §9.2 Growth contribution computation

Requires knowing the initial allocation per category. Read from `recommended.winner.result.initialNetWorth` + `canonicalNetWorth` (already on the result) for the breakdown.

If initial breakdown is unavailable, the Growth column renders `"Not modelled yet"` per row — no fabrication.

### §9.3 When reconciliation fails

Per §3.4: renders the blocking error card only. The chart and table are not shown.

---

## §10 — P7: Alternative-Strategy Rationale

### §10.1 New selector

`client/src/lib/actionRoadmap/alternativeRationale.ts`:

```ts
export interface AlternativeRationale {
  reasons: Array<{
    sign: "+" | "-";
    text: string;
    axis: "nw" | "fireAge" | "survivability" | "risk" | "passive";
  }>;
}

export function buildAlternativeRationale(input: {
  recommended: GoalLabRankedScenario;
  alternative: GoalLabRankedScenario;
  recommendedMC: MonteCarloProjection;
  alternativeMC: MonteCarloProjection;
}): AlternativeRationale;
```

### §10.2 Axis comparisons

For each axis where the recommended outperforms the alternative meaningfully, append a `"+ ..."` reason. For axes where the alternative is better, append a `"- ..."` reason (transparency). Threshold for "meaningful":
- NW: |Δ| > 1% of recommended NW
- FIRE age: |Δ| > 0.25 years
- Survivability: |Δ| > 1 pct point
- Risk band: any band change

### §10.3 UI

`AlternativeStrategies.tsx` — each alternative row gains a "Why it's not recommended" expand-able block (always open on desktop, collapsed by default on mobile). Renders the reasons list.

### §10.4 Tests

`alternativeRationale.test.ts`:
- Recommended dominates on all axes → 4 "+" reasons
- Alternative wins on FIRE age only → 1 "-" + others "+"
- Tied scenario → empty reasons list
- Missing MC data → empty reasons list (no fabrication)

Minimum 5 tests.

---

## §11 — P8: Next Actions dedup + rebucket

### §11.1 Bucket names (per brief)

Rename in `nextActionsBuilder.ts`:
- `"this_month"` → `"next_30_days"` (label `"NEXT 30 DAYS"`)
- `"next_90_days"` stays
- `"next_12_months"` stays
- UI labels in `NextActionsPanel.tsx` updated accordingly.

### §11.2 Dedup rule

Inside `buildNextActions`:

```ts
const seen = new Set<string>();
const key = (it: NextActionItem) => `${it.title}::${it.sourceMilestoneId ?? "no-milestone"}`;
items = items.filter(it => {
  const k = key(it);
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
```

Plus: drop items whose source milestone was filtered by §6.2 zero-delta rule (i.e., the milestone is not in the final roadmap.milestones list). This requires `buildNextActions` to receive the **filtered** milestone array.

### §11.3 Tests

Add to `nextActionsBuilder.test.ts`:
- Duplicate title+milestone → single entry
- Same title across different milestones → kept (still distinct)
- Item whose milestone was filtered → dropped

Minimum 3 new tests (target: 19).

---

## §12 — P9: Mobile tabs wrapper

### §12.1 Tab structure

On mobile (< sm), `action-roadmap.tsx` wraps the 8 sections into 6 tabs using existing Radix `<Tabs>` primitive (already in repo). Mapping:

| Tab | Sections |
|---|---|
| Summary | S1 Executive Decision |
| Roadmap | S2 FIRE Journey Roadmap |
| Timeline | S3 Wealth Building Gantt (mobile fallback view) |
| Risks | S4 Net Worth Attribution + S6 Risks & Failure Points |
| Alternatives | S5 Monte Carlo Outlook + S7 Alternative Strategies |
| Actions | S8 Next Actions |

Note: this groups related sections per the brief's suggestion. The Risk tab pairs reconciliation/attribution (which can fail) with Risks. The Alternatives tab pairs MC outlook (the only place P25/P75 appear) with the comparison.

### §12.2 Desktop unchanged

`>= sm`: single vertical stack of 8 sections as in Sprint 28B.

### §12.3 Tabs persistence

Selected tab persisted to `sessionStorage` key `fwl.actionRoadmap.mobileTab` so a refresh doesn't lose state.

### §12.4 No-plan banner

The amber "Not modelled yet" banner from Sprint 28B continues to appear above the tabs (mobile) or above the sections (desktop) when no recommended plan exists.

---

## §13 — Reports to generate

The build subagent must write three markdown reports to `/home/user/workspace/fwl/`:

1. **`SPRINT29_RECONCILIATION_REPORT.md`** — for the demo dataset:
   - The recommended template id + label
   - The breakdown table (PPOR, IP, ETF, Super, Cash, Crypto, Other, Debts)
   - componentsSum, headlineNW (P50 at horizon), deltaAbs, deltaPct
   - Reconciliation status (PASS / FAIL / INSUFFICIENT_DATA)
   - If FAIL, root-cause hypothesis

2. **`SPRINT29_MC_VARIANCE_REPORT.md`** — for the demo dataset:
   - Full `DistributionStats` table for terminalNetWorth, fireAge, passiveIncome
   - Any warnings emitted
   - Interpretation: is variance plausible vs the engine's stochastic processes?

3. **`SPRINT29_ROADMAP_WIRING_REPORT.md`** — for the demo dataset:
   - `recommended.templateId`
   - Every milestone with `sourceTemplateId`
   - Proof of single-path purity (`milestones.every(m => m.sourceTemplateId === recommended.templateId)`)
   - List of any filtered milestones (with reason: "cross-template" or "zero-delta")

These reports must be generated from an actual `runGoalLabPlan` execution against the demo ledger, not handcrafted.

---

## §14 — Acceptance checklist

Sprint 29 is accepted only when all of these are true:

- [ ] Typecheck error count ≤ 66 (no new errors introduced)
- [ ] All 237 pre-existing tests still passing
- [ ] New tests: financialReconciliation (≥8), mcVarianceDiagnostic (≥6), engineEventTimeline (≥8), alternativeRationale (≥5), milestone 4-delta (≥4), nextActions dedup (≥3), roadmap purity (≥2) — minimum 36 new tests
- [ ] `SPRINT29_RECONCILIATION_REPORT.md` exists and is populated
- [ ] `SPRINT29_MC_VARIANCE_REPORT.md` exists and is populated
- [ ] `SPRINT29_ROADMAP_WIRING_REPORT.md` exists and is populated
- [ ] Branch `feat/sprint29-stabilization` exists, commits pushed, NOT merged
- [ ] Single-page-app render check: `/action-roadmap` renders all sections without crash for both PASS and FAIL reconciliation cases
- [ ] Mobile tabs functional; desktop full-view unchanged

---

## §15 — What NOT to do (still active)

- ❌ NO push to main / NO merge / NO production promote
- ❌ NO new MC / forecast / FIRE engines / NO new financial math
- ❌ NO Supabase migrations / schema changes
- ❌ NO new npm dependencies
- ❌ NO fake values — every null → "Not modelled yet" literal text
- ❌ NO emojis in UI or commits
- ❌ NO edits to Portfolio Lab or `/action-plan`
- ❌ NO touching pre-existing typecheck errors (~65 baseline)
- ❌ NO committing pre-existing untracked planning docs (`ENGINE_CONSOLIDATION_PLAN.md`, `GOAL_LAB_AND_ACTION_LAB_ARCHITECTURE.md`, `GOAL_LAB_UX_BRIEF.md`)
- ❌ NO touching the Goal Lab structure from Sprint 28B (Current Position / Confidence / Recommended Path Summary only)
