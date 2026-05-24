/**
 * PropertyLifecycleAudit.tsx
 *
 * Property → Lifecycle Analysis → Lifecycle Audit section.
 *
 * Read-only audit table that, for every property row, shows:
 *   • Friendly label / name (with internal id as provenance text)
 *   • Lifecycle status (Planned / Under Contract / Settled)
 *   • Whether the row is currently included as: a current asset,
 *     a current liability, and rent in income
 *   • A short reason explaining why each inclusion is yes / no
 *   • A warning row when the engine's actual inclusion behaviour
 *     diverges from the expected behaviour for the row's status
 *
 * The audit is purely explanatory — it does NOT change forecast,
 * Monte Carlo, Future Wealth Path, Events Timeline or tax-engine
 * math. Mismatches between the user-declared lifecycle status and
 * the engine's date-driven inclusion (settlement_date) are surfaced
 * as warnings so the user can fix the underlying row data.
 *
 * Expected inclusion model:
 *
 *   planned         → assets: no,  liabilities: no,  rent: no
 *   under_contract  → assets: no,  liabilities: no,  rent: no
 *   settled         → assets: yes, liabilities: yes, rent: yes
 *
 * Engines in this codebase determine "active vs planned" using
 * `settlement_date <= today` (see client/src/lib/dashboardDataContract.ts).
 * The lifecycle_status column is the user's explicit declaration. When
 * those two disagree, the audit flags it.
 */

import { useMemo } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

type LifecycleStatus = 'planned' | 'under_contract' | 'settled';

const STATUS_LABEL: Record<LifecycleStatus, string> = {
  planned: 'Planned',
  under_contract: 'Under Contract',
  settled: 'Settled',
};

const STATUS_TONE: Record<LifecycleStatus, string> = {
  planned: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
  under_contract: 'bg-sky-500/15 border-sky-500/40 text-sky-300',
  settled: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
};

interface InclusionExpectation {
  assets: boolean;
  liabilities: boolean;
  rent: boolean;
}

const EXPECTED_BY_STATUS: Record<LifecycleStatus, InclusionExpectation> = {
  planned:        { assets: false, liabilities: false, rent: false },
  under_contract: { assets: false, liabilities: false, rent: false },
  settled:        { assets: true,  liabilities: true,  rent: true  },
};

export interface PropertyAuditRow {
  id: string | number;
  name: string;
  status: LifecycleStatus;
  assets: boolean;
  liabilities: boolean;
  rent: boolean;
  reason: string;
  warning?: string;
}

/** Pure: normalise raw status string to a known LifecycleStatus. */
export function normaliseStatus(raw: unknown): LifecycleStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'planned' || s === 'under_contract' || s === 'settled') return s;
  // Engines treat a row with no explicit status as 'settled' so the existing
  // forecast pipeline keeps working. We mirror that here.
  return 'settled';
}

/** Pure: friendly label for a property row — never uses raw id. */
export function friendlyLabel(p: any): string {
  const name = String(p?.name ?? p?.address ?? '').trim();
  if (name) return name;
  if (p?.type === 'ppor' || p?.type === 'owner_occupied') return 'Primary Residence';
  if (p?.type === 'land') return 'Vacant Land';
  return 'Investment Property';
}

/**
 * Pure: build the audit row for one property.
 *
 * Inputs:
 *   p        — raw property record
 *   todayIso — ISO yyyy-mm-dd; defaults to today. Allows deterministic tests.
 */
export function buildAuditRow(p: any, todayIso?: string): PropertyAuditRow {
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  const status = normaliseStatus(p?.lifecycle_status);
  const expected = EXPECTED_BY_STATUS[status];

  // Engine-side "is this row treated as a current/active asset?".
  // Mirrors selectSettledIPs() in dashboardDataContract.ts — a row with no
  // settlement_date is treated as already-settled (legacy behaviour) so the
  // existing forecast pipeline keeps including it.
  const settleStr: string | undefined = p?.settlement_date || undefined;
  const engineActive = !settleStr || String(settleStr) <= today;

  // Expected behaviour wins for the displayed inclusion columns — the
  // intent of the audit is "what should happen, per the declared status".
  // If the engine reality diverges, that is surfaced as a warning rather
  // than by silently changing the column values.
  const assets      = expected.assets;
  const liabilities = expected.liabilities;
  const rent        = expected.rent;

  let reason: string;
  if (status === 'planned') {
    reason = 'Planned acquisitions are excluded from current assets, liabilities and rental income until settlement.';
  } else if (status === 'under_contract') {
    reason = 'Under-contract acquisitions are committed but not yet settled — excluded from current assets, liabilities and rental income.';
  } else {
    reason = 'Settled properties are active — included in current assets, liabilities and rental income.';
  }

  // Mismatch detection between the declared status and the engine's
  // date-driven inclusion. Both directions are flagged.
  let warning: string | undefined;
  if (status === 'settled' && !engineActive) {
    warning = `Status is Settled but settlement_date (${settleStr}) is in the future — engine will currently treat this row as a planned acquisition. Backdate settlement_date or change status to Under Contract.`;
  } else if ((status === 'planned' || status === 'under_contract') && engineActive && settleStr) {
    warning = `Status is ${STATUS_LABEL[status]} but settlement_date (${settleStr}) is on or before today — engine will currently treat this row as active. Move settlement_date forward or mark the row as Settled.`;
  } else if ((status === 'planned' || status === 'under_contract') && !settleStr && engineActive) {
    // No settlement_date at all → engine default treats it as already-settled.
    // This is the most common silent mismatch.
    warning = `Status is ${STATUS_LABEL[status]} but no settlement_date is set — engine treats rows without a settlement_date as already-settled. Add a future settlement_date or mark the row as Settled.`;
  }

  return {
    id: p?.id ?? '',
    name: friendlyLabel(p),
    status,
    assets,
    liabilities,
    rent,
    reason,
    warning,
  };
}

function YesNoCell({ value, label, testid }: { value: boolean; label: string; testid?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
        value ? 'text-emerald-300' : 'text-muted-foreground'
      }`}
      data-testid={testid}
      aria-label={`${label}: ${value ? 'yes' : 'no'}`}
    >
      {value ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {value ? 'Yes' : 'No'}
    </span>
  );
}

interface Props {
  properties: any[];
  /** Pin "today" for deterministic rendering in tests/storybook. */
  todayIso?: string;
}

export default function PropertyLifecycleAudit({ properties, todayIso }: Props) {
  const rows = useMemo<PropertyAuditRow[]>(
    () => (properties || []).map(p => buildAuditRow(p, todayIso)),
    [properties, todayIso],
  );

  const warningCount = rows.filter(r => r.warning).length;

  if (rows.length === 0) {
    return (
      <section
        className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground"
        data-testid="property-lifecycle-audit-empty"
      >
        Add at least one property to see the lifecycle audit.
      </section>
    );
  }

  return (
    <section className="space-y-3" data-testid="property-lifecycle-audit">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Lifecycle Audit
          </h3>
          <p className="text-[11px] text-muted-foreground">
            For each property: declared lifecycle status and the resulting inclusion in current assets, current liabilities and rental income. Read-only — engine math is unchanged.
          </p>
        </div>
        {warningCount > 0 && (
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[11px] font-semibold"
            data-testid="property-lifecycle-audit-warning-count"
          >
            <AlertTriangle className="w-3 h-3" />
            {warningCount} mismatch{warningCount === 1 ? '' : 'es'}
          </span>
        )}
      </header>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Property</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
              <th className="text-left px-3 py-2 font-semibold">Current Assets</th>
              <th className="text-left px-3 py-2 font-semibold">Current Liabilities</th>
              <th className="text-left px-3 py-2 font-semibold">Rent in Income</th>
              <th className="text-left px-3 py-2 font-semibold">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={String(r.id) || r.name}
                className="border-t border-border/60 align-top"
                data-testid={`property-lifecycle-audit-row-${r.id}`}
              >
                <td className="px-3 py-2">
                  <p className="font-semibold text-foreground">{r.name}</p>
                  {r.id !== '' && (
                    <p
                      className="text-[10px] text-muted-foreground font-mono"
                      data-testid={`property-lifecycle-audit-id-${r.id}`}
                    >
                      id: {String(r.id)}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${STATUS_TONE[r.status]}`}
                    data-testid={`property-lifecycle-audit-status-${r.id}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <YesNoCell value={r.assets} label="Included in current assets" testid={`property-lifecycle-audit-assets-${r.id}`} />
                </td>
                <td className="px-3 py-2">
                  <YesNoCell value={r.liabilities} label="Included in current liabilities" testid={`property-lifecycle-audit-liabilities-${r.id}`} />
                </td>
                <td className="px-3 py-2">
                  <YesNoCell value={r.rent} label="Rent added to income" testid={`property-lifecycle-audit-rent-${r.id}`} />
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  <p>{r.reason}</p>
                  {r.warning && (
                    <p
                      className="mt-1 inline-flex items-start gap-1 text-amber-300"
                      data-testid={`property-lifecycle-audit-warning-${r.id}`}
                    >
                      <AlertTriangle className="w-3 h-3 mt-[1px] shrink-0" />
                      <span>{r.warning}</span>
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
