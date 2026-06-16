# FWL Known Defects

| ID | Defect | Root cause | Status | Files | Recommended fix |
|---|---|---|---|---|---|
| D-001 | Current NW showed $3.15M vs $816,500 ledger on Dashboard | Components recomputing NW outside canonical layer | ✅ Resolved (Sprint 4D + PR #88) | `client/src/lib/canonicalHeadlineMetrics.ts`, `lib/canonicalNetWorth.ts` | Closed — keep audit-mode trace on Dashboard |
| D-002 | Dashboard / Financial Plan headline drift (~$758k vs $746k) | Different `DashboardInputs` payloads per page | ✅ Resolved (Sprint 4D) | `canonicalHeadlineMetrics.ts`, all consuming pages | Closed |
| D-003 | 5 competing recommendation engines → different "best move" per page | No facade; each page imported a different engine | ✅ Resolved (Sprint 15 Phase 1 — facade created) | `client/src/lib/canonicalRecommendation.ts` | Remaining: migrate remaining call sites (PR #110 open) |
| D-004 | DSR computed with rate as percent not decimal (interest = balance × rate × ...) | Rate-unit mismatch passed to amortisation | ✅ Resolved (PR #113, sprint-fwl078) | `lib/canonicalDebtService.ts`, `canonicalPropertyEconomics.ts` | Closed; smoke verified |
| D-005 | Action Roadmap labels wrong for property-purchase delta events | Label builder didn't differentiate purchase vs sale delta | ✅ Resolved (PR #114, sprint-fwl079) | `lib/actionRoadmap/engineEventTimeline.ts`, `engineEventLanes.ts` | Closed |
| D-006 | Supabase RLS disabled on 23 tables (security finding) | Tables created without RLS policies | 🟥 Unresolved (advisory PR #89 DRAFT) | `supabase/migrations/*` | Enable RLS + write policies BEFORE any external user. Blocker for Phase 2 beta. |
| D-007 | Audit Mode coverage uneven across pages | Per-page metric wiring incomplete | 🟡 Unresolved (PR #43, #44 open) | `client/src/lib/auditMode/`, pages | Merge audit-mode discoverability PRs after review |
| D-008 | Strategic Projection table not responsive on mobile | Wide table without expandable card variant | 🟡 Unresolved (PR #42 open) | `pages/wealth-strategy.tsx` (or projection component) | Merge PR #42 |
| D-009 | Funding source + tax regime drift across engines | Not persisted per-property + scenario override resolver missing | 🟡 Unresolved (PRs #46, #49 open) | `lib/borrowingCapacityAdapter.ts`, scenario stores | Merge stacked persistence + resolver PRs |
| D-010 | Cashflow chart bypasses funding-aware engine | Old chart path | 🟡 Unresolved (PR #47 open) | `pages/dashboard.tsx` cashflow chart | Route through funding-aware engine path |
| D-011 | Expected returns not user-editable for Monte Carlo | UI control missing | 🟡 Unresolved (PR #45 open) | `lib/monteCarloV5/`, settings UI | Merge PR #45 |
| D-012 | Monte Carlo V4 still callable (parity uncertain vs V5) | V5 launched but V4 not retired | 🟡 Unresolved | `lib/monteCarloV4/`, `lib/monteCarloV5/` | Compare V4 vs V5 outputs over scenario suite, then retire V4 |
| D-013 | Year alignment ambiguity in Year-by-Year roadmap (CY vs FY) | Mixed conventions across consumers | 🟡 Unresolved (Sprint 30C verification doc exists) | `lib/actionRoadmap/yearByYearRoadmap.ts`, consumers | Pick one (recommend AU FY) and audit all readers |
| D-014 | Recommendation cache staleness UI inconsistent | `isStale` + `staleReason` exposed but not rendered on every consumer | 🟡 Unresolved | `lib/canonicalRecommendation.ts`, consumers | Add stale-badge to Decision / Decision Lab / Goal Closure Lab |
| D-015 | No billing / Stripe integration | Out of scope to date | 🟡 Unresolved (Phase 3 work) | none | Build in Phase 3 (months 12–18) |
| D-016 | No legal / T&Cs / privacy policy | Out of scope to date | 🟥 Unresolved | none | Required before any external beta user |
