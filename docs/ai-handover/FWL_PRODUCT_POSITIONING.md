# FWL_PRODUCT_POSITIONING.md

Commercial + product context for future AI assistants. Read before writing copy, marketing surfaces, AI-insight prompts, or anything customer-facing.

## What FWL Is

| Attribute | Value |
|---|---|
| Name | Family Wealth Lab |
| Category | AI-powered wealth planning OS for households |
| Form factor | Web app (React + Vite client, Express/serverless API, Supabase) |
| Geo scope | Australia only (AU tax, AU property, AUD) |
| Pricing | AUD $29/month subscription, no free tier, no annual discount at launch |
| Tenancy | Single household per account; family-share via `sf_household_permissions` (not yet UI-exposed) |
| Production | `familywealthlab.net` (Vercel) |
| Repo | `rohamshahrokh/shahrokh-family-financial-planner` |

What it does (one line each):
- Canonical net-worth + cashflow + debt tracker (single source of truth).
- Deterministic FIRE engine (target age, passive income, drawdown band).
- Monte-Carlo forecast with fan chart + percentile risk.
- Risk Radar (8 axes: liquidity, leverage, cashflow, concentration, property, rates, tax reform, FIRE delay).
- Decision Lab (scenario engine + recommendation optimizer).
- Action Roadmap (year-by-year acquisitions, refis, debt, FIRE, passive — 5 lanes).

## Target Customer

| Tier | Profile |
|---|---|
| Primary | Australian dual-income households pursuing FIRE, $500K–$3M net worth, property + super heavy |
| Primary | Mortgage holders weighing PPOR upgrade vs investment-property acquisition |
| Secondary | High-income professionals modelling super + tax + property scenarios |
| Secondary | Self-directed property investors who want one canonical view |

Pain solved:
- Spreadsheets that diverge from reality.
- Adviser fees ($3K–$10K) for plans that go stale in 6 months.
- No single tool that does FIRE + AU property + tax + Monte Carlo + recommendation together.

## Who Is NOT The Target

| Excluded | Why |
|---|---|
| Non-AU households | AU tax, stamp duty, super, AUD baked into engines (`canonicalTax.ts`, property engine) |
| SMSF specialists / self-managed super pros | Out of scope at launch; no SMSF-specific compliance UI |
| Day-traders / active stock pickers | FWL is wealth planning, not portfolio management |
| Financial advisers (B2B) | Not a CRM, no client management, no compliance pack |
| Pre-savers (zero/negative net worth) | Engines assume material assets + liabilities |
| Users seeking personal financial advice | D1 locked — FWL is information/planning, not AFSL-licensed advice |
| Crypto-native portfolios | Crypto supported but secondary; primary is property + super + stocks |

## Australian-First Assumptions

| Domain | Assumption |
|---|---|
| Currency | AUD only, single currency |
| Tax | AU income brackets, Medicare levy, Div 293, CGT 50% discount, negative gearing |
| Property | Stamp duty by state, LMI, AU LVR norms, weekly-rent convention |
| Super | Concessional/non-concessional caps, preservation age 60, SG rate |
| Retirement | Age Pension means-test (informational only), AFP $100K passive benchmark used by SWR comparators |
| Property legal | AU contract lifecycle (`planned` → `under_contract` → `settled` → `sold` / `archived`) |
| Mortgage convention | P&I and IO products; rate stored as percent in some legacy rows (see Sprint FWL078 rate-unit fix) |
| Macro defaults | `mc_fire_settings.mean_mortgage_rate` (user-controllable, currently ~6.5%) |

No translation, no FX, no international tax — by design and locked (D2).

## Commercial Vision

| Horizon | Outcome |
|---|---|
| 12 mo | Closed beta of 20–50 invited AU households; testimonial set |
| 18 mo | 100 paying subscribers (break-even ≈ 29 users at $29/mo) |
| 36 mo | 1,000 paying subscribers; retention proof; founder income partially replaced |
| 5 yr | 5,000 subscribers; first contractor hired |
| 5+ yr | 10,000+ subscribers; founder employment income fully replaceable |

## Subscription Strategy

| Decision | Status |
|---|---|
| Single tier AUD $29/mo | Locked (D3) |
| No free tier at launch | Locked |
| No annual discount at launch | Locked |
| Beta = invite-only, paid waitlist | Locked (D4) |
| Billing provider | Not yet selected (Stripe likely) |
| Cancellation | Self-serve required at launch |
| Refund policy | Not yet drafted |
| Free trial | Decision deferred to Phase 3 launch readiness |

## Why Users Join

| Trigger | Job-to-be-done |
|---|---|
| Considering investment property | "Can we afford it? Will it accelerate or delay FIRE?" |
| Mortgage rate shock | "What's our refinance pressure? Do we need to sell?" |
| Approaching FIRE age | "Will our passive income actually cover expenses at the target SWR?" |
| Goal alignment with partner | "Can we model both partners' incomes + super and see one plan?" |
| Distrust of generic calculators | "I want one canonical number, not 5 conflicting ones." |
| Avoiding $5K adviser fee | "I want adviser-grade output without giving up control." |

## Why Users Stay (Recurring Value)

| Mechanism | Surface |
|---|---|
| Monthly forecast refresh | Forecast page / `mc_fire_results` reruns |
| Risk Radar drift alerts | 8-axis monitoring of capacity drift |
| Action Roadmap re-plan | Year-by-year acquisitions/refis update on every snapshot save |
| Decision Lab on demand | Re-rank scenarios when life events happen |
| Goal Lab lock + checklist | `mc_fire_settings.action_checklist` tracks progress |
| Property economics monitoring | Per-property NPV/IRR vs originally modelled |

## Core Recurring Value (One Sentence)

A canonical, always-fresh answer to "Are we on track to FIRE, and what's the single best move this year?" — with the math, the risk, and the year-by-year plan visible.

## Key User Jobs-To-Be-Done

| # | JTBD | Surface |
|---|---|---|
| J1 | "Tell me our true net worth, deduplicated" | Today / Dashboard |
| J2 | "Tell me when we can FIRE and what passive income we'll have" | Goal Lab + Forecast |
| J3 | "Show me the probability we'll get there" | Forecast (MC fan chart) |
| J4 | "Tell me what to do next" | Decision Lab (recommendation) |
| J5 | "Show me the next 10 years on one timeline" | Action Roadmap |
| J6 | "Warn me when risk has drifted" | Risk Radar |
| J7 | "Should we buy this property?" | Property Engine + Decision Lab |
| J8 | "Should we refinance / extend?" | Decision Lab + Roadmap |

## Competitive Differentiation

| Axis | FWL | Spreadsheets | Generic FIRE calcs | AU advisers |
|---|---|---|---|---|
| AU tax + property baked in | Yes | Manual | No | Yes |
| Canonical SoT (no duplicate math) | Yes | No | n/a | Adviser-only |
| Monte Carlo + 8-axis risk | Yes | No | Partial | Manual |
| Year-by-year roadmap | Yes | No | No | Yes (static) |
| Decision optimizer + override rules | Yes | No | No | Adviser judgment |
| Always-fresh / monthly | Yes | No | Yes | No (annual review) |
| Subscription cost | $29/mo | $0 | $0–$20 | $3K–$10K once |
| Personal advice | No (info only) | n/a | No | Yes (AFSL) |

## Major Competitors

| Competitor | Category | Overlap | Gap they leave |
|---|---|---|---|
| Pocketsmith | Cashflow / budgeting | Cashflow + accounts | No FIRE engine, no AU property, no recommendation |
| Sharesight | Investment tracking | Stock / portfolio | No cashflow, no FIRE, no property, no roadmap |
| Excel/Google Sheets | DIY | All of it manually | Drift, no MC, no canonical SoT |
| Stockspot / Six Park / robo-advice | Investment management | Investment | Not planning; no property; not AU-FIRE-specific |
| AFSL advisers (e.g. Ord Minnett, boutique IFAs) | Personal advice | Comprehensive | $$$ + static + slow refresh |
| Vanguard / Stockspot retirement calculators | FIRE estimator | FIRE | No AU property, no MC fan, no recommendation, no roadmap |
| Property-specific (DSR, Real Estate Investar) | Property analysis | Property only | No household-wide plan, no FIRE |

## Product Principles

| # | Principle |
|---|---|
| P1 | One canonical selector per metric. No duplicate math. |
| P2 | Contract before code. New formulas land in `FWL_ENGINE_CONTRACTS.md` before any selector or UI change. |
| P3 | Information, not advice. UI copy + AI insight prompts use general-information framing. |
| P4 | Transparent fallbacks. Any imputed value (mortgage rate fallback, default term) reports `*Source` flags. |
| P5 | Audit-mode by default. Every UI metric must trace to selector + raw inputs. |
| P6 | No fabrication. Missing data is reported as missing; never silently zero-filled in headline metrics. |
| P7 | Test the regressions. Every fix gets a `__tests__` file (see `fwl078DsrRateUnit.test.ts`, `fwl079RoadmapLabels.test.ts`). |
| P8 | AU defaults are real defaults. Tax, super, stamp duty are first-class, not configuration. |
| P9 | Surgical changes. No repo-wide rewrites; identify files first, edit minimally. |

## Non-Negotiable Decisions Already Made

| # | Decision | Source |
|---|---|---|
| D1 | No personal financial advice positioning (information only) | `FWL_DECISION_LOG.md` |
| D2 | Australia-first; no multi-currency, no overseas tax | `FWL_DECISION_LOG.md` |
| D3 | Subscription AUD $29/mo, single tier, no free tier at launch | `FWL_DECISION_LOG.md` |
| D4 | Closed beta before commercial launch | `FWL_DECISION_LOG.md` |
| D5 | Target = AU FIRE households; no B2B, no advisers, no SMSF specialists | `FWL_DECISION_LOG.md` |
| D6 | No mobile app before web PMF | `FWL_DECISION_LOG.md` |
| D7 | No new financial math without contract first | `FWL_DECISION_LOG.md` |
| D8 | Single-source-of-truth via canonical selectors | `FWL_DECISION_LOG.md` |
| D9 | Supabase is SoT; SQLite (`shared/schema.ts`) is dev shim only | `FWL_DATA_MODEL.md` |
| D10 | PPOR lives in `sf_snapshot`, not `sf_properties` | `FWL_DATA_MODEL.md` |

## Future Roadmap Themes (not commitments)

| Phase | Theme | Notes |
|---|---|---|
| Phase 2 (closed beta) | RLS + auth + legal | D-006 RLS, D-016 T&Cs are blockers |
| Phase 2 | Billing integration | Stripe likely; cancellation self-serve |
| Phase 3 (launch) | Onboarding + import | Bank-feed import, broker-statement parsers (AU-specific) |
| Phase 3 | Multi-household / family share | `sf_household_permissions` UI exposure |
| Phase 4 (post-PMF) | Tax optimizer | CGT timing, super contributions, salary sacrifice |
| Phase 4 | Property deal-flow integration | DSR / Real Estate listing pull |
| Phase 4 | Adviser-share read-only mode | Read-only PDF/share link for users' advisers |
| Phase 5 | Mobile-first responsive polish | Still web; PWA install — NOT native |
| Phase 5 | NZ expansion | Re-evaluation only after AU PMF |

What is explicitly OFF the roadmap: stock-picking, robo-advice/managed-account, B2B adviser CRM, multi-currency, US/UK tax, native mobile app.
