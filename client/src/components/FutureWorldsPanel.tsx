/**
 * FutureWorldsPanel.tsx — Phase 5
 *
 * Probability-weighted macro scenario tree. Calm advisor presentation —
 * Base / Bull / Bear / Inflation / Property crash / AI boom branches with
 * probability, expected net worth, FIRE year, liquidity & insolvency risk,
 * and the key driver.
 *
 * Reads directly from the Scenario Tree engine. Does not generate any
 * advice — strategic actions remain owned by Recommendation Engine V2.
 */

import { useMemo } from 'react';
import { Globe2 } from 'lucide-react';
import { buildScenarioTree, type ScenarioBranchInputs } from '@/lib/scenarioTree';

function fmtMoney(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export default function FutureWorldsPanel({
  inputs,
}: {
  inputs?: ScenarioBranchInputs;
}) {
  const tree = useMemo(() => buildScenarioTree(inputs), [JSON.stringify(inputs ?? {})]);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="future-worlds-panel">
      <header className="px-4 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
            <Globe2 className="w-4 h-4 text-sky-300" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Future Worlds</p>
            <p className="text-[10px] text-muted-foreground">Probability-weighted macro scenarios · {tree.branches.length} branches</p>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          weighted NW {fmtMoney(tree.baseProbabilityWeighted.netWorth)}
        </span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-4">
        {tree.branches.map((b) => (
          <article key={b.id} className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-bold text-foreground">{b.label}</p>
              <span className="text-[10px] text-muted-foreground">{Math.round(b.probability * 100)}%</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{b.keyDriver}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
              <dt className="text-muted-foreground">Net worth</dt>
              <dd className="text-right text-foreground">{fmtMoney(b.expectedNetWorth)}</dd>
              <dt className="text-muted-foreground">FIRE year</dt>
              <dd className="text-right text-foreground">{b.fireYear != null ? Math.round(b.fireYear) : '—'}</dd>
              <dt className="text-muted-foreground">Liquidity risk</dt>
              <dd className="text-right text-foreground">{Math.round((b.liquidityRisk ?? 0) * 100)}%</dd>
              <dt className="text-muted-foreground">Insolvency risk</dt>
              <dd className="text-right text-foreground">{Math.round((b.insolvencyRisk ?? 0) * 100)}%</dd>
            </dl>
            {b.netWorthBand ? (
              <p className="text-[10px] text-muted-foreground mt-2">
                Band {fmtMoney(b.netWorthBand.p10)} – {fmtMoney(b.netWorthBand.p90)}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <footer className="px-4 pb-4 pt-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground">
          Scenario tree feeds context into Recommendation Engine V2; advice surfaces remain
          unified. This panel is descriptive, not prescriptive.
        </p>
      </footer>
    </div>
  );
}
