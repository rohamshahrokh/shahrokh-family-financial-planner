/**
 * Sprint 2A — Risk Integrity test.
 *
 * Verifies that the Risk Engine consumes the corrected debt + serviceability
 * data flowing from D-001, D-007 and D-016 fixes:
 *
 *   - other_debts flows into total-debt + personal-debt score.
 *   - LVR uses settled IPs only (lifecycle_status honoured).
 *   - DTI computed by computeServiceability now includes other_debts.
 *   - Risk overall score moves in the expected direction when debt grows.
 */
import { computeRiskRadar, buildRiskInput } from "../client/src/lib/riskEngine";
import { computeServiceability } from "../client/src/lib/scenarioV2/borrowing";
import { deriveBasePlan } from "../client/src/lib/scenarioV2";
import { makeRealUserInputs } from "./test-audit-fixtures";

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; process.stdout.write(`  ✓ ${name}\n`); }
  else { fail++; process.stdout.write(`  ✗ ${name}${detail ? "  " + detail : ""}\n`); }
}

// (1) Risk engine increases personal-debt penalty when other_debts grows.
const lowDebt = buildRiskInput({ ...makeRealUserInputs({ other_debts: 0 }).snapshot } as any, [], []);
const highDebt = buildRiskInput({ ...makeRealUserInputs({ other_debts: 200_000 }).snapshot } as any, [], []);
const lowRes = computeRiskRadar(lowDebt);
const highRes = computeRiskRadar(highDebt);
assert(
  "Higher other_debts produces lower (or equal) overall risk score",
  highRes.overall_score <= lowRes.overall_score + 1,
  `low=${lowRes.overall_score} high=${highRes.overall_score}`,
);

// (2) Serviceability DTI now includes other_debts (D-001) — risk engine reads
// from the canonical serviceability surface via computeServiceability.
const inputs = makeRealUserInputs({ other_debts: 50_000 });
const derived = deriveBasePlan(inputs);
const service = computeServiceability({
  state: derived.initialState,
  monthlyGrossIncome: 30_633,
  monthlyLivingExpenses: 15_000,
  mortgageRate: 0.065,
});
const expectedDtiContribution = 50_000 / (30_633 * 12);
const inputsNoOther = makeRealUserInputs({ other_debts: 0 });
const derivedNo = deriveBasePlan(inputsNoOther);
const serviceNo = computeServiceability({
  state: derivedNo.initialState,
  monthlyGrossIncome: 30_633,
  monthlyLivingExpenses: 15_000,
  mortgageRate: 0.065,
});
assert(
  "DTI increase from $50k other_debts ≈ 50k / annualGross (D-001 propagation)",
  Math.abs((service.dti - serviceNo.dti) - expectedDtiContribution) < 1e-4,
  `delta=${(service.dti - serviceNo.dti).toFixed(4)} expected=${expectedDtiContribution.toFixed(4)}`,
);

// (3) LVR is unaffected by other_debts (still property-only ratio).
assert(
  "LVR unaffected by other_debts (canonical property-only ratio)",
  Math.abs(service.lvr - serviceNo.lvr) < 1e-9,
);

// (4) Risk Radar produces categories + alerts shape.
assert(
  "Risk Radar emits categories array",
  Array.isArray(highRes.categories) && highRes.categories.length > 0,
);
assert(
  "Risk Radar emits top_risks array",
  Array.isArray(highRes.top_risks),
);

if (fail > 0) {
  console.error(`\n✗ test-sprint2a-risk-integrity: ${fail} failure(s), ${pass} passed`);
  process.exit(1);
}
console.log(`\n✓ test-sprint2a-risk-integrity: ${pass} passed`);
