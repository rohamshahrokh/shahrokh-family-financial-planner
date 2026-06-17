# FWL Next 90 Days — Commercial Beta Execution Plan

Goal: reach a friends/family closed beta in good shape, then iterate to launch readiness.

Owners: **Roham** (engineering, product, deploy), **Ali** (co-founder, GTM, feedback ops), **AI assistant** (paired coding, doc maintenance, audit verification).

---

## Month 1 — Product Stabilization
| Workstream | Owner | Deliverable | Files |
|---|---|---|---|
| Merge canonical layer remaining migrations | Roham + AI | All visible metrics flow through canonical selectors | `client/src/lib/canonical*.ts`, pages |
| Land Sprint 20 PR-F1 (canonical FIRE model) | Roham + AI | One FIRE engine, no legacy split | `sprint20/pr-f1-canonical-fire-model` |
| Land Sprint 20 PR-F2 (recommendation engine) | Roham + AI | All consumers on `canonicalRecommendation.ts` | PR #110 |
| Land Sprint 20 PR-H (sidebar IA flatten) | Roham | Cleaner nav, fewer dead-ends | `sprint20/pr-h-sidebar-ia-flatten` |
| Fix D-006 — enable Supabase RLS on all 23 tables | Roham | RLS policies for every table | `supabase/migrations/`, advisory PR #89 |
| Resolve D-009/D-010 — funding source + cashflow chart | Roham + AI | Single funding-aware path | PRs #46, #47, #49 |
| Tests green | AI | `npm run test:all` passes on `main` | `script/test-*.ts` |
| Audit Mode coverage to 100% of headline metrics | AI | Every dashboard / decision / FIRE / risk metric traceable | `lib/auditMode/` |

Exit criteria: `main` deploys cleanly, RLS on, recommendation engine consolidated, audit-mode complete.

---

## Month 2 — Friends/Family Beta
| Workstream | Owner | Deliverable |
|---|---|---|
| Identify 5–10 friends/family households (FIRE-aware) | Ali | Invite list + NDA-light terms |
| Onboarding script + 1:1 walkthrough | Ali + Roham | 30-min walkthrough doc, recorded screenshare template |
| Telemetry on Audit Mode + error logging (Sentry or similar) | Roham | Production error visibility |
| Draft AU-specific T&Cs + privacy policy (general info, no personal advice) | Roham (legal review optional) | `docs/legal/terms.md`, `docs/legal/privacy.md` |
| Feedback intake channel (single inbox + structured form) | Ali | Notion/Google form + triage SOP |
| Daily standup async (10 min) | Roham + Ali | Slack/WhatsApp thread, AI summarises weekly |
| Stripe scaffolding (no charges yet) | Roham + AI | Payment intent flow stubbed; Phase 3 only |

Exit criteria: 5–10 households onboarded, feedback flowing, zero P0 bugs open.

---

## Month 3 — Feedback / Debug Iteration
| Workstream | Owner | Deliverable |
|---|---|---|
| Weekly feedback triage | Ali → Roham + AI | Each item → defect ID or feature request |
| Bug fix sprint (2-week loops) | Roham + AI | All P0 + P1 closed |
| UX polish — fix top 5 confusion points from beta | Roham + AI | Heatmap / session-log driven |
| Monte Carlo V4 retirement (D-012) | AI | V5 parity verified across scenarios |
| Year alignment audit (D-013) | AI | One convention (recommend AU FY) across roadmap consumers |
| Recommendation staleness UI (D-014) | Roham + AI | Stale badge on every consumer |
| Draft launch landing page copy (no public launch) | Ali | `docs/launch/landing-copy.md` |
| Founder content cadence (1/week, FIRE forums) | Ali | Quiet posting, trust-building |

Exit criteria: zero P0/P1 open, beta NPS captured, 3 written testimonials.

---

## Month 4 — Launch Readiness (commercial cutover)
| Workstream | Owner | Deliverable |
|---|---|---|
| Stripe live + AUD $29/mo flow end-to-end | Roham + AI | Test card → live card → first $1 charge |
| Convert beta households to paying (target: 50%+) | Ali + Roham | First 5+ paying users |
| Public landing page deploy | Roham + Ali | Vercel project, marketing copy locked |
| Quality Gate review (Month-6-equivalent gate) | Roham + Ali | Go / no-go on commercial launch |
| Churn + activation instrumentation | Roham + AI | Cohort dashboard |
| Support playbook v1 | Ali | Top 10 questions, response template |
| Referral loop wired (closed) | Roham + Ali | Beta → public referral signal |
| 30-day post-launch retro template ready | All | `docs/launch/retro-template.md` |

Exit criteria: payments live, ≥5 paying users, ≥1 unsolicited referral, no critical defects open.

---

## Standing ownership rules
- **Roham** — owns merges to `main`, Vercel deploys, Supabase changes, security.
- **Ali** — owns invites, feedback ops, GTM copy, founder content.
- **AI assistant** — owns docs in `docs/ai-handover/`, contract-first discipline, test runs, audit traces. Never merges; always opens PRs.

## Forbidden during 90 days
- Mobile app work.
- New financial math without a contract.
- New engines (use facades).
- Multi-currency / non-AU tax.
- Free tier or tier split experiments.
