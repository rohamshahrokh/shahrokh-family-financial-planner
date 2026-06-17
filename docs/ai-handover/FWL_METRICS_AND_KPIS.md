# FWL_METRICS_AND_KPIS.md

Canonical commercial-success metrics for Family Wealth Lab (AU-first, subscription-first, educational/planning platform — not financial advice). Use these definitions verbatim in product analytics, founder dashboard, and roadmap discussions.

Cross-refs: `FWL_PROJECT_CONTEXT.md`, `FWL_PRODUCT_POSITIONING.md`, `FWL_DECISION_LOG.md`.

## 1. North Star Metric

| Field | Value |
|---|---|
| Metric | Paying Active Households (PAH) |
| Definition | Count of households with an active paid subscription AND ≥1 activation event in the trailing 30 days |
| Cadence | Daily |
| Source (future) | `billing.subscription_status='active'` ∧ `events.activation_event_30d_count>0` |
| Why | Joins revenue + engagement in one number; protects against vanity sign-ups and silent churn |
| Phase-3 target | 100 PAH (break-even) |
| Phase-4 target | 1,000 PAH |

## 2. Activation

| Field | Value |
|---|---|
| Activation event | First Action Roadmap viewed with ≥1 real household input saved AND ≥1 forecast generated AND ≥1 Goal Lab target set |
| Why this gate | Proves the user reached the canonical recommendation surface with real data |
| Time window | Within 7 days of signup |
| Source (future) | `events.activated_at IS NOT NULL` |

### Activation funnel sub-events

| # | Event | Definition | Source (future) |
|---|---|---|---|
| A1 | Account created | Auth record exists | `sf_users` row |
| A2 | Onboarding completed | Snapshot saved with ≥1 asset + ≥1 liability + monthly income/expense | `sf_snapshot` non-empty |
| A3 | First forecast generated | `mc_fire_results` row exists for household | `mc_fire_results` row |
| A4 | First Action Roadmap viewed | Roadmap page rendered with ≥1 lane populated | client analytics event |
| A5 | Activation = A1 ∧ A2 ∧ A3 ∧ A4 ∧ (Goal Lab `goals_set=true`) | Full gate met | join across above |

## 3. Engagement

| Metric | Definition | Window |
|---|---|---|
| DAU | Distinct households with ≥1 authenticated session OR ≥1 snapshot/scenario mutation that day | rolling 24h |
| WAU | Distinct households with ≥1 qualifying event in trailing 7 days | rolling 7d |
| MAU | Distinct households with ≥1 qualifying event in trailing 30 days | rolling 30d |
| Stickiness | DAU / MAU | daily |
| Qualifying event | login OR snapshot save OR scenario save OR forecast run OR roadmap view | — |
| Source (future) | `events` table (not yet built) | — |

Phase-2 stickiness target: ≥10%. Phase-3 target: ≥20%.

## 4. Retention

| Metric | Definition |
|---|---|
| D7 retention | % of activated households returning with ≥1 qualifying event between day 7 and day 13 after activation |
| D30 retention | % returning between day 30 and day 36 |
| D90 retention | % returning between day 90 and day 96 |
| Cohort granularity | Weekly signup cohort |
| Source (future) | `events` table, cohorted by `users.activated_at` |

| Phase | D7 | D30 | D90 |
|---|---|---|---|
| Closed beta | ≥60% | ≥40% | ≥25% |
| Phase-3 launch | ≥70% | ≥50% | ≥35% |
| Phase-4 (PMF) | ≥80% | ≥65% | ≥50% |

## 5. Conversion

| Step | Definition | Phase-3 target |
|---|---|---|
| Visitor → signup | Unique landing-page visitors with completed signup | ≥3% |
| Signup → activated | Signups reaching activation gate (Section 2 A5) within 7d | ≥60% |
| Activated → beta user | Activated households accepted into closed beta (manual invite) | 100% during beta |
| Beta → paid | Beta households converting to active paid subscription | ≥40% |
| Paid → annual (future) | Monthly subscribers electing annual billing | n/a at launch |

## 6. Revenue

| Metric | Definition | Formula |
|---|---|---|
| MRR | Monthly recurring revenue from active paid subscriptions | `Σ active_subs × AUD $29` |
| ARR | Annual run-rate | `MRR × 12` |
| ARPU | Average revenue per paying user | `MRR / paying_count` (= AUD $29 at single-tier launch) |
| LTV | Lifetime value per paying user | `ARPU / monthly_revenue_churn_rate` |
| CAC | Customer acquisition cost | `paid_marketing_spend / new_paying_users` (beta phase: $0; track once paid acquisition starts) |
| LTV : CAC | Health ratio | target ≥3:1 |
| Gross margin | Revenue − (Supabase + Vercel + AI API costs) / Revenue | target ≥80% |

| Phase | MRR target | ARR target | Paying users |
|---|---|---|---|
| Phase 2 (beta) | $0 (free invite-only) | $0 | 20–50 |
| Phase 3 (launch) | AUD $2,900 | AUD $34,800 | 100 |
| Phase 4 (PMF) | AUD $29,000 | AUD $348,000 | 1,000 |
| Phase 5 (scale) | AUD $145,000 | AUD $1.74M | 5,000 |
| Phase 6 | AUD $290,000+ | AUD $3.48M+ | 10,000+ |

## 7. Churn

| Metric | Definition | Window |
|---|---|---|
| Logo churn | % of paying households cancelling | rolling 30d |
| Gross revenue churn | $ MRR lost from cancellations / starting MRR | rolling 30d |
| Net revenue churn | (cancellations − expansions) / starting MRR | rolling 30d (≈ gross at single-tier launch) |
| Voluntary vs involuntary | Cancellation vs payment-failure | split required |
| At-risk leading indicator | 14+ days no qualifying event | weekly |

| Phase | Logo churn (monthly) | Gross revenue churn (monthly) |
|---|---|---|
| Beta | n/a | n/a |
| Phase 3 | ≤8% | ≤8% |
| Phase 4 | ≤5% | ≤5% |
| Phase 5+ | ≤3% | ≤3% |

## 8. Friends and Family Beta Targets

| Month | Cumulative beta households | Gate to pass | Source |
|---|---|---|---|
| Month 1 | 10 | RLS shipped (D-006), legal/T&Cs live (D-016), onboarding completes in <15 min | manual invite |
| Month 2 | 25 | D7 ≥ 60% on Month-1 cohort, ≥3 unsolicited testimonials | manual invite |
| Month 3 | 50 | D30 ≥ 40% on Month-1 cohort, billing integration ready in staging | manual invite |
| Month 4 | 100 | D30 ≥ 50%, ≥40% Month-1 cohort indicates willingness to pay $29/mo | invite + waitlist conversion |

All beta households are AU-resident, FIRE-focused, $500K–$3M net worth (see `FWL_PRODUCT_POSITIONING.md`).

## 9. Success Criteria

### At 100 paying households (Phase 3 — break-even)

| Criterion | Threshold |
|---|---|
| MRR | ≥ AUD $2,900 |
| Monthly logo churn | ≤ 8% |
| D30 retention | ≥ 50% |
| Activation rate (signup→activated) | ≥ 60% |
| NPS | ≥ 40 |
| Support load | ≤ 4 hrs/week founder time |
| Production incident rate | ≤ 1/month with user impact |

### At 1,000 paying households (Phase 4 — PMF)

| Criterion | Threshold |
|---|---|
| MRR | ≥ AUD $29,000 |
| Monthly logo churn | ≤ 5% |
| D90 retention | ≥ 50% |
| LTV : CAC | ≥ 3:1 |
| Gross margin | ≥ 80% |
| Organic share of new signups | ≥ 50% |
| Founder income partial-replacement | confirmed |

### At 10,000 paying households (Phase 6 — expansion)

| Criterion | Threshold |
|---|---|
| MRR | ≥ AUD $290,000 |
| ARR | ≥ AUD $3.48M |
| Monthly logo churn | ≤ 3% |
| D90 retention | ≥ 55% |
| Team headcount | first contractor + ≥1 FT engineer |
| Multi-household / family-share | UI-exposed and used by ≥10% |
| Founder employment income fully replaceable | confirmed |

## 10. Dashboard Requirements

Founder dashboard must surface (eventual implementation, no order):

| Group | Metric |
|---|---|
| North star | Paying Active Households (PAH) |
| Revenue | MRR · ARR · ARPU · LTV · CAC · LTV:CAC · gross margin |
| Engagement | DAU · WAU · MAU · DAU/MAU stickiness |
| Activation | Signups (24h/7d/30d) · activation rate · time-to-activation (median) · A1→A2→A3→A4→A5 funnel |
| Retention | D7 · D30 · D90 by weekly cohort (cohort heatmap) |
| Conversion | Visitor→signup · signup→activated · activated→beta · beta→paid |
| Churn | Logo churn (30d) · gross revenue churn (30d) · net revenue churn · voluntary vs involuntary · at-risk count (14+ days idle) |
| Beta progress | Beta households cumulative vs Month 1/2/3/4 target · NPS · unsolicited testimonials count |
| Product health | MC forecast runs/day · scenarios saved/day · Action Roadmap views/day · property records updated/day |
| Engine integrity | % UI metrics passing canonical-selector trace · # duplicate-math regressions detected |
| Reliability | Vercel build success rate · production 5xx rate · API p95 latency (`/api/market-data`, `/api/ai-insights`) · Supabase query error rate |
| Compliance | RLS coverage % (D-006) · T&Cs acceptance rate (D-016) · "information not advice" disclaimer impressions |
| Costs | Supabase $/mo · Vercel $/mo · OpenAI $/mo · cost per active household |
| Roadmap | Open PRs by label · merged PRs/week · sprint velocity · defect register (open vs closed) |

Phase-2 minimum dashboard: North star + activation funnel + D7/D30 retention + beta cumulative count + production reliability.
