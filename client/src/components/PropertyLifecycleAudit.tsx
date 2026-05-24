/**
 * PropertyLifecycleAudit.tsx
 *
 * Property → Lifecycle Analysis → Lifecycle Audit section.
 *
 * Sprint 2C extension — adds the full 5-column inclusion grid required by
 * the property lifecycle model (Planned → Under Contract → Settled → Sold →
 * Archived). For every property row the audit shows:
 *
 *   • Friendly label / name (with internal id as provenance text)
 *   • Lifecycle status
 *   • Included in Current Net Worth          (YES / NO)
 *   • Included in Current Debt               (YES / NO)
 *   • Included in Current Income             (YES / NO)
 *   • Included in Current Expenses           (YES / NO)
 *   • Included in Future Forecast            (YES / NO)
 *   • Reason and any engine-vs-status mismatch warning
 *
 * Business rules (Sprint 2C):
 *   PLANNED:          Future Forecast only.
 *   UNDER_CONTRACT:   Future Forecast only.
 *   SETTLED / ACTIVE: Net Worth + Debt + Income + Expenses + Future Forecast.
 *   SOLD:             None — historical record only.
 *   ARCHIVED:         None — historical record only.
 *
 * The audit is purely explanatory — it does NOT change forecast, Monte Carlo,
 * Future Wealth Path, Events Timeline or tax-engine math. Mismatches between
 * the user-declared lifecycle status and the engine's date-driven inclusion
 * (settlement_date) are surfaced as warnings so the user can fix the row.
 *
 * Engines determine "active vs planned" using `settlement_date <= today`
 * combined with the `lifecycle_status` precedence rule defined in
 * `dashboardDataContract.ts` (selectSettledIPs).
 */

import { useMemo } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Archive, History } from 'lucide-react';

export type LifecycleStatus =
  | 'planned'
  | 'under_contract'
  | 'settled'
  | 'sold'
  | 'archived';

const STATUS_LABEL: Record<LifecycleStatus, string> = {
  planned: 'Planned',
  under_contract: 'Under Contract',
  settled: 'Settled',
  sold: 'Sold',
  archived: 'Archived',
};

const STATUS_TONE: Record<LifecycleStatus, string> = {
  planned: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
  under_contract: 'bg-sky-500/15 border-sky-500/40 text-sky-300',
  settled: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  sold: 'bg-slate-500/15 border-slate-500/40 text-slate-300',
  archived: 'bg-slate-700/30 border-slate-600/40 text-slate-400',
};

export interface InclusionExpectation {
  /** Legacy alias for netWorth (kept for backward-compat with existing tests). */
  assets: boolean;
  /** Legacy alias for debt (kept for backward-compat with existing tests). */
  liabilities: boolean;
  /** Legacy alias for income (kept for backward-compat with existing tests). */
  rent: boolean;
  /** Sprint 2C — explicit five-column expectations. */
  netWorth: boolean;
  debt: boolean;
  income: boolean;
  expenses: boolean;
  forecast: boolean;
}

/**
 * Canonical inclusion-by-status table. Sprint 2C extends the original
 * three-column model (assets / liabilities / rent) to include `expenses`
 * and `forecast` per the lifecycle business rules. The legacy aliases
 * remain to keep the Sprint 2B audit consumers and the
 * test-property-lifecycle-audit.ts regression suite green without rewrites.
 */
const EXPECTED_BY_STATUS: Record<LifecycleStatus, InclusionExpectation> = {
  planned: {
    assets: false, liabilities: false, rent: false,
    netWorth: false, debt: false, income: false, expenses: false, forecast: true,
  },
  under_contract: {
    assets: false, liabilities: false, rent: false,
    netWorth: false, debt: false, income: false, expenses: false, forecast: true,
  },
  settled: {
    assets: true,  liabilities: true,  rent: true,
    netWorth: true,  debt: true,  income: true,  expenses: true,  forecast: true,
  },
  sold: {
    assets: false, liabilities: false, rent: false,
    netWorth: false, debt: false, income: false, expenses: false, forecast: false,
  },
  archived: {
    assets: false, liabilities: false, rent: false,
    netWorth: false, debt: false, income: false, expenses: false, forecast: false,
  },
};

export interface PropertyAuditRow {
  id: string | number;
  name: string;
  status: LifecycleStatus;
  /** Legacy aliases retained — equivalent to netWorth/debt/income. */
  assets: boolean;
  liabilities: boolean;
  rent: boolean;
  /** Sprint 2C — explicit five-column inclusion. */
  netWorth: boolean;
  debt: boolean;
  income: boolean;
  expenses: boolean;
  forecast: boolean;
  reason: string;
  warning?: string;
}

/** Pure: normalise raw status string to a known LifecycleStatus. */
export function normaliseStatus(raw: unknown): LifecycleStatus {
  const s = String(raw ?? '').toLowerCase();
  if (
    s === 'planned' ||
    s === 'under_contract' ||
    s === 'settled' ||
    s === 'sold' ||
    s === 'archived'
  ) {
    return s as LifecycleStatus;
  }
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
  // Engine reality mismatches are surfaced as warnings instead.
  const assets      = expected.assets;
  const liabilities = expected.liabilities;
  const rent        = expected.rent;

  let reason: string;
  switch (status) {
    case 'planned':
      reason = 'Planned acquisitions are excluded from current net worth, debt, income and expenses. They are projected in the Future Forecast at their planned settlement date.';
      break;
    case 'under_contract':
      reason = 'Under-contract properties are committed but not yet settled — excluded from current net worth, debt, income and expenses. Future Forecast includes them at settlement.';
      break;
    case 'settled':
      reason = 'Settled properties are active — included in current net worth, debt, income, expenses and future forecast.';
      break;
    case 'sold':
      reason = 'Sold properties are removed from active holdings. The historical record is retained for CGT and reporting; no current calculations include this row.';
      break;
    case 'archived':
      reason = 'Archived properties are hidden from the active portfolio. The historical record is retained; no current or forecast calculations include this row.';
      break;
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
    warning = `Status is ${STATUS_LABEL[status]} but no settlement_date is set — engine treats rows without a settlement_date as already-settled. Add a future settlement_date or mark the row as Settled.`;
  }

  return {
    id: p?.id ?? '',
    name: friendlyLabel(p),
    status,
    assets,
    liabilities,
    rent,
    netWorth: expected.netWorth,
    debt: expected.debt,
    income: expected.income,
    expenses: expected.expenses,
    forecast: expected.forecast,
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
  const historicalCount = rows.filter(r => r.status === 'sold' || r.status === 'archived').length;

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
            For each property: declared lifecycle status and the resulting inclusion in current net worth, current debt, current income, current expenses and the future forecast. Read-only — engine math is unchanged.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {historicalCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-500/40 bg-slate-500/10 text-slate-300 text-[11px] font-semibold"
              data-testid="property-lifecycle-audit-historical-count"
            >
              <History className="w-3 h-3" />
              {historicalCount} historical
            </span>
          )}
          {warningCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[11px] font-semibold"
              data-testid="property-lifecycle-audit-warning-count"
            >
              <AlertTriangle className="w-3 h-3" />
              {warningCount} mismatch{warningCount === 1 ? '' : 'es'}
            </span>
          )}
        </div>
      </header>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Property</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
              <th className="text-left px-3 py-2 font-semibold">In Net Worth</th>
              <th className="text-left px-3 py-2 font-semibold">In Debt</th>
              <th className="text-left px-3 py-2 font-semibold">In Income</th>
              <th className="text-left px-3 py-2 font-semibold">In Expenses</th>
              <th className="text-left px-3 py-2 font-semibold">In Forecast</th>
              <th className="text-left px-3 py-2 font-semibold">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={String(r.id) || r.name}
                className={`border-t border-border/60 align-top ${
                  r.status === 'sold' || r.status === 'archived' ? 'opacity-70' : ''
                }`}
                data-testid={`property-lifecycle-audit-row-${r.id}`}
              >
                <td className="px-3 py-2">
                  <p className="font-semibold text-foreground inline-flex items-center gap-1">
                    {(r.status === 'sold' || r.status === 'archived') && (
                      <Archive className="w-3 h-3 text-slate-400" aria-hidden />
                    )}
                    {r.name}
                  </p>
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
                  <YesNoCell value={r.netWorth} label="Included in current net worth" testid={`property-lifecycle-audit-networth-${r.id}`} />
                </td>
                <td className="px-3 py-2">
                  <YesNoCell value={r.debt} label="Included in current debt" testid={`property-lifecycle-audit-debt-${r.id}`} />
                </td>
                <td className="px-3 py-2">
                  <YesNoCell value={r.income} label="Included in current income" testid={`property-lifecycle-audit-income-${r.id}`} />
                </td>
                <td className="px-3 py-2">
                  <YesNoCell value={r.expenses} label="Included in current expenses" testid={`property-lifecycle-audit-expenses-${r.id}`} />
                </td>
                <td className="px-3 py-2">
                  <YesNoCell value={r.forecast} label="Included in future forecast" testid={`property-lifecycle-audit-forecast-${r.id}`} />
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
