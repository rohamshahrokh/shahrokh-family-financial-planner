# 01 — Project Overview

## What is Family Wealth Lab (FWL)

Family Wealth Lab is a private, single-household wealth-management web application owned and operated by Roham Shahrokh for the Shahrokh family in Brisbane, Australia. It is intentionally **not a multi-tenant SaaS** — it is a family-office cockpit purpose-built for one household, with Australian tax rules, dual-super (Roham + Fara) modelling, an investment-property planner, and a forward-looking FIRE (Financial Independence / Retire Early) decision system.

## Vision

A single source of truth for the family's financial decisions: net worth, cash flow, super balances, property strategy, stock and crypto holdings, FIRE goal feasibility, and Monte Carlo–backed probability of success. The application should produce **decisions** ("delay PPOR upgrade by 2 years", "max super contributions", "buy property X in year Y"), not just charts.

## Audience

- **Primary user:** Roham (PM + full-stack developer, household decision maker)
- **Secondary user:** Fara (household co-decision maker, read-only review)
- **No third party.** No external auditor, no advisor, no investor in the loop.

## Repository

- **GitHub:** https://github.com/rohamshahrokh/shahrokh-family-financial-planner
- **Default branch:** `main`
- **Deployment platform:** Vercel (project `shahrokh-family-financial-planner` in scope `rohamshahrokhs-projects`)
- **Database:** Supabase project `uoraduyyxhtzixcsaidg` (region `ap-southeast-2`, Postgres 17)
- **Production URL:** https://familywealthlab.net

## Core capability areas

1. **Canonical Ledger** — `sf_snapshot` row `'shahrokh-family-main'` is the single canonical store of current balances (PPOR, cash, offset, super, cars, Iran property, mortgage, other debts)
2. **Properties / Stocks / Crypto** — separate tables for investment lifecycles, transactions, DCA plans
3. **Goal / FIRE Settings** — `mc_fire_settings` holds target FIRE age, target passive income, SWR (safe withdrawal rate)
4. **Forecast Engine** — deterministic projections combining ledger + planned investments + super contributions
5. **Monte Carlo** — probabilistic forecast producing P10/P50/P90 net-worth bands + probability-of-FIRE at target year (`mc_fire_results`)
6. **Goal Solver Pro** — reverse wealth engineering: given a FIRE goal, what strategy delta closes the gap?
7. **Decision Engine** — ranks discrete decisions (delay property, max super, sell crypto, switch funding source) with feasibility and probability impact
8. **Portfolio Lab** — strategy optimization sandbox with do-nothing vs recommended-path comparison and a robust ranking
9. **Audit Mode** — calculation traceability layer; can be toggled across the app

## Operating principles (locked)

1. **Canonical sources only.** Promoted UI numbers must come from one explicit source, never a fallback chain. The canonical sources are:
   - Current Net Worth → `sf_snapshot` ledger
   - Goal / SWR → `mc_fire_settings`
   - Forecasts → `Forecast Engine` outputs
   - Probability of FIRE → `mc_fire_results`
   - Scenario rankings → `sf_scenario_results` (currently empty → labelled transient)
2. **Goal not set ≠ defaults.** If the user has not explicitly set FIRE goals, the UI must say "Goal not set" with a CTA. Never invent a 4% SWR or any default.
3. **Source lineage visible.** Every promoted number renders a `SourceTag` chip identifying its source.
4. **Freshness visible.** Stale Monte Carlo runs must show an amber banner with re-run CTA.
5. **Demote, don't delete.** Legacy components live behind `<AdvancedDisclosure>` until they can be fully removed.
6. **One household.** No multi-tenancy assumptions. `owner_id = 'shahrokh-family-main'` is the only row in production data tables. The codebase contains many references to this convention.

## Tech stack (one-line summary)

React 18 + TypeScript + Vite 7 + Tailwind + shadcn/ui frontend → Express 5 backend → Supabase Postgres 17 → Vercel deployment. State via Zustand + TanStack Query. Charts via Recharts. Validation via Zod. ORM via Drizzle. **Note:** the root `README.md` still mentions SQLite — that is legacy. Production runs entirely on Supabase Postgres.

## Status (as of 2026-05-26)

The codebase is **production-deployed and live**, with a major data-layer remediation (PR #88) and parallel security advisory (PR #89) **awaiting user review**. Sprint 13 UX rebuild (PR #87) is paused pending the data remediation. See `14-open-pr-status.md` for full PR state and `02-current-state.md` for production reconciliation.
