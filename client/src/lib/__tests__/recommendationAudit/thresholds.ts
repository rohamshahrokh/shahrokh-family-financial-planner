/**
 * Sprint 17 Phase 17.8 — Audit thresholds.
 *
 * Hard pass criteria per user mandate. If any engine score is < 8/10,
 * Sprint 17 status is PARTIAL.
 */

export const SPRINT_17_TARGETS = {
  recommendationFacade: 8,
  goalClosureLab: 8,
  portfolioLab: 8,
  confidenceSystem: 8,
  libraryAverage: 8,
} as const;
