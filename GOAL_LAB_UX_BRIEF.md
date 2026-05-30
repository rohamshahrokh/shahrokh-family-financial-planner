# Goal Lab — UX & Framework Positioning Brief

**Status:** DRAFT for user review. Pairs with `ENGINE_CONSOLIDATION_PLAN.md`. No code changes proposed yet.
**Reference mockup:** `uploaded_attachments/.../56D707E1-6F65-4859-A570-3EA172D01AF5.jpeg` (2026-05-28).
**Scope:** Goal Lab page UX, framework branding, right-rail summary, motivational copy.
**Out of scope:** Action Lab (downstream optimisation), engine internals (covered in consolidation plan).

---

## 1 · Why this brief exists

Goal Lab is the **first surface a user touches** before any engine runs. Today the equivalent page is the Goal Closure Lab / Goal Solver Pro screens, which read like form wizards and calculators. The directive: Goal Lab must feel like an **institutional, scientific, proven, trustworthy methodology** — not generic AI advice, not budgeting software, not a retirement calculator.

This brief codifies the framework positioning, the page IA, and the emotional/credibility cues that must be present before any optimisation begins.

---

## 2 · Framework branding (non-negotiable)

### Header identity — option A (recommended)
```
GOAL LAB
Built on:
Goals-Based Financial Planning ·
Household Balance Sheet Modeling ·
Monte Carlo Risk Simulation
```

### Header identity — option B (shorter)
```
GOAL LAB
FWL Financial Independence Framework™
```

### Sub-header (required, under either option)
> "An institutional-style framework for understanding your path to financial independence."

### Visual hierarchy rules
- The framework methodology line MUST appear above the fold and above the question cards.
- Typography: small caps or upper-case eyebrow label for the methodology pillars; the sub-header in lighter weight serif or premium sans (e.g. Inter Tight / GT America / system equivalent).
- Color: muted navy / graphite on bone or off-white; reserve violet/teal accent for the active state and progress.
- Iconography: a single restrained logomark; no emoji, no fintech gradients.

### Why this matters
- **Credibility:** the methodology line tells the user the engines are not improvised.
- **Premium positioning:** matches the "private wealth advisor" register, not "money app".
- **Conversion:** users who recognise the methodology language (goals-based planning, balance sheet modelling, Monte Carlo) trust the output before they read it.
- **Defensibility:** ties FWL's outputs to recognised institutional frameworks, which makes "is this real?" easier to answer.

---

## 3 · Page IA (left column · centre · right rail)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HEADER ZONE                                                                 │
│  • GOAL LAB                                                                  │
│  • Methodology line (3 pillars)                                              │
│  • Sub-header (institutional-style framework …)                              │
│  • Single intro sentence: "Let's build your personalised path to            │
│    Financial Independence. Answer 6 key questions. We'll do the heavy        │
│    lifting."                                                                 │
│  • Quiet mountain/path illustration (right of header) — restrained, not     │
│    cartoonish; aligns with "calm premium family-office" guardrail            │
├──────────────────────────────────────────┬──────────────────────────────────┤
│                                          │                                  │
│  6 NUMBERED QUESTION CARDS (2-col grid)  │  RIGHT-RAIL SUMMARY (sticky)     │
│                                          │                                  │
│  1 What is your FIRE goal?              │  ┌────────────────────────────┐  │
│  2 How much fuel do you generate?       │  │ Your Summary    [Preview] │  │
│  3 What is your current capital         │  │                           │  │
│    structure?                            │  │      ⊙ 6/6 Completed     │  │
│  4 What is your primary wealth engine?  │  │                           │  │
│  5 How much risk can your plan          │  │ Great job! You've         │  │
│    truly survive?                       │  │ completed your Goal Lab.  │  │
│  6 What is currently blocking your      │  │                           │  │
│    path to FIRE?                        │  │ ✓ Goal clarity            │  │
│                                          │  │ ✓ Savings engine          │  │
│  Each card: title · short rationale ·   │  │ ✓ Capital structure       │  │
│  CURRENT ANSWER (read-only summary) ·   │  │ ✓ Wealth engine           │  │
│  [Edit] button · [Looks good] confirm    │  │ ✓ Risk capacity           │  │
│                                          │  │ ✓ Constraints             │  │
│                                          │  └────────────────────────────┘  │
│                                          │                                  │
│                                          │  ┌────────────────────────────┐  │
│                                          │  │ What happens next?        │  │
│                                          │  │ 1 We run thousands of     │  │
│                                          │  │   scenarios using Monte   │  │
│                                          │  │   Carlo simulation         │  │
│                                          │  │ 2 We evaluate probability,│  │
│                                          │  │   risk, and timeline      │  │
│                                          │  │ 3 You get a ranked action │  │
│                                          │  │   plan with clear next    │  │
│                                          │  │   steps                   │  │
│                                          │  └────────────────────────────┘  │
│                                          │                                  │
│                                          │  ┌────────────────────────────┐  │
│                                          │  │ "The best plan is the one │  │
│                                          │  │  built around your life,  │  │
│                                          │  │  not someone else's."     │  │
│                                          │  │  – Family Wealth Lab      │  │
│                                          │  └────────────────────────────┘  │
│                                          │                                  │
│                                          │  ┌────────────────────────────┐  │
│                                          │  │ Need help?                │  │
│                                          │  │ Book a call with our      │  │
│                                          │  │ advisory team             │  │
│                                          │  │ [Book a call]             │  │
│                                          │  └────────────────────────────┘  │
├──────────────────────────────────────────┴──────────────────────────────────┤
│  FOOTER CTA                                                                  │
│  "All set! We've captured your goals and constraints.                       │
│   Let's run the numbers and find your best paths."   [Go to Action Lab →]    │
│  🔒 Your data is private and secure.                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4 · Section-by-section spec

### 4.1 Header zone
- **Page label** "GOAL LAB" — uppercase, tight tracking, weight ~500.
- **Methodology line** under it, smaller, muted: `Built on: Goals-Based Financial Planning · Household Balance Sheet Modeling · Monte Carlo Risk Simulation`.
- **Sub-header**: "An institutional-style framework for understanding your path to financial independence." (lighter weight, italic optional).
- **Intro one-liner**: existing copy is good: "Let's build your personalised path to Financial Independence. Answer 6 key questions. We'll do the heavy lifting."
- **Illustration**: keep the calm mountain motif but tone it down — no bright sun gradient. Family-office sketch register, not consumer-fintech.

### 4.2 The six question cards (centre column)

| # | Title | Engine field it captures |
|---|---|---|
| 1 | What is your FIRE goal? | `mc_fire_settings.target_fire_age`, `target_passive_monthly`, `swr_pct`, `goals_set`, `goal_set_timestamp` |
| 2 | How much fuel do you generate each month? | Canonical surplus (from ledger, last-6mo average) — read-only summary; deep-edit in Income & Expenses |
| 3 | What is your current capital structure? | Canonical net worth, total assets, total liabilities, liquidity, leverage % (from `sf_snapshot` + canonical selectors) |
| 4 | What is your primary wealth engine? | Composition % across Salary, Property, Investments — derived; user confirms mental model |
| 5 | How much risk can your plan truly survive? | Risk capacity tier, drawdown tolerance, income-loss endurance, leverage comfort |
| 6 | What is currently blocking your path to FIRE? | Top blocker (binding constraint) + the engine's quantified impact — comes from `goalSolverPro.feasibility.blockers` |

**Each card requires:**
- A short rationale (1 sentence) explaining why we ask.
- A **read-only CURRENT ANSWER block** showing what's on file, with `SourceTag` chip (ledger / Monte Carlo / user-set / derived) per the Sprint 13 P0 locked decision #7.
- An **[Edit]** button that deep-links to the canonical editor (Settings, Income & Expenses, Risk panel, etc.) — never duplicate-edit in place.
- A **[Looks good]** confirm pill that flips the card to "confirmed" for this Goal Lab cycle.
- If the underlying canonical source has **no answer yet** → show "Goal not set" / "No data yet" CTA, per locked decision #1. Never invent defaults.

### 4.3 Right rail — `Your Summary` card

- **Card title:** "Your Summary" + a small `[Preview]` pill (links to a read-only digest view).
- **Progress ring:** large, ~120 px, X/6 in centre, ring fills proportionally. Color: violet/teal accent.
- **Headline line:** dynamic.
  - 0–2 done → "Let's get started — answer a few quick questions."
  - 3–5 done → "You're making great progress."
  - 6/6 done → "Great job! You've completed your Goal Lab."
- **Six-item checklist** — one row per dimension with check or empty circle.

| Dimension | Maps to question |
|---|---|
| Goal clarity | Q1 |
| Savings engine | Q2 |
| Capital structure | Q3 |
| Wealth engine | Q4 |
| Risk capacity | Q5 |
| Constraints | Q6 |

### 4.4 Right rail — `What happens next?` card

Three numbered steps. Static copy (engine-aligned, methodology-honest):

```
1  We run thousands of scenarios using Monte Carlo simulation.
2  We evaluate probability, risk, and timeline for each path.
3  You get a ranked action plan with clear next steps.
```

This is the most important psychology card on the page. It tells the user the methodology before they trust the output. It also pre-sells the Action Lab transition.

### 4.5 Right rail — motivational / philosophy card

Quoted block, light background, small mountain motif in corner.

Default:
> "The best plan is the one built around your life, not someone else's."  
> – Family Wealth Lab

Alternative (longer cycle / B variant):
> "Financial independence is not about becoming rich. It's about gaining control over your future."

Rotate quietly per session, not per refresh.

### 4.6 Right rail — `Need help?` card

Small advisor photo + body copy + outline button "Book a call".

This card is intentionally subtle — calm reassurance, not pop-up sales. If no advisory product is wired yet, the button can route to a help/contact form.

### 4.7 Footer CTA bar

- Background: subtle off-white panel, slim height.
- Left text: "All set! We've captured your goals and constraints. Let's run the numbers and find your best paths."
- Right primary button: **[Go to Action Lab →]**.
- Disabled state if < 6/6 confirmed: button reads "Complete Goal Lab first" with the missing-dimension chip.
- Below the bar, the privacy reassurance line with a small lock icon: "Your data is private and secure."

---

## 5 · Tone and copy rules

| Do | Don't |
|---|---|
| "We've captured your goals and constraints." | "AI is analysing your finances…" |
| "We run thousands of scenarios using Monte Carlo simulation." | "Our smart algorithm will figure this out." |
| "Looks good" / "Edit" | "Save & Continue" / form-wizard buttons |
| Methodology line above question cards | Generic fintech tagline |
| Single mountain motif | Multiple icons, gradients, badges |
| "Your data is private and secure." with lock | "🔥 Get rich faster!" or growth hacks |
| Quote attribution to "Family Wealth Lab" | Quotes from celebrities or generic motivational figures |

---

## 6 · Engine wiring requirements

### 6.1 Goal Lab is a **read + confirm** surface, not a re-entry form
The six cards must consume canonical engines, not duplicate them:

| Card | Canonical source (per `dashboardDataContract.ts` + `useCanonicalGoal.ts`) |
|---|---|
| Goal | `useCanonicalGoal()` → `mc_fire_settings` |
| Surplus / fuel | `selectMonthlyIncomeLedger()` − `selectMonthlyExpensesLedger()` |
| Capital structure | `selectCanonicalNetWorth()`, `selectCanonicalLiquidity()`, `selectCanonicalLeverage()` |
| Wealth engine | derived composition % from canonical ledger |
| Risk capacity | `riskEngine.runRiskRadar()` |
| Blockers | `goalSolverPro.feasibility.blockers` (Sprint 10) |

### 6.2 Per the Sprint 13 P0 locked decisions
- **Source visible:** every "current answer" block must render a `SourceTag` chip (ledger / canonical goal / Monte Carlo / user-set / derived).
- **Freshness visible:** if any reading is older than the MC freshness threshold, show the amber banner inline on the affected card.
- **Goal not set ≠ defaults:** if `mc_fire_settings.goals_set = false`, card 1 shows "Goal not set" with a CTA — do NOT pre-fill with assumed 4% SWR or assumed retirement age.
- **No NaN, no empty primary numbers** — if a canonical reading is missing, render the read-only block as an empty state with a CTA, never `$NaN`.

### 6.3 Page state machine
| State | Trigger | Right-rail summary | Footer CTA |
|---|---|---|---|
| `EMPTY` | First-ever visit, no Goal Lab confirmations on file | 0/6 ring, "Let's get started" | Disabled, "Complete Goal Lab first" |
| `IN_PROGRESS` | 1-5 confirmed | X/6 ring, "Making great progress" | Disabled |
| `COMPLETE` | 6/6 confirmed within last `goal_set_timestamp + N days` | 6/6 ring, "Great job!" | Enabled, "Go to Action Lab →" |
| `STALE` | 6/6 confirmed BUT underlying canonical ledger has changed materially since last confirmation | 6/6 ring with amber dot, "Snapshot updated — please review" | Disabled until user re-confirms affected cards |

The `STALE` state is the one most easily forgotten and is critical to prevent the user from running optimisations on outdated assumptions.

---

## 7 · How this brief plugs into the engine consolidation plan

| Connection | Where |
|---|---|
| Goal Lab is the UI consumer of `goalSolver` + `goalSolverPro` + `goalSolverView` (the canonical Goal Solver stack identified in §4 of the consolidation plan). | Engines stay canonical; UI is the new layer. |
| If wave 3 of the consolidation plan retires `/goal-closure-lab`, this Goal Lab page is its **structural replacement**. | Plan §4 (Goal Solver family). |
| Card 6 ("What is currently blocking your path to FIRE?") relies on `goalSolverPro.feasibility.blockers`. That field also drives the §13 P0 locked decision #5 ("No fake recommendations"). | PR #88 Phase B fix. |
| The right-rail "What happens next?" card explicitly references Monte Carlo. It must be wired to the V3+V4+V5 stack, NOT to `fireMonteCarlo` legacy. | Plan §2 (Monte Carlo family). |
| Source-tag chips and freshness banners on each card are the Sprint 13 P0 fixes already in PR #88. | Plan §1 + Phase A/B/C. |

---

## 8 · What this brief deliberately does NOT do

- ❌ No Action Lab UX — out of scope; this brief is Goal Lab only.
- ❌ No new engine work — Goal Lab consumes existing canonical engines; the consolidation plan handles engine hygiene.
- ❌ No design system rewrite — uses existing Tailwind + shadcn primitives + Sprint 11 `<AdvancedDisclosure>` pattern.
- ❌ No copy in the intelligence layer (autonomous OS, narrative, future worlds) — deferred per user.
- ❌ No commits, no PRs, no migrations — sign-off first.

---

## 9 · Open questions before any implementation

1. **Header choice** — option A (3-pillar methodology line) vs option B (`FWL Financial Independence Framework™`)? Option A is more discoverable and SEO-friendly; option B is more brandable.
2. **Question 6 wording** — "What is currently blocking your path to FIRE?" implies the engine has computed a blocker. If `goalSolverPro` has not produced one yet, do we (a) show "Run analysis first" CTA, or (b) ask the user to self-report their perceived blocker and feed it into the next solver pass?
3. **Action Lab transition** — is `/decision-lab` the canonical Action Lab destination, or do we want to introduce a new `/action-lab` route as the natural continuation of Goal Lab?
4. **Advisor card** — is "Book a call with our advisory team" wired to a real product, or a placeholder for now? If placeholder, suggest swapping it for a `Need help?` knowledge-base link until an advisory product exists.
5. **Confirmation TTL** — how long should a "Looks good" confirmation stay valid before Goal Lab transitions to `STALE`? Suggest 30 days, or until `sf_snapshot.updated_at` moves materially.
6. **Where does Goal Lab live in the sidebar?** Currently `/portfolio-lab`, `/goal-closure-lab`, and `/decision-lab` co-exist. Recommend Goal Lab take the PLAN section slot and the other two move to `<AdvancedDisclosure>` until the consolidation plan retires them.

---

## 10 · Sign-off needed before any code lands

- [ ] Approve framework branding header (option A or B)
- [ ] Approve right-rail card set (Summary, What happens next, Motivational, Need help)
- [ ] Answer open questions in §9
- [ ] Confirm Goal Lab is the structural replacement for `/goal-closure-lab` (or specify if both coexist)
- [ ] Confirm any visual identity rules (typography, color tokens) we must respect from the existing Sprint 11 / Sprint 20 design language

Once approved, implementation can be scoped as a single PR sitting on top of the PR #88 data-layer fixes — no new engine work required.

---

**End of brief.** Pairs with `ENGINE_CONSOLIDATION_PLAN.md`. Both await user sign-off.
