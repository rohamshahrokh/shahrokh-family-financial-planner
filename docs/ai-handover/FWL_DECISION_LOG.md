# FWL Decision Log (final decisions only)

| # | Decision | Rationale | Status |
|---|---|---|---|
| D1 | **No personal financial advice positioning.** FWL is a planning/forecasting tool, not an AFSL-licensed advice service. UI copy, marketing, and AI insights must use general-information framing. | Avoid AU ASIC personal-advice obligations (Corporations Act 2001 Ch 7). | Locked |
| D2 | **Australia-first.** AU tax, AU property law, AUD-only at launch. No multi-currency, no NZ/US tax. | Founder domain expertise; tax engines (`canonicalTax.ts`) are AU-specific. | Locked |
| D3 | **Subscription model — AUD $29/month.** No free tier at launch. No annual discount initially. No tier split. | Aligned with break-even ≈ 29 paying users; simple to communicate. | Locked |
| D4 | **Beta before commercial launch.** 20–50 invited households (Phase 2) before public payments turn on (Phase 3). | Quality bar non-negotiable; closed-beta testimonials become launch narrative. | Locked |
| D5 | **Target user.** Australian FIRE-focused households; secondary property investors. No B2B, no advisers, no SMSF specialists at launch. | Focus and clarity; founder community fit. | Locked |
| D6 | **No mobile app before web validation.** Responsive web only until web PMF (Phase 4). | Conserves the 10 hrs/founder/week and AUD $10K Year-1 budget. | Locked |
| D7 | **No new financial math without a contract first.** Every new metric must have a written formula + selector signature in `FWL_ENGINE_CONTRACTS.md` before code lands. | Prevents the 5-engine recommendation drift recurring. | Locked |
| D8 | **Single source of truth rule.** Every visible metric reads through a canonical selector (`canonicalHeadlineMetrics.ts`, `canonicalRecommendation.ts`, etc.). No duplicate math in components. No direct `snapshot.*` reads in pages. | Documented in `docs/05-engine-map.md` and `DASHBOARD_DATA_CONTRACT.md`; enforced by audit-mode traces. | Locked |
