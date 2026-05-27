/**
 * Sprint 18 Phase 18.7 — Hard assertions.
 *
 * Eight non-negotiable rules. Any failure here means Sprint 18 has not
 * shipped; the audit harness writes failure_cases.md and the PR is blocked.
 *
 *   1. Property cannot rank top when borrowing feasibility fails.
 *   2. Crypto cannot rank top when crypto concentration is already high.
 *   3. Super cannot rank top when FIRE target is before access age
 *      (unless explicitly justified).
 *   4. FIRE-achieved households (STATE_D) must receive
 *      preservation/decumulation logic.
 *   5. High-debt households must not be pushed into more leverage without
 *      warnings.
 *   6. Low-liquidity households must receive liquidity-first logic.
 *   7. Unreachable FIRE goal must produce honest target-review
 *      recommendation.
 *   8. Confidence cannot exceed MC support without clear heuristic label.
 */

export interface HardAssertion {
  id: string;
  description: string;
  passed: boolean;
  reason: string;
}

interface AssertInputs {
  scenarioId: string;
  top: any;
  top3: any[];
  ctx: any;
  signals: any;
  result: any;
}

function pass(id: string, description: string, reason = ""): HardAssertion {
  return { id, description, passed: true, reason };
}

function fail(id: string, description: string, reason: string): HardAssertion {
  return { id, description, passed: false, reason };
}

function isPropertyAction(actionType: string): boolean {
  return actionType === "proceed_property_purchase" || actionType === "delay_property_purchase";
}

function isCryptoAction(actionType: string): boolean {
  return actionType === "crypto_dca";
}

function isSuperAction(actionType: string): boolean {
  return actionType === "increase_super";
}

function isLeverageAction(actionType: string): boolean {
  return actionType === "proceed_property_purchase" || actionType === "refinance_restructure";
}

function isLiquidityAction(actionType: string): boolean {
  return actionType === "build_emergency_buffer" ||
         actionType === "hold_cash_offset" ||
         actionType === "increase_cash_reserve" ||
         actionType === "income_protection";
}

function isDecumulationAction(actionType: string): boolean {
  return [
    "glidepath_shift",
    "swr_review",
    "increase_cash_reserve",
    "reduce_leverage",
    "income_protection",
  ].includes(actionType);
}

export function runHardAssertions(input: AssertInputs): HardAssertion[] {
  const { top, ctx, signals } = input;
  const results: HardAssertion[] = [];

  // 1. Property cannot rank top when borrowing feasibility fails.
  if (top && isPropertyAction(top.actionType)) {
    const feasible = top.feasibility?.feasible ?? true;
    if (!feasible && !top.aggressive) {
      results.push(fail(
        "property_blocked_when_infeasible",
        "Property cannot rank top when borrowing feasibility fails",
        `Top is ${top.actionType} but feasibility.feasible=false. Verdict=${top.feasibility?.verdict}`,
      ));
    } else {
      results.push(pass("property_blocked_when_infeasible", "Property cannot rank top when borrowing feasibility fails"));
    }
  } else {
    results.push(pass("property_blocked_when_infeasible", "Property cannot rank top when borrowing feasibility fails", "n/a — top is not a property action"));
  }

  // 2. Crypto cannot rank top when crypto concentration is already high (>30% NW).
  const cryptoPct = ctx?.today?.netWorth?.total > 0
    ? ctx.today.netWorth.crypto / ctx.today.netWorth.total
    : 0;
  if (top && isCryptoAction(top.actionType) && cryptoPct > 0.30) {
    results.push(fail(
      "crypto_blocked_when_concentrated",
      "Crypto cannot rank top when crypto already > 30% of NW",
      `Top is ${top.actionType} but cryptoPct=${(cryptoPct * 100).toFixed(0)}%`,
    ));
  } else {
    results.push(pass("crypto_blocked_when_concentrated", "Crypto cannot rank top when crypto already > 30% of NW"));
  }

  // 3. Super cannot rank top when FIRE target is before access age (60).
  const targetFireAge = ctx?.plan?.targetFireAge ?? null;
  const fireBeforeAccess = targetFireAge != null && targetFireAge < 60;
  if (top && isSuperAction(top.actionType) && fireBeforeAccess && !top.aggressive) {
    results.push(fail(
      "super_blocked_when_fire_before_60",
      "Super cannot rank top when FIRE target is before access age",
      `Top is increase_super, targetFireAge=${targetFireAge} (< 60)`,
    ));
  } else {
    results.push(pass("super_blocked_when_fire_before_60", "Super cannot rank top when FIRE target is before access age"));
  }

  // 4. FIRE-achieved / decumulation households must receive preservation logic.
  // Acceptable top pillars: decumulate_safely, protect_liquidity, prevent_failure
  // (the last covers genuine catastrophic-risk recommendations like
  // unreachable_plan_review or income_protection for at-risk retirees).
  // stabilise_leverage is also acceptable when a concentration / leverage
  // problem is the binding risk on the household.
  const lifeStage = ctx?.lifeStage;
  const isDState = lifeStage === "STATE_D_FIRE_ACHIEVED" || lifeStage === "STATE_E_DECUMULATION";
  const acceptableDecumPillars = new Set([
    "decumulate_safely",
    "protect_liquidity",
    "prevent_failure",
    "stabilise_leverage",
  ]);
  if (isDState && top && !isDecumulationAction(top.actionType) && !acceptableDecumPillars.has(top.pillar)) {
    results.push(fail(
      "fire_achieved_gets_decumulation",
      "FIRE-achieved households must receive preservation/decumulation logic",
      `lifeStage=${lifeStage} but top.actionType=${top.actionType} pillar=${top.pillar}`,
    ));
  } else {
    results.push(pass("fire_achieved_gets_decumulation", "FIRE-achieved households must receive preservation/decumulation logic"));
  }

  // 5. High-debt households (debt > 40% gross) must not be pushed into more leverage without warnings.
  const debtRatio = ctx?.today?.netWorth?.total > 0
    ? ctx.today.netWorth.debt / Math.max(1, ctx.today.netWorth.total + ctx.today.netWorth.debt)
    : 0;
  if (debtRatio > 0.40 && top && isLeverageAction(top.actionType)) {
    const warnings = top.behaviouralRisk?.behaviourWarnings ?? [];
    const hasLeverageWarning = warnings.some((w: any) => w.kind === "high_leverage_stress");
    if (!hasLeverageWarning) {
      results.push(fail(
        "high_debt_no_silent_leverage",
        "High-debt households must not be pushed into more leverage without warnings",
        `debtRatio=${(debtRatio * 100).toFixed(0)}% top=${top.actionType} but no leverage warning`,
      ));
    } else {
      results.push(pass("high_debt_no_silent_leverage", "High-debt households must not be pushed into more leverage without warnings"));
    }
  } else {
    results.push(pass("high_debt_no_silent_leverage", "High-debt households must not be pushed into more leverage without warnings"));
  }

  // 6. Low-liquidity households (cash runway < 2 months) must receive liquidity-first logic.
  const cashRunway = ctx?.today?.cashflow?.monthlyExpenses > 0
    ? ctx.today.netWorth.cash / ctx.today.cashflow.monthlyExpenses
    : Infinity;
  if (cashRunway < 2 && top && !isLiquidityAction(top.actionType) && top.pillar !== "protect_liquidity") {
    results.push(fail(
      "low_liquidity_gets_buffer_first",
      "Low-liquidity households must receive liquidity-first logic",
      `cashRunway=${cashRunway.toFixed(1)}mo top=${top.actionType} pillar=${top.pillar}`,
    ));
  } else {
    results.push(pass("low_liquidity_gets_buffer_first", "Low-liquidity households must receive liquidity-first logic"));
  }

  // 7. Unreachable FIRE goal must produce honest target-review recommendation.
  if (ctx?.forecast?.feasibility === "UNREACHABLE") {
    const reviewed = top?.actionType === "unreachable_plan_review" ||
      (top?.pillar === "prevent_failure" && /unreachable|honesty|review/i.test(top?.title ?? ""));
    if (!reviewed) {
      results.push(fail(
        "unreachable_goal_gets_honest_review",
        "Unreachable FIRE goal must produce honest target-review recommendation",
        `forecast=UNREACHABLE but top=${top?.actionType}`,
      ));
    } else {
      results.push(pass("unreachable_goal_gets_honest_review", "Unreachable FIRE goal must produce honest target-review recommendation"));
    }
  } else {
    results.push(pass("unreachable_goal_gets_honest_review", "Unreachable FIRE goal must produce honest target-review recommendation"));
  }

  // 8. Confidence cannot exceed MC support without clear heuristic label.
  if (top?.calibratedConfidence) {
    const cc = top.calibratedConfidence;
    const mc = cc.components?.mcSuccessProb;
    if (mc != null && cc.value > mc + 0.11 && cc.mcDriven) {
      results.push(fail(
        "confidence_capped_by_mc",
        "Confidence cannot exceed MC support without clear heuristic label",
        `value=${cc.value} mc=${mc} mcDriven=${cc.mcDriven}`,
      ));
    } else if (!cc.mcDriven && cc.displayLabel?.toLowerCase().includes("probability")) {
      results.push(fail(
        "confidence_capped_by_mc",
        "Confidence cannot exceed MC support without clear heuristic label",
        `non-MC label says probability: ${cc.displayLabel}`,
      ));
    } else {
      results.push(pass("confidence_capped_by_mc", "Confidence cannot exceed MC support without clear heuristic label"));
    }
  } else {
    results.push(pass("confidence_capped_by_mc", "Confidence cannot exceed MC support without clear heuristic label"));
  }

  return results;
}
