/**
 * planFeasibilityTraces.ts — Funding Feasibility audit trace.
 *
 * Surfaces the Plan Feasibility breakdown (Available Liquidity vs Required
 * Liquidity → Funding Gap → Status) for the active scenario. Every value is
 * derived by `computePlanFeasibility` in `/lib/planFeasibility.ts` — this
 * file only renders the trace and registers the canonical trace id with the
 * audit coverage manifest.
 *
 * The trace is a PLANNING-VALIDATION layer. It does NOT change any engine
 * calculation. Trace id is intentionally namespaced under `dashboard:` (not
 * `cashflow_engine:`) because feasibility is a planning concept, not an
 * engine output — engines remain free of audit imports.
 *
 * #FWL_Plan_Feasibility_Layer
 */

import type { CalculationTrace } from "../calculationTrace";
import type { PlanFeasibilityResult } from "../../planFeasibility";
import {
  PLAN_FEASIBILITY_WARNING_HEADLINE,
  PLAN_FEASIBILITY_WARNING_ASSUMPTION,
  planFeasibilityWarningDetail,
} from "../../planFeasibility";

export const PLAN_FEASIBILITY_TRACE_ID = "dashboard:plan-feasibility";

const fmt$ = (n: number) =>
  n < 0
    ? `-$${Math.abs(Math.round(n)).toLocaleString()}`
    : `$${Math.round(n).toLocaleString()}`;

const ts = () => new Date().toISOString();

export interface PlanFeasibilityTraceArgs {
  result: PlanFeasibilityResult;
}

/**
 * Build the Funding Feasibility audit trace from a computed feasibility
 * result. Returns a CalculationTrace with the Available Liquidity sources,
 * Required Liquidity uses, the funding-gap formula, and (when negative) the
 * three-line warning copy required by the Plan Feasibility spec.
 */
export function buildPlanFeasibilityTrace(args: PlanFeasibilityTraceArgs): CalculationTrace {
  const r = args.result;

  const sourceRows = r.sources.map((s) => ({
    label: s.enabled ? `+ ${s.label}` : `  · ${s.label} (not counted)`,
    value: s.enabled ? fmt$(s.value) : `${fmt$(s.value)} — disabled`,
    source: s.note,
  }));
  const useRows = r.uses.map((u) => ({
    label: `- ${u.label}`,
    value: fmt$(u.value),
    source: u.note,
  }));

  const warningRows = r.hasFundingGap
    ? [
        {
          label: "─ Warning (negative gap) ─",
          value: "",
        },
        {
          label: "Headline",
          value: PLAN_FEASIBILITY_WARNING_HEADLINE,
          source: "Plan Feasibility warning copy (planFeasibility.ts)",
        },
        {
          label: "Detail",
          value: planFeasibilityWarningDetail(r.fundingGap),
          source: "Plan Feasibility warning copy (parametrised by |fundingGap|)",
        },
        {
          label: "Assumption",
          value: PLAN_FEASIBILITY_WARNING_ASSUMPTION,
          source: "Plan Feasibility warning copy — informs the user that downstream cashflow projections assume this gap is resolved",
        },
        {
          label: "Additional Funding Required",
          value: fmt$(r.additionalFundingRequired),
          source: "max(0, -fundingGap)",
        },
        {
          label: "Behaviour",
          value: "Inform only — saves / forecasts / Monte Carlo / FIRE are NOT blocked.",
          source: "Plan Feasibility spec — no hard stop, no validation error, no disabled buttons",
        },
      ]
    : [
        {
          label: "─ Status (no warning) ─",
          value: "",
        },
        {
          label: "Behaviour",
          value:
            r.status === "fully-funded"
              ? "Fully Funded — Available Liquidity exceeds Required Liquidity by more than $50,000."
              : "Tight Liquidity — Available Liquidity covers Required Liquidity but with under $50,000 of headroom.",
          source: "Plan Feasibility thresholds (planFeasibility.ts)",
        },
      ];

  return {
    id: PLAN_FEASIBILITY_TRACE_ID,
    label: "Plan Feasibility — Funding Gap",
    finalValue: `${r.statusLabel} · Gap ${fmt$(r.fundingGap)}`,
    plainEnglish: r.hasFundingGap
      ? `Available Liquidity (${fmt$(r.availableLiquidity)}) does NOT cover Required Liquidity (${fmt$(r.requiredLiquidity)}) over the ${r.horizonLabel}. Funding Gap = ${fmt$(r.fundingGap)} → additional funding of ${fmt$(r.additionalFundingRequired)} is required. This is informational only — the plan still saves, forecasts, Monte Carlo, and FIRE analysis continue to run. Wealth Position is reported separately under Cashflow Reconciliation § 7.`
      : r.status === "tight-liquidity"
        ? `Available Liquidity (${fmt$(r.availableLiquidity)}) covers Required Liquidity (${fmt$(r.requiredLiquidity)}) over the ${r.horizonLabel} but only by ${fmt$(r.fundingGap)}. Treat as Tight Liquidity — under $50,000 of headroom.`
        : `Available Liquidity (${fmt$(r.availableLiquidity)}) exceeds Required Liquidity (${fmt$(r.requiredLiquidity)}) by ${fmt$(r.fundingGap)} over the ${r.horizonLabel}. Plan is Fully Funded.`,
    formula:
      "Available Liquidity = Cash + Offset + (Equity Release if enabled) + (Asset Sales if enabled)\n" +
      "Required Liquidity  = Property Deposits + Stamp Duty + Buying Costs + Planned Stock Purchases + Planned Crypto Purchases + DCA Contributions\n" +
      "Funding Gap         = Available Liquidity − Required Liquidity\n" +
      "Status              = Fully Funded (gap > $50k) | Tight Liquidity (0 ≤ gap ≤ $50k) | Funding Gap (gap < 0)",
    expanded:
      `Available Liquidity ${fmt$(r.availableLiquidity)} − Required Liquidity ${fmt$(r.requiredLiquidity)} = Funding Gap ${fmt$(r.fundingGap)} → ${r.statusLabel}`,
    inputs: [
      { label: "─ Available Liquidity Sources ─", value: "" },
      ...sourceRows,
      { label: "= Available Liquidity", value: fmt$(r.availableLiquidity),
        source: "Σ of enabled sources" },

      { label: "─ Required Liquidity Uses ─", value: "" },
      ...useRows,
      { label: "= Required Liquidity", value: fmt$(r.requiredLiquidity),
        source: "Σ of uses (no double-counting — equity-release portion is already excluded from Property Deposits by the funding adapter)" },

      { label: "─ Funding Gap ─", value: "" },
      { label: "Funding Gap = Available − Required", value: fmt$(r.fundingGap),
        source: "Available Liquidity − Required Liquidity" },
      { label: "Status", value: r.statusLabel,
        source: "Fully Funded (>$50k) | Tight Liquidity (0–$50k) | Funding Gap (<$0)" },
      { label: "Horizon", value: r.horizonLabel,
        source: "Planning horizon over which Required Liquidity was summed" },

      ...warningRows,
    ],
    assumptions: [
      { label: "Plan Feasibility is a UI / planning-validation layer — it does NOT change any engine calculation.", source: "client/src/lib/planFeasibility.ts (no engine imports)" },
      { label: "Equity Release contributes to Available Liquidity only when the user has selected it for at least one IP — counted from the same `_fundingPlan.equityReleased` the property funding adapter produced.", source: "propertyFundingAdapter" },
      { label: "Asset Sales contribute to Available Liquidity only when the user has selected stocks/crypto as a funding source — counted from `_fundingPlan.stocksSold + _fundingPlan.cryptoSold`.", source: "propertyFundingAdapter" },
      { label: "DCA Contributions are summed from `CashFlowYear.stockDCAOutflow + cryptoDCAOutflow` over the horizon — same per-year values used by Cashflow Reconciliation §3.", source: "CashFlowYear (aggregateCashFlowToAnnual)" },
      { label: "A negative Funding Gap is informational only — saves, forecasts, Monte Carlo, and FIRE analysis continue to run.", source: "Plan Feasibility spec" },
      { label: "Year-End Wealth Position is reported separately in Cashflow Reconciliation §7. Feasibility (liquidity to execute the plan) and Wealth (value held by the household) are independent dimensions.", source: "Plan Feasibility spec" },
    ],
    dataSource: "computePlanFeasibility(planFeasibility.ts)",
    sourceEngine: "client/src/lib/planFeasibility.ts (planning-validation layer; no engine import)",
    included: [
      { label: "Available Liquidity: Cash + Offset + Equity Release (if enabled) + Asset Sales (if enabled)" },
      { label: "Required Liquidity: Property Deposits + Stamp Duty + Buying Costs + Planned Stock Purchases + Planned Crypto Purchases + DCA Contributions" },
      { label: "Status threshold rules: Fully Funded (gap > $50k) / Tight Liquidity (0 ≤ gap ≤ $50k) / Funding Gap (gap < 0)" },
      { label: "Additional Funding Required = max(0, -fundingGap) when status = Funding Gap" },
    ],
    excluded: [
      { label: "Salary / rental / household income", reason: "Income flows are tracked by Cashflow Reconciliation §2 (Operating Cashflow). Feasibility is a point-in-time liquidity check, not a cashflow loop." },
      { label: "Wealth Position values (Stocks, Crypto, Property Equity, Net Worth)", reason: "Reported separately in Cashflow Reconciliation §7. A user can have a Funding Gap and rising Net Worth, or the reverse — feasibility and wealth are independent dimensions." },
      { label: "Capital growth / unrealised gains", reason: "Cannot fund a planned purchase without liquidation. Counted only when Asset Sales is enabled and the funding plan draws on stocks/crypto." },
      { label: "Future operating cashflow surplus", reason: "Feasibility focuses on whether the planned deployments can be funded NOW from existing liquidity + opted-in funding sources. Future surplus is shown in the Plan Execution Capacity chart instead." },
    ],
    calculatedAt: ts(),
    notes: r.hasFundingGap
      ? [
          `⚠ ${PLAN_FEASIBILITY_WARNING_HEADLINE}`,
          planFeasibilityWarningDetail(r.fundingGap),
          PLAN_FEASIBILITY_WARNING_ASSUMPTION,
        ]
      : [
          `✓ ${r.statusLabel} — Funding Gap ${fmt$(r.fundingGap)} (${r.horizonLabel}).`,
        ],
    relatedIds: [
      "property:funding-source:used",
      "property:funding-source:cash-impact",
      "property:funding-source:equity-release",
      `cashflow:plan-execution:reconciliation:${new Date().getFullYear()}`,
    ],
  };
}
