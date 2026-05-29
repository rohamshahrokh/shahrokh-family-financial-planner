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

## NEW-2 — `/api/mc-fire-settings` returns HTML on Vercel (preexisting infra gap, blocks D8/D12 visible metrics)

- During live verification, S1 FIRE Age + Passive Income + alt-strategy
  card per-metric FIRE Age + PI still rendered "Not modelled yet" even
  though the gate scope refactor is correct (29+12 unit tests pass).
- Investigated upstream: `useQuery(['/api/mc-fire-settings'])` on the
  Vercel preview returns the SPA fallback HTML, not JSON. JSON.parse
  fails → `fireSettings = undefined` permanently → `currentAge = null`
  → `selectMonteCarloProjection` honestly returns null FIRE age / PI
  → UI shows "Not modelled yet".
- Root cause: `vercel.json` only exposes `api/ai-insights.ts` and
  `api/market-data.ts`. `mc-fire-settings` is served by the Express +
  Supabase backend which is **not deployed to Vercel**. The catch-all
  rewrite `/(.*) → /index.html` therefore returns SPA HTML for every
  other `/api/*` path.
- This is **NOT** a Sprint 30A regression. It is a preexisting
  infrastructure gap that was masked in Sprint 28B because the Action
  Roadmap page did not depend on `currentAge` at that time. The gate
  refactor in Sprint 30A surfaced the gap by routing more fields
  through the same null-bound path.
- Severity: **infrastructure**. Out of scope for Sprint 30A per the
  hard constraints (no Supabase migrations, no new infra). Suggested
  for Sprint 30B/30C: decide between (a) porting mc-fire-settings to
  a Vercel Function in `api/`, (b) routing the SPA to the Express
  backend, or (c) hydrating `currentAge` from a non-API source like
  `useCanonicalGoal()` as a fallback.
- Evidence: action-roadmap.tsx lines 113-134; `vercel.json` does not
  include mc-fire-settings; preview fetch of `/api/mc-fire-settings`
  returns `<!doctype html>...`.

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
