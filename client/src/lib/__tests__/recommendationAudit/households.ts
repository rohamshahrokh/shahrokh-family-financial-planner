/**
 * Sprint 17 Phase 17.8 — Audit households loader.
 *
 * Loads the 20 scenarios (14 verbatim from Sprint 16 + 6 new) and
 * normalises them into the engine-ready shape for the harness.
 *
 * Scenarios live as JSON files in ./scenarios/. The 14 Sprint 16 files are
 * IDENTICAL to /home/user/workspace/sprint16_scenarios/ — Sprint 17 must
 * produce directly-comparable grades.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface HouseholdScenario {
  meta: {
    id: string;
    profile: string;
    age: number;
    household: string;
    net_worth_aud: number;
    annual_income_aud: number;
    key_features: string[];
  };
  signals: Record<string, any>;
  goal: { swrPct: number; targetMonthlyIncome: number; fireAge: number };
}

export function loadAllHouseholds(): HouseholdScenario[] {
  const dir = join(__dirname, "scenarios");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const out: HouseholdScenario[] = [];
  for (const f of files) {
    try {
      const text = readFileSync(join(dir, f), "utf8");
      const parsed = JSON.parse(text) as HouseholdScenario;
      out.push(parsed);
    } catch (e) {
      console.error(`Skipping ${f}:`, e);
    }
  }
  return out;
}

/** Convert a scenario goal into a CanonicalGoal-like object. */
export function goalFromScenario(g: HouseholdScenario["goal"]): any {
  return {
    status: "SET",
    targetFireAge: g.fireAge,
    targetPassiveMonthly: g.targetMonthlyIncome,
    swrPct: g.swrPct > 1 ? g.swrPct / 100 : g.swrPct,
    targetPassiveAnnual: g.targetMonthlyIncome * 12,
    targetNetWorth: (g.targetMonthlyIncome * 12) / (g.swrPct > 1 ? g.swrPct / 100 : g.swrPct),
    goalSetTimestamp: "2026-01-01T00:00:00Z",
    source: "mc_fire_settings",
  };
}

/** Synthetic CanonicalLedger from scenario signals. */
export function ledgerFromScenario(s: HouseholdScenario): any {
  const sig = s.signals;
  return {
    snapshot: {
      cash: sig.cashOutsideOffset ?? 0,
      offset_balance: sig.offsetBalance ?? 0,
      mortgage: sig.mortgage ?? 0,
      other_debts: sig.otherDebts ?? 0,
      ppor: sig.ppor ?? 0,
      monthly_income: sig.monthlyIncome ?? 0,
      monthly_expenses: sig.monthlyExpenses ?? 0,
      roham_gross_annual: sig.rohamGrossAnnual ?? sig.monthlyIncome * 12,
      current_age: s.meta.age,
      num_dependents: /dependent|family/i.test(s.meta.profile) ? 2 : 0,
      retired: sig.lifeStage === "STATE_E_DECUMULATION",
      roham_super_balance: sig.rohamSuperBalance ?? 0,
      fara_super_balance: sig.faraSuperBalance ?? 0,
    },
    properties: sig.ppor && sig.mortgage
      ? [{ current_value: sig.ppor, mortgage_balance: sig.mortgage }]
      : undefined,
    stocks: undefined,
    cryptos: undefined,
    holdingsRaw: undefined,
    incomeRecords: undefined,
    expenses: undefined,
  };
}
