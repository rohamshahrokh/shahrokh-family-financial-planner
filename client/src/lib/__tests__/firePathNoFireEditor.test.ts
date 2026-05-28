/**
 * firePathNoFireEditor.test.ts — Sprint 20 PR-F1 fix-up #3 (W1) regression
 * guard.
 *
 * V4 blind review of PR #108 flagged that `client/src/pages/fire-path.tsx`
 * still contained an editable "Desired monthly passive income" SettingRow
 * even after fix-up #2 removed similar duplicates from wealth-strategy.tsx.
 * Fix-up #3 hard-deleted that widget and extended the existing SWR redirect
 * notice to cover passive income too.
 *
 * This guard prevents reintroduction by reading `fire-path.tsx` as a string,
 * stripping comments (so the historical note in the comment block is allowed),
 * and asserting none of the flagged substrings appear in live JSX or text.
 *
 * Run with:
 *   npx tsx client/src/lib/__tests__/firePathNoFireEditor.test.ts
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const TARGET = join(REPO_ROOT, "client", "src", "pages", "fire-path.tsx");

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
  let out = source.replace(/\/\*[\s\S]*?\*\//g, "");
  out = out.replace(/\/\/[^\n]*/g, "");
  return out;
}

const rawSource = readFileSync(TARGET, "utf8");
const stripped = stripComments(rawSource);

section("Live JSX must not reintroduce the FIRE-target editor in fire-path.tsx");
{
  // These substrings identify the editable widget that was removed. The
  // label is user-facing copy; the srcKey is the typed binding to the
  // canonical FIRE-target column; both presences indicate the editor is back.
  const blockedSubstrings: ReadonlyArray<string> = [
    "Desired monthly passive income",
    'srcKey="desired_monthly_passive"',
  ];
  for (const needle of blockedSubstrings) {
    const offendingHit = stripped.includes(needle);
    check(
      `fire-path.tsx contains no live "${needle}"`,
      !offendingHit,
      offendingHit
        ? `found "${needle}" outside comments — the canonical FIRE Goal panel is the only editor`
        : undefined,
    );
  }
}

section("No leftover setters for the deleted FIRE-target inputs");
{
  const blockedSetters: ReadonlyArray<string> = [
    "setTargetAge",
    "setTargetPassive",
    "setDesiredMonthly",
    "setSwr",
  ];
  for (const setter of blockedSetters) {
    const present = stripped.includes(setter);
    check(
      `fire-path.tsx exposes no "${setter}" setter outside comments`,
      !present,
      present
        ? `found "${setter}" — re-route through the canonical FIRE Goal panel instead`
        : undefined,
    );
  }
}

section("Canonical pointer notice must remain present");
{
  // The dedup leaves a single redirect notice that addresses BOTH the
  // passive-income input and the SWR input. The testid is stable across copy
  // refinements so reviewers can verify the surface still exists.
  check(
    `fire-path-fire-target-canonical-pointer testid is present`,
    stripped.includes("fire-path-fire-target-canonical-pointer"),
    `expected the FIRE-target inputs to be replaced by a single canonical-pointer notice`,
  );
}

section("Canonical demo arithmetic invariant — 9000 × 12 / 0.04 = 2,700,000");
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
if (fail > 0) {
  process.exit(1);
}
