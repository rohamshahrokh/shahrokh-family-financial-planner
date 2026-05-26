# 13 — Production State

**Reconciliation date:** 2026-05-26 (post-PR-#88-branch, pre-deploy)

This document is the authoritative reconciliation between code and the live Supabase database. All numbers were pulled directly from the production project via SQL.

## Production URL + deployment

- **URL:** https://familywealthlab.net
- **Current deployed commit:** `b1bc4fc` (Sprint 12 merge — PR #85, 2026-05-25 22:29 UTC)
- **Vercel project:** `shahrokh-family-financial-planner` (`rohamshahrokhs-projects` scope)
- **Login:** `Roham` / `YaraJana2025` (manual browser only — headless broken)

## Database

- **Provider:** Supabase
- **Project:** `uoraduyyxhtzixcsaidg`
- **Region:** `ap-southeast-2`
- **Postgres:** version 17
- **Health:** ACTIVE_HEALTHY

## Canonical ledger snapshot (`sf_snapshot` where `id='shahrokh-family-main'`)

**`updated_at` = 2026-05-19 06:27:07 UTC**

| Component | Value | Source column |
| --------- | ----- | ------------- |
| PPOR | $1,510,000 | `ppor` |
| Cash | $0 | `cash` |
| Offset balance | $222,000 | `offset_balance` |
| Super (aggregate) | $89,500 | `super_balance` |
| &nbsp;&nbsp;↳ Roham super | $49,500 | `roham_super_balance` |
| &nbsp;&nbsp;↳ Fara super | $40,000 | `fara_super_balance` |
| Stocks | $0 | `stocks` |
| Crypto | $0 | `crypto` |
| Cars | $65,000 | `cars` |
| Iran property | $150,000 | `iran_property` |
| Other assets | $0 | `other_assets` |
| Mortgage | $(1,200,000) | `mortgage` |
| Other debts | $(20,000) | `other_debts` |
| **Canonical Net Worth** | **$816,500** | sum formula |

### Canonical NW formula (do not double-count super)
```
ppor + cash + offset_balance + super_balance + stocks + crypto +
cars + iran_property + other_assets - mortgage - other_debts
= 1,510,000 + 0 + 222,000 + 89,500 + 0 + 0 + 65,000 + 150,000 + 0 - 1,200,000 - 20,000
= $816,500
```

## FIRE goal state (`mc_fire_settings`)

| Field | Value |
| ----- | ----- |
| `target_fire_age` | 45 |
| `target_passive_monthly` | $20,000 |
| `swr_pct` | 7 |
| `goals_set` | (column does not yet exist in production — PR #88 migration adds it) |
| `goal_set_timestamp` | (column does not yet exist in production) |

## Monte Carlo state (`mc_fire_results`)

| Field | Value |
| ----- | ----- |
| `nw_p50_at_target` | $3,240,679 |
| `prob_fire_by_target` | 49.6% |
| `median_fire_year` | 2036 |
| `ran_at` | 2026-05-01 01:06:08 UTC |
| Days stale | **25 days** (>14-day threshold → STALE) |
| Drift vs ledger snapshot | snapshot is 18 days newer than MC run |

## The smoking gun (root cause of $3.15M display)

```
Displayed "Current Net Worth" in production:  $3,150,000  ❌
Actual ledger Net Worth:                       $816,500   ✅
Difference:                                    $2,333,500 leak

Root cause:
  selectFireGapSummary  fell back from  nwGap?.actual  to  best?.netWorthP50
  ─────────────────────────────────────────────────────────────────────────
  best.netWorthP50  =  pathSim.bestStrategy.netWorthBand.p50
                    ≈  mc_fire_results.nw_p50_at_target
                    =  $3,240,679   (truncated/rounded to $3.15M in UI)
                    =  P50 at FUTURE YEAR 2036, not "current"
                    =  also 25 days stale

Why the fallback triggered:
  EMPTY_GOAL_TARGETS short-circuit at TruePortfolioOptimizer.tsx:981
  passed empty fireGap state because user has no `goals_set=true` row yet
```

## Component-by-component reconciliation

### Cash
- **Ledger:** `cash` ($0) + `offset_balance` ($222,000) + sub-buckets (`savings_cash`, `emergency_cash`, `other_cash`) — sub-buckets are informational and not double-counted
- **Used in NW:** `cash + offset_balance = $222,000`
- **Verified:** ✅ confirmed via SQL

### Offset
- **Ledger:** `offset_balance` = $222,000
- **Verified:** ✅

### Stocks
- **Ledger aggregate:** `stocks` = $0
- **Detail:** `sf_stocks` has 45 rows but all `current_holding=0` (planned/historical)
- **Verified:** ✅

### Crypto
- **Ledger aggregate:** `crypto` = $0
- **Detail:** `sf_crypto` exists; planned investments include 1 BTC at $80k future buy
- **Verified:** ✅

### Property Equity (PPOR)
- **Ledger:** `ppor` = $1,510,000; `mortgage` = $(1,200,000); equity = $310,000
- **Note:** `sf_properties` has 2 rows both `lifecycle_status='planned'` — NOT counted in current NW. They are forecast inputs only.
- **Verified:** ✅

### Liabilities
- **Mortgage:** $1,200,000
- **Other debts:** $20,000
- **Total liabilities:** $1,220,000
- **Verified:** ✅

### Super
- **Aggregate:** `super_balance` = $89,500 (= roham $49,500 + fara $40,000)
- **Used in NW:** aggregate only — do NOT add the components on top
- **Verified:** ✅

### Iran Property
- **Ledger:** `iran_property` = $150,000
- **Note:** illiquid asset, valuation manually maintained
- **Verified:** ✅

### Cars
- **Ledger:** `cars` = $65,000
- **Verified:** ✅

## Scenario results state

- **Table:** `sf_scenario_results`
- **Rows:** 0 (empty)
- **UI behaviour today (production):** rankings render from in-memory engine state with no warning
- **UI behaviour after PR #88:** rankings render with amber "Transient — not saved" pill

## Forecast settings state

- **Table:** `sf_forecast_settings`
- **`mc_*` fields:** all NULL in production
- **Implication:** Monte Carlo runs use engine defaults rather than per-user overrides

## Verified vs unverified

| Datum | Verified? | Method |
| ----- | --------- | ------ |
| Ledger NW = $816,500 | ✅ | SQL against production |
| MC P50 at target = $3,240,679 | ✅ | SQL against production |
| MC ran 2026-05-01 | ✅ | SQL |
| Snapshot updated 2026-05-19 | ✅ | SQL |
| `swr_pct` = 7 | ✅ | SQL |
| `target_fire_age` = 45 | ✅ | SQL |
| `target_passive_monthly` = $20k | ✅ | SQL |
| 23 RLS-disabled tables | ✅ | Supabase advisor |
| Production currently displays $3.15M | ✅ | User screenshot referenced in audit |
| PR #88 fix removes the $3.15M leak | ⚠ Branch-verified (unit tests) — NOT yet production-verified |
| Schema migration applies cleanly | ⚠ Migration file written but never executed against live DB |
| Re-run MC produces fresh `ran_at` | ⚠ Not attempted yet |
| `assertCurrentNwIsLedger` would fire if reintroduced | ⚠ Unit-tested only |

## What remains unverified post-PR-#88-deploy

After PR #88 is merged + deployed + migration applied, the following still need production verification:

1. Visual: every promoted UI number renders correct `SourceTag`
2. Visual: amber freshness banner appears
3. Visual: do-nothing chart shows 3 real series
4. Functional: `assertCurrentNwIsLedger` does NOT fire (no console errors)
5. Functional: clicking "Set FIRE goal" CTA navigates correctly
6. Functional: re-running MC clears the stale banner
7. Database: `mc_fire_settings.goals_set` exists and has the correct boolean value after migration

See `11-roadmap.md` § R4 for the post-deploy reconciliation checklist.
