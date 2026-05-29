/**
 * actionRoadmap/roadmapContext.ts — Sprint 28B shared section context.
 *
 * Every S1–S8 section component on `/action-roadmap` receives the SAME
 * `RoadmapSectionProps` shape. The page (action-roadmap.tsx) builds the
 * context once from the cached Goal Lab plan + canonical FIRE + selectors
 * and passes it identically to every section. Keeping the shape uniform
 * means components stay shallow: no per-section data plumbing.
 */
import type { ActionRoadmap } from "@/lib/actionRoadmap/types";
import type { MonteCarloProjection } from "@/lib/actionRoadmap/montecarloProjection";
import type { NetWorthAttribution } from "@/lib/actionRoadmap/netWorthAttribution";
import type { FireJourneyMilestone } from "@/lib/actionRoadmap/fireJourneyMilestones";
import type { FailurePoint } from "@/lib/actionRoadmap/stressFailureAnalysis";
import type { NextActionsBuckets } from "@/lib/actionRoadmap/nextActionsBuilder";
import type { WealthBuildingLanes } from "@/lib/actionRoadmap/wealthBuildingLanes";
import type { GoalLabPathPicks, GoalLabRankedScenario } from "@/lib/goalLab/orchestrator";
import type { ConfidenceResult } from "@/lib/goalLab/goalLabConfidence";
import type { ReconciliationResult } from "@/lib/actionRoadmap/financialReconciliation";
import type { MCVarianceDiagnostic } from "@/lib/actionRoadmap/mcVarianceDiagnostic";
import type { EngineEvent } from "@/lib/actionRoadmap/engineEventTimeline";
import type { LaneEvent } from "@/lib/actionRoadmap/engineEventLanes";
import type { DependencyEdge } from "@/lib/actionRoadmap/milestoneDependencies";
import type { McRiskValidationResult } from "@/lib/actionRoadmap/mcRiskValidation";

export interface RoadmapSectionProps {
  /**
   * Picks from the Goal Lab plan. May be a fully-empty shell when no
   * feasible plan exists yet — in that case every named slot is null and
   * sections must render "Not modelled yet" instead of crashing.
   */
  picks: GoalLabPathPicks;
  /**
   * The recommended ranked scenario. Null when the orchestrator could not
   * find any feasible winner across templates (thin demo / under-specified
   * goal). Sections still render — each cell falls back to "Not modelled
   * yet" — so the user can see the 8-section architecture is alive.
   */
  recommended: GoalLabRankedScenario | null;
  roadmap: ActionRoadmap | null;
  enrichedMilestones: FireJourneyMilestone[];
  mcProjection: MonteCarloProjection;
  attribution: NetWorthAttribution | null;
  failures: FailurePoint[];
  nextActions: NextActionsBuckets;
  lanes: WealthBuildingLanes;
  confidence: ConfidenceResult | null;
  fireNumber: number | null;
  swrPct: number | null;
  startAge: number | null;
  currentNetWorth: number | null;
  /** Sprint 29 §3 — strict reconciliation gate. Blocks S1/S4/S5 NW figures when status !== PASS. */
  reconciliation: ReconciliationResult;
  /** Sprint 29 §4 — Monte Carlo variance diagnostic. Wired into S5 audit panel. */
  mcVariance: MCVarianceDiagnostic;
  /** Sprint 29 §7 — engine event timeline feeding the professional Gantt (P5). */
  engineEvents: EngineEvent[];
  /** Sprint 30A — 5-lane categorised event view feeding S3 Timeline. */
  laneEvents: LaneEvent[];
  /** Sprint 30A — hybrid dependency edges feeding S2 FIRE Journey. */
  dependencyEdges: DependencyEdge[];
  /** Sprint 30A — MC risk validation chip for S6 Risks panel. */
  riskValidation: McRiskValidationResult;
  auditMode: boolean;
}
