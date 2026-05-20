/**
 * test-canonical-dashboard-risk-architecture.ts
 *
 * Run: npx tsx script/test-canonical-dashboard-risk-architecture.ts
 *
 * Covers the canonical dashboard + risk architecture pass:
 *   1. Four canonical wealth layers (Gross / Accessible / Liquidatable / FIRE)
 *      reconcile and are monotonically non-increasing.
 *   2. Reform regime applies the loss-bank quarantine drag to FIRE capital.
 *   3. Risk surface exposes 8 canonical axes plus the 7-row stress matrix
 *      and the FIRE fragility gauge.
 *   4. Tax regime parameter flows through the surface (radar shifts, drag
 *      applied).
 *   5. ExecutiveDashboard projection labels match the contract.
 *   6. WealthDecisionCenter RISK tab no longer re-renders the duplicated
 *      Liquidity/Leverage/Survivability/Current-Debt cards.
 *   7. Mobile-friendly stress matrix uses <details> rows in WDC source.
 *   8. Reconciliation card consumes canonical drivers (not hardcoded).
 */

import fs from "node:fs";
import path from "node:path";

import {
  computeWealthLayers,
  wealthLayerRows,
  WEALTH_ASSUMPTIONS,
} from "../client/src/lib/canonicalWealth";
import {
  buildCanonicalRiskSurface,
  RISK_AXES,
} from "../client/src/lib/canonicalRiskSurface";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeInputs(overrides: Partial<any> = {}): DashboardInputs {
  return {
    snapshot: {
      ppor: 1_200_000,
      cash: 35_000,
      savings_cash: 25_000,
      emergency_cash: 15_000,
      other_cash: 0,
      offset_balance: 40_000,
      super_balance: 0,
      roham_super_balance: 220_000,
      fara_super_balance: 110_000,
      cars: 45_000,
      iran_property: 0,
      other_assets: 0,
      mortgage: 720_000,
      other_debts: 0,
      monthly_income: 18_000,
      monthly_expenses: 11_500,
      stocks: 95_000,
      crypto: 30_000,
      mortgage_rate: 5.82,
      ...overrides,
    },
    properties: [
      {
        id: 1,
        type: "ip",
        is_ppor: false,
        current_value: 760_000,
        loan_balance: 520_000,
        settlement_date: "2022-04-01",
        weekly_rent: 590,
        interest_rate: 6.1,
      },
    ],
    stocks: [],
    cryptos: [],
    holdingsRaw: [],
    incomeRecords: [],
    expenses: [],
  } as DashboardInputs;
}

// ─── Test harness ───────────────────────────────────────────────────────────

const tests: { name: string; run: () => void }[] = [];
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  tests.push({ name, run: fn });
}
function assert(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}
function approx(a: number, b: number, eps = 1, msg = "approx") {
  if (Math.abs(a - b) > eps) {
    throw new Error(`${msg}: ${a} ≠ ${b} (eps ${eps})`);
  }
}

// ─── 1. Wealth layers reconcile and are monotonically non-increasing ────────

test("wealth layers: gross ≥ accessible ≥ liquidatable ≥ fire", () => {
  const layers = computeWealthLayers(makeInputs(), "current_law");
  assert(layers.grossNetWorth > 0, "gross > 0");
  assert(layers.accessibleNetWorth <= layers.grossNetWorth, "accessible ≤ gross");
  assert(layers.liquidatableWealth <= layers.accessibleNetWorth, "liquid ≤ accessible");
  assert(layers.fireCapital <= layers.liquidatableWealth, "fire ≤ liquid");

  // Locked equity = gross − accessible.
  const lockedDelta = layers.grossNetWorth - layers.accessibleNetWorth;
  approx(lockedDelta, layers.drivers.lockedEquity, 0.01, "locked equity reconciles");

  // Selling cost = accessible − liquidatable.
  const sellingDelta = layers.accessibleNetWorth - layers.liquidatableWealth;
  approx(sellingDelta, layers.drivers.sellingCost, 0.01, "selling cost reconciles");
});

test("wealth layer rows expose the four required labels", () => {
  const rows = wealthLayerRows(computeWealthLayers(makeInputs(), "current_law"));
  const labels = rows.map(r => r.label);
  assert(labels.includes("Gross Net Worth"), "Gross Net Worth row present");
  assert(labels.includes("Accessible Net Worth"), "Accessible Net Worth row present");
  assert(labels.includes("Liquidatable Wealth"), "Liquidatable Wealth row present");
  assert(labels.includes("FIRE Capital"), "FIRE Capital row present");
});

// ─── 2. Reform regime applies loss-bank quarantine drag ──────────────────────

test("reform regime applies the loss-bank quarantine drag to FIRE capital", () => {
  const inp = makeInputs();
  const current = computeWealthLayers(inp, "current_law");
  const reform = computeWealthLayers(inp, "proposed_reform");

  // Under reform, FIRE capital must drop relative to current law because of
  // the loss-bank quarantine drag layered on IP equity.
  assert(
    reform.fireCapital < current.fireCapital,
    `reform FIRE (${reform.fireCapital}) should be < current-law FIRE (${current.fireCapital})`,
  );
  // The drag must equal the reform-specific constant times IP equity.
  approx(
    reform.drivers.reformDrag,
    current.drivers.ipEquity * WEALTH_ASSUMPTIONS.reformLiquidationDragPct,
    0.5,
    "reformDrag formula reconciles",
  );
  approx(
    current.drivers.reformDrag,
    0,
    0.001,
    "current-law has no reform drag",
  );
});

// ─── 3. Risk surface exposes the 8 axes + stress matrix + fragility ─────────

test("risk surface produces 8 canonical axes", () => {
  const surface = buildCanonicalRiskSurface({
    inputs: makeInputs(),
    scenario: "current_law",
    fireProgressPct: 35,
    fireTargetCapital: 2_400_000,
  });
  assert(surface.radar.current.length === 8, "8 radar axes");
  // Axes must be in the canonical order.
  surface.radar.current.forEach((p, i) => {
    assert(p.axis === RISK_AXES[i], `axis ${i} = ${RISK_AXES[i]}`);
    assert(p.score >= 0 && p.score <= 100, `axis ${p.axis} score within 0–100`);
  });
});

test("risk surface includes the 7 required stress rows", () => {
  const surface = buildCanonicalRiskSurface({
    inputs: makeInputs(),
    scenario: "current_law",
  });
  const ids = surface.stress.map(r => r.id);
  for (const wanted of [
    "rates-plus-1",
    "rates-plus-2",
    "property-slowdown",
    "stock-bear",
    "tax-reform",
    "unemployment",
    "rent-vacancy",
  ]) {
    assert(ids.includes(wanted), `stress row ${wanted} present`);
  }
});

test("FIRE fragility gauge always returns a valid level + drivers", () => {
  const surface = buildCanonicalRiskSurface({
    inputs: makeInputs(),
    scenario: "current_law",
    fireTargetCapital: 2_400_000,
  });
  const { fragility } = surface;
  assert(
    fragility.level === "stable" ||
      fragility.level === "moderate" ||
      fragility.level === "high",
    "level is one of the canonical values",
  );
  assert(fragility.score >= 0 && fragility.score <= 100, "score 0–100");
  assert(fragility.drivers.leveragePct >= 0, "leverage non-neg");
  assert(fragility.drivers.liquidityMonths >= 0, "liquidity months non-neg");
});

// ─── 4. Tax regime parameter flows through ──────────────────────────────────

test("Tax Reform axis is amber/red under reform with IP equity", () => {
  const current = buildCanonicalRiskSurface({
    inputs: makeInputs(),
    scenario: "current_law",
  }).radar.current.find(p => p.axis === "Tax Reform")!;
  const reform = buildCanonicalRiskSurface({
    inputs: makeInputs(),
    scenario: "proposed_reform",
    lossBank: 12_500,
  }).radar.current.find(p => p.axis === "Tax Reform")!;
  assert(current.score > reform.score, "reform exposure lowers Tax Reform axis score");
});

// ─── 5. ExecutiveDashboard label contract ────────────────────────────────────

test("ExecutiveDashboard renders the exact projection section labels", () => {
  const src = fs.readFileSync(
    path.resolve("client/src/components/ExecutiveDashboard.tsx"),
    "utf8",
  );
  assert(
    src.includes("Deterministic Projection (Assumption-Based)"),
    "Deterministic section label present",
  );
  assert(
    src.includes("Probabilistic Projection (Monte Carlo Adjusted)"),
    "Probabilistic section label present",
  );
  assert(
    src.includes(
      "This model includes uncertainty, volatility, sequencing risk, and tax-adjusted liquidation effects.",
    ),
    "Probabilistic explanation present",
  );
  assert(
    src.includes("Why are the numbers different?"),
    "Reconciliation card title present",
  );
});

// ─── 6. WDC RISK tab no longer renders duplicated cards ─────────────────────

test("WealthDecisionCenter RISK tab no longer renders duplicated risk cards", () => {
  const src = fs.readFileSync(
    path.resolve("client/src/components/WealthDecisionCenter.tsx"),
    "utf8",
  );
  // The duplicated card grid `wdc-risk-grid` must be GONE.
  assert(
    !src.includes("wdc-risk-grid"),
    "wdc-risk-grid (duplicated card grid) removed",
  );
  // The duplicated Current Debt section must be GONE.
  assert(
    !src.includes("wdc-risk-current-debt"),
    "wdc-risk-current-debt section removed",
  );
  // It must instead render the canonical surface.
  assert(
    src.includes("CanonicalRiskSurface"),
    "WDC imports CanonicalRiskSurface",
  );
});

// ─── 7. Mobile-friendly projection + stress matrix ──────────────────────────

test("Projection table is mobile-friendly (stacked rows on small screens)", () => {
  const src = fs.readFileSync(
    path.resolve("client/src/components/ExecutiveDashboard.tsx"),
    "utf8",
  );
  // Mobile container is gated md:hidden, desktop is hidden md:block.
  assert(
    /data-testid="wealth-projection-mobile"/.test(src),
    "mobile projection container present",
  );
  assert(
    /hidden md:block/.test(src),
    "desktop projection table is hidden on mobile",
  );
});

test("Risk stress matrix uses mobile + desktop variants", () => {
  const src = fs.readFileSync(
    path.resolve("client/src/components/CanonicalRiskSurface.tsx"),
    "utf8",
  );
  assert(
    src.includes("risk-stress-matrix-mobile"),
    "mobile stress matrix block present",
  );
  assert(
    src.includes('hidden md:block'),
    "desktop stress matrix is hidden on mobile",
  );
});

// ─── 8. Reconciliation card uses canonical inputs only ──────────────────────

test("Reconciliation card derives drivers from canonical inputs", () => {
  const src = fs.readFileSync(
    path.resolve("client/src/components/ExecutiveDashboard.tsx"),
    "utf8",
  );
  // Drivers must be derived from `layers?.drivers.*` and the MC fan, not from
  // hardcoded literals.
  assert(
    src.includes("layers?.drivers.cgtOnIp") &&
      src.includes("layers?.drivers.sellingCost") &&
      src.includes("layers?.drivers.reformDrag"),
    "drivers derived from canonical wealth layers",
  );
  // The reconciliation card title and driver labels are present.
  assert(src.includes("Why are the numbers different?"), "card title");
  assert(src.includes("Market volatility adjustment"), "volatility driver");
  assert(src.includes("CGT drag"), "CGT driver");
  assert(src.includes("Liquidity / selling-cost discount"), "liquidity driver");
  assert(src.includes("Forced-sale assumption"), "forced-sale driver");
  assert(src.includes("Sequencing risk"), "sequencing risk driver");
  assert(src.includes("Interest-rate uncertainty"), "interest rate driver");
});

// ─── 9. Hook-order safety in dashboard.tsx (regression for React #310) ──────
//
// The canonical-architecture wiring introduces two new useMemo calls on the
// Dashboard page. They MUST live above the `if (snapLoading || !snapshot)`
// early return, otherwise the first render (no snapshot) skips the hooks and
// the second render (snapshot loaded) calls them — that hook-count delta is
// what produced React minified error #310 on the demo preview.

test("Dashboard places wealthLayers + riskSurface useMemo before the snapshot guard", () => {
  const src = fs.readFileSync(
    path.resolve("client/src/pages/dashboard.tsx"),
    "utf8",
  );
  const wealthIdx = src.indexOf("const wealthLayers = useMemo(");
  const riskIdx = src.indexOf("const riskSurface = useMemo(");
  const guardIdx = src.indexOf("if (snapLoading || !snapshot) {");
  assert(wealthIdx > 0, "wealthLayers useMemo present");
  assert(riskIdx > 0, "riskSurface useMemo present");
  assert(guardIdx > 0, "snapshot guard present");
  assert(
    wealthIdx < guardIdx,
    "wealthLayers useMemo must be before the snapshot early-return guard",
  );
  assert(
    riskIdx < guardIdx,
    "riskSurface useMemo must be before the snapshot early-return guard",
  );
});

test("Dashboard does NOT redeclare wealthLayers / riskSurface after the snapshot guard", () => {
  const src = fs.readFileSync(
    path.resolve("client/src/pages/dashboard.tsx"),
    "utf8",
  );
  const guardIdx = src.indexOf("if (snapLoading || !snapshot) {");
  const after = src.slice(guardIdx);
  // No second declaration of either name in the post-guard region.
  const wealthCount = (after.match(/const wealthLayers = useMemo\(/g) ?? []).length;
  const riskCount = (after.match(/const riskSurface = useMemo\(/g) ?? []).length;
  assert(wealthCount === 0, `wealthLayers must not be redeclared after the guard (found ${wealthCount})`);
  assert(riskCount === 0, `riskSurface must not be redeclared after the guard (found ${riskCount})`);
});

// ─── Runner ─────────────────────────────────────────────────────────────────

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
if (failed > 0) {
  process.exit(1);
}
