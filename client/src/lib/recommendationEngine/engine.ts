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

function makeRecommendation(opts: CandidateOpts): Recommendation {
  return {
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

function payHighInterestDebt(s: UnifiedSignals, signals: SourceSignal[]): Recommendation | null {
  const debt = num(s.otherDebts);
  if (debt < 1000) return null;
  const rate = num(s.personalDebtRate, 0.17);
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
    reasoning: `Personal/consumer debt at ~${(rate * 100).toFixed(0)}% costs ${fmt(annualCost)}/yr. ` +
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

function etfDCA(s: UnifiedSignals, signals: SourceSignal[]): Recommendation | null {
  const surplus = num(s.monthlySurplus);
  if (surplus < 500) return null;
  if (num(s.otherDebts) > 5_000) return null; // safety: debt outranks
  const cash = num(s.cashOutsideOffset);
  const buffer = num(s.emergencyBufferTarget);
  if (cash + num(s.offsetBalance) < buffer) return null;

  const dca = Math.round(surplus * 0.5 / 100) * 100;
  const retPct = num(s.etfExpectedReturn, 0.095);
  const gain = dca * 12 * retPct;

  return makeRecommendation({
    id: 'etf_dca',
    title: `DCA ${fmt(dca)}/mo of surplus into diversified ETFs`,
    actionType: 'etf_dca',
    pillar: 'improve_fire_timeline',
    urgency: 'this_year',
    riskLevel: 'Med',
    reasoning: `Buffer and debts are clean. Half of monthly surplus (${fmt(dca)}/mo) into broad-market ` +
      `ETFs (e.g. VAS+VGS) compounds at ~${(retPct * 100).toFixed(1)}%, expected gain ${fmt(gain)}/yr. ` +
      `Dollar-cost averaging removes market-timing risk.`,
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
  const lvr = ppor > 0 ? mort / ppor : 0;
  if (stress !== 'severe' && lvr < 0.8) return null;
  return makeRecommendation({
    id: 'reduce_leverage',
    title: 'Reduce leverage — stress signals elevated',
    actionType: 'reduce_leverage',
    pillar: 'stabilise_leverage',
    urgency: 'this_quarter',
    riskLevel: 'Med',
    reasoning: `Combined leverage and Monte Carlo stress flag indicate fragility. Reducing LVR (currently ` +
      `${(lvr * 100).toFixed(0)}%) lowers tail risk in a downturn.`,
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

  const candidates: Recommendation[] = [];
  const push = (r: Recommendation | null) => { if (r) candidates.push(r); };

  push(buildEmergencyBuffer(s, signals));
  push(payHighInterestDebt(s, signals));
  push(reduceLeverageIfStressed(s, signals));
  push(propertyAction(s, signals));
  push(holdCashOffset(s, signals));
  push(increaseSuper(s, signals));
  push(fireAccelerate(s, signals));
  push(etfDCA(s, signals));
  push(rebalanceIfNeeded(s, signals));

  if (candidates.length === 0) {
    candidates.push(holdCashFallback(s, signals));
  }

  // ─── Hard-priority sort by pillar, then by confidence × magnitude ──────────
  const sorted = candidates
    .map(c => ({
      rec: c,
      score: scoreCandidate(c, s),
    }))
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
  };
}

function scoreCandidate(rec: Recommendation, s: UnifiedSignals): number {
  let score = (rec.expectedFinancialImpact.annualDollar ?? 0) * (rec.confidenceScore || 0.5);
  // Investor-preference soft tilts (within same pillar only)
  const pref = s.preference;
  if (pref) {
    if (rec.actionType === 'etf_dca' || rec.actionType === 'fire_acceleration') {
      score *= 1 + 0.2 * (pref.riskTolerance ?? 0);
      score *= 1 + 0.3 * (pref.fireUrgency ?? 0);
    }
    if (rec.actionType === 'proceed_property_purchase' || rec.actionType === 'delay_property_purchase') {
      score *= 1 + 0.2 * (pref.propertyBias ?? 0);
    }
    if (rec.actionType === 'increase_super') {
      score *= 1 + 0.3 * (pref.taxOptimisation ?? 0);
    }
    if (rec.actionType === 'crypto_dca' && (pref.riskTolerance ?? 0) < 0) {
      score *= 0.5;
    }
  }
  // Stress flag pushes toward conservatism
  if (s.mcStressFlag === 'severe') {
    if (rec.actionType === 'etf_dca' || rec.actionType === 'crypto_dca') score *= 0.7;
    if (rec.pillar === 'protect_liquidity' || rec.pillar === 'reduce_high_interest_debt') score *= 1.3;
  }

  // Phase 5 — Behavioural soft tilts (intra-pillar only).
  const bp = s.behaviouralProfile;
  if (bp?.scores) {
    const sc = bp.scores;
    if (sc.fireUrgency != null && (rec.actionType === 'etf_dca' || rec.actionType === 'fire_acceleration')) {
      score *= 1 + 0.25 * (sc.fireUrgency - 0.5);
    }
    if (sc.cryptoBias != null && rec.actionType === 'crypto_dca') {
      score *= 1 + 0.3 * sc.cryptoBias;
    }
    if (sc.propertyBias != null && (rec.actionType === 'proceed_property_purchase' || rec.actionType === 'delay_property_purchase')) {
      score *= 1 + 0.2 * sc.propertyBias;
    }
    if (sc.debtAversion != null && rec.pillar === 'reduce_high_interest_debt') {
      score *= 1 + 0.3 * (sc.debtAversion - 0.5);
    }
    if (sc.liquidityPreference != null && rec.pillar === 'protect_liquidity') {
      score *= 1 + 0.2 * sc.liquidityPreference;
    }
    if (sc.volatilityTolerance != null && (rec.actionType === 'etf_dca' || rec.actionType === 'crypto_dca')) {
      // Pull back risk assets when user is loss averse.
      if (sc.volatilityTolerance < -0.2) score *= 0.85;
    }
  }

  // Phase 5 — Autonomous OS soft confirmation (intra-pillar only).
  const findings = s.osFindings ?? [];
  for (const f of findings) {
    if (f.actionTypeHint && f.actionTypeHint === rec.actionType) {
      const sevBoost = f.severity === 'critical' ? 1.4 :
                       f.severity === 'elevated' ? 1.2 :
                       f.severity === 'watch'    ? 1.05 : 1.0;
      score *= sevBoost;
    }
  }

  // Phase 5 — Scenario tree tilt: high probability-weighted liquidity/insolvency risk
  // amplifies safety pillars; low risk amplifies wealth pillars.
  const ctx = s.scenarioContext;
  if (ctx) {
    const insolvency = ctx.probWeightedInsolvencyRisk ?? 0;
    if (insolvency > 0.15) {
      if (rec.pillar === 'protect_liquidity' || rec.pillar === 'prevent_failure') score *= 1 + insolvency;
      if (rec.pillar === 'maximise_wealth') score *= Math.max(0.6, 1 - insolvency);
    }
  }

  // Phase 6 — Portfolio construction soft tilts (intra-pillar only).
  const pt = s.portfolioTilts;
  if (pt) {
    if (rec.actionType === 'etf_dca' && pt.etfPush) score *= 1 + 0.5 * pt.etfPush;
    if ((rec.actionType === 'proceed_property_purchase' || rec.actionType === 'delay_property_purchase') && pt.propertyPush) score *= 1 + 0.4 * pt.propertyPush;
    if (rec.actionType === 'hold_cash_offset' && pt.cashHold) score *= 1 + 0.4 * pt.cashHold;
    if (rec.actionType === 'pay_high_interest_debt' && pt.debtPay) score *= 1 + 0.4 * pt.debtPay;
    if (rec.actionType === 'increase_super' && pt.superPush) score *= 1 + 0.5 * pt.superPush;
    if (rec.actionType === 'crypto_dca' && pt.cryptoTrim) score *= Math.max(0.5, 1 - 0.6 * pt.cryptoTrim);
  }

  // Phase 6 — Life context tilt: pending stress / buffer drain amplifies liquidity pillar.
  const life = s.lifeContext;
  if (life) {
    if ((life.stressProbability ?? 0) > 0.35 && rec.pillar === 'protect_liquidity') score *= 1.25;
    if ((life.liquidityStressMonths ?? 0) > 6 && rec.pillar === 'protect_liquidity') score *= 1.15;
    if ((life.fireYearDelayEstimate ?? 0) > 1.5 && rec.pillar === 'improve_fire_timeline') score *= 1.15;
  }

  // Phase 6 — Tax intelligence tilt: amplify tax-pillar items proportional to dollar savings.
  const tax = s.taxContext;
  if (tax && rec.pillar === 'preserve_tax_efficiency') {
    const sav = tax.totalEstimatedSaving ?? 0;
    if (sav > 1000) score *= 1 + Math.min(0.3, sav / 30_000);
  }
  if (tax && rec.actionType === 'increase_super' && (tax.totalEstimatedSaving ?? 0) > 0) {
    score *= 1.15;
  }

  // Phase 6 — Execution OS tilt: when overall readiness is low and pillar is investing discipline, mild dampen.
  const ex = s.executionContext;
  if (ex && (ex.overallReadinessPct ?? 100) < 40 && rec.pillar === 'maintain_investing_discipline') {
    score *= 0.85;
  }

  // Phase 6 — Adaptive learning multipliers (soft).
  const ad = s.adaptive;
  if (ad) {
    const mAction = ad.rankingMultiplierByActionType?.[rec.actionType];
    if (typeof mAction === 'number') score *= mAction;
    const wp = ad.pillarWeights?.[rec.pillar];
    if (typeof wp === 'number') score *= wp;
  }
  return score;
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
