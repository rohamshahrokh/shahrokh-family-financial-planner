# 06 — UI Map

This document enumerates every primary screen, its purpose, key components, and key UI defects (with status).

## Sitemap

```
/login                                  → Login page (server-rendered)
/                                       → Dashboard / Executive Overview
/properties                             → Property Planner
/stocks                                 → Stock Portfolio
/crypto                                 → Crypto Portfolio
/expenses                               → Expense Tracker
/bills                                  → Recurring Bills
/budget                                 → Monthly Budget
/income                                 → Income Tracker
/super                                  → Super (dual-person) module
/scenarios                              → Scenario Sandbox
/forecast                               → Forecast / Strategic Wealth
/probabilistic                          → Monte Carlo / Probabilistic Wealth
/portfolio-lab                          → Portfolio Lab (Optimizer + Goal Solver + Decisions)
/decisions                              → Decision Engine (Sprint 12)
/audit-mode                             → Calculation Trace + Audit Reports
/reports                                → Excel + PDF wealth report generation
/settings                               → Settings (canonical ledger CRUD)
```

## Page-by-page

### / — Dashboard / Executive Overview
- **Purpose:** Net worth headline, sparkline, KPI cards, 10-year projection, top decisions
- **Key components:** Hero NW tile, sparkline, KPI grid, projection table
- **Status:** Functional. Some legacy fields demoted under `<AdvancedDisclosure>` post-Sprint 11.

### /portfolio-lab
- **Purpose:** Optimizer + FIRE goal + decision recommendations + Monte Carlo summary
- **Key components:** `TruePortfolioOptimizer`, `FireGapSummaryBlock`, `PortfolioLabCharts`, `PathSimulationSection`, `ProbabilisticWealthSection`, `ForecastFreshnessBanner` (Phase C)
- **Status (production today):**
  - ❌ Current NW shows $3.15M (forecast leak)
  - ❌ Effective SWR = 4% instead of user-set 7%
  - ❌ Do-nothing chart flat
  - ❌ No freshness banner
  - ❌ Rankings render with no transient label
  - ❌ Empty goal tiles show NaN / "$0"
  - ❌ No source lineage tags
- **Status (PR #88 branch):** all 7 above fixed.

### /decisions (Sprint 12)
- **Purpose:** Decision-Making System — rank and act on discrete moves (max super, delay property, etc.)
- **Key components:** decision cards with feasibility, probability impact, funding source
- **Status:** Functional. PR #88 adds `delay-property` "estimate" annotation; real forecast replacement deferred.

### /probabilistic
- **Purpose:** Monte Carlo paths, P10/P50/P90, probability of FIRE
- **Key components:** fan chart, P-bands, robust ranking
- **Status (production):** rankings labelled with plain text "Transient — not persisted". PR #88 Phase C upgrades to amber pill badge.

### /forecast
- **Purpose:** Deterministic forward projection
- **Key components:** Strategic Wealth table, year-by-year breakdown
- **Status:** Functional, mobile cards expand correctly post-PR #42.

### /super
- **Purpose:** Dual-person (Roham + Fara) super modelling
- **Key components:** per-person inputs, contribution caps, growth projections
- **Status:** Functional.

### /audit-mode
- **Purpose:** Calculation trace toggle + audit reports
- **Key components:** global sidebar toggle, per-metric trace badges
- **Status:** Functional (Sprint added in PRs #43 + #44; not yet merged but pieces shipped via subsequent sprints).

### /reports
- **Purpose:** Generate Excel workbook + premium PDF wealth report
- **Status:** Functional.

### /settings
- **Purpose:** Canonical ledger CRUD (PPOR, cash, super, mortgage, etc.) + assumptions + theme
- **Status:** Functional. **Note:** SWR field in Settings should be removed/redirected to `mc_fire_settings` post-PR #88; currently lives in `sf_app_settings.settings.assumptions.safe_withdrawal_rate` (deprecated).

## Key reusable components (PR #88 Phase C)

| Component | File | Purpose |
| --------- | ---- | ------- |
| `SourceTag` | `client/src/components/portfolio-lab/SourceTag.tsx` | Lineage chip: ledger / fire / forecast / mc / scenario |
| `ForecastFreshnessBanner` | `client/src/components/portfolio-lab/ForecastFreshnessBanner.tsx` | Amber/blue banner for stale/never-run MC |
| `<AdvancedDisclosure>` | (existing) | Demote-don't-delete container |
| `FireGapSummaryBlock` | `client/src/components/portfolio-lab/FireGapSummaryBlock.tsx` | Goal/Gap tile grid with CTA support |

## Promoted-number → source mapping (after PR #88)

| Number | Surface | Source variant |
| ------ | ------- | -------------- |
| Current Net Worth | hero | Current Ledger |
| Current Passive Income | hero | Current Ledger |
| Target Net Worth | tile / CTA | FIRE Settings |
| Target Passive Income | tile / CTA | FIRE Settings |
| Net Worth Gap | tile / CTA | FIRE Settings |
| Passive Income Gap | tile / CTA | FIRE Settings |
| Current P(FF) | tile / CTA | Monte Carlo Run (with run date + stale flag) |
| Required P(FF) | tile | FIRE Settings (default 70% labelled) |
| Strategy Rankings | section | Scenario Result (transient pill) |
| Robust Rankings | section | Scenario Result (transient pill) |
| Do-Nothing Chart Current Path | chart | Forecast Engine |
| Do-Nothing Chart Recommended Path | chart | Forecast Engine |
| Do-Nothing Chart Target Line | chart | FIRE Settings (or "Goal not set" caption) |

## UI principles (locked)

1. **Goal not set ≠ defaults.** Show CTA, not invented value.
2. **Source visible.** Every promoted number → `SourceTag` chip.
3. **Freshness visible.** Stale MC → amber banner.
4. **Demote, don't delete.** Use `<AdvancedDisclosure>`.
5. **30-second 6-question primary view.** Per locked decision #9 (Sprint 13 UX rebuild target — paused).
6. **Real zero ≠ empty.** `uiEmptyField` fix — "$0" and "0%" render normally.
