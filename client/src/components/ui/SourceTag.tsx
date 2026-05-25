/**
 * SourceTag — small, muted source-lineage chip displayed beneath promoted metrics.
 *
 * Sprint 13. Every above-the-fold metric on the redesigned pages must trace
 * back to an engine. SourceTag renders one short line such as
 * "Source: Forecast Engine" so the user understands provenance without
 * opening any disclosure.
 *
 * Audit Mode (`?audit=1` or the global toggle) reveals the engine-internal
 * reference (e.g. ranked candidate id) next to the label.
 */
import React from "react";
import { useAuditMode } from "@/lib/auditMode/AuditModeContext";
import { cn } from "@/lib/utils";

export interface SourceTagProps {
  label?: string | null;
  internalRef?: string | null;
  className?: string;
  testid?: string;
}

export function SourceTag({ label, internalRef, className, testid }: SourceTagProps) {
  const { auditMode } = useAuditMode();
  const trimmed = (label ?? "").trim();
  if (!trimmed) return null;

  return (
    <div
      className={cn(
        "text-[11px] leading-tight text-muted-foreground/80 mt-1 flex items-center gap-1.5",
        className,
      )}
      data-testid={testid ?? "source-tag"}
    >
      <span data-testid={testid ? `${testid}-label` : "source-tag-label"}>Source: {trimmed}</span>
      {auditMode && internalRef ? (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-muted text-[10px] text-muted-foreground font-mono"
          data-testid={testid ? `${testid}-ref` : "source-tag-ref"}
        >
          {internalRef}
        </span>
      ) : null}
    </div>
  );
}

export default SourceTag;
