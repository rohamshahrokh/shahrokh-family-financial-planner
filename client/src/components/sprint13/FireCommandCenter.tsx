/**
 * Sprint 13 Section 1 — FIRE Command Center.
 *
 * Five tiles, single row on desktop, 2x3 on mobile. The hero that answers
 * "Where am I now?", "What's my target?", "How far?", "How long?", and
 * "What's my chance?" — in one glance.
 *
 * If `targetNetWorth` is empty, the whole component collapses to a CTA
 * pointing to the Dashboard (P0: hide, don't placeholder).
 */
import React from "react";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/finance";
import { isEmptyValue } from "@/lib/uiEmptyField";
import SourceTag from "@/components/ui/SourceTag";
import { selectSourceLabelFor } from "@/lib/goalSolverView";

export interface FireCommandCenterProps {
  currentNetWorth?: number;
  targetNetWorth?: number;
  gap?: number;
  yearsRemaining?: number;
  probability?: number; // 0..1
  testidPrefix?: string;
  className?: string;
}

function fmt(n?: number): string {
  if (n == null || !Number.isFinite(n)) return "";
  return formatCurrency(n, true);
}

export function FireCommandCenter({
  currentNetWorth,
  targetNetWorth,
  gap,
  yearsRemaining,
  probability,
  testidPrefix = "fcc",
  className = "",
}: FireCommandCenterProps) {
  const hasTarget = !isEmptyValue(targetNetWorth);

  if (!hasTarget) {
    return (
      <section
        className={`rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5 ${className}`}
        data-testid={`${testidPrefix}-empty`}
      >
        <h2 className="text-base sm:text-lg font-semibold text-foreground mb-1">
          Set a FIRE goal to see your gap
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          The Command Center activates once your Dashboard has a FIRE target net worth.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
          data-testid={`${testidPrefix}-empty-cta`}
        >
          Go to Dashboard →
        </Link>
      </section>
    );
  }

  const probPct = probability != null && Number.isFinite(probability) ? Math.round(probability * 100) : null;
  const probTone =
    probPct == null
      ? "text-muted-foreground"
      : probPct >= 70
      ? "text-emerald-600 dark:text-emerald-400"
      : probPct >= 40
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";

  const tiles: Array<{
    label: string;
    value: string;
    testid: string;
    valueTone?: string;
    sourceKey: Parameters<typeof selectSourceLabelFor>[0];
  }> = [
    {
      label: "Current Net Worth",
      value: fmt(currentNetWorth) || "—",
      testid: `${testidPrefix}-current-nw`,
      sourceKey: "currentNetWorth",
    },
    {
      label: "Target Net Worth",
      value: fmt(targetNetWorth) || "—",
      testid: `${testidPrefix}-target-nw`,
      sourceKey: "targetNetWorth",
    },
    {
      label: "Gap",
      value: gap != null && Number.isFinite(gap) ? fmt(gap) : "—",
      testid: `${testidPrefix}-gap`,
      valueTone: gap != null && gap > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
      sourceKey: "gap",
    },
    {
      label: "Years Remaining",
      value: yearsRemaining != null && Number.isFinite(yearsRemaining) ? `${yearsRemaining} yrs` : "—",
      testid: `${testidPrefix}-years-remaining`,
      sourceKey: "yearsRemaining",
    },
    {
      label: "Probability",
      value: probPct != null ? `${probPct}%` : "—",
      testid: `${testidPrefix}-probability`,
      valueTone: probTone,
      sourceKey: "probability",
    },
  ];

  return (
    <section
      className={`rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-card to-card p-3 sm:p-4 shadow-sm ${className}`}
      data-testid={testidPrefix}
    >
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base sm:text-lg font-semibold text-foreground" data-testid={`${testidPrefix}-title`}>
          FIRE Command Center
        </h2>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Your situation in 30 seconds</span>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        {tiles.map((t) => {
          const src = selectSourceLabelFor(t.sourceKey);
          return (
            <div
              key={t.testid}
              className="rounded-lg border border-border bg-card/70 px-3 py-2"
              data-testid={t.testid}
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">
                {t.label}
              </div>
              <div
                className={`text-lg sm:text-xl font-semibold tabular-nums leading-tight ${t.valueTone ?? "text-foreground"}`}
                data-testid={`${t.testid}-value`}
              >
                {t.value}
              </div>
              <SourceTag label={src.label} internalRef={src.internalRef} testid={`${t.testid}-source`} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default FireCommandCenter;
