# Scenario Engine V2

This directory contains the next-generation scenario engine. It is **dormant
behind the `VITE_SCENARIO_ENGINE_V2` feature flag** until Phase 17 cutover.

## Architecture (one-line)

```
BasePlan + Delta[]  →  ScenarioEvent[]  →  tick(state, events, rails)  →  Result
```

## Rules

1. **No V1 file may import from this dir** except `flag.ts` (and only the flag
   constant). The flag is the single boundary.
2. **No `Math.random()`, no `Date.now()` inside reducers.** All randomness must
   come through the seeded RNG injected via context.
3. **No mutation of `sf_snapshot`** — V1's data contract
   (`dashboardDataContract.ts:89` forbidden list) remains in force.
4. **No merging to `main`** until preview verification of Phase 17.

## Layout (planned)

```
scenarioV2/
├── flag.ts                    Phase 1 ✓  Feature flag boundary
├── types.ts                   Phase 1 ✓  Core type skeleton
├── index.ts                   Phase 1 ✓  Public entry point
├── events/                    Phase 3     Event store, dispatcher, ordering
├── tick/                      Phase 4     Monthly tick (pure function)
├── basePlan/                  Phase 5     Snapshot → BasePlan derivation
├── deltas/                    Phase 6     17 delta-type translators
├── regime/                    Phase 7     Macro regime engine
├── monteCarlo/                Phase 8     Real stochastic wrapper
├── borrowing/                 Phase 9     Serviceability & DSR/DTI/NSR/LVR
├── risk/                      Phase 10    9-dimension risk
├── mca/                       Phase 11    Marginal capital allocation
├── confidence/                Phase 12    Per-assumption + propagation
└── attribution/               Phase 13    8-component Shapley decomposition
```

## See also

- `/scenario_engine_v2_spec.md` — full architecture spec
- `/scenario_engine_v2_amendment_1.md` — event/state/borrowing/explainability amendment
- `/scenario_engine_v2_phase1_plan.md` — 17-phase roadmap + ERD + migration strategy
