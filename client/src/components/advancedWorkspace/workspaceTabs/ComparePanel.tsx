/**
 * ComparePanel — Phase B comparison hub.
 *
 * Two view modes:
 *   - "table" : ScenarioComparisonTable + ScenarioTreeView side-by-side
 *   - "overlay": ScenarioOverlayChart with all selected scenarios
 *
 * Driven by the workspace's `selectedScenarioIds` (or all ranked if none).
 */
import { useMemo, useState } from "react";
import { Table as TableIcon, LineChart as LineChartIcon } from "lucide-react";
import type { QuickDecisionOutput } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import { ScenarioComparisonTable } from "../compare/ScenarioComparisonTable";
import { ScenarioOverlayChart } from "../compare/ScenarioOverlayChart";
import { ScenarioTreeView } from "../compare/ScenarioTreeView";
import { PANEL_HEADING_CLS, MICRO_CLS } from "../workspaceTokens";
import { cn } from "@/lib/utils";

export interface ComparePanelProps {
  output: QuickDecisionOutput;
  fmt: {
    fmt$: (n: number) => string;
    fmt$k: (n: number) => string;
    fmt$M: (n: number) => string;
    pct: (n: number, d?: number) => string;
    sentence: (s: string) => string;
  };
  selectedScenarioIds: string[];
  selectedRailScenarioId: string | null;
  setRailScenario: (id: string) => void;
  privacyMode?: boolean;
}

type ViewMode = "table" | "overlay";

export function ComparePanel({
  output, fmt, selectedScenarioIds, selectedRailScenarioId, setRailScenario, privacyMode,
}: ComparePanelProps) {
  const [mode, setMode] = useState<ViewMode>("table");

  const effectiveIds = selectedScenarioIds.length > 0
    ? selectedScenarioIds
    : output.ranked.slice(0, 5).map((c) => c.id);

  const overlayCandidates = useMemo(
    () => output.ranked.filter((c) => effectiveIds.includes(c.id)),
    [output.ranked, effectiveIds],
  );

  return (
    <section className="space-y-4" data-testid="compare-panel">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className={PANEL_HEADING_CLS}>Comparison workspace</h2>
          <p className={MICRO_CLS}>
            {selectedScenarioIds.length > 0
              ? `${selectedScenarioIds.length} scenarios selected`
              : `Top ${Math.min(5, output.ranked.length)} scenarios shown — tick more in Control Tower`}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="inline-flex items-center border border-border rounded-md overflow-hidden bg-card">
          <ModeButton
            active={mode === "table"} onClick={() => setMode("table")}
            label="Table" icon={<TableIcon className="h-3 w-3" />}
          />
          <ModeButton
            active={mode === "overlay"} onClick={() => setMode("overlay")}
            label="Overlay" icon={<LineChartIcon className="h-3 w-3" />}
          />
        </div>
      </header>

      {mode === "table" ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <ScenarioComparisonTable
            output={output}
            fmt={fmt}
            selectedScenarioIds={selectedScenarioIds.length > 0 ? selectedScenarioIds : undefined}
            onRowClick={setRailScenario}
          />
          <ScenarioTreeView
            output={output}
            selectedId={selectedRailScenarioId}
            onSelect={setRailScenario}
            fmt={fmt}
          />
        </div>
      ) : (
        <ScenarioOverlayChart
          candidates={overlayCandidates}
          fmt={fmt}
          hidden={privacyMode}
        />
      )}
    </section>
  );
}

function ModeButton({
  active, onClick, label, icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 text-[11px] uppercase tracking-wide transition-colors",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
