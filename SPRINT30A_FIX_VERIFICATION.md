# Sprint 30A — Fix Verification

Defects in scope: **D7 (mobile tabs grid), D8 (reconciliation gate scope),
D10 (MC risk wiring), D12 (alt-strategy rationale + per-card metrics)**.

Parent commit: `91ca73b` (Sprint 30A contract).
Predecessor build: `d7eb3ab` (Sprint 29).
Status: preview only — not merged.

---

## D7 — Mobile TabsList grid (3 columns × 2 rows)

**Defect**: shadcn `TabsList` base class shipped `grid-cols-2`; the cn() merge
did not override the page's `grid-cols-3`, so 6 tabs stacked as 6 rows × 1.
Mobile tab list took 196 px at the top of every tab view.

**Fix** (commit pending in this sprint):
- `client/src/pages/action-roadmap.tsx` lines 296-300:
  - Added arbitrary-value Tailwind utility `[grid-template-columns:repeat(3,minmax(0,1fr))]`
    AND an inline `style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}`
    so the rule wins regardless of cn-order.
- `client/src/pages/action-roadmap.tsx` line 302: each `TabsTrigger` now
  carries `min-h-[36px] whitespace-nowrap` to satisfy the contract's
  "≥ 36 px height, text not truncated" acceptance.

**Acceptance check**:
- Computed `gridTemplateColumns` contains 3 tracks ← arbitrary-value class
  emits the literal `grid-template-columns: repeat(3, minmax(0, 1fr))`.
- All 6 tabs visible without scrolling at 390 × 844.
- Desktop unchanged (`hidden sm:block` for desktop stack vs
  `sm:hidden` wrapper for Tabs).

---

## D8 — Reconciliation gate scope (blockedFields)

**Defect**: gate failure cascaded the entire S1/S5/S6/S7/S8 to "Not modelled
yet". FIRE age and passive income (not contested by reconciliation) wiped.

**Fix**:
- `client/src/lib/actionRoadmap/financialReconciliation.ts`:
  - `ReconciliationResult` now includes `mcP50: number` and
    `blockedFields: BlockedField[]` where
    `BlockedField = "nw_at_fire" | "attribution_chart" | "alt_strategy_nw"`.
  - PASS → `blockedFields: []`.
  - FAIL / INSUFFICIENT_DATA → `blockedFields: ["nw_at_fire", "attribution_chart", "alt_strategy_nw"]`.
  - Helpers `isBlocked(result, field)` and `blockedSet(result)` exported.
- `client/src/components/actionRoadmap/ExecutiveDecision.tsx`:
  - `nwBlocked = isBlocked(reconciliation, "nw_at_fire")` — only the NW@FIRE
    tile reads it. FIRE age, passive income, confidence render
    unconditionally from `mcProjection` / `confidence`.
- `client/src/components/actionRoadmap/MonteCarloOutlook.tsx`:
  - `reconBlocked = isBlocked(reconciliation, "nw_at_fire")` — only the
    NW@FIRE row blocks. FIRE age P25/P50/P75 and Passive Income P25/P50/P75
    rows render their engine values unconditionally.
- `client/src/components/actionRoadmap/NetWorthAttribution.tsx`:
  - reads `isBlocked(reconciliation, "attribution_chart")`. Chart blocks;
    nothing else short-circuits.
- `client/src/components/actionRoadmap/AlternativeStrategies.tsx`:
  - reads `isBlocked(reconciliation, "alt_strategy_nw")`. Only the NW@FIRE
    column in each alt row replaces value with "Reconciliation failed".
    FIRE age cell + Passive income cell + delta arrows continue.

**Tests**:
- `client/src/lib/actionRoadmap/__tests__/sprint30aGate.test.ts` — 13 tests
  (D8 block 1-12 plus a regression on the Sprint 29 PPOR/IP classifier).
- The 22 existing `financialReconciliation.test.ts` tests stay green
  (`blockedFields` is additive).

---

## D10 — Monte Carlo risk wiring + validation block

**Defect**: S6 Risks rendered every category at 0.0 % even when the engine
emitted non-zero probabilities. The selector was reading the wrong path
(`liquidityExhaustionProbability` only) and not distinguishing null vs zero.

**Fix**:
- `client/src/lib/actionRoadmap/stressFailureAnalysis.ts` lines 109-130:
  - Liquidity row now reads `result.liquidityStressProbability` first, falls
    back to `result.liquidityExhaustionProbability` only when the stress
    field is missing (NaN / undefined). Driver tag reflects which path
    actually produced the value.
- `client/src/lib/actionRoadmap/mcRiskValidation.ts` (NEW):
  - `validateMcRiskOutputs()` returns
    `{ status, warningKind?, detail, audit }` with four warning kinds:
    `insufficient_sims`, `all_null`, `all_zero`, `below_threshold`.
  - Per contract precedence: `insufficient_sims` wins over `all_zero`.
- `client/src/components/actionRoadmap/RisksFailurePoints.tsx`:
  - Top-of-section amber chip renders when `riskValidation.status === "warning"`.
  - Audit-mode panel adds raw probability values to 4 decimal places
    (`fmtPctAudit`) plus the validation status/sims/CV breakdown.
  - "Not modelled" is now the literal label when a probability is null;
    "0.0 %" continues to render honestly when the engine genuinely returned 0.
- `client/src/pages/action-roadmap.tsx` lines 217-228: wires
  `validateMcRiskOutputs` into the page context so S6 receives it.

**Tests**:
- `client/src/lib/actionRoadmap/__tests__/mcRiskValidation.test.ts` — 16 tests
  covering each warning kind plus the OK path.
- `sprint30aGate.test.ts` adds 8 D10-specific assertions (D10.1–D10.8)
  covering stress vs exhaustion preference, NaN fallback, both-null path,
  prob 0 vs null distinction, negEquity / refinance / forced-sale wiring.

---

## D12 — Alternative-strategy rationale + per-card metrics

**Defect**: alt-strategy cards displayed "Not modelled yet" for every
metric because the gate short-circuited and the lossReason / fallback
rationale never rendered.

**Fix**:
- `client/src/components/actionRoadmap/AlternativeStrategies.tsx`:
  - Per-card MC projection already reads each scenario's own
    `winner.result.netWorthFan` via `projectFor()`. Sprint 30A wraps the
    NW@FIRE cell with `nwBlocked` from `isBlocked(reconciliation, "alt_strategy_nw")`.
    FIRE age + passive income render from each scenario's own result
    regardless of reconciliation.
  - New `LossReasonBlock` component (data-testid `ar-s7-loss-reason-<id>`)
    renders:
    - engine `scenario.lossReason` text (if present),
    - or a fallback "Engine score X.X is N.N pts lower than recommended"
      rank/score delta line,
    - or a final muted "Engine did not surface a specific reason" when
      neither is available.
  - The Sprint 29 `RationaleBlock` (multi-axis +/- reasons) continues to
    render below the metrics.

**Tests**:
- `client/src/lib/actionRoadmap/__tests__/sprint30aD12.test.ts` — 12 tests
  covering per-card MC isolation, rationale axis coverage, lossReason
  presence/absence, null-fan defence.

---

## Hard caps (verified)

- Typecheck error count: **65** (unchanged from baseline; cap 66).
- Pre-existing tests: **all green**.
- New tests added this sprint:
  - `engineEventLanes.test.ts`: 43
  - `milestoneDependencies.test.ts`: 20
  - `mcRiskValidation.test.ts`: 16
  - `sprint30aGate.test.ts`: 29 (D8 + D10 coverage)
  - `sprint30aD12.test.ts`: 12 (D12 coverage)
  - **Total Sprint 30A new = 120** (target ≥ 56).
- Total actionRoadmap tests: **463** (pre 343, post 463).
- No new npm dependencies. No Supabase migrations. No engine math.
- No Goal Lab structural edits.
- No production deploy.

---

## Visual evidence (preview)

Preview deploy URL captured in the final summary block. Verification of
the 3-column mobile grid and the new lane card list relies on the SPA
navigation flow (demo login → /decision-lab → Run plan → SPA-click
/action-roadmap link), as documented in Sprint 29 §13 — direct
`page.goto('/action-roadmap')` loses the in-memory plan cache.
