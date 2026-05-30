/**
 * actionRoadmap/engineEventTimeline.ts — Sprint 29 §7.
 *
 * Maps the engine's `ScenarioEvent[]` (already produced by
 * `runScenarioV2`) into category-tagged Gantt lanes for the Action
 * Roadmap's professional timeline (S3 / P5). NO new engine logic — pure
 * grouping + display labelling.
 *
 * Per §7.3, recurring / housekeeping events (income.*, expense.*,
 * macro.*, tax.*, debt.mortgage_payment) are dropped — they aren't
 * milestones a user would act on.
 *
 * Honesty:
 *   - Undefined / empty events input → [].
 *   - Synthetic FIRE event appended only when `fireMonth != null`.
 *   - Same-month duplicates collapsed (keep first) per §7.4.
 */
import type { ScenarioEvent, ScenarioEventType } from "../scenarioV2/types";

export type EngineEventCategory =
  | "property"
  | "debt"
  | "cash"
  | "etf"
  | "super"
  | "exit"
  | "fire";

export interface EngineEvent {
  id: string;
  month: string;
  category: EngineEventCategory;
  action: string;
  expectedOutcome: string;
  netWorthImpact: number | null;
  riskImpact: "low" | "medium" | "high" | null;
  source: "scenarioV2.events";
  sourceEventType: ScenarioEventType | "synthetic.fire";
}

export interface EngineEventTimelineInput {
  events: ScenarioEvent[] | undefined;
  fireMonth: string | null;
}

const TYPE_TO_CATEGORY: Partial<Record<ScenarioEventType, EngineEventCategory>> = {
  "contribution.offset_deposit": "cash",
  "contribution.etf_dca": "etf",
  "contribution.etf_lump": "etf",
  "contribution.crypto_lump": "etf",
  "debt.extra_repayment": "debt",
  "debt.refinance": "debt",
  "asset.buy_property": "property",
  "asset.sell_property": "exit",
  "asset.rentvest": "property",
  "asset.cash_hold": "cash",
  // Anything not in this map is dropped (income.*, expense.*, macro.*,
  // tax.*, debt.mortgage_payment per §7.3).
};

function actionFor(t: ScenarioEventType): string {
  switch (t) {
    case "contribution.offset_deposit": return "Deposit to offset";
    case "contribution.etf_dca":        return "ETF DCA contribution";
    case "contribution.etf_lump":       return "ETF lump-sum";
    case "contribution.crypto_lump":    return "Crypto allocation";
    case "debt.extra_repayment":        return "Extra mortgage repayment";
    case "debt.refinance":              return "Refinance mortgage";
    case "asset.buy_property":          return "Buy property";
    case "asset.sell_property":         return "Sell property";
    case "asset.rentvest":              return "Rentvest restructure";
    case "asset.cash_hold":             return "Hold cash";
    default:                            return t;
  }
}

function outcomeFor(t: ScenarioEventType, payload: Record<string, unknown>): string {
  const amount = pickNumber(payload, ["amount", "deposit", "lumpSum", "monthlyAmount", "purchasePrice", "salePrice", "extraRepayment"]);
  switch (t) {
    case "asset.buy_property":
      return amount != null ? `Acquire property at $${fmt(amount)}.` : "Engine-modelled property acquisition.";
    case "asset.sell_property":
      return amount != null ? `Sell property for $${fmt(amount)}.` : "Engine-modelled property disposal.";
    case "contribution.etf_lump":
      return amount != null ? `Deploy $${fmt(amount)} lump-sum into ETF.` : "Engine-modelled ETF lump-sum.";
    case "contribution.etf_dca":
      return amount != null ? `Contribute $${fmt(amount)}/month into ETF.` : "Engine-modelled ETF DCA.";
    case "contribution.offset_deposit":
      return amount != null ? `Park $${fmt(amount)} in offset.` : "Engine-modelled offset deposit.";
    case "contribution.crypto_lump":
      return amount != null ? `Allocate $${fmt(amount)} to crypto.` : "Engine-modelled crypto allocation.";
    case "debt.refinance":
      return "Engine-modelled mortgage refinance.";
    case "debt.extra_repayment":
      return amount != null ? `Extra $${fmt(amount)} mortgage repayment.` : "Engine-modelled extra repayment.";
    case "asset.cash_hold":
      return "Engine-modelled cash hold.";
    case "asset.rentvest":
      return "Engine-modelled rentvest restructure.";
    default:
      return "Engine-modelled event.";
  }
}

function riskImpactFor(t: ScenarioEventType): "low" | "medium" | "high" | null {
  switch (t) {
    case "asset.buy_property":          return "high";
    case "contribution.crypto_lump":    return "high";
    case "contribution.etf_lump":       return "medium";
    case "contribution.etf_dca":        return "low";
    case "debt.refinance":              return "low";
    case "debt.extra_repayment":        return "low";
    case "contribution.offset_deposit": return "low";
    case "asset.sell_property":         return "medium";
    case "asset.rentvest":              return "medium";
    case "asset.cash_hold":             return "low";
    default:                            return null;
  }
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("en-AU");
  return n.toFixed(0);
}

export function selectEngineEventTimeline(input: EngineEventTimelineInput): EngineEvent[] {
  const { events, fireMonth } = input;
  if (!Array.isArray(events) || events.length === 0) {
    return fireMonth ? [synthFire(fireMonth)] : [];
  }

  const out: EngineEvent[] = [];
  const dedup = new Set<string>();

  for (const e of events) {
    const cat = TYPE_TO_CATEGORY[e.type];
    if (!cat) continue;
    const dedupKey = `${e.month}::${cat}::${actionFor(e.type)}`;
    if (dedup.has(dedupKey)) continue;
    dedup.add(dedupKey);
    out.push({
      id: e.id,
      month: e.month,
      category: cat,
      action: actionFor(e.type),
      expectedOutcome: outcomeFor(e.type, e.payload ?? {}),
      netWorthImpact: pickNumber(e.payload ?? {}, ["amount", "lumpSum", "purchasePrice", "salePrice"]),
      riskImpact: riskImpactFor(e.type),
      source: "scenarioV2.events",
      sourceEventType: e.type,
    });
  }

  if (fireMonth) out.push(synthFire(fireMonth));

  // Stable order: by month then category
  out.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  return out;
}

function synthFire(month: string): EngineEvent {
  return {
    id: `synthetic.fire-${month}`,
    month,
    category: "fire",
    action: "FIRE Reached",
    expectedOutcome: "Median Monte Carlo trajectory crosses the FIRE number this month.",
    netWorthImpact: null,
    riskImpact: null,
    source: "scenarioV2.events",
    sourceEventType: "synthetic.fire",
  };
}
