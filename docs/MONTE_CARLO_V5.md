# Monte Carlo V5 — Realism & Advisor Intelligence Expansion

V5 is a **non-destructive** layer that sits on top of Monte Carlo V4. V4
remains the institutional simulation engine. V5 adds advisor-grade
realism modules, multi-tone narrative output, FIRE V2, assumption
transparency, validation, and preference-weighted ranking.

V5 does **not** modify:

- V4 functionality
- V3 canonical reconciliation (Dashboard / Net Worth)
- Deterministic projection consistency (PR #26)
- Existing Monte Carlo UI (V3 fan, V4 panel, scenario engine)
- Decision Engine wiring
- Advisor narrative engine V2 (V5 narratives sit alongside, opt-in)

## Module map (`client/src/lib/monteCarloV5/`)

| Phase | Module | Purpose |
| ----- | ------ | ------- |
| 1 | `regimesV5.ts`            | V5 regime vocabulary + overlay flags layered on V4's 11-state Markov chain |
| 2 | `correlatedShocks.ts`     | Cross-asset Cholesky-based correlated normals + GARCH-lite + jumps + cascades |
| 3 | `householdRealism.ts`     | Childcare/school/parental leave/career/medical timelines |
| 4 | `propertyRealismAU.ts`    | IO→P&I transition, refinance windows, vacancy, council/land tax/insurance inflation |
| 5 | `portfolioIntelligence.ts`| Buffer targeting, super caps, debt prioritisation, drift detection |
| 6 | `fireEngineV2.ts`         | SWR bands (3 / 3.5 / 4 / dynamic), sequence risk, bridge, age pension, flavour classification |
| 7 | `narrativeV3.ts`          | Multi-tone advisor narratives: plain / advisor / optimistic / conservative / stress |
| 8 | `transparency.ts`         | Assumption blocks, top drivers, downside contributors, confidence score |
| 9 | `preferenceWeights.ts`    | Preference vector → re-rank only (does not change math outputs) |
| 10 | `projectionModes.ts`     | Mode selector (median / conservative / optimistic / deterministic overlay) over the single canonical fan_data |
| 11 | `validation.ts`          | NW recon, planned-vs-current, offset/debt/contribution recon, sanity warnings |
| 12 | `engineV5.ts` + `MonteCarloV5Panel.tsx` | Orchestrator + UI panel |

## How it composes with V4

```
runMonteCarlo (V3)
       └── runMonteCarloV4   ── V4 extras (regimes, advanced risk, narratives, optimiser)
                  └── runMonteCarloV5 ── V5 extras under `result.v5`
```

V5's smoke test asserts:

- V4 block still produced (`result.v4`)
- V3 percentile order preserved (`p10 ≤ median ≤ p90`)
- V5 block populated with narratives, transparency, FIRE, portfolio, validations

## UI integration

- `MonteCarloV5Panel.tsx` renders V5 outputs (regime strip, multi-tone
  narrative, transparency, FIRE V2, portfolio intelligence, validation
  chips).
- A new opt-in toggle `data-testid="toggle-v5-engine"` on the AI Forecast
  page enables V5. Default **off** to preserve V4 UX.
- When enabled, V5 wraps V4 — both panels render.
- The Dashboard projection table remains the canonical Monte Carlo fan
  (single SoT). Phase 10 mode selector is a UI helper over the same array;
  it does not introduce a parallel projection source.

## Determinism

All V5 modules are seeded via `mulberry32 / hashSeed`. V5 narratives, V5
regime labels, V5 overlays, and the transparency report are reproducible
across reruns with the same seed.

V3's underlying engine still uses `Math.random`, so headline V4 percentiles
remain stochastic; this is unchanged from V4.

## Performance notes

- Correlated shock paths: 5 factors × N months, with Cholesky cached per
  regime — ~$O(K^2 N)$ per representative path. Single representative
  path used for narrative + summary; multi-path mode is worker-ready but
  deferred behind the same-seed contract.
- Property realism: pre-allocated `Float64Array` per property; no hot-loop
  allocations.
- Household timeline: pre-allocated arrays.
- The smoke test runs end-to-end in ~1-2s with 100 sims.

## Production safety

- No DB schema changes
- No production env var changes
- No supabase / network calls added
- No localStorage / sessionStorage / IndexedDB / cookies added
- No worker registration (modules are worker-ready but not auto-spawned)
- All V5 outputs nested under `result.v5` — existing consumers ignore them
- Toggle defaults OFF — existing UX unchanged when the user does not opt in
