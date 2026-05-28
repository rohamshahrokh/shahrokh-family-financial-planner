/**
 * wealthStrategyHonestyGuard.test.ts — Sprint 20 PR-F1 fix-up #3 (W2)
 * regression guard.
 *
 * V4 blind review flagged a CHARTER-RULE violation on wealth-strategy.tsx:
 * the page had user-facing copy claiming "This page reflects those settings"
 * and a KpiCard sub-label "from canonical FIRE goal" while the underlying
 * scenarios were driven by hardcoded constants
 * (`targetAge = 55`, `targetPassive = 8000`, `desiredMonthly = 10000`,
 * `swr = 4`). That is the exact "hide weak logic behind better wording"
 * pattern the charter bans.
 *
 * Fix-up #3 Path A wired the four constants to useFireSettingsRow() so the
 * copy is now literally true. This guard enforces an honest-coexistence rule:
 *
 *   If `wealth-strategy.tsx` (comments stripped) contains either of the two
 *   "reflects-canonical" copy strings, then it must NOT contain any of the
 *   four banned bare-literal assignments. Both must be true together OR
 *   neither must be present.
 *
 * Run with:
 *   npx tsx client/src/lib/__tests__/wealthStrategyHonestyGuard.test.ts
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

function stripComments(source: string): string {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, "");
  out = out.replace(/\/\/[^\n]*/g, "");
  return out;
}

const rawSource = readFileSync(TARGET, "utf8");
const stripped = stripComments(rawSource);

// The two copy strings that, if present, claim the surface reflects the
// canonical FIRE goal. If present, we must verify the page is actually
// reading the canonical values (no bare-literal assignments left).
const CLAIMS_CANONICAL: ReadonlyArray<string> = [
  "reflects those settings",
  "from canonical FIRE goal",
];

// The four bare-literal assignments that drove the lie. Match the exact
// assignment shape (`= NUMBER`) so we do not catch unrelated occurrences of
// the bare numbers.
const BANNED_BARE_LITERALS: ReadonlyArray<string> = [
  "targetAge = 55",
  "targetPassive = 8000",
  "desiredMonthly = 10000",
  "swr = 4",
];

const presentClaims = CLAIMS_CANONICAL.filter(s => stripped.includes(s));
const presentBannedLiterals = BANNED_BARE_LITERALS.filter(s => stripped.includes(s));

section("Charter rule — do NOT hide weak logic behind better wording");
{
  if (presentClaims.length > 0) {
    // Path A semantics: copy is present, so the constants must be gone.
    for (const banned of BANNED_BARE_LITERALS) {
      const present = stripped.includes(banned);
      check(
        `wealth-strategy.tsx contains no live "${banned}" while claiming canonical`,
        !present,
        present
          ? `the file claims to reflect canonical FIRE settings (${JSON.stringify(presentClaims)}) but still hardcodes "${banned}" — wire the value through useFireSettingsRow() or remove the claiming copy`
          : undefined,
      );
    }
  } else {
    // Path B semantics: copy is gone, so the constants are allowed to remain
    // as illustrative defaults. Nothing to enforce on the literals.
    check(
      `no claiming copy present — bare-literal assignments are unconstrained (Path B mode)`,
      true,
    );
  }
}

section("Canonical pointer notices must still exist (testids preserved)");
{
  // Both notice testids should remain, regardless of which path was chosen
  // for the underlying constants. Removing them would mean a different
  // regression than the one this guard targets.
  check(
    `fire-tracker-canonical-pointer testid is present`,
    stripped.includes("fire-tracker-canonical-pointer"),
  );
  check(
    `retirement-predictor-canonical-pointer testid is present`,
    stripped.includes("retirement-predictor-canonical-pointer"),
  );
}

section("Hook wiring sanity — useFireSettingsRow is consumed");
{
  // Path A requires the page to actually read the canonical hook. If the
  // claiming copy is present, the hook import must be too.
  if (presentClaims.length > 0) {
    check(
      `wealth-strategy.tsx consumes useFireSettingsRow()`,
      stripped.includes("useFireSettingsRow"),
      `claim copy present but no useFireSettingsRow call — the claim is unbacked`,
    );
  } else {
    check(
      `no claiming copy present — hook consumption not required (Path B mode)`,
      true,
    );
  }
}

section("Demo arithmetic invariant — 9000 × 12 / 0.04 = 2,700,000");
{
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
console.log(`  claims present: ${presentClaims.length} (${JSON.stringify(presentClaims)})`);
console.log(`  banned literals present: ${presentBannedLiterals.length} (${JSON.stringify(presentBannedLiterals)})`);
if (fail > 0) {
  process.exit(1);
}
