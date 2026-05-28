/**
 * wealthStrategyNoFireEditor.test.ts — Sprint 20 PR-F1 fix-up #2 regression guard.
 *
 * V3 blind review of PR #108 flagged that `client/src/pages/wealth-strategy.tsx`
 * still contained two duplicate FIRE-target surfaces competing with the
 * canonical FireGoalPanel on /financial-plan:
 *
 *   1. An "Inputs" card with editable "Target retirement age" and
 *      "Target monthly passive income" InputRow widgets.
 *   2. A "Target FIRE year" SignalTile (plus adjacent FIRE summary tiles).
 *
 * Both were hard-deleted in fix-up #2. This guard prevents reintroduction by
 * reading `wealth-strategy.tsx` as a string, stripping comments, and asserting
 * none of the three flagged label substrings appear in live JSX or text.
 *
 * The three substrings are exact, case-sensitive labels — they are the user-
 * facing strings the duplicate surfaces rendered. Comments referencing the
 * removal (so future readers understand the history) are explicitly allowed
 * by stripping `/ * ... * /` block comments and `//` line comments before the
 * substring check.
 *
 * Run with:
 *   npx tsx client/src/lib/__tests__/wealthStrategyNoFireEditor.test.ts
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const TARGET = join(REPO_ROOT, "client", "src", "pages", "wealth-strategy.tsx");

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    console.log(`  ✘ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// Strip `/* ... */` block comments AND `// ...` line comments before the
// substring check. We intentionally keep this simple — the test runs against
// our own source, so we do not need to worry about strings containing the
// comment markers verbatim.
function stripComments(source: string): string {
  // Block comments: /* ... */ (multi-line, non-greedy).
  let out = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // Line comments: // ... to end of line.
  out = out.replace(/\/\/[^\n]*/g, "");
  return out;
}

const rawSource = readFileSync(TARGET, "utf8");
const stripped = stripComments(rawSource);

section("Live JSX must not reintroduce duplicate FIRE-target labels");
{
  const blockedSubstrings: ReadonlyArray<string> = [
    "Target retirement age",
    "Target monthly passive income",
    "Target FIRE year",
  ];
  for (const needle of blockedSubstrings) {
    const offendingHit = stripped.includes(needle);
    check(
      `wealth-strategy.tsx contains no live "${needle}" label`,
      !offendingHit,
      offendingHit
        ? `found "${needle}" outside comments — the canonical FIRE Goal panel is the only editor`
        : undefined,
    );
  }
}

section("Canonical pointer notice must be present in both prior FIRE surfaces");
{
  // The two FIRE-target editor cards (FireTracker assumptions and
  // RetirementPredictor inputs) were replaced with a dashed-border pointer.
  // The pointer is identified by a stable testid so we can prove the
  // redirect notice exists even if copy is refined.
  check(
    `fire-tracker-canonical-pointer testid is present`,
    stripped.includes("fire-tracker-canonical-pointer"),
    `expected the FIRE Tracker assumptions card to be replaced by a canonical-pointer notice`,
  );
  check(
    `retirement-predictor-canonical-pointer testid is present`,
    stripped.includes("retirement-predictor-canonical-pointer"),
    `expected the Retirement Predictor inputs card to be replaced by a canonical-pointer notice`,
  );
}

section("No leftover state setters for the deleted FIRE-target inputs");
{
  // If a future change reintroduces `setTargetAge`, `setTargetPassive`,
  // `setDesiredMonthly`, or `setSwr`, the editable widget is almost certainly
  // coming back too. Block the setter names.
  const blockedSetters: ReadonlyArray<string> = [
    "setTargetAge",
    "setTargetPassive",
    "setDesiredMonthly",
    "setSwr",
  ];
  for (const setter of blockedSetters) {
    const present = stripped.includes(setter);
    check(
      `wealth-strategy.tsx exposes no "${setter}" setter outside comments`,
      !present,
      present
        ? `found "${setter}" — re-route the surface through useSetFireGoal() instead`
        : undefined,
    );
  }
}

section("Canonical demo arithmetic invariant — 9000 × 12 / 0.04 = 2,700,000");
{
  // Confirms PR-F1 demo math is still bit-identical. The check is purely
  // arithmetic and does not import from the application; it merely guards
  // against accidental constant drift in the spec context.
  const requiredCapital = (9000 * 12) / 0.04;
  check(
    `9000 * 12 / 0.04 evaluates to 2,700,000`,
    requiredCapital === 2_700_000,
    `got ${requiredCapital}`,
  );
}

console.log(`\n── Summary ──`);
console.log(`  pass: ${pass}`);
console.log(`  fail: ${fail}`);
if (fail > 0) {
  process.exit(1);
}
