/**
 * billsInclusion.ts — detect whether `snap.monthly_expenses` already includes
 * the recurring-bills line items, and decide whether the forecast engine should
 * also add a separate billsOutflow.
 *
 * Background
 * ----------
 * The forecast engines (`finance.ts:buildCashFlowSeries`,
 * `eventProcessor.ts:processEvents`) historically applied two outflows in every
 * forecast month:
 *
 *   1. `snap.monthly_expenses * (1 + inflation)^t`  (the user-entered all-in
 *      scalar grown by inflation)
 *   2. Per-bill `billActualOutflow(...)` summed across `sf_recurring_bills`
 *
 * When the user entered `monthly_expenses` as an ALL-IN figure derived from
 * their actual ledger (which already includes the categories tracked by their
 * recurring bills — childcare, insurance, utilities, subscriptions, finance,
 * etc.), this double-counts those bill categories in every forecast month and
 * understates surplus by the bills-monthly equivalent ($5k+/mo on the live
 * household).
 *
 * Conversely, some users enter `monthly_expenses` as a core-living-only figure
 * and rely on the bills module for utilities / subs / insurance — in that mode
 * the existing behaviour is correct.
 *
 * Decision rule (no hardcoded category exclusions)
 * ------------------------------------------------
 * Returns `true` (i.e. bills already in expenses → do NOT add billsOutflow)
 * when ANY of the following hold:
 *
 *   1. The user has explicitly set `snapshot.expenses_includes_recurring_bills`
 *      (boolean column / field) — explicit override always wins.
 *
 *   2. The trailing actual-ledger month total is close to (within ±15%) the
 *      `snap.monthly_expenses` scalar AND the actuals contain rows whose
 *      category matches a category present on `sf_recurring_bills`. This is
 *      data-driven: it proves the manual scalar already absorbed the same
 *      ledger entries that the bills represent.
 *
 *   3. The actual-ledger contains rows that match recurring-bill categories
 *      AND the user has not provided ledger expenses (i.e. snapshot-only) —
 *      treat the manual all-in figure as inclusive by default (mirrors the
 *      same conservative default used by `selectExpensesIncludesDebt`).
 *
 * Otherwise returns `false` — bills are tracked separately and SHOULD be added
 * on top of the forecasted core-living-expense scalar.
 */

import { safeNum } from "./mathUtils";

// ─── Inputs ─────────────────────────────────────────────────────────────────

export interface BillsInclusionInput {
  snapshot: {
    monthly_expenses: number;
    /** Optional explicit override. When `true`, force inclusive; when `false`,
     * force exclusive; when `undefined`, auto-detect. */
    expenses_includes_recurring_bills?: boolean;
  } & Record<string, any>;
  /** sf_expenses ledger rows (date, amount, category). May be undefined/empty. */
  expenses?: Array<{ date?: string; amount?: number | string; category?: string }>;
  /** sf_recurring_bills rows — used to enumerate the bill-category fingerprint. */
  bills?: Array<{ category?: string; active?: boolean; is_active?: boolean }>;
  /** ISO yyyy-mm-dd; defaults to today. */
  todayIso?: string;
}

export interface BillsInclusionDecision {
  /** Final answer: true means expenses already include bills (DO NOT add). */
  includesBills: boolean;
  /** "explicit" | "ledger-match" | "snapshot-default" | "exclusive". */
  reason:
    | "explicit_inclusive"
    | "explicit_exclusive"
    | "ledger_close_to_snapshot"
    | "snapshot_only_default_inclusive"
    | "ledger_categories_diverge"
    | "no_evidence_default_exclusive";
  /** Diagnostic detail for audit traces. */
  detail: {
    snapMonthlyExpenses: number;
    trailingActualAvg: number | null;
    diffPct: number | null;
    matchedCategories: string[];
    activeBillCategories: string[];
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayIsoFor(input: BillsInclusionInput): string {
  return input.todayIso ?? new Date().toISOString().split("T")[0];
}

/**
 * Trailing 3-month average from the most recent actuals. Returns null when
 * no actuals are available. We use 3 months (not 6) because the inclusion
 * decision is about RECENT behaviour — a 6mo window can be stale when the
 * user changes their lifestyle (had a baby, moved house, etc.).
 */
function trailingActualMonthlyAverage(
  expenses: BillsInclusionInput["expenses"],
  todayIso: string,
): number | null {
  if (!Array.isArray(expenses) || expenses.length === 0) return null;
  const today = new Date(todayIso);
  // Group by YYYY-MM
  const monthly = new Map<string, number>();
  for (const e of expenses) {
    if (!e?.date) continue;
    const key = String(e.date).substring(0, 7);
    monthly.set(key, (monthly.get(key) ?? 0) + safeNum(e.amount));
  }
  if (monthly.size === 0) return null;
  // Pick the latest 3 months (most recent first), ignoring the current in-progress
  // month if it has < $1 (partial entry data). We still include it when it has data.
  const sortedKeys = Array.from(monthly.keys()).sort().reverse();
  const window = sortedKeys.slice(0, 3);
  const total = window.reduce((s, k) => s + (monthly.get(k) ?? 0), 0);
  return window.length > 0 ? total / window.length : null;
}

function categorySetFromBills(
  bills: BillsInclusionInput["bills"],
): Set<string> {
  const out = new Set<string>();
  for (const b of bills ?? []) {
    if (b?.active === false || b?.is_active === false) continue;
    const c = (b?.category ?? "").toString().trim().toLowerCase();
    if (c) out.add(c);
  }
  return out;
}

function categoriesPresentInExpenses(
  expenses: BillsInclusionInput["expenses"],
  billCats: Set<string>,
): string[] {
  if (billCats.size === 0) return [];
  const seen = new Set<string>();
  for (const e of expenses ?? []) {
    const c = (e?.category ?? "").toString().trim().toLowerCase();
    if (c && billCats.has(c)) seen.add(c);
  }
  return Array.from(seen).sort();
}

// ─── Main decision ──────────────────────────────────────────────────────────

export function decideBillsInclusion(
  input: BillsInclusionInput,
): BillsInclusionDecision {
  const snap = input.snapshot ?? ({} as any);
  const snapMonthlyExpenses = safeNum(snap.monthly_expenses);
  const todayIso = todayIsoFor(input);

  const activeBillCategories = Array.from(categorySetFromBills(input.bills));
  const billCatSet = new Set(activeBillCategories);
  const matchedCategories = categoriesPresentInExpenses(input.expenses, billCatSet);
  const trailingActualAvg = trailingActualMonthlyAverage(input.expenses, todayIso);
  const diffPct =
    trailingActualAvg !== null && snapMonthlyExpenses > 0
      ? Math.abs(trailingActualAvg - snapMonthlyExpenses) / snapMonthlyExpenses
      : null;

  const detail = {
    snapMonthlyExpenses,
    trailingActualAvg,
    diffPct,
    matchedCategories,
    activeBillCategories,
  };

  // 1) Explicit override on snapshot
  if (typeof snap.expenses_includes_recurring_bills === "boolean") {
    return {
      includesBills: snap.expenses_includes_recurring_bills,
      reason: snap.expenses_includes_recurring_bills
        ? "explicit_inclusive"
        : "explicit_exclusive",
      detail,
    };
  }

  // 2) Data-driven: the snapshot scalar tracks the recent actual ledger AND the
  //    ledger contains rows matching bill categories → inclusive.
  if (
    matchedCategories.length > 0 &&
    trailingActualAvg !== null &&
    snapMonthlyExpenses > 0 &&
    diffPct !== null &&
    diffPct <= 0.15
  ) {
    return { includesBills: true, reason: "ledger_close_to_snapshot", detail };
  }

  // 3) Snapshot-only fallback (no ledger rows at all): mirror the safer default
  //    used by `selectExpensesIncludesDebt` — assume the user typed an all-in
  //    figure that already absorbed their bills.
  const hasAnyLedger = Array.isArray(input.expenses) && (input.expenses?.length ?? 0) > 0;
  if (!hasAnyLedger && snapMonthlyExpenses > 0) {
    return {
      includesBills: true,
      reason: "snapshot_only_default_inclusive",
      detail,
    };
  }

  // 4) Ledger has rows but bill-category rows are absent (or trailing avg is
  //    materially below the snapshot) — bills are tracked separately.
  if (matchedCategories.length === 0 && hasAnyLedger) {
    return { includesBills: false, reason: "ledger_categories_diverge", detail };
  }

  // Default: exclusive (existing behaviour) — bills get added on top.
  return { includesBills: false, reason: "no_evidence_default_exclusive", detail };
}
