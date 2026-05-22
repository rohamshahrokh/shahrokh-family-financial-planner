/**
 * propertyFundingStore.ts — Canonical, persistent per-property funding source.
 *
 * #FWL_Critical_StatePersistence_FundingSource_TaxRegime_Fix
 *
 * Why this file exists
 * --------------------
 * The Property page used to keep "funding source per investment property" in a
 * local `useState<Record<id, string>>`. That meant:
 *   • Selection vanished on navigation.
 *   • Forecast / Monte Carlo / Cashflow / Deposit-Power / Emergency-Buffer
 *     engines never saw it — every IP deposit silently came from cash.
 *   • Equity Release was cosmetic: it never increased debt, it never preserved
 *     cash, and Monte Carlo therefore reported 100% cash-shortfall.
 *
 * This module is a tiny headless store (Zustand + persist) keyed by property
 * id, plus a `resolveFundingPlan` helper that converts a user's choice into a
 * concrete breakdown of cash / offset / equity-release / asset-sale dollars.
 *
 * Persistence
 * -----------
 * State persists to localStorage under key `fwl.propertyFunding`. Reload
 * restores the user's choice exactly — there is no silent default override.
 * If a property has no entry the engines fall back to the legacy "offset +
 * savings" behaviour (i.e. cash funds the deposit, which is what the engines
 * did before this change).
 *
 * Headless
 * --------
 * Engines (`finance.ts`, `eventProcessor.ts`, `monteCarloEngine.ts`,
 * `depositPower.ts`) read the active funding plan directly via
 * `getPropertyFundingPlan(propertyId)` so this module has no React coupling
 * and can be used by non-React callers (PDF export, audit scripts).
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeNum } from "./mathUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Funding source key matches the UI option keys on the Property page. */
export type FundingSourceKey =
  | "offset"
  | "savings"
  | "offset+savings"
  | "sell-stocks"
  | "sell-crypto"
  | "equity-release"
  | "combination";

/** Stored per-property funding choice. */
export interface FundingChoice {
  source: FundingSourceKey;
  /** For sell-stocks / sell-crypto: percent of holding to liquidate. */
  sellPct?: number;
  /**
   * For "combination": optional weights (0-1 each). Engines normalise.
   * Unset entries default to 0.
   */
  weights?: {
    offset?:   number;
    savings?:  number;
    stocks?:   number;
    crypto?:   number;
    equity?:   number;
  };
  /** ISO timestamp of last edit — purely informational, used in audit traces. */
  updatedAt: string;
}

/**
 * Resolved breakdown of an actual deposit into its funding parts in dollars.
 * Engines apply this at the property's settlement month.
 */
export interface FundingPlan {
  /** Origin source key, kept so audit traces can show the user's pick. */
  source: FundingSourceKey;
  /** Total deposit in dollars (mirrors prop.deposit). */
  deposit: number;
  /** Cash drawn from non-offset cash buckets. */
  cashUsed: number;
  /** Cash drawn from the offset account. */
  offsetUsed: number;
  /** Dollars raised via PPOR/IP equity release. Adds to debt — NOT to cash out. */
  equityReleased: number;
  /** Dollars realised from stock sales (treated as a liquidation cashflow). */
  stocksSold: number;
  /** Dollars realised from crypto sales. */
  cryptoSold: number;
  /**
   * Extra loan balance that should be ADDED to investment loans at the
   * settlement month to reflect the equity release. Mirrors `equityReleased`
   * unless we wanted to bake in fees later — keeping it as a discrete field
   * makes the audit trace easy.
   */
  debtIncreaseFromEquityRelease: number;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface FundingStoreState {
  /** propertyId → FundingChoice (id is whatever `prop.id` is, stringified). */
  choices: Record<string, FundingChoice>;
  setChoice: (propertyId: string | number, choice: Partial<FundingChoice> & { source: FundingSourceKey }) => void;
  clearChoice: (propertyId: string | number) => void;
  /** Replace the entire map — used by tests/migrations. */
  hydrate: (next: Record<string, FundingChoice>) => void;
}

export const usePropertyFundingStore = create<FundingStoreState>()(
  persist(
    (set) => ({
      choices: {},

      setChoice: (propertyId, choice) =>
        set((state) => {
          const id = String(propertyId);
          const prev = state.choices[id];
          return {
            choices: {
              ...state.choices,
              [id]: {
                source:    choice.source,
                sellPct:   choice.sellPct   ?? prev?.sellPct,
                weights:   choice.weights   ?? prev?.weights,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      clearChoice: (propertyId) =>
        set((state) => {
          const id = String(propertyId);
          if (!(id in state.choices)) return state;
          const next = { ...state.choices };
          delete next[id];
          return { choices: next };
        }),

      hydrate: (next) => set({ choices: { ...next } }),
    }),
    {
      name: "fwl.propertyFunding",
      storage: createJSONStorage(() => localStorage),
      // Persist only the choices map — methods are reconstructed by Zustand.
      partialize: (state) => ({ choices: state.choices }),
      version: 1,
    },
  ),
);

// ─── Headless accessors ──────────────────────────────────────────────────────
//
// Non-React callers (engines, audit) must NOT use the React hook. They read
// the underlying store directly via `getState()` so there's no subscription
// cost and the value is always the latest persisted choice.

/** Read the current funding choice for a property, or undefined if unset. */
export function getPropertyFundingChoice(
  propertyId: string | number,
): FundingChoice | undefined {
  const id = String(propertyId);
  return usePropertyFundingStore.getState().choices[id];
}

/** Read the entire choices map — used by audit traces and tests. */
export function getAllFundingChoices(): Record<string, FundingChoice> {
  return usePropertyFundingStore.getState().choices;
}

// ─── Resolver ────────────────────────────────────────────────────────────────

/** Property/asset context required to compute a concrete funding plan. */
export interface FundingResolverContext {
  /** Total deposit dollars (mirrors prop.deposit). */
  deposit: number;
  /** Available offset balance at the time of settlement. */
  availableOffset?: number;
  /** Available non-offset cash at the time of settlement. */
  availableCash?: number;
  /** Aggregate stocks market value available to liquidate. */
  stocksTotalValue?: number;
  /** Aggregate crypto market value available to liquidate. */
  cryptoTotalValue?: number;
}

/**
 * Compute a concrete funding breakdown from a user's choice + context.
 *
 * The resolver is intentionally conservative:
 *   • Equity Release ⇒ entire deposit comes from a new loan top-up. Cash and
 *     offset are NOT touched. `debtIncreaseFromEquityRelease` mirrors the
 *     deposit so the loan ledger can add it on settlement.
 *   • Offset Only / Savings Only / Offset + Savings ⇒ cash bucket(s) consumed.
 *   • Sell Stocks % / Sell Crypto % ⇒ raise that % of the asset; any remainder
 *     falls back to cash (so we never under-fund the deposit).
 *   • Combination ⇒ normalise weights, allocate proportionally, then top up
 *     from cash if rounding leaves a residual.
 *
 * If `choice` is undefined the resolver returns the legacy behaviour: deposit
 * funded from offset+savings cash. This keeps existing properties stable for
 * users who never opened the new selector.
 */
export function resolveFundingPlan(
  choice: FundingChoice | undefined,
  ctx: FundingResolverContext,
): FundingPlan {
  const deposit = Math.max(0, safeNum(ctx.deposit));
  const offsetAvail = Math.max(0, safeNum(ctx.availableOffset));
  const cashAvail   = Math.max(0, safeNum(ctx.availableCash));
  const stocksAvail = Math.max(0, safeNum(ctx.stocksTotalValue));
  const cryptoAvail = Math.max(0, safeNum(ctx.cryptoTotalValue));

  const empty: FundingPlan = {
    source: choice?.source ?? "offset+savings",
    deposit,
    cashUsed: 0,
    offsetUsed: 0,
    equityReleased: 0,
    stocksSold: 0,
    cryptoSold: 0,
    debtIncreaseFromEquityRelease: 0,
  };

  if (deposit <= 0) return empty;

  switch (choice?.source ?? "offset+savings") {
    case "equity-release": {
      // CRITICAL: equity release does NOT consume cash. It increases debt.
      return {
        ...empty,
        source: "equity-release",
        equityReleased: deposit,
        debtIncreaseFromEquityRelease: deposit,
      };
    }

    case "offset": {
      const used = Math.min(offsetAvail || deposit, deposit);
      return {
        ...empty,
        source: "offset",
        offsetUsed: used,
        // Any shortfall still has to come from somewhere — fall through to
        // generic cash so the cashflow ledger doesn't silently lose money.
        cashUsed: Math.max(0, deposit - used),
      };
    }

    case "savings": {
      const used = Math.min(cashAvail || deposit, deposit);
      return {
        ...empty,
        source: "savings",
        cashUsed: used,
        offsetUsed: Math.max(0, deposit - used),
      };
    }

    case "offset+savings": {
      // Split: prefer offset first (free interest), then savings.
      const offsetUsed = Math.min(offsetAvail, deposit);
      const cashUsed   = Math.max(0, deposit - offsetUsed);
      return {
        ...empty,
        source: "offset+savings",
        offsetUsed,
        cashUsed,
      };
    }

    case "sell-stocks": {
      const pct = clamp01((choice?.sellPct ?? 100) / 100);
      const raised = Math.min(stocksAvail * pct, deposit);
      const residual = Math.max(0, deposit - raised);
      // Residual splits across offset / savings same as offset+savings.
      const offsetUsed = Math.min(offsetAvail, residual);
      const cashUsed   = Math.max(0, residual - offsetUsed);
      return {
        ...empty,
        source: "sell-stocks",
        stocksSold: raised,
        offsetUsed,
        cashUsed,
      };
    }

    case "sell-crypto": {
      const pct = clamp01((choice?.sellPct ?? 100) / 100);
      const raised = Math.min(cryptoAvail * pct, deposit);
      const residual = Math.max(0, deposit - raised);
      const offsetUsed = Math.min(offsetAvail, residual);
      const cashUsed   = Math.max(0, residual - offsetUsed);
      return {
        ...empty,
        source: "sell-crypto",
        cryptoSold: raised,
        offsetUsed,
        cashUsed,
      };
    }

    case "combination": {
      const w = choice?.weights ?? {};
      const wOffset = Math.max(0, w.offset  ?? 0);
      const wSav    = Math.max(0, w.savings ?? 0);
      const wStocks = Math.max(0, w.stocks  ?? 0);
      const wCrypto = Math.max(0, w.crypto  ?? 0);
      const wEquity = Math.max(0, w.equity  ?? 0);
      const total = wOffset + wSav + wStocks + wCrypto + wEquity;

      // No weights provided ⇒ behave like offset+savings.
      if (total <= 0) {
        return resolveFundingPlan(
          { ...choice, source: "offset+savings" } as FundingChoice,
          ctx,
        );
      }

      const offsetUsed = Math.min(deposit * (wOffset / total), offsetAvail);
      const savings    = Math.min(deposit * (wSav    / total), cashAvail);
      const stocks     = Math.min(deposit * (wStocks / total), stocksAvail);
      const crypto     = Math.min(deposit * (wCrypto / total), cryptoAvail);
      const equity     = deposit * (wEquity / total); // equity has no ceiling here
      const used = offsetUsed + savings + stocks + crypto + equity;
      const residualCash = Math.max(0, deposit - used);

      return {
        ...empty,
        source: "combination",
        offsetUsed,
        cashUsed: savings + residualCash,
        stocksSold: stocks,
        cryptoSold: crypto,
        equityReleased: equity,
        debtIncreaseFromEquityRelease: equity,
      };
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Plain-English label used by audit traces and the page selector. */
export const FUNDING_SOURCE_LABEL: Record<FundingSourceKey, string> = {
  "offset":         "Offset Only",
  "savings":        "Savings Only",
  "offset+savings": "Offset + Savings",
  "sell-stocks":    "Sell Stocks %",
  "sell-crypto":    "Sell Crypto %",
  "equity-release": "Equity Release",
  "combination":    "Combination",
};

/** Localstorage key — exported for tests. */
export const FUNDING_LS_KEY = "fwl.propertyFunding";
