# 15 — AI Handover Guide

**Purpose:** This document, plus the rest of `/docs`, is the complete handover package for a brand-new AI account taking over the Family Wealth Lab project. Read this file first, then the files in the "Read these next" section.

## TL;DR — what you need to know in 30 seconds

1. **Project:** A single-household wealth-management web app (https://familywealthlab.net) owned and operated by Roham Shahrokh for the Shahrokh family in Brisbane, Australia.
2. **Stack:** React + TypeScript SPA → Express → Supabase Postgres → Vercel.
3. **Status:** Production is live, but a major data-layer remediation (PR #88) and security advisory (PR #89) are **awaiting user review**. PR #87 (Sprint 13 UX rebuild) is paused.
4. **What's broken in production right now:** Current Net Worth tile shows $3.15M instead of $816,500 (forecast leak); SWR effectively 4% instead of user-set 7%; flat do-nothing chart; no freshness banner; no source lineage tags; empty goal tiles show NaN. All fixed in branch, not yet deployed.
5. **First job:** Help the user review and merge PR #88, apply the schema migration, redeploy, and reconcile.

## Read these files first (in order)

1. **`docs/01-project-overview.md`** — what FWL is, who it's for, vision and principles
2. **`docs/02-current-state.md`** — what is live, what is broken, what is awaiting deploy
3. **`docs/13-production-state.md`** — authoritative reconciliation: every production number, verified vs unverified
4. **`docs/14-open-pr-status.md`** — every open PR and its meaning
5. **`docs/11-roadmap.md`** — recommended sequencing of next steps

## Read these next

6. **`docs/03-system-architecture.md`** — layer diagram, request lifecycle, deployment
7. **`docs/04-data-model.md`** — Supabase schema, table-by-table, with canonical NW formula
8. **`docs/05-engine-map.md`** — every analytical engine, what feeds it, what consumes it
9. **`docs/06-ui-map.md`** — every screen + which numbers belong to which source
10. **`docs/07-decision-log.md`** — chronological record of architectural decisions, including the 10 locked decisions
11. **`docs/08-sprint-history.md`** — full sprint history including PR numbers and what each sprint shipped
12. **`docs/09-audit-backlog.md`** — every audit finding, its status, and the PR that addresses it
13. **`docs/10-known-issues.md`** — every known defect with severity
14. **`docs/12-deployment-guide.md`** — how to build, deploy, roll back

## Repository navigation cheat sheet

| You need to... | Look in... |
| -------------- | ---------- |
| Understand the canonical net worth formula | `docs/04-data-model.md` § "Canonical ledger" |
| Find the canonical goal/SWR selector | `server/lib/canonicalGoal.ts` |
| Find the FIRE summary view-model | `client/src/state/goalSolverView.ts` |
| Find the Portfolio Lab page | `client/src/components/portfolio-lab/TruePortfolioOptimizer.tsx` |
| Find the reconciliation invariant | `client/src/state/dashboardDataContract.ts` (search for `assertCurrentNwIsLedger`) |
| Find the freshness banner | `client/src/components/portfolio-lab/ForecastFreshnessBanner.tsx` |
| Find the source-tag component | `client/src/components/portfolio-lab/SourceTag.tsx` |
| Find an engine | `server/lib/<engine-name>/` |
| Find a test | `package.json` scripts (`test:*`) → corresponding file in repo |
| Apply a database migration | `supabase/migrations/` |
| See the smoking-gun trace | `docs/13-production-state.md` § "The smoking gun" |

## Core conventions

- **Branch off `main` for all new work.**
- **Typecheck baseline = 66.** Every PR must end at ≤66 errors. Run `npm run check`.
- **Demote, don't delete.** Wrap legacy UI in `<AdvancedDisclosure>` rather than removing.
- **Goal not set ≠ defaults.** If user hasn't explicitly set FIRE goals, show "Goal not set" with CTA. Never invent a 4% SWR.
- **Source visible.** Every promoted number renders a `SourceTag` chip.
- **Freshness visible.** Stale MC → amber banner.
- **Migration files do NOT auto-apply.** Always write file first, apply explicitly with user confirmation.
- **Coding work via `codebase` subagents only.** Do not navigate / edit source code as the main agent.
- **Single household.** `owner_id = 'shahrokh-family-main'`. No multi-tenant logic.

## The 10 locked decisions (Sprint 13 P0 Forensic Remediation)

These are the operating rules. Do not violate without explicit user re-approval.

1. **Canonical goal/SWR source = `mc_fire_settings`** — single canonical source with explicit `goals_set` boolean. No defaults if user hasn't set goals.
2. **Fix Current Net Worth** — always from `sf_snapshot` ledger. NEVER from Monte Carlo P50 future-year. Reconciliation invariant added.
3. **Monte Carlo / forecast freshness** — wired before re-run; UI must say if stale.
4. **Scenario persistence** — `sf_scenario_results` must be populated OR rankings labelled transient.
5. **No fake/empty recommendations** — no NaN/empty in primary UI. Show CTAs ("Set FIRE goal", "Run forecast", "Update snapshot", "Run Monte Carlo").
6. **Do-nothing comparison** — real current-path forecast, not flat line. Three labelled series.
7. **Source lineage** — every promoted number shows its source.
8. **RLS security advisory** — parallel high-severity workstream. SQL prepared, NOT auto-applied.
9. **UX rebuild AFTER data is correct.** 30-second 6-question primary view; Audit Mode / Advanced Disclosure for everything else.
10. **Validation gates before PR** — files changed, migration, source-of-truth mapping, before/after reconciliation, unit tests, build pass, production-readiness, rollback plan.

## How the AI assistant works on this project (operational rules)

These rules are learned-the-hard-way conventions for the AI assistant interacting with this repo:

1. **GitHub access:** Use `gh` CLI with `api_credentials=["github"]`. Never use `browser_task` for GitHub URLs.
2. **Coding work:** Use the `codebase` subagent (not main-agent code edits). Pass `metadata={"repo_url": "https://github.com/rohamshahrokh/shahrokh-family-financial-planner"}` and `preload_skills=["coding"]`.
3. **Subagent model:** Use **Sonnet 4.6** for coding subagents. Opus has silently failed in this repo twice — avoid.
4. **Supabase access:** Use the Supabase MCP `call_external_tool(source_id="supabase", tool_name="execute_sql")`.
5. **Vercel access:** `npx -y vercel --token "$VERCEL_TOKEN" --scope rohamshahrokhs-projects`.
6. **Confirm destructive actions:** Always `confirm_action` before merges, deploys, migrations, sending messages.
7. **Phase 0 before any code:** For data issues, always run a production reconciliation BEFORE editing code. The user explicitly asked for this on 2026-05-26 and it surfaced the smoking gun.
8. **Save context to workspace files.** Subagents have limited context; pass file paths in objectives instead of inlining large content.
9. **Don't touch PR #87 branch.** `feat/sprint13-reality-check-v2` HEAD must remain at `94fd926`.

## Project vision (one paragraph)

Family Wealth Lab is the Shahrokh family's private cockpit for financial decisions. It tracks current state (canonical ledger), forecasts the future (deterministic + Monte Carlo), and recommends discrete decisions (delay property purchase, maximise super, change funding source, etc.) ranked by feasibility and probability of hitting FIRE. The end state is a 30-second, six-question primary view that tells Roham exactly where the family is, where it's going, how likely the goal is, what blocks it, and what to do next. Everything beyond that 30-second view lives behind Audit Mode and Advanced Disclosure.

## Architecture in one paragraph

A Vite-built React SPA (`client/`) talks to an Express server (`server/`) via JSON over `/api/*`. The server holds the engines (forecast, Monte Carlo, optimizer, Goal Solver Pro, Decision Engine) and the canonical selectors (`canonicalGoal`, `forecastFreshness`). State persists in Supabase Postgres. Vercel serves the SPA statically and the API as a serverless function. The single tenant is `owner_id='shahrokh-family-main'`. Audit Mode is a cross-cutting trace layer; source-lineage chips (`SourceTag`) and the reconciliation invariant (`assertCurrentNwIsLedger`) enforce data integrity end-to-end.

## Engine summary (one paragraph)

The canonical goal selector reads `mc_fire_settings` and never falls back. The forecast engine projects the ledger forward year-by-year with super contributions and planned investments. The do-nothing forecast does the same but with no strategy overlay. Monte Carlo wraps the forecast with uncertainty distributions and produces P10/P50/P90 plus probability-of-FIRE. The True Portfolio Optimizer (Sprint 7) finds the best allocation. The Goal Solver Pro (Sprint 10) reverse-engineers the strategy delta. The Decision Engine (Sprint 12) ranks discrete decisions. Path-Based Simulation (Sprint 9) simulates strategies across paths. The forecast freshness primitive flags stale runs. The reconciliation invariant catches Current-NW drift.

## Merged work (concise)

Sprints 7–12 are live (PRs #78, #79, #80, #81, #84, #85). Documentation Sprint (PRs #82, #83) is live. Sprints 1–6 landed via earlier stacked PRs (mostly merged, some superseded — see `08-sprint-history.md`).

## Unmerged work (concise)

- **PR #87** — Sprint 13 UX rebuild (PAUSED, do not merge)
- **PR #88** — Sprint 13 P0 Forensic Remediation data layer (DRAFT, awaiting review)
- **PR #89** — RLS Security Advisory (DRAFT, advisory only)
- **PR #11–#51** — long chain of stacked branches mostly superseded by later sprints (cleanup candidate)

## Audit backlog (concise)

See `09-audit-backlog.md` for full table. Summary: 11 audit findings (A1–A11), 1 security finding (SEC1), 3 UX findings, ~6 deferred/cleanup items. The 6 visible-in-production critical findings (A1–A6) are all FIXED IN BRANCH on PR #88 — they need only merge + deploy.

## Known issues (concise)

See `10-known-issues.md` for full table. The biggest live issue: production still displays $3.15M Current NW. All other known issues are either fixed-in-branch (awaiting PR #88) or deferred medium/low severity.

## Open questions for the user

These are decisions the user must make to unblock progress:

1. **Approve PR #88?** It is ready — typecheck 66, build green, 120 new tests, no production data modified.
2. **RLS policy model?** Single-household `USING (true)`? Or require `auth.uid() IS NOT NULL`? Or migrate to Supabase auth properly? PR #89 cannot proceed without this answer.
3. **Persist scenarios (option a)?** Or accept the transient label and revisit later?
4. **`onRerun` wiring for the freshness banner.** Should clicking the CTA call an existing MC run endpoint, or trigger a new one?
5. **PR #87 fate.** Resume after PR #88 deploys, or close and start fresh on top of the corrected data layer?
6. **Stacked PRs #11–#51 cleanup.** OK to close them all as superseded?

## Recommended next steps (in priority order)

1. Review and merge PR #88 (the data-layer remediation)
2. Apply schema migration (`supabase migration up`)
3. Redeploy to Vercel (automatic on `main` push)
4. Production reconciliation: confirm $816,500 displays, source tags render, freshness banner shows
5. Re-run Monte Carlo (manual via UI; freshness banner CTA may need wiring per KI-17)
6. Decide RLS policy model and proceed with PR #89 in a Supabase branch
7. Decide PR #87 fate
8. Close superseded stacked PRs in a cleanup pass
9. Resume Sprint 13 UX rebuild per locked decision #9 (30-second 6-question view)

## "I'm a new AI, where do I start?"

1. Read this file (you're doing it).
2. Read `docs/01-project-overview.md`, `docs/02-current-state.md`, `docs/13-production-state.md`, `docs/14-open-pr-status.md`, `docs/11-roadmap.md` — in that order.
3. Skim `docs/03-system-architecture.md`, `docs/04-data-model.md`, `docs/05-engine-map.md`, `docs/06-ui-map.md` to load the structure.
4. Run a sanity check: `gh pr list --state open` should show PRs #87, #88, #89 plus the older stacked chain.
5. Ask the user: "I've read the handover package. Where would you like to start — PR #88 review, PR #89 RLS design, PR #87 fate, or something else?"
