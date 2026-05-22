/**
 * fundingResolutionTraces.ts — Funding Gap Resolution Advisor audit trace.
 *
 * Renders the canonical `dashboard:funding-resolution` trace from a
 * FundingResolutionResult. The trace surfaces the gap, every candidate
 * solution with its scoring attributes, the ranking logic, and the selected
 * recommendation.
 *
 * #FWL_Funding_Gap_Resolution_Advisor
 *
 * NO ENGINE IMPORTS. This trace is a planning-validation layer — saves,
 * forecasts, Monte Carlo, FIRE, recommendation, and cashflow engines are
 * untouched.
 */

import type { CalculationTrace } from "../calculationTrace";
import type {
  FundingResolutionResult,
  ResolutionCandidate,
} from "../../fundingResolutionAdvisor";
import { FUNDING_RESOLUTION_RANKING_FORMULA } from "../../fundingResolutionAdvisor";

export const FUNDING_RESOLUTION_TRACE_ID = "dashboard:funding-resolution";

const fmt$ = (n: number) =>
  n < 0
    ? `-$${Math.abs(Math.round(n)).toLocaleString()}`
    : `$${Math.round(n).toLocaleString()}`;

const ts = () => new Date().toISOString();

export interface FundingResolutionTraceArgs {
  /** Result from `computeFundingResolution`. */
  result: FundingResolutionResult;
  /** Available + Required Liquidity from Plan Feasibility — surfaced for the trace formula bridge. */
  availableLiquidity: number;
  requiredLiquidity: number;
}

function scoreRow(c: ResolutionCandidate) {
  return [
    {
      label: `  · Liquidity Improvement`,
      value: `${c.scores.liquidityImprovement.toFixed(1)} / 10`,
      source: "How much of the gap this option closes (10 = closes fully).",
    },
    {
      label: `  · Wealth Impact`,
      value: `${c.scores.wealthImpact.toFixed(1)} / 10`,
      source: "Long-term wealth outcome (10 = neutral / improves; lower = drags wealth).",
    },
    {
      label: `  · Debt Impact`,
      value: `${c.scores.debtImpact.toFixed(1)} / 10`,
      source: "10 = no new debt; lower = adds debt or LMI.",
    },
    {
      label: `  · Complexity`,
      value: `${c.scores.complexity.toFixed(1)} / 10`,
      source: "10 = trivial to execute; lower = harder (broker, lender, tax).",
    },
    {
      label: `  · Composite rank`,
      value: `${c.rank.toFixed(2)} / 10`,
      source: "Weighted composite — see Ranking Logic below.",
    },
  ];
}

/**
 * Build the Funding Resolution audit trace. When there is no gap the trace
 * exists for coverage purposes but its body simply reports "no gap detected".
 */
export function buildFundingResolutionTrace(
  args: FundingResolutionTraceArgs,
): CalculationTrace {
  const r = args.result;

  if (!r.hasGap) {
    return {
      id: FUNDING_RESOLUTION_TRACE_ID,
      label: "Funding Gap Resolution",
      finalValue: "No gap — no resolution required",
      plainEnglish:
        "Funding Gap Resolution only generates candidates when Plan Feasibility reports a negative gap. The current plan is funded; no resolution is required.",
      formula: "Funding Gap = Required Liquidity − Available Liquidity",
      expanded: `Required ${fmt$(args.requiredLiquidity)} − Available ${fmt$(args.availableLiquidity)} = ${fmt$(args.requiredLiquidity - args.availableLiquidity)} → no shortfall.`,
      inputs: [
        { label: "─ Funding Gap ─", value: "" },
        { label: "Funding Gap (signed)", value: fmt$(r.fundingGap), source: "Plan Feasibility (Available − Required)" },
        { label: "Status", value: "No gap — no resolution required",
          source: "Resolution Advisor only emits candidates when fundingGap < 0" },
      ],
      assumptions: [
        { label: "Resolution Advisor is an advisory / planning-validation layer — does NOT change any engine calculation.", source: "client/src/lib/fundingResolutionAdvisor.ts (no engine imports)" },
        { label: "No candidates are generated when the plan has no Funding Gap. Users can still save, forecast, and run Monte Carlo / FIRE freely.", source: "Resolution Advisor spec" },
      ],
      dataSource: "computeFundingResolution(fundingResolutionAdvisor.ts)",
      sourceEngine: "client/src/lib/fundingResolutionAdvisor.ts (advisory layer; no engine import)",
      included: [],
      excluded: [],
      calculatedAt: ts(),
      notes: [`✓ No Funding Gap detected — Resolution Advisor inactive.`],
      relatedIds: ["dashboard:plan-feasibility"],
    };
  }

  const candidateRows = r.alternatives.flatMap((c, i) => [
    {
      label:
        i === 0
          ? `★ Recommended — ${c.title}`
          : `${i}. ${c.title}`,
      value: c.gapClosure >= Math.abs(r.fundingGap) - 1
        ? `Closes gap fully (${fmt$(c.gapClosure)})`
        : `Closes ${fmt$(c.gapClosure)}`,
      source: c.sourceNote,
    },
    {
      label: `  · Detail`,
      value: c.detail,
    },
    {
      label: `  · Trade-off`,
      value: c.tradeOff,
    },
    ...scoreRow(c),
  ]);

  const unavailableRows = r.unavailable.map((u) => ({
    label: `  · ${u.kind} — not available`,
    value: u.reason,
    source: "Data required for this option is unavailable or zero — option omitted rather than faked.",
  }));

  return {
    id: FUNDING_RESOLUTION_TRACE_ID,
    label: "Funding Gap Resolution",
    finalValue: r.recommendation
      ? `Recommended: ${r.recommendation.title}`
      : "No candidate options available",
    plainEnglish:
      `Funding Gap is ${fmt$(r.fundingGap)} (shortfall ${fmt$(Math.abs(r.fundingGap))}). ` +
      `The advisor generated ${r.alternatives.length} candidate solution${r.alternatives.length === 1 ? "" : "s"} and ranked them by ` +
      `(1) lowest disruption (complexity), (2) lowest long-term wealth impact, (3) highest practicality (debt impact + sufficiency). ` +
      `Recommended: ${r.recommendation ? r.recommendation.title : "none — insufficient data"}. ` +
      `This is informational only — saves, forecasts, Monte Carlo, and FIRE analysis continue to run.`,
    formula:
      "Funding Gap = Required Liquidity − Available Liquidity\n" +
      "Candidate ranking: " + FUNDING_RESOLUTION_RANKING_FORMULA,
    expanded:
      `Required ${fmt$(args.requiredLiquidity)} − Available ${fmt$(args.availableLiquidity)} = Funding Gap ${fmt$(args.requiredLiquidity - args.availableLiquidity)}.\n` +
      (r.recommendation
        ? `Recommended action: ${r.recommendation.title} — closes ${fmt$(r.recommendation.gapClosure)} (resulting gap ${fmt$(r.recommendation.resultingGap)}).`
        : `No candidate options could be generated from the current planning state.`),
    inputs: [
      { label: "─ Funding Gap ─", value: "" },
      { label: "Funding Gap (signed)", value: fmt$(r.fundingGap),
        source: "Plan Feasibility (Available Liquidity − Required Liquidity)" },
      { label: "Shortfall (|gap|)", value: fmt$(Math.abs(r.fundingGap)),
        source: "Amount the resolution needs to close" },

      { label: "─ Selected Recommendation ─", value: "" },
      ...(r.recommendation
        ? [
            { label: "Recommended Solution", value: r.recommendation.title,
              source: "Best-ranked candidate from the list below" },
            { label: "Gap closure", value: fmt$(r.recommendation.gapClosure) },
            { label: "Resulting gap", value: fmt$(r.recommendation.resultingGap) },
            { label: "Trade-off", value: r.recommendation.tradeOff },
            { label: "Composite rank", value: `${r.recommendation.rank.toFixed(2)} / 10`,
              source: "See Ranking Logic below" },
          ]
        : [{ label: "Recommended Solution", value: "—",
              source: "No candidate options could be generated from the current planning state." }]),

      { label: "─ Candidate Solutions ─", value: "" },
      ...candidateRows,

      ...(r.unavailable.length > 0
        ? [
            { label: "─ Options not available (data missing / zero) ─", value: "" },
            ...unavailableRows,
          ]
        : []),

      { label: "─ Ranking Logic ─", value: "" },
      { label: "Ranking formula", value: FUNDING_RESOLUTION_RANKING_FORMULA,
        source: "client/src/lib/fundingResolutionAdvisor.ts (composite())" },
      { label: "Tie-breaker", value: "Options that close the gap fully outrank partial-resolving options at the same composite score.",
        source: "fundingResolutionAdvisor.ts (computeFundingResolution sort)" },

      { label: "─ Behaviour ─", value: "" },
      { label: "No-block", value: "Inform only — saves / forecasts / Monte Carlo / FIRE are NOT blocked.",
        source: "Funding Gap Resolution Advisor spec — advisory layer" },
    ],
    assumptions: [
      { label: "Resolution Advisor is an advisory / planning-validation layer — does NOT change any engine calculation.", source: "client/src/lib/fundingResolutionAdvisor.ts (no engine imports)" },
      { label: "Funding Gap = Required Liquidity − Available Liquidity (sign convention: positive gap means shortfall). The Plan Feasibility trace uses the inverse convention (Available − Required, negative = shortfall); both report the same shortfall in $.", source: "fundingResolutionAdvisor.ts vs planFeasibility.ts" },
      { label: "Candidate options are generated only when the required input is present (e.g. Equity Release option only when refinance headroom > $0). Missing options are listed under 'Options not available' rather than faked.", source: "fundingResolutionAdvisor.ts" },
      { label: "Ranking weights bias toward (1) lowest disruption, (2) lowest long-term wealth impact, (3) highest practicality — per the Resolution Advisor spec.", source: "Resolution Advisor spec" },
      { label: "Informational only — saves, forecasts, Monte Carlo, FIRE, and Recommendation engines are not blocked or gated by this advisor.", source: "Resolution Advisor spec" },
    ],
    dataSource: "computeFundingResolution(fundingResolutionAdvisor.ts)",
    sourceEngine: "client/src/lib/fundingResolutionAdvisor.ts (advisory layer; no engine import)",
    included: [
      { label: "Reduce Planned Investments — when planned stock / crypto buys exist" },
      { label: "Delay Investments — when planned stock / crypto buys exist" },
      { label: "Use Equity Release — when refinance LVR headroom > $0" },
      { label: "Use Asset Sales — when stock or crypto balance ≥ $500" },
      { label: "Delay Property / Increase Savings — when IP acquisition + positive monthly surplus" },
      { label: "Reduce Deposit — when IP acquisition with material deposit in horizon" },
    ],
    excluded: [
      { label: "Tax-deferred contributions / super contributions",
        reason: "Outside the Plan Feasibility horizon — these accrue inside super, not the operating cash bridge." },
      { label: "Borrowings outside Equity Release (e.g. personal loans)",
        reason: "Out of scope for the advisory layer — would require an underwriting model." },
      { label: "Side-income / second-job projections",
        reason: "Speculative — not derivable from existing canonical state." },
    ],
    calculatedAt: ts(),
    notes: [
      `Funding Gap ${fmt$(r.fundingGap)} — Resolution Advisor generated ${r.alternatives.length} candidate solution${r.alternatives.length === 1 ? "" : "s"}.`,
      r.recommendation
        ? `Recommendation: ${r.recommendation.title} (rank ${r.recommendation.rank.toFixed(2)}).`
        : "No candidate options could be generated — review the planning state.",
      `Inform only — no engine or UI control is blocked.`,
    ],
    relatedIds: [
      "dashboard:plan-feasibility",
      `cashflow:plan-execution:reconciliation:${new Date().getFullYear()}`,
    ],
  };
}
