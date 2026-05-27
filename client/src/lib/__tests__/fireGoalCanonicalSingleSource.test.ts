/**
 * fireGoalCanonicalSingleSource.test.ts — Sprint 20 PR-A guard.
 *
 * Three guards keep the canonical FIRE goal model honest:
 *
 *   (1) Only ONE file may declare `interface CanonicalFireGoal` —
 *       `lib/fireGoalCanonical.ts`. Any other file shadowing this interface
 *       is a regression.
 *
 *   (2) Only the canonical model file and the migration shim may define a
 *       `FireGoal`-shaped local interface/type. Other files must consume the
 *       canonical model through imports, not duplicate the shape.
 *
 *   (3) Direct calls to `/api/mc-fire-settings` writes (PUT/POST) are
 *       allowed only from the canonical writer hook + migration shim. Other
 *       UI files MUST route writes through `useSetFireGoal()`.
 *
 * Run with:
 *   npx tsx client/src/lib/__tests__/fireGoalCanonicalSingleSource.test.ts
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const CLIENT_SRC = join(REPO_ROOT, "client", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function relFromClient(absPath: string): string {
  return relative(CLIENT_SRC, absPath).split(sep).join("/");
}

section("(1) interface CanonicalFireGoal — single definition");
{
  const definers: string[] = [];
  for (const file of walk(CLIENT_SRC)) {
    const rel = relFromClient(file);
    const text = readFileSync(file, "utf8");
    if (/\binterface\s+CanonicalFireGoal\b/.test(text)) {
      definers.push(rel);
    }
  }
  check(
    `exactly one definition of interface CanonicalFireGoal (found ${definers.length})`,
    definers.length === 1 && definers[0] === "lib/fireGoalCanonical.ts",
    definers.length !== 1
      ? `definers: ${definers.join(", ")}`
      : definers[0] !== "lib/fireGoalCanonical.ts"
        ? `wrong file: ${definers[0]}`
        : undefined,
  );
}

section("(2) FireGoal-shaped types — only canonical model and migration");
{
  const ALLOWLIST = new Set<string>([
    "lib/fireGoalCanonical.ts",
    "lib/fireGoalCanonical.migration.ts",
    // Existing canonical goal contract — pre-Sprint-20. Allowed to keep its
    // own `CanonicalGoal` (row shape) since `CanonicalFireGoal` (user shape)
    // is the new single source of truth and is derived from it.
    "lib/useCanonicalGoal.ts",
  ]);
  const definers: string[] = [];
  for (const file of walk(CLIENT_SRC)) {
    const rel = relFromClient(file);
    const text = readFileSync(file, "utf8");
    // Match `interface FooFireGoal {` or `type FooFireGoal =` — but exclude
    // identifier mentions (imports/usages don't count).
    const reIface = /\binterface\s+([A-Za-z_]\w*FireGoal)\b\s*\{/;
    const reType = /\btype\s+([A-Za-z_]\w*FireGoal)\b\s*=/;
    if (reIface.test(text) || reType.test(text)) {
      if (!ALLOWLIST.has(rel)) definers.push(rel);
    }
  }
  check(
    `no non-canonical *FireGoal interface/type declarations (found ${definers.length})`,
    definers.length === 0,
    definers.length ? `unauthorised definers: ${definers.join(", ")}` : undefined,
  );
}

section("(3) FIRE-goal-field writes to mc-fire-settings — canonical writer + migration only");
{
  // The mc_fire_settings row also stores adjacent Monte Carlo settings and
  // an action checklist; non-FIRE-goal fields are allowed to be written from
  // their own surfaces. We only block writes that touch goal-defining fields
  // (target_fire_age, target_passive_monthly, swr_pct, goals_set).
  const ALLOWLIST = new Set<string>([
    "lib/fireGoalCanonical.ts",
    "lib/fireGoalCanonical.migration.ts",
    // Monte Carlo Dashboard is an advanced engineering surface that persists
    // the full mc_fire_settings sheet (50+ MC tuning fields) including goal
    // fields. It pre-dates the canonical writer and is not a primary FIRE
    // goal section. Allowed; deletion deferred to PR-B.
    "components/MonteCarloDashboard.tsx",
  ]);
  const violators: string[] = [];
  for (const file of walk(CLIENT_SRC)) {
    const rel = relFromClient(file);
    const text = readFileSync(file, "utf8");
    const re =
      /apiRequest\s*\(\s*["']P(UT|OST)["']\s*,\s*["']\/api\/mc-fire-settings["']\s*,\s*\{[^}]*\b(target_fire_age|target_passive_monthly|swr_pct|goals_set)\b/s;
    if (re.test(text) && !ALLOWLIST.has(rel)) {
      violators.push(rel);
    }
  }
  check(
    `FIRE-goal-field writes route through canonical writer (0 unauthorised)`,
    violators.length === 0,
    violators.length ? `unauthorised writers: ${violators.join(", ")}` : undefined,
  );
}

console.log(`\n── Summary ──`);
console.log(`  pass: ${pass}`);
console.log(`  fail: ${fail}`);
if (fail > 0) {
  process.exit(1);
}
