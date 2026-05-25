/**
 * actionLabelMap.ts — Sprint 13 UI-layer action label rewriter.
 *
 * The Goal Solver action plan emits free-text `action` strings that mix
 * user-facing advice with engine-internal checkpoints (e.g. "Median net
 * worth checkpoint"). This module:
 *
 *   1. Classifies each raw action into an engine type (best-effort, by
 *      string pattern — the upstream engine does not tag types itself).
 *   2. Rewrites it into a concrete user-facing label with parameter
 *      interpolation pulled from the original string.
 *   3. Filters internal-only types like `median_net_worth_checkpoint`
 *      so they never reach the UI.
 *
 * Nothing here recomputes or invents financial values — only string
 * transformations over engine-emitted text.
 */

import type { ActionPlanEntry } from "./goalSolverPro";

export type EngineActionType =
  | "increase_dca"
  | "buy_ip"
  | "reduce_ppor_debt"
  | "release_equity"
  | "delay_property_purchase"
  | "stock_dca_start"
  | "projected_fire_year"
  | "median_net_worth_checkpoint"
  | "build_emergency_buffer"
  | "pay_high_interest_debt"
  | "refinance_restructure"
  | "rebalance_portfolio"
  | "fire_acceleration"
  | "unknown";

const INTERNAL_TYPES: ReadonlySet<EngineActionType> = new Set<EngineActionType>([
  "median_net_worth_checkpoint",
  "projected_fire_year",
]);

interface ClassifyResult {
  type: EngineActionType;
  params: Record<string, string | number>;
}

/** Identify which engine type a raw action string represents. */
export function classifyAction(rawAction: string): ClassifyResult {
  const a = rawAction.trim();

  const dcaMatch = a.match(/Set monthly contribution to \$([\d,]+)\/mo/i);
  if (dcaMatch) {
    const amount = Number(dcaMatch[1].replace(/,/g, ""));
    return { type: "increase_dca", params: { amount } };
  }

  const acquireMatch = a.match(/Acquire investment property.*\(strategy "([^"]+)"\)/i);
  if (acquireMatch) {
    return { type: "buy_ip", params: { strategy: acquireMatch[1] } };
  }
  const acquireSimple = a.match(/Acquire investment property/i);
  if (acquireSimple) {
    return { type: "buy_ip", params: {} };
  }

  const delayMatch = a.match(/Delay investment property purchase to (\d{4})/i);
  if (delayMatch) {
    return { type: "delay_property_purchase", params: { year: Number(delayMatch[1]) } };
  }

  const stockDcaMatch = a.match(/Stock DCA scheduled to begin/i);
  if (stockDcaMatch) {
    return { type: "stock_dca_start", params: {} };
  }

  const fireYearMatch = a.match(/Projected FIRE year \(median\):\s*(\d{4})/i);
  if (fireYearMatch) {
    return { type: "projected_fire_year", params: { year: Number(fireYearMatch[1]) } };
  }

  const checkpointMatch = a.match(/Median net worth checkpoint:\s*\$([\d,]+)/i);
  if (checkpointMatch) {
    const amount = Number(checkpointMatch[1].replace(/,/g, ""));
    return { type: "median_net_worth_checkpoint", params: { amount } };
  }

  const reducePporMatch = a.match(/Reduce PPOR debt by \$?([\d,]+)/i);
  if (reducePporMatch) {
    const amount = Number(reducePporMatch[1].replace(/,/g, ""));
    return { type: "reduce_ppor_debt", params: { amount } };
  }

  const releaseEquityMatch = a.match(/Release equity in (\d{4})/i);
  if (releaseEquityMatch) {
    return { type: "release_equity", params: { year: Number(releaseEquityMatch[1]) } };
  }

  // Catch-all common recommendation engine names that may surface as raw types.
  if (/build.*emergency.*buffer/i.test(a)) return { type: "build_emergency_buffer", params: {} };
  if (/pay.*high.*interest.*debt/i.test(a)) return { type: "pay_high_interest_debt", params: {} };
  if (/refinance|restructure/i.test(a)) return { type: "refinance_restructure", params: {} };
  if (/rebalance.*portfolio/i.test(a)) return { type: "rebalance_portfolio", params: {} };
  if (/fire acceleration/i.test(a)) return { type: "fire_acceleration", params: {} };

  return { type: "unknown", params: {} };
}

function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Map an engine action type + params → user-facing label. */
export function rewriteActionLabel(type: EngineActionType, params: Record<string, string | number>, fallback: string): string {
  switch (type) {
    case "increase_dca":
      return params.amount != null
        ? `Increase stock investing by $${Number(params.amount).toLocaleString()}/month`
        : "Increase stock investing";
    case "buy_ip":
      return params.year != null
        ? `Buy investment property in ${params.year}`
        : "Buy investment property";
    case "reduce_ppor_debt":
      return params.amount != null
        ? `Reduce PPOR debt by $${Number(params.amount).toLocaleString()}`
        : "Reduce PPOR debt";
    case "release_equity":
      return params.year != null
        ? `Release equity in ${params.year}`
        : "Release equity";
    case "delay_property_purchase":
      return params.year != null
        ? `Delay property purchase to ${params.year}`
        : params.months != null
          ? `Delay property purchase by ${params.months} months`
          : "Delay property purchase";
    case "stock_dca_start":
      return "Start stock DCA schedule";
    case "build_emergency_buffer":
      return "Build emergency buffer";
    case "pay_high_interest_debt":
      return "Pay down high-interest debt";
    case "refinance_restructure":
      return "Refinance or restructure debt";
    case "rebalance_portfolio":
      return "Rebalance portfolio";
    case "fire_acceleration":
      return "Accelerate FIRE timeline";
    case "median_net_worth_checkpoint":
    case "projected_fire_year":
      // Internal — never surface.
      return fallback;
    case "unknown":
    default:
      return titleCase(fallback) || fallback;
  }
}

export interface RewrittenAction {
  /** User-facing label. */
  label: string;
  /** Engine type classification. */
  type: EngineActionType;
  /** Original raw action string. */
  rawAction: string;
  /** True if this action is an internal checkpoint that must not surface. */
  internal: boolean;
}

/** Filter + rewrite a single raw action label. */
export function rewriteAction(rawAction: string): RewrittenAction {
  const { type, params } = classifyAction(rawAction);
  const internal = INTERNAL_TYPES.has(type);
  const label = internal ? rawAction : rewriteActionLabel(type, params, rawAction);
  return { label, type, rawAction, internal };
}

/** True if the action plan entry should be hidden from user-facing surfaces. */
export function isInternalAction(rawAction: string): boolean {
  return INTERNAL_TYPES.has(classifyAction(rawAction).type);
}

/** Filter out internal-only checkpoints + rewrite remaining actions. */
export function filterAndRewriteActionPlan(entries: ActionPlanEntry[]): Array<ActionPlanEntry & { rewritten: RewrittenAction }> {
  const out: Array<ActionPlanEntry & { rewritten: RewrittenAction }> = [];
  for (const e of entries) {
    const rewritten = rewriteAction(e.action);
    if (rewritten.internal) continue;
    out.push({ ...e, rewritten });
  }
  return out;
}
