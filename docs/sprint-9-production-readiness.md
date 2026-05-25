# Sprint 9 — Path-Based Wealth Simulation: Production Readiness

**Branch:** `sprint-9-path-based-wealth-simulation`
**Engine version stamp:** `sprint-9.path-sim.v1`
**Status:** Ready for review (draft PR).
**Author:** Sprint 9 implementation
**Date:** 2026-05-25

## Summary

Sprint 9 layers a path-based wealth simulation on top of Sprint 7 (true
portfolio optimizer) and Sprint 8 (assumption uncertainty). For each
selected Sprint 7 strategy, the engine runs **≥ 1,000 full household
life-paths** (using the existing `runFireMonteCarlo` engine) and exposes
the resulting distribution — net-worth bands, FIRE-year bands, cumulative
P(FIRE) curve, fan chart, scenario heatmap, driver sensitivity, and a full
audit trail.

The engine is pure orchestration: no new financial formulas, no fabricated
numbers, every output traceable to a canonical engine call.

## Validation summary

| Check                                       | Result                                                       |
| ------------------------------------------- | ------------------------------------------------------------ |
| TypeScript (`tsc --noEmit`) on Sprint 9 files | **0 errors** (83 pre-existing errors elsewhere, unchanged) |
| Regression test (`test:sprint-9`)           | **558 assertions, 17/17 sections passing in 9.5 s**         |
| Client build (`build:client`)               | **success, 19.3 s** (only pre-existing chunk-size warnings) |
| Sprint 7 mutation check (§16)               | **Sprint 7 result unchanged after Sprint 9 run**             |
| SSR render check (§17)                      | **All 13 required `path-sim-*` testids render**              |
| Screenshots captured                        | `sprint-9-rich.png`, `sprint-9-empty.png`                    |

## What changed

### New files

| File                                                  | Lines | Purpose                                         |
| ----------------------------------------------------- | ----- | ----------------------------------------------- |
| `client/src/lib/pathSimulationEngine.ts`              | 1,193 | Sprint 9 orchestration engine                   |
| `client/src/components/PathSimulationSection.tsx`     | 741   | 10-section UI shell + empty state               |
| `script/test-sprint-9-path-simulation.ts`             | 594   | 17-section, 558-assertion regression test       |
| `script/screenshot-sprint-9.ts`                       | 156   | Static SSR + headless Chromium screenshot tool  |
| `docs/sprint-9-audit-report.md`                       |  ~150 | Engine architecture + per-output traceability    |
| `docs/sprint-9-production-readiness.md`               |  ~120 | This document                                   |

### Modified files

| File                                                  | Change                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `client/src/components/TruePortfolioOptimizer.tsx`    | Adds the Sprint 9 imports + `useMemo` for `pathSimResult` + the `<PathSimulationSection>` mount block |
| `package.json`                                        | Adds `"test:sprint-9": "tsx script/test-sprint-9-path-simulation.ts"`                                  |

## Performance characteristics

| Operation                                  | Latency                                          |
| ------------------------------------------ | ------------------------------------------------ |
| One `runFireMonteCarlo(N=1,000)` call      | ~150 ms (constant in N for the engine setup)     |
| Per-strategy run (main + 7 driver perturbations) | ~1.2 s                                       |
| 3-strategy Sprint 9 run with full sensitivity     | ~3 s end-to-end                              |
| Full regression suite (9 engine builds, 558 assertions) | **9.5 s**                                |

The bottleneck is `runFireMonteCarlo`'s per-call setup, not the simulation
count. Increasing `simsPerStrategy` from 1,000 to 10,000 would still
complete in well under 10 s for a 3-strategy run.

### Earlier prototype that was discarded

An initial implementation ran `runFireMonteCarlo(simulationCount=1)` N
times per strategy and stitched the per-path results in Sprint 9. That
approach took ~148 s per 3-strategy run and was both **slower and less
realistic** — it collapsed the engine's intra-simulation correlation to a
single sample per call. The current code calls `runFireMonteCarlo` **once
per strategy** with `simulationCount = N`, which is faster and uses the
engine's correlated draws as intended.

The same 1×N refactor was applied to driver sensitivity (7 perturbed FireMC
calls per best strategy with `simulationCount = 200` each, replacing the
old 7×200 = 1,400 N×1 calls).

## Known limits & honest framing

These are surfaced in the UI and the audit report so users see them
explicitly, not hidden:

1. **`representativePaths` are synthesised**, not actual stored single
   simulation runs. They are derived from `FireMCResult.fanData`'s
   percentile slices (P10/P50/P90). Each path's `sourceIndex` is set to
   `-1` to mark it as synthesised. The numbers themselves are real engine
   outputs — what's synthesised is the framing as a single "trajectory".
2. **Crypto-only investment tilt** flags as `notEngineModelled = true`
   because FireMC does not differentiate crypto-specific path dynamics
   beyond its existing crypto return/vol knobs. The numbers are real; the
   *crypto-specific attribution* is what's flagged.
3. **Driver sensitivity uses 200 sims per perturbed driver**, not 1,000, to
   bound runtime. This is documented in the engine, surfaced in the audit
   trail entry, and is sufficient for ranking the directionality of each
   driver (which is what the UI uses it for).

## Sprint 7 / Sprint 8 regression

- §16 verifies the Sprint 7 `truePortfolioOptimizer` result object is
  structurally identical before and after `buildPathSimulationEngine(...)`.
  Sprint 9 never mutates Sprint 7 state.
- Sprint 8 (`assumptionUncertaintyEngine`) outputs are read-only inputs;
  Sprint 9 does not call any Sprint 8 mutators.

## Determinism

`PATH_SIM_ENGINE_VERSION = "sprint-9.path-sim.v1"`. Same `seed` ⇒ identical
P10/P25/P50/P75/P90 bands, identical histograms, identical driver
sensitivity rows (verified by §4 across two independently constructed
engine runs with the same seed).

## Rollback plan

The Sprint 9 surface is **purely additive**:

- The new files (`pathSimulationEngine.ts`, `PathSimulationSection.tsx`,
  `test-sprint-9-path-simulation.ts`, `screenshot-sprint-9.ts`) can be
  deleted without affecting Sprint 7 / Sprint 8.
- The `TruePortfolioOptimizer.tsx` modification adds:
  - One `useMemo` block that produces `pathSimResult`.
  - One JSX block: `<div data-testid="true-portfolio-optimizer-sprint9-shell"><PathSimulationSection result={pathSimResult} /></div>`.
  - The Sprint 9 imports.

  Reverting these three changes restores the pre-Sprint-9 behaviour with
  no risk to Sprint 7 / Sprint 8 / Phase 5.
- The `package.json` addition is a non-runtime `test:sprint-9` script.

A one-commit revert (`git revert <merge-sha>`) is sufficient to roll back
Sprint 9 entirely.

## What I am NOT claiming

- I am **not** claiming the dev server was exercised — it requires Supabase
  env config that is not provisioned in this environment. Screenshots are
  captured via static SSR + headless Chromium (`script/screenshot-sprint-9.ts`).
- I am **not** claiming `familywealthlab.net` shows the Sprint 9 UI — this
  branch is unmerged, so production still renders Sprint 8.
- I am **not** introducing any new household constants, asset-class
  formulas, tax rules, mortgage formulas, or property assumptions. All
  knobs read from `DEFAULT_FIRE_MC_SETTINGS` (engine documented defaults)
  or the user's `mc_fire_settings`.

## Acceptance checklist for review

- [x] All 17 test sections pass
- [x] All 558 assertions pass
- [x] Client builds without new errors
- [x] TypeScript compiles without new errors in Sprint 9 files
- [x] Sprint 7 outputs are not mutated by Sprint 9
- [x] All Sprint 9 outputs are traceable to canonical engines (`canonicalFire`, `dashboardDataContract`, `truePortfolioOptimizer`, `fireMonteCarlo`)
- [x] Synthesised outputs (`representativePaths`) are flagged with `sourceIndex = -1`
- [x] Not-engine-modelled tilts propagate `notEngineModelled = true`
- [x] Audit trail metadata records engine version + seed + simsPerStrategy
- [x] UI renders 10 sections with stable `path-sim-*` testids
- [x] Empty state renders cleanly when canonical ledger is empty
- [x] Screenshots captured for rich and empty states

---
🤖 *Generated by Computer*
