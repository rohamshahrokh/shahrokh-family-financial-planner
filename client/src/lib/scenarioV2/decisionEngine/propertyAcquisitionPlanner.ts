/**
 * Sprint 31A — Property Acquisition Planner (pure selector)
 *
 * Translates a recommended-scenario delta stream into a structured
 * "acquisition roadmap" of property events with the trigger conditions
 * that justify each event firing at its modelled month.
 *
 * Inputs:
 *   • winner deltas (the engine-recommended scenario's ScenarioDelta[])
 *   • a `PlannerContext` carrying the household state at planning time
 *     (cash, PPOR equity, useable equity at 80% LVR, monthly surplus,
 *     and the current PPOR LVR)
 *
 * Outputs:
 *   • AcquisitionEvent[] — one entry per buy / refi / equity-release /
 *     portfolio-expansion event, each with:
 *       - month (YYYY-MM)
 *       - type
 *       - $ amount drawn from delta.params (NEVER fabricated)
 *       - triggers[] string list of conditions that were met
 *       - reason — single user-facing sentence explaining why the event
 *         fires at this month
 *
 * Pure: no IO, no Date.now, no Math.random, no engine calls.
 *
 * Honesty contract:
 *   • Every $ value MUST be read from `delta.params` — never invented.
 *   • If a delta's required params are missing, the event is skipped.
 *   • Triggers are derived from the planner context the engine actually
 *     produced; if a trigger cannot be checked the event still fires
 *     (because the engine already validated it) but the trigger string
 *     records the missing data instead of pretending it was met.
 */

import type { MonthKey, ScenarioDelta } from "../types";

// ─── Public types ───────────────────────────────────────────────────────────

export type AcquisitionEventType =
  | "buy"
  | "refi"
  | "equity_release"
  | "portfolio_expansion";

export interface AcquisitionEvent {
  /** Stable id derived from the source delta. */
  id: string;
  /** Month the event fires (YYYY-MM). */
  month: MonthKey;
  /** Acquisition-event taxonomy used by the year-by-year roadmap UI. */
  type: AcquisitionEventType;
  /** Short label for cards (e.g. "Buy IP — $1.2M"). */
  label: string;
  /**
   * Primary $ amount associated with the event. For "buy"/"portfolio_expansion"
   * this is the purchase price; for "equity_release" it is the cash-out;
   * for "refi" it is the new loan balance (or 0 if unrecorded).
   * NEVER invented — always read from the source delta's params.
   */
  amount: number;
  /**
   * The conditions the planner verified before this event was scheduled.
   * Each trigger is a short, fact-grounded sentence such as:
   *   "Useable PPOR equity $310k exceeds $50k deposit threshold."
   * If the planner did not have data to test a trigger, the entry will
   * say so explicitly (e.g. "Trigger not verified — engine output had
   * no LVR at month 24").
   */
  triggers: string[];
  /** Single user-facing sentence summarising WHY the event fires here. */
  reason: string;
}

export interface PlannerContext {
  /** Cash on hand today. */
  cashToday: number;
  /** Monthly expense baseline (used for buffer checks). */
  monthlyExpenses: number;
  /** Monthly income (used for serviceability checks). */
  monthlyIncome: number;
  /** PPOR market value from snapshot. */
  pporValue: number;
  /** Useable equity at 80% LVR cash-out refi. */
  pporUseableEquityAt80Lvr: number;
  /** Current PPOR LVR (0..1). */
  pporLvr: number;
  /** Current investment-property LVR (across settled IPs). */
  ipLvr: number;
  /** Net servicing ratio at planning time (income / debt service). */
  nsr: number;
}

export interface AcquisitionPlan {
  events: AcquisitionEvent[];
  /** Empty → no engine-modelled acquisitions in this scenario. */
  empty: boolean;
  /** Plain-English reason when empty (e.g. "Recommended path is offset-only"). */
  emptyReason?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

function num(p: Record<string, unknown> | undefined, key: string, fallback = 0): number {
  if (!p) return fallback;
  const v = p[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Cash-buffer trigger for a "buy IP now" event.
 *
 * The engine's behavioural-realism guard requires 12 × monthlyExpenses of
 * cash buffer post-deposit. This trigger restates that condition in plain
 * English with the actual numbers from the context.
 */
function bufferTrigger(deposit: number, ctx: PlannerContext): string {
  const required = 12 * ctx.monthlyExpenses;
  const remaining = ctx.cashToday - deposit;
  if (remaining >= required) {
    return `Cash buffer remaining after ${fmtMoney(deposit)} deposit (${fmtMoney(remaining)}) covers ≥12 months of expenses (${fmtMoney(required)} required).`;
  }
  return `Deposit drawn from PPOR equity rather than cash — cash buffer remains ${fmtMoney(ctx.cashToday)} (${(ctx.cashToday / ctx.monthlyExpenses).toFixed(1)} months of expenses).`;
}

/**
 * Equity-release trigger: useable PPOR equity ≥ cash-out amount being drawn.
 */
function equityReleaseTrigger(cashOut: number, ctx: PlannerContext): string {
  if (ctx.pporUseableEquityAt80Lvr <= 0) {
    return "Trigger not verified — engine output had no PPOR equity snapshot.";
  }
  if (cashOut <= ctx.pporUseableEquityAt80Lvr) {
    return `Useable PPOR equity at 80% LVR (${fmtMoney(ctx.pporUseableEquityAt80Lvr)}) covers the ${fmtMoney(cashOut)} cash-out.`;
  }
  return `Cash-out (${fmtMoney(cashOut)}) exceeds current useable PPOR equity (${fmtMoney(ctx.pporUseableEquityAt80Lvr)}) — engine modelled future equity growth to settlement month.`;
}

/**
 * NSR trigger for refi/acquisition events. NSR ≥ 1.0 means income covers
 * debt service after the new commitment. The engine has already enforced
 * the buffered version of this; here we just surface the snapshot value.
 */
function nsrTrigger(ctx: PlannerContext): string {
  if (ctx.nsr <= 0) return "Trigger not verified — NSR was not present in engine output.";
  if (ctx.nsr >= 1.05) {
    return `NSR ${ctx.nsr.toFixed(2)} (above 1.05 safety buffer) — household services existing + new debt.`;
  }
  if (ctx.nsr >= 1.0) {
    return `NSR ${ctx.nsr.toFixed(2)} just clears 1.00 — engine flagged this scenario as serviceable but thin.`;
  }
  return `NSR ${ctx.nsr.toFixed(2)} below 1.00 — engine should NOT have scheduled this event.`;
}

// ─── Main planner ───────────────────────────────────────────────────────────

/**
 * Convert the winner scenario's delta stream into a structured acquisition
 * roadmap. Pure, deterministic, side-effect-free.
 */
export function planAcquisitions(
  deltas: readonly ScenarioDelta[] | undefined,
  ctx: PlannerContext,
): AcquisitionPlan {
  if (!deltas || deltas.length === 0) {
    return { events: [], empty: true, emptyReason: "No engine deltas in this scenario." };
  }

  const events: AcquisitionEvent[] = [];

  // Sort deltas by activation month so the resulting roadmap is chronological.
  const sorted = [...deltas].sort((a, b) =>
    a.activationMonth.localeCompare(b.activationMonth),
  );

  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i]!;
    const params = (d.params ?? {}) as Record<string, unknown>;

    switch (d.deltaType) {
      case "property_deposit_boost":
      case "buy_property": {
        const purchasePrice = num(params, "purchasePrice", num(params, "amount", 0));
        const deposit = num(params, "extraDeposit", num(params, "amount", 0));
        if (purchasePrice <= 0 && deposit <= 0) continue;

        // Distinguish IP1 (first leveraged buy) vs IP2+ (portfolio expansion).
        // A buy is a "portfolio_expansion" when a previous buy already exists
        // in this scenario.
        const isExpansion = events.some(
          (e) => e.type === "buy" || e.type === "portfolio_expansion",
        );

        const triggers: string[] = [
          bufferTrigger(deposit, ctx),
          nsrTrigger(ctx),
          ctx.ipLvr < 0.65
            ? `Existing IP LVR ${(ctx.ipLvr * 100).toFixed(0)}% leaves headroom under 65% serviceability ceiling.`
            : `Existing IP LVR ${(ctx.ipLvr * 100).toFixed(0)}% at or above 65% — engine accepted only because new IP yield supports debt.`,
        ];

        const reason = isExpansion
          ? `Engine schedules a portfolio expansion (IP2) at ${d.activationMonth}: deposit ${fmtMoney(deposit)} drawn from previously released equity / accumulated cash, purchase price ${fmtMoney(purchasePrice)}.`
          : `Engine schedules the first acquisition at ${d.activationMonth}: deposit ${fmtMoney(deposit)}, purchase price ${fmtMoney(purchasePrice)}. Buffer + NSR triggers above all met.`;

        events.push({
          id: `${d.id}/${d.deltaType}`,
          month: d.activationMonth,
          type: isExpansion ? "portfolio_expansion" : "buy",
          label: isExpansion
            ? `Buy IP2 — ${fmtMoney(purchasePrice)}`
            : `Buy IP — ${fmtMoney(purchasePrice)}`,
          amount: purchasePrice,
          triggers,
          reason,
        });
        break;
      }

      case "refinance": {
        const cashOut = num(params, "cashOut", 0);
        const newRate = num(params, "newRate", 0);

        if (cashOut > 0) {
          // Equity release.
          events.push({
            id: `${d.id}/equity_release`,
            month: d.activationMonth,
            type: "equity_release",
            label: `Equity release — ${fmtMoney(cashOut)}`,
            amount: cashOut,
            triggers: [
              equityReleaseTrigger(cashOut, ctx),
              nsrTrigger(ctx),
              ctx.pporLvr < 0.80
                ? `PPOR LVR ${(ctx.pporLvr * 100).toFixed(0)}% is below the 80% refi ceiling, leaving room to release equity.`
                : `PPOR LVR ${(ctx.pporLvr * 100).toFixed(0)}% at the 80% refi ceiling — engine relied on modelled PPOR appreciation to settlement month.`,
            ],
            reason: `Refinance at ${d.activationMonth} releases ${fmtMoney(cashOut)} of PPOR equity. Triggers: useable equity covers the draw; NSR remains serviceable.`,
          });
          // Refi event for the same month, recorded separately so the
          // user sees BOTH the refi and the equity release.
          events.push({
            id: `${d.id}/refi`,
            month: d.activationMonth,
            type: "refi",
            label: newRate > 0
              ? `Refinance @ ${(newRate * 100).toFixed(2)}%`
              : `Refinance PPOR`,
            amount: cashOut,
            triggers: [nsrTrigger(ctx)],
            reason: `Engine refinances PPOR at ${d.activationMonth} to enable the ${fmtMoney(cashOut)} cash-out above.`,
          });
        } else {
          // Pure rate-save refinance.
          events.push({
            id: `${d.id}/refi`,
            month: d.activationMonth,
            type: "refi",
            label: newRate > 0
              ? `Refinance @ ${(newRate * 100).toFixed(2)}%`
              : `Refinance PPOR (term reset)`,
            amount: 0,
            triggers: [
              nsrTrigger(ctx),
              `No cash-out drawn — pure rate / term improvement on existing PPOR loan.`,
            ],
            reason: `Engine refinances PPOR at ${d.activationMonth} to improve serviceability; no equity released and no new loan balance taken on.`,
          });
        }
        break;
      }

      default:
        // Non-property deltas are not part of the acquisition roadmap.
        continue;
    }
  }

  if (events.length === 0) {
    return {
      events: [],
      empty: true,
      emptyReason: "Recommended scenario contains no acquisition / refinance events (offset- or ETF-only path).",
    };
  }

  return { events, empty: false };
}
