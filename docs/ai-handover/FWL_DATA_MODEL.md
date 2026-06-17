# FWL_DATA_MODEL.md

Concise data-architecture reference for AI coding assistants. Read before editing any selector, engine, or persistence code.

## Source-of-Truth Hierarchy

| Layer | Role | Mutation path |
|---|---|---|
| Supabase Postgres (`sf_*`, `mc_fire_settings`) | Persistent SoT for all household data | UI → `client/src/lib/supabaseClient.ts` wrappers |
| Canonical selectors (`client/src/lib/canonical*.ts`) | Read-only derivation of every UI metric | Pure functions on Supabase inputs |
| React Query cache | In-memory mirror | `useQuery` keyed by route (e.g. `/api/snapshot`) |
| `dashboardDataContract.ts` | Single assembly point for canonical inputs → UI | Composes all selectors |
| SQLite (`shared/schema.ts`) | LEGACY local dev shim only | Not used in production |

Rule: every UI metric must trace to one canonical selector. No duplicate calculations.

## Storage Backends

| Backend | Used For | Notes |
|---|---|---|
| Supabase Postgres | Production (single household + multi-household via `sf_household_permissions`) | RLS DISABLED — see D-006 |
| SQLite (`shared/schema.ts`) | drizzle dev shim — `financial_snapshot`, `properties`, `stocks`, etc. | NOT mirrored to Supabase at runtime |
| In-memory React Query | Client-side cache | Invalidated on mutation |

## Key Supabase Tables

### `sf_snapshot`
- Purpose: single-row household balance-sheet + cashflow snapshot
- PK: `id` (uuid, fixed `SNAPSHOT_ID` constant in `server/routes.ts`)
- FKs: none (singleton)
- Owner: dashboard "Today" page; server `/api/snapshot` GET/POST
- Consumers: every canonical selector, dashboard, Forecast, Goal Lab, Decision Lab, Risk Radar
- Fields (verified, see `client/src/lib/canonical*.ts`):
  - Assets: `ppor`, `cash`, `savings_cash`, `offset_balance`, `emergency_cash`, `other_cash`, `super_balance`, `roham_super_balance`, `fara_super_balance`
  - Liabilities: `mortgage`, `other_debts`
  - Cashflow: `monthly_income`, `monthly_expenses`, `expenses_includes_debt`
  - Targets: `fire_target_monthly_income`
  - Mortgage attrs (often missing on real rows): `mortgage_rate`, `mortgage_term_years`
- Failure modes:
  - Missing `mortgage_rate` → fallback to `mc_fire_settings.mean_mortgage_rate` (Sprint 31D, see `dashboardDataContract.selectMortgageRepayment`)
  - Stocks/crypto NOT in snapshot — held in `sf_stocks`, `sf_crypto`
  - DEPRECATED field `ppor_value` (Sprint 31D fix; use `ppor`)

### `sf_properties`
- Purpose: investment + PPOR property register
- PK: `id` (uuid)
- Owner: Property Engine UI
- Consumers: `canonicalPropertyEconomics.ts`, scenario engine, roadmap acquisitions
- Key fields: `name`, `type` (`ppor`|`investment`), `purchase_price`, `current_value`, `loan_amount`, `interest_rate`, `loan_type` (`PI`|`IO`), `loan_term`, `weekly_rent`, lifecycle (`planned`|`under_contract`|`settled`|`sold`|`archived`)
- Lifecycle predicates: `shared/propertyLifecycle.ts` (canonical for all engines)
- Failure modes: legacy rows missing lifecycle → backfilled to `settled`; PPOR may double-count if also in `sf_snapshot.ppor`

### `sf_income`
- Purpose: per-person income streams
- PK: `id` (uuid)
- Owner: Income page
- Consumers: cashflow forecast, FIRE engine
- Classification cols added Sprint 31E: `income_type`, `behaviour`, `forecast_treatment` (see `supabase/migrations/20260530131000_*.sql`)
- Failure modes: rows without classification default to "salary" treatment

### `sf_expenses`
- Purpose: categorised expense ledger
- PK: `id`
- Owner: Expenses page
- Consumers: 6-month moving average → `monthly_expenses` cross-check; cashflow engine
- Failure modes: short history → noisy moving average; deduped by hash

### `sf_stocks`, `sf_crypto`
- Purpose: investment positions (separate from PPOR/super)
- PK: `id`
- Consumers: `canonicalNetWorth` invested base; FIRE drawdown
- Related: `sf_stock_transactions`, `sf_stock_dca`, `sf_crypto_transactions`, `sf_crypto_dca`

### `mc_fire_settings`
- Purpose: Monte-Carlo FIRE + goal configuration (singleton per household)
- PK: `id` (uuid)
- Owner: Goal Lab
- Consumers: Goal Lab, Decision Lab, Forecast, mortgage-rate fallback
- Key fields: `target_fire_age`, `target_passive_monthly`, `swr_pct`, `mean_mortgage_rate`, `goals_set`, `goal_set_timestamp`, `action_checklist` (JSON)
- Failure modes: `goals_set=false` blocks Decision Lab; missing `mean_mortgage_rate` cascades to mortgage-repayment fallback chain

### `mc_fire_results`
- Purpose: latest MC run output (fan chart, percentiles, alerts)
- PK: `id`
- Owner: Forecast engine
- Consumers: Forecast page, Risk Radar
- Key fields: `mc_p10`/`mc_p50`/`mc_p90`, `mc_prob_ff`, `mc_prob_neg_cf`, `mc_fan_data`, `mc_actions`, `mc_assumptions`, `mc_key_risks`, `mc_median`, `mc_last_run`

### `sf_scenarios` / `sf_scenario_records` / `sf_scenario_record_versions` / `sf_scenario_snapshots`
- Purpose: V2 scenario engine — saved what-ifs + version history
- Consumers: Decision Lab, Wealth Strategy page
- Failure modes: snapshot ↔ record drift; mitigated by `forecastFreshness.ts`

### `sf_planned_investments`
- Purpose: future deposits/lump sums for forecast
- Consumers: forecast engine

### `sf_timeline`
- Purpose: user-curated life events
- Consumers: Action Roadmap, Timeline page (merged with engine-generated events)

### `sf_household_permissions`, `sf_users`
- Purpose: multi-user / family-sharing (not yet exposed in UI)

### Supporting
- `sf_app_settings`, `sf_recurring_bills`, `sf_monthly_budgets`, `sf_alert_logs`, `sf_family_messages_log`, `sf_telegram_settings`, `sf_forecast_assumptions`, `sf_tax_profile`

## Relationships

| Parent | Child | Cardinality | Cascade |
|---|---|---|---|
| household (implicit) | `sf_snapshot` | 1:1 singleton | n/a |
| household | `sf_properties` | 1:N | manual delete |
| household | `sf_stocks` / `sf_crypto` | 1:N | manual |
| `sf_stocks` | `sf_stock_transactions` / `sf_stock_dca` | 1:N | manual |
| `sf_crypto` | `sf_crypto_transactions` / `sf_crypto_dca` | 1:N | manual |
| household | `mc_fire_settings` | 1:1 singleton | n/a |
| household | `mc_fire_results` | 1:N (latest used) | manual |
| `sf_scenarios` | `sf_scenario_records` | 1:N | manual |
| `sf_scenario_records` | `sf_scenario_record_versions`, `sf_scenario_snapshots` | 1:N | manual |

## Data Ownership

| Domain | UI Owner | Canonical Selector | Write path |
|---|---|---|---|
| Net worth | Today | `canonicalNetWorth.ts` | `sf_snapshot` + `sf_properties` + `sf_stocks` + `sf_crypto` |
| Cashflow | Today / Forecast | `canonicalCashflow.ts` | `sf_snapshot` + `sf_income` + `sf_expenses` |
| Debt service | Risk Radar | `canonicalDebtService.ts` | `sf_snapshot` mortgage + `sf_properties` loans |
| FIRE | Goal Lab | `canonicalFire.ts`, `canonicalFireDerivations.ts` | `mc_fire_settings` + canonical NW |
| Recommendation | Decision Lab | `canonicalRecommendation.ts` | scenario engine output |
| Risk surface | Risk Radar | `canonicalRiskSurface.ts` | derived from NW + cashflow + debt |
| Property economics | Property Engine | `canonicalPropertyEconomics.ts` | `sf_properties` |
| Tax | Reports | `canonicalTax.ts` | `sf_tax_profile` |
| Headline metrics | Dashboard cards | `canonicalHeadlineMetrics.ts` | composes others |
| Ledger | Reports | `canonicalLedger.ts` | composes assets/debt |
| Wealth | Wealth Strategy | `canonicalWealth.ts` | composes NW + forecast |

## Derived vs Canonical Fields

| Field | Status | Source |
|---|---|---|
| `current_net_worth` | Derived | `canonicalNetWorth.selectCanonicalNetWorth` |
| `nw.assets.ppor` | Canonical | `sf_snapshot.ppor` (NOT `ppor_value` — deprecated) |
| `monthly_debt_service` | Derived | `selectMortgageRepayment` + property loans |
| `mortgage_repayment` | Derived | P&I from `mortgage`, rate (snapshot OR `mc_fire_settings.mean_mortgage_rate`), term (default 30y) |
| `rateSource` / `termSource` | Derived flag | `'snapshot'`/`'fire_settings'`/`'default_30y'`/`'missing'` (Sprint 31D) |
| `fire_age` | Derived | `canonicalFire` solver |
| `passive_income_at_fire` | Derived | `swr_pct × invested_at_fire` |
| `risk_capacity.band` | Derived | `inferences.ts` from drawdown tolerance + income endurance |
| `recommendation` | Derived | optimizer + override rules |

## Known Duplication Risks

| Risk | Where | Mitigation |
|---|---|---|
| PPOR counted twice | `sf_snapshot.ppor` and `sf_properties` (type=ppor) | Snapshot is SoT; properties table PPOR row is presentational only |
| Stocks/crypto in snapshot | Old `sf_snapshot` had aggregate fields | Removed — use `sf_stocks`/`sf_crypto` |
| Expenses double-count | `monthly_expenses` (snapshot) vs `sf_expenses` rolling | Snapshot wins by default; rolling used for cross-check |
| Mortgage on PPOR | `sf_snapshot.mortgage` and `sf_properties` ppor row `loan_amount` | Snapshot is SoT |
| Income | `sf_snapshot.monthly_income` and `sf_income` rows | Snapshot is SoT for current; `sf_income` drives forecast |
| Legacy `ppor_value` | Removed Sprint 31D | Use `nw.assets.ppor` |

## Asset Aggregation Rules

| Bucket | Sums | Excluded |
|---|---|---|
| `nw.assets.ppor` | `sf_snapshot.ppor` only | property table PPOR row |
| `nw.assets.investedProperty` | `sf_properties` where `type='investment'` AND lifecycle in {`settled`} | `planned`, `under_contract`, `sold`, `archived` |
| `nw.assets.cash` | `sf_snapshot.cash + savings_cash + offset_balance + emergency_cash + other_cash` | — |
| `nw.assets.super` | `super_balance + roham_super_balance + fara_super_balance` | — |
| `nw.assets.stocks` | `sf_stocks.current_holding × current_price` | DCA forecasts |
| `nw.assets.crypto` | `sf_crypto.current_holding × current_price` | DCA forecasts |
| `nw.liabilities.mortgage` | `sf_snapshot.mortgage` | property investment loans (counted separately) |
| `nw.liabilities.propertyLoans` | sum `sf_properties.loan_amount` where investment + settled | PPOR loan (already in `sf_snapshot.mortgage`) |
| `nw.liabilities.other` | `sf_snapshot.other_debts` | — |

## Cash / Offset / Savings Handling

- All four cash fields (`cash`, `savings_cash`, `offset_balance`, `other_cash`) sum into `nw.assets.cash`.
- `emergency_cash` is reported separately for Risk Radar liquidity floor.
- Offset balance is also netted against mortgage for effective-interest calculations in `canonicalDebtService.ts`.

## PPOR Handling

- SoT: `sf_snapshot.ppor` (value) and `sf_snapshot.mortgage` (loan).
- `sf_properties` row with `type='ppor'` is OPTIONAL and presentational only.
- Excluded from FIRE invested base (`drawdownToleranceP` denominator).
- Forced-sale, refinance, negative-equity, and risk-capacity calculations use snapshot-level PPOR/mortgage values.

## Mortgage Handling (post-Sprint 31D)

| Field | Source priority |
|---|---|
| Rate | `sf_snapshot.mortgage_rate` → `mc_fire_settings.mean_mortgage_rate` → "missing" (no calc) |
| Term | `sf_snapshot.mortgage_term_years` → default 30y |
| Repayment | P&I from rate + term + principal |
| Reporting | `selectMortgageInputState.rateSource` and `.termSource` flag fallback for UI banner |

Sprint 4A contract preserved: `hasRate`/`hasTerm` still report ground truth.

## Goal Lab Inputs

| Input | Table.column |
|---|---|
| Target FIRE age | `mc_fire_settings.target_fire_age` |
| Target passive monthly | `mc_fire_settings.target_passive_monthly` |
| SWR % | `mc_fire_settings.swr_pct` |
| Goals locked timestamp | `mc_fire_settings.goal_set_timestamp` |
| Current NW | `canonicalNetWorth` |
| Current age | snapshot/profile (derived) |

## Forecast Inputs

| Input | Source |
|---|---|
| Starting balances | `canonicalNetWorth` |
| Income streams | `sf_income` (+ classification cols) |
| Recurring expenses | `monthly_expenses` + `sf_recurring_bills` |
| Planned investments | `sf_planned_investments` |
| Property cashflow | `canonicalPropertyEconomics` per `sf_properties` |
| MC assumptions | `mc_fire_settings` + `sf_forecast_assumptions` |
| Output | `mc_fire_results` (percentiles + fan) |

## Decision Lab Inputs

| Input | Source |
|---|---|
| Canonical NW + cashflow + debt | selectors |
| Risk capacity | `inferences.ts` (Sprint 31D fix: uses `nw.assets.ppor`) |
| Risk tolerance | `mc_fire_settings` or auto-resolved |
| Liquidity band | `canonicalRiskSurface` |
| Candidate scenarios | `scenarioV2.candidateGenerator` |
| Optimizer + override rules | `canonicalRecommendation` |

## Action Roadmap Inputs

| Input | Source |
|---|---|
| Year-by-year plan | `client/src/lib/actionRoadmap/yearByYearRoadmap.ts` |
| Acquisition pathways | scenarioV2 property-acquisition engine (Sprint 31A) |
| Event lanes (5) | `actionRoadmapBuilder.ts` |
| User-curated events | `sf_timeline` (merged) |
| Refinance/debt deltas | `nextActionsBuilder.ts` |
| Label correctness | `fwl079RoadmapLabels.test.ts` regression suite |
