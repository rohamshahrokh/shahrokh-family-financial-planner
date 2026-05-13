/**
 * Control Tower — left rail of the Advanced Workspace.
 *
 * Persistent controls for the analytical session. Mirrors the inputs the
 * Quick Decision tab already exposes, but laid out in a denser, sticky
 * panel optimised for repeated tweaking during an analysis session.
 *
 * Engine inputs only — no fabricated controls.
 */
import { Beaker, Play, Loader2, Users, Calendar, Activity, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  PROFILE_REGISTRY,
  type InvestorProfile,
} from "@/lib/scenarioV2/registry";
import {
  type QuickDecisionQuestionKind,
  type RiskControlMode,
  listQuestionPresets,
} from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import { RISK_MODE_LABELS } from "@/lib/decisionEngineLabels";
import {
  LABEL_CLS,
  PANEL_HEADING_CLS,
  MICRO_CLS,
  PANEL_DIVIDER,
} from "./workspaceTokens";
import { cn } from "@/lib/utils";

export interface ControlTowerProps {
  // ── question / capital ──
  question: QuickDecisionQuestionKind;
  setQuestion: (q: QuickDecisionQuestionKind) => void;
  capital: number;
  setCapital: (n: number) => void;
  capitalEligible: boolean;

  // ── horizon / household ──
  horizonYears: number;
  setHorizonYears: (n: number) => void;
  dependants: number;
  setDependants: (n: number) => void;
  incomeVolatility: number;
  setIncomeVolatility: (n: number) => void;

  // ── investor profile + risk ──
  investorProfile: InvestorProfile;
  setInvestorProfile: (p: InvestorProfile) => void;
  riskMode: RiskControlMode;
  setRiskMode: (m: RiskControlMode) => void;

  // ── tax flags ──
  hasHelpDebt: boolean;
  setHasHelpDebt: (b: boolean) => void;
  hasPrivateHospitalCover: boolean;
  setHasPrivateHospitalCover: (b: boolean) => void;

  // ── action ──
  canRun: boolean;
  running: boolean;
  onRun: () => void;
  hasOutput: boolean;

  // ── compare mode ──
  compareMode: boolean;
  setCompareMode: (b: boolean) => void;
  selectedScenarioIds: string[];
  toggleScenarioSelection: (id: string) => void;
  scenarioList: { id: string; label: string }[];
}

const QUESTIONS: { kind: QuickDecisionQuestionKind; label: string }[] =
  listQuestionPresets().map((p) => ({ kind: p.kind, label: p.label }));

export function ControlTower(props: ControlTowerProps) {
  const {
    question, setQuestion, capital, setCapital, capitalEligible,
    horizonYears, setHorizonYears, dependants, setDependants,
    incomeVolatility, setIncomeVolatility,
    investorProfile, setInvestorProfile,
    riskMode, setRiskMode,
    hasHelpDebt, setHasHelpDebt, hasPrivateHospitalCover, setHasPrivateHospitalCover,
    canRun, running, onRun, hasOutput,
    compareMode, setCompareMode, selectedScenarioIds, toggleScenarioSelection, scenarioList,
  } = props;

  return (
    <aside
      className="hidden lg:flex flex-col gap-3 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto pr-1"
      aria-label="Control Tower"
      data-testid="control-tower"
    >
      <header className="flex items-center gap-2">
        <Beaker className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className={PANEL_HEADING_CLS}>Control Tower</h2>
      </header>

      {/* ── Objective ─────────────────────────────────────────────────────── */}
      <section className="space-y-1.5">
        <div className={LABEL_CLS}>Objective</div>
        <Select value={question} onValueChange={(v) => setQuestion(v as QuickDecisionQuestionKind)}>
          <SelectTrigger className="h-8 text-xs" data-testid="ct-question">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUESTIONS.map((q) => (
              <SelectItem key={q.kind} value={q.kind} className="text-xs">{q.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {capitalEligible && (
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between">
              <span className={LABEL_CLS}>Capital deployable</span>
              <span className="font-mono tabular-nums text-[11px]">${capital.toLocaleString()}</span>
            </div>
            <Slider
              value={[capital]}
              min={0}
              max={2_000_000}
              step={10_000}
              onValueChange={(v) => setCapital(v[0] ?? 0)}
              data-testid="ct-capital"
            />
          </div>
        )}
      </section>

      <div className={PANEL_DIVIDER} />

      {/* ── Horizon & household ───────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span className={LABEL_CLS}>Horizon</span>
          <span className="ml-auto font-mono tabular-nums text-[11px]">{horizonYears}y</span>
        </div>
        <Slider value={[horizonYears]} min={5} max={40} step={1} onValueChange={(v) => setHorizonYears(v[0] ?? 20)} />

        <div className="flex items-center gap-1.5 pt-1">
          <Users className="h-3 w-3 text-muted-foreground" />
          <span className={LABEL_CLS}>Dependants</span>
          <span className="ml-auto font-mono tabular-nums text-[11px]">{dependants}</span>
        </div>
        <Slider value={[dependants]} min={0} max={6} step={1} onValueChange={(v) => setDependants(v[0] ?? 0)} />

        <div className="flex items-center gap-1.5 pt-1">
          <Activity className="h-3 w-3 text-muted-foreground" />
          <span className={LABEL_CLS}>Income volatility</span>
          <span className="ml-auto font-mono tabular-nums text-[11px]">{(incomeVolatility * 100).toFixed(0)}%</span>
        </div>
        <Slider value={[incomeVolatility * 100]} min={0} max={50} step={5} onValueChange={(v) => setIncomeVolatility((v[0] ?? 10) / 100)} />
      </section>

      <div className={PANEL_DIVIDER} />

      {/* ── Investor profile + risk mode ──────────────────────────────────── */}
      <section className="space-y-2">
        <div className="space-y-1">
          <div className={LABEL_CLS}>Investor profile</div>
          <Select value={investorProfile} onValueChange={(v) => setInvestorProfile(v as InvestorProfile)}>
            <SelectTrigger className="h-8 text-xs" data-testid="ct-profile">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PROFILE_REGISTRY).map(([id, p]) => (
                <SelectItem key={id} value={id} className="text-xs">{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <div className={LABEL_CLS}>Risk mode</div>
          <Select value={riskMode} onValueChange={(v) => setRiskMode(v as RiskControlMode)}>
            <SelectTrigger className="h-8 text-xs" data-testid="ct-risk-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["conservative", "balanced", "aggressive", "custom"] as RiskControlMode[]).map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {RISK_MODE_LABELS[m]?.simple ?? m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className={PANEL_DIVIDER} />

      {/* ── Tax flags ─────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className={LABEL_CLS}>Tax flags</div>
        <div className="flex items-center justify-between text-xs">
          <span>HELP debt</span>
          <Switch checked={hasHelpDebt} onCheckedChange={setHasHelpDebt} data-testid="ct-help-debt" />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span>Private hospital cover</span>
          <Switch checked={hasPrivateHospitalCover} onCheckedChange={setHasPrivateHospitalCover} data-testid="ct-phc" />
        </div>
      </section>

      <div className={PANEL_DIVIDER} />

      {/* ── Action ────────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <Button
          onClick={onRun}
          disabled={!canRun || running}
          className="w-full h-9 text-xs"
          data-testid="ct-run"
        >
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Running Monte Carlo…
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              {hasOutput ? "Re-run analysis" : "Run analysis"}
            </>
          )}
        </Button>
        <p className={cn(MICRO_CLS, "text-center")}>
          300 Monte Carlo paths · seeded for reproducibility
        </p>
      </section>

      {/* ── Compare toggles (only shown when there is output) ─────────────── */}
      {hasOutput && scenarioList.length > 0 && (
        <>
          <div className={PANEL_DIVIDER} />
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={LABEL_CLS}>Compare scenarios</span>
              <Switch
                checked={compareMode}
                onCheckedChange={setCompareMode}
                data-testid="ct-compare-mode"
              />
            </div>
            {compareMode && (
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {scenarioList.map((s) => {
                  const checked = selectedScenarioIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        "flex items-center gap-2 text-[11px] px-1.5 py-1 rounded cursor-pointer",
                        "hover:bg-muted/50",
                        checked && "bg-muted/70",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleScenarioSelection(s.id)}
                        className="h-3 w-3"
                      />
                      <span className="truncate">{s.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      <div className={PANEL_DIVIDER} />

      {/* ── Modelling disclaimer (carried) ─────────────────────────────────── */}
      <section className="text-[10px] leading-tight text-muted-foreground flex items-start gap-1.5 px-1">
        <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0" />
        <span>Modelling only — not personal tax or financial advice.</span>
      </section>
    </aside>
  );
}
