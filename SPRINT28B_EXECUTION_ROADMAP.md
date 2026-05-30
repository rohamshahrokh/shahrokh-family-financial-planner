# Sprint 28B — Action Roadmap = Execution Workspace

**Status:** in flight. **Preview only.** No merge. No production.

This document is the binding contract for Sprint 28B (the execution-first
rebuild on top of Sprint 28's MOVE refactor). All code MUST reference this
file; the implementing subagent reads it before touching anything else.

## §0 Scope reminder

Sprint 28 phase 1 (commit `c8bff6e`) already split MOVE into three layers
and removed roadmap content from Goal Lab's right rail. That stands.

Phase 2 (this doc) replaces the **content** inside `/action-roadmap` with
an execution workspace and finishes stripping Goal Lab's post-Run-Plan
output down to a single Recommended Path card.

## §1 Layer responsibilities (unchanged from phase 1)

- **Goal Lab** — Diagnose. Six questions + Current Position + Confidence.
- **Decision Lab** — Compare. Pure comparison surface; Run Plan lives here.
- **Action Roadmap** — Execute. THE primary FIRE-execution workspace.

After Run Plan completes, Goal Lab shows ONLY a Recommended Path block
with a single "Open Action Roadmap" CTA. Nothing else.

## §2 Goal Lab final state (post-Run-Plan)

KEEP in right rail / lower body:
- Current Position card
- Confidence band
- Recommended Path Summary

```
RECOMMENDED PATH
Buy Investment Property
This path currently provides the strongest probability-adjusted
route toward your FIRE target.
[ Open Action Roadmap ]
```

REMOVE (anything still rendering must go):
- Milestones / Timeline / Path Completion / Accelerators
- Risk Dashboard / Alternative Paths / Net Worth Projection
- Monte Carlo Projection

Implementation: replace `RecommendedStrategyCard.tsx` body with the
exact copy block above and confirm no other roadmap section mounts
post-run.

## §3 Action Roadmap section structure

DELETE the current section structure entirely. Replace with EXACTLY
these eight sections in this order:

1. **Executive Decision** — winning path name + 1-line promise + four
   headline P50 metrics (FIRE age, NW at FIRE, passive income, confidence).
2. **FIRE Journey Roadmap** — vertical milestone roadmap (cards stacked).
3. **Wealth Building Timeline** — horizontal Gantt-style view (years
   across, asset/debt/cashflow/ETF/Super/FIRE-progress rows).
4. **Net Worth Attribution** — terminal NW broken down by asset class
   (PPOR / IP / ETF / Super / Cash / Other).
5. **Monte Carlo Outlook** — P25/P50/P75 for FIRE age, NW, passive income.
   ONLY place percentile bands appear. Reconciles to §4's P50 total.
6. **Risks & Failure Points** — stress scenarios (rate shock, income loss,
   property under-performance, ETF under-performance, liquidity stress)
   with engine-sourced impact + severity + engine tag.
7. **Alternative Strategies** — Recommended vs Alternatives A/B/C in a
   delta-style comparison (FIRE age Δ, NW Δ, passive income Δ, risk).
8. **Next Actions** — checklist grouped THIS MONTH / NEXT 90 DAYS /
   NEXT 12 MONTHS. Items derive from milestones (not invented).

## §4 Engine source-of-truth per section

| Section                       | Field                          | Engine source                                                                   |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| S1 Executive Decision         | Path name                      | `goalLab.picks.recommended.templateLabel`                                       |
| S1                            | FIRE age P50                   | `montecarloProjection.fireAge.p50` (scan over `result.netWorthFan`)             |
| S1                            | NW at FIRE P50                 | `montecarloProjection.netWorthAtFire.p50`                                       |
| S1                            | Passive income P50             | `montecarloProjection.passiveIncomeAtFire.p50`                                  |
| S1                            | Confidence band                | `goalLab.confidence`                                                            |
| S2 FIRE Journey Roadmap       | Milestones                     | `actionRoadmap.builder` → `roadmap.milestones` (from `RankedCandidate.events`)  |
| S2                            | Per-milestone FIRE-progress    | NEW: derive ΔP50-NW from `result.netWorthFan` at milestone month vs current     |
| S3 Wealth Building Timeline   | Year columns                   | derived from `roadmap.milestones[].year` + horizon                              |
| S3                            | Property / IP / ETF / Super lanes | `roadmap.milestones` filtered by `sourceTag` (`scenarioDelta.buy_property`, `etf_lump_sum`, `super_contribution`, etc.) |
| S3                            | FIRE-progress row              | `result.netWorthFan[year].p50 / goalProfile.fireNumber` (clamped 0–100%)        |
| S4 Net Worth Attribution      | PPOR equity                    | `result.medianFinalState.properties.filter(p => p.kind === 'ppor').equity()`    |
| S4                            | IP equity                      | `result.medianFinalState.properties.filter(p => p.kind === 'investment').equity()` |
| S4                            | ETF                            | `result.medianFinalState.etfBalance`                                            |
| S4                            | Super                          | `result.medianFinalState.superRoham + superFara`                                |
| S4                            | Cash                           | `result.medianFinalState.cash`                                                  |
| S4                            | Crypto / cars / Iran / other   | `result.medianFinalState.{cryptoBalance, cars, iranProperty, otherAssets}`      |
| S4                            | RECONCILIATION                 | sum must equal `montecarloProjection.netWorthAtFire.p50` ± 1%; else audit warn  |
| S5 Monte Carlo Outlook        | P25/P50/P75                    | `montecarloProjection.{fireAge,netWorthAtFire,passiveIncomeAtFire}`             |
| S6 Risks & Failure Points     | Default probability            | `result.defaultProbability`                                                     |
| S6                            | Liquidity stress               | `result.liquidityExhaustionProbability` + `medianLiquidityFirstMonth`           |
| S6                            | Negative equity                | `result.negativeEquityProbability` + `medianNegEquityFirstMonth`                |
| S6                            | Refinance pressure             | `result.refinancePressureProbability`                                           |
| S6                            | Forced sales                   | `result.forcedSaleReport`                                                       |
| S6                            | Rate shock                     | `result.softWarnings` if rate-related, else "Not modelled yet"                  |
| S7 Alternative Strategies     | Compared rows                  | `goalLab.picks.{safest,fastest,bestCashflow,bestHybrid}` (excl. recommended)    |
| S7                            | Per-row P50 metrics            | `montecarloProjection` applied to each alternate's `RankedCandidate.result`     |
| S7                            | Delta vs recommended           | computed in selector; signs preserved                                           |
| S8 Next Actions               | Checklist items                | `roadmap.milestones` partitioned by `month` (≤30 days / ≤90 / ≤365)             |

If ANY source returns null/undefined, render literal `"Not modelled yet"`
text. NO synthetic numbers. NO fallback heuristics.

## §5 NEW selectors (pure functions, fully unit-tested)

All new selectors live under `client/src/lib/actionRoadmap/`. ZERO new
financial math beyond projecting existing engine outputs.

1. **`netWorthAttribution.ts`** — derives terminal-state asset class
   breakdown from `ExtendedScenarioResult.medianFinalState`. Returns
   `{ components: Array<{ category, label, value, share }>, total,
   reconciliation: { p50FromFan, p50FromSum, diff, withinTolerance }`}`.
   Tolerance = 1% of fan P50.

2. **`fireJourneyMilestones.ts`** — enriches existing `roadmap.milestones`
   with per-milestone FIRE-progress (% of FIRE number at milestone month
   from `netWorthFan[H].p50`). NO new engine call. Adds a `progressImpact:
   { before, after, delta }` field per milestone. Null when fan missing.

3. **`stressFailureAnalysis.ts`** — wraps engine stress probabilities
   into a UI-ready array with severity bands (`low`/`medium`/`high`)
   computed from existing probability thresholds. NO new MC run.

4. **`nextActionsBuilder.ts`** — partitions milestones into THIS MONTH /
   NEXT 90 / NEXT 12 buckets using `roadmap.milestones[].month` vs `today`.
   Each item is a `{ title, due, sourceMilestoneId }`. Empty bucket renders
   "Nothing scheduled" — not invented filler.

5. **`wealthBuildingLanes.ts`** — partitions roadmap milestones into
   six lanes (Property / Debt / Cashflow / ETF / Super / FIRE-progress)
   keyed off `sourceTag`. Returns lane data sized to the timeline year
   range. ONLY data — rendering lives in `WealthTimelineGantt.tsx`.

Each selector requires its own `__tests__/<name>.test.ts` with ≥ 6 cases
covering: empty input, single milestone, multi-milestone, all-null
engine output, reconciliation pass, reconciliation fail.

## §6 NEW components

Under `client/src/components/actionRoadmap/`:

1. `ExecutiveDecision.tsx` (replaces `ExecutiveSummary.tsx`)
2. `FireJourneyRoadmap.tsx` (replaces `FireJourneyTimeline.tsx`'s body —
   keep the file, swap implementation to roadmap-cards vertical stack +
   per-card progress-impact bars)
3. `WealthTimelineGantt.tsx` (NEW — hand-rolled Tailwind + SVG Gantt)
4. `NetWorthAttribution.tsx` (NEW — stacked bar + table)
5. `MonteCarloOutlook.tsx` (replaces `MonteCarloProjectionSection.tsx`)
6. `RisksFailurePoints.tsx` (replaces `RiskDashboard.tsx`)
7. `AlternativeStrategies.tsx` (replaces `AlternativePaths.tsx`)
8. `NextActionsPanel.tsx` (NEW)

Existing `PathCompletionSection.tsx` and `TopAccelerators.tsx` are
REMOVED from the page (their content is absorbed into S1 + S5 + S7).
Delete the component files unless still referenced elsewhere; if so,
leave file but un-mount from action-roadmap.tsx.

## §7 Page composition (action-roadmap.tsx)

```
<ActionRoadmapPage>
  <PageHeader audit-toggle />
  <ExecutiveDecision />          {/* S1 */}
  <FireJourneyRoadmap />          {/* S2 */}
  <WealthTimelineGantt />         {/* S3 */}
  <NetWorthAttribution />         {/* S4 */}
  <MonteCarloOutlook />           {/* S5 */}
  <RisksFailurePoints />          {/* S6 */}
  <AlternativeStrategies />       {/* S7 */}
  <NextActionsPanel />            {/* S8 */}
</ActionRoadmapPage>
```

Each section accepts the same `roadmapContext` prop carrying:
- `picks` (from goalLab.picks)
- `recommended.result` (ExtendedScenarioResult)
- `roadmap` (ActionRoadmap from builder)
- `mcProjection` (MonteCarloProjection from existing selector)
- `attribution` (NEW — from netWorthAttribution selector)
- `auditMode: boolean`

## §8 Display rules (HARD)

- Headline values use P50. Only S5 shows P25/P50/P75.
- Percentile bands NEVER appear outside S5.
- §4 sum MUST reconcile to S5 P50 within 1%. Otherwise an audit-mode
  warning banner appears (`"NW reconciliation drift: $X (Y%)"`). The
  page still renders.
- Every numeric cell carries a `<SourceChip />` (Sprint 28 phase 1
  component). Compact icon when audit OFF; full attribution when ON.
- `null` engine values render `"Not modelled yet"` — never `$0`, never
  `0%`, never `—`.

## §9 Critical-validation guard (carries from phase 1)

Accelerators or alternative paths whose `engineTemplateId !==
picks.recommended.templateId` render with a muted "Supporting Action"
sub-badge in S7. They are not hidden — only visually subordinate.

## §10 Removed duplicates (additive to phase 1's list)

| Was in                                | Now in                            |
| ------------------------------------- | --------------------------------- |
| Goal Lab Path Completion              | Removed entirely (subsumed in S1) |
| Goal Lab Top Accelerators             | Removed entirely (subsumed in S5/S6) |
| Goal Lab Monte Carlo Projection       | Removed entirely (S5 only)        |
| Goal Lab Risk Dashboard               | Removed entirely (S6 only)        |
| Goal Lab Alternative Paths            | Removed entirely (S7 only)        |
| Old `ExecutiveSummary.tsx`            | Replaced by `ExecutiveDecision.tsx` |
| Old `FireJourneyTimeline.tsx` SVG     | Replaced by vertical roadmap cards |
| Old `MonteCarloProjectionSection.tsx` | Replaced by `MonteCarloOutlook.tsx` |
| Old `RiskDashboard.tsx`               | Replaced by `RisksFailurePoints.tsx` |
| Old `AlternativePaths.tsx`            | Replaced by `AlternativeStrategies.tsx` |
| Old `PathCompletionSection.tsx`       | Removed (data shown in S1)        |
| Old `TopAccelerators.tsx`             | Removed (data shown in S5/S6)     |

## §11 Acceptance checklist

- [ ] Goal Lab right rail post-Run-Plan: ONLY Current Position +
      Confidence + Recommended Path Summary card. No other roadmap
      content renders anywhere on the page.
- [ ] `/action-roadmap` renders exactly 8 sections in spec order.
- [ ] All 8 sections cite engine sources via `<SourceChip />`.
- [ ] Net Worth Attribution sum reconciles to MC P50 within 1%.
- [ ] Audit Mode toggle expands every chip to full attribution.
- [ ] FIRE Journey Roadmap milestones derive strictly from the
      winning template's `RankedCandidate.events`. NO generic
      ETF/Property milestones inserted.
- [ ] Wealth Building Gantt visible on desktop; collapses to vertical
      stacked lanes < 640px.
- [ ] Risks section uses engine probabilities ONLY. Rate-shock row
      shows "Not modelled yet" unless `softWarnings` includes it.
- [ ] Alternative Strategies show signed delta vs recommended.
- [ ] Next Actions buckets derive from milestone dates.
- [ ] Typecheck ≤ 66 errors. All 151+ actionRoadmap tests pass; new
      selectors add ≥ 6 tests each (≥ 30 new tests total).
- [ ] No new npm dependencies. No Supabase changes.
- [ ] Preview deployment URL provided. No merge. No prod.
