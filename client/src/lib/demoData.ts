/**
 * demoData.ts — Guest / Demo Mode Dataset
 * ─────────────────────────────────────────────────────────────────────────────
 * All data is FAKE. Names, numbers, and dates are fictional and used only
 * for product demonstration and training purposes.
 *
 * Demo family: Alex & Sara Johnson, Brisbane QLD
 *
 * SECURITY: This file never reads from or writes to Supabase.
 * It is a pure in-memory constant used ONLY when isDemo === true in the store.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Snapshot, Expense, Property, Stock, Crypto, TimelineEvent,
  StockTransaction, CryptoTransaction, IncomeRecord,
  StockDCASchedule, CryptoDCASchedule } from "./localStore";

// ─── Master Snapshot ─────────────────────────────────────────────────────────

export const DEMO_SNAPSHOT: Snapshot = {
  id: "demo-family-main",

  // Assets
  ppor:             1_200_000,
  cash:             20_000,
  super_balance:    160_000,
  stocks:           62_000,
  crypto:           18_500,
  cars:             55_000,
  iran_property:    0,
  other_assets:     12_000,

  // Debts
  mortgage:         850_000,
  other_debts:      14_500,

  // Cash flow
  monthly_income:   18_000,
  monthly_expenses: 11_200,

  updated_at: new Date().toISOString(),

  // ── Extended fields ──────────────────────────────────────────────────────
  offset_balance:          95_000,
  mortgage_rate:           6.24,
  max_refinance_lvr:       80,

  // Roham = "Alex"
  roham_monthly_income:    12_500,
  roham_super_balance:     105_000,
  roham_super_salary:      150_000,
  roham_employer_contrib:  11.5,
  roham_salary_sacrifice:  1_000,
  roham_super_personal_contrib: 0,
  roham_super_annual_topup: 0,
  roham_super_growth_rate: 7.5,
  roham_super_fee_pct:     0.6,
  roham_super_insurance_pa: 800,
  roham_super_option:      "Balanced Growth",
  roham_super_provider:    "AustralianSuper",
  roham_retirement_age:    60,
  roham_super_contrib_freq:"Monthly",

  // Fara = "Sara"
  fara_monthly_income:     5_500,
  fara_super_balance:      55_000,
  fara_super_salary:       70_000,
  fara_employer_contrib:   11.5,
  fara_salary_sacrifice:   0,
  fara_super_personal_contrib: 0,
  fara_super_annual_topup: 0,
  fara_super_growth_rate:  7.0,
  fara_super_fee_pct:      0.65,
  fara_super_insurance_pa: 600,
  fara_super_option:       "Balanced",
  fara_super_provider:     "Hostplus",
  fara_retirement_age:     60,
  fara_super_contrib_freq: "Monthly",

  // Income sub-fields
  rental_income_total:    2_000,
  other_income:           0,

  // Expense sub-fields
  childcare_monthly:      1_800,
  insurance_monthly:      420,
  utilities_monthly:      380,
  subscriptions_monthly:  95,

  // Goals
  fire_target_age:              55,
  fire_target_monthly_income:   9_000,
  property_savings_monthly:     2_000,
};

// ─── Properties ──────────────────────────────────────────────────────────────

export const DEMO_PROPERTIES: Property[] = [
  {
    id: 1,
    name: "PPOR — Brookfield Ave, Kenmore",
    type: "ppor",
    purchase_price:  780_000,
    current_value:   1_200_000,
    purchase_date:   "2019-06-15",
    loan_amount:     850_000,
    interest_rate:   6.24,
    loan_type:       "Principal & Interest",
    loan_term:       30,
    weekly_rent:     0,
    rental_growth:   3.5,
    vacancy_rate:    0,
    management_fee:  0,
    council_rates:   2_200,
    insurance:       2_400,
    maintenance:     3_000,
    capital_growth:  5.5,
    deposit:         195_000,
    stamp_duty:      31_000,
    legal_fees:      2_500,
    selling_costs:   25_000,
    projection_years: 20,
    notes: "Demo family home — fake address.",
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: 2,
    name: "IP1 — Everton Park (planned 2027)",
    type: "investment",
    purchase_price:  750_000,
    current_value:   750_000,
    purchase_date:   "2027-03-01",
    loan_amount:     600_000,
    interest_rate:   6.5,
    loan_type:       "Interest Only",
    loan_term:       30,
    weekly_rent:     650,
    rental_growth:   3.0,
    vacancy_rate:    3,
    management_fee:  8.5,
    council_rates:   2_000,
    insurance:       2_000,
    maintenance:     4_000,
    capital_growth:  5.0,
    deposit:         150_000,
    stamp_duty:      26_500,
    legal_fees:      2_200,
    selling_costs:   22_000,
    projection_years: 15,
    notes: "Demo investment property 1 — planned purchase 2027.",
    created_at: "2024-01-01T00:00:00Z",
  },
];

// ─── Stocks ──────────────────────────────────────────────────────────────────

export const DEMO_STOCKS: Stock[] = [
  { id: 1, ticker: "VAS",   name: "Vanguard Aust Shares",     current_price: 98.50,  current_holding: 200, allocation_pct: 40, expected_return: 9.5,  monthly_dca: 500, annual_lump_sum: 5_000, projection_years: 15, created_at: "2024-01-01T00:00:00Z" },
  { id: 2, ticker: "VGS",   name: "Vanguard Global Shares",   current_price: 130.20, current_holding: 150, allocation_pct: 35, expected_return: 10.5, monthly_dca: 400, annual_lump_sum: 3_000, projection_years: 15, created_at: "2024-01-01T00:00:00Z" },
  { id: 3, ticker: "QUAL",  name: "iShares MSCI Quality",     current_price: 47.80,  current_holding: 80,  allocation_pct: 15, expected_return: 11.0, monthly_dca: 200, annual_lump_sum: 2_000, projection_years: 15, created_at: "2024-01-01T00:00:00Z" },
  { id: 4, ticker: "NDQ",   name: "Betashares NASDAQ 100",    current_price: 42.10,  current_holding: 60,  allocation_pct: 10, expected_return: 13.0, monthly_dca: 100, annual_lump_sum: 0,     projection_years: 15, created_at: "2024-01-01T00:00:00Z" },
];

// ─── Crypto ──────────────────────────────────────────────────────────────────

export const DEMO_CRYPTOS: Crypto[] = [
  { id: 1, symbol: "BTC", name: "Bitcoin",  current_price: 95_000, current_holding: 0.12, expected_return: 40, monthly_dca: 200, lump_sum_amount: 5_000, projection_years: 10, created_at: "2024-01-01T00:00:00Z" },
  { id: 2, symbol: "ETH", name: "Ethereum", current_price: 3_200,  current_holding: 1.5,  expected_return: 35, monthly_dca: 100, lump_sum_amount: 2_000, projection_years: 10, created_at: "2024-01-01T00:00:00Z" },
];

// ─── Expenses (24 months of realistic entries) ───────────────────────────────

function makeExpense(id: number, date: string, amount: number, category: string,
  subcategory: string | null, description: string | null,
  source_code = "D", payment_method = "card", recurring = false): Expense {
  return { id, date, amount, category, source_code, subcategory, description,
    payment_method, family_member: null, recurring, notes: null,
    created_at: `${date}T10:00:00Z` };
}

export const DEMO_EXPENSES: Expense[] = [
  // 2024 — Jan through Dec (monthly rhythm)
  makeExpense(101, "2024-01-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(102, "2024-01-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(103, "2024-01-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(104, "2024-01-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(105, "2024-01-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(106, "2024-01-20", 850,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),
  makeExpense(107, "2024-01-25", 180,  "Transport", null, "Fuel & parking",      "D", "card",         false),

  makeExpense(111, "2024-02-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(112, "2024-02-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(113, "2024-02-15", 1_150,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(114, "2024-02-20", 620,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),
  makeExpense(115, "2024-02-22", 1_200,"Travel",    null, "Flight — Gold Coast trip","D","card",       false),

  makeExpense(121, "2024-03-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(122, "2024-03-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(123, "2024-03-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(124, "2024-03-15", 1_300,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(125, "2024-03-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(126, "2024-03-25", 950,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),

  makeExpense(131, "2024-04-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(132, "2024-04-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(133, "2024-04-15", 1_250,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(134, "2024-04-20", 700,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),
  makeExpense(135, "2024-04-28", 2_400,"Healthcare","null","School fees — term 2","D","card",          false),

  makeExpense(141, "2024-05-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(142, "2024-05-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(143, "2024-05-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(144, "2024-05-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(145, "2024-05-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(146, "2024-05-25", 800,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),

  makeExpense(151, "2024-06-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(152, "2024-06-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(153, "2024-06-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(154, "2024-06-20", 600,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),
  makeExpense(155, "2024-06-25", 180,  "Transport", null, "Fuel & parking",      "D", "card",         false),

  makeExpense(161, "2024-07-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(162, "2024-07-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(163, "2024-07-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(164, "2024-07-15", 1_250,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(165, "2024-07-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(166, "2024-07-22", 3_200,"Travel",    null, "Japan holiday — flights","D","card",        false),

  makeExpense(171, "2024-08-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(172, "2024-08-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(173, "2024-08-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(174, "2024-08-20", 750,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),

  makeExpense(181, "2024-09-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(182, "2024-09-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(183, "2024-09-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(184, "2024-09-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(185, "2024-09-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(186, "2024-09-25", 2_400,"Healthcare","null","School fees — term 3","D","card",          false),

  makeExpense(191, "2024-10-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(192, "2024-10-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(193, "2024-10-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(194, "2024-10-20", 850,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),

  makeExpense(201, "2024-11-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(202, "2024-11-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(203, "2024-11-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(204, "2024-11-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(205, "2024-11-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(206, "2024-11-25", 1_800,"Shopping",  null, "Christmas shopping",  "D", "card",         false),

  makeExpense(211, "2024-12-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(212, "2024-12-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(213, "2024-12-15", 1_400,"Groceries", null, "Christmas groceries", "D", "card",         true),
  makeExpense(214, "2024-12-20", 1_200,"Dining",    null, "Xmas celebrations",   "D", "card",         false),
  makeExpense(215, "2024-12-28", 2_400,"Healthcare","null","School fees — term 4","D","card",          false),

  // 2025 — Jan through Dec
  makeExpense(221, "2025-01-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(222, "2025-01-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(223, "2025-01-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(224, "2025-01-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(225, "2025-01-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(226, "2025-01-25", 920,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),
  makeExpense(227, "2025-01-28", 200,  "Transport", null, "Fuel & parking",      "D", "card",         false),

  makeExpense(231, "2025-02-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(232, "2025-02-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(233, "2025-02-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(234, "2025-02-20", 680,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),

  makeExpense(241, "2025-03-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(242, "2025-03-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(243, "2025-03-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(244, "2025-03-15", 1_250,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(245, "2025-03-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(246, "2025-03-25", 2_400,"Healthcare","null","School fees — term 1","D","card",          false),

  makeExpense(251, "2025-04-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(252, "2025-04-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(253, "2025-04-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(254, "2025-04-20", 780,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),

  makeExpense(261, "2025-05-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(262, "2025-05-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(263, "2025-05-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(264, "2025-05-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(265, "2025-05-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(266, "2025-05-25", 900,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),

  makeExpense(271, "2025-06-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(272, "2025-06-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(273, "2025-06-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(274, "2025-06-20", 600,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),
  makeExpense(275, "2025-06-28", 2_400,"Healthcare","null","School fees — term 2","D","card",          false),

  makeExpense(281, "2025-07-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(282, "2025-07-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(283, "2025-07-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(284, "2025-07-15", 1_250,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(285, "2025-07-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(286, "2025-07-22", 2_800,"Travel",    null, "Bali holiday — flights","D","card",         false),

  makeExpense(291, "2025-08-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(292, "2025-08-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(293, "2025-08-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(294, "2025-08-20", 820,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),

  makeExpense(301, "2025-09-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(302, "2025-09-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(303, "2025-09-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(304, "2025-09-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(305, "2025-09-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(306, "2025-09-25", 2_400,"Healthcare","null","School fees — term 3","D","card",          false),

  makeExpense(311, "2025-10-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(312, "2025-10-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(313, "2025-10-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(314, "2025-10-20", 900,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),

  makeExpense(321, "2025-11-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(322, "2025-11-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(323, "2025-11-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(324, "2025-11-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(325, "2025-11-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(326, "2025-11-25", 2_000,"Shopping",  null, "Christmas shopping",  "D", "card",         false),

  makeExpense(331, "2025-12-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(332, "2025-12-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(333, "2025-12-15", 1_400,"Groceries", null, "Christmas groceries", "D", "card",         true),
  makeExpense(334, "2025-12-20", 1_200,"Dining",    null, "Xmas celebrations",   "D", "card",         false),
  makeExpense(335, "2025-12-28", 2_400,"Healthcare","null","School fees — term 4","D","card",          false),

  // 2026 — Jan through May
  makeExpense(341, "2026-01-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(342, "2026-01-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(343, "2026-01-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(344, "2026-01-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(345, "2026-01-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(346, "2026-01-25", 850,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),

  makeExpense(351, "2026-02-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(352, "2026-02-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(353, "2026-02-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(354, "2026-02-20", 700,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),
  makeExpense(355, "2026-02-25", 2_400,"Healthcare","null","School fees — term 1","D","card",          false),

  makeExpense(361, "2026-03-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(362, "2026-03-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(363, "2026-03-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(364, "2026-03-15", 1_250,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(365, "2026-03-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(366, "2026-03-25", 920,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),

  makeExpense(371, "2026-04-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(372, "2026-04-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(373, "2026-04-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(374, "2026-04-20", 750,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),

  makeExpense(381, "2026-05-05", 3_400, "Mortgage", null, "Home loan repayment", "M", "direct_debit", true),
  makeExpense(382, "2026-05-10", 420,  "Insurance", null, "Home & car insurance", "D", "direct_debit", true),
  makeExpense(383, "2026-05-12", 1_800,"Childcare", null, "Daycare — 2 kids",    "D", "direct_debit", true),
  makeExpense(384, "2026-05-15", 1_200,"Groceries", null, "Weekly groceries",    "D", "card",         true),
  makeExpense(385, "2026-05-18", 380,  "Utilities", null, "Electricity & gas",   "D", "direct_debit", true),
  makeExpense(386, "2026-05-25", 880,  "Dining",    null, "Restaurants & cafes", "D", "card",         false),
];

// ─── Income Records ──────────────────────────────────────────────────────────

function makeIncome(id: number, date: string, amount: number, source: string,
  description: string, member: string, frequency: string, recurring = true): IncomeRecord {
  return { id, date, amount, source, description, member, frequency, recurring,
    notes: "", created_at: `${date}T08:00:00Z`, updated_at: `${date}T08:00:00Z` };
}

export const DEMO_INCOME: IncomeRecord[] = [
  // 2024 monthly salary — Alex
  ...["01","02","03","04","05","06","07","08","09","10","11","12"].map((m, i) =>
    makeIncome(400+i, `2024-${m}-15`, 12_500, "Salary", "Alex monthly salary — net", "Alex", "Monthly")),
  // 2024 monthly salary — Sara
  ...["01","02","03","04","05","06","07","08","09","10","11","12"].map((m, i) =>
    makeIncome(420+i, `2024-${m}-15`, 5_500, "Salary", "Sara monthly salary — net", "Sara", "Monthly")),
  // 2024 quarterly rental
  makeIncome(440, "2024-03-01", 2_000, "Rental Income", "Demo rental — Q1 2024", "Family", "Quarterly"),
  makeIncome(441, "2024-06-01", 2_000, "Rental Income", "Demo rental — Q2 2024", "Family", "Quarterly"),
  makeIncome(442, "2024-09-01", 2_000, "Rental Income", "Demo rental — Q3 2024", "Family", "Quarterly"),
  makeIncome(443, "2024-12-01", 2_000, "Rental Income", "Demo rental — Q4 2024", "Family", "Quarterly"),
  // 2024 tax refund
  makeIncome(444, "2024-08-20", 4_800, "Tax Refund", "ATO 2023-24 tax refund", "Alex", "One-off", false),
  makeIncome(445, "2024-08-20", 1_200, "Tax Refund", "ATO 2023-24 tax refund", "Sara", "One-off", false),
  // 2024 annual bonus
  makeIncome(446, "2024-11-30", 15_000, "Bonus", "End-of-year bonus", "Alex", "One-off", false),

  // 2025 monthly salary — Alex
  ...["01","02","03","04","05","06","07","08","09","10","11","12"].map((m, i) =>
    makeIncome(450+i, `2025-${m}-15`, 12_500, "Salary", "Alex monthly salary — net", "Alex", "Monthly")),
  // 2025 monthly salary — Sara
  ...["01","02","03","04","05","06","07","08","09","10","11","12"].map((m, i) =>
    makeIncome(470+i, `2025-${m}-15`, 5_500, "Salary", "Sara monthly salary — net", "Sara", "Monthly")),
  // 2025 quarterly rental
  makeIncome(490, "2025-03-01", 2_000, "Rental Income", "Demo rental — Q1 2025", "Family", "Quarterly"),
  makeIncome(491, "2025-06-01", 2_000, "Rental Income", "Demo rental — Q2 2025", "Family", "Quarterly"),
  makeIncome(492, "2025-09-01", 2_000, "Rental Income", "Demo rental — Q3 2025", "Family", "Quarterly"),
  makeIncome(493, "2025-12-01", 2_000, "Rental Income", "Demo rental — Q4 2025", "Family", "Quarterly"),
  // 2025 tax refund
  makeIncome(494, "2025-08-15", 5_200, "Tax Refund", "ATO 2024-25 tax refund", "Alex", "One-off", false),
  makeIncome(495, "2025-08-15", 1_400, "Tax Refund", "ATO 2024-25 tax refund", "Sara", "One-off", false),
  // 2025 dividends
  makeIncome(496, "2025-07-01", 1_800, "Dividends", "VAS/VGS interim dividend", "Family", "Quarterly"),
  makeIncome(497, "2025-10-01", 1_900, "Dividends", "VAS/VGS final dividend", "Family", "Quarterly"),

  // 2026 salary — Alex (Jan–May)
  ...["01","02","03","04","05"].map((m, i) =>
    makeIncome(500+i, `2026-${m}-15`, 12_500, "Salary", "Alex monthly salary — net", "Alex", "Monthly")),
  // 2026 salary — Sara (Jan–May)
  ...["01","02","03","04","05"].map((m, i) =>
    makeIncome(510+i, `2026-${m}-15`, 5_500, "Salary", "Sara monthly salary — net", "Sara", "Monthly")),
  // 2026 rental Q1
  makeIncome(520, "2026-03-01", 2_000, "Rental Income", "Demo rental — Q1 2026", "Family", "Quarterly"),
];

// ─── Recurring Bills ──────────────────────────────────────────────────────────

export const DEMO_BILLS = [
  { id: 1, name: "Home Mortgage",         amount: 3_400, frequency: "monthly",    category: "Mortgage",   next_due_date: "2026-06-05", enabled: true, notes: "Principal & interest — CBA" },
  { id: 2, name: "Childcare — 2 Kids",    amount: 1_800, frequency: "monthly",    category: "Childcare",  next_due_date: "2026-06-12", enabled: true, notes: "Goodstart Early Learning" },
  { id: 3, name: "Home & Car Insurance",  amount: 420,   frequency: "monthly",    category: "Insurance",  next_due_date: "2026-06-10", enabled: true, notes: "NRMA combined policy" },
  { id: 4, name: "Electricity & Gas",     amount: 380,   frequency: "monthly",    category: "Utilities",  next_due_date: "2026-06-18", enabled: true, notes: "Origin Energy" },
  { id: 5, name: "Netflix + Disney+",     amount: 45,    frequency: "monthly",    category: "Subscriptions", next_due_date: "2026-06-08", enabled: true, notes: "" },
  { id: 6, name: "Gym Memberships x2",    amount: 120,   frequency: "monthly",    category: "Health",     next_due_date: "2026-06-01", enabled: true, notes: "F45 + Yoga" },
  { id: 7, name: "Council Rates",         amount: 550,   frequency: "quarterly",  category: "Council",    next_due_date: "2026-07-01", enabled: true, notes: "Brisbane City Council" },
  { id: 8, name: "School Fees (x2 kids)", amount: 2_400, frequency: "quarterly",  category: "Education",  next_due_date: "2026-07-15", enabled: true, notes: "State school + sport levy" },
  { id: 9, name: "Car Registration",      amount: 650,   frequency: "annual",     category: "Transport",  next_due_date: "2026-09-01", enabled: true, notes: "Both vehicles" },
  { id: 10, name: "Income Protection Insurance", amount: 900, frequency: "annual", category: "Insurance", next_due_date: "2026-10-01", enabled: true, notes: "Alex — outside super" },
];

// ─── Monthly Budgets ──────────────────────────────────────────────────────────

export const DEMO_BUDGETS = [
  // 2025 annual budgets
  ...["01","02","03","04","05","06","07","08","09","10","11","12"].map((m, i) => ({
    id: 200 + i,
    year: 2025, month: i + 1,
    housing: 3_400, groceries: 1_200, childcare: 1_800,
    utilities: 380, insurance: 420, transport: 200,
    dining: 800, entertainment: 200, subscriptions: 95,
    healthcare: 150, shopping: 400, savings: 2_000,
    total_budget: 11_045, created_at: `2025-${m}-01T00:00:00Z`, updated_at: `2025-${m}-01T00:00:00Z`,
  })),
  // 2026 budgets
  ...["01","02","03","04","05"].map((m, i) => ({
    id: 220 + i,
    year: 2026, month: i + 1,
    housing: 3_400, groceries: 1_200, childcare: 1_800,
    utilities: 380, insurance: 420, transport: 200,
    dining: 800, entertainment: 200, subscriptions: 95,
    healthcare: 150, shopping: 400, savings: 2_000,
    total_budget: 11_045, created_at: `2026-${m}-01T00:00:00Z`, updated_at: `2026-${m}-01T00:00:00Z`,
  })),
];

// ─── Timeline Events ──────────────────────────────────────────────────────────

export const DEMO_TIMELINE: TimelineEvent[] = [
  { id: 1, year: 2019, title: "Bought PPOR",                          description: "Purchased Kenmore home for $780K. 80% LVR.",                  type: "property",    amount: 780_000, created_at: "2024-01-01T00:00:00Z" },
  { id: 2, year: 2024, title: "Offset account opened",               description: "CBA offset linked to home loan. Starting balance: $50K.",     type: "finance",     amount: 50_000,  created_at: "2024-01-01T00:00:00Z" },
  { id: 3, year: 2025, title: "Started ETF DCA strategy",            description: "VAS + VGS monthly DCA $900/mo commenced.",                    type: "investment",  amount: 900,     created_at: "2025-01-15T00:00:00Z" },
  { id: 4, year: 2025, title: "Tax refund — $5,200 invested",        description: "2024-25 ATO refund deployed into VGS lump sum.",              type: "investment",  amount: 5_200,   created_at: "2025-08-20T00:00:00Z" },
  { id: 5, year: 2026, title: "Mortgage refinance",                  description: "Refinanced at 5.85% fixed 2yr — saving $4K/year.",            type: "finance",     amount: 4_000,   created_at: "2026-03-01T00:00:00Z" },
  { id: 6, year: 2027, title: "Buy Investment Property 1",           description: "Everton Park — $750K, IO loan $600K, $650/wk rent.",          type: "property",    amount: 750_000, created_at: "2024-01-01T00:00:00Z" },
  { id: 7, year: 2028, title: "IP1 negative gearing tax refund",     description: "Estimated $6,800/yr tax benefit from IP1 losses.",            type: "finance",     amount: 6_800,   created_at: "2024-01-01T00:00:00Z" },
  { id: 8, year: 2029, title: "Buy Investment Property 2",           description: "Target: Logan area, $650K, 7% yield. Second IP.",             type: "property",    amount: 650_000, created_at: "2024-01-01T00:00:00Z" },
  { id: 9, year: 2030, title: "Super salary sacrifice increase",     description: "Alex increases SS to $2K/mo post IP2 purchase.",             type: "super",       amount: 24_000,  created_at: "2024-01-01T00:00:00Z" },
  { id: 10,year: 2032, title: "Both kids in high school",            description: "Childcare costs end. Surplus rises by $1,800/mo.",            type: "lifestyle",   amount: 21_600,  created_at: "2024-01-01T00:00:00Z" },
  { id: 11,year: 2035, title: "Mortgage — P&I switch on IP1",        description: "IP1 IO period ends. Switch to P&I. LVR at 55%.",             type: "property",    amount: 0,       created_at: "2024-01-01T00:00:00Z" },
  { id: 12,year: 2038, title: "PPOR fully paid off",                 description: "Home loan cleared. $3,400/mo freed.",                        type: "property",    amount: 0,       created_at: "2024-01-01T00:00:00Z" },
  { id: 13,year: 2040, title: "FIRE target — semi-retirement",       description: "Alex & Sara target $9K/mo passive income. Semi-FIRE.",       type: "fire",        amount: 108_000, created_at: "2024-01-01T00:00:00Z" },
  { id: 14,year: 2044, title: "Full retirement — age 55 (Alex)",     description: "Portfolio projected $3.2M. 4% SWR = $128K/yr.",              type: "fire",        amount: 3_200_000, created_at: "2024-01-01T00:00:00Z" },
];

// ─── Stock Transactions ───────────────────────────────────────────────────────

export const DEMO_STOCK_TRANSACTIONS: StockTransaction[] = [
  { id: 1, created_at: "2025-01-20T00:00:00Z", updated_at: "2025-01-20T00:00:00Z", transaction_type: "buy", status: "actual", transaction_date: "2025-01-20", ticker: "VAS", asset_name: "Vanguard Aust Shares", units: 30, price_per_unit: 95.20, total_amount: 2_856, brokerage_fee: 9.95, notes: "Monthly DCA", created_by: "Alex" },
  { id: 2, created_at: "2025-02-18T00:00:00Z", updated_at: "2025-02-18T00:00:00Z", transaction_type: "buy", status: "actual", transaction_date: "2025-02-18", ticker: "VGS", asset_name: "Vanguard Global Shares", units: 20, price_per_unit: 126.40, total_amount: 2_528, brokerage_fee: 9.95, notes: "Monthly DCA", created_by: "Alex" },
  { id: 3, created_at: "2025-03-15T00:00:00Z", updated_at: "2025-03-15T00:00:00Z", transaction_type: "buy", status: "actual", transaction_date: "2025-03-15", ticker: "VAS", asset_name: "Vanguard Aust Shares", units: 25, price_per_unit: 97.10, total_amount: 2_427.50, brokerage_fee: 9.95, notes: "Monthly DCA", created_by: "Alex" },
  { id: 4, created_at: "2025-08-20T00:00:00Z", updated_at: "2025-08-20T00:00:00Z", transaction_type: "buy", status: "actual", transaction_date: "2025-08-20", ticker: "VGS", asset_name: "Vanguard Global Shares", units: 40, price_per_unit: 128.90, total_amount: 5_156, brokerage_fee: 9.95, notes: "Tax refund lump sum", created_by: "Alex" },
  { id: 5, created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-01T00:00:00Z", transaction_type: "buy", status: "planned", transaction_date: "2026-06-01", ticker: "NDQ", asset_name: "Betashares NASDAQ 100", units: 100, price_per_unit: 43.00, total_amount: 4_300, brokerage_fee: 9.95, notes: "Planned lump sum — June 2026", created_by: "Alex" },
];

// ─── Crypto Transactions ──────────────────────────────────────────────────────

export const DEMO_CRYPTO_TRANSACTIONS: CryptoTransaction[] = [
  { id: 1, created_at: "2024-10-15T00:00:00Z", updated_at: "2024-10-15T00:00:00Z", transaction_type: "buy", status: "actual", transaction_date: "2024-10-15", symbol: "BTC", asset_name: "Bitcoin", units: 0.05, price_per_unit: 68_000, total_amount: 3_400, fee: 34, notes: "First BTC purchase", created_by: "Alex" },
  { id: 2, created_at: "2025-01-10T00:00:00Z", updated_at: "2025-01-10T00:00:00Z", transaction_type: "buy", status: "actual", transaction_date: "2025-01-10", symbol: "BTC", asset_name: "Bitcoin", units: 0.04, price_per_unit: 96_500, total_amount: 3_860, fee: 38.60, notes: "DCA accumulation", created_by: "Alex" },
  { id: 3, created_at: "2025-03-01T00:00:00Z", updated_at: "2025-03-01T00:00:00Z", transaction_type: "buy", status: "actual", transaction_date: "2025-03-01", symbol: "ETH", asset_name: "Ethereum", units: 1.0, price_per_unit: 3_100, total_amount: 3_100, fee: 31, notes: "ETH position initiated", created_by: "Alex" },
  { id: 4, created_at: "2025-07-01T00:00:00Z", updated_at: "2025-07-01T00:00:00Z", transaction_type: "buy", status: "planned", transaction_date: "2025-07-01", symbol: "BTC", asset_name: "Bitcoin", units: 0.05, price_per_unit: 100_000, total_amount: 5_000, fee: 50, notes: "Planned lump sum — mid 2025", created_by: "Alex" },
];

// ─── Stock DCA Schedules ──────────────────────────────────────────────────────

export const DEMO_STOCK_DCA: StockDCASchedule[] = [
  { id: 1, ticker: "VAS",  asset_name: "Vanguard Aust Shares",  amount: 500, frequency: "monthly", start_date: "2025-01-01", end_date: null, enabled: true, notes: "Core Aust equities DCA", created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
  { id: 2, ticker: "VGS",  asset_name: "Vanguard Global Shares", amount: 400, frequency: "monthly", start_date: "2025-01-01", end_date: null, enabled: true, notes: "International equities DCA", created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
  { id: 3, ticker: "QUAL", asset_name: "iShares MSCI Quality",   amount: 200, frequency: "monthly", start_date: "2025-06-01", end_date: null, enabled: true, notes: "Quality factor tilt", created_at: "2025-06-01T00:00:00Z", updated_at: "2025-06-01T00:00:00Z" },
];

// ─── Crypto DCA Schedules ─────────────────────────────────────────────────────

export const DEMO_CRYPTO_DCA: CryptoDCASchedule[] = [
  { id: 1, symbol: "BTC", asset_name: "Bitcoin",  amount: 200, frequency: "monthly", start_date: "2025-01-01", end_date: null, enabled: true, notes: "BTC accumulation", created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
  { id: 2, symbol: "ETH", asset_name: "Ethereum", amount: 100, frequency: "monthly", start_date: "2025-03-01", end_date: null, enabled: true, notes: "ETH accumulation", created_at: "2025-03-01T00:00:00Z", updated_at: "2025-03-01T00:00:00Z" },
];

// ─── Tax Profile ──────────────────────────────────────────────────────────────

export const DEMO_TAX_PROFILE = {
  owner_id: "demo-family-main",
  financial_year: "2025-26",
  alex_gross_income: 150_000,
  alex_deductions:   8_200,
  alex_tax_withheld: 43_500,
  sara_gross_income: 70_000,
  sara_deductions:   3_100,
  sara_tax_withheld: 16_800,
  rental_income:     24_000,
  rental_expenses:   32_000,
  capital_gains:     0,
  updated_at: new Date().toISOString(),
};

// ─── FIRE Settings ────────────────────────────────────────────────────────────

export const DEMO_FIRE_SETTINGS = {
  id: "demo-family-main",
  target_fire_age: 55,
  target_monthly_income: 9_000,
  current_age: 37,
  safe_withdrawal_rate: 4.0,
  inflation_rate: 2.5,
  updated_at: new Date().toISOString(),
};

// ─── App Settings ─────────────────────────────────────────────────────────────

export const DEMO_APP_SETTINGS: Record<string, any> = {
  emergency_buffer: 30_000,
  max_refinance_lvr: 80,
  property_growth_rate: 5.5,
  stocks_return: 9.5,
  crypto_return: 20.0,
  inflation_rate: 2.5,
};

// ─── Planned Investments ──────────────────────────────────────────────────────

export const DEMO_PLANNED_INVESTMENTS = [
  { id: 1, module: "stock",  ticker: "NDQ", asset_name: "Betashares NASDAQ 100", amount: 4_300, planned_date: "2026-06-01", notes: "Mid-year lump sum", status: "planned", created_at: "2026-01-01T00:00:00Z" },
  { id: 2, module: "crypto", symbol: "BTC", asset_name: "Bitcoin",               amount: 5_000, planned_date: "2026-09-01", notes: "Q3 2026 accumulation", status: "planned", created_at: "2026-01-01T00:00:00Z" },
];

// ─── Scenarios (empty for demo) ───────────────────────────────────────────────

export const DEMO_SCENARIOS: any[] = [];

// ─── Alert Logs / Family Msg (empty stubs) ────────────────────────────────────

export const DEMO_ALERT_LOGS: any[] = [];
export const DEMO_FAMILY_MSG: any[] = [];

// ─── Reset helper — returns a fresh deep clone of all demo data ───────────────

export function getDemoDataset() {
  return {
    snapshot:             JSON.parse(JSON.stringify(DEMO_SNAPSHOT)),
    properties:           JSON.parse(JSON.stringify(DEMO_PROPERTIES)),
    stocks:               JSON.parse(JSON.stringify(DEMO_STOCKS)),
    cryptos:              JSON.parse(JSON.stringify(DEMO_CRYPTOS)),
    expenses:             JSON.parse(JSON.stringify(DEMO_EXPENSES)),
    income:               JSON.parse(JSON.stringify(DEMO_INCOME)),
    bills:                JSON.parse(JSON.stringify(DEMO_BILLS)),
    budgets:              JSON.parse(JSON.stringify(DEMO_BUDGETS)),
    timeline:             JSON.parse(JSON.stringify(DEMO_TIMELINE)),
    stockTransactions:    JSON.parse(JSON.stringify(DEMO_STOCK_TRANSACTIONS)),
    cryptoTransactions:   JSON.parse(JSON.stringify(DEMO_CRYPTO_TRANSACTIONS)),
    stockDCA:             JSON.parse(JSON.stringify(DEMO_STOCK_DCA)),
    cryptoDCA:            JSON.parse(JSON.stringify(DEMO_CRYPTO_DCA)),
    taxProfile:           JSON.parse(JSON.stringify(DEMO_TAX_PROFILE)),
    fireSettings:         JSON.parse(JSON.stringify(DEMO_FIRE_SETTINGS)),
    appSettings:          JSON.parse(JSON.stringify(DEMO_APP_SETTINGS)),
    plannedInvestments:   JSON.parse(JSON.stringify(DEMO_PLANNED_INVESTMENTS)),
    scenarios:            JSON.parse(JSON.stringify(DEMO_SCENARIOS)),
  };
}
