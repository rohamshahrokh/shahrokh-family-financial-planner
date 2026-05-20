/**
 * test-mobile-strategic-projection.ts
 *
 * Run: npx tsx script/test-mobile-strategic-projection.ts
 *
 * Pins the mobile-responsive fix for the Strategic Wealth Projection table:
 *   1. Desktop dense table is preserved (`hidden md:block` wrapper + every
 *      original column header still present).
 *   2. Mobile renders expandable yearly cards (`md:hidden` container with the
 *      `MobileProjectionCard` component).
 *   3. Card collapsed header surfaces: year, total NW, accessible NW, CAGR,
 *      annual growth.
 *   4. Card expanded body surfaces: cash, debt, property equity, stocks,
 *      crypto, super, FIRE Capital, Liquidatable Wealth.
 *   5. No `overflow-x` is used on the mobile container (no sideways scroll).
 *   6. Wealth layers strip renders as a clean 2×2 metric grid on mobile and
 *      1×4 on md+.
 *   7. Smooth expand/collapse animation is wired (grid-rows transition + a
 *      transition on the chevron).
 *   8. Canonical data is reused (no parallel projection engine): the mobile
 *      cards consume `projectionRows` + `wealthLayers` — the same props the
 *      desktop table reads.
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

const SRC = fs.readFileSync(
  path.resolve("client/src/components/ExecutiveDashboard.tsx"),
  "utf8",
);

// 1. Desktop dense table preserved ------------------------------------------

test("desktop dense table is preserved verbatim", () => {
  // Wrapper still gated `hidden md:block` so it only renders on md+.
  assert(
    /<div className="hidden md:block overflow-x-auto">[\s\S]*?<table[\s\S]*?data-testid="wealth-projection-table"/.test(SRC),
    "desktop table wrapper + table testid intact",
  );
  // Every original column header is still present.
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
    assert(SRC.includes(`data-testid="${col}"`), `desktop column ${col} retained`);
  }
});

// 2. Mobile expandable card component exists --------------------------------

test("mobile uses an expandable card component (no wide table)", () => {
  assert(SRC.includes("function MobileProjectionCard("), "MobileProjectionCard component defined");
  assert(
    /<div\s+className="md:hidden divide-y[^"]*"\s+data-testid="wealth-projection-mobile"/.test(SRC),
    "mobile container is md:hidden and uses divide-y (no horizontal table)",
  );
  assert(
    SRC.includes("<MobileProjectionCard"),
    "mobile container renders MobileProjectionCard per row",
  );
});

// 3. Collapsed header content -----------------------------------------------

test("collapsed card header surfaces year, total NW, accessible NW, CAGR, growth", () => {
  assert(SRC.includes('data-testid="mobile-summary-total-nw"'), "total NW chip present");
  assert(SRC.includes('data-testid="mobile-summary-accessible-nw"'), "accessible NW chip present");
  assert(SRC.includes('data-testid="mobile-summary-cagr"'), "CAGR chip present");
  assert(SRC.includes('data-testid="mobile-summary-growth"'), "growth chip present");
  // Year appears as the leading label.
  assert(
    /\{row\.year\}\{isFirst \? ' ★' : ''\}/.test(SRC),
    "year is rendered at the leading position of the summary",
  );
});

// 4. Expanded body content --------------------------------------------------

test("expanded card body shows every required field", () => {
  // Lift the MobileProjectionCard body just to be defensive against test-fragility.
  const start = SRC.indexOf("function MobileProjectionCard(");
  const end = SRC.indexOf("function WealthProjectionTable(");
  const body = SRC.slice(start, end);
  for (const label of [
    ">Cash<",
    ">Debt<",
    ">Property equity<",
    ">Stocks<",
    ">Crypto<",
    ">Super<",
    ">FIRE Capital<",
    ">Liquidatable Wealth<",
  ]) {
    assert(body.includes(label), `expanded body has label ${label}`);
  }
});

// 5. No overflow-x on the mobile path ---------------------------------------

test("mobile container does NOT use any horizontal overflow scroll", () => {
  // Pull out the mobile container's region: from the data-testid up to its
  // closing </div>. The desktop wrapper (overflow-x-auto) lives in a separate
  // sibling div with `hidden md:block` and must NOT bleed into the mobile path.
  const mobileIdx = SRC.indexOf('data-testid="wealth-projection-mobile"');
  assert(mobileIdx > 0, "mobile container located");
  // Find the matching `<div ...md:hidden...>` start, then its sibling boundary
  // (the next `<div className="hidden md:block`).
  const desktopIdx = SRC.indexOf('hidden md:block overflow-x-auto', mobileIdx);
  const mobileRegion = SRC.slice(mobileIdx, desktopIdx > 0 ? desktopIdx : mobileIdx + 4000);
  assert(
    !/overflow-x/.test(mobileRegion),
    "mobile region must not include any overflow-x utility",
  );
});

// 6. 2×2 wealth layers grid on mobile ---------------------------------------

test("wealth layers strip renders 2×2 on mobile and 1×4 on desktop", () => {
  assert(
    /grid grid-cols-2 md:grid-cols-4/.test(SRC),
    "layers strip declared `grid-cols-2 md:grid-cols-4`",
  );
  // All four canonical layers are still individual cells.
  for (const id of ["gross", "accessible", "liquidatable", "fire"]) {
    assert(
      SRC.includes(`data-testid={\`wealth-layer-\${layer.id}\`}`) ||
        SRC.includes(`wealth-layer-${id}`),
      `layer ${id} cell still emitted`,
    );
  }
});

// 7. Smooth expand/collapse animation ---------------------------------------

test("expand/collapse uses a smooth animation (grid-rows transition + chevron rotate)", () => {
  assert(
    /transition-\[grid-template-rows\][\s\S]*?gridTemplateRows: open \? '1fr' : '0fr'/.test(SRC),
    "grid-rows 0fr→1fr transition applied",
  );
  assert(
    /rotate-90/.test(SRC) && /transition-transform/.test(SRC),
    "chevron uses a transform transition for visual affordance",
  );
});

// 8. Canonical data reused (no parallel engine) -----------------------------

test("mobile cards consume the SAME canonical projection rows + layers as desktop", () => {
  // Both the desktop table and the mobile container map over the same `rows`
  // collection (which is `p.projectionRows`).
  assert(
    /const rows = p\.projectionRows;/.test(SRC),
    "projection rows sourced from props (canonical engine)",
  );
  assert(
    /const layers = p\.wealthLayers \?\? null;/.test(SRC),
    "wealth layers sourced from props (canonical engine)",
  );
  // MobileProjectionCard does not call any projection / engine function.
  const start = SRC.indexOf("function MobileProjectionCard(");
  const end = SRC.indexOf("function WealthProjectionTable(");
  const body = SRC.slice(start, end);
  for (const forbidden of [
    "projectNetWorth",
    "computeWealthLayers",
    "buildCanonicalRiskSurface",
    "useForecastStore",
  ]) {
    assert(
      !body.includes(forbidden),
      `MobileProjectionCard must not call ${forbidden} (no parallel maths)`,
    );
  }
});

// 9. The mobile container must not contain a <table> element -----------------

test("mobile container does NOT render a <table> (no clipped columns possible)", () => {
  const mobileIdx = SRC.indexOf('data-testid="wealth-projection-mobile"');
  const desktopIdx = SRC.indexOf('hidden md:block overflow-x-auto', mobileIdx);
  const mobileRegion = SRC.slice(mobileIdx, desktopIdx);
  assert(
    !/<table/.test(mobileRegion),
    "mobile region must not contain a <table>",
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
