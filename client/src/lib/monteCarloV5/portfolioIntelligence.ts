/**
 * portfolioIntelligence.ts — Phase 5: Portfolio Intelligence
 *
 * V5 portfolio intelligence is a recommendation + ranking layer that runs on
 * top of V4's allocation optimiser. It does NOT change V4 math; instead it
 * produces:
 *
 *   - dynamic rebalancing schedule (cap-weight drift checks)
 *   - contribution prioritisation (super → debt → ETF → crypto / DCA)
 *   - emergency / cash buffer targeting
 *   - portfolio concentration penalties
 *   - liquidity weighting per asset class
 *   - volatility-adjusted scoring (return / risk)
 *   - leverage-adjusted scoring (penalise high DSR/LVR)
 *   - super concessional / non-concessional cap awareness (FY25 limits)
 *
 * All recommendations are advisor-grade nudges, not hard plan overrides.
 */

export type AssetClass =
  | "cash"
  | "stocks_etf"
  | "stocks_concentrated"
  | "crypto"
  | "super"
  | "ppor_equity"
  | "ip_equity";

export interface PortfolioSnapshotV5 {
  /** AUD by asset class. */
  byClass: Record<AssetClass, number>;
  /** Total debt. */
  totalDebt: number;
  /** Monthly net income (after tax). */
  monthlyIncome: number;
  /** Monthly expenses (essentials + lifestyle). */
  monthlyExpenses: number;
  /** Number of dependents (used for emergency buffer multiplier). */
  dependents: number;
  /** Super balance per member (if known). */
  superByMember?: number[];
  /** Earner age 0..2 (used for super preservation logic). */
  earnerAges?: number[];
  /** Estimated YTD concessional super contributions (AUD). */
  ytdConcessional?: number[];
  /** Estimated YTD non-concessional super contributions (AUD). */
  ytdNonConcessional?: number[];
  /** Current peak DSR observed (0..1). */
  currentDSR?: number;
  /** Current peak LVR observed (0..1). */
  currentLVR?: number;
}

/** FY25 cap limits (AUD). Adjust as ATO updates. */
export const SUPER_CAPS = {
  concessionalPerMember: 30_000,
  nonConcessionalPerMember: 120_000,
  nonConcessionalBringForward: 360_000, // 3-year rule
};

/** Liquidity coefficient per class (0 = fully illiquid, 1 = cash-like). */
export const LIQUIDITY_COEF: Record<AssetClass, number> = {
  cash: 1.0,
  stocks_etf: 0.85,
  stocks_concentrated: 0.65,
  crypto: 0.55,
  super: 0.05,
  ppor_equity: 0.10,
  ip_equity: 0.20,
};

/** Volatility coefficient (annualised std). */
export const VOL_COEF: Record<AssetClass, number> = {
  cash: 0.005,
  stocks_etf: 0.15,
  stocks_concentrated: 0.30,
  crypto: 0.70,
  super: 0.13,
  ppor_equity: 0.08,
  ip_equity: 0.10,
};

export type RecommendationV5Tag =
  | "rebalance"
  | "contribute_super"
  | "build_buffer"
  | "reduce_concentration"
  | "deleverage"
  | "deploy_cash"
  | "tax_alpha"
  | "diversify";

export interface PortfolioRecommendationV5 {
  tag: RecommendationV5Tag;
  priority: number;     // 1 = top
  title: string;
  rationale: string;
  amount?: number;      // AUD where applicable
  liquidityImpact: number;
  volImpact: number;
  leverageImpact: number;
}

export interface PortfolioIntelligenceResult {
  recommendations: PortfolioRecommendationV5[];
  /** Target emergency buffer for this household. */
  emergencyBufferTarget: number;
  /** Concentration score (0=balanced, 1=fully concentrated). */
  concentrationScore: number;
  /** Liquidity score (0..1, higher=more liquid). */
  liquidityScore: number;
  /** Volatility-adjusted score (Sharpe-lite). */
  volAdjustedScore: number;
  /** Leverage-adjusted score (0..1, higher=safer). */
  leverageAdjustedScore: number;
  /** Suggested next rebalance window in months (e.g. 6/12). */
  nextRebalanceMonths: number;
  /** True if portfolio has drifted > 10pp from target weights. */
  driftDetected: boolean;
}

export interface TargetWeightsV5 {
  cash: number;
  stocks_etf: number;
  stocks_concentrated: number;
  crypto: number;
  super: number;
  ppor_equity: number;
  ip_equity: number;
}

export const DEFAULT_TARGETS: TargetWeightsV5 = {
  cash: 0.08,
  stocks_etf: 0.30,
  stocks_concentrated: 0.05,
  crypto: 0.05,
  super: 0.20,
  ppor_equity: 0.20,
  ip_equity: 0.12,
};

export function computePortfolioIntelligence(
  snap: PortfolioSnapshotV5,
  targets: TargetWeightsV5 = DEFAULT_TARGETS,
): PortfolioIntelligenceResult {
  const total = Math.max(
    1,
    Object.values(snap.byClass).reduce((s, v) => s + Math.max(0, v), 0),
  );
  const weights: Record<AssetClass, number> = {} as any;
  for (const k of Object.keys(snap.byClass) as AssetClass[]) {
    weights[k] = snap.byClass[k] / total;
  }

  // ── Concentration (Herfindahl on risk-bearing classes) ─────────────────
  const riskyKeys: AssetClass[] = ["stocks_etf", "stocks_concentrated", "crypto", "ip_equity"];
  const riskyTotal = riskyKeys.reduce((s, k) => s + (snap.byClass[k] ?? 0), 0);
  let hhi = 0;
  for (const k of riskyKeys) {
    const w = (snap.byClass[k] ?? 0) / Math.max(1, riskyTotal);
    hhi += w * w;
  }
  const concentrationScore = Math.min(1, hhi);

  // ── Liquidity ──────────────────────────────────────────────────────────
  let liquidity = 0;
  for (const k of Object.keys(snap.byClass) as AssetClass[]) {
    liquidity += (snap.byClass[k] ?? 0) * LIQUIDITY_COEF[k];
  }
  const liquidityScore = liquidity / total;

  // ── Vol-adjusted (Sharpe-lite, assume 7% expected return for stocks_etf) ─
  const expectedReturn: Record<AssetClass, number> = {
    cash: 0.03, stocks_etf: 0.075, stocks_concentrated: 0.085,
    crypto: 0.10, super: 0.065, ppor_equity: 0.04, ip_equity: 0.05,
  };
  let er = 0, vol = 0;
  for (const k of Object.keys(snap.byClass) as AssetClass[]) {
    const w = (snap.byClass[k] ?? 0) / total;
    er  += w * expectedReturn[k];
    vol += (w * VOL_COEF[k]) ** 2;
  }
  const portVol = Math.sqrt(vol);
  const volAdjustedScore = portVol > 0 ? (er - 0.03) / portVol : 0;

  // ── Leverage-adjusted ──────────────────────────────────────────────────
  const lev = (snap.totalDebt / total);
  const dsr = snap.currentDSR ?? 0;
  const lvr = snap.currentLVR ?? 0;
  const leverageAdjustedScore = Math.max(0, Math.min(1,
    1 - (0.4 * Math.min(1, lev) + 0.3 * Math.min(1, dsr / 0.5) + 0.3 * Math.min(1, lvr / 0.85))));

  // ── Emergency buffer target: 4-6 months expenses, +1mo per dependent ───
  const buf = snap.monthlyExpenses * (4 + Math.min(2, snap.dependents * 0.5));
  const cashGap = Math.max(0, buf - (snap.byClass.cash ?? 0));

  // ── Drift detection ────────────────────────────────────────────────────
  let maxDrift = 0;
  for (const k of Object.keys(targets) as (keyof TargetWeightsV5)[]) {
    const target = targets[k];
    const actual = weights[k] ?? 0;
    maxDrift = Math.max(maxDrift, Math.abs(actual - target));
  }
  const driftDetected = maxDrift > 0.10;

  // ── Recommendations (priority order) ────────────────────────────────────
  const recs: PortfolioRecommendationV5[] = [];

  if (cashGap > 0) {
    recs.push({
      tag: "build_buffer",
      priority: 1,
      title: "Build emergency buffer",
      rationale: `Buffer target is $${Math.round(buf).toLocaleString()} (~${(4 + Math.min(2, snap.dependents * 0.5)).toFixed(1)} months of expenses). You're short by $${Math.round(cashGap).toLocaleString()}.`,
      amount: cashGap,
      liquidityImpact: 0.6,
      volImpact: -0.1,
      leverageImpact: 0.05,
    });
  }

  if (concentrationScore > 0.55) {
    recs.push({
      tag: "reduce_concentration",
      priority: 2,
      title: "Reduce concentration risk",
      rationale: `Top-asset concentration (HHI ${concentrationScore.toFixed(2)}) leaves you exposed to single-asset drawdowns. Diversify into broad-market ETFs.`,
      liquidityImpact: 0.1,
      volImpact: -0.15,
      leverageImpact: 0.0,
    });
  }

  if (leverageAdjustedScore < 0.55) {
    recs.push({
      tag: "deleverage",
      priority: 2,
      title: "De-leverage gradually",
      rationale: `DSR ${(dsr * 100).toFixed(0)}% and LVR ${(lvr * 100).toFixed(0)}% are above safe bands; prioritise offset / extra principal payments.`,
      liquidityImpact: -0.1,
      volImpact: -0.05,
      leverageImpact: 0.25,
    });
  }

  // Super: under cap, age-eligible -> top up concessional
  if (snap.superByMember && snap.ytdConcessional) {
    for (let i = 0; i < snap.superByMember.length; i++) {
      const age = snap.earnerAges?.[i] ?? 40;
      if (age < 18 || age > 75) continue;
      const remaining = SUPER_CAPS.concessionalPerMember - (snap.ytdConcessional[i] ?? 0);
      if (remaining > 5_000) {
        recs.push({
          tag: "contribute_super",
          priority: 3,
          title: `Top up super (member ${i + 1})`,
          rationale: `Concessional cap remaining is $${remaining.toLocaleString()}. Marginal-tax-rate alpha typically 15-32.5pp.`,
          amount: remaining,
          liquidityImpact: -0.4,
          volImpact: 0.0,
          leverageImpact: 0.0,
        });
      }
    }
  }

  if (driftDetected) {
    recs.push({
      tag: "rebalance",
      priority: 4,
      title: "Rebalance portfolio",
      rationale: `Maximum weight drift is ${(maxDrift * 100).toFixed(0)}pp from target — schedule a rebalance window.`,
      liquidityImpact: 0.0,
      volImpact: -0.05,
      leverageImpact: 0.0,
    });
  }

  if ((snap.byClass.cash ?? 0) - buf > 80_000) {
    recs.push({
      tag: "deploy_cash",
      priority: 5,
      title: "Deploy excess cash",
      rationale: `Cash exceeds buffer by $${Math.round((snap.byClass.cash ?? 0) - buf).toLocaleString()} — DCA into broad-market ETFs or offset.`,
      amount: (snap.byClass.cash ?? 0) - buf,
      liquidityImpact: -0.2,
      volImpact: 0.08,
      leverageImpact: 0.0,
    });
  }

  recs.sort((a, b) => a.priority - b.priority);

  return {
    recommendations: recs,
    emergencyBufferTarget: buf,
    concentrationScore,
    liquidityScore,
    volAdjustedScore,
    leverageAdjustedScore,
    nextRebalanceMonths: driftDetected ? 3 : 12,
    driftDetected,
  };
}

/**
 * Compute a contribution prioritisation order, given monthly surplus and
 * household state. Returns ordered list with target allocations.
 */
export function contributionPriority(
  monthlySurplus: number,
  snap: PortfolioSnapshotV5,
  result: PortfolioIntelligenceResult,
): Array<{ destination: string; monthly: number; rationale: string }> {
  if (monthlySurplus <= 0) return [];

  const out: Array<{ destination: string; monthly: number; rationale: string }> = [];
  let remaining = monthlySurplus;

  // 1. Emergency buffer first
  const bufGap = Math.max(0, result.emergencyBufferTarget - (snap.byClass.cash ?? 0));
  if (bufGap > 0) {
    const alloc = Math.min(remaining, bufGap / 6); // fill within 6 months
    out.push({ destination: "Emergency Buffer / High-Yield Cash", monthly: alloc, rationale: "Until 4–6 months of expenses are covered." });
    remaining -= alloc;
  }

  // 2. High-interest debt paydown (proxy: if DSR > 0.35, allocate 40% to debt)
  if ((snap.currentDSR ?? 0) > 0.35 && remaining > 0) {
    const alloc = Math.min(remaining, monthlySurplus * 0.4);
    out.push({ destination: "Extra Mortgage / Offset", monthly: alloc, rationale: "DSR above 35% — accelerate principal." });
    remaining -= alloc;
  }

  // 3. Super concessional top-up
  if (snap.superByMember && remaining > 0) {
    const yearLeft = SUPER_CAPS.concessionalPerMember - (snap.ytdConcessional?.[0] ?? 0);
    if (yearLeft > 0) {
      const alloc = Math.min(remaining, yearLeft / 12);
      out.push({ destination: "Super (concessional)", monthly: alloc, rationale: "Tax-advantaged growth up to FY cap." });
      remaining -= alloc;
    }
  }

  // 4. Broad-market ETF DCA
  if (remaining > 0) {
    const alloc = Math.min(remaining, monthlySurplus * 0.5);
    out.push({ destination: "Broad-market ETF (VAS / VGS / DHHF)", monthly: alloc, rationale: "Diversified equity DCA." });
    remaining -= alloc;
  }

  // 5. Crypto DCA (capped at 5% of surplus)
  if (remaining > 0) {
    const alloc = Math.min(remaining, monthlySurplus * 0.05);
    if (alloc > 0) out.push({ destination: "Crypto DCA (BTC/ETH)", monthly: alloc, rationale: "Risk-budgeted allocation." });
    remaining -= alloc;
  }

  // 6. Residual
  if (remaining > 0) {
    out.push({ destination: "Offset / cash sweep", monthly: remaining, rationale: "Residual after priority destinations." });
  }

  return out;
}
