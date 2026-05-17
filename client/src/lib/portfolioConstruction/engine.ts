/**
 * Portfolio Construction Engine — selectAllocationModel + buildPortfolio.
 *
 * Deterministic, pure, no I/O. Decorates Recommendation Engine V2 via tilts.
 */

import type {
  AllocationModel,
  AllocationTarget,
  AssetClass,
  PortfolioConstructionResult,
  PortfolioInputs,
  PortfolioMetrics,
  RebalanceMove,
} from './types';
import { MODEL_LABELS, MODEL_RATIONALES, MODEL_TEMPLATES } from './models';

const DEFAULT_RETURNS: Record<AssetClass, number> = {
  cash: 0.045,
  offset: 0.062,            // imputed mortgage rate saved
  debtPaydown: 0.17,        // high-interest debt avoided
  etf: 0.085,
  crypto: 0.14,
  super: 0.075,
  ppor: 0.05,
  investmentProperty: 0.07,
};

const DEFAULT_VOL: Record<AssetClass, number> = {
  cash: 0.005,
  offset: 0.005,
  debtPaydown: 0.005,
  etf: 0.16,
  crypto: 0.70,
  super: 0.11,
  ppor: 0.10,
  investmentProperty: 0.14,
};

const NON_PPOR: AssetClass[] = [
  'cash', 'offset', 'debtPaydown', 'etf', 'crypto', 'super', 'investmentProperty',
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Choose the appropriate allocation model from the inputs. Hard safety rules:
 * if stress is severe OR liquidity need is very high, defensive / cashflow_safe
 * win regardless of preferences.
 */
export function selectAllocationModel(inputs: PortfolioInputs): AllocationModel {
  if (inputs.forceModel) return inputs.forceModel;

  const stress = inputs.mcStressPressure ?? 0;
  const survival = inputs.mcSurvivalProbability ?? 1;
  const liquidity = inputs.liquidityNeed ?? 0;
  const incomeVol = inputs.incomeVolatility ?? 0;
  const macro = inputs.macroRegime;

  // Hard safety regimes override preference.
  if (stress >= 0.6 || survival < 0.45) return 'defensive';
  if (liquidity >= 0.7 || incomeVol >= 0.7) return 'cashflow_safe';
  if (macro === 'crisis') return 'anti_fragile';
  if (macro === 'stagflation') return 'anti_fragile';
  if (macro === 'recession' && (inputs.drawdownPanicThreshold ?? 0.5) < 0.4) return 'defensive';

  // Preference-driven.
  const risk = inputs.riskTolerance ?? 0;
  const fireUrgency = inputs.fireUrgency ?? 0;
  const propertyBias = inputs.propertyBias ?? 0;
  const etfBias = inputs.etfBias ?? 0;
  const drawdownTol = inputs.drawdownPanicThreshold ?? 0.5;
  const lev = inputs.leverageTolerance ?? 0.5;

  // Debt-minimising if user is strongly debt averse (signalled by low leverage tolerance + macro tightening).
  if (lev < 0.25 && (macro === 'late_cycle' || macro === 'recession')) return 'debt_minimising';

  if (fireUrgency > 0.7 && risk > 0) return 'fire_first';
  if (propertyBias > 0.6 && lev > 0.5) return 'property_heavy';
  if (etfBias > 0.6 || (risk > 0.4 && propertyBias < 0)) return 'etf_heavy';

  if (risk > 0.5 && drawdownTol > 0.5) return 'aggressive_growth';
  if (risk < -0.3 || drawdownTol < 0.3) return 'defensive';
  return 'balanced';
}

/**
 * Take a template and perturb by a few preference levers, then re-normalise.
 */
function perturbTemplate(model: AllocationModel, inputs: PortfolioInputs): Record<AssetClass, number> {
  const tpl = MODEL_TEMPLATES[model];
  const out: Record<AssetClass, number> = {
    cash: tpl.cash ?? 0,
    offset: tpl.offset ?? 0,
    debtPaydown: tpl.debtPaydown ?? 0,
    etf: tpl.etf ?? 0,
    crypto: tpl.crypto ?? 0,
    super: tpl.super ?? 0,
    investmentProperty: tpl.investmentProperty ?? 0,
    ppor: 0,
  };

  // Soft tilts (each ±5pp max).
  const adjust = (k: AssetClass, delta: number) => { out[k] = clamp(out[k] + delta, 0, 1); };
  if (inputs.cryptoBias != null) adjust('crypto', 0.04 * inputs.cryptoBias);
  if (inputs.etfBias != null) adjust('etf', 0.05 * inputs.etfBias);
  if (inputs.propertyBias != null) adjust('investmentProperty', 0.05 * inputs.propertyBias);
  if (inputs.liquidityNeed != null) {
    adjust('cash', 0.05 * inputs.liquidityNeed);
    adjust('offset', 0.05 * inputs.liquidityNeed);
  }
  if (inputs.fireUrgency != null && inputs.fireUrgency > 0.5) {
    adjust('etf', 0.04 * (inputs.fireUrgency - 0.5) * 2);
  }
  if (inputs.taxOptimisation != null && inputs.taxOptimisation > 0.5) {
    adjust('super', 0.04 * (inputs.taxOptimisation - 0.5) * 2);
  }
  // Stress reduces risk assets.
  const stress = inputs.mcStressPressure ?? 0;
  if (stress > 0.3) {
    adjust('crypto', -0.05 * stress);
    adjust('etf', -0.04 * stress);
    adjust('cash', 0.03 * stress);
    adjust('offset', 0.03 * stress);
    adjust('debtPaydown', 0.02 * stress);
  }

  // Renormalise non-PPOR slice to 1.0.
  const total = NON_PPOR.reduce((acc, k) => acc + out[k], 0);
  if (total > 0) {
    for (const k of NON_PPOR) out[k] = out[k] / total;
  }
  return out;
}

function classifyDrift(absDrift: number): AllocationTarget['driftBand'] {
  if (absDrift < 0.02) return 'none';
  if (absDrift < 0.05) return 'mild';
  if (absDrift < 0.10) return 'notable';
  return 'urgent';
}

function computeMetrics(
  targets: Record<AssetClass, number>,
  inputs: PortfolioInputs,
): PortfolioMetrics {
  const returns = { ...DEFAULT_RETURNS, ...(inputs.expectedReturns ?? {}) };
  const vols = { ...DEFAULT_VOL, ...(inputs.expectedVol ?? {}) };

  let expectedReturn = 0;
  let varianceProxy = 0;
  for (const k of NON_PPOR) {
    const w = targets[k];
    expectedReturn += w * returns[k];
    // Simple weighted variance (assumes zero correlation between buckets — approximation).
    varianceProxy += (w * vols[k]) ** 2;
  }
  const expectedVol = Math.sqrt(varianceProxy);
  const sharpeApprox = expectedVol > 0 ? (expectedReturn - 0.045) / expectedVol : 0;

  // Downside probability — rough normal approximation that annual return < 0.
  const z = expectedVol > 0 ? -expectedReturn / expectedVol : 0;
  const downsideProbability = clamp(0.5 * (1 - erfApprox(z / Math.SQRT2)), 0, 1);

  // Liquidity score — cash + offset + debtPaydown rated highest, then etf, super illiquid until 60, property illiquid.
  const liquidityScore = clamp(
    (targets.cash + targets.offset) * 100 +
    targets.debtPaydown * 70 +
    targets.etf * 60 +
    targets.crypto * 50 +
    targets.super * 10 +
    targets.investmentProperty * 5,
    0,
    100,
  );

  // Tax efficiency: super and offset are tax-efficient; cash and crypto leak more.
  const taxEfficiencyScore = clamp(
    targets.super * 100 +
    targets.offset * 95 +
    targets.debtPaydown * 80 +
    targets.investmentProperty * 65 +
    targets.etf * 60 +
    targets.crypto * 40 +
    targets.cash * 30,
    0,
    100,
  );

  // Leverage proxy: investment property weight x lev tolerance.
  const leverageProxy = targets.investmentProperty * (inputs.leverageTolerance ?? 0.5) * 1.4;

  // FIRE fit: ETF + super + property weights vs FIRE urgency.
  const liquidGrowth = targets.etf + targets.super + 0.6 * targets.investmentProperty;
  const fireUrgency = inputs.fireUrgency ?? 0.5;
  const fireFitScore = clamp(liquidGrowth * 100 - Math.abs(fireUrgency - liquidGrowth) * 30, 0, 100);

  return {
    expectedReturn,
    expectedVol,
    sharpeApprox,
    downsideProbability,
    liquidityScore,
    taxEfficiencyScore,
    leverageProxy,
    fireFitScore,
  };
}

// Numerical approximation of erf (Abramowitz-Stegun 7.1.26).
function erfApprox(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592 * t;
  const erf = 1 - y * Math.exp(-ax * ax);
  return sign * erf;
}

function computeRebalanceMoves(
  targets: AllocationTarget[],
  total: number,
): RebalanceMove[] {
  if (total <= 0) return [];
  const overweight = targets.filter(t => t.drift > 0 && t.driftBand !== 'none')
    .sort((a, b) => b.drift - a.drift);
  const underweight = targets.filter(t => t.drift < 0 && t.driftBand !== 'none')
    .sort((a, b) => a.drift - b.drift);

  const moves: RebalanceMove[] = [];
  let oi = 0, ui = 0;
  while (oi < overweight.length && ui < underweight.length) {
    const ow = overweight[oi];
    const uw = underweight[ui];
    const amount = Math.min(ow.drift, -uw.drift) * total;
    if (amount < 250) {
      // skip tiny moves
      if (ow.drift < -uw.drift) oi++; else ui++;
      continue;
    }
    moves.push({
      from: ow.asset,
      to: uw.asset,
      amount: Math.round(amount),
      rationale: `Trim ${ow.asset} (${(ow.drift * 100).toFixed(1)}pp overweight) into ${uw.asset} (${(-uw.drift * 100).toFixed(1)}pp underweight).`,
    });
    if (ow.drift < -uw.drift) oi++; else ui++;
    if (moves.length >= 6) break;
  }
  return moves;
}

export function buildPortfolio(inputs: PortfolioInputs): PortfolioConstructionResult {
  const model = selectAllocationModel(inputs);
  const perturbed = perturbTemplate(model, inputs);

  const current = inputs.current ?? {};
  const nonPporCurrent = NON_PPOR.reduce((acc, k) => acc + (current[k] ?? 0), 0);
  const total = nonPporCurrent;

  const targets: AllocationTarget[] = NON_PPOR.map(asset => {
    const target = perturbed[asset];
    const cur = (current[asset] ?? 0);
    const curPct = total > 0 ? cur / total : 0;
    const drift = curPct - target;
    const abs = Math.abs(drift);
    const band = classifyDrift(abs);
    let action: AllocationTarget['action'] = 'hold';
    if (band === 'urgent' || band === 'notable') {
      action = drift > 0 ? 'trim' : 'add';
    } else if (band === 'mild') {
      action = drift > 0 ? 'pause_contributions' : 'add';
    }
    return { asset, target, current: curPct, drift, driftBand: band, action };
  });

  const metrics = computeMetrics(perturbed, inputs);
  const rebalanceMoves = computeRebalanceMoves(targets, total);

  // Soft tilts to feed Recommendation Engine — never strong enough to overrule a hard pillar.
  const tilts: PortfolioConstructionResult['tilts'] = {};
  const findTarget = (a: AssetClass) => targets.find(t => t.asset === a);
  const etf = findTarget('etf');
  const prop = findTarget('investmentProperty');
  const cash = findTarget('cash');
  const debt = findTarget('debtPaydown');
  const sup = findTarget('super');
  const cry = findTarget('crypto');
  if (etf && etf.drift < -0.02) tilts.etfPush = clamp(-etf.drift, 0, 0.2);
  if (prop && prop.drift < -0.02) tilts.propertyPush = clamp(-prop.drift, 0, 0.2);
  if (cash && cash.drift < -0.02) tilts.cashHold = clamp(-cash.drift, 0, 0.2);
  if (debt && debt.drift < -0.02) tilts.debtPay = clamp(-debt.drift, 0, 0.2);
  if (sup && sup.drift < -0.02) tilts.superPush = clamp(-sup.drift, 0, 0.2);
  if (cry && cry.drift > 0.05) tilts.cryptoTrim = clamp(cry.drift, 0, 0.2);

  const narrative = buildNarrative(model, metrics, targets, inputs);

  return {
    model,
    modelLabel: MODEL_LABELS[model],
    modelRationale: MODEL_RATIONALES[model],
    targets,
    rebalanceMoves,
    metrics,
    totalTracked: total,
    tilts,
    narrative,
    generatedAt: new Date().toISOString(),
  };
}

function buildNarrative(
  model: AllocationModel,
  metrics: PortfolioMetrics,
  targets: AllocationTarget[],
  inputs: PortfolioInputs,
): string {
  const urgent = targets.filter(t => t.driftBand === 'urgent');
  const liquidityWord = metrics.liquidityScore > 65 ? 'strong' :
                        metrics.liquidityScore > 40 ? 'adequate' : 'thin';
  const taxWord = metrics.taxEfficiencyScore > 70 ? 'tax-efficient' :
                  metrics.taxEfficiencyScore > 50 ? 'reasonable' : 'tax-leaky';
  const stress = inputs.mcStressPressure ?? 0;
  const macro = inputs.macroRegime ?? 'expansion';

  const parts: string[] = [];
  parts.push(`Target allocation: ${MODEL_LABELS[model]}.`);
  parts.push(`Forward expected return ${(metrics.expectedReturn * 100).toFixed(1)}% with vol ${(metrics.expectedVol * 100).toFixed(1)}% — liquidity ${liquidityWord}, structure ${taxWord}.`);
  if (urgent.length > 0) {
    parts.push(`Urgent drift in ${urgent.map(u => u.asset).join(', ')} — rebalance before adding new risk.`);
  } else {
    parts.push(`No urgent drift — disciplined DCA continues to compound.`);
  }
  if (stress > 0.4) parts.push(`Macro regime "${macro}" with elevated stress — defensive overlays active.`);
  return parts.join(' ');
}
