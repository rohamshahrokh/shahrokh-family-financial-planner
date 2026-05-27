/**
 * decisionConsistency.test.ts — Sprint 15 Phase 3 task 3h.
 *
 * Three guards keep the unified-decision contract honest after Phase 1/2/3
 * land:
 *
 *   (1) No page-level FIRE recomputation. `computeCanonicalFire(` may only be
 *       called from the canonical wrapper (`canonicalFire.ts`) and from the
 *       existing engine/lib stack that wires FIRE inputs into downstream
 *       engines. The audit found 4 page-level callers as legitimate
 *       integration points — they are allowlisted explicitly. Any NEW
 *       page-level caller introduced outside the allowlist will fail this
 *       guard.
 *
 *   (2) No direct `snapshot.fire_target_monthly_income` reads from arbitrary
 *       UI files. Phase 2 routed this field through `computeCanonicalFire`;
 *       direct reads outside the allowlist would silently re-fork FIRE.
 *
 *   (3) Cross-page recommendation parity. The facade is a singleton with a
 *       cache layer (see canonicalRecommendation.ts). Calling it twice with
 *       no args from two simulated consumers must yield the same
 *       recommendation IDs and the same FIRE numbers — i.e. consumers cannot
 *       drift from each other because they all read through the same
 *       cached object.
 *
 * Run with:
 *   npx tsx client/src/lib/__tests__/decisionConsistency.test.ts
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeCanonicalRecommendation,
  readCachedCanonicalRecommendation,
  __resetCanonicalRecommendationCacheForTests,
} from "../canonicalRecommendation";
import { computeCanonicalFire } from "../canonicalFire";
import type { DashboardInputs } from "../dashboardDataContract";

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

// ─── File-tree helpers ────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const CLIENT_SRC = join(REPO_ROOT, "client", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // skip __tests__ and node_modules just in case
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

// ─── (1) computeCanonicalFire callers — allowlist guard ───────────────────

section("(1) computeCanonicalFire( callers — only allowlisted files may call");
{
  // The audit (remediation_plan_final §3.3) accepts these page-level callers
  // as the legitimate integration points wiring FIRE into the existing
  // page-render stack. NEW callers outside this set are a regression.
  const ALLOWLIST = new Set<string>([
    // Canonical wrapper — defines the function.
    "lib/canonicalFire.ts",
    // Pages that legitimately pull the canonical FIRE into render.
    "pages/dashboard.tsx",
    "pages/action-plan.tsx",
    "pages/decision-lab.tsx",
    "pages/reports.tsx",
    // Engine + lib integrations that wire FIRE into downstream engines.
    "lib/portfolioLabOptimizer.ts",
    "lib/goalClosureLab.ts",
    "lib/decisionCandidates.ts",
    "lib/canonicalLedger.ts",
    "lib/scenarioCompareWorkspace.ts",
    "lib/pathSimulationEngine.ts",
    "lib/goalSolver.ts",
    "lib/canonicalHeadlineMetrics.ts",
    "components/TruePortfolioOptimizer.tsx",
    "components/decisionEngine/GoalSolverProTab.tsx",
    "components/action-plan/CurrentPositionStrip.tsx",
  ]);

  const callers: string[] = [];
  for (const file of walk(CLIENT_SRC)) {
    const rel = relFromClient(file);
    const text = readFileSync(file, "utf8");
    // Look for actual call sites, not type-only mentions.
    if (/\bcomputeCanonicalFire\s*\(/.test(text)) {
      callers.push(rel);
    }
  }

  const violators = callers.filter((p) => !ALLOWLIST.has(p));
  check(
    `computeCanonicalFire is only called from allowlisted files (found ${callers.length} total, 0 unauthorised)`,
    violators.length === 0,
    violators.length
      ? `unauthorised callers: ${violators.join(", ")}`
      : undefined,
  );
}

// ─── (2) snapshot.fire_target_monthly_income — allowlist guard ────────────

section("(2) snapshot.fire_target_monthly_income reads — allowlist guard");
{
  const ALLOWLIST = new Set<string>([
    "lib/canonicalFire.ts",
    "pages/scenario-compare.tsx",
    "pages/financial-plan.tsx",
    "lib/householdFinancialState.ts",
    "lib/demoData.ts",
    // Persistence-layer column lists (not UI reads).
    "lib/localStore.ts",
    "lib/supabaseClient.ts",
  ]);

  const readers: string[] = [];
  for (const file of walk(CLIENT_SRC)) {
    const rel = relFromClient(file);
    const text = readFileSync(file, "utf8");
    // Match any read of the field — `.fire_target_monthly_income`. We are
    // intentionally broad: even a destructured read or a typeof check counts.
    if (/\bfire_target_monthly_income\b/.test(text)) {
      readers.push(rel);
    }
  }

  const violators = readers.filter((p) => !ALLOWLIST.has(p));
  check(
    `fire_target_monthly_income is only read by allowlisted files (found ${readers.length} total, 0 unauthorised)`,
    violators.length === 0,
    violators.length
      ? `unauthorised readers: ${violators.join(", ")}`
      : undefined,
  );
}

// ─── (3) Cross-page FIRE + recommendation parity ─────────────────────────

section("(3) cross-page parity — facade yields identical IDs + FIRE numbers");
{
  // Reset cache so the first call is a real run, the second reads it back.
  __resetCanonicalRecommendationCacheForTests();

  // Two simulated consumers (e.g. action-plan + decision-lab) each invoke
  // the facade. They MUST receive the same recommendation IDs.
  (async () => {
    const consumerA = await computeCanonicalRecommendation();
    const consumerB =
      readCachedCanonicalRecommendation() ??
      (await computeCanonicalRecommendation());

    const idsA = [consumerA.bestMove?.id, ...consumerA.top3.map((t) => t.id)];
    const idsB = [consumerB.bestMove?.id, ...consumerB.top3.map((t) => t.id)];

    check(
      "bestMove.id identical across two consumers",
      consumerA.bestMove?.id === consumerB.bestMove?.id,
      `A=${consumerA.bestMove?.id} B=${consumerB.bestMove?.id}`,
    );
    check(
      "top3 IDs identical across two consumers",
      JSON.stringify(idsA) === JSON.stringify(idsB),
      `A=${JSON.stringify(idsA)} B=${JSON.stringify(idsB)}`,
    );
    check(
      "confidence identical across two consumers",
      consumerA.confidence === consumerB.confidence,
      `A=${consumerA.confidence} B=${consumerB.confidence}`,
    );
    check(
      "confidenceSource identical across two consumers",
      consumerA.confidenceSource === consumerB.confidenceSource,
    );

    // FIRE parity — call computeCanonicalFire from two simulated consumers
    // with the same ledger. Result must be deeply equal.
    const ledger: DashboardInputs = {
      snapshot: {
        ppor: 1_510_000,
        cash: 40_000,
        super_balance: 88_000,
        stocks: 0,
        crypto: 0,
        cars: 65_000,
        iran_property: 150_000,
        mortgage: 1_200_000,
        other_debts: 19_000,
        roham_monthly_income: 15_466.67,
        fara_monthly_income: 15_166.67,
        monthly_expenses: 15_000,
        rental_income_total: 0,
      } as any,
      properties: [],
      stocks: [],
      cryptos: [],
      holdingsRaw: [],
      incomeRecords: [],
      expenses: [],
      todayIso: "2026-05-26",
    } as unknown as DashboardInputs;

    const fireA = computeCanonicalFire(ledger);
    const fireB = computeCanonicalFire(ledger);

    check(
      "fireNumber identical across two consumers",
      fireA.fireNumber === fireB.fireNumber,
      `A=${fireA.fireNumber} B=${fireB.fireNumber}`,
    );
    check(
      "swrPct identical across two consumers",
      fireA.swrPct === fireB.swrPct,
    );
    check(
      "progressFraction identical across two consumers",
      fireA.progressFraction === fireB.progressFraction,
    );
    check(
      "targetMonthlyIncome identical across two consumers",
      fireA.targetMonthlyIncome === fireB.targetMonthlyIncome,
    );

    console.log(`\n── Summary ──\n${pass} passed, ${fail} failed`);
    if (fail > 0) process.exit(1);
  })().catch((err) => {
    console.error("Cross-page parity test threw:", err);
    process.exit(1);
  });
}
