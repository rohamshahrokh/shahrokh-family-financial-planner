/**
 * Behavioural Survivability Analysis — measures the gap between
 * mathematical outcome and the user's likely ability to execute the plan.
 *
 * Maps engine metrics → six behavioural axes. Each axis returns a 0..1
 * risk score, severity band, and an institutional-tone description.
 *
 * Deterministic.
 */

import type { RankedCandidate } from "../decisionEngine/candidateGenerator";
import type {
  BehaviouralAxis,
  BehaviouralFinding,
  InsightSeverity,
} from "./types";

function band(risk: number): InsightSeverity {
  if (risk >= 0.7) return "critical";
  if (risk >= 0.5) return "warn";
  if (risk >= 0.3) return "watch";
  return "info";
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function assessBehaviouralSurvivability(
  winner: RankedCandidate,
): BehaviouralFinding[] {
  const m = winner.result.riskMetrics;
  const text = `${winner.label} ${winner.id}`.toLowerCase();
  const ddMed = m?.maxDrawdownMedian ?? 0;
  const ddP90 = m?.maxDrawdownP90 ?? 0;
  const vol = m?.volatility ?? 0;
  const lev = m?.leverageRisk ?? 0;
  const conc = m?.concentrationRisk ?? 0;
  const cryptoHeavy = /crypto/.test(text);
  const dcaHeavy = /dca/.test(text);

  const findings: BehaviouralFinding[] = [];

  // Volatility intolerance
  {
    const risk = clamp01(0.5 * (vol / 0.6) + 0.5 * (ddMed / 0.4));
    if (risk >= 0.2) {
      findings.push({
        axis: "volatility-intolerance",
        risk,
        severity: band(risk),
        description:
          ddMed >= 0.20
            ? "This path has strong mathematical outcomes but high behavioural execution risk — typical mid-cycle drawdowns are large enough to provoke reactive selling."
            : "Volatility tolerance is tested at the margins; pre-committed discipline matters more than usual.",
      });
    }
  }

  // Leverage stress
  {
    const risk = clamp01(lev);
    if (risk >= 0.4) {
      findings.push({
        axis: "leverage-stress",
        risk,
        severity: band(risk),
        description:
          "This leverage profile may create significant psychological stress during downturns. Mark-to-market debt-to-asset moves are visible monthly and amplify perceived risk.",
      });
    }
  }

  // Panic-selling risk
  {
    const risk = clamp01(0.5 * (ddP90 / 0.6) + 0.5 * (conc));
    if (risk >= 0.35) {
      findings.push({
        axis: "panic-selling",
        risk,
        severity: band(risk),
        description:
          "Tail drawdowns combined with concentrated exposure raise the probability of panic-selling at the worst point in the cycle.",
      });
    }
  }

  // Inconsistency risk (DCA-dependent, with crypto exacerbation)
  if (dcaHeavy || cryptoHeavy) {
    const risk = clamp01((dcaHeavy ? 0.4 : 0.25) + (cryptoHeavy ? 0.3 : 0) + 0.2 * (ddP90 / 0.6));
    findings.push({
      axis: "inconsistency",
      risk,
      severity: band(risk),
      description: cryptoHeavy
        ? "Large crypto drawdowns may reduce long-term DCA consistency. Execution depends on completing the contribution cadence through painful months."
        : "Plan effectiveness depends on contribution consistency across a multi-year horizon — interruptions compound.",
    });
  }

  // Over-aggression
  if (conc >= 0.55 || vol >= 0.45) {
    const risk = clamp01(0.5 * conc + 0.5 * (vol / 0.6));
    findings.push({
      axis: "over-aggression",
      risk,
      severity: band(risk),
      description:
        "Posture is more aggressive than typical for the household's stated context — risk-budget is being spent rather than reserved.",
    });
  }

  // Strategy abandonment risk
  {
    const risk = clamp01(0.4 * (ddP90 / 0.6) + 0.3 * (lev) + 0.3 * (vol / 0.6));
    if (risk >= 0.3) {
      findings.push({
        axis: "strategy-abandonment",
        risk,
        severity: band(risk),
        description:
          "The combined pressure profile (drawdown × leverage × volatility) is in the band where households historically abandon the plan mid-cycle.",
      });
    }
  }

  return findings.sort((a, b) => b.risk - a.risk);
}
