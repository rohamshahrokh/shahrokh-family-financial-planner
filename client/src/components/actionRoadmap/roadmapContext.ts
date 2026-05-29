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

export interface RoadmapSectionProps {
  picks: GoalLabPathPicks;
  recommended: GoalLabRankedScenario;
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
  auditMode: boolean;
}
