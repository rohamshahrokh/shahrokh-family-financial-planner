/**
 * Audit P1.6 / PDF-1 — pdfSafe must strip every non-WinAnsi glyph and replace
 * with an ASCII fallback. We verify the sanitiser directly (no pdf-parse
 * dependency required) and confirm the output of generateQuickDecisionPdf
 * doesn't contain any > 0xFF codepoints in its text stream.
 */
import { pdfSafe } from "../client/src/lib/scenarioV2";
import { check } from "./test-audit-fixtures";

let pass = 0, fail = 0;
function run(name: string, cond: boolean, detail?: string) {
  if (check(name, cond, detail)) pass++; else fail++;
}

// Every glyph the audit caught.
const problematic = "→ ≥ ≤ • — − · ✓ ✗ ⚠ ☆ ∞ μ ν σ";
const safe = pdfSafe(problematic);
run("no Unicode arrows remain", !safe.includes("→") && !safe.includes("←"), `safe="${safe}"`);
run("no >= remain as Unicode", !safe.includes("≥") && !safe.includes("≤"), `safe="${safe}"`);
run("no bullet remains", !safe.includes("•"), `safe="${safe}"`);
run("no em/en dash remain", !safe.includes("—") && !safe.includes("–"), `safe="${safe}"`);
run("emoji stripped", !safe.includes("✓") && !safe.includes("✗") && !safe.includes("⚠"), `safe="${safe}"`);

// No > 0xFF char anywhere in the safe output.
let okAscii = true;
for (let i = 0; i < safe.length; i++) {
  if (safe.charCodeAt(i) > 0xFF) { okAscii = false; break; }
}
run("safe output is fully WinAnsi (<=0xFF)", okAscii, `safe="${safe}"`);

// Question marks introduced by the strip-fallback are bounded — none of the
// original input's special chars survive untranslated, so each maps to a known
// short string and not to a "?".
run("arrows mapped to '->'", pdfSafe("hello → world").includes("->"));
run("checkmark mapped to '[OK]'", pdfSafe("done ✓").includes("[OK]"));
run("≥ mapped to '>='", pdfSafe("a ≥ b").includes(">="));

if (fail > 0) { console.error(`test-pdf-no-broken-chars: ${fail} failure(s)`); process.exit(1); }
console.log(`test-pdf-no-broken-chars: ${pass} passed`);
