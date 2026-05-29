/**
 * engineEventTimeline.test.ts — Sprint 29 §7.5.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/engineEventTimeline.test.ts
 */
import type { ScenarioEvent, ScenarioEventType } from "../../scenarioV2/types";
import { selectEngineEventTimeline } from "../engineEventTimeline";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function evt(id: string, type: ScenarioEventType, month: string, payload: Record<string, unknown> = {}): ScenarioEvent {
  return { id, type, month, priority: 400, sourceDeltaId: null, payload };
}

console.log("\nengineEventTimeline — engine event → category mapping");

// 1. Empty/undefined input → []
check("undefined events → []", selectEngineEventTimeline({ events: undefined, fireMonth: null }).length === 0);
check("empty events → []", selectEngineEventTimeline({ events: [], fireMonth: null }).length === 0);

// 2. All mappable types → correct category
const events: ScenarioEvent[] = [
  evt("a", "contribution.offset_deposit", "2026-06", { amount: 50_000 }),
  evt("b", "contribution.etf_dca",        "2026-07", { monthlyAmount: 2_000 }),
  evt("c", "contribution.etf_lump",       "2027-01", { lumpSum: 200_000 }),
  evt("d", "contribution.crypto_lump",    "2027-03", { amount: 10_000 }),
  evt("e", "debt.extra_repayment",        "2027-06", { extraRepayment: 500 }),
  evt("f", "debt.refinance",              "2028-01", {}),
  evt("g", "asset.buy_property",          "2028-09", { purchasePrice: 750_000 }),
  evt("h", "asset.sell_property",         "2030-02", { salePrice: 950_000 }),
  evt("i", "asset.rentvest",              "2030-06", {}),
  evt("j", "asset.cash_hold",             "2031-01", { amount: 25_000 }),
];
const r2 = selectEngineEventTimeline({ events, fireMonth: null });
check("offset_deposit → cash",        r2.find(e => e.id === "a")?.category === "cash");
check("etf_dca → etf",                r2.find(e => e.id === "b")?.category === "etf");
check("etf_lump → etf",               r2.find(e => e.id === "c")?.category === "etf");
check("crypto_lump → etf",            r2.find(e => e.id === "d")?.category === "etf");
check("extra_repayment → debt",       r2.find(e => e.id === "e")?.category === "debt");
check("refinance → debt",             r2.find(e => e.id === "f")?.category === "debt");
check("buy_property → property",      r2.find(e => e.id === "g")?.category === "property");
check("sell_property → exit",         r2.find(e => e.id === "h")?.category === "exit");
check("rentvest → property",          r2.find(e => e.id === "i")?.category === "property");
check("cash_hold → cash",             r2.find(e => e.id === "j")?.category === "cash");

// 3. DROPPED categories (income/expense/macro/tax/mortgage_payment) are not surfaced
const dropped: ScenarioEvent[] = [
  evt("d1", "income.payg",           "2026-06"),
  evt("d2", "income.salary_change",  "2026-07"),
  evt("d3", "income.career_break",   "2026-08"),
  evt("d4", "expense.recurring",     "2026-09"),
  evt("d5", "expense.child_cost",    "2026-10"),
  evt("d6", "macro.regime_shift",    "2026-11"),
  evt("d7", "macro.rate_spike",      "2026-12"),
  evt("d8", "tax.payg",              "2027-01"),
  evt("d9", "tax.cgt",               "2027-02"),
  evt("d10","tax.refund",            "2027-03"),
  evt("d11","debt.mortgage_payment", "2027-04"),
];
const rDrop = selectEngineEventTimeline({ events: dropped, fireMonth: null });
check("dropped categories produce no events", rDrop.length === 0);

// 4. Synthetic FIRE event appended
const rFire = selectEngineEventTimeline({ events: [evt("k", "asset.buy_property", "2026-06", { purchasePrice: 600_000 })], fireMonth: "2040-01" });
check("FIRE event appended", rFire.some(e => e.category === "fire" && e.action === "FIRE Reached"));
check("FIRE event uses fireMonth", rFire.find(e => e.category === "fire")?.month === "2040-01");
check("FIRE event marked synthetic.fire", rFire.find(e => e.category === "fire")?.sourceEventType === "synthetic.fire");

// 5. Synthetic FIRE only appended when fireMonth provided
const rNoFire = selectEngineEventTimeline({ events: [], fireMonth: null });
check("no FIRE event when fireMonth null", !rNoFire.some(e => e.category === "fire"));

// 6. Same-month duplicates collapsed (keep first)
const dupes: ScenarioEvent[] = [
  evt("dup-1", "contribution.etf_dca", "2026-06", { monthlyAmount: 1000 }),
  evt("dup-2", "contribution.etf_dca", "2026-06", { monthlyAmount: 1000 }),
  evt("dup-3", "contribution.etf_dca", "2026-07", { monthlyAmount: 1000 }),
];
const rDup = selectEngineEventTimeline({ events: dupes, fireMonth: null });
check("same-month duplicates collapsed (2 → 1)", rDup.filter(e => e.month === "2026-06").length === 1);
check("different-month event kept", rDup.some(e => e.month === "2026-07"));

// 7. Outcome strings populated
const rOutcome = selectEngineEventTimeline({ events: [evt("o", "asset.buy_property", "2028-09", { purchasePrice: 750_000 })], fireMonth: null });
check("buy_property outcome cites $price", rOutcome[0].expectedOutcome.includes("$750,000"));

// 8. Risk impact mapping
const rRisk = selectEngineEventTimeline({ events: [
  evt("hi", "asset.buy_property", "2028-01", { purchasePrice: 800_000 }),
  evt("lo", "debt.extra_repayment", "2028-02", { extraRepayment: 500 }),
], fireMonth: null });
check("buy_property → riskImpact high", rRisk.find(e => e.id === "hi")?.riskImpact === "high");
check("extra_repayment → riskImpact low", rRisk.find(e => e.id === "lo")?.riskImpact === "low");

// 9. Output sorted by month
const rSort = selectEngineEventTimeline({ events: [
  evt("z", "asset.cash_hold", "2030-01"),
  evt("a", "asset.cash_hold", "2026-01"),
  evt("m", "asset.cash_hold", "2028-01"),
], fireMonth: null });
check("output sorted by month ascending", rSort[0].month === "2026-01" && rSort[2].month === "2030-01");

// 10. Source tag always set
check("source tag set on engine events", r2.every(e => e.source === "scenarioV2.events"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
