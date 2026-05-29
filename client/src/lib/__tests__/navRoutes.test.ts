/**
 * navRoutes.test.ts — Sprint 30A addendum A1.
 *
 * Asserts every NAV_STEPS / SECONDARY_LINKS / SYSTEM_LINKS href in
 * `client/src/components/Layout.tsx` has a real `<Route>` binding in
 * `client/src/App.tsx` AND does not redirect to another navigation href.
 *
 * Run: npx tsx client/src/lib/__tests__/navRoutes.test.ts
 *
 * Defect-class targeted: Sprint 20 PR-E added redirects from primary nav
 * entries (`/wealth-strategy`, `/ai-forecast-engine`) to OTHER primary
 * nav entries — two nav buttons resolved to the same page. Legacy
 * redirects from non-nav URLs (e.g. `/monte-carlo`) are allowed.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { NAV_STEPS, SECONDARY_LINKS, SYSTEM_LINKS } from "../../components/Layout";

const THIS_FILE = fileURLToPath(import.meta.url);
const THIS_DIR = dirname(THIS_FILE);

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

// Each navigable href is something we expect users to click. Group-header
// items carry href: "" — those are not routes and are excluded.
function collectNavHrefs(): string[] {
  const fromGroups = NAV_STEPS.flatMap((g) => g.items.map((i) => i.href));
  const fromSecondary = SECONDARY_LINKS.map((i) => i.href);
  const fromSystem = SYSTEM_LINKS.map((i) => i.href);
  return [...fromGroups, ...fromSecondary, ...fromSystem].filter((h) => typeof h === "string" && h.length > 0);
}

// Crude but adequate App.tsx parser. The file is hand-authored TSX with
// regular Route shapes; we read it verbatim and scan for:
//   <Route path="…"> … </Route>
// inside each, classify the body as either:
//   - "redirect:<target>"  if the body contains <Redirect to="…">
//   - "component"          otherwise (assume it renders a real component)
interface RouteBinding { path: string; kind: "redirect" | "component"; redirectTo?: string; }

function parseAppRoutes(appTsx: string): RouteBinding[] {
  const out: RouteBinding[] = [];
  const re = /<Route\s+path="([^"]+)"\s*>([\s\S]*?)<\/Route>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(appTsx)) !== null) {
    const path = m[1]!;
    const body = m[2] ?? "";
    const redirMatch = body.match(/<Redirect\s+to="([^"]+)"\s*\/?>/);
    if (redirMatch) {
      out.push({ path, kind: "redirect", redirectTo: redirMatch[1] });
    } else {
      out.push({ path, kind: "component" });
    }
  }
  // Also pick up self-closing <Route path="…"><Redirect ... /></Route> with
  // unusual whitespace — the regex above already handles all observed cases.
  return out;
}

console.log("\nnavRoutes — every nav href routes to a non-redirecting page");

const APP_TSX_PATH = join(THIS_DIR, "..", "..", "App.tsx");
const appText = readFileSync(APP_TSX_PATH, "utf8");
const routes = parseAppRoutes(appText);
const byPath = new Map<string, RouteBinding>();
for (const r of routes) byPath.set(r.path, r);

const navHrefs = collectNavHrefs();
const navHrefsSet = new Set(navHrefs);

// 1. Every nav href has a Route binding
for (const href of navHrefs) {
  check(`route exists for nav href ${href}`, byPath.has(href));
}

// 2. No nav href is a redirect TO another nav href
for (const href of navHrefs) {
  const binding = byPath.get(href);
  if (!binding) continue; // already failed above
  if (binding.kind === "redirect") {
    const tgt = binding.redirectTo ?? "";
    const isNavToNav = navHrefsSet.has(tgt);
    check(
      `nav href ${href} is not a nav→nav redirect`,
      !isNavToNav,
      `${href} → ${tgt}`,
    );
  } else {
    check(`nav href ${href} resolves to a component (not a redirect)`, binding.kind === "component");
  }
}

// 3. The two known defects from Sprint 20 PR-E are fixed
check(
  "A1: /ai-forecast-engine renders a component (not a redirect)",
  byPath.get("/ai-forecast-engine")?.kind === "component",
);
check(
  "A1: /wealth-strategy renders a component (not a redirect)",
  byPath.get("/wealth-strategy")?.kind === "component",
);

// 4. Sanity — legacy redirects from non-nav URLs are still permitted
const legacyRedirects = routes.filter((r) => r.kind === "redirect" && !navHrefsSet.has(r.path));
check(
  "legacy non-nav redirects still allowed",
  legacyRedirects.length > 0,
  `${legacyRedirects.length} legacy redirects (e.g. /monte-carlo → /ai-forecast-engine)`,
);

// 5. NAV_STEPS contains exactly 4 workflow groups (TODAY / PLAN / FORECAST / MOVE)
check("NAV_STEPS has 4 groups", NAV_STEPS.length === 4);
const expectedIds = ["today", "plan", "forecast", "move"];
check(
  "NAV_STEPS group ids match expected workflow",
  NAV_STEPS.map((g) => g.id).join(",") === expectedIds.join(","),
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
