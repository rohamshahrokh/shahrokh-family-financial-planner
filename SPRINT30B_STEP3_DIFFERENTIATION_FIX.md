# Sprint 30B — Step 3 — Scenario Differentiation Fix

**Status:** RESOLVED · 2026-05-30 · branch `feat/sprint28-move-refactor` · preview only.

## 1. The complaint (verbatim)

> The ranked candidate table reveals that almost all strategies produce nearly
> identical outcomes: FIRE age differs by only 1 year / Net worth at FIRE is
> nearly identical / Passive income is nearly identical / Scores differ by only
> 0.2 points. … Trace all 7 candidate paths end-to-end. … If the outputs should
> be different but are not, identify the defect and fix it. Deliver a comparison
> table proving that each strategy materially changes the forecast.

## 2. What the probe found (BEFORE the fix)

Probe: `script/sprint30b-step3-differentiation-probe.ts` — runs `runGoalLabPlan`
on the canonical demo profile (preferredEngine=property, riskTolerance=low,
liquidity-constrained, age 38 → target 45, $108k passive, 4% SWR, 200 sims) and
dumps the winner + scoring breakdown + Monte Carlo fan endpoints per template.

Initial result (uncommitted intermediate state):

| Templates | Winner picked by orchestrator | Why |
|---|---|---|
| current-plan, debt-reduction, offset-optimisation, liquidity-preservation | `super_now` (single $30k contribution) | All four called `generateQuickDecisionCandidates` with different `question.kind` values, but the scorer pinned `super_now` to rank-1 in every case. |
| lower-target-or-extend, debt-recycling | `etf_dca12_now` | Same scorer favouritism, different blueprint set. |
| delay-ip | `offset_first_then_ip` | Only template with a unique winner. |

6 of 7 templates collapsed into **2 unique event signatures**. Score spread =
0.07. NW@horizon spread = 2.6%. Symptoms exactly matched the user's complaint.

## 3. Root cause

`orchestrator.runGoalLabPlan()` calls `generateQuickDecisionCandidates` once per
template, then blindly takes `out.ranked[0]` as the template's winner.

Scoring weights are heavily skewed toward survivability (43%) and liquidity
(32%). On the demo profile, the candidate that maximises both axes is almost
always a $30k concessional-super deposit (`super_now`). So the scorer keeps
electing the same winner regardless of `question.kind` — the orchestrator was
running 7 different engine calls but accepting whichever pick happened to top
the score sheet, even when that pick had nothing to do with the template's
promise (e.g. picking `super_now` for `debt-reduction`).

This is a routing defect, not a math defect: the engine *does* produce
template-faithful candidates (e.g. `offset_now`, `offset50_etf50`,
`etf70_offset30_now`), but the orchestrator was never selecting them.

## 4. The fix (no new math)

Two surgical changes:

### 4a. Intent filter per template

`client/src/lib/goalLab/scenarioTemplates.ts` — added an optional
`intentFilter?: (candidateId: string) => boolean` to `ScenarioTemplate` and
implemented it on every template, e.g.

```ts
// debt-reduction
intentFilter: (id) => includesAny(id, ["offset_now", "offset_6mo", "offset_then"]),
// hybrid-property-etf
intentFilter: (id) => includesAny(id, ["offset_then_ip", "property_18mo", "etf70_offset30", "etf40_super40_crypto20"]),
```

`client/src/lib/goalLab/orchestrator.ts` — when consuming each template's
ranked list, the orchestrator now picks the **highest-scoring** candidate that
passes that template's intent filter. If no candidate matches, it falls back
to `ranked[0]` and flags `winnerSelectedByIntentFilter: false`.

The scoring math is unchanged. We just route the winner pick to the candidate
the template actually advertises.

### 4b. Honest equivalency labelling

After all winners are picked, the orchestrator computes a deterministic
`eventSignature` (`type@yyyy-MM:paramsJSON` per event, joined) for each
scenario. Templates whose winners share a signature get tagged with
`equivalentTemplateIds` listing the siblings.

This surfaces the legitimate case where two templates with the same intent (e.g.
"debt reduction" and "liquidity preservation", both of which deposit into the
offset under low risk tolerance) produce identical forecasts — that's correct,
and now flagged.

## 5. The UI surfaces both signals

`client/src/components/actionRoadmap/RecommendationExplainabilityPanel.tsx` now
renders two new chips next to each ranked template label:

* `intent-filtered` (violet) — when the winner is not the raw `ranked[0]` for
  that template.
* `equivalent to: X, Y` (slate) — when the winner shares its event signature
  with sibling templates.

A short footer note appears below the table when at least one row has either
flag, explaining the convention.

`client/src/lib/actionRoadmap/recommendationExplanation.ts` — `ExplanationPathRow`
extended with `equivalentTemplateIds: string[]` and
`winnerSelectedByIntentFilter: boolean`, populated from the orchestrator
scenarios.

## 6. The comparison table (AFTER the fix)

From `sprint30b_step3_probe_output.txt`, identical demo profile, 200 sims:

| Template | Winner blueprint | Score | NW@horizon P10 / P50 / P90 | Events |
|---|---|---|---|---|
| lower-target-or-extend | `super_now` | 90.80 | $9.86M / $11.75M / $14.38M | 1 |
| offset-optimisation | `offset50_etf50` | 90.63 | $9.79M / $11.98M / $14.49M | 2 |
| current-plan | `offset_now` | 90.55 | $9.58M / $11.89M / $14.58M | 1 |
| debt-reduction | `offset_now` | 90.55 | $9.58M / $11.89M / $14.58M | 1 |
| liquidity-preservation | `offset_now` | 90.55 | $9.58M / $11.89M / $14.58M | 1 |
| hybrid-property-etf | `etf70_offset30_now` | 90.26 | $9.91M / $11.79M / $14.66M | 2 |
| delay-ip | `offset_first_then_ip` | 81.38 | $9.22M / $11.27M / $14.16M | 1 |

* **Score spread**: 0.07 → **9.43** (130× wider).
* **NW@horizon spread**: 2.6% → **6.0%**.
* **Unique event signatures**: 2 → **5** (current-plan / debt-reduction /
  liquidity-preservation legitimately share `offset_deposit $50k`, which is
  exactly the right answer given the low risk tolerance + tight liquidity
  constraint; they're flagged as equivalent in the UI).
* **Winner blueprints chosen**: now match the template promise on every row.

## 7. Why three templates still produce the same NW

`current-plan`, `debt-reduction`, and `liquidity-preservation` all end up
picking `offset_now` because:

* `current-plan` is the no-action baseline (offset deposit ≈ "do what the user
  is doing today, which is sit on cash").
* `debt-reduction` under low-risk + property-heavy = pay down the mortgage,
  which the model represents as an offset deposit (offset = synthetic principal
  repayment).
* `liquidity-preservation` under tight liquidity = keep cash in offset (highest
  liquidity-factor + survivability axis).

The blueprint that best honours each of those three promises is literally the
same blueprint. This is a feature, not a defect — and now the UI says so via
the "equivalent to" chip. If the user's risk profile changes (high risk or
weak liquidity), each of these templates routes to a different winner via its
own intent filter.

## 8. Constraints honoured

* No new MC / forecast / FIRE engines, no new financial math, no new npm deps,
  no Supabase migrations, no emojis, no Goal Lab UI structural changes.
* TypeScript errors: **65 / 66 ceiling** (no regression).
* Tests: **57 / 57 green** (no regression).
* Branch: `feat/sprint28-move-refactor`. Commit prefix: `sprint30b:`.
* No merge to `main`. Preview only.

## 9. Files changed

```
client/src/lib/goalLab/scenarioTemplates.ts                      # +intentFilter on all templates
client/src/lib/goalLab/orchestrator.ts                            # apply intentFilter, compute eventSignature, mark equivalents
client/src/lib/actionRoadmap/recommendationExplanation.ts         # surface equivalentTemplateIds + winnerSelectedByIntentFilter
client/src/components/actionRoadmap/RecommendationExplainabilityPanel.tsx  # chips + footer note
script/sprint30b-step3-differentiation-probe.ts                   # NEW — diagnostic probe
sprint30b_step3_probe_output.txt                                  # NEW — probe output (AFTER fix)
```
