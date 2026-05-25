# UX Recovery Sprint — Priority-Ranked Implementation Plan

> Priority ranking for the UX work captured in `01-full-ux-audit-report.md` and `02-screen-redesign-proposal.md`. **This document does not contain code** — it is the implementation plan a future sprint would execute.
>
> Ranking: **P0** = blocks decision-making, **P1** = high cognitive load, **P2** = polish / cleanup.
> Effort estimate: **S** (≤1 day), **M** (2-4 days), **L** (≥5 days).
> User impact: **High** / **Medium** / **Low**.

---

## P0 — Blocks decision-making

These items block the user from answering "what should I do next?". They are the must-haves for any UX recovery to be considered done.

### P0 group A — Portfolio Lab

| # | Module | Type | Item | Effort | Impact | Depends on |
|---|---|---|---|---|---|---|
| 1 | Portfolio Lab | Promote | Add **Hero "What should I do next?"** banner consuming `featured.actionability.what`, `gap.shortfall`, `feasibility.probability` | M | High | — |
| 2 | Portfolio Lab | Add chart | **Baseline-vs-Recommendation NW line chart** using `forecastEngine.netWorth` (baseline) and `pathSimulationEngine` p50 path | M | High | #1 |
| 3 | Portfolio Lab | Hide | Move all 3 audit-trail / engine-source surfaces into one collapsed **Advanced disclosure**: `true-optimizer-audit-trail`, `portfolio-lab-audit-trail`, the `title={metric.source}` tooltips | S | High | — |
| 4 | Portfolio Lab | Hide | Move `true-optimizer-search-metrics` (Generator/Valid/Evaluated/Frontier/Capacity + reject counters) into Advanced | S | High | — |
| 5 | Portfolio Lab | Add narrative | Promote `portfolio-lab-why-this-wins-narrative` from section 11/14 to the top, just below the Hero | S | Medium | #1 |
| 6 | Portfolio Lab | Re-route | Promote `GoalSolverProSection` out of `/portfolio-lab` into its own `/decision` route (the existing `/decision` page currently embeds `ScenarioCompareV2Page` instead of Sprint 10) | M | High | P0 group C |

### P0 group B — Scenario Compare

| # | Module | Type | Item | Effort | Impact | Depends on |
|---|---|---|---|---|---|---|
| 7 | Scenario Compare | Add chart | **Five tabbed comparison line charts** (Net Worth · Passive Income · FIRE Year · Cashflow · Probability) — the user's exact ask | L | High | — |
| 8 | Scenario Compare | Add chart | **Δ-vs-Base comparison table** (signed deltas across the 5 metrics) | M | High | #7 |
| 9 | Scenario Compare | Promote | **Winner banner** at top using existing `narrative.winnerScenarioId` + Δ vs base | S | High | — |
| 10 | Scenario Compare | Re-route | Either redirect `/scenario-compare-workspace` → `ScenarioCompareV2Page` OR port V2's narrative pattern back into `ScenarioCompareWorkspace.tsx` (Plan A is faster) | M | High | — |
| 11 | Scenario Compare | Remove | Remove the monospace `scenario-compare-workspace-empty-reason` (`no-ledger`) string from the empty state; replace with action-oriented copy | S | Medium | — |

### P0 group C — Decision Engine (Goal Solver Pro)

| # | Module | Type | Item | Effort | Impact | Depends on |
|---|---|---|---|---|---|---|
| 12 | Decision Engine | Re-route | Mount `GoalSolverProSection` as the primary surface on `/decision` (in addition to or replacing the current Quick / Advanced tab arrangement) | M | High | — |
| 13 | Decision Engine | Promote | **Feasibility hero** with status badge + probability bar + median/best/worst FIRE year tiles | S | High | #12 |
| 14 | Decision Engine | Add chart | **Required vs Current** horizontal-bar strip (5 rows) — uses existing `requiredInputs.*` + canonical-ledger current values | M | High | #12 |
| 15 | Decision Engine | Hide | Move audit trail (8-field per entry) into Advanced; remove `score`, `sourceStrategyId`, `inputField` leaks | S | High | #12 |
| 16 | Decision Engine | Promote | **First action of `actionPlan`** becomes the page's primary CTA button | S | High | #12 |
| 17 | Decision Engine | Add input | **Collapse the 11-field targets form into a 3-question wizard** (FIRE year, passive income, optional constraints disclosure) | M | Medium | #12 |

### P0 group D — Cross-cutting hygiene

| # | Module | Type | Item | Effort | Impact | Depends on |
|---|---|---|---|---|---|---|
| 18 | All modules | Hide | Globally suppress `title={metric.source}` HTML tooltips (engine pointer leak) — keep DOM attribute behind Audit Mode toggle | S | Medium | — |
| 19 | All modules | Remove | Remove user-visible "Drift detected" / "Reconciled" engineering badges (`ai-forecast-engine.tsx:955-957`) — log to console, never to user | S | Medium | — |
| 20 | All modules | Add | Introduce a shared `<AdvancedDisclosure>` component so every module's "Advanced diagnostics" collapsed section looks/behaves identically | M | Medium | — |

**P0 estimated effort:** ~20 items, ~13–17 working days assuming 2 engineers in parallel.

---

## P1 — High cognitive load

These items don't block decision-making but cause the user to work too hard. They are the bulk of the audit findings.

### P1 group A — Goal Closure Lab

| # | Module | Type | Item | Effort | Impact | Depends on |
|---|---|---|---|---|---|---|
| 21 | Goal Closure Lab | Promote | **Hero status banner** (`statusLabel` + years ahead/behind + first action CTA) | S | High | — |
| 22 | Goal Closure Lab | Add chart | **Trajectory chart** — `currentProjection` vs `target` line chart with `ReferenceLine` at target | M | High | — |
| 23 | Goal Closure Lab | Add chart | **Gap Analysis bars** — 4 horizontal "current vs target" bars (drop the 3 constraint chips from primary view) | S | High | — |
| 24 | Goal Closure Lab | Promote | Re-sort `actionPlan` by **impact** (downstream NW delta) instead of horizon; group by horizon as a secondary tab | M | High | — |
| 25 | Goal Closure Lab | Add | Per-action **impact tile** (`+$X NW · −Y mo to FIRE · ±Z% confidence`) — addresses the "+$23 net worth trivial outputs" complaint | M | High | #24 |
| 26 | Goal Closure Lab | Hide | Move full 7-card `closure-lab-path-comparison` into Advanced; primary view shows top 3 alternatives | S | Medium | — |
| 27 | Goal Closure Lab | Hide | Move `closure-lab-audit-trail` and `closure-lab-strategic-ideas` into Advanced | S | Medium | — |
| 28 | Goal Closure Lab | Add chart | **Best Path impact-delta bars** (`bestPath.expectedImpact` rendered as signed bars vs current) | S | Medium | — |

### P1 group B — Forecast Engine

| # | Module | Type | Item | Effort | Impact | Depends on |
|---|---|---|---|---|---|---|
| 29 | Forecast Engine | Promote | **Hero tiles** — Median NW · P(FF) · Biggest risk driver | S | High | — |
| 30 | Forecast Engine | Re-order | Promote the fan chart up to slot 2 (currently slot 7) | S | High | — |
| 31 | Forecast Engine | Hide | Move **Source-of-Truth Reconciliation card** entirely into Advanced — this is the most egregious diagnostic surface in the app | S | High | — |
| 32 | Forecast Engine | Hide | Move Expected Returns, MC Assumptions, "Assumptions used by this simulation", Year-by-Year table, V4 Panel, V5 Panel all into Advanced | M | High | — |
| 33 | Forecast Engine | Re-group | Regroup the 12 ProbCards into 4 named categories (Outcome / Wealth / Cashflow / Time) | M | Medium | — |
| 34 | Forecast Engine | Promote | Promote `mc.recommended_actions` into a 3-card strip above ProbCards, with per-action mark-done state | M | High | — |
| 35 | Forecast Engine | Add chart | **Mini sparkline** under each ProbCard (P10/P50/P90 bars) | M | Medium | #33 |
| 36 | Forecast Engine | Remove | Remove `highest_risk_year` and `biggest_risk_driver` as standalone ProbCards (fold into Recommended Actions copy) | S | Low | #34 |

### P1 group C — Portfolio Lab (continued)

| # | Module | Type | Item | Effort | Impact | Depends on |
|---|---|---|---|---|---|---|
| 37 | Portfolio Lab | Add chart | **Goal Reverse Engineering visual bars** (5 rows, current vs required) — replaces the 6-cell numeric grid | M | High | — |
| 38 | Portfolio Lab | Add chart | **FIRE-year sparkline** per alternative recommendation card | M | Medium | — |
| 39 | Portfolio Lab | Add chart | **Probability of Success fan** under the existing probability band | M | Medium | — |
| 40 | Portfolio Lab | Hide | Move the embedded `PortfolioLab.tsx` (Sprint 6 Phase 5) 14 sections into Advanced — currently they double the page length | M | High | #3 |
| 41 | Portfolio Lab | Remove | Remove all truncated scenario-ID strings from the UI (Executive Summary, Frontier rows, Matrix rows) | S | Low | — |
| 42 | Portfolio Lab | Remove | Remove `paretoCount` chip on the Frontier card | S | Low | — |

### P1 group D — Scenario Compare (continued)

| # | Module | Type | Item | Effort | Impact | Depends on |
|---|---|---|---|---|---|---|
| 43 | Scenario Compare | Add narrative | **Narrative cards per scenario** (verdict + Story + Why / What could go wrong) — port V2 pattern (`scenario-compare-v2.tsx:335-521`) | M | High | #7 |
| 44 | Scenario Compare | Hide | Move per-card raw 7-cell metric grid into Advanced (kept for engineering inspection) | S | Medium | — |

### P1 group E — Decision Engine internals

| # | Module | Type | Item | Effort | Impact | Depends on |
|---|---|---|---|---|---|---|
| 45 | DE internals | Hide | Wrap entire `Sprint5DecisionPanel` on `/wealth-strategy` in a default-collapsed `<AdvancedDisclosure>` | S | Medium | #20 |
| 46 | DE internals | Promote | Promote CFO Insights + Watch Items **out** of the Sprint5 panel so they live directly on `/wealth-strategy` | M | Medium | #45 |
| 47 | DE internals | Remove | Drop `sprint5-scenario-comparison-table` entirely (duplicates Scenario Compare) | S | Low | — |

**P1 estimated effort:** ~27 items, ~20–28 working days.

---

## P2 — Polish / cleanup

Items that are visible but low-impact, or that round out the design system.

| # | Module | Type | Item | Effort | Impact |
|---|---|---|---|---|---|
| 48 | All | Polish | Replace amber `incomplete data` italic labels with a single subtle `?` icon that opens a tooltip when in Advanced mode | M | Low |
| 49 | All | Polish | Tone down the Strategic Ideas card pattern (Portfolio Lab + Goal Closure Lab) — move to a separate "Ideas Library" route, not on every workspace | M | Low |
| 50 | Goal Closure Lab | Add narrative | Per-action impact narrative (1 sentence each) | M | Medium |
| 51 | Forecast Engine | Polish | Add inline `?` explanations for "MC Confidence", "P(FF)", "P10/P50/P90" — many users won't know these | S | Medium |
| 52 | Scenario Compare | Polish | Mobile card stack to match the V2 pattern (already exists in V2; copy class structure) | S | Low |
| 53 | All | Polish | Replace generic "Audit Trail" heading inside Advanced with "Where did these numbers come from?" — friendlier user-facing copy | S | Low |
| 54 | All | Polish | Empty states: every empty card gets a single sentence telling user what to do next (e.g. "Go to Dashboard → Import snapshot") | S | Medium |
| 55 | Decision Engine | Polish | Animate the feasibility status badge transitions on target change (positive feedback signal) | S | Low |
| 56 | Portfolio Lab | Polish | Add `Accept / Snooze / Reject` audit log (track which recommendations the user has acted on across sessions) — engine work, but UX surfaces it | L | Medium |
| 57 | All | Polish | Pull common chart styling (axis tick fmt, fan colours, baseline-dash stroke) into a shared recharts theme module | M | Low |
| 58 | All | Polish | A11y pass — every chart needs a sibling `<table>` for screen readers (recharts does not generate one) | M | Medium |
| 59 | FIRE Path | Polish | Trophy/spotlight treatment for `result.best_scenario` in the 4-card grid | S | Low |
| 60 | Forecast Engine | Polish | Combine `Key Risks` + `Recommended Actions` into a single ranked list per risk (paired) | M | Medium |

**P2 estimated effort:** ~13 items, ~10–14 working days.

---

## Suggested 3-sprint sequencing

The brief invited me to make the sequencing call. Based on what the audit found, this is the recommended ordering — slightly different from the brief's hint, because Portfolio Lab + Decision Engine share the most dependencies (`GoalSolverProSection` is mounted inside Portfolio Lab today, so moving it is a single migration that benefits both).

### Sprint 11 — "Unblock decisions"

Goal: every audited screen has a Hero "what to do next?" plus the baseline-vs-recommendation primitive. Engine diagnostics moved into Advanced.

Items: #1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13, #14, #15, #16, #18, #19, #20.

= **Portfolio Lab P0 + Scenario Compare P0 + Decision Engine P0 + cross-cutting hygiene**.

This is one item more than the brief's hint (which paired Portfolio Lab + Scenario Compare in S11 only). The rationale: items #6, #12, #13, #14, #15, #16 are the Decision Engine routing/re-mount; they are blocked by Portfolio Lab's Hero (#1) and they unblock Sprint 12's deeper Goal Solver work. Doing them in S11 reduces churn.

**Estimated S11 effort:** ~14–18 working days.

### Sprint 12 — "Reduce cognitive load — workspace screens"

Goal: Goal Closure Lab and Forecast Engine reach the design quality of the P0-fixed screens. The deep workspace screens get the same hero + chart + Advanced-disclosure treatment.

Items: #17, #21, #22, #23, #24, #25, #26, #27, #28, #29, #30, #31, #32, #33, #34, #36.

= **Decision Engine P0 wizard + all Goal Closure Lab P1 + most Forecast Engine P1**.

**Estimated S12 effort:** ~16–22 working days.

### Sprint 13 — "Charts, narratives, internals, polish"

Goal: add the secondary charts (sparklines, gap-bars, FIRE-year sparklines), port narrative patterns across modules, and finish the polish tier.

Items: #35, #37, #38, #39, #40, #41, #42, #43, #44, #45, #46, #47 (P1 tail) + the P2 polish list (#48–#60).

= **Portfolio Lab P1 chart work + Scenario Compare narrative port + Decision Engine internals + P2 polish**.

**Estimated S13 effort:** ~18–25 working days.

### Sprint 11 vs brief's suggestion

The brief suggested **S11 = P0 Portfolio Lab + Scenario Compare, S12 = P0 Goal Closure Lab + Decision Engine, S13 = P1 across all modules.**

I propose **S11 = P0 Portfolio Lab + Scenario Compare + Decision Engine** (because Decision Engine is just routing + reusing Portfolio Lab patterns), **S12 = P1 Goal Closure Lab + P1 Forecast Engine + Decision Engine wizard**, **S13 = P1 chart/narrative tail + P2 polish**.

The difference: I move "Decision Engine routing + hero" into S11 (it is small and shares dependencies with Portfolio Lab) and treat Goal Closure Lab as a P1-rated workspace in S12. Goal Closure Lab is heavy on charts and narrative — those are S12-level items, not S11 critical-path.

---

## Risk register for the implementation sprints

| Risk | Mitigation |
|---|---|
| Promoting recommendations to a Hero changes a heavy-traffic surface — A/B test if possible | Keep the existing rendering behind a feature flag for the first sprint; ship Hero side-by-side initially |
| Moving `GoalSolverProSection` out of Portfolio Lab breaks the existing visual placement | Provide a "Goal Solver Pro" deep-link inside Portfolio Lab pointing to `/decision` so users with bookmarks aren't lost |
| Hiding the Audit Trail behind Advanced could undermine "engine transparency" claims | Make Advanced one click away and clearly labelled; never gate behind authentication |
| `ScenarioCompareWorkspace` removal could break tests | The `data-testid` scheme is stable; if Plan A (redirect to V2) is taken, retire those testids in a separate cleanup PR — do not block the UX migration on them |
| New charts depend on engine output trajectories not currently exposed | Audit: all proposed charts cite existing engine outputs (`forecastEngine.netWorth`, `pathSimulationEngine.fanChart`, `mc.fan_data`, `goalClosureLab.bestPath.expectedImpact`, etc.). No new financial calculations required. |
| Re-routing `/decision` is a behaviour change | Communicate in release notes; keep old route as redirect rather than removing |

---

## Definition of done — per sprint

A sprint is "done" when:

1. Every item in its scope has shipped to `main` with the existing test suite green.
2. Every redesigned screen has a screenshot diff in the PR description (before vs after) — taken on the desktop and mobile breakpoints.
3. No new financial calculations are introduced — every promoted number traces to an existing engine output (canonical ledger, canonical FIRE, Sprint 7/8/9/10, Monte Carlo).
4. The Advanced disclosure on every module collapses by default and contains every removed-from-primary surface (nothing is *deleted* — diagnostics are *hidden*).
5. A copy of the audit-trail content is still reachable in two clicks (so engineering can still trace numbers).

---

## Cross-references

- Findings → `01-full-ux-audit-report.md`
- A–G deliverables → `02-screen-redesign-proposal.md`
- Wireframes → `03-wireframes.md`
