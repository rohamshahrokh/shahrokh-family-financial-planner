/**
 * useCanonicalMoveRanking.ts — Sprint 20 PR-F2 hook.
 *
 * React hook that surfaces the canonical move-ranking output to surfaces
 * that need it (Action Centre, Decision Lab, Wealth Strategy).
 *
 * Flow:
 *   1. Read the canonical FIRE goal via `useFireGoal()` (PRIMARY input).
 *   2. Read the household snapshot via `useFireSettingsRow()` + the
 *      properties / cash / income endpoints.
 *   3. Classify properties (PPOR vs investment, settled vs planned).
 *   4. Build the `MoveRankingHousehold` shape and call `rankMoves(...)`.
 *
 * Returns the ranked move list, the household snapshot, and the canonical
 * FIRE goal so consumers can render a minimal audit-mode panel without
 * recomputing inputs.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useFireGoal, useFireSettingsRow } from "@/lib/fireGoalCanonical";
import {
  classifyProperties,
  propertyLeverage,
} from "@/lib/property";
import {
  rankMoves,
  type MoveRankingHousehold,
} from "@/lib/recommendationEngine/rankMove";
import type { CanonicalFireTarget } from "@/types/canonicalFire";
import type { MoveDefinition, RankedMove } from "@/types/canonicalMove";

export interface CanonicalMoveRankingResult {
  isLoading: boolean;
  fire: CanonicalFireTarget | null;
  household: MoveRankingHousehold | null;
  ranked: RankedMove[];
}

/** Default move set used when the caller doesn't pass an explicit one. */
function defaultMoveSet(household: MoveRankingHousehold): MoveDefinition[] {
  const moves: MoveDefinition[] = [];
  const settledIp = household.properties.find(
    p => p.kind === "investment" && p.lifecycle === "settled",
  );
  const ppor = household.properties.find(p => p.kind === "ppor");

  if (settledIp) {
    moves.push({
      moveId: "sell_investment_property",
      params: {
        property: settledIp,
        marginalTaxRate: household.marginalTaxRate,
        cgtDiscountEligible: true, // settled and modelled; held >12mo assumed
      },
    });
  }

  if (ppor) {
    moves.push({
      moveId: "refinance_ppor",
      params: {
        property: ppor,
        // Conservative target: 50 bps below current rate.
        newInterestRate: Math.max(0, ppor.interestRate - 0.005),
        refinanceCosts: 1_500,
      },
    });
    moves.push({
      moveId: "debt_recycling",
      params: {
        redrawAmount: Math.min(100_000, ppor.equity * 0.25),
        pporProperty: ppor,
        marginalTaxRate: household.marginalTaxRate,
        expectedReturnAnnual: 0.085,
      },
    });
  }

  moves.push({
    moveId: "extra_super_contribution",
    params: {
      extraMonthly: 500,
      marginalTaxRate: household.marginalTaxRate,
      yearsToPreservation: 18,
    },
  });

  moves.push({
    moveId: "extra_etf_dca",
    params: { extraMonthly: 500, expectedReturnAnnual: 0.085 },
  });

  return moves;
}

export function useCanonicalMoveRanking(): CanonicalMoveRankingResult {
  const goal = useFireGoal();
  const settings = useFireSettingsRow();
  const { data: rawProperties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then(r => r.json()),
  });

  return useMemo(() => {
    if (goal.isLoading || settings.isLoading) {
      return { isLoading: true, fire: null, household: null, ranked: [] };
    }
    if (goal.status !== "SET") {
      return { isLoading: false, fire: null, household: null, ranked: [] };
    }
    const classified = classifyProperties(rawProperties);
    const pporVal = classified
      .filter(p => p.kind === "ppor" && p.lifecycle === "settled")
      .reduce((s, p) => s + p.currentValue, 0);
    const pporLoan = classified
      .filter(p => p.kind === "ppor" && p.lifecycle === "settled")
      .reduce((s, p) => s + p.loanBalance, 0);
    const ipVal = classified
      .filter(p => p.kind === "investment" && p.lifecycle === "settled")
      .reduce((s, p) => s + p.currentValue, 0);
    const ipLoan = classified
      .filter(p => p.kind === "investment" && p.lifecycle === "settled")
      .reduce((s, p) => s + p.loanBalance, 0);

    const norm = settings.normalized;
    const totalAssets = norm.startPpor + norm.startStocks + norm.startCrypto + norm.startSuper + norm.startCash + norm.startOffset;
    const totalDebt = norm.startMortgage + norm.startOtherDebts;
    const currentNetWorth = totalAssets - totalDebt;

    const fire: CanonicalFireTarget = {
      targetFireYear: goal.goal.targetFireYear,
      targetPassiveIncomeMonthly: goal.goal.targetMonthlyPassiveIncome,
      advanced: goal.goal.advanced,
    };

    const household: MoveRankingHousehold = {
      currentNetWorth,
      totalInvestmentPropertyValue: ipVal,
      totalInvestmentPropertyLoans: ipLoan,
      totalPpoRValue: pporVal,
      totalPpoRLoanBalance: pporLoan,
      monthlyIncome: norm.startMonthlyIncome,
      monthlyExpenses: norm.startMonthlyExpenses,
      liquidCash: norm.startCash + norm.startOffset,
      propertyLeverage: propertyLeverage(classified),
      debtToAssetRatio: totalAssets > 0 ? totalDebt / totalAssets : 0,
      properties: classified,
      marginalTaxRate: 0.37,
    };

    const ranked = rankMoves(fire, household, defaultMoveSet(household));
    return { isLoading: false, fire, household, ranked };
  }, [goal, settings.isLoading, settings.normalized, rawProperties]);
}
