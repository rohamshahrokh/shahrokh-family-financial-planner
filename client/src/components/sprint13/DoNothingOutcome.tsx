/**
 * Sprint 13 Section 4 — Do Nothing Outcome.
 *
 * Four lines, no chrome. Answers "What happens if I do nothing?"
 */
import React from "react";
import { formatCurrency } from "@/lib/finance";
import SourceTag from "@/components/ui/SourceTag";
import { selectSourceLabelFor } from "@/lib/goalSolverView";

export interface DoNothingOutcomeProps {
  netWorth?: number;
  passiveIncome?: number;
  probability?: number; // 0..1
  fireDate?: string | number;
  testidPrefix?: string;
  className?: string;
}

function fmtMoney(n?: number): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return formatCurrency(n, true);
}

function fmtPct(n?: number): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `${Math.round(n * 100)}%`;
}

export function DoNothingOutcome({
  netWorth,
  passiveIncome,
  probability,
  fireDate,
  testidPrefix = "do-nothing",
  className = "",
}: DoNothingOutcomeProps) {
  const lines: Array<{ label: string; value: string | null; testid: string; sourceKey: Parameters<typeof selectSourceLabelFor>[0] }> = [
    {
      label: "Net Worth",
      value: fmtMoney(netWorth),
      testid: `${testidPrefix}-nw`,
      sourceKey: "doNothingNetWorth",
    },
    {
      label: "Passive Income",
      value: fmtMoney(passiveIncome),
      testid: `${testidPrefix}-pi`,
      sourceKey: "doNothingPassiveIncome",
    },
    {
      label: "Probability",
      value: fmtPct(probability),
      testid: `${testidPrefix}-prob`,
      sourceKey: "doNothingProbability",
    },
    {
      label: "Expected FIRE",
      value: fireDate != null && fireDate !== "" ? String(fireDate) : null,
      testid: `${testidPrefix}-fire-date`,
      sourceKey: "doNothingFireDate",
    },
  ];

  return (
    <section
      className={`rounded-lg border border-zinc-300/40 dark:border-zinc-700/60 bg-muted/20 px-3 py-2 ${className}`}
      data-testid={testidPrefix}
    >
      <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
        If you do nothing
      </h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        {lines.map((line) => {
          if (line.value == null) return null;
          const src = selectSourceLabelFor(line.sourceKey);
          return (
            <div
              key={line.testid}
              className="flex items-baseline justify-between gap-2 text-sm"
              data-testid={line.testid}
            >
              <dt className="text-muted-foreground">{line.label}:</dt>
              <dd className="flex items-baseline gap-2">
                <span className="font-semibold tabular-nums text-foreground" data-testid={`${line.testid}-value`}>
                  {line.value}
                </span>
                <SourceTag label={src.label} internalRef={src.internalRef} testid={`${line.testid}-source`} className="mt-0" />
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

export default DoNothingOutcome;
