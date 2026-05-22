/**
 * fundingSourceTraces.ts — Calculation traces for the per-property funding
 * source, equity-release impact, cash impact, emergency-buffer test, and
 * negative-gearing application under the active tax regime.
 *
 * #FWL_Critical_StatePersistence_FundingSource_TaxRegime_Fix
 *
 * Traces are emitted at the Property page boundary so engines stay free of
 * audit imports. Each trace explains where a number came from and which
 * funding choice / tax regime drove it.
 */

import type { CalculationTrace } from "../calculationTrace";
import type { FundingPlan } from "../../propertyFundingStore";
import { FUNDING_SOURCE_LABEL } from "../../propertyFundingStore";

// ─── Trace ids (canonical) ────────────────────────────────────────────────────

export const FUNDING_SOURCE_TRACE_IDS = [
  "property:funding-source:used",
  "property:funding-source:cash-impact",
  "property:funding-source:equity-release",
  "property:funding-source:emergency-buffer",
  "property:funding-source:negative-gearing",
] as const;

const fmt$ = (n: number) =>
  n < 0
    ? `-$${Math.abs(Math.round(n)).toLocaleString()}`
    : `$${Math.round(n).toLocaleString()}`;

const fmtMonths = (n: number) => `${n.toFixed(1)} mo`;

const ts = () => new Date().toISOString();

// ─── Args ─────────────────────────────────────────────────────────────────────

export interface FundingTraceArgs {
  /** Per-property resolved funding plans (after `resolveFundingPlan`). */
  plans: Array<{
    propertyId: string | number;
    propertyName: string;
    plan: FundingPlan;
  }>;
  /** Total cash + offset at the start of the projection. */
  openingCash: number;
  /** Net cashflow over the projection horizon (for cash-impact trace). */
  netCashflowOverHorizon: number;
  /** Cash remaining after all funding sources applied + net cashflow. */
  closingCashAfterFunding: number;
  /** Monthly household expenses (denominator for buffer-months). */
  monthlyExpenses: number;
  /** Existing investment-loan balance, before any equity release. */
  existingLoanBalance: number;
  /** Tax regime context. */
  activeRegimeKind: string;
  activeRegimeLabel: string;
  /** Per-property negative-gearing details under the active regime. */
  negativeGearing: Array<{
    propertyName: string;
    currentLawRefund: number;
    reformRefund: number;
    lossQuarantined: number;
    carriedForwardLoss: number;
    refundAppliedToCashflow: number;
    appliedRefundScenario: "current_law" | "proposed_reform";
  }>;
}

// ─── Traces ───────────────────────────────────────────────────────────────────

/** 1. Funding Source Used — show user choice + dollar breakdown. */
export function buildFundingSourceUsedTrace(a: FundingTraceArgs): CalculationTrace {
  const totalCash   = a.plans.reduce((s, p) => s + p.plan.cashUsed,       0);
  const totalOffset = a.plans.reduce((s, p) => s + p.plan.offsetUsed,     0);
  const totalEquity = a.plans.reduce((s, p) => s + p.plan.equityReleased, 0);
  const totalStocks = a.plans.reduce((s, p) => s + p.plan.stocksSold,     0);
  const totalCrypto = a.plans.reduce((s, p) => s + p.plan.cryptoSold,     0);
  const totalDeposit = a.plans.reduce((s, p) => s + p.plan.deposit,       0);
  const cashLike = totalCash + totalOffset;
  const assetSales = totalStocks + totalCrypto;

  return {
    id: "property:funding-source:used",
    label: "Funding Source Used",
    finalValue: `${fmt$(cashLike)} cash + ${fmt$(totalEquity)} equity + ${fmt$(assetSales)} sales`,
    plainEnglish:
      "How each investment property's deposit is being funded. Cash + Offset draws down liquid balances, Equity Release adds to debt without touching cash, and Asset Sales realise stocks/crypto. This is the user's persisted choice — not a silent default.",
    formula:
      "Cash Used + Equity Released + Asset Sales = Total Deposit Required",
    expanded:
      `${fmt$(cashLike)} + ${fmt$(totalEquity)} + ${fmt$(assetSales)} = ${fmt$(totalDeposit)}`,
    inputs: a.plans.map(p => ({
      label: `${p.propertyName} — ${FUNDING_SOURCE_LABEL[p.plan.source]}`,
      value: `deposit ${fmt$(p.plan.deposit)} · cash ${fmt$(p.plan.cashUsed + p.plan.offsetUsed)} · equity ${fmt$(p.plan.equityReleased)} · sales ${fmt$(p.plan.stocksSold + p.plan.cryptoSold)}`,
      source: "propertyFundingStore (localStorage: fwl.propertyFunding)",
    })),
    assumptions: [
      { label: "Funding choice persisted per property in localStorage", source: "fwl.propertyFunding" },
      { label: "Equity Release does NOT draw cash — increases debt instead", source: "resolveFundingPlan()" },
    ],
    dataSource: "Per-property funding choice + property.deposit",
    sourceEngine: "propertyFundingStore.resolveFundingPlan",
    included: [
      { label: "Cash + Offset drawdown", value: fmt$(cashLike) },
      { label: "Equity Release (loan top-up)", value: fmt$(totalEquity) },
      { label: "Stocks/Crypto liquidations", value: fmt$(assetSales) },
    ],
    excluded: [
      { label: "Stamp duty / acquisition costs", reason: "Tracked separately on the settlement event" },
    ],
    calculatedAt: ts(),
  };
}

/** 2. Cash Impact — Closing = Opening − Cash Used + Net Cashflow. */
export function buildCashImpactTrace(a: FundingTraceArgs): CalculationTrace {
  const cashLike = a.plans.reduce((s, p) => s + p.plan.cashUsed + p.plan.offsetUsed, 0);
  return {
    id: "property:funding-source:cash-impact",
    label: "Cash Impact (after funding)",
    finalValue: fmt$(a.closingCashAfterFunding),
    plainEnglish:
      "Closing cash position after subtracting cash used for property deposits and adding net cashflow. Only funding sources that actually draw cash hit this number — Equity Release does not.",
    formula: "Closing Cash = Opening Cash − Cash Used + Net Cashflow",
    expanded:
      `${fmt$(a.openingCash)} − ${fmt$(cashLike)} + ${fmt$(a.netCashflowOverHorizon)} = ${fmt$(a.closingCashAfterFunding)}`,
    inputs: [
      { label: "Opening Cash (cash + offset)", value: fmt$(a.openingCash), source: "snapshot.cash + snapshot.offset_balance" },
      { label: "Cash Used for deposits",        value: fmt$(cashLike),       source: "Σ FundingPlan.cashUsed + offsetUsed" },
      { label: "Net Cashflow over horizon",     value: fmt$(a.netCashflowOverHorizon), source: "cashEngine.ledger" },
    ],
    assumptions: [
      { label: "Equity Release deposits are NOT included in Cash Used", source: "resolveFundingPlan()" },
    ],
    dataSource: "cashEngine + propertyFundingStore",
    sourceEngine: "Property page cash-impact aggregator",
    included: [
      { label: "Opening cash + offset" },
      { label: "Operating cashflow (rent − interest − costs − taxes)" },
    ],
    excluded: [
      { label: "Equity-release deposits", reason: "Funded by new debt, not cash" },
    ],
    calculatedAt: ts(),
  };
}

/** 3. Equity Release Impact — new loan balance after equity release. */
export function buildEquityReleaseTrace(a: FundingTraceArgs): CalculationTrace {
  const equity = a.plans.reduce((s, p) => s + p.plan.debtIncreaseFromEquityRelease, 0);
  const newBalance = a.existingLoanBalance + equity;
  return {
    id: "property:funding-source:equity-release",
    label: "Equity Release Impact",
    finalValue: fmt$(newBalance),
    plainEnglish:
      "When an investment property selects Equity Release as its funding source, the deposit is raised via a new loan top-up against existing equity. The deposit does not deduct cash — but the loan balance increases by the deposit amount.",
    formula: "New Loan Balance = Existing Loan Balance + Equity Released",
    expanded: `${fmt$(a.existingLoanBalance)} + ${fmt$(equity)} = ${fmt$(newBalance)}`,
    inputs: [
      { label: "Existing investment-loan balance", value: fmt$(a.existingLoanBalance), source: "Σ property.loan_amount (amortised)" },
      { label: "Total equity released",            value: fmt$(equity),                 source: "Σ FundingPlan.equityReleased" },
    ],
    assumptions: [
      { label: "Equity release rate matches the property's nominated loan rate", source: "property.interest_rate" },
      { label: "Top-up secured against existing portfolio equity (no LMI modelled)" },
    ],
    dataSource: "propertyFundingStore.resolveFundingPlan + property loans",
    sourceEngine: "Property page equity-release adapter",
    included: [
      { label: "Equity-release top-ups added at settlement month" },
    ],
    excluded: [
      { label: "Cash-deposit funding sources", reason: "They reduce cash, not debt" },
    ],
    calculatedAt: ts(),
  };
}

/** 4. Emergency Buffer Test — months of buffer remaining post-funding. */
export function buildEmergencyBufferTrace(a: FundingTraceArgs): CalculationTrace {
  const months = a.monthlyExpenses > 0
    ? a.closingCashAfterFunding / a.monthlyExpenses
    : 0;
  const verdict = months >= 6 ? "healthy" : months >= 3 ? "at risk" : "breached";
  return {
    id: "property:funding-source:emergency-buffer",
    label: "Emergency Buffer (months)",
    finalValue: fmtMonths(months),
    plainEnglish:
      "Months of household expenses still covered by liquid cash after the chosen funding sources are applied. ≥6 months healthy, 3–6 at risk, <3 breached.",
    formula: "Months of Buffer = Cash Remaining ÷ Monthly Expenses",
    expanded:
      `${fmt$(a.closingCashAfterFunding)} ÷ ${fmt$(a.monthlyExpenses)} = ${fmtMonths(months)} (${verdict})`,
    inputs: [
      { label: "Cash remaining (after funding)", value: fmt$(a.closingCashAfterFunding), source: "Cash Impact trace" },
      { label: "Monthly household expenses",     value: fmt$(a.monthlyExpenses),         source: "snapshot.monthly_expenses" },
    ],
    assumptions: [
      { label: "Cash remaining uses the post-funding figure, NOT pre-funding cash", source: "resolveFundingPlan()" },
      { label: "Equity-release IPs do NOT reduce the buffer", source: "FundingPlan.equityReleased excluded" },
    ],
    dataSource: "Cash Impact trace + snapshot.monthly_expenses",
    sourceEngine: "Property page emergency-buffer adapter",
    included: [{ label: "Monthly cash drawn from non-debt sources" }],
    excluded: [{ label: "Equity-release dollars", reason: "Do not consume cash" }],
    calculatedAt: ts(),
  };
}

/** 5. Negative Gearing Applied — current law vs reform under active regime. */
export function buildNegativeGearingTrace(a: FundingTraceArgs): CalculationTrace {
  const totalCurrent  = a.negativeGearing.reduce((s, n) => s + n.currentLawRefund, 0);
  const totalReform   = a.negativeGearing.reduce((s, n) => s + n.reformRefund,    0);
  const totalQuarant  = a.negativeGearing.reduce((s, n) => s + n.lossQuarantined, 0);
  const totalCarry    = a.negativeGearing.reduce((s, n) => s + n.carriedForwardLoss, 0);
  const totalApplied  = a.negativeGearing.reduce((s, n) => s + n.refundAppliedToCashflow, 0);

  return {
    id: "property:funding-source:negative-gearing",
    label: "Negative Gearing Applied",
    finalValue: `${fmt$(totalApplied)} applied`,
    plainEnglish:
      "Under the active tax regime, negative-gearing losses on established properties purchased after the reform cutoff are quarantined — the current-law refund is shown only for comparison; the cashflow uses the reform refund (typically $0). Carried-forward losses accrue against future capital gains.",
    formula:
      "Applied Refund = (active regime = reform & post-cutoff established IP) ? $0 : current-law refund",
    expanded:
      `Active regime: ${a.activeRegimeLabel} · Current-law refund: ${fmt$(totalCurrent)} · Reform refund: ${fmt$(totalReform)} · Applied: ${fmt$(totalApplied)} · Loss quarantined this year: ${fmt$(totalQuarant)} · Carried-forward bank: ${fmt$(totalCarry)}`,
    inputs: a.negativeGearing.map(n => ({
      label: `${n.propertyName} — ${n.appliedRefundScenario}`,
      value: `applied ${fmt$(n.refundAppliedToCashflow)} · current-law ${fmt$(n.currentLawRefund)} · reform ${fmt$(n.reformRefund)} · loss bank +${fmt$(n.lossQuarantined)}`,
      source: "taxRulesEngine.applyNegativeGearing",
    })),
    assumptions: [
      { label: "Active regime kind", value: a.activeRegimeKind, source: "activeRegimeStore" },
      { label: "Cutoff: 1 July 2027 for proposed reform (established dwelling)", source: "taxPolicyEngine" },
      { label: "Current-law refund is SHOWN but NOT applied under reform", source: "taxRulesEngine" },
    ],
    dataSource: "taxRulesEngine.applyNegativeGearing + activeRegimeStore",
    sourceEngine: "client/src/lib/tax/taxRulesEngine.ts",
    included: [
      { label: "Per-property refund (applied)", value: fmt$(totalApplied) },
      { label: "Per-property loss bank addition", value: fmt$(totalQuarant) },
    ],
    excluded: [
      { label: "Current-law refund (under reform regime)", reason: "Comparison only; not injected into cashflow" },
    ],
    calculatedAt: ts(),
  };
}

export function buildAllFundingTraces(a: FundingTraceArgs): CalculationTrace[] {
  return [
    buildFundingSourceUsedTrace(a),
    buildCashImpactTrace(a),
    buildEquityReleaseTrace(a),
    buildEmergencyBufferTrace(a),
    buildNegativeGearingTrace(a),
  ];
}
