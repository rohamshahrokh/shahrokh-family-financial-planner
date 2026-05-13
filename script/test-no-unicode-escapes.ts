/**
 * P0-4 guard — fails if any `.ts/.tsx` file under `client/src/` contains a
 * literal backslash-u escape sequence (e.g. `→`) that would be rendered
 * as text inside JSX. Comments and regex/string escapes that match the
 * pattern are intentionally NOT excluded — JSX renders them as text anyway.
 *
 * The audit caught these in DepositPowerCard.tsx and scenario-compare.tsx;
 * this test exists so a future find-and-replace gone wrong fails CI.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "client/src";
const ESCAPE_RE = /\\u[0-9a-fA-F]{4}/g;

let pass = 0, fail = 0;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const stat = statSync(p);
    if (stat.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

const offenders: { file: string; line: number; match: string }[] = [];
for (const file of walk(ROOT)) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    // Skip lines that obviously declare a regex (so legitimate regex literals
    // like /\u[0-9a-f]{4}/ in THIS scanner don't trip the guard when added).
    // We only flag when the escape appears inside a string literal OR JSX text.
    if (line.includes("// ALLOW-UESCAPE")) return;
    let m: RegExpExecArray | null;
    ESCAPE_RE.lastIndex = 0;
    while ((m = ESCAPE_RE.exec(line))) {
      offenders.push({ file, line: i + 1, match: m[0] });
    }
  });
}

if (offenders.length === 0) {
  console.log("  PASS  no raw \\u escape sequences in client/src/");
  pass = 1;
} else {
  fail = offenders.length;
  for (const o of offenders) {
    console.error(`  FAIL  ${o.file}:${o.line}  contains literal ${o.match}`);
  }
}

if (fail > 0) { console.error(`test-no-unicode-escapes: ${fail} offender(s)`); process.exit(1); }
console.log(`test-no-unicode-escapes: ${pass} passed`);
