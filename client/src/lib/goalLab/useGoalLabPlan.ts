/**
 * useGoalLabPlan.ts — Sprint 23.
 *
 * React hook around the Goal-Lab orchestrator. Exposes:
 *   • the last computed plan (read-only),
 *   • a `run()` action that re-runs orchestration with the current inputs,
 *   • `isRunning` / `error` state for UI loading/feedback.
 *
 * The hook does NO financial math. It is a thin React wrapper over
 * `runGoalLabPlan()` + the in-memory session cache (`readLatestGoalLabPlan`).
 *
 * Critically, the hook does NOT auto-run. Orchestration spawns N engine runs
 * (up to ~11 templates × 300 sims). Forcing it on every page mount would
 * burn CPU + create UI jank. Surfaces decide WHEN to call `run()` — typically
 * on an explicit "Run plan" button click, or when the canonical profile
 * meaningfully changes and the user has opted into auto-run (future).
 */

import { useCallback, useEffect, useState } from "react";
import type { DashboardInputs } from "../dashboardDataContract";
import {
  runGoalLabPlan,
  readLatestGoalLabPlan,
  readLatestGoalLabPlanGeneratedAt,
  type GoalLabPlanOutput,
  type RunGoalLabPlanArgs,
} from "./orchestrator";
import type { CanonicalGoalProfile } from "./canonicalGoalProfile";

export interface UseGoalLabPlanResult {
  /** Last successfully computed plan, or null if none has been run yet. */
  plan: GoalLabPlanOutput | null;
  /** ISO timestamp of last successful run, or null. */
  generatedAt: string | null;
  /** True while a run is in flight. */
  isRunning: boolean;
  /** Error message from the most recent failed run, if any. */
  error: string | null;
  /** Trigger a fresh orchestration run. Returns the new plan or null on error. */
  run: () => Promise<GoalLabPlanOutput | null>;
}

/**
 * Subscribes to the in-memory plan cache + offers a `run()` action. Pass the
 * canonical ledger + profile at the call site (both should already be in
 * hand on /goal-lab, /decision-lab, /action-plan).
 */
export function useGoalLabPlan(
  ledger: DashboardInputs,
  profile: CanonicalGoalProfile,
  extraArgs?: Omit<RunGoalLabPlanArgs, "ledger" | "profile">,
): UseGoalLabPlanResult {
  // Seed from cache so consumers don't see a flash of "no plan" on mount
  // when an earlier surface has already run orchestration.
  const [plan, setPlan] = useState<GoalLabPlanOutput | null>(() => readLatestGoalLabPlan());
  const [generatedAt, setGeneratedAt] = useState<string | null>(() => readLatestGoalLabPlanGeneratedAt());
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Light polling sync: every time a consumer subscribes, refresh from the
  // cache once on mount. This keeps cross-surface reads consistent without
  // turning the in-memory cache into a full event emitter.
  useEffect(() => {
    setPlan(readLatestGoalLabPlan());
    setGeneratedAt(readLatestGoalLabPlanGeneratedAt());
  }, []);

  const run = useCallback(async (): Promise<GoalLabPlanOutput | null> => {
    setIsRunning(true);
    setError(null);
    // Sprint 25 P4 — yield to the browser BEFORE the heavy orchestrator
    // call so React can commit the isRunning=true state and paint the
    // Analysis Trace panel before CPU-heavy template runs begin.
    // Two requestAnimationFrame ticks guarantee a paint happens between
    // the state flip and the first engine call. Fall back to setTimeout
    // for non-browser environments (e.g. JSDOM in tests).
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      } else {
        setTimeout(resolve, 16);
      }
    });
    try {
      const out = await runGoalLabPlan({ ledger, profile, ...extraArgs });
      setPlan(out);
      setGeneratedAt(out.generatedAt);
      return out;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return null;
    } finally {
      setIsRunning(false);
    }
  }, [ledger, profile, extraArgs]);

  return { plan, generatedAt, isRunning, error, run };
}
