/**
 * Sprint 11 — TruePortfolioOptimizer Hero smoke test.
 *
 * Static-string check that the Hero region exposes the 5 expected testids and
 * that audit-trail / search-metrics / phase 5 sections are demoted into the
 * AdvancedDisclosure (Sprint 11 #1, #2, #3, #4, #5, #6).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const file = resolve(__dirname, "..", "client/src/components/TruePortfolioOptimizer.tsx");
const src = readFileSync(file, "utf8");

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`ok   ${msg}`);
  }
}

// Hero testids
for (const tid of [
  "portfolio-lab-hero",
  "hero-where-now",
  "hero-on-track",
  "hero-next-action",
  "hero-why",
  "hero-baseline-chart",
]) {
  assert(src.includes(`data-testid="${tid}"`), `Hero exposes testid '${tid}'`);
}

// Hero renders the baseline-vs-recommendation chart
assert(src.includes('strokeDasharray="5 5"'), "Baseline trajectory is dashed");
assert(src.includes('"Recommended p50"'), "Recommended series labelled p50");

// Demotion: SearchMetricsCard + AuditTrailCard live inside the AdvancedDisclosure now
const disclosureMatch = src.match(/<AdvancedDisclosure[\s\S]*?<\/AdvancedDisclosure>/);
assert(disclosureMatch, "AdvancedDisclosure block exists");
if (disclosureMatch) {
  const body = disclosureMatch[0];
  assert(body.includes("<SearchMetricsCard"), "SearchMetricsCard inside AdvancedDisclosure (#4)");
  assert(body.includes("<AuditTrailCard"), "AuditTrailCard inside AdvancedDisclosure (#3)");
  assert(body.includes("<PortfolioLab"), "Phase 5 PortfolioLab inside AdvancedDisclosure (#40-pre-req)");
}

// Sprint 11 #6 — GoalSolverProSection no longer mounted; replaced by deep-link
assert(!src.includes("<GoalSolverProSection"), "GoalSolverProSection no longer mounted in Portfolio Lab (#6)");
assert(src.includes("GoalSolverProDeepLink"), "Goal Solver Pro deep-link card exists");
assert(src.includes('href="/decision"'), "Deep-link points to /decision route");

// Sprint 11 #5 — whyThisWins narrative promoted above Executive Summary
assert(src.includes('data-testid="portfolio-lab-why-this-wins-promoted"'), "WhyThisWins promoted card present");

if (process.exitCode) {
  console.error("Portfolio Lab Hero smoke test FAILED");
} else {
  console.log("Portfolio Lab Hero smoke test passed");
}
