# Sprint 10 — Goal Solver Pro / Reverse Wealth Engineering — Production Readiness

## Summary

Sprint 10 layers a **Goal Solver Pro / Reverse Wealth Engineering** orchestrator
on top of Sprint 7 / 8 / 9. It transforms Family Wealth Lab from a simulator
into a **decision engine**: the user supplies targets ("FIRE by 2045",
"$3.5M net worth", "≤2 properties", "≤$8k/mo contribution") and Goal Solver
answers — feasibility, gap analysis, reverse-engineered required inputs,
constraint pass/fail, blockers, best path, alternative objectives, year-by-
year action plan, and a complete audit trail.

**Pure orchestration. Zero new financial formulas.** Every output traces to
an existing canonical engine field — Sprint 7 strategy metrics, Sprint 9
distributions, `canonicalFire`, or `canonicalLedger`.

## Validation Summary

| Check | Result |
|---|---|
| Type check (Sprint 10 files only) | ✅ 0 errors |
| Client build (`npm run build:client`) | ✅ Build succeeds, 18.85s |
| Regression test (`npm run test:sprint-10`) | ✅ 830/830 (20 sections) |
| Sprint 7 mutation check | ✅ Untouched |
| Sprint 8 mutation check | ✅ Untouched |
| Sprint 9 mutation check | ✅ Untouched |
| Determinism (seed=10) | ✅ Reproducible |

Pre-existing errors in `cfoEngine`, `ExecutiveDashboard`, `store.ts`, and
`dashboard.tsx` are not Sprint 10's responsibility and are explicitly ignored.

## Files Changed

**New files:**

* `client/src/lib/goalSolverPro.ts` — orchestrator engine (~960 lines)
* `client/src/components/GoalSolverProSection.tsx` — presentational shell (~430 lines)
* `script/test-sprint10-goal-solver-pro.ts` — regression suite (~640 lines, 830 assertions)
* `script/screenshot-sprint-10.ts` — SSR screenshot generator
* `docs/sprint10-audit-report.md`
* `docs/sprint10-production-readiness.md`
* `screenshots/sprint10-rich.png`, `screenshots/sprint10-empty.png`
* `screenshots/sprint10-rich.html`, `screenshots/sprint10-empty.html`

**Modified files:**

* `client/src/components/TruePortfolioOptimizer.tsx` — Sprint 10 shell
  mounted **between Sprint 8 and Sprint 9** (above the Sprint 9
  `PathSimulationSection`). +5 imports, +30 lines of orchestration.
* `package.json` — added `test:sprint-10` script.

## Performance

The Sprint 10 engine is non-Monte-Carlo: it consumes already-computed Sprint
7/8/9 outputs and performs filtering, sorting, and selection in O(n) over
the strategy pool (≤ ~20 strategies in production). End-to-end Goal Solver
run cost is dominated by the underlying Sprint 7 + Sprint 9 build, which
Sprint 10 inherits. Goal Solver itself adds < 5 ms to a fresh page load.

## Known Limits

1. **Reverse engineering is bounded by Sprint 7's enumeration.** If none of
   Sprint 7's scenarios satisfy the user's targets, Goal Solver returns the
   primary Sprint 7 recommendation as the source strategy with shortfalls
   surfaced in the gap section — it does not synthesise a new strategy.
2. **Action plan timing is sparse for Sprint 7 strategies that don't carry
   a per-year breakdown.** Years are read directly from `dimensions.propertyYear`
   and `netWorthFan[year]`. If a strategy expresses a phased plan that
   neither Sprint 7 nor Sprint 9 exposes, that phasing is not surfaced.
3. **`targetPortfolioValue` uses Sprint 9 `netWorthBand.p50` as its proxy**
   — there is no separate "portfolio value excluding PPOR" engine output,
   and Sprint 10 deliberately refuses to invent one.
4. **`requiredSavingsRate` is a derived ratio**, not an engine-native field.
   It surfaces `requiredMonthlyDCA / monthly household income` for UI clarity.
   Documented in the audit report under "Honest Framing".

## Rollback Plan

Sprint 10 is **purely additive**. The Sprint 7/8/9 engines are unchanged
(verified by §15/§16/§17 mutation checks). To roll back, revert the single
commit on `sprint-10-goal-solver-pro`. No data migrations, no API changes,
no behavior changes outside the new Sprint 10 shell.

```
git revert <sprint-10-commit-hash>
```

The Sprint 10 shell removal also removes the Goal Solver Pro UI block from
`TruePortfolioOptimizer.tsx` — Sprint 7/8/9 panels remain rendered in their
existing positions.

## Acceptance Checklist

- [x] `client/src/lib/goalSolverPro.ts` exists and exports `buildGoalSolverPro`
- [x] Engine version constant `PATH_GOAL_SOLVER_VERSION = "sprint-10.goal-solver.v1"`
- [x] Default seed = 10
- [x] `client/src/components/GoalSolverProSection.tsx` exists with required testids
- [x] Mounted in `TruePortfolioOptimizer.tsx` between Sprint 8 and Sprint 9 (above `PathSimulationSection`)
- [x] `script/test-sprint10-goal-solver-pro.ts` runs and passes ≥ 300 assertions (actual: 830)
- [x] All 20 test sections present and passing
- [x] `npm run test:sprint-10` script wired in `package.json`
- [x] Type-check passes (Sprint 10 files only) — no new errors
- [x] `npm run build:client` succeeds
- [x] Screenshots captured (`sprint10-rich.png`, `sprint10-empty.png`) + matching `.html`
- [x] `docs/sprint10-audit-report.md` written with per-output traceability table
- [x] `docs/sprint10-production-readiness.md` written (this file)
- [x] Sprint 7 / 8 / 9 engine results unchanged after Sprint 10 run (regression-verified)
- [x] No new financial formulas introduced — every output is a pass-through, ratio, or selector
- [x] PR opened as **DRAFT**; **not merged**, **not deployed**

## Merge Recommendation

**READY** — Sprint 10 is purely additive, fully covered by 830 assertions across
20 sections, and does not mutate any upstream engine. It builds successfully
and renders cleanly in both rich and empty states.
