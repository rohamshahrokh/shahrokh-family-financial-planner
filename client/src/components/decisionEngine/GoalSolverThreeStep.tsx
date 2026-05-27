/**
 * GoalSolverThreeStep — Sprint 20 PR-B P1-3.
 *
 * Three-step Goal Solver flow mounted at the top of the existing
 * GoalSolverProTab. Replaces the engine-toggle UX with:
 *   Step 1: targetFireYear + targetMonthlyPassiveIncome (only two visible
 *           inputs; both wired via useFireGoal / useSetFireGoal).
 *   Step 2: optional preferences disclosure (prefer property / prefer ETFs /
 *           minimize risk / maximize speed / reduce debt aggressively).
 *   Step 3: engine outputs — AdvisorRecommendation cards + RetirementTransition.
 *
 * Banished from this flow (per Sprint 20 charter): property count input,
 * debt ceiling input, risk score input, liquidity minimum input, portfolio
 * value input, contribution limit input.
 */

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import {
  useFireGoal,
  useSetFireGoal,
  defaultTargetFireYear,
} from "@/lib/fireGoalCanonical";
import { EmptyStateExplainer } from "@/components/EmptyStateExplainer";
import { AdvisorRecommendationCard } from "@/components/advisor/AdvisorRecommendationCard";
import type { AdvisorRecommendation } from "@/lib/advisorNarrativeEngine";
import { RetirementTransitionPanel } from "@/components/retirementTransition/RetirementTransitionPanel";
import type { TransitionNarrative } from "@/lib/retirementTransition/types";

export type GoalSolverPreference =
  | "prefer_property"
  | "prefer_etfs"
  | "minimize_risk"
  | "maximize_speed"
  | "reduce_debt_aggressively";

export interface GoalSolverThreeStepProps {
  currentAge: number | null;
  recommendations: AdvisorRecommendation[];
  retirementTransition: TransitionNarrative | null;
  /** Caller informs us when its computation is still warming up. */
  isComputing?: boolean;
  /** Receives preference toggles when changed; pure UI. */
  onPreferencesChange?: (prefs: GoalSolverPreference[]) => void;
  /** Optional override of recommendations panel header. */
  recommendationsHeading?: string;
}

const PREF_OPTIONS: { id: GoalSolverPreference; label: string }[] = [
  { id: "prefer_property", label: "Prefer property" },
  { id: "prefer_etfs", label: "Prefer ETFs" },
  { id: "minimize_risk", label: "Minimize risk" },
  { id: "maximize_speed", label: "Maximize speed" },
  { id: "reduce_debt_aggressively", label: "Reduce debt aggressively" },
];

const MUTUALLY_EXCLUSIVE: GoalSolverPreference[][] = [
  ["minimize_risk", "maximize_speed"],
  ["prefer_property", "prefer_etfs"],
];

function isMutuallyExclusiveConflict(active: GoalSolverPreference[]): boolean {
  return MUTUALLY_EXCLUSIVE.some((pair) =>
    pair.every((p) => active.includes(p)),
  );
}

export function GoalSolverThreeStep({
  currentAge,
  recommendations,
  retirementTransition,
  isComputing = false,
  onPreferencesChange,
  recommendationsHeading = "Engine recommendations",
}: GoalSolverThreeStepProps) {
  const fireGoal = useFireGoal(currentAge ?? undefined);
  const setGoal = useSetFireGoal();
  const [editing, setEditing] = useState(false);
  const [year, setYear] = useState<number>(defaultTargetFireYear());
  const [monthly, setMonthly] = useState<number>(0);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [activePrefs, setActivePrefs] = useState<GoalSolverPreference[]>([]);

  useEffect(() => {
    if (fireGoal.status === "SET") {
      setYear(fireGoal.goal.targetFireYear);
      setMonthly(fireGoal.goal.targetMonthlyPassiveIncome);
    } else if (fireGoal.status === "NOT_SET") {
      setEditing(true);
    }
  }, [fireGoal.status]);

  useEffect(() => {
    if (onPreferencesChange) onPreferencesChange(activePrefs);
  }, [activePrefs, onPreferencesChange]);

  function togglePref(p: GoalSolverPreference) {
    setActivePrefs((curr) => (curr.includes(p) ? curr.filter((x) => x !== p) : [...curr, p]));
  }

  async function handleSave() {
    if (!currentAge || currentAge <= 0) return;
    await setGoal.mutateAsync({
      targetFireYear: year,
      targetMonthlyPassiveIncome: monthly,
      currentAge,
    });
    setEditing(false);
  }

  const goalSet = fireGoal.status === "SET";
  const balancedMode = isMutuallyExclusiveConflict(activePrefs);

  return (
    <div className="flex flex-col gap-4" data-testid="goal-solver-three-step">
      <section data-testid="goal-solver-step-1">
        <Card>
          <CardContent className="p-4 sm:p-5 flex flex-col gap-3">
            <header>
              <h2 className="text-base sm:text-lg font-semibold text-foreground">Step 1 — What do you want?</h2>
              <p className="text-xs text-muted-foreground">Set the only two numbers that drive the entire plan.</p>
            </header>
            {currentAge && currentAge > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-foreground">Target FIRE year</span>
                  <input
                    type="number"
                    min={new Date().getFullYear() + 1}
                    max={new Date().getFullYear() + 60}
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    disabled={!editing}
                    className="px-3 py-2 rounded-md border border-border bg-background text-sm tabular-nums disabled:opacity-70"
                    data-testid="goal-solver-input-target-year"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-foreground">Target monthly passive income (AUD)</span>
                  <input
                    type="number"
                    min={0}
                    max={1_000_000}
                    step={500}
                    value={monthly}
                    onChange={(e) => setMonthly(Number(e.target.value))}
                    disabled={!editing}
                    className="px-3 py-2 rounded-md border border-border bg-background text-sm tabular-nums disabled:opacity-70"
                    data-testid="goal-solver-input-target-monthly"
                  />
                </label>
              </div>
            ) : (
              <EmptyStateExplainer
                reason="Your current age is required before we can save a FIRE goal."
                missingFields={["Date of birth (used to derive current age)"]}
                howToFix="Add your date of birth in Settings, then refresh this page."
                fixLinkLabel="Open settings"
                fixHref="/settings"
                surface="goal-solver-step-1"
                compact
              />
            )}
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!currentAge || monthly <= 0 || year < new Date().getFullYear()}
                    data-testid="goal-solver-save"
                  >
                    Save goal
                  </Button>
                  {goalSet && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} data-testid="goal-solver-cancel">
                      Cancel
                    </Button>
                  )}
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="goal-solver-edit">
                  Edit goal
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section data-testid="goal-solver-step-2">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <button
              type="button"
              onClick={() => setPrefsOpen((v) => !v)}
              className="w-full flex items-center justify-between text-left"
              data-testid="goal-solver-step-2-toggle"
              aria-expanded={prefsOpen}
            >
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground">Step 2 — Optional preferences</h2>
                <p className="text-xs text-muted-foreground">Defaults work for most households. Open this only to bias the plan.</p>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${prefsOpen ? "rotate-180" : ""}`} />
            </button>
            {prefsOpen && (
              <div className="mt-3 flex flex-col gap-2" data-testid="goal-solver-step-2-content">
                {balancedMode && (
                  <div className="text-[12px] text-amber-700 dark:text-amber-300 border-l-2 border-amber-500/50 pl-2">
                    Mutually exclusive preferences detected — the engine will balance them instead of obeying both.
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PREF_OPTIONS.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activePrefs.includes(p.id)}
                        onChange={() => togglePref(p.id)}
                        className="h-4 w-4 rounded border-border"
                        data-testid={`goal-solver-pref-${p.id}`}
                      />
                      <span className="text-foreground">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section data-testid="goal-solver-step-3">
        <Card>
          <CardContent className="p-4 sm:p-5 flex flex-col gap-3">
            <header>
              <h2 className="text-base sm:text-lg font-semibold text-foreground">Step 3 — What the engine recommends</h2>
              <p className="text-xs text-muted-foreground">{recommendationsHeading} — every number is computed from your live snapshot.</p>
            </header>
            {!goalSet ? (
              <EmptyStateExplainer
                reason="The advisor recommendations need a saved FIRE goal."
                missingFields={["Target FIRE year", "Target monthly passive income"]}
                howToFix="Complete Step 1 above and save your goal."
                surface="goal-solver-step-3"
                compact
              />
            ) : isComputing ? (
              <div className="text-xs text-muted-foreground" data-testid="goal-solver-step-3-loading">
                Computing recommendations from live snapshot…
              </div>
            ) : recommendations.length === 0 ? (
              <EmptyStateExplainer
                reason="Recommendations are pending — your snapshot is missing some inputs the engine needs."
                missingFields={["Income / expense lines", "Property + holdings data"]}
                howToFix="Complete the snapshot on Financial Plan, then return here."
                fixLinkLabel="Open Financial Plan"
                fixHref="/financial-plan"
                surface="goal-solver-step-3"
                compact
              />
            ) : (
              <div className="flex flex-col gap-2">
                {recommendations.map((rec, i) => (
                  <AdvisorRecommendationCard
                    key={i}
                    rec={rec}
                    isTopOnSurface={i === 0}
                    surface="goal-solver"
                    index={i}
                  />
                ))}
              </div>
            )}
            {retirementTransition && (
              <RetirementTransitionPanel
                narrative={retirementTransition}
                surface="goal-solver"
                defaultOpen
              />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export default GoalSolverThreeStep;
