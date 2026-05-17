/**
 * DeepDiveSection.tsx — Progressive disclosure wrapper for FWL Phase 7.
 *
 * Lets us collapse heavier intelligence surfaces (FinancialOSCentre,
 * FamilyOfficeMode, FutureWorldsPanel, Monte Carlo detail, scenario trees,
 * technical internals) behind a single, calm reveal — without changing the
 * visual identity or removing functionality.
 *
 * Default-collapsed by design so the dashboard loads with the executive
 * narrative first, then the deeper layers expand on intent.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface DeepDiveSectionProps {
  title: string;
  subtitle?: string;
  Icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accentColor?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  testId?: string;
}

export default function DeepDiveSection({
  title,
  subtitle,
  Icon,
  accentColor = 'hsl(var(--gold))',
  defaultOpen = false,
  children,
  testId,
}: DeepDiveSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid={testId ?? 'deep-dive-section'}
    >
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'hsl(var(--gold-surface) / 0.4)',
                border: '1px solid hsl(var(--gold-dim) / 0.3)',
              }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: accentColor }} />
            </div>
          )}
          <div className="text-left min-w-0">
            <div className="text-sm font-bold text-foreground truncate">{title}</div>
            {subtitle && (
              <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: accentColor }}>
            {open ? 'Collapse' : 'Expand'}
          </span>
          {open ? (
            <ChevronUp className="w-4 h-4" style={{ color: accentColor }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: accentColor }} />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/30 p-3 md:p-4 bg-background/30">
          {children}
        </div>
      )}
    </div>
  );
}
