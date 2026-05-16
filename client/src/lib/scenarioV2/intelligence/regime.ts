/**
 * Financial Regime Awareness — describes how the winning strategy behaves
 * across macro regimes.
 *
 * Pure rule-based mapping from allocation + leverage + liquidity signals
 * → per-regime performance band. Deterministic.
 */

import type { RankedCandidate } from "../decisionEngine/candidateGenerator";
import type { Regime, RegimeDependency, RegimePerformance } from "./types";

function classify(c: RankedCandidate) {
  const text = `${c.label} ${c.id}`.toLowerCase();
  const m = c.result.riskMetrics;
  return {
    propertyHeavy: /property|ip\b|lever/.test(text),
    equityHeavy: /etf|stock|equity|diversif|lump/.test(text),
    cryptoHeavy: /crypto/.test(text),
    superHeavy: /super|conces/.test(text),
    cashHeavy: /offset|defer|cash|defensive/.test(text),
    leverage: m?.leverageRisk ?? 0,
    liquidity: 1 - (m?.liquidityRisk ?? 0),
    concentration: m?.concentrationRisk ?? 0,
  };
}

const REGIME_LABEL: Record<Regime, string> = {
  "high-inflation": "Sustained high inflation",
  "high-rates": "Persistent high rates",
  "falling-rates": "Falling-rate environment",
  "property-boom": "Property-boom regime",
  "equity-bull": "Equity bull market",
  "equity-bear": "Equity bear market",
  recession: "Recession",
  stagflation: "Stagflation",
  "low-growth": "Low-growth environment",
  "liquidity-crisis": "Liquidity crisis / credit crunch",
};

function score(
  c: ReturnType<typeof classify>,
  regime: Regime,
): { performance: RegimePerformance; rationale: string } {
  switch (regime) {
    case "high-inflation":
      if (c.cashHeavy)
        return { performance: "weak", rationale: "Cash / offset exposure loses real purchasing power; nominal interest earned trails CPI." };
      if (c.propertyHeavy || c.equityHeavy)
        return { performance: "strong", rationale: "Real-asset / equity tilt provides a partial inflation hedge across the horizon." };
      return { performance: "neutral", rationale: "Mixed exposure tracks broadly with inflation in the medium term." };
    case "high-rates":
      if (c.leverage >= 0.55)
        return { performance: "fragile", rationale: "Property-heavy leverage paths become unstable under persistent high-rate conditions — serviceability and refinance pressure both rise." };
      if (c.cashHeavy)
        return { performance: "strong", rationale: "Offset / cash earns at the rate band — favourable for liquidity-tilted paths." };
      return { performance: "neutral", rationale: "Strategy is broadly insulated from rate persistence at current leverage." };
    case "falling-rates":
      if (c.propertyHeavy)
        return { performance: "strong", rationale: "Strategy performs strongly under falling-rate conditions — property valuations and serviceability both improve." };
      if (c.cashHeavy)
        return { performance: "weak", rationale: "Cash returns compress; opportunity cost vs. growth assets widens." };
      return { performance: "neutral", rationale: "Strategy benefits modestly from a falling-rate path." };
    case "property-boom":
      if (c.propertyHeavy)
        return { performance: "strong", rationale: "Direct beneficiary of capital appreciation cycle." };
      if (c.cashHeavy)
        return { performance: "weak", rationale: "Opportunity cost is highest in this regime — non-property paths underperform headline housing returns." };
      return { performance: "neutral", rationale: "Indirect exposure via super / equity captures some of the cycle." };
    case "equity-bull":
      if (c.equityHeavy || c.superHeavy)
        return { performance: "strong", rationale: "Direct beneficiary of equity-market expansion." };
      if (c.cashHeavy)
        return { performance: "weak", rationale: "Cash returns lag risk-asset returns across a sustained bull run." };
      return { performance: "neutral", rationale: "Indirect exposure captures partial benefit." };
    case "equity-bear":
      if (c.equityHeavy || c.cryptoHeavy)
        return { performance: "fragile", rationale: "Drawdowns concentrate where the strategy is exposed — recovery period lengthens FIRE timeline." };
      if (c.cashHeavy)
        return { performance: "strong", rationale: "Defensive tilt outperforms during sustained equity drawdowns." };
      return { performance: "neutral", rationale: "Diversification absorbs some of the drawdown." };
    case "recession":
      if (c.leverage >= 0.55 || c.equityHeavy)
        return { performance: "fragile", rationale: "Income shock + asset-price compression compound — survivability is tested." };
      if (c.cashHeavy)
        return { performance: "strong", rationale: "Liquidity-tilted path absorbs recession well — buffer covers income gap." };
      return { performance: "neutral", rationale: "Buffer absorbs near-term shock; medium-term recovery dependent on labour market." };
    case "stagflation":
      if (c.propertyHeavy && c.leverage >= 0.55)
        return { performance: "fragile", rationale: "Property-heavy leverage paths become unstable under stagflation scenarios — rates stay elevated while real returns compress." };
      if (c.cashHeavy)
        return { performance: "weak", rationale: "Real returns are negative even as nominal yields rise." };
      return { performance: "weak", rationale: "Few asset classes outperform; portfolio drag is the dominant outcome." };
    case "low-growth":
      if (c.equityHeavy)
        return { performance: "weak", rationale: "Equity earnings expansion is the missing engine — terminal NW compresses." };
      if (c.cashHeavy)
        return { performance: "neutral", rationale: "Cash returns hold relative value." };
      return { performance: "neutral", rationale: "Diversification partly hedges low-growth drag." };
    case "liquidity-crisis":
      if (c.cashHeavy)
        return { performance: "strong", rationale: "Cash-heavy paths outperform during liquidity stress — optionality preserved." };
      if (c.leverage >= 0.55 || c.cryptoHeavy)
        return { performance: "fragile", rationale: "Refinance markets seize and risk-asset valuations gap down — leveraged paths become unstable." };
      return { performance: "neutral", rationale: "Buffer plus diversification absorbs short liquidity shocks." };
  }
}

export function detectRegimeDependency(winner: RankedCandidate): RegimeDependency[] {
  const c = classify(winner);
  const regimes: Regime[] = [
    "high-inflation",
    "high-rates",
    "falling-rates",
    "property-boom",
    "equity-bull",
    "equity-bear",
    "recession",
    "stagflation",
    "low-growth",
    "liquidity-crisis",
  ];
  return regimes.map((r) => {
    const { performance, rationale } = score(c, r);
    return { regime: r, label: REGIME_LABEL[r], performance, rationale };
  });
}
