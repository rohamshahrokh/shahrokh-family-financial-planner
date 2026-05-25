/**
 * Sprint 13 — 4-section component static contract test.
 *
 * Same approach as S11: check that the source files expose every testid and
 * source-label promised in the brief. Avoids the JSX-runtime gymnastics that
 * a full SSR render would need with `jsx: "preserve"`.
 *
 * Run: `tsx script/test-sprint13-sections.ts`
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function read(rel: string): string {
  return readFileSync(resolve(__dirname, "..", rel), "utf8");
}

let passed = 0;
let failed = 0;
function assert(cond: unknown, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("\n[1/5] FireCommandCenter — exposes 5 tile testids + SourceTag wiring");
{
  const src = read("client/src/components/sprint13/FireCommandCenter.tsx");
  // Suffixes that appear inside `${testidPrefix}-<suffix>` template literals
  for (const suffix of ["current-nw", "target-nw", "gap", "years-remaining", "probability"]) {
    assert(src.includes(`-${suffix}\``) || src.includes(`-${suffix}"`), `tile testid suffix present: ${suffix}`);
  }
  assert(src.includes("SourceTag"), "imports SourceTag");
  assert(src.includes("selectSourceLabelFor"), "uses selectSourceLabelFor");
  assert(/`\$\{testidPrefix\}-empty`/.test(src), "exposes empty-state testid (template)");
  assert(src.includes("isEmptyValue"), "respects isEmptyValue P0 rule");
  assert(/Set a FIRE goal/.test(src), "empty CTA copy present");
  assert(/testidPrefix\s*=\s*"fcc"/.test(src), "default testid prefix is 'fcc'");
}

console.log("\n[2/5] Top3ActionsRow — 3 cards, sub-testids, empty state");
{
  const src = read("client/src/components/sprint13/Top3ActionsRow.tsx");
  assert(src.includes('top3-card-') || src.includes("`${testidPrefix}-card-"), "card testid pattern present");
  for (const sub of ["-what", "-when", "-why", "-expected"]) {
    assert(src.includes(sub), `sub-testid suffix used: ${sub}`);
  }
  assert(src.includes("UserFacingAction"), "uses the typed UserFacingAction shape");
  assert(src.includes("SourceTag"), "renders SourceTag");
  assert(/no actions needed/i.test(src), "empty-state copy");
  assert(/`\$\{testidPrefix\}-empty`/.test(src), "empty-state testid (template)");
  assert(/testidPrefix\s*=\s*"top3"/.test(src), "default testid prefix is 'top3'");
}

console.log("\n[3/5] BiggestBlockersRow — ranked rows, sub-testids");
{
  const src = read("client/src/components/sprint13/BiggestBlockersRow.tsx");
  assert(src.includes("blockers-row-") || src.includes("`${testidPrefix}-row-"), "row testid pattern present");
  for (const sub of ["-label", "-impact", "-required", "-benefit"]) {
    assert(src.includes(sub), `sub-testid suffix used: ${sub}`);
  }
  assert(src.includes("RankedBlocker"), "uses typed RankedBlocker");
  assert(src.includes("SourceTag"), "renders SourceTag");
  // 0 blockers must return null (not render anything)
  assert(/blockers\.length === 0/.test(src) && /return null/.test(src), "0 blockers returns null (hides section)");
}

console.log("\n[4/5] DoNothingOutcome — 4 lines + sources");
{
  const src = read("client/src/components/sprint13/DoNothingOutcome.tsx");
  for (const suffix of ["nw", "pi", "prob", "fire-date"]) {
    assert(src.includes(`-${suffix}\``) || src.includes(`-${suffix}"`), `line testid suffix present: ${suffix}`);
  }
  assert(src.includes("SourceTag"), "renders SourceTag");
  assert(src.includes("selectSourceLabelFor"), "wired to source-label selector");
  assert(/If you do nothing/i.test(src), "section header copy");
  assert(/testidPrefix\s*=\s*"do-nothing"/.test(src), "default testid prefix is 'do-nothing'");
}

console.log("\n[5/5] RecommendedVsDoNothingChart");
{
  const src = read("client/src/components/sprint13/RecommendedVsDoNothingChart.tsx");
  assert(src.includes("chart-recommended-vs-do-nothing"), "chart testid present");
  assert(/strokeDasharray="5 5"/.test(src), "do-nothing line is dashed");
  assert(src.includes("ResponsiveContainer"), "uses Recharts ResponsiveContainer");
  assert(/height\s*=\s*180/.test(src), "default height = 180px (single-viewport budget)");
}

console.log("\n[6/6] SourceTag — empty label renders nothing, audit-mode chip");
{
  const src = read("client/src/components/ui/SourceTag.tsx");
  assert(/if\s*\(!trimmed\)\s*return\s+null/.test(src), "empty label returns null");
  assert(src.includes("auditMode"), "uses auditMode from context");
  assert(/source-tag-ref/.test(src), "internalRef gets its own sub-testid");
}

console.log(`\n→ ${passed} passed, ${failed} failed (of ${passed + failed} assertions)`);
if (failed > 0) process.exit(1);
