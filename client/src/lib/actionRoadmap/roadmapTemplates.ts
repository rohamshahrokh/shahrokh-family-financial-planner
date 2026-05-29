/**
 * actionRoadmap/roadmapTemplates.ts — Sprint 27.
 *
 * Display metadata for the six named paths in the brief, plus a CUSTOM_PATH
 * fallback. THIS MODULE PERFORMS NO FINANCIAL MATH. It only maps an engine
 * `templateId` (produced by `goalLab/scenarioTemplates.ts`) into a friendly
 * label + promise + milestone-shape description that the UI panel renders.
 *
 * The mapping is exhaustive against the engine's current scenario templates.
 * Any unknown id falls through to `CUSTOM_PATH` so the UI never breaks on a
 * new template being added to the engine before the mapping is updated.
 *
 * Honesty: we never invent a description for a template the engine did not
 * actually run — every entry here corresponds 1:1 to an engine template id.
 */

import type { RoadmapTemplate, RoadmapTemplateId } from "./types";

// ─── Display catalogue ─────────────────────────────────────────────────────

export const ROADMAP_TEMPLATES: Record<RoadmapTemplateId, RoadmapTemplate> = {
  PROPERTY_PATH: {
    id: "PROPERTY_PATH",
    label: "Property path",
    promise: "Reach FIRE primarily through investment property leverage and equity growth.",
    milestoneShape: "Buffer build → IP purchase → equity release → optional second IP → FIRE",
  },
  ETF_PATH: {
    id: "ETF_PATH",
    label: "ETF acceleration",
    promise: "Reach FIRE by maximising broad-market ETF exposure inside and outside super.",
    milestoneShape: "Lump sum or DCA → annual top-ups → compounding through to FIRE",
  },
  HYBRID_PATH: {
    id: "HYBRID_PATH",
    label: "Hybrid (property + ETF)",
    promise: "Combine one investment property with diversified ETF growth.",
    milestoneShape: "Buffer → ETF DCA → IP purchase → blended growth → FIRE",
  },
  DEBT_REDUCTION_PATH: {
    id: "DEBT_REDUCTION_PATH",
    label: "Debt reduction first",
    promise: "Clear non-deductible mortgage debt before tilting into growth assets.",
    milestoneShape: "Extra repayments → mortgage cleared → redirect surplus into ETFs → FIRE",
  },
  OFFSET_FIRST_PATH: {
    id: "OFFSET_FIRST_PATH",
    label: "Offset-first path",
    promise: "Build a fully funded offset buffer before deploying any risk capital.",
    milestoneShape: "Offset build → buffer milestone → ETF DCA / IP deposit → FIRE",
  },
  SUPER_ACCELERATION_PATH: {
    id: "SUPER_ACCELERATION_PATH",
    label: "Super acceleration",
    promise: "Use concessional super contributions to reach preservation-age FIRE efficiently.",
    milestoneShape: "Annual concessional top-ups → preservation age → super drawdown → FIRE",
  },
  CUSTOM_PATH: {
    id: "CUSTOM_PATH",
    label: "Custom strategy",
    promise: "A blended or non-standard strategy chosen by the decision engine.",
    milestoneShape: "Engine-defined milestone sequence → FIRE",
  },
};

// ─── Engine templateId → display id mapping ────────────────────────────────

/**
 * Maps the engine's scenario `templateId` (see
 * `client/src/lib/goalLab/scenarioTemplates.ts`) to the user-facing display
 * template. Defaults to CUSTOM_PATH on unknown ids — never throws.
 *
 * Audit: every key in this map corresponds to a real engine template id at
 * the time of writing. Keep this in sync if new templates are added.
 */
const ENGINE_ID_TO_DISPLAY: Record<string, RoadmapTemplateId> = {
  // Direct matches to brief's six paths
  "buy-ip-now":            "PROPERTY_PATH",
  "delay-ip":              "PROPERTY_PATH",
  "etf-acceleration":      "ETF_PATH",
  "hybrid-property-etf":   "HYBRID_PATH",
  "debt-reduction":        "DEBT_REDUCTION_PATH",
  "offset-optimisation":   "OFFSET_FIRST_PATH",
  "super-contributions":   "SUPER_ACCELERATION_PATH",
  // Non-standard engine templates that don't map to a named path — they
  // surface honestly as CUSTOM_PATH rather than being mis-labelled.
  "current-plan":          "CUSTOM_PATH",
  "lower-target-or-extend":"CUSTOM_PATH",
  "liquidity-preservation":"CUSTOM_PATH",
  "debt-recycling":        "CUSTOM_PATH",
};

/**
 * Resolve an engine templateId to its display template. Unknown ids return
 * `CUSTOM_PATH` — never throws, never invents.
 */
export function resolveRoadmapTemplate(engineTemplateId: string | null | undefined): RoadmapTemplate {
  if (!engineTemplateId) return ROADMAP_TEMPLATES.CUSTOM_PATH;
  const displayId = ENGINE_ID_TO_DISPLAY[engineTemplateId] ?? "CUSTOM_PATH";
  return ROADMAP_TEMPLATES[displayId];
}

/** Get a display template by its own id (for tests / explicit lookups). */
export function getRoadmapTemplate(id: RoadmapTemplateId): RoadmapTemplate {
  return ROADMAP_TEMPLATES[id];
}
