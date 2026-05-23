/**
 * AuditCoverageReport.tsx — visible Audit Coverage panel.
 *
 * Lists every required engine metric in COVERAGE_MANIFEST, indicates whether
 * a trace is currently registered for it, and shows aggregate totals
 * (connected / unconnected). Renders inline (panel-style) by default; can also
 * be used as a standalone page (no surrounding chrome).
 *
 * Audit Mode does NOT need to be ON for the report to render — it's a
 * developer-facing transparency surface. When Audit Mode is ON, clicking a
 * connected metric opens the trace panel for it.
 */

import { useEffect, useState, useMemo } from 'react';
import {
  CheckCircle2, XCircle, Search, Filter, Layers, AlertTriangle,
} from 'lucide-react';
import {
  COVERAGE_MANIFEST,
  ENGINE_LABELS,
  type CoverageEntry,
  type EngineSourceKey,
} from '@/lib/auditMode/coverageManifest';
import {
  hasTrace,
  subscribeRegistry,
  resolveTrace,
} from '@/lib/auditMode/auditRegistry';
import { useAuditMode } from '@/lib/auditMode/AuditModeContext';

interface CoverageRow extends CoverageEntry {
  connected: boolean;
  finalValue: string | number | null | undefined;
}

function buildRows(): CoverageRow[] {
  return COVERAGE_MANIFEST.map(entry => {
    const trace = resolveTrace(entry.id);
    return {
      ...entry,
      connected: hasTrace(entry.id),
      finalValue: trace?.finalValue ?? null,
    };
  });
}

export interface AuditCoverageReportProps {
  /** Render without the outer card chrome — useful for a standalone /audit-coverage page. */
  bare?: boolean;
}

export function AuditCoverageReport({ bare = false }: AuditCoverageReportProps) {
  const { openTrace } = useAuditMode();
  const [rows, setRows] = useState<CoverageRow[]>(() => buildRows());
  const [filter, setFilter] = useState<EngineSourceKey | 'all'>('all');
  const [search, setSearch] = useState('');

  // Live-update whenever the registry changes (lazy factories also re-fire).
  useEffect(() => {
    const unsub = subscribeRegistry(() => setRows(buildRows()));
    return unsub;
  }, []);

  // Aggregate counts.
  const stats = useMemo(() => {
    const total = rows.length;
    const connected = rows.filter(r => r.connected).length;
    const unconnected = total - connected;
    const pct = total > 0 ? Math.round((connected / total) * 100) : 0;
    const byEngine: Partial<Record<EngineSourceKey, { total: number; connected: number }>> = {};
    rows.forEach(r => {
      const slot = byEngine[r.engine] ?? { total: 0, connected: 0 };
      slot.total += 1;
      if (r.connected) slot.connected += 1;
      byEngine[r.engine] = slot;
    });
    return { total, connected, unconnected, pct, byEngine };
  }, [rows]);

  // Filtered view.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filter !== 'all' && r.engine !== filter) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.surface.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search]);

  const Header = (
    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-bold tracking-tight">Audit Coverage Report</span>
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="text-emerald-400 font-mono">{stats.connected}</span>
        {' / '}
        <span className="font-mono">{stats.total}</span>
        {' connected '}
        ({stats.pct}%)
      </div>
    </div>
  );

  const Stats = (
    <div className="grid grid-cols-3 gap-2 mb-3">
      <div className="rounded-xl border border-border bg-card p-2.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total auditable metrics</div>
        <div className="text-xl font-bold tabular-nums">{stats.total}</div>
      </div>
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2.5">
        <div className="text-[10px] uppercase tracking-wider text-emerald-400">Connected</div>
        <div className="text-xl font-bold tabular-nums text-emerald-300">{stats.connected}</div>
      </div>
      <div className={`rounded-xl border p-2.5 ${stats.unconnected > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-card'}`}>
        <div className={`text-[10px] uppercase tracking-wider ${stats.unconnected > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>Unconnected</div>
        <div className={`text-xl font-bold tabular-nums ${stats.unconnected > 0 ? 'text-amber-300' : ''}`}>{stats.unconnected}</div>
      </div>
    </div>
  );

  const EngineSummary = (
    <div className="rounded-xl border border-border bg-card p-2.5 mb-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Per-engine coverage</div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(stats.byEngine).map(([engine, slot]) => {
          if (!slot) return null;
          const pct = slot.total > 0 ? Math.round((slot.connected / slot.total) * 100) : 0;
          const colour = pct === 100 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400';
          return (
            <button
              key={engine}
              onClick={() => setFilter(engine as EngineSourceKey)}
              className={`text-[11px] px-2 py-1 rounded-md border ${filter === engine ? 'border-amber-400/50 bg-amber-500/10' : 'border-border bg-background/40'} hover:border-amber-400/40`}
              data-testid={`audit-coverage-engine-${engine}`}
            >
              <span className="text-foreground/80 font-medium">{ENGINE_LABELS[engine as EngineSourceKey]}</span>
              <span className={`ml-1.5 tabular-nums ${colour}`}>{slot.connected}/{slot.total} ({pct}%)</span>
            </button>
          );
        })}
        <button
          onClick={() => setFilter('all')}
          className={`text-[11px] px-2 py-1 rounded-md border ${filter === 'all' ? 'border-amber-400/50 bg-amber-500/10' : 'border-border bg-background/40'}`}
        >
          All
        </button>
      </div>
    </div>
  );

  const FilterRow = (
    <div className="flex items-center gap-2 mb-2">
      <div className="flex items-center gap-1.5 flex-1 bg-background/40 border border-border rounded-md px-2 py-1">
        <Search className="w-3 h-3 text-muted-foreground" />
        <input
          type="text"
          placeholder="Filter by id / description / surface…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-transparent outline-none text-xs flex-1 placeholder:text-muted-foreground"
          data-testid="audit-coverage-search"
        />
      </div>
      <Filter className="w-3 h-3 text-muted-foreground" />
    </div>
  );

  const Rows = (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-[24px_1fr_1.5fr_1fr_120px] text-[10px] uppercase tracking-wider text-muted-foreground bg-background/40 px-2.5 py-1.5 border-b border-border">
        <div></div>
        <div>Trace id</div>
        <div>Description</div>
        <div>Surface</div>
        <div>Final value</div>
      </div>
      <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
        {visibleRows.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">No metrics match the current filter.</div>
        ) : (
          visibleRows.map(row => (
            <button
              key={row.id}
              onClick={() => row.connected && openTrace(row.id)}
              disabled={!row.connected}
              className={`w-full grid grid-cols-[24px_1fr_1.5fr_1fr_120px] text-[11px] px-2.5 py-1.5 text-left hover:bg-background/40 disabled:cursor-not-allowed ${row.connected ? '' : 'opacity-80'}`}
              data-testid={`audit-coverage-row-${row.id}`}
            >
              <div>
                {row.connected
                  ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  : <XCircle className="w-3 h-3 text-amber-400" />}
              </div>
              <div className="font-mono text-foreground/90 truncate">{row.id}</div>
              <div className="text-muted-foreground truncate">{row.description}</div>
              <div className="text-muted-foreground truncate">{row.surface}</div>
              <div className="font-mono tabular-nums text-right truncate text-foreground/70">
                {row.connected ? (row.finalValue ?? '—') : '—'}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  const Footer = stats.unconnected > 0 ? (
    <div className="mt-2 flex items-start gap-2 text-[11px] text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
      <span>
        {stats.unconnected} metric{stats.unconnected === 1 ? '' : 's'} are not yet connected — open the surface that displays them so the host component registers its traces.
      </span>
    </div>
  ) : (
    <div className="mt-2 flex items-start gap-2 text-[11px] text-emerald-300 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
      <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />
      <span>100% of required engine metrics are connected to the audit registry.</span>
    </div>
  );

  const Body = (
    <>
      {Stats}
      {EngineSummary}
      {FilterRow}
      {Rows}
      {Footer}
    </>
  );

  if (bare) return <div className="w-full">{Body}</div>;

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4" data-testid="audit-coverage-report">
      {Header}
      {Body}
    </div>
  );
}

export default AuditCoverageReport;
