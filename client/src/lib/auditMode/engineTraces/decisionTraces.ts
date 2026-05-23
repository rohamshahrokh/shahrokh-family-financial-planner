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

// ─────────────────────────────────────────────────────────────────────────────
// Decision Engine — per-candidate (rank N) traces + ranking-logic + lens-scores
// ─────────────────────────────────────────────────────────────────────────────

export interface DecisionCandidateTraceArgs {
  rank: number;
  candidate: {
    id: string;
    label: string;
    headline: string;
    score: {
      score: number;
      baseScore: number;
      breakdown: Array<{
        axis: string;
        rawValue: number;
        normalisedValue: number;
        weight: number;
        contribution: number;
      }>;
      penalties: Array<{ id: string; magnitude: number; reason: string; band?: string }>;
    };
    rationale: string[];
  };
  investorProfile: string;
  generatedAt: string;
}

/** Per-candidate Total Score trace — keyed by candidate id so each rank row
 *  can be opened independently of the winner trace. */
export function buildDecisionCandidateScoreTrace(args: DecisionCandidateTraceArgs): CalculationTrace {
  const { rank, candidate } = args;
  const totalContribution = candidate.score.breakdown.reduce((s, b) => s + b.contribution, 0);
  const totalPenalty = candidate.score.penalties.reduce((s, p) => s + p.magnitude, 0);
  const inputs: TraceInput[] = [
    { label: 'Rank', value: `#${rank}`, source: 'QuickDecisionOutput.ranked' },
    { label: 'Candidate label', value: candidate.label, source: 'RankedCandidate.label' },
    { label: 'Investor profile', value: args.investorProfile },
    { label: 'Base score (Σ contributions)', value: candidate.score.baseScore.toFixed(2) },
    { label: 'Penalties applied', value: totalPenalty.toFixed(2) },
    { label: 'Final score (0–100)', value: candidate.score.score.toFixed(2) },
  ];
  return {
    id: `decision:candidate:${candidate.id}:total-score`,
    label: `Decision Engine — Candidate #${rank} Score`,
    finalValue: candidate.score.score.toFixed(0),
    plainEnglish:
      `Composite score (0–100) for "${candidate.label}" (rank #${rank}). Same scoring math as the winner trace — ` +
      `weighted sum of normalised axes minus penalties, evaluated under the active investor profile.`,
    formula: 'Score = Σ (axis_contribution) − Σ (penalty_magnitudes)',
    expanded: `Score = ${totalContribution.toFixed(2)} − ${totalPenalty.toFixed(2)} = ${candidate.score.score.toFixed(2)}`,
    inputs,
    assumptions: [
      { label: 'Profile', value: args.investorProfile },
      { label: 'Normalised axes ∈ [0,1]', value: 'Yes', source: 'registry.scoring.normalise*' },
    ],
    dataSource: `QuickDecisionOutput.ranked[#${rank}]`,
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: candidate.score.breakdown.map(b => ({ label: b.axis, value: b.contribution.toFixed(2) })),
    excluded: [{ label: 'Soft warnings', reason: 'Surfaced separately as chips; not in score.' }],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: [
      `decision:candidate:${candidate.id}:component-scores`,
      `decision:candidate:${candidate.id}:penalties`,
      `decision:candidate:${candidate.id}:rationale`,
      'decision:ranking-logic',
    ],
  };
}

/** Per-candidate Component Scores trace — score breakdown by axis with values. */
export function buildDecisionCandidateComponentTrace(args: DecisionCandidateTraceArgs): CalculationTrace {
  const { rank, candidate } = args;
  const inputs: TraceInput[] = candidate.score.breakdown.map(b => ({
    label: b.axis,
    value: `${(b.normalisedValue * 100).toFixed(0)} / 100 · contrib ${b.contribution.toFixed(2)}`,
    source: 'CompositeScore.breakdown[]',
  }));
  return {
    id: `decision:candidate:${candidate.id}:component-scores`,
    label: `Decision Engine — Candidate #${rank} Component Scores`,
    finalValue: `${candidate.score.breakdown.length} axes scored`,
    plainEnglish:
      `Per-axis breakdown for "${candidate.label}". Each axis is normalised to [0,1] then multiplied by its profile weight.`,
    formula: 'contribution_axis = normalised_axis × weight_axis × 100',
    expanded: candidate.score.breakdown
      .map(b => `${b.axis}: ${(b.normalisedValue * 100).toFixed(0)} × ${(b.weight * 100).toFixed(0)}% = ${b.contribution.toFixed(2)}`)
      .join('\n'),
    inputs,
    assumptions: [{ label: 'Profile', value: args.investorProfile }],
    dataSource: `RankedCandidate(${candidate.id}).score.breakdown`,
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: candidate.score.breakdown.map(b => ({ label: b.axis, value: b.contribution.toFixed(2) })),
    excluded: [],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: [`decision:candidate:${candidate.id}:total-score`],
  };
}

/** Per-candidate Penalties trace. */
export function buildDecisionCandidatePenaltiesTrace(args: DecisionCandidateTraceArgs): CalculationTrace {
  const { rank, candidate } = args;
  const totalPenalty = candidate.score.penalties.reduce((s, p) => s + p.magnitude, 0);
  const inputs: TraceInput[] = candidate.score.penalties.map(p => ({
    label: p.id,
    value: `−${p.magnitude.toFixed(2)} pts`,
    note: p.reason,
  }));
  return {
    id: `decision:candidate:${candidate.id}:penalties`,
    label: `Decision Engine — Candidate #${rank} Penalties`,
    finalValue: candidate.score.penalties.length === 0 ? 'None' : `−${totalPenalty.toFixed(2)} pts (${candidate.score.penalties.length})`,
    plainEnglish:
      `Deterministic penalty deductions for "${candidate.label}" — typically refinance pressure or excessive leverage.`,
    formula: 'penalty_id = breach_steps × penalty_weight × 100\ntotal_penalty = Σ penalty_id',
    expanded: candidate.score.penalties.length === 0
      ? 'No penalties triggered for this candidate.'
      : candidate.score.penalties.map(p => `${p.id}: ${p.reason} → −${p.magnitude.toFixed(2)} pts`).join('\n'),
    inputs,
    assumptions: [
      { label: 'Refinance band steps', value: 'none=0, mild=0, elevated=1, severe=2', source: 'scoring.REFI_BAND_STEPS' },
    ],
    dataSource: `RankedCandidate(${candidate.id}).score.penalties`,
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: candidate.score.penalties.map(p => ({ label: p.id, value: p.magnitude.toFixed(2) })),
    excluded: [],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: [`decision:candidate:${candidate.id}:total-score`],
  };
}

/** Per-candidate Rationale trace — the strengths/weaknesses narrative. */
export function buildDecisionCandidateRationaleTrace(args: DecisionCandidateTraceArgs): CalculationTrace {
  const { rank, candidate } = args;
  const inputs: TraceInput[] = candidate.rationale.length > 0
    ? candidate.rationale.map((r, i) => ({ label: `Reason #${i + 1}`, value: r }))
    : [{ label: 'Headline', value: candidate.headline }];
  return {
    id: `decision:candidate:${candidate.id}:rationale`,
    label: `Decision Engine — Candidate #${rank} Rationale`,
    finalValue: `${inputs.length} reason${inputs.length === 1 ? '' : 's'}`,
    plainEnglish:
      `Engine-generated per-axis rationale for why "${candidate.label}" ranks where it does. Same strings the StrategyCard "Why this ranks" + deep-dive PDF use.`,
    formula: 'rationale[] = scoring.buildAxisRationale(breakdown[], profile)',
    expanded: candidate.rationale.length > 0 ? candidate.rationale.join('\n') : candidate.headline,
    inputs,
    assumptions: [{ label: 'Profile', value: args.investorProfile }],
    dataSource: `RankedCandidate(${candidate.id}).rationale`,
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: inputs.map(i => ({ label: i.label, value: String(i.value) })),
    excluded: [],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: [`decision:candidate:${candidate.id}:total-score`],
  };
}

/** Bundle for one candidate row. */
export function buildAllDecisionCandidateTraces(args: DecisionCandidateTraceArgs): CalculationTrace[] {
  return [
    buildDecisionCandidateScoreTrace(args),
    buildDecisionCandidateComponentTrace(args),
    buildDecisionCandidatePenaltiesTrace(args),
    buildDecisionCandidateRationaleTrace(args),
  ];
}

// ─── Ranking logic (cross-candidate) ─────────────────────────────────────────

export interface DecisionRankingLogicTraceArgs {
  candidates: Array<{ id: string; label: string; score: number; rank: number }>;
  investorProfile: string;
  riskMode: string;
  weights: Record<string, number>;
  totalGenerated: number;
  totalDiscarded: number;
  generatedAt: string;
}

/** Page-level ranking-logic trace — explains how the engine sorted the full
 *  list of candidates under the active profile + risk mode. */
export function buildDecisionRankingLogicTrace(args: DecisionRankingLogicTraceArgs): CalculationTrace {
  const inputs: TraceInput[] = args.candidates.slice(0, 10).map(c => ({
    label: `#${c.rank} ${c.label}`,
    value: c.score.toFixed(2),
    source: 'QuickDecisionOutput.ranked',
  }));
  const weightLines = Object.entries(args.weights)
    .map(([k, v]) => `${k} = ${(v * 100).toFixed(1)}%`)
    .join('\n');
  return {
    id: 'decision:ranking-logic',
    label: 'Decision Engine — Ranking Logic',
    finalValue: `${args.candidates.length} ranked · ${args.totalDiscarded} filtered out`,
    plainEnglish:
      'How candidates were sorted into the final ranking. For each remaining candidate the engine ran a 300-path Monte Carlo, scored every axis under the active investor profile weights, applied refinance/leverage penalties, and sorted by composite score.',
    formula:
      'rank(c) = sort_desc( Σ (normalise(axis, profile) × weight(axis)) − Σ penalty(c) )',
    expanded: [
      `Total generated: ${args.totalGenerated}`,
      `Filtered out (behavioural / safety): ${args.totalDiscarded}`,
      `Risk mode: ${args.riskMode}`,
      `Profile: ${args.investorProfile}`,
      ``,
      `Weights:`,
      weightLines,
      ``,
      `Top of ranking:`,
      ...args.candidates.slice(0, 10).map(c => `  #${c.rank} ${c.label} → ${c.score.toFixed(1)}`),
    ].join('\n'),
    inputs,
    assumptions: [
      { label: 'Risk mode', value: args.riskMode, source: 'QuickDecisionOutput.riskControlsApplied.mode' },
      { label: 'Profile', value: args.investorProfile, source: 'QuickDecisionOutput.investorProfile' },
      { label: 'MC paths per candidate', value: 300, source: 'generateQuickDecisionCandidates.simulationCount' },
    ],
    dataSource: 'QuickDecisionOutput.ranked + discarded + riskControlsApplied',
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: args.candidates.map(c => ({ label: `#${c.rank} ${c.label}`, value: c.score.toFixed(2) })),
    excluded: [],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: [
      'decision:winner:total-score',
      'decision:winner:weightings',
      'decision:winner:why-this-ranks',
      'decision:trade-off-analysis',
    ],
  };
}

// ─── Trade-off analysis (winner) ─────────────────────────────────────────────

export interface DecisionTradeoffsTraceArgs {
  candidateLabel: string;
  candidateId: string;
  rank: number;
  tradeOffs: {
    returnPotential: number;
    riskExposure: number;
    liquidity: number;
    cashflowSafety: number;
    taxEfficiency: number;
    volatilityTolerance: number;
  };
  investorProfile: string;
  generatedAt: string;
}

export function buildDecisionTradeoffsTrace(args: DecisionTradeoffsTraceArgs): CalculationTrace {
  const t = args.tradeOffs;
  const inputs: TraceInput[] = [
    { label: 'Return potential',     value: `${(t.returnPotential * 100).toFixed(0)} / 100` },
    { label: 'Risk exposure',        value: `${(t.riskExposure * 100).toFixed(0)} / 100`, note: 'higher = more risk' },
    { label: 'Liquidity',            value: `${(t.liquidity * 100).toFixed(0)} / 100` },
    { label: 'Cashflow safety',      value: `${(t.cashflowSafety * 100).toFixed(0)} / 100` },
    { label: 'Tax efficiency',       value: `${(t.taxEfficiency * 100).toFixed(0)} / 100` },
    { label: 'Volatility tolerance', value: `${(t.volatilityTolerance * 100).toFixed(0)} / 100`, note: 'higher = needs more tolerance' },
  ];
  return {
    id: `decision:trade-off-analysis`,
    label: 'Decision Engine — Trade-off Analysis',
    finalValue: `${args.candidateLabel} (rank #${args.rank})`,
    plainEnglish:
      'Trade-off radar for the currently surfaced candidate. Each axis is a [0,1] index derived deterministically from MC outputs (return potential from terminal NW spread, risk from VaR/CVaR + default-probability, liquidity from low-cash exposure, cashflow safety from negative-month frequency, tax efficiency from effective tax rate, volatility tolerance from monthly NW σ).',
    formula: 'tradeOffs = buildStrategyIntelligence(candidate, baseline).tradeOffs',
    expanded: inputs.map(i => `${i.label} = ${i.value}`).join('\n'),
    inputs,
    assumptions: [
      { label: 'Index scale', value: '[0, 1] then × 100 for display' },
      { label: 'Profile', value: args.investorProfile },
    ],
    dataSource: 'scenarioV2.decisionEngine.strategyIntelligence.tradeOffs',
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: inputs.map(i => ({ label: i.label, value: String(i.value) })),
    excluded: [
      { label: 'Composite Score', reason: 'Shown separately under total-score trace.' },
    ],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: [
      `decision:candidate:${args.candidateId}:total-score`,
      'decision:winner:total-score',
      'decision:ranking-logic',
    ],
  };
}

// ─── Multi-winner lens score traces ──────────────────────────────────────────

export interface DecisionLensTraceArgs {
  lensKey: 'balanced' | 'wealthMax' | 'cashflowSafe' | 'highRisk';
  lensLabel: string;
  winnerLabel: string;
  winnerId: string;
  score: number;
  whyThisWins: string;
  investorProfile: string;
  generatedAt: string;
}

export function buildDecisionLensTrace(args: DecisionLensTraceArgs): CalculationTrace {
  const inputs: TraceInput[] = [
    { label: 'Lens', value: args.lensLabel },
    { label: 'Winning candidate', value: args.winnerLabel },
    { label: 'Lens score', value: args.score.toFixed(2) },
    { label: 'Active profile', value: args.investorProfile },
  ];
  return {
    id: `decision:lens:${args.lensKey}`,
    label: `Decision Engine — Lens "${args.lensLabel}"`,
    finalValue: `${args.winnerLabel} · ${args.score.toFixed(0)}`,
    plainEnglish:
      `Re-scoring of the same candidate set under the "${args.lensLabel}" lens. ${args.whyThisWins}. ` +
      `The composite math is unchanged — only the axis weights flip, which is why "best" can differ from the active profile's winner.`,
    formula: 'lens_score = Σ (normalised_axis × lens_weight) − Σ penalties',
    expanded: `Lens: ${args.lensLabel}\nWinner under this lens: ${args.winnerLabel}\nScore: ${args.score.toFixed(2)} / 100`,
    inputs,
    assumptions: [
      { label: 'Lens weighting source', value: 'engine multiWinner re-score', source: 'scenarioV2.decisionEngine.multiWinner' },
    ],
    dataSource: 'QuickDecisionOutput.multiWinner',
    sourceEngine: SOURCE_ENGINE_DECISION,
    included: inputs.map(i => ({ label: i.label, value: String(i.value) })),
    excluded: [],
    calculatedAt: args.generatedAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['decision:ranking-logic', 'decision:winner:total-score'],
  };
}

export const DECISION_EXTENDED_TRACE_IDS = [
  'decision:ranking-logic',
  'decision:trade-off-analysis',
  'decision:lens:balanced',
  'decision:lens:wealthMax',
  'decision:lens:cashflowSafe',
  'decision:lens:highRisk',
] as const;
