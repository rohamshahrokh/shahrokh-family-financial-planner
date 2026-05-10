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

## When this contract changes

1. Edit `client/src/lib/dashboardDataContract.ts` (the typed contract).
2. Update the matching row in this document.
3. Run `npm run test:dashboard-contract`. The script asserts that every card
   in the contract still binds to the correct table/column/formula. If a
   future change accidentally remaps a card, the test will fail before merge.
4. Update the diagnostic console logs in `dashboard.tsx` if the inputs change.
