/**
 * mcVarianceDiagnostic.test.ts — Sprint 29 §4.6.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/mcVarianceDiagnostic.test.ts
 */
import { computeMCVarianceDiagnostic } from "../mcVarianceDiagnostic";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

console.log("\nmcVarianceDiagnostic — distribution summary + warnings");

// 1. Empty samples → null stats + sampleN 0
const rEmpty = computeMCVarianceDiagnostic({
  terminalNwSamples: [], fireNumber: 2_000_000, swrPct: 4, startAge: 40,
  fanFireMonths: { p25: null, p50: null, p75: null },
});
check("empty samples → terminalNW mean null", rEmpty.terminalNetWorth.mean === null);
check("empty samples → sampleN 0", rEmpty.terminalNetWorth.sampleN === 0);
check("empty samples → no NW warning (cv is null)", !rEmpty.warnings.includes("mc-variance-suspiciously-low"));

// 2. All-equal samples → cv = 0, warning fires
const rEqual = computeMCVarianceDiagnostic({
  terminalNwSamples: Array(10).fill(1_500_000),
  fireNumber: 2_000_000, swrPct: 4, startAge: 40,
  fanFireMonths: { p25: 120, p50: 120, p75: 120 },
});
check("all-equal samples → cv 0", rEqual.terminalNetWorth.cv === 0);
check("all-equal samples → suspiciously-low warning", rEqual.warnings.includes("mc-variance-suspiciously-low"));
check("all-equal samples → passive cv 0 → spread-low warning", rEqual.warnings.includes("mc-passive-spread-low"));
check("all-equal fan crossings → fire-age-spread-low warning", rEqual.warnings.includes("mc-fire-age-spread-low"));

// 3. Single sample → std 0, cv 0, warning fires
const rSingle = computeMCVarianceDiagnostic({
  terminalNwSamples: [1_000_000],
  fireNumber: 2_000_000, swrPct: 4, startAge: 40,
  fanFireMonths: { p25: null, p50: null, p75: null },
});
check("single sample → sampleN 1", rSingle.terminalNetWorth.sampleN === 1);
check("single sample → std 0", rSingle.terminalNetWorth.std === 0);
check("single sample → cv 0", rSingle.terminalNetWorth.cv === 0);
check("single sample → suspiciously-low warning", rSingle.warnings.includes("mc-variance-suspiciously-low"));

// 4. Realistic spread → no NW warning
const rSpread = computeMCVarianceDiagnostic({
  terminalNwSamples: [800_000, 1_200_000, 1_500_000, 1_700_000, 2_000_000, 2_300_000, 2_600_000, 3_000_000, 3_400_000, 4_000_000],
  fireNumber: 2_000_000, swrPct: 4, startAge: 40,
  fanFireMonths: { p25: 192, p50: 144, p75: 108 },
});
check("realistic spread → cv > 0.05", (rSpread.terminalNetWorth.cv as number) > 0.05);
check("realistic spread → no NW warning", !rSpread.warnings.includes("mc-variance-suspiciously-low"));
check("realistic spread → passive cv > 0.05", (rSpread.passiveIncome.cv as number) > 0.05);
check("realistic spread → no passive warning", !rSpread.warnings.includes("mc-passive-spread-low"));
check("realistic spread → median populated", rSpread.terminalNetWorth.median != null);
check("percentiles ordered p5 ≤ p25 ≤ p50 ≤ p75 ≤ p95",
  (rSpread.terminalNetWorth.p5 as number) <= (rSpread.terminalNetWorth.p25 as number) &&
  (rSpread.terminalNetWorth.p25 as number) <= (rSpread.terminalNetWorth.p50 as number) &&
  (rSpread.terminalNetWorth.p50 as number) <= (rSpread.terminalNetWorth.p75 as number) &&
  (rSpread.terminalNetWorth.p75 as number) <= (rSpread.terminalNetWorth.p95 as number));

// 5. Bimodal distribution → high std, no warning
const rBimodal = computeMCVarianceDiagnostic({
  terminalNwSamples: [500_000, 500_000, 500_000, 500_000, 500_000, 4_000_000, 4_000_000, 4_000_000, 4_000_000, 4_000_000],
  fireNumber: 2_000_000, swrPct: 4, startAge: 40,
  fanFireMonths: { p25: 300, p50: 200, p75: 144 },
});
check("bimodal → std large", (rBimodal.terminalNetWorth.std as number) > 1_000_000);
check("bimodal → no NW variance warning", !rBimodal.warnings.includes("mc-variance-suspiciously-low"));

// 6. fireAge derivation from startAge + crossing months
const rFireAge = computeMCVarianceDiagnostic({
  terminalNwSamples: [1_500_000, 2_000_000, 2_500_000],
  fireNumber: 2_000_000, swrPct: 4, startAge: 40,
  fanFireMonths: { p25: 240, p50: 180, p75: 120 }, // 20y, 15y, 10y from startAge → ages 60/55/50
});
check("fireAge.p25 = startAge + months/12", rFireAge.fireAge.p25 === 60);
check("fireAge.p50 = startAge + months/12", rFireAge.fireAge.p50 === 55);
check("fireAge.p75 = startAge + months/12", rFireAge.fireAge.p75 === 50);
check("fireAge sampleN = 3 when crossings present", rFireAge.fireAge.sampleN === 3);
check("fireAge p5/p95/std stay null (out of scope per §4.3)", rFireAge.fireAge.std === null && rFireAge.fireAge.p5 === null);

// 7. Null swrPct → passive distribution empty
const rNoSwr = computeMCVarianceDiagnostic({
  terminalNwSamples: [1_000_000, 2_000_000, 3_000_000],
  fireNumber: 2_000_000, swrPct: null, startAge: 40,
  fanFireMonths: { p25: 240, p50: 180, p75: 120 },
});
check("null swr → passive sampleN 0", rNoSwr.passiveIncome.sampleN === 0);
check("null swr → no passive warning", !rNoSwr.warnings.includes("mc-passive-spread-low"));

// 8. Source tag always present
check("source tag set", rSpread.source === "scenarioV2.monteCarlo.diagnostic");
check("thresholds echoed", rSpread.thresholds.netWorthCv === 0.05);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
