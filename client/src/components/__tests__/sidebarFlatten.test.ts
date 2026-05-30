/**
 * sidebarFlatten.test.ts — Sprint 20 PR-H regression guard.
 *
 * Static-source check on Layout.tsx that locks in the flattened IA:
 *   • Exactly 4 top-level expandable groups (TODAY, PLAN, FORECAST, MOVE).
 *   • The 5 removed parent groups (Wealth Strategy, Forecast Engine, Tax
 *     Strategy, Financial Strategy, Scenario Lab) must NOT reappear as
 *     accordion parents (i.e. labels that sit in the source next to a
 *     `groupId` / `toggleGroup` / `kind: "group"` pattern).
 *   • Each child label from the spec table is paired with a non-empty
 *     `href:` route string in the source.
 *   • Initial expansion state for all four top-level groups is `false`.
 *
 * Run with:
 *   npx tsx client/src/components/__tests__/sidebarFlatten.test.ts
 *   npm test -- sidebarFlatten
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LAYOUT_PATH = join(__dirname, "..", "Layout.tsx");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const rawSrc = readFileSync(LAYOUT_PATH, "utf8");

/** Strip // line comments and /* block comments before scanning so test
 *  intent reflects shipped code, not commentary. */
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const src = stripComments(rawSrc);

// ─── 1. Top-level groups assertion ────────────────────────────────────────────
// Exactly the four uppercase labels appear as `label: "<NAME>"` in NAV_STEPS.

const TOP_LABELS = ["TODAY", "PLAN", "FORECAST", "MOVE"];
console.log("\n── Top-level groups ──");
for (const lbl of TOP_LABELS) {
  const re = new RegExp(`label:\\s*"${lbl}"`);
  check(`NAV_STEPS contains top-level group label "${lbl}"`, re.test(src));
}

// No OTHER all-caps top-level label slipped in. We allow lowercase or
// title-case labels (child link labels), but any extra ALL-CAPS string of
// 3-12 letters used in `label: "..."` would be suspect.
{
  const allLabelMatches = Array.from(src.matchAll(/label:\s*"([^"]+)"/g)).map(m => m[1]);
  const extraAllCaps = allLabelMatches.filter(
    l => /^[A-Z]{3,12}$/.test(l) && !TOP_LABELS.includes(l),
  );
  check(
    `no unexpected ALL-CAPS top-level label (found: ${JSON.stringify(extraAllCaps)})`,
    extraAllCaps.length === 0,
  );
}

// ─── 2. Removed accordion parents must not reappear as groups ────────────────
// "Wealth Strategy", "Forecast Engine", "Tax Strategy", "Financial Strategy",
// "Scenario Lab" — none of these labels may sit next to a group-accordion
// pattern (kind: "group", groupId:, or a toggleGroup callsite).

console.log("\n── Removed accordion parents ──");

const REMOVED_PARENTS = [
  "Wealth Strategy",
  "Forecast Engine",
  "Tax Strategy",
  "Financial Strategy",
  "Scenario Lab",
];

// No `kind: "group"` literal ANYWHERE in Layout.tsx — the entire group-
// accordion machinery was removed in PR-H.
check(
  `no \`kind: "group"\` literals remain in Layout.tsx`,
  !/kind:\s*"group"/.test(src),
);

// No `groupId:` property on any NavItem.
check(
  `no \`groupId:\` properties remain on NavItem entries`,
  !/\bgroupId:\s*"/.test(src),
);

// No `toggleGroup` callsite or declaration.
check(
  `no \`toggleGroup\` callsite or declaration remains`,
  !/\btoggleGroup\b/.test(src),
);

// No `openGroups` state.
check(
  `no \`openGroups\` state remains`,
  !/\bopenGroups\b/.test(src),
);

// For each removed parent label: if it appears at all, it must be alongside
// an `href: "..."` route reference and NOT alongside a group-toggle pattern.
for (const lbl of REMOVED_PARENTS) {
  const labelRe = new RegExp(`label:\\s*"${lbl}"`, "g");
  const matches = Array.from(src.matchAll(labelRe));
  if (matches.length === 0) {
    check(`"${lbl}" — not present as accordion parent`, true);
    continue;
  }
  // For each occurrence, scan the surrounding ±200 chars for a route
  // reference AND for any forbidden group-toggle keyword.
  for (const m of matches) {
    const idx = m.index ?? 0;
    const window_ = src.slice(Math.max(0, idx - 200), idx + 200);
    const hasRoute = /href:\s*"\/[^"]+"/.test(window_);
    const hasGroupPattern = /kind:\s*"group"|groupId:|toggleGroup\(/.test(window_);
    check(
      `"${lbl}" appears next to a route (href:"/...") and NOT a group-toggle pattern`,
      hasRoute && !hasGroupPattern,
    );
  }
}

// ─── 3. Children direct-link assertion ────────────────────────────────────────
// Every child label from the spec table must appear paired with an
// `href: "/<route>"` (i.e. a real link, not a group header).

console.log("\n── Children direct-link routes ──");

const CHILDREN: Array<{ label: string; route: string }> = [
  { label: "Executive Overview",  route: "/dashboard"          },
  { label: "Income & Expenses",   route: "/expenses"           },
  { label: "Monthly Budget",      route: "/budget"             },
  { label: "Recurring Bills",     route: "/recurring-bills"    },
  { label: "Family Plan",         route: "/financial-plan"     },
  { label: "Wealth Strategy",     route: "/wealth-strategy"    },
  { label: "Property",            route: "/property"           },
  { label: "Stocks",              route: "/stocks"             },
  { label: "Crypto",              route: "/crypto"             },
  { label: "Debt Strategy",       route: "/debt-strategy"      },
  { label: "Tax Strategy",        route: "/tax"                },
  { label: "CGT Simulator",       route: "/cgt-simulator"      },
  { label: "Net Worth Timeline",  route: "/timeline"           },
  { label: "Forecast Engine",     route: "/ai-forecast-engine" },
  { label: "Scenario Compare",    route: "/scenario-compare"   },
  // Sprint 30A A1: "Action Plan" removed from the sidebar (was duplicating
  // Decision Lab / Action Roadmap). The Decision Lab entry remains.
  { label: "Decision Lab",        route: "/decision-lab"       },
];

for (const c of CHILDREN) {
  // The NavItem entry shape is `{ href: "<route>", label: "<label>", ... }`
  // — they sit on the same logical row separated by other props/icon, but
  // the same JSON-ish object literal. Scan for both within a tight ±200 char
  // window keyed off the route. This is robust against minor reformatting.
  const idx = src.indexOf(`href: "${c.route}"`);
  if (idx === -1) {
    check(`child "${c.label}" — has nav entry with href: "${c.route}"`, false, "route not found");
    continue;
  }
  const window_ = src.slice(idx, idx + 240);
  const hasLabel = window_.includes(`label: "${c.label}"`);
  check(
    `child "${c.label}" — paired with href: "${c.route}"`,
    hasLabel,
  );
}

// ─── 4. Default-state assertion: all 4 groups COLLAPSED on fresh load ────────

console.log("\n── Initial expansion state ──");

// The state declaration in Layout.tsx is the openSections useState initializer:
//   const initial: Record<string, boolean> = {
//     today: false, plan: false, forecast: false, move: false,
//   };
// Locate the literal and assert each of the 4 group ids maps to `false`.
{
  const initBlockMatch = src.match(
    /const\s+initial[^=]*=\s*{([\s\S]*?)}\s*;/,
  );
  check(
    "openSections initial state literal found",
    !!initBlockMatch,
  );
  if (initBlockMatch) {
    const body = initBlockMatch[1];
    for (const id of ["today", "plan", "forecast", "move"]) {
      const re = new RegExp(`\\b${id}\\s*:\\s*false\\b`);
      check(`initial.${id} === false`, re.test(body));
    }
    // And there must be NO `true` value in the initial block — that would
    // mean some group ships open by default.
    check(
      "no group is initialised to `true`",
      !/:\s*true\b/.test(body),
    );
  }
}

// ─── 5. No-financial-touch assertion (informational from this file) ──────────
// The full check is performed via `git diff --name-only main...HEAD` in CI /
// the PR description manual step (see spec). Here we make a weaker assertion:
// Layout.tsx itself must not import anything from the finance / FIRE engines
// or the canonical-FIRE types module. (Layout has never needed these; if a
// future change pulls them in, this guard fires.)

console.log("\n── No-financial-touch (import scope) ──");

const FORBIDDEN_LAYOUT_IMPORTS = [
  "@/lib/canonicalFire",
  "@/lib/fireGoal",
  "@/lib/monteCarlo",
  "@/lib/recommendationEngine",
  "@/lib/buildCanonicalAuditTrace",
  "@/lib/legacyBestMoveToRecommendation",
  "@/types/canonicalFire",
  "@/hooks/useFireSettingsRow",
];
for (const mod of FORBIDDEN_LAYOUT_IMPORTS) {
  check(
    `Layout.tsx does not import "${mod}"`,
    !rawSrc.includes(`from "${mod}"`),
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);
