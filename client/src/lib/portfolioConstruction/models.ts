/**
 * Pre-defined model allocations and labels.
 * Each model targets a deployable mix across cash / offset / debt / etf /
 * crypto / super / property (PPOR is excluded from rebalance — it is the home).
 *
 * Numbers are starting templates; the engine then perturbs them by inputs.
 */

import type { AllocationModel, AssetClass } from './types';

export const MODEL_LABELS: Record<AllocationModel, string> = {
  aggressive_growth: 'Aggressive Growth',
  balanced: 'Balanced',
  defensive: 'Defensive',
  fire_first: 'FIRE-First',
  property_heavy: 'Property-Heavy',
  etf_heavy: 'ETF-Heavy',
  debt_minimising: 'Debt-Minimising',
  cashflow_safe: 'Cashflow-Safe',
  anti_fragile: 'Anti-Fragile',
};

type ModelTemplate = Partial<Record<Exclude<AssetClass, 'ppor'>, number>>;

export const MODEL_TEMPLATES: Record<AllocationModel, ModelTemplate> = {
  aggressive_growth: {
    cash: 0.04, offset: 0.08, debtPaydown: 0.02,
    etf: 0.48, crypto: 0.08, super: 0.10, investmentProperty: 0.20,
  },
  balanced: {
    cash: 0.06, offset: 0.12, debtPaydown: 0.04,
    etf: 0.38, crypto: 0.04, super: 0.16, investmentProperty: 0.20,
  },
  defensive: {
    cash: 0.18, offset: 0.22, debtPaydown: 0.10,
    etf: 0.22, crypto: 0.02, super: 0.18, investmentProperty: 0.08,
  },
  fire_first: {
    cash: 0.04, offset: 0.10, debtPaydown: 0.04,
    etf: 0.55, crypto: 0.04, super: 0.18, investmentProperty: 0.05,
  },
  property_heavy: {
    cash: 0.04, offset: 0.10, debtPaydown: 0.04,
    etf: 0.20, crypto: 0.02, super: 0.10, investmentProperty: 0.50,
  },
  etf_heavy: {
    cash: 0.05, offset: 0.10, debtPaydown: 0.05,
    etf: 0.60, crypto: 0.05, super: 0.10, investmentProperty: 0.05,
  },
  debt_minimising: {
    cash: 0.06, offset: 0.20, debtPaydown: 0.40,
    etf: 0.18, crypto: 0.00, super: 0.10, investmentProperty: 0.06,
  },
  cashflow_safe: {
    cash: 0.16, offset: 0.24, debtPaydown: 0.10,
    etf: 0.20, crypto: 0.00, super: 0.18, investmentProperty: 0.12,
  },
  anti_fragile: {
    cash: 0.12, offset: 0.18, debtPaydown: 0.10,
    etf: 0.28, crypto: 0.04, super: 0.18, investmentProperty: 0.10,
  },
};

export const MODEL_RATIONALES: Record<AllocationModel, string> = {
  aggressive_growth: 'Maximise long-run compound growth via equities and selective leverage. Suitable when income is durable, FIRE date is distant, and drawdowns are tolerable.',
  balanced: 'Even tradeoff between growth and resilience. Default when no profile signals dominate.',
  defensive: 'Preserve capital and liquidity. Suitable when income is volatile, drawdown tolerance is low, or market stress is severe.',
  fire_first: 'Bias toward ETF + super to compress FIRE timeline. Suitable when FIRE urgency is high and risk capacity is intact.',
  property_heavy: 'Skew toward direct property — leverage + capital growth — when property bias and serviceability are both high.',
  etf_heavy: 'Skew toward broad ETFs for liquidity, diversification and low complexity. Lower friction than property.',
  debt_minimising: 'Aggressively retire interest-bearing debt before adding risk assets. Suitable when debt drag is dominant.',
  cashflow_safe: 'Protect monthly cashflow first. Increases cash + offset + super salary-sacrifice to keep buffer healthy.',
  anti_fragile: 'Resilient to tail risks — combines cash + ETF + crypto optionality + super. Suitable in stagflation / crisis regimes.',
};
