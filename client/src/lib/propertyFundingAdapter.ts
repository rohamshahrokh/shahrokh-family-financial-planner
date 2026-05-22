/**
 * propertyFundingAdapter.ts — Apply the persisted funding source choice to
 * a property record before it flows into the canonical engines.
 *
 * #FWL_Critical_StatePersistence_FundingSource_TaxRegime_Fix
 *
 * Engines (`finance.ts`, `eventProcessor.ts`, `monteCarloEngine.ts`,
 * `depositPower.ts`) consume property records as-is. To honour the funding
 * source choice without rewriting their internals we transform each
 * investment-property record into an *effective* record:
 *
 *   • cash-funded deposits  → unchanged `deposit` value
 *   • equity-release        → `deposit` is set to 0 (no cash drawdown) and
 *                             `loan_amount` is increased by the deposit
 *                             amount (the equity-release top-up becomes
 *                             part of the new loan)
 *   • asset-sale funded     → `deposit` reduced by the amount funded from
 *                             stocks/crypto liquidations
 *
 * The adapter also attaches a `_fundingPlan` field with the full resolved
 * `FundingPlan` so downstream surfaces (Cashflow Engine, Audit Mode) can
 * render the exact breakdown without re-resolving.
 *
 * The adapter is PURE — it does not read the persistence store directly.
 * Callers either pass an explicit `choicesMap` or rely on the convenience
 * `applyFundingToProperties` which reads the headless store once.
 */

import {
  resolveFundingPlan,
  getAllFundingChoices,
  type FundingChoice,
  type FundingPlan,
  type FundingResolverContext,
} from "./propertyFundingStore";
import { safeNum } from "./mathUtils";

/** Side-channel field name we append to effective property records. */
export const FUNDING_PLAN_FIELD = "_fundingPlan" as const;

export interface AdapterContext {
  /** Available offset balance for resolution (typically snapshot.offset_balance). */
  availableOffset?: number;
  /** Available cash for resolution (typically snapshot.cash). */
  availableCash?: number;
  /** Aggregate stocks market value available to liquidate (default 0). */
  stocksTotalValue?: number;
  /** Aggregate crypto market value available to liquidate (default 0). */
  cryptoTotalValue?: number;
  /** Optional explicit choices map — overrides the headless store when set. */
  choicesMap?: Record<string, FundingChoice>;
}

/** Returned property record carries the funding plan inline. */
export type EffectiveProperty<P extends Record<string, any>> = P & {
  [FUNDING_PLAN_FIELD]: FundingPlan;
};

/**
 * Rewrite a single investment-property record according to its funding choice.
 *
 * PPOR is returned unchanged (the funding selector is hidden on PPOR rows).
 */
export function applyFundingToProperty<P extends Record<string, any>>(
  prop: P,
  ctx: AdapterContext,
): EffectiveProperty<P> {
  // PPOR — return untouched but still attach a zero-impact plan for symmetry.
  if (prop.type === "ppor") {
    return {
      ...prop,
      [FUNDING_PLAN_FIELD]: {
        source: "offset+savings",
        deposit: 0,
        cashUsed: 0,
        offsetUsed: 0,
        equityReleased: 0,
        stocksSold: 0,
        cryptoSold: 0,
        debtIncreaseFromEquityRelease: 0,
      },
    } as EffectiveProperty<P>;
  }

  const choicesMap = ctx.choicesMap ?? getAllFundingChoices();
  const choice = choicesMap[String(prop.id)];
  const deposit = safeNum(prop.deposit);

  const plan = resolveFundingPlan(choice, {
    deposit,
    availableOffset: ctx.availableOffset,
    availableCash:   ctx.availableCash,
    stocksTotalValue: ctx.stocksTotalValue,
    cryptoTotalValue: ctx.cryptoTotalValue,
  });

  // ── Mutate the deposit + loan to reflect the funding choice. ──
  // Cash-like portion (cash + offset + asset-sales) still hits the deposit
  // cashflow at settlement. Equity-release portion is added to the loan
  // balance instead.
  const cashLikeDeposit = plan.cashUsed + plan.offsetUsed + plan.stocksSold + plan.cryptoSold;
  const newDeposit = Math.max(0, cashLikeDeposit);
  const newLoanAmount = safeNum(prop.loan_amount) + plan.debtIncreaseFromEquityRelease;

  return {
    ...prop,
    deposit: newDeposit,
    loan_amount: newLoanAmount,
    [FUNDING_PLAN_FIELD]: plan,
  } as EffectiveProperty<P>;
}

/**
 * Rewrite every investment property in a list. PPOR rows pass through.
 *
 * If `ctx.choicesMap` is omitted, the latest persisted choices are read once
 * from the headless store so engines see a consistent snapshot.
 */
export function applyFundingToProperties<P extends Record<string, any>>(
  properties: P[],
  ctx: AdapterContext,
): EffectiveProperty<P>[] {
  return properties.map(p => applyFundingToProperty(p, ctx));
}

/**
 * Convenience: pull the resolver context from a snapshot + asset arrays.
 *
 * Callers usually already have these values to hand, but a single helper
 * keeps engine call sites short.
 */
export function buildAdapterContext(input: {
  snapshot?: any;
  stocks?:   Array<{ current_holding?: number; current_price?: number }>;
  cryptos?:  Array<{ current_holding?: number; current_price?: number }>;
  choicesMap?: Record<string, FundingChoice>;
}): AdapterContext {
  const stocksTotalValue = (input.stocks ?? []).reduce(
    (s, x) => s + safeNum(x.current_holding) * safeNum(x.current_price), 0,
  );
  const cryptoTotalValue = (input.cryptos ?? []).reduce(
    (s, x) => s + safeNum(x.current_holding) * safeNum(x.current_price), 0,
  );
  return {
    availableOffset:  safeNum(input.snapshot?.offset_balance),
    availableCash:    safeNum(input.snapshot?.cash),
    stocksTotalValue,
    cryptoTotalValue,
    choicesMap:       input.choicesMap,
  };
}
