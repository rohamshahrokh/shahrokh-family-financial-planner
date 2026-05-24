/**
 * Sprint 2A — Wealth Plan Audit (D-016).
 *
 * Verifies that explicit `lifecycle_status` is honoured by current-NW
 * selectors, with the legacy date-driven rule preserved for legacy rows
 * lacking the field. Without this fix, a property the user had marked
 * `planned` could still appear in current NW if its `settlement_date`
 * happened to be in the past.
 */
import {
  selectSettledIPs,
  selectPlannedIPs,
  selectIpCurrentValueSettled,
  selectIpLoanBalanceSettled,
} from "../client/src/lib/dashboardDataContract";
import { makeRealUserInputs } from "./test-audit-fixtures";

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; process.stdout.write(`  ✓ ${name}\n`); }
  else { fail++; process.stdout.write(`  ✗ ${name}${detail ? "  " + detail : ""}\n`); }
}

// (1) Legacy row (no lifecycle_status), settlement_date past → settled.
const inputs1 = makeRealUserInputs();
const settled1 = selectSettledIPs({
  ...inputs1,
  properties: [{ id: "p1", type: "investment", current_value: 800_000, loan_amount: 600_000, settlement_date: "2024-01-01" }],
});
assert(
  "Legacy row with past settlement_date and no lifecycle_status → SETTLED",
  settled1.length === 1,
  `count=${settled1.length}`,
);

// (2) Legacy row, settlement_date future → planned.
const planned2 = selectPlannedIPs({
  ...inputs1,
  properties: [{ id: "p2", type: "investment", current_value: 800_000, loan_amount: 600_000, settlement_date: "2099-01-01" }],
});
assert(
  "Legacy row with future settlement_date → PLANNED",
  planned2.length === 1,
);

// (3) Explicit lifecycle_status='planned' overrides past settlement_date.
const planned3 = selectPlannedIPs({
  ...inputs1,
  properties: [{
    id: "p3", type: "investment", current_value: 800_000, loan_amount: 600_000,
    settlement_date: "2020-01-01",
    lifecycle_status: "planned",
  }],
});
const settled3 = selectSettledIPs({
  ...inputs1,
  properties: [{
    id: "p3", type: "investment", current_value: 800_000, loan_amount: 600_000,
    settlement_date: "2020-01-01",
    lifecycle_status: "planned",
  }],
});
assert(
  "Explicit lifecycle_status='planned' overrides PAST settlement_date → PLANNED",
  planned3.length === 1 && settled3.length === 0,
  `planned=${planned3.length} settled=${settled3.length}`,
);

// (4) Explicit lifecycle_status='under_contract' overrides past settlement_date.
const settled4 = selectSettledIPs({
  ...inputs1,
  properties: [{
    id: "p4", type: "investment", current_value: 800_000, loan_amount: 600_000,
    settlement_date: "2020-01-01",
    lifecycle_status: "under_contract",
  }],
});
assert(
  "Explicit lifecycle_status='under_contract' → NOT SETTLED (excluded from current NW)",
  settled4.length === 0,
);

// (5) Explicit lifecycle_status='settled' overrides FUTURE settlement_date.
const settled5 = selectSettledIPs({
  ...inputs1,
  properties: [{
    id: "p5", type: "investment", current_value: 800_000, loan_amount: 600_000,
    settlement_date: "2099-01-01",
    lifecycle_status: "settled",
  }],
});
assert(
  "Explicit lifecycle_status='settled' overrides FUTURE settlement_date → SETTLED",
  settled5.length === 1,
);

// (6) Planned property does NOT contribute to current IP value / loan balance.
const plannedOnly = {
  ...inputs1,
  properties: [{
    id: "p6", type: "investment", current_value: 750_000, loan_amount: 600_000,
    settlement_date: "2020-01-01",
    lifecycle_status: "planned",
  }],
};
assert(
  "selectIpCurrentValueSettled returns $0 when only planned IP exists",
  selectIpCurrentValueSettled(plannedOnly) === 0,
  `value=${selectIpCurrentValueSettled(plannedOnly)}`,
);
assert(
  "selectIpLoanBalanceSettled returns $0 when only planned IP exists",
  selectIpLoanBalanceSettled(plannedOnly) === 0,
  `loan=${selectIpLoanBalanceSettled(plannedOnly)}`,
);

if (fail > 0) {
  console.error(`\n✗ test-sprint2a-wealth-plan-audit: ${fail} failure(s), ${pass} passed`);
  process.exit(1);
}
console.log(`\n✓ test-sprint2a-wealth-plan-audit: ${pass} passed`);
