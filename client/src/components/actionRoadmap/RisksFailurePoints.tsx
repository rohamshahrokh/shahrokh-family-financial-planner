/**
 * RisksFailurePoints — Action Roadmap S6 (Sprint 28B).
 *
 * Renders the failure-analysis selector output as a stacked card list.
 * Each card surfaces failure label, severity-banded chip, probability
 * (formatted as %), detail, and `Source: <driver>` for audit mode.
 *
 * Honesty: probability null → renders "Not modelled yet" without a
 * percentage. Severity "unknown" → neutral gray chip.
 */
import * as React from "react";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import { SourceChip } from "@/components/SourceChip";
import type { RoadmapSectionProps } from "./roadmapContext";
import type { Severity } from "@/lib/actionRoadmap/stressFailureAnalysis";

const SEVERITY_TONE: Record<Severity, string> = {
  low:     "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25",
  medium:  "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25",
  high:    "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25",
  unknown: "bg-muted text-muted-foreground ring-border",
};

function severityLabel(s: Severity): string {
  return s === "unknown" ? "Not modelled" : s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtPct(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "Not modelled";
  return `${(p * 100).toFixed(1)}%`;
}

function fmtPctAudit(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "null";
  return p.toFixed(4);
}

export function RisksFailurePoints(props: RoadmapSectionProps) {
  const { failures, auditMode, riskValidation } = props;

  return (
    <section
      data-testid="ar-s6-risks"
      aria-labelledby="ar-s6-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Risks & failure points</div>
          <h2 id="ar-s6-heading" className="text-base font-semibold text-foreground">What could break this plan</h2>
        </div>
      </div>

      {riskValidation && riskValidation.status === "warning" && (
        <div
          data-testid="ar-s6-validation-chip"
          className="mt-3 flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50/40 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/20 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          <span>
            <span className="font-medium uppercase tracking-wider">{riskValidation.warningKind?.replace(/_/g, " ")}</span>
            {" — "}
            {riskValidation.detail}
          </span>
        </div>
      )}

      <ul className="mt-4 space-y-2" data-testid="ar-s6-list">
        {failures.map((f) => (
          <li
            key={f.id}
            data-testid={`ar-s6-row-${f.id}`}
            className="rounded-lg border border-border/60 bg-background/60 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{f.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${SEVERITY_TONE[f.severity]}`}>
                {severityLabel(f.severity)}
              </span>
              <span className="ml-auto text-sm font-semibold text-foreground">{fmtPct(f.probability)}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{f.detail}</div>
            <div className="mt-1.5">
              <SourceChip
                attribution={{
                  source: f.probability == null ? "notModelled" : f.driver.startsWith("softWarnings.") ? "actionRoadmap.risk" : "scenarioV2.monteCarlo",
                  note: f.driver,
                }}
                auditMode={auditMode}
              />
            </div>
          </li>
        ))}
      </ul>

      {auditMode && riskValidation && (
        <div
          data-testid="ar-s6-audit-panel"
          className="mt-4 rounded-lg border border-border/60 bg-background/60 p-3 text-xs"
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Audit · raw MC risk probabilities
          </div>
          <ul className="grid grid-cols-2 gap-1 text-foreground">
            {failures.map((f) => (
              <li key={`audit-${f.id}`} className="flex justify-between">
                <span className="text-muted-foreground">{f.label}</span>
                <span className="font-mono">{fmtPctAudit(f.probability)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Validation: <span className="font-mono">{riskValidation.status}</span>
            {riskValidation.warningKind ? ` (${riskValidation.warningKind})` : ""}
            {" · "}
            sims: <span className="font-mono">{riskValidation.audit.simulationCount ?? "—"}</span>
            {" · "}
            terminalNwCV: <span className="font-mono">{riskValidation.audit.terminalNwCV != null ? riskValidation.audit.terminalNwCV.toFixed(4) : "—"}</span>
            {" · "}
            passiveIncomeCV: <span className="font-mono">{riskValidation.audit.passiveIncomeCV != null ? riskValidation.audit.passiveIncomeCV.toFixed(4) : "—"}</span>
          </div>
        </div>
      )}
    </section>
  );
}

export default RisksFailurePoints;
