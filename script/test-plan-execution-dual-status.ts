/**
 * Dual-status PLAN EXECUTION guard.
 *
 * Pins the UX/audit semantics of the PLAN EXECUTION surface:
 *
 *   FUNDING STATUS    — passthrough from the canonical PlanFeasibilityResult
 *                       (capacity vs required → fully-funded / tight / gap).
 *   LIQUIDITY STATUS  — derived from year-end (closing) cash on the
 *                       canonical cash bridge.
 *
 * The two statuses must never be conflated. This file is UX/derived-status
 * only — it does NOT exercise or change any financial engine, and it uses
 * the same `computePlanFeasibility` output the rest of the app sees.
 */

import {
  derivePlanExecutionStatus,
  deriveLiquidityStatus,
  fundingSurfaceFromFeasibility,
  liquidityInputsFromCashFlowYear,
  liquidityInputsFromCashBridge,
  buildPlanExecutionAuditTrace,
  LIQUIDITY_HEALTHY_FLOOR,
  LIQUIDITY_TIGHT_FLOOR,
  FULLY_FUNDED_STRESS_EXPLANATION,
  type LiquidityInputs,
} from "../client/src/lib/planExecutionStatus";
import {
  computePlanFeasibility,
  type PlanFeasibilityInputs,
  type PlanFeasibilityResult,
} from "../client/src/lib/planFeasibility";
import { buildPlanFeasibilityTrace } from "../client/src/lib/auditMode/engineTraces/planFeasibilityTraces";

let pass = 0, fail = 0;
function run(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else      { console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`); fail++; }
}

// ─── Liquidity thresholds ────────────────────────────────────────────────────
run("LIQUIDITY_HEALTHY_FLOOR is $50k", LIQUIDITY_HEALTHY_FLOOR === 50_000, `got=${LIQUIDITY_HEALTHY_FLOOR}`);
run("LIQUIDITY_TIGHT_FLOOR is $0",    LIQUIDITY_TIGHT_FLOOR   === 0,       `got=${LIQUIDITY_TIGHT_FLOOR}`);

// ─── Canonical feasibility fixtures via computePlanFeasibility ──────────────
// Funding SURPLUS scenario: equity-release + stocks fund a $760k IP comfortably.
function fundingSurplusInputs(): PlanFeasibilityInputs {
  return {
    cash:           250_000,
    offsetBalance:  150_000,
    savingsCash:    0,
    emergencyCash:  0,
    otherCash:      0,
    fundedProperties: [
      {
        type: "ip",
        deposit:    140_000,
        stamp_duty: 40_000,
        legal_fees: 6_000,
        renovation_costs: 0,
        building_inspection: 1_000,
        loan_setup_fees:     1_000,
        _fundingPlan: {
          cashUsed: 140_000,
          offsetUsed: 0,
          equityReleased: 60_000,
          stocksSold: 2_000,
          cryptoSold: 0,
        },
        settlement_date: `${new Date().getFullYear()}-06-01`,
      },
    ],
    cashflowAnnual: [
      {
        year: new Date().getFullYear(),
        plannedStockBuy: 20_000,
        plannedCryptoBuy: 5_000,
        stockDCAOutflow: 0,
        cryptoDCAOutflow: 0,
      },
    ],
    horizon: "current-year",
  };
}

// Funding GAP scenario: required > available.
function fundingGapInputs(): PlanFeasibilityInputs {
  const surplus = fundingSurplusInputs();
  return {
    ...surplus,
    cash: 20_000,
    offsetBalance: 10_000,
    fundedProperties: surplus.fundedProperties.map((p) => ({
      ...p,
      _fundingPlan: { ...(p._fundingPlan ?? {}), equityReleased: 0, stocksSold: 0, cryptoSold: 0 },
    })),
  };
}

const feasibilitySurplus: PlanFeasibilityResult = computePlanFeasibility(fundingSurplusInputs());
const feasibilityGap:     PlanFeasibilityResult = computePlanFeasibility(fundingGapInputs());

run("Surplus fixture → status fully-funded or tight",
    feasibilitySurplus.status === "fully-funded" || feasibilitySurplus.status === "tight-liquidity",
    `status=${feasibilitySurplus.status} gap=${feasibilitySurplus.fundingGap}`);
run("Gap fixture → status funding-gap",
    feasibilityGap.status === "funding-gap",
    `status=${feasibilityGap.status} gap=${feasibilityGap.fundingGap}`);

// Helper to make a liquidity row with a chosen closingCash.
function liq(closing: number, openingOverride?: number): LiquidityInputs {
  return {
    openingCash:                 openingOverride ?? 80_000,
    operatingCashflow:           40_000,
    investmentAllocations:       25_000,
    propertyAcquisitionCashUsed: 138_000,
    closingCash:                 closing,
  };
}

// ─── (a) Funding surplus + negative closing → Funded + Liquidity Stress ─────
{
  const r = derivePlanExecutionStatus(feasibilitySurplus, liq(-43_252));
  run("(a) funding.status passthrough",     r.funding.status === feasibilitySurplus.status);
  run("(a) funding.label passthrough",      r.funding.label === feasibilitySurplus.statusLabel);
  run("(a) liquidity.status = stress",      r.liquidity.status === "stress", `got=${r.liquidity.status}`);
  run("(a) contextual explanation shown",   r.showContextualExplanation === true);
  run("(a) explanation text present",       (r.contextualExplanation ?? "").includes("year-end cash"));
  run("(a) explanation matches constant",   r.contextualExplanation === FULLY_FUNDED_STRESS_EXPLANATION);
}

// ─── (b) Funding surplus + closing $0–$50k → Tight Liquidity ────────────────
{
  const r = derivePlanExecutionStatus(feasibilitySurplus, liq(25_000));
  run("(b) funding stays passthrough",      r.funding.status === feasibilitySurplus.status);
  run("(b) liquidity.status = tight",       r.liquidity.status === "tight", `got=${r.liquidity.status}`);
  run("(b) no contextual explanation",      r.showContextualExplanation === false);
}

// ─── (c) Funding surplus + closing > $50k → Healthy Liquidity ───────────────
{
  const r = derivePlanExecutionStatus(feasibilitySurplus, liq(120_000));
  run("(c) liquidity.status = healthy",     r.liquidity.status === "healthy", `got=${r.liquidity.status}`);
  run("(c) no contextual explanation",      r.showContextualExplanation === false);
}

// ─── Boundary checks (UX thresholds only) ───────────────────────────────────
run("closing=50,000 → tight",   deriveLiquidityStatus(liq(50_000)).status   === "tight");
run("closing=50,001 → healthy", deriveLiquidityStatus(liq(50_001)).status   === "healthy");
run("closing=0      → tight",   deriveLiquidityStatus(liq(0)).status        === "tight");
run("closing=-1     → stress",  deriveLiquidityStatus(liq(-1)).status       === "stress");

// ─── (d) Funding gap + every liquidity bucket ───────────────────────────────
{
  const rS = derivePlanExecutionStatus(feasibilityGap, liq(-10_000));
  run("(d.1) funding.status = funding-gap", rS.funding.status === "funding-gap");
  run("(d.1) liquidity = stress",           rS.liquidity.status === "stress");
  run("(d.1) NO contextual note when gap",  rS.showContextualExplanation === false,
      "Funding gap must NOT also trigger the funded-but-stressed contextual note.");

  const rT = derivePlanExecutionStatus(feasibilityGap, liq(25_000));
  run("(d.2) funding.status = funding-gap", rT.funding.status === "funding-gap");
  run("(d.2) liquidity = tight",            rT.liquidity.status === "tight");
  run("(d.2) NO contextual note when gap",  rT.showContextualExplanation === false);

  const rH = derivePlanExecutionStatus(feasibilityGap, liq(120_000));
  run("(d.3) funding.status = funding-gap", rH.funding.status === "funding-gap");
  run("(d.3) liquidity = healthy",          rH.liquidity.status === "healthy");
  run("(d.3) hasFundingGap=true (advisor trigger preserved)",
      rH.funding.hasFundingGap === true);
}

// ─── (e) Contextual explanation surfaces ONLY for funded + stress ───────────
{
  const fundedStress  = derivePlanExecutionStatus(feasibilitySurplus, liq(-1));
  const fundedTight   = derivePlanExecutionStatus(feasibilitySurplus, liq(10_000));
  const fundedHealthy = derivePlanExecutionStatus(feasibilitySurplus, liq(80_000));
  const gapStress     = derivePlanExecutionStatus(feasibilityGap,     liq(-1));
  run("(e.1) Funded + Stress → note shown",   fundedStress.showContextualExplanation === true);
  run("(e.2) Funded + Tight → note hidden",   fundedTight.showContextualExplanation === false);
  run("(e.3) Funded + Healthy → note hidden", fundedHealthy.showContextualExplanation === false);
  run("(e.4) Gap + Stress → note hidden",     gapStress.showContextualExplanation === false);
}

// ─── (f) Pure passthrough — no engine recomputation ─────────────────────────
{
  const r = derivePlanExecutionStatus(feasibilitySurplus, liq(-43_252));
  run("(f.1) funding.availableLiquidity passthrough",
      r.funding.availableLiquidity === feasibilitySurplus.availableLiquidity);
  run("(f.1) funding.requiredLiquidity passthrough",
      r.funding.requiredLiquidity === feasibilitySurplus.requiredLiquidity);
  run("(f.1) funding.fundingGap passthrough",
      r.funding.fundingGap === feasibilitySurplus.fundingGap);
  run("(f.1) funding.hasFundingGap passthrough",
      r.funding.hasFundingGap === feasibilitySurplus.hasFundingGap);
  run("(f.2) liquidity.openingCash passthrough",
      r.liquidity.openingCash === 80_000);
  run("(f.2) liquidity.operatingCashflow passthrough",
      r.liquidity.operatingCashflow === 40_000);
  run("(f.2) liquidity.investmentAllocations passthrough",
      r.liquidity.investmentAllocations === 25_000);
  run("(f.2) liquidity.propertyAcquisitionCashUsed passthrough",
      r.liquidity.propertyAcquisitionCashUsed === 138_000);
  run("(f.2) liquidity.closingCash passthrough",
      r.liquidity.closingCash === -43_252);

  // fundingSurfaceFromFeasibility is a structural passthrough — every field
  // either is a passthrough or is derived solely from PlanFeasibilityResult.
  const surface = fundingSurfaceFromFeasibility(feasibilitySurplus);
  run("(f.3) fundingSurface.availableLiquidity passthrough",
      surface.availableLiquidity === feasibilitySurplus.availableLiquidity);
  run("(f.3) fundingSurface.requiredLiquidity passthrough",
      surface.requiredLiquidity === feasibilitySurplus.requiredLiquidity);
  run("(f.3) fundingSurface.fundingGap passthrough",
      surface.fundingGap === feasibilitySurplus.fundingGap);
}

// ─── Cash-bridge adapter — passthrough into LiquidityInputs ─────────────────
{
  const cb = {
    startCash:           80_000,
    income:              120_000,
    rentalIncome:        20_000,
    taxRefundOrPayment:  5_000,
    livingExpenses:      60_000,
    pporRepayments:      30_000,
    investmentRepayments: 15_000,
    plannedStockBuys:    10_000,
    plannedCryptoBuys:   5_000,
    dcaOutflows:         10_000,
    propertyDeposits:    100_000,
    buyingCosts:         40_000,
    endCash:             -43_252,
  };
  const li = liquidityInputsFromCashBridge(cb);
  const expectedOperating = 120_000 + 20_000 + 5_000 - 60_000 - 30_000 - 15_000;
  run("cashBridge adapter — openingCash",
      li.openingCash === 80_000);
  run("cashBridge adapter — operatingCashflow",
      li.operatingCashflow === expectedOperating,
      `expected=${expectedOperating} got=${li.operatingCashflow}`);
  run("cashBridge adapter — investmentAllocations sum",
      li.investmentAllocations === 25_000);
  run("cashBridge adapter — propertyAcquisitionCashUsed sum",
      li.propertyAcquisitionCashUsed === 140_000);
  run("cashBridge adapter — closingCash passthrough",
      li.closingCash === -43_252);
}

// ─── CashFlowYear adapter (canonical PR49 surface) ──────────────────────────
{
  const row = {
    income:                  120_000,
    rentalIncome:            20_000,
    ngTaxBenefit:            5_000,
    ngBenefitSpread:         0,
    totalExpenses:           60_000,
    mortgageRepayment:       30_000,
    investmentLoanRepayment: 15_000,
    plannedStockBuy:         10_000,
    plannedCryptoBuy:        5_000,
    stockDCAOutflow:         6_000,
    cryptoDCAOutflow:        4_000,
    propertyPurchaseCashUsed: 100_000,
    propertyBuyingCosts:     40_000,
    propertyDeposit:         100_000,
    endingBalance:           -43_252,
  };
  const li = liquidityInputsFromCashFlowYear(row, 80_000);
  run("CashFlowYear adapter — openingCash",       li.openingCash === 80_000);
  run("CashFlowYear adapter — operatingCashflow", li.operatingCashflow === (120_000 + 20_000 + 5_000 - 60_000 - 30_000 - 15_000));
  run("CashFlowYear adapter — investmentAllocations sum", li.investmentAllocations === 25_000);
  run("CashFlowYear adapter — propertyAcquisitionCashUsed sum", li.propertyAcquisitionCashUsed === 140_000);
  run("CashFlowYear adapter — closingCash passthrough", li.closingCash === -43_252);
}

// ─── Audit-mode trace shape — two questions, distinct statuses ──────────────
{
  const r = derivePlanExecutionStatus(feasibilitySurplus, liq(-43_252));
  const trace = buildPlanExecutionAuditTrace(r);
  run("audit trace title = PLAN EXECUTION", trace.title === "PLAN EXECUTION");
  run("audit trace has 2 questions",        trace.questions.length === 2);
  run("audit Q1 references Funding Status",
      trace.questions[0].q.toLowerCase().includes("fund all planned") &&
      trace.questions[0].a.startsWith("Funding Status:"));
  run("audit Q2 references Liquidity Status",
      trace.questions[1].q.toLowerCase().includes("remaining cash") &&
      trace.questions[1].a.startsWith("Liquidity Status:"));
  run("audit fundingStatus uses canonical PlanFeasibilityResult.status",
      trace.fundingStatus === feasibilitySurplus.status);
  run("audit liquidityStatus is independent from fundingStatus",
      String(trace.fundingStatus) !== String(trace.liquidityStatus));
}

// ─── Canonical PlanFeasibilityTrace also surfaces the dual-status section ──
{
  // Without liquidity: existing trace shape preserved (back-compat).
  const traceOnly = buildPlanFeasibilityTrace({ result: feasibilitySurplus });
  const text = (traceOnly.inputs ?? []).map((i: any) => `${i.label} ${i.value}`).join(" | ");
  run("PlanFeasibilityTrace without liquidity = no PLAN EXECUTION section",
      !text.includes("PLAN EXECUTION"));

  const traceWith = buildPlanFeasibilityTrace({
    result: feasibilitySurplus,
    liquidity: liq(-43_252),
    year: 2026,
  });
  const text2 = (traceWith.inputs ?? [])
    .map((i: any) => `${i.label} ${i.value} ${i.source ?? ""}`)
    .join(" | ");
  run("PlanFeasibilityTrace with liquidity = includes PLAN EXECUTION section",
      text2.includes("PLAN EXECUTION"));
  run("PlanFeasibilityTrace with liquidity = includes Q1 Funding Status",
      text2.includes("Funding Status") && text2.toLowerCase().includes("fund all planned"));
  run("PlanFeasibilityTrace with liquidity = includes Q2 Liquidity Status",
      text2.includes("Liquidity Status") && text2.toLowerCase().includes("remaining cash"));
  run("PlanFeasibilityTrace with liquidity = includes Closing Cash row",
      text2.includes("Closing Cash"));
  run("PlanFeasibilityTrace with liquidity = surfaces contextual note when funded+stress",
      text2.includes("Note (Fully Funded + Liquidity Stress)"));

  // Funding gap case — contextual note must NOT appear.
  const traceGap = buildPlanFeasibilityTrace({
    result: feasibilityGap,
    liquidity: liq(-50_000),
    year: 2026,
  });
  const textGap = (traceGap.inputs ?? [])
    .map((i: any) => `${i.label} ${i.value} ${i.source ?? ""}`)
    .join(" | ");
  run("PlanFeasibilityTrace gap case → no Fully-Funded-Stress contextual note",
      !textGap.includes("Note (Fully Funded + Liquidity Stress)"));
}

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
