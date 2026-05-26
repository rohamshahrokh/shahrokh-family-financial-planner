# 14 — Open PR Status

**Snapshot:** 2026-05-26

## Summary

| Status | Count |
| ------ | ----- |
| Open and active (review needed) | 3 |
| Open but superseded / stale | 26 |
| Recently merged (last 7 days) | 8 |

## Active open PRs (need review or action)

### PR #88 — Sprint 13 P0 Forensic Remediation — Data Layer (A+B+C)
- **State:** Draft
- **Base:** `main`
- **Head:** `feat/remediation-C-ui-rewiring`
- **Created:** 2026-05-26
- **Commits:** 11 across Phases A/B/C
- **Tests:** +120 new (39 + 27 + 54), all green
- **Typecheck:** 66 (at baseline)
- **What it does:** Implements all 10 locked decisions from Sprint 13 P0 forensic remediation
- **Required action:** USER REVIEW → mark ready → merge → apply migration → deploy → reconcile
- **HOLD: do not merge without explicit approval.**
- **URL:** https://github.com/rohamshahrokh/shahrokh-family-financial-planner/pull/88

### PR #89 — Security: RLS Advisory — 23 tables RLS-disabled
- **State:** Draft (advisory only)
- **Base:** `main`
- **Head:** `security/rls-advisory`
- **Created:** 2026-05-26
- **What it does:** Adds documentation + prepared (un-applied) SQL for enabling RLS on 23 public tables
- **Required action:** policy design decision → branch test → conditional merge
- **HOLD: SQL prepared, NOT applied. Enabling RLS without policies = app offline.**
- **URL:** https://github.com/rohamshahrokh/shahrokh-family-financial-planner/pull/89

### PR #87 — Sprint 13 — Decision System Reality Check (v2 — rebuilt on S12)
- **State:** Open (not draft, not approved)
- **Base:** `main`
- **Head:** `feat/sprint13-reality-check-v2`
- **HEAD commit:** `94fd926` (MUST NOT be modified)
- **Created:** 2026-05-26
- **What it does:** Sprint 13 UX rebuild — Reality Check tab in Portfolio Lab
- **Known issue:** 234px above-fold overflow
- **Status:** **PAUSED.** Wait for PR #88 to merge + deploy before re-evaluating.
- **URL:** https://github.com/rohamshahrokh/shahrokh-family-financial-planner/pull/87

## Stale / superseded open PRs (consider closing)

These are mostly long stacked branches from earlier sprints. The work they represent has either been **merged via subsequent sprints** or **replaced by a later architectural decision**. None are blockers — leaving them open is fine, but cleanup-closing them is recommended.

| # | Title | Likely superseded by |
| - | ----- | -------------------- |
| 63 | Sprint 4A — Critical Financial Engine Remediation | Sprints 7–10 |
| 61 | Sprint 3A production hardening fixes | merged sprints |
| 51 | feat(plan-execution): dual-status PLAN EXECUTION card — stacked on #49 | Sprint 12 |
| 49 | fix(user-defaults): persistent modelling defaults + scenario override resolver | Sprint 12 / canonicalGoal |
| 48 | feat(audit): cashflow bridge reconciliation trace | Audit Mode platform feature |
| 47 | fix(cashflow-chart): route Plan Execution Capacity through funding-aware engine | Sprint 12 |
| 46 | fix(funding-source,tax-regime) | Sprint 12 funding logic |
| 45 | FWL-MonteCarlo-ExpectedReturn-Control | Sprint 8 Uncertainty Engine |
| 44 | feat(audit-mode): platform discoverability | Audit Mode merged feature |
| 43 | feat(audit-mode): global Audit Mode + Calculation Trace platform feature | Audit Mode merged feature |
| 42 | fix(mobile): expandable projection cards for Strategic Wealth table | Sprint 11 UX recovery |
| 41 | feat(dashboard): canonical projection + risk architecture | Sprint 9/10 |
| 40 | feat: canonical HouseholdFinancialState — move Cash & Super inputs out of Settings | Sprint 11 |
| 38 | FWL Executive Overview FINAL Reconciliation Pass | Sprint 11/12 |
| 37 | FWL Executive Overview Rebuild V2 — calm Family Office Cockpit | DO NOT MERGE preview only |
| 36 | feat(future-worlds): UX rebuild — executive summary + three-world model + sensitivity map | Sprint 11/12 |
| 35 | feat(intelligence): Global Intelligence Tooltip System V1 | merged |
| 34 | FWL Human Intelligence Translation Layer V2 | merged |
| 33 | Dashboard reconciliation fix: MC P50 trajectory, hierarchy, DCA cap | Sprint 9 |
| 22 | Autonomous Financial OS Phase 3 | superseded |
| 20 | Decision Engine: advisor-grade V3 rebuild | Sprint 12 |
| 18 | feat(wealth-strategy-hub): rearchitecture v1 — executive orchestration layer | Portfolio Lab |
| 15 | fix(decision): result card dark mode contrast — semantic tokens | merged dark mode |
| 14 | fix(decision): dark mode contrast, auto-select numeric inputs, glossary tooltips | merged |
| 13 | feat(decision): premium strategy discovery cards + deep dive | Sprint 12 |
| 12 | feat(ui): premium fintech dark mode v2 (tokens + chrome) | merged |
| 11 | fix(tax-alpha): use saved tax profile when override active [DO NOT MERGE] | superseded |

**Recommendation:** in a single cleanup session, walk each of these, confirm superseded, and `gh pr close` with a comment pointing to the replacing sprint PR.

## Recently merged (last 7 days)

| PR | Title | Merged | Branch |
| -- | ----- | ------ | ------ |
| #85 | Sprint 12 — Decision-Making System (P0) | 2026-05-25 22:29 | `feat/sprint12-decision-system` |
| #84 | Sprint 11 — UX Recovery (P0) | 2026-05-25 15:24 | `feat/sprint11-ux-recovery` |
| #83 | Docs: UX Recovery Sprint — Audit, Redesign, Wireframes & Plan | 2026-05-25 15:31 | `docs/ux-recovery-sprint-audit` |
| #82 | Docs: Family Wealth Lab User & Technical Guides | 2026-05-25 15:31 | `docs/family-wealth-lab-guides` |
| #81 | Sprint 10 — Goal Solver Pro / Reverse Wealth Engineering | 2026-05-25 10:06 | `sprint-10-goal-solver-pro` |
| #80 | Sprint 9 — Path-Based Wealth Simulation Engine | 2026-05-25 07:54 | `sprint-9-path-based-wealth-simulation` |
| #79 | Sprint 8 — Assumption Uncertainty Engine | 2026-05-25 06:14 | `sprint-8-assumption-uncertainty-engine` |
| #78 | Sprint 7 — True Portfolio Optimizer | 2026-05-25 05:29 | `sprint-7-true-portfolio-optimizer` |

## Branch protection notes

- `main` is the only protected branch
- `feat/sprint13-reality-check-v2` (PR #87) is informally protected — head MUST stay at `94fd926` per locked decision
- Phase A/B/C remediation branches (`feat/remediation-A-canonical-goal-layer`, `feat/remediation-B-engine-wiring`, `feat/remediation-C-ui-rewiring`) are now only consumed via PR #88's head branch
- `security/rls-advisory` powers PR #89
- `docs/fwl-knowledge-base-handover` powers this handover PR
