# FWL Engine Contracts

Every visible metric MUST flow through one of the selectors below. Do not recompute in component code.

## Conventions
- "Selector" = pure TS function in `client/src/lib/`.
- "Field" = property name on the returned canonical object.
- All paths relative to repo root.

---

## Current Net Worth
| | |
|---|---|
| Source of truth | `canonicalNetWorth.ts` |
| Selector | `selectCanonicalNetWorth` (in `dashboardDataContract.ts`) → `computeCanonicalNetWorth` |
| File | `client/src/lib/canonicalNetWorth.ts` |
| Formula | Σ assets (PPOR + cash + offset + super + IPs + stocks + crypto + cars + other) − Σ liabilities (PPOR mortgage + settled-IP loans + other debts) |
| UI consumers | Dashboard, Reports, Financial Plan, Wealth Strategy, FIRE Path, Risk Radar, Action Roadmap |
| Known failure modes | Pre-Sprint-4D drift across pages (UI-side recompute) — closed by `canonicalHeadlineMetrics.ts`. Watch for components reading `snapshot.netWorth` directly — always use selector. |

## FIRE Age
| | |
|---|---|
| Source of truth | `canonicalFireDerivations.ts` + `fireGoalCanonical.ts` |
| Selector | `selectCanonicalFire` → returns `fireAge` via `deriveTargetAge` / `targetYearFromAge` |
| File | `client/src/lib/canonicalFire.ts`, `client/src/lib/fireGoalCanonical.ts` |
| Formula | Target age from user goal (`targetFireYear` − birth year) OR fallback to `currentAge + DEFAULT_TARGET_YEAR_OFFSET (10)` |
| UI consumers | FIRE Path, Dashboard headline, Goal Lab, Action Roadmap, Year-by-Year |
| Known failure modes | Mixed legacy goal vs canonical goal sources — Sprint 20 PR-F1 still open. Always read via `selectCanonicalFire(ledger, canonicalGoal)`. |

## Net Worth at FIRE
| | |
|---|---|
| Source of truth | `canonicalFireDerivations.ts` |
| Selector | `requiredNetWorth(target)` |
| File | `client/src/lib/canonicalFireDerivations.ts` |
| Formula | `targetAnnualIncome / (effectiveSwr(target))` (i.e. FIRE number at canonical SWR, default 4%) |
| UI consumers | FIRE Path, Goal Lab, Decision Lab, Reports |
| Known failure modes | SWR override drift — only `effectiveSwr` may compute the rate. PPOR inclusion handled by `requiredAssetBaseForIncome`. |

## Passive Income at FIRE
| | |
|---|---|
| Source of truth | `canonicalFire.ts` + `dashboardDataContract.ts` |
| Selector | `selectPassiveIncome` (current) and `targetAnnualIncome` (at-FIRE goal) on `CanonicalFire` |
| File | `client/src/lib/canonicalFire.ts`, `client/src/lib/dashboardDataContract.ts` |
| Formula | Current: settled IP rent + manual passive + dividend heuristic. At FIRE: `targetAnnualIncome` from goal or expenses fallback. |
| UI consumers | FIRE Path, Dashboard headline, Reports |
| Known failure modes | Dividend heuristic uses static yield assumption; not regime-aware. |

## Risk Capacity (8-axis radar)
| | |
|---|---|
| Source of truth | `canonicalRiskSurface.ts` |
| Selector | `buildCanonicalRiskSurface` |
| File | `client/src/lib/canonicalRiskSurface.ts` |
| Axes | `Liquidity, Leverage, Cashflow, Concentration, Property Exposure, Interest Rate, Tax Reform, FIRE Delay` |
| Formula | Per axis 0–100 score from current ledger; stress rows reapply ±shocks |
| UI consumers | Risk Radar, Dashboard risk card, Action Roadmap risk lane |
| Known failure modes | Concentration uses raw asset weights; doesn't account for super preservation. |

## Liquidity Stress (months)
| | |
|---|---|
| Source of truth | `canonicalRiskSurface.ts` (axis) + `recommendationEngine/types.ts` (LifeSignals) |
| Field | `lifeSummary.liquidityStressMonths` |
| File | `client/src/lib/recommendationEngine/engine.ts` |
| Formula | Months of expenses covered by liquid assets (cash + offset + accessible stocks) under stress shock |
| UI consumers | Risk Radar, Decision Lab, Action Plan |
| Known failure modes | Threshold logic hard-coded at 6 months — see `recommendationEngine/engine.ts:1345`. |

## Refinance Pressure
| | |
|---|---|
| Source of truth | `canonicalRiskSurface.ts` (Interest Rate axis stress row) |
| Selector | Stress row in `buildCanonicalRiskSurface` |
| File | `client/src/lib/canonicalRiskSurface.ts` |
| Formula | Δ DSR under +200bp shock on variable-rate loans |
| UI consumers | Risk Radar, Decision Lab |
| Known failure modes | Assumes all variable loans reprice simultaneously. |

## Negative Equity
| | |
|---|---|
| Source of truth | `canonicalPropertyEconomics.ts` |
| Selector | Per-property equity check; aggregated in risk surface |
| File | `client/src/lib/canonicalPropertyEconomics.ts`, `canonicalRiskSurface.ts` |
| Formula | `propertyValue × shockMultiplier − loanBalance < 0` |
| UI consumers | Risk Radar, Property page, Action Roadmap risk lane |
| Known failure modes | Uses snapshot-time value; no live valuation feed. |

## Forced Sale Risk
| | |
|---|---|
| Source of truth | `canonicalRiskSurface.ts` (composite) |
| Field | `StressRow` with category `forced_sale` |
| File | `client/src/lib/canonicalRiskSurface.ts`, `client/src/lib/actionRoadmap/stressFailureAnalysis.ts` |
| Formula | Liquidity exhausted + negative DSR + negative equity → forced sale flag |
| UI consumers | Risk Radar, Action Roadmap, Decision Lab |
| Known failure modes | Boolean today; no probability score. |

## Recommendation Score
| | |
|---|---|
| Source of truth | `canonicalRecommendation.ts` (facade) over `recommendationEngine/engine.ts` |
| Selector | `computeCanonicalRecommendation` → `bestMove.confidenceScore` |
| File | `client/src/lib/canonicalRecommendation.ts`, `client/src/lib/recommendationEngine/engine.ts` (`computeUnifiedRecommendations`) |
| Formula | Composite of rule weights × signal magnitude × MC probability × fatigue penalty |
| UI consumers | Action Plan, Decision Lab, Decision, Goal Closure Lab, Portfolio Lab |
| Known failure modes | Five legacy engines existed; facade is the only allowed entry. Confidence source can be `mc / heuristic / rule / composite / absent` — always render via `confidenceLabels.ts` policy. |

## Selected Strategy
| | |
|---|---|
| Source of truth | `canonicalRecommendation.ts` |
| Field | `bestMove` (top1) on `CanonicalRecommendation` |
| File | `client/src/lib/canonicalRecommendation.ts` |
| Formula | `top3[0]` from unified engine output |
| UI consumers | Decision Lab, Action Plan, Dashboard |
| Known failure modes | Cache TTL bug → `isStale` + `staleReason` exposed on payload; consumers must respect. |

## Alternative Strategy
| | |
|---|---|
| Source of truth | `canonicalRecommendation.ts` + `actionRoadmap/alternativeRationale.ts` |
| Field | `top3[1]` and `top3[2]` on `CanonicalRecommendation`; rationale via `buildAlternativeRationale` |
| File | `client/src/lib/canonicalRecommendation.ts`, `client/src/lib/actionRoadmap/alternativeRationale.ts` |
| UI consumers | Decision Lab compare, Goal Closure Lab |
| Known failure modes | When fallback source, `top3.length === 1` — UI must hide alternatives. |

## Yearly Roadmap Numbers
| | |
|---|---|
| Source of truth | `actionRoadmap/yearByYearRoadmap.ts` |
| Selector | `selectYearByYearRoadmap(input)` |
| File | `client/src/lib/actionRoadmap/yearByYearRoadmap.ts` |
| Returns | `YearByYearRoadmap` → `YearCard[]` with `YearMilestone[]` |
| UI consumers | Action Roadmap year cards, Timeline, Reports |
| Known failure modes | Year alignment vs calendar vs financial year — see `SPRINT30C_YEAR_BY_YEAR_VERIFICATION.md`. |

## Action Roadmap Timeline Events
| | |
|---|---|
| Source of truth | `actionRoadmap/engineEventTimeline.ts` |
| Selector | `selectEngineEventTimeline(input)` |
| File | `client/src/lib/actionRoadmap/engineEventTimeline.ts` |
| Lanes | `selectEngineEventLanes` in `engineEventLanes.ts` |
| Traceability | `validateTraceability` in `eventTraceability.ts` |
| UI consumers | Action Roadmap timeline, Gantt, Timeline page |
| Known failure modes | Property-purchase delta labels — fixed in PR #114 (sprint-fwl079). Empty-lane handling via `nonEmptyLanes`. |
