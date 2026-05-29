/**
 * mcRiskValidation.test.ts — Sprint 30A.
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/mcRiskValidation.test.ts
 */
import { validateMcRiskOutputs, type McRiskValidationInput } from "../mcRiskValidation";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function base(over: Partial<McRiskValidationInput> = {}): McRiskValidationInput {
  return {
    defaultProbability: 0.01,
    liquidityStressProbability: 0.05,
    liquidityExhaustionProbability: null,
    negativeEquityProbability: 0.02,
    refinancePressureProbability: 0.03,
    forcedSaleTriggerProbability: 0.04,
    simulationCount: 300,
    terminalNwCV: 0.18,
    passiveIncomeCV: 0.18,
    ...over,
  };
}

console.log("\nmcRiskValidation — Sprint 30A");

// 1. Healthy → ok
const ok = validateMcRiskOutputs(base());
check("healthy inputs → status ok", ok.status === "ok");
check("healthy inputs → no warningKind", ok.warningKind === undefined);

// 2. Insufficient sims (< 50) → warning insufficient_sims
const r2 = validateMcRiskOutputs(base({ simulationCount: 30 }));
check("simulationCount 30 → insufficient_sims", r2.warningKind === "insufficient_sims");
check("insufficient_sims detail mentions 30", r2.detail.includes("30"));

// 3. All probabilities null → warning all_null
const r3 = validateMcRiskOutputs(base({
  defaultProbability: null, liquidityStressProbability: null,
  liquidityExhaustionProbability: null, negativeEquityProbability: null,
  refinancePressureProbability: null, forcedSaleTriggerProbability: null,
}));
check("all null probabilities → all_null", r3.warningKind === "all_null");

// 4. All zero with 300 sims → warning all_zero
const r4 = validateMcRiskOutputs(base({
  defaultProbability: 0, liquidityStressProbability: 0,
  liquidityExhaustionProbability: 0, negativeEquityProbability: 0,
  refinancePressureProbability: 0, forcedSaleTriggerProbability: 0,
}));
check("all zero + 300 sims → all_zero", r4.warningKind === "all_zero");
check("all_zero copy matches contract", r4.detail === "Monte Carlo risk outputs are uniformly zero — verify variance assumptions.");

// 5. All zero with FEWER than 50 sims → insufficient_sims takes precedence
const r5 = validateMcRiskOutputs(base({
  defaultProbability: 0, liquidityStressProbability: 0,
  liquidityExhaustionProbability: 0, negativeEquityProbability: 0,
  refinancePressureProbability: 0, forcedSaleTriggerProbability: 0,
  simulationCount: 20,
}));
check("0 probs + 20 sims → insufficient_sims wins", r5.warningKind === "insufficient_sims");

// 6. Below threshold CVs → warning below_threshold
const r6 = validateMcRiskOutputs(base({ terminalNwCV: 0.03, passiveIncomeCV: 0.03 }));
check("both CVs < 5% → below_threshold", r6.warningKind === "below_threshold");

// 7. Only one CV below threshold → still ok
const r7a = validateMcRiskOutputs(base({ terminalNwCV: 0.02, passiveIncomeCV: 0.20 }));
check("only terminal CV low → ok", r7a.status === "ok");
const r7b = validateMcRiskOutputs(base({ terminalNwCV: 0.20, passiveIncomeCV: 0.02 }));
check("only passive CV low → ok", r7b.status === "ok");

// 8. Mix: some probs null, others non-zero, sufficient sims → ok
const r8 = validateMcRiskOutputs(base({
  defaultProbability: null, liquidityStressProbability: 0.03,
  liquidityExhaustionProbability: null, negativeEquityProbability: null,
  refinancePressureProbability: 0.01, forcedSaleTriggerProbability: null,
}));
check("partial probs with one non-zero → ok", r8.status === "ok");

// 9. simulationCount null (unknown) — assume safe and evaluate other rules
const r9 = validateMcRiskOutputs(base({
  simulationCount: null,
  defaultProbability: 0, liquidityStressProbability: 0,
  liquidityExhaustionProbability: 0, negativeEquityProbability: 0,
  refinancePressureProbability: 0, forcedSaleTriggerProbability: 0,
}));
check("null sims + all zero → all_zero", r9.warningKind === "all_zero");

// 10. Audit payload structure
check("audit.simulationCount present", ok.audit.simulationCount === 300);
check("audit.probabilityValues has 5 entries", ok.audit.probabilityValues.length === 5);
check("audit.terminalNwCV echoed", ok.audit.terminalNwCV === 0.18);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
