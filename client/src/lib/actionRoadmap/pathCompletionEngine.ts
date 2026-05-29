/**
 * actionRoadmap/pathCompletionEngine.ts — Sprint 27.
 *
 * Selector that turns engine output + canonical FIRE into a `PathCompletion`
 * read-out for the UI. **THIS MODULE PERFORMS NO MONTE CARLO MATH.** It does
 * one deterministic scan over the already-computed `netWorthFan: FanPoint[]`
 * and reports:
 *
 *   - Expected FIRE age      : first month where p50 ≥ fireNumber, converted
 *                              to calendar year then to age via (currentAge +
 *                              years from `now`).
 *   - Expected Net Worth     : p50 of the terminal fan point.
 *   - Expected NW range      : { p25, p75 } of the terminal fan point.
 *   - Implied passive income : expectedNW × swr/100  (annual) and ÷12 (monthly).
 *   - Goal achievement %     : min(1, expectedNW / fireNumber).
 *   - Years early/late       : targetFireAge − expectedFireAge.
 *   - Gap remaining          : max(0, fireNumber − expectedNW).
 *   - Status                 : ON_TRACK | ON_TARGET_LATE | GAP_REMAINING |
 *                              NOT_MODELLED.
 *
 * Honesty rules (verbatim from brief):
 *   - Fan empty / scenario missing  → status NOT_MODELLED, every numeric null.
 *   - Never invent a year, age, or dollar amount.
 *   - `expectedAnnualPassiveIncome` is null when EITHER expectedNW OR swrPct
 *     is missing.
 *   - `yearsEarlyOrLate` is null when EITHER targetFireAge OR expectedFireAge
 *     is null.
 */

import type { FanPoint } from "../scenarioV2/types";
import type { GoalLabRankedScenario } from "../goalLab/orchestrator";
import type { CanonicalFire } from "../canonicalFire";

import type {
  PathCompletion,
  PathCompletionStatus,
} from "./types";

/** Minimal goal shape — pass `profile.fire` from the canonical goal profile. */
export interface CompletionGoalInput {
  targetFireAge: number | null;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Compute the Path Completion read-out.
 *
 * @param scenario  Recommended GoalLabRankedScenario. If null OR its winner is
 *                  null OR `winner.result.netWorthFan` is empty, returns a
 *                  fully-nulled PathCompletion with status NOT_MODELLED.
 * @param fire      Canonical FIRE block. Provides `fireNumber` + `swrPct`.
 *                  If `fireNumber` ≤ 0 (or missing), status falls back to
 *                  NOT_MODELLED — we will not compute a fraction with no goal.
 * @param goal      Canonical goal profile. Provides `targetFireAge` for
 *                  early/late comparison.
 * @param currentAge The user's current age in whole years. When null, we
 *                  cannot convert a calendar year into an age — `expectedFireAge`
 *                  stays null AND `yearsEarlyOrLate` stays null.
 * @param now       Optional clock injection for tests (defaults to new Date()).
 */
export function computePathCompletion(
  scenario: GoalLabRankedScenario | null,
  fire: Pick<CanonicalFire, "fireNumber" | "swrPct"> | null,
  goal: CompletionGoalInput | null,
  currentAge: number | null,
  _now: Date = new Date(),
): PathCompletion {
  const empty: PathCompletion = {
    status: "NOT_MODELLED",
    expectedFireAge: null,
    targetFireAge: goal?.targetFireAge ?? null,
    expectedNetWorth: null,
    expectedNetWorthRange: null,
    expectedAnnualPassiveIncome: null,
    expectedMonthlyPassiveIncome: null,
    goalAchievementFraction: null,
    yearsEarlyOrLate: null,
    gapRemaining: null,
    why: ["The engine has not produced a forecast for this path yet."],
    audit: {
      fanPointsConsidered: 0,
      fireNumberSource: fire == null ? "missing" : "empty",
      swrPctUsed: null,
    },
  };

  if (!scenario || !scenario.winner) return empty;

  const fan: FanPoint[] = scenario.winner.result?.netWorthFan ?? [];
  if (fan.length === 0) return empty;

  const fireNumber =
    fire && Number.isFinite(fire.fireNumber) && fire.fireNumber > 0
      ? fire.fireNumber
      : null;
  const swrPct =
    fire && Number.isFinite(fire.swrPct) && fire.swrPct > 0 ? fire.swrPct : null;

  // 1. First-crossing scan (deterministic — no MC re-run).
  let crossingIndex = -1;
  if (fireNumber != null) {
    for (let i = 0; i < fan.length; i++) {
      if (fan[i].p50 >= fireNumber) {
        crossingIndex = i;
        break;
      }
    }
  }

  // 2. Terminal point — last fan entry. p50/p25/p75 already pre-computed.
  const terminal = fan[fan.length - 1];
  const expectedNetWorth = numberOrNull(terminal.p50);
  const expectedNetWorthRange =
    Number.isFinite(terminal.p25) && Number.isFinite(terminal.p75)
      ? { p25: terminal.p25, p75: terminal.p75 }
      : null;

  // 3. Convert crossing-month-index → calendar year → age.
  let expectedFireAge: number | null = null;
  if (crossingIndex >= 0 && currentAge != null && Number.isFinite(currentAge)) {
    // The fan is monthly starting at "now". Year offset = floor(monthIndex / 12).
    const yearsFromNow = Math.floor(crossingIndex / 12);
    expectedFireAge = Math.round(currentAge + yearsFromNow);
  }

  // 4. Derived numbers (only when inputs are present).
  const expectedAnnualPassiveIncome =
    expectedNetWorth != null && swrPct != null
      ? expectedNetWorth * (swrPct / 100)
      : null;
  const expectedMonthlyPassiveIncome =
    expectedAnnualPassiveIncome != null ? expectedAnnualPassiveIncome / 12 : null;

  const goalAchievementFraction =
    expectedNetWorth != null && fireNumber != null
      ? Math.min(1, expectedNetWorth / fireNumber)
      : null;

  const targetFireAge = goal?.targetFireAge ?? null;
  const yearsEarlyOrLate =
    expectedFireAge != null &&
    targetFireAge != null &&
    Number.isFinite(targetFireAge)
      ? (targetFireAge as number) - expectedFireAge
      : null;

  const gapRemaining =
    expectedNetWorth != null && fireNumber != null
      ? Math.max(0, fireNumber - expectedNetWorth)
      : null;

  // 5. Status — derived from the deterministic numbers above, no thresholds
  //    invented beyond crossing existence and target comparison.
  const status: PathCompletionStatus = classify({
    crossingIndex,
    expectedNetWorth,
    fireNumber,
    yearsEarlyOrLate,
  });

  // 6. Why-bullets (plain English, no fabricated probability).
  const why: string[] = buildWhy({
    status,
    crossingIndex,
    fireNumber,
    expectedNetWorth,
    targetFireAge,
    expectedFireAge,
    swrPct,
  });

  return {
    status,
    expectedFireAge,
    targetFireAge,
    expectedNetWorth,
    expectedNetWorthRange,
    expectedAnnualPassiveIncome,
    expectedMonthlyPassiveIncome,
    goalAchievementFraction,
    yearsEarlyOrLate,
    gapRemaining,
    why,
    audit: {
      fanPointsConsidered: fan.length,
      fireNumberSource: fireNumber != null ? "user_target" : fire == null ? "missing" : "empty",
      swrPctUsed: swrPct,
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function numberOrNull(x: number | null | undefined): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

interface ClassifyArgs {
  crossingIndex: number;
  expectedNetWorth: number | null;
  fireNumber: number | null;
  yearsEarlyOrLate: number | null;
}

function classify(a: ClassifyArgs): PathCompletionStatus {
  // Missing core inputs → NOT_MODELLED.
  if (a.fireNumber == null || a.expectedNetWorth == null) return "NOT_MODELLED";

  // NW never reached the FIRE number across the horizon.
  if (a.crossingIndex < 0 && a.expectedNetWorth < a.fireNumber) return "GAP_REMAINING";

  // NW eventually meets/exceeds FIRE.
  // If we couldn't compute the timing comparison (e.g. currentAge missing),
  // assume on-track (NW meets goal; no negative signal).
  if (a.yearsEarlyOrLate == null) return "ON_TRACK";

  // yearsEarlyOrLate = targetAge − expectedAge. >= 0 → at or ahead of target.
  return a.yearsEarlyOrLate >= 0 ? "ON_TRACK" : "ON_TARGET_LATE";
}

interface WhyArgs {
  status: PathCompletionStatus;
  crossingIndex: number;
  fireNumber: number | null;
  expectedNetWorth: number | null;
  targetFireAge: number | null;
  expectedFireAge: number | null;
  swrPct: number | null;
}

function buildWhy(a: WhyArgs): string[] {
  const out: string[] = [];
  if (a.status === "NOT_MODELLED") {
    out.push("The engine has not produced a forecast for this path yet.");
    return out;
  }
  if (a.fireNumber != null && a.expectedNetWorth != null) {
    out.push(
      `Projected median net worth at the end of the horizon is $${fmt(a.expectedNetWorth)} against a FIRE number of $${fmt(a.fireNumber)}.`,
    );
  }
  if (a.crossingIndex >= 0) {
    const years = Math.floor(a.crossingIndex / 12);
    out.push(`The median net-worth trajectory first reaches the FIRE number around ${years} years from today.`);
  } else if (a.status === "GAP_REMAINING") {
    out.push("The median trajectory does not reach the FIRE number within the planning horizon.");
  }
  if (a.targetFireAge != null && a.expectedFireAge != null) {
    const diff = a.targetFireAge - a.expectedFireAge;
    if (diff > 0) out.push(`Projected to reach FIRE roughly ${diff} year${diff === 1 ? "" : "s"} earlier than the target age of ${a.targetFireAge}.`);
    else if (diff < 0) out.push(`Projected to reach FIRE roughly ${Math.abs(diff)} year${Math.abs(diff) === 1 ? "" : "s"} later than the target age of ${a.targetFireAge}.`);
    else out.push(`Projected to reach FIRE right at the target age of ${a.targetFireAge}.`);
  }
  if (a.swrPct == null) {
    out.push("Passive income is not derived because no safe withdrawal rate is set on the goal.");
  }
  return out;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-AU");
}
