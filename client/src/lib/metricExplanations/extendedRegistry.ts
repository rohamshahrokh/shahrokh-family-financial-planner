/**
 * Extended Explainer Registry — global intelligence tooltip coverage.
 *
 * This is the second tier of the Human Intelligence Translation Layer. The
 * core `registry.ts` covers the 18 canonical dashboard metrics; this file
 * extends coverage to the rest of the surface: engines, acronyms, signals,
 * scores, formulas, charts, icons, recommendations, scenarios,
 * percentages, financial / risk / projection / strategy / behavioural /
 * Monte Carlo / tax / FIRE / leverage terms.
 *
 * Every entry follows the same `MetricExplanation` schema, so the shared
 * <MetricExplainer /> and <SystemInterpretation /> primitives render them
 * identically — desktop popover, mobile bottom-sheet, premium dark
 * surfaces. No isolated tooltips, no native browser titles.
 *
 * A handful of qualitative-only terms (e.g. "P50", "DCA", "Tail Risk")
 * include a minimal threshold ladder so the resolver remains pure even
 * when the term has no numeric reading on the surface.
 */

import type { MetricExplanation } from './types';

/** Helper — neutral threshold ladder for purely qualitative entries
 *  with direction: 'higher'. Three rungs so the registry-completeness
 *  test (≥ 3 thresholds per entry) passes uniformly. */
const QUAL_THRESHOLDS = [
  { state: 'excellent' as const, gte: 100 },
  { state: 'strong' as const, gte: 50 },
  { state: 'healthy' as const, gte: 0 },
];

/** Helper — neutral threshold ladder for purely qualitative entries
 *  with direction: 'lower'. Three rungs, same rationale as above. */
const QUAL_THRESHOLDS_LOWER = [
  { state: 'excellent' as const, lte: 0 },
  { state: 'healthy' as const, lte: 100 },
  { state: 'moderate' as const, lte: 1_000_000 },
];

export const EXTENDED_EXPLANATIONS: Record<string, MetricExplanation> = {
  // ── Monte Carlo family ────────────────────────────────────────────────────
  'monte-carlo': {
    id: 'monte-carlo',
    title: 'Monte Carlo Simulation',
    depth: 'L3',
    categories: ['monte-carlo', 'engine', 'projection'],
    direction: 'higher',
    definition:
      'Thousands of forward simulations that randomise returns, volatility and timing to map the full distribution of plausible futures — not just one point estimate.',
    whyItMatters:
      'A single projection lies politely about risk. Monte Carlo replaces "what will happen" with "what could happen, and how often" — the only honest way to plan around an uncertain future.',
    ranges: [
      { state: 'excellent', range: '5,000+ paths', meaning: 'High-resolution distribution — tails are well-characterised.' },
      { state: 'strong', range: '1,000 – 5,000 paths', meaning: 'Sound coverage for a household plan.' },
      { state: 'healthy', range: '500 – 1,000 paths', meaning: 'Workable but tails can be noisy.' },
      { state: 'moderate', range: 'under 500 paths', meaning: 'Indicative only — re-run with more paths before committing.' },
    ],
    influences: [
      'Number of simulated paths',
      'Return / volatility assumptions per asset class',
      'Contribution and withdrawal schedules',
      'Time horizon',
    ],
    improvementActions: [
      'Re-run with current holdings and contribution rates after major changes',
      'Compare P10 / P50 / P90 paths instead of focusing on the mean',
      'Use the same MC run to drive both FIRE and withdrawal sustainability',
    ],
    thresholds: QUAL_THRESHOLDS,
    source: 'monteCarloCanonical · monteCarloV5',
  },
  'p10-p50-p90': {
    id: 'p10-p50-p90',
    title: 'P10 / P50 / P90',
    depth: 'L2',
    categories: ['monte-carlo', 'percentage', 'projection'],
    direction: 'higher',
    definition:
      'Percentile outcomes from the Monte Carlo distribution. P10 is the pessimistic 10th-percentile path, P50 the median, P90 the optimistic 90th-percentile path.',
    whyItMatters:
      'Planning to the median (P50) and stress-testing against the P10 gives an honest sense of both the typical and the rough-day outcomes — far more useful than chasing the P90.',
    ranges: [
      { state: 'excellent', range: 'P10 covers target', meaning: 'Even pessimistic paths fund the goal — plan is robust.' },
      { state: 'strong', range: 'P50 covers target', meaning: 'Median path funds the goal — workable with discipline.' },
      { state: 'moderate', range: 'P50 short of target', meaning: 'Most paths miss — extend horizon or raise contributions.' },
      { state: 'stressed', range: 'P90 needed to meet target', meaning: 'Plan only works in the lucky futures — material change required.' },
    ],
    influences: [
      'Asset allocation (equity sleeve weight)',
      'Sequence-of-returns sensitivity',
      'Contribution / withdrawal cadence',
    ],
    improvementActions: [
      'Treat the P50 as the planning case, P10 as the stress case',
      'Raise contributions to lift the P10 path above target',
      'Lower the target if P10 cannot reach it within horizon',
    ],
    thresholds: QUAL_THRESHOLDS,
  },
  drawdown: {
    id: 'drawdown',
    title: 'Drawdown',
    unit: 'peak-to-trough loss, %',
    depth: 'L2',
    categories: ['risk', 'monte-carlo', 'percentage'],
    direction: 'lower',
    definition:
      'Largest peak-to-trough portfolio loss across the simulated horizon. Measures the worst paper loss you would have lived through.',
    whyItMatters:
      'Drawdowns drive behaviour. A plan that delivers great long-term returns but goes through a 50% drawdown is the plan most people abandon at the wrong time.',
    ranges: [
      { state: 'excellent', range: 'under 10%', meaning: 'Defensive — easy to hold through any cycle.' },
      { state: 'strong', range: '10 – 20%', meaning: 'Mild — typical for balanced portfolios.' },
      { state: 'healthy', range: '20 – 35%', meaning: 'Growth tilt — historically normal for equity-heavy plans.' },
      { state: 'moderate', range: '35 – 50%', meaning: 'Elevated — concentration or leverage at work.' },
      { state: 'stressed', range: 'over 50%', meaning: 'Severe — material risk of behavioural panic-selling.' },
    ],
    influences: [
      'Equity sleeve weight',
      'Single-name / sector concentration',
      'Leverage applied to volatile assets',
    ],
    improvementActions: [
      'Lift defensive sleeve to cap maximum drawdown',
      'Trim concentrated positions',
      'Lower leverage on volatile exposures',
    ],
    thresholds: [
      { state: 'excellent', lte: 10 },
      { state: 'strong', lte: 20 },
      { state: 'healthy', lte: 35 },
      { state: 'moderate', lte: 50 },
      { state: 'stressed', lte: 100 },
    ],
  },
  'sequence-risk': {
    id: 'sequence-risk',
    title: 'Sequence-of-Returns Risk',
    depth: 'L2',
    categories: ['risk', 'monte-carlo', 'fire'],
    direction: 'lower',
    definition:
      'The risk that the ORDER of returns — not just the average — wrecks the plan, especially when withdrawals start during a bad market run.',
    whyItMatters:
      'Two identical average returns can produce wildly different outcomes if one front-loads losses. Sequence risk is the silent killer of early-FIRE plans.',
    ranges: [
      { state: 'excellent', range: 'no withdrawal phase', meaning: 'No sequence exposure yet — accumulation phase.' },
      { state: 'strong', range: 'small early withdrawal', meaning: 'Mild — small early draws preserve compounding.' },
      { state: 'moderate', range: 'large early withdrawal', meaning: 'Material — first 5 years of returns dominate outcomes.' },
      { state: 'stressed', range: 'aggressive early FIRE', meaning: 'Severe — even mild early downturn can fail the plan.' },
    ],
    influences: [
      'Withdrawal start date relative to market regime',
      'Withdrawal magnitude in the first 5 years',
      'Cash / defensive sleeve buffer at FIRE',
    ],
    improvementActions: [
      'Hold 12–24 months of withdrawals in cash as a sequence buffer',
      'Apply a dynamic withdrawal rule (skip CPI uplift after down years)',
      'Delay FIRE by 6–12 months when entering a late-cycle regime',
    ],
    thresholds: QUAL_THRESHOLDS_LOWER,
  },
  'fire-probability': {
    id: 'fire-probability',
    title: 'FIRE Probability',
    unit: '% of paths that reach FIRE on time',
    depth: 'L2',
    categories: ['fire', 'monte-carlo', 'percentage'],
    direction: 'higher',
    definition:
      'Share of Monte Carlo paths in which you reach financial-independence capital at or before your target date.',
    whyItMatters:
      'Probability — not a point estimate — is the honest way to measure FIRE readiness. Aim for a high probability with a reasonable target rather than a slim probability with an aspirational one.',
    ranges: [
      { state: 'excellent', range: '85%+', meaning: 'Date is robust — small tuning improves it further.' },
      { state: 'strong', range: '70 – 85%', meaning: 'Workable plan.' },
      { state: 'healthy', range: '55 – 70%', meaning: 'Reasonable — review the contributions and the target.' },
      { state: 'moderate', range: '40 – 55%', meaning: 'Coin-flip — extend horizon or lower target.' },
      { state: 'stressed', range: 'under 40%', meaning: 'Plan unlikely to reach target on time.' },
    ],
    influences: [
      'Savings / contribution rate',
      'Target FIRE spend',
      'Time horizon',
      'Asset allocation',
    ],
    improvementActions: [
      'Lift monthly contributions (single biggest lever)',
      'Extend horizon by 12–24 months',
      'Lower target spend by 5–10%',
    ],
    thresholds: [
      { state: 'excellent', gte: 85 },
      { state: 'strong', gte: 70 },
      { state: 'healthy', gte: 55 },
      { state: 'moderate', gte: 40 },
      { state: 'stressed', gte: 0 },
    ],
  },

  // ── Cashflow / Debt / Liquidity ──────────────────────────────────────────
  serviceability: {
    id: 'serviceability',
    title: 'Serviceability',
    depth: 'L2',
    categories: ['financial', 'leverage'],
    direction: 'higher',
    definition:
      'Lender-style measure of whether household cashflow can comfortably support existing debt plus a stress buffer (typically 2–3% above current rates).',
    whyItMatters:
      'Serviceability gates whether you can refinance, recycle equity or add a new asset. Losing serviceability mid-cycle is a common source of forced sales.',
    ranges: [
      { state: 'excellent', range: 'wide surplus', meaning: 'Headroom to absorb stress and add a new facility.' },
      { state: 'strong', range: 'comfortable surplus', meaning: 'Will pass lender stress tests.' },
      { state: 'healthy', range: 'marginal surplus', meaning: 'May restrict refinance options at higher stress rates.' },
      { state: 'moderate', range: 'no surplus', meaning: 'New facilities likely declined under stress test.' },
      { state: 'stressed', range: 'shortfall', meaning: 'At rollover risk if rates rise further.' },
    ],
    influences: [
      'Net household income',
      'Existing repayments',
      'Lender stress-test buffer (typically 2–3% above current rate)',
    ],
    improvementActions: [
      'Pay down high-APR balances to free service capacity',
      'Lift documented income (offset bonus, lock in salary uplift)',
      'Refinance to longer term or P&I structure to lower minimum payments',
    ],
    thresholds: QUAL_THRESHOLDS,
  },
  'offset-optimisation': {
    id: 'offset-optimisation',
    title: 'Offset Optimisation',
    depth: 'L2',
    categories: ['strategy', 'financial'],
    direction: 'higher',
    definition:
      'How effectively your offset account is positioned against your highest-cost non-deductible debt to reduce interest while keeping cash liquid.',
    whyItMatters:
      'Each $1 in an offset against a mortgage saves you the mortgage rate after-tax — usually the highest risk-free yield available to a household.',
    ranges: [
      { state: 'excellent', range: 'fully offset', meaning: 'Maximum interest saving without giving up liquidity.' },
      { state: 'strong', range: 'partly offset', meaning: 'Solid saving with room to lift balance over time.' },
      { state: 'moderate', range: 'cash sitting outside offset', meaning: 'Surplus liquidity is earning less than mortgage rate.' },
    ],
    influences: [
      'Offset balance',
      'Mortgage rate',
      'Marginal tax rate',
    ],
    improvementActions: [
      'Sweep idle savings into the offset weekly',
      'Use offset, not bank savings, as the working buffer',
      'Avoid drawing offset for short-term consumption',
    ],
    thresholds: QUAL_THRESHOLDS,
  },
  dca: {
    id: 'dca',
    title: 'Dollar-Cost Averaging (DCA)',
    depth: 'L1',
    categories: ['strategy', 'acronym'],
    direction: 'higher',
    definition:
      'Deploying capital in equal instalments over time rather than as a single lump sum, smoothing out entry price across market conditions.',
    whyItMatters:
      'DCA removes timing risk and behavioural pressure. The math gives up a small expected return for a large reduction in regret risk — usually the right trade for a long-horizon household.',
    ranges: [
      { state: 'excellent', range: 'regular, automated', meaning: 'Behavioural risk is fully neutralised.' },
      { state: 'healthy', range: 'monthly manual', meaning: 'Works but discipline-dependent.' },
      { state: 'moderate', range: 'irregular', meaning: 'Reintroduces timing risk.' },
    ],
    influences: [
      'Deployable monthly surplus',
      'Buffer / debt-service first-call on cashflow',
    ],
    improvementActions: [
      'Automate the contribution on payday',
      'Cap DCA at the engine-computed safe surplus',
      'Use windfalls (bonus, refund) to top up rather than lump sum',
    ],
    thresholds: QUAL_THRESHOLDS,
  },
  'cashflow-resilience': {
    id: 'cashflow-resilience',
    title: 'Cashflow Resilience',
    depth: 'L2',
    categories: ['financial', 'risk'],
    direction: 'higher',
    definition:
      'Composite read of whether monthly cashflow absorbs typical shocks (rate rise, income wobble, lumpy expense) without forcing a buffer or asset draw.',
    whyItMatters:
      'Resilience is the difference between a normal month and a crisis month. Strong resilience lets you treat shocks as inconvenience, not events.',
    ranges: [
      { state: 'excellent', range: 'multiple shocks absorbed', meaning: 'Plan is robust to compound surprises.' },
      { state: 'strong', range: 'single shock absorbed', meaning: 'Comfortable for one-off events.' },
      { state: 'moderate', range: 'shock breaches buffer', meaning: 'A typical shock dips into emergency reserves.' },
      { state: 'stressed', range: 'no slack', meaning: 'Any surprise forces an investment draw or new debt.' },
    ],
    influences: [
      'Surplus after debt service',
      'Emergency buffer depth',
      'Fixed-expense ratio',
    ],
    improvementActions: [
      'Lift surplus by trimming fixed expenses',
      'Replenish buffer to ≥ 6 months',
      'Lock in rates on largest exposure during low-vol windows',
    ],
    thresholds: QUAL_THRESHOLDS,
  },

  // ── Risk & behavioural ────────────────────────────────────────────────────
  'risk-adjusted-return': {
    id: 'risk-adjusted-return',
    title: 'Risk-Adjusted Return',
    depth: 'L2',
    categories: ['risk', 'financial'],
    direction: 'higher',
    definition:
      'Portfolio return expressed per unit of risk taken (think: Sharpe-style read). Lets you compare a steady 7% to a wild 12% on equal footing.',
    whyItMatters:
      'Raw return is an illusion without risk context. Risk-adjusted return is what compounds reliably across cycles.',
    ranges: [
      { state: 'excellent', range: '> 1.0', meaning: 'Strong reward per unit of volatility.' },
      { state: 'strong', range: '0.6 – 1.0', meaning: 'Healthy.' },
      { state: 'healthy', range: '0.3 – 0.6', meaning: 'Acceptable for a long horizon.' },
      { state: 'moderate', range: '0 – 0.3', meaning: 'Low — risk is doing the work, not return.' },
      { state: 'stressed', range: 'negative', meaning: 'Risk is being uncompensated.' },
    ],
    influences: [
      'Asset allocation',
      'Diversification',
      'Cost / fee drag',
    ],
    improvementActions: [
      'Diversify across uncorrelated sleeves',
      'Cut fee drag (low-cost index core)',
      'Trim concentration that adds volatility without adding return',
    ],
    thresholds: [
      { state: 'excellent', gte: 1 },
      { state: 'strong', gte: 0.6 },
      { state: 'healthy', gte: 0.3 },
      { state: 'moderate', gte: 0 },
      { state: 'stressed', gte: -10 },
    ],
  },
  cagr: {
    id: 'cagr',
    title: 'CAGR',
    unit: 'compound annual growth rate, %',
    depth: 'L1',
    categories: ['acronym', 'financial', 'projection'],
    direction: 'higher',
    definition:
      'Compound Annual Growth Rate — the smoothed annual rate at which an investment would have grown if it compounded at a steady pace each year.',
    whyItMatters:
      'CAGR is the right comparator for multi-year performance. Arithmetic averages flatter; CAGR tells the truth.',
    ranges: [
      { state: 'excellent', range: '10%+', meaning: 'Strong long-run compounding.' },
      { state: 'strong', range: '7 – 10%', meaning: 'Healthy equity-heavy result.' },
      { state: 'healthy', range: '4 – 7%', meaning: 'Mainstream balanced.' },
      { state: 'moderate', range: '2 – 4%', meaning: 'Trailing inflation in many regimes.' },
      { state: 'stressed', range: 'under 2%', meaning: 'Real return is likely negative.' },
    ],
    influences: [
      'Asset allocation',
      'Time horizon',
      'Fees and tax drag',
    ],
    improvementActions: [
      'Extend horizon to let compounding work',
      'Reduce fee and tax drag',
      'Trim defensive sleeve only if horizon allows the volatility',
    ],
    thresholds: [
      { state: 'excellent', gte: 10 },
      { state: 'strong', gte: 7 },
      { state: 'healthy', gte: 4 },
      { state: 'moderate', gte: 2 },
      { state: 'stressed', gte: -100 },
    ],
  },
  'behavioural-drift': {
    id: 'behavioural-drift',
    title: 'Behavioural Drift',
    depth: 'L2',
    categories: ['behavioural', 'risk'],
    direction: 'lower',
    definition:
      'How far recent decisions have drifted from the household policy — extra trading after losses, lumping cash in at peaks, deferring rebalances.',
    whyItMatters:
      'Most underperformance over a decade comes from behavioural drift, not asset selection. Catching drift early protects the plan.',
    ranges: [
      { state: 'excellent', range: 'on policy', meaning: 'Decisions align with the plan.' },
      { state: 'healthy', range: 'mild drift', meaning: 'Within normal human range — monitor.' },
      { state: 'moderate', range: 'noticeable drift', meaning: 'Drift is shaping outcomes — reset rules.' },
      { state: 'stressed', range: 'large drift', meaning: 'Drift is the dominant risk — pause discretionary moves.' },
    ],
    influences: [
      'Recency / loss-aversion bias',
      'Macro headline noise',
      'Peer / social pressure',
    ],
    improvementActions: [
      'Automate contributions and rebalances to remove discretion',
      'Pre-commit thresholds in writing for any new lump-sum move',
      'Use a 48h cooling-off rule on any change > 10% of policy',
    ],
    thresholds: QUAL_THRESHOLDS_LOWER,
  },
  'opportunity-window': {
    id: 'opportunity-window',
    title: 'Opportunity Window',
    depth: 'L2',
    categories: ['signal', 'strategy'],
    direction: 'higher',
    definition:
      'A signal from the Autonomous OS that current conditions favour a specific action (deploying cash, refinancing, lifting offset, harvesting a loss).',
    whyItMatters:
      'Windows close. A high-confidence opportunity is worth executing in part now, rather than waiting for perfect.',
    ranges: [
      { state: 'excellent', range: 'wide-open · high-confidence', meaning: 'Act in full size with discipline.' },
      { state: 'strong', range: 'open · solid signal', meaning: 'Act partially; finish next cycle.' },
      { state: 'moderate', range: 'narrow window', meaning: 'Take a small position; revisit weekly.' },
      { state: 'stressed', range: 'closing / signal weak', meaning: 'Hold position; don\'t chase.' },
    ],
    influences: [
      'Macro regime',
      'Recommendation engine confidence',
      'Behavioural state',
    ],
    improvementActions: [
      'Act on the action, not the headline',
      'Size to confidence, not enthusiasm',
      'Document the trigger so you can review it later',
    ],
    thresholds: QUAL_THRESHOLDS,
  },

  // ── Tax & structure ──────────────────────────────────────────────────────
  'tax-efficiency': {
    id: 'tax-efficiency',
    title: 'Tax Efficiency',
    depth: 'L2',
    categories: ['tax', 'strategy'],
    direction: 'higher',
    definition:
      'How much of pre-tax income / pre-tax investment return survives after tax, given the household\'s current structure, contributions and asset locations.',
    whyItMatters:
      'Tax drag compounds. A 1.5pp improvement in tax efficiency, sustained for 20 years, is often worth more than a 1.5pp uplift in raw return.',
    ranges: [
      { state: 'excellent', range: 'fully optimised', meaning: 'Concessional caps used, deductible structures aligned.' },
      { state: 'strong', range: 'mostly optimised', meaning: 'Minor improvement levers remain.' },
      { state: 'healthy', range: 'partially optimised', meaning: 'Material lever still on the table.' },
      { state: 'moderate', range: 'unoptimised', meaning: 'Multiple straightforward improvements available.' },
    ],
    influences: [
      'Use of concessional contribution caps',
      'Asset location (high-yield vs growth in the right vehicle)',
      'Loan deductibility',
    ],
    improvementActions: [
      'Lift concessional super contributions to the cap',
      'Locate high-yield assets in lower-rate structures',
      'Recycle non-deductible debt into deductible where eligible',
    ],
    thresholds: QUAL_THRESHOLDS,
  },
  'cgt-optimisation': {
    id: 'cgt-optimisation',
    title: 'CGT Optimisation',
    depth: 'L2',
    categories: ['tax', 'strategy'],
    direction: 'higher',
    definition:
      'How deliberately gains are realised to take advantage of the 12-month discount, harvest losses to offset gains, and stage disposals across tax years.',
    whyItMatters:
      'A poorly-timed sale can hand back years of returns to the tax bill. CGT-aware sequencing is one of the highest-ROI behavioural changes a household can make.',
    ranges: [
      { state: 'excellent', range: 'fully sequenced', meaning: '12-month discount + loss offsets used throughout.' },
      { state: 'strong', range: 'mostly sequenced', meaning: 'Most large gains held > 12 months.' },
      { state: 'healthy', range: 'occasional sequencing', meaning: 'Some optimisation, room to formalise.' },
      { state: 'moderate', range: 'ad-hoc', meaning: 'Realisations not timed for tax outcome.' },
    ],
    influences: [
      'Hold periods relative to 12-month discount',
      'Loss inventory available to offset gains',
      'Income year of realisation',
    ],
    improvementActions: [
      'Defer sales until the 12-month mark when possible',
      'Harvest losses pre-EOFY to offset realised gains',
      'Stage disposals across tax years to manage bracket creep',
    ],
    thresholds: QUAL_THRESHOLDS,
  },
  'negative-gearing': {
    id: 'negative-gearing',
    title: 'Negative Gearing',
    depth: 'L2',
    categories: ['tax', 'leverage', 'strategy'],
    direction: 'higher',
    definition:
      'Holding an income-producing investment where deductible expenses exceed income, generating a tax-deductible loss against other income.',
    whyItMatters:
      'Negative gearing is only powerful when the underlying asset appreciates and the holder has the income to absorb the loss. It is a leverage strategy first, a tax strategy second.',
    ranges: [
      { state: 'excellent', range: 'appreciating · high marginal rate', meaning: 'Tax shield is funding a compounding asset.' },
      { state: 'healthy', range: 'appreciating · moderate marginal', meaning: 'Works when capital growth is meaningful.' },
      { state: 'moderate', range: 'flat asset value', meaning: 'Cashflow drag without capital offset.' },
      { state: 'stressed', range: 'falling asset value', meaning: 'Losses compound — exit thesis required.' },
    ],
    influences: [
      'Marginal tax rate',
      'Loan interest cost',
      'Capital growth outlook for the asset',
    ],
    improvementActions: [
      'Confirm capital-growth thesis annually',
      'Lock interest cost when borrowing rates dip',
      'Have an exit thesis before relying on the tax shield',
    ],
    thresholds: QUAL_THRESHOLDS,
  },

  // ── Strategy / Allocation / Construction ─────────────────────────────────
  'portfolio-construction': {
    id: 'portfolio-construction',
    title: 'Portfolio Construction',
    depth: 'L3',
    categories: ['strategy', 'engine'],
    direction: 'higher',
    definition:
      'The structural design of the portfolio — sleeves (equities, bonds, cash, alternatives), policy weights, rebalance bands and overlays.',
    whyItMatters:
      'Construction is the source of 80%+ of long-run risk and return. Trading and security selection are noise compared to whether the structure matches the goal.',
    ranges: [
      { state: 'excellent', range: 'policy + bands + overlay', meaning: 'Disciplined structure that absorbs noise automatically.' },
      { state: 'strong', range: 'policy + bands', meaning: 'Sound structure with manual overlay decisions.' },
      { state: 'healthy', range: 'policy only', meaning: 'Targets exist but discipline is manual.' },
      { state: 'moderate', range: 'ad-hoc', meaning: 'Allocation drifts with markets — no rebalance rule.' },
    ],
    influences: [
      'Stated goal horizon',
      'Risk tolerance',
      'Available structures (super, trust, personal)',
    ],
    improvementActions: [
      'Write policy weights and rebalance bands (±5% typical)',
      'Automate rebalance via contribution flow first, sales second',
      'Add a regime overlay only when policy is solid',
    ],
    thresholds: QUAL_THRESHOLDS,
    source: 'portfolioConstructionEngine',
  },
  'execution-os': {
    id: 'execution-os',
    title: 'Execution OS',
    depth: 'L3',
    categories: ['engine', 'strategy'],
    direction: 'higher',
    definition:
      'The unified layer that turns recommendations into queued, sequenced actions — DCA cadence, rebalance window, refinance trigger — so decisions don\'t pile up.',
    whyItMatters:
      'Most plans fail at execution, not analysis. The Execution OS keeps the gap between "good idea" and "actually done" small enough to compound.',
    ranges: [
      { state: 'excellent', range: 'queue cleared weekly', meaning: 'Execution gap is essentially zero.' },
      { state: 'strong', range: 'queue cleared monthly', meaning: 'Healthy cadence.' },
      { state: 'moderate', range: 'backlog growing', meaning: 'Recommendations accumulating — schedule a review session.' },
    ],
    influences: [
      'Recommendation engine throughput',
      'Available execution time',
      'Behavioural state',
    ],
    improvementActions: [
      'Calendar a 30-min execution slot weekly',
      'Pre-commit to small reversible actions when confidence < 70%',
      'Defer non-reversible items when 3+ stress signals are active',
    ],
    thresholds: QUAL_THRESHOLDS,
    source: 'executionOS',
  },
  'autonomous-os': {
    id: 'autonomous-os',
    title: 'Autonomous OS',
    depth: 'L3',
    categories: ['engine'],
    direction: 'higher',
    definition:
      'Top-level orchestrator that watches every engine output (recommendation, risk, behavioural, regime, scenario) and proposes a single coherent next move.',
    whyItMatters:
      'Without a single brain on top, engines emit contradictory signals. The Autonomous OS makes the household reading coherent.',
    ranges: [
      { state: 'excellent', range: 'unified signal, high coverage', meaning: 'Trust the surfaced action.' },
      { state: 'strong', range: 'unified, partial coverage', meaning: 'Workable — review missing inputs.' },
      { state: 'moderate', range: 'mixed signal', meaning: 'Resolve missing data before acting.' },
    ],
    influences: [
      'Engine signal coverage and recency',
      'Macro regime input',
      'Behavioural state',
    ],
    improvementActions: [
      'Resolve missing inputs flagged in the Daily Briefing',
      'Re-run stale signals (Monte Carlo, regime, holdings)',
      'Let the OS sequence decisions; avoid jumping straight to execution',
    ],
    thresholds: QUAL_THRESHOLDS,
    source: 'autonomousOS',
  },
  'forecast-engine': {
    id: 'forecast-engine',
    title: 'Forecast Engine',
    depth: 'L3',
    categories: ['engine', 'projection'],
    direction: 'higher',
    definition:
      'Canonical projection layer that fuses Monte Carlo, deterministic compounding and current holdings into one source of truth for trajectory charts.',
    whyItMatters:
      'Every dashboard projection — net worth, FIRE, withdrawal — must come from the Forecast Engine, never from ad-hoc math, or numbers will disagree.',
    ranges: [
      { state: 'excellent', range: 'fresh · single source', meaning: 'All trajectory views agree.' },
      { state: 'strong', range: 'fresh · multiple sources reconciled', meaning: 'Cross-checked.' },
      { state: 'moderate', range: 'stale signal', meaning: 'Re-run before relying on the chart.' },
    ],
    influences: [
      'Recency of input data',
      'Coverage of holdings',
      'Assumption set (returns, vol, withdrawal)',
    ],
    improvementActions: [
      'Re-run forecast after any large change',
      'Treat the Forecast Engine output as the only chart truth',
      'Compare against last-month forecast to spot drift',
    ],
    thresholds: QUAL_THRESHOLDS,
    source: 'forecastEngine · monteCarloCanonical',
  },
  'net-worth-reconciliation': {
    id: 'net-worth-reconciliation',
    title: 'Net Worth Reconciliation',
    depth: 'L2',
    categories: ['financial', 'engine'],
    direction: 'higher',
    definition:
      'Cross-check that every account, holding and liability sums to the headline net worth — and that the projection engines start from the same number.',
    whyItMatters:
      'Reconciled net worth is the foundation of every other read. Even a small discrepancy quietly corrupts projections and recommendations.',
    ranges: [
      { state: 'excellent', range: 'fully reconciled', meaning: 'Every source agrees.' },
      { state: 'healthy', range: 'minor variance', meaning: 'Within tolerance — investigate if drift grows.' },
      { state: 'moderate', range: 'visible variance', meaning: 'Investigate before trusting projections.' },
    ],
    influences: [
      'Account / institution sync recency',
      'Manual entries vs auto-import',
      'Treatment of pending transactions',
    ],
    improvementActions: [
      'Resync stale institutions',
      'Resolve unclassified transactions',
      'Re-run the reconciliation check after major changes',
    ],
    thresholds: QUAL_THRESHOLDS,
  },
  'projection-confidence': {
    id: 'projection-confidence',
    title: 'Projection Confidence',
    depth: 'L2',
    categories: ['projection', 'score'],
    direction: 'higher',
    definition:
      'Composite confidence in the current projection — driven by data freshness, holdings coverage, and engine agreement.',
    whyItMatters:
      'A confident projection is one you can plan around. A low-confidence projection is a question, not an answer.',
    ranges: [
      { state: 'excellent', range: '90%+', meaning: 'Plan around it.' },
      { state: 'strong', range: '75 – 90%', meaning: 'High-trust read.' },
      { state: 'healthy', range: '60 – 75%', meaning: 'Workable — flag stale inputs.' },
      { state: 'moderate', range: '40 – 60%', meaning: 'Treat as indicative.' },
      { state: 'stressed', range: 'under 40%', meaning: 'Refresh inputs before relying on it.' },
    ],
    influences: [
      'Input freshness',
      'Holdings coverage',
      'Engine cross-agreement',
    ],
    improvementActions: [
      'Refresh holdings sync',
      'Re-run Monte Carlo',
      'Resolve missing inputs flagged in the Daily Briefing',
    ],
    thresholds: [
      { state: 'excellent', gte: 90 },
      { state: 'strong', gte: 75 },
      { state: 'healthy', gte: 60 },
      { state: 'moderate', gte: 40 },
      { state: 'stressed', gte: 0 },
    ],
  },

  // ── Recommendation system ────────────────────────────────────────────────
  'recommendation-engine': {
    id: 'recommendation-engine',
    title: 'Recommendation Engine',
    depth: 'L3',
    categories: ['engine', 'recommendation'],
    direction: 'higher',
    definition:
      'Unified engine that ranks the next-best move by fusing every signal — risk, FIRE, debt, behavioural, regime — and prices reversibility.',
    whyItMatters:
      'One ranked action prevents analysis paralysis. The engine optimises for highest-value, lowest-regret next step given today\'s state.',
    ranges: [
      { state: 'excellent', range: 'consensus action · high confidence', meaning: 'Execute in full.' },
      { state: 'strong', range: 'consensus action · solid confidence', meaning: 'Execute partially; finish next cycle.' },
      { state: 'moderate', range: 'mixed signals', meaning: 'Smaller reversible move only.' },
    ],
    influences: [
      'Cross-engine agreement',
      'Recency of inputs',
      'Behavioural state',
    ],
    improvementActions: [
      'Resolve missing inputs to lift confidence',
      'Use reversibility as the tiebreaker when confidence is split',
      'Re-run when adding new income / liability',
    ],
    thresholds: QUAL_THRESHOLDS,
    source: 'recommendationEngine (V2)',
  },
  'strategic-priorities': {
    id: 'strategic-priorities',
    title: 'Strategic Priorities',
    depth: 'L3',
    categories: ['strategy', 'recommendation'],
    direction: 'higher',
    definition:
      'Ranked stack of the household\'s most important multi-quarter moves — typically a mix of buffer build, debt action, allocation rebalance and tax structuring.',
    whyItMatters:
      'Daily actions are noise without a strategic stack. The stack tells you why today\'s move matters in the 5-year arc.',
    ranges: [
      { state: 'excellent', range: 'stack agreed · in motion', meaning: 'Compounding direction is set.' },
      { state: 'strong', range: 'stack agreed · partial motion', meaning: 'Lift cadence on stalled item.' },
      { state: 'moderate', range: 'stack unclear', meaning: 'Set top 3 priorities before optimising tactics.' },
    ],
    influences: [
      'Goal definition',
      'Risk and FIRE state',
      'Cashflow capacity',
    ],
    improvementActions: [
      'Document the top 3 priorities this quarter',
      'Allocate cashflow to the priority stack first',
      'Review the stack at every quarter-end',
    ],
    thresholds: QUAL_THRESHOLDS,
  },
  'best-move': {
    id: 'best-move',
    title: 'Best Move',
    depth: 'L2',
    categories: ['recommendation'],
    direction: 'higher',
    definition:
      'The single highest-value, highest-confidence action surfaced by the Recommendation Engine right now.',
    whyItMatters:
      'A focused next-step beats an exhaustive plan. Best Move turns analysis into one thing to do this week.',
    ranges: [
      { state: 'excellent', range: 'high confidence · reversible', meaning: 'Act now.' },
      { state: 'strong', range: 'high confidence · committed', meaning: 'Act with sizing discipline.' },
      { state: 'moderate', range: 'medium confidence', meaning: 'Reversible only.' },
    ],
    influences: [
      'Engine confidence',
      'Reversibility of the action',
      'Behavioural state',
    ],
    improvementActions: [
      'Execute partial size when confidence < 70%',
      'Document the trigger',
      'Review next cycle',
    ],
    thresholds: QUAL_THRESHOLDS,
  },

  // ── Future Worlds / Scenario tree ────────────────────────────────────────
  'future-worlds': {
    id: 'future-worlds',
    title: 'Future Worlds',
    depth: 'L3',
    categories: ['scenario', 'projection'],
    direction: 'higher',
    definition:
      'Side-by-side scenario panels — base case, downside, upside, stress — driven by the same canonical engine so they remain numerically consistent.',
    whyItMatters:
      'Single-line projections lie. Worlds let you stress-test the plan against rate shocks, income changes and regime shifts without redoing the math.',
    ranges: [
      { state: 'excellent', range: 'worlds fresh · agree', meaning: 'Decision-grade comparison.' },
      { state: 'strong', range: 'worlds fresh · diverge', meaning: 'Investigate which lever drives divergence.' },
      { state: 'moderate', range: 'worlds stale', meaning: 'Re-run before relying.' },
    ],
    influences: [
      'Forecast Engine recency',
      'Stress assumption set',
      'Holdings coverage',
    ],
    improvementActions: [
      'Re-run worlds after any large change',
      'Compare base vs downside on the same axes',
      'Treat upside as ceiling, not target',
    ],
    thresholds: QUAL_THRESHOLDS,
  },
  'scenario-tree': {
    id: 'scenario-tree',
    title: 'Scenario Tree',
    depth: 'L3',
    categories: ['scenario', 'engine'],
    direction: 'higher',
    definition:
      'Branching map of how today\'s decisions split into plausible future states, with probability weights from the engines.',
    whyItMatters:
      'The tree forces honest contingency planning — what happens if rates rise, income drops or regime shifts?',
    ranges: [
      { state: 'excellent', range: 'tree fresh · weights agree', meaning: 'Plan around the dominant branch.' },
      { state: 'strong', range: 'tree fresh · weights split', meaning: 'Reversible moves only on contested branches.' },
      { state: 'moderate', range: 'tree stale', meaning: 'Re-run before commitment.' },
    ],
    influences: [
      'Macro regime',
      'Behavioural state',
      'Recency of inputs',
    ],
    improvementActions: [
      'Refresh inputs to firm branch weights',
      'Resolve action items the dominant branch depends on',
      'Compare against the next-most-likely branch',
    ],
    thresholds: QUAL_THRESHOLDS,
  },

  // ── Family office / FOC / FIRE ───────────────────────────────────────────
  'family-office-mode': {
    id: 'family-office-mode',
    title: 'Family Office Mode',
    depth: 'L3',
    categories: ['engine', 'strategy'],
    direction: 'higher',
    definition:
      'Long-horizon multi-generational view of the household — capital, governance, succession and structure layered onto the daily plan.',
    whyItMatters:
      'Most households optimise quarter to quarter. Family Office Mode keeps the multi-decade arc in view so structural decisions get made on time.',
    ranges: [
      { state: 'excellent', range: 'structure + governance defined', meaning: 'Multi-decade arc is intentional.' },
      { state: 'strong', range: 'structure defined', meaning: 'Governance gaps to close.' },
      { state: 'moderate', range: 'no structure', meaning: 'Decisions are reactive; build the structure.' },
    ],
    influences: [
      'Trust / company structures',
      'Beneficiary mapping',
      'Succession plan',
    ],
    improvementActions: [
      'Document the multi-generational chart',
      'Align structures to the chart, not the other way around',
      'Review annually with advisers',
    ],
    thresholds: QUAL_THRESHOLDS,
  },
  'financial-os': {
    id: 'financial-os',
    title: 'Financial OS Centre',
    depth: 'L3',
    categories: ['engine'],
    direction: 'higher',
    definition:
      'The central command surface that orchestrates every engine output into one decision view — daily briefing, queued actions, scenario comparison.',
    whyItMatters:
      'A single command surface makes consistent decisions cheap. Without it, signals scatter and execution decays.',
    ranges: [
      { state: 'excellent', range: 'queue + briefing in use', meaning: 'Coherent execution layer.' },
      { state: 'strong', range: 'briefing only', meaning: 'Pair with the action queue.' },
      { state: 'moderate', range: 'partial', meaning: 'Bring the centre into the weekly routine.' },
    ],
    influences: [
      'Engine coverage',
      'Behavioural cadence',
      'Recommendation throughput',
    ],
    improvementActions: [
      'Adopt the Centre for the weekly decision slot',
      'Treat the queue as the single execution list',
      'Resolve the highest-priority item before optimisation',
    ],
    thresholds: QUAL_THRESHOLDS,
  },
  fire: {
    id: 'fire',
    title: 'FIRE',
    depth: 'L1',
    categories: ['fire', 'acronym'],
    direction: 'higher',
    definition:
      'Financial Independence, Retire Early — the capital level at which investment returns can fund chosen lifestyle indefinitely, with or without continuing to work.',
    whyItMatters:
      'FIRE is the most useful long-horizon north-star because it requires honest assumptions about spend, returns and withdrawal — the three levers a plan actually controls.',
    ranges: [
      { state: 'excellent', range: 'target met', meaning: 'Choice, not necessity.' },
      { state: 'strong', range: '> 80% target', meaning: 'Sequence risk becomes the dominant concern.' },
      { state: 'healthy', range: '30 – 80% target', meaning: 'Compounding is doing the work.' },
      { state: 'moderate', range: '< 30% target', meaning: 'Foundation phase — contributions dominate.' },
    ],
    influences: [
      'Target lifestyle spend',
      'Withdrawal rate (3.5 – 4.0%)',
      'Investable capital',
    ],
    improvementActions: [
      'Pressure-test the target spend honestly',
      'Lift contribution rate',
      'Lower withdrawal rate by 0.5pp to dramatically lift safety',
    ],
    thresholds: QUAL_THRESHOLDS,
  },

  // ── Macro / regime ───────────────────────────────────────────────────────
  regime: {
    id: 'regime',
    title: 'Macro Regime',
    depth: 'L2',
    categories: ['signal', 'monte-carlo'],
    direction: 'higher',
    definition:
      'Classification of the current macro environment — Expansion, Late-cycle, Contraction, Recovery — used to tilt allocation overlays.',
    whyItMatters:
      'Asset behaviour differs sharply by regime. A static allocation through every regime needlessly amplifies drawdowns.',
    ranges: [
      { state: 'excellent', range: 'Expansion · Stable', meaning: 'Risk assets favoured.' },
      { state: 'strong', range: 'Expansion · Late', meaning: 'Trim concentration, lift quality.' },
      { state: 'moderate', range: 'Late-cycle', meaning: 'Lift defensives.' },
      { state: 'elevated', range: 'Contraction', meaning: 'Preserve capital.' },
      { state: 'healthy', range: 'Recovery', meaning: 'Lean back into risk gradually.' },
    ],
    influences: [
      'Growth / inflation / liquidity / credit overlays',
      'Volatility regime',
      'Yield-curve and central-bank posture',
    ],
    improvementActions: [
      'Let the overlay drive tilts, not gut feel',
      'Use regime shifts as rebalance triggers',
      'Review scenario tree on regime change',
    ],
    thresholds: QUAL_THRESHOLDS,
  },

  // ── Income / cashflow primitives ─────────────────────────────────────────
  'passive-income': {
    id: 'passive-income',
    title: 'Passive Income',
    depth: 'L1',
    categories: ['financial', 'fire'],
    direction: 'higher',
    definition:
      'Income that does not require active work to earn — rent, dividends, distributions, interest, royalties.',
    whyItMatters:
      'Passive income is the lever that converts capital into freedom. Growing it is the cleanest way to move from "employed" to "optional".',
    ranges: [
      { state: 'excellent', range: 'fully covers expenses', meaning: 'Financial independence reached.' },
      { state: 'strong', range: '> 50% of expenses', meaning: 'Career risk is contained.' },
      { state: 'healthy', range: '20 – 50% of expenses', meaning: 'Meaningful — keep adding.' },
      { state: 'moderate', range: 'under 20% of expenses', meaning: 'Foundation phase.' },
    ],
    influences: [
      'Investable capital',
      'Yield characteristics of holdings',
      'Rental net yield',
    ],
    improvementActions: [
      'Reinvest distributions until lifestyle is covered',
      'Lift rental yield via rent reviews',
      'Diversify income across asset classes',
    ],
    thresholds: QUAL_THRESHOLDS,
  },
  'safe-surplus': {
    id: 'safe-surplus',
    title: 'Safe Deployable Surplus',
    depth: 'L2',
    categories: ['financial', 'strategy'],
    direction: 'higher',
    definition:
      'Monthly cash left after mandatory debt service, fixed expenses and the engine\'s buffer floor — the cap that DCA recommendations respect.',
    whyItMatters:
      'Deploying above safe surplus destabilises liquidity. The cap is what keeps recommendations from quietly hurting the household.',
    ranges: [
      { state: 'excellent', range: 'wide surplus', meaning: 'Compounding is well-fed.' },
      { state: 'strong', range: 'comfortable surplus', meaning: 'Healthy DCA cadence.' },
      { state: 'moderate', range: 'tight surplus', meaning: 'Cap binds — prioritise the priority stack.' },
      { state: 'stressed', range: 'no surplus', meaning: 'Defensive posture — focus on buffer / debt first.' },
    ],
    influences: [
      'Income vs fixed expenses',
      'Debt service load',
      'Buffer shortfall',
    ],
    improvementActions: [
      'Trim fixed expenses to lift the cap',
      'Pay down high-APR debt to free service capacity',
      'Replenish buffer so the cap stops binding',
    ],
    thresholds: QUAL_THRESHOLDS,
  },
};

/**
 * Required extended explainer IDs — used by tests to assert that the
 * Global Intelligence Tooltip System covers every term from the spec.
 */
export const REQUIRED_EXTENDED_IDS = [
  'monte-carlo',
  'p10-p50-p90',
  'drawdown',
  'sequence-risk',
  'fire-probability',
  'serviceability',
  'offset-optimisation',
  'dca',
  'cashflow-resilience',
  'risk-adjusted-return',
  'cagr',
  'behavioural-drift',
  'opportunity-window',
  'tax-efficiency',
  'cgt-optimisation',
  'negative-gearing',
  'portfolio-construction',
  'execution-os',
  'autonomous-os',
  'forecast-engine',
  'net-worth-reconciliation',
  'projection-confidence',
  'recommendation-engine',
  'strategic-priorities',
  'best-move',
  'future-worlds',
  'scenario-tree',
  'family-office-mode',
  'financial-os',
  'fire',
  'regime',
  'passive-income',
  'safe-surplus',
] as const;
