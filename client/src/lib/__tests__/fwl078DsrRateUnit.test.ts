/**
 * fwl078DsrRateUnit.test.ts — FWL-078 DSR rate-unit regression guard.
 *
 * Locks down the four invariants surfaced by the FWL-078 DSR audit
 * (FWL078_DSR_RATE_FIX_VERIFICATION.md):
 *
 *   1. `translateDelta` for `property_deposit_boost` coerces a percent rate
 *      (e.g. 6.5) to a decimal rate (0.065) before emitting the buy_property
 *      event. This guards every external caller plus any future regression
 *      in candidateGenerator.ts emission sites.
 *
 *   2. A decimal rate input (0.065) passes through unchanged (idempotent).
 *
 *   3. Monthly principal-and-interest on a $110,000 IP loan at the
 *      production mortgage rate is in the ~$695/mo range — NOT in the
 *      ~$59,000/mo range that would result from amortising at 650% APR
 *      (the production bug's behaviour pre-fix).
 *
 *   4. Source-level guard: every `rate: ctx.mortgageRatePct` occurrence in
 *      `candidateGenerator.ts` is followed by `/ 100`. This is the cheapest
 *      possible structural guard against the four emission sites
 *      (lines 1086, 1141, 1196, 1256) regressing to passing percent again.
 *
 * No new financial math, no new engines, no schema changes. Pure unit tests
 * over `translateDelta` plus a textual source guard.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { translateDelta } from "../scenarioV2/deltas";
import type { ScenarioDelta, ScenarioEvent } from "../scenarioV2/types";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

console.log("\nfwl078DsrRateUnit — DSR rate-unit fix regression guard");

// ─── Helper: build a minimal property_deposit_boost ScenarioDelta ───────────
function makeBoostDelta(rate: number): ScenarioDelta {
  return {
    id: "test/boost",
    scenarioId: "test",
    deltaType: "property_deposit_boost",
    activationMonth: "2026-06",
    params: {
      extraDeposit: 50_000,
      purchasePrice: 200_000,
      weeklyRent: 173,
      rate,                           // ← the unit under test
      loanTermYears: 30,
      vacancyRate: 0.04,
      managementFee: 0.08,
    },
    priority: 600,
    idempotencyKey: "test/boost/1",
  };
}

function buyEvent(events: ScenarioEvent[]): ScenarioEvent {
  const ev = events.find((e) => e.type === "asset.buy_property");
  if (!ev) throw new Error("no asset.buy_property event emitted");
  return ev;
}

// Textbook amort: P × (r/12) × (1+r/12)^(12n) / ((1+r/12)^(12n) − 1)
function amort(principal: number, annualRate: number, termYears: number): number {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return (principal * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
}

// ─── Invariant 1: percent rate (6.5) is normalised to decimal (0.065) ──────
{
  const events = translateDelta(makeBoostDelta(6.5));
  const ev = buyEvent(events);
  const rate = (ev.payload as any).rate as number;

  check(
    "translateDelta normalises rate=6.5 (percent) to 0.065 (decimal)",
    Math.abs(rate - 0.065) < 1e-9,
    `got rate=${rate}`,
  );
}

// ─── Invariant 2: decimal rate (0.065) is idempotent ───────────────────────
{
  const events = translateDelta(makeBoostDelta(0.065));
  const ev = buyEvent(events);
  const rate = (ev.payload as any).rate as number;

  check(
    "translateDelta leaves rate=0.065 (decimal) unchanged",
    Math.abs(rate - 0.065) < 1e-9,
    `got rate=${rate}`,
  );
}

// ─── Invariant 3: P&I sanity (~$695/mo) when emitted rate is decimal ───────
//
// $110k loan @ 6.5% over 30y. Textbook P&I ≈ $695/mo. The bug would have
// produced P&I in the tens of thousands because amort at 6.5 (not 0.065)
// is amortisation at 650% APR (engine: r/12 ≈ 0.542, dominates entirely).
{
  const events = translateDelta(makeBoostDelta(6.5));   // bug input
  const ev = buyEvent(events);
  const rate = (ev.payload as any).rate as number;
  const loan = (ev.payload as any).loanBalance as number;
  const term = (ev.payload as any).termYears as number;
  const pi = amort(loan, rate, term);

  check(
    `IP P&I is in the sane $400-$1500/mo range (got $${Math.round(pi)}) — not the buggy ~$59k/mo`,
    pi > 400 && pi < 1500,
    `pi=${pi.toFixed(2)} rate=${rate} loan=${loan} term=${term}`,
  );

  // Belt-and-braces: confirm a non-normalised P&I would have been catastrophic.
  // This proves the *math* of the bug: at rate=6.5 the monthly factor swallows
  // the principal whole. We compute it with rate=6.5 here ONLY to demonstrate
  // why the normaliser matters; the production engine never sees this value.
  const piBuggy = amort(loan, 6.5, term);
  check(
    `proof-of-bug: amort(110k, 6.5, 30y) would yield >$50k/mo (got $${Math.round(piBuggy)})`,
    piBuggy > 50_000,
    `piBuggy=${piBuggy.toFixed(2)} — sanity guard that the bug was real`,
  );
}

// ─── Invariant 4: source-level guard on candidateGenerator.ts emissions ─────
{
  const __filename = fileURLToPath(import.meta.url);
  const here = dirname(__filename);
  const cgPath = join(here, "..", "scenarioV2", "decisionEngine", "candidateGenerator.ts");
  const src = readFileSync(cgPath, "utf8");

  // Every emission of `rate: ctx.mortgageRatePct` MUST be followed by `/ 100`
  // (we allow flexible whitespace) before the next non-whitespace token.
  // Equivalent: there must be NO bare `rate: ctx.mortgageRatePct,` lines.
  const bareEmission = /rate:\s*ctx\.mortgageRatePct\s*,/g;
  const bareMatches = src.match(bareEmission) ?? [];
  check(
    `candidateGenerator.ts has zero bare \`rate: ctx.mortgageRatePct,\` emissions (found ${bareMatches.length})`,
    bareMatches.length === 0,
    bareMatches.length > 0 ? `${bareMatches.length} regression(s) — must use ctx.mortgageRatePct / 100` : undefined,
  );

  // Sanity: confirm the corrected form appears at least 4 times
  // (the four property_deposit_boost emission sites identified by FWL-078).
  const correctEmission = /rate:\s*ctx\.mortgageRatePct\s*\/\s*100/g;
  const correctMatches = src.match(correctEmission) ?? [];
  check(
    `candidateGenerator.ts has ≥4 correct \`ctx.mortgageRatePct / 100\` emissions (found ${correctMatches.length})`,
    correctMatches.length >= 4,
    correctMatches.length < 4 ? `expected ≥4, got ${correctMatches.length}` : undefined,
  );
}

// ─── Summary ───────────────────────────────────────────────────────────────
console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
