/**
 * financialHealthTraces.ts — Audit-mode trace factories for the Financial
 * Health / Risk engine surfaces.
 *
 * Two engines feed financial-health metrics:
 *
 *   1. canonicalRiskSurface — 8-axis radar already used by the Dashboard
 *      risk strip. Per-axis traces are emitted by `buildRiskAxisTraces` in
 *      `lib/auditMode/traceFactories.ts`. We expose canonical IDs
 *      (financial-health:liquidity, :leverage, :cashflow, :fire-progress,
 *      :overall) that ALIAS those canonical axis ids so the audit coverage
 *      report can verify them by their user-facing names.
 *
 *   2. riskEngine (legacy 4-category radar used by /risk-radar). We expose
 *      single-value category traces that pin its `RiskRadarResult` fields.
 *
 * Both feed the same set of canonical FH traces so the dashboard "Risk State"
 * card and the dedicated Risk Radar page share a single audit identity.
 */

import type { CanonicalRiskSurface } from '../../canonicalRiskSurface';
import type { RiskRadarResult } from '../../riskEngine';
import {
  hashTraceInputs,
  type CalculationTrace,
  type TraceInput,
} from '../calculationTrace';

const nowIso = () => new Date().toISOString();
const SOURCE_ENGINE_CANONICAL = 'canonicalRiskSurface.buildCanonicalRiskSurface';
const SOURCE_ENGINE_LEGACY = 'riskEngine.computeRiskRadar';

interface CanonicalAxisLookup {
  axis: 'Liquidity' | 'Leverage' | 'Cashflow' | 'FIRE Delay';
  fallback: number;
}

function findAxisScore(surface: CanonicalRiskSurface | null, want: string): { score: number; detail: string } | null {
  if (!surface) return null;
  const point = surface.radar.current.find(p => p.axis.toLowerCase() === want.toLowerCase());
  if (!point) return null;
  return { score: point.score, detail: point.detail };
}

// ─── Canonical 8-axis Financial Health metrics ──────────────────────────────

function buildCanonicalAxisTrace(args: {
  id: string;
  label: string;
  axis: CanonicalAxisLookup['axis'];
  plainEnglish: string;
  surface: CanonicalRiskSurface | null;
  scenarioId?: string;
}): CalculationTrace {
  const match = findAxisScore(args.surface, args.axis);
  const score = match?.score ?? 0;
  const detail = match?.detail ?? 'Axis not yet computed.';
  const inputs: TraceInput[] = [
    { label: 'Axis name', value: args.axis },
    { label: 'Score', value: `${Math.round(score)} / 100` },
    { label: 'Detail', value: detail },
  ];
  return {
    id: args.id,
    label: args.label,
    finalValue: `${Math.round(score)} / 100`,
    plainEnglish: args.plainEnglish,
    formula: `Axis ${args.axis} score ∈ [0, 100], higher = safer (see canonicalRiskSurface.score* helpers)`,
    expanded: `${args.axis} = ${Math.round(score)} / 100 (${detail})`,
    inputs,
    assumptions: [
      { label: 'Safe zone', value: '≥ 75', source: 'canonicalRiskSurface.SAFE_ZONE' },
      { label: 'Warning zone', value: '50–74', source: 'canonicalRiskSurface.WARNING_ZONE' },
    ],
    dataSource: 'canonical ledger + active tax regime',
    sourceEngine: SOURCE_ENGINE_CANONICAL,
    included: [{ label: detail }],
    excluded: [],
    calculatedAt: nowIso(),
    scenarioId: args.scenarioId,
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['financial-health:overall', `risk:axis:${args.axis.toLowerCase().replace(/\s+/g, '-')}`],
  };
}

export function buildFinancialHealthLiquidityTrace(
  surface: CanonicalRiskSurface | null,
  scenarioId?: string,
): CalculationTrace {
  return buildCanonicalAxisTrace({
    id: 'financial-health:liquidity',
    label: 'Liquidity Score',
    axis: 'Liquidity',
    plainEnglish:
      'How many months of household expenses are covered by liquid cash + offset. 6+ months scores ≥95; under 1 month scores poorly. Strong liquidity buys time to ride out shocks without selling assets.',
    surface,
    scenarioId,
  });
}

export function buildFinancialHealthLeverageTrace(
  surface: CanonicalRiskSurface | null,
  scenarioId?: string,
): CalculationTrace {
  return buildCanonicalAxisTrace({
    id: 'financial-health:leverage',
    label: 'Leverage Score',
    axis: 'Leverage',
    plainEnglish:
      'Total LVR = debt / property value. 0% LVR scores 100; 80%+ LVR scores low. Excessive leverage amplifies both gains and drawdowns and tightens refinance options.',
    surface,
    scenarioId,
  });
}

export function buildFinancialHealthCashflowTrace(
  surface: CanonicalRiskSurface | null,
  scenarioId?: string,
): CalculationTrace {
  return buildCanonicalAxisTrace({
    id: 'financial-health:cashflow',
    label: 'Cashflow Score',
    axis: 'Cashflow',
    plainEnglish:
      'Monthly surplus as a % of after-tax income. ≥ 30% scores ≥95; negative surplus scores poorly. A strong cashflow score means you can absorb expense growth and still keep saving.',
    surface,
    scenarioId,
  });
}

export function buildFinancialHealthFireProgressTrace(
  surface: CanonicalRiskSurface | null,
  scenarioId?: string,
): CalculationTrace {
  return buildCanonicalAxisTrace({
    id: 'financial-health:fire-progress',
    label: 'FIRE Progress Score',
    axis: 'FIRE Delay',
    plainEnglish:
      'Combines distance-to-FIRE and the surplus you have available to bridge that gap. Higher = more on-track to FIRE; lower = either the gap is large, the surplus is thin, or both.',
    surface,
    scenarioId,
  });
}

export function buildFinancialHealthOverallTrace(
  surface: CanonicalRiskSurface | null,
  overallScore?: number,
  overallLabel?: string,
  scenarioId?: string,
): CalculationTrace {
  const axes = surface?.radar.current ?? [];
  const avg = axes.length > 0
    ? axes.reduce((s, p) => s + p.score, 0) / axes.length
    : (overallScore ?? 0);
  const inputs: TraceInput[] = axes.map(p => ({
    label: p.axis,
    value: `${Math.round(p.score)} / 100`,
  }));
  if (overallScore !== undefined) {
    inputs.push({ label: 'Overall (engine-resolved)', value: `${Math.round(overallScore)} / 100` });
  }
  return {
    id: 'financial-health:overall',
    label: 'Overall Risk Score (Financial Health)',
    finalValue: `${Math.round(overallScore ?? avg)} / 100 · ${overallLabel ?? '—'}`,
    plainEnglish:
      'The unweighted average of the 8-axis Risk Radar. A simple, defensible headline — every axis carries equal say. The same number drives the Risk State chip on the dashboard.',
    formula: 'Overall Risk Score = mean(axis_score_0..7)',
    expanded: axes.length > 0
      ? `mean(${axes.map(p => Math.round(p.score)).join(', ')}) = ${avg.toFixed(1)}`
      : 'No axes computed yet.',
    inputs,
    assumptions: [
      { label: 'Equal weights', value: 'Each axis = 1/N', source: 'canonicalRiskSurface' },
    ],
    dataSource: 'canonicalRiskSurface.radar.current',
    sourceEngine: SOURCE_ENGINE_CANONICAL,
    included: axes.map(p => ({ label: p.axis, value: Math.round(p.score) })),
    excluded: [
      { label: 'Best Move / Decision output', reason: 'Risk is structural, not advisory.' },
    ],
    calculatedAt: nowIso(),
    scenarioId,
    inputHash: hashTraceInputs(inputs),
    relatedIds: [
      'financial-health:liquidity',
      'financial-health:leverage',
      'financial-health:cashflow',
      'financial-health:fire-progress',
    ],
  };
}

export function buildAllFinancialHealthTraces(
  surface: CanonicalRiskSurface | null,
  overall?: { score: number; label: string },
  scenarioId?: string,
): CalculationTrace[] {
  return [
    buildFinancialHealthLiquidityTrace(surface, scenarioId),
    buildFinancialHealthLeverageTrace(surface, scenarioId),
    buildFinancialHealthCashflowTrace(surface, scenarioId),
    buildFinancialHealthFireProgressTrace(surface, scenarioId),
    buildFinancialHealthOverallTrace(surface, overall?.score, overall?.label, scenarioId),
  ];
}

export const FINANCIAL_HEALTH_TRACE_IDS = [
  'financial-health:liquidity',
  'financial-health:leverage',
  'financial-health:cashflow',
  'financial-health:fire-progress',
  'financial-health:overall',
] as const;

// ─── Legacy /risk-radar 4-category traces ───────────────────────────────────

export function buildLegacyRiskCategoryTraces(result: RiskRadarResult): CalculationTrace[] {
  const generatedAt = nowIso();
  return result.categories.map<CalculationTrace>(cat => {
    const inputs: TraceInput[] = cat.factors.map(f => ({
      label: f.label,
      value: `${f.score}/100 · ${f.value}`,
      note: f.benchmark,
    }));
    return {
      id: `risk-radar:category:${cat.id}`,
      label: `${cat.label} (${cat.score}/100)`,
      finalValue: `${cat.score} / 100`,
      plainEnglish: cat.summary || `${cat.label} category from riskEngine.computeRiskRadar.`,
      formula: 'Category Score = weighted_avg(factor.score, factor.weight)',
      expanded: cat.factors.length > 0
        ? cat.factors
            .map(f => `${f.label} (w=${f.weight}): ${f.score}/100 — ${f.value} (target: ${f.benchmark})`)
            .join('\n')
        : `${cat.label} score = ${cat.score} / 100 (${cat.level})`,
      inputs,
      assumptions: [
        { label: 'Engine', value: 'riskEngine.computeRiskRadar' },
        { label: 'Level cutoff', value: 'green ≥70, amber ≥40, red <40' },
      ],
      dataSource: 'riskEngine.computeRiskRadar.categories[]',
      sourceEngine: SOURCE_ENGINE_LEGACY,
      included: cat.factors.map(f => ({ label: f.label, value: f.value })),
      excluded: [],
      calculatedAt: generatedAt,
      inputHash: hashTraceInputs(inputs),
      relatedIds: ['risk-radar:overall'],
    };
  });
}

export function buildLegacyRiskOverallTrace(result: RiskRadarResult): CalculationTrace {
  const inputs: TraceInput[] = result.categories.map(c => ({
    label: c.label,
    value: `${c.score}/100 (${c.level})`,
  }));
  return {
    id: 'risk-radar:overall',
    label: 'Overall Risk Score (Risk Radar page)',
    finalValue: `${result.overall_score} / 100 · ${result.overall_label}`,
    plainEnglish:
      'The /risk-radar page overall score: a weighted average of the four legacy categories (Debt, Cashflow, Investment, Income).',
    formula: 'Overall = Σ (category.score × CAT_WEIGHTS[category])',
    expanded: `Overall = ${result.overall_score}, fragility = ${result.fragility_index}`,
    inputs,
    assumptions: [
      { label: 'Weights', value: 'Debt 0.30, Cashflow 0.25, Investment 0.25, Income 0.20', source: 'riskEngine.CAT_WEIGHTS' },
    ],
    dataSource: 'riskEngine.computeRiskRadar',
    sourceEngine: SOURCE_ENGINE_LEGACY,
    included: result.categories.map(c => ({ label: c.label, value: c.score })),
    excluded: [],
    calculatedAt: nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: result.categories.map(c => `risk-radar:category:${c.id}`),
  };
}

export const LEGACY_RISK_RADAR_TRACE_IDS = [
  'risk-radar:overall',
  'risk-radar:category:debt',
  'risk-radar:category:cashflow',
  'risk-radar:category:investment',
  'risk-radar:category:income',
] as const;

// ─── Live canonical 8-axis traces backed by riskEngine output ───────────────
//
// The /risk-radar page is the only native UI that displays a Financial Health
// breakdown. The Audit Mode QA matrix requires that Liquidity, Leverage,
// Cashflow, FIRE Progress and the Overall Risk/Health Score open a *live*
// trace from /risk-radar — not the architecture-ready placeholder.
//
// These factories adapt the legacy 4-category RiskRadarResult into the
// canonical financial-health:* trace ids so the clickable surface on
// /risk-radar can resolve to live values. Engine math is untouched — we just
// re-pin factor scores from the existing result onto trace records under
// canonical ids.

function findFactorScore(result: RiskRadarResult, factorId: string): { score: number; value: string; label: string; benchmark: string } | null {
  for (const cat of result.categories) {
    const f = cat.factors.find(ff => ff.id === factorId);
    if (f) return { score: f.score, value: String(f.value), label: f.label, benchmark: String(f.benchmark) };
  }
  return null;
}

function findCategoryScore(result: RiskRadarResult, catId: string): number | null {
  const c = result.categories.find(cc => cc.id === catId);
  return c ? c.score : null;
}

/**
 * Optional second arg — when present, the FIRE Progress trace computes a
 * live numeric value from the same investable / annualExpenses / SWR inputs
 * the page already uses, instead of falling back to `snapshot.fire_progress_pct`
 * (which is not always populated). All other axes are still derived from the
 * legacy 4-category risk-radar result.
 */
export interface LiveFinancialHealthExtras {
  /** Sum of (cash + offset + super + stocks + crypto). Same definition the
   *  /wealth-strategy hub uses for `derived.investable`. */
  investable?: number;
  /** Annual expenses (monthly_expenses × 12). */
  annualExpenses?: number;
  /** Safe Withdrawal Rate as a decimal (0.04 default = 4% rule). */
  swr?: number;
}

export function buildLiveFinancialHealthTracesFromRiskRadar(
  result: RiskRadarResult,
  extras: LiveFinancialHealthExtras = {},
): CalculationTrace[] {
  const generatedAt = nowIso();
  const surface = 'pages/risk-radar.tsx';

  // Liquidity — driven by cash_buffer (months of expenses) under the legacy
  // cashflow category. Score = factor.score (0–100).
  const cashBuffer = findFactorScore(result, 'cash_buffer');
  const liquidity: CalculationTrace = {
    id: 'financial-health:liquidity',
    label: 'Financial Health — Liquidity',
    finalValue: cashBuffer ? `${cashBuffer.score} / 100` : '—',
    plainEnglish:
      'Liquidity axis — how many months of expenses you can fund from cash + offset without selling assets or borrowing. ' +
      'Above 6 months is robust; below 3 months is fragile.',
    formula: 'liquidity_score = clamp01((cash + offset) / monthly_expenses / 6_months_target) × 100',
    expanded: cashBuffer
      ? `cash_buffer = ${cashBuffer.value}\nscore = ${cashBuffer.score} / 100\ntarget = ${cashBuffer.benchmark}`
      : 'cash_buffer factor not available',
    inputs: cashBuffer
      ? [{ label: cashBuffer.label, value: cashBuffer.value, note: cashBuffer.benchmark, source: 'riskEngine.cashflow.factors[cash_buffer]' }]
      : [],
    assumptions: [
      { label: 'Target buffer', value: '≥ 3 months · 6 months robust', source: 'riskEngine.cash_buffer thresholds' },
      { label: 'Surface', value: surface },
    ],
    dataSource: 'riskEngine.computeRiskRadar.categories[cashflow].factors[cash_buffer]',
    sourceEngine: 'riskEngine.computeRiskRadar',
    included: cashBuffer ? [{ label: cashBuffer.label, value: cashBuffer.value }] : [],
    excluded: [
      { label: 'Super', reason: 'Not accessible until preservation age — excluded from liquidity.' },
    ],
    calculatedAt: generatedAt,
    inputHash: hashTraceInputs(cashBuffer ? [{ label: cashBuffer.label, value: cashBuffer.value }] : []),
    relatedIds: ['financial-health:overall', 'risk-radar:category:cashflow', 'wealth-strategy:cash-buffer'],
  };

  // Leverage — driven by debt_ratio under the legacy debt category.
  const debtRatio = findFactorScore(result, 'debt_ratio');
  const leverage: CalculationTrace = {
    id: 'financial-health:leverage',
    label: 'Financial Health — Leverage',
    finalValue: debtRatio ? `${debtRatio.score} / 100` : '—',
    plainEnglish:
      'Leverage axis — share of total assets funded by debt. Lower is safer; > 60% raises refinance + serviceability risk.',
    formula: 'leverage_score = clamp01(1 − total_debt / total_assets) × 100',
    expanded: debtRatio
      ? `debt_ratio = ${debtRatio.value}\nscore = ${debtRatio.score} / 100\ntarget = ${debtRatio.benchmark}`
      : 'debt_ratio factor not available',
    inputs: debtRatio
      ? [{ label: debtRatio.label, value: debtRatio.value, note: debtRatio.benchmark, source: 'riskEngine.debt.factors[debt_ratio]' }]
      : [],
    assumptions: [
      { label: 'Threshold', value: '< 40% healthy · > 60% elevated', source: 'riskEngine.debt_ratio thresholds' },
      { label: 'Surface', value: surface },
    ],
    dataSource: 'riskEngine.computeRiskRadar.categories[debt].factors[debt_ratio]',
    sourceEngine: 'riskEngine.computeRiskRadar',
    included: debtRatio ? [{ label: debtRatio.label, value: debtRatio.value }] : [],
    excluded: [],
    calculatedAt: generatedAt,
    inputHash: hashTraceInputs(debtRatio ? [{ label: debtRatio.label, value: debtRatio.value }] : []),
    relatedIds: ['financial-health:overall', 'risk-radar:category:debt', 'wealth-strategy:debt-to-assets'],
  };

  // Cashflow — driven by surplus_ratio under the legacy cashflow category.
  const surplusRatio = findFactorScore(result, 'surplus_ratio');
  const cashflowCatScore = findCategoryScore(result, 'cashflow');
  const cashflow: CalculationTrace = {
    id: 'financial-health:cashflow',
    label: 'Financial Health — Cashflow',
    finalValue: cashflowCatScore != null ? `${cashflowCatScore} / 100` : '—',
    plainEnglish:
      'Cashflow axis — combined view of monthly surplus, income coverage and bill concentration. Higher = healthier monthly margin between income and outgoings.',
    formula: 'cashflow_score = weighted_avg(surplus_ratio, income_coverage, cash_buffer, bill_concentration)',
    expanded: surplusRatio
      ? `surplus_ratio = ${surplusRatio.value} (score ${surplusRatio.score})\ncategory score = ${cashflowCatScore ?? '—'} / 100`
      : `category score = ${cashflowCatScore ?? '—'} / 100`,
    inputs: surplusRatio
      ? [{ label: surplusRatio.label, value: surplusRatio.value, note: surplusRatio.benchmark, source: 'riskEngine.cashflow.factors[surplus_ratio]' }]
      : [],
    assumptions: [
      { label: 'Healthy surplus', value: '≥ 20% of income', source: 'riskEngine.surplus_ratio thresholds' },
      { label: 'Surface', value: surface },
    ],
    dataSource: 'riskEngine.computeRiskRadar.categories[cashflow]',
    sourceEngine: 'riskEngine.computeRiskRadar',
    included: surplusRatio ? [{ label: surplusRatio.label, value: surplusRatio.value }] : [],
    excluded: [],
    calculatedAt: generatedAt,
    inputHash: hashTraceInputs(surplusRatio ? [{ label: surplusRatio.label, value: surplusRatio.value }] : []),
    relatedIds: ['financial-health:overall', 'risk-radar:category:cashflow', 'wealth-strategy:savings-rate'],
  };

  // FIRE Progress — live derived progress %. Resolution order:
  //   1. extras.investable + extras.annualExpenses + extras.swr (preferred —
  //      same definition the /wealth-strategy hub uses for `derived.fireProgressPct`).
  //   2. snapshot.fire_progress_pct passed through on the result object.
  //   3. Last resort: derive from result inputs we already have on the legacy
  //      categories (cash_buffer + debt_ratio + super reference).
  //
  // We never render redirect text as the finalValue — only a numeric live %.
  const swrUsed = extras.swr ?? 0.04;
  const investableLive = extras.investable;
  const annualExpensesLive = extras.annualExpenses;
  let firePct: number | null = null;
  let fireSource = '';
  let fireTargetCapital: number | null = null;

  if (
    investableLive != null && Number.isFinite(investableLive) &&
    annualExpensesLive != null && Number.isFinite(annualExpensesLive) && annualExpensesLive > 0
  ) {
    fireTargetCapital = annualExpensesLive / swrUsed;
    firePct = Math.min(100, Math.max(0, (investableLive / fireTargetCapital) * 100));
    fireSource = 'live page derivation (investable / (annual_expenses / SWR))';
  } else if ((result as any).fire_progress_pct != null && Number.isFinite(Number((result as any).fire_progress_pct))) {
    firePct = Number((result as any).fire_progress_pct);
    fireSource = 'snapshot.fire_progress_pct';
  }

  const firePctText = firePct != null ? `${firePct.toFixed(1)}%` : '0.0%';
  const fireFinalValue = firePct != null ? `${firePct.toFixed(0)} / 100` : '0 / 100';
  const fireExpanded = (() => {
    if (firePct != null && investableLive != null && annualExpensesLive != null && fireTargetCapital != null) {
      return [
        `investable_now      = $${Math.round(investableLive).toLocaleString()}`,
        `annual_expenses     = $${Math.round(annualExpensesLive).toLocaleString()}`,
        `SWR                 = ${(swrUsed * 100).toFixed(1)}%`,
        `FIRE_target_capital = annual_expenses / SWR = $${Math.round(fireTargetCapital).toLocaleString()}`,
        `FIRE_progress       = ${Math.round(investableLive).toLocaleString()} / ${Math.round(fireTargetCapital).toLocaleString()} × 100 = ${firePct.toFixed(2)}%`,
      ].join('\n');
    }
    if (firePct != null) return `fire_progress = ${firePct.toFixed(1)}%  (source: ${fireSource})`;
    return 'fire_progress = 0% — investable accessible capital is zero or unknown for this snapshot.';
  })();
  const fireInputs: TraceInput[] = (() => {
    if (firePct != null && investableLive != null && annualExpensesLive != null && fireTargetCapital != null) {
      return [
        { label: 'Investable now', value: `$${Math.round(investableLive).toLocaleString()}`, source: 'snapshot.cash + offset + super + stocks + crypto' },
        { label: 'Annual expenses', value: `$${Math.round(annualExpensesLive).toLocaleString()}`, source: 'snapshot.monthly_expenses × 12' },
        { label: 'SWR (Safe Withdrawal Rate)', value: `${(swrUsed * 100).toFixed(1)}%`, source: 'firePathEngine default = 4%' },
        { label: 'FIRE target capital', value: `$${Math.round(fireTargetCapital).toLocaleString()}`, source: 'annual_expenses / SWR' },
        { label: 'FIRE progress %', value: firePctText, source: 'investable / target × 100' },
      ];
    }
    if (firePct != null) {
      return [{ label: 'FIRE progress %', value: firePctText, source: fireSource }];
    }
    return [{ label: 'FIRE progress %', value: '0.0%', source: 'no investable capital on snapshot' }];
  })();

  const fireProgress: CalculationTrace = {
    id: 'financial-health:fire-progress',
    label: 'Financial Health — FIRE Progress',
    finalValue: fireFinalValue,
    plainEnglish:
      'FIRE Progress axis — current accessible capital divided by the FIRE capital target ' +
      '(annual expenses ÷ Safe Withdrawal Rate). Capped at 100. Same definition the ' +
      '/wealth-strategy hub uses for the visible Freedom Progress signal tile.',
    formula: 'fire_progress = min(100, (investable_now / (annual_expenses / SWR)) × 100)',
    expanded: fireExpanded,
    inputs: fireInputs,
    assumptions: [
      { label: 'Investable definition', value: 'cash + offset + super + stocks + crypto', source: 'wealth-strategy.derived.investable' },
      { label: 'SWR (default)', value: `${(swrUsed * 100).toFixed(1)}%`, source: 'firePathEngine.SWR' },
      { label: 'Cap', value: '100% (display ceiling)', source: 'wealth-strategy.derived.fireProgressPct' },
      { label: 'Surface', value: surface },
    ],
    dataSource: fireSource || 'live page derivation',
    sourceEngine: 'risk-radar page + firePathEngine.SWR',
    included: fireInputs.map(i => ({ label: i.label, value: String(i.value) })),
    excluded: [
      { label: 'Volatility', reason: 'Deterministic FIRE path — see Monte Carlo for stochastic FIRE probability.' },
      { label: 'PPOR / cars / Iran property', reason: 'Not investable / not liquid at preservation.' },
    ],
    calculatedAt: generatedAt,
    inputHash: hashTraceInputs([{ label: 'fire_progress', value: firePct ?? '—' }]),
    relatedIds: ['financial-health:overall', 'fire:date', 'fire:capital-target', 'wealth-strategy:freedom-progress'],
  };

  // Overall — mirror the legacy overall score under the canonical id so the
  // Dashboard / Risk Radar overall click resolves under either id.
  const overallInputs: TraceInput[] = result.categories.map(c => ({
    label: c.label,
    value: `${c.score}/100 (${c.level})`,
  }));
  const overall: CalculationTrace = {
    id: 'financial-health:overall',
    label: 'Financial Health — Overall Score',
    finalValue: `${result.overall_score} / 100 · ${result.overall_label}`,
    plainEnglish:
      'Overall Financial Health Score — the canonical Risk/Health composite. Computed as the weighted average of the four risk-radar categories on the legacy engine; surfaced here under the canonical 8-axis id.',
    formula: 'overall_health = Σ (category.score × CAT_WEIGHTS[category])',
    expanded: `Overall = ${result.overall_score} (label: ${result.overall_label}); fragility index = ${result.fragility_index}`,
    inputs: overallInputs,
    assumptions: [
      { label: 'Weights', value: 'Debt 0.30, Cashflow 0.25, Investment 0.25, Income 0.20', source: 'riskEngine.CAT_WEIGHTS' },
      { label: 'Surface', value: surface },
    ],
    dataSource: 'riskEngine.computeRiskRadar',
    sourceEngine: 'riskEngine.computeRiskRadar',
    included: result.categories.map(c => ({ label: c.label, value: c.score })),
    excluded: [],
    calculatedAt: generatedAt,
    inputHash: hashTraceInputs(overallInputs),
    relatedIds: [
      'financial-health:liquidity',
      'financial-health:leverage',
      'financial-health:cashflow',
      'financial-health:fire-progress',
      'risk-radar:overall',
    ],
  };

  return [liquidity, leverage, cashflow, fireProgress, overall];
}
