/**
 * Explainability Layer — answers eight questions for every major
 * recommendation:
 *
 *   1. Why this won
 *   2. Why others lost
 *   3. What changes the answer
 *   4. What breaks the strategy
 *   5. What assumptions matter most
 *   6. What environment this strategy needs
 *   7. How robust this path is
 *   8. How behaviourally realistic this is
 *
 * Reads the prior intelligence modules' outputs and synthesises concise
 * institutional-tone answers. Deterministic.
 */

import type { QuickDecisionOutput } from "../decisionEngine/candidateGenerator";
import type {
  AssumptionImpact,
  BehaviouralFinding,
  ExplainabilityAnswers,
  FragilityFinding,
  PathRobustness,
  RegimeDependency,
  TurningPoint,
} from "./types";

interface ExplainabilityInput {
  output: QuickDecisionOutput;
  turningPoints: TurningPoint[];
  fragility: FragilityFinding[];
  assumptions: AssumptionImpact[];
  regime: RegimeDependency[];
  behavioural: BehaviouralFinding[];
  robustness: PathRobustness;
}

export function buildExplainability(input: ExplainabilityInput): ExplainabilityAnswers {
  const { output, turningPoints, fragility, assumptions, regime, behavioural, robustness } = input;
  const winner = output.ranked[0];
  const runnerUp = output.ranked[1] ?? null;
  const whyWonBullets = output.comparativeNarrative?.whyWon ?? [];
  const invalidate = output.comparativeNarrative?.whatCouldInvalidate ?? [];

  const whyThisWon = whyWonBullets.length > 0
    ? `${winner.label} is the highest-scoring path because ${joinClauses(whyWonBullets.slice(0, 3))}.`
    : `${winner.label} ranks first on the composite score across the scoring axes (survival, liquidity, risk-adjusted return, FIRE acceleration, terminal NW).`;

  const whyOthersLost = (() => {
    if (!runnerUp) return "Only one strategy cleared the safety screen — there is no direct comparator on the ranked list.";
    const secondPlace = output.comparativeNarrative?.secondPlaceAndWhy ?? "";
    const reason = secondPlace || `${runnerUp.label} loses on the same scoring axes — typically a combination of thinner liquidity, deeper drawdown bands, or lower survival.`;
    return reason;
  })();

  const whatChangesTheAnswer = (() => {
    const flips = turningPoints.filter((t) => t.kind === "recommendation-flip");
    if (flips.length > 0) {
      return `${flips[0].description} Other flip triggers: ${turningPoints.filter((t) => t !== flips[0]).slice(0, 2).map((t) => t.description).join(" ") || "see turning-point list."}`;
    }
    if (invalidate.length > 0) {
      return `The answer changes if ${joinClauses(invalidate.slice(0, 2))}.`;
    }
    return "No clean recommendation-flip threshold is identified in the current run. Material changes would emerge if rates, surplus, or buffer move into a different band.";
  })();

  const whatBreaksTheStrategy = (() => {
    const critical = [...turningPoints, ...fragility].filter((x) => {
      const sev = (x as any).severity;
      return sev === "critical" || sev === "warn";
    });
    if (critical.length === 0) {
      return "No single failure mode is currently in the critical band — the plan tolerates a wide range of shocks before it breaks.";
    }
    const top = critical.slice(0, 2).map((c) => (c as any).description as string);
    return `Failure modes most likely to break the strategy: ${top.join(" ")}`;
  })();

  const whatAssumptionsMatter = (() => {
    const top = assumptions.slice(0, 3);
    if (top.length === 0) return "Top assumptions have not been ranked.";
    return `Load-bearing inputs: ${top.map((a) => a.label.toLowerCase()).join("; ")}. ${top[0].impactDescription}`;
  })();

  const whatEnvironmentItNeeds = (() => {
    const strong = regime.filter((r) => r.performance === "strong");
    const fragile = regime.filter((r) => r.performance === "fragile");
    const parts: string[] = [];
    if (strong.length > 0) parts.push(`Strongest in ${strong.slice(0, 2).map((r) => r.label.toLowerCase()).join(" and ")}.`);
    if (fragile.length > 0) parts.push(`Most fragile under ${fragile.slice(0, 2).map((r) => r.label.toLowerCase()).join(" and ")}.`);
    if (parts.length === 0) return "Strategy performs in a broad band of regimes without a sharp environmental dependence.";
    return parts.join(" ");
  })();

  const howRobustItIs = robustness.tradeoff;

  const howBehaviourallyRealistic = (() => {
    if (behavioural.length === 0) {
      return "No material behavioural risk axis is flagged — the plan is broadly executable.";
    }
    const top = behavioural[0];
    return `${top.description}${behavioural.length > 1 ? ` Secondary behavioural concern: ${behavioural[1].axis.replace(/-/g, " ")}.` : ""}`;
  })();

  return {
    whyThisWon,
    whyOthersLost,
    whatChangesTheAnswer,
    whatBreaksTheStrategy,
    whatAssumptionsMatter,
    whatEnvironmentItNeeds,
    howRobustItIs,
    howBehaviourallyRealistic,
  };
}

function joinClauses(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0].replace(/\.\s*$/, "");
  const head = items.slice(0, -1).map((s) => s.replace(/\.\s*$/, "")).join("; ");
  const tail = items[items.length - 1].replace(/\.\s*$/, "");
  return `${head}; and ${tail}`;
}
