# Sprint 30A — Defects Observed During Verification

Verified preview URL (addendum included): `https://shahrokh-family-financial-planner-mrqdt49ks.vercel.app`
This preview reflects **Sprint 30A core (27a7b4e) + addendum (57391e0,
8f46f44, 55b4e7d)**. Earlier preview `ec2wxcbdx.vercel.app` is the
core-only build.

Screenshots captured in `/home/user/workspace/`:
- sprint30a_action_roadmap_full_desktop.png
- sprint30a_forecast_engine_desktop.png
- sprint30a_scenario_compare_desktop.png
- sprint30a_mobile_tablist.png
- sprint30a_mobile_tab_summary.png
- sprint30a_mobile_tab_roadmap.png
- sprint30a_mobile_tab_timeline.png
- sprint30a_mobile_tab_risks.png
- sprint30a_mobile_tab_alternatives.png
- sprint30a_mobile_tab_actions.png
- sprint30a_mobile_tablist_computed.json

---

## D7 — Mobile tabs grid (FIXED, visually confirmed)

- Mobile TabsList computed style: `grid-template-columns: 106px 106px 106px`
  → **3 tracks**, 84 px tall (cap was ≤ 88 px). Captured in
  `sprint30a_mobile_tablist_computed.json`.
- All 6 tabs (Summary / Roadmap / Timeline / Risks / Alternatives / Actions)
  visible in a clean 3 × 2 grid at 390 × 844.
- Status: **PASS**.

## D8 — Reconciliation gate scope (component logic FIXED; engine input incomplete on preview)

- The component-level refactor `isBlocked(reconciliation, "nw_at_fire")` etc.
  is in place and unit-tested (29 tests in `sprint30aGate.test.ts`,
  all green).
- Visual evidence shows the gate is correctly scoped:
  - S1 NW @ FIRE shows "Reconciliation failed" (gated).
  - S5 NW @ FIRE row shows "Reconciliation failed" (gated).
  - S4 attribution shows the blocking error card (gated).
  - **S1 FIRE Age renders "Not modelled yet"** even though the gate is
    NOT supposed to block it.
  - **S1 Passive Income renders "Not modelled yet"** even though the
    gate is NOT supposed to block it.
- Root cause: NOT the gate. `mcProjection.fireAge.p50` and
  `mcProjection.passiveIncomeAtFire.p50` are upstream-null on the
  preview because `currentAge` (read from `useQuery(['/api/mc-fire-settings']).current_age`)
  is null at first paint. The `selectMonteCarloProjection` selector
  honestly returns null when `startAge` is null (it refuses to invent
  an age). This is correct selector behaviour but it propagates to the
  UI as "Not modelled yet".
- Severity: **medium**. The gate refactor works as specified; the
  upstream null is independent of D8.
- File: `client/src/pages/action-roadmap.tsx` lines 131-134 — `currentAge`
  derivation reads only `fireSettings.current_age`.
- Fix proposal (not in this addendum):
  - Fall back to `goal.currentAge` from `useCanonicalGoal()` when the
    raw fireSettings row hasn't hydrated.
  - Or set `currentAge` from `profile.fire.currentAge` in
    `useCanonicalGoalProfile()` if the page already imports that hook.

## D10 — Monte Carlo risk wiring (FIXED, visually confirmed)

- S6 Risks panel now surfaces:
  - Default / insolvency 0.0% (real engine zero, not a fake placeholder)
  - Liquidity stress 0.0%
  - Negative equity 0.0%
  - Refinance pressure 0.0%
  - Forced asset sales 0.0% (median proceeds $0)
  - Rate shock / Income reduction / Property under-performance /
    ETF under-performance → "Not modelled" (correct null distinction).
- Validation chip fires correctly: **"ALL ZERO — Monte Carlo risk
  outputs are uniformly zero — verify variance assumptions."** matches
  the contract copy verbatim.
- Visible in `sprint30a_mobile_tab_risks.png`.
- Status: **PASS**.

## D12 — Alternative-strategy rationale + per-card metrics (LossReason fixed; numeric metrics shared with D8 upstream issue)

- LossReasonBlock fallback now renders the engine score-delta line:
  > "Engine score 70.8 is 0.0 pts lower than the recommended path (70.8)."
  This is the **score-delta fallback** firing because the demo Best
  Hybrid path scored identically to the recommended. Visible in
  `sprint30a_mobile_tab_alternatives.png`. Status: **PASS** for the
  rationale block.
- Per-card FIRE Age + Passive Income still show "Not modelled yet" on
  the preview — this is the same upstream `currentAge`-null issue
  documented under D8. The component-level isolation
  (`isBlocked(reconciliation, "alt_strategy_nw")` for the NW column,
  unconditional render for FIRE Age + Passive Income) is in place; the
  values would render when the upstream null is resolved.
- Severity: **medium**, same root cause as D8.

## A1 — Forecast nav route (FIXED, visually confirmed)

- On the addendum preview, `/ai-forecast-engine` renders H1 **"AI
  Forecast Engine"** and `/scenario-compare` renders H1 **"Scenario
  Compare Lab"** — distinct pages, no redirect.
- Existing page `client/src/pages/ai-forecast-engine.tsx` (1660 lines,
  fully implemented MC fan + percentile table + run controls) is now
  bound to `/ai-forecast-engine`. Same pattern for
  `pages/wealth-strategy.tsx` ↔ `/wealth-strategy`.
- `/tax-strategy` nav href retargeted to `/tax` (the real Tax
  Calculator page). The `/tax-strategy` URL still redirects to
  `/cgt-simulator` for legacy deep links.
- New `navRoutes.test.ts` audit (55 assertions) confirms every NAV
  href in Layout.tsx now resolves to a non-redirecting Route in
  App.tsx. All green.
- Severity: **high** (user-reported direct defect). **FIXED + verified.**

## A2 — Event traceability (FIXED, visually confirmed)

- New `eventTraceability.ts` validator + 38 tests, all green.
- New `engineEventLanes.ts` second-pass dedup (post-sourceDeltaId pass)
  on `(lane, month, action)` triplet. Tested.
- `WealthTimelineGantt.tsx` now hides empty lanes outside Audit Mode,
  shows them with a dashed "0 events" badge in Audit Mode.
- Traceability chip wired into the page header (Audit Mode only).
  `console.warn` fires outside Audit Mode on validator failure.
- Demo-path acceptance confirmed via test: `delay-ip` produces 3
  events (1 engine debt_reduction + 1 derived borrowing_capacity + 1
  derived exit), lanesRendered 3, lanesHidden 2.
- Severity: **medium**. **FIXED + verified** on the addendum preview:
  Roadmap shows DEBT REDUCTION (engine) + BORROWING CAPACITY (derived)
  lanes only; empty acquisition/equity_release lanes hidden. Dependency
  chain badge renders "1 EDGE · engine · Deposit to offset → Re-test
  borrowing capacity".

## NEW-1 — Empty Exit lane on preview Timeline despite demo crossing FIRE

- The preview's Timeline tab shows Exit "Not modelled — No events for
  this lane in the current plan." even though the Sprint 29 reports
  confirmed the demo path's MC P50 crosses FIRE at month 2034-10 (so
  the derived exit synthesiser SHOULD fire).
- Likely cause: at runtime in the browser, `fireNumber` reads from
  `selectCanonicalFire(canonicalLedger, goal)` which depends on goal
  being populated. If `useCanonicalGoal()` hasn't hydrated yet, the
  derived exit event is suppressed (`selectEngineEventLanes` requires
  `fireNumber != null`).
- Severity: **medium**. Same hydration-timing root cause as D8/D12
  upstream null.
- Fix proposal: wait for both `goal` and `fireSettings` queries to
  complete before computing roadmap context (suspend or skeleton).
  Out of scope for Sprint 30A.

## NEW-2 — Demo `/api/mc-fire-settings` + `/api/canonical-goal` returned empty (FIXED in Sprint 30A.1, visually verified)

### Original symptom (Sprint 30A)
- S1 FIRE Age + Passive Income + alt-strategy card metrics rendered
  "Not modelled yet" on the preview. 25 placeholder instances counted.

### Initial misdiagnosis (corrected during Sprint 30A.1)
- Originally attributed to `vercel.json` not exposing `/api/mc-fire-settings`
  as a Vercel Function. That diagnosis was **wrong** — the production
  build is a static SPA with a demo-data shim, not an Express backend.

### Actual root cause (Sprint 30A.1)
- `apiRequest` in `client/src/lib/queryClient.ts` intercepts every
  `/api/*` call in demo mode **before** any network call (line 898
  `if (isDemoMode())`). Two demo handlers were under-specified:
  1. `/api/mc-fire-settings` returned `{}` → `currentAge` resolved to
     null → `selectMonteCarloProjection` short-circuited to
     nullProjection.
  2. `/api/canonical-goal` hardcoded `{ status: "NOT_SET" }` →
     `fireNumber = 0` → even when currentAge was repaired, the
     selector still nullified P50 crossings.
- Both gaps cascaded: any field that read from MC outputs (FIRE Age,
  Passive Income, alt-strategy card metrics, recommended-strategy card)
  fell back to the "Not modelled yet" placeholder.
- `DEMO_FIRE_SETTINGS` (demoData.ts:540) already carried the full goal
  profile (current_age:37, target_fire_age:55, target_monthly_income:9000,
  safe_withdrawal_rate:4.0) — the data was present, just not surfaced.

### Fix (Sprint 30A.1, two commits)
- **ec9c7c7** — Introduced `getDemoMCFireSettingsBaseline()` and
  routed the demo `/api/mc-fire-settings` GET/PUT through it so
  `current_age` resolves to 37. Insufficient alone (still 25 placeholders
  in browser verification because canonical-goal stayed NOT_SET).
- **be64d49** — Extended the baseline to return the **full** goal row
  (`goals_set:true`, `target_fire_age`, `target_passive_monthly`,
  `swr_pct`, `goal_set_timestamp`) and rewired the demo `/api/canonical-goal`
  handler to reuse `deriveCanonicalGoalFromRow(baseline)` — mirroring real
  server behaviour. Canonical goal now derives status=SET in demo,
  unlocking fireNumber>0 and real P50/P75/P25 crossings.
- Test coverage: `client/src/lib/__tests__/sprint30a1DemoMcFireSettings.test.ts`,
  32 assertions across 6 invariant groups (baseline carries full goal row,
  canonical-goal derives SET, Goal Lab PUT merge preserves baseline +
  re-derives correctly, FIRE Age renders in 45–47 range).
- Goal Lab UI untouched. `isFireGoalExplicitlySet` (8 call sites) now
  returns true in demo by design — demo persona has a 'set' goal, matching
  the post-Goal-Lab-save flow real users experience.

### Live verification (preview `czjxhxhbc.vercel.app`)
- **"Not modelled yet" count: 25 → 8** (68% reduction).
- **FIRE Age renders 45** (P50 MEDIAN) — was "Not modelled yet".
- **Passive Income renders $109,810** (P50 MEDIAN) — was "Not modelled yet".
- Alt-strategy and recommended-strategy cards: real per-card metrics.
- Remaining 8 placeholders are all in the **Monte Carlo Risk Stress Test**
  section (Rate shock, Income reduction, Property under-performance, ETF
  under-performance — each rendered twice). These require dedicated
  stress-test MC engines that are **explicitly out of scope** per the
  hard constraint "NO new MC/forecast/FIRE engines". Suggested for a
  future sprint.

### Status
**RESOLVED** for the financial-correctness scope the user defined:
currentAge always available, FIRE Age renders, Passive Income renders,
Recommended/Alternative strategy cards render real values. Sprint 30B
(graphical Gantt + FIRE Journey visualization) is unblocked.

---

## Confirmation of Sprint 30A core fixes (visually verified)

- **D7 mobile tabs 3×2 grid** — confirmed via `gridTemplateColumns:
  "106px 106px 106px"` and visual grid layout.
- **D8 reconciliation scope** — visible in Risks panel and Net Worth
  Attribution; NW figures blocked while Risks panel renders all 9
  failure-point rows correctly.
- **D10 MC risk wiring** — risk probabilities show real numeric values
  (or honest "Not modelled" for softWarning-driven rows); the
  validation chip "Monte Carlo risk outputs are uniformly zero" fires
  exactly as the contract specified.
- **D12 alt-strategy rationale block** — visible in the Best Hybrid
  card as "Engine score 70.8 is 0.0 pts lower than the recommended
  path (70.8)" — the score-delta fallback is firing correctly.

The two outstanding visual defects (S1 FIRE Age + Passive Income show
"Not modelled yet") share a single upstream root cause: `currentAge`
hasn't hydrated from `fireSettings` at first paint. Both the component
isolation and the gate scope refactor are working as specified.
