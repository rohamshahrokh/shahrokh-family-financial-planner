# 04 — Data Model

**Database:** Supabase Postgres 17, project `uoraduyyxhtzixcsaidg`, region `ap-southeast-2`.
**Schema:** all tables in `public`; ORM definitions in `shared/schema.ts`.

## Naming conventions

- `sf_*` → "Shahrokh Family" — operational tables (snapshot, properties, stocks, etc.)
- `mc_*` → Monte Carlo / FIRE-related tables
- All production rows are scoped to `owner_id = 'shahrokh-family-main'` (single household).

## Canonical ledger — `sf_snapshot`

The single source of truth for **Current Net Worth**. One row per household.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | text PK | always `'shahrokh-family-main'` |
| `ppor` | numeric | Principal place of residence value |
| `cash` | numeric | Liquid cash balance |
| `offset_balance` | numeric | Mortgage offset balance |
| `super_balance` | numeric | Aggregate super (= `roham_super_balance` + `fara_super_balance`) |
| `roham_super_balance` | numeric | Roham's super (component) |
| `fara_super_balance` | numeric | Fara's super (component) |
| `stocks` | numeric | Aggregate stocks at snapshot time |
| `crypto` | numeric | Aggregate crypto at snapshot time |
| `cars` | numeric | Vehicles value |
| `iran_property` | numeric | Iranian property (illiquid) |
| `other_assets` | numeric | Catch-all assets |
| `mortgage` | numeric | Mortgage balance owed |
| `other_debts` | numeric | Non-mortgage debts |
| `monthly_income` | numeric | Aggregate (Roham + Fara) |
| `monthly_expenses` | numeric | Total |
| `roham_super_*` | numeric | Per-person super assumptions (salary, contrib, growth, fees, insurance, top-up, contrib freq, retirement age) |
| `fara_super_*` | numeric | Same as above for Fara |
| `savings_cash` / `emergency_cash` / `other_cash` | numeric | Cash sub-buckets |
| `roham_monthly_income` / `fara_monthly_income` | numeric | Per-person |
| `rental_income_total` / `other_income` | numeric | Income breakdown |
| `childcare_monthly` / `insurance_monthly` / `utilities_monthly` / `subscriptions_monthly` | numeric | Expense breakdown |
| `fire_target_age` / `fire_target_monthly_income` | numeric | Legacy goal fields (canonical now `mc_fire_settings`) |
| `property_savings_monthly` | numeric | Cash directed to property fund |
| `version` | bigint | Optimistic concurrency |
| `updated_at` | timestamptz | Snapshot timestamp |

**Canonical Net Worth formula:**
```
ppor + cash + offset_balance + super_balance + stocks + crypto +
cars + iran_property + other_assets - mortgage - other_debts
```

(Note: do NOT also add `roham_super_balance` + `fara_super_balance` — they are components of the aggregate `super_balance` and would double-count.)

**Current production values (2026-05-19 snapshot):**
| Field | Value |
| ----- | ----- |
| ppor | $1,510,000 |
| cash | $0 |
| offset_balance | $222,000 |
| super_balance | $89,500 (roham $49,500 + fara $40,000) |
| stocks / crypto / other_assets | $0 |
| cars | $65,000 |
| iran_property | $150,000 |
| mortgage | $(1,200,000) |
| other_debts | $(20,000) |
| **Canonical Net Worth** | **$816,500** |

## Goal / FIRE — `mc_fire_settings`

The canonical store of user-set FIRE goals + safe withdrawal rate. Read by `server/lib/canonicalGoal.ts`.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `target_fire_age` | numeric | Production value: 45 |
| `target_passive_monthly` | numeric | Production value: $20,000 |
| `swr_pct` | numeric | Production value: 7 (NOT 4 — never use 4 as a default) |
| `goals_set` | boolean | **Phase A migration pending** — not yet in production |
| `goal_set_timestamp` | timestamptz | **Phase A migration pending** — not yet in production |

## Monte Carlo result cache — `mc_fire_results`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `nw_p50_at_target` | numeric | Median NW projected to target FIRE year. Production: $3,240,679 |
| `prob_fire_by_target` | numeric | Probability of FIRE success by target year. Production: 49.6% |
| `median_fire_year` | integer | Production: 2036 |
| `ran_at` | timestamptz | Production: 2026-05-01 (25 days stale vs snapshot) |

**Critical:** `nw_p50_at_target` is **future-year P50** at the target FIRE year — it must NEVER be displayed as Current Net Worth. This was the smoking gun of Sprint 13 P0 remediation.

## Scenario results — `sf_scenario_results`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `scenario_id` | text | Scenario identifier |
| `metrics` | jsonb | Engine output |
| `ran_at` | timestamptz | Run time |

**Currently empty in production.** UI renders rankings from in-memory state; PR #88 Phase C labels them "Transient — not saved".

## Other operational tables (production row counts as of 2026-05-26)

| Table | Rows | Purpose |
| ----- | ---- | ------- |
| `sf_snapshot` | 1 | Canonical ledger |
| `sf_properties` | 2 | Both `lifecycle_status='planned'` — NOT counted in current ledger NW |
| `sf_stocks` | 45 | All `current_holding=0` — historical / planned only |
| `sf_planned_investments` | 9 | 1 BTC $80k + 8 stocks $40.4k |
| `sf_crypto` | (varies) | Crypto holdings |
| `sf_expenses` | (varies) | Manual expense entries |
| `sf_recurring_bills` | (varies) | Recurring bill schedule |
| `sf_monthly_budgets` | (varies) | Per-month budgets |
| `sf_app_settings` | 1 | Legacy SWR + theme + assumptions (DEPRECATED in PR #88 for SWR) |
| `sf_scenarios` | (varies) | Saved scenarios (legacy SWR also lives here) |
| `sf_forecast_settings` | 1 | `mc_*` fields all NULL in production |
| `sf_snapshot_change_log` | (varies) | Snapshot audit trail |

## Deprecated SWR sources (do not use)

Five places used to hold SWR. After PR #88, only **`mc_fire_settings.swr_pct`** is canonical.

| Source | Status | Marker |
| ------ | ------ | ------ |
| `mc_fire_settings.swr_pct` | ✅ canonical | `useCanonicalGoal()` |
| `sf_app_settings.settings.assumptions.safe_withdrawal_rate` | ❌ deprecated | JSDoc `@deprecated` |
| `sf_scenarios.swr` | ❌ deprecated | JSDoc `@deprecated` |
| `canonicalFire.ts:78` hardcoded `?? 4` | ❌ deprecated | JSDoc `@deprecated` |
| UI-derived fallback | ❌ removed | gone in Phase C |

## Schema migration file (pending)

```
supabase/migrations/2026_05_26_add_goals_set_to_mc_fire_settings.sql
```

Adds `goals_set boolean NOT NULL DEFAULT false` and `goal_set_timestamp timestamptz` to `mc_fire_settings`, with backfill for existing rows where target_fire_age + target_passive_monthly + swr_pct are all set. **NOT YET APPLIED.**
