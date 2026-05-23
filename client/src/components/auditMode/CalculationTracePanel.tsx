/**
 * CalculationTracePanel.tsx — Global trace panel rendered as a right-anchored
 * Sheet on desktop and a bottom-sheet on mobile (via the same Sheet primitive
 * with side="bottom" at <md).
 *
 * Layout sections (premium hierarchy):
 *   1. Header — metric label + final value (the user clicked this exact number)
 *   2. Plain English — one paragraph explaining what the metric means
 *   3. Formula — canonical formula
 *   4. Expanded — formula with actual values substituted
 *   5. Inputs — labelled rows of the raw inputs used
 *   6. Assumptions — pinned assumption set (rates, SWR, regime …)
 *   7. Included items — itemised contributors
 *   8. Excluded items — itemised exclusions + reason
 *   9. Provenance — data source · source engine · last calculated · scenario
 *
 * All sections are conditionally rendered — engines that don't supply a given
 * section simply omit it. No section title appears empty.
 */

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuditMode } from '@/lib/auditMode/AuditModeContext';
import { resolveTrace } from '@/lib/auditMode/auditRegistry';
import type {
  CalculationTrace,
  TraceInput,
  TraceAssumption,
  TraceIncludedExcluded,
} from '@/lib/auditMode/calculationTrace';
import { useMemo } from 'react';

function fmtDisplay(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—';
    // Engines normally format their own values; this fallback is for raw nums.
    return v.toLocaleString();
  }
  return v;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
      {children}
    </p>
  );
}

function InputRow({ row }: { row: TraceInput }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/20 last:border-0">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-foreground truncate">{row.label}</p>
        {row.source && (
          <p className="text-[10px] text-muted-foreground/80 mt-0.5 truncate">
            from {row.source}
          </p>
        )}
        {row.note && (
          <p className="text-[10px] text-muted-foreground mt-0.5 italic">
            {row.note}
          </p>
        )}
      </div>
      <span className="text-[12px] font-mono tabular-nums text-foreground shrink-0">
        {fmtDisplay(row.value)}
      </span>
    </div>
  );
}

function AssumptionRow({ row }: { row: TraceAssumption }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/20 last:border-0">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-foreground truncate">{row.label}</p>
        {row.source && (
          <p className="text-[10px] text-muted-foreground/80 mt-0.5 truncate">
            {row.source}
          </p>
        )}
      </div>
      {row.value !== undefined && (
        <span className="text-[12px] font-mono tabular-nums text-foreground shrink-0">
          {fmtDisplay(row.value)}
        </span>
      )}
    </div>
  );
}

function IncludedExcludedRow({
  row,
  tone,
}: {
  row: TraceIncludedExcluded;
  tone: 'green' | 'red';
}) {
  const colour =
    tone === 'green' ? 'hsl(142, 60%, 55%)' : 'hsl(0, 72%, 60%)';
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-border/15 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-foreground truncate">
          <span style={{ color: colour, marginRight: 6, fontWeight: 700 }}>
            {tone === 'green' ? '+' : '−'}
          </span>
          {row.label}
        </p>
        {row.reason && (
          <p className="text-[10px] text-muted-foreground mt-0.5 italic">
            {row.reason}
          </p>
        )}
      </div>
      {row.value !== undefined && (
        <span className="text-[11px] font-mono tabular-nums text-muted-foreground shrink-0">
          {fmtDisplay(row.value)}
        </span>
      )}
    </div>
  );
}

function TraceBody({ trace }: { trace: CalculationTrace }) {
  return (
    <div
      className="space-y-5 overflow-y-auto pb-8"
      data-testid="calculation-trace-body"
    >
      {/* Final value strip */}
      <div
        className="rounded-xl px-4 py-3"
        style={{
          background: 'hsl(var(--gold-surface))',
          border: '1px solid hsl(var(--gold-dim) / 0.4)',
        }}
        data-testid="trace-final-value"
      >
        <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
          Final value
        </p>
        <p
          className="text-xl font-extrabold tabular-nums mt-1"
          style={{ color: 'hsl(var(--gold))' }}
        >
          {fmtDisplay(trace.finalValue)}
        </p>
      </div>

      {/* Plain English */}
      <section data-testid="trace-section-plain-english">
        <SectionLabel>Plain English</SectionLabel>
        <p className="text-[12.5px] leading-relaxed text-foreground/90">
          {trace.plainEnglish}
        </p>
      </section>

      {/* Formula */}
      <section data-testid="trace-section-formula">
        <SectionLabel>Formula</SectionLabel>
        <div
          className="rounded-lg px-3 py-2 font-mono text-[12px] text-foreground overflow-x-auto"
          style={{
            background: 'hsl(var(--secondary) / 0.4)',
            border: '1px solid hsl(var(--border) / 0.5)',
          }}
        >
          {trace.formula}
        </div>
      </section>

      {/* Expanded with actual values */}
      <section data-testid="trace-section-expanded">
        <SectionLabel>Expanded — actual values</SectionLabel>
        <div
          className="rounded-lg px-3 py-2 font-mono text-[12px] text-foreground overflow-x-auto"
          style={{
            background: 'hsl(var(--secondary) / 0.4)',
            border: '1px solid hsl(var(--border) / 0.5)',
          }}
        >
          {trace.expanded}
        </div>
      </section>

      {/* Inputs */}
      {trace.inputs.length > 0 && (
        <section data-testid="trace-section-inputs">
          <SectionLabel>Inputs used</SectionLabel>
          <div>
            {trace.inputs.map((row, i) => (
              <InputRow key={`${row.label}-${i}`} row={row} />
            ))}
          </div>
        </section>
      )}

      {/* Assumptions */}
      {trace.assumptions.length > 0 && (
        <section data-testid="trace-section-assumptions">
          <SectionLabel>Assumptions</SectionLabel>
          <div>
            {trace.assumptions.map((row, i) => (
              <AssumptionRow key={`${row.label}-${i}`} row={row} />
            ))}
          </div>
        </section>
      )}

      {/* Included */}
      {trace.included.length > 0 && (
        <section data-testid="trace-section-included">
          <SectionLabel>Included items</SectionLabel>
          <div>
            {trace.included.map((row, i) => (
              <IncludedExcludedRow key={`inc-${i}`} row={row} tone="green" />
            ))}
          </div>
        </section>
      )}

      {/* Excluded */}
      {trace.excluded.length > 0 && (
        <section data-testid="trace-section-excluded">
          <SectionLabel>Excluded items</SectionLabel>
          <div>
            {trace.excluded.map((row, i) => (
              <IncludedExcludedRow key={`exc-${i}`} row={row} tone="red" />
            ))}
          </div>
        </section>
      )}

      {/* Notes */}
      {trace.notes && trace.notes.length > 0 && (
        <section data-testid="trace-section-notes">
          <SectionLabel>Notes</SectionLabel>
          <ul className="space-y-1">
            {trace.notes.map((n, i) => (
              <li key={i} className="text-[11.5px] text-muted-foreground italic leading-snug">
                • {n}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Provenance */}
      <section data-testid="trace-section-provenance">
        <SectionLabel>Provenance</SectionLabel>
        <dl className="grid grid-cols-[max-content,1fr] gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-muted-foreground">Source engine</dt>
          <dd className="text-foreground font-mono">{trace.sourceEngine}</dd>
          <dt className="text-muted-foreground">Data source</dt>
          <dd className="text-foreground font-mono">{trace.dataSource}</dd>
          <dt className="text-muted-foreground">Calculated at</dt>
          <dd className="text-foreground font-mono">{trace.calculatedAt}</dd>
          {trace.scenarioId && (
            <>
              <dt className="text-muted-foreground">Scenario</dt>
              <dd className="text-foreground font-mono">{trace.scenarioId}</dd>
            </>
          )}
          {trace.assumptionVersion && (
            <>
              <dt className="text-muted-foreground">Assumption version</dt>
              <dd className="text-foreground font-mono">{trace.assumptionVersion}</dd>
            </>
          )}
          {trace.inputHash && (
            <>
              <dt className="text-muted-foreground">Input hash</dt>
              <dd className="text-foreground font-mono">{trace.inputHash}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Metric id</dt>
          <dd className="text-foreground font-mono">{trace.id}</dd>
        </dl>
      </section>
    </div>
  );
}

/**
 * The global trace panel. Mounted once near the top of the app tree; opens
 * whenever a click handler in `AuditableMetric` calls `openTrace(id)`.
 */
export function CalculationTracePanel() {
  const { activeTraceId, closeTrace } = useAuditMode();

  // Resolving inside useMemo keeps the trace stable across re-renders while
  // the panel is open and avoids recomputing factory traces on every parent
  // re-render (registry side effects can still notify us).
  const trace = useMemo<CalculationTrace | null>(() => {
    return activeTraceId ? resolveTrace(activeTraceId) : null;
  }, [activeTraceId]);

  const open = !!activeTraceId;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closeTrace();
      }}
    >
      <SheetContent
        side={"right" as const}
        className="w-full sm:max-w-md md:max-w-lg lg:max-w-xl flex flex-col"
        data-testid="calculation-trace-panel"
      >
        <SheetHeader className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Calculation Trace
          </p>
          <SheetTitle className="text-base leading-tight text-foreground">
            {trace?.label ?? 'Metric not registered'}
          </SheetTitle>
          {!trace && activeTraceId && (
            <p className="text-[11px] text-muted-foreground italic">
              No trace was registered for id <code className="font-mono">{activeTraceId}</code>.
              The engine for this metric has not yet been wired into the audit registry.
            </p>
          )}
        </SheetHeader>
        {trace && <TraceBody trace={trace} />}
      </SheetContent>
    </Sheet>
  );
}
