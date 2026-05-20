/**
 * test-mobile-strategic-projection.ts
 *
 * Run: npx tsx script/test-mobile-strategic-projection.ts
 *
 * Pins the responsive fix for the Strategic Wealth Projection table:
 *   1. Desktop dense table is only rendered at lg+ (`hidden lg:block`) so it
 *      cannot clip at tablet widths (768–1023px).
 *   2. Mobile + tablet (<lg) render expandable yearly cards (`lg:hidden`
 *      container with the `MobileProjectionCard` component).
 *   3. Card collapsed header surfaces: year, total NW, accessible NW, CAGR,
 *      annual growth.
 *   4. Card expanded body surfaces: cash, debt, property equity, stocks,
 *      crypto, super, FIRE Capital, Liquidatable Wealth.
 *   5. No `overflow-x` is used on the mobile/tablet container (no sideways
 *      scroll, no clipped Property Equity / Stocks columns).
 *   6. Wealth layers strip renders as a clean 2×2 metric grid on mobile +
 *      tablet (<lg) and 1×4 on lg+.
 *   7. Smooth expand/collapse animation is wired (grid-rows transition + a
 *      transition on the chevron).
 *   8. Canonical data is reused (no parallel projection engine): the mobile
 *      cards consume `projectionRows` + `wealthLayers` — the same props the
 *      desktop table reads.
 *   9. The card container never renders a `<table>` element.
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

// 1. Desktop dense table preserved AND only renders at lg+ -------------------

test("desktop dense table is preserved verbatim and gated to lg+", () => {
  // Wrapper now `hidden lg:block` so it only renders at desktop (>=1024px).
  // Tablet (768–1023px) must NOT render the dense table.
  assert(
    /<div className="hidden lg:block overflow-x-auto">[\s\S]*?<table[\s\S]*?data-testid="wealth-projection-table"/.test(SRC),
    "desktop table wrapper is `hidden lg:block` and table testid intact",
  );
  // Guard: no `hidden md:block` wrapper left behind for the projection table.
  assert(
    !/<div className="hidden md:block overflow-x-auto">\s*<table[\s\S]*?wealth-projection-table/.test(SRC),
    "projection table is NOT gated at md — must be lg",
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

// 2. Mobile + tablet expandable card component exists ------------------------

test("mobile + tablet uses an expandable card component (no wide table)", () => {
  assert(SRC.includes("function MobileProjectionCard("), "MobileProjectionCard component defined");
  assert(
    /<div\s+className="lg:hidden divide-y[^"]*"\s+data-testid="wealth-projection-mobile"/.test(SRC),
    "card container is lg:hidden (covers mobile + tablet) and uses divide-y",
  );
  assert(
    SRC.includes("<MobileProjectionCard"),
    "card container renders MobileProjectionCard per row",
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

// 5. No overflow-x on the mobile/tablet card path ---------------------------

test("card container does NOT use any horizontal overflow scroll", () => {
  const mobileIdx = SRC.indexOf('data-testid="wealth-projection-mobile"');
  assert(mobileIdx > 0, "card container located");
  // The desktop wrapper lives in the next sibling div with `hidden lg:block`.
  const desktopIdx = SRC.indexOf('hidden lg:block overflow-x-auto', mobileIdx);
  assert(desktopIdx > mobileIdx, "desktop wrapper sibling located");
  const cardRegion = SRC.slice(mobileIdx, desktopIdx);
  assert(
    !/overflow-x/.test(cardRegion),
    "card region must not include any overflow-x utility (no clipped columns)",
  );
});

// 6. 2×2 wealth layers grid on mobile + tablet -------------------------------

test("wealth layers strip renders 2×2 on mobile + tablet and 1×4 on lg+", () => {
  assert(
    /grid grid-cols-2 lg:grid-cols-4/.test(SRC),
    "layers strip declared `grid-cols-2 lg:grid-cols-4` (2×2 through tablet)",
  );
  // The row-level dividers only kick in at lg+.
  assert(
    /lg:divide-x lg:divide-border\/25/.test(SRC),
    "row-level dividers gated to lg+",
  );
  // Mobile/tablet per-cell borders must be `lg:border-r-0` / `lg:border-b-0`.
  assert(
    /border-r border-border\/25 lg:border-r-0/.test(SRC) &&
      /border-b border-border\/25 lg:border-b-0/.test(SRC),
    "per-cell borders only fire below lg",
  );
  // All four canonical layers still emitted as cells.
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

test("card cells consume the SAME canonical projection rows + layers as desktop", () => {
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

// 9. Card region must not contain a <table> element --------------------------

test("card region does NOT render a <table> (no clipped columns possible)", () => {
  const mobileIdx = SRC.indexOf('data-testid="wealth-projection-mobile"');
  const desktopIdx = SRC.indexOf('hidden lg:block overflow-x-auto', mobileIdx);
  const cardRegion = SRC.slice(mobileIdx, desktopIdx);
  assert(
    !/<table/.test(cardRegion),
    "card region must not contain a <table>",
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
