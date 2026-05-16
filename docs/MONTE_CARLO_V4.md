# Monte Carlo V4 — Institutional Wealth Simulation Engine

V4 transforms the Monte Carlo forecast engine from a randomized projection
simulator into an institutional-grade Australian household wealth simulation
engine.

## Design principle

V4 is **strictly additive**. It does NOT replace the V3 canonical engine
(`monteCarloEngine.ts`) or the source-of-truth mapper
(`monteCarloCanonical.ts`). Instead, it WRAPS V3:

1. The V3 engine runs first and produces the canonical fan
   (`p10/p25/median/p75/p90`), FIRE probability, cash shortfall, and the rest
   of the legacy `MonteCarloResult` shape. This preserves Dashboard
   reconciliation, Decision Engine wiring, narratives, reports, and the
   existing UI.
2. The V4 engine then runs a seeded stress-and-regime pass on top of the same
   `MCInput`, computing regime paths, dynamic rate paths, AU property cycle
   overlays, household life events, behavioural overlays, advanced risk
   metrics (VaR/CVaR/SoR/insolvency/refi/debt-spiral), allocation
   recommendations, and advisor-grade narratives.
3. The V4 outputs are attached as `result.v4` — a structured extension that
   new UI surfaces consume without changing the legacy shape.

Net effect: existing consumers see exactly the same `MonteCarloResult` plus
an extra `v4` field. The canonical reconciliation diagnostic — the guard
that proved the MC starting NW equals the Dashboard NW to the dollar (modulo
the documented cars haircut) — is preserved and continues to PASS in the
test suite.

## Module map

```
client/src/lib/monteCarloV4/
  rng.ts          — mulberry32 PRNG, seeded normals, hashSeed, bernoulli
  regimes.ts      — Phase A: 11-state regime engine with sticky transitions
  rates.ts        — Phase B: OU rate process with regime tilt + shocks
  property.ts     — Phase C: AU property cycle (regions, IO expiry, APRA,
                    Olympic uplift, vacancy, sentiment)
  events.ts       — Phase D: life event timeline (scheduled + stochastic)
  behavioural.ts  — Phase E: profile-based behavioural overlays
  risk.ts         — Phase F: VaR / CVaR / SoR / insolvency / debt spiral
  optimizer.ts    — Phase G: structured allocation recommendations
  explanations.ts — Phase H: advisor narrative blocks
  glossary.ts     — Phase J: plain-English explanation entries
  engineV4.ts     — orchestrator: wraps V3 and aggregates V4 extras
  index.ts        — public entry point
```

## Regime engine (Phase A)

11 regimes: `normal_growth`, `high_inflation`, `disinflation`, `stagflation`,
`recession`, `commodity_boom`, `housing_slowdown`, `rate_cut_cycle`,
`tightening_cycle`, `risk_on_mania`, `deflationary_shock`.

- Each regime has a full effects vector (inflation, wage, property, rent,
  unemployment, stocks, crypto, rates, borrowing power, refinance risk,
  liquidity pressure).
- Transitions are conditional (not memoryless) — see `TRANSITION_WEIGHTS`.
- Persistence is enforced via geometric dwell-time draws calibrated to
  realistic durations (e.g. tightening_cycle mean dwell 24 months).
- `dominantRegimeByYear` aggregates the monthly path into 1 regime per year
  for UI overlays.

## Rate engine (Phase B)

Discrete-time Ornstein-Uhlenbeck with regime tilt:
`r_{t+1} = r_t + θ * (μ_t − r_t) + σ * ε`. Emergency cuts trigger in
recession/deflation, mortgage stress shocks in tightening/high-inflation.
Mortgage rate = cash rate + 200bps spread (configurable).

## Property cycle (Phase C)

Regime-aware monthly multipliers on baseline property/rent growth, plus:
- regional tilts (SEQ/Brisbane Olympic uplift 2028–32, Sydney, Melbourne,
  Perth, regional QLD/VIC)
- APRA tightening events (annualised, scaled by regime)
- IO expiry payment shocks
- investor sentiment factor

## Life events (Phase D)

Scheduled + stochastic events with monthly cashflow deltas:
inheritance, school cost, redundancy (with multi-month income loss),
healthcare shocks. Scheduled events are deterministic given seed; stochastic
events use seeded RNG.

## Behavioural overlays (Phase E)

Optional. Profile-driven sensitivities for: pause DCA on drawdown, panic
selling, leverage fear, lifestyle creep, risk-seeking after gains. Profiles:
`disciplined`, `average_investor`, `emotional_investor`,
`aggressive_allocator`.

## Advanced risk (Phase F)

- VaR95 / VaR99 / CVaR95 on terminal NW
- Sequence-of-Return proxy
- Liquidity exhaustion, insolvency, refinance, debt-spiral probabilities
- Debt stress score (avg peak DSR) and leverage fragility (avg peak LVR)
- Survival horizon (years until P10 path breaches threshold)
- Worst drawdown year
- Median first failure / liquidity stress month

## Optimizer (Phase G)

Structured recommendations: `action`, `title`, `rationale`,
`expectedBenefit`, `riskTradeoff`, `confidence`, `priority`. Derived
deterministically from advanced risk metrics + portfolio composition —
auditable, not black-box.

## Explanations (Phase H)

Advisor-grade narrative blocks with heading + body + tone. Cover: why this
path wins/fails, which assumptions mattered most, which risks dominate,
regime narrative, where uncertainty comes from, what changed since last run.

## Dashboard V2 (Phase I)

`MonteCarloV4Panel.tsx` — additive panel sitting alongside the existing fan
chart and key risks. Provides:
- regime indicator strip per year
- liquidity / FIRE / insolvency / survival gauges
- VaR/CVaR/SoR/debt fragility metrics grid
- stress markers heatmap by year
- future event timeline (sampled)
- recommendations list (priority-sorted)
- advisor narrative blocks
- driver-weight bars
- assumption glossary cards

Mobile-first; progressive disclosure (collapsible sections); dark navy /
warm gold palette.

## Performance (Phase K)

- Seeded RNG (mulberry32). Same seed → identical regime path, identical
  advanced risk metrics. Verified in tests.
- Pre-allocated `Float64Array` for monthly arrays — zero allocation in
  inner loops.
- V4 wraps V3 — so the existing performance budget for V3 is preserved.
- Worker-ready modules: all V4 code is pure (no DOM, no React) and could be
  moved into a Web Worker by importing `monteCarloV4/engineV4` from a
  worker entrypoint. Deferred from this pass to reduce risk; the structure
  is in place.

## Validation (Phase L)

`script/test-monte-carlo-v4.ts` — 55 assertions covering:
- RNG determinism
- regime persistence + transitions
- rate response to regime
- property cycle bounds + recession response
- life event deltas
- behavioural sensitivities
- risk metric monotonicity (VaR / CVaR / SoR)
- optimizer structure + priority order
- narrative consistency
- glossary completeness
- canonical reconciliation preservation
- replay determinism (same seed = same result)
- impossible-state detection (no NaN/Infinity)

Run with `npm run test:monte-carlo-v4`. Wired into `npm run test:all`.

## Migration notes

- **No DB schema changes.** V4 outputs live in-memory and inside the existing
  `monteCarloResult` object that the Zustand store already caches.
  `sbSaveMCResult` continues to persist the V3 shape; V4 extras are runtime
  only.
- **No environment variable changes.**
- **No production endpoint changes.**
- **Backwards-compatible:** any code reading `MonteCarloResult` continues to
  work because V4 returns `MonteCarloResult & { v4: ... }`.
- **Feature flag:** the V4 engine is toggleable from the forecast page via a
  checkbox (`useV4Engine`, default ON). When OFF, the page uses pure V3.

## Future work (not in scope)

- True sensitivity-analysis driver weights (re-run with perturbed inputs)
- Full Web Worker offload for 10k+ sim runs
- Additional regimes (e.g. AI-led productivity boom, climate transition
  shock) with calibrated transition weights
- Persisted seed/replay history per user
