/**
 * Unified Recommendation Engine — the strategic brain.
 *
 * Consumes `UnifiedSignals` (a normalised summary of every available source)
 * and produces a ranked list of `Recommendation`s shared by Best Move, the
 * Action Centre, FIRE Optimizer, Risk Radar, and Deposit Power.
 *
 * Priority stack (HARD constraints — never overridden by investor preference):
 *   1. prevent_failure          — catastrophic / insolvency risk
 *   2. protect_liquidity        — emergency buffer
 *   3. reduce_high_interest_debt
 *   4. stabilise_leverage       — serviceability, LVR
 *   5. preserve_tax_efficiency
 *   6. maintain_investing_discipline
 *   7. improve_fire_timeline
 *   8. maximise_wealth
 *
 * Investor preferences may rerank WITHIN safe candidates only; they cannot
 * promote an item past a higher-tier hard recommendation.
 */

import type {
  Recommendation,
  UnifiedSignals,
  UnifiedRecommendationResult,
  StrategicPillar,
  SourceSignal,
  ActionType,
  Urgency,
  RiskLevel,
} from './types';
import { debtVsETF, cashVsInvest } from './opportunityCost';
import {
  classifyCurrentDebtPortfolio,
  partitionCurrentVsPlanned,
  isPlannedDebt,
  type DebtRecord,
  type DebtPortfolioSummary,
} from './debtClassification';

const PILLAR_RANK: Record<StrategicPillar, number> = {
  prevent_failure: 1,
  protect_liquidity: 2,
  reduce_high_interest_debt: 3,
  stabilise_leverage: 4,
  preserve_tax_efficiency: 5,
  maintain_investing_discipline: 6,
  improve_fire_timeline: 7,
  maximise_wealth: 8,
};

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function plus30Days(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

function signalsAvailable(s: UnifiedSignals): SourceSignal[] {
  const list: SourceSignal[] = [];
  if (s.cashOutsideOffset != null || s.offsetBalance != null) list.push('snapshot', 'cash_offset');
  if (s.monthlyIncome != null && s.monthlyExpenses != null) list.push('ledger_income_expense');
  if (s.mortgage != null || s.otherDebts != null) list.push('debt_balances');
  if (s.depositPower != null || s.depositReadinessPct != null) list.push('property_readiness');
  if (s.mcSurvivalProbability != null || s.mcStressFlag != null) list.push('monte_carlo_v5');
  if (s.decisionTopAction != null) list.push('decision_engine');
  if (s.fireYearsToTarget != null || s.fireProgressPct != null) list.push('fire_engine');
  if (s.riskOverallScore != null || s.topRiskFactor != null) list.push('risk_engine');
  if (s.marginalTaxRate != null || s.superCapRemaining != null) list.push('household_tax');
  if (s.preference != null) list.push('investor_preference');
  if (s.behaviouralProfile != null) list.push('behavioural_profile');
  if (Array.isArray(s.osFindings) && s.osFindings.length > 0) list.push('autonomous_os');
  if (s.scenarioContext != null) list.push('scenario_tree');
  // dedupe
  return Array.from(new Set(list));
}

interface CandidateOpts {
  id: string;
  title: string;
  actionType: ActionType;
  pillar: StrategicPillar;
  urgency: Urgency;
  riskLevel: RiskLevel;
  reasoning: string;
  steps: Array<{ step: string; detail?: string; route?: string }>;
  alternatives: Array<{ title: string; whyAlternative: string; tradeoff: string }>;
  benefitLabel?: string;
  cta?: { label: string; route: string };
  impact?: Recommendation['expectedFinancialImpact'];
  liquidityImpact?: Recommendation['liquidityImpact'];
  fireImpact?: Recommendation['fireImpact'];
  netWorthImpact?: Recommendation['netWorthImpact'];
  riskReductionImpact?: Recommendation['riskReductionImpact'];
  opportunityCost?: Recommendation['opportunityCost'];
  watchSignals?: SourceSignal[];
  surfaces: Recommendation['surfaces'];
  signalsUsed: SourceSignal[];
  confidence?: number;
  whatCouldChange?: string[];
}

/**
 * Tiny augmentation so candidates can attach structured `debtRationale`
 * without threading another field through CandidateOpts.
 */
type RecommendationWithBuilder = Recommendation & {
  withDebtRationale(r: NonNullable<Recommendation['debtRationale']>): Recommendation;
};

function makeRecommendation(opts: CandidateOpts): RecommendationWithBuilder {
  const rec: Recommendation = {
    id: opts.id,
    title: opts.title,
    actionType: opts.actionType,
    pillar: opts.pillar,
    priorityRank: 0,
    confidenceScore: opts.confidence ?? 0.6,
    urgency: opts.urgency,
    riskLevel: opts.riskLevel,
    expectedFinancialImpact: opts.impact ?? {},
    liquidityImpact: opts.liquidityImpact,
    fireImpact: opts.fireImpact,
    netWorthImpact: opts.netWorthImpact,
    riskReductionImpact: opts.riskReductionImpact,
    opportunityCost: opts.opportunityCost,
    implementationSteps: opts.steps,
    whatCouldChangeRecommendation: opts.whatCouldChange ?? [
      'Significant change in cash position or income',
      'Monte Carlo stress flag toggling',
      'New high-interest debt taken on',
    ],
    alternativeOptions: opts.alternatives,
    reviewTrigger: {
      condition: 'Re-run when snapshot, ledger or Monte Carlo result updates',
      reviewByISO: plus30Days(),
      watchSignals: opts.watchSignals,
    },
    sourceSignalsUsed: opts.signalsUsed,
    surfaces: opts.surfaces,
    reasoning: opts.reasoning,
    benefitLabel: opts.benefitLabel,
    cta: opts.cta,
  };
  return Object.assign(rec, {
    withDebtRationale(r: NonNullable<Recommendation['debtRationale']>): Recommendation {
      rec.debtRationale = r;
      return rec;
    },
  });
}

// ─── Candidate builders ──────────────────────────────────────────────────────

function buildEmergencyBuffer(s: UnifiedSignals, signals: SourceSignal[]): Recommendation | null {
  const cash = num(s.cashOutsideOffset);
  const offset = num(s.offsetBalance);
  const buffer = num(s.emergencyBufferTarget);
  if (!buffer || (cash + offset) >= buffer) return null;

  const shortfall = buffer - (cash + offset);
  const monthlySurplus = num(s.monthlySurplus);
  const monthsToFill = monthlySurplus > 0 ? Math.ceil(shortfall / monthlySurplus) : 12;
  return makeRecommendation({
    id: 'build_emergency_buffer',
    title: `Build emergency buffer — ${fmt(shortfall)} short`,
    actionType: 'build_emergency_buffer',
    pillar: 'protect_liquidity',
    urgency: 'immediate',
    riskLevel: 'Low',
    reasoning: `Liquid cash (${fmt(cash + offset)}) is below the ${fmt(buffer)} emergency buffer target. ` +
      `Until restored, any income shock forces high-cost borrowing. ` +
      `At your current surplus this can be closed in ~${monthsToFill} months.`,
    steps: [
      { step: `Direct ${fmt(Math.min(monthlySurplus, shortfall / Math.max(1, monthsToFill)))}/mo of surplus to a savings/offset bucket` },
      { step: 'Pause new investing contributions until buffer ≥ target' },
      { step: 'Revisit buffer target whenever expenses or dependants change' },
    ],
    alternatives: [
      { title: 'Sell discretionary holdings to plug the gap', whyAlternative: 'Faster, but realises potential CGT', tradeoff: 'Locks in tax + abandons recovery upside' },
      { title: 'Open HELOC / line-of-credit as standby', whyAlternative: 'Provides flexible liquidity without raiding investments', tradeoff: 'Variable rate; requires bank approval' },
    ],
    benefitLabel: `Avoids ~${fmt(shortfall * 0.17)}/yr emergency borrowing cost`,
    cta: { label: 'Open Settings', route: '/settings' },
    impact: { annualDollar: shortfall * 0.17, confidence: 0.9, label: `${fmt(shortfall * 0.17)}/yr avoided` },
    liquidityImpact: { deltaDeployableCash: 0, deltaRunwayMonths: 3 },
    riskReductionImpact: { points: 18, categoriesAffected: ['cashflow', 'income'] },
    watchSignals: ['cash_offset', 'ledger_income_expense'],
    surfaces: ['best_move', 'action_centre', 'risk'],
    signalsUsed: signals.filter(s => ['cash_offset', 'snapshot', 'ledger_income_expense'].includes(s)),
    confidence: 0.92,
  });
}

/**
 * Build the classified debt portfolio used by every debt-related candidate.
 *
 * Resolution order:
 *  1. `s.debtPortfolio` — the canonical detailed debt list set by the user
 *     on /debt-strategy. This is the only source we trust for APR.
 *  2. Fallback to legacy `otherDebts` + `personalDebtRate` only when an
 *     explicit non-null personalDebtRate is supplied. We do NOT fabricate
 *     a 17% rate when it is missing.
 *
 * Mortgage is added as a classified record when `mortgage > 0` so downstream
 * candidates can reason about it strategically.
 */
function buildDebtPortfolio(s: UnifiedSignals): DebtPortfolioSummary {
  const records: DebtRecord[] = [];
  let portfolioCarriesMortgage = false;

  if (Array.isArray(s.debtPortfolio) && s.debtPortfolio.length > 0) {
    for (const d of s.debtPortfolio) {
      const planned = (d as any).planned === true;
      const settlementDateISO = (d as any).settlementDateISO as string | undefined;
      const type = (d.type as DebtRecord['type']) ?? 'other';
      if (type === 'mortgage') portfolioCarriesMortgage = true;
      records.push({
        id: d.id,
        name: d.name ?? 'Debt',
        balance: typeof d.balance === 'number' ? d.balance : 0,
        ratePct: d.ratePct,                          // preserve null/undefined/0 verbatim
        minPaymentMonthly: d.minPaymentMonthly,
        type,
        expiryDateISO: d.expiryDateISO,
        taxDeductible: d.taxDeductible,
        planned,
        settlementDateISO,
      });
    }
  } else {
    // Legacy fallback. Only treat `otherDebts` as classifiable when the
    // caller supplied an explicit personalDebtRate. We MUST NOT default
    // missing APR to 17% — that is the bug we are fixing.
    const otherDebts = num(s.otherDebts);
    if (otherDebts > 0) {
      records.push({
        id: 'other_debts_legacy',
        name: 'Other Debts',
        balance: otherDebts,
        ratePct: typeof s.personalDebtRate === 'number'
          ? s.personalDebtRate * 100   // signals carry decimal — classifier expects percent
          : null,                       // unknown → classified as unknown_apr_debt, never high APR
        type: 'other',
      });
    }
  }

  // Add mortgage as a classified record for strategic evaluation — but ONLY
  // when the user-supplied debtPortfolio doesn't already carry a mortgage line.
  // Otherwise PPOR mortgage gets double-counted (once via debt_prefs, once via
  // s.mortgage), inflating "Strategic debt monitored" by the full mortgage
  // balance and leaking the look of "$2.40M current debt".
  const mortgageBalance = num(s.mortgage);
  if (mortgageBalance > 0 && !portfolioCarriesMortgage) {
    records.push({
      id: 'mortgage_primary',
      name: 'Home Mortgage',
      balance: mortgageBalance,
      ratePct: typeof s.mortgageRate === 'number' ? s.mortgageRate * 100 : null,
      type: 'mortgage',
    });
  }

  // CURRENT-ONLY classification. Planned IP loans, future leverage events
  // and forecast debt are filtered out of the Best Move, Strategic Debt
  // Monitor, and every "today" surface. Planned debt belongs to the Events
  // / Forecast Engine surfaces, never to current liabilities.
  return classifyCurrentDebtPortfolio(records);
}

/**
 * High-APR consumer debt payoff — only fires when the classification engine
 * identifies a real high-APR balance (≥ 10% APR, non-deductible).
 *
 * Crucially: 0% debt, unknown-APR debt, tax-deductible debt and mortgage are
 * never routed through this candidate.
 */
function payHighInterestDebt(
  s: UnifiedSignals,
  signals: SourceSignal[],
  portfolio: DebtPortfolioSummary,
): Recommendation | null {
  if (!portfolio.hasUrgentHighAprDebt) return null;
  const debt = portfolio.highAprBalance;
  const rate = portfolio.highAprWeightedRate ?? 0;
  if (debt < 1000 || rate <= 0) return null;

  const annualCost = debt * rate;
  const etfRet = num(s.etfExpectedReturn, 0.095);

  const oc = debtVsETF({
    debtAmount: debt,
    debtRatePct: rate * 100,
    etfReturnPct: etfRet * 100,
    marginalTaxRate: num(s.marginalTaxRate, 0.325),
  });

  return makeRecommendation({
    id: 'pay_high_interest_debt',
    title: `Pay down high-interest debt (${fmt(debt)})`,
    actionType: 'pay_high_interest_debt',
    pillar: 'reduce_high_interest_debt',
    urgency: debt > 10_000 ? 'immediate' : 'this_quarter',
    riskLevel: 'Low',
    reasoning: `High-APR consumer debt at ~${(rate * 100).toFixed(0)}% costs ${fmt(annualCost)}/yr. ` +
      `A guaranteed ${(rate * 100).toFixed(1)}% return from paydown beats the volatile ` +
      `~${(etfRet * 100).toFixed(1)}% expected ETF return. This is a hard-priority safety action.`,
    steps: [
      { step: 'List debts by APR (highest first)' },
      { step: 'Direct surplus + idle cash to the highest-APR debt until cleared' },
      { step: 'Avoid new consumer debt while balance > 0' },
    ],
    alternatives: [
      { title: 'Consolidate to lower-rate personal loan', whyAlternative: 'Reduces APR while paying down', tradeoff: 'Application + fees' },
      { title: 'Balance-transfer 0% intro card', whyAlternative: 'Buys interest-free runway', tradeoff: 'Requires discipline to clear before rate steps up' },
    ],
    benefitLabel: `${fmt(annualCost)}/yr guaranteed (debt eliminated)`,
    cta: { label: 'Open Debt Strategy', route: '/debt-strategy' },
    impact: { annualDollar: annualCost, expectedReturnPct: rate * 100, confidence: 0.95, label: `${fmt(annualCost)}/yr saved` },
    riskReductionImpact: { points: 12, categoriesAffected: ['debt'] },
    opportunityCost: { description: oc.etf.summary, annualDollar: oc.etf.expectedAnnualDollar },
    watchSignals: ['debt_balances', 'cash_offset'],
    surfaces: ['best_move', 'action_centre', 'debt'],
    signalsUsed: signals.filter(s => ['debt_balances', 'snapshot'].includes(s)),
    confidence: 0.95,
    whatCouldChange: [
      'New high-APR consumer debt taken on',
      'Effective APR rises (variable-rate debt)',
      'Minimum repayment missed',
    ],
  }).withDebtRationale({
    classification: 'High-APR consumer debt',
    aprPct: rate * 100,
    balance: debt,
    annualInterestCost: annualCost,
    guaranteedReturnPct: rate * 100,
    pillarRank: PILLAR_RANK.reduce_high_interest_debt,
    whatChangesThis: [
      'Refinancing the balance to a lower APR',
      'Paying the balance to zero',
      'Liquidity falling below emergency buffer',
    ],
  });
}

/**
 * Interest-free debt → narrative-only optionality message. Never an urgent
 * payoff recommendation. Visible in `action_centre`, `debt` and `best_move`
 * surfaces so users can see the engine considered the debt and explicitly
 * chose NOT to recommend payoff.
 */
function maintainInterestFreeDebt(
  s: UnifiedSignals,
  signals: SourceSignal[],
  portfolio: DebtPortfolioSummary,
): Recommendation | null {
  if (portfolio.interestFreeBalance <= 0) return null;
  // If there is a cliff < 90 days, the timed warning candidate takes precedence.
  if (portfolio.promosWithUpcomingCliff.length > 0) return null;

  const bal = portfolio.interestFreeBalance;
  const etfRet = num(s.etfExpectedReturn, 0.095);
  const mortgageRate = num(s.mortgageRate, 0);
  const altYield = Math.max(etfRet, mortgageRate);

  return makeRecommendation({
    id: 'maintain_interest_free_debt',
    title: `Interest-free debt detected (${fmt(bal)}) — maintain optionality`,
    actionType: 'maintain_interest_free_debt',
    pillar: 'maintain_investing_discipline',
    urgency: 'monitor',
    riskLevel: 'Low',
    reasoning:
      `Interest-free debt detected. Maintaining liquidity or offset positioning ` +
      `may currently be more optimal than early payoff. 0% financing creates ` +
      `optionality — capital may produce higher expected value elsewhere ` +
      `(offset at ~${(mortgageRate * 100 || 0).toFixed(2)}%, ETFs at ~${(etfRet * 100).toFixed(1)}%).`,
    steps: [
      { step: 'Keep paying minimums on schedule to preserve the 0% rate' },
      { step: 'Diary the expiry date — set a reminder ~60 days before' },
      { step: 'Direct the capital to offset / ETFs / buffer instead' },
    ],
    alternatives: [
      { title: 'Pay off early anyway', whyAlternative: 'Removes a balance from your statement', tradeoff: 'Forgoes the opportunity cost on the same capital' },
    ],
    benefitLabel: `0% APR — preserve optionality`,
    cta: { label: 'Open Debt Strategy', route: '/debt-strategy' },
    impact: { annualDollar: bal * altYield, confidence: 0.7, label: `~${fmt(bal * altYield)}/yr opportunity value` },
    watchSignals: ['debt_balances'],
    surfaces: ['best_move', 'action_centre', 'debt'],
    signalsUsed: signals.filter(s => ['debt_balances', 'snapshot'].includes(s)),
    confidence: 0.8,
    whatCouldChange: [
      'Promotional rate expires',
      'Minimum repayment missed → reverts to penalty APR',
      'Liquidity stress → switch to payoff',
    ],
  }).withDebtRationale({
    classification: 'Interest-free debt',
    aprPct: 0,
    balance: bal,
    annualInterestCost: 0,
    guaranteedReturnPct: 0,
    pillarRank: PILLAR_RANK.maintain_investing_discipline,
    whatChangesThis: [
      'Promo rate expires (cliff)',
      'Missed minimum repayment',
      'Liquidity drops below emergency buffer',
    ],
  });
}

/**
 * Mortgage / tax-deductible / strategic-leverage → strategic monitor, NOT
 * urgent payoff. Provides a transparent "we evaluated this debt strategically"
 * signal so users see the engine handles mortgage differently from credit card.
 */
function monitorStrategicDebt(
  s: UnifiedSignals,
  signals: SourceSignal[],
  portfolio: DebtPortfolioSummary,
): Recommendation | null {
  const mortgageBal = portfolio.balanceByClass.mortgage_debt;
  const deductibleBal = portfolio.balanceByClass.tax_deductible_debt;
  const strategicBal = portfolio.balanceByClass.strategic_leverage_debt;
  const total = mortgageBal + deductibleBal + strategicBal;
  if (total <= 0) return null;

  const mortgageRate = num(s.mortgageRate, 0);
  // Surface only when there is no urgent high-APR debt — strategic monitoring
  // shouldn't compete with a real high-APR payoff.
  if (portfolio.hasUrgentHighAprDebt) return null;

  return makeRecommendation({
    id: 'monitor_strategic_debt',
    title: `Strategic debt monitored (${fmt(total)})`,
    actionType: 'monitor_strategic_debt',
    pillar: 'stabilise_leverage',
    urgency: 'monitor',
    riskLevel: 'Low',
    reasoning:
      `Mortgage / tax-deductible / strategic leverage are evaluated strategically — ` +
      `not as urgent consumer debt. Current effective mortgage rate ~${(mortgageRate * 100 || 0).toFixed(2)}%. ` +
      `Refinance, offset positioning and serviceability are the right levers, not aggressive paydown.`,
    steps: [
      { step: 'Re-check refinance offers if rates drop > 0.5%' },
      { step: 'Maintain offset balance to maximise interest saved' },
      { step: 'Re-stress at +1% before adding new leverage' },
    ],
    alternatives: [
      { title: 'Refinance', whyAlternative: 'Lower effective APR', tradeoff: 'Application fees / break costs' },
      { title: 'Extra principal repayments', whyAlternative: 'Faster equity build', tradeoff: 'Locks capital, no liquidity' },
    ],
    benefitLabel: 'Evaluated strategically — not urgent',
    cta: { label: 'Open Debt Strategy', route: '/debt-strategy' },
    impact: { confidence: 0.7 },
    watchSignals: ['debt_balances'],
    surfaces: ['action_centre', 'debt'],
    signalsUsed: signals.filter(s => ['debt_balances', 'snapshot'].includes(s)),
    confidence: 0.75,
  }).withDebtRationale({
    classification: 'Mortgage / strategic leverage',
    aprPct: mortgageRate > 0 ? mortgageRate * 100 : null,
    balance: total,
    annualInterestCost: total * (mortgageRate || 0),
    guaranteedReturnPct: mortgageRate > 0 ? mortgageRate * 100 : null,
    pillarRank: PILLAR_RANK.stabilise_leverage,
    whatChangesThis: [
      'LVR rises above 80%',
      'Monte Carlo stress flag goes severe',
      'Serviceability headroom turns negative',
    ],
  });
}

/**
 * 0% debt approaching expiry → timed warning, not an urgent payoff.
 */
function planPromoExpiry(
  _s: UnifiedSignals,
  signals: SourceSignal[],
  portfolio: DebtPortfolioSummary,
): Recommendation | null {
  if (portfolio.promosWithUpcomingCliff.length === 0) return null;
  const totalAtRisk = portfolio.promosWithUpcomingCliff
    .reduce((s, d) => s + Math.max(0, d.balance), 0);
  const soonest = portfolio.promosWithUpcomingCliff
    .reduce((min, d) => (d.daysToExpiry ?? 999) < min ? (d.daysToExpiry ?? 999) : min, 999);

  return makeRecommendation({
    id: 'plan_promo_expiry',
    title: `Promo 0% finance expires in ~${soonest} days (${fmt(totalAtRisk)})`,
    actionType: 'plan_promo_expiry',
    pillar: 'reduce_high_interest_debt',
    urgency: soonest <= 30 ? 'immediate' : 'this_quarter',
    riskLevel: 'Low',
    reasoning:
      `Interest-free promotional debt has a cliff in ~${soonest} days. ` +
      `On expiry the rate typically reverts to a penalty APR (20%+) on the ` +
      `full balance. Plan the payoff or refinance NOW to avoid the step-up.`,
    steps: [
      { step: 'Clear the balance before the expiry date if possible' },
      { step: 'Or balance-transfer to a fresh 0% facility before the cliff' },
      { step: 'Set a reminder 14 days pre-expiry' },
    ],
    alternatives: [
      { title: 'Refinance to a low-rate personal loan', whyAlternative: 'Predictable APR after cliff', tradeoff: 'Application fees' },
      { title: 'Let it revert and pay down aggressively', whyAlternative: 'Avoid balance-transfer fees', tradeoff: 'Penalty APR applies to full balance' },
    ],
    benefitLabel: `Avoids penalty APR on cliff`,
    cta: { label: 'Open Debt Strategy', route: '/debt-strategy' },
    impact: { annualDollar: totalAtRisk * 0.20, confidence: 0.85, label: `~${fmt(totalAtRisk * 0.20)}/yr avoided` },
    watchSignals: ['debt_balances'],
    surfaces: ['best_move', 'action_centre', 'debt'],
    signalsUsed: signals.filter(s => ['debt_balances', 'snapshot'].includes(s)),
    confidence: 0.88,
  }).withDebtRationale({
    classification: 'Interest-free debt — promo expiring',
    aprPct: 0,
    balance: totalAtRisk,
    annualInterestCost: 0,
    guaranteedReturnPct: 20,                 // assumed reverted APR
    pillarRank: PILLAR_RANK.reduce_high_interest_debt,
    triggers: { daysToExpiry: soonest },
    whatChangesThis: [
      'Balance cleared before the cliff',
      'Promo extended by lender',
      'Successful balance-transfer to a new 0% facility',
    ],
  });
}

function holdCashOffset(s: UnifiedSignals, signals: SourceSignal[]): Recommendation | null {
  const cash = num(s.cashOutsideOffset);
  const mortgage = num(s.mortgage);
  const rate = num(s.mortgageRate, 0.0625);
  if (cash <= 5_000 || mortgage <= 0) return null;

  const buffer = num(s.emergencyBufferTarget);
  const bills = num(s.upcomingBills12mo);
  const free = Math.max(0, cash - buffer - bills);
  if (free < 5_000) return null;
  const saving = free * rate;

  const oc = cashVsInvest({
    amount: free,
    hisaReturnPct: num(s.cashHisaReturn, 0.05) * 100,
    investReturnPct: num(s.etfExpectedReturn, 0.095) * 100,
    mortgageOffsetRatePct: rate * 100,
    marginalTaxRate: num(s.marginalTaxRate, 0.325),
  });

  return makeRecommendation({
    id: 'hold_cash_offset',
    title: `Move ${fmt(free)} of idle cash to mortgage offset`,
    actionType: 'hold_cash_offset',
    pillar: 'maintain_investing_discipline',
    urgency: 'this_quarter',
    riskLevel: 'Low',
    reasoning: `After reserving buffer (${fmt(buffer)}) and bills (${fmt(bills)}/yr), ${fmt(free)} ` +
      `is idle. Parking in your offset saves ${fmt(saving)}/yr in mortgage interest — a tax-free, ` +
      `risk-free return that beats HISA after tax.`,
    steps: [
      { step: 'Transfer idle cash to offset facility' },
      { step: 'Keep cheque buffer of ~1 month expenses in everyday account' },
      { step: 'Re-evaluate quarterly as mortgage balance drops' },
    ],
    alternatives: [
      { title: 'Park in HISA at ~5%', whyAlternative: 'Slightly higher headline rate', tradeoff: oc.hisa.summary },
      { title: 'DCA into ETFs', whyAlternative: 'Higher long-term expected return', tradeoff: oc.invest.summary },
    ],
    benefitLabel: `${fmt(saving)}/yr guaranteed (offset interest saving)`,
    cta: { label: 'Update Offset', route: '/settings' },
    impact: { annualDollar: saving, expectedReturnPct: rate * 100, confidence: 0.98, label: `${fmt(saving)}/yr saved` },
    opportunityCost: { description: oc.invest.summary, annualDollar: oc.invest.expectedAnnualDollar },
    watchSignals: ['cash_offset', 'debt_balances'],
    surfaces: ['best_move', 'action_centre'],
    signalsUsed: signals.filter(s => ['cash_offset', 'debt_balances'].includes(s)),
    confidence: 0.92,
  });
}

function increaseSuper(s: UnifiedSignals, signals: SourceSignal[]): Recommendation | null {
  const room = num(s.superCapRemaining);
  const surplus = num(s.monthlySurplus);
  if (room < 2_000 || surplus < 300) return null;
  const marginal = num(s.marginalTaxRate, 0.325);
  if (marginal <= 0.15) return null;
  const sac = Math.min(room, surplus * 6); // half-year worth of surplus capped at cap
  const taxSaved = (marginal - 0.15) * sac;
  if (taxSaved < 500) return null;

  return makeRecommendation({
    id: 'increase_super',
    title: `Salary sacrifice ${fmt(sac / 12)}/mo into super`,
    actionType: 'increase_super',
    pillar: 'preserve_tax_efficiency',
    urgency: 'this_year',
    riskLevel: 'Low',
    reasoning: `${fmt(room)} of concessional cap remains this FY. Sacrificing ${fmt(sac)} saves ` +
      `${fmt(taxSaved)} in income tax (your ${(marginal * 100).toFixed(0)}% marginal vs 15% super tax) and the ` +
      `balance grows in a lower-tax environment.`,
    steps: [
      { step: 'Email payroll the sacrifice instruction', route: '/settings' },
      { step: 'Confirm new net pay covers monthly bills' },
      { step: 'Review super investment option (growth vs balanced)' },
    ],
    alternatives: [
      { title: 'Non-concessional after-tax contribution', whyAlternative: 'Useful if cap is filled or income too low', tradeoff: 'No tax benefit on the way in' },
      { title: 'Keep investing outside super', whyAlternative: 'More accessibility before preservation age', tradeoff: 'Lower tax efficiency' },
    ],
    benefitLabel: `${fmt(taxSaved)}/yr tax saving`,
    cta: { label: 'Open Settings', route: '/settings' },
    impact: { annualDollar: taxSaved, confidence: 0.9, label: `${fmt(taxSaved)}/yr saved` },
    fireImpact: { yearsDelta: 0.3 },
    watchSignals: ['household_tax', 'ledger_income_expense'],
    surfaces: ['best_move', 'action_centre', 'tax'],
    signalsUsed: signals.filter(s => ['household_tax', 'ledger_income_expense'].includes(s)),
    confidence: 0.88,
  });
}

function propertyAction(s: UnifiedSignals, signals: SourceSignal[]): Recommendation | null {
  const dp = num(s.depositPower);
  const pct = num(s.depositReadinessPct);
  if (dp <= 0 && pct <= 0) return null;

  const liqMonths = num(s.postPurchaseBufferMonths, 99);
  const service = num(s.serviceabilityHeadroomMonthly, 9999);
  const cashflowSafe = liqMonths >= 3 && service > 0;
  const strategyReady = pct >= 100 && cashflowSafe;
  const depositOnlyReady = pct >= 90 && !cashflowSafe;

  if (strategyReady) {
    return makeRecommendation({
      id: 'proceed_property_purchase',
      title: 'Property: strategy-ready — proceed to pre-approval',
      actionType: 'proceed_property_purchase',
      pillar: 'maximise_wealth',
      urgency: 'this_quarter',
      riskLevel: 'Med',
      reasoning: `Deposit ready (${pct.toFixed(0)}%), serviceability headroom ${fmt(service)}/mo, ` +
        `post-purchase buffer ${liqMonths.toFixed(1)} months. All readiness gates pass — proceed.`,
      steps: [
        { step: 'Obtain formal bank pre-approval' },
        { step: 'Re-stress at +1% rate before signing' },
        { step: 'Lock in conveyancer + building inspection' },
      ],
      alternatives: [
        { title: 'Wait one more quarter', whyAlternative: 'Lets buffer compound', tradeoff: 'Opportunity cost on growth' },
        { title: 'Aggressive ETF DCA instead', whyAlternative: 'Better liquidity profile', tradeoff: 'Forgoes leverage' },
      ],
      benefitLabel: 'All readiness gates passed',
      cta: { label: 'Open Property', route: '/property' },
      impact: { confidence: 0.7 },
      fireImpact: { yearsDelta: 0.5 },
      watchSignals: ['property_readiness', 'monte_carlo_v5'],
      surfaces: ['action_centre', 'property'],
      signalsUsed: signals.filter(s => ['property_readiness', 'cash_offset'].includes(s)),
      confidence: 0.75,
    });
  }

  if (depositOnlyReady) {
    return makeRecommendation({
      id: 'delay_property_purchase',
      title: 'Deposit ready, but not strategy-ready',
      actionType: 'delay_property_purchase',
      pillar: 'stabilise_leverage',
      urgency: 'this_quarter',
      riskLevel: 'Med',
      reasoning: `You have deposit firepower (${pct.toFixed(0)}%), but liquidity or serviceability ` +
        `gates fail (buffer ${liqMonths.toFixed(1)} months, service ${fmt(service)}/mo). Buying now would ` +
        `trade safety for leverage — delay until cashflow gates clear.`,
      steps: [
        { step: 'Lift post-purchase buffer to ≥ 3 months' },
        { step: 'Increase serviceability margin (pay down personal debt / raise income)' },
        { step: 'Reassess in 90 days' },
      ],
      alternatives: [
        { title: 'Buy now anyway with smaller deposit', whyAlternative: 'Faster portfolio growth', tradeoff: 'LMI + thin buffer' },
        { title: 'Pivot to ETF DCA', whyAlternative: 'Keeps liquidity intact', tradeoff: 'Less leverage / no rental income' },
      ],
      benefitLabel: 'Avoids leveraged liquidity squeeze',
      cta: { label: 'Open Property', route: '/property' },
      impact: { confidence: 0.85 },
      riskReductionImpact: { points: 10, categoriesAffected: ['cashflow', 'debt'] },
      watchSignals: ['property_readiness', 'cash_offset', 'monte_carlo_v5'],
      surfaces: ['action_centre', 'property'],
      signalsUsed: signals.filter(s => ['property_readiness', 'cash_offset'].includes(s)),
      confidence: 0.88,
    });
  }

  return null;
}

/**
 * Compute the maximum monthly $ amount the recommendation engine can safely
 * deploy AFTER the household's required outflows. This is the cap every
 * monthly-allocation recommendation (currently DCA) must honour:
 *
 *   safeDeployableSurplus =
 *       canonical monthly surplus (income − expenses)
 *     − any monthly debt service not already inside expenses
 *     − a 10% safety buffer slice (rounds the cap down for sequence risk)
 *     − the monthly amortisation of any emergency-buffer shortfall (so we
 *       refill the buffer before opening new positions)
 *
 * The result is floored at 0 — when surplus turns negative the engine
 * surfaces a "do not start new DCA" message instead of a negative cap.
 *
 * IMPORTANT: this MUST stay <= the dashboard headline surplus (which is
 * `selectMonthlySurplus`). The dashboard surplus is computed BEFORE the
 * safety buffer, so as long as we only ever shrink it here we cannot
 * recommend a DCA that exceeds the user's actual surplus.
 */
function computeSafeDeployableSurplus(s: UnifiedSignals): {
  monthlyIncomeUsed: number;
  monthlyExpensesUsed: number;
  monthlyDebtRepaymentsUsed: number;
  bufferShortfallReserved: number;
  safeDeployableSurplus: number;
  /** Plain English description for the reconciliation UI. */
  explanation: string;
} {
  const income = num(s.monthlyIncome);
  const expenses = num(s.monthlyExpenses);
  const reportedSurplus = num(s.monthlySurplus);
  const expensesIncludeDebt = s.expensesIncludeDebt !== false; // default true → don't double-subtract
  const debtService = expensesIncludeDebt ? 0 : Math.max(0, num(s.monthlyDebtService));

  // Baseline = canonical dashboard surplus. Fall back to income − expenses
  // (− debt where applicable) only when monthlySurplus wasn't supplied.
  const baseline = (reportedSurplus !== 0 || (income === 0 && expenses === 0))
    ? reportedSurplus
    : Math.max(0, income - expenses - debtService);

  // Reserve a 1/12th amortisation of any emergency-buffer shortfall — refill
  // the buffer over a year rather than ignoring it.
  const buffer = num(s.emergencyBufferTarget);
  const cash = num(s.cashOutsideOffset);
  const offset = num(s.offsetBalance);
  const liquid = cash + offset;
  const shortfall = Math.max(0, buffer - liquid);
  const bufferAmortisation = shortfall > 0 ? Math.round(shortfall / 12) : 0;

  // 10% safety slice for sequence risk / lumpy spend.
  const safetySlice = Math.max(0, Math.round(baseline * 0.10));

  const safe = Math.max(0, Math.round(baseline - debtService - bufferAmortisation - safetySlice));

  const parts: string[] = [
    `monthly income ${fmt(income)} − expenses ${fmt(expenses)}`,
  ];
  if (debtService > 0) parts.push(`− debt service ${fmt(debtService)}`);
  if (bufferAmortisation > 0) parts.push(`− buffer top-up ${fmt(bufferAmortisation)}/mo`);
  if (safetySlice > 0) parts.push(`− 10% safety slice ${fmt(safetySlice)}`);
  parts.push(`= safe deployable surplus ${fmt(safe)}/mo`);

  return {
    monthlyIncomeUsed: Math.round(income),
    monthlyExpensesUsed: Math.round(expenses),
    monthlyDebtRepaymentsUsed: Math.round(debtService),
    bufferShortfallReserved: Math.round(bufferAmortisation),
    safeDeployableSurplus: safe,
    explanation: parts.join(' '),
  };
}

function etfDCA(
  s: UnifiedSignals,
  signals: SourceSignal[],
  portfolio?: DebtPortfolioSummary,
): Recommendation | null {
  const surplus = num(s.monthlySurplus);
  if (surplus < 500) return null;
  // Safety: only block ETF DCA when there is genuine high-APR debt, not when
  // the user simply has 0%/strategic/mortgage debt on file.
  if (portfolio?.hasUrgentHighAprDebt) return null;
  const cash = num(s.cashOutsideOffset);
  const buffer = num(s.emergencyBufferTarget);
  if (cash + num(s.offsetBalance) < buffer) return null;

  // ── Safe deployable surplus cap ─────────────────────────────────────────
  // The recommended DCA can NEVER exceed the dashboard headline surplus
  // after required buffers, debt minimums and a small safety slice. Any
  // discrepancy between the surplus the dashboard renders and the surplus
  // the recommendation engine uses would otherwise produce contradictory
  // advice (e.g. "DCA $9k/mo" when the dashboard shows a $7k surplus).
  const sds = computeSafeDeployableSurplus(s);
  // Half-of-surplus heuristic, BUT floor at the safe deployable surplus.
  const half = Math.round(surplus * 0.5 / 100) * 100;
  const dca = Math.max(0, Math.min(half, Math.floor(sds.safeDeployableSurplus / 100) * 100));
  if (dca < 200) return null; // not worth surfacing — engine stays quiet
  const retPct = num(s.etfExpectedReturn, 0.095);
  const gain = dca * 12 * retPct;

  const surplusReconciliation = {
    ...sds,
    recommendedMonthlyAmount: dca,
    remainingMonthlyBuffer: Math.max(0, sds.safeDeployableSurplus - dca),
    explanation: `${sds.explanation}. Recommended DCA capped at ${fmt(dca)}/mo (≤ safe deployable surplus); ${fmt(Math.max(0, sds.safeDeployableSurplus - dca))}/mo remains as flexible buffer.`,
  };

  // Title makes the cap visible so the UI does not need to interpret it.
  const dcaTitle = dca < half
    ? `DCA up to ${fmt(dca)}/month after buffer and debt obligations`
    : `DCA ${fmt(dca)}/mo of surplus into diversified ETFs`;

  const rec = makeRecommendation({
    id: 'etf_dca',
    title: dcaTitle,
    actionType: 'etf_dca',
    pillar: 'improve_fire_timeline',
    urgency: 'this_year',
    riskLevel: 'Med',
    reasoning:
      // Lead with the strategic story (one short sentence) so card previews
      // and the Daily Briefing summary read cleanly without truncation. The
      // full reconciliation breakdown lives in the `surplusReconciliation`
      // block, which the Daily Briefing renders below as a structured grid.
      `${fmt(dca)}/mo into broad-market ETFs (VAS+VGS) is within your safe deployable surplus ` +
      `and compounds at ~${(retPct * 100).toFixed(1)}%, an expected ${fmt(gain)}/yr. ` +
      `Dollar-cost averaging removes market-timing risk. ${surplusReconciliation.explanation}`,
    steps: [
      { step: 'Set up auto-buy on a discount broker' },
      { step: 'Diversify across VAS / VGS / VAE for global coverage' },
      { step: 'Rebalance annually if any allocation drifts >5%' },
    ],
    alternatives: [
      { title: 'Lump-sum invest accumulated cash', whyAlternative: 'Maximises time in market', tradeoff: 'Higher entry-timing risk' },
      { title: 'Boost super salary sacrifice', whyAlternative: 'Better tax treatment', tradeoff: 'Locked till preservation age' },
    ],
    benefitLabel: `~${fmt(gain)}/yr expected`,
    cta: { label: 'Open Stocks', route: '/stocks' },
    impact: { annualDollar: gain, expectedReturnPct: retPct * 100, confidence: 0.55 },
    fireImpact: { yearsDelta: 0.4 },
    watchSignals: ['ledger_income_expense', 'monte_carlo_v5'],
    surfaces: ['best_move', 'action_centre'],
    signalsUsed: signals.filter(s => ['ledger_income_expense', 'snapshot'].includes(s)),
    confidence: 0.7,
  });
  rec.surplusReconciliation = surplusReconciliation;
  return rec;
}

function fireAccelerate(s: UnifiedSignals, signals: SourceSignal[]): Recommendation | null {
  if (s.fireYearsToTarget == null) return null;
  const surv = num(s.mcSurvivalProbability, 0.6);
  if (surv >= 0.85) return null;
  const required = num(s.fireMonthlyInvestmentRequired);
  if (required <= 0) return null;
  return makeRecommendation({
    id: 'fire_acceleration',
    title: `Lift monthly investing to ${fmt(required)} to protect FIRE timeline`,
    actionType: 'fire_acceleration',
    pillar: 'improve_fire_timeline',
    urgency: 'this_quarter',
    riskLevel: 'Med',
    reasoning: `Monte Carlo survival probability is ${(surv * 100).toFixed(0)}% — below the 85% target. ` +
      `Raising monthly contributions to ~${fmt(required)} closes the gap.`,
    steps: [
      { step: 'Audit discretionary spend categories' },
      { step: 'Redirect savings into super + ETFs in tax-optimal ratio' },
      { step: 'Re-run Monte Carlo after one quarter' },
    ],
    alternatives: [
      { title: 'Push FIRE date out 1-2 yrs', whyAlternative: 'Easier on cashflow', tradeoff: 'Longer time at work' },
      { title: 'Take more growth exposure', whyAlternative: 'Higher expected return', tradeoff: 'Larger sequence-risk drawdowns' },
    ],
    benefitLabel: `Lifts survival probability above 85%`,
    cta: { label: 'Open FIRE Plan', route: '/fire-path' },
    impact: { confidence: 0.6 },
    fireImpact: { probabilityDelta: 0.25 },
    watchSignals: ['fire_engine', 'monte_carlo_v5'],
    surfaces: ['best_move', 'action_centre', 'fire'],
    signalsUsed: signals.filter(s => ['fire_engine', 'monte_carlo_v5'].includes(s)),
    confidence: 0.7,
  });
}

function reduceLeverageIfStressed(s: UnifiedSignals, signals: SourceSignal[]): Recommendation | null {
  const stress = s.mcStressFlag;
  const ppor = num(s.ppor);
  const mort = num(s.mortgage);
  // Sprint 3B H-5 — total portfolio LVR. The previous version used only
  // `mortgage / ppor`, which evaluated to 0 whenever the snapshot didn't
  // carry a PPOR value or when IP debt dominated. The result was the
  // user-visible "currently 0% LVR" text in the Risk Radar recommendation
  // — undermining trust even when the underlying score was correct.
  //
  // We now sum mortgage + IP loans + non-mortgage debts that look like
  // secured property loans against PPOR + IP value, and fall back to
  // mortgage/PPOR only when no broader signal is available.
  const ipLoans = (s.debtPortfolio ?? [])
    .filter(d => !d?.planned && (d?.type === 'mortgage' || d?.type === 'investment_loan'))
    .reduce((sum, d) => sum + num(d?.balance), 0);
  const totalPropertyDebt = mort + Math.max(0, ipLoans - mort); // de-dup if mortgage included
  const totalPropertyValue = ppor; // IP values aren't on s yet; fall back to PPOR base
  let lvr = totalPropertyValue > 0 ? totalPropertyDebt / totalPropertyValue : 0;
  // Guard: never report 0% LVR when meaningful debt exists. If only mortgage
  // is present and PPOR is 0 (data hole), express it as the legacy ratio.
  if (lvr === 0 && mort > 0 && ppor > 0) lvr = mort / ppor;
  if (stress !== 'severe' && lvr < 0.8) return null;
  // Display rule — when LVR is genuinely 0 (no debt) we suppress the "currently"
  // clause entirely rather than showing "currently 0%".
  const lvrDisplay = lvr > 0
    ? ` (currently ${(lvr * 100).toFixed(0)}%)`
    : '';
  return makeRecommendation({
    id: 'reduce_leverage',
    title: 'Reduce leverage — stress signals elevated',
    actionType: 'reduce_leverage',
    pillar: 'stabilise_leverage',
    urgency: 'this_quarter',
    riskLevel: 'Med',
    reasoning: `Combined leverage and Monte Carlo stress flag indicate fragility. Reducing LVR${lvrDisplay} lowers tail risk in a downturn.`,
    steps: [
      { step: 'Direct surplus to principal' },
      { step: 'Avoid new credit until LVR < 70%' },
      { step: 'Consider refinance to a fixed component to lock rate risk' },
    ],
    alternatives: [
      { title: 'Refinance + restructure', whyAlternative: 'Better terms / structure', tradeoff: 'Application + break fees' },
      { title: 'Sell an underperforming asset', whyAlternative: 'Larger LVR drop', tradeoff: 'CGT + transaction friction' },
    ],
    benefitLabel: 'Lowers tail risk in a downturn',
    cta: { label: 'Open Debt Strategy', route: '/debt-strategy' },
    impact: { confidence: 0.6 },
    riskReductionImpact: { points: 14, categoriesAffected: ['debt'] },
    watchSignals: ['monte_carlo_v5', 'debt_balances'],
    surfaces: ['action_centre', 'debt'],
    signalsUsed: signals.filter(s => ['monte_carlo_v5', 'debt_balances'].includes(s)),
    confidence: 0.72,
  });
}

function rebalanceIfNeeded(s: UnifiedSignals, signals: SourceSignal[]): Recommendation | null {
  if (s.preference?.riskTolerance == null) return null;
  return makeRecommendation({
    id: 'rebalance_portfolio',
    title: 'Rebalance portfolio toward profile target',
    actionType: 'rebalance_portfolio',
    pillar: 'maintain_investing_discipline',
    urgency: 'this_year',
    riskLevel: 'Low',
    reasoning: `Your stated risk preference suggests a different asset mix than the implied current allocation. ` +
      `Rebalancing harvests gains in winners and tops up laggards.`,
    steps: [
      { step: 'Compute current allocation vs profile target' },
      { step: 'Sell over-weight slices into under-weight slices' },
      { step: 'Be mindful of CGT timing' },
    ],
    alternatives: [
      { title: 'Rebalance via new contributions only', whyAlternative: 'Avoids realising CGT', tradeoff: 'Slower drift correction' },
    ],
    benefitLabel: 'Aligns to risk profile',
    cta: { label: 'Open Stocks', route: '/stocks' },
    impact: { confidence: 0.5 },
    watchSignals: ['investor_preference'],
    surfaces: ['action_centre'],
    signalsUsed: signals.filter(s => ['investor_preference', 'snapshot'].includes(s)),
    confidence: 0.6,
  });
}

function holdCashFallback(s: UnifiedSignals, signals: SourceSignal[]): Recommendation {
  const offset = num(s.offsetBalance);
  const rate = num(s.mortgageRate, 0.0625);
  return makeRecommendation({
    id: 'hold_cash_fallback',
    title: 'No urgent move — keep cash in offset',
    actionType: 'hold_cash_offset',
    pillar: 'maintain_investing_discipline',
    urgency: 'monitor',
    riskLevel: 'Low',
    reasoning: `Buffer met, debts low, investing on track. Your offset balance is already saving ` +
      `${fmt(offset * rate)}/yr in mortgage interest.`,
    steps: [
      { step: 'Continue current contributions' },
      { step: 'Re-check when next snapshot updates' },
    ],
    alternatives: [
      { title: 'Lift DCA aggressiveness', whyAlternative: 'Faster wealth growth', tradeoff: 'Volatility' },
    ],
    benefitLabel: `${fmt(offset * rate)}/yr already saved`,
    cta: { label: 'Open Dashboard', route: '/dashboard' },
    impact: { annualDollar: offset * rate, confidence: 0.95 },
    surfaces: ['best_move', 'action_centre'],
    signalsUsed: signals,
    confidence: 0.85,
  });
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export function computeUnifiedRecommendations(s: UnifiedSignals): UnifiedRecommendationResult {
  const signals = signalsAvailable(s);
  const portfolio = buildDebtPortfolio(s);

  const candidates: Recommendation[] = [];
  const push = (r: Recommendation | null) => { if (r) candidates.push(r); };

  push(buildEmergencyBuffer(s, signals));
  push(planPromoExpiry(s, signals, portfolio));
  push(payHighInterestDebt(s, signals, portfolio));
  push(maintainInterestFreeDebt(s, signals, portfolio));
  push(monitorStrategicDebt(s, signals, portfolio));
  push(reduceLeverageIfStressed(s, signals));
  push(propertyAction(s, signals));
  push(holdCashOffset(s, signals));
  push(increaseSuper(s, signals));
  push(fireAccelerate(s, signals));
  push(etfDCA(s, signals, portfolio));
  push(rebalanceIfNeeded(s, signals));

  if (candidates.length === 0) {
    candidates.push(holdCashFallback(s, signals));
  }

  // ─── Hard-priority sort by pillar, then by confidence × magnitude ──────────
  const scored = candidates.map(c => {
    const { score, breakdown } = scoreCandidateWithBreakdown(c, s);
    // Attach the breakdown so every consumer can render score transparency.
    c.scoreBreakdown = breakdown;
    return { rec: c, score };
  });

  const sorted = scored
    .sort((a, b) => {
      const pa = PILLAR_RANK[a.rec.pillar];
      const pb = PILLAR_RANK[b.rec.pillar];
      if (pa !== pb) return pa - pb;
      return b.score - a.score;
    })
    .map(({ rec }, i) => {
      rec.priorityRank = i + 1;
      return rec;
    });

  // De-duplicate by id (keep first).
  const seen = new Set<string>();
  const dedup = sorted.filter(r => seen.has(r.id) ? false : (seen.add(r.id), true));

  const top = dedup.slice(0, 3);
  const best = top[0];

  return {
    bestMove: best,
    topPriorities: top,
    all: dedup,
    riskBeingReduced: deriveRiskBeingReduced(best),
    signalCoverage: signals,
    generatedAt: new Date().toISOString(),
    deprecatedActionTypes: [...DEPRECATED_ACTION_TYPES],
  };
}

/**
 * Action types that are declared in the ActionType union (for backward-compat
 * with downstream consumers) but are NOT currently emitted by any candidate
 * builder. The audit surfaces these so the dashboard can show that they were
 * considered and intentionally skipped rather than appearing dead/stale.
 *
 * Per P1 audit findings:
 *  - crypto_dca: ungrounded; no candidate builder. Surface remains but is
 *    not part of headline recommendations until a real builder lands.
 *  - refinance_restructure: no builder. monitor_strategic_debt covers refi
 *    monitoring; explicit restructure advice requires deeper input.
 *  - pause_investing: shallow; covered by stress-flag dampening of etf_dca.
 *  - improve_cashflow: shallow; covered by buildEmergencyBuffer + holdCashOffset.
 *  - tax_optimisation: shallow; increase_super carries the tax pillar.
 */
const DEPRECATED_ACTION_TYPES: ActionType[] = [
  'crypto_dca',
  'refinance_restructure',
  'pause_investing',
  'improve_cashflow',
  'tax_optimisation',
];

interface ScoreModifier {
  id: string;
  source: NonNullable<Recommendation['scoreBreakdown']>['modifiers'][number]['source'];
  multiplier: number;
  reason: string;
}

/**
 * Compute the ranking score AND a structured breakdown of every modifier that
 * was applied. Behaviour is identical to the prior `scoreCandidate(rec, s)`
 * function — only the return shape changed.
 */
function scoreCandidateWithBreakdown(
  rec: Recommendation,
  s: UnifiedSignals,
): { score: number; breakdown: NonNullable<Recommendation['scoreBreakdown']> } {
  const baseScore = (rec.expectedFinancialImpact.annualDollar ?? 0) * (rec.confidenceScore || 0.5);
  let score = baseScore;
  const modifiers: ScoreModifier[] = [];
  const apply = (id: string, source: ScoreModifier['source'], multiplier: number, reason: string) => {
    if (!Number.isFinite(multiplier) || multiplier === 1) return;
    score *= multiplier;
    modifiers.push({ id, source, multiplier, reason });
  };

  // Investor-preference soft tilts (within same pillar only)
  const pref = s.preference;
  if (pref) {
    if (rec.actionType === 'etf_dca' || rec.actionType === 'fire_acceleration') {
      apply('pref_risk_tolerance', 'preference', 1 + 0.2 * (pref.riskTolerance ?? 0),
        `risk tolerance tilt (${(pref.riskTolerance ?? 0).toFixed(2)})`);
      apply('pref_fire_urgency', 'preference', 1 + 0.3 * (pref.fireUrgency ?? 0),
        `FIRE urgency tilt (${(pref.fireUrgency ?? 0).toFixed(2)})`);
    }
    if (rec.actionType === 'proceed_property_purchase' || rec.actionType === 'delay_property_purchase') {
      apply('pref_property_bias', 'preference', 1 + 0.2 * (pref.propertyBias ?? 0),
        `property bias tilt (${(pref.propertyBias ?? 0).toFixed(2)})`);
    }
    if (rec.actionType === 'increase_super') {
      apply('pref_tax_optimisation', 'preference', 1 + 0.3 * (pref.taxOptimisation ?? 0),
        `tax-opt preference tilt (${(pref.taxOptimisation ?? 0).toFixed(2)})`);
    }
  }
  // Stress flag pushes toward conservatism. The legacy code also penalised
  // crypto_dca, but no candidate builder emits it — dead path, intentionally
  // skipped (see DEPRECATED_ACTION_TYPES).
  if (s.mcStressFlag === 'severe') {
    if (rec.actionType === 'etf_dca') {
      apply('stress_dampen_growth', 'stress', 0.7, 'severe MC stress dampens growth-asset DCA');
    }
    if (rec.pillar === 'protect_liquidity' || rec.pillar === 'reduce_high_interest_debt') {
      apply('stress_boost_safety', 'stress', 1.3, 'severe MC stress boosts safety pillars');
    }
  }

  // Phase 5 — Behavioural soft tilts (intra-pillar only).
  const bp = s.behaviouralProfile;
  if (bp?.scores) {
    const sc = bp.scores;
    if (sc.fireUrgency != null && (rec.actionType === 'etf_dca' || rec.actionType === 'fire_acceleration')) {
      apply('bp_fire_urgency', 'behavioural', 1 + 0.25 * (sc.fireUrgency - 0.5),
        `behavioural FIRE urgency (${sc.fireUrgency.toFixed(2)})`);
    }
    if (sc.propertyBias != null && (rec.actionType === 'proceed_property_purchase' || rec.actionType === 'delay_property_purchase')) {
      apply('bp_property_bias', 'behavioural', 1 + 0.2 * sc.propertyBias,
        `behavioural property bias (${sc.propertyBias.toFixed(2)})`);
    }
    if (sc.debtAversion != null && rec.pillar === 'reduce_high_interest_debt') {
      apply('bp_debt_aversion', 'behavioural', 1 + 0.3 * (sc.debtAversion - 0.5),
        `behavioural debt aversion (${sc.debtAversion.toFixed(2)})`);
    }
    if (sc.liquidityPreference != null && rec.pillar === 'protect_liquidity') {
      apply('bp_liquidity_preference', 'behavioural', 1 + 0.2 * sc.liquidityPreference,
        `behavioural liquidity preference (${sc.liquidityPreference.toFixed(2)})`);
    }
    if (sc.volatilityTolerance != null && rec.actionType === 'etf_dca' && sc.volatilityTolerance < -0.2) {
      apply('bp_low_volatility_tolerance', 'behavioural', 0.85,
        `low volatility tolerance dampens growth DCA`);
    }
  }

  // Phase 5 — Autonomous OS soft confirmation (intra-pillar only).
  const findings = s.osFindings ?? [];
  for (const f of findings) {
    if (f.actionTypeHint && f.actionTypeHint === rec.actionType) {
      const sevBoost = f.severity === 'critical' ? 1.4 :
                       f.severity === 'elevated' ? 1.2 :
                       f.severity === 'watch'    ? 1.05 : 1.0;
      apply(`os_${f.detector ?? f.id}`, 'autonomous_os', sevBoost,
        `OS finding ${f.detector ?? f.id} severity=${f.severity}`);
    }
  }

  // Phase 5 — Scenario tree tilt.
  const ctx = s.scenarioContext;
  if (ctx) {
    const insolvency = ctx.probWeightedInsolvencyRisk ?? 0;
    if (insolvency > 0.15) {
      if (rec.pillar === 'protect_liquidity' || rec.pillar === 'prevent_failure') {
        apply('scenario_safety_boost', 'scenario', 1 + insolvency,
          `prob-weighted insolvency risk ${(insolvency * 100).toFixed(0)}% boosts safety`);
      }
      if (rec.pillar === 'maximise_wealth') {
        apply('scenario_wealth_dampen', 'scenario', Math.max(0.6, 1 - insolvency),
          `prob-weighted insolvency risk dampens wealth-max`);
      }
    }
  }

  // Phase 6 — Portfolio construction soft tilts.
  const pt = s.portfolioTilts;
  if (pt) {
    if (rec.actionType === 'etf_dca' && pt.etfPush) {
      apply('pt_etf_push', 'portfolio', 1 + 0.5 * pt.etfPush, `portfolio etfPush=${pt.etfPush.toFixed(2)}`);
    }
    if ((rec.actionType === 'proceed_property_purchase' || rec.actionType === 'delay_property_purchase') && pt.propertyPush) {
      apply('pt_property_push', 'portfolio', 1 + 0.4 * pt.propertyPush, `portfolio propertyPush=${pt.propertyPush.toFixed(2)}`);
    }
    if (rec.actionType === 'hold_cash_offset' && pt.cashHold) {
      apply('pt_cash_hold', 'portfolio', 1 + 0.4 * pt.cashHold, `portfolio cashHold=${pt.cashHold.toFixed(2)}`);
    }
    if (rec.actionType === 'pay_high_interest_debt' && pt.debtPay) {
      apply('pt_debt_pay', 'portfolio', 1 + 0.4 * pt.debtPay, `portfolio debtPay=${pt.debtPay.toFixed(2)}`);
    }
    if (rec.actionType === 'increase_super' && pt.superPush) {
      apply('pt_super_push', 'portfolio', 1 + 0.5 * pt.superPush, `portfolio superPush=${pt.superPush.toFixed(2)}`);
    }
  }

  // Phase 6 — Life context tilt.
  const life = s.lifeContext;
  if (life) {
    if ((life.stressProbability ?? 0) > 0.35 && rec.pillar === 'protect_liquidity') {
      apply('life_stress_prob', 'life', 1.25, `life stress probability ${(life.stressProbability! * 100).toFixed(0)}%`);
    }
    if ((life.liquidityStressMonths ?? 0) > 6 && rec.pillar === 'protect_liquidity') {
      apply('life_liq_months', 'life', 1.15, `${life.liquidityStressMonths} months of liquidity stress ahead`);
    }
    if ((life.fireYearDelayEstimate ?? 0) > 1.5 && rec.pillar === 'improve_fire_timeline') {
      apply('life_fire_delay', 'life', 1.15, `+${life.fireYearDelayEstimate!.toFixed(1)}y FIRE delay risk`);
    }
  }

  // Phase 6 — Tax intelligence tilt.
  const tax = s.taxContext;
  if (tax && rec.pillar === 'preserve_tax_efficiency') {
    const sav = tax.totalEstimatedSaving ?? 0;
    if (sav > 1000) {
      apply('tax_pillar_saving', 'tax', 1 + Math.min(0.3, sav / 30_000),
        `tax pillar boost — est saving ${Math.round(sav)}/yr`);
    }
  }
  if (tax && rec.actionType === 'increase_super' && (tax.totalEstimatedSaving ?? 0) > 0) {
    apply('tax_super_alignment', 'tax', 1.15, 'tax engine flags super contribution as efficient');
  }

  // Phase 6 — Execution OS tilt.
  const ex = s.executionContext;
  if (ex && (ex.overallReadinessPct ?? 100) < 40 && rec.pillar === 'maintain_investing_discipline') {
    apply('exec_low_readiness', 'execution', 0.85,
      `execution readiness ${(ex.overallReadinessPct ?? 0).toFixed(0)}% dampens investing-discipline pillar`);
  }

  // Phase 6 — Adaptive learning multipliers (soft).
  const ad = s.adaptive;
  if (ad) {
    const mAction = ad.rankingMultiplierByActionType?.[rec.actionType];
    if (typeof mAction === 'number') {
      apply('adaptive_action', 'adaptive', mAction, `adaptive action multiplier (${mAction.toFixed(2)})`);
    }
    const wp = ad.pillarWeights?.[rec.pillar];
    if (typeof wp === 'number') {
      apply('adaptive_pillar', 'adaptive', wp, `adaptive pillar weight (${wp.toFixed(2)})`);
    }
  }

  return {
    score,
    breakdown: {
      baseScore,
      finalScore: score,
      pillarRank: PILLAR_RANK[rec.pillar],
      modifiers,
    },
  };
}

function deriveRiskBeingReduced(rec?: Recommendation): string {
  if (!rec) return 'No active risk reduction';
  switch (rec.pillar) {
    case 'prevent_failure':           return 'Catastrophic / insolvency risk';
    case 'protect_liquidity':         return 'Income shock / cashflow shortfall';
    case 'reduce_high_interest_debt': return 'Wealth erosion from high APR debt';
    case 'stabilise_leverage':        return 'Tail-risk from over-leveraged downturn';
    case 'preserve_tax_efficiency':   return 'Avoidable tax leakage';
    case 'maintain_investing_discipline': return 'Idle-cash drag';
    case 'improve_fire_timeline':     return 'Risk of missing FIRE date';
    case 'maximise_wealth':           return 'Sub-optimal long-run wealth growth';
  }
}
