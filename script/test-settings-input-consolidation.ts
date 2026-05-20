/**
 * Settings Input Consolidation Guard
 *
 * Invariant: Settings must NOT host financial numeric input forms.
 * Cash Allocation, Emergency Fund, Super balances, and salary-linked super
 * inputs live exclusively on Financial Centre / Financial Plan, which is the
 * canonical input surface. Every engine reads from the canonical
 * `HouseholdFinancialState` object built from the same sf_snapshot row.
 *
 * This is a static-text guard plus a runtime check on
 * `buildHouseholdFinancialState`. It runs as a plain tsx script — no
 * frontend bundling required.
 */
import { readFileSync } from "fs";
import { join } from "path";

const cwd = process.cwd();
const SETTINGS = readFileSync(join(cwd, "client/src/pages/settings.tsx"), "utf8");
const FIN_PLAN = readFileSync(join(cwd, "client/src/pages/financial-plan.tsx"), "utf8");
const HFS_SRC = readFileSync(
  join(cwd, "client/src/lib/householdFinancialState.ts"),
  "utf8",
);

let pass = 0, fail = 0;
function run(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? "\n      " + detail : ""}`);
  }
}

console.log("=== Settings Input Consolidation Guard ===\n");

// 1. Settings UI must not host the moved sections.
run(
  "Settings does not define SuperPersonForm",
  !/function\s+SuperPersonForm\b/.test(SETTINGS),
);
run(
  "Settings does not define SuperSection",
  !/function\s+SuperSection\b/.test(SETTINGS),
);
run(
  "Settings does not define CashAllocationSection",
  !/function\s+CashAllocationSection\b/.test(SETTINGS),
);
run(
  "Settings JSX does not mount <SuperSection />",
  !/<SuperSection\b/.test(SETTINGS),
);
run(
  "Settings JSX does not mount <CashAllocationSection />",
  !/<CashAllocationSection\b/.test(SETTINGS),
);
run(
  "Settings does not write savings_cash / emergency_cash inputs",
  !/savings_cash\s*:\s*draft\.savings_cash/.test(SETTINGS)
    && !/emergency_cash\s*:\s*draft\.emergency_cash/.test(SETTINGS),
);
run(
  "Settings does not write the roham/fara super input keys",
  !/roham_super_balance.*draft|fara_super_balance.*draft/s.test(SETTINGS),
);

// 2. Financial Plan must mount the moved forms.
run(
  "Financial Plan imports CashAllocationSection from financial-plan components",
  /CashAllocationSection/.test(FIN_PLAN)
    && /components\/financial-plan\/CashAndSuperSections/.test(FIN_PLAN),
);
run(
  "Financial Plan imports SuperSection (aliased as SuperAllocationSection)",
  /SuperSection\s+as\s+SuperAllocationSection/.test(FIN_PLAN),
);
run(
  "Financial Plan JSX mounts <CashAllocationSection />",
  /<CashAllocationSection\s*\/>/.test(FIN_PLAN),
);
run(
  "Financial Plan JSX mounts <SuperAllocationSection />",
  /<SuperAllocationSection\s*\/>/.test(FIN_PLAN),
);

// 3. Canonical householdFinancialState must exist and expose the engine
//    adapter so engines can route through it.
run(
  "householdFinancialState exports buildHouseholdFinancialState",
  /export\s+function\s+buildHouseholdFinancialState\b/.test(HFS_SRC),
);
run(
  "householdFinancialState exports toEngineSnapshot adapter",
  /export\s+function\s+toEngineSnapshot\b/.test(HFS_SRC),
);
run(
  "householdFinancialState declares forbidden settings fields list",
  /FORBIDDEN_IN_SETTINGS_SNAPSHOT_FIELDS/.test(HFS_SRC),
);

// 4. Runtime: canonical state surfaces the expected values, and the FIRE
//    engine's input-builder consumes them via toEngineSnapshot.
import("../client/src/lib/householdFinancialState.js").catch(() => null);

async function runtimeCheck() {
  const hfs = await import("../client/src/lib/householdFinancialState");
  const { buildHouseholdFinancialState, toEngineSnapshot } = hfs as any;

  const snapshot = {
    monthly_income: 22000,
    monthly_expenses: 14540,
    cash: 50000,
    savings_cash: 100000,
    emergency_cash: 30000,
    other_cash: 40000,
    offset_balance: 0,
    roham_super_balance: 60000,
    fara_super_balance: 25000,
    super_balance: 85000,
    ppor: 1510000,
    mortgage: 1200000,
    other_debts: 19000,
    cars: 65000,
    iran_property: 150000,
    stocks: 0,
    crypto: 0,
    fire_target_age: 55,
    fire_target_monthly_income: 20000,
    roham_super_salary: 154000,
    roham_employer_contrib: 11.5,
    roham_super_growth_rate: 9.5,
    roham_super_option: "High Growth",
  };

  const state = buildHouseholdFinancialState({
    snapshot,
    properties: [],
    stocks: [],
    cryptos: [],
    holdingsRaw: [],
    incomeRecords: [],
    expenses: [],
  });

  run(
    "buildHouseholdFinancialState surfaces monthlyIncome from snapshot",
    state.monthlyIncome === 22000,
    `got ${state.monthlyIncome}`,
  );
  run(
    "buildHouseholdFinancialState surfaces combined super = roham + fara",
    state.superCombined === 85000,
    `got ${state.superCombined}`,
  );
  run(
    "buildHouseholdFinancialState aggregates cash buckets (50+100+30+40+0)",
    state.cash.total === 220000,
    `got ${state.cash.total}`,
  );
  run(
    "buildHouseholdFinancialState resolves Roham per-person super inputs",
    state.roham.balance === 60000
      && state.roham.salary === 154000
      && state.roham.employerContribPct === 11.5
      && state.roham.option === "High Growth",
  );
  run(
    "buildHouseholdFinancialState preserves snapshot back-reference for engines",
    state.snapshot === snapshot,
  );

  // Demonstrate engine routing: feed canonical state into the FIRE engine's
  // existing input builder and verify it sees the canonical values, not raw
  // duplicates.
  const fire = await import("../client/src/lib/firePathEngine");
  const engineSnap = toEngineSnapshot(state);
  const input = (fire as any).buildFirePathInput(engineSnap, [], null, [], []);

  run(
    "FIRE engine input reads monthly_income from canonical state",
    input.monthly_income === state.monthlyIncome,
    `engine=${input.monthly_income} canonical=${state.monthlyIncome}`,
  );
  run(
    "FIRE engine input reads combined super from canonical state",
    input.super_combined === state.superCombined,
    `engine=${input.super_combined} canonical=${state.superCombined}`,
  );
  run(
    "FIRE engine input reads PPOR + mortgage from canonical state",
    input.ppor === state.ppor && input.mortgage === state.mortgage,
  );

  // Forecast engine (representative) — buildCashFlowSeries inside buildForecast
  // accepts the same snapshot. Smoke-test that the snapshot derived from
  // canonical state has the expected fields populated.
  run(
    "toEngineSnapshot exposes savings_cash / emergency_cash for engines",
    engineSnap.savings_cash === 100000 && engineSnap.emergency_cash === 30000,
  );
  run(
    "toEngineSnapshot mirrors canonical super_balance onto snapshot shape",
    engineSnap.super_balance === state.superCombined,
  );
}

runtimeCheck().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}).catch(err => {
  console.error("Runtime check failed:", err);
  process.exit(1);
});
