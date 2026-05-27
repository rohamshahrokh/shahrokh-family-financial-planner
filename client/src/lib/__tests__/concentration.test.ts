/**
 * Sprint 17 Phase 17.5 — Concentration Detector tests.
 *
 * Run: npx tsx client/src/lib/__tests__/concentration.test.ts
 */

import { detectConcentration } from "../concentration/detector";
import { buildRebalanceConcentration } from "../recommendationEngine/rules/rebalanceConcentration";
import { buildRecommendationContext } from "../recommendationContext/buildContext";

function assert(cond: any, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1; }
  else { console.log(`ok  - ${msg}`); }
}

// Scenario 07-style: crypto-heavy household
{
  const inputs = {
    snapshot: {
      cash: 5_000,
      monthly_income: 8_000,
      monthly_expenses: 4_000,
      current_age: 32,
    },
    properties: undefined,
    stocks: undefined,
    cryptos: [{ current_value: 350_000 }],
    holdingsRaw: [
      { asset_type: "crypto", current_value: 350_000 },
      { asset_type: "etf", current_value: 50_000 },
    ],
    incomeRecords: undefined,
    expenses: undefined,
  };
  const ctx = buildRecommendationContext(inputs as any, null);
  const flags = detectConcentration(ctx);
  const cryptoFlag = flags.find((f) => f.kind === "crypto_over_30");
  assert(cryptoFlag != null, "crypto > 30% flagged");
  assert(cryptoFlag!.severity === "critical" || cryptoFlag!.observedPct > 50, "critical crypto");
  const rec = buildRebalanceConcentration({ concentrationFlags: flags } as any, []);
  assert(rec != null, "rebalance_concentration builder emits when critical");
}

// Property-heavy household
{
  const inputs = {
    snapshot: {
      cash: 20_000,
      ppor: 1_500_000,
      mortgage: 200_000,
      monthly_income: 10_000,
      monthly_expenses: 5_000,
    },
    properties: [{ current_value: 1_500_000, mortgage_balance: 200_000 }],
    holdingsRaw: [{ asset_type: "etf", current_value: 50_000 }],
  };
  const ctx = buildRecommendationContext(inputs as any, null);
  const flags = detectConcentration(ctx);
  const prop = flags.find((f) => f.kind === "property_over_80");
  assert(prop != null, "property > 80% flagged");
}

// Healthy household has no flags
{
  const inputs = {
    snapshot: {
      cash: 50_000,
      ppor: 400_000,
      mortgage: 200_000,
      monthly_income: 12_000,
      monthly_expenses: 6_000,
    },
    properties: [{ current_value: 400_000, mortgage_balance: 200_000 }],
    holdingsRaw: [
      { asset_type: "etf", current_value: 300_000 },
      { asset_type: "crypto", current_value: 30_000 },
    ],
  };
  const ctx = buildRecommendationContext(inputs as any, null);
  const flags = detectConcentration(ctx);
  // May still flag cash months (50k / 6k = ~8 months → ok)
  const critical = flags.filter((f) => f.severity === "critical");
  assert(critical.length === 0, `healthy household — no critical flags (got ${critical.length})`);
}

console.log(process.exitCode ? "FAILED" : "PASSED");
