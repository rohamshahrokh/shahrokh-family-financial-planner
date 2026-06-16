# FWL Feature Status

Status legend: ✅ shipped · 🟡 in progress · ⚠️ partial / known issues · ⏳ planned · ❌ blocked.

| Feature | Status | Files | Known issues | Next action |
|---|---|---|---|---|
| Today (Dashboard) | ✅ | `client/src/pages/dashboard.tsx`, `lib/canonicalHeadlineMetrics.ts` | Some legacy widgets still bypass canonical layer | Audit remaining direct snapshot reads |
| Plan (Financial Plan) | ✅ | `client/src/pages/financial-plan.tsx`, `lib/canonicalLedger.ts` | Past drift vs Dashboard (closed Sprint 4D) | None |
| Forecast | ✅ | `lib/forecastEngine.ts`, `lib/forecastEngineRegimeAware.ts` | Regime-aware path may diverge from deterministic at >10y | Reconcile in Sprint 20 PR-F1 |
| Move (Best Move / Decision) | ⚠️ | `lib/canonicalRecommendation.ts`, `lib/recommendationEngine/`, `pages/decision.tsx` | 5 legacy engines still callable; only facade should be used | Migrate remaining call sites; PR #110 covers this |
| Goal Lab | 🟡 | `pages/goal-lab.tsx`, `lib/fireGoalCanonical.ts`, `GOAL_LAB_AND_ACTION_LAB_ARCHITECTURE.md` | UX brief drafted; integration incomplete | Sprint 20 PR-F1 finishes canonical goal model |
| Decision Lab | ✅ | `pages/decision-lab.tsx`, `lib/canonicalRecommendation.ts` | Audit Mode coverage uneven | Wire missing pages (PR #44 stacked) |
| Action Roadmap | ✅ | `pages/action-roadmap.tsx`, `lib/actionRoadmap/` | Property-purchase label bug fixed PR #114; year alignment edge cases | Verify FY vs CY across all consumers |
| Risk Radar | ✅ | `pages/risk-radar.tsx`, `lib/canonicalRiskSurface.ts` | 8 axes hard-coded; concentration ignores super preservation | Configurable axis weights |
| Property Engine | ✅ | `lib/canonicalPropertyEconomics.ts`, `lib/equityEngine.ts`, `shared/propertyLifecycle.ts`, `pages/property.tsx`, `pages/property-buy-analysis.tsx` | DSR rate-unit bug fixed PR #113 (sprint-fwl078); no live valuation feed | Add manual revaluation flow |
| Timeline / Gantt | ✅ | `pages/timeline.tsx`, `lib/actionRoadmap/engineEventTimeline.ts`, `engineEventLanes.ts` | Empty-lane suppression via `nonEmptyLanes` | Visual polish for narrow lanes |
| Monte Carlo | ✅ | `lib/monteCarloV5/engineV5.ts`, `lib/monteCarloV5/fireEngineV2.ts` | V5 current; V4 retained as feeder | Retire V4 once V5 parity confirmed |
| Reports | ✅ | `pages/reports.tsx` | PDF export path (`audit-pdf.ts`, `_jspdf_test.ts`) is exploratory | Decide on jspdf vs server-side render |
| Mobile UI | ⚠️ | `pages/*` + Tailwind responsive utilities | Strategic Projection table needs expandable cards (PR #42 open) | Merge PR #42; broader mobile sweep deferred to post-beta |
| Auth | ✅ | `pages/login.tsx`, Supabase Auth | Supabase RLS DISABLED on 23 tables (advisory PR #89, do not merge) | Enable RLS before public launch — security blocker |
| Billing | ⏳ | none in repo | Not built; Stripe planned for Phase 3 (commercial launch) | Wire Stripe + Supabase customer record |
| Legal / Compliance | ⏳ | none in repo | No personal-financial-advice positioning; T&Cs / privacy policy not drafted | Draft AU-specific T&Cs + ASIC-safe copy before beta |
