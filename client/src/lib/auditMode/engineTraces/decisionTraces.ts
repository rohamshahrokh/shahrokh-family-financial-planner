/**
 * decisionTraces.ts — Audit-mode trace factories for the Decision Engine
 * (scenarioV2 + registry/scoring).
 *
 * The Decision Engine produces a `QuickDecisionOutput` with a ranked list of
 * `RankedCandidate`s, each carrying a `CompositeScore` (base + breakdown +
 * penalties + weights) plus an `ExplainabilityTrace`. These factories turn
 * those structures into CalculationTraces. They DO NOT recompute scores —
 * they pin the canonical values onto a trace record.
 *
 * Ids exposed (winner-scoped):
 *   - decision:winner:total-score
 *   - decision:winner:component-scores
 *   - decision:winner:weightings
 *   - decision:winner:penalties
 *   - decision:winner:why-this-ranks         (whyWon rationale)
 *   - decision:winner:why-not-ranked-higher  (whatCouldInvalidate)
 *   - decision:winner:recommendation-logic   (rationale + headline)
 *
 * Best-Move / Recommendation engine (unified surfaces):
 *   - decision:bestmove:total-score
 *   - decision:bestmove:component-scores
 *   - decision:bestmove:why-this-ranks
 *   - decision:bestmove:why-not-ranked-higher
 *   - decision:bestmove:recommendation-logic
 *   - decision:bestmove:weightings
 *   - decision:bestmove:penalties
 */

import type { Recommendation } from '../../recommendationEngine/types';
import {
  hashTraceInputs,
  type CalculationTrace,
  type TraceInput,
} from '../calculationTrace';

const nowIso = () => new Date().toISOString();
const SOURCE_ENGINE_DECISION = 'scenarioV2.decisionEngine + scenarioV2.registry.scoring';
const SOURCE_ENGINE_BESTMOVE = 'recommendationEngine.computeUnifiedBestMove';

// ─────────────────────────────────────────────────────────────────────────────
// Decision Engine — winning candidate
// ─────────────────────────────────────────────────────────────────────────────

export interface DecisionWinnerTraceArgs {
  winnerId: string;
  winnerLabel: string;
  totalScore: number;
  baseScore: number;
  weights: Record<string, number>;
  breakdown: Array<{ axis: string; rawValue: number; normalisedValue: number; weight: number; contribution: number }>;
  penalties: Array<{ id: string; magnitude: number; reason: string; band?: string }>;
  rationale: string[];
  headline: string;
  whyWon: string[];
  whatCouldInvalidate: string[];
  runnerUpReason: string;
  investorProfile: string;
  generatedAt: string;
}

export function buildDecisionTotalScoreTrace(args: DecisionWinnerTraceArgs): CalculationTrace {
  const totalContribution = args.breakdown.reduce((s, b) => s + b.contribution, 0);
  const totalPenalty = args.penalties.reduce((s, p) => s + p.magnitude, 0);
  const inputs: TraceInput[] = [
    { label: 'Winning candidate', value: args.winnerLabel, source: 'QuickDecisionOutput.ranked[0]' },
    { label: 'Investor profile', value: args.investorProfile, source: 'QuickDecisionOutput.investorProfile' },
    { label: 'Base score (sum of contributions)', value: args.baseScore.toFixed(2), source: 'CompositeScore.baseScore' },
    { label: 'Penalties applied (total)', value: totalPenalty.toFixed(2), source: 'CompositeScore.penalties[].magnitude' },
    { label: 'Final score (0–100)', value: args.totalScore.toFixed(2), source: 'CompositeScore.score' },
  ];
  return {
    id: 'decision:winner:total-score',
    label: 'Decision Engine — Total Score',
    finalValue: args.totalScore.toFixed(0),
    plainEnglish:
      'The composite score (0–100) the Decision Engine assigns to the winning candidate. Higher = stronger overall fit to the active investor profile, after subtracting penalties.',
    formula: 'Total Score = Σ (axis_contribution) − Σ (penalty_magnitudes)',
    expanded: `Total = ${totalContribution.toFixed(2)} − ${totalPenalty.toFixed(2)} = ${args.totalScore.toFixed(2)}`,
    inputs,
    assumptions: [
      { label: 'Investor profile', value: args.investorProfile, source: 'QuickDecisionOutput.investorProfile' },
      { label: 'Normalised axes ∈ [0,1]', value: 'Yes', source: 'registry.scoring.normalise*' },
      { label: 'Score range', value: '[0, 100]', source: 'scoring.computeCompositeScore' },
    ],
    dataSource: 'scenarioV2 QuickDecisionOutput.ranked[0].score',
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: args.breakdown.map(b => ({ label: b.axis, value: b.contribution.toFixed(2) })),
    excluded: [
      { label: 'Soft warnings (chips)', reason: 'Surfaced separately; do not affect total score.' },
    ],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: [
      'decision:winner:component-scores',
      'decision:winner:weightings',
      'decision:winner:penalties',
      'decision:winner:why-this-ranks',
      'decision:winner:why-not-ranked-higher',
    ],
  };
}

export function buildDecisionComponentScoresTrace(args: DecisionWinnerTraceArgs): CalculationTrace {
  const inputs: TraceInput[] = args.breakdown.map(b => ({
    label: b.axis,
    value: `${(b.normalisedValue * 100).toFixed(0)} / 100 · contrib ${b.contribution.toFixed(2)}`,
    source: 'CompositeScore.breakdown[]',
  }));
  return {
    id: 'decision:winner:component-scores',
    label: 'Decision Engine — Component Scores',
    finalValue: `${args.breakdown.length} axes scored`,
    plainEnglish:
      'Each candidate is scored on multiple axes (survival probability, liquidity, risk-adjusted return, terminal NW, FIRE acceleration, etc.). Each axis is normalised to [0,1] then multiplied by its profile weight to produce a contribution.',
    formula: 'contribution_axis = normalised_axis × weight_axis × 100',
    expanded: args.breakdown
      .map(b => `${b.axis}: ${(b.normalisedValue * 100).toFixed(0)} × ${(b.weight * 100).toFixed(0)}% = ${b.contribution.toFixed(2)}`)
      .join('\n'),
    inputs,
    assumptions: [
      { label: 'Normalisation', value: 'clamp01 then mapped to axis-specific scale', source: 'registry.scoring.normalise*' },
      { label: 'Investor profile', value: args.investorProfile },
    ],
    dataSource: 'CompositeScore.breakdown',
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: args.breakdown.map(b => ({ label: b.axis, value: b.contribution.toFixed(2) })),
    excluded: [
      { label: 'Penalties', reason: 'Tracked separately on the same total.' },
    ],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['decision:winner:total-score', 'decision:winner:weightings'],
  };
}

export function buildDecisionWeightingsTrace(args: DecisionWinnerTraceArgs): CalculationTrace {
  const inputs: TraceInput[] = Object.entries(args.weights).map(([k, v]) => ({
    label: k,
    value: `${(v * 100).toFixed(0)}%`,
    source: `ScoreWeights.${k}`,
  }));
  return {
    id: 'decision:winner:weightings',
    label: 'Decision Engine — Weightings',
    finalValue: `${Object.keys(args.weights).length} weights (profile: ${args.investorProfile})`,
    plainEnglish:
      'Profile weights control how much each scoring axis contributes to the composite score. Switching profile (balanced / wealth_max / cashflow_safe / fire_focus) re-shapes these and can flip the winning candidate.',
    formula: 'Σ weight_axis = 1.0  (normalised)\ncontribution_axis = normalised_axis × weight_axis × 100',
    expanded: Object.entries(args.weights)
      .map(([k, v]) => `${k} = ${(v * 100).toFixed(1)}%`)
      .join('\n'),
    inputs,
    assumptions: [
      { label: 'Active profile', value: args.investorProfile, source: 'QuickDecisionOutput.investorProfile' },
    ],
    dataSource: 'scoring.computeCompositeScore weights',
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: inputs.map(i => ({ label: i.label, value: i.value })),
    excluded: [],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['decision:winner:total-score', 'decision:winner:component-scores'],
  };
}

export function buildDecisionPenaltiesTrace(args: DecisionWinnerTraceArgs): CalculationTrace {
  const totalPenalty = args.penalties.reduce((s, p) => s + p.magnitude, 0);
  const inputs: TraceInput[] = args.penalties.map(p => ({
    label: p.id,
    value: `−${p.magnitude.toFixed(2)} pts`,
    note: p.reason,
  }));
  return {
    id: 'decision:winner:penalties',
    label: 'Decision Engine — Penalties Applied',
    finalValue: args.penalties.length === 0 ? 'None' : `−${totalPenalty.toFixed(2)} pts (${args.penalties.length})`,
    plainEnglish:
      'Penalties are deterministic deductions for breaches of hard constraints — typically refinance pressure or excessive leverage. They are subtracted from the base score after all axis contributions are summed.',
    formula: 'penalty_id = breach_steps × penalty_weight × 100\ntotal_penalty = Σ penalty_id',
    expanded: args.penalties.length === 0
      ? 'No penalties triggered for this candidate.'
      : args.penalties
          .map(p => `${p.id}: ${p.reason} → −${p.magnitude.toFixed(2)} pts`)
          .join('\n'),
    inputs,
    assumptions: [
      { label: 'Refinance band steps', value: 'none=0, mild=0, elevated=1, severe=2', source: 'scoring.REFI_BAND_STEPS' },
      { label: 'Leverage threshold', value: 'IP LVR > 80% triggers proportional penalty', source: 'scoring.leveragePenalty' },
    ],
    dataSource: 'CompositeScore.penalties',
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: args.penalties.map(p => ({ label: p.id, value: p.magnitude.toFixed(2) })),
    excluded: [
      { label: 'Behavioural-priority tilts', reason: 'Modulate weights, not penalty values.' },
    ],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['decision:winner:total-score'],
  };
}

export function buildDecisionWhyThisRanksTrace(args: DecisionWinnerTraceArgs): CalculationTrace {
  const inputs: TraceInput[] = args.whyWon.length > 0
    ? args.whyWon.map((line, i) => ({ label: `Reason #${i + 1}`, value: line }))
    : args.rationale.slice(0, 3).map((r, i) => ({ label: `Rationale #${i + 1}`, value: r }));
  return {
    id: 'decision:winner:why-this-ranks',
    label: 'Decision Engine — Why this ranks #1',
    finalValue: `${inputs.length} reason${inputs.length === 1 ? '' : 's'}`,
    plainEnglish:
      'The deterministic narrative the Decision Engine produces for why this candidate beat the rest. Pulled from the engine\'s comparativeNarrative.whyWon + ranking rationale — same strings the page header / PDF report use.',
    formula: 'whyWon = compareTop2(ranked[0], ranked[1]).winnerReasons',
    expanded: args.whyWon.length > 0
      ? args.whyWon.join('\n')
      : args.rationale.join('\n'),
    inputs,
    assumptions: [
      { label: 'Comparison basis', value: 'Top 2 ranked candidates', source: 'comparativeNarrative.compareTop2' },
      { label: 'Profile', value: args.investorProfile },
    ],
    dataSource: 'QuickDecisionOutput.comparativeNarrative.whyWon',
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: inputs.map(i => ({ label: i.label, value: String(i.value) })),
    excluded: [
      { label: 'Soft warnings on the winner', reason: 'Surfaced separately as warning chips.' },
    ],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['decision:winner:total-score', 'decision:winner:why-not-ranked-higher'],
  };
}

export function buildDecisionWhyNotRankedHigherTrace(args: DecisionWinnerTraceArgs): CalculationTrace {
  const inputs: TraceInput[] = args.whatCouldInvalidate.length > 0
    ? args.whatCouldInvalidate.map((line, i) => ({ label: `Risk #${i + 1}`, value: line }))
    : [{ label: 'Runner-up note', value: args.runnerUpReason }];
  return {
    id: 'decision:winner:why-not-ranked-higher',
    label: 'Decision Engine — Why not ranked higher / what could invalidate',
    finalValue: `${inputs.length} caveat${inputs.length === 1 ? '' : 's'}`,
    plainEnglish:
      'Where the Decision Engine has hesitation about the winning candidate. Lists the scenarios / drift conditions that, if they occurred, would flip the ranking. Used by the engine\'s "what could invalidate" section.',
    formula: 'whatCouldInvalidate = comparativeNarrative.whatCouldInvalidate ⊕ runner-up triggers',
    expanded: args.whatCouldInvalidate.length > 0
      ? args.whatCouldInvalidate.join('\n')
      : args.runnerUpReason || 'No documented invalidation triggers.',
    inputs,
    assumptions: [
      { label: 'Drift detection', value: 'recommendation-drift module', source: 'scenarioV2.financialIntelligence' },
    ],
    dataSource: 'QuickDecisionOutput.comparativeNarrative.whatCouldInvalidate',
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: inputs.map(i => ({ label: i.label, value: String(i.value) })),
    excluded: [],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['decision:winner:total-score', 'decision:winner:why-this-ranks'],
  };
}

export function buildDecisionRecommendationLogicTrace(args: DecisionWinnerTraceArgs): CalculationTrace {
  const inputs: TraceInput[] = [
    { label: 'Winner id', value: args.winnerId, source: 'ranked[0].id' },
    { label: 'Headline', value: args.headline, source: 'ranked[0].headline' },
    { label: 'Rationale items', value: args.rationale.length },
    { label: 'Profile', value: args.investorProfile },
  ];
  return {
    id: 'decision:winner:recommendation-logic',
    label: 'Decision Engine — Recommendation Logic',
    finalValue: args.winnerLabel,
    plainEnglish:
      'The composite "why we recommend this candidate" narrative. Combines headline (one-line), rationale (bulleted reasons), profile-fit, and risk caveats into a single trace that mirrors the engine\'s written recommendation.',
    formula: 'recommendation = headline ⊕ rationale[] ⊕ whyWon[] − whatCouldInvalidate[]',
    expanded: [
      `Headline: ${args.headline}`,
      `Profile: ${args.investorProfile}`,
      `Total Score: ${args.totalScore.toFixed(1)} / 100`,
      `Rationale:`,
      ...args.rationale.map(r => `  • ${r}`),
    ].join('\n'),
    inputs,
    assumptions: [
      { label: 'Deterministic narrative', value: 'Yes', source: 'narrativeLayer.buildNarrative (no AI)' },
    ],
    dataSource: 'QuickDecisionOutput.ranked[0]',
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: [
      { label: 'Headline (1-line)' },
      { label: 'Per-axis rationale strings' },
      { label: 'whyWon vs runner-up' },
    ],
    excluded: [
      { label: 'AI-generated commentary', reason: 'Narrative Layer V1 is deterministic — no LLM in this engine.' },
    ],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: [
      'decision:winner:total-score',
      'decision:winner:why-this-ranks',
      'decision:winner:why-not-ranked-higher',
    ],
  };
}

// ─── Bundle helper ───────────────────────────────────────────────────────────

export function buildAllDecisionWinnerTraces(args: DecisionWinnerTraceArgs): CalculationTrace[] {
  return [
    buildDecisionTotalScoreTrace(args),
    buildDecisionComponentScoresTrace(args),
    buildDecisionWeightingsTrace(args),
    buildDecisionPenaltiesTrace(args),
    buildDecisionWhyThisRanksTrace(args),
    buildDecisionWhyNotRankedHigherTrace(args),
    buildDecisionRecommendationLogicTrace(args),
  ];
}

export const DECISION_WINNER_TRACE_IDS = [
  'decision:winner:total-score',
  'decision:winner:component-scores',
  'decision:winner:weightings',
  'decision:winner:penalties',
  'decision:winner:why-this-ranks',
  'decision:winner:why-not-ranked-higher',
  'decision:winner:recommendation-logic',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Best-Move / Recommendation Engine (unified pillar surfaces)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a trace bundle for the Best Move recommendation. Reuses the
 * Recommendation contract from the recommendationEngine (priorityRank,
 * confidenceScore, reasoning, sourceSignalsUsed, debtRationale, etc.).
 */
export function buildAllBestMoveTraces(rec: Recommendation): CalculationTrace[] {
  const generatedAt = nowIso();
  const totalScoreValue = (1 - (rec.priorityRank - 1) * 0.05) * rec.confidenceScore * 100;
  const totalInputs: TraceInput[] = [
    { label: 'Priority rank', value: rec.priorityRank, source: 'Recommendation.priorityRank' },
    { label: 'Confidence score', value: `${(rec.confidenceScore * 100).toFixed(0)}%`, source: 'Recommendation.confidenceScore' },
    { label: 'Urgency', value: rec.urgency, source: 'Recommendation.urgency' },
    { label: 'Risk level', value: rec.riskLevel, source: 'Recommendation.riskLevel' },
    { label: 'Pillar', value: rec.pillar, source: 'Recommendation.pillar' },
    { label: 'Signals used', value: rec.sourceSignalsUsed.join(', '), source: 'Recommendation.sourceSignalsUsed' },
  ];
  const total: CalculationTrace = {
    id: 'decision:bestmove:total-score',
    label: 'Best Move — Composite Score',
    finalValue: `${totalScoreValue.toFixed(0)} / 100`,
    plainEnglish:
      'A composite Best Move score combining priority rank (lower = more important) and confidence into a 0–100 fitness number for the top recommendation. Used to rank top priorities across surfaces.',
    formula: 'Best Move Score = (1 − (priorityRank − 1) × 0.05) × confidenceScore × 100',
    expanded: `Score = (1 − (${rec.priorityRank} − 1) × 0.05) × ${rec.confidenceScore.toFixed(2)} × 100 = ${totalScoreValue.toFixed(2)}`,
    inputs: totalInputs,
    assumptions: [
      { label: 'Rank decay', value: '5% per rank step', source: 'Best Move composite scoring' },
      { label: 'Hard safety pillars rank first', value: 'Yes', source: 'recommendationEngine.engine' },
    ],
    dataSource: 'computeUnifiedBestMove() result',
    sourceEngine: SOURCE_ENGINE_BESTMOVE,
    included: totalInputs.map(i => ({ label: i.label, value: String(i.value) })),
    excluded: [
      { label: 'Behavioural priorities', reason: 'Modulate ranking inside the engine; surfaced separately.' },
    ],
    calculatedAt: generatedAt,
    inputHash: hashTraceInputs(totalInputs),
    relatedIds: [
      'decision:bestmove:component-scores',
      'decision:bestmove:why-this-ranks',
      'decision:bestmove:recommendation-logic',
    ],
  };

  const componentInputs: TraceInput[] = [
    { label: 'Annual $ impact', value: rec.expectedFinancialImpact.annualDollar ?? '—' },
    { label: 'Expected return %', value: rec.expectedFinancialImpact.expectedReturnPct ?? '—' },
    { label: 'After-tax return %', value: rec.expectedFinancialImpact.afterTaxReturnPct ?? '—' },
    { label: 'FIRE years delta', value: rec.fireImpact?.yearsDelta ?? '—' },
    { label: 'FIRE survival delta', value: rec.fireImpact?.probabilityDelta ?? '—' },
    { label: 'Net worth delta', value: rec.netWorthImpact?.delta ?? '—' },
    { label: 'Risk-radar pts saved', value: rec.riskReductionImpact?.points ?? '—' },
  ];
  const components: CalculationTrace = {
    id: 'decision:bestmove:component-scores',
    label: 'Best Move — Component Scores',
    finalValue: `${componentInputs.filter(i => i.value !== '—').length} measurable impacts`,
    plainEnglish:
      'Each Best Move recommendation carries quantified impact estimates: expected $ benefit, FIRE timing delta, NW delta over a horizon, risk-radar points saved. These are the underlying components the engine uses to rank.',
    formula:
      'rank ← argmin pillarPriority(rec) − (confidence × magnitude)\nmagnitude = max(|annualDollar|, |riskPoints|, |fireDelta|×scale)',
    expanded: componentInputs.map(i => `${i.label} = ${i.value}`).join('\n'),
    inputs: componentInputs,
    assumptions: [
      { label: 'Confidence band', value: '0–1', source: 'Recommendation.confidenceScore' },
    ],
    dataSource: 'Recommendation.expectedFinancialImpact + fireImpact + netWorthImpact',
    sourceEngine: SOURCE_ENGINE_BESTMOVE,
    included: componentInputs.map(i => ({ label: i.label, value: String(i.value) })),
    excluded: [
      { label: 'Opportunity cost', reason: 'Surfaced separately as a chip / sub-line.' },
    ],
    calculatedAt: generatedAt,
    inputHash: hashTraceInputs(componentInputs),
    relatedIds: ['decision:bestmove:total-score'],
  };

  const whyInputs: TraceInput[] = [{ label: 'Reasoning', value: rec.reasoning }];
  const why: CalculationTrace = {
    id: 'decision:bestmove:why-this-ranks',
    label: 'Best Move — Why this ranks',
    finalValue: rec.title,
    plainEnglish:
      'The plain-English rationale the recommendation engine pinned to this Best Move. Engine-deterministic — same string the Best Move card / Action Centre / FIRE page render.',
    formula: 'reasoning = pillar.template + signal-bound clauses',
    expanded: rec.reasoning,
    inputs: whyInputs,
    assumptions: [
      { label: 'Pillar', value: rec.pillar },
      { label: 'Action type', value: rec.actionType },
    ],
    dataSource: 'Recommendation.reasoning',
    sourceEngine: SOURCE_ENGINE_BESTMOVE,
    included: [{ label: 'Reasoning string' }],
    excluded: [{ label: 'AI commentary', reason: 'Engine is deterministic.' }],
    calculatedAt: generatedAt,
    inputHash: hashTraceInputs(whyInputs),
    relatedIds: ['decision:bestmove:total-score', 'decision:bestmove:recommendation-logic'],
  };

  const whatCouldChange = rec.whatCouldChangeRecommendation ?? [];
  const whyNotInputs: TraceInput[] = whatCouldChange.length > 0
    ? whatCouldChange.map((line, i) => ({ label: `Trigger #${i + 1}`, value: line }))
    : [{ label: 'Trigger', value: rec.reviewTrigger?.condition ?? '—' }];
  const whyNot: CalculationTrace = {
    id: 'decision:bestmove:why-not-ranked-higher',
    label: 'Best Move — What would change this advice',
    finalValue: `${whyNotInputs.length} trigger${whyNotInputs.length === 1 ? '' : 's'}`,
    plainEnglish:
      'The deterministic list of conditions that, if they changed, would push this recommendation up or down in the ranking. Sourced from `whatCouldChangeRecommendation` and the `reviewTrigger` condition.',
    formula: 'triggers = whatCouldChangeRecommendation[] ⊕ reviewTrigger.condition',
    expanded: whatCouldChange.length > 0
      ? whatCouldChange.join('\n')
      : (rec.reviewTrigger?.condition ?? '—'),
    inputs: whyNotInputs,
    assumptions: [
      { label: 'Watched signals', value: (rec.reviewTrigger?.watchSignals ?? []).join(', ') || '—' },
      { label: 'Review by', value: rec.reviewTrigger?.reviewByISO ?? '—' },
    ],
    dataSource: 'Recommendation.whatCouldChangeRecommendation + reviewTrigger',
    sourceEngine: SOURCE_ENGINE_BESTMOVE,
    included: whyNotInputs.map(i => ({ label: i.label, value: String(i.value) })),
    excluded: [],
    calculatedAt: generatedAt,
    inputHash: hashTraceInputs(whyNotInputs),
    relatedIds: ['decision:bestmove:total-score', 'decision:bestmove:why-this-ranks'],
  };

  const logicInputs: TraceInput[] = [
    { label: 'Title', value: rec.title },
    { label: 'Action type', value: rec.actionType },
    { label: 'Implementation steps', value: rec.implementationSteps.length },
    { label: 'Alternatives considered', value: rec.alternativeOptions.length },
  ];
  const logic: CalculationTrace = {
    id: 'decision:bestmove:recommendation-logic',
    label: 'Best Move — Recommendation Logic',
    finalValue: rec.title,
    plainEnglish:
      'The full recommendation logic: title, action type, implementation steps, alternatives considered, and the pillar that drove the engine to surface it as #1. Deterministic — re-running the engine with the same signals produces the same recommendation.',
    formula: 'recommendation = argmax_{rec}( pillarPriority × confidence × magnitude × adaptiveTilt )',
    expanded: [
      `Title: ${rec.title}`,
      `Pillar: ${rec.pillar}`,
      `Action type: ${rec.actionType}`,
      `Confidence: ${(rec.confidenceScore * 100).toFixed(0)}%`,
      `Steps: ${rec.implementationSteps.length}`,
      `Alternatives: ${rec.alternativeOptions.length}`,
    ].join('\n'),
    inputs: logicInputs,
    assumptions: [
      { label: 'Hard safety stack', value: 'Always overrides preference', source: 'recommendationEngine.engine' },
    ],
    dataSource: 'Recommendation (full record)',
    sourceEngine: SOURCE_ENGINE_BESTMOVE,
    included: [
      { label: 'Implementation steps' },
      { label: 'Alternative options' },
      { label: 'CTA' },
    ],
    excluded: [
      { label: 'Future-dated reviews', reason: 'Trigger system handles those separately.' },
    ],
    calculatedAt: generatedAt,
    inputHash: hashTraceInputs(logicInputs),
    relatedIds: [
      'decision:bestmove:total-score',
      'decision:bestmove:component-scores',
      'decision:bestmove:why-this-ranks',
      'decision:bestmove:why-not-ranked-higher',
    ],
  };

  // Weightings: pillar-priority weighting view.
  const weightInputs: TraceInput[] = [
    { label: 'Pillar', value: rec.pillar },
    { label: 'Priority rank', value: rec.priorityRank },
    { label: 'Urgency', value: rec.urgency },
    { label: 'Confidence', value: `${(rec.confidenceScore * 100).toFixed(0)}%` },
  ];
  const weightings: CalculationTrace = {
    id: 'decision:bestmove:weightings',
    label: 'Best Move — Pillar Weightings',
    finalValue: rec.pillar,
    plainEnglish:
      'Pillar weighting and priority for the Best Move. Hard-safety pillars (prevent_failure, protect_liquidity, reduce_high_interest_debt) always rank ahead of growth pillars regardless of investor preference.',
    formula: 'rank order: prevent_failure > protect_liquidity > reduce_high_interest_debt > stabilise_leverage > preserve_tax_efficiency > maintain_investing_discipline > improve_fire_timeline > maximise_wealth',
    expanded: `Pillar=${rec.pillar} · Rank=${rec.priorityRank} · Urgency=${rec.urgency} · Confidence=${(rec.confidenceScore * 100).toFixed(0)}%`,
    inputs: weightInputs,
    assumptions: [
      { label: 'Pillar precedence', value: 'Hard safety > growth', source: 'recommendationEngine.engine' },
    ],
    dataSource: 'Recommendation.pillar + priorityRank',
    sourceEngine: SOURCE_ENGINE_BESTMOVE,
    included: weightInputs.map(i => ({ label: i.label, value: String(i.value) })),
    excluded: [],
    calculatedAt: generatedAt,
    inputHash: hashTraceInputs(weightInputs),
    relatedIds: ['decision:bestmove:total-score'],
  };

  // Penalties: opportunity cost / risk-level deductions.
  const penaltyInputs: TraceInput[] = [
    { label: 'Risk level', value: rec.riskLevel },
    { label: 'Opportunity cost', value: rec.opportunityCost?.description ?? '—' },
    { label: 'Liquidity Δ cash', value: rec.liquidityImpact?.deltaDeployableCash ?? '—' },
    { label: 'Liquidity Δ runway months', value: rec.liquidityImpact?.deltaRunwayMonths ?? '—' },
  ];
  const penalties: CalculationTrace = {
    id: 'decision:bestmove:penalties',
    label: 'Best Move — Penalties / Trade-offs',
    finalValue: `${rec.riskLevel} risk · ${rec.opportunityCost ? 'opp-cost' : 'no opp-cost'}`,
    plainEnglish:
      'The trade-offs / penalties associated with this recommendation: opportunity cost vs. alternatives, liquidity drain, risk level. These are *not* deductions from a score — they\'re the implicit cost of acting that the engine surfaces for transparency.',
    formula:
      'tradeoffs = opportunityCost ⊕ liquidityImpact ⊕ riskLevel\nNo numeric penalty: surfaced as warnings.',
    expanded: penaltyInputs.map(i => `${i.label} = ${i.value}`).join('\n'),
    inputs: penaltyInputs,
    assumptions: [
      { label: 'Risk band map', value: 'Low / Med / High', source: 'Recommendation.riskLevel' },
    ],
    dataSource: 'Recommendation.opportunityCost + liquidityImpact + riskLevel',
    sourceEngine: SOURCE_ENGINE_BESTMOVE,
    included: penaltyInputs.map(i => ({ label: i.label, value: String(i.value) })),
    excluded: [],
    calculatedAt: generatedAt,
    inputHash: hashTraceInputs(penaltyInputs),
    relatedIds: ['decision:bestmove:total-score'],
  };

  return [total, components, weightings, penalties, why, whyNot, logic];
}

export const BESTMOVE_TRACE_IDS = [
  'decision:bestmove:total-score',
  'decision:bestmove:component-scores',
  'decision:bestmove:weightings',
  'decision:bestmove:penalties',
  'decision:bestmove:why-this-ranks',
  'decision:bestmove:why-not-ranked-higher',
  'decision:bestmove:recommendation-logic',
] as const;
