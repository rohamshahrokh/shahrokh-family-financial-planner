# Family Wealth Lab — Unified Decision Engine

**Spec version:** 1.1 (refined per user feedback 2026-05-11 14:09 AEST)
**Author:** Computer (for Roham Shahrokh)
**Date:** 2026-05-11
**Status:** Phase 0 — architecture & contracts. Phase 1 implementation begins immediately.
**Supersedes (eventually):** `whatIfEngine.ts`, `scenario-compare.tsx`, `what-if-scenarios.tsx` as user-facing surfaces. Both files **remain in repo** but are hidden from sidebar nav per user direction.

---

## 1. Product thesis

Family Wealth Lab is becoming an **AI-assisted financial operating system and long-term wealth decision engine** for Australian households and investors.

The user does not think *"which tool should I use?"*. The user thinks *"what should I financially do next?"*.

Therefore the platform exposes exactly one decision surface:

```
/decision
  ├── Quick Decision tab     (auto-generated candidate paths, ranked)
  └── Advanced Builder tab   (manual event timeline)
```

Both tabs run on the **same engine, same assumptions, same Monte Carlo, same scoring, same narrative, same PDF**. The only difference is *who composes the candidate set* — the engine, or the user.

This document is the contract.

---

## 2. Layer architecture

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 3 — AI ADVISOR (narrative.ts, recommendation prose)   │
│  Interprets results. Never computes math. Never overrides    │
│  Layer 1 outputs.                                            │
├──────────────────────────────────────────────────────────────┤
│  LAYER 2 — OPTIMIZATION ENGINE (candidate generator + rank)  │
│  Generates 15–25 financially realistic paths from           │
│  capital + timing variants. Filters by APRA / liquidity /   │
│  feasibility constraints. Ranks by composite score.          │
├──────────────────────────────────────────────────────────────┤
│  LAYER 1 — HARD FINANCIAL ENGINE (scenarioV2/*)              │
│  Deterministic. Auditable. Tested. The only place that does │
│  financial math. Already shipped in Sessions 1–4.            │
└──────────────────────────────────────────────────────────────┘
```

**Inviolable rule:** AI never writes math. AI consumes Layer 1 + Layer 2 outputs and produces sentences. Layer 1 outputs are the source of truth for every number that ever appears in the UI, in a PDF, in a notification, or in a recommendation.

---

## 3. Registries (Phase 0 deliverables)

To make Layer 1 *formally* auditable — not just *informally* well-tested — we add three thin, declarative modules. They do **not** reimplement math. They are versioned indexes plus a small set of missing helpers (amortization closed-form, liquidity ratio, FIRE coverage, risk-adjusted score) that the existing engine didn't expose as public functions.

### 3.1 Formula Registry — `client/src/lib/scenarioV2/registry/formulas.ts`

A single TypeScript module that exports, for every formula in the engine:

```ts
interface FormulaSpec<I, O> {
  id: string;              // e.g. "DSR", "amortizationPayment"
  description: string;     // one-line plain English
  formula: string;         // LaTeX-ish or plain math
  unit: string;            // "ratio", "AUD/month", "%", "AUD"
  category: "borrowing" | "tax" | "cashflow" | "risk" | "fire" | "return";
  inputs: Record<string, string>;   // { principal: "AUD", rate: "annual decimal", ... }
  output: string;          // what the function returns
  compute: (i: I) => O;    // the actual function (delegates to engine where possible)
  references: string[];    // file references, APRA APG 223, ATO links
}
```

Initial registry entries (each is **either** a re-export from `scenarioV2/*` **or** a newly-added pure helper):

| ID | Category | Source |
|---|---|---|
| `amortizationPayment` | borrowing | new helper (closed-form P&I) |
| `amortizationSchedule` | borrowing | new helper (period-by-period) |
| `interestOnlyPayment` | borrowing | new helper |
| `offsetEffectiveRate` | borrowing | new helper (after-tax guaranteed return) |
| `dsr` | borrowing | re-export `computeServiceability` |
| `dti` | borrowing | re-export `computeServiceability` |
| `lvr` | borrowing | re-export `computeServiceability` |
| `nsr` | borrowing | re-export `computeServiceability` |
| `maxBorrowCapacity` | borrowing | re-export `computeServiceability` |
| `apraBufferedRate` | borrowing | re-export `computeServiceability` |
| `wageTax` | tax | re-export `computeWageTax` |
| `cgt` | tax | re-export `computeCgt` |
| `propertyAnnualTax` | tax | re-export `propertyAnnualTax` |
| `stampDuty` | tax | re-export `stampDutyByState` |
| `lmi` | tax | re-export `estimateLMI` |
| `depreciation` | tax | re-export `annualDepreciation` |
| `concessionalSuperCap` | tax | new helper (FY26 cap + carry-fwd) |
| `divisionTwoNinetyThree` | tax | new helper (Div 293 high-income super tax) |
| `superGuaranteeRate` | tax | new helper (FY26 SG % schedule) |
| `propertyTotalReturn` | return | new helper (growth + yield − costs − tax drag) |
| `netRentalYield` | return | new helper |
| `equityReturn` | return | re-export stochastic asset drift |
| `cryptoReturn` | return | re-export stochastic asset drift |
| `netWorth` | cashflow | re-export `netWorth` |
| `monthlySurplus` | cashflow | re-export `monthlySurplusOf` |
| `liquidityRatio` | cashflow | new helper |
| `downside` | risk | new helper `1 − P10/P50` |
| `sequenceRiskMetric` | risk | re-export `sequenceRiskMetric` |
| `survivalProbability` | risk | new helper (1 − defaultProbability) |
| `fireCoverage` | fire | new helper |
| `swrSustainableSpend` | fire | new helper |
| `riskAdjustedScore` | score | new helper (see §5) |

Every entry has a unit test asserting (a) determinism under fixed inputs, (b) sensible boundary behavior (zero, negative, infinity), (c) agreement with engine output where it delegates.

### 3.2 Assumption Registry — `client/src/lib/scenarioV2/registry/assumptions.ts`

Single source of truth for every economic assumption the engine consumes. Versioned, with provenance.

```ts
interface AssumptionSpec<T> {
  id: string;                    // "inflation.cpi.au", "propertyGrowth.sydney.long"
  description: string;
  unit: string;
  defaultValue: T;
  range: { min: T; max: T };     // sanity bounds
  source: string;                // "RBA CPI 10y trimmed mean 2014–2024"
  lastReviewed: string;          // ISO date
  category: "macro" | "asset" | "tax" | "regulatory" | "behavioural";
}
```

The registry exposes `getAssumption("id")` and the **runtime check**: `assertAssumptionsConsistent(BasePlanAssumptions)` — flags any assumption in `BasePlanAssumptions` that falls outside its registered range. This catches user-overrides that would produce nonsense Monte Carlo runs.

Initial assumption IDs cover everything currently in `DEFAULT_ASSUMPTIONS` plus regulatory constants (APRA buffer = 3%, LMI thresholds, concessional cap, Div 293 threshold, SG rate, CGT discount 50%, marginal tax brackets).

### 3.3 Scoring Framework — `client/src/lib/scenarioV2/registry/scoring.ts`

```ts
interface ScoreInputs {
  survivalProbability: number;   // 1 − P(default) − P(forced sale) — HEAVIEST
  liquidityFactor: number;       // 0..1, min(liquidityRatio / dynamicFloor) across horizon
  riskAdjustedReturn: number;    // P50 CAGR × Sharpe-like adjustment × downside penalty
  fireAcceleration: number;      // years pulled in vs base plan (clamped, normalised)
  terminalNetWorth: number;      // P50 NW at horizon (normalised) — LIGHTEST
  refinancePressureBand: "none" | "mild" | "elevated" | "severe";  // categorical penalty
  leverageQuality: number;       // 0..1, penalises >80% IP LVR even if scenario survives
}

interface ScoreWeights {
  // Per user direction: survivability first, terminal NW last.
  survival:     number;  // default 0.35  (bankruptcy is unrecoverable)
  liquidity:    number;  // default 0.25  (dynamic floor, not fixed 6mo)
  riskAdjusted: number;  // default 0.20
  fire:         number;  // default 0.12
  terminalNw:   number;  // default 0.08  (intentionally smallest)
  // Penalties (subtracted, not weighted in convex combo):
  refinancePenalty: number;  // default 0.10 per band step beyond "mild"
  leveragePenalty:  number;  // default 0.15 × max(0, IP_LVR − 0.80)
}

function compositeScore(i: ScoreInputs, w?: Partial<ScoreWeights>): {
  score: number;          // 0..100
  breakdown: Record<keyof ScoreInputs, number>;  // per-axis contribution
  rationale: string[];    // human-readable bullets, fed to Layer 3 AI narrator
};
```

The score is **purely deterministic** from Layer 1 outputs. Layer 2 ranks by it. Layer 3 explains it. No model in the loop.

---

## 4. Event-driven engine semantics (unchanged contract)

The engine already supports events (`scenarioV2/events.ts`). Both Quick Decision and Advanced Builder produce the same shape:

```ts
ScenarioEvent[]  →  runScenarioV2(BasePlan + events + assumptions)  →  ExtendedScenarioResult
```

Supported event types (extends current `ScenarioEventType`):

Per user direction: **all 15 event types must be declared from day one**, with v1-disabled ones flagged. The unified `ScenarioEventType` union becomes:

| # | Event type | Status | Notes |
|---|---|---|---|
| 1 | `buy_property` | ✓ enabled | full engine support |
| 2 | `sell_property` | ✓ enabled | full engine support |
| 3 | `refinance` | ✓ enabled (tightened) | failure → forced sale path |
| 4 | `offset_transfer` | ✓ enabled | new delta type, simple |
| 5 | `etf_dca` | ✓ enabled | already supported |
| 6 | `lump_sum_investment` | ✓ enabled | already supported (ETF + crypto + cash) |
| 7 | `crypto_allocation` | ✓ enabled | already supported, with 10% cap |
| 8 | `super_contribution` | ✓ enabled (cap-aware) | concessional + carry-fwd + Div 293 |
| 9 | `debt_payoff` | ✓ enabled | new delta, offsets or principal reduction |
| 10 | `income_change` | ✓ enabled | already supported |
| 11 | `childcare_ending` | ✓ enabled | special-case expense change |
| 12 | `retirement` | ✓ enabled | already supported via SWR |
| 13 | `inheritance` | declared, v1-disabled | engine-ready, UI hidden |
| 14 | `tax_shock` | declared, v1-disabled | one-off liability event |
| 15 | `rate_shock` | declared, v1-disabled | rate path override window |

Day-one declaration ensures the engine, types, persistence schema, and tests handle all 15 without breaking changes when the disabled-three are unlocked in Phase 2.

---

## 5. Layer 2 — Candidate generator (Phase 1)

### 5.0 DSR banding (replaces single threshold)

```ts
function dsrBand(dsr: number): "healthy" | "watchlist" | "stressed" | "critical" {
  if (dsr < 0.30) return "healthy";
  if (dsr < 0.40) return "watchlist";
  if (dsr < 0.55) return "stressed";
  return "critical";
}
```

High-income leveraged households can temporarily sit in `stressed` while still being solvent — the engine **scores the penalty** rather than rejecting the path. Only `critical` is auto-rejected.

### 5.0a Dynamic liquidity floor (replaces fixed 6-month rule)

```ts
function dynamicLiquidityFloor(ctx: {
  monthlyExpenses: number;
  dependants: number;            // children/elderly dependants
  incomeVolatility: number;      // 0..1, e.g. self-employed ~0.4, PAYG ~0.05
  totalLvr: number;              // higher leverage → bigger buffer
  upcomingEventsWithin12mo: ScenarioEvent[];  // refinance, IP buy, retirement
  illiquidAssetShare: number;    // 0..1, property + super / total NW
}): { floorMonths: number; floorDollars: number; rationale: string[] } {
  let m = 3; // base floor
  m += 0.5 * ctx.dependants;                                  // +0.5mo per dependant
  m += 24 * ctx.incomeVolatility;                             // PAYG +1mo, self-emp +10mo
  m += 6 * Math.max(0, ctx.totalLvr - 0.50);                  // each 10pp LVR over 50% → +0.6mo
  m += 4 * Math.min(1, ctx.illiquidAssetShare / 0.80);        // up to +4mo when 80%+ illiquid
  if (ctx.upcomingEventsWithin12mo.some(e => e.type === "refinance")) m += 3;
  if (ctx.upcomingEventsWithin12mo.some(e => e.type === "buy_property")) m += 6;
  if (ctx.upcomingEventsWithin12mo.some(e => e.type === "retirement")) m += 6;
  m = Math.max(3, Math.min(24, m));  // bound 3–24 months
  return { floorMonths: m, floorDollars: m * ctx.monthlyExpenses, rationale: [...] };
}
```

The floor is computed **per candidate at every month**, not once globally. A PAYG household with no dependants and 30% LVR might run on 4-month buffers safely. A self-employed household with 2 kids planning an IP in 9 months might need 18 months of buffer.

### 5.0b Refinance-pressure band

Derived from `(NSR @ buffered rate, rate-rise headroom in bps, months-to-next-refinance)`:
- `none` — NSR ≥ 1.30 and rate-headroom ≥ 200bps
- `mild` — NSR ∈ [1.10, 1.30)
- `elevated` — NSR ∈ [1.0, 1.10) OR rate-headroom < 100bps
- `severe` — NSR < 1.0 OR refinance in <6mo with NSR < 1.15

### 5.1 Inputs

```ts
interface QuickDecisionInput {
  basePlan: DerivedBasePlan;           // auto-derived from ledger, today's snapshot
  question: QuickDecisionQuestion;     // typed (see §5.2)
  capital?: number;                    // optional lump sum (e.g. $50k)
  horizonYears: number;                // default 25
  assumptions: BasePlanAssumptions;    // from Assumption Registry defaults + user overrides
  household: {
    dependants: number;                // for dynamic liquidity floor
    incomeVolatility: number;          // 0..1, default 0.05 (PAYG)
  };
  constraints: {
    // Hard safety ceilings (kill paths that breach):
    maxLvr: number;                    // default 0.85 — absolute ceiling
    maxDsrBand: "watchlist"|"stressed"|"critical";  // default "stressed" (i.e. kill on "critical")
    minNsrBuffered: number;            // default 0.85
    respectSuperCaps: boolean;         // default true
    // Behavioural realism filters:
    maxCryptoSharePct: number;         // default 0.10
    maxRefinanceChainsIn24mo: number;  // default 1
    // Liquidity is dynamic — no minLiquidityMonths constant.
  };
}

type QuickDecisionQuestion =
  | { kind: "deploy_capital";  capital: number }
  | { kind: "buy_property";    targetPriceRange: [number, number] }
  | { kind: "super_vs_invest"; capital: number }
  | { kind: "debt_vs_invest";  capital: number }
  | { kind: "fire_acceleration" }
  | { kind: "downside_protection" };
```

### 5.2 Generation strategy — financially realistic, NOT brute force

For `deploy_capital`, the generator produces ~15–25 paths by combining:

**Allocation axes** (the *what*):
- 100% offset
- 100% ETF (lump sum)
- 100% ETF (staged DCA 24 months)
- 100% concessional super (capped + carry-forward)
- 100% crypto (constrained ≤ 10% of portfolio, else clipped)
- 100% property deposit (only if borrowing power + liquidity permit)
- 70/30 ETF/Offset
- 50/50 ETF/Super
- 50/50 Offset/ETF
- 40/40/20 ETF/Super/Crypto

**Timing axes** (the *when*) — applied to allocation paths where it makes sense:
- Now (T=0)
- 6 months (let market dust settle / cash rate decision)
- 18 months (build serviceability for IP deposit)
- Staged DCA over 12 / 24 months

**Sequencing axes** (the *order*) — for multi-asset paths:
- Offset → release → IP in 18mo
- ETF DCA now → Super top-up at FY end
- Pay-down debt → re-borrow for investment (debt recycling)

**Two-stage filter:**

**Stage 1 — Behavioural realism (HARD, kills the path):**
- Emergency cash > $0 at every month (no zero-cash plans)
- No "max leverage at T=0" patterns (IP buy at T=0 requires ≥ 12mo of liquidity buffer post-deposit)
- Crypto exposure ≤ 10% of total portfolio value at any point (else clip allocation)
- No refinance chain > 1 within 24mo window
- Super contribution must not push liquidity below dynamic floor in deposit month

**Stage 2 — Hard safety ceilings (HARD, kills the path):**
- LVR > 0.85 at any month → discard
- DSR band = "critical" at any month → discard
- NSR < 0.85 (buffered) at any month → discard
- Super contributions exceed concessional cap + carry-forward → clip then re-test, else discard
- Liquidity ratio < `dynamicLiquidityFloor(state, events, exposures)` at any month → discard

**Stage 3 — Scoring penalties (does NOT kill, lowers score):**
- DSR band ∈ {watchlist, stressed} → score penalty
- LVR 0.80–0.85 → score penalty (`leverageQuality` axis)
- Refinance pressure band ∈ {elevated, severe} → score penalty
- Liquidity ratio in lowest tercile → score penalty
- NSR ∈ [0.85, 1.0) → score penalty (marginal serviceability)

Paths that fail Stages 1 or 2 are **discarded with a recorded reason** (shown in UI as "Why some paths weren't considered").

**No randomness in candidate generation.** Each path is a deterministic combination of axes. The same input always produces the same candidate set. (Monte Carlo runs *per path* are seeded.)

### 5.3 Outputs

```ts
interface QuickDecisionOutput {
  question: QuickDecisionQuestion;
  ranked: RankedCandidate[];        // sorted by score desc
  discarded: DiscardedCandidate[];  // with reasons
  generatedAt: string;
  basePlanHash: string;             // for reproducibility
}

interface RankedCandidate {
  id: string;
  label: string;                    // "ETF lump-sum + Super top-up (FY end)"
  events: ScenarioEvent[];          // ready to feed runScenarioV2
  result: ExtendedScenarioResult;   // full MC + risk metrics
  score: number;                    // 0..100
  scoreBreakdown: Record<keyof ScoreInputs, number>;
  rationale: string[];              // Layer 3 narrator fills this
  attribution: ScenarioAttribution; // existing narrative.ts type
}
```

### 5.4 Performance budget

15–25 paths × Monte Carlo runs is the bottleneck.
- Default MC paths in Quick mode: **500** (vs 2000 in Advanced)
- Reuse one MC RNG seed per candidate (via `deriveSeed(basePlanHash, candidateId)`)
- Run candidates **in parallel via `Promise.all`** on the existing engine (already pure)
- Cache invalidates on `basePlanHash` change
- Budget target: **<3s on a 2024 laptop** for 20 candidates × 500 MC = 10k full-portfolio sims

If we ever blow the budget, we throttle MC paths first, never simplify the math.

---

## 6. UX: the unified `/decision` page (Phase 1)

```
┌──────────────────────────────────────────────────────────────┐
│  Decision Engine                              [Hide] [PDF]   │
│  ─────────────                                               │
│  ◉ Quick Decision    ○ Advanced Builder                      │
│                                                              │
│  ── Quick Decision ──────────────────────────────────────    │
│  What should I do next?                                      │
│    [ Deploy $___ capital ]                                   │
│    [ Buy another property? ]                                 │
│    [ Super vs. invest? ]                                     │
│    [ Pay down debt vs. invest? ]                             │
│    [ Accelerate FIRE? ]                                      │
│    [ Protect downside? ]                                     │
│                                                              │
│  → 20 paths analysed, 14 viable, 6 discarded.                │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ #1  ETF + Super split (50/50)             Score 87/100│  │
│  │     P50 NW +$2.1M  •  Survival 98%  •  FIRE −2.4y     │  │
│  │     Why: balanced return × tax-efficient × liquid     │  │
│  │     [Drill in]  [Add to Advanced Builder]             │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ #2  Offset + IP in 18mo                   Score 81/100│  │
│  │     ...                                               │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  Discarded (6):                                              │
│   • 100% crypto — exceeds 10% portfolio cap                  │
│   • IP now — borrowing power insufficient at +3% buffer      │
│   • ...                                                      │
└──────────────────────────────────────────────────────────────┘
```

Advanced Builder tab is the **existing** `scenario-compare-v2.tsx` UI, rebadged and moved under this page as a tab. Same engine, same narrative card, same investor PDF, same Hide/Mask, same dark mode WCAG fixes. Nothing regresses.

"Add to Advanced Builder" on any ranked candidate copies its `events[]` straight into the Advanced tab's timeline, letting the user tweak deterministically.

---

## 7. Routing & nav (Phase 1)

- New route: `/decision` → unified page. Default tab: Quick.
- `/scenario-compare-v2` keeps working (redirects to `/decision?tab=advanced`).
- `/scenario-compare` (V1) and `/what-if-scenarios`: **files retained**, routes retained, **removed from sidebar**.
- Sidebar gains a single "Decision Engine" entry.

---

## 8. Testing & guardrails

**80 existing tests must stay green.** They will. Engine is untouched in Phase 1.

### Explainability trace (per recommendation)

Every `RankedCandidate` carries a structured `explainabilityTrace`:

```ts
interface ExplainabilityTrace {
  assumptionsUsed: { id: string; value: number | string; source: string }[];
  formulasInvoked: { id: string; reason: string }[];
  constraintsEvaluated: { id: string; band: string; passed: boolean; value: number }[];
  riskDrivers: FailureDriver[];        // top contributors to downside
  timeline: { month: string; event: ScenarioEventType; effect: string }[];
  scoreDerivation: {
    axis: keyof ScoreInputs;
    rawValue: number;
    weight: number;
    contribution: number;
  }[];
}
```

UI exposes "Why this recommendation?" — opens a panel rendering the full trace. AI narrator (Layer 3) uses this trace verbatim as source-of-truth; AI prose is checked against the trace at build-time, not allowed to introduce numbers absent from it.

**New deterministic tests required** (Phase 0e + 1b):

Including refinement-driven tests:
- DSR banding (boundary values: 0.299, 0.30, 0.399, 0.40, 0.549, 0.55)
- Dynamic liquidity floor (PAYG vs self-employed, with/without dependants, with/without upcoming events)
- Refinance-pressure band classification
- Behavioural realism filters (zero-cash, max-leverage-T0, >10% crypto, refinance chain)
- Explainability trace completeness (every contributor present)

| Suite | Coverage |
|---|---|
| `formulas.test.ts` | every Formula Registry entry: determinism, boundaries, engine-agreement |
| `assumptions.test.ts` | range validation, `assertAssumptionsConsistent` happy + sad paths |
| `scoring.test.ts` | weight invariants (∑w=1), monotonicity (↑survival ⇒ ↑score), explainability output |
| `candidateGenerator.test.ts` | (a) same input → same candidate set; (b) every candidate passes its own feasibility check; (c) discarded reasons populated; (d) capital + timing axes coverage |
| `decisionEngine.integration.test.ts` | end-to-end: base plan → quick decision → ranked output → re-run via runScenarioV2 → numbers reconcile |
| `eventOrdering.test.ts` | events at same month execute in `EventPriority` order, determinism preserved |
| `liquidityStress.test.ts` | liquidity ratio over MC paths flags exhaustion month correctly |
| `refinancePressure.test.ts` | refinance event with insufficient serviceability transitions to forced sale, not silent failure |
| `scenarioReconciliation.test.ts` | month-1 surplus equals `selectMonthlySurplus(inputs)` within $1 (existing guard, formalised in test) |

Target test count after Phase 1: **120+**, all deterministic, all green.

---

## 9. Phasing & sequence

| Phase | Deliverable | Status |
|---|---|---|
| 0a | This spec | **DONE** (this document) |
| 0b | Formula Registry module + tests | next |
| 0c | Assumption Registry module + tests | after 0b |
| 0d | Scoring Framework module + tests | after 0c |
| 0e | Engine-level deterministic test additions | after 0d |
| 1a | Candidate generator | after Phase 0 |
| 1b | Candidate generator tests | with 1a |
| 1c | Unified `/decision` page (Quick + Advanced tabs) | after 1a/b |
| 1d | Wire engine/PDF/narrative/privacy/dark/mobile across both tabs | with 1c |
| 1e | Hide V1 + What-If from sidebar | trivially with 1c |
| 1f | Full test/typecheck/build, preview, PR, merge | end of phase |

Future phases (NOT this session):
- Phase 2: New event types (debt recycling, equity release, downsize) — engine deltas + UI
- Phase 3: Multi-question Quick Decision (it currently answers one question at a time)
- Phase 4: True optimization — event-tree search with feasibility pruning (50–200 paths)
- Phase 5: Recommended-strategy *discovery* (engine proposes paths the user didn't ask about)
- Phase 6: Layer 3 AI narrator upgrade — better prose, more strategy-aware
- Phase 7: Retire V1 + What-If files entirely

---

## 10. Non-negotiables (carried forward from standing rules)

- All work on preview branch. No direct edits on main.
- No mocks, no demo-only flows, no placeholder scoring.
- Real ledger data only.
- Layer 1 math is deterministic. AI never writes math.
- 80+ existing tests stay green. New tests are added, not weakened.
- Privacy mode, WCAG dark mode, mobile safe-area, 44px touch targets — all preserved.
- Engine integrity from Sessions 1–4 is sacred: insolvency cascade, no double-counting, differentiated liquidity, narrative attribution, mask-aware PDF.
