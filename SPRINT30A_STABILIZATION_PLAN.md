# Sprint 30A — Reconciliation Scope Fix + Engine-Driven Roadmap Wiring

Parent: feat/sprint28-move-refactor
Predecessor commit: d7eb3ab (Sprint 29)
Predecessor defects: D7, D8, D10, D12 (from SPRINT29_DEFECTS.md)
Status: BINDING CONTRACT. No new engines. No new MC math. No new npm deps. No
Supabase migrations. No merge. No production. Preview only.

---

## User instructions (verbatim, May 29 2026)

> "Do not merge. Fix D7, D8, D10 and D12 first."
>
> "Additionally, the Action Roadmap still does not satisfy the original
> product vision. The current Timeline is a data dump rather than a
> decision engine output."
>
> "I do not want category cards showing: Property — / Debt — / Cashflow —"
>
> "Required outcome:
> 1. Engine-generated milestone sequence.
> 2. Each milestone must include: action / date / financial impact /
>    FIRE impact / risk impact / net worth impact
> 3. Build a real Gantt-style wealth journey.
> 4. Build a graphical FIRE journey from Today to FIRE.
> 5. Show why each milestone exists.
> 6. Show dependency chains between milestones.
> 7. Surface borrowing-capacity events, equity-release events, acquisition
>    events, debt-reduction events and exit events.
> 8. Alternative strategies must include full trade-off analysis.
> 9. Risk section must validate Monte Carlo risk outputs instead of
>    defaulting to near-zero values.
> 10. Action Roadmap should function as a financial operating system,
>     not a reporting page."

> "After engine consistency and wiring are fixed, move to the final UX
> phase and replace the current timeline with a professional graphical
> roadmap and Gantt-style wealth journey."

---

## Sprint split (user-decided)

- **Sprint 30A (this contract)**: D7/D8/D10/D12 fixes + engine-event lane
  wiring + derived-event synthesizer + hybrid dependency chain + alt-strategy
  trade-off + MC risk validation. No graphical rewrite.
- **Sprint 30B (next)**: graphical Gantt SVG rewrite + graphical FIRE
  journey Today→FIRE. Preview separately.

This contract covers 30A only.

---

## Scope decisions (user-locked)

1. **Reconciliation gate scope** = **NW-only + alt-strategy NW**.
   Gate blocks: S1 NW@FIRE tile, S4 attribution chart, S5 NW@FIRE P25/P50/P75
   row, S7 alt-strategy NW columns.
   Gate does NOT block: S1 FIRE Age, S1 Passive Income, S1 Confidence,
   S5 FIRE Age percentiles, S5 Passive Income percentiles, S6 Risks,
   S7 alt-strategy FIRE Age + Passive Income + lossReason, S8 Next Actions.
2. **Event coverage** = **All 5 lanes with Audit Mode source-per-event**.
   Each lane labels each event as `engine` (emitter present today) or
   `derived` (computed from MC trajectory). Audit Mode shows the formula
   for derived events.
3. **Dependency chain** = **Hybrid**. Prefer engine `sourceDeltaId`; fall
   back to temporal + lane heuristic for events without explicit linkage.
   Audit Mode labels each dependency edge `engine` or `heuristic`.

---

## P0 — Fix D7 (Mobile Tabs grid)

**Defect**: `<TabsList>` class `grid-cols-3` resolves to `gridTemplateColumns: "326px"`
(1 column) because shadcn base TabsList style declares `grid-cols-2` and
the cn() merge does not override. 6 tabs stack as 6 rows × 1 col, taking
196 px of vertical space at top of every tab view.

**Required**:
- Force `grid-cols-3` to apply by using inline `style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}` on the TabsList element in `client/src/pages/action-roadmap.tsx`, OR
- Replace TabsList class with a custom div carrying the same role + Radix data attrs
  with an explicit Tailwind utility that wins (e.g. `[grid-template-columns:repeat(3,minmax(0,1fr))]` arbitrary value)
- Visual: 3 columns × 2 rows on mobile. Each tab button height ≥ 36 px,
  text not truncated, full 6 tabs visible without scrolling.
- Verify computed `gridTemplateColumns` is 3-track in DOM inspection.
- Desktop unchanged.

**Acceptance**:
- Mobile tab list height ≤ 88 px (was 196 px).
- All 6 tabs visible without scrolling on iPhone 14 (390 × 844).
- Computed style `gridTemplateColumns` contains 3 tracks.

---

## P0 — Fix D8 (Reconciliation gate scope)

**Defect**: when reconciliation fails (delta > 0.5 %), the entire
roadmap cascades to "Not modelled yet" — FIRE Age, Passive Income, Risks,
Alt-strategy metrics, Next Actions all wiped. Contradicts contract:
"S5 FIRE age + Passive income continue to render (not the contested quantity)".

**Required**:
- Reconciliation gate exposes a `blockedFields: Set<'nw_at_fire' | 'attribution_chart' | 'alt_strategy_nw'>`
  instead of a global "blocked" boolean.
- Component-level guard reads `blockedFields.has('nw_at_fire')` etc.
- Components that read the result MUST NOT short-circuit on reconciliation
  status alone. They render their own values unless their specific field
  is in `blockedFields`.

**Files**:
- `client/src/lib/actionRoadmap/financialReconciliation.ts` — return
  `{ status, componentsSum, mcP50, deltaAbs, deltaPct, blockedFields }`.
- `client/src/components/actionRoadmap/ExecutiveDecision.tsx` — render
  FIRE Age, Passive Income, Confidence regardless of reconciliation.
  Only NW@FIRE tile reads `blockedFields.has('nw_at_fire')`.
- `client/src/components/actionRoadmap/MonteCarloOutlook.tsx` — render
  FIRE Age P25/P50/P75 and Passive Income P25/P50/P75 unconditionally.
  Only the NW@FIRE row reads `blockedFields.has('nw_at_fire')`.
- `client/src/components/actionRoadmap/NetWorthAttribution.tsx` — read
  `blockedFields.has('attribution_chart')`.
- `client/src/components/actionRoadmap/AlternativeStrategies.tsx` — render
  alt FIRE age + passive income unconditionally; only NW columns read
  `blockedFields.has('alt_strategy_nw')`.

**Acceptance**:
- With reconciliation FAIL (current demo: 1.04 % drift), on preview:
  - S1 FIRE Age shows engine P50 value (numeric, not "Not modelled yet").
  - S1 Passive Income shows engine P50 value.
  - S1 NW@FIRE shows "Reconciliation failed" + tolerance text.
  - S5 FIRE Age row: P25/P50/P75 all numeric.
  - S5 Passive Income row: P25/P50/P75 all numeric.
  - S5 NW@FIRE row: blocked.
  - S7 alt cards: FIRE age + PI numeric; NW columns blocked.
- Existing reconciliation tests stay green.
- Add 4 new tests verifying selective field-blocking behaviour.

---

## P0 — Fix D10 (MC risk wiring)

**Defect**: S6 Risks shows all categories at 0.0 % even though MC engine
output (`ExtendedScenarioResult`) carries non-zero probabilities for
`negativeEquityProbability`, `liquidityStressProbability`,
`refinancePressureProbability`, `defaultProbability`, plus `forcedSaleReport`
counts. Wiring is reading the wrong path or null-guarding to 0.

**Required**:
- `client/src/components/actionRoadmap/RisksPanel.tsx` (or current file)
  must read directly from `result`:
  - Default / insolvency ← `result.defaultProbability ?? null`
  - Liquidity stress ← `result.liquidityStressProbability ?? null`
  - Negative equity ← `result.negativeEquityProbability ?? null`
  - Refinance pressure ← `result.refinancePressureProbability ?? null`
  - Forced asset sales ← `result.forcedSaleReport.probability ?? null` (verify exact path)
- When the field is **null** (engine did not compute it), render
  "Not modelled" instead of 0.0 %.
- When the field is **0**, render "0.0 %" honestly (no fake floors).
- **Validation block at top of S6** (per user requirement 9): if all 5
  probabilities are zero AND `result.mcSimulationCount >= 50`, show an
  inline warning chip: "Monte Carlo risk outputs are uniformly zero —
  verify variance assumptions." This is informational only, does not block.
- Audit Mode reveals raw probability values to 4 decimal places.

**Acceptance**:
- Preview shows real MC risk probabilities (non-zero where engine
  computed them).
- Validation warning fires ONLY when all 5 are exactly zero with sufficient
  sim count.
- Tests: ≥ 6 new tests covering null vs zero vs non-zero rendering.

---

## P0 — Fix D12 (Alternative strategies rationale + metrics)

**Defect**: S7 alt-strategy cards show "Not modelled yet" for FIRE Age,
NW@FIRE, Passive Income on both Recommended and Best Hybrid cards. No
`lossReason` rationale text rendered. Cascading null-guard.

**Required**:
- `client/src/components/actionRoadmap/AlternativeStrategies.tsx` reads
  each scenario's own `result` object (not the recommended result).
- Per card render:
  - FIRE Age (P50): from `scenario.result.fireMetrics.medianFireAge`
    (or engine equivalent — verify path)
  - Passive Income (P50): from `scenario.result.passiveIncomeP50`
  - NW@FIRE (P50): from `scenario.result.terminalNwP50` IF
    `!blockedFields.has('alt_strategy_nw')`; else "Reconciliation failed"
  - `lossReason` rationale block: render `scenario.lossReason` text below
    the metrics. If absent, render `scenario.rank` + `scenario.score`
    delta vs recommended.
- Reuse `alternativeRationale.ts` library built in Sprint 29.

**Acceptance**:
- Both alt-strategy cards on preview show numeric FIRE Age + Passive Income.
- NW@FIRE column shows engine value (gate-permitting) or "Reconciliation failed".
- A rationale block renders below metrics on every alt card.
- Tests: 4 new tests covering rationale rendering with present / missing lossReason.

---

## P1 — Engine-event Gantt lane wiring (5 lanes)

**User requirement 7**: "Surface borrowing-capacity events, equity-release
events, acquisition events, debt-reduction events and exit events."

**Required**: new library
`client/src/lib/actionRoadmap/engineEventLanes.ts` returning:

```ts
type Lane = "acquisition" | "equity_release" | "debt_reduction" | "borrowing_capacity" | "exit";
type LaneEvent = {
  lane: Lane;
  month: MonthKey;
  action: string;          // user-facing label
  source: "engine" | "derived";
  derivationFormula?: string;   // present when source === "derived"
  sourceDeltaId: string | null;
  rawEventType?: ScenarioEventType;
  impact: {
    netWorthDelta: number | null;
    fireImpactMonths: number | null;
    passiveIncomeDelta: number | null;
    riskDirection: "lower" | "neutral" | "higher" | null;
  };
  whyItExists: string;  // user-facing rationale
};
```

### Lane mapping rules

| Lane | Engine source (preferred) | Derived fallback |
|---|---|---|
| acquisition | `asset.buy_property`, `asset.sell_property`, `asset.rentvest` | none |
| equity_release | `debt.refinance` (with cash-out payload) | none |
| debt_reduction | `contribution.offset_deposit`, `debt.extra_repayment` | none |
| borrowing_capacity | none today | Synthesize from median sim: at months where (income change ≥ 5 %) OR (offset balance > 80 % of purchase target). Formula stored in `derivationFormula`. |
| exit | none today | Synthesize at FIRE-crossing month from MC P50 fan. Formula: "Month where median NW first ≥ FIRE target × 25 multiplier". |

### Impact computation
- `netWorthDelta`: difference in median sim NW at event month vs previous engine-output month. If null trajectory, leave null.
- `fireImpactMonths`: delta in FIRE-crossing month vs no-event counterfactual. **Compute from existing engine output only** — do NOT re-run MC. If counterfactual unavailable, null + Audit Mode disclosure.
- `passiveIncomeDelta`: median passive income at +12 months post-event minus pre-event. If unavailable, null.
- `riskDirection`: heuristic from event type. `asset.buy_property` → higher; `contribution.offset_deposit` → lower; `debt.extra_repayment` → lower; `debt.refinance` → neutral (or lower if cash-out reduces serviceability ratio).

### Why-it-exists rationale
- For engine events: render the engine emitter rationale (from delta description).
- For derived events: render the derivation formula in plain language.

### Files
- New library: `client/src/lib/actionRoadmap/engineEventLanes.ts`
- New tests: `client/src/lib/actionRoadmap/__tests__/engineEventLanes.test.ts`
  (≥ 20 tests covering each lane, source labelling, impact nullability)
- Existing `engineEventTimeline.ts` (Sprint 29) stays as the raw-event surface
  for Audit Mode. The new `engineEventLanes.ts` is the lane-categorized
  surface for S3 Timeline.

### Acceptance
- For demo path `delay-ip`:
  - acquisition lane: 0+ events (depends on engine emission)
  - equity_release lane: 0+ events
  - debt_reduction lane: ≥ 1 event (offset deposit from Sprint 29 milestone)
  - borrowing_capacity lane: ≥ 1 derived event (post-deposit re-test)
  - exit lane: 1 derived event at FIRE-crossing month
- Each event carries `source` label and full impact bundle.
- Lane events feed S3 Timeline component (still card-list in 30A;
  graphical Gantt is 30B).

---

## P1 — Hybrid dependency chain

**User requirement 6**: "Show dependency chains between milestones."

**Required**: new library
`client/src/lib/actionRoadmap/milestoneDependencies.ts`:

```ts
type DependencyEdge = {
  fromMilestoneId: string;
  toMilestoneId: string;
  source: "engine" | "heuristic";
  rationale: string;
};

function buildDependencyChain(
  milestones: Milestone[],
  events: ScenarioEvent[]
): DependencyEdge[];
```

### Rules
1. **Engine pass**: for each milestone with non-null `sourceDeltaId`,
   look for predecessor milestones whose event chain leads to the same
   `sourceDeltaId`. Add edge with `source: "engine"`.
2. **Heuristic pass**: for each pair (M_i, M_{i+1}) ordered temporally
   with no engine edge yet, apply cross-lane rules:
   - debt_reduction → borrowing_capacity (within 6 months) ⇒ edge
   - borrowing_capacity → acquisition (within 12 months) ⇒ edge
   - acquisition → debt_reduction (within 24 months) ⇒ edge (offset cycle)
   - debt_reduction → equity_release (within 36 months) ⇒ edge
   - any milestone → exit (always last) ⇒ edge if exit exists
3. Edges are dedup'd. Engine edges take precedence when both apply.

### Files
- New library + tests (≥ 12 tests covering each rule).
- Consumed by S2 FIRE Journey Roadmap (existing component).

### Acceptance
- Demo path produces ≥ 1 dependency edge between visible milestones.
- Audit Mode reveals edge source + rationale text on hover.
- 30B will wire this into the graphical Gantt arrows.

---

## P1 — MC risk validation block

**User requirement 9**: "Risk section must validate Monte Carlo risk
outputs instead of defaulting to near-zero values."

**Required**:
- New helper `client/src/lib/actionRoadmap/mcRiskValidation.ts`:
  ```ts
  function validateMcRiskOutputs(result: ExtendedScenarioResult): {
    status: "ok" | "warning";
    warningKind?: "all_zero" | "all_null" | "insufficient_sims" | "below_threshold";
    detail: string;
  };
  ```
- Rules:
  - `insufficient_sims`: `mcSimulationCount < 50` ⇒ warning
  - `all_null`: every risk probability is null ⇒ warning
  - `all_zero`: every probability is exactly 0 with ≥ 50 sims ⇒ warning
    "Monte Carlo risk outputs are uniformly zero — verify variance assumptions."
  - `below_threshold`: passive income CV < 5 % AND terminalNW CV < 5 %
    ⇒ warning "MC variance suspiciously low across all percentiles."
- Renders as a chip at top of S6 Risks panel. Does NOT block rendering.
- Audit Mode exposes the raw counts + CV values.

### Files
- New library + tests (≥ 10 tests covering each warning kind + the OK path).

### Acceptance
- Validation chip renders correctly for demo path (likely `ok` given
  Sprint 29 report showed 18 % CV).
- Tests cover each warning branch.

---

## Out of scope (Sprint 30A)

- No graphical Gantt SVG (deferred to 30B).
- No graphical FIRE journey Today→FIRE diagram (deferred to 30B).
- No new MC math · No new FIRE engine math · No new forecast engine.
- No engine work to fix the underlying 1.04 % reconciliation drift
  (medianFinalState vs fan P50). The gate continues to surface it.
- No Goal Lab changes.
- No Supabase migrations · No new npm deps · No emojis · No production deploy.

---

## Hard caps

- Typecheck error count: ≤ 66 (current baseline 65).
- All existing tests must remain green.
- New tests added: target ≥ 56 (4 D8 + 6 D10 + 4 D12 + 20 lanes + 12 deps + 10 risk-val).
- Preview deploy only. No merge. No production.

---

## Deliverable

- Branch: `feat/sprint28-move-refactor` (continue commits there)
- Commit message prefix: `sprint30a:`
- Reports to produce:
  - `SPRINT30A_FIX_VERIFICATION.md` — D7/D8/D10/D12 fix confirmation
    with screenshot evidence references
  - `SPRINT30A_LANE_COVERAGE.md` — per-lane event count + source
    breakdown for demo path
  - `SPRINT30A_DEPENDENCY_CHAIN.md` — edges produced for demo path
    with source labels
- Final summary: commit SHA, typecheck count, test counts (pre/post),
  Vercel preview URL, screenshots desktop + mobile 6 tabs.
- Browser verify desktop (1440×900) + iPhone 14 (390×844) using
  Playwright via js_repl with the SPA navigation pattern documented
  in Sprint 29 (demo login → /decision-lab → Run plan → SPA-click
  /action-roadmap link). Direct page.goto on /action-roadmap loses
  the in-memory plan cache; do not use it.
- DO NOT MERGE. DO NOT DEPLOY TO PRODUCTION. Preview only.
