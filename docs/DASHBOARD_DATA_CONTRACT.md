# Dashboard Data Contract

**Status:** authoritative · last updated 2026‑05‑10 (branch `fix/dashboard-supabase-queries`)
**Owner:** dashboard regression guard `client/src/lib/dashboardDataContract.ts`
**Test:** `npm run test:dashboard-contract`

This document is the single source of truth for every numeric value rendered
on the live dashboard (`client/src/pages/dashboard.tsx`). It defines, for each
KPI card and key derived metric:

1. The Supabase **table** + **column** the value reads from.
2. The exact **calculation formula**.
3. The **fallback rule** when primary data is empty.
4. Whether the value is **ACTUAL** (current balance) or **PLANNED / FORECAST**.

> ⚠️ Any change to a card's source-of-truth binding must be reflected in
> `dashboardDataContract.ts` AND in this document. The regression check
> (`script/test-dashboard-contract.ts`) will fail CI / build if the binding
> drifts.

---

## Why this contract exists

In May 2026 the dashboard appeared "intact" but every KPI card was reading the
wrong field of `sf_snapshot` or summing a non‑existent column on `sf_stocks`.
The dashboard rendered numbers, but **none of those numbers reflected the
data the user had actually entered**. Specifically:

* `sf_snapshot.monthly_income`, `monthly_expenses`, `super_balance`, `stocks`,
  `crypto`, `other_assets` were all `0` — but per‑person sub‑fields
  (`roham_super_balance`, `fara_super_balance`, `roham_monthly_income`, etc.)
  held the real values, and the dashboard didn't read them.
* `sf_stocks` has no `current_value` column — only `current_price` and
  `current_holding`. The dashboard summed the missing column and got `0`.
* `sf_properties` rows were never aggregated into Total Investments,
  Property Equity, or Debt Balance.
* All four cards independently zeroed out without any visible warning.

This contract documents the agreed‑upon source‑of‑truth so a future change
cannot silently break the same way.

---

## ACTUAL vs PLANNED

| Type | Definition | Examples |
|---|---|---|
| **ACTUAL** | A balance, transaction, or account value that exists today | Current super balance, offset cash, settled property's market value, executed stock buy |
| **PLANNED** | A value that is intended but has not occurred yet | Future settlement on an investment property, scheduled DCA buys, planned lump-sum stock purchases |

Cards display **ACTUAL** values in their main figure. **PLANNED** values are
*only* surfaced in card sub‑text (e.g. "$1.5M planned IP") and never inflate
the headline number.

---

## KPI card contract

Every cell reads `sf_snapshot.<col>` unless otherwise noted.
`snapshot_id = 'shahrokh-family-main'`. Currency: AUD.

### MONTHLY SURPLUS  *(ACTUAL)*

| Aspect | Binding |
|---|---|
| Formula | `monthly_income − monthly_expenses` |
| Income source 1 | `sf_snapshot.monthly_income` (manual aggregate) |
| Income source 2 (fallback) | `sf_snapshot.roham_monthly_income + fara_monthly_income + rental_income_total + other_income` |
| Income source 3 (fallback) | 6‑month trailing average of `sf_income.amount` |
| Expenses source 1 | `sf_snapshot.monthly_expenses` |
| Expenses source 2 (fallback) | 6‑month trailing average of `sf_expenses.amount` |
| Precedence | manual master → sub‑fields sum → transaction average |

### TOTAL INVESTMENTS  *(ACTUAL)*

| Aspect | Binding |
|---|---|
| Formula | `stocksTotal + cryptoTotal + ipCurrentValueSettled` |
| `stocksTotal` | `MAX(holdingsRaw[stock].current_value, sum(sf_stocks.current_price × current_holding), sf_snapshot.stocks)` |
| `cryptoTotal` | `MAX(holdingsRaw[crypto].current_value, sum(sf_crypto.current_price × current_holding), sf_snapshot.crypto)` |
| `ipCurrentValueSettled` | `sum(sf_properties.current_value WHERE settlement_date ≤ today AND type ≠ 'ppor'/'owner_occupied')` |
| Sub‑text fallback | "$X planned IP" from `sf_properties.current_value WHERE settlement_date > today` |
| Precedence | unified holdings API → per‑ticker market value → manual snapshot total |
| Excluded | `sf_planned_investments` (scheduled but not executed), `sf_stock_dca`, `sf_crypto_dca` (future schedules) |

### PROPERTY EQUITY  *(ACTUAL)*

| Aspect | Binding |
|---|---|
| Formula | `(snap.ppor − snap.mortgage) + (ipCurrentValueSettled − ipLoanBalanceSettled)` |
| PPOR value | `sf_snapshot.ppor` |
| PPOR debt | `sf_snapshot.mortgage` |
| IP value | `sum(sf_properties.current_value)` for settled IPs only |
| IP debt | `sum(sf_properties.loan_amount)` for settled IPs only |
| Sub‑text | "X% equity · N IPs" or "$X planned" when nothing is settled |

### DEBT BALANCE  *(ACTUAL)*

| Aspect | Binding |
|---|---|
| Formula | `snap.mortgage + snap.other_debts + ipLoanBalanceSettled` |
| PPOR mortgage | `sf_snapshot.mortgage` |
| Other debts | `sf_snapshot.other_debts` |
| IP loans | `sum(sf_properties.loan_amount)` for settled IPs only |
| Sub‑text | "PPOR $X · IP $Y · Other $Z" or "$X planned" |
| Excluded | Future‑settled IP loans (surfaced in sub‑text only) |

### PASSIVE INCOME  *(ACTUAL, annual)*

| Aspect | Binding |
|---|---|
| Formula | `MAX(annualRentalFromIPs, annualRentalManual) + annualOtherPassive + annualDividends` |
| `annualRentalFromIPs` | `Σ (settled IP weekly_rent × 52 × (1 − vacancy/100) × (1 − management_fee/100))` |
| `annualRentalManual` | `sf_snapshot.rental_income_total × 12` |
| `annualOtherPassive` | `sf_snapshot.other_income × 12` |
| `annualDividends` | `stocksTotal × 0.02 + cryptoTotal × 0.01` (heuristic until per‑ticker yield is wired) |
| Sub‑text fallback | "$X/yr once IPs settle" projected from planned IP `weekly_rent` |

### SUPER (COMBINED)  *(ACTUAL)*

| Aspect | Binding |
|---|---|
| Formula | `snap.super_roham + snap.super_fara` |
| Roham balance | `sf_snapshot.roham_super_balance` (legacy: `super_roham`) |
| Fara balance | `sf_snapshot.fara_super_balance` (legacy: `super_fara`) |
| Aggregate fallback | `sf_snapshot.super_balance` if both per‑person fields are 0 |
| Sub‑text | "At 60: $X" — projected balance using 7%/yr compound until age 60 |

### CASH TODAY  *(ACTUAL)*

| Aspect | Binding |
|---|---|
| Formula | `snap.cash + snap.savings_cash + snap.emergency_cash + safeOtherCash + snap.offset_balance` |
| Components | `sf_snapshot.{cash, savings_cash, emergency_cash, other_cash, offset_balance}` |
| `safeOtherCash` | If `other_cash == offset_balance` (legacy data dedup), treat as 0 |

### NET WORTH  *(ACTUAL)*

| Aspect | Binding |
|---|---|
| Formula | `totalAssets − totalLiab` |
| `totalAssets` | `snap.ppor + totalLiquidCash + totalSuper + stocksTotal + cryptoTotal + snap.cars + snap.iran_property + snap.other_assets + ipCurrentValueSettled` |
| `totalLiab` | `snap.mortgage + snap.other_debts + ipLoanBalanceSettled` |
| Internally consistent | Yes — same sub‑totals used by every card. |

---

## Tables NOT to read for ACTUAL values

| Table | Reason | Where it's used |
|---|---|---|
| `sf_planned_investments` | Future buy plans only — not holdings | Forecast / projection only |
| `sf_stock_dca`, `sf_crypto_dca` | Recurring buy schedules | Forecast / projection only |
| `sf_scenario_*` | Hypothetical scenarios | Scenario engine only |
| `sf_cfo_reports` | Cached AI summaries | CFO panel only |
| `financial_snapshots` | Empty legacy/staging table | Do not use |

---

## Data‑missing UX rule

When a card's primary source is empty, the card MUST still render and MUST
display an informational sub‑text (planned values, helper text, or "—")
rather than silently rendering "$0" with no context. A `data‑missing` banner
is shown when both PPOR and IP value AND stocks AND crypto AND mortgage AND
other debts are all 0 — this is the signal that the user has not entered any
balance data yet.

---

## Source of truth map

This table mirrors the `SOURCE_OF_TRUTH` constant exported from
`client/src/lib/dashboardDataContract.ts`. Every shared field below has ONE
owner; all other surfaces (Dashboard, Financial Plan, AI CFO, Forecasts) are
read‑only consumers that derive their values from these sources.

The architectural rule:

- **Ledger / Monthly Budget** = source of truth for *actual* expenses
- **Debt module** = source of truth for *mortgage* and *debt repayments/balances*
- **Settings / Profile** = source of truth for *stable profile values* (cash, offset, super per person, PPOR value)
- **My Financial Plan** = *planning assumptions only*, never duplicate actuals
- **Dashboard** = *calculated output only*, never a data‑entry source

| Field | Owner | Edit in | Stored as / Formula | Duplicates eliminated |
|---|---|---|---|---|
| `monthly_income` | ledger | Income (ledger) | 6mo avg of `sf_income.amount`, then `sf_snapshot.{roham,fara}_monthly_income`, then `monthly_income` | — |
| `monthly_expenses` | budget | Monthly Budget | 6mo avg of `sf_expenses.amount` | `sf_snapshot.monthly_expenses` (now override‑only fallback) |
| `mortgage_balance` | debt_module | Debt Module | `sf_snapshot.mortgage` | — |
| `mortgage_repayment` | derived | Auto from Debt Module | `PMT(mortgage, mortgage_rate, mortgage_term_years)` | Previously hard‑coded `0` in dashboard surplus calc |
| `other_debts` | debt_module | Debt Module | `sf_snapshot.other_debts` | — |
| `cash_transaction` | settings | Settings → Cash | `sf_snapshot.cash` | — |
| `cash_savings` | settings | Settings → Cash | `sf_snapshot.savings_cash` | — |
| `cash_emergency` | settings | Settings → Cash | `sf_snapshot.emergency_cash` | — |
| `cash_other` | settings | Settings → Cash | `sf_snapshot.other_cash` | Auto‑zeroed when equal to `offset_balance` |
| `offset_balance` | settings | Settings → Cash | `sf_snapshot.offset_balance` | — |
| `roham_super` | settings | Settings → Super | `sf_snapshot.roham_super_balance` | — |
| `fara_super` | settings | Settings → Super | `sf_snapshot.fara_super_balance` | — |
| `super_combined` | derived | Auto from Settings | `roham_super + fara_super` | `sf_snapshot.super_balance` (now display‑only fallback) |
| `ppor_value` | settings | Settings → Property | `sf_snapshot.ppor` | — |

### How My Financial Plan consumes this

Every shared field in **My Financial Plan** renders via a `DerivedFieldRow`:

- **Lock mode (default):** Field shows the SoT value with an “Auto‑calculated
  from X” label and an “Edit source” deep link to the owning page.
- **Override mode (explicit toggle):** Lets the user enter a planning
  assumption that overrides the SoT value *for plan calculations only*. The
  Dashboard never reads plan overrides.

Advisory banners flag the rule in each section (Assets / Liabilities /
Income / Expenses) so the user knows where to edit actual values.

### Monthly Surplus formula (debt‑aware)

The **only** path that produces the Dashboard surplus number is
`selectMonthlySurplus`. It runs in one of two modes, gated by
`selectExpensesIncludesDebt(inputs)`:

**Mode A — expenses already include mortgage/debt (default for this app):**

```
surplus = monthlyIncome − monthlyExpensesLedger
```

This is the case when the user logs ledger rows like `Housing / Mortgage`,
`Debt Repayment`, `Car Loan`, etc. — the $15K/mo total already contains
the ~$8K of debt service, so we MUST NOT subtract debt again.

**Mode B — expenses are core‑living only, debt tracked separately:**

```
surplus = monthlyIncome
        − monthlyExpensesLedger
        − mortgageRepayment        (PPOR P&I via PMT)
        − otherDebtRepayment       (0.15/12 minimum payment heuristic)
        − settledIpDebtService     (per‑IP PMT, planned IPs excluded)
```

**Mode selection (in priority order):**

1. Explicit override: `sf_snapshot.expenses_includes_debt` (boolean).
2. Auto‑detect: any ledger row whose category contains `mortgage`,
   `home loan`, `debt repayment`, `loan repayment`, `car loan`,
   `personal loan`, `credit card`, `investment loan`, or `ip loan` flips
   the mode to **Mode A**.
3. If neither ledger nor explicit override is available, default to
   **Mode A** (manual `monthly_expenses` total is treated as inclusive).

**Dashboard subtitle reflects the active mode:**

- Mode A: `Inc $22K − Exp $15K (debt incl.) = $7K`
- Mode B: `Inc $22K − Exp $7K − Debt $8K = $7K`

**Historical bugs both pinned by regression:**

- v0 (`income − expenses` with `mortgageRepay = 0`, snapshot $4,500
  overriding ledger $15K) ⇒ phantom $17,440 surplus.
- v1 SoT (always subtract debt) ⇒ **double‑count** because ledger rows
  already contained `Housing / Mortgage` $3,750/mo and `Debt Repayment`
  rows. Test `PARITY: MODE A surplus === MODE B surplus` prevents both.

---

## When this contract changes

1. Edit `client/src/lib/dashboardDataContract.ts` (the typed contract).
2. Update the matching row in this document.
3. Run `npm run test:dashboard-contract`. The script asserts that every card
   in the contract still binds to the correct table/column/formula. If a
   future change accidentally remaps a card, the test will fail before merge.
4. Update the diagnostic console logs in `dashboard.tsx` if the inputs change.
