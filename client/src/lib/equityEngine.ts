/**
 * equityEngine.ts
 *
 * Central usable equity engine for FamilyWealthLab.
 *
 * Rules:
 *   - Usable Equity per property = (Value × maxRefinanceLVR) − Loan Balance
 *   - If usable equity < 0, clamp to 0
 *   - Default maxRefinanceLVR = 80%
 *   - Total Deposit Power = Cash + Offset + Total Usable Equity − Emergency Buffer
 *   - Interest = expense. Principal repayment = equity transfer (NOT expense).
 *   - Property purchase can use: cash + offset + usable equity as deposit source
 */

import { safeNum } from './finance';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PropertyEquityResult {
  id: string;
  label: string;
  type: 'ppor' | 'ip';
  currentValue: number;
  loanBalance: number;
  maxRefinanceLVR: number;        // e.g. 0.80
  refinanceableValue: number;     // value × maxRefinanceLVR
  usableEquity: number;           // max(0, refinanceableValue - loanBalance)
  currentLVR: number;             // loanBalance / value
  equityPct: number;              // usableEquity / value
}

export interface DepositPowerResult {
  // Inputs
  cashAndOffset: number;
  totalUsableEquity: number;
  emergencyBuffer: number;
  committedCashEvents: number;    // e.g. upcoming large known spend

  // Funding sources breakdown per property
  pporEquity: PropertyEquityResult | null;
  ipEquityList: PropertyEquityResult[];

  // Totals
  totalDepositPower: number;      // cashAndOffset + totalUsableEquity - emergencyBuffer - committedCashEvents
  totalDepositPowerRaw: number;   // without emergency buffer (for display)

  // Next property readiness
  nextPropertyRequiredCash: number;   // deposit + stampDuty + legals + other
  nextPropertyDeposit: number;
  nextPropertyStampDuty: number;
  nextPropertyBuyingCosts: number;
  readinessPct: number;               // totalDepositPower / nextPropertyRequiredCash × 100
  readySurplusOrShortfall: number;    // totalDepositPower - nextPropertyRequiredCash
  safeBufferAfterPurchase: number;    // cashAndOffset - nextPropertyDeposit - emergencyBuffer
  isReady: boolean;
  estimatedReadyDate: string | null;  // ISO date string when savings + equity will cover shortfall
  monthlySurplus: number;             // used for estimatedReadyDate calc

  // Funding sources breakdown for the next purchase
  fundingSources: FundingSource[];
}

export interface FundingSource {
  label: string;
  amount: number;
  type: 'cash' | 'equity' | 'buffer';
  color: string;
}

export interface EquityTimelinePoint {
  year: number;
  ppor_value: number;
  ppor_loan: number;
  ppor_usable_equity: number;
  ip_values: number;
  ip_loans: number;
  ip_usable_equity: number;
  total_usable_equity: number;
  cash: number;
  deposit_power: number;
}

// ─── Per-property usable equity ───────────────────────────────────────────────

export function calcPropertyEquity(params: {
  id: string;
  label: string;
  type: 'ppor' | 'ip';
  currentValue: number;
  loanBalance: number;
  maxRefinanceLVR?: number;   // default 0.80
}): PropertyEquityResult {
  const { id, label, type, currentValue, loanBalance } = params;
  const maxRefinanceLVR = params.maxRefinanceLVR ?? 0.80;
  const refinanceableValue = currentValue * maxRefinanceLVR;
  const usableEquity = Math.max(0, refinanceableValue - loanBalance);
  const currentLVR = currentValue > 0 ? loanBalance / currentValue : 0;
  const equityPct = currentValue > 0 ? usableEquity / currentValue : 0;
  return {
    id, label, type, currentValue, loanBalance,
    maxRefinanceLVR, refinanceableValue, usableEquity, currentLVR, equityPct,
  };
}

// ─── Full deposit power engine ─────────────────────────────────────────────────

export function calcDepositPower(params: {
  // Cash
  cash: number;
  offset_balance: number;
  // Properties — snapshot PPOR
  ppor_value: number;
  ppor_loan: number;
  // IP properties from /api/properties (investment only)
  ipProperties: Array<{
    id: string;
    label?: string;
    address?: string;
    current_value?: number;
    purchase_price?: number;
    loan_amount?: number;
    max_refinance_lvr?: number;  // per-property override, else 0.80
  }>;
  // Config
  maxRefinanceLVR?: number;       // global default override (0.80)
  emergencyBuffer?: number;       // default 30000
  committedCashEvents?: number;   // e.g. known future large spend (default 0)
  // Monthly surplus for estimated ready date
  monthlySurplus: number;
  // Next property params
  nextPropertyPrice?: number;     // default 900000
  nextPropertyDepositPct?: number; // default 0.20 (20%)
  nextPropertyStampDutyPct?: number; // default 0.04 (4%)
  nextPropertyBuyingCostsPct?: number; // default 0.015 (1.5%)
}): DepositPowerResult {
  const {
    cash,
    offset_balance,
    ppor_value,
    ppor_loan,
    ipProperties,
    monthlySurplus,
  } = params;

  const maxRefinanceLVR     = params.maxRefinanceLVR        ?? 0.80;
  const emergencyBuffer     = params.emergencyBuffer         ?? 30000;
  const committedCashEvents = params.committedCashEvents      ?? 0;
  const nextPropertyPrice   = params.nextPropertyPrice        ?? 900000;
  const depositPct          = params.nextPropertyDepositPct   ?? 0.20;
  const stampPct            = params.nextPropertyStampDutyPct ?? 0.04;
  const buyingPct           = params.nextPropertyBuyingCostsPct ?? 0.015;

  const cashAndOffset = cash + offset_balance;

  // PPOR equity
  const pporEquity = ppor_value > 0 ? calcPropertyEquity({
    id: 'ppor',
    label: 'PPOR',
    type: 'ppor',
    currentValue: ppor_value,
    loanBalance: ppor_loan,
    maxRefinanceLVR,
  }) : null;

  // IP equities
  const ipEquityList: PropertyEquityResult[] = (ipProperties ?? []).map((ip, i) => {
    const value = safeNum(ip.current_value ?? ip.purchase_price);
    const loan  = safeNum(ip.loan_amount);
    const lvr   = ip.max_refinance_lvr != null ? safeNum(ip.max_refinance_lvr) : maxRefinanceLVR;
    return calcPropertyEquity({
      id:    ip.id ?? `ip_${i}`,
      label: ip.label ?? ((ip.address ?? '').split(',')[0] || `IP ${i + 1}`),
      type:  'ip',
      currentValue: value,
      loanBalance:  loan,
      maxRefinanceLVR: lvr,
    });
  });

  // Totals
  const pporUsableEquity  = pporEquity?.usableEquity ?? 0;
  const ipUsableEquity    = ipEquityList.reduce((s, e) => s + e.usableEquity, 0);
  const totalUsableEquity = pporUsableEquity + ipUsableEquity;

  const totalDepositPowerRaw = cashAndOffset + totalUsableEquity;
  const totalDepositPower    = Math.max(0,
    totalDepositPowerRaw - emergencyBuffer - committedCashEvents
  );

  // Next property costs
  const nextPropertyDeposit      = nextPropertyPrice * depositPct;
  const nextPropertyStampDuty    = nextPropertyPrice * stampPct;
  const nextPropertyBuyingCosts  = nextPropertyPrice * buyingPct;
  const nextPropertyRequiredCash = nextPropertyDeposit + nextPropertyStampDuty + nextPropertyBuyingCosts;

  const readinessPct             = nextPropertyRequiredCash > 0
    ? Math.min(200, (totalDepositPower / nextPropertyRequiredCash) * 100)
    : 100;
  const readySurplusOrShortfall  = totalDepositPower - nextPropertyRequiredCash;
  const isReady                  = readySurplusOrShortfall >= 0;
  const safeBufferAfterPurchase  = cashAndOffset - nextPropertyDeposit - emergencyBuffer;

  // Estimated ready date (months from now)
  let estimatedReadyDate: string | null = null;
  if (!isReady && monthlySurplus > 0) {
    const shortfall = Math.abs(readySurplusOrShortfall);
    const monthsToReady = Math.ceil(shortfall / monthlySurplus);
    if (monthsToReady <= 120) {
      const d = new Date();
      d.setMonth(d.getMonth() + monthsToReady);
      estimatedReadyDate = d.toISOString().split('T')[0];
    }
  }

  // Funding sources breakdown for the next purchase
  const fundingSources: FundingSource[] = [];
  let remaining = nextPropertyRequiredCash;

  // First: use cash/offset (up to remaining required, after keeping emergency buffer)
  const availableCash = Math.max(0, cashAndOffset - emergencyBuffer);
  const cashContrib = Math.min(availableCash, remaining);
  if (cashContrib > 0) {
    fundingSources.push({ label: 'Cash / Offset', amount: cashContrib, type: 'cash', color: 'hsl(210,80%,65%)' });
    remaining -= cashContrib;
  }

  // Then: PPOR equity
  if (remaining > 0 && pporUsableEquity > 0) {
    const pporContrib = Math.min(pporUsableEquity, remaining);
    fundingSources.push({ label: 'PPOR Equity Release', amount: pporContrib, type: 'equity', color: 'hsl(188,65%,52%)' });
    remaining -= pporContrib;
  }

  // Then: IP equities in order
  for (const ip of ipEquityList) {
    if (remaining <= 0) break;
    if (ip.usableEquity > 0) {
      const contrib = Math.min(ip.usableEquity, remaining);
      fundingSources.push({ label: `${ip.label} Equity`, amount: contrib, type: 'equity', color: 'hsl(43,85%,55%)' });
      remaining -= contrib;
    }
  }

  // Show shortfall if still not covered
  if (remaining > 0) {
    fundingSources.push({ label: 'Shortfall (additional savings needed)', amount: remaining, type: 'buffer', color: 'hsl(0,65%,52%)' });
  }

  return {
    cashAndOffset,
    totalUsableEquity,
    emergencyBuffer,
    committedCashEvents,
    pporEquity,
    ipEquityList,
    totalDepositPower,
    totalDepositPowerRaw,
    nextPropertyRequiredCash,
    nextPropertyDeposit,
    nextPropertyStampDuty,
    nextPropertyBuyingCosts,
    readinessPct,
    readySurplusOrShortfall,
    safeBufferAfterPurchase,
    isReady,
    estimatedReadyDate,
    monthlySurplus,
    fundingSources,
  };
}

// ─── Equity timeline projection (10 years) ────────────────────────────────────

export function projectEquityTimeline(params: {
  cash: number;
  offset_balance: number;
  ppor_value: number;
  ppor_loan: number;
  ppor_growth_rate: number;           // annual e.g. 0.06
  ppor_mortgage_rate: number;         // annual e.g. 0.065
  ppor_term_years: number;            // remaining term
  ipProperties: Array<{
    current_value: number;
    loan_amount: number;
    growth_rate?: number;
    mortgage_rate?: number;
  }>;
  monthly_surplus: number;
  maxRefinanceLVR: number;
  emergencyBuffer: number;
  years?: number;
}): EquityTimelinePoint[] {
  const {
    ppor_growth_rate,
    ppor_mortgage_rate,
    ppor_term_years,
    monthly_surplus,
    maxRefinanceLVR,
    emergencyBuffer,
    years = 10,
  } = params;

  const result: EquityTimelinePoint[] = [];
  const now = new Date().getFullYear();

  let ppor_val   = params.ppor_value;
  let ppor_loan  = params.ppor_loan;
  let cash       = params.cash + params.offset_balance;

  // Amortise PPOR loan each year
  const r_ppor = ppor_mortgage_rate / 12;
  const n_ppor = ppor_term_years * 12;
  const mp_ppor = r_ppor > 0 && n_ppor > 0
    ? ppor_loan * (r_ppor * Math.pow(1 + r_ppor, n_ppor)) / (Math.pow(1 + r_ppor, n_ppor) - 1)
    : ppor_loan / Math.max(1, n_ppor);

  // IP snapshots
  const ips = (params.ipProperties ?? []).map(ip => ({
    value: safeNum(ip.current_value),
    loan: safeNum(ip.loan_amount),
    growth: safeNum(ip.growth_rate ?? ppor_growth_rate),
    rate: safeNum(ip.mortgage_rate ?? ppor_mortgage_rate),
  }));

  for (let y = 0; y < years; y++) {
    // Grow property values
    ppor_val = ppor_val * (1 + ppor_growth_rate);

    // Reduce PPOR loan (12 months P&I)
    for (let m = 0; m < 12; m++) {
      const int = ppor_loan * r_ppor;
      const prin = Math.max(0, mp_ppor - int);
      ppor_loan = Math.max(0, ppor_loan - prin);
    }

    // Grow IPs, amortise IP loans
    const grownIPs = ips.map(ip => {
      const val = ip.value * Math.pow(1 + ip.growth, y + 1);
      const r  = ip.rate / 12;
      const n  = 30 * 12;
      const mp = r > 0 ? ip.loan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : ip.loan / n;
      let loan = ip.loan;
      for (let m = 0; m < 12 * (y + 1); m++) {
        const int = loan * r;
        const prin = Math.max(0, mp - int);
        loan = Math.max(0, loan - prin);
      }
      return { val, loan };
    });

    // Accumulate surplus to cash
    cash += monthly_surplus * 12;

    const ppor_eq  = Math.max(0, ppor_val * maxRefinanceLVR - ppor_loan);
    const ip_vals  = grownIPs.reduce((s, ip) => s + ip.val, 0);
    const ip_loans = grownIPs.reduce((s, ip) => s + ip.loan, 0);
    const ip_eq    = grownIPs.reduce((s, ip) => s + Math.max(0, ip.val * maxRefinanceLVR - ip.loan), 0);
    const total_eq = ppor_eq + ip_eq;
    const dep_power = Math.max(0, cash + total_eq - emergencyBuffer);

    result.push({
      year: now + y + 1,
      ppor_value: Math.round(ppor_val),
      ppor_loan: Math.round(ppor_loan),
      ppor_usable_equity: Math.round(ppor_eq),
      ip_values: Math.round(ip_vals),
      ip_loans: Math.round(ip_loans),
      ip_usable_equity: Math.round(ip_eq),
      total_usable_equity: Math.round(total_eq),
      cash: Math.round(cash),
      deposit_power: Math.round(dep_power),
    });
  }

  return result;
}
