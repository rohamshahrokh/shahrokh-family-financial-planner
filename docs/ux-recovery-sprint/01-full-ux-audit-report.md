# UX Recovery Sprint — Full UX Audit Report

> **Status:** Ruthless audit, documentation-only. No code changed by this PR.
> **Scope:** Portfolio Lab, Goal Closure Lab, Decision Engine (Goal Solver Pro), Decision Engine internals (S5/S6), Scenario Compare, Forecast Engine.
> **Methodology:** Every claim is grounded in a `file:line` citation to the actual component code. Each module gets the 7-point ruthless analysis listed in the sprint brief.

---

## Executive Summary — Top 10 Cross-Cutting UX Failures

These are the patterns that recur across every audited module. They are listed first because fixing them once at the design-system level removes ~70 % of the per-module noise documented below.

1. **Audit-trail JSON masquerading as a section.** `TruePortfolioOptimizer.tsx:614-668` (Sprint 7), `PortfolioLab.tsx:701-794` (Sprint 6 Phase 5), `GoalClosureLab.tsx:361-450`, `GoalSolverProSection.tsx:427-457` and `Sprint5DecisionPanel.tsx` all render a section called "Audit Trail" / "How was this calculated?" with engine names, input names, assumption strings, confidence source, risk source, Monte Carlo source, and a `howCalculated` blob. This is a debug surface, not a product surface. It blows up the visual length of every screen and pushes the actual decision below the fold. **Solution:** collapse into a single "Show calculation details" disclosure per card.

2. **Diagnostic counters shown at the top instead of decisions.** Portfolio Lab opens with `SearchMetricsCard` at `TruePortfolioOptimizer.tsx:317-349`: "Generated 24,000 · Valid 4,180 · Evaluated 4,180 · Frontier 17 · Capacity 24,000" + a row of per-reason rejection counts (`metrics-reject-*`). The user does not care how many scenarios were rejected — they want to know what to do next. This is search-engine telemetry, not product output.

3. **"Not engine-modelled" and "incomplete data" treated as first-class UI.** Every metric block conditionally renders `Not engine-modelled` or `incomplete data` labels at `TruePortfolioOptimizer.tsx:96-111`, `PortfolioLab.tsx:128-135`, `GoalClosureLab.tsx:89-96`, `ScenarioCompareWorkspace.tsx:77-85`. These are engineering-state badges that should be silenced once the engines are healthy — or hidden into Advanced. The current visual treatment (amber italic, two extra lines per metric) bleeds attention.

4. **Scenario IDs leaked into the UI.** `TruePortfolioOptimizer.tsx:181`, `:525`, `:592` truncate scenario IDs at 24 / 36 chars and render them as "Scenario `hybrid-fastest-fire-2045-…`". Users don't recognise scenario IDs; they recognise *strategies*. Same offence in `GoalSolverProSection.tsx:418` ("source: {a.sourceStrategyId} · field: {a.inputField}").

5. **No baseline anywhere.** The user explicitly asked "what if I do nothing?". The Portfolio Lab recommendation card has a `Do nothing` field at `TruePortfolioOptimizer.tsx:198-201` — but it sits inside a 4-column grid next to "What/When/Why" and is exactly as prominent as the others. No screen renders a true `Baseline vs Recommendation` delta. `GoalClosureLab.tsx:249-307` "Best Path" has `expectedImpact` but no anchored baseline column.

6. **Numbers without sparklines / trajectories.** Almost every metric is a single number. `closure-lab-goal-projection`, `closure-lab-best-path-impact-*`, `goal-solver-required-dca`, `goal-solver-required-capital`, `goal-solver-best-path-nw`, every `ScenarioMetricBlock` in `TruePortfolioOptimizer.tsx`, and every `MetricCell` in `ScenarioCompareWorkspace.tsx` — none show how the number trends over time. Yet the engines produce path data (Sprint 9 `pathSimulationEngine`, monteCarloV4 `fan_data`, `forecastEngine.netWorth`). The chart data exists; the components don't draw it.

7. **The "what should I do" answer is buried.** On Portfolio Lab, the actionable recommendation is the third grid item ("What") inside the featured recommendation card at `TruePortfolioOptimizer.tsx:185-202`, after the page has scrolled through the Executive Summary header, six required-value chips, and a scenario ID. There is no big, single "Do this next" banner.

8. **Identical-looking sections, undifferentiated.** Portfolio Lab stacks 10 sections then 14 more from the embedded `PortfolioLab.tsx` (Sprint 6 Phase 5) plus a Sprint 8 / Sprint 10 / Sprint 9 block (`TruePortfolioOptimizer.tsx:756-800`). Every card uses the same `rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm` shell. The visual hierarchy is flat — nothing tells the user which section to read first.

9. **The Decision Engine page hides Goal Solver Pro behind a tab and renders Scenario Compare V2 in the other tab.** `decision.tsx:1995` renders `<ScenarioCompareV2Page />` inside the "Advanced Builder" tab. The user-facing "Decision Engine" route (`/decision`) does *not* actually mount `GoalSolverProSection` — Sprint 10 is only reachable by scrolling deep inside `/portfolio-lab`. This is a routing-level UX failure.

10. **Empty states are technical strings.** `ScenarioCompareWorkspace.tsx:282-296` renders `"no-ledger"` as a monospace string in the empty card. `GoalSolverProSection.tsx:476-484` renders a 4-line technical paragraph. `PortfolioLab.tsx:895-903` renders the `emptyReason` string raw. None of these tell the user *what to do next* (e.g. "Go to the Dashboard and import your snapshot").

---

## Module 1 — Portfolio Lab

**Routes:** `/portfolio-lab` (canonical) and `/scenario-compare-workspace` (legacy variant).
**Primary components:** `client/src/components/TruePortfolioOptimizer.tsx` (Sprint 7 shell, 803 lines), `client/src/components/PortfolioLab.tsx` (Sprint 6 Phase 5 14-section deep dive, 928 lines), `client/src/components/ProbabilisticWealthSection.tsx` (Sprint 8), `client/src/components/PathSimulationSection.tsx` (Sprint 9), `client/src/components/GoalSolverProSection.tsx` (Sprint 10).

This is by far the heaviest surface in the app. `TruePortfolioOptimizer.tsx` alone renders **10 top-level sections**, then mounts **Sprint 8**, **Sprint 10**, **Sprint 9**, **and the entire Sprint 6 Phase 5 PortfolioLab (14 more sections)** below itself (`TruePortfolioOptimizer.tsx:757-800`). A user lands on `/portfolio-lab` and scrolls through ~30 sections before reaching the bottom.

### 1. Information that is technically correct but useless to a decision-maker

- **Scenario Search Metrics** (`TruePortfolioOptimizer.tsx:317-349`) — exposes generator capacity, scenarios generated/valid/evaluated/frontier-size, and a per-reason rejection histogram (`metrics-reject-{name}`). All of this is optimiser telemetry. A user reading "Generated 24,000 · Valid 4,180 · Reject · min-liquidity-months 1,210" cannot make any decision from it.
- **Scenario ID strings** (`TruePortfolioOptimizer.tsx:181`, `:525`, `:592`) — truncated UUIDs are surfaced beside every recommendation and frontier row.
- **`paretoCount` chip** in the Efficient Frontier card (`TruePortfolioOptimizer.tsx:504-506`) — "17 Pareto-optimal" is an optimiser term that means nothing without context.
- **`failureReason` strings in the Scenario Comparison Matrix Notes column** (`TruePortfolioOptimizer.tsx:600-602`) — values like `"Failed: max-debt-exceeded"` are diagnostic, not actionable.
- **Sprint 6 Phase 5 Strategic Ideas card** with literal `Not engine-modelled` label (`PortfolioLab.tsx:839-880`) — a whole section of ideas where the user is told numbers are *intentionally omitted*. If we can't model them, why are they on screen? At minimum this belongs in a "Library / Future Work" surface, not the optimiser.

### 2. Empty or incomplete fields that create noise

- **`incomplete data` italic amber labels** under every metric (`TruePortfolioOptimizer.tsx:104-111`, `PortfolioLab.tsx:128-135`). Every metric block reserves two lines for incomplete-state messages even when the value is fine.
- **`opacity-70` on incomplete cells** (`TruePortfolioOptimizer.tsx:80`) — dims the entire block; the user sees a half-faded grid and assumes the screen is broken.
- **Empty `gap.options` array** still renders the Goal Achievement Search card with only a `Blocker: …` chip and shortfall (`TruePortfolioOptimizer.tsx:458`). When the engine found no path, the card stays mounted but is functionally a tombstone.
- **Sprint 6 Phase 5 What Could Cause Failure card** (`PortfolioLab.tsx:653-679`) — shows `FailureMode` items each with `severity` chips. If there are zero failure modes the card is still rendered as an empty `<ul>`.
- **Sprint 6 Phase 5 Strategic Ideas card** explicitly omits all numbers and renders dashed-border placeholder cards (`PortfolioLab.tsx:861`). This is structured emptiness.

### 3. Engine diagnostics that should be hidden behind an Advanced section

- **Sprint 7 Audit Trail card** (`TruePortfolioOptimizer.tsx:614-668`). Renders an `<ul>` of `AuditEntry` objects with `Engines used / Inputs used / Assumptions / Confidence source / Risk source / Monte Carlo source / How was this calculated?` for every section. This is six fields of provenance per audit row.
- **Sprint 6 Phase 5 Audit Trail card** (`PortfolioLab.tsx:701-794`). Same content, different shell. Each entry is an expandable disclosure with the same six fields. Two audit trails on one page.
- **Sprint 6 Phase 5 Confidence Report card** (`PortfolioLab.tsx:797-836`). Renders `components.monteCarlo / scoreMargin / dataCoverage` — these are composite-confidence weights. Useful to engineers, not users.
- **Scenario Search Metrics card** (item 1.1 above) — really an engineer dashboard.
- **`title={metric.source}` HTML tooltip** on every value (`TruePortfolioOptimizer.tsx:92`, `PortfolioLab.tsx:124`, `ScenarioCompareWorkspace.tsx:73`) — leaks the engine pointer to anyone who hovers.

### 4. Missing decision-making outputs

- **No single "Do this next" banner.** The closest thing is the Executive Summary's `featured.actionability.what` (`TruePortfolioOptimizer.tsx:185-202`), but it's a small 4-column grid cell, visually equal to `When`, `Why`, `Do nothing`. There is no "if you only read one thing, read this" surface.
- **No urgency / timeline cue.** `actionability.when` exists but is just a one-line string. No countdown to next decision, no "next 30 days" anchor.
- **No commitment / acknowledgement affordance.** There is no button to mark a recommendation as accepted, snoozed, or rejected. The user reads the recommendation and the screen does nothing with that signal.
- **No comparative anchor.** The featured recommendation is shown without the alternative it beat (the other four `Recommendation[]` are below in a separate grid, with no visual "this won; here is #2" pairing).

### 5. Missing charts

- **No trajectory under the recommended path.** The Executive Summary's `featured` recommendation (`TruePortfolioOptimizer.tsx:171-204`) shows 8 numbers + 4 actionability strings. There is no FIRE-year sparkline, no NW-over-time line, no probability fan. Yet Sprint 9's `pathSimulationEngine` produces 1,000 simulated paths per top strategy (`docs/family-wealth-lab-user-guide.md:53`); that data exists upstream.
- **Goal Reverse Engineering** (`TruePortfolioOptimizer.tsx:211-242`) is a 6-cell numeric grid with no chart at all. A simple bar chart showing `Required vs Current` per metric would be far more informative.
- **Efficient Frontier** is a *table* (`TruePortfolioOptimizer.tsx:508-540`), not a scatter. The whole point of an efficient frontier is the 2D visualization (probability × risk, or fireYear × probability). recharts is already imported on neighbouring pages.
- **Probability of Success** card (`PortfolioLab.tsx:407-446`) shows a band chip and a `summary` paragraph — no histogram, no fan.
- **Time to FIRE** card (`PortfolioLab.tsx:448-474`) shows a single number — no countdown bar, no comparison vs target.

### 6. Missing baseline vs recommendation comparisons

- The `Do nothing` actionability string (`TruePortfolioOptimizer.tsx:198-201`) is literally just a narrative line. There is no `baselineFireYear` vs `recommendedFireYear` delta surfaced. The engines compute both (`canonicalFire` for baseline, recommendation metrics for the path), but no UI shows them side-by-side.
- **Current Position card** (`PortfolioLab.tsx:142-169`) and **Target Position card** (`PortfolioLab.tsx:171-195`) are two separate sections. A side-by-side delta column would compress them and make the gap visible at a glance — the **Gap to Target** card (`PortfolioLab.tsx:197-236`) carries the deltas but separately from the position values.

### 7. Missing explanations of WHY a recommendation matters

- The featured `rationale` (`TruePortfolioOptimizer.tsx:184`) is a single line — usually generated string like "Hybrid strategy combining 60% ETF / 40% leverage achieves median FIRE 2 years earlier with comparable downside risk."
- **Why This Strategy Wins** card (`PortfolioLab.tsx:594-651`) does produce a narrative + factors list — this is actually one of the better surfaces. But it lives at section 11 of 14, after probability/time-to-FIRE/required-MC/asset-base/stress-test. It should be promoted.
- No narrative connects the Executive Summary recommendation to the user's *life* (retirement age, kids' education, lifestyle target). The copy is engine-y ("scenario", "frontier", "objective"), not user-y ("retire 3 years sooner").

---

## Module 2 — Goal Closure Lab

**Route:** `/goal-closure-lab`.
**Component:** `client/src/components/GoalClosureLab.tsx` (532 lines).
**Engine:** `client/src/lib/goalClosureLab.ts`.

### 1. Technically correct, useless to a decision-maker

- **`bindingConstraint` string** (`GoalClosureLab.tsx:166-172`) — labeled "Binding Constraint" with values like `"max-debt"` or `"min-liquidity-months"`. Optimiser-language; users don't know what "binding" means.
- **Gap Analysis** renders 7 numeric "gap" metrics in a single grid (`GoalClosureLab.tsx:157-165`): passive-income gap, net-worth gap, asset-base gap, monthly-contribution gap, plus three "constraint" gaps (liquidity, debt, risk). Most of these are derivative of the others (asset-base gap ≈ net-worth gap / SWR). Showing all seven gives the illusion of seven independent dimensions.
- **`row.candidate` source string passed as `title`** (`GoalClosureLab.tsx:85`) — engine pointer leaks on hover.
- **Audit Trail card** (`GoalClosureLab.tsx:430-451`) — identical to the Portfolio Lab audit trail problem.

### 2. Empty or incomplete fields that create noise

- **`row.incomplete && !row.candidate` branch** renders the "Not yet engine-modelled — supporting candidate unavailable." string inside each path card (`GoalClosureLab.tsx:204-211`). A 7-card grid where some cards show this is the noisiest possible state.
- **`incomplete data` amber italic** repeats per metric (`GoalClosureLab.tsx:89-96`).
- **`No engine recommendations for this horizon yet.`** appears for every empty action-plan horizon (`GoalClosureLab.tsx:314-316`). If any of `thisMonth / next3Months / next12Months / majorMilestones` is empty (likely), an "empty" box is rendered for it.
- **Strategic Ideas card** (`GoalClosureLab.tsx:453-490`) — same problem as Portfolio Lab: a whole section of ideas with `Not engine-modelled` labels and numbers intentionally omitted.

### 3. Engine diagnostics behind Advanced

- **Audit Trail** entire section (`GoalClosureLab.tsx:430-451`).
- **`title={metric.source}` and `title={a.source}`** tooltips on every metric and action item (`GoalClosureLab.tsx:85`, `:325`).
- **`data-status` and `data-horizon` attributes** in the DOM — these are test hooks but visible in inspector.

### 4. Missing decision-making outputs

- **The user's actual complaint** ("recommendations show meaningful impact, not trivial outputs like +$23 net worth"): this is **Action Plan** (`GoalClosureLab.tsx:337-359`). Actions are rendered as text bullets sourced from various engines, with no impact number attached. The horizon grouping (`thisMonth / next3Months / next12Months / majorMilestones`) means a "this month" action might be "increase DCA by $50/mo" — which produces a $23 net-worth lift, but the screen doesn't say so.
- **No prioritisation.** Every action is rendered with an emerald bullet (`GoalClosureLab.tsx:327`). There is no "biggest impact first" ordering.
- **No magnitude.** The `ClosureAction.text` is the only field rendered (`GoalClosureLab.tsx:328`). The underlying engine has metadata (`source` and `horizon`) but no quantified impact.
- **No commitment / dismiss buttons.**

### 5. Missing charts

- **Goal Status card** (`GoalClosureLab.tsx:103-141`) shows `Target`, `Current Projection`, `Gap`, `Years ahead/behind`, `Confidence` as five numbers. No trajectory chart of current vs target net worth over time. The `forecastEngine.netWorth` series exists upstream.
- **Best Path expectedImpact** is a 4-cell numeric grid (`GoalClosureLab.tsx:277-286`). No before/after chart.
- **Path Comparison** (`GoalClosureLab.tsx:226-247`) shows seven cards side-by-side, each with 8 metric cells. No spider/radar chart, no comparison bar. The user has to mentally diff 56 numbers.

### 6. Missing baseline vs recommendation comparisons

- **No baseline column** anywhere on this screen. The `currentProjection` in Goal Status (`GoalClosureLab.tsx:128`) is the baseline numerically, but it's never paired with the recommendation values in a single visual.
- **Best Path's `expectedImpact`** is shown in isolation — the user can't see "you currently project NW $X; this path projects $Y; delta $Y-X".

### 7. Missing explanations of WHY a recommendation matters

- `bestPath.whyItWins` (`GoalClosureLab.tsx:271-276`) is a one-paragraph string. This is the only narrative on the page. There is no per-action narrative ("this saves you 14 months", "this reduces your liquidity stress by 30%").
- Risks list (`GoalClosureLab.tsx:289-300`) gives bullet points but no severity / probability anchor.

---

## Module 3a — Decision Engine (Goal Solver Pro)

**User-facing surface:** `client/src/components/GoalSolverProSection.tsx` (501 lines). Mounted inside `TruePortfolioOptimizer.tsx:772-776` (Portfolio Lab) and **not** mounted on the `/decision` route — see executive item #9.

### 1. Technically correct, useless to a decision-maker

- **Constraints card "candidates evaluated / passing"** counters (`GoalSolverProSection.tsx:292-297`). Same telemetry-as-product problem as Portfolio Lab search metrics.
- **Constraint chips** that read `"max-debt: PASS (180000)"` (`GoalSolverProSection.tsx:286-289`) — internal constraint slug, opaque label.
- **`alt.score.toFixed(2)`** raw numeric scores rendered in Alternative Paths (`GoalSolverProSection.tsx:387-389`). The "score" is a composite weighted-ranking value; the user has no calibration for it.
- **`source: {a.sourceStrategyId} · field: {a.inputField}`** beneath every action plan row (`GoalSolverProSection.tsx:416-418`). Engine pointer leakage.
- **Best Path Net Worth P50** (`GoalSolverProSection.tsx:350-352`) — labelled "Net Worth P50". P10/P50/P90 are statistical terms; "Net Worth (median outcome)" would be the user-facing label.

### 2. Empty or incomplete fields that create noise

- **`r.requiredAdditionalProperties ?? "—"`** and other em-dash fallbacks (`GoalSolverProSection.tsx:253`, `:258`, `:264`). The Required Inputs card frequently renders a row of dashes when targets are partially supplied.
- **`Targets form` with 11 fields** (`GoalSolverProSection.tsx:133-145`). Empty fields generate `null` targets, which produces partial gap analysis (`gap.entries.length === 0` empty branch at `:200-201`). The 11-field form is the most intimidating empty state in the app.
- **Placeholder card** (`GoalSolverProSection.tsx:476-484`) shown when targets are empty — text-only, 4 lines, no illustration, no example targets.
- **Blockers card** rendered only when status === IMPOSSIBLE or blockers exist (`GoalSolverProSection.tsx:302-326`), but when shown with `result.blockers.length === 0` produces the string "No specific blocker recorded."

### 3. Engine diagnostics behind Advanced

- **Audit Trail card** (`GoalSolverProSection.tsx:427-457`) — eight fields per entry (engines, inputs, assumptions, probability source, path source, constraint source, confidence source, howCalculated). The most provenance-heavy audit on the site.
- **Constraints "candidates evaluated/passing"** counters.
- **Score numbers in Alternative Paths.**
- **Source / field metadata** under each action plan row.

### 4. Missing decision-making outputs

- **No "Do this next" banner.** The Best Path card (`GoalSolverProSection.tsx:328-360`) shows 4 numeric values (Strategy / P(FIRE) / Median FIRE year / Net Worth P50). No bold "Step 1: increase DCA to $X/mo" callout.
- **Action plan** (`GoalSolverProSection.tsx:397-425`) is a year-stamped list, but no urgency, no first-action highlight, no commit/snooze.
- **Feasibility status badge** (`GoalSolverProSection.tsx:153-191`) shows ACHIEVABLE/STRETCH/UNLIKELY/IMPOSSIBLE but does not pair with a recommendation specific to the status.

### 5. Missing charts

- **Feasibility card** (`GoalSolverProSection.tsx:153-191`) shows P(success), Median FIRE year, Best case, Worst case as four numbers. A simple probability bar with P10/P50/P90 markers would convey the distribution.
- **Gap Analysis table** (`GoalSolverProSection.tsx:193-232`) is text-only. A horizontal bar per gap row (wanted vs projected) would be far stronger.
- **Best Path card** has no trajectory.
- **Alternative Paths** (`GoalSolverProSection.tsx:362-395`) is a 4-cell card grid with one number each — should be a compact comparison chart.

### 6. Missing baseline vs recommendation comparisons

- The Required Inputs card (`GoalSolverProSection.tsx:234-272`) shows "Required Monthly DCA" but does not show "Current Monthly DCA". The user can't see the delta they actually need to make.
- Gap Analysis (`:193-232`) shows Wanted/Projected/Shortfall — that *is* a baseline comparison, and is one of the better surfaces. But it's text in a table.

### 7. Missing explanations of WHY a recommendation matters

- No narrative beyond the placeholder text (`:481-483`). The whole page is metric-grids and tables.
- **No human-readable summary** like "To reach FIRE by 2045, you need to add $X/mo to your contributions. This is achievable with high confidence (78%) under the Hybrid strategy."

---

## Module 3b — Decision Engine internals (S5/S6)

**Files audited (thinly, per the brief):** `client/src/lib/decisionCandidates.ts`, `client/src/lib/decisionRanking.ts`, `client/src/lib/decisionEngineLabels.ts`. **UI consumer:** `client/src/components/decisionEngine/Sprint5DecisionPanel.tsx` (702 lines), surfaced once at `client/src/pages/wealth-strategy.tsx:3850`.

### Audit summary

These are not a user-facing product surface — they are S5/S6 building blocks consumed by `TruePortfolioOptimizer` and (in the Sprint5DecisionPanel form) the Wealth Strategy page. They surface scenario candidates, ranked rows, score breakdowns, and CFO advisor insights.

- **`sprint5-top3-row-{rank}-score`** (`Sprint5DecisionPanel.tsx:454`) and **`sprint5-top3-row-{rank}-breakdown`** (`:462`) expose raw composite scores and per-dimension breakdowns. Same telemetry-as-product issue.
- **`sprint5-scenario-comparison-table`** (`:506`) is yet another scenario-comparison table — the fourth one in the app — duplicating Portfolio Lab's matrix and Scenario Compare's table.
- **`sprint5-best-move-rationale`** (`:343`) and **`sprint5-best-move-why-narrative`** (`:412`) — these are actually narrative; this is the strongest surface in the file.
- **`CFOAdvisorInsightsPanel` + `WatchItemsPanel`** (`:593`, `:630`) — render generic insight bullets with severity chips.

**Recommendation:** since this is consumed only by Wealth Strategy, the user-facing fix is to **stop adding more UI on top of these internals**. Anything that needs to be promoted should be promoted into the Sprint 7+ surfaces (Portfolio Lab / Goal Solver Pro) — not into a separate "Sprint 5" panel that duplicates ranking tables. Sprint5DecisionPanel could be hidden behind an Advanced disclosure on `/wealth-strategy`.

---

## Module 4 — Scenario Compare

**Two surfaces — confusingly named:**

- **`/scenario-compare`** and **`/scenario-compare-v2`** both render `ScenarioCompareV2Page` (`client/src/pages/scenario-compare-v2.tsx`, 1740 lines) — this is the **good UX** narrative-rich surface with gradient cards, fan charts, verdict chips. Audited briefly below.
- **`/scenario-compare-workspace`** renders `ScenarioCompareWorkspace.tsx` (356 lines) — this is the **problematic** "engine pass-through" workspace that the brief refers to.

The user's "redesign so users can instantly compare Net worth, Passive income, FIRE year, Cashflow, Probability between scenarios" complaint maps to the `ScenarioCompareWorkspace` surface (and partly to `decision.tsx`'s Advanced tab which embeds `ScenarioCompareV2Page`).

### 4A. `ScenarioCompareWorkspace.tsx` (the problematic one)

#### 1. Technically correct, useless to a decision-maker

- **`recommendedAction` formatted as a `ScenarioMetric`** (`ScenarioCompareWorkspace.tsx:160-161`) — the recommended action is shown as a *value of a metric*, not a callout. It will read as a string like "Increase DCA by $200/mo".
- **`MC Confidence`** column (`:184`) — surfaced raw without explanation of what "MC Confidence" means.
- **`title={metric.source}` tooltip** leaks engine pointer (`:73`, `:245`).
- **`scenario-compare-workspace-empty-reason`** rendered as monospace `font-mono` (`:290-295`) — exposes engine state string `"no-ledger"` to the user.

#### 2. Empty or incomplete fields that create noise

- **`row.incomplete && !row.candidate`** branch (`:130-137`) renders a per-card "Engine inputs missing for this scenario — data unavailable." italic amber notice.
- **`incomplete data`** badge per metric (`:77-84`).
- **Default state shows six identical-looking cards.** The visual variety is zero.

#### 3. Engine diagnostics behind Advanced

- All `data-testid`, `data-scenario-id`, `data-recommended` DOM attributes (`:101-103`).
- `title` source tooltips.
- Empty-state reason monospace string.

#### 4. Missing decision-making outputs

- **The "Recommended Action" cell is the only decision output** and it's a single-line string buried at the bottom of each card (`:149-162`).
- **No global winner banner.** The `RECOMMENDED` chip on a single card (`:120-127`) is the only winner signal; there's no big "this is the best scenario for you" summary at the top.

#### 5. Missing charts

- **Zero charts in the whole workspace.** Seven metrics × six scenarios = 42 numbers, no visual. The user must compare 42 numbers manually.
- The user's listed metrics for instant comparison — **Net worth, Passive income, FIRE year, Cashflow, Probability** — are all present as text (`netWorth`, `passiveIncome`, `fireDate`, `monthlySurplus`, `monteCarloConfidence` at `:140-146`), but **none of them are rendered as a chart**. The user can't *instantly* compare anything.

#### 6. Missing baseline vs recommendation comparisons

- The "Base" scenario is treated as just another card. There is no "delta vs Base" column, no per-metric deltas. This is the entire missing comparison surface the user is asking for.

#### 7. Missing explanations of WHY

- Each card has a `definition.description` (`:113-118`) which is a one-line scenario summary. There is no per-card narrative explaining the trade-offs.
- The Recommended chip's logic isn't explained on the surface.

### 4B. `ScenarioCompareV2Page` (the good-UX surface, for context)

This is the rich-design surface and is a positive example to anchor on. Its strengths:

- **Gradient header per scenario card** (`scenario-compare-v2.tsx:364-384`) with verdict chip (`:379-382`) — strong visual hierarchy.
- **Top-of-card KPI row**: P50 NW, P10/P90, Cash (`:386-402`) — exactly the kind of compact decision summary missing elsewhere.
- **Confidence ribbon** (`:405`) — visual not numeric.
- **Story + Key Moves + Why it works / What could go wrong cards** (`:407-441`) — narrative scaffolding the rest of the app lacks.
- **Failure attribution / Top risk drivers** with severity-weighted bars (`:443-465`) — best risk surface in the app.
- **Tabbed Projections card** with `Net Worth / Liquidity / Δ vs Base / MC Bands` charts using recharts (`:1304-1402`) — this is *exactly* what every other module needs.
- **Comparison table** (`:1404-1469`) plus a mobile card stack (`:1473-1499`).

**The fix for Module 4 is: deprecate `ScenarioCompareWorkspace.tsx`, or remap `/scenario-compare-workspace` to `ScenarioCompareV2Page`, *and* port the V2 design pattern (KPI rows, narrative cards, Δ-vs-base chart) back into the other modules.** This audit pattern recurs many times.

---

## Module 5 — Forecast Engine

**Routes:** `/ai-forecast-engine` (canonical), with `/monte-carlo` redirected here (`App.tsx:297`). Also `/fire-path` (FIRE-specific forecaster).

**Components:**
- `client/src/pages/ai-forecast-engine.tsx` (1645 lines) — the main forecast workspace.
- `client/src/components/MonteCarloV4Panel.tsx` (312 lines).
- `client/src/components/MonteCarloV5Panel.tsx` (343 lines).
- `client/src/pages/fire-path.tsx` (1208 lines) — FIRE-specific four-strategy optimiser.
- `client/src/components/UnifiedFirePanel.tsx` (161 lines).
- `client/src/components/FIREPathCard.tsx` (169 lines).

The AI Forecast Engine page is the *single longest page in the app* and the largest carrier of engine diagnostics on user-facing surfaces.

### 1. Technically correct, useless to a decision-maker

- **Source-of-Truth Reconciliation card** (`ai-forecast-engine.tsx:949-994`). Renders `Dashboard NW / Engine NW / PPOR / Cash + offset / Super / Stocks / Crypto / Mortgage / Other debts / Monthly income (engine) / Monthly expenses (engine) / Income source` — twelve fields just to prove that the Monte Carlo engine matches the Dashboard's snapshot. This is a developer reconciliation report on the most visited forecast page.
- **`livePreviewRecon.status === 'PASS' ? 'Reconciled with Dashboard' : 'Drift detected'`** badge (`:955-957`) — exposes the existence of "drift" between engines to the user. They should never need to know.
- **"Monte Carlo Assumptions" block** rendering raw `mu`/`sigma`/correlation parameters by asset class (`:1092` onwards).
- **"Assumptions used by this simulation" block** (`:1207`) — duplicates the model assumptions explainer.
- **Highest Risk Year / Biggest Risk Driver ProbCards** (`:1379-1384`) — both are technical Monte Carlo diagnostics rendered as headline KPIs.
- **Cash Shortfall Risk's sub-label dynamically references the emergency buffer in `$Xk` form** (`:1370`) — useful info, but mid-card text density is too high.

### 2. Empty or incomplete fields that create noise

- **Forecast Mode card** (`:822-888`) renders three mode-explainer chips plus three mode cards plus, conditionally, the profile-selector and the year-by-year table. That's up to ~50 form fields when year-by-year is active.
- **Year-by-Year Assumptions table** (`:891-947`) is a 10×N grid of inputs that defaults to placeholder/profile values. Most users will never edit it.
- **`mc.key_risks` and `mc.recommended_actions`** lists render even when empty (`:1448-1471`).

### 3. Engine diagnostics behind Advanced

- **Source-of-Truth Reconciliation card** in its entirety (`:949-994`).
- **Expected Returns block** (`:1006` onwards) — user-editable means, but presented as a power-user input.
- **Monte Carlo Assumptions block** (`:1092` onwards) — sigma, correlation matrix.
- **Assumptions used by this simulation** (`:1207`).
- **`traceId="mc:p50-nw-at-target"`** and similar `traceId` props on every `ProbCard` (`:1338`, `:1342`, `:1346`, etc.) — these are AuditableMetric tracers, fine in the DOM, fine as a hover, but the `<AuditableMetric>` wrapper renders an outline indicator that contributes to visual noise.
- **V4 Institutional Wealth Terminal block** (`:1474-1487`) and **V5 Realism + Advisor Intelligence block** (`:1489-1498`) — both render entire extra panels of analytics that few users will read.

### 4. Missing decision-making outputs

- The page is **all output, no recommendation**. The closest is `mc.recommended_actions` (`:1462-1469`) — a list of strings — but it's the *eighth* major section on the page and visually equal in weight to "Key Risks Identified".
- **No "what should I change?" banner.** The user just sees `Median NW 2035 = $X · P(FIRE) = Y%` — fine, but no link to act on it.
- **Scenario Comparison table at the bottom** (`:1500-1542`) compares the *profile presets* (conservative/moderate/aggressive). It does not compare *the user's actions*. So even the comparison surface is meta-information.

### 5. Missing charts

- The forecast page has charts — Fan Chart (`:1389-1437`), V4 Panel, V5 Panel — so this section is **less of a gap here than elsewhere**, with one big exception:
- **The 12 Probability Cards** (`:1334-1385`) are 12 single-numbers in a 4-column grid. A small distribution-mini-bar inside each card (e.g. P10/P50/P90 spark) would tell the user where the median sits inside the distribution. Currently the user sees "Median NW $4.1M" and "P10 $2.3M" as two unrelated numbers.

### 6. Missing baseline vs recommendation comparisons

- **No "what if I make no changes" anchor.** Forecast Engine is the deterministic-vs-MC engine; the user *can* switch modes (`:822-888`), but the page doesn't show baseline-vs-altered side-by-side.
- **Scenario Comparison table at the bottom** (`:1500-1542`) compares **the asset-return profiles**, not the user's situation vs alternatives.

### 7. Missing explanations of WHY

- Each ProbCard has a `sub` label (`:1336`, `:1340`, etc.) — one-line. That's it.
- The "Recommended Actions" list (`:1462-1469`) is bullet text without per-action impact numbers ("how much will doing this change Median NW by?").
- **The "Model Assumptions Explained" accordion** (`:1544+`) is *good* — but it's at the bottom, behind clicks.

### FIRE Path (briefly)

`fire-path.tsx` is in better shape than the main AI Forecast Engine page — its **Hero Stats** strip ("Strategy Spread ±Xyr fastest vs slowest", `:1100`) and **target-formula transparency block** (`:1115-1129`) explain the math inline. The FIRE Assumptions toggle (`:1132-1145`) and AssumptionsPanel disclosure (`:1148`) already implement the Advanced-disclosure pattern we want elsewhere. The Scenario Cards section (`:1170-1186`) and TimelineChart (`:1189`) are model citizens. The remaining gaps:

- The four-scenario card grid does not visually differentiate the best scenario beyond the `isBest` prop (`:1177`). A trophy / spotlight treatment would help.
- The MilestoneTable (`:1192`) is text-heavy.

---

## Audit complete — see also

- `02-screen-redesign-proposal.md` — A–G deliverables for each module (Current Problems, Recommended Layout, Remove / Hide / Promote lists, Charts Required, Mockups).
- `03-wireframes.md` — Mermaid + ASCII pairs for each redesigned screen.
- `04-priority-ranked-implementation-plan.md` — P0/P1/P2 ranking, effort estimates, 3-sprint sequencing for Sprint 11/12/13.
