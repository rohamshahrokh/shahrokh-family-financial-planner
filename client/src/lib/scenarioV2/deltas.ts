/**
 * Scenario Engine V2 — Delta Translators (Vertical Slice)
 *
 * Each delta is translated into one or more ScenarioEvents. Only 3 delta
 * types are wired in this slice — the rest live in Phase 6.
 *
 *   crypto_lump_sum          — move cash → crypto on activation month
 *   property_deposit_boost   — buy an IP using cash as additional deposit,
 *                              auto-deriving loan, repayment, holding costs
 *   cash_hold                — keep N dollars locked in cash (no investment)
 *
 * Open by design: unknown delta types pass through with a single
 * "noop" event so we never silently drop data.
 */

import type { ScenarioDelta, ScenarioEvent } from "./types";

export function translateDelta(d: ScenarioDelta): ScenarioEvent[] {
  switch (d.deltaType) {
    case "crypto_lump_sum":
      return translateCryptoLumpSum(d);
    case "property_deposit_boost":
      return translatePropertyDepositBoost(d);
    case "cash_hold":
      return translateCashHold(d);
    default:
      // Other 14 delta types are stubbed for Phase 6. Emit one noop event so
      // the timeline still records the intent.
      return [
        {
          id: `${d.id}/noop`,
          type: "expense.recurring",
          month: d.activationMonth,
          priority: 300,
          sourceDeltaId: d.id,
          payload: { kind: "delta_not_implemented", deltaType: d.deltaType },
        },
      ];
  }
}

// ─── crypto_lump_sum ────────────────────────────────────────────────────────
/**
 * Params:
 *   { amount: number }   AUD pulled from cash and deployed to crypto.
 *
 * Behavioural rules:
 *   - If `amount` > available cash at activation, tick clamps it (the
 *     event just records intent; clamping happens during tick because
 *     cash level is state-dependent).
 *   - Crypto grows thereafter at the volatile stochastic rail.
 */
function translateCryptoLumpSum(d: ScenarioDelta): ScenarioEvent[] {
  const amount = numParam(d.params, "amount", 0);
  return [
    {
      id: `${d.id}/buy`,
      type: "contribution.crypto_lump",
      month: d.activationMonth,
      priority: 600, // asset_move
      sourceDeltaId: d.id,
      payload: { amount },
    },
  ];
}

// ─── property_deposit_boost / buy_property ──────────────────────────────────
/**
 * Params:
 *   { extraDeposit: number,   // cash to put down (above any standard 20%)
 *     purchasePrice: number,  // optional; defaults to 5x extraDeposit
 *     weeklyRent: number,     // optional; defaults to 0.045 of price / 52
 *     rate: number,           // optional; defaults to base plan mortgage rate
 *     loanTermYears: number,  // optional; defaults to 30
 *     stampDutyPct: number,   // optional; defaults to ~5% (QLD reasonable)
 *     vacancyRate: number,    // optional; default 0.04
 *     managementFee: number,  // optional; default 0.08
 *     annualHoldingCosts: number, // optional; defaults to 1.2% of price
 *   }
 *
 * Auto-derivation: if only `extraDeposit` is given, we pick a sensible
 * Brisbane-grade IP profile so the user doesn't manually re-enter values.
 *
 * Emits ONE event of type `asset.buy_property` carrying the full property
 * record; the tick handler creates the PropertyState and reduces cash by
 * (deposit + stamp duty + fees).
 */
function translatePropertyDepositBoost(d: ScenarioDelta): ScenarioEvent[] {
  const extraDeposit = numParam(d.params, "extraDeposit", numParam(d.params, "amount", 0));
  const purchasePrice = numParam(d.params, "purchasePrice", extraDeposit * 5);
  // Standard LVR = 80%; with extraDeposit on top, loan = price * 0.8 − extraDeposit
  const baseLoan = Math.max(0, purchasePrice * 0.8 - extraDeposit);
  // Acquisition costs default ~7% of price (stamp duty + legals + LMI buffer)
  const stampDutyPct = numParam(d.params, "stampDutyPct", 0.05);
  const acqCosts = purchasePrice * stampDutyPct + 3000; // ~$3k legal + inspection
  const weeklyRent = numParam(
    d.params,
    "weeklyRent",
    Math.round((purchasePrice * 0.045) / 52),
  );
  const rate = numParam(d.params, "rate", 6.5) / 100;
  const term = numParam(d.params, "loanTermYears", 30);
  const vacancy = numParam(d.params, "vacancyRate", 0.04);
  const mgmt = numParam(d.params, "managementFee", 0.08);
  const annualHoldingCosts = numParam(
    d.params,
    "annualHoldingCosts",
    purchasePrice * 0.012,
  );

  return [
    {
      id: `${d.id}/buy`,
      type: "asset.buy_property",
      month: d.activationMonth,
      priority: 600,
      sourceDeltaId: d.id,
      payload: {
        marketValue: purchasePrice,
        cashOutflow: extraDeposit + acqCosts,
        loanBalance: baseLoan,
        rate,
        termYears: term,
        weeklyRent,
        vacancyRate: vacancy,
        managementFee: mgmt,
        annualHoldingCosts,
        extraDeposit,
        purchasePrice,
      },
    },
  ];
}

// ─── cash_hold ──────────────────────────────────────────────────────────────
/**
 * Params:
 *   { amount: number }   AUD that must remain in cash. The tick treats this
 *                        as a "no-op" — cash stays in `state.cash` and earns
 *                        the cash APR. We still emit an event so the
 *                        attribution layer can see the choice was made.
 */
function translateCashHold(d: ScenarioDelta): ScenarioEvent[] {
  const amount = numParam(d.params, "amount", 0);
  return [
    {
      id: `${d.id}/hold`,
      type: "asset.cash_hold",
      month: d.activationMonth,
      priority: 600,
      sourceDeltaId: d.id,
      payload: { amount },
    },
  ];
}

// ─── helpers ────────────────────────────────────────────────────────────────
function numParam(p: Record<string, unknown>, key: string, fallback: number): number {
  const v = p?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
