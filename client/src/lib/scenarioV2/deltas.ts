/**
 * Scenario Engine V2 — Delta Translators (Production Build)
 *
 * All 17 delta types fully implemented. Each delta produces one or more
 * ScenarioEvents emitted on the timeline. AU-specific defaults are
 * auto-derived where possible (stamp duty, LMI, rent yield, holding costs).
 */

import type { ScenarioDelta, ScenarioEvent } from "./types";
import { stampDutyByState, estimateLMI, type AuState } from "./auTax";
import { addMonths } from "./basePlan";

export function translateDelta(d: ScenarioDelta): ScenarioEvent[] {
  switch (d.deltaType) {
    case "crypto_lump_sum":
      return translateCryptoLumpSum(d);
    case "etf_lump_sum":
      return translateEtfLumpSum(d);
    case "etf_dca":
      return translateEtfDca(d);
    case "offset_deposit":
      return translateOffsetDeposit(d);
    case "cash_hold":
      return translateCashHold(d);
    case "extra_mortgage_repayment":
      return translateExtraMortgageRepayment(d);
    case "refinance":
      return translateRefinance(d);
    case "property_deposit_boost":
    case "buy_property":
      return translateBuyProperty(d);
    case "sell_property":
      return translateSellProperty(d);
    case "rentvest":
      return translateRentvest(d);
    case "early_retire":
      return translateEarlyRetire(d);
    case "salary_change":
      return translateSalaryChange(d);
    case "career_break":
      return translateCareerBreak(d);
    case "child_expense":
      return translateChildExpense(d);
    case "market_crash_stress":
      return translateMarketCrashStress(d);
    case "interest_rate_spike":
      return translateInterestRateSpike(d);
    default:
      return [];
  }
}

// ─── crypto_lump_sum ────────────────────────────────────────────────────────

function translateCryptoLumpSum(d: ScenarioDelta): ScenarioEvent[] {
  return [{
    id: `${d.id}/buy`,
    type: "contribution.crypto_lump",
    month: d.activationMonth,
    priority: 600,
    sourceDeltaId: d.id,
    payload: { amount: num(d.params, "amount", 0) },
  }];
}

// ─── etf_lump_sum ───────────────────────────────────────────────────────────

function translateEtfLumpSum(d: ScenarioDelta): ScenarioEvent[] {
  return [{
    id: `${d.id}/buy`,
    type: "contribution.etf_lump",
    month: d.activationMonth,
    priority: 600,
    sourceDeltaId: d.id,
    payload: { amount: num(d.params, "amount", 0) },
  }];
}

// ─── etf_dca ────────────────────────────────────────────────────────────────

function translateEtfDca(d: ScenarioDelta): ScenarioEvent[] {
  const monthly = num(d.params, "monthlyAmount", 0);
  const months = num(d.params, "months", 60);
  const events: ScenarioEvent[] = [];
  for (let i = 0; i < months; i++) {
    events.push({
      id: `${d.id}/dca/${i}`,
      type: "contribution.etf_dca",
      month: addMonths(d.activationMonth, i),
      priority: 400,
      sourceDeltaId: d.id,
      payload: { amount: monthly },
    });
  }
  return events;
}

// ─── offset_deposit ─────────────────────────────────────────────────────────

function translateOffsetDeposit(d: ScenarioDelta): ScenarioEvent[] {
  return [{
    id: `${d.id}/offset`,
    type: "contribution.offset_deposit",
    month: d.activationMonth,
    priority: 400,
    sourceDeltaId: d.id,
    payload: { amount: num(d.params, "amount", 0) },
  }];
}

// ─── cash_hold ──────────────────────────────────────────────────────────────

function translateCashHold(d: ScenarioDelta): ScenarioEvent[] {
  return [{
    id: `${d.id}/hold`,
    type: "asset.cash_hold",
    month: d.activationMonth,
    priority: 600,
    sourceDeltaId: d.id,
    payload: { amount: num(d.params, "amount", 0) },
  }];
}

// ─── extra_mortgage_repayment ───────────────────────────────────────────────

function translateExtraMortgageRepayment(d: ScenarioDelta): ScenarioEvent[] {
  return [{
    id: `${d.id}/extra`,
    type: "debt.extra_repayment",
    month: d.activationMonth,
    priority: 500,
    sourceDeltaId: d.id,
    payload: {
      amount: num(d.params, "amount", 0),
      targetPropertyId: str(d.params, "targetPropertyId", ""),
    },
  }];
}

// ─── refinance ──────────────────────────────────────────────────────────────

function translateRefinance(d: ScenarioDelta): ScenarioEvent[] {
  return [{
    id: `${d.id}/refi`,
    type: "debt.refinance",
    month: d.activationMonth,
    priority: 500,
    sourceDeltaId: d.id,
    payload: {
      targetPropertyId: str(d.params, "targetPropertyId", ""),
      newRate: num(d.params, "newRate", -1),
      newTermYears: num(d.params, "newTermYears", -1),
    },
  }];
}

// ─── buy_property / property_deposit_boost ──────────────────────────────────

function translateBuyProperty(d: ScenarioDelta): ScenarioEvent[] {
  const state = (str(d.params, "state", "QLD") || "QLD") as AuState;
  const extraDeposit = num(d.params, "extraDeposit", num(d.params, "amount", 0));
  const purchasePrice = num(d.params, "purchasePrice", extraDeposit > 0 ? extraDeposit * 5 : 0);

  // Compute target LVR (default 80% to avoid LMI, but allow override).
  const targetLvr = num(d.params, "targetLvr", 0.80);
  // Loan = price × LVR, less any extra deposit beyond standard 20%
  const standardDeposit = purchasePrice * (1 - targetLvr);
  const loanBalance = Math.max(0, purchasePrice - standardDeposit - Math.max(0, extraDeposit));

  // Acquisition costs: stamp duty (real schedule) + legals + LMI if applicable
  const stampDuty = stampDutyByState(state, purchasePrice);
  const legals = num(d.params, "legalsAndInspection", 3000);
  const lmi = loanBalance > purchasePrice * 0.80
    ? estimateLMI(loanBalance, purchasePrice)
    : 0;
  const acqCosts = stampDuty + legals + lmi;

  // Defaults for rental yield, costs
  const yieldPct = num(d.params, "rentYieldPct", 0.045);
  const weeklyRent = num(d.params, "weeklyRent", Math.round((purchasePrice * yieldPct) / 52));
  const rate = num(d.params, "rate", 0.065);
  const term = num(d.params, "loanTermYears", 30);
  const vacancy = num(d.params, "vacancyRate", 0.04);
  const mgmt = num(d.params, "managementFee", 0.08);
  // AU IP holding costs: rates + insurance + maintenance + body corp (apartments)
  const annualHoldingCosts = num(d.params, "annualHoldingCosts", purchasePrice * 0.012);

  return [{
    id: `${d.id}/buy`,
    type: "asset.buy_property",
    month: d.activationMonth,
    priority: 600,
    sourceDeltaId: d.id,
    payload: {
      marketValue: purchasePrice,
      purchasePrice,
      cashOutflow: standardDeposit + Math.max(0, extraDeposit) + acqCosts,
      loanBalance,
      rate,
      termYears: term,
      weeklyRent,
      vacancyRate: vacancy,
      managementFee: mgmt,
      annualHoldingCosts,
      stampDuty,
      lmi,
      legals,
      state,
    },
  }];
}

// ─── sell_property ──────────────────────────────────────────────────────────

function translateSellProperty(d: ScenarioDelta): ScenarioEvent[] {
  return [{
    id: `${d.id}/sell`,
    type: "asset.sell_property",
    month: d.activationMonth,
    priority: 600,
    sourceDeltaId: d.id,
    payload: {
      targetPropertyId: str(d.params, "targetPropertyId", ""),
      salePrice: num(d.params, "salePrice", 0),
      costBase: num(d.params, "costBase", 0),
      sellingCostsPct: num(d.params, "sellingCostsPct", 0.025),
    },
  }];
}

// ─── rentvest (sell PPOR, buy IP, rent elsewhere) ───────────────────────────

function translateRentvest(d: ScenarioDelta): ScenarioEvent[] {
  // 1. Sell the PPOR  →  emit sell_property event
  // 2. Buy an IP using freed equity  →  emit asset.buy_property
  // 3. Add a recurring rent expense for the household
  const events: ScenarioEvent[] = [];
  const pporSalePrice = num(d.params, "pporSalePrice", 0);
  const pporCostBase = num(d.params, "pporCostBase", pporSalePrice * 0.85);
  const ipPurchasePrice = num(d.params, "ipPurchasePrice", pporSalePrice * 0.8);
  const weeklyHouseholdRent = num(d.params, "weeklyHouseholdRent", 700);
  const months = num(d.params, "horizonMonths", 120);

  events.push({
    id: `${d.id}/sell`,
    type: "asset.sell_property",
    month: d.activationMonth,
    priority: 600,
    sourceDeltaId: d.id,
    payload: { targetPropertyId: "ppor", salePrice: pporSalePrice, costBase: pporCostBase, sellingCostsPct: 0.025 },
  });
  // Buy IP one month after sale
  events.push(...translateBuyProperty({
    ...d,
    id: `${d.id}/buy-ip`,
    activationMonth: addMonths(d.activationMonth, 1),
    params: {
      ...d.params,
      purchasePrice: ipPurchasePrice,
      state: str(d.params, "state", "QLD"),
    },
  }));
  // Household rent expense (recurring)
  const monthlyRent = (weeklyHouseholdRent * 52) / 12;
  for (let i = 0; i < months; i++) {
    events.push({
      id: `${d.id}/rent/${i}`,
      type: "expense.recurring",
      month: addMonths(d.activationMonth, i),
      priority: 300,
      sourceDeltaId: d.id,
      payload: { kind: "household_rent", amount: monthlyRent },
    });
  }
  return events;
}

// ─── early_retire ───────────────────────────────────────────────────────────

function translateEarlyRetire(d: ScenarioDelta): ScenarioEvent[] {
  // Zero out wage income from `retireMonth` onward — equivalent to
  // income.salary_change with newAnnualGross=0 (or `partTimeIncome`).
  const partTimeIncome = num(d.params, "partTimeAnnualGross", 0);
  return [{
    id: `${d.id}/retire`,
    type: "income.salary_change",
    month: d.activationMonth,
    priority: 200,
    sourceDeltaId: d.id,
    payload: { newAnnualGross: partTimeIncome },
  }];
}

// ─── salary_change ──────────────────────────────────────────────────────────

function translateSalaryChange(d: ScenarioDelta): ScenarioEvent[] {
  return [{
    id: `${d.id}/sal`,
    type: "income.salary_change",
    month: d.activationMonth,
    priority: 200,
    sourceDeltaId: d.id,
    payload: { newAnnualGross: num(d.params, "newAnnualGross", 0) },
  }];
}

// ─── career_break ───────────────────────────────────────────────────────────

function translateCareerBreak(d: ScenarioDelta): ScenarioEvent[] {
  return [{
    id: `${d.id}/break`,
    type: "income.career_break",
    month: d.activationMonth,
    priority: 200,
    sourceDeltaId: d.id,
    payload: {
      months: num(d.params, "months", 12),
      incomeReductionPct: num(d.params, "incomeReductionPct", 1.0),
    },
  }];
}

// ─── child_expense ──────────────────────────────────────────────────────────

function translateChildExpense(d: ScenarioDelta): ScenarioEvent[] {
  return [{
    id: `${d.id}/child`,
    type: "expense.child_cost",
    month: d.activationMonth,
    priority: 300,
    sourceDeltaId: d.id,
    payload: {
      monthlyCost: num(d.params, "monthlyCost", 1500),
      months: num(d.params, "months", 216), // 18 years
    },
  }];
}

// ─── market_crash_stress ────────────────────────────────────────────────────

function translateMarketCrashStress(d: ScenarioDelta): ScenarioEvent[] {
  return [{
    id: `${d.id}/crash`,
    type: "macro.regime_shift",
    month: d.activationMonth,
    priority: 100,
    sourceDeltaId: d.id,
    payload: {
      equityShock: num(d.params, "equityShock", -0.35),
      cryptoShock: num(d.params, "cryptoShock", -0.60),
      propertyShock: num(d.params, "propertyShock", -0.15),
    },
  }];
}

// ─── interest_rate_spike ────────────────────────────────────────────────────

function translateInterestRateSpike(d: ScenarioDelta): ScenarioEvent[] {
  return [{
    id: `${d.id}/spike`,
    type: "macro.rate_spike",
    month: d.activationMonth,
    priority: 100,
    sourceDeltaId: d.id,
    payload: { bumpPct: num(d.params, "bumpPct", 2.0) },
  }];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function num(p: Record<string, unknown>, key: string, fallback: number): number {
  const v = p?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function str(p: Record<string, unknown>, key: string, fallback: string): string {
  const v = p?.[key];
  return typeof v === "string" ? v : fallback;
}
