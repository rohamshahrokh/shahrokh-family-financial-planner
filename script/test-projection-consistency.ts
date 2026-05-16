/**
 * Projection Consistency Guard
 *
 * Source-of-truth invariant: the Dashboard must present exactly ONE primary
 * long-term wealth projection — the canonical Monte Carlo table. The
 * deterministic year-by-year table is allowed to remain on Dashboard only
 * as a secondary, collapsed, clearly-labelled "deterministic baseline"
 * disclosure. It must not visually compete with Monte Carlo.
 *
 * This test is a static guard on `client/src/pages/dashboard.tsx`. It does
 * not execute the React app — it asserts that the file structure encodes
 * the source-of-truth contract that PR #24/#25 (Monte Carlo canonical +
 * V4) established:
 *
 *   1. Primary "Wealth Projection" <h2> exists and is sourced from
 *      `monteCarloResult.fan_data` (canonical Monte Carlo engine).
 *   2. Dashboard explicitly states it uses probabilistic Monte Carlo
 *      forecasting.
 *   3. Deterministic year-by-year table is gated behind a collapse
 *      toggle (`showDeterministicProjection`) and labelled as
 *      "not the official forecast".
 *   4. No second `<h2>` projection title competes with Monte Carlo.
 *   5. No parallel forecast engine writes to the canonical Dashboard
 *      projection table (only `monteCarloResult.fan_data` feeds it).
 */
import { readFileSync } from "fs";
import { join } from "path";

const DASHBOARD = readFileSync(
  join(process.cwd(), "client/src/pages/dashboard.tsx"),
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

// 1. Canonical Monte Carlo banner exists and asserts probabilistic SoT.
run(
  "Dashboard declares Monte Carlo as canonical forecast",
  /This dashboard uses probabilistic Monte Carlo forecasting\./.test(DASHBOARD),
  "missing canonical SoT banner copy",
);

run(
  "Dashboard SoT banner has a stable test id",
  /data-testid=["']dashboard-projection-sot-banner["']/.test(DASHBOARD),
  "missing data-testid hook",
);

// 2. Primary Wealth Projection <h2> exists and is rendered from
//    monteCarloResult.fan_data (the canonical Monte Carlo source).
const wealthH2Match = /<h2[^>]*>\s*Wealth Projection\s*<\/h2>/.test(DASHBOARD);
run("Primary <h2> 'Wealth Projection' present", wealthH2Match);

run(
  "Primary projection table is fed by monteCarloResult.fan_data",
  /monteCarloResult\.fan_data\.map/.test(DASHBOARD),
  "canonical Monte Carlo array not rendered",
);

// 3. Deterministic table must be collapsed, labelled, and demoted from <h2>
//    to <h3>.
run(
  "Deterministic projection is behind a collapse toggle",
  /showDeterministicProjection/.test(DASHBOARD),
  "no `showDeterministicProjection` gate — table is not collapsible",
);

run(
  "Deterministic toggle has stable test id",
  /data-testid=["']dashboard-deterministic-toggle["']/.test(DASHBOARD),
  "missing toggle test id",
);

run(
  "Deterministic table is labelled 'not the official forecast'",
  /not the official forecast/i.test(DASHBOARD),
  "missing demotion label",
);

run(
  "Deterministic baseline uses <h3> (demoted) — not <h2>",
  /<h3[^>]*>\s*Year-by-Year Projection \(deterministic\)\s*<\/h3>/.test(
    DASHBOARD,
  ),
  "deterministic header must not be a competing <h2>",
);

// 4. There must NOT be a second <h2> projection title competing with
//    Monte Carlo. Specifically, the old "Year-by-Year Projection
//    (deterministic)" <h2> must be gone.
run(
  "No <h2> 'Year-by-Year Projection (deterministic)' header remains",
  !/<h2[^>]*>\s*Year-by-Year Projection \(deterministic\)\s*<\/h2>/.test(
    DASHBOARD,
  ),
  "competing <h2> still present",
);

run(
  "No duplicate <h2>'Wealth Projection' headers",
  (DASHBOARD.match(/<h2[^>]*>\s*Wealth Projection[^<]*<\/h2>/g) || []).length ===
    1,
  "exactly one canonical Wealth Projection <h2> expected",
);

// 5. Monte Carlo result remains the only source feeding the primary table.
//    Specifically: `projectNetWorth` output (deterministic engine) must not
//    feed the canonical Monte Carlo projection block. We assert that the
//    Monte Carlo section does not reference `projection.map` / `projection[`
//    inside its block. (A loose proxy: the Monte Carlo header text and the
//    fan_data render must occur in the same section, and the deterministic
//    projection array must NOT appear between them.)
const mcStart = DASHBOARD.indexOf("WEALTH PROJECTION — CANONICAL");
const mcEnd = DASHBOARD.indexOf("YEAR-BY-YEAR TABLE", mcStart);
run(
  "Canonical Monte Carlo section anchors are present",
  mcStart > 0 && mcEnd > mcStart,
  `mcStart=${mcStart} mcEnd=${mcEnd}`,
);

if (mcStart > 0 && mcEnd > mcStart) {
  const mcBlock = DASHBOARD.slice(mcStart, mcEnd);
  run(
    "Canonical MC section does NOT render deterministic `projection.map`",
    !/projection\.map\b/.test(mcBlock),
    "deterministic projection leaked into canonical block",
  );
  run(
    "Canonical MC section renders `monteCarloResult.fan_data.map`",
    /monteCarloResult\.fan_data\.map/.test(mcBlock),
  );
}

// 6. The canonical Monte Carlo source is shared (single SoT) — assert the
//    explicit SoT statement is present so future refactors keep the
//    promise visible to users.
run(
  "Header copy states 'single source of truth' for canonical projection",
  /single source of truth/i.test(DASHBOARD),
  "SoT language must remain in canonical header",
);

if (fail > 0) {
  console.error(
    `\ntest-projection-consistency: ${fail} failure(s), ${pass} passed`,
  );
  process.exit(1);
}
console.log(`\ntest-projection-consistency: ${pass} passed`);
