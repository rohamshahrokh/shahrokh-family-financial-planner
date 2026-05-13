# Regression Baseline — Pre-P1 (Current-Rules)

**Captured:** 2026-05-12 (synthetic deterministic fixtures, NO DB access)
**Branch:** fix/fwl-tax-reform-p1
**Parent HEAD:** 86f2fd7 (P0.1)

This file documents the **current-rules** outputs of the four core tax-touching
engines BEFORE any regime-aware wiring is added in P1. After P1 is complete,
the current-rules path of every engine MUST reproduce these numbers exactly.
Any drift > $1 indicates a parallel-pathway violation.

## Tax Alpha

- FY: `2025-26`
- Data coverage: `full`
- Household tax (now): **$103,895**
- Roham marginal rate: **37.00%**
- Roham total deductions: **$53,722**
- Roham net annual: **$131,878**
- Fara marginal rate: **37.00%**
- Fara total deductions: **$50,173**
- Fara net annual: **$126,327**
- Total annual saving (top-3): **$20,831.64**
- Top 3 strategy IDs: `offset_account`, `cgt_timing`, `negative_gearing`

### Strategy detail

| ID | Title | Category | Annual saving | Priority | Risk | Reliable |
|---|---|---|---|---|---|---|
| `offset_account` | Mortgage Offset Optimisation | offset | $11,520 | 3 | Low | true |
| `cgt_timing` | Capital Gains Timing & Discount | capital_gains | $5,460 | 4 | Low | true |
| `negative_gearing` | Negative Gearing Deduction | negative_gearing | $3,851.64 | 2 | Low | true |
| `super_concessional_roham` | Super Concessional Contribution | super | $1,854.72 | 1 | Low | true |
| `debt_restructure` | Deductible Debt Restructure | debt_structure | $374.4 | 7 | Medium | true |
| `spouse_super_split` | Spouse Super Contribution Splitting | spouse_split | $0 | 5 | Low | true |
| `mls_avoidance` | Medicare Levy Surcharge Avoidance | medicare | $0 | 6 | Low | true |
| `bracket_optimisation` | Income & Tax Bracket Optimisation | bracket | $0 | 8 | High | true |

## Forecast

- Monthly series length: 116
- Annual series length: 10
- NW projection length: 10 years
- NW year 1 (start → end): **$1,540,000 → $1,913,130** (growth $373,130)
- NW year 5 (start → end): **$2,894,299 → $3,258,350** (growth $364,051)
- NW year 10 (start → end): **$4,930,093 → $5,231,178** (growth $301,085)
- NW final end: **$5,231,178**
- Final CAGR: **13.01%**

## FIRE Path

- Best scenario: **Aggressive Growth** (`aggressive`)
- Best FIRE year: **2039**
- Semi-FIRE year: **2037**
- Target capital: **$4,500,000**
- Target passive income: **$15,000/mo**
- Current progress: **18.0%**
- Investable now: **$402,000**
- Super now: **$420,000**
- Total NW now: **$1,540,000**
- FIRE gap: **$3,678,000**
- Data coverage: `full`

### FIRE Sensitivity (years to FIRE delta)

- Returns −2pp: 2044 (Δ 5)
- Expenses +10%: 2042 (Δ 3)
- Surplus −20%: 2041 (Δ 2)
- Property flat: 2052 (Δ 13)

## Property Buy

- Best scenario: **Buy Now** (`buy_now`)
- Confidence: **60/100**

### Buy Now (10-year horizon)

- Purchase price: $820,000
- Deposit: $164,000
- Stamp duty: $29,925
- Total upfront: $198,025
- Property value end: $1,468,495
- Equity end: $910,976
- Capital gain: $648,495
- CGT-discounted gain: $324,248
- Avg monthly cashflow: $-900
- Total cash invested: $306,060
- IRR (annualised): **36.44%**
- Risk: **Low**

---

**Modelling disclaimer:** This is modelling only and not personal tax advice.
