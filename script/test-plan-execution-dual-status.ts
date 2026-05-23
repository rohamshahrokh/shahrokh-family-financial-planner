/**
 * Dual-status Plan Execution guard.
 *
 * Pins the UX/audit semantics of the PLAN EXECUTION surface:
 *
 *   FUNDING STATUS    — capacity vs required cash.
 *   LIQUIDITY STATUS  — year-end (closing) cash from the cash bridge.
 *
 * These two statuses must never be conflated. This file is UX/derived-status
 * only — it does NOT exercise or change any financial engine.
 */

import {
  derivePlanExecutionStatus,
  deriveFundingStatus,
  deriveLiquidityStatus,
  buildPlanExecutionAuditTrace,
  LIQUIDITY_HEALTHY_FLOOR,
} from "../client/src/lib/planExecutionStatus";

let pass = 0, fail = 0;
function run(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    pass++;
  } else {
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`);
    fail++;
  }
}

// ─── Liquidity floors ────────────────────────────────────────────────────────
run("LIQUIDITY_HEALTHY_FLOOR is $50k", LIQUIDITY_HEALTHY_FLOOR === 50_000,
  `got=${LIQUIDITY_HEALTHY_FLOOR}`);

// ─── Helpers ─────────────────────────────────────────────────────────────────
const baseLiquidity = (closingCash: number) => ({
  openingCash: 80_000,
  operatingCashflow: 40_000,
  investmentAllocations: 25_000,
  propertyAcquisitionCashUsed: 138_000,
  closingCash,
});
const fundingSurplus = { fundingCapacity: 462_000, fundingRequired: 316_016 };  // surplus +145,984
const fundingGap     = { fundingCapacity: 200_000, fundingRequired: 316_016 };  // gap -116,016

// ─── (a) Funding surplus + negative closing cash → Fully Funded + Liquidity Stress ──
{
  const r = derivePlanExecutionStatus(fundingSurplus, baseLiquidity(-43_252));
  run("(a) funding status = fully_funded",   r.funding.status === "fully_funded",   `got=${r.funding.status}`);
  run("(a) funding surplus = +145,984",      Math.round(r.funding.surplus) === 145_984, `got=${r.funding.surplus}`);
  run("(a) liquidity status = stress",       r.liquidity.status === "stress",       `got=${r.liquidity.status}`);
  run("(a) contextual explanation shown",    r.showContextualExplanation === true);
  run("(a) explanation text present",        typeof r.contextualExplanation === "string" && r.contextualExplanation.length > 0);
  run("(a) explanation mentions year-end cash negative",
        (r.contextualExplanation ?? "").toLowerCase().includes("year-end cash"));
}

// ─── (b) Funding surplus + closing cash $25k → Fully Funded + Tight Liquidity ──
{
  const r = derivePlanExecutionStatus(fundingSurplus, baseLiquidity(25_000));
  run("(b) funding status = fully_funded",   r.funding.status === "fully_funded");
  run("(b) liquidity status = tight",        r.liquidity.status === "tight",        `got=${r.liquidity.status}`);
  run("(b) contextual explanation NOT shown", r.showContextualExplanation === false);
}

// ─── Boundary: closing cash exactly $50k → tight (inclusive upper bound) ─────
{
  const r = derivePlanExecutionStatus(fundingSurplus, baseLiquidity(50_000));
  run("boundary closing=50k → tight",        r.liquidity.status === "tight",        `got=${r.liquidity.status}`);
}
// Boundary: closing cash $50,001 → healthy
{
  const r = derivePlanExecutionStatus(fundingSurplus, baseLiquidity(50_001));
  run("boundary closing=50,001 → healthy",   r.liquidity.status === "healthy",      `got=${r.liquidity.status}`);
}
// Boundary: closing cash exactly $0 → tight (inclusive lower bound)
{
  const r = derivePlanExecutionStatus(fundingSurplus, baseLiquidity(0));
  run("boundary closing=0 → tight",          r.liquidity.status === "tight",        `got=${r.liquidity.status}`);
}

// ─── (c) Funding surplus + closing cash > $50k → Fully Funded + Healthy Liquidity ──
{
  const r = derivePlanExecutionStatus(fundingSurplus, baseLiquidity(120_000));
  run("(c) funding status = fully_funded",   r.funding.status === "fully_funded");
  run("(c) liquidity status = healthy",      r.liquidity.status === "healthy",      `got=${r.liquidity.status}`);
  run("(c) contextual explanation NOT shown", r.showContextualExplanation === false);
}

// ─── (d) Funding gap + appropriate liquidity statuses ────────────────────────
{
  const rStress  = derivePlanExecutionStatus(fundingGap, baseLiquidity(-10_000));
  run("(d.1) funding status = funding_gap",  rStress.funding.status === "funding_gap");
  run("(d.1) liquidity status = stress",     rStress.liquidity.status === "stress");
  run("(d.1) NO contextual explanation when gap",
        rStress.showContextualExplanation === false,
        "Funding gap must NOT also trigger the fully-funded contextual note.");

  const rHealthy = derivePlanExecutionStatus(fundingGap, baseLiquidity(120_000));
  run("(d.2) funding status = funding_gap",  rHealthy.funding.status === "funding_gap");
  run("(d.2) liquidity status = healthy",    rHealthy.liquidity.status === "healthy");
}

// ─── (e) Contextual explanation surfaces ONLY for Fully Funded + Liquidity Stress ──
{
  const fundedStress  = derivePlanExecutionStatus(fundingSurplus, baseLiquidity(-1));
  const fundedTight   = derivePlanExecutionStatus(fundingSurplus, baseLiquidity(10_000));
  const fundedHealthy = derivePlanExecutionStatus(fundingSurplus, baseLiquidity(80_000));
  const gapStress     = derivePlanExecutionStatus(fundingGap,     baseLiquidity(-1));
  run("(e.1) Fully Funded + Stress → explanation shown",
        fundedStress.showContextualExplanation === true);
  run("(e.2) Fully Funded + Tight → explanation NOT shown",
        fundedTight.showContextualExplanation === false);
  run("(e.3) Fully Funded + Healthy → explanation NOT shown",
        fundedHealthy.showContextualExplanation === false);
  run("(e.4) Funding Gap + Stress → explanation NOT shown",
        gapStress.showContextualExplanation === false);
}

// ─── (f) NO engine recomputation — passthrough preserved ─────────────────────
{
  const r = derivePlanExecutionStatus(fundingSurplus, baseLiquidity(-43_252));
  run("(f.1) funding.capacity is passthrough",  r.funding.capacity === fundingSurplus.fundingCapacity);
  run("(f.1) funding.required is passthrough",  r.funding.required === fundingSurplus.fundingRequired);
  run("(f.2) liquidity.openingCash passthrough", r.liquidity.openingCash === 80_000);
  run("(f.2) liquidity.operatingCashflow passthrough", r.liquidity.operatingCashflow === 40_000);
  run("(f.2) liquidity.investmentAllocations passthrough", r.liquidity.investmentAllocations === 25_000);
  run("(f.2) liquidity.propertyAcquisitionCashUsed passthrough",
        r.liquidity.propertyAcquisitionCashUsed === 138_000);
  run("(f.2) liquidity.closingCash passthrough", r.liquidity.closingCash === -43_252);
}

// ─── Audit-mode trace: must surface BOTH questions, distinct statuses ────────
{
  const r = derivePlanExecutionStatus(fundingSurplus, baseLiquidity(-43_252));
  const trace = buildPlanExecutionAuditTrace(r);
  run("audit trace title = PLAN EXECUTION",        trace.title === "PLAN EXECUTION");
  run("audit trace has 2 questions",               trace.questions.length === 2);
  run("audit Q1 = funding question",
        trace.questions[0].q.toLowerCase().includes("fund all planned"));
  run("audit Q1 answer references Funding Status",
        trace.questions[0].a.startsWith("Funding Status:"));
  run("audit Q2 = remaining cash question",
        trace.questions[1].q.toLowerCase().includes("remaining cash"));
  run("audit Q2 answer references Liquidity Status",
        trace.questions[1].a.startsWith("Liquidity Status:"));
  run("audit fundingStatus distinct from liquidityStatus",
        trace.fundingStatus !== (trace.liquidityStatus as unknown as string));
}

// ─── Quick smoke: individual derivers behave correctly ───────────────────────
{
  const f = deriveFundingStatus({ fundingCapacity: 100, fundingRequired: 100 });
  run("equal capacity/required → fully_funded (surplus=0 inclusive)",
        f.status === "fully_funded" && f.surplus === 0);
  const l0 = deriveLiquidityStatus(baseLiquidity(0));
  run("closing=0 → label 'Tight Liquidity'", l0.label === "Tight Liquidity");
  const lN = deriveLiquidityStatus(baseLiquidity(-5));
  run("closing<0 → label 'Liquidity Stress'", lN.label === "Liquidity Stress");
  const lH = deriveLiquidityStatus(baseLiquidity(60_000));
  run("closing>50k → label 'Healthy Liquidity'", lH.label === "Healthy Liquidity");
}

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
