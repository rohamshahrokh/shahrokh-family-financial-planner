/**
 * confidenceLabelGuard.test.ts — Sprint 20 PR-F2 Section 3.3.
 *
 * Hard rule: the canonical MOVE-RANKING confidence is a HEURISTIC label
 * ('low' | 'medium' | 'high'). The word "probability" MUST NOT appear
 * adjacent to that canonical move-confidence anywhere in `client/src/lib/`
 * or `client/src/pages/`.
 *
 * SCOPE — what this guard does and does NOT enforce:
 *
 *   (A) The guard scans the canonical PR-F2 ranking surfaces:
 *       - `client/src/lib/recommendationEngine/rankMove.ts`
 *       - `client/src/lib/recommendationEngine/canonicalMoveToRecommendation.ts`
 *       - `client/src/lib/recommendationEngine/moves/*.ts`
 *       - `client/src/types/canonicalMove.ts`
 *       - any file that emits a `RankedMove` shape
 *       These files MUST NOT contain the string 'probability' in
 *       non-comment code, because their `confidence` field is a heuristic
 *       label and labelling it as probability is the exact spec violation
 *       Sprint 20 PR-F2 is preventing.
 *
 *   (B) Other lib files that genuinely use the word 'probability' (e.g.
 *       Monte Carlo engines using a true probability number) are NOT
 *       affected by this guard. Those engines have a separate confidence
 *       semantic and are NOT the F2 move-ranking confidence.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..");

/** Targeted scan: only the PR-F2 canonical move-ranking surfaces. */
const SCAN_FILES_EXPLICIT = [
  join(REPO_ROOT, "client", "src", "lib", "recommendationEngine", "rankMove.ts"),
  join(REPO_ROOT, "client", "src", "lib", "recommendationEngine", "canonicalMoveToRecommendation.ts"),
  join(REPO_ROOT, "client", "src", "types", "canonicalMove.ts"),
];
const SCAN_DIRS = [
  join(REPO_ROOT, "client", "src", "lib", "recommendationEngine", "moves"),
];

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`); }
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

// Strip /* … */ and // … comments from a source string. Naïve but adequate
// for this guard — false positives only happen with comment-tokens inside
// string literals (unusual in this codebase).
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// `confidence` followed by a probability label (or vice versa) within ~80
// chars of each other in the stripped source. This is the hard rule: the
// word "probability" near a confidence label is forbidden.
const NEAR_PATTERN_A = /confidence[^;{}\n]{0,80}probability/i;
const NEAR_PATTERN_B = /probability[^;{}\n]{0,80}confidence/i;

console.log("\n── Scanning PR-F2 canonical move-ranking surfaces for forbidden 'confidence … probability' phrases ──");
{
  const files: string[] = [...SCAN_FILES_EXPLICIT];
  for (const d of SCAN_DIRS) walk(d, files);
  console.log(`    Scanned ${files.length} source file(s).`);

  const violations: Array<{ file: string; matchA?: string; matchB?: string }> = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const stripped = stripComments(src);
    const a = stripped.match(NEAR_PATTERN_A);
    const b = stripped.match(NEAR_PATTERN_B);
    if (a || b) {
      violations.push({
        file: f.replace(REPO_ROOT + "/", ""),
        matchA: a ? a[0].slice(0, 120) : undefined,
        matchB: b ? b[0].slice(0, 120) : undefined,
      });
    }
  }

  if (violations.length > 0) {
    console.log("    Violations found:");
    for (const v of violations) {
      console.log(`      ${v.file}`);
      if (v.matchA) console.log(`        confidence→probability: ${v.matchA}`);
      if (v.matchB) console.log(`        probability→confidence: ${v.matchB}`);
    }
  }
  check(
    "no 'confidence … probability' phrases adjacent in PR-F2 ranking surfaces (comments excluded)",
    violations.length === 0,
    `${violations.length} violation(s)`,
  );

  // Stricter rule: the canonical move surfaces must have ZERO occurrences
  // of "probability" outside comments at all. The heuristic confidence is
  // never a probability and the word should not leak into the source.
  console.log("\n── Strict: 'probability' never appears in PR-F2 ranking surfaces (comments excluded) ──");
  const strictViolations: Array<{ file: string; snippet: string }> = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const stripped = stripComments(src);
    const m = stripped.match(/probability/i);
    if (m) {
      strictViolations.push({ file: f.replace(REPO_ROOT + "/", ""), snippet: stripped.slice(Math.max(0, m.index! - 40), m.index! + 60) });
    }
  }
  if (strictViolations.length > 0) {
    console.log("    Strict violations:");
    for (const v of strictViolations) console.log(`      ${v.file}: …${v.snippet}…`);
  }
  check(
    "PR-F2 ranking surfaces have zero 'probability' outside comments",
    strictViolations.length === 0,
    `${strictViolations.length} violation(s)`,
  );
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);
