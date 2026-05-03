/**
 * bestMoveEngine.ts — "Best Move Right Now" Decision Engine V2
 *
 * V2 changes vs V1:
 *  - NEW: getBestMoveRecommendation(ledger) — pure synchronous function, no Supabase
 *    call. Takes a fully-formed BestMoveLedger and returns BestMoveResult.
 *    Used by both BestMoveCard (via computeBestMoveV2) and the dashboard inline card.
 *
 *  - FIX: idleCash root bug — V1 did `liquidCash = cash + offsetBal`, treating money
 *    already in the offset as "idle" and recommending to move it again.
 *    V2 uses `cashOutsideOffset = cash` (everyday account only) as the starting point.
 *
 *  - FIX: freeCashForOffset formula now deducts:
 *      emergencyBuffer + upcomingBills12mo + plannedInvestments
 *      + propertyDepositReserve + taxReserve + forecastShortfallReserve
 *    If result ≤ 0: offset recommendation is suppressed entirely.
 *
 *  - NEW: calcBreakdown field on BestMoveOption — step-by-step calculation shown in UI.
 *  - NEW: ledgerInputs field on BestMoveResult — all inputs used, for Ledger Audit panel.
 *  - NEW: computeBestMoveV2(cfg) — async fetcher (replaces computeBestMove), calls
 *    getBestMoveRecommendation after fetching all Supabase data.
 *
 *  - KEEP: computeBestMove(cfg) re-exported as alias of computeBestMoveV2 for
 *    backward-compatibility with BestMoveCard.
 *
 * Priority order (spec):
 *  1. Liquidity shortfall (cash < emergency buffer)
 *  2. Free cash to offset (if freeCashForOffset > 0 and mortgage exists)
 *  3. Property deposit ready (≥ 50% readiness)
 *  4. High-interest debt paydown
 *  5. Surplus DCA / ETF invest
 *  6. No urgent move (keep cash / HISA)
 */

import { safeNum } from './finance';
import { computeDepositPower } from './depositPower';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RiskLevel = 'Low' | 'Med' | 'High';

export interface CalcBreakdownStep {
  label: string;
  value: number;
  sign: '+' | '-' | '=';
}

export interface BestMoveOption {
  id:               string;
  action:           string;
  reason:           string;
  annual_benefit:   number;
  benefit_label:    string;
  risk:             RiskLevel;
  cta:              string;
  cta_route:        string;
  rank:             number;
  data_reliable:    boolean;
  /** Step-by-step calculation breakdown for UI display */
  calcBreakdown?:   CalcBreakdownStep[];
}

export interface LedgerInputs {
  cashOutsideOffset:        number;
  offsetBalance:            number;
  mortgage:                 number;
  otherDebts:               number;
  emergencyBuffer:          number;
  upcomingBills12mo:        number;
  plannedInvestmentsTotal:  number;
  propertyDepositReserve:   number;
  taxReserve:               number;
  forecastShortfallReserve: number;
  freeCashForOffset:        number;
  monthlyIncome:            number;
  monthlyExpenses:          number;
  surplus:                  number;
  depositPower:             number;
  depositReadinessPct:      number;
}

export interface BestMoveResult {
  best:         BestMoveOption;
  alternatives: BestMoveOption[];
  generated_at: string;
  summary:      string;
  /** All ledger inputs used — for the Recommendation Inputs audit panel */
  ledgerInputs: LedgerInputs;
}

// ─── BestMoveLedger — the full data snapshot passed to getBestMoveRecommendation ──

export interface BestMoveLedger {
  // Core snapshot
  cash:                number;   // everyday account only (NOT including offset)
  offsetBalance:       number;   // mortgage offset balance
  mortgage:            number;   // outstanding PPOR mortgage
  otherDebts:          number;   // personal/consumer debt
  monthlyIncome:       number;
  monthlyExpenses:     number;
  ppor:                number;   // PPOR current value
  // Planned investments (active orders / planned transactions)
  plannedStockTotal:   number;   // sum of non-cancelled stock orders
  plannedCryptoTotal:  number;   // sum of non-cancelled crypto orders
  // Bills
  billsRaw:            any[];    // active recurring bills array from sf_recurring_bills
  // Properties (for deposit power calc)
  properties:          any[];    // from sf_properties / /api/properties
  // Forecast / assumptions
  emergencyBuffer:     number;   // configurable buffer amount (default $30k)
  maxRefinanceLVR:     number;   // e.g. 0.80
  mortgageRate:        number;   // e.g. 0.065
  etfExpectedReturn:   number;   // e.g. 0.095
  cryptoExpectedReturn:number;   // e.g. 0.20
  // Cashflow engine outputs
  lowestFutureCash:    number;   // lowest projected cash across 12-month horizon
  negativeCashMonths:  string[]; // months where cash < 0
  // Portfolio (for super / ETF context)
  rohamGrossAnnual:    number;   // gross annual salary income
  superContribAnnual:  number;   // employer SG + salary sacrifice already going in
  stocksValue:         number;
  cryptoValue:         number;
  // Property deposit power (pre-computed by equityEngine.calcDepositPower)
  depositPowerResult:  {
    totalDepositPower:    number;
    readinessPct:         number;
    isReady:              boolean;
    totalUsableEquity:    number;
    deployableCash:       number;
    fundingSources:       any[];
  } | null;
}

// ─── BestMoveConfig — for the async computeBestMoveV2 fetcher ────────────────

export interface BestMoveConfig {
  mortgageRate?:         number;
  etfExpectedReturn?:    number;
  cryptoExpectedReturn?: number;
  personalDebtRate?:     number;
  sgRate?:               number;
  monthsBufferTarget?:   number;
  maxLvr?:               number;
  ipTargetPrice?:        number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPER_CONCESSIONAL_CAP = 30_000;
const PERSONAL_DEBT_RATE     = 0.17;

// ─── Supabase fetch helper ────────────────────────────────────────────────────

const SB_URL  = 'https://uoraduyyxhtzixcsaidg.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c';
const SB_HDR  = {
  apikey:         SB_ANON,
  Authorization:  `Bearer ${SB_ANON}`,
  'Content-Type': 'application/json',
};
const sb = (path: string) =>
  fetch(`${SB_URL}/rest/v1/${path}`, { headers: SB_HDR })
    .then(r => r.ok ? r.json() : [])
    .catch(() => []);

// ─── Income dedup ─────────────────────────────────────────────────────────────

function deduplicatedMonthlyIncome(incomeRows: any[]): number {
  if (!Array.isArray(incomeRows) || incomeRows.length === 0) return 0;
  const FREQ: Record<string, number> = {
    Weekly: 52 / 12, Fortnightly: 26 / 12, Monthly: 1,
    Quarterly: 1 / 3, 'Semi-Annual': 1 / 6, Annual: 1 / 12,
  };
  const sorted = [...incomeRows].sort((a, b) =>
    new Date(b.date ?? b.created_at ?? 0).getTime() -
    new Date(a.date ?? a.created_at ?? 0).getTime()
  );
  const seen = new Set<string>();
  let total = 0;
  sorted.forEach(r => {
    if (r.recurring === false) return;
    const key = `${(r.description ?? '').trim().toLowerCase()}|${(r.member ?? '').trim().toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    total += safeNum(r.amount) * (FREQ[r.frequency] ?? 1);
  });
  return total;
}

// ─── fmt helper ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

// ─── Bill helper — sum 12-month cost ─────────────────────────────────────────

function billsAnnual(billsRaw: any[]): number {
  if (!Array.isArray(billsRaw)) return 0;
  const FREQ: Record<string, number> = {
    Weekly: 52, Fortnightly: 26, Monthly: 12,
    Quarterly: 4, 'Semi-Annual': 2, Annual: 1,
  };
  return billsRaw
    .filter((b: any) => b.active !== false)
    .reduce((s: number, b: any) => s + safeNum(b.amount) * (FREQ[b.frequency] ?? 12), 0);
}

// ─── Marginal tax rate (AUS 2025-26) ─────────────────────────────────────────

function marginalTaxRate(grossAnnual: number): number {
  if (grossAnnual > 135_000) return 0.47;
  if (grossAnnual >  45_000) return 0.325;
  if (grossAnnual >  18_200) return 0.19;
  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// getBestMoveRecommendation — THE core pure function
// Called from both BestMoveCard (via computeBestMoveV2) and dashboard inline card.
// ═══════════════════════════════════════════════════════════════════════════════

export function getBestMoveRecommendation(ledger: BestMoveLedger): BestMoveResult {
  const {
    cash,
    offsetBalance,
    mortgage,
    otherDebts,
    monthlyIncome,
    monthlyExpenses,
    ppor,
    plannedStockTotal,
    plannedCryptoTotal,
    billsRaw,
    properties,
    emergencyBuffer,
    maxRefinanceLVR,
    mortgageRate,
    etfExpectedReturn,
    cryptoExpectedReturn,
    lowestFutureCash,
    negativeCashMonths,
    rohamGrossAnnual,
    superContribAnnual,
    stocksValue,
    cryptoValue,
    depositPowerResult,
  } = ledger;

  const cashOutsideOffset = cash;  // ONLY everyday account — NOT offset
  const surplus            = monthlyIncome - monthlyExpenses;
  const annualSurplus      = surplus * 12;

  // ── 1. Free cash calculation ─────────────────────────────────────────────

  // Bills over next 12 months
  const upcomingBills12mo = billsAnnual(billsRaw);

  // Planned investments (deduct from free cash)
  const plannedInvestmentsTotal = plannedStockTotal + plannedCryptoTotal;

  // Property deposit reserve: if deposit readiness < 100%, reserve remaining gap
  // (only if they have a next purchase target)
  const depositPower    = depositPowerResult?.totalDepositPower ?? 0;
  const depositReadyPct = depositPowerResult?.readinessPct ?? 0;
  // Only reserve if they're actively building toward a property (>0% but <100%)
  const propertyDepositReserve =
    depositReadyPct > 5 && depositReadyPct < 100
      ? Math.max(0, depositPower * (1 - depositReadyPct / 100))
      : 0;

  // Tax reserve: ~30% of surplus for high earners, 20% for mid-range
  const margRate = marginalTaxRate(rohamGrossAnnual);
  const taxReservePct = margRate >= 0.47 ? 0.30 : margRate >= 0.325 ? 0.20 : 0.10;
  const taxReserve = Math.max(0, annualSurplus * taxReservePct);

  // Forecast shortfall reserve: if negative cash months exist, reserve 3-month buffer
  const forecastShortfallReserve =
    negativeCashMonths.length > 0
      ? Math.max(0, monthlyExpenses * 3)
      : lowestFutureCash < 0
        ? Math.abs(lowestFutureCash)
        : 0;

  // Free cash for offset
  const freeCashForOffset = Math.max(
    0,
    cashOutsideOffset
      - emergencyBuffer
      - upcomingBills12mo
      - plannedInvestmentsTotal
      - propertyDepositReserve
      - taxReserve
      - forecastShortfallReserve
  );

  // Buffer check uses cashOutsideOffset + offsetBalance (total liquid) vs emergency buffer
  const totalLiquid = cashOutsideOffset + offsetBalance;
  const belowBuffer = totalLiquid < emergencyBuffer;

  // ── 2. Candidates ────────────────────────────────────────────────────────

  const candidates: Array<Omit<BestMoveOption, 'rank'>> = [];

  // ── PRIORITY 1: Liquidity shortfall ──────────────────────────────────────
  if (belowBuffer && monthlyIncome > 0) {
    const shortfall = emergencyBuffer - totalLiquid;
    const buildPerMonth = Math.min(surplus, shortfall / 3);
    candidates.push({
      id:              'build_buffer',
      action:          `Build emergency buffer — ${fmt(shortfall)} short`,
      reason:
        `Your total liquid cash (${fmt(totalLiquid)} cash + offset) is below your emergency buffer target of ${fmt(emergencyBuffer)}. ` +
        `You are short ${fmt(shortfall)}. Without this buffer, any income disruption forces high-cost borrowing at ~17%. ` +
        `Direct ${fmt(buildPerMonth)}/month of surplus to your savings until the buffer is met.`,
      annual_benefit:  shortfall * PERSONAL_DEBT_RATE,
      benefit_label:   `Avoids up to ${fmt(shortfall * PERSONAL_DEBT_RATE)}/yr emergency borrowing cost`,
      risk:            'Low',
      cta:             'Go to Settings',
      cta_route:       '/settings',
      data_reliable:   monthlyIncome > 0 && monthlyExpenses > 0,
      calcBreakdown: [
        { label: 'Cash (everyday account)',  value: cashOutsideOffset, sign: '+' },
        { label: 'Offset balance',           value: offsetBalance,     sign: '+' },
        { label: 'Total liquid',             value: totalLiquid,       sign: '=' },
        { label: 'Emergency buffer target',  value: emergencyBuffer,   sign: '-' },
        { label: 'Shortfall',               value: -shortfall,        sign: '=' },
      ],
    });
  }

  // ── PRIORITY 2: Free cash to offset ──────────────────────────────────────
  if (freeCashForOffset > 5_000 && mortgage > 0) {
    const moveable   = Math.round(freeCashForOffset / 1_000) * 1_000; // round to nearest $1k
    const saving     = moveable * mortgageRate;
    candidates.push({
      id:              'move_to_offset',
      action:          `Move ${fmt(moveable)} idle cash to mortgage offset`,
      reason:
        `After reserving your emergency buffer, upcoming bills (${fmt(upcomingBills12mo)}/yr), ` +
        `planned investments (${fmt(plannedInvestmentsTotal)}), ` +
        `tax reserve (${fmt(taxReserve)}) and forecast shortfall reserve (${fmt(forecastShortfallReserve)}), ` +
        `you have ${fmt(moveable)} of genuinely idle cash that could move to your offset account. ` +
        `This saves ${fmt(saving)}/year in mortgage interest at ${(mortgageRate * 100).toFixed(2)}% — ` +
        `a guaranteed, tax-free return that beats after-tax savings rates.`,
      annual_benefit:  saving,
      benefit_label:   `${fmt(saving)}/yr guaranteed (offset interest saving)`,
      risk:            'Low',
      cta:             'Update Offset Balance',
      cta_route:       '/settings',
      data_reliable:   offsetBalance > 0 && mortgage > 0,
      calcBreakdown: [
        { label: 'Cash outside offset',           value: cashOutsideOffset,         sign: '+' },
        { label: '– Emergency buffer',            value: -emergencyBuffer,          sign: '-' },
        { label: '– Upcoming bills (12mo)',        value: -upcomingBills12mo,        sign: '-' },
        { label: '– Planned investments',          value: -plannedInvestmentsTotal,  sign: '-' },
        { label: '– Property deposit reserve',    value: -propertyDepositReserve,   sign: '-' },
        { label: '– Tax reserve',                 value: -taxReserve,               sign: '-' },
        { label: '– Forecast shortfall reserve',  value: -forecastShortfallReserve, sign: '-' },
        { label: 'Free cash for offset',          value: freeCashForOffset,         sign: '=' },
      ],
    });
  } else if (freeCashForOffset <= 0 && mortgage > 0) {
    // Explicitly show "no idle cash" — do not recommend offset move
    candidates.push({
      id:              'no_idle_cash',
      action:          `No additional idle cash to move to offset`,
      reason:
        `After reserving your emergency buffer (${fmt(emergencyBuffer)}), ` +
        `upcoming bills (${fmt(upcomingBills12mo)}/yr), ` +
        `planned investments (${fmt(plannedInvestmentsTotal)}), ` +
        `tax reserve (${fmt(taxReserve)}) and forecast shortfall reserve (${fmt(forecastShortfallReserve)}), ` +
        `your everyday cash is fully committed. ` +
        `Keep building surplus and revisit when cash rises above these committed buckets.`,
      annual_benefit:  0.01, // tiny so it can appear but won't rank over real options
      benefit_label:   'All cash committed — no idle funds',
      risk:            'Low',
      cta:             'View Cashflow',
      cta_route:       '/dashboard',
      data_reliable:   true,
      calcBreakdown: [
        { label: 'Cash outside offset',          value: cashOutsideOffset,         sign: '+' },
        { label: '– Emergency buffer',           value: -emergencyBuffer,          sign: '-' },
        { label: '– Upcoming bills (12mo)',       value: -upcomingBills12mo,        sign: '-' },
        { label: '– Planned investments',         value: -plannedInvestmentsTotal,  sign: '-' },
        { label: '– Property deposit reserve',   value: -propertyDepositReserve,   sign: '-' },
        { label: '– Tax reserve',                value: -taxReserve,               sign: '-' },
        { label: '– Forecast shortfall reserve', value: -forecastShortfallReserve, sign: '-' },
        { label: 'Free cash for offset',         value: freeCashForOffset,         sign: '=' },
      ],
    });
  } else if (freeCashForOffset > 5_000 && mortgage <= 0 && offsetBalance <= 0) {
    // Has idle cash but no mortgage — prompt setup or HISA
    const hisaReturn = freeCashForOffset * 0.05;
    candidates.push({
      id:              'setup_hisa',
      action:          `Park ${fmt(freeCashForOffset)} in a high-interest savings account`,
      reason:
        `You have ${fmt(freeCashForOffset)} in idle cash (after reserving all committed buckets). ` +
        `Without a mortgage offset, parking this in a HISA at ~5% earns ${fmt(hisaReturn)}/year ` +
        `with full liquidity — better than an idle transaction account.`,
      annual_benefit:  hisaReturn,
      benefit_label:   `${fmt(hisaReturn)}/yr at ~5% HISA rate`,
      risk:            'Low',
      cta:             'View Settings',
      cta_route:       '/settings',
      data_reliable:   true,
    });
  }

  // ── PRIORITY 3: Property deposit ready ───────────────────────────────────
  if ((depositReadyPct ?? 0) >= 50 && depositPower > 0) {
    const ipTarget        = (() => {
      const nextIP = (properties as any[]).find((p: any) =>
        p.type !== 'ppor' && (!p.settlement_date || p.settlement_date > new Date().toISOString().split('T')[0])
      );
      return safeNum(nextIP?.purchase_price) || 900_000;
    })();
    const equityShare     = depositPowerResult?.totalUsableEquity ?? 0;
    const deployableCash  = depositPowerResult?.deployableCash ?? 0;
    const propertyBenefit = ipTarget * 0.06;
    const equityNote      = equityShare > 0
      ? `Includes ${fmt(equityShare)} usable equity from owned property (${(maxRefinanceLVR * 100).toFixed(0)}% LVR cap), plus ${fmt(deployableCash)} deployable cash.`
      : `Based on ${fmt(deployableCash)} deployable cash.`;
    candidates.push({
      id:              'property_deposit',
      action:          `Plan next property purchase — ${Math.round(depositReadyPct)}% deposit ready`,
      reason:
        `Your total deposit power is ${fmt(depositPower)} — ${Math.round(depositReadyPct)}% of a 20% deposit ` +
        `on a ${fmt(ipTarget)} purchase (stamp duty + costs deducted). ${equityNote} ` +
        `Long-run AU property capital growth (~6%) generates ~${fmt(propertyBenefit * Math.min(1, depositReadyPct / 100))}/year in equity, ` +
        `plus rental yield and negative gearing benefits. Requires bank pre-approval and tax planning first.`,
      annual_benefit:  propertyBenefit * Math.min(1, depositReadyPct / 100),
      benefit_label:   `~${fmt(propertyBenefit * Math.min(1, depositReadyPct / 100))}/yr (equity growth, varies)`,
      risk:            'Med',
      cta:             'Go to Property',
      cta_route:       '/property',
      data_reliable:   depositReadyPct >= 50 && (cashOutsideOffset + offsetBalance + (depositPowerResult?.totalUsableEquity ?? 0)) > 0,
      calcBreakdown: [
        { label: 'Deployable cash',          value: deployableCash,  sign: '+' },
        { label: 'Usable equity',            value: equityShare,     sign: '+' },
        { label: 'Total deposit power',      value: depositPower,    sign: '=' },
        { label: 'Readiness',               value: depositReadyPct, sign: '=' },
      ],
    });
  }

  // ── PRIORITY 4: High-interest personal debt ───────────────────────────────
  if (otherDebts > 1_000) {
    // Amount that can be paid using truly free cash (after offset calc)
    const payable     = Math.min(freeCashForOffset > 0 ? freeCashForOffset : 0, otherDebts);
    const debtBenefit = otherDebts * PERSONAL_DEBT_RATE; // total annual cost of debt
    candidates.push({
      id:              'paydown_personal_debt',
      action:          `Pay down personal debt (${fmt(otherDebts)})`,
      reason:
        `Personal debt at ~17% interest costs ${fmt(debtBenefit)}/year. ` +
        (payable > 0
          ? `You have ${fmt(payable)} of free cash that could immediately wipe ${fmt(payable * PERSONAL_DEBT_RATE)}/year in interest charges — a guaranteed, risk-free return far exceeding any investment. `
          : `While you have no idle cash right now, prioritise directing future surplus here before investing elsewhere. `) +
        `${PERSONAL_DEBT_RATE > etfExpectedReturn ? 'This beats the long-run ETF return of 9.5%.' : ''}`,
      annual_benefit:  payable > 0 ? payable * PERSONAL_DEBT_RATE : debtBenefit * 0.1,
      benefit_label:   payable > 0
        ? `${fmt(payable * PERSONAL_DEBT_RATE)}/yr guaranteed (debt eliminated)`
        : `${fmt(debtBenefit)}/yr total cost — address with surplus`,
      risk:            'Low',
      cta:             'View Debt Strategy',
      cta_route:       '/debt-strategy',
      data_reliable:   otherDebts > 0,
      calcBreakdown: [
        { label: 'Total personal debt',    value: otherDebts,                      sign: '+' },
        { label: '× ~17% interest rate',  value: debtBenefit,                     sign: '=' },
        { label: 'Payable from free cash', value: payable,                         sign: '+' },
        { label: 'Annual saving',          value: payable * PERSONAL_DEBT_RATE,    sign: '=' },
      ],
    });
  }

  // ── PRIORITY 5a: Super salary sacrifice (tax alpha) ───────────────────────
  const marginalRate      = marginalTaxRate(rohamGrossAnnual);
  const superRoom         = Math.max(0, SUPER_CONCESSIONAL_CAP - superContribAnnual);
  if (superRoom > 2_000 && surplus > 500 && rohamGrossAnnual > 0) {
    const sacrificeAmount      = Math.min(superRoom, annualSurplus * 0.5);
    const effectiveTaxSaving   = Math.max(0, marginalRate - 0.15) * sacrificeAmount;
    if (effectiveTaxSaving > 500) {
      candidates.push({
        id:              'super_sacrifice',
        action:          `Salary sacrifice ${fmt(sacrificeAmount / 12)}/month into super`,
        reason:
          `You have ${fmt(superRoom)} of concessional super cap remaining this financial year. ` +
          `Salary sacrificing ${fmt(sacrificeAmount)} saves ${fmt(effectiveTaxSaving)} in income tax ` +
          `(your ${(marginalRate * 100).toFixed(0)}% marginal rate vs 15% super tax). ` +
          `Investments also grow in a 15% tax environment vs your marginal rate.`,
        annual_benefit:  effectiveTaxSaving,
        benefit_label:   `${fmt(effectiveTaxSaving)}/yr tax saving (salary sacrifice)`,
        risk:            'Low',
        cta:             'Super Settings',
        cta_route:       '/settings',
        data_reliable:   rohamGrossAnnual > 0 && superRoom > 0,
        calcBreakdown: [
          { label: 'Super cap remaining',   value: superRoom,              sign: '+' },
          { label: 'Sacrifice amount',      value: sacrificeAmount,        sign: '=' },
          { label: `Tax saving (${(marginalRate * 100).toFixed(0)}% − 15%)`, value: effectiveTaxSaving, sign: '=' },
        ],
      });
    }
  }

  // ── PRIORITY 5b: ETF invest with surplus (if no idle cash but surplus exists) ──
  if (freeCashForOffset <= 0 && surplus > 500 && otherDebts < 5_000 && !belowBuffer) {
    // No idle cash but positive monthly surplus → recommend DCA into ETF from surplus
    const monthlyDCA       = Math.round(surplus * 0.5 / 100) * 100; // 50% of surplus, rounded to $100
    const annualDCAGain    = (monthlyDCA * 12) * etfExpectedReturn;
    candidates.push({
      id:              'dca_etf_surplus',
      action:          `DCA ${fmt(monthlyDCA)}/month surplus into ETFs`,
      reason:
        `Your everyday cash is fully committed to buffer + bills + planned investments. ` +
        `However, your monthly surplus of ${fmt(surplus)} gives you ${fmt(monthlyDCA)}/month to invest via DCA. ` +
        `Investing ${fmt(monthlyDCA * 12)}/year in diversified ETFs (VAS + VGS) compounds at ~${(etfExpectedReturn * 100).toFixed(0)}%, ` +
        `building wealth without touching committed cash buckets.`,
      annual_benefit:  annualDCAGain,
      benefit_label:   `~${fmt(annualDCAGain)}/yr expected (${(etfExpectedReturn * 100).toFixed(0)}% DCA, not guaranteed)`,
      risk:            'Med',
      cta:             'Go to Stocks',
      cta_route:       '/stocks',
      data_reliable:   surplus > 0,
      calcBreakdown: [
        { label: 'Monthly surplus',       value: surplus,      sign: '+' },
        { label: '50% to DCA',           value: monthlyDCA,   sign: '=' },
        { label: 'Annual DCA amount',     value: monthlyDCA * 12, sign: '=' },
        { label: `Expected gain (${(etfExpectedReturn * 100).toFixed(0)}%)`, value: annualDCAGain, sign: '=' },
      ],
    });
  } else if (freeCashForOffset > 5_000 && !belowBuffer && otherDebts < 5_000) {
    // Has idle cash AND buffer is met — invest a portion
    const investable   = freeCashForOffset * 0.7;
    const expectedGain = investable * etfExpectedReturn;
    candidates.push({
      id:              'invest_etf',
      action:          `Invest ${fmt(investable)} in diversified ETFs`,
      reason:
        `With your buffer covered, bills reserved, and ${fmt(freeCashForOffset)} of genuinely free cash, ` +
        `investing ${fmt(investable)} (70%, keeping 30% as float) in a diversified ETF ` +
        `(e.g. VAS + VGS) generates an expected ${fmt(expectedGain)}/year at ${(etfExpectedReturn * 100).toFixed(0)}% historic return. ` +
        `This accelerates your FIRE timeline and grows your compounding base.`,
      annual_benefit:  expectedGain,
      benefit_label:   `~${fmt(expectedGain)}/yr expected (${(etfExpectedReturn * 100).toFixed(0)}%, not guaranteed)`,
      risk:            'Med',
      cta:             'Go to Stocks',
      cta_route:       '/stocks',
      data_reliable:   true,
      calcBreakdown: [
        { label: 'Free cash for offset',  value: freeCashForOffset, sign: '+' },
        { label: '70% to invest',         value: investable,        sign: '=' },
        { label: `Expected gain (${(etfExpectedReturn * 100).toFixed(0)}%)`, value: expectedGain, sign: '=' },
      ],
    });
  }

  // ── PRIORITY 5c: Crypto (if history exists and free cash available) ───────
  const hasCryptoHistory = cryptoValue > 0;
  if (freeCashForOffset > 3_000 && !belowBuffer && hasCryptoHistory && otherDebts < 5_000) {
    const cryptoInvestable    = freeCashForOffset * 0.15;
    const expectedCryptoGain  = cryptoInvestable * cryptoExpectedReturn;
    candidates.push({
      id:              'invest_crypto',
      action:          `Add ${fmt(cryptoInvestable)} to crypto portfolio`,
      reason:
        `You have existing crypto holdings. Adding ${fmt(cryptoInvestable)} (15% of free cash, to limit exposure) ` +
        `has an expected return of ~${fmt(expectedCryptoGain)}/year at ${(cryptoExpectedReturn * 100).toFixed(0)}%, ` +
        `but with high volatility — only appropriate if you can hold through drawdowns of 50%+.`,
      annual_benefit:  expectedCryptoGain,
      benefit_label:   `~${fmt(expectedCryptoGain)}/yr expected (${(cryptoExpectedReturn * 100).toFixed(0)}%, HIGH volatility)`,
      risk:            'High',
      cta:             'Go to Crypto',
      cta_route:       '/crypto',
      data_reliable:   true,
    });
  }

  // ── PRIORITY 6: No urgent move — keep cash ────────────────────────────────
  candidates.push({
    id:              'keep_cash',
    action:          `No urgent move — keep cash in offset`,
    reason:
      `Your emergency buffer is funded, bills are reserved, and planned investments are accounted for. ` +
      `Your cash is working hard in the offset account (${fmt(offsetBalance)}) saving ${fmt(offsetBalance * mortgageRate)}/year in mortgage interest. ` +
      `HISA rates (~5%) provide ${fmt(totalLiquid * 0.05)}/year with zero risk if you need a liquid alternative.`,
    annual_benefit:  Math.max(offsetBalance * mortgageRate, totalLiquid * 0.05),
    benefit_label:   `${fmt(Math.max(offsetBalance * mortgageRate, totalLiquid * 0.05))}/yr (offset saving / HISA)`,
    risk:            'Low',
    cta:             'View Dashboard',
    cta_route:       '/dashboard',
    data_reliable:   true,
  });

  // ── 3. Rank by risk-adjusted annual benefit ───────────────────────────────
  // Risk multipliers: Low × 1.0, Med × 0.75, High × 0.5
  const riskAdj = (c: typeof candidates[0]) => {
    const mult = c.risk === 'Low' ? 1.0 : c.risk === 'Med' ? 0.75 : 0.50;
    return c.annual_benefit * mult;
  };

  // Apply spec priority order by pre-scoring certain IDs
  const priorityBoost: Record<string, number> = {
    build_buffer:         10_000_000,   // always first if below buffer
    move_to_offset:        1_000_000,   // second if free cash exists
    no_idle_cash:                  0,   // only shows in alternatives
    property_deposit:        100_000,   // third
    paydown_personal_debt:    50_000,   // fourth
    super_sacrifice:          30_000,   // fifth
    dca_etf_surplus:          10_000,   // fifth (alt)
    invest_etf:               10_000,   // fifth (alt)
    invest_crypto:             1_000,   // low priority
    setup_hisa:                  500,
    keep_cash:                     1,   // last resort
  };

  const scored = candidates.map(c => ({
    ...c,
    _score: riskAdj(c) + (priorityBoost[c.id] ?? 0),
  }));

  // Sort descending by score; reliable data beats unreliable at same tier
  const ranked = scored
    .filter(c => c.annual_benefit > 0 && c.id !== 'no_idle_cash')
    .sort((a, b) => {
      if (a.data_reliable !== b.data_reliable) return a.data_reliable ? -1 : 1;
      return b._score - a._score;
    })
    .map(({ _score, ...c }, i) => ({ ...c, rank: i + 1 } as BestMoveOption));

  // Fallback
  if (ranked.length === 0) {
    const fallback = candidates.find(c => c.id === 'keep_cash')!;
    const fallbackFull: BestMoveOption = { ...fallback, rank: 1 };
    const li = buildLedgerInputs(
      cashOutsideOffset, offsetBalance, mortgage, otherDebts,
      emergencyBuffer, upcomingBills12mo, plannedInvestmentsTotal,
      propertyDepositReserve, taxReserve, forecastShortfallReserve,
      freeCashForOffset, monthlyIncome, monthlyExpenses, surplus,
      depositPower, depositReadyPct
    );
    return {
      best: fallbackFull, alternatives: [],
      generated_at: new Date().toISOString(),
      summary:      `Best Move: ${fallbackFull.action} — ${fallbackFull.benefit_label}`,
      ledgerInputs: li,
    };
  }

  const best         = ranked[0];
  const alternatives = ranked.slice(1, 4);
  const summary      = `Best Move: ${best.action} — ${best.benefit_label} [Risk: ${best.risk}]`;

  const ledgerInputs = buildLedgerInputs(
    cashOutsideOffset, offsetBalance, mortgage, otherDebts,
    emergencyBuffer, upcomingBills12mo, plannedInvestmentsTotal,
    propertyDepositReserve, taxReserve, forecastShortfallReserve,
    freeCashForOffset, monthlyIncome, monthlyExpenses, surplus,
    depositPower, depositReadyPct
  );

  return { best, alternatives, generated_at: new Date().toISOString(), summary, ledgerInputs };
}

// ─── buildLedgerInputs helper ─────────────────────────────────────────────────

function buildLedgerInputs(
  cashOutsideOffset: number,
  offsetBalance: number,
  mortgage: number,
  otherDebts: number,
  emergencyBuffer: number,
  upcomingBills12mo: number,
  plannedInvestmentsTotal: number,
  propertyDepositReserve: number,
  taxReserve: number,
  forecastShortfallReserve: number,
  freeCashForOffset: number,
  monthlyIncome: number,
  monthlyExpenses: number,
  surplus: number,
  depositPower: number,
  depositReadinessPct: number,
): LedgerInputs {
  return {
    cashOutsideOffset,
    offsetBalance,
    mortgage,
    otherDebts,
    emergencyBuffer,
    upcomingBills12mo,
    plannedInvestmentsTotal,
    propertyDepositReserve,
    taxReserve,
    forecastShortfallReserve,
    freeCashForOffset,
    monthlyIncome,
    monthlyExpenses,
    surplus,
    depositPower,
    depositReadinessPct,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// computeBestMoveV2 — async fetcher: fetches all Supabase data, builds ledger,
// calls getBestMoveRecommendation. Used by BestMoveCard.
// ═══════════════════════════════════════════════════════════════════════════════

export async function computeBestMoveV2(cfg: BestMoveConfig = {}): Promise<BestMoveResult> {
  const _cfg = {
    mortgageRate:         cfg.mortgageRate         ?? 0.0625,
    etfExpectedReturn:    cfg.etfExpectedReturn     ?? 0.095,
    cryptoExpectedReturn: cfg.cryptoExpectedReturn  ?? 0.20,
    sgRate:               cfg.sgRate               ?? 0.115,
    monthsBufferTarget:   cfg.monthsBufferTarget    ?? 3,
    maxLvr:               cfg.maxLvr               ?? 80,
    ipTargetPrice:        cfg.ipTargetPrice         ?? 0,
  };

  // Fetch all data in parallel
  const [
    snapRows, billRows, propRows,
    stockRows, cryptoRows, dcaStockRows, dcaCryptoRows,
    incomeRows, stockOrderRows, cryptoOrderRows,
  ] = await Promise.all([
    sb('sf_snapshot?id=eq.shahrokh-family-main'),
    sb('sf_recurring_bills?active=eq.true'),
    sb('sf_properties'),
    sb('sf_stocks'),
    sb('sf_crypto'),
    sb('sf_stock_dca'),
    sb('sf_crypto_dca'),
    sb('sf_income?order=date.desc&limit=60'),
    sb('sf_stock_orders?status=neq.cancelled'),
    sb('sf_crypto_orders?status=neq.cancelled'),
  ]);

  const snap = snapRows?.[0] ?? {};

  const snapMonthlyIncome  = safeNum(snap.monthly_income);
  const snapMonthlyExp     = safeNum(snap.monthly_expenses);
  const incomeFromTracker  = deduplicatedMonthlyIncome(incomeRows);
  const monthlyIncome      = incomeFromTracker > 0 ? incomeFromTracker : snapMonthlyIncome;
  const monthlyExpenses    = snapMonthlyExp > 0 ? snapMonthlyExp : 0;

  // DCA monthly cost (active)
  const dcaActive = [
    ...(Array.isArray(dcaStockRows)   ? dcaStockRows   : []),
    ...(Array.isArray(dcaCryptoRows)  ? dcaCryptoRows  : []),
  ].filter(d => d.active !== false);
  const dcaMonthlyCost = dcaActive.reduce((s: number, d: any) => s + safeNum(d.monthly_amount), 0);

  // Planned orders
  const plannedStockTotal = (Array.isArray(stockOrderRows) ? stockOrderRows : [])
    .reduce((s: number, o: any) => s + safeNum(o.total_cost ?? o.amount), 0);
  const plannedCryptoTotal = (Array.isArray(cryptoOrderRows) ? cryptoOrderRows : [])
    .reduce((s: number, o: any) => s + safeNum(o.total_cost ?? o.amount), 0);

  // Portfolio values
  const stocksValue = (stockRows ?? []).reduce((s: number, r: any) =>
    s + safeNum(r.current_holding) * safeNum(r.current_price), 0)
    || safeNum(snap.stocks);
  const cryptoValue = (cryptoRows ?? []).reduce((s: number, r: any) =>
    s + safeNum(r.current_holding) * safeNum(r.current_price), 0)
    || safeNum(snap.crypto);

  // Super
  const rohamGrossAnnual = snapMonthlyIncome * 12;
  const employerSG       = rohamGrossAnnual * _cfg.sgRate;
  const salarySacAnn     = safeNum(snap.roham_salary_sacrifice) * 12;
  const superContribAnnual = employerSG + salarySacAnn;

  // Emergency buffer (from snapshot or 3-month expenses default)
  const billsMonthly = (Array.isArray(billRows) ? billRows : []).reduce((s: number, b: any) => {
    const FREQ: Record<string, number> = {
      Weekly: 52/12, Fortnightly: 26/12, Monthly: 1, Quarterly: 1/3, Annual: 1/12,
    };
    return s + safeNum(b.amount) * (FREQ[b.frequency] ?? 1);
  }, 0);
  const totalExpenses  = Math.max(monthlyExpenses, billsMonthly);
  const emergencyBuffer = totalExpenses * _cfg.monthsBufferTarget;

  // Deposit power via depositPower.ts helper
  const bufferForDP = emergencyBuffer;
  const ipTarget    = _cfg.ipTargetPrice > 0
    ? _cfg.ipTargetPrice
    : (safeNum(snap.ppor) > 0 ? Math.max(500_000, Math.min(1_500_000, safeNum(snap.ppor))) : 900_000);

  const dp = computeDepositPower({
    cash:            safeNum(snap.cash),
    offset:          safeNum(snap.offset_balance),
    properties:      Array.isArray(propRows) ? propRows : [],
    default_max_lvr: _cfg.maxLvr,
    target_price:    ipTarget,
    state:           'QLD',
    buffer:          bufferForDP,
  });

  const depositPowerResult = {
    totalDepositPower:  dp.next_deposit_capacity,
    readinessPct:       (dp.next_deposit_capacity / (ipTarget * 0.20)) * 100,
    isReady:            dp.next_deposit_capacity >= ipTarget * 0.20,
    totalUsableEquity:  dp.total_usable_equity,
    deployableCash:     dp.deployable_cash,
    fundingSources:     [] as any[],
  };

  // Cashflow shortfall estimate (simple 12-month projection)
  const cashNow          = safeNum(snap.cash);
  const offsetBal        = safeNum(snap.offset_balance);
  const surplus12        = (monthlyIncome - totalExpenses) * 12;
  const lowestFutureCash = cashNow + surplus12 * 0.5;  // conservative mid-year estimate
  const negativeCashMonths: string[] = lowestFutureCash < 0 ? ['next 12 months'] : [];

  const ledger: BestMoveLedger = {
    cash:                 safeNum(snap.cash),
    offsetBalance:        safeNum(snap.offset_balance),
    mortgage:             safeNum(snap.mortgage),
    otherDebts:           safeNum(snap.other_debts),
    monthlyIncome,
    monthlyExpenses,
    ppor:                 safeNum(snap.ppor),
    plannedStockTotal,
    plannedCryptoTotal,
    billsRaw:             Array.isArray(billRows) ? billRows : [],
    properties:           Array.isArray(propRows) ? propRows : [],
    emergencyBuffer,
    maxRefinanceLVR:      _cfg.maxLvr / 100,
    mortgageRate:         _cfg.mortgageRate,
    etfExpectedReturn:    _cfg.etfExpectedReturn,
    cryptoExpectedReturn: _cfg.cryptoExpectedReturn,
    lowestFutureCash,
    negativeCashMonths,
    rohamGrossAnnual,
    superContribAnnual,
    stocksValue,
    cryptoValue,
    depositPowerResult,
  };

  return getBestMoveRecommendation(ledger);
}

// ─── Backward-compat alias for BestMoveCard (calls computeBestMoveV2) ────────
export async function computeBestMove(cfg: BestMoveConfig = {}): Promise<BestMoveResult> {
  return computeBestMoveV2(cfg);
}
