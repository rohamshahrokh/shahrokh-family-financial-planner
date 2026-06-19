/**
 * audit-coverage.tsx — Developer-visible page that renders the global
 * Audit Coverage report. Mounted at /audit-coverage. The report is also
 * embedded as a panel inside the CalculationTracePanel directory view.
 */

import { Layers, Info } from 'lucide-react';
import { AuditCoverageReport } from '@/components/auditMode/AuditCoverageReport';

export default function AuditCoveragePage() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
          <Layers className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <h1 className="text-base sm:text-lg font-bold tracking-tight">Audit Mode — Coverage Report</h1>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Lists every engine metric the platform exposes under Audit Mode. The status column
            shows whether a trace is currently registered for each id; click a connected row to
            open its calculation trace panel.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/40 p-3 flex items-start gap-2 text-[11px] text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Coverage is live. Pages that own a metric register its trace on render; the report
          subscribes to the registry so counts update without a refresh. The target is 100%
          connected when every audited surface has been visited at least once in the current
          session.
        </span>
      </div>

      <AuditCoverageReport />
    </div>
  );
}
