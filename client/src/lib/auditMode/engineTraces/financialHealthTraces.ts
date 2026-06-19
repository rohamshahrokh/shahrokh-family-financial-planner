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
