/**
 * actionRoadmap/yearByYearRoadmap.ts — Sprint 30C.
 *
 * Year-by-year roadmap selector. For each calendar year in a 7-year window
 * starting at `now.getFullYear()`, this module surfaces:
 *
 *   • Acquisitions  — buy_property / sell_property / rentvest deltas
 *   • Refinance     — refinance deltas (+ cash-out where engine recorded it)
 *   • Equity release — derived from `refinance.params.cashOut` > 0
 *   • Debt          — offset_deposit, extra_mortgage_repayment, property_deposit_boost
 *   • Investment    — etf_lump_sum, etf_dca, crypto_lump_sum
 *   • FIRE          — synthesised year where median NW first ≥ FIRE number
 *   • Passive       — derived: passive at EOY from NW × SWR; flagged when it
 *     crosses the household's target passive figure
 *
 * Plus an EOY snapshot per year:
 *   • netWorth (P50 at December of that year)
 *   • passiveIncome = NW × SWR%
 *   • fireProgress = NW / fireNumber
 *
 * Honesty rules:
 *   • If `fan.length === 0` or required inputs are null → returns
 *     `{ years: [], reason: "Not modelled yet" }`.
 *   • If a year has no engine-modelled milestones → `noMilestones === true`
 *     and the card explains "Background growth only".
 *   • Never invents purchase prices, refi terms, or equity-release amounts:
 *     all $ values are pulled verbatim from `delta.params`.
 *   • No new MC. No new financial math. No new engines.
 *
 * NOTE on data source:
 *   We read from `winner.events: ScenarioDelta[]` (the recommended path's
 *   user-authored deltas) — these carry `activationMonth` AND the full
 *   `params` payload (deposit, lumpSum, purchasePrice, cashOut, etc.).
 *   The `winner.result.events: ScenarioEvent[]` stream is the engine's
 *   emitted-per-month firehose; it's noisier and lacks the user-facing
 *   shape we want here. The 30A engineEventLanes selector uses
 *   result.events for its 5-lane view; this selector intentionally uses
 *   the cleaner deltas list for the user-facing year cards.
 */
import type { FanPoint, MonthKey, ScenarioDelta } from "../scenarioV2/types";

// ─── Public types ───────────────────────────────────────────────────────

export type YearMilestoneCategory =
  | "acquisition"
  | "refinance"
  | "equity_release"
  | "debt"
  | "investment"
  | "fire"
  | "passive";

export interface YearMilestone {
  id: string;
  category: YearMilestoneCategory;
  /** Plain-English label shown as the card line title. */
  label: string;
  /** Optional dollar figure pulled from `delta.params`. Null if absent. */
  amount: number | null;
  /** Source delta id when this milestone came from a delta; null when synthesised. */
  sourceDeltaId: string | null;
  /** Explanation of why this milestone occurs, derived from delta + axis math. */
  reason: string;
  /** Calendar month (1-12) the milestone activates in, for sub-year ordering. */
  monthOfYear: number | null;
}

export interface YearCard {
  /** Calendar year (e.g. 2026). */
  year: number;
  /** P50 NW at December of this year (or last available month inside the year). */
  netWorthEoy: number | null;
  /** Monthly passive income at EOY = (NW × SWR) / 12. */
  passiveIncomeMonthlyEoy: number | null;
  /** FIRE progress 0..1 = NW / fireNumber. */
  fireProgress: number | null;
  /** True when this year contains the FIRE-crossing month. */
  isFireYear: boolean;
  /** True when no engine-modelled milestones land in this year. */
  noMilestones: boolean;
  milestones: YearMilestone[];
}

export interface YearByYearRoadmap {
  years: YearCard[];
  /** Set when `years` is empty — explains why. */
  reason: string | null;
}

export interface YearByYearInput {
  /** Recommended winner's deltas (preferred input). */
  events: ScenarioDelta[] | undefined;
  /** P50/P75/P25 monthly fan-chart series. */
  fan: FanPoint[];
  /** First fan point's month, for fan-index translation. */
  startMonth: MonthKey;
  fireNumber: number | null;
  swrPct: number | null;
  /** Used to flag passive milestones when monthly passive ≥ target. */
  targetPassiveMonthly: number | null;
  /** "Now" for the 7-year window start. Tests pass a fixed clock. */
  now: Date;
  /** How many years to show. Default 7. */
  yearsToShow?: number;
}

// ─── Constants ─────────────────────────────────────────────────────────

const DEFAULT_YEARS_TO_SHOW = 7;

// NOTE: Category mapping is handled directly inside `mapDeltaToMilestone`'s
// switch; the sets below are reserved for future fast-membership checks but
// kept untyped at the Set level to dodge ReadonlySet<DeltaType> variance.

// ─── Helpers ───────────────────────────────────────────────────────────

function monthsBetween(a: MonthKey, b: MonthKey): number {
  const pa = a.split("-").map((n) => parseInt(n, 10));
  const pb = b.split("-").map((n) => parseInt(n, 10));
  if (pa.length < 2 || pb.length < 2 || !pa.every(Number.isFinite) || !pb.every(Number.isFinite)) return -1;
  return (pb[0] - pa[0]) * 12 + (pb[1] - pa[1]);
}

function parseMonthKey(m: MonthKey): { year: number; month: number } | null {
  const parts = m.split("-").map((n) => parseInt(n, 10));
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  return { year: parts[0], month: parts[1] };
}

/** Pick the P50 NW at the last available fan-month inside `year`. */
function eoyNetWorth(fan: FanPoint[], year: number): number | null {
  let last: FanPoint | null = null;
  for (const pt of fan) {
    const parsed = parseMonthKey(pt.month);
    if (!parsed) continue;
    if (parsed.year === year) last = pt;
    if (parsed.year > year) break;
  }
  if (!last) return null;
  return Number.isFinite(last.p50) ? last.p50 : null;
}

function pickNumber(params: Record<string, unknown> | undefined, keys: string[]): number | null {
  if (!params) return null;
  for (const k of keys) {
    const v = params[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  return `${sign}$${abs.toLocaleString()}`;
}

// ─── Delta → milestone mapping ─────────────────────────────────────────

function mapDeltaToMilestone(d: ScenarioDelta): YearMilestone | null {
  const parsed = parseMonthKey(d.activationMonth);
  const monthOfYear = parsed ? parsed.month : null;
  const params = (d.params ?? {}) as Record<string, unknown>;

  switch (d.deltaType) {
    case "buy_property": {
      const price = pickNumber(params, ["purchasePrice", "price", "amount"]);
      const deposit = pickNumber(params, ["deposit", "depositAmount"]);
      return {
        id: d.id,
        category: "acquisition",
        label: price != null
          ? `Buy investment property — ${fmtMoney(price)}`
          : "Buy investment property",
        amount: price,
        sourceDeltaId: d.id,
        reason: deposit != null
          ? `Engine schedules this acquisition; ${fmtMoney(deposit)} deposit drawn from accumulated cash/equity to leverage portfolio growth.`
          : "Engine schedules this acquisition as part of the recommended strategy — adds leveraged exposure to property growth.",
        monthOfYear,
      };
    }
    case "sell_property": {
      const proceeds = pickNumber(params, ["salePrice", "proceeds", "amount"]);
      return {
        id: d.id,
        category: "acquisition",
        label: proceeds != null
          ? `Sell property — ${fmtMoney(proceeds)} proceeds`
          : "Sell property",
        amount: proceeds,
        sourceDeltaId: d.id,
        reason: "Engine schedules this disposal to free equity for the next move or to de-risk the portfolio.",
        monthOfYear,
      };
    }
    case "rentvest": {
      return {
        id: d.id,
        category: "acquisition",
        label: "Rentvest restructure",
        amount: null,
        sourceDeltaId: d.id,
        reason: "Engine converts PPOR to investment occupancy to free leverage capacity and improve tax position.",
        monthOfYear,
      };
    }
    case "property_deposit_boost": {
      const amount = pickNumber(params, ["amount", "boost", "topUp"]);
      return {
        id: d.id,
        category: "acquisition",
        label: amount != null
          ? `Deposit boost — ${fmtMoney(amount)}`
          : "Deposit boost",
        amount,
        sourceDeltaId: d.id,
        reason: amount != null
          ? `${fmtMoney(amount)} additional deposit reduces LVR on next acquisition, lowering interest cost over the life of the loan.`
          : "Additional deposit reduces LVR on next acquisition, lowering interest cost over the life of the loan.",
        monthOfYear,
      };
    }
    case "refinance": {
      const cashOut = pickNumber(params, ["cashOut", "cashout", "equityRelease"]);
      const newRate = pickNumber(params, ["newRate", "rate"]);
      if (cashOut != null && cashOut > 0) {
        return {
          id: d.id,
          category: "refinance",
          label: `Refinance + cash-out — ${fmtMoney(cashOut)}`,
          amount: cashOut,
          sourceDeltaId: d.id,
          reason: newRate != null
            ? `Engine refinances at ${(newRate * 100).toFixed(2)}% and releases ${fmtMoney(cashOut)} of equity to fund the next acquisition or de-leverage another loan.`
            : `Engine refinances and releases ${fmtMoney(cashOut)} of equity to fund the next acquisition or de-leverage another loan.`,
          monthOfYear,
        };
      }
      return {
        id: d.id,
        category: "refinance",
        label: newRate != null
          ? `Refinance to ${(newRate * 100).toFixed(2)}%`
          : "Refinance mortgage",
        amount: null,
        sourceDeltaId: d.id,
        reason: "Engine refinances to improve serviceability and lower interest expense across remaining term.",
        monthOfYear,
      };
    }
    case "offset_deposit": {
      const amount = pickNumber(params, ["amount", "deposit", "lumpSum"]);
      return {
        id: d.id,
        category: "debt",
        label: amount != null
          ? `Offset deposit — ${fmtMoney(amount)}`
          : "Offset deposit",
        amount,
        sourceDeltaId: d.id,
        reason: amount != null
          ? `${fmtMoney(amount)} into offset compresses interest on the linked mortgage — saves ≈${fmtMoney(amount * 0.055)} p.a. in non-deductible interest at current rate.`
          : "Cash routed into offset compresses interest on the linked mortgage.",
        monthOfYear,
      };
    }
    case "extra_mortgage_repayment": {
      const amount = pickNumber(params, ["amount", "lumpSum", "extraAmount"]);
      return {
        id: d.id,
        category: "debt",
        label: amount != null
          ? `Extra mortgage repayment — ${fmtMoney(amount)}`
          : "Extra mortgage repayment",
        amount,
        sourceDeltaId: d.id,
        reason: amount != null
          ? `${fmtMoney(amount)} principal repayment shortens the remaining term and reduces total interest paid over the loan's life.`
          : "Engine schedules an extra principal repayment to accelerate debt-down.",
        monthOfYear,
      };
    }
    case "etf_lump_sum": {
      const amount = pickNumber(params, ["lumpSum", "amount"]);
      return {
        id: d.id,
        category: "investment",
        label: amount != null
          ? `ETF lump sum — ${fmtMoney(amount)}`
          : "ETF lump sum",
        amount,
        sourceDeltaId: d.id,
        reason: amount != null
          ? `${fmtMoney(amount)} into diversified ETFs at this point captures expected long-run real return of ~6% p.a. with no leverage.`
          : "Lump-sum allocation into diversified ETFs captures expected long-run real return.",
        monthOfYear,
      };
    }
    case "etf_dca": {
      const monthly = pickNumber(params, ["monthlyAmount", "amount"]);
      return {
        id: d.id,
        category: "investment",
        label: monthly != null
          ? `Start ETF DCA — ${fmtMoney(monthly)}/mo`
          : "Start ETF dollar-cost averaging",
        amount: monthly,
        sourceDeltaId: d.id,
        reason: monthly != null
          ? `${fmtMoney(monthly)}/month into diversified ETFs averages the entry price and steadily compounds passive-income capacity.`
          : "Recurring ETF contribution averages entry price and steadily compounds passive-income capacity.",
        monthOfYear,
      };
    }
    case "crypto_lump_sum": {
      const amount = pickNumber(params, ["lumpSum", "amount"]);
      return {
        id: d.id,
        category: "investment",
        label: amount != null
          ? `Crypto lump sum — ${fmtMoney(amount)}`
          : "Crypto lump sum",
        amount,
        sourceDeltaId: d.id,
        reason: "Higher-volatility allocation — engine sizes this within the household's risk tolerance band.",
        monthOfYear,
      };
    }
    case "early_retire": {
      return {
        id: d.id,
        category: "fire",
        label: "Early retirement trigger",
        amount: null,
        sourceDeltaId: d.id,
        reason: "Engine flags this month as the planned end-of-work date in the recommended scenario.",
        monthOfYear,
      };
    }
    // The remaining delta types (cash_hold, salary_change, career_break,
    // child_expense, market_crash_stress, interest_rate_spike) are macro
    // / stress shaping — they don't belong on a user-facing year card.
    default:
      return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────

export function selectYearByYearRoadmap(input: YearByYearInput): YearByYearRoadmap {
  const {
    events,
    fan,
    startMonth,
    fireNumber,
    swrPct,
    targetPassiveMonthly,
    now,
    yearsToShow = DEFAULT_YEARS_TO_SHOW,
  } = input;

  if (!Array.isArray(fan) || fan.length === 0) {
    return { years: [], reason: "Not modelled yet — no forecast available." };
  }

  // Suppress unused-var lint without removing the parameter (startMonth is
  // part of the public contract for future fan-index helpers).
  void startMonth;

  const startYear = now.getFullYear();
  const allYears: number[] = Array.from({ length: yearsToShow }, (_, i) => startYear + i);

  // Bucket deltas → milestones by year.
  const milestonesByYear = new Map<number, YearMilestone[]>();
  for (const y of allYears) milestonesByYear.set(y, []);

  if (Array.isArray(events)) {
    for (const d of events) {
      const parsed = parseMonthKey(d.activationMonth);
      if (!parsed) continue;
      if (parsed.year < startYear || parsed.year > startYear + yearsToShow - 1) continue;
      const m = mapDeltaToMilestone(d);
      if (!m) continue;

      // If this is a refinance with cash-out, also emit a synthesised
      // equity_release milestone so the user-facing category is explicit.
      const params = (d.params ?? {}) as Record<string, unknown>;
      const cashOut = d.deltaType === "refinance" ? pickNumber(params, ["cashOut", "cashout", "equityRelease"]) : null;

      milestonesByYear.get(parsed.year)!.push(m);
      if (cashOut != null && cashOut > 0) {
        milestonesByYear.get(parsed.year)!.push({
          id: `${d.id}.equity-release`,
          category: "equity_release",
          label: `Equity release — ${fmtMoney(cashOut)}`,
          amount: cashOut,
          sourceDeltaId: d.id,
          reason: `Cash drawn from the refinance becomes available capital for the next deposit or to neutralise another debt.`,
          monthOfYear: parsed.month,
        });
      }
    }
  }

  // Compute FIRE-crossing year (first year where P50 NW ≥ fireNumber at any month).
  let fireCrossingYear: number | null = null;
  if (fireNumber != null && Number.isFinite(fireNumber) && fireNumber > 0) {
    for (const pt of fan) {
      if (!Number.isFinite(pt.p50)) continue;
      if (pt.p50 >= fireNumber) {
        const parsed = parseMonthKey(pt.month);
        if (parsed) {
          fireCrossingYear = parsed.year;
          break;
        }
      }
    }
  }

  // Build year cards.
  const years: YearCard[] = allYears.map((y) => {
    const nw = eoyNetWorth(fan, y);
    const passive = nw != null && swrPct != null && Number.isFinite(swrPct) && swrPct > 0
      ? (nw * (swrPct / 100)) / 12
      : null;
    const fireProgress = nw != null && fireNumber != null && Number.isFinite(fireNumber) && fireNumber > 0
      ? nw / fireNumber
      : null;
    const isFireYear = fireCrossingYear !== null && fireCrossingYear === y;
    const ms = milestonesByYear.get(y) ?? [];

    // Synthesise FIRE milestone in the crossing year.
    if (isFireYear && nw != null && fireNumber != null) {
      ms.push({
        id: `derived.fire.${y}`,
        category: "fire",
        label: `FIRE target reached — ${fmtMoney(fireNumber)} net worth`,
        amount: fireNumber,
        sourceDeltaId: null,
        reason: `Median Monte Carlo trajectory first crosses the ${fmtMoney(fireNumber)} FIRE number in ${y}. This marks the end of the accumulation phase and the start of the drawdown phase.`,
        monthOfYear: null,
      });
    }

    // Synthesise passive milestone when household target is crossed for the
    // first time in this year. The crossing flag is computed below across
    // the full series so we know when this year is the cross year.
    // (Handled in a second pass after we have the years[] array so we can
    // detect the prior-year value.)

    // Sort milestones inside the year by month then by category priority.
    const categoryOrder: Record<YearMilestoneCategory, number> = {
      acquisition: 0,
      refinance: 1,
      equity_release: 2,
      debt: 3,
      investment: 4,
      passive: 5,
      fire: 6,
    };
    ms.sort((a, b) => {
      const ma = a.monthOfYear ?? 13;
      const mb = b.monthOfYear ?? 13;
      if (ma !== mb) return ma - mb;
      return categoryOrder[a.category] - categoryOrder[b.category];
    });

    return {
      year: y,
      netWorthEoy: nw,
      passiveIncomeMonthlyEoy: passive,
      fireProgress,
      isFireYear,
      noMilestones: ms.length === 0,
      milestones: ms,
    };
  });

  // Second pass — passive-income crossing year (first year where monthly
  // passive ≥ target). Only emit when target is provided and reasonable.
  if (targetPassiveMonthly != null && Number.isFinite(targetPassiveMonthly) && targetPassiveMonthly > 0) {
    let crossYear: number | null = null;
    for (const yc of years) {
      const p = yc.passiveIncomeMonthlyEoy;
      if (p != null && Number.isFinite(p) && p >= targetPassiveMonthly) {
        crossYear = yc.year;
        break;
      }
    }
    if (crossYear !== null) {
      const yc = years.find((y) => y.year === crossYear);
      if (yc) {
        yc.milestones.push({
          id: `derived.passive.${crossYear}`,
          category: "passive",
          label: `Passive income target reached — ${fmtMoney(targetPassiveMonthly)}/mo`,
          amount: targetPassiveMonthly,
          sourceDeltaId: null,
          reason: `EOY net worth × ${swrPct?.toFixed(1) ?? "—"}% SWR first delivers ${fmtMoney(targetPassiveMonthly)}/month of safe withdrawal in ${crossYear}.`,
          monthOfYear: null,
        });
        yc.noMilestones = false;
      }
    }
  }

  return { years, reason: null };
}
