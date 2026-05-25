/**
 * AdvancedDisclosure — collapsible "Where did these numbers come from?" card.
 *
 * Sprint 11 UX Recovery (#20). Standard wrapper used by every module to demote
 * engine-diagnostic surfaces (audit trails, search metrics, source-of-truth
 * reconciliation, raw metric grids) from the primary view into a single
 * collapsed disclosure. Nothing is deleted — diagnostics remain reachable.
 *
 * Behaviour:
 *  - Default collapsed.
 *  - When Audit Mode is ON globally, the disclosure auto-opens so engineering
 *    can still trace numbers in a single click.
 */

import React, { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuditMode } from "@/lib/auditMode/AuditModeContext";
import { cn } from "@/lib/utils";

export interface AdvancedDisclosureProps {
  title?: string;
  subtitle?: string;
  defaultOpen?: boolean;
  /** When true, audit mode forces the disclosure open (default true). */
  auditMode?: boolean;
  className?: string;
  "data-testid"?: string;
  children: ReactNode;
}

export function AdvancedDisclosure({
  title = "Where did these numbers come from?",
  subtitle,
  defaultOpen = false,
  auditMode: respectAuditMode = true,
  className,
  "data-testid": testId = "advanced-disclosure",
  children,
}: AdvancedDisclosureProps) {
  const { auditMode } = useAuditMode();
  const [open, setOpen] = useState<boolean>(defaultOpen || (respectAuditMode && auditMode));

  useEffect(() => {
    if (respectAuditMode && auditMode) setOpen(true);
  }, [auditMode, respectAuditMode]);

  return (
    <Card className={cn("border-dashed border-muted-foreground/30 bg-muted/30", className)} data-testid={testId}>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-testid={`${testId}-toggle`}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <span className="flex flex-col">
            <span>{title}</span>
            {subtitle && <span className="text-xs font-normal text-muted-foreground/80">{subtitle}</span>}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
        {open && (
          <div className="border-t border-muted-foreground/20 px-4 py-4" data-testid={`${testId}-content`}>
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AdvancedDisclosure;
