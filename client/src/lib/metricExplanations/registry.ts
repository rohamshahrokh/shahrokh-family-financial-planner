/**
 * Metric Explanation Registry — the canonical knowledge base.
 *
 * One entry per metric the dashboard surfaces as a primary indicator.
 * Each entry is a self-contained translation layer: definition, why it
 * matters, semantic threshold ladder, ranges in plain English, what
 * influences the reading, and what to do about it.
 *
 * Coverage requirement (FWL_HUMAN_INTELLIGENCE_TRANSLATION_LAYER_V2):
 *   liquidity, leverage, fire-progress, debt-pressure, survivability,
 *   risk-state, confidence, monte-carlo-probability, stress-signals,
 *   strategic-leverage, dca-recommendation, macro-regime,
 *   scenario-confidence, tail-risk, runway, portfolio-volatility,
 *   allocation-drift, withdrawal-sustainability.
 */

import type { MetricExplanation } from './types';
import { EXTENDED_EXPLANATIONS, REQUIRED_EXTENDED_IDS } from './extendedRegistry';

const CORE_METRIC_EXPLANATIONS: Record<string, MetricExplanation> = {
  // ── 1. Liquidity (months of expenses in liquid cash) ──────────────────────
  liquidity: {
    id: 'liquidity',
    title: 'Liquidity',
    unit: 'months of expenses',
    direction: 'higher',
    definition:
      'How many months of household expenses you could cover from cash, offset and other liquid balances if income stopped tomorrow.',
    whyItMatters:
      'Liquidity is the shock absorber that protects long-horizon decisions. Healthy liquidity stops a short-term cash crunch from forcing you to sell investments at the worst possible time.',
    ranges: [
      { state: 'excellent', range: '12+ months', meaning: 'Family-office grade buffer — you can sustain a major income disruption without touching investments.' },
      { state: 'strong', range: '6 – 12 months', meaning: 'Comfortable runway. Most families and lenders treat this as fully resilient.' },
      { state: 'healthy', range: '3 – 6 months', meaning: 'Adequate but tight under multi-month shock.' },
      { state: 'moderate', range: '2 – 3 months', meaning: 'Below recommended floor — bridge income gaps but no real shock buffer.' },
      { state: 'stressed', range: 'under 2 months', meaning: 'A single missed pay cycle would force asset sales or new debt.' },
    ],
    influences: [
      'Cash + offset balances (numerator)',
      'Monthly expense run-rate (denominator)',
      'Buffer top-up cadence inside the DCA plan',
    ],
    improvementActions: [
      'Direct surplus into the offset / emergency buffer until ≥ 6 months covered',
      'Lower fixed monthly expenses (subscriptions, lifestyle creep) to lift the ratio mechanically',
      'Hold next windfall (bonus, tax refund) in cash before deploying',
    ],
    thresholds: [
      { state: 'excellent', gte: 12 },
      { state: 'strong', gte: 6 },
      { state: 'healthy', gte: 3 },
      { state: 'moderate', gte: 2 },
      { state: 'stressed', gte: 0 },
    ],
    interpretation: (months, state) =>
      state === 'excellent' || state === 'strong'
        ? `Liquidity buffer is ${months.toFixed(1)} months — fully absorbs income shocks.`
        : state === 'healthy'
        ? `Liquidity at ${months.toFixed(1)} months — adequate but not a real shock buffer yet.`
        : `Liquidity is ${months.toFixed(1)} months — rebuild to ≥ 6 before scaling risk.`,
  },

  // ── 2. Leverage (debt / assets) ───────────────────────────────────────────
  leverage: {
    id: 'leverage',
    title: 'Leverage',
    unit: '% of assets financed by debt',
    direction: 'lower',
    definition:
      'Share of total assets financed by debt. Low leverage means more of what you own is actually yours.',
    whyItMatters:
      'Leverage amplifies both returns and stress. Strategic leverage on appreciating assets compounds wealth; excess leverage on depreciating or volatile assets is the most common cause of forced selling.',
    ranges: [
      { state: 'excellent', range: 'under 30%', meaning: 'Conservative — substantial equity cushion against price falls.' },
      { state: 'strong', range: '30 – 50%', meaning: 'Comfortable for a household with appreciating assets and steady income.' },
      { state: 'healthy', range: '50 – 65%', meaning: 'Within mainstream Australian household range.' },
      { state: 'moderate', range: '65 – 75%', meaning: 'Elevated — sensitive to LVR shocks and rate rises.' },
      { state: 'elevated', range: '75 – 85%', meaning: 'Stretched — small declines can trigger covenant pressure.' },
      { state: 'stressed', range: 'over 85%', meaning: 'High forced-sale risk under a downturn.' },
    ],
    influences: [
      'Mortgage and investment loan balances',
      'Property and portfolio market values',
      'Pace of principal repayments',
    ],
    improvementActions: [
      'Direct surplus into highest-interest debt first',
      'Avoid drawing equity until LVR < 65%',
      'Use principal recycling rather than interest-only on PPOR if cashflow allows',
    ],
    thresholds: [
      { state: 'excellent', lte: 30 },
      { state: 'strong', lte: 50 },
      { state: 'healthy', lte: 65 },
      { state: 'moderate', lte: 75 },
      { state: 'elevated', lte: 85 },
      { state: 'stressed', lte: 200 },
    ],
    interpretation: (pct, state) =>
      state === 'excellent' || state === 'strong'
        ? `Leverage at ${Math.round(pct)}% — strategic, comfortably within tolerance.`
        : state === 'healthy'
        ? `Leverage at ${Math.round(pct)}% — within mainstream range, monitor under rate rises.`
        : `Leverage at ${Math.round(pct)}% — meaningful tail-risk if asset prices fall sharply.`,
  },

  // ── 3. FIRE Progress ──────────────────────────────────────────────────────
  'fire-progress': {
    id: 'fire-progress',
    title: 'FIRE Progress',
    unit: '% of target capital reached',
    direction: 'higher',
    definition:
      'How far you have travelled toward the capital required for financial independence at your chosen withdrawal rate.',
    whyItMatters:
      'FIRE progress is the single best long-horizon north-star: it folds savings, returns, debt paydown and time into one number. Movement here is the result of every other lever pulling in the same direction.',
    ranges: [
      { state: 'excellent', range: '80%+', meaning: 'Within striking distance — the last 20% is the easiest because of compounding.' },
      { state: 'strong', range: '50 – 80%', meaning: 'Mid-journey. Sequence-of-returns risk starts to matter.' },
      { state: 'healthy', range: '30 – 50%', meaning: 'Solid foundation — compounding is starting to work for you.' },
      { state: 'moderate', range: '15 – 30%', meaning: 'Early but on the curve. Savings rate is the dominant lever.' },
      { state: 'elevated', range: 'under 15%', meaning: 'Foundation phase — focus on contributions, not allocation.' },
    ],
    influences: [
      'Investable capital growth (markets + contributions)',
      'Target lifestyle assumption (the FIRE number itself)',
      'Withdrawal rate assumption (3.5%, 4.0%)',
    ],
    improvementActions: [
      'Lift effective savings rate via surplus-to-investment DCA',
      'Review the target lifestyle — small reductions compound the milestone forward by years',
      'Re-run the Monte Carlo when adding a new income stream or paying down a major debt',
    ],
    thresholds: [
      { state: 'excellent', gte: 80 },
      { state: 'strong', gte: 50 },
      { state: 'healthy', gte: 30 },
      { state: 'moderate', gte: 15 },
      { state: 'elevated', gte: 0 },
    ],
    interpretation: (pct, state) =>
      state === 'excellent' || state === 'strong'
        ? `${Math.round(pct)}% of target — sequence-of-returns risk becomes the dominant concern.`
        : state === 'healthy'
        ? `${Math.round(pct)}% of target — compounding is now meaningful, keep the savings rate steady.`
        : `${Math.round(pct)}% of target — foundation phase; contribution discipline dominates.`,
  },

  // ── 4. Debt Pressure ──────────────────────────────────────────────────────
  'debt-pressure': {
    id: 'debt-pressure',
    title: 'Debt Pressure',
    unit: '% of cashflow servicing debt',
    direction: 'lower',
    definition:
      'Share of your monthly cashflow consumed by mandatory debt repayments. Distinct from leverage: this measures the burn rate, not the balance.',
    whyItMatters:
      'Pressure (not size) determines distress. A large mortgage at low rates with strong income is comfortable; a smaller debt at high APR can starve every other goal.',
    ranges: [
      { state: 'excellent', range: 'under 20%', meaning: 'Debt is comfortably absorbed by cashflow.' },
      { state: 'strong', range: '20 – 30%', meaning: 'Healthy serviceability with room to invest.' },
      { state: 'healthy', range: '30 – 40%', meaning: 'Within bank serviceability norms.' },
      { state: 'moderate', range: '40 – 50%', meaning: 'Tight — limited room for surprises.' },
      { state: 'elevated', range: '50 – 60%', meaning: 'Cashflow constrained; little surplus left to deploy.' },
      { state: 'stressed', range: 'over 60%', meaning: 'Debt is the dominant outflow — reduce balances before anything else.' },
    ],
    influences: [
      'Loan APRs (cash rate moves)',
      'Monthly repayment structure (P&I vs IO)',
      'Net income (after-tax cashflow)',
    ],
    improvementActions: [
      'Refinance / consolidate the highest-APR debt first',
      'Switch high-pressure non-deductible debt to P&I to mechanically clear it',
      'Build surplus capacity (income up or expenses down) before adding leverage',
    ],
    thresholds: [
      { state: 'excellent', lte: 20 },
      { state: 'strong', lte: 30 },
      { state: 'healthy', lte: 40 },
      { state: 'moderate', lte: 50 },
      { state: 'elevated', lte: 60 },
      { state: 'stressed', lte: 1_000 },
    ],
    interpretation: (pct, state) =>
      state === 'excellent' || state === 'strong'
        ? `Debt is strategic — only ${Math.round(pct)}% of cashflow services it.`
        : state === 'healthy'
        ? `Debt service at ${Math.round(pct)}% — within bank tolerance, surplus deployment still feasible.`
        : `Debt service at ${Math.round(pct)}% — pressure dominates cashflow; reduce balance before scaling risk.`,
  },

  // ── 5. Survivability (months of runway net of passive income) ────────────
  survivability: {
    id: 'survivability',
    title: 'Survivability',
    unit: 'months without active income',
    direction: 'higher',
    definition:
      'Months your household can survive if active income disappears, after offsetting passive income against expenses.',
    whyItMatters:
      'A long survivability window converts career or business risk from existential to inconvenient. It is the single number a job-loss conversation should start with.',
    ranges: [
      { state: 'excellent', range: '24+ months', meaning: 'Career-optional — you can take an extended sabbatical or rebuild.' },
      { state: 'strong', range: '12 – 24 months', meaning: 'A full cycle of job search / business pivot is comfortable.' },
      { state: 'healthy', range: '6 – 12 months', meaning: 'Standard professional buffer.' },
      { state: 'moderate', range: '3 – 6 months', meaning: 'Tight — most career transitions take this long.' },
      { state: 'stressed', range: 'under 3 months', meaning: 'A job loss would force material lifestyle changes immediately.' },
    ],
    influences: [
      'Liquid cash + offset',
      'Expense run-rate',
      'Passive income (rent, dividends, interest, distributions)',
    ],
    improvementActions: [
      'Increase passive income (additional shares, rent reviews, dividend reinvestment)',
      'Rebuild emergency buffer to ≥ 12 months of net burn',
      'Defer discretionary spend during income-disruption-prone quarters',
    ],
    thresholds: [
      { state: 'excellent', gte: 24 },
      { state: 'strong', gte: 12 },
      { state: 'healthy', gte: 6 },
      { state: 'moderate', gte: 3 },
      { state: 'stressed', gte: 0 },
    ],
    interpretation: (m, state) =>
      state === 'excellent' || state === 'strong'
        ? `Survivability ≈ ${Number.isFinite(m) ? m.toFixed(0) : '∞'} months — career risk is contained.`
        : state === 'healthy'
        ? `Survivability ≈ ${m.toFixed(0)} months — adequate, but rebuild to 12+ when surplus allows.`
        : `Survivability only ${m.toFixed(0)} months — a job loss would force immediate lifestyle change.`,
  },

  // ── 6. Risk State (composite 0-100) ───────────────────────────────────────
  'risk-state': {
    id: 'risk-state',
    title: 'Risk State',
    unit: 'composite score 0–100',
    direction: 'higher',
    definition:
      'Composite risk score from the Behavioural & Risk Engines — higher means the portfolio is more resilient to the next 12 months of shocks.',
    whyItMatters:
      'Risk state translates dozens of inputs (concentration, leverage, liquidity, drawdown sensitivity) into a single readable number you can monitor week-on-week.',
    ranges: [
      { state: 'excellent', range: '85 – 100', meaning: 'Family-office grade resilience — no major identified concentration.' },
      { state: 'strong', range: '70 – 85', meaning: 'Well diversified, leverage and liquidity in safe zones.' },
      { state: 'healthy', range: '55 – 70', meaning: 'Healthy with one or two watch-items.' },
      { state: 'moderate', range: '40 – 55', meaning: 'Mixed — investigate which sub-signals are dragging the score.' },
      { state: 'elevated', range: '25 – 40', meaning: 'Multiple stress signals active — rebalance before adding risk.' },
      { state: 'stressed', range: 'under 25', meaning: 'High risk — defensive actions should precede growth actions.' },
    ],
    influences: [
      'Liquidity, leverage and survivability sub-scores',
      'Portfolio concentration (single-stock, single-asset, single-currency)',
      'Macro regime stress overlay',
    ],
    improvementActions: [
      'Address the lowest-scoring sub-signal first (the engine surfaces it)',
      'Diversify concentrated positions on the next rebalance',
      'Lift defensive sleeve weight when regime shifts from Expansion → Late-cycle',
    ],
    thresholds: [
      { state: 'excellent', gte: 85 },
      { state: 'strong', gte: 70 },
      { state: 'healthy', gte: 55 },
      { state: 'moderate', gte: 40 },
      { state: 'elevated', gte: 25 },
      { state: 'stressed', gte: 0 },
    ],
    interpretation: (score, state) =>
      `Risk state ${Math.round(score)}/100 — ${
        state === 'excellent' || state === 'strong'
          ? 'portfolio is resilient to the next 12 months of typical shocks.'
          : state === 'healthy'
          ? 'broadly healthy with a couple of watch-items.'
          : 'multiple stress signals are active — defensive actions take priority.'
      }`,
  },

  // ── 7. Confidence (recommendation engine confidence) ──────────────────────
  confidence: {
    id: 'confidence',
    title: 'Recommendation Confidence',
    unit: '% confidence in the current best move',
    direction: 'higher',
    definition:
      'How confident the unified recommendation engine is that the top-ranked action is genuinely the best next move, given current signal coverage.',
    whyItMatters:
      'A high-confidence recommendation justifies decisive action. A low-confidence reading means several engines disagree — slow down and let the data catch up.',
    ranges: [
      { state: 'excellent', range: '85%+', meaning: 'Engines converge — act with conviction.' },
      { state: 'strong', range: '70 – 85%', meaning: 'Strong consensus across signals.' },
      { state: 'healthy', range: '55 – 70%', meaning: 'Reasonable consensus — review the supporting reasoning.' },
      { state: 'moderate', range: '40 – 55%', meaning: 'Mixed signals — proceed in smaller steps.' },
      { state: 'elevated', range: 'under 40%', meaning: 'Engines disagree — defer non-reversible commitments.' },
    ],
    influences: [
      'Signal coverage (how many engines reported)',
      'Cross-engine agreement on the same action',
      'Recency of the underlying data (Monte Carlo, regime, holdings)',
    ],
    improvementActions: [
      'Re-run the Monte Carlo / refresh holdings to lift signal recency',
      'Resolve missing inputs flagged in the Daily Briefing',
      'Choose a smaller, reversible version of the action when confidence < 55%',
    ],
    thresholds: [
      { state: 'excellent', gte: 85 },
      { state: 'strong', gte: 70 },
      { state: 'healthy', gte: 55 },
      { state: 'moderate', gte: 40 },
      { state: 'elevated', gte: 0 },
    ],
  },

  // ── 8. Monte Carlo Probability of Success ─────────────────────────────────
  'monte-carlo-probability': {
    id: 'monte-carlo-probability',
    title: 'Probability of Plan Success',
    unit: '% of simulated paths that succeed',
    direction: 'higher',
    definition:
      'Share of Monte Carlo paths in which your plan meets its target (FIRE capital, withdrawal sustainability) within the chosen horizon.',
    whyItMatters:
      'A single point-projection hides risk. Probability of success folds market volatility, sequence-of-returns risk and contribution randomness into one honest number.',
    ranges: [
      { state: 'excellent', range: '90%+', meaning: 'Plan is robust to a wide range of futures.' },
      { state: 'strong', range: '75 – 90%', meaning: 'Plan holds in most futures — small tuning improves it further.' },
      { state: 'healthy', range: '60 – 75%', meaning: 'Workable — keep an eye on sequence-of-returns risk.' },
      { state: 'moderate', range: '45 – 60%', meaning: 'Coin-flip territory — extend horizon, raise contributions or lower target.' },
      { state: 'stressed', range: 'under 45%', meaning: 'Plan fails in most simulated futures — material change required.' },
    ],
    influences: [
      'Contribution rate',
      'Time horizon',
      'Target spend / withdrawal rate',
      'Asset allocation (equity sleeve, bonds, cash)',
    ],
    improvementActions: [
      'Lift monthly contributions (the cheapest probability boost)',
      'Extend horizon by 12–24 months',
      'Reduce target FIRE spend by 10% — single biggest swing factor',
    ],
    thresholds: [
      { state: 'excellent', gte: 90 },
      { state: 'strong', gte: 75 },
      { state: 'healthy', gte: 60 },
      { state: 'moderate', gte: 45 },
      { state: 'stressed', gte: 0 },
    ],
  },

  // ── 9. Stress Signals (count of active stressors) ─────────────────────────
  'stress-signals': {
    id: 'stress-signals',
    title: 'Active Stress Signals',
    unit: 'count of triggered stressors',
    direction: 'lower',
    definition:
      'Number of stress flags currently raised by the Behavioural & Risk engines (liquidity drop, leverage spike, drawdown, regime change, concentration, etc.).',
    whyItMatters:
      'Zero or one signal is normal noise. Three or more active signals usually means something structural is shifting — pause optimisation and stabilise.',
    ranges: [
      { state: 'excellent', range: '0', meaning: 'No active stressors — steady-state execution.' },
      { state: 'strong', range: '1', meaning: 'Single watch-item, isolated.' },
      { state: 'healthy', range: '2', meaning: 'Two related signals — review the cluster.' },
      { state: 'moderate', range: '3', meaning: 'Multiple stressors — reduce risk additions this cycle.' },
      { state: 'elevated', range: '4 – 5', meaning: 'Structural pressure — defensive actions first.' },
      { state: 'stressed', range: '6+', meaning: 'Crisis posture — preserve optionality, no new commitments.' },
    ],
    influences: [
      'Liquidity, leverage, drawdown, concentration sub-flags',
      'Macro regime overlay',
      'Behavioural triggers (panic / overconfidence patterns)',
    ],
    improvementActions: [
      'Resolve the highest-priority flagged signal first',
      'Pause new risk additions until count returns to ≤ 1',
      'Run scenario tree to understand which signal is the upstream cause',
    ],
    thresholds: [
      { state: 'excellent', lte: 0 },
      { state: 'strong', lte: 1 },
      { state: 'healthy', lte: 2 },
      { state: 'moderate', lte: 3 },
      { state: 'elevated', lte: 5 },
      { state: 'stressed', lte: 100 },
    ],
  },

  // ── 10. Strategic Leverage (deductible / appreciating ratio) ──────────────
  'strategic-leverage': {
    id: 'strategic-leverage',
    title: 'Strategic Leverage',
    unit: '% of debt that is strategic (deductible / appreciating)',
    direction: 'higher',
    definition:
      'Share of total debt held against appreciating, income-producing or tax-deductible assets — i.e. debt that is doing work for you, not just costing you.',
    whyItMatters:
      'Two households with identical leverage can have very different futures. Strategic leverage compounds wealth; consumer / high-APR debt erodes it.',
    ranges: [
      { state: 'excellent', range: '90%+', meaning: 'Almost all debt is strategic — leverage is an asset, not a liability.' },
      { state: 'strong', range: '75 – 90%', meaning: 'Mostly strategic with a small consumer tail to clear.' },
      { state: 'healthy', range: '60 – 75%', meaning: 'Healthy mix.' },
      { state: 'moderate', range: '40 – 60%', meaning: 'Mixed — the non-strategic portion drags returns.' },
      { state: 'elevated', range: 'under 40%', meaning: 'Predominantly consumer / non-strategic debt — clear it before scaling.' },
    ],
    influences: [
      'Mix of mortgages, investment loans, BNPL, credit cards',
      'Tax deductibility of each loan',
      'Asset class behind each loan (appreciating vs depreciating)',
    ],
    improvementActions: [
      'Avalanche the highest-APR non-strategic balance first',
      'Refinance investment loans into deductible structures where eligible',
      'Avoid using offset capacity for short-term consumption',
    ],
    thresholds: [
      { state: 'excellent', gte: 90 },
      { state: 'strong', gte: 75 },
      { state: 'healthy', gte: 60 },
      { state: 'moderate', gte: 40 },
      { state: 'elevated', gte: 0 },
    ],
    interpretation: (pct, state) =>
      state === 'excellent' || state === 'strong'
        ? `Debt is strategic, not distressed — ${Math.round(pct)}% sits against appreciating assets.`
        : `Only ${Math.round(pct)}% of debt is strategic — the consumer tail is the upgrade lever.`,
  },

  // ── 11. DCA Recommendation (safe deployable surplus) ──────────────────────
  'dca-recommendation': {
    id: 'dca-recommendation',
    title: 'DCA Recommendation',
    unit: '$ per month, capped at safe surplus',
    direction: 'higher',
    definition:
      'Monthly amount the engine recommends deploying via dollar-cost averaging, hard-capped at your safe deployable surplus (after buffers and debt service).',
    whyItMatters:
      'DCA turns surplus into long-term compounding without market-timing. Because the figure is capped at safe surplus, executing it never destabilises liquidity or debt cover.',
    ranges: [
      { state: 'excellent', range: '50%+ of surplus deployed', meaning: 'Strong forward compounding.' },
      { state: 'strong', range: '30 – 50% of surplus', meaning: 'Healthy deployment cadence.' },
      { state: 'healthy', range: '15 – 30% of surplus', meaning: 'Conservative — likely buffer rebuild in progress.' },
      { state: 'moderate', range: '0 – 15% of surplus', meaning: 'Heavy buffer or debt rebuild in progress.' },
      { state: 'elevated', range: 'capped at $0', meaning: 'No safe surplus to deploy — defensive posture is correct.' },
    ],
    influences: [
      'Monthly income & expenses (ledger truth)',
      'Mandatory debt repayments',
      'Emergency buffer shortfall',
    ],
    improvementActions: [
      'Lift the safe deployable surplus by trimming fixed expenses',
      'Pay down high-APR debt to free monthly capacity',
      'Replenish the emergency buffer so the cap stops binding',
    ],
    thresholds: [
      { state: 'excellent', gte: 50 },
      { state: 'strong', gte: 30 },
      { state: 'healthy', gte: 15 },
      { state: 'moderate', gte: 0.0001 },
      { state: 'elevated', gte: 0 },
    ],
  },

  // ── 12. Macro Regime (qualitative state) ──────────────────────────────────
  'macro-regime': {
    id: 'macro-regime',
    title: 'Macro Regime',
    unit: 'qualitative regime label',
    direction: 'higher',
    definition:
      'Current global macro regime as classified by the Autonomous OS — Expansion, Late-cycle, Contraction or Recovery. Drives the dynamic allocation overlay.',
    whyItMatters:
      'Markets behave differently across regimes. Holding the same allocation through every regime needlessly amplifies drawdowns; small overlay tilts add meaningful resilience.',
    ranges: [
      { state: 'excellent', range: 'Expansion · Stable', meaning: 'Risk assets favoured, defensives underweight.' },
      { state: 'strong', range: 'Expansion · Late', meaning: 'Trim concentration, lift quality.' },
      { state: 'moderate', range: 'Late-cycle', meaning: 'Lift defensive sleeve, manage drawdown risk.' },
      { state: 'elevated', range: 'Contraction', meaning: 'Preserve capital; cash and duration become valuable.' },
      { state: 'healthy', range: 'Recovery', meaning: 'Lean back into risk gradually — sequence matters.' },
    ],
    influences: [
      'Growth, inflation, liquidity, credit overlays',
      'Volatility regime',
      'Yield-curve and central-bank posture',
    ],
    improvementActions: [
      'Let the dynamic overlay (not gut feel) drive allocation tilts',
      'Use regime shifts as a trigger to rebalance, not to time the market',
      'Review the scenario tree when regime label changes',
    ],
    thresholds: [
      { state: 'excellent', gte: 4 },
      { state: 'strong', gte: 3 },
      { state: 'moderate', gte: 2 },
      { state: 'elevated', gte: 1 },
      { state: 'healthy', gte: 0 },
    ],
  },

  // ── 13. Scenario Confidence ───────────────────────────────────────────────
  'scenario-confidence': {
    id: 'scenario-confidence',
    title: 'Scenario Confidence',
    unit: '% confidence in the active scenario',
    direction: 'higher',
    definition:
      'Confidence the Scenario Tree assigns to the currently-active base scenario, given the latest inputs from every upstream engine.',
    whyItMatters:
      'Treat scenarios as hypotheses, not forecasts. Higher confidence means the engines agree on the path; lower confidence means consider the alternative branches before committing.',
    ranges: [
      { state: 'excellent', range: '80%+', meaning: 'Strong agreement — plan around this scenario.' },
      { state: 'strong', range: '65 – 80%', meaning: 'Active scenario is the dominant case.' },
      { state: 'healthy', range: '50 – 65%', meaning: 'Reasonable — review the next-most-likely branch.' },
      { state: 'moderate', range: '35 – 50%', meaning: 'Multiple plausible branches — make reversible moves only.' },
      { state: 'elevated', range: 'under 35%', meaning: 'Highly uncertain — wait for new information before reweighting.' },
    ],
    influences: [
      'Macro regime input',
      'Behavioural state',
      'Recency of refreshed signals (forecast, monte carlo, holdings)',
    ],
    improvementActions: [
      'Refresh stale inputs (Monte Carlo, regime, holdings) to firm the read',
      'Resolve outstanding action items the scenario depends on',
      'Compare against the next-most-likely scenario before any large move',
    ],
    thresholds: [
      { state: 'excellent', gte: 80 },
      { state: 'strong', gte: 65 },
      { state: 'healthy', gte: 50 },
      { state: 'moderate', gte: 35 },
      { state: 'elevated', gte: 0 },
    ],
  },

  // ── 14. Tail Risk (CVaR/95 magnitude) ─────────────────────────────────────
  'tail-risk': {
    id: 'tail-risk',
    title: 'Tail Risk (CVaR 95)',
    unit: '% loss in the worst 5% of outcomes',
    direction: 'lower',
    definition:
      'Average loss in the worst 5% of simulated paths. CVaR is the honest "how bad could it really get" number — meaner than VaR.',
    whyItMatters:
      'Tail risk is what destroys long-horizon plans. Average outcomes drive returns; tail outcomes drive failure modes. Keeping CVaR within tolerance preserves the ability to compound through downturns.',
    ranges: [
      { state: 'excellent', range: 'under 10%', meaning: 'Tail is well-contained for this portfolio mix.' },
      { state: 'strong', range: '10 – 20%', meaning: 'Mainstream balanced-portfolio tail.' },
      { state: 'healthy', range: '20 – 30%', meaning: 'Growth tilt — tail acceptable for a long horizon.' },
      { state: 'moderate', range: '30 – 40%', meaning: 'Elevated — concentration or leverage is meaningful.' },
      { state: 'elevated', range: '40 – 55%', meaning: 'High — a single bad year materially impacts the plan.' },
      { state: 'stressed', range: 'over 55%', meaning: 'Tail dominates outcome distribution — defensive rebalance.' },
    ],
    influences: [
      'Equity sleeve weight',
      'Concentration (single-stock, single-sector)',
      'Leverage on volatile assets',
    ],
    improvementActions: [
      'Lift defensive sleeve (bonds, cash) by 5–10pp when tail > 35%',
      'Trim single-name concentration > 15% of portfolio',
      'Reduce leverage on volatile asset exposures',
    ],
    thresholds: [
      { state: 'excellent', lte: 10 },
      { state: 'strong', lte: 20 },
      { state: 'healthy', lte: 30 },
      { state: 'moderate', lte: 40 },
      { state: 'elevated', lte: 55 },
      { state: 'stressed', lte: 1_000 },
    ],
  },

  // ── 15. Runway (months at full expense burn) ──────────────────────────────
  runway: {
    id: 'runway',
    title: 'Runway',
    unit: 'months at full expense burn',
    direction: 'higher',
    definition:
      'Months your household can sustain its current expense level from liquid balances alone, before drawing on investments or new income.',
    whyItMatters:
      'Runway is the unconditional version of survivability — it ignores passive income and answers "how long do we have, regardless?". The harder version of the same question.',
    ranges: [
      { state: 'excellent', range: '18+ months', meaning: 'Crisis-grade runway — no forced selling.' },
      { state: 'strong', range: '12 – 18 months', meaning: 'Comfortable across most disruptions.' },
      { state: 'healthy', range: '6 – 12 months', meaning: 'Standard professional buffer.' },
      { state: 'moderate', range: '3 – 6 months', meaning: 'Tight — most disruptions outlast this window.' },
      { state: 'stressed', range: 'under 3 months', meaning: 'A single missed cycle forces immediate action.' },
    ],
    influences: [
      'Liquid cash + offset',
      'Total monthly expenses',
    ],
    improvementActions: [
      'Re-route surplus into offset/savings until runway ≥ 12 months',
      'Lower fixed monthly expenses to mechanically extend runway',
      'Hold the next bonus / tax refund in cash before deploying',
    ],
    thresholds: [
      { state: 'excellent', gte: 18 },
      { state: 'strong', gte: 12 },
      { state: 'healthy', gte: 6 },
      { state: 'moderate', gte: 3 },
      { state: 'stressed', gte: 0 },
    ],
  },

  // ── 16. Portfolio Volatility ──────────────────────────────────────────────
  'portfolio-volatility': {
    id: 'portfolio-volatility',
    title: 'Portfolio Volatility',
    unit: 'annualised standard deviation, %',
    direction: 'lower',
    definition:
      'Annualised standard deviation of portfolio returns — a measure of how bumpy the ride is, year to year.',
    whyItMatters:
      'Higher volatility means bigger swings, both directions. For a long horizon this is fine — for a near-term goal it is poison. Match volatility to the time you actually have.',
    ranges: [
      { state: 'excellent', range: 'under 6%', meaning: 'Defensive — minimal year-to-year noise.' },
      { state: 'strong', range: '6 – 10%', meaning: 'Conservative balanced.' },
      { state: 'healthy', range: '10 – 14%', meaning: 'Balanced / growth — mainstream for long-horizon investors.' },
      { state: 'moderate', range: '14 – 18%', meaning: 'Growth tilt — be ready for double-digit drawdowns.' },
      { state: 'elevated', range: '18 – 24%', meaning: 'High-growth / concentrated — short-horizon goals at risk.' },
      { state: 'stressed', range: 'over 24%', meaning: 'Speculative profile — concentration or leverage is doing the work.' },
    ],
    influences: [
      'Equity sleeve weight',
      'Single-name and single-sector concentration',
      'Leverage and currency exposure',
    ],
    improvementActions: [
      'Lift bond/cash sleeve to dampen swings if horizon shortens',
      'Diversify across regions and sectors',
      'Reduce leverage on volatile assets',
    ],
    thresholds: [
      { state: 'excellent', lte: 6 },
      { state: 'strong', lte: 10 },
      { state: 'healthy', lte: 14 },
      { state: 'moderate', lte: 18 },
      { state: 'elevated', lte: 24 },
      { state: 'stressed', lte: 200 },
    ],
  },

  // ── 17. Allocation Drift ──────────────────────────────────────────────────
  'allocation-drift': {
    id: 'allocation-drift',
    title: 'Allocation Drift',
    unit: 'percentage points from target',
    direction: 'lower',
    definition:
      'Largest sleeve deviation from the target allocation. Measures how far the portfolio has wandered from the policy weights.',
    whyItMatters:
      'Drift quietly increases risk. A run-up in equities makes the portfolio more equity-heavy than the policy intends; rebalancing brings risk back to plan.',
    ranges: [
      { state: 'excellent', range: 'under 2pp', meaning: 'On target — no action required.' },
      { state: 'strong', range: '2 – 4pp', meaning: 'Minor drift — natural and acceptable.' },
      { state: 'healthy', range: '4 – 6pp', meaning: 'Small rebalance worth queuing.' },
      { state: 'moderate', range: '6 – 10pp', meaning: 'Drift is meaningful — schedule a rebalance this quarter.' },
      { state: 'elevated', range: 'over 10pp', meaning: 'Significant drift — risk has materially shifted from policy.' },
    ],
    influences: [
      'Relative sleeve performance (equities vs bonds vs cash)',
      'Contribution flow direction',
      'Distributions and dividend reinvestment patterns',
    ],
    improvementActions: [
      'Route new contributions into the under-weighted sleeve',
      'Use distributions to rebalance tax-efficiently',
      'Trim the over-weighted sleeve when drift > 6pp',
    ],
    thresholds: [
      { state: 'excellent', lte: 2 },
      { state: 'strong', lte: 4 },
      { state: 'healthy', lte: 6 },
      { state: 'moderate', lte: 10 },
      { state: 'elevated', lte: 100 },
    ],
  },

  // ── 18. Withdrawal Sustainability ─────────────────────────────────────────
  'withdrawal-sustainability': {
    id: 'withdrawal-sustainability',
    title: 'Withdrawal Sustainability',
    unit: '% of paths sustaining the target withdrawal',
    direction: 'higher',
    definition:
      'Share of Monte Carlo paths in which your chosen withdrawal rate is sustained without portfolio exhaustion across the full horizon.',
    whyItMatters:
      'Withdrawals expose you to sequence-of-returns risk. Sustainability tells you whether the lifestyle you plan to fund is structurally affordable across plausible futures.',
    ranges: [
      { state: 'excellent', range: '95%+', meaning: 'Withdrawal level is structurally safe.' },
      { state: 'strong', range: '85 – 95%', meaning: 'Safe in most futures.' },
      { state: 'healthy', range: '70 – 85%', meaning: 'Workable with flexibility on lifestyle in down years.' },
      { state: 'moderate', range: '55 – 70%', meaning: 'Borderline — guard rails required.' },
      { state: 'stressed', range: 'under 55%', meaning: 'Plan is materially under-funded at this withdrawal rate.' },
    ],
    influences: [
      'Withdrawal rate (3.5%, 4.0%)',
      'Time horizon',
      'Portfolio expected return and volatility',
    ],
    improvementActions: [
      'Apply a dynamic withdrawal rule (skip CPI uplift after down years)',
      'Lower the target spend by 5–10% to lift sustainability dramatically',
      'Hold 12–24 months of withdrawals in cash as a sequence buffer',
    ],
    thresholds: [
      { state: 'excellent', gte: 95 },
      { state: 'strong', gte: 85 },
      { state: 'healthy', gte: 70 },
      { state: 'moderate', gte: 55 },
      { state: 'stressed', gte: 0 },
    ],
  },
};

/**
 * Final registry — core dashboard metrics MERGED with the extended global
 * intelligence registry (engines, acronyms, signals, scores, formulas,
 * tax/FIRE/Monte-Carlo/leverage/behavioural terms). Extended entries are
 * spread first so the canonical core metrics always win on any ID clash.
 */
export const METRIC_EXPLANATIONS: Record<string, MetricExplanation> = {
  ...EXTENDED_EXPLANATIONS,
  ...CORE_METRIC_EXPLANATIONS,
};

/** Required extended explainer IDs — re-exported for test convenience. */
export { REQUIRED_EXTENDED_IDS };

/**
 * Required core metric IDs — used by tests to assert that the registry
 * covers everything the spec mandates.
 */
export const REQUIRED_METRIC_IDS = [
  'liquidity',
  'leverage',
  'fire-progress',
  'debt-pressure',
  'survivability',
  'risk-state',
  'confidence',
  'monte-carlo-probability',
  'stress-signals',
  'strategic-leverage',
  'dca-recommendation',
  'macro-regime',
  'scenario-confidence',
  'tail-risk',
  'runway',
  'portfolio-volatility',
  'allocation-drift',
  'withdrawal-sustainability',
] as const;

export function getMetricExplanation(id: string): MetricExplanation | undefined {
  return METRIC_EXPLANATIONS[id];
}
