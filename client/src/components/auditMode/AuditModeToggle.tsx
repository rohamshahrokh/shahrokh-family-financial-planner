/**
 * AuditModeToggle.tsx — Global Audit Mode toggle for the site header.
 *
 * Renders a compact pill button labelled "Audit · ON/OFF" that matches the
 * existing header chip style (privacy toggle, theme button). When ON the
 * label shows in gold to mirror the premium accent.
 *
 * Desktop layout — full label visible.
 * Mobile layout — label collapses to the icon to stay within the cramped
 * 320–375px header. The `Microscope` icon is the canonical audit affordance.
 */

import { Microscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuditMode } from '@/lib/auditMode/AuditModeContext';

export function AuditModeToggle() {
  const { auditMode, toggleAuditMode } = useAuditMode();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleAuditMode}
      className="h-7 text-xs gap-1.5 px-2 sm:px-2.5"
      style={{
        borderColor: auditMode
          ? 'hsl(var(--gold))'
          : 'hsl(var(--gold-dim) / 0.4)',
        color: auditMode ? 'hsl(var(--gold))' : 'hsl(var(--muted-foreground))',
        background: auditMode ? 'hsl(var(--gold-surface))' : 'transparent',
      }}
      data-testid="button-audit-mode-toggle"
      aria-pressed={auditMode}
      aria-label={auditMode ? 'Disable Audit Mode' : 'Enable Audit Mode'}
      title={
        auditMode
          ? 'Audit Mode is ON — click any metric to see how it was calculated'
          : 'Audit Mode is OFF — turn on to inspect any metric'
      }
    >
      <Microscope className="w-3 h-3 shrink-0" />
      <span className="hidden sm:inline">
        Audit · {auditMode ? 'ON' : 'OFF'}
      </span>
    </Button>
  );
}
