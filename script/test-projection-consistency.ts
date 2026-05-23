/**
 * Projection Consistency Guard
 *
 * Source-of-truth invariant for the Executive Overview rebuild V2:
 *
 *   The homepage must present exactly ONE primary long-term wealth
 *   projection — the canonical Monte Carlo P10/P50/P90 table — and that
 *   single table now lives inside `ExecutiveDashboard.tsx`'s
 *   CanonicalTrajectoryPanel. The dashboard homepage no longer renders any
 *   parallel/deterministic year-by-year projection table or competing
 *   Wealth Projection block.
 *
 * Static guards:
 *
 *   1. ExecutiveDashboard exposes the canonical MC projection table sourced
 *      from `monteCarloFanData` (which is the Monte Carlo `fan_data` array
 *      threaded through from the dashboard selector).
 *   2. The projection table defaults to Year / P50 / Confidence Range and
 *      keeps P10 / P90 columns behind an expand toggle.
 *   3. The dashboard homepage no longer renders any `<h2>Wealth Projection`
 *      block, no `<h3>Year-by-Year Projection (deterministic)` block, and
 *      no `monteCarloResult.fan_data.map` loop (single-source-of-truth lives
 *      inside ExecutiveDashboard now).
 *   4. The deterministic baseline section is no longer on the homepage.
 *   5. The MC fan data is wired through the canonical prop, not duplicated.
 */
import { readFileSync } from "fs";
import { join } from "path";

const DASHBOARD = readFileSync(
  join(process.cwd(), "client/src/pages/dashboard.tsx"),
  "utf8",
);
const EXEC_DASH = readFileSync(
  join(process.cwd(), "client/src/components/ExecutiveDashboard.tsx"),
  "utf8",
);

let pass = 0, fail = 0;
function run(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// 1. After the Executive Overview Projection Cleanup, the single canonical
//    analytical table on the homepage is the WealthProjectionTable — sourced
//    from `projectionRows` (canonical projectNetWorth engine). The Monte
//    Carlo P10/P50/P90 fan still drives the chart above; the compact P50
//    projection table is gone because it duplicated the fan.
run(
  "Executive Overview hosts the richer wealth projection table",
  /data-testid="wealth-projection-table-panel"/.test(EXEC_DASH),
  "Strategic Wealth Projection table missing from ExecutiveDashboard",
);
run(
  "Executive Overview renders projection rows (canonical engine) via rows.map",
  /rows\.map\(\(row,\s*idx\)\s*=>/.test(EXEC_DASH),
  "Richer table must iterate canonical projection rows",
);

// 2. Richer table exposes decision-grade columns sourced from the canonical
//    projectNetWorth engine (no parallel maths).
run(
  "Richer table surfaces Accessible NW + Total NW + CAGR + Growth columns",
  /Accessible NW/.test(EXEC_DASH) && /Total NW/.test(EXEC_DASH) &&
    /CAGR/.test(EXEC_DASH) && />Growth</.test(EXEC_DASH),
);
run(
  "Compact P50 projection table (and its expand toggle) are fully removed",
  !/data-testid="trajectory-projection-table"/.test(EXEC_DASH) &&
    !/data-testid="trajectory-expand-range"/.test(EXEC_DASH),
);

// 3. The homepage no longer renders any competing Wealth Projection block.
run(
  "Dashboard homepage no longer renders <h2>Wealth Projection</h2>",
  !/<h2[^>]*>\s*Wealth Projection\s*<\/h2>/.test(DASHBOARD),
);
run(
  "Dashboard homepage no longer loops over monteCarloResult.fan_data",
  !/monteCarloResult\.fan_data\.map/.test(DASHBOARD),
);
run(
  "Dashboard homepage no longer renders the SoT banner inline",
  !/data-testid=["']dashboard-projection-sot-banner["']/.test(DASHBOARD),
);

// 4. The deterministic baseline table is removed from the homepage.
run(
  "Deterministic baseline table is no longer on the homepage",
  !/Deterministic baseline \(advanced\)/.test(DASHBOARD) &&
    !/data-testid=["']dashboard-deterministic-toggle["']/.test(DASHBOARD),
);
run(
  "No <h3>Year-by-Year Projection (deterministic)</h3> on homepage",
  !/<h3[^>]*>\s*Year-by-Year Projection \(deterministic\)\s*<\/h3>/.test(
    DASHBOARD,
  ),
);

// 5. The MC fan data flows through the canonical prop wiring — no parallel
//    forecast engines, no duplicated array.
run(
  "Dashboard passes monteCarloFanData prop to ExecutiveDashboard",
  /monteCarloFanData:\s*monteCarloResult\?\.fan_data\s*\?\?\s*null/.test(
    DASHBOARD,
  ),
);
run(
  "Dashboard passes monteCarloSimulations prop to ExecutiveDashboard",
  /monteCarloSimulations:\s*monteCarloResult\?\.simulations\s*\?\?\s*null/.test(
    DASHBOARD,
  ),
);
run(
  "Executive Overview does NOT also import the dashboard's fan data loop",
  !/<h2[^>]*>\s*Wealth Projection\s*<\/h2>/.test(EXEC_DASH),
  "Executive uses its own compact projection header, not the legacy h2",
);

if (fail > 0) {
  console.error(
    `\ntest-projection-consistency: ${fail} failure(s), ${pass} passed`,
  );
  process.exit(1);
}
console.log(`\ntest-projection-consistency: ${pass} passed`);
