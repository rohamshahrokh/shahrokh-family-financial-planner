# Sprint 30A — Addendum

Parent contract: SPRINT30A_STABILIZATION_PLAN.md (commit 91ca73b)
Base build: commit 27a7b4e (Sprint 30A core build, 463 tests, 65 TS errors)
Preview deployed: https://shahrokh-family-financial-planner-ec2wxcbdx.vercel.app

User added two requirements at 2026-05-29 20:19 AEST. These are additive to
the parent contract; all existing hard caps still apply.

---

## A1 — Forecast navigation defect

**User instruction (verbatim)**:

> "Forecast → Forecast Engine must open Forecast Engine."
> "Forecast → Scenario Compare must open Scenario Compare."
> "Verify all navigation routes and menu wiring on desktop and mobile."

**Known wiring (verified before dispatch)**:

- `client/src/components/Layout.tsx` lines 86-94: FORECAST nav group
  contains 3 items:
  - `/timeline` → "Net Worth Timeline"
  - `/ai-forecast-engine` → "Forecast Engine"
  - `/scenario-compare` → "Scenario Compare"
- `client/src/App.tsx`:
  - line 286-289: `<Route path="/ai-forecast-engine"><Redirect to="/scenario-compare" /></Route>` ← **defect identified**
  - line 308-310: `<Route path="/scenario-compare">` → `ScenarioComparePage`

**Root cause**: Sprint 20 PR-E added a redirect that routes `/ai-forecast-engine`
to `/scenario-compare`. This means clicking "Forecast Engine" in the nav
opens Scenario Compare. The two menu items are wired to the same destination.

**Required fix**:

1. Determine the canonical Forecast Engine page. Audit history of `App.tsx`
   to find the original Forecast Engine route handler (likely
   `ForecastEnginePage` / `AIForecastEnginePage` / similar). If it exists,
   restore the direct route. If it has been deleted, decide between:
   - Option A: restore the deleted page from git history (preferred if a
     real Forecast Engine page existed)
   - Option B: keep the redirect but rename the nav item to a single entry
     ("Forecast Engine & Scenario Compare") — only if no separate page
     ever existed
2. After fix: `/ai-forecast-engine` must render a distinct page from
   `/scenario-compare`. Nav clicking each link navigates to its own page.
3. Verify all 13 routes in the FORECAST + TODAY + PLAN + MOVE + SECONDARY +
   SYSTEM nav groups (Layout.tsx). Each link must:
   - Have a `<Route path="...">` in App.tsx (not a `<Redirect>` to another nav item)
   - Render a component that exists (not 404)
   - Highlight as active when on its own URL
4. Verify on desktop AND mobile (mobile nav uses the same Layout.tsx
   structure with the Sheet drawer pattern).

**Acceptance**:

- Clicking "Forecast Engine" in sidebar (desktop and mobile drawer)
  opens a page distinct from Scenario Compare.
- Clicking "Scenario Compare" opens Scenario Compare.
- No nav item redirects to another nav item.
- Add new test file `client/src/__tests__/navRoutes.test.ts` (or
  similar) that asserts every NAV_GROUPS href has a non-redirecting
  Route entry in App.tsx.

---

## A2 — Event traceability validation

**User instruction (verbatim)**:

> "Every event shown in Roadmap and Timeline must be traceable back to a
> real engine source or a documented derived-event formula."
> "No placeholder events."
> "No duplicated events."
> "No empty timeline lanes."

**Scope decision (default)** for "no empty timeline lanes":

- Empty lanes are HIDDEN from the UI when a lane emits 0 events on the
  current path. They are NOT rendered as "—" placeholders.
- Audit Mode still surfaces the full 5-lane structure for transparency
  so users can confirm zero is honest engine output, not a UI bug.
- A lane is "empty" when it has 0 engine events AND 0 derived events
  after running the full pipeline.

**Required**:

1. New library:
   `client/src/lib/actionRoadmap/eventTraceability.ts`

   ```ts
   type TraceabilityResult = {
     status: "pass" | "fail";
     failures: Array<{
       eventId: string;
       reason: "no_source" | "no_formula" | "duplicate" | "placeholder";
       detail: string;
     }>;
     stats: {
       totalEvents: number;
       engineEvents: number;
       derivedEvents: number;
       lanesRendered: number;
       lanesHidden: number;
     };
   };

   function validateTraceability(
     milestones: Milestone[],
     laneEvents: LaneEvent[]
   ): TraceabilityResult;
   ```

   Rules:
   - **no_source**: event has `source === "engine"` but no `sourceDeltaId`
     AND no `rawEventType` → fail
   - **no_formula**: event has `source === "derived"` but
     `derivationFormula` is missing/empty → fail
   - **duplicate**: two events share (lane, month, action) → fail (mark
     the duplicate, keep the first)
   - **placeholder**: event has `action === ""` or text matches
     placeholder regex (e.g. "TBD", "placeholder", "Lorem", "Not modelled
     yet") → fail
   - Empty lanes are NOT failures (they are honest engine output)

2. Wire validation into the action-roadmap page:
   - Run on every render
   - In Audit Mode: display a chip "Traceability: X passed / Y failed"
     with a popover listing failures
   - Outside Audit Mode: silently log to console.warn if any failure;
     do not block rendering (the gate already handles fatal cases)

3. Hide empty lanes:
   - `engineEventLanes.ts` consumer (Timeline component) must filter
     out lanes whose total event count is 0
   - In Audit Mode: render hidden lanes with a subtle "0 events" badge
     for transparency

4. Deduplication enforcement:
   - `engineEventLanes.ts` already dedups by sourceDeltaId
   - Add a second dedup pass on (lane, month, action) before returning
   - Add a test asserting two events with the same triplet are collapsed

5. **Tests** (≥ 15):
   - 5 traceability validator tests (one per failure kind + pass case)
   - 4 dedup tests (engine+engine, engine+derived, derived+derived, same-month different action)
   - 3 hidden-lane tests (all-empty, partial-empty, all-full)
   - 3 Audit Mode visibility tests

**Acceptance**:

- For demo path `delay-ip`, traceability validator returns `status: "pass"`
  with 0 failures, totalEvents: 3, engine: 1, derived: 2, lanesRendered: 3,
  lanesHidden: 2 (acquisition + equity_release).
- Outside Audit Mode, acquisition and equity_release lanes do not appear
  in the Timeline UI.
- In Audit Mode, hidden lanes appear with a "0 events" badge.
- No placeholder text in any rendered event.
- No duplicate events.

---

## A3 — Browser verification (was missing in core build)

The core build skipped browser verification because the deploy step
failed. The deploy is now done (URL above). Verification must happen
as part of this addendum.

**Required**:

1. Use Playwright via js_repl following the documented SPA navigation
   pattern (demo login → /decision-lab → Run plan → SPA-click
   /action-roadmap). Do NOT use direct page.goto on /action-roadmap.
2. Desktop (1440 × 900): capture
   - sprint30a_action_roadmap_full_desktop.png (full page)
   - sprint30a_forecast_engine_desktop.png (after A1 fix, distinct page)
   - sprint30a_scenario_compare_desktop.png (after A1 fix)
3. Mobile (iPhone 14, 390 × 844): capture
   - sprint30a_mobile_tab_summary.png (D8 fix: FIRE age, PI numeric)
   - sprint30a_mobile_tab_roadmap.png
   - sprint30a_mobile_tab_timeline.png (A2 fix: only non-empty lanes)
   - sprint30a_mobile_tab_risks.png (D10 fix: real probabilities, not 0.0)
   - sprint30a_mobile_tab_alternatives.png (D12 fix: rationale + metrics)
   - sprint30a_mobile_tab_actions.png
   - sprint30a_mobile_tablist.png (D7 fix: 3 cols × 2 rows)
4. Confirm computed `gridTemplateColumns` on mobile TabsList has 3 tracks.
5. Defects observed must be added to a new SPRINT30A_DEFECTS.md.

---

## A4 — Hard caps (still in force)

- Typecheck ≤ 66 (current 65)
- All existing tests stay green
- New tests in this addendum: ≥ 15 (per A2 list)
- NO new MC math / NO new FIRE engine math / NO new forecast engine
- NO new npm deps · NO Supabase migrations · NO emojis
- NO Goal Lab changes
- NO merge to main · NO production deploy
- Continue commits on feat/sprint28-move-refactor
- Commit prefix: `sprint30a:` (e.g. `sprint30a: A1 fix forecast nav route`)
