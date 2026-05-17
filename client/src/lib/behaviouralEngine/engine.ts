/**
 * Behavioural Finance Engine — core inference
 *
 * Pure, deterministic. No side effects, no network. Accepts entirely-optional
 * inputs and returns a profile whose confidence reflects coverage.
 */

import type {
  BehaviouralInputs,
  BehaviouralProfile,
  BehaviouralProfileId,
  BehaviouralScores,
} from './types';
import { PROFILE_DEFINITIONS } from './types';

function clamp(n: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, n));
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

function neutralScores(): BehaviouralScores {
  return {
    leveragePreference: 0,
    liquidityPreference: 0,
    volatilityTolerance: 0,
    fireUrgency: 0.5,
    debtAversion: 0.5,
    propertyBias: 0,
    etfBias: 0,
    cryptoBias: 0,
    cashSafetyPreference: 0.5,
    drawdownPanicThreshold: 0.25,
    lifestyleFlexibility: 0.5,
    spendingRigidity: 0.5,
    retirementAggressiveness: 0.5,
  };
}

const KEYWORD_MAP: Record<string, Partial<BehaviouralScores>> = {
  // Decision-engine ids / scenario tags / rejected actionTypes — best-effort.
  pay_high_interest_debt: { debtAversion: 0.2 },
  reduce_leverage: { leveragePreference: -0.25, debtAversion: 0.15 },
  proceed_property_purchase: { propertyBias: 0.3, leveragePreference: 0.2 },
  delay_property_purchase: { propertyBias: -0.1, liquidityPreference: 0.15 },
  build_emergency_buffer: { liquidityPreference: 0.25, cashSafetyPreference: 0.2 },
  etf_dca: { etfBias: 0.25, volatilityTolerance: 0.1 },
  crypto_dca: { cryptoBias: 0.3, volatilityTolerance: 0.2 },
  increase_super: { retirementAggressiveness: 0.2 },
  fire_acceleration: { fireUrgency: 0.25, retirementAggressiveness: 0.15 },
  hold_cash_offset: { liquidityPreference: 0.15, cashSafetyPreference: 0.2 },
  pause_investing: { volatilityTolerance: -0.15, cashSafetyPreference: 0.15 },
  rebalance_portfolio: { volatilityTolerance: 0.05 },
};

function applyKeyword(scores: BehaviouralScores, key: string, weight = 1): void {
  const delta = KEYWORD_MAP[key];
  if (!delta) return;
  (Object.keys(delta) as Array<keyof BehaviouralScores>).forEach((k) => {
    const v = (delta[k] ?? 0) * weight;
    const next = (scores[k] ?? 0) + v;
    scores[k] = (k === 'fireUrgency' || k === 'debtAversion' || k === 'cashSafetyPreference' ||
      k === 'drawdownPanicThreshold' || k === 'lifestyleFlexibility' || k === 'spendingRigidity' ||
      k === 'retirementAggressiveness')
      ? clamp01(next)
      : clamp(next);
  });
}

export function inferBehaviouralProfile(input: BehaviouralInputs | undefined | null): BehaviouralProfile {
  const inputs = input ?? {};
  const scores = neutralScores();
  const observed: string[] = [];

  // 1. Direct preference signals (settings + risk tolerance slider).
  if (typeof inputs.riskTolerance === 'number') {
    observed.push('riskTolerance');
    const rt = clamp(inputs.riskTolerance);
    scores.volatilityTolerance = clamp(scores.volatilityTolerance + rt * 0.6);
    scores.etfBias = clamp(scores.etfBias + rt * 0.25);
    scores.cryptoBias = clamp(scores.cryptoBias + rt * 0.2);
    scores.cashSafetyPreference = clamp01(scores.cashSafetyPreference - rt * 0.25);
  }

  // 2. Custom thresholds — strongest behavioural reveal.
  const ct = inputs.customThresholds ?? {};
  if (ct.drawdownPanicPct != null) {
    observed.push('drawdownPanicPct');
    const p = clamp01(ct.drawdownPanicPct / 100);
    scores.drawdownPanicThreshold = p;
    if (p < 0.15) scores.volatilityTolerance = clamp(scores.volatilityTolerance - 0.3);
    if (p > 0.35) scores.volatilityTolerance = clamp(scores.volatilityTolerance + 0.25);
  }
  if (ct.minimumBufferMonths != null) {
    observed.push('minimumBufferMonths');
    if (ct.minimumBufferMonths >= 9) {
      scores.liquidityPreference = clamp(scores.liquidityPreference + 0.3);
      scores.cashSafetyPreference = clamp01(scores.cashSafetyPreference + 0.2);
    }
    if (ct.minimumBufferMonths <= 3) {
      scores.liquidityPreference = clamp(scores.liquidityPreference - 0.2);
    }
  }
  if (ct.maxLVRPct != null) {
    observed.push('maxLVRPct');
    if (ct.maxLVRPct < 60) scores.leveragePreference = clamp(scores.leveragePreference - 0.3);
    if (ct.maxLVRPct > 80) scores.leveragePreference = clamp(scores.leveragePreference + 0.3);
  }
  if (ct.cashFloorDollars != null && ct.cashFloorDollars > 0) {
    observed.push('cashFloorDollars');
    scores.cashSafetyPreference = clamp01(scores.cashSafetyPreference + 0.15);
  }

  // 3. Decision-engine choices.
  if (inputs.decisionChoices && inputs.decisionChoices.length) {
    observed.push('decisionChoices');
    for (const c of inputs.decisionChoices) {
      applyKeyword(scores, c.id, c.weight ?? 1);
    }
  }

  // 4. Scenario selections.
  if (inputs.scenarioSelections && inputs.scenarioSelections.length) {
    observed.push('scenarioSelections');
    for (const s of inputs.scenarioSelections) {
      applyKeyword(scores, s.id);
      (s.tags ?? []).forEach((t) => applyKeyword(scores, t));
    }
  }

  // 5. Debt actions.
  if (inputs.debtActions && inputs.debtActions.length) {
    observed.push('debtActions');
    for (const a of inputs.debtActions) {
      if (a === 'paydown' || a === 'consolidate') scores.debtAversion = clamp01(scores.debtAversion + 0.15);
      if (a === 'new_debt' || a === 'extend') scores.leveragePreference = clamp(scores.leveragePreference + 0.2);
      if (a === 'refi') scores.debtAversion = clamp01(scores.debtAversion + 0.05);
    }
  }

  // 6. Monte Carlo variants.
  if (inputs.monteCarloChoices && inputs.monteCarloChoices.length) {
    observed.push('monteCarloChoices');
    for (const m of inputs.monteCarloChoices) {
      const w = m.saved ? 1.5 : 1;
      if (m.variant === 'bull' || m.variant === 'ai_boom') scores.volatilityTolerance = clamp(scores.volatilityTolerance + 0.1 * w);
      if (m.variant === 'crash' || m.variant === 'bear') scores.cashSafetyPreference = clamp01(scores.cashSafetyPreference + 0.1 * w);
      if (m.variant === 'inflation') scores.propertyBias = clamp(scores.propertyBias + 0.05 * w);
    }
  }

  // 7. Allocation tilts.
  const ap = inputs.allocationPreferences;
  if (ap) {
    observed.push('allocationPreferences');
    if (ap.etfTiltPct != null) scores.etfBias = clamp(scores.etfBias + clamp(ap.etfTiltPct));
    if (ap.propertyTiltPct != null) scores.propertyBias = clamp(scores.propertyBias + clamp(ap.propertyTiltPct));
    if (ap.cryptoTiltPct != null) scores.cryptoBias = clamp(scores.cryptoBias + clamp(ap.cryptoTiltPct));
    if (ap.cashTiltPct != null) {
      scores.cashSafetyPreference = clamp01(scores.cashSafetyPreference + clamp(ap.cashTiltPct) * 0.5);
      scores.liquidityPreference = clamp(scores.liquidityPreference + clamp(ap.cashTiltPct) * 0.4);
    }
  }

  // 8. Rejected recommendations — negative inference.
  if (inputs.rejectedRecommendations && inputs.rejectedRecommendations.length) {
    observed.push('rejectedRecommendations');
    for (const r of inputs.rejectedRecommendations) {
      const inverse: Partial<BehaviouralScores> = KEYWORD_MAP[r.actionType] ?? {};
      (Object.keys(inverse) as Array<keyof BehaviouralScores>).forEach((k) => {
        const v = (inverse[k] ?? 0) * -0.5;
        const next = (scores[k] ?? 0) + v;
        scores[k] = (k === 'fireUrgency' || k === 'debtAversion' || k === 'cashSafetyPreference' ||
          k === 'drawdownPanicThreshold' || k === 'lifestyleFlexibility' || k === 'spendingRigidity' ||
          k === 'retirementAggressiveness') ? clamp01(next) : clamp(next);
      });
    }
  }

  // 9. FIRE choices.
  if (inputs.fireChoices) {
    observed.push('fireChoices');
    const fc = inputs.fireChoices;
    if (fc.targetAge != null) {
      // Lower age = more urgency.
      const urgencyFromAge = clamp01((60 - fc.targetAge) / 20);
      scores.fireUrgency = clamp01(Math.max(scores.fireUrgency, urgencyFromAge));
    }
    if (fc.leanFire) {
      scores.lifestyleFlexibility = clamp01(scores.lifestyleFlexibility + 0.2);
      scores.spendingRigidity = clamp01(scores.spendingRigidity - 0.2);
    }
    if (fc.fatFire) {
      scores.spendingRigidity = clamp01(scores.spendingRigidity + 0.15);
      scores.retirementAggressiveness = clamp01(scores.retirementAggressiveness + 0.1);
    }
    if (fc.geoArbitrage) scores.lifestyleFlexibility = clamp01(scores.lifestyleFlexibility + 0.15);
  }

  // 10. Buffer preferences.
  if (inputs.bufferPreferences) {
    observed.push('bufferPreferences');
    const bp = inputs.bufferPreferences;
    if (bp.targetMonths != null) {
      if (bp.targetMonths >= 9) {
        scores.cashSafetyPreference = clamp01(scores.cashSafetyPreference + 0.2);
        scores.liquidityPreference = clamp(scores.liquidityPreference + 0.2);
      } else if (bp.targetMonths <= 3) {
        scores.cashSafetyPreference = clamp01(scores.cashSafetyPreference - 0.1);
      }
    }
  }

  const profile = pickProfile(scores);
  const confidence = clamp01(observed.length / 8); // 8 input families
  const narrative = buildNarrative(profile.primary, scores);
  return {
    primary: profile.primary,
    secondary: profile.secondary,
    primaryLabel: PROFILE_DEFINITIONS[profile.primary].label,
    scores,
    confidence,
    inputsObserved: observed,
    narrative,
  };
}

interface ProfileScoreCard {
  primary: BehaviouralProfileId;
  secondary?: BehaviouralProfileId;
}

function pickProfile(s: BehaviouralScores): ProfileScoreCard {
  const fit: Record<BehaviouralProfileId, number> = {
    conservative_protector:
      s.cashSafetyPreference * 1.2 + s.liquidityPreference * 0.8 + (1 - s.volatilityTolerance / 2) * 0.6,
    balanced_optimiser:
      (1 - Math.abs(s.leveragePreference)) * 0.6 + (1 - Math.abs(s.volatilityTolerance)) * 0.6 +
      (0.8 - Math.abs(s.cashSafetyPreference - 0.5)) * 0.8,
    aggressive_compounder:
      Math.max(0, s.volatilityTolerance) * 1.0 + Math.max(0, s.etfBias) * 0.5 +
      (1 - s.cashSafetyPreference) * 0.4,
    fire_accelerator:
      s.fireUrgency * 1.2 + s.retirementAggressiveness * 0.7 + Math.max(0, s.etfBias) * 0.3,
    cashflow_defender:
      s.liquidityPreference * 0.9 + (1 - Math.max(0, s.leveragePreference)) * 0.5 +
      s.cashSafetyPreference * 0.4,
    opportunistic_investor:
      Math.max(0, s.volatilityTolerance) * 0.7 + Math.max(0, s.cryptoBias) * 0.4 +
      (1 - s.spendingRigidity) * 0.3,
    anti_debt:
      s.debtAversion * 1.4 + (1 - Math.max(0, s.leveragePreference)) * 0.6,
    leverage_maximiser:
      Math.max(0, s.leveragePreference) * 1.3 + Math.max(0, s.propertyBias) * 0.5 +
      (1 - s.debtAversion) * 0.5,
    volatility_sensitive:
      (1 - s.drawdownPanicThreshold) * 0.6 + Math.max(0, -s.volatilityTolerance) * 0.9 +
      s.cashSafetyPreference * 0.4,
    drawdown_tolerant:
      s.drawdownPanicThreshold * 0.9 + Math.max(0, s.volatilityTolerance) * 0.7,
  };
  const sorted = (Object.keys(fit) as BehaviouralProfileId[])
    .sort((a, b) => fit[b] - fit[a]);
  return { primary: sorted[0], secondary: sorted[1] };
}

function buildNarrative(id: BehaviouralProfileId, s: BehaviouralScores): string {
  const def = PROFILE_DEFINITIONS[id];
  const parts: string[] = [def.description];
  if (s.liquidityPreference > 0.3) parts.push('Keeps generous liquidity buffers.');
  if (s.leveragePreference > 0.3) parts.push('Comfortable using leverage where the maths supports it.');
  if (s.leveragePreference < -0.3) parts.push('Avoids leverage and prefers paying debt down.');
  if (s.fireUrgency > 0.6) parts.push('Optimises hard for time-to-FIRE.');
  if (s.volatilityTolerance < -0.3) parts.push('Sensitive to drawdowns — prefers smoother paths.');
  if (s.cryptoBias > 0.4) parts.push('Will hold meaningful crypto exposure.');
  if (s.cryptoBias < -0.4) parts.push('Avoids crypto exposure.');
  return parts.join(' ');
}
