# Sprint 13 — Decision System Reality Check (v2 — rebuilt on S12)

Rebuild of the abandoned PR #86, this time branched correctly off the
S12 merge commit (`b1bc4fc`). Promotes a universal 4-section
reality-check layout above the fold on every decision screen and
demotes every prior surface into a single "View Supporting Analysis"
disclosure on each page. **No new engines, calculations, persistence,
or tabs were added — every tile reads from the existing Sprint 7/8/9/10
chain via the new selectors in `goalSolverView.ts`.**

## Branch / base

| Field | Value |
| --- | --- |
| Branch | `feat/sprint13-reality-check-v2` |
| Base | `main` @ `b1bc4fc` (Sprint 12 merge) |

## Phase commits

| Phase | SHA | Description |
| --- | --- | --- |
| 1 | `a1ff616` | SourceTag primitive + actionLabelMap + selectors + 21 unit assertions |
| 2 | `5679ec3` | 4-section decision-system components |
| 3 | `9e3acbd` | Portfolio Lab page 4-section layout + S12 surfaces demoted |
| 4 | `634edbe` | /decision, Goal Closure Lab, Scenario Compare 4-section layouts |
| 5 | TBD | Verification artifacts + PR body |

## Universal 4-section layout

Every decision screen now renders the same above-fold block in the same
order, with the same testid naming scheme (`s13-{screen}-*`):

1. **FIRE Command Center** — 5 hero tiles (Current NW · Target NW · Gap · Years Remaining · Probability), each with a `<SourceTag>` chip
2. **Top 3 Actions** — 3 cards with WHAT / WHEN / WHY / EXPECTED RESULT
3. **Biggest Blockers** — 3 ranked rows with label / impact / required improvement / expected benefit
4. **Do Nothing Outcome** — 4 lines (NW / PI / Probability / Expected FIRE Date)
5. **Recommended vs Do Nothing chart** — single 180px-tall above-fold chart

Everything else (Sprint 12 `DecisionFrame`, Top3ActionsBlock,
PortfolioLabHero, GclSixOutputGrid, ScenarioOutcomeComparisonChart,
Quick Decision UX, Advanced Builder, AssumptionsPanel, audit trails) is
wrapped in `<AdvancedDisclosure title="View Supporting Analysis">` so it
remains one click away for engineering and power users — nothing was
deleted.

## 6-question coverage scorecard

Each screen answers all six advisor questions above the fold via a
specific Sprint 13 testid. Same scorecard for every screen because the
layout is universal:

### Portfolio Lab

| # | Question | Answered by testid |
| --- | --- | --- |
| 1 | What is my current position? | `s13-portfolio-lab-fire-command-center-current-nw` |
| 2 | What is my target? | `s13-portfolio-lab-fire-command-center-target-nw` |
| 3 | How far away am I? | `s13-portfolio-lab-fire-command-center-gap` + `-years-remaining` |
| 4 | What is stopping me? | `s13-portfolio-lab-biggest-blockers` (3 ranked rows) |
| 5 | What should I do next? | `s13-portfolio-lab-top3-actions` (3 cards) |
| 6 | What if I do nothing? | `s13-portfolio-lab-do-nothing-outcome` + `s13-portfolio-lab-rec-vs-donothing-chart` |

### /decision

| # | Question | Answered by testid |
| --- | --- | --- |
| 1 | What is my current position? | `s13-decision-fire-command-center-current-nw` |
| 2 | What is my target? | `s13-decision-fire-command-center-target-nw` |
| 3 | How far away am I? | `s13-decision-fire-command-center-gap` + `-years-remaining` |
| 4 | What is stopping me? | `s13-decision-biggest-blockers` |
| 5 | What should I do next? | `s13-decision-top3-actions` |
| 6 | What if I do nothing? | `s13-decision-do-nothing-outcome` + `s13-decision-rec-vs-donothing-chart` |

### Goal Closure Lab

| # | Question | Answered by testid |
| --- | --- | --- |
| 1 | What is my current position? | `s13-gcl-fire-command-center-current-nw` |
| 2 | What is my target? | `s13-gcl-fire-command-center-target-nw` |
| 3 | How far away am I? | `s13-gcl-fire-command-center-gap` + `-years-remaining` |
| 4 | What is stopping me? | `s13-gcl-biggest-blockers` |
| 5 | What should I do next? | `s13-gcl-top3-actions` |
| 6 | What if I do nothing? | `s13-gcl-do-nothing-outcome` + `s13-gcl-rec-vs-donothing-chart` |

### Scenario Compare

| # | Question | Answered by testid |
| --- | --- | --- |
| 1 | What is my current position? | `s13-scenario-compare-fire-command-center-current-nw` |
| 2 | What is my target? | `s13-scenario-compare-fire-command-center-target-nw` |
| 3 | How far away am I? | `s13-scenario-compare-fire-command-center-gap` + `-years-remaining` |
| 4 | What is stopping me? | `s13-scenario-compare-biggest-blockers` |
| 5 | What should I do next? | `s13-scenario-compare-top3-actions` |
| 6 | What if I do nothing? | `s13-scenario-compare-do-nothing-outcome` + `s13-scenario-compare-rec-vs-donothing-chart` |

## Action-label rewrites (proof: see `portfolio-lab-above-fold.png`)

`client/src/lib/actionLabelMap.ts` is the single UI-layer rewriter that
takes the free-text engine action plan strings and produces user-facing
labels with parameter interpolation, and filters internal checkpoints.

| Engine pattern (raw `ActionPlanEntry.action`) | Engine type | User-facing label |
| --- | --- | --- |
| `Set monthly contribution to $X/mo` | `increase_dca` | `Increase stock investing by $X/month` |
| `Acquire investment property #1 (strategy "...")` | `buy_ip` | `Buy investment property` (or `Buy investment property in {year}` when year provided) |
| `Delay investment property purchase to YYYY` | `delay_property_purchase` | `Delay property purchase to YYYY` |
| `Stock DCA scheduled to begin` | `stock_dca_start` | `Start stock DCA schedule` |
| `Median net worth checkpoint: $X` | `median_net_worth_checkpoint` | **FILTERED — never reaches UI** |
| `Projected FIRE year (median): YYYY` | `projected_fire_year` | **FILTERED — never reaches UI** |
| `Reduce PPOR debt by $X` | `reduce_ppor_debt` | `Reduce PPOR debt by $X` |
| `Release equity in YYYY` | `release_equity` | `Release equity in YYYY` |
| recommendation-engine free-text fallbacks | `build_emergency_buffer`, `pay_high_interest_debt`, `refinance_restructure`, `rebalance_portfolio`, `fire_acceleration` | titleCase rewrites (e.g. "Pay down high-interest debt") |
| Anything unrecognised | `unknown` | `titleCase(raw)` |

The action card in `portfolio-lab-above-fold.png` shows the rewrite
working end-to-end: the engine emitted "Set monthly contribution to
$2,191/mo" → the card renders "Increase stock investing by $2,191/month".

## Source tag labels

Static, human-readable labels mounted under every tile. The full set
used across the 4-section layout:

- `Canonical Ledger` — current net worth tile
- `Dashboard Goal` — target net worth, years remaining
- `Goal Solver` — gap tile, action sources, blocker sources
- `Path Simulation` — probability, do-nothing outcome, chart
- (also defined for future use: `Forecast Engine`, `Forecast Engine (baseline)`, `Scenario Engine`, `Monte Carlo`)

Engine-internal scenario/strategy IDs only render when the URL has
`?audit=1` — `SourceTag` reads `window.location.search` at render time.

## Verification

- **Typecheck:** 66 errors (`npm run check`) — matches the documented
  S12 baseline, no regression.
- **Production build:** `npm run build` succeeds (24s vite + 0.3s esbuild server).
- **Unit tests:** `npx tsx script/test-sprint13-action-label-map.ts` —
  21/21 assertions pass.
- **Screenshots:** SSR'd at 1440×900 viewport via
  `script/screenshot-sprint13.ts`. Saved to
  `script/sprint13-screenshots/{portfolio-lab,decision,goal-closure-lab,scenario-compare}-{above-fold,full}.png`.

### Above-fold pixel measurements

Measured as the y-extent (top of viewport → bottom of the
RecommendedVsDoNothingChart) at 1440×900 in the SSR harness:

| Screen | Above-fold height | Budget (≤900px) |
| --- | --- | --- |
| Portfolio Lab | 1134 px | **OVER** |
| /decision | 1134 px | **OVER** |
| Goal Closure Lab | 1134 px | **OVER** |
| Scenario Compare | 1134 px | **OVER** |

⚠️ **Deviation from spec — flagged for review.** All four screens
exceed the 900px desktop budget by ~234px when the full 5-tile grid +
3-row action stack + 3-row blocker stack + 4-line do-nothing card +
180px chart all render with non-empty data. With the rich fixture used
in the harness, the action cards stack vertically because they grew to
fit WHAT/WHEN/WHY/EXPECTED-RESULT content. Options for the user to
choose between in a follow-up:

1. Tighten card padding and shrink the chart to 140px (would land ~950px).
2. Make the action cards collapsible on desktop (1 expanded, 2 condensed).
3. Drop one of the 5 hero tiles into the disclosure (e.g. Years Remaining shares space with Gap).
4. Accept a 1100–1150px above-fold height as the realistic floor and update the spec.

Real-data screens may render shorter when individual tiles/blockers are
empty (the components collapse per `uiEmptyField`), but the
worst-case all-populated render exceeds budget.

## Files touched

```
NEW   client/src/components/ui/SourceTag.tsx
NEW   client/src/lib/actionLabelMap.ts
NEW   client/src/components/decision-system/FireCommandCenter.tsx
NEW   client/src/components/decision-system/Top3ActionsSection.tsx
NEW   client/src/components/decision-system/BiggestBlockersSection.tsx
NEW   client/src/components/decision-system/DoNothingOutcomeSection.tsx
NEW   client/src/components/decision-system/RecommendedVsDoNothingChart.tsx
NEW   script/test-sprint13-action-label-map.ts
NEW   script/screenshot-sprint13.ts
NEW   script/sprint13-screenshots/* (4 above-fold + 4 full + JSON measurements)

MOD   client/src/lib/goalSolverView.ts      (+ 4 new selectors)
MOD   client/src/lib/goalSolverView.types.ts (+ 4 new view shapes)
MOD   client/src/components/TruePortfolioOptimizer.tsx
MOD   client/src/pages/decision.tsx
MOD   client/src/pages/goal-closure-lab.tsx
MOD   client/src/pages/scenario-compare.tsx
```

## Test plan

- [ ] Verify each of the 4 screens loads and the 4 S13 sections render above the fold
- [ ] Open "View Supporting Analysis" and confirm the original S12 surfaces are reachable and unchanged
- [ ] Add `?audit=1` to the URL and confirm SourceTag chips extend with engine-internal scenario/strategy IDs
- [ ] Confirm `median_net_worth_checkpoint` does not appear in any Top 3 Actions card on any screen
- [ ] Confirm action labels follow the rewrite table above (e.g. "Increase stock investing by $X/month", not "Set monthly contribution to $X/mo")
- [ ] Decide on the above-fold-budget deviation: tighten layout, or update the spec

## ⚠️ Reviewer note

**Do not merge.** This PR is for review only per the rebuild brief.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
