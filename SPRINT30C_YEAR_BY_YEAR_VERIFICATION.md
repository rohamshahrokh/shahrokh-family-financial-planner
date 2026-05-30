# Sprint 30C — Year-by-Year Roadmap Verification

**Date:** 2026-05-30
**Branch:** `feat/sprint28-move-refactor`
**Commit:** `4d373ee`
**Preview URL:** https://shahrokh-family-financial-planner-7qmpv8acp.vercel.app/action-roadmap

## Objective

Implement **real year-by-year timeline generation** on `/action-roadmap`. For each calendar year 2026–2032, surface every engine-modelled milestone the recommended winner contains (acquisitions, refinances, equity releases, debt moves, FIRE crossings, passive-income milestones) with the reason each one fires. No placeholders. No generic advice.

## What shipped

### New files

| File | Purpose |
|---|---|
| `client/src/lib/actionRoadmap/yearByYearRoadmap.ts` | Pure selector. Reads `winner.events: ScenarioDelta[]` + `winner.result.netWorthFan: FanPoint[]` + canonical FIRE inputs. Emits 7 year cards. |
| `client/src/components/actionRoadmap/YearByYearRoadmap.tsx` | UI component. Renders 7 cards with category-coloured milestone bullets + reasons. |
| `script/sprint30c-yearbyyear-probe.ts` | Node probe that runs `runGoalLabPlan` on the demo Brisbane household and prints every year card to stdout. |

### Wiring

- `roadmapContext.ts` — added `yearByYear: YearByYearRoadmap` to `RoadmapSectionProps`
- `action-roadmap.tsx` — selector called once; component rendered between `<FireJourneyRoadmap>` and `<WealthTimelineGantt>` on desktop; inside Timeline mobile tab

## Engine data sources used

The selector reads **only existing engine output** — no new MC, no new financial math, no new dependencies:

| Source | Field | Used for |
|---|---|---|
| `winner.events` | `ScenarioDelta[]` (activationMonth + params) | Per-year milestone extraction with verbatim $ figures |
| `winner.result.netWorthFan` | P50 monthly fan | EOY NW per year + FIRE-crossing detection |
| `fire.fireNumber` / `swrPct` | canonical FIRE | FIRE progress %, passive income at SWR |
| `fire.targetMonthlyIncome` | canonical FIRE | Passive-income-target-crossing milestone |

## Honesty rules enforced

- Empty fan or null FIRE inputs → `{ years: [], reason: "Not modelled yet" }`
- Year with zero engine-modelled milestones → renders `"Background growth only — no engine-modelled milestones land in this year."` with NW/passive numbers still shown
- All $ figures come verbatim from `delta.params` — no fabricated purchase prices, refi terms, or equity-release amounts
- FIRE-crossing year synthesised only when median fan first ≥ FIRE number (otherwise no FIRE card)
- Passive-target-crossing milestone synthesised only when EOY passive ≥ user's target (otherwise omitted)

## deltaType → category mapping

| Delta type | Category |
|---|---|
| `buy_property`, `sell_property`, `rentvest`, `property_deposit_boost` | acquisition |
| `refinance` | refinance (+ derived equity_release when `cashOut > 0`) |
| `offset_deposit`, `extra_mortgage_repayment` | debt |
| `etf_lump_sum`, `etf_dca`, `crypto_lump_sum` | investment |
| `early_retire` | fire |
| Macro / stress deltas (cash_hold, salary_change, career_break, child_expense, market_crash_stress, interest_rate_spike) | filtered out — they shape risk, not the user-facing year card |

## Probe results (`script/sprint30c-yearbyyear-probe.ts`)

Demo Brisbane household, fire number $2.7M, target passive $9,000/mo, 200 simulations:

```
Years rendered:           7 / 7
Years with milestones:    1
Years with EOY NW value:  7
FIRE-crossing years:      0
Milestones by category:
  investment       1
```

Demo winner blueprint = `Lower target / extend timeline` with a single `etf_dca` delta in 2026-05. The 7 cards correctly show:
- 2026: ETF DCA milestone + EOY NW $866k (32% FIRE)
- 2027–2032: NW progressing $1.06M → $2.24M (39% → 83% FIRE), all marked "Background growth only"
- No FIRE crossing in window — correct (NW does not reach $2.7M target until later)

## Browser smoke results

Preview at `https://shahrokh-family-financial-planner-7qmpv8acp.vercel.app/action-roadmap`:

| Year | EOY NW | Passive/mo | FIRE % | Milestone |
|------|--------|------------|--------|-----------|
| 2026 | $926,306 | $3,088 | 34% | **INVESTMENT — ETF lump sum — $30,000** ("$30,000 into diversified ETFs captures expected long-run real return of ~6% p.a. with no leverage") |
| 2027 | $1,120,160 | $3,734 | 41% | Background growth only |
| 2028 | $1,318,393 | $4,395 | 49% | Background growth only |
| 2029 | $1,534,500 | $5,115 | 57% | Background growth only |
| 2030 | $1,769,836 | $5,899 | 66% | Background growth only |
| 2031 | $2,007,987 | $6,693 | 74% | Background growth only |
| 2032 | $2,258,470 | $7,528 | 84% | Background growth only |

Section placement verified: between FIRE Journey Roadmap and Wealth Timeline Gantt. No text-wrap, contrast, or layout issues observed.

## Gates

| Gate | Target | Actual |
|---|---|---|
| Typecheck errors | ≤66 | **65** ✓ |
| Tests passing | 57/57 | **57/57** ✓ |
| Known-failing skipped | 2 | **2** ✓ |
| New errors introduced | 0 | **0** ✓ |
| New deps | 0 | **0** ✓ |
| Supabase migrations | 0 | **0** ✓ |
| Goal Lab UI structural changes | 0 | **0** ✓ |

## Constraints honoured

- Preview only — **NOT merged to main**
- No new MC engines, no new financial math, no new engines
- No emojis in shipped code
- All commits on `feat/sprint28-move-refactor` with `sprint30c:` prefix
- Step 4 fireAcceleration fix (commit `e9bb837`) **still preview-only** — awaiting separate user approval

## Why the demo only shows one milestone

The current winner blueprint for the demo persona (Alex & Sara Johnson, Brisbane) is `Lower target / extend timeline` — a strategy that resolves the FIRE shortfall by extending timeline rather than by aggressive accumulation. Its blueprint contains a single ETF DCA / lump-sum delta and no property moves, refinances, or offset routing.

When the user's real recommended winner is a property-heavy blueprint (e.g. `Buy IP now`, `Equity release`, `Buy IP + offset`), the same selector will surface multiple acquisitions, refinances, equity releases, and debt milestones per year — that's a data difference, not a selector difference. The honesty rule means each year card always reflects what the engine actually scheduled.

## Files modified

```
A  client/src/components/actionRoadmap/YearByYearRoadmap.tsx   (166 lines)
A  client/src/lib/actionRoadmap/yearByYearRoadmap.ts           (525 lines)
M  client/src/components/actionRoadmap/roadmapContext.ts       (+3 lines)
M  client/src/pages/action-roadmap.tsx                         (+16 lines)
A  script/sprint30c-yearbyyear-probe.ts                        (220 lines)
```

## Next steps (for user)

1. Open the preview URL above and verify on a real session.
2. To see property/refi/debt milestones, run a plan with a `Buy IP` or `Equity release` template winner.
3. When happy, approve a merge to main (will pick up both Sprint 30B Step 4 fireAcceleration fix and Sprint 30C year-by-year together, or each separately).
