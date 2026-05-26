# 07 — Decision Log

A chronological record of significant architectural and product decisions. Newest at bottom.

## 2026-05 — Sprint 7: True Portfolio Optimizer
**Decision:** Wrap forecast + allocation in a single optimizer entry point.
**Rationale:** Avoid divergent per-page forecast assumptions.
**Status:** Merged (PR #78).

## 2026-05 — Sprint 8: Assumption Uncertainty Engine
**Decision:** Propagate uncertainty distributions through forecast rather than point estimates.
**Rationale:** Enables Monte Carlo and confidence bands.
**Status:** Merged (PR #79).

## 2026-05 — Sprint 9: Path-Based Wealth Simulation
**Decision:** Simulate strategies across paths rather than against a single deterministic projection.
**Rationale:** Required to produce robust scoring of decisions.
**Status:** Merged (PR #80). Side effect: introduced `pathSim.bestStrategy.netWorthBand.p50` field that later leaked into Current NW.

## 2026-05 — Sprint 10: Goal Solver Pro / Reverse Wealth Engineering
**Decision:** Given a FIRE goal, solve for the strategy delta. Output ranks decisions by feasibility + probability impact.
**Rationale:** Decisions, not just projections.
**Status:** Merged (PR #81). Introduced `EMPTY_GOAL_TARGETS` short-circuit at `TruePortfolioOptimizer.tsx:981` (later fixed in Phase B).

## 2026-05-25 — Sprint 11: UX Recovery (P0)
**Decision:** Demote excess UI; use `<AdvancedDisclosure>` for legacy.
**Rationale:** Surface area had grown beyond comprehensibility.
**Status:** Merged (PR #84).

## 2026-05-25 — Documentation Sprint
**Decision:** Ship User Guide + Technical Guide + UX Recovery audit pack.
**Status:** Merged (PRs #82, #83).

## 2026-05-25 — Sprint 12: Decision-Making System (P0)
**Decision:** Promote `decisionCandidates` to first-class page; rank with feasibility + probability.
**Status:** Merged (PR #85).

## 2026-05-26 — Sprint 13 Scoping: 30-Second 5-Question Rule
**Decision:** Primary view should answer 5 questions in 30 seconds: Where am I? Where am I going? How likely? What blocks me? What do I do next?
**Status:** Scoped in PR #87 (open, paused for data remediation).

## 2026-05-26 — Sprint 13 PR #87 Reality Check
**Decision:** Build "Reality Check" tab inside Portfolio Lab to show ledger vs forecast vs goal.
**Status:** PR #87 open, 6/6 scorecard but 234px above-fold overflow flagged. **NOT merged** pending data remediation.

## 2026-05-26 — STOP FEATURE WORK (forensic audit)
**Decision:** Halt UX rebuild. Run forensic audit to explain why Current NW shows $3.15M.
**Rationale:** User found a $3.15M display that did not reconcile to ledger ($816,500). Audit identified five smoking guns including forecast-fallback leak and five conflicting SWR sources.
**Status:** Audit findings written to `portfolio_lab_forensic_audit.md` (workspace) and incorporated into PR #88.

## 2026-05-26 — Phase 0 Production Reconciliation
**Decision:** Run reconciliation against production data BEFORE writing any code.
**Outcome:** Confirmed ledger NW = $816,500, MC P50 at target = $3,240,679, drift = $2.42M. Identified five smoking guns. Confirmed 23 RLS-disabled tables.
**Status:** Written to `phase_0_production_reconciliation.md`.

## 2026-05-26 — Ten Locked Decisions (Sprint 13 P0 Forensic Remediation)
1. **Canonical goal/SWR source = `mc_fire_settings`** as single canonical source. Add explicit `goals_set` boolean + `goal_set_timestamp` + `swr_pct`. Stop using scattered SWR sources. If user hasn't explicitly set goals → "Goal not set", do NOT invent defaults.
2. **Fix Current Net Worth.** Must come from canonical ledger / `sf_snapshot`. Do NOT use Monte Carlo P50 future-year values as current NW. Fix `pathSim.bestStrategy.netWorthBand.p50` overriding `nwGap.actual`. Add reconciliation test.
3. **Monte Carlo / forecast freshness.** Fix wiring first; THEN re-run MC. Add freshness metadata. If stale, UI must say so.
4. **Scenario persistence.** `sf_scenario_results` must NOT remain empty while UI shows rankings. Persist or clearly label transient.
5. **Remove fake/empty recommendations.** No NaN, empty FIRE year, empty target date in primary UI. Show clear CTAs.
6. **Do-nothing comparison.** Replace flat-line baseline with real current-path forecast. Three labelled series.
7. **Source lineage.** Every promoted number shows its source.
8. **RLS security advisory.** Parallel high-severity workstream. Don't block data remediation. Prepare SQL but do NOT auto-apply.
9. **UX rebuild AFTER data is correct.** 30-second 6-question primary view; Audit Mode / Advanced Disclosure for everything else.
10. **Validation gates before PR:** files changed / migration / source-of-truth mapping / before-after reconciliation / unit tests / build / production-readiness / rollback plan.

## 2026-05-26 — PR #88: Data-Layer Remediation (A+B+C)
**Decision:** Implement all ten locked decisions in three phases (Schema/Canonical/Freshness → Engine wiring → UI rewiring).
**Outcome:** 11 commits, 37 files, 120 new unit tests, typecheck still 66, build green. Migration NOT applied. PR opened as draft.
**Status:** Open, HOLD for review.

## 2026-05-26 — PR #89: RLS Security Advisory
**Decision:** Track RLS remediation separately from data layer to avoid blocking.
**Outcome:** SQL prepared in `supabase/migrations-pending/` (NOT applied — would take app offline without policies). Advisory-only PR opened as draft.
**Status:** Open, advisory only.

## 2026-05-26 — STOP FEATURE DEVELOPMENT (this handover sprint)
**Decision:** Halt all feature work. Create complete knowledge-base under `/docs` so a brand-new AI account can continue the project.
**Status:** In progress (this PR).
