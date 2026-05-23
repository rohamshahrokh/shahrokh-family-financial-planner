/**
 * PlanExecutionCard.tsx — PLAN EXECUTION dual-status card.
 *
 * Sits next to (and complements) the canonical PlanFeasibilityCard. Where
 * PlanFeasibilityCard answers "Can I fund the plan?" using
 * Available vs Required Liquidity, this card surfaces BOTH the Funding
 * Feasibility status (passthrough from `PlanFeasibilityResult`) and a
 * separate Year-End Liquidity status (closing cash from the canonical
 * cash bridge). Two questions, two surfaces — never conflated.
 *
 * Pure presentation. No engine recomputation. All values are passthrough.
 *
 * #FWL_Plan_Execution_Dual_Status
 */

import type { PlanFeasibilityResult } from "@/lib/planFeasibility";
import {
  PLAN_FEASIBILITY_WARNING_HEADLINE,
  PLAN_FEASIBILITY_WARNING_ASSUMPTION,
  planFeasibilityWarningDetail,
} from "@/lib/planFeasibility";
import {
  derivePlanExecutionStatus,
  type LiquidityInputs,
  type FundingStatusSurface,
  type LiquiditySurface,
} from "@/lib/planExecutionStatus";
import { formatCurrency } from "@/lib/finance";
import { maskValue } from "@/components/PrivacyMask";
import { useAppStore } from "@/lib/store";
import { useAuditMode } from "@/lib/auditMode";
import { PLAN_FEASIBILITY_TRACE_ID } from "@/lib/auditMode/engineTraces";

export interface PlanExecutionCardProps {
  /** Canonical Funding side — never re-derived inside this component. */
  feasibility: PlanFeasibilityResult;
  /** Year-end Liquidity side — derived from the canonical cash bridge. */
  liquidity:   LiquidityInputs;
  /** Year label (defaults to current year). */
  year?: number | string;
  /**
   * Optional Funding Gap Resolution Advisor render slot. The dashboard
   * supplies the existing <FundingResolutionSection /> component here when
   * `feasibility.hasFundingGap === true` and a resolution exists, so the
   * advisor remains reachable without the legacy PlanFeasibilityCard.
   * #FWL_Funding_Gap_Resolution_Advisor
   */
  resolutionSlot?: React.ReactNode;
  /** Optional className passthrough for layout. */
  className?: string;
}

export default function PlanExecutionCard({
  feasibility,
  liquidity,
  year,
  resolutionSlot,
  className,
}: PlanExecutionCardProps) {
  const { privacyMode } = useAppStore();
  const auditCtx = useAuditMode();
  const fmt = (n: number) => maskValue(formatCurrency(n, false), privacyMode);
  const result = derivePlanExecutionStatus(feasibility, liquidity);

  return (
    <div
      className={`rounded-2xl border border-border bg-card p-4 md:p-5 space-y-4 ${className ?? ""}`}
      data-testid="plan-execution-card"
      data-funding-status={result.funding.status}
      data-liquidity-status={result.liquidity.status}
    >
      {/* Header — title + year + canonical audit chip (Plan Feasibility trace).
          The trace id is intentionally PLAN_FEASIBILITY_TRACE_ID — the trace
          itself now carries the PLAN EXECUTION dual-status section (via
          buildPlanFeasibilityTrace's `liquidity` arg), so the same audit
          target answers both Q1 (Funding) and Q2 (Liquidity). */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">
            PLAN EXECUTION
          </h2>
          {year !== undefined && year !== null && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {String(year)}
            </span>
          )}
        </div>
        {auditCtx.auditMode ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); auditCtx.openTrace(PLAN_FEASIBILITY_TRACE_ID); }}
            aria-label="Open Plan Execution audit trace"
            title="Click to see the Funding Feasibility + Year-End Liquidity breakdown"
            className="px-2 py-0.5 rounded-md border text-[10px] font-bold tabular-nums fwl-audit-metric"
            style={{
              borderColor: "hsl(var(--border))",
              color: "hsl(var(--muted-foreground))",
              cursor: "pointer",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              userSelect: "none",
            }}
            data-audit-trace-id={PLAN_FEASIBILITY_TRACE_ID}
            data-audit-mode="on"
            data-testid="audit-metric-plan-execution"
          >
            🧾 Trace
          </button>
        ) : (
          <span
            className="px-2 py-0.5 rounded-md border text-[10px] font-bold tabular-nums"
            style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
            data-audit-trace-id={PLAN_FEASIBILITY_TRACE_ID}
            data-audit-mode="off"
            data-testid="audit-metric-plan-execution"
          >
            🧾
          </span>
        )}
      </div>

      {/* Dual-status summary line */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
        data-testid="plan-execution-status-summary"
      >
        <StatusLine
          label="Funding Status"
          icon={result.funding.icon}
          text={result.funding.label}
          tone={fundingTone(result.funding)}
          testId="funding-status"
        />
        <StatusLine
          label="Liquidity Status"
          icon={result.liquidity.icon}
          text={result.liquidity.label}
          tone={liquidityTone(result.liquidity)}
          testId="liquidity-status"
        />
      </div>

      {/* Section 1 — Funding Feasibility */}
      <Section
        title="Funding Feasibility"
        question="Can I execute the plan?"
        testId="funding-feasibility-section"
      >
        <Row label="Funding Capacity"           value={fmt(result.funding.availableLiquidity)} testId="pec-funding-capacity" />
        <Row label="Funding Required"           value={fmt(result.funding.requiredLiquidity)}  testId="pec-funding-required" />
        <Row
          label={result.funding.hasFundingGap ? "Funding Gap" : "Funding Surplus"}
          value={fmt(result.funding.fundingGap)}
          tone={result.funding.hasFundingGap ? "bad" : "good"}
          bold
          testId="pec-funding-surplus"
        />
        <StatusPill funding={result.funding} />

        {/* Canonical Plan Feasibility warning banner (preserved verbatim from
            the legacy PlanFeasibilityCard — same copy, same testids, so the
            warning experience and audit-coverage greps remain intact even
            though the legacy card is no longer rendered). */}
        {result.funding.hasFundingGap && (
          <div
            className="mt-2 rounded-md border px-2.5 py-2 text-[11px] leading-snug"
            style={{
              borderColor: "hsl(0,72%,60% / 0.55)",
              background: "hsl(0,72%,10%)",
              color: "hsl(0,72%,72%)",
            }}
            role="status"
            aria-live="polite"
            data-testid="plan-feasibility-warning-banner"
          >
            <div className="font-bold mb-0.5" data-testid="plan-feasibility-warning-headline">
              ⚠ {PLAN_FEASIBILITY_WARNING_HEADLINE}
            </div>
            <div data-testid="plan-feasibility-warning-detail">
              {planFeasibilityWarningDetail(result.funding.fundingGap)}
            </div>
            <div className="text-muted-foreground mt-0.5" data-testid="plan-feasibility-warning-assumption">
              {PLAN_FEASIBILITY_WARNING_ASSUMPTION}
            </div>
            <div
              className="mt-1 font-semibold"
              data-testid="plan-feasibility-additional-funding"
            >
              Additional Funding Required: {fmt(Math.max(0, -result.funding.fundingGap))}
            </div>
          </div>
        )}
      </Section>

      {/* Section 2 — Year-End Liquidity */}
      <Section
        title="Year-End Liquidity"
        question="What is my remaining cash after executing the plan?"
        testId="year-end-liquidity-section"
      >
        <Row label="Opening Cash"                  value={fmt(result.liquidity.openingCash)}                              testId="pec-opening-cash" />
        <Row label="Operating Cashflow"            value={fmt(result.liquidity.operatingCashflow)}                        testId="pec-operating-cashflow" />
        <Row label="Investment Allocations"        value={fmt(-Math.abs(result.liquidity.investmentAllocations))}         muted testId="pec-investment-allocations" />
        <Row label="Property Acquisition Cash Used" value={fmt(-Math.abs(result.liquidity.propertyAcquisitionCashUsed))} muted testId="pec-property-acquisition" />
        <Row
          label="Closing Cash"
          value={fmt(result.liquidity.closingCash)}
          tone={liquidityTone(result.liquidity)}
          bold
          testId="pec-closing-cash"
        />
        <LiquidityPill liquidity={result.liquidity} />
      </Section>

      {/* Contextual explanation — only when funded but year-end cash negative */}
      {result.showContextualExplanation && result.contextualExplanation && (
        <div
          className="rounded-xl px-3 py-2.5 text-xs border"
          style={{
            background: "hsl(43,90%,10%)",
            borderColor: "hsl(43,90%,35%)",
            color: "hsl(43,70%,72%)",
          }}
          data-testid="plan-execution-contextual-explanation"
        >
          {result.contextualExplanation}
        </div>
      )}

      {/* Funding Gap Resolution Advisor — rendered only when feasibility
          reports a funding gap AND the parent supplied a resolution slot.
          Liquidity stress alone never triggers the advisor; the parent
          gates this on `feasibility.hasFundingGap`.
          #FWL_Funding_Gap_Resolution_Advisor */}
      {result.funding.hasFundingGap && resolutionSlot ? (
        <div data-testid="plan-execution-resolution-slot">
          {resolutionSlot}
        </div>
      ) : null}
    </div>
  );
}

// ─── Internal subcomponents ──────────────────────────────────────────────────

function fundingTone(f: FundingStatusSurface): "good" | "warn" | "bad" {
  if (f.status === "fully-funded")   return "good";
  if (f.status === "tight-liquidity") return "warn";
  return "bad";
}
function liquidityTone(l: LiquiditySurface): "good" | "warn" | "bad" {
  if (l.status === "healthy") return "good";
  if (l.status === "tight")   return "warn";
  return "bad";
}

function Section({
  title, question, testId, children,
}: { title: string; question: string; testId?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 p-3 space-y-1.5" data-testid={testId}>
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">{title}</h3>
        <span className="text-[10px] text-muted-foreground italic">{question}</span>
      </div>
      <div className="pt-1 space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label, value, tone, bold, muted, testId,
}: { label: string; value: string; tone?: "good" | "warn" | "bad"; bold?: boolean; muted?: boolean; testId?: string }) {
  const toneClass =
    tone === "good" ? "text-emerald-400" :
    tone === "warn" ? "text-amber-400" :
    tone === "bad"  ? "text-red-400" :
    "text-foreground/90";
  return (
    <div className="flex items-center justify-between" data-testid={testId}>
      <span className={`text-xs ${muted ? "text-muted-foreground" : "text-foreground/80"}`}>{label}</span>
      <span className={`tabular-nums ${bold ? "text-sm font-bold" : "text-xs"} ${toneClass}`}>{value}</span>
    </div>
  );
}

function StatusPill({ funding }: { funding: FundingStatusSurface }) {
  const tone = fundingTone(funding);
  const cls =
    tone === "good" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" :
    tone === "warn" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" :
                       "bg-red-500/15 border-red-500/30 text-red-300";
  return (
    <div
      className={`mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold border ${cls}`}
      data-testid="funding-status-pill"
    >
      <span>{funding.icon}</span>
      <span>{funding.label}</span>
    </div>
  );
}

function LiquidityPill({ liquidity }: { liquidity: LiquiditySurface }) {
  const tone = liquidityTone(liquidity);
  const cls =
    tone === "good" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" :
    tone === "warn" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" :
                       "bg-red-500/15 border-red-500/30 text-red-300";
  return (
    <div
      className={`mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold border ${cls}`}
      data-testid="liquidity-status-pill"
    >
      <span>{liquidity.icon}</span>
      <span>{liquidity.label}</span>
    </div>
  );
}

function StatusLine({
  label, icon, text, tone, testId,
}: { label: string; icon: string; text: string; tone: "good" | "warn" | "bad"; testId?: string }) {
  const toneClass =
    tone === "good" ? "text-emerald-300" :
    tone === "warn" ? "text-amber-300" :
                       "text-red-300";
  return (
    <div
      className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2"
      data-testid={testId}
    >
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${toneClass}`}>
        <span className="mr-1">{icon}</span>{text}
      </span>
    </div>
  );
}
