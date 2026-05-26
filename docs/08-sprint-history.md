# 08 — Sprint History

Chronological log of all sprints. Sprint numbers are not always sequential (some sprints were merged in phases). For PR-level detail see `14-open-pr-status.md` and `git log origin/main`.

## Early sprints (pre-Sprint 6)

These predate the current naming convention but the work landed via PRs #11 through #51 (mostly stacked branches). Coverage:

- **Dark mode + premium UI tokens** (PRs #12, #15)
- **Strategy discovery / Decision Engine v0** (PRs #11, #13, #14)
- **Wealth Strategy Hub rearchitecture** (PR #18)
- **Decision Engine v3 advisor-grade** (PR #20)
- **Autonomous Financial OS Phase 3** (PR #22)
- **Dashboard reconciliation: MC P50 trajectory, hierarchy, DCA cap** (PR #33)
- **Human Intelligence Translation Layer v2** (PR #34)
- **Global Intelligence Tooltip System v1** (PR #35)
- **Future Worlds UX rebuild** (PR #36)
- **Executive Overview rebuild v2 + final reconciliation pass** (PRs #37, #38)
- **Canonical HouseholdFinancialState** (PR #40) — moved Cash & Super out of Settings
- **Canonical dashboard risk architecture (8-axis risk + Det/Reconciliation/Probabilistic)** (PR #41)
- **Mobile strategic projection table** (PR #42)
- **Global Audit Mode + Calculation Trace platform feature** (PR #43, #44, #45)
- **Funding source + tax regime canonical state** (PR #46)
- **Cashflow chart funding-source path** (PR #47)
- **Cashflow reconciliation bridge** (PR #48)
- **Persistent user defaults + scenario override resolver** (PR #49)
- **Plan execution dual-status card** (PR #51)
- **Sprint 3A production hardening** (PR #61)
- **Sprint 4A canonical financial integrity** (PR #63)

**Note:** Many of these older PRs are still **open** as stacked branches but have likely been superseded by later sprints. Leave them open unless explicitly reviewing — see `14-open-pr-status.md`.

## Sprint 6 — Portfolio Lab Foundation (multi-phase)

| Phase | Title | PR | Merged |
| ----- | ----- | -- | ------ |
| 4 | Goal Closure Lab | #76 | 2026-05-25 |
| 5 | Portfolio Lab Optimizer | #77 | 2026-05-25 |

(Phases 1–3 landed via the older stacked PR chain.)

## Sprint 7 — True Portfolio Optimizer
- **PR #78** merged 2026-05-25
- Unified entry point wrapping forecast + allocation
- 846 unit-test assertions in `test:sprint-7` (still green)

## Sprint 8 — Assumption Uncertainty Engine
- **PR #79** merged 2026-05-25
- Distributional propagation for forecast inputs
- Required precursor to robust Monte Carlo

## Sprint 9 — Path-Based Wealth Simulation Engine
- **PR #80** merged 2026-05-25
- Per-strategy path simulation across Monte Carlo paths
- Introduces `pathSim.bestStrategy.netWorthBand.p50` (later root cause of the $3.15M leak — fixed in PR #88)

## Sprint 10 — Goal Solver Pro / Reverse Wealth Engineering
- **PR #81** merged 2026-05-25
- Reverse-solve strategy delta to hit FIRE goal
- 846 test assertions
- Introduced `EMPTY_GOAL_TARGETS` short-circuit at TPO:981 (fixed in PR #88)

## Sprint 11 — UX Recovery (P0)
- **PR #84** merged 2026-05-25
- Demote-don't-delete via `<AdvancedDisclosure>`
- Mobile responsiveness fixes
- Audit reports: `docs/sprint-9-audit-report.md`, `docs/sprint10-audit-report.md`

## Documentation Sprint
- **PR #82** (User Guide + Technical Guide) merged 2026-05-25
- **PR #83** (UX Recovery audit/redesign/wireframes/plan) merged 2026-05-25
- Lives in `docs/family-wealth-lab-user-guide.md`, `docs/family-wealth-lab-technical-guide.md`, `docs/ux-recovery-sprint/`

## Sprint 12 — Decision-Making System (P0)
- **PR #85** merged 2026-05-25
- Promotes `decisionCandidates` to a first-class page
- 47 test assertions in `test-sprint12-goal-solver-view` (still green)

## Sprint 13 — Decision System Reality Check (PAUSED)
- **PR #86** closed (wrong base branch)
- **PR #87** open, rebuilt on Sprint 12 base
- 6/6 scorecard, 234px above-fold overflow flagged
- **Paused** pending Sprint 13 P0 data remediation. **Do not merge.**

## Sprint 13 P0 Forensic Remediation (IN REVIEW)
- **PR #88** open as draft — 11 commits, 37 files, 120 new tests
  - **Phase A** — Schema + Canonical Goal/SWR layer (commits `2bfdcce`, `3557741`, `6db5d84`, `3f55192`, `b334e5d`)
  - **Phase B** — Engine wiring fix (commits `48d739b`, `05e6d8d`, `5e59454`)
  - **Phase C** — UI rewiring (commits `6c097c7`, `3f85e06`, `748038c`)
- Locked decisions written to `07-decision-log.md`
- Reconciliation findings in `13-production-state.md`
- **HOLD for review. Do not merge until approved.**

## Parallel: Security Sprint (IN REVIEW)
- **PR #89** open as draft — RLS advisory for 23 public tables
- SQL prepared in `supabase/migrations-pending/` (NOT applied)
- See `10-known-issues.md` § Security

## This sprint — Handover Documentation
- This PR — `/docs/01-15` knowledge base
- No code changes
- Purpose: enable a new AI account to continue the project from GitHub alone
