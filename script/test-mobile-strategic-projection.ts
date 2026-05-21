/**
 * test-mobile-strategic-projection.ts
 *
 * Run: npx tsx script/test-mobile-strategic-projection.ts
 *
 * Pins the responsive contract for the Strategic Wealth Projection table
 * plus the PWA install-banner overlay fix.
 *
 * Contract:
 *   1. Desktop dense table is rendered at md+ (`hidden md:block`) with every
 *      original column data-testid intact.
 *   2. Mobile (<md) renders a dedicated `ProjectionCardListMobile` component
 *      gated `block md:hidden`. This is a separate UI surface, NOT a
 *      compressed table.
 *   3. The mobile component file exists at
 *      `client/src/components/ProjectionCardListMobile.tsx` and exports a
 *      default React component.
 *   4. The mobile component's collapsed card header surfaces:
 *        Year · Total NW · Accessible NW · CAGR · Annual Growth
 *      and its expanded body surfaces:
 *        Cash · Liabilities · Property Equity · Stocks · Crypto · Super ·
 *        FIRE Capital · Liquidatable Wealth
 *   5. The mobile component does NOT call any projection engine, forecast
 *      store, regime calculator, or canonical-risk builder. It consumes
 *      `rows` (= `projectionRows`) + `layers` (= `wealthLayers`) from props.
 *   6. The mobile container in `ExecutiveDashboard.tsx` uses no `overflow-x`
 *      utility and renders no `<table>` element — so columns can never clip.
 *   7. Wealth-layers strip stays 2×2 on mobile / 1×4 on md+.
 *   8. The PWA install banner reserves bottom space via the
 *      `usePwaBannerVisible` hook, which subscribes to a
 *      `fwl-pwa-banner-visibility` custom event the banner dispatches when
 *      its visibility flips — so the spacer is in lockstep with the banner
 *      and can never overlay financial data.
 *   9. The banner uses `env(safe-area-inset-bottom)` so the iOS Safari home
 *      indicator does not push it over the projection cards.
 */

import fs from "node:fs";
import path from "node:path";

const tests: { name: string; run: () => void }[] = [];
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  tests.push({ name, run: fn });
}
function assert(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

const DASH = fs.readFileSync(
  path.resolve("client/src/components/ExecutiveDashboard.tsx"),
  "utf8",
);
const MOBILE_PATH = path.resolve(
  "client/src/components/ProjectionCardListMobile.tsx",
);
const MOBILE_EXISTS = fs.existsSync(MOBILE_PATH);
const MOBILE = MOBILE_EXISTS ? fs.readFileSync(MOBILE_PATH, "utf8") : "";
const BANNER = fs.readFileSync(
  path.resolve("client/src/components/PwaInstallBanner.tsx"),
  "utf8",
);
const LAYOUT = fs.readFileSync(
  path.resolve("client/src/components/Layout.tsx"),
  "utf8",
);

// 1. Desktop dense table preserved + gated `hidden md:block` ----------------

test("desktop dense table is preserved and gated `hidden md:block`", () => {
  assert(
    /<div className="hidden md:block overflow-x-auto">\s*<table[\s\S]*?data-testid="wealth-projection-table"/.test(DASH),
    "desktop table wrapper is `hidden md:block` (restored)",
  );
  // Reject any leftover lg-gated projection table from the previous attempt.
  assert(
    !/<div className="hidden lg:block overflow-x-auto">\s*<table[\s\S]*?wealth-projection-table/.test(DASH),
    "desktop projection table must NOT be gated at lg",
  );
  for (const col of [
    "col-accessible-nw",
    "col-total-nw",
    "col-cagr",
    "col-growth",
    "col-cash",
    "col-liabilities",
    "col-property-equity",
    "col-stocks",
    "col-crypto",
    "col-super",
  ]) {
    assert(
      DASH.includes(`data-testid="${col}"`),
      `desktop column ${col} retained`,
    );
  }
});

// 2. Mobile container gated `block md:hidden` -------------------------------

test("mobile section is gated `block md:hidden` and renders the new component", () => {
  assert(
    /<div className="block md:hidden"[^>]*data-testid="wealth-projection-mobile-wrapper"/.test(DASH),
    "mobile wrapper is `block md:hidden` with the expected testid",
  );
  assert(
    /<ProjectionCardListMobile[\s\S]*?rows=\{rows\}[\s\S]*?layers=\{layers\}[\s\S]*?startNW=\{startNW\}/.test(DASH),
    "ExecutiveDashboard passes canonical rows + layers + startNW props",
  );
  assert(
    /import ProjectionCardListMobile from ['"]@\/components\/ProjectionCardListMobile['"]/.test(DASH),
    "ExecutiveDashboard imports the new mobile component",
  );
});

// 3. Separate mobile component file --------------------------------------

test("ProjectionCardListMobile.tsx exists as a separate component", () => {
  assert(MOBILE_EXISTS, "client/src/components/ProjectionCardListMobile.tsx exists");
  assert(
    /export default function ProjectionCardListMobile/.test(MOBILE),
    "exports default ProjectionCardListMobile component",
  );
  assert(
    /rows: WealthProjectionRow\[\]/.test(MOBILE) &&
      /layers: WealthLayers \| null/.test(MOBILE),
    "props are typed against the canonical WealthProjectionRow + WealthLayers",
  );
});

// 4. Collapsed + expanded label contract ------------------------------------

test("mobile collapsed header surfaces Year · Total NW · Accessible NW · CAGR · Growth", () => {
  for (const tid of [
    "mobile-summary-total-nw",
    "mobile-summary-accessible-nw",
    "mobile-summary-cagr",
    "mobile-summary-growth",
  ]) {
    assert(
      MOBILE.includes(`data-testid="${tid}"`),
      `collapsed chip ${tid} present`,
    );
  }
  // Year appears as the leading label.
  assert(
    /\{row\.year\}\s*\n?\s*\{isFirst \? " ★" : ""\}/.test(MOBILE) ||
      /\{row\.year\}\{isFirst \? " ★" : ""\}/.test(MOBILE),
    "year leads the collapsed header",
  );
});

test("mobile expanded body surfaces every required label", () => {
  for (const label of [
    ">Cash<",
    ">Liabilities<",
    ">Property Equity<",
    ">Stocks<",
    ">Crypto<",
    ">Super<",
    ">FIRE Capital<",
    ">Liquidatable Wealth<",
  ]) {
    assert(MOBILE.includes(label), `expanded body has label ${label}`);
  }
});

// 5. No engine calls in mobile component -----------------------------------

test("ProjectionCardListMobile contains no engine / store / regime calls", () => {
  for (const forbidden of [
    "projectNetWorth",
    "computeWealthLayers",
    "buildCanonicalRiskSurface",
    "useForecastStore",
    "computeFireCapital",
  ]) {
    assert(
      !MOBILE.includes(forbidden),
      `mobile component must not call ${forbidden}`,
    );
  }
});

// 6. No overflow-x and no <table> in the mobile region ---------------------

test("mobile region uses no overflow-x and renders no <table>", () => {
  // Locate the mobile wrapper region inside ExecutiveDashboard.
  const startIdx = DASH.indexOf('data-testid="wealth-projection-mobile-wrapper"');
  const endIdx = DASH.indexOf('hidden md:block overflow-x-auto', startIdx);
  assert(startIdx > 0 && endIdx > startIdx, "mobile + desktop boundaries located");
  const region = DASH.slice(startIdx, endIdx);
  assert(!/overflow-x/.test(region), "no overflow-x in the mobile region");
  assert(!/<table/.test(region), "no <table> in the mobile region");
  // And in the standalone component file itself.
  assert(!/<table/.test(MOBILE), "no <table> inside ProjectionCardListMobile");
  assert(!/overflow-x/.test(MOBILE), "no overflow-x inside ProjectionCardListMobile");
});

// 7. Wealth layers strip 2×2 mobile / 1×4 md+ -------------------------------

test("wealth layers strip renders 2×2 on mobile and 1×4 on md+", () => {
  assert(
    /grid grid-cols-2 md:grid-cols-4/.test(DASH),
    "layers strip declared `grid-cols-2 md:grid-cols-4`",
  );
  assert(
    /md:divide-x md:divide-border\/25/.test(DASH),
    "row-level dividers gated to md+",
  );
  assert(
    /border-r border-border\/25 md:border-r-0/.test(DASH) &&
      /border-b border-border\/25 md:border-b-0/.test(DASH),
    "per-cell borders only fire below md",
  );
});

// 8. PWA banner visibility hook subscribes to a custom event ---------------

test("usePwaBannerVisible subscribes to `fwl-pwa-banner-visibility` event", () => {
  assert(
    BANNER.includes("fwl-pwa-banner-visibility"),
    "banner module references the visibility event",
  );
  assert(
    /window\.addEventListener\("fwl-pwa-banner-visibility"/.test(BANNER) ||
      /window\.addEventListener\(VISIBILITY_EVENT/.test(BANNER),
    "hook adds the visibility event listener",
  );
  assert(
    /window\.dispatchEvent\(\s*new CustomEvent\("fwl-pwa-banner-visibility"/.test(BANNER),
    "banner component dispatches the visibility event when it flips",
  );
});

// 9. Banner uses safe-area + Layout reserves matching spacer ----------------

test("banner honours `env(safe-area-inset-bottom)` and Layout reserves a safe-area spacer", () => {
  assert(
    /env\(safe-area-inset-bottom/.test(BANNER),
    "banner bottom respects env(safe-area-inset-bottom)",
  );
  assert(
    /pb-\[calc\(8rem\+env\(safe-area-inset-bottom,0px\)\)\]/.test(LAYOUT),
    "Layout's reserved spacer uses safe-area + 8rem and is gated on pwaVisible",
  );
  assert(
    /data-pwa-banner-active=\{pwaVisible \? "true" : "false"\}/.test(LAYOUT),
    "Layout exposes data-pwa-banner-active so QA can assert the spacer is active",
  );
});

// ─── Runner ────────────────────────────────────────────────────────────────

for (const t of tests) {
  try {
    t.run();
    passed++;
    console.log(`  ✓ ${t.name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${t.name}`);
    console.log(`    ${err.message}`);
  }
}

console.log(`\n${passed}/${tests.length} tests passed`);
if (failed > 0) process.exit(1);
