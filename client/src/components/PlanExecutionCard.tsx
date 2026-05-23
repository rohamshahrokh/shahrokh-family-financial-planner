/**
 * PlanExecutionCard.tsx
 *
 * PLAN EXECUTION — dual-status card.
 *
 *   Section 1 · Funding Feasibility   ("Can I execute the plan?")
 *   Section 2 · Year-End Liquidity    ("What is my closing cash?")
 *
 * Pure presentation over existing engines:
 *   • Funding inputs  ← planFeasibility / depositPower (already computed)
 *   • Liquidity inputs ← cashEngine annual values (already computed)
 *
 * NO financial calculations are performed here. All values are passed in
 * by the parent surface using the live engine outputs.
 */

import {
  derivePlanExecutionStatus,
  type FundingInputs,
  type LiquidityInputs,
  type FundingResult,
  type LiquidityResult,
} from '@/lib/planExecutionStatus';
import { formatCurrency } from '@/lib/finance';
import { maskValue } from '@/components/PrivacyMask';
import { useAppStore } from '@/lib/store';

export interface PlanExecutionCardProps {
  funding: FundingInputs;
  liquidity: LiquidityInputs;
  /** Optional: short label describing the year these annual values cover. */
  year?: number | string;
  /** Optional click handler to open the Funding Gap Resolution Advisor. */
  onOpenFundingGapAdvisor?: () => void;
  /** Optional className passthrough for layout. */
  className?: string;
}

export default function PlanExecutionCard({
  funding,
  liquidity,
  year,
  onOpenFundingGapAdvisor,
  className,
}: PlanExecutionCardProps) {
  const { privacyMode } = useAppStore();
  const fmt = (n: number) => maskValue(formatCurrency(n, false), privacyMode);
  const result = derivePlanExecutionStatus(funding, liquidity);

  return (
    <div
      className={`rounded-2xl border border-border bg-card p-4 md:p-5 space-y-4 ${className ?? ''}`}
      data-testid="plan-execution-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">
          PLAN EXECUTION
        </h2>
        {year && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {String(year)}
          </span>
        )}
      </div>

      {/* Dual-status summary line */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs"
        data-testid="plan-execution-status-summary"
      >
        <StatusLine
          label="Funding Status"
          icon={result.funding.icon}
          text={result.funding.label}
          tone={result.funding.status === 'fully_funded' ? 'good' : 'bad'}
          testId="funding-status"
        />
        <StatusLine
          label="Liquidity Status"
          icon={result.liquidity.icon}
          text={result.liquidity.label}
          tone={
            result.liquidity.status === 'healthy'
              ? 'good'
              : result.liquidity.status === 'tight'
                ? 'warn'
                : 'bad'
          }
          testId="liquidity-status"
        />
      </div>

      {/* Section 1 — Funding Feasibility */}
      <Section
        title="Funding Feasibility"
        question="Can I execute the plan?"
        testId="funding-feasibility-section"
      >
        <Row label="Funding Capacity"           value={fmt(result.funding.capacity)} />
        <Row label="Funding Required"           value={fmt(result.funding.required)} />
        <Row
          label={result.funding.surplus >= 0 ? 'Funding Surplus' : 'Funding Gap'}
          value={fmt(result.funding.surplus)}
          tone={result.funding.surplus >= 0 ? 'good' : 'bad'}
          bold
          testId="funding-surplus"
        />
        <StatusPill funding={result.funding} />
        {result.funding.status === 'funding_gap' && onOpenFundingGapAdvisor && (
          <button
            type="button"
            onClick={onOpenFundingGapAdvisor}
            className="mt-2 text-xs font-semibold text-primary hover:underline"
            data-testid="open-funding-gap-advisor"
          >
            Open Funding Gap Resolution Advisor →
          </button>
        )}
      </Section>

      {/* Section 2 — Year-End Liquidity */}
      <Section
        title="Year-End Liquidity"
        question="What is my remaining cash after executing the plan?"
        testId="year-end-liquidity-section"
      >
        <Row label="Opening Cash"                 value={fmt(result.liquidity.openingCash)} />
        <Row label="Operating Cashflow"           value={fmt(result.liquidity.operatingCashflow)} />
        <Row label="Investment Allocations"       value={fmt(-Math.abs(result.liquidity.investmentAllocations))} muted />
        <Row label="Property Acquisition Cash Used" value={fmt(-Math.abs(result.liquidity.propertyAcquisitionCashUsed))} muted />
        <Row
          label="Closing Cash"
          value={fmt(result.liquidity.closingCash)}
          tone={
            result.liquidity.status === 'healthy'
              ? 'good'
              : result.liquidity.status === 'tight'
                ? 'warn'
                : 'bad'
          }
          bold
          testId="closing-cash"
        />
        <LiquidityPill liquidity={result.liquidity} />
      </Section>

      {/* Contextual explanation — only when Fully Funded + Liquidity Stress */}
      {result.showContextualExplanation && result.contextualExplanation && (
        <div
          className="rounded-xl px-3 py-2.5 text-xs border"
          style={{
            background: 'hsl(43,90%,10%)',
            borderColor: 'hsl(43,90%,35%)',
            color: 'hsl(43,70%,72%)',
          }}
          data-testid="plan-execution-contextual-explanation"
        >
          {result.contextualExplanation}
        </div>
      )}
    </div>
  );
}

// ─── Internal subcomponents ───────────────────────────────────────────────────

function Section({
  title, question, testId, children,
}: {
  title: string;
  question: string;
  testId?: string;
  children: React.ReactNode;
}) {
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
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad';
  bold?: boolean;
  muted?: boolean;
  testId?: string;
}) {
  const toneClass =
    tone === 'good' ? 'text-emerald-400' :
    tone === 'warn' ? 'text-amber-400' :
    tone === 'bad'  ? 'text-red-400' :
    'text-foreground/90';
  return (
    <div className="flex items-center justify-between" data-testid={testId}>
      <span className={`text-xs ${muted ? 'text-muted-foreground' : 'text-foreground/80'}`}>{label}</span>
      <span className={`tabular-nums ${bold ? 'text-sm font-bold' : 'text-xs'} ${toneClass}`}>{value}</span>
    </div>
  );
}

function StatusPill({ funding }: { funding: FundingResult }) {
  const good = funding.status === 'fully_funded';
  return (
    <div
      className={`mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold ${
        good
          ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
          : 'bg-red-500/15 border border-red-500/30 text-red-300'
      }`}
      data-testid="funding-status-pill"
    >
      <span>{funding.icon}</span>
      <span>{funding.label}</span>
    </div>
  );
}

function LiquidityPill({ liquidity }: { liquidity: LiquidityResult }) {
  const tone =
    liquidity.status === 'healthy'
      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
      : liquidity.status === 'tight'
        ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
        : 'bg-red-500/15 border-red-500/30 text-red-300';
  return (
    <div
      className={`mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold border ${tone}`}
      data-testid="liquidity-status-pill"
    >
      <span>{liquidity.icon}</span>
      <span>{liquidity.label}</span>
    </div>
  );
}

function StatusLine({
  label, icon, text, tone, testId,
}: {
  label: string;
  icon: string;
  text: string;
  tone: 'good' | 'warn' | 'bad';
  testId?: string;
}) {
  const toneClass =
    tone === 'good' ? 'text-emerald-300' :
    tone === 'warn' ? 'text-amber-300' :
    'text-red-300';
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
